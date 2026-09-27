import {afterEach, describe, expect, test} from 'bun:test'
import {GcpCloudSqlAdapter} from './GcpCloudSqlAdapter'
import {GcpRestRuntimeClient} from '../gcp'
import {NotFoundError, ValidationError} from '../cloud-spi/errors'

const originalFetch = globalThis.fetch
const ENDPOINT = 'http://localhost:4588'
const INSTANCES_PATH = '/sql/v1beta4/projects/floci-local/instances'

afterEach(() => {
    globalThis.fetch = originalFetch
})

function adapter(): GcpCloudSqlAdapter {
    return new GcpCloudSqlAdapter(new GcpRestRuntimeClient(ENDPOINT, 'floci-local', 'us-central1'))
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
    const calls: Array<{url: string; init?: RequestInit}> = []
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({url: String(url), init})
        return handler(String(url), init)
    }) as unknown as typeof fetch
    return calls
}

/** Create answers with this receipt, not the instance. Captured from floci-gcp 0.5.0. */
function sqlOperation(targetId: string) {
    return {
        kind: 'sql#operation',
        name: 'b4e23845-3325-48e4-95a3-d558f44540e8',
        targetId,
        targetProject: 'floci-local',
        status: 'DONE',
        operationType: 'CREATE',
    }
}

/** Shape captured from floci-gcp 0.5.0. */
function sqlInstance(name: string) {
    return {
        name,
        databaseVersion: 'POSTGRES_15',
        region: 'us-central1',
        settings: {tier: 'db-f1-micro'},
        kind: 'sql#instance',
        project: 'floci-local',
        backendType: 'SECOND_GEN',
        instanceType: 'CLOUD_SQL_INSTANCE',
        state: 'RUNNABLE',
        gceZone: 'us-central1-a',
        connectionName: `floci-local:us-central1:${name}`,
        ipAddresses: [{type: 'PRIMARY', ipAddress: '172.20.0.5', port: 5432}],
    }
}

describe('GcpCloudSqlAdapter', () => {
    test('identifies itself as the GCP database adapter', () => {
        const instance = adapter()
        expect(instance.cloud).toBe('gcp')
        expect(instance.service).toBe('database')
        expect(instance.schema().displayName).toBe('Cloud SQL')
    })

    test('lists instances and normalizes the sqladmin shape', async () => {
        const calls = stubFetch(() => new Response(
            JSON.stringify({kind: 'sql#instancesList', items: [sqlInstance('orders-db')]}),
            {status: 200},
        ))

        const [resource] = await adapter().list()

        expect(calls[0]?.url).toBe(`${ENDPOINT}${INSTANCES_PATH}`)
        expect(resource).toMatchObject({
            id: 'orders-db',
            name: 'orders-db',
            cloud: 'gcp',
            service: 'database',
            type: 'db-instance',
            region: 'us-central1',
            status: 'RUNNABLE',
            engine: 'POSTGRES_15',
            instanceClass: 'db-f1-micro',
        })
        // The schema surfaces the connection endpoint through a metadata path.
        expect(resource?.metadata.connectionName).toBe('floci-local:us-central1:orders-db')
        expect(resource?.metadata.ipAddress).toBe('172.20.0.5')
        expect(resource?.metadata.port).toBe(5432)
    })

    test('normalizes an empty list payload', async () => {
        stubFetch(() => new Response(JSON.stringify({kind: 'sql#instancesList'}), {status: 200}))
        await expect(adapter().list()).resolves.toEqual([])
    })

    test('filters the list by search term', async () => {
        stubFetch(() => new Response(
            JSON.stringify({items: [sqlInstance('orders-db'), sqlInstance('billing-db')]}),
            {status: 200},
        ))

        await expect(adapter().list({search: 'orders'})).resolves.toHaveLength(1)
        await expect(adapter().list({search: 'db'})).resolves.toHaveLength(2)
        await expect(adapter().list({search: 'nope'})).resolves.toHaveLength(0)
    })

    test('inspects a single instance', async () => {
        const calls = stubFetch(() => new Response(JSON.stringify(sqlInstance('orders-db')), {status: 200}))
        const resource = await adapter().get('orders-db')

        expect(calls[0]?.url).toBe(`${ENDPOINT}${INSTANCES_PATH}/orders-db`)
        expect(resource?.id).toBe('orders-db')
    })

    test('returns null when the instance does not exist', async () => {
        stubFetch(() => new Response(
            JSON.stringify({error: {code: 404, message: 'Cloud SQL instance not found: nope', status: 'NOT_FOUND'}}),
            {status: 404},
        ))
        await expect(adapter().get('nope')).resolves.toBeNull()
    })

    test('creates an instance with the documented defaults', async () => {
        const calls = stubFetch((_url, init) =>
            init?.method === 'POST'
                ? new Response(JSON.stringify(sqlOperation('orders-db')), {status: 200})
                : new Response(JSON.stringify(sqlInstance('orders-db')), {status: 200}),
        )
        await adapter().create({values: {instanceName: 'orders-db'}})

        const body = JSON.parse(String(calls[0]?.init?.body))
        expect(calls[0]?.init?.method).toBe('POST')
        expect(body).toEqual({
            name: 'orders-db',
            databaseVersion: 'POSTGRES_15',
            region: 'us-central1',
            settings: {tier: 'db-f1-micro'},
        })
    })

    test('resolves the operation receipt into the created instance', async () => {
        // Create returns a sql#operation naming the instance, not the instance —
        // echoing the receipt would surface the operation UUID as the resource name.
        const calls = stubFetch((_url, init) =>
            init?.method === 'POST'
                ? new Response(JSON.stringify(sqlOperation('orders-db')), {status: 200})
                : new Response(JSON.stringify(sqlInstance('orders-db')), {status: 200}),
        )

        const resource = await adapter().create({values: {instanceName: 'orders-db'}})

        expect(resource.id).toBe('orders-db')
        expect(resource.status).toBe('RUNNABLE')
        // POST, then a read-back of the named instance.
        expect(calls).toHaveLength(2)
        expect(calls[1]?.url).toBe(`${ENDPOINT}${INSTANCES_PATH}/orders-db`)
    })

    test('uses an embedded resource when the runtime provides one', async () => {
        const calls = stubFetch(() => new Response(
            JSON.stringify({done: true, response: sqlInstance('orders-db')}),
            {status: 200},
        ))

        const resource = await adapter().create({values: {instanceName: 'orders-db'}})

        expect(resource.id).toBe('orders-db')
        expect(calls).toHaveLength(1)
    })

    test('passes through an explicit version, region and tier', async () => {
        const calls = stubFetch((_url, init) =>
            init?.method === 'POST'
                ? new Response(JSON.stringify(sqlOperation('orders-db')), {status: 200})
                : new Response(JSON.stringify(sqlInstance('orders-db')), {status: 200}),
        )
        await adapter().create({
            values: {instanceName: 'orders-db', databaseVersion: 'POSTGRES_16', region: 'europe-west1', tier: 'db-g1-small'},
        })

        const body = JSON.parse(String(calls[0]?.init?.body))
        expect(body.databaseVersion).toBe('POSTGRES_16')
        expect(body.region).toBe('europe-west1')
        expect(body.settings.tier).toBe('db-g1-small')
    })

    test('requires an instance name', async () => {
        stubFetch(() => new Response('{}', {status: 200}))
        await expect(adapter().create({values: {}})).rejects.toBeInstanceOf(ValidationError)
    })

    test('rejects a name the runtime would refuse', async () => {
        stubFetch(() => new Response('{}', {status: 200}))
        for (const name of ['1starts-with-digit', 'Has-Upper', 'has_underscore', 'a'.repeat(63)]) {
            await expect(adapter().create({values: {instanceName: name}})).rejects.toBeInstanceOf(ValidationError)
        }
    })

    test('deletes an instance', async () => {
        const calls = stubFetch(() => new Response('{}', {status: 200}))
        await adapter().delete('orders-db')

        expect(calls[0]?.url).toBe(`${ENDPOINT}${INSTANCES_PATH}/orders-db`)
        expect(calls[0]?.init?.method).toBe('DELETE')
    })

    test('surfaces a missing instance on delete rather than silently succeeding', async () => {
        stubFetch(() => new Response(
            JSON.stringify({error: {code: 404, message: 'Cloud SQL instance not found: nope'}}),
            {status: 404},
        ))
        await expect(adapter().delete('nope')).rejects.toBeInstanceOf(NotFoundError)
    })

    test("surfaces the runtime's engine restriction verbatim", async () => {
        // The emulator only supports PostgreSQL; the reason must reach the user.
        stubFetch(() => new Response(
            JSON.stringify({error: {code: 400, message: 'Only PostgreSQL Cloud SQL instances are supported'}}),
            {status: 400},
        ))

        await expect(adapter().create({values: {instanceName: 'mysql-db', databaseVersion: 'MYSQL_8_0'}}))
            .rejects.toThrow('Only PostgreSQL Cloud SQL instances are supported')
    })
})

import {afterEach, describe, expect, test} from 'bun:test'
import {GcpGkeAdapter} from './GcpGkeAdapter'
import {GcpRestRuntimeClient} from '../gcp'
import {NotFoundError, ValidationError} from '../cloud-spi/errors'

const originalFetch = globalThis.fetch
const ENDPOINT = 'http://localhost:4588'
const CLUSTERS_PATH = '/container/v1/projects/floci-local/locations/us-central1/clusters'

afterEach(() => {
    globalThis.fetch = originalFetch
})

function adapter(): GcpGkeAdapter {
    return new GcpGkeAdapter(new GcpRestRuntimeClient(ENDPOINT, 'floci-local', 'us-central1'))
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
    const calls: Array<{url: string; init?: RequestInit}> = []
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({url: String(url), init})
        return handler(String(url), init)
    }) as unknown as typeof fetch
    return calls
}

/** Shape captured from floci-gcp 0.5.0. */
function gkeCluster(name: string) {
    return {
        name,
        status: 'RUNNING',
        location: 'us-central1',
        endpoint: 'localhost:6550',
        network: 'default',
        subnetwork: 'default',
        createTime: '2026-07-28T04:01:57.839066676Z',
        currentMasterVersion: '1.30.5-gke.1014001',
        currentNodeVersion: '1.30.5-gke.1014001',
        initialClusterVersion: '1.30.5-gke.1014001',
        nodePools: [{name: 'default-pool', status: 'RUNNING'}],
        resourceLabels: {},
    }
}

/** GKE create answers with an Operation carrying a targetLink, not the cluster. */
function gkeOperation(clusterName: string) {
    return {
        name: 'operation-28fabcf7-9df7-44d5-b84a-b59435fd9093',
        operationType: 'CREATE_CLUSTER',
        status: 'DONE',
        zone: 'us-central1',
        location: 'us-central1',
        targetLink: `projects/floci-local/locations/us-central1/clusters/${clusterName}`,
    }
}

describe('GcpGkeAdapter', () => {
    test('identifies itself as the GCP k8s adapter', () => {
        const instance = adapter()
        expect(instance.cloud).toBe('gcp')
        expect(instance.service).toBe('k8s')
        expect(instance.schema().displayName).toBe('Google GKE')
    })

    test('talks to the container.googleapis.com path, not the unprefixed one', async () => {
        // /v1/projects/{p}/locations/{l}/clusters on this runtime is Managed Service
        // for Apache Kafka — same path shape, entirely different resource. Binding
        // GKE there would surface Redpanda brokers as Kubernetes clusters.
        const calls = stubFetch(() => new Response(JSON.stringify({clusters: []}), {status: 200}))
        await adapter().list()

        expect(calls[0]?.url).toBe(`${ENDPOINT}${CLUSTERS_PATH}`)
        expect(calls[0]?.url).toContain('/container/v1/')
    })

    test('lists clusters and normalizes the GKE shape', async () => {
        stubFetch(() => new Response(JSON.stringify({clusters: [gkeCluster('prod')]}), {status: 200}))
        const [resource] = await adapter().list()

        expect(resource).toMatchObject({
            id: 'prod',
            name: 'prod',
            cloud: 'gcp',
            service: 'k8s',
            type: 'cluster',
            region: 'us-central1',
            status: 'RUNNING',
            version: '1.30.5-gke.1014001',
        })
        expect(resource?.metadata.endpoint).toBe('localhost:6550')
        expect(resource?.metadata.nodePoolCount).toBe(1)
    })

    test('reduces a fully qualified cluster path to its name', async () => {
        stubFetch(() => new Response(JSON.stringify({
            clusters: [{...gkeCluster('prod'), name: 'projects/floci-local/locations/us-central1/clusters/prod'}],
        }), {status: 200}))

        const [resource] = await adapter().list()
        expect(resource?.id).toBe('prod')
        expect(resource?.name).toBe('prod')
    })

    test('normalizes an empty list payload', async () => {
        stubFetch(() => new Response('{}', {status: 200}))
        await expect(adapter().list()).resolves.toEqual([])
    })

    test('filters the list by search term', async () => {
        stubFetch(() => new Response(
            JSON.stringify({clusters: [gkeCluster('prod'), gkeCluster('staging')]}),
            {status: 200},
        ))

        await expect(adapter().list({search: 'prod'})).resolves.toHaveLength(1)
        await expect(adapter().list({search: 'nope'})).resolves.toHaveLength(0)
    })

    test('inspects a single cluster', async () => {
        const calls = stubFetch(() => new Response(JSON.stringify(gkeCluster('prod')), {status: 200}))
        const resource = await adapter().get('prod')

        expect(calls[0]?.url).toBe(`${ENDPOINT}${CLUSTERS_PATH}/prod`)
        expect(resource?.id).toBe('prod')
    })

    test('returns null when the cluster does not exist', async () => {
        stubFetch(() => new Response(
            JSON.stringify({error: {code: 404, message: 'cluster not found'}}),
            {status: 404},
        ))
        await expect(adapter().get('nope')).resolves.toBeNull()
    })

    test('resolves the operation targetLink into the created cluster', async () => {
        const calls = stubFetch((_url, init) =>
            init?.method === 'POST'
                ? new Response(JSON.stringify(gkeOperation('prod')), {status: 200})
                : new Response(JSON.stringify(gkeCluster('prod')), {status: 200}),
        )

        const resource = await adapter().create({values: {clusterName: 'prod'}})

        // The operation names the cluster only via a path, so it is read back.
        expect(resource.id).toBe('prod')
        expect(resource.status).toBe('RUNNING')
        expect(calls).toHaveLength(2)
        expect(calls[1]?.url).toBe(`${ENDPOINT}${CLUSTERS_PATH}/prod`)
    })

    test('sends the cluster body the runtime expects', async () => {
        const calls = stubFetch((_url, init) =>
            init?.method === 'POST'
                ? new Response(JSON.stringify(gkeOperation('prod')), {status: 200})
                : new Response(JSON.stringify(gkeCluster('prod')), {status: 200}),
        )
        await adapter().create({values: {clusterName: 'prod', initialNodeCount: '3'}})

        expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
            cluster: {name: 'prod', initialNodeCount: 3},
        })
    })

    test('defaults the node count', async () => {
        const calls = stubFetch((_url, init) =>
            init?.method === 'POST'
                ? new Response(JSON.stringify(gkeOperation('prod')), {status: 200})
                : new Response(JSON.stringify(gkeCluster('prod')), {status: 200}),
        )
        await adapter().create({values: {clusterName: 'prod'}})

        expect(JSON.parse(String(calls[0]?.init?.body)).cluster.initialNodeCount).toBe(1)
    })

    test('requires a cluster name', async () => {
        stubFetch(() => new Response('{}', {status: 200}))
        await expect(adapter().create({values: {}})).rejects.toBeInstanceOf(ValidationError)
    })

    test('rejects a name the runtime would refuse', async () => {
        stubFetch(() => new Response('{}', {status: 200}))
        for (const name of ['1prod', 'Prod', 'has_underscore', 'a'.repeat(41)]) {
            await expect(adapter().create({values: {clusterName: name}})).rejects.toBeInstanceOf(ValidationError)
        }
    })

    test('deletes a cluster', async () => {
        const calls = stubFetch(() => new Response('{}', {status: 200}))
        await adapter().delete('prod')

        expect(calls[0]?.url).toBe(`${ENDPOINT}${CLUSTERS_PATH}/prod`)
        expect(calls[0]?.init?.method).toBe('DELETE')
    })

    test('surfaces a missing cluster on delete', async () => {
        stubFetch(() => new Response(JSON.stringify({error: {code: 404, message: 'not found'}}), {status: 404}))
        await expect(adapter().delete('nope')).rejects.toBeInstanceOf(NotFoundError)
    })
})

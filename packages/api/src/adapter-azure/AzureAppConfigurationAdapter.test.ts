import {describe, expect, test} from 'bun:test'
import {azureAccountNameForSubscription, type AzureRuntimeClient, type AzureRuntimeFetchOptions} from '../azure'
import {ConflictError, NotFoundError} from '../cloud-spi/errors'
import {
    AzureAppConfigurationAdapter,
    makeId,
    parseId,
} from './AzureAppConfigurationAdapter'

interface RecordedCall {
    path: string
    init: RequestInit
    options: AzureRuntimeFetchOptions
}

describe('AzureAppConfigurationAdapter', () => {
    test('reads a separate App Configuration namespace for another subscription', async () => {
        const accountName = azureAccountNameForSubscription('11111111-2222-3333-4444-555555555555')
        const path = `/${accountName}-appconfig/kv?api-version=2026-04-01`
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({
            [path]: {items: [keyValue('Other:Key', null)]},
        }, calls, accountName))

        await expect(adapter.list()).resolves.toMatchObject([{name: 'Other:Key'}])
        expect(calls.map((call) => call.path)).toEqual([path])
    })

    test('exposes the Azure App Configuration CRUD schema', () => {
        const schema = new AzureAppConfigurationAdapter(testClient({})).schema()

        expect(schema.cloud).toBe('azure')
        expect(schema.service).toBe('configuration')
        expect(schema.displayName).toBe('App Configuration')
        expect(schema.actions).toEqual(['list', 'create', 'update', 'delete', 'inspect'])
        expect(typeof new AzureAppConfigurationAdapter(testClient({})).update).toBe('function')
        expect(schema.updateFields?.map((field) => field.name)).toEqual(['value', 'contentType'])
        expect(schema.updateFields?.map((field) => field.valuePath)).toEqual([
            'metadata.value',
            'metadata.contentType',
        ])
        expect(schema.updateFields?.some((field) => field.name === 'key' || field.name === 'label')).toBe(false)
    })

    test('lists, maps, searches, and follows normalized next links', async () => {
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({
            '/devstoreaccount1-appconfig/kv?api-version=2026-04-01': {
                items: [keyValue('Application:ApiUrl', null, {value: 'https://localhost:5001'})],
                '@nextLink': 'http://localhost:4577/devstoreaccount1-appconfig/kv?api-version=2026-04-01&after=one',
            },
            '/devstoreaccount1-appconfig/kv?api-version=2026-04-01&after=one': {
                items: [keyValue('Application:Timeout', 'Development', {
                    value: '30',
                    content_type: 'text/plain',
                    etag: 'etag-2',
                    last_modified: '2026-09-23T08:30:00Z',
                })],
                '@nextLink': null,
            },
        }, calls))

        const resources = await adapter.list({search: 'development'})

        expect(resources).toEqual([{
            id: makeId('Application:Timeout', 'Development'),
            name: 'Application:Timeout',
            cloud: 'azure',
            service: 'configuration',
            type: 'app-configuration-key-value',
            region: null,
            createdAt: null,
            status: null,
            version: 'etag-2',
            metadata: {
                label: 'Development',
                value: '30',
                contentType: 'text/plain',
                lastModified: '2026-09-23T08:30:00Z',
                locked: false,
                tags: {},
                etag: 'etag-2',
            },
        }])
        expect(calls.map((call) => call.path)).toEqual([
            '/devstoreaccount1-appconfig/kv?api-version=2026-04-01',
            '/devstoreaccount1-appconfig/kv?api-version=2026-04-01&after=one',
        ])
        expect(calls.every((call) => call.options.includeStorageApiVersion === false)).toBe(true)
    })

    test('maps null and labelled resources to distinct identities', async () => {
        const adapter = new AzureAppConfigurationAdapter(testClient({
            '/devstoreaccount1-appconfig/kv?api-version=2026-04-01': {
                items: [
                    keyValue('Shared:Key', null),
                    keyValue('Shared:Key', 'Development'),
                ],
            },
        }))

        const resources = await adapter.list()

        expect(resources).toHaveLength(2)
        expect(resources[0].metadata.label).toBeNull()
        expect(resources[1].metadata.label).toBe('Development')
        expect(resources[0].id).not.toBe(resources[1].id)
    })

    test('stops when pagination repeats a visited path', async () => {
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({
            '/devstoreaccount1-appconfig/kv?api-version=2026-04-01': {
                items: [keyValue('One', null)],
                '@nextLink': '/devstoreaccount1-appconfig/kv?api-version=2026-04-01',
            },
        }, calls))

        await expect(adapter.list()).resolves.toHaveLength(1)
        expect(calls).toHaveLength(1)
    })

    test('round-trips key and label identities without collisions', () => {
        const identities: Array<[string, string | null]> = [
            ['MyApi:Url', null],
            ['MyApi:Url', 'Development'],
            ['key:with:colons', 'Production'],
            ['key with spaces', 'label with spaces'],
            ['key/%?&#', 'label/%?&#'],
        ]

        for (const [key, label] of identities) {
            expect(parseId(makeId(key, label))).toEqual({key, label})
        }
        expect(makeId('MyApi:Url', 'Development')).not.toBe(makeId('MyApi:Url', 'Production'))
        expect(parseId(encodeURIComponent('legacy:key'))).toEqual({key: 'legacy:key', label: null})
    })

    test('gets labelled and unlabelled values with explicit label addressing', async () => {
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({
            '/devstoreaccount1-appconfig/kv/MyApi%3AUrl?api-version=2026-04-01&label=Development':
                keyValue('MyApi:Url', 'Development'),
            '/devstoreaccount1-appconfig/kv/MyApi%3AUrl?api-version=2026-04-01&label=%00':
                keyValue('MyApi:Url', null),
        }, calls))

        await expect(adapter.get(makeId('MyApi:Url', 'Development'))).resolves.toMatchObject({
            name: 'MyApi:Url',
            metadata: {label: 'Development'},
        })
        await expect(adapter.get(makeId('MyApi:Url', null))).resolves.toMatchObject({
            name: 'MyApi:Url',
            metadata: {label: null},
        })
        expect(calls.map((call) => call.path)).toEqual([
            '/devstoreaccount1-appconfig/kv/MyApi%3AUrl?api-version=2026-04-01&label=Development',
            '/devstoreaccount1-appconfig/kv/MyApi%3AUrl?api-version=2026-04-01&label=%00',
        ])
    })

    test('returns null for a missing key-value', async () => {
        const adapter = new AzureAppConfigurationAdapter(testClient({}))
        await expect(adapter.get(makeId('missing', null))).resolves.toBeNull()
    })

    test('creates labelled and unlabelled values with Azure JSON headers', async () => {
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({
            '/devstoreaccount1-appconfig/kv/Feature%3AEnabled?api-version=2026-04-01&label=Development':
                keyValue('Feature:Enabled', 'Development', {value: 'true', content_type: 'text/plain'}),
            '/devstoreaccount1-appconfig/kv/NoLabel?api-version=2026-04-01&label=%00':
                keyValue('NoLabel', null, {value: ''}),
        }, calls))

        await adapter.create({values: {
            key: 'Feature:Enabled',
            value: 'true',
            label: 'Development',
            contentType: 'text/plain',
        }})
        await adapter.create({values: {key: 'NoLabel', value: '', label: '  '}})

        expect(calls[0].init.method).toBe('PUT')
        expect(calls[0].init.headers).toMatchObject({
            accept: 'application/vnd.microsoft.appconfig.kv+json',
            'content-type': 'application/vnd.microsoft.appconfig.kv+json',
        })
        expect(JSON.parse(String(calls[0].init.body))).toEqual({
            value: 'true',
            content_type: 'text/plain',
        })
        expect(calls[1].path).toEndWith('&label=%00')
        expect(JSON.parse(String(calls[1].init.body))).toEqual({value: ''})
    })

    test('validates required create fields', async () => {
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({}, calls))

        await expect(adapter.create({values: {key: '', value: 'x'}})).rejects.toThrow('key is required')
        await expect(adapter.create({values: {key: 'x'}})).rejects.toThrow('value is required')
        expect(calls).toHaveLength(0)
    })

    test('updates in place and preserves fields that were not edited', async () => {
        const calls: RecordedCall[] = []
        const path = '/devstoreaccount1-appconfig/kv/MyKey?api-version=2026-04-01&label=Development'
        const adapter = new AzureAppConfigurationAdapter(testClient({
            [path]: [
                keyValue('MyKey', 'Development', {
                    value: 'old',
                    content_type: 'application/json',
                    tags: {owner: 'ui'},
                }),
                keyValue('MyKey', 'Development', {
                    value: 'new',
                    content_type: 'application/json',
                    tags: {owner: 'ui'},
                }),
            ],
        }, calls))

        const updated = await adapter.update(makeId('MyKey', 'Development'), {values: {value: 'new'}})

        expect(updated).toMatchObject({
            id: makeId('MyKey', 'Development'),
            name: 'MyKey',
            metadata: {label: 'Development', value: 'new', contentType: 'application/json', tags: {owner: 'ui'}},
        })
        expect(calls.map((call) => call.init.method)).toEqual(['GET', 'PUT'])
        expect(calls.every((call) => call.path === path)).toBe(true)
        expect(JSON.parse(String(calls[1].init.body))).toEqual({
            value: 'new',
            content_type: 'application/json',
            tags: {owner: 'ui'},
        })
    })

    test('updates only content type while preserving the value', async () => {
        const calls: RecordedCall[] = []
        const path = '/devstoreaccount1-appconfig/kv/MyKey?api-version=2026-04-01&label=Development'
        const adapter = new AzureAppConfigurationAdapter(testClient({
            [path]: [
                keyValue('MyKey', 'Development', {value: 'keep', content_type: 'text/plain'}),
                keyValue('MyKey', 'Development', {value: 'keep', content_type: 'application/json'}),
            ],
        }, calls))

        const updated = await adapter.update(makeId('MyKey', 'Development'), {
            values: {contentType: 'application/json'},
        })

        expect(JSON.parse(String(calls[1].init.body))).toMatchObject({
            value: 'keep',
            content_type: 'application/json',
        })
        expect(updated.metadata).toMatchObject({value: 'keep', contentType: 'application/json'})
    })

    test.each(['', null])('clears content type with %p', async (contentType) => {
        const calls: RecordedCall[] = []
        const path = '/devstoreaccount1-appconfig/kv/MyKey?api-version=2026-04-01&label=%00'
        const adapter = new AzureAppConfigurationAdapter(testClient({
            [path]: [
                keyValue('MyKey', null, {content_type: 'text/plain'}),
                keyValue('MyKey', null, {content_type: null}),
            ],
        }, calls))

        const updated = await adapter.update(makeId('MyKey', null), {values: {contentType}})

        expect(JSON.parse(String(calls[1].init.body))).toMatchObject({
            value: 'value',
            content_type: null,
        })
        expect(updated.metadata.contentType).toBeNull()
    })

    test('updates the selected label without changing another value with the same key', async () => {
        const calls: RecordedCall[] = []
        const developmentPath = '/devstoreaccount1-appconfig/kv/Shared?api-version=2026-04-01&label=Development'
        const productionPath = '/devstoreaccount1-appconfig/kv/Shared?api-version=2026-04-01&label=Production'
        const adapter = new AzureAppConfigurationAdapter(testClient({
            [developmentPath]: [
                keyValue('Shared', 'Development', {value: 'dev'}),
                keyValue('Shared', 'Development', {value: 'new-dev'}),
            ],
            [productionPath]: [
                keyValue('Shared', 'Production', {value: 'prod'}),
                keyValue('Shared', 'Production', {value: 'new-prod'}),
            ],
        }, calls))

        const development = await adapter.update(makeId('Shared', 'Development'), {values: {value: 'new-dev'}})
        const production = await adapter.update(makeId('Shared', 'Production'), {values: {value: 'new-prod'}})

        expect(development.id).toBe(makeId('Shared', 'Development'))
        expect(production.id).toBe(makeId('Shared', 'Production'))
        expect(calls.map((call) => call.path)).toEqual([
            developmentPath, developmentPath, productionPath, productionPath,
        ])
        expect(JSON.parse(String(calls[1].init.body)).value).toBe('new-dev')
        expect(JSON.parse(String(calls[3].init.body)).value).toBe('new-prod')
    })

    test('rejects an update when the key-value does not exist', async () => {
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({}, calls))

        await expect(adapter.update(makeId('Missing', 'Development'), {values: {value: 'new'}}))
            .rejects.toThrow(NotFoundError)
        expect(calls.map((call) => call.init.method)).toEqual(['GET'])
    })

    test('does not bypass a locked key-value update failure', async () => {
        const calls: RecordedCall[] = []
        const path = '/devstoreaccount1-appconfig/kv/Locked?api-version=2026-04-01&label=%00'
        const client = testClient({[path]: keyValue('Locked', null, {locked: true})}, calls)
        const fetch = client.fetch.bind(client)
        client.fetch = async (requestPath, init, options) => {
            if (init.method === 'PUT') {
                calls.push({path: requestPath, init, options: options ?? {}})
                throw new ConflictError('Key-value is locked')
            }
            return fetch(requestPath, init, options)
        }
        const adapter = new AzureAppConfigurationAdapter(client)

        await expect(adapter.update(makeId('Locked', null), {values: {value: 'new'}}))
            .rejects.toThrow('Key-value is locked')
        expect(calls.map((call) => call.init.method)).toEqual(['GET', 'PUT'])
    })

    test('deletes the exact key and label identity', async () => {
        const calls: RecordedCall[] = []
        const adapter = new AzureAppConfigurationAdapter(testClient({
            '/devstoreaccount1-appconfig/kv/My%20Key?api-version=2026-04-01&label=Production': {},
        }, calls))

        await adapter.delete(makeId('My Key', 'Production'))

        expect(calls).toHaveLength(1)
        expect(calls[0].path).toBe(
            '/devstoreaccount1-appconfig/kv/My%20Key?api-version=2026-04-01&label=Production',
        )
        expect(calls[0].init.method).toBe('DELETE')
    })
})

function keyValue(
    key: string,
    label: string | null,
    overrides: Record<string, unknown> = {},
) {
    return {
        key,
        label,
        value: 'value',
        content_type: null,
        etag: 'etag-1',
        last_modified: null,
        locked: false,
        tags: {},
        ...overrides,
    }
}

function testClient(
    responses: Record<string, unknown | unknown[]>,
    calls: RecordedCall[] = [],
    accountName = 'devstoreaccount1',
): AzureRuntimeClient {
    const responseIndexes = new Map<string, number>()
    return {
        endpoint: 'http://localhost:4577',
        accountName,
        async fetch(path: string, init: RequestInit, options: AzureRuntimeFetchOptions = {}) {
            calls.push({path, init, options})
            if (!(path in responses)) {
                if (options.emptyOnNotFound) return null
                throw new Error(`Unexpected App Configuration path: ${path}`)
            }

            const configured = responses[path]
            let body = configured
            if (Array.isArray(configured)) {
                const index = responseIndexes.get(path) ?? 0
                body = configured[Math.min(index, configured.length - 1)]
                responseIndexes.set(path, index + 1)
            }
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: {'content-type': 'application/json'},
            })
        },
    }
}

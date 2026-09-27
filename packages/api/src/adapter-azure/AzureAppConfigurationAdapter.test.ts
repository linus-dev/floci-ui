import {describe, expect, test} from 'bun:test'
import type {AzureRuntimeClient, AzureRuntimeFetchOptions} from '../azure'
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
    test('exposes the Azure App Configuration CRUD schema', () => {
        const schema = new AzureAppConfigurationAdapter(testClient({})).schema()

        expect(schema.cloud).toBe('azure')
        expect(schema.service).toBe('configuration')
        expect(schema.displayName).toBe('App Configuration')
        expect(schema.actions).toEqual(['list', 'create', 'update', 'delete', 'inspect'])
        expect(typeof new AzureAppConfigurationAdapter(testClient({})).update).toBe('function')
        expect(schema.updateFields?.map((field) => field.name)).toEqual(['value', 'contentType'])
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

        expect(updated).toMatchObject({name: 'MyKey', metadata: {label: 'Development', value: 'new'}})
        expect(calls.map((call) => call.init.method)).toEqual(['GET', 'PUT'])
        expect(calls.every((call) => call.path === path)).toBe(true)
        expect(JSON.parse(String(calls[1].init.body))).toEqual({
            value: 'new',
            content_type: 'application/json',
            tags: {owner: 'ui'},
        })
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
): AzureRuntimeClient {
    const responseIndexes = new Map<string, number>()
    return {
        endpoint: 'http://localhost:4577',
        accountName: 'devstoreaccount1',
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

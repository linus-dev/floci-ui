import {describe, expect, test} from 'bun:test'
import {AzureNoSqlAdapter} from './AzureNoSqlAdapter'
import type {AzureRuntimeClient, AzureRuntimeFetchOptions} from '../azure'

describe('AzureNoSqlAdapter', () => {
    test('normalizes Cosmos databases as cloud NoSQL resources', async () => {
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-cosmos/dbs': {
                _count: 1,
                Databases: [{id: 'appdb', _rid: 'db-rid', _etag: '"etag"', _ts: 1779307200}],
            },
        }))

        await expect(adapter.list()).resolves.toEqual([{
            id: 'appdb',
            name: 'appdb',
            cloud: 'azure',
            service: 'nosql',
            type: 'cosmos-database',
            region: null,
            createdAt: '2026-05-20T20:00:00.000Z',
            status: 'available',
            engine: 'cosmos-nosql',
            version: 'NoSQL API',
            instanceClass: null,
            metadata: {
                provider: 'azure',
                databaseService: 'cosmos',
                api: 'nosql',
                resourceId: 'db-rid',
                self: undefined,
                etag: 'etag',
            },
        }])
    })

    test('lists containers and documents from the selected database', async () => {
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-cosmos/dbs/appdb/colls': {
                _count: 1,
                DocumentCollections: [{
                    id: 'items',
                    _rid: 'coll-rid',
                    _etag: '"coll-etag"',
                    _ts: 1779307200,
                    partitionKey: {paths: ['/category'], kind: 'Hash'},
                }],
            },
            '/devstoreaccount1-cosmos/dbs/appdb/colls/items': {
                id: 'items',
                partitionKey: {paths: ['/category'], kind: 'Hash'},
            },
            '/devstoreaccount1-cosmos/dbs/appdb/colls/items/docs': {
                _count: 1,
                Documents: [{id: 'item-1', category: 'demo', _etag: '"doc-etag"', _ts: 1779307201}],
            },
        }))

        await expect(adapter.listCosmosContainers('appdb')).resolves.toMatchObject([{
            id: 'items',
            databaseId: 'appdb',
            partitionKeyPath: '/category',
        }])
        await expect(adapter.listCosmosItems('appdb', 'items')).resolves.toMatchObject([{
            id: 'item-1',
            databaseId: 'appdb',
            containerId: 'items',
            partitionKey: 'demo',
            etag: 'doc-etag',
            document: {id: 'item-1', category: 'demo', _etag: '"doc-etag"', _ts: 1779307201},
        }])
    })

    test('sends document partition key when deleting an item', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-cosmos/dbs/appdb/colls/items/docs/item-1': null,
        }, calls))

        await adapter.deleteCosmosItem('appdb', 'items', 'item-1', 'demo')

        expect(calls[0].path).toBe('/devstoreaccount1-cosmos/dbs/appdb/colls/items/docs/item-1')
        expect(calls[0].init.method).toBe('DELETE')
        expect(calls[0].init.headers).toMatchObject({'x-ms-documentdb-partitionkey': '["demo"]'})
    })

    test('queries documents using the Cosmos SQL query endpoint', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-cosmos/dbs/appdb/colls/items/docs': {
                _count: 1,
                Documents: [{id: 'item-1'}],
            },
        }, calls))

        await expect(adapter.queryCosmosItems('appdb', 'items', 'SELECT * FROM c')).resolves.toEqual({
            count: 1,
            items: [{id: 'item-1'}],
        })
        expect(calls[0].path).toBe('/devstoreaccount1-cosmos/dbs/appdb/colls/items/docs')
        expect(calls[0].init.method).toBe('POST')
        expect(calls[0].init.headers).toMatchObject({'x-ms-documentdb-isquery': 'True'})
    })

    test('uses the account-suffixed route for the default subscription', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-cosmos/dbs': {
                _count: 1,
                Databases: [{id: 'defaultdb'}],
            },
        }, calls))

        await expect(adapter.list()).resolves.toMatchObject([{id: 'defaultdb'}])
        expect(calls.map((call) => call.path)).toEqual(['/devstoreaccount1-cosmos/dbs'])
    })

    test('uses the selected subscription account for every request', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-sub-11111111222233334444555555555555-cosmos/dbs': {_count: 1, Databases: [{id: 'subscription-db'}]},
        }, calls, 'devstoreaccount1-sub-11111111222233334444555555555555'))

        await expect(adapter.list()).resolves.toMatchObject([{id: 'subscription-db'}])
        expect(calls.map((call) => call.path)).toEqual(['/devstoreaccount1-sub-11111111222233334444555555555555-cosmos/dbs'])
    })

    test('falls back to named NoSQL engine path after the account route fails', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-cosmos/dbs': 'not-implemented',
            '/devstoreaccount1-cosmos-nosql/dbs': {
                _count: 1,
                Databases: [{id: 'nosqldb'}],
            },
        }, calls))

        await expect(adapter.list()).resolves.toMatchObject([{id: 'nosqldb'}])
        expect(calls.map((call) => call.path).filter((path) => path.endsWith('/dbs'))).toEqual([
            '/devstoreaccount1-cosmos/dbs',
            '/devstoreaccount1-cosmos-nosql/dbs',
        ])
    })

    test('tries the named engine when the account route is absent', async () => {
        const calls: Array<{path: string; init: RequestInit}> = []
        const adapter = new AzureNoSqlAdapter(testClient({
            '/devstoreaccount1-cosmos-nosql/dbs': {_count: 1, Databases: [{id: 'nameddb'}]},
        }, calls))

        await expect(adapter.list()).resolves.toMatchObject([{id: 'nameddb'}])
        expect(calls.map((call) => call.path)).toEqual([
            '/devstoreaccount1-cosmos/dbs',
            '/devstoreaccount1-cosmos-nosql/dbs',
        ])
    })
})

function testClient(
    responses: Record<string, unknown>,
    calls: Array<{path: string; init: RequestInit}> = [],
    accountName = 'devstoreaccount1',
): AzureRuntimeClient {
    return {
        endpoint: 'http://localhost:4577',
        accountName,
        async fetch(path: string, init: RequestInit, options: AzureRuntimeFetchOptions = {}) {
            calls.push({path, init})
            if (responses[path] === 'not-implemented') {
                throw new Error('Azure runtime request failed: HTTP 501')
            }
            if (!(path in responses)) {
                if (options.emptyOnNotFound) return null
                return new Response('Not Found', {status: 404})
            }
            return new Response(JSON.stringify(responses[path]), {status: 200, headers: {'content-type': 'application/json'}})
        },
    }
}

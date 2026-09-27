import {afterEach, describe, expect, test} from 'bun:test'
import {AzureStorageAdapter} from './AzureStorageAdapter'
import type {AzureRuntimeClient, AzureRuntimeFetchOptions} from '../azure'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('AzureStorageAdapter', () => {
    test('normalizes missing container list endpoint to an empty list', async () => {
        globalThis.fetch = (async () => new Response('Not Found', {status: 404})) as unknown as typeof fetch

        const adapter = new AzureStorageAdapter(testClient())
        await expect(adapter.list()).resolves.toEqual([])
    })

    test('normalizes missing blob list endpoint to an empty list', async () => {
        globalThis.fetch = (async () => new Response('Not Found', {status: 404})) as unknown as typeof fetch

        const adapter = new AzureStorageAdapter(testClient())
        await expect(adapter.listObjects('container')).resolves.toEqual({prefix: '', objects: []})
    })

    test('creates folder placeholders with an internal marker blob', async () => {
        const paths: string[] = []
        globalThis.fetch = (async (path: RequestInfo | URL) => {
            paths.push(String(path))
            return new Response('', {status: 201})
        }) as unknown as typeof fetch

        const adapter = new AzureStorageAdapter(testClient())
        await adapter.putObject('container', 'photos/', new Uint8Array(), 'application/x-directory')

        expect(paths).toEqual(['/devstoreaccount1/container/photos/.floci-folder'])
    })

    test('renders internal marker blobs as folders', async () => {
        globalThis.fetch = (async () => new Response(`
            <?xml version="1.0" encoding="utf-8"?>
            <EnumerationResults>
                <Blobs>
                    <Blob>
                        <Name>test/.floci-folder</Name>
                        <Properties>
                            <Last-Modified>Wed, 20 May 2026 04:16:27 GMT</Last-Modified>
                            <Content-Length>0</Content-Length>
                        </Properties>
                    </Blob>
                    <Blob>
                        <Name>background.png</Name>
                        <Properties>
                            <Last-Modified>Wed, 20 May 2026 04:18:00 GMT</Last-Modified>
                            <Content-Length>120</Content-Length>
                        </Properties>
                    </Blob>
                </Blobs>
            </EnumerationResults>
        `, {status: 200})) as unknown as typeof fetch

        const adapter = new AzureStorageAdapter(testClient())
        await expect(adapter.listObjects('container')).resolves.toEqual({
            prefix: '',
            objects: [
                {
                    key: 'test/',
                    name: 'test',
                    type: 'folder',
                    size: null,
                    lastModified: 'Wed, 20 May 2026 04:16:27 GMT',
                    metadata: {
                        provider: 'azure',
                        storageService: 'blob',
                        prefix: 'test/',
                        marker: '.floci-folder',
                    },
                },
                {
                    key: 'background.png',
                    name: 'background.png',
                    type: 'object',
                    size: 120,
                    lastModified: 'Wed, 20 May 2026 04:18:00 GMT',
                    metadata: {
                        provider: 'azure',
                        storageService: 'blob',
                        accessTier: undefined,
                        blobType: undefined,
                        contentType: undefined,
                        etag: undefined,
                    },
                },
            ],
        })
    })
})

function testClient(): AzureRuntimeClient {
    return {
        endpoint: 'http://localhost:4577',
        accountName: 'devstoreaccount1',
        async fetch(path: string, init: RequestInit, options: AzureRuntimeFetchOptions = {}) {
            const res = await globalThis.fetch(path, init)
            if (options.emptyOnNotFound && res.status === 404) return null
            if (!res.ok) throw new Error(`Azure Blob request failed: HTTP ${res.status}`)
            return res
        },
    }
}

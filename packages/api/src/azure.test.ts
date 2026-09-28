import {afterEach, describe, expect, test} from 'bun:test'
import {
    AzureRestRuntimeClient,
    azureAccountName,
    azureAccountNameForSubscription,
    azureSubscriptionId,
    resolveAzureSubscriptionId,
} from './azure'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('AzureRestRuntimeClient', () => {
    test('keeps the current App Configuration data in the default subscription', () => {
        expect(azureAccountNameForSubscription(resolveAzureSubscriptionId())).toBe(azureAccountName())
        expect(azureAccountNameForSubscription(azureSubscriptionId())).toBe(azureAccountName())
        expect(azureAccountNameForSubscription('11111111-2222-3333-4444-555555555555'))
            .toBe(`${azureAccountName()}-sub-11111111222233334444555555555555`)
    })

    test('can omit the Blob Storage API version header', async () => {
        let requestHeaders: HeadersInit | undefined
        globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
            requestHeaders = init?.headers
            return new Response('{}')
        }) as unknown as typeof fetch

        const client = new AzureRestRuntimeClient('http://localhost:4577', 'devstoreaccount1')

        await client.fetch('/devstoreaccount1-keyvault/secrets', {method: 'GET'}, {
            includeStorageApiVersion: false,
        })

        expect(new Headers(requestHeaders).has('x-ms-version')).toBe(false)
    })

    test('adds endpoint context to network failures', async () => {
        globalThis.fetch = (async () => {
            throw new Error('connection refused')
        }) as unknown as typeof fetch

        const client = new AzureRestRuntimeClient('http://localhost:4577', 'devstoreaccount1')

        await expect(client.fetch('/container?restype=container', {method: 'PUT'})).rejects.toThrow(
            'Cannot reach Floci-AZ at http://localhost:4577: connection refused',
        )
    })
})

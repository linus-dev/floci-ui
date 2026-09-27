import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, test, vi} from 'vitest'
import {AzureAppConfigurationImportPanel} from './AzureAppConfigurationImportPanel'

const cloudProxyMocks = vi.hoisted(() => ({
    createCloudResource: vi.fn(),
}))

vi.mock('@/api/cloudProxyClient', () => ({
    createCloudResource: cloudProxyMocks.createCloudResource,
}))

describe('AzureAppConfigurationImportPanel', () => {
    beforeEach(() => {
        cloudProxyMocks.createCloudResource.mockReset()
    })

    test('imports flattened primitives with one label and reports individual failures', async () => {
        const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
        const user = userEvent.setup()
        cloudProxyMocks.createCloudResource.mockImplementation(
            async (_cloud: string, _service: string, values: Record<string, unknown>) => {
                if (values.key === 'Application:Timeout') throw new Error('runtime rejected the value')
                return {}
            },
        )

        render(
            <QueryClientProvider client={queryClient}>
                <AzureAppConfigurationImportPanel runtimeReachable/>
            </QueryClientProvider>,
        )

        await user.type(screen.getByLabelText(/Label/), 'Development')
        await user.upload(screen.getByLabelText('JSON file'), jsonFile({
            'Application:ApiUrl': 'https://localhost:5001',
            'Application:Timeout': 30,
            'FeatureX:Enabled': true,
            'Application:Optional': null,
        }))
        await user.click(screen.getByRole('button', {name: 'Import'}))

        expect(await screen.findByRole('status')).toHaveTextContent('Imported 3 settings. 1 setting failed.')
        expect(screen.getByRole('status')).toHaveTextContent('Application:Timeout: runtime rejected the value')
        expect(cloudProxyMocks.createCloudResource.mock.calls).toEqual([
            ['azure', 'configuration', {
                key: 'Application:ApiUrl',
                value: 'https://localhost:5001',
                label: 'Development',
            }],
            ['azure', 'configuration', {
                key: 'Application:Timeout',
                value: '30',
                label: 'Development',
            }],
            ['azure', 'configuration', {
                key: 'FeatureX:Enabled',
                value: 'true',
                label: 'Development',
            }],
            ['azure', 'configuration', {
                key: 'Application:Optional',
                value: '',
                label: 'Development',
            }],
        ])
        await waitFor(() => {
            expect(invalidate).toHaveBeenCalledWith({
                queryKey: ['cloud-resources', 'azure', 'configuration'],
            })
        })
    })

    test('rejects nested values before creating any resources', async () => {
        const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
        const user = userEvent.setup()

        render(
            <QueryClientProvider client={queryClient}>
                <AzureAppConfigurationImportPanel runtimeReachable/>
            </QueryClientProvider>,
        )

        await user.upload(screen.getByLabelText('JSON file'), jsonFile({
            'Application:Nested': {value: 'not flattened'},
        }))
        await user.click(screen.getByRole('button', {name: 'Import'}))

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Nested objects and arrays are not supported. Invalid key: "Application:Nested".',
        )
        expect(cloudProxyMocks.createCloudResource).not.toHaveBeenCalled()
    })
})

function jsonFile(value: unknown): File {
    const contents = JSON.stringify(value)
    const file = new File([contents], 'appconfig.json', {type: 'application/json'})
    Object.defineProperty(file, 'text', {value: async () => contents})
    return file
}

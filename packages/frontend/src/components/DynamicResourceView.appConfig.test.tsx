import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach, describe, expect, test, vi} from 'vitest'
import type {CloudResource} from '@/types/resource'
import type {ServiceSchema} from '@/types/schema'
import {DynamicResourceView} from './DynamicResourceView'

const cloudProxyMocks = vi.hoisted(() => ({
    getServiceSchema: vi.fn(),
    listCloudResources: vi.fn(),
    updateCloudResource: vi.fn(),
}))

vi.mock('@/api/cloudProxyClient', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/api/cloudProxyClient')>(),
    ...cloudProxyMocks,
}))

const schema: ServiceSchema = {
    cloud: 'azure',
    service: 'configuration',
    displayName: 'App Configuration',
    fields: [],
    filters: [],
    actions: ['list', 'create', 'update', 'delete', 'inspect'],
    columns: [{name: 'key', label: 'Key', path: 'name'}],
    updateFields: [
        {name: 'value', label: 'Value', type: 'textarea', required: true, valuePath: 'metadata.value'},
        {name: 'contentType', label: 'Content Type', type: 'text', required: false, valuePath: 'metadata.contentType'},
    ],
}

const resource: CloudResource = {
    id: 'Test%3ASetting::Development',
    name: 'Test:Setting',
    cloud: 'azure',
    service: 'configuration',
    type: 'app-configuration-key-value',
    region: null,
    createdAt: null,
    status: null,
    version: null,
    metadata: {label: 'Development', value: 'first', contentType: 'text/plain'},
}

describe('Azure App Configuration generic edit dialog', () => {
    beforeEach(() => {
        cloudProxyMocks.getServiceSchema.mockReset().mockResolvedValue(schema)
        cloudProxyMocks.listCloudResources.mockReset().mockResolvedValue([resource])
        cloudProxyMocks.updateCloudResource.mockReset().mockResolvedValue(resource)
    })

    test('prepopulates value and content type and sends only the edited value', async () => {
        const user = userEvent.setup()
        renderView()

        const editButton = await screen.findByRole('button', {name: 'Edit Test:Setting'})
        expect(editButton).toHaveTextContent('Edit')
        await user.click(editButton)

        expect(screen.getByLabelText(/^Value/)).toHaveValue('first')
        expect(screen.getByLabelText('Content Type')).toHaveValue('text/plain')
        expect(screen.queryByLabelText('Key')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Label')).not.toBeInTheDocument()

        await user.clear(screen.getByLabelText(/^Value/))
        await user.type(screen.getByLabelText(/^Value/), 'second')
        await user.click(screen.getByRole('button', {name: 'Save Changes'}))

        await waitFor(() => expect(cloudProxyMocks.updateCloudResource).toHaveBeenCalledWith(
            'azure', 'configuration', resource.id, {value: 'second'},
        ))
    })

    test('sends an empty content type when the user clears it', async () => {
        const user = userEvent.setup()
        renderView()

        await user.click(await screen.findByRole('button', {name: 'Edit Test:Setting'}))
        await user.clear(screen.getByLabelText('Content Type'))
        await user.click(screen.getByRole('button', {name: 'Save Changes'}))

        await waitFor(() => expect(cloudProxyMocks.updateCloudResource).toHaveBeenCalledWith(
            'azure', 'configuration', resource.id, {contentType: ''},
        ))
    })
})

function renderView() {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})
    render(
        <QueryClientProvider client={queryClient}>
            <DynamicResourceView
                cloud="azure"
                service="configuration"
                serviceAvailability="available"
                cloudStatus={{runtime: 'reachable'} as never}
                onOpenInfo={() => {}}
            />
        </QueryClientProvider>,
    )
}

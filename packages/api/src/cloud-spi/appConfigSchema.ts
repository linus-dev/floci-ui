import type {FieldSchema, ServiceSchema, TableColumnSchema} from './types'

const applicationColumns: TableColumnSchema[] = [
    {name: 'name', label: 'Name'},
    {name: 'description', label: 'Description', path: 'metadata.description', emptyText: '—'},
    {name: 'id', label: 'Application Id'},
]

const applicationFilters: FieldSchema[] = [
    {name: 'search', label: 'Search', type: 'text', required: false},
]

export function awsAppConfigSchema(): ServiceSchema {
    return {
        cloud: 'aws',
        service: 'configuration',
        displayName: 'AppConfig',
        fields: [
            {
                name: 'name',
                label: 'Application Name',
                type: 'text',
                required: true,
                validation: {
                    pattern: '^[A-Za-z0-9._\\-]+$',
                    maxLength: 255,
                    message: 'Use letters, numbers, periods, hyphens, or underscores.',
                },
            },
            {name: 'description', label: 'Description', type: 'textarea', required: false},
        ],
        actions: ['list', 'create', 'delete', 'inspect'],
        filters: applicationFilters,
        columns: applicationColumns,
    }
}

export function azureAppConfigurationSchema(): ServiceSchema {
    return {
        cloud: 'azure',
        service: 'configuration',
        displayName: 'App Configuration',
        fields: [
            {name: 'key', label: 'Key', type: 'text', required: true},
            {name: 'value', label: 'Value', type: 'textarea', required: true, span: true},
            {name: 'label', label: 'Label', type: 'text', required: false},
            {name: 'contentType', label: 'Content Type', type: 'text', required: false},
        ],
        updateFields: [
            {name: 'value', label: 'Value', type: 'textarea', required: true, span: true, valuePath: 'metadata.value'},
            {name: 'contentType', label: 'Content Type', type: 'text', required: false, valuePath: 'metadata.contentType'},
        ],
        actions: ['list', 'create', 'update', 'delete', 'inspect'],
        filters: [
            {name: 'search', label: 'Search', type: 'text', required: false},
        ],
        columns: [
            {name: 'key', label: 'Key', path: 'name'},
            {name: 'label', label: 'Label', path: 'metadata.label', emptyText: '—'},
            {name: 'value', label: 'Value', path: 'metadata.value', emptyText: '—'},
            {name: 'contentType', label: 'Content Type', path: 'metadata.contentType', emptyText: '—'},
            {name: 'lastModified', label: 'Last Modified', path: 'metadata.lastModified', format: 'datetime', emptyText: '—'},
        ],
    }
}

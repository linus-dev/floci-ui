import {azure, type AzureRuntimeClient} from '../azure'
import {azureAppConfigurationSchema} from '../cloud-spi/appConfigSchema'
import {NotFoundError, ValidationError} from '../cloud-spi/errors'
import type {
    CloudResource,
    CloudServiceAdapter,
    CreateResourceInput,
    ResourceQuery,
    ServiceSchema,
    UpdateResourceInput,
} from '../cloud-spi/types'

const API_VERSION = '2026-04-01'
const NULL_LABEL = '%00'

interface AppConfigurationKeyValue {
    etag?: string
    key: string
    label?: string | null
    content_type?: string | null
    value?: string | null
    last_modified?: string | null
    locked?: boolean
    tags?: Record<string, string>
}

interface AppConfigurationListResponse {
    items?: AppConfigurationKeyValue[]
    '@nextLink'?: string | null
}

export class AzureAppConfigurationAdapter implements CloudServiceAdapter {
    readonly cloud = 'azure' as const
    readonly service = 'configuration' as const

    constructor(private readonly client: AzureRuntimeClient = azure) {}

    schema(): ServiceSchema {
        return azureAppConfigurationSchema()
    }

    async list(query: ResourceQuery = {}): Promise<CloudResource[]> {
        const values: AppConfigurationKeyValue[] = []
        const visited = new Set<string>()
        let path: string | null = `/kv?api-version=${API_VERSION}`

        while (path && !visited.has(path)) {
            visited.add(path)
            const body: AppConfigurationListResponse | null = await this.appConfigJson<AppConfigurationListResponse>(
                path,
                {method: 'GET'},
                {emptyOnNotFound: true},
            )
            values.push(...(body?.items ?? []))
            path = body?.['@nextLink']
                ? appConfigurationNextPath(body['@nextLink'], this.client.accountName)
                : null
        }

        return filterBySearch(values.map(toResource), query.search)
    }

    async get(id: string): Promise<CloudResource | null> {
        const {key, label} = parseId(id)
        const value = await this.getKeyValue(key, label)
        return value ? toResource(value) : null
    }

    async create(input: CreateResourceInput): Promise<CloudResource> {
        const key = requiredString(input.values.key, 'key')
        const value = requiredString(input.values.value, 'value', false)
        const label = optionalLabel(input.values.label)
        const contentType = optionalString(input.values.contentType)
        const body = await this.putKeyValue(key, label, {
            value,
            ...(contentType ? {content_type: contentType} : {}),
        })

        return toResource(body)
    }

    async update(id: string, input: UpdateResourceInput): Promise<CloudResource> {
        const {key, label} = parseId(id)
        const existing = await this.get(id)
        if (!existing) throw new NotFoundError(`App Configuration key-value not found: ${key}`)

        const value = input.values.value !== undefined
            ? requiredString(input.values.value, 'value', false)
            : String(existing.metadata.value ?? '')
        const contentType = input.values.contentType !== undefined
            ? optionalString(input.values.contentType)
            : existing.metadata.contentType as string | null
        const body = await this.putKeyValue(key, label, {
            value,
            content_type: contentType,
            tags: existing.metadata.tags as Record<string, string>,
        })

        return toResource(body)
    }

    async delete(id: string): Promise<void> {
        const {key, label} = parseId(id)
        await this.client.fetch(
            this.appConfigPath(keyValuePath(key, label)),
            {method: 'DELETE', headers: appConfigurationHeaders()},
            {includeStorageApiVersion: false},
        )
    }

    async health(): Promise<void> {
        await this.appConfigJson<AppConfigurationListResponse>(
            `/kv?api-version=${API_VERSION}`,
            {method: 'GET'},
        )
    }

    private getKeyValue(key: string, label: string | null): Promise<AppConfigurationKeyValue | null> {
        return this.appConfigJson<AppConfigurationKeyValue>(
            keyValuePath(key, label),
            {method: 'GET'},
            {emptyOnNotFound: true},
        )
    }

    private async putKeyValue(
        key: string,
        label: string | null,
        value: Pick<AppConfigurationKeyValue, 'value' | 'content_type' | 'tags'>,
    ): Promise<AppConfigurationKeyValue> {
        const body = await this.appConfigJson<AppConfigurationKeyValue>(
            keyValuePath(key, label),
            {method: 'PUT', body: JSON.stringify(value)},
        )
        if (!body) throw new NotFoundError(`App Configuration key-value was not returned: ${key}`)
        return body
    }

    private async appConfigJson<T>(
        path: string,
        init: RequestInit,
        options?: {emptyOnNotFound?: boolean},
    ): Promise<T | null> {
        const response = await this.client.fetch(
            this.appConfigPath(path),
            {
                ...init,
                headers: {
                    ...appConfigurationHeaders(),
                    ...(init.headers ?? {}),
                },
            },
            {...options, includeStorageApiVersion: false},
        )

        if (!response || response.status === 204) return null
        return await response.json() as T
    }

    private appConfigPath(path: string): string {
        return `/${encodeURIComponent(this.client.accountName)}-appconfig${path}`
    }
}

export function makeId(key: string, label: string | null): string {
    return `${encodeURIComponent(key)}::${label === null ? NULL_LABEL : encodeURIComponent(label)}`
}

export function parseId(id: string): {key: string; label: string | null} {
    const separator = id.indexOf('::')
    if (separator < 0) return {key: decodeURIComponent(id), label: null}

    const encodedKey = id.slice(0, separator)
    const encodedLabel = id.slice(separator + 2)
    return {
        key: decodeURIComponent(encodedKey),
        label: encodedLabel === NULL_LABEL ? null : decodeURIComponent(encodedLabel),
    }
}

function keyValuePath(key: string, label: string | null): string {
    const encodedLabel = label === null ? NULL_LABEL : encodeURIComponent(label)
    return `/kv/${encodeURIComponent(key)}?api-version=${API_VERSION}&label=${encodedLabel}`
}

function appConfigurationNextPath(nextLink: string, accountName: string): string {
    let path = nextLink
    try {
        const url = new URL(nextLink)
        path = `${url.pathname}${url.search}`
    } catch {
        path = nextLink.startsWith('/') ? nextLink : `/${nextLink}`
    }

    const prefix = `/${encodeURIComponent(accountName)}-appconfig`
    return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path
}

function appConfigurationHeaders(): Record<string, string> {
    return {
        accept: 'application/vnd.microsoft.appconfig.kv+json',
        authorization: 'Bearer floci-ui',
        'content-type': 'application/vnd.microsoft.appconfig.kv+json',
    }
}

function toResource(value: AppConfigurationKeyValue): CloudResource {
    const label = value.label ?? null
    return {
        id: makeId(value.key, label),
        name: value.key,
        cloud: 'azure',
        service: 'configuration',
        type: 'app-configuration-key-value',
        region: null,
        createdAt: null,
        status: value.locked ? 'locked' : null,
        version: value.etag ?? null,
        metadata: {
            label,
            value: value.value ?? null,
            contentType: value.content_type ?? null,
            lastModified: value.last_modified ?? null,
            locked: value.locked ?? false,
            tags: value.tags ?? {},
            etag: value.etag ?? null,
        },
    }
}

function requiredString(value: unknown, name: string, trim = true): string {
    if (typeof value !== 'string') throw new ValidationError(`${name} is required`)
    const normalized = trim ? value.trim() : value
    if (trim && !normalized) throw new ValidationError(`${name} is required`)
    return normalized
}

function optionalString(value: unknown): string | null {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string') throw new ValidationError('contentType must be a string')
    return value.trim() || null
}

function optionalLabel(value: unknown): string | null {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string') throw new ValidationError('label must be a string')
    return value.trim() || null
}

function filterBySearch(resources: CloudResource[], search?: string): CloudResource[] {
    const normalized = search?.trim().toLowerCase()
    if (!normalized) return resources
    return resources.filter((resource) => {
        const label = typeof resource.metadata.label === 'string' ? resource.metadata.label : ''
        return resource.name.toLowerCase().includes(normalized) || label.toLowerCase().includes(normalized)
    })
}

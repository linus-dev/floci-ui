import {ValidationError} from '../cloud-spi/errors'
import {gcpDatabaseSchema} from '../cloud-spi/databaseSchema'
import {gcp, type GcpRuntimeClient} from '../gcp'
import {type GcpOperationEnvelope, operationResponse, operationTargetId} from './operations'
import type {
    CloudResource,
    CloudServiceAdapter,
    CreateResourceInput,
    ResourceQuery,
    ServiceSchema,
} from '../cloud-spi/types'

/**
 * Cloud SQL through the Floci-GCP emulator, which mirrors the public
 * `sqladmin` v1beta4 REST API. Verified against `floci/floci-gcp` 0.5.0:
 *
 *   GET    /sql/v1beta4/projects/{project}/instances
 *   POST   /sql/v1beta4/projects/{project}/instances
 *   GET    /sql/v1beta4/projects/{project}/instances/{instance}
 *   DELETE /sql/v1beta4/projects/{project}/instances/{instance}
 *
 * The runtime backs each instance with a real Postgres container, so it only
 * accepts PostgreSQL and rejects other engines with a 400.
 */

interface GcpSqlIpAddress {
    type?: string
    ipAddress?: string
    port?: number
}

interface GcpSqlInstance {
    name?: string
    databaseVersion?: string
    region?: string
    state?: string
    project?: string
    gceZone?: string
    backendType?: string
    instanceType?: string
    connectionName?: string
    createTime?: string
    ipAddresses?: GcpSqlIpAddress[]
    settings?: {tier?: string; dataDiskSizeGb?: string; activationPolicy?: string}
}

interface GcpSqlInstanceList {
    items?: GcpSqlInstance[]
}

export class GcpCloudSqlAdapter implements CloudServiceAdapter {
    readonly cloud = 'gcp' as const
    readonly service = 'database' as const

    constructor(private readonly client: GcpRuntimeClient = gcp) {}

    schema(): ServiceSchema {
        return gcpDatabaseSchema()
    }

    async list(query: ResourceQuery = {}): Promise<CloudResource[]> {
        const body = await this.client.json<GcpSqlInstanceList>(this.instancesPath())
        return filterBySearch((body?.items ?? []).map(toResource), query.search)
    }

    async get(id: string): Promise<CloudResource | null> {
        const instance = await this.client.json<GcpSqlInstance>(
            `${this.instancesPath()}/${encodeURIComponent(id)}`,
            {method: 'GET'},
            {emptyOnNotFound: true},
        )
        return instance ? toResource(instance) : null
    }

    async create(input: CreateResourceInput): Promise<CloudResource> {
        const name = stringValue(input.values.instanceName ?? input.values.name)
        const databaseVersion = stringValue(input.values.databaseVersion) || 'POSTGRES_15'
        const region = stringValue(input.values.region) || 'us-central1'
        const tier = stringValue(input.values.tier) || 'db-f1-micro'

        if (!name) throw new ValidationError('instanceName is required')
        if (!isValidInstanceName(name)) {
            throw new ValidationError(
                'Use a valid Cloud SQL instance name: 1-62 lowercase letters, numbers, or hyphens, starting with a letter.',
            )
        }

        const result = await this.client.json<GcpOperationEnvelope<GcpSqlInstance> | GcpSqlInstance>(
            this.instancesPath(),
            {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({name, databaseVersion, region, settings: {tier}}),
            },
        )

        // sqladmin answers with a `sql#operation` that names the instance but does
        // not embed it, so read it back rather than echoing the request.
        const embedded = operationResponse<GcpSqlInstance>(result)
        if (embedded) return toResource(embedded)

        const created = await this.get(operationTargetId(result) ?? name)
        return created ?? toResource({name, databaseVersion, region, settings: {tier}})
    }

    async delete(id: string): Promise<void> {
        await this.client.fetch(`${this.instancesPath()}/${encodeURIComponent(id)}`, {method: 'DELETE'})
    }

    /** Cheaper than list(): the runtime keeps instance metadata in memory. */
    async health(): Promise<void> {
        await this.client.fetch(this.instancesPath(), {method: 'GET'})
    }

    private instancesPath(): string {
        return `/sql/v1beta4/projects/${encodeURIComponent(this.client.project)}/instances`
    }
}

function toResource(instance: GcpSqlInstance): CloudResource {
    const name = instance.name ?? ''
    const primaryIp = instance.ipAddresses?.find((address) => address.type === 'PRIMARY')

    return {
        id: name,
        name,
        cloud: 'gcp',
        service: 'database',
        type: 'db-instance',
        region: instance.region ?? null,
        createdAt: instance.createTime ?? null,
        status: instance.state ?? null,
        engine: instance.databaseVersion ?? null,
        version: instance.databaseVersion ?? null,
        instanceClass: instance.settings?.tier ?? null,
        metadata: {
            provider: 'gcp',
            databaseService: 'cloud-sql',
            project: instance.project,
            gceZone: instance.gceZone,
            backendType: instance.backendType,
            instanceType: instance.instanceType,
            connectionName: instance.connectionName,
            tier: instance.settings?.tier,
            ipAddress: primaryIp?.ipAddress,
            port: primaryIp?.port,
            ipAddresses: instance.ipAddresses,
        },
    }
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function filterBySearch(resources: CloudResource[], search?: string): CloudResource[] {
    const normalized = search?.trim().toLowerCase()
    if (!normalized) return resources
    return resources.filter((resource) => resource.name.toLowerCase().includes(normalized))
}

function isValidInstanceName(value: string): boolean {
    return /^[a-z][a-z0-9-]{0,61}$/.test(value)
}

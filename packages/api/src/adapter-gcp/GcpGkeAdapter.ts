import {ValidationError} from '../cloud-spi/errors'
import {gcpGkeSchema} from '../cloud-spi/eksSchema'
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
 * GKE through the Floci-GCP emulator, which mirrors the public
 * `container.googleapis.com` v1 REST API and backs each cluster with a real k3s
 * container. Verified against `floci/floci-gcp` 0.5.0:
 *
 *   GET    /container/v1/projects/{project}/locations/{location}/clusters
 *   POST   /container/v1/projects/{project}/locations/{location}/clusters
 *   GET    /container/v1/projects/{project}/locations/{location}/clusters/{cluster}
 *   DELETE /container/v1/projects/{project}/locations/{location}/clusters/{cluster}
 *
 * Note the `/container/v1` prefix. The runtime also serves
 * `/v1/projects/{p}/locations/{l}/clusters`, but that is Managed Service for
 * Apache Kafka — same path shape, entirely different resource — so binding GKE
 * to the unprefixed path would surface Kafka brokers as Kubernetes clusters.
 */

interface GkeNodePool {
    name?: string
    status?: string
    initialNodeCount?: number
    version?: string
}

interface GkeCluster {
    name?: string
    status?: string
    location?: string
    endpoint?: string
    network?: string
    subnetwork?: string
    createTime?: string
    currentMasterVersion?: string
    currentNodeVersion?: string
    initialClusterVersion?: string
    currentNodeCount?: number
    nodePools?: GkeNodePool[]
    resourceLabels?: Record<string, string>
}

interface GkeClusterList {
    clusters?: GkeCluster[]
}

export class GcpGkeAdapter implements CloudServiceAdapter {
    readonly cloud = 'gcp' as const
    readonly service = 'k8s' as const

    constructor(private readonly client: GcpRuntimeClient = gcp) {}

    schema(): ServiceSchema {
        return gcpGkeSchema()
    }

    async list(query: ResourceQuery = {}): Promise<CloudResource[]> {
        const body = await this.client.json<GkeClusterList>(this.clustersPath())
        return filterBySearch((body?.clusters ?? []).map(toResource), query.search)
    }

    async get(id: string): Promise<CloudResource | null> {
        const cluster = await this.client.json<GkeCluster>(
            `${this.clustersPath()}/${encodeURIComponent(id)}`,
            {method: 'GET'},
            {emptyOnNotFound: true},
        )
        return cluster ? toResource(cluster) : null
    }

    async create(input: CreateResourceInput): Promise<CloudResource> {
        const name = stringValue(input.values.clusterName ?? input.values.name)
        const initialNodeCount = Number(input.values.initialNodeCount ?? 1)

        if (!name) throw new ValidationError('clusterName is required')
        if (!isValidClusterName(name)) {
            throw new ValidationError(
                'Use a valid GKE cluster name: 1-40 lowercase letters, numbers, or hyphens, starting with a letter.',
            )
        }

        const result = await this.client.json<GcpOperationEnvelope<GkeCluster> | GkeCluster>(this.clustersPath(), {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({
                cluster: {
                    name,
                    initialNodeCount: Number.isFinite(initialNodeCount) ? initialNodeCount : 1,
                },
            }),
        })

        // GKE answers with an Operation carrying a targetLink, not the cluster.
        const embedded = operationResponse<GkeCluster>(result)
        if (embedded) return toResource(embedded)

        const created = await this.get(operationTargetId(result) ?? name)
        return created ?? toResource({name})
    }

    async delete(id: string): Promise<void> {
        await this.client.fetch(`${this.clustersPath()}/${encodeURIComponent(id)}`, {method: 'DELETE'})
    }

    private clustersPath(): string {
        const {project, location} = this.client
        return `/container/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/clusters`
    }
}

function toResource(cluster: GkeCluster): CloudResource {
    // The list response returns bare names while some paths return full paths.
    const name = (cluster.name ?? '').split('/').pop() ?? ''
    const version = cluster.currentMasterVersion ?? cluster.initialClusterVersion ?? null

    return {
        id: name,
        name,
        cloud: 'gcp',
        service: 'k8s',
        type: 'cluster',
        region: cluster.location ?? null,
        createdAt: cluster.createTime ?? null,
        status: cluster.status ?? null,
        version,
        metadata: {
            provider: 'gcp',
            k8sService: 'gke',
            endpoint: cluster.endpoint,
            network: cluster.network,
            subnetwork: cluster.subnetwork,
            currentMasterVersion: cluster.currentMasterVersion,
            currentNodeVersion: cluster.currentNodeVersion,
            nodePools: cluster.nodePools,
            nodePoolCount: cluster.nodePools?.length ?? 0,
            currentNodeCount: cluster.currentNodeCount,
            labels: cluster.resourceLabels,
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

function isValidClusterName(value: string): boolean {
    return /^[a-z][a-z0-9-]{0,39}$/.test(value)
}

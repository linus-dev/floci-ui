import type {CloudProvider, CloudServiceAdapter, CloudServiceType} from '../cloud-spi/types'

export class CloudAdapterRegistry {
    private readonly adapters = new Map<string, CloudServiceAdapter>()

    constructor(adapters: CloudServiceAdapter[] = []) {
        for (const adapter of adapters) {
            this.register(adapter)
        }
    }

    register(adapter: CloudServiceAdapter): void {
        this.adapters.set(this.key(adapter.cloud, adapter.service), adapter)
    }

    get(cloud: CloudProvider, service: CloudServiceType): CloudServiceAdapter | undefined {
        return this.adapters.get(this.key(cloud, service))
    }

    servicesFor(cloud: CloudProvider): CloudServiceType[] {
        return [...this.adapters.values()]
            .filter((adapter) => adapter.cloud === cloud)
            .map((adapter) => adapter.service)
    }

    private key(cloud: CloudProvider, service: CloudServiceType): string {
        return `${cloud}:${service}`
    }
}

import {describe, expect, test} from 'bun:test'
import {awsStorageSchema} from '../cloud-spi/storageSchema'
import type {CloudResource, CloudServiceAdapter, CreateResourceInput} from '../cloud-spi/types'
import {CloudAdapterRegistry} from './CloudAdapterRegistry'

const adapter: CloudServiceAdapter = {
    cloud: 'aws',
    service: 'storage',
    schema: awsStorageSchema,
    list: async () => [],
    get: async () => null,
    create: async (_input: CreateResourceInput): Promise<CloudResource> => ({
        id: 'demo',
        name: 'demo',
        cloud: 'aws',
        service: 'storage',
        type: 'bucket',
        region: null,
        createdAt: null,
        metadata: {},
    }),
    delete: async () => {},
}

describe('CloudAdapterRegistry', () => {
    test('returns registered adapters by cloud and service', () => {
        const registry = new CloudAdapterRegistry([adapter])

        expect(registry.get('aws', 'storage')).toBe(adapter)
        expect(registry.get('azure', 'storage')).toBeUndefined()
    })

    test('lists services registered for a cloud', () => {
        const registry = new CloudAdapterRegistry([adapter])

        expect(registry.servicesFor('aws')).toEqual(['storage'])
        expect(registry.servicesFor('azure')).toEqual([])
    })
})

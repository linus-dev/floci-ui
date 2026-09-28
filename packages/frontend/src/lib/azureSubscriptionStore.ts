import {useSyncExternalStore} from 'react'

export const DEFAULT_AZURE_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000000'
export const AZURE_SUBSCRIPTION_HEADER = 'x-floci-azure-subscription-id'

const SUBSCRIPTION_KEY = 'floci.azureSubscriptionId'
const RECENTS_KEY = 'floci.azureSubscriptionId.recents'
const MAX_RECENTS = 8

export function isAzureSubscriptionId(value: string | null | undefined): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function readSubscription(): string {
    try {
        const stored = localStorage.getItem(SUBSCRIPTION_KEY)
        if (isAzureSubscriptionId(stored)) return stored.toLowerCase()
    } catch {
        // Browser storage may be unavailable.
    }
    return DEFAULT_AZURE_SUBSCRIPTION_ID
}

function readRecents(): string[] {
    try {
        const raw = localStorage.getItem(RECENTS_KEY)
        if (raw) {
            const parsed: unknown = JSON.parse(raw)
            if (Array.isArray(parsed)) {
                return parsed.filter(isAzureSubscriptionId).map((id: string) => id.toLowerCase()).slice(0, MAX_RECENTS)
            }
        }
    } catch {
        // Ignore unavailable or malformed browser storage.
    }
    return [DEFAULT_AZURE_SUBSCRIPTION_ID]
}

let currentSubscription = readSubscription()
let recents = readRecents()
if (!recents.includes(currentSubscription)) recents = [currentSubscription, ...recents].slice(0, MAX_RECENTS)

const listeners = new Set<() => void>()

export function getAzureSubscriptionId(): string {
    return currentSubscription
}

export function getAzureSubscriptionRecents(): string[] {
    return recents
}

export function setAzureSubscriptionId(id: string): boolean {
    if (!isAzureSubscriptionId(id)) return false
    const normalized = id.toLowerCase()
    if (normalized === currentSubscription && recents[0] === normalized) return true

    currentSubscription = normalized
    recents = [normalized, ...recents.filter((recent) => recent !== normalized)].slice(0, MAX_RECENTS)
    try {
        localStorage.setItem(SUBSCRIPTION_KEY, currentSubscription)
        localStorage.setItem(RECENTS_KEY, JSON.stringify(recents))
    } catch {
        // Keep the active selection for this browser session.
    }
    listeners.forEach((listener) => listener())
    return true
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function useAzureSubscriptionId(): string {
    return useSyncExternalStore(subscribe, getAzureSubscriptionId, getAzureSubscriptionId)
}

export function useAzureSubscriptionRecents(): string[] {
    return useSyncExternalStore(subscribe, getAzureSubscriptionRecents, getAzureSubscriptionRecents)
}

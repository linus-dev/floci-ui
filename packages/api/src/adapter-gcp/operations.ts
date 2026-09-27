/**
 * Google's REST APIs answer mutations with a long-running-operation envelope
 * rather than the resource, and the shape differs per service. All three are
 * present on the local runtime:
 *
 *   - Cloud Functions / Cloud Run: `{done, response: <resource>}`
 *   - Cloud SQL (`sql#operation`): `{status: 'DONE', targetId: <name>}`
 *   - GKE: `{status: 'DONE', operationType: 'CREATE_CLUSTER', targetLink: <path>}`
 *
 * Only the first embeds the resource; the others name it and expect a re-read.
 * These helpers keep that discrimination in one place instead of each adapter
 * guessing whether it received a resource or a receipt for one.
 */

export interface GcpOperationEnvelope<T> {
    kind?: string
    /** Cloud Functions / GKE / Cloud Run. */
    done?: boolean
    response?: T
    /** Cloud SQL. */
    status?: string
    targetId?: string
    operationType?: string
    /** GKE: a resource path whose last segment is the name. */
    targetLink?: string
    error?: unknown
}

/** True when the payload is an operation receipt rather than the resource. */
export function isOperationEnvelope(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false
    const envelope = payload as GcpOperationEnvelope<unknown>
    return (
        envelope.kind?.endsWith('#operation') === true ||
        typeof envelope.done === 'boolean' ||
        (typeof envelope.status === 'string' && typeof envelope.operationType === 'string')
    )
}

/**
 * Unwrap an embedded resource. Returns null when the operation carries only a
 * reference, in which case the caller should read the resource back by name.
 */
export function operationResponse<T>(payload: GcpOperationEnvelope<T> | T | null): T | null {
    if (!payload) return null
    if (!isOperationEnvelope(payload)) return payload as T

    const envelope = payload as GcpOperationEnvelope<T>
    return envelope.response ?? null
}

/**
 * The resource name an operation acted on, when it reports one. Accepts either a
 * bare id (Cloud SQL) or a resource path (GKE), returning the final segment.
 */
export function operationTargetId<T>(payload: GcpOperationEnvelope<T> | T | null): string | null {
    if (!payload || !isOperationEnvelope(payload)) return null
    const envelope = payload as GcpOperationEnvelope<T>
    if (envelope.targetId) return envelope.targetId
    if (envelope.targetLink) return envelope.targetLink.split('/').pop() ?? null
    return null
}

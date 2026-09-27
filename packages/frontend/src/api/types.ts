export type ServiceStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown'

export type ServiceName =
    | 's3'
    | 'sqs'
    | 'dynamodb'
    | 'sns'
    | 'lambda'
    | 'eks'
    | 'secretsmanager'
    | 'cognito'
    | 'rds'
    | 'elasticache'
    | 'iam'
    | 'ssm'
    | 'kms'
    | 'cloudwatch'

export interface ServiceInfo {
    name: ServiceName
    displayName: string
    status: ServiceStatus
    requestCount: number
    errorCount: number
    latencyP50Ms?: number
    lastActivity?: string
}

export interface HealthReport {
    status: ServiceStatus
    services: ServiceInfo[]
    checkedAt: string
    version?: string
}

export interface ResourceSummary {
    id: string
    name: string
    status?: string
    description?: string
    metadata?: Record<string, unknown>
}

export interface ServiceResourceSnapshot {
    service: ServiceName
    displayName: string
    implemented: boolean
    status: ServiceStatus
    count?: number
    latencyMs?: number
    error?: string
}

export interface ConsoleOverview {
    checkedAt: string
    health: HealthReport
    resources: ServiceResourceSnapshot[]
    logGroupCount: number
    alarmCount: number
    metricCount: number
    totalResourceCount: number
}

export interface CWLogGroup {
    name: string
    arn?: string
    retentionInDays?: number
    createdAt: number
    storedBytes: number
    metricFilterCount: number
}

export interface CWLogStream {
    name: string
    createdAt?: number
    firstEventAt?: number
    lastEventAt?: number
    lastIngestionAt?: number
    storedBytes: number
}

export interface CWLogEvent {
    id: string
    timestamp: number
    message: string
    ingestionTime?: number
}

export interface CWAlarm {
    alarmName: string
    stateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA'
    stateReason?: string
    metricName?: string
    namespace?: string
    threshold?: number
}

export interface CWMetric {
    id: string
    namespace: string
    metricName: string
    dimensions: Array<{ name: string; value: string }>
}

export class FlociError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly endpoint?: string
    ) {
        super(message)
        this.name = 'FlociError'
    }
}

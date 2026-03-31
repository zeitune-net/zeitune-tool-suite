// ── Service Detection ────────────────────────────────────────────────────────

export type ServiceType =
  | 'spring-boot-maven'
  | 'spring-boot-gradle'
  | 'node'
  | 'python'
  | 'docker-compose'
  | 'custom'

// ── Runtime Status ──────────────────────────────────────────────────────────

export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'external'

// ── Persisted Config ────────────────────────────────────────────────────────

export interface ServiceConfig {
  id: string
  name: string
  type: ServiceType
  workingDir: string
  command: string
  buildCommand?: string
  port?: number
  healthCheckUrl?: string
  group?: string
  dependsOn?: string[]
  envVars?: Record<string, string>
  autoRestart: boolean
}

// ── Profile ─────────────────────────────────────────────────────────────────

export interface DevProfile {
  id: string
  name: string
  rootPath: string
  services: ServiceConfig[]
  createdAt: number
}

// ── Runtime State ───────────────────────────────────────────────────────────

export interface ServiceRuntime {
  id: string
  config: ServiceConfig
  status: ServiceStatus
  pid?: number
  logs: LogEntry[]
  error?: string
  startedAt?: number
  portAvailable?: boolean
  healthStatus?: 'unknown' | 'healthy' | 'unhealthy'
}

export interface LogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

// ── IPC Results ─────────────────────────────────────────────────────────────

export interface ServiceScanResult {
  name: string
  type: ServiceType
  workingDir: string
  suggestedCommand: string
  suggestedBuildCommand?: string
  suggestedPort?: number
  subServices?: ServiceScanResult[]
}

export interface PortCheckResult {
  available: boolean
  pid?: number
}

// ── Store View State ────────────────────────────────────────────────────────

export type ViewMode = 'dashboard' | 'detail'

export type DetailTab = 'config' | 'logs' | 'environment'

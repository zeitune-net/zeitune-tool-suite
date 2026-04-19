// ── Service Detection ────────────────────────────────────────────────────────

export type ServiceType =
  | 'spring-boot-maven'
  | 'spring-boot-gradle'
  | 'node'
  | 'python'
  | 'docker-compose'
  | 'custom'

// ── Runtime Status ──────────────────────────────────────────────────────────

export type ServiceStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'
  | 'external'
  | 'waiting' // En attente de dépendances

export type ExitReason = 'normal' | 'crash' | 'killed'

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
  // Dernière raison d'arrêt (pour distinguer crash vs arrêt propre)
  exitReason?: ExitReason
  exitCode?: number | null
  // Compteur de redémarrages automatiques consécutifs (autoRestart)
  retryCount?: number
  // Service bloqué (a épuisé les retries)
  stuck?: boolean
  // IDs des services dont celui-ci dépend encore (affichage 'waiting')
  waitingFor?: string[]
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

export interface ScanProgress {
  current: string
  scanned: number
  found: number
}

// ── Store View State ────────────────────────────────────────────────────────

export type ViewMode = 'dashboard' | 'detail'

export type DetailTab = 'config' | 'logs' | 'environment'

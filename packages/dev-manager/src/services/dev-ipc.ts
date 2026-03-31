import type { DevProfile, ServiceConfig, ServiceScanResult, PortCheckResult, LogEntry, ServiceStatus } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ipc = (window as any).electron.ipcRenderer

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipc.invoke(channel, ...args)
}

function on(channel: string, callback: (...args: unknown[]) => void): () => void {
  return ipc.on(channel, callback)
}

// ── Dialog ────────────────────────────────────────────────────────────────

export const openDirectoryDialog = () => invoke<string | null>('dialog:openDirectory')

// ── Profiles ──────────────────────────────────────────────────────────────

export const listDevProfiles = () => invoke<DevProfile[]>('dev:profile:list')

export const saveDevProfile = (profile: DevProfile) =>
  invoke<DevProfile[]>('dev:profile:save', profile)

export const deleteDevProfile = (id: string) =>
  invoke<DevProfile[]>('dev:profile:delete', id)

export const exportDevProfile = (profile: DevProfile) =>
  invoke<boolean>('dev:profile:export', profile)

export const importDevProfile = () =>
  invoke<DevProfile[] | null>('dev:profile:import')

// ── Scan ──────────────────────────────────────────────────────────────────

export const scanServices = (rootPath: string) =>
  invoke<ServiceScanResult[]>('dev:scan', rootPath)

export const detectService = (dirPath: string) =>
  invoke<ServiceScanResult | null>('dev:detect', dirPath)

// ── Service Lifecycle ─────────────────────────────────────────────────────

export const startService = (profileId: string, serviceId: string) =>
  invoke<boolean>('dev:service:start', profileId, serviceId)

export const stopService = (profileId: string, serviceId: string) =>
  invoke<boolean>('dev:service:stop', profileId, serviceId)

export const restartService = (profileId: string, serviceId: string) =>
  invoke<boolean>('dev:service:restart', profileId, serviceId)

export const buildService = (profileId: string, serviceId: string) =>
  invoke<boolean>('dev:service:build', profileId, serviceId)

export const startBatch = (profileId: string, serviceIds: string[]) =>
  invoke<boolean>('dev:service:startBatch', profileId, serviceIds)

export const stopBatch = (profileId: string, serviceIds: string[]) =>
  invoke<boolean>('dev:service:stopBatch', profileId, serviceIds)

export const restartBatch = (profileId: string, serviceIds: string[]) =>
  invoke<boolean>('dev:service:restartBatch', profileId, serviceIds)

// ── Port Check ────────────────────────────────────────────────────────────

export const checkPort = (port: number) =>
  invoke<PortCheckResult>('dev:port:check', port)

export const checkPortBatch = (ports: { serviceId: string; port: number }[]) =>
  invoke<{ serviceId: string; port: number; available: boolean }[]>('dev:port:checkBatch', ports)

// ── Docker Health ─────────────────────────────────────────────────────────

export const checkDockerHealth = (workingDir: string, composeFile?: string) =>
  invoke<{ status: 'up' | 'partial' | 'down'; services: { name: string; state: string; health: string }[] }>(
    'dev:docker:health', workingDir, composeFile
  )

// ── Service Probe ─────────────────────────────────────────────────────

export const probeServices = (profileId: string) =>
  invoke<{ serviceId: string; detected: boolean; viaHealthCheck: boolean }[]>('dev:service:probe', profileId)

// ── Managed Process List ─────────────────────────────────────────────────

export const listManagedProcesses = (profileId: string) =>
  invoke<{ serviceId: string; pid: number; startedAt: number }[]>('dev:process:list', profileId)

// ── Runtime State Persistence ─────────────────────────────────────────────

export interface RuntimeSnapshot {
  activeProfileId: string | null
  services: Record<string, { id: string; status: string; startedAt?: number }[]>
}

export const loadRuntimeState = () =>
  invoke<RuntimeSnapshot | null>('dev:runtime:load')

export const saveRuntimeState = (snapshot: RuntimeSnapshot) =>
  invoke<void>('dev:runtime:save', snapshot)

// ── Shell Actions ────────────────────────────────────────────────────────

export const openInTerminal = (dirPath: string) =>
  invoke<boolean>('shell:openInTerminal', dirPath)

export const openInExplorer = (dirPath: string) =>
  invoke<boolean>('shell:openInExplorer', dirPath)

// ── Event Subscriptions ───────────────────────────────────────────────────

export const onServiceLog = (
  callback: (data: { serviceId: string; entry: LogEntry }) => void
) => on('dev:service:log', callback as (...args: unknown[]) => void)

export const onServiceStatus = (
  callback: (data: { serviceId: string; status: ServiceStatus; pid?: number; error?: string }) => void
) => on('dev:service:status', callback as (...args: unknown[]) => void)

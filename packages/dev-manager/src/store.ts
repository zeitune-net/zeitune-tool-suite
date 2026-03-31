import { create } from 'zustand'
import { toast } from '@shared/components/ui/toast'
import type {
  DevProfile,
  ServiceConfig,
  ServiceRuntime,
  ServiceScanResult,
  ServiceStatus,
  LogEntry,
  ViewMode,
  DetailTab
} from './types'
import * as devIpc from './services/dev-ipc'

// ── Store Interface ─────────────────────────────────────────────────────────

interface DevManagerStore {
  // Profiles
  profiles: DevProfile[]
  activeProfileId: string | null
  loadProfiles: () => Promise<void>
  setActiveProfile: (id: string | null) => Promise<void>
  createProfile: (name: string, rootPath: string, services: ServiceConfig[]) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  updateProfile: (profileId: string, name: string, services: ServiceConfig[]) => Promise<void>
  updateProfileServices: (profileId: string, services: ServiceConfig[]) => Promise<void>

  // Scanning
  scanning: boolean
  scanResults: ServiceScanResult[]
  scanDirectory: (rootPath: string) => Promise<void>
  clearScan: () => void

  // Service runtime
  services: ServiceRuntime[]
  runtimeCache: Record<string, ServiceRuntime[]>
  initServices: () => Promise<void>

  // View
  viewMode: ViewMode
  detailTab: DetailTab
  activeServiceId: string | null
  setViewMode: (mode: ViewMode) => void
  setDetailTab: (tab: DetailTab) => void
  setActiveService: (id: string | null) => void
  logPanelOpen: boolean
  setLogPanelOpen: (open: boolean) => void

  // Wizard
  wizardOpen: boolean
  setWizardOpen: (open: boolean) => void
  editingProfileId: string | null
  openEditProfile: (id: string) => void

  // Selection
  selectedServiceIds: Set<string>
  toggleServiceSelection: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  selectGroup: (group: string) => void
  deselectGroup: (group: string) => void
  isAllGroupSelected: (group: string) => boolean

  // Service actions
  startService: (serviceId: string) => Promise<void>
  stopService: (serviceId: string) => Promise<void>
  restartService: (serviceId: string) => Promise<void>
  buildService: (serviceId: string) => Promise<void>
  startAll: () => Promise<void>
  stopAll: () => Promise<void>
  startGroup: (group: string) => Promise<void>
  stopGroup: (group: string) => Promise<void>
  startSelected: () => Promise<void>
  stopSelected: () => Promise<void>
  restartSelected: () => Promise<void>

  // Port status
  portStatuses: Map<string, boolean> // serviceId -> available
  checkAllPorts: () => Promise<void>

  // Service probe (auto-detection)
  probeServices: () => Promise<void>

  // Log management
  appendLog: (serviceId: string, entry: LogEntry) => void
  clearLogs: (serviceId: string) => void
  updateServiceStatus: (serviceId: string, status: ServiceStatus, pid?: number, error?: string) => void

  // Export/Import
  exportProfile: () => Promise<void>
  importProfile: () => Promise<void>

  // IPC listeners
  ipcListenersInitialized: boolean
  initIpcListeners: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

const MAX_LOG_LINES = 5000
const TRIM_AMOUNT = 1000

function mergeConfigsWithRuntime(
  configs: ServiceConfig[],
  existing: ServiceRuntime[]
): ServiceRuntime[] {
  return configs.map((config) => {
    const prev = existing.find((s) => s.id === config.id)
    if (prev) return { ...prev, config }
    return { id: config.id, config, status: 'stopped' as const, logs: [], healthStatus: 'unknown' as const }
  })
}

// ── Store ───────────────────────────────────────────────────────────────────

export const useDevManagerStore = create<DevManagerStore>()((set, get) => ({
  // ── Profiles ────────────────────────────────────────────────────────────

  profiles: [],
  activeProfileId: null,

  loadProfiles: async () => {
    const profiles = await devIpc.listDevProfiles()
    set({ profiles })
    if (!get().activeProfileId && profiles.length > 0) {
      get().setActiveProfile(profiles[0].id)
    }
  },

  setActiveProfile: async (id) => {
    const prev = get().activeProfileId
    if (prev === id) return

    // Save current profile's runtime state to cache
    if (prev) {
      set((state) => ({
        runtimeCache: { ...state.runtimeCache, [prev]: state.services }
      }))
    }

    // Switch profile — do NOT stop services, do NOT wipe state
    set({
      activeProfileId: id,
      activeServiceId: null,
      viewMode: 'dashboard',
      selectedServiceIds: new Set(),
      portStatuses: new Map()
    })

    if (id) await get().initServices()
  },

  createProfile: async (name, rootPath, services) => {
    const profile: DevProfile = {
      id: generateId(),
      name,
      rootPath,
      services,
      createdAt: Date.now()
    }
    const profiles = await devIpc.saveDevProfile(profile)
    set({ profiles, wizardOpen: false })
    get().setActiveProfile(profile.id)
  },

  deleteProfile: async (id) => {
    const profiles = await devIpc.deleteDevProfile(id)
    set((state) => {
      const newCache = { ...state.runtimeCache }
      delete newCache[id]
      return { profiles, runtimeCache: newCache }
    })
    if (get().activeProfileId === id) {
      const next = get().profiles.length > 0 ? get().profiles[0].id : null
      get().setActiveProfile(next)
    }
  },

  updateProfile: async (profileId, name, services) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    const updated = { ...profile, name, services }
    const profiles = await devIpc.saveDevProfile(updated)
    set({ profiles, wizardOpen: false, editingProfileId: null })
    // Merge config changes without resetting runtime state
    if (get().activeProfileId === profileId) {
      set((state) => ({
        services: mergeConfigsWithRuntime(services, state.services)
      }))
    }
  },

  updateProfileServices: async (profileId, services) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    const updated = { ...profile, services }
    const profiles = await devIpc.saveDevProfile(updated)
    set({ profiles })
    // Merge config changes without resetting runtime state
    if (get().activeProfileId === profileId) {
      set((state) => ({
        services: mergeConfigsWithRuntime(services, state.services)
      }))
    }
  },

  // ── Scanning ────────────────────────────────────────────────────────────

  scanning: false,
  scanResults: [],

  scanDirectory: async (rootPath) => {
    set({ scanning: true, scanResults: [] })
    try {
      const results = await devIpc.scanServices(rootPath)
      set({ scanResults: results, scanning: false })
    } catch {
      set({ scanning: false })
    }
  },

  clearScan: () => set({ scanResults: [] }),

  // ── Service Runtime ─────────────────────────────────────────────────────

  services: [],
  runtimeCache: {},

  initServices: async () => {
    const profileId = get().activeProfileId
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile || !profileId) return

    // Restore from cache if available, otherwise create fresh
    const cached = get().runtimeCache[profileId]
    const services = cached
      ? mergeConfigsWithRuntime(profile.services, cached)
      : profile.services.map((config) => ({
          id: config.id,
          config,
          status: 'stopped' as const,
          logs: [] as LogEntry[],
          healthStatus: 'unknown' as const
        }))

    set({ services })

    // Reconcile with main process managed processes
    try {
      const managed = await devIpc.listManagedProcesses(profileId)
      if (managed.length > 0) {
        set((state) => ({
          services: state.services.map((s) => {
            const proc = managed.find((m) => m.serviceId === s.id)
            if (proc && s.status !== 'running' && s.status !== 'starting') {
              return { ...s, status: 'running' as const, pid: proc.pid, startedAt: proc.startedAt }
            }
            return s
          })
        }))
      }
    } catch {
      // Ignore — main process query failed
    }

    // Probe for externally running services
    setTimeout(() => get().probeServices(), 500)
  },

  // ── View ────────────────────────────────────────────────────────────────

  viewMode: 'dashboard',
  detailTab: 'config',
  activeServiceId: null,
  logPanelOpen: false,

  setViewMode: (mode) => set({ viewMode: mode }),
  setDetailTab: (tab) => set({ detailTab: tab }),
  setActiveService: (id) => {
    set({ activeServiceId: id, viewMode: id ? 'detail' : 'dashboard' })
  },
  setLogPanelOpen: (open) => set({ logPanelOpen: open }),

  // ── Wizard ──────────────────────────────────────────────────────────────

  wizardOpen: false,
  setWizardOpen: (open) => set({ wizardOpen: open, editingProfileId: open ? get().editingProfileId : null }),
  editingProfileId: null,
  openEditProfile: (id) => set({ editingProfileId: id, wizardOpen: true }),

  // ── Selection ───────────────────────────────────────────────────────────

  selectedServiceIds: new Set<string>(),

  toggleServiceSelection: (id) => {
    set((state) => {
      const next = new Set(state.selectedServiceIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedServiceIds: next }
    })
  },

  selectAll: () => {
    set((state) => ({
      selectedServiceIds: new Set(state.services.map((s) => s.id))
    }))
  },

  clearSelection: () => set({ selectedServiceIds: new Set() }),

  selectGroup: (group) => {
    set((state) => {
      const next = new Set(state.selectedServiceIds)
      for (const s of state.services) {
        if ((s.config.group || 'Autres') === group) next.add(s.id)
      }
      return { selectedServiceIds: next }
    })
  },

  deselectGroup: (group) => {
    set((state) => {
      const next = new Set(state.selectedServiceIds)
      for (const s of state.services) {
        if ((s.config.group || 'Autres') === group) next.delete(s.id)
      }
      return { selectedServiceIds: next }
    })
  },

  isAllGroupSelected: (group) => {
    const state = get()
    const groupServices = state.services.filter(
      (s) => (s.config.group || 'Autres') === group
    )
    return groupServices.length > 0 && groupServices.every((s) => state.selectedServiceIds.has(s.id))
  },

  // ── Port Status ────────────────────────────────────────────────────────

  portStatuses: new Map<string, boolean>(),

  checkAllPorts: async () => {
    const services = get().services
    const portsToCheck = services
      .filter((s) => s.config.port && s.status === 'stopped')
      .map((s) => ({ serviceId: s.id, port: s.config.port! }))
    if (portsToCheck.length === 0) return

    try {
      const results = await devIpc.checkPortBatch(portsToCheck)
      set((state) => {
        const next = new Map(state.portStatuses)
        for (const r of results) {
          next.set(r.serviceId, r.available)
        }
        return { portStatuses: next }
      })
    } catch {
      // Ignore errors
    }
  },

  // ── Service Probe ────────────────────────────────────────────────────────

  probeServices: async () => {
    const profileId = get().activeProfileId
    if (!profileId) return

    try {
      const results = await devIpc.probeServices(profileId)
      set((state) => ({
        services: state.services.map((s) => {
          const probe = results.find((r) => r.serviceId === s.id)

          // No probe result = service is managed by the app (backend skipped it)
          // Never touch managed services
          if (!probe) return s

          // Never touch services in transitional states
          if (s.status === 'starting' || s.status === 'stopping') return s

          // Never touch services that the app started (have a PID)
          if (s.pid) return s

          if (probe.detected && s.status === 'stopped') {
            // Stopped but detected → external or running (via health check)
            const newStatus = probe.viaHealthCheck ? 'running' as const : 'external' as const
            return { ...s, status: newStatus }
          } else if (!probe.detected && s.status === 'external') {
            // Was external but no longer detected → back to stopped
            return { ...s, status: 'stopped' as const }
          }
          return s
        }),
        portStatuses: new Map(
          results
            .filter((r) => {
              const svc = state.services.find((s) => s.id === r.serviceId)
              return svc?.config.port
            })
            .map((r) => [r.serviceId, !r.detected])
        )
      }))
    } catch {
      // Ignore errors
    }
  },

  // ── Service Actions ─────────────────────────────────────────────────────

  startService: async (serviceId) => {
    const profileId = get().activeProfileId
    if (!profileId) return
    try {
      await devIpc.startService(profileId, serviceId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur démarrage')
    }
  },

  stopService: async (serviceId) => {
    const profileId = get().activeProfileId
    if (!profileId) return
    try {
      await devIpc.stopService(profileId, serviceId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur arrêt')
    }
  },

  restartService: async (serviceId) => {
    const profileId = get().activeProfileId
    if (!profileId) return
    try {
      await devIpc.restartService(profileId, serviceId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur redémarrage')
    }
  },

  buildService: async (serviceId) => {
    const profileId = get().activeProfileId
    if (!profileId) return
    try {
      const ok = await devIpc.buildService(profileId, serviceId)
      if (ok) toast.success('Build terminé')
      else toast.error('Build échoué')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur build')
    }
  },

  startAll: async () => {
    const profileId = get().activeProfileId
    if (!profileId) return
    const ids = get().services
      .filter((s) => s.status === 'stopped' || s.status === 'error')
      .map((s) => s.id)
    if (ids.length === 0) return
    try {
      await devIpc.startBatch(profileId, ids)
      toast.success(`Démarrage de ${ids.length} services`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur démarrage batch')
    }
  },

  stopAll: async () => {
    const profileId = get().activeProfileId
    if (!profileId) return
    const ids = get().services
      .filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'external')
      .map((s) => s.id)
    if (ids.length === 0) return
    try {
      await devIpc.stopBatch(profileId, ids)
      toast.success(`Arrêt de ${ids.length} services`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur arrêt batch')
    }
  },

  startGroup: async (group) => {
    const profileId = get().activeProfileId
    if (!profileId) return
    const ids = get().services
      .filter((s) => s.config.group === group && (s.status === 'stopped' || s.status === 'error'))
      .map((s) => s.id)
    if (ids.length === 0) return
    try {
      await devIpc.startBatch(profileId, ids)
      toast.success(`Démarrage de ${ids.length} services (${group})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur démarrage groupe')
    }
  },

  stopGroup: async (group) => {
    const profileId = get().activeProfileId
    if (!profileId) return
    const ids = get().services
      .filter((s) => s.config.group === group && (s.status === 'running' || s.status === 'starting' || s.status === 'external'))
      .map((s) => s.id)
    if (ids.length === 0) return
    try {
      await devIpc.stopBatch(profileId, ids)
      toast.success(`Arrêt de ${ids.length} services (${group})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur arrêt groupe')
    }
  },

  startSelected: async () => {
    const profileId = get().activeProfileId
    if (!profileId) return
    const ids = get().services
      .filter((s) => get().selectedServiceIds.has(s.id) && (s.status === 'stopped' || s.status === 'error'))
      .map((s) => s.id)
    if (ids.length === 0) return
    try {
      await devIpc.startBatch(profileId, ids)
      toast.success(`Démarrage de ${ids.length} services sélectionnés`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur démarrage sélection')
    }
  },

  stopSelected: async () => {
    const profileId = get().activeProfileId
    if (!profileId) return
    const selected = get().services.filter((s) => get().selectedServiceIds.has(s.id))
    // Stoppable: running, starting, external
    const stoppableIds = selected
      .filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'external')
      .map((s) => s.id)
    if (stoppableIds.length === 0) return
    try {
      await devIpc.stopBatch(profileId, stoppableIds)
      toast.success(`Arrêt de ${stoppableIds.length} services sélectionnés`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur arrêt sélection')
    }
  },

  restartSelected: async () => {
    const profileId = get().activeProfileId
    if (!profileId) return
    const selected = get().services.filter((s) => get().selectedServiceIds.has(s.id))
    // Split: external/running → restart, stopped/error → start
    const toRestart = selected
      .filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'external')
      .map((s) => s.id)
    const toStart = selected
      .filter((s) => s.status === 'stopped' || s.status === 'error')
      .map((s) => s.id)

    try {
      const promises: Promise<unknown>[] = []
      if (toRestart.length > 0) {
        promises.push(devIpc.restartBatch(profileId, toRestart))
      }
      if (toStart.length > 0) {
        promises.push(devIpc.startBatch(profileId, toStart))
      }
      await Promise.all(promises)
      const total = toRestart.length + toStart.length
      if (total > 0) {
        toast.success(`${toRestart.length > 0 ? `Redémarrage de ${toRestart.length}` : ''}${toRestart.length > 0 && toStart.length > 0 ? ' + ' : ''}${toStart.length > 0 ? `Démarrage de ${toStart.length}` : ''} services`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur redémarrage sélection')
    }
  },

  // ── Log Management ──────────────────────────────────────────────────────

  appendLog: (serviceId, entry) => {
    set((state) => {
      // Check active services first
      if (state.services.some((s) => s.id === serviceId)) {
        return {
          services: state.services.map((s) => {
            if (s.id !== serviceId) return s
            let logs = [...s.logs, entry]
            if (logs.length > MAX_LOG_LINES) logs = logs.slice(TRIM_AMOUNT)
            return { ...s, logs }
          })
        }
      }
      // Route to runtime cache for non-active profiles
      const newCache = { ...state.runtimeCache }
      for (const [profileId, cached] of Object.entries(newCache)) {
        const idx = cached.findIndex((s) => s.id === serviceId)
        if (idx >= 0) {
          const updated = [...cached]
          let logs = [...updated[idx].logs, entry]
          if (logs.length > MAX_LOG_LINES) logs = logs.slice(TRIM_AMOUNT)
          updated[idx] = { ...updated[idx], logs }
          newCache[profileId] = updated
          return { runtimeCache: newCache }
        }
      }
      return {} // Unknown service, ignore
    })
  },

  clearLogs: (serviceId) => {
    set((state) => ({
      services: state.services.map((s) =>
        s.id === serviceId ? { ...s, logs: [] } : s
      )
    }))
  },

  updateServiceStatus: (serviceId, status, pid?, error?) => {
    set((state) => {
      // Check active services first
      if (state.services.some((s) => s.id === serviceId)) {
        return {
          services: state.services.map((s) =>
            s.id === serviceId
              ? {
                  ...s,
                  status,
                  pid: pid ?? s.pid,
                  error: error ?? (status === 'error' ? s.error : undefined),
                  startedAt: status === 'running' ? Date.now() : s.startedAt
                }
              : s
          )
        }
      }
      // Route to runtime cache for non-active profiles
      const newCache = { ...state.runtimeCache }
      for (const [profileId, cached] of Object.entries(newCache)) {
        const idx = cached.findIndex((s) => s.id === serviceId)
        if (idx >= 0) {
          const updated = [...cached]
          const s = updated[idx]
          updated[idx] = {
            ...s,
            status,
            pid: pid ?? s.pid,
            error: error ?? (status === 'error' ? s.error : undefined),
            startedAt: status === 'running' ? Date.now() : s.startedAt
          }
          newCache[profileId] = updated
          return { runtimeCache: newCache }
        }
      }
      return {} // Unknown service, ignore
    })
  },

  // ── Export/Import ───────────────────────────────────────────────────────

  exportProfile: async () => {
    const profile = get().profiles.find((p) => p.id === get().activeProfileId)
    if (!profile) return
    const ok = await devIpc.exportDevProfile(profile)
    if (ok) toast.success('Profil exporté')
  },

  importProfile: async () => {
    const profiles = await devIpc.importDevProfile()
    if (profiles) {
      set({ profiles })
      toast.success('Profil importé')
    }
  },

  // ── IPC Listeners ───────────────────────────────────────────────────────

  ipcListenersInitialized: false,

  initIpcListeners: () => {
    if (get().ipcListenersInitialized) return
    set({ ipcListenersInitialized: true })

    devIpc.onServiceLog((data) => {
      get().appendLog(data.serviceId, data.entry)
    })

    devIpc.onServiceStatus((data) => {
      get().updateServiceStatus(
        data.serviceId,
        data.status as ServiceStatus,
        data.pid,
        data.error
      )
    })
  }
}))

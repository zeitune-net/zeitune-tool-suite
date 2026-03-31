import { useEffect } from 'react'
import { Code2, RefreshCw, Terminal, Check, AlertCircle } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../store'
import { ProfileSelector } from './ProfileSelector'
import { ProfileWizard } from './ProfileWizard'
import { GroupActions } from './GroupActions'
import { StatsBar } from './StatsBar'
import { ServiceList } from './ServiceList'
import { ServiceDetail } from './ServiceDetail'
import { LogPanel } from './LogPanel'

const PROBE_INTERVAL = 15_000 // 15 seconds
const PERSIST_INTERVAL = 30_000 // 30 seconds

export function DevManagerView() {
  const {
    activeProfileId,
    viewMode,
    services,
    initIpcListeners,
    logPanelOpen,
    setLogPanelOpen,
    probeServices,
    persistRuntimeState
  } = useDevManagerStore()

  // Initialize IPC listeners once
  useEffect(() => {
    initIpcListeners()
  }, [initIpcListeners])

  // Periodic probe to detect externally running services
  useEffect(() => {
    if (!activeProfileId) return
    const interval = setInterval(probeServices, PROBE_INTERVAL)
    return () => clearInterval(interval)
  }, [activeProfileId, probeServices])

  // Periodic persistence of runtime state + save before window unload
  useEffect(() => {
    const interval = setInterval(persistRuntimeState, PERSIST_INTERVAL)
    const onBeforeUnload = () => persistRuntimeState()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [persistRuntimeState])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Code2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Dev Manager</h1>
            <p className="text-sm text-muted-foreground">
              {services.length > 0
                ? `${services.length} services`
                : 'Gerez vos microservices'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeProfileId && <GroupActions />}
          <ProfileSelector />
          {activeProfileId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogPanelOpen(!logPanelOpen)}
            >
              <Terminal className="mr-1.5 h-3.5 w-3.5" />
              Logs
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {!activeProfileId ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {viewMode === 'detail' ? (
            <ServiceDetail />
          ) : (
            <>
              {/* Service list sidebar */}
              <div className="w-64 shrink-0 border-r border-border overflow-hidden p-3">
                <ServiceList />
              </div>

              {/* Main area */}
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-auto p-4">
                  <StatsBar />
                  <DashboardGrid />
                </div>

                {/* Log panel */}
                <LogPanel />
              </div>
            </>
          )}
        </div>
      )}

      {/* Wizard modal */}
      <ProfileWizard />
    </div>
  )
}

function EmptyState() {
  const { setWizardOpen } = useDevManagerStore()

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <Code2 className="mb-4 h-16 w-16 opacity-10" />
      <h2 className="mb-1 text-lg font-semibold text-foreground">Bienvenue dans Dev Manager</h2>
      <p className="mb-4 text-sm">Créez un profil pour commencer à gérer vos services</p>
      <Button onClick={() => setWizardOpen(true)}>Créer un profil</Button>
    </div>
  )
}

function DashboardGrid() {
  const {
    services,
    setActiveService,
    selectedServiceIds,
    toggleServiceSelection,
    portStatuses
  } = useDevManagerStore()

  if (services.length === 0) return null

  // Group by group tag
  const groups: Record<string, typeof services> = {}
  for (const svc of services) {
    const group = svc.config.group || 'Autres'
    if (!groups[group]) groups[group] = []
    groups[group].push(svc)
  }

  const statusColor: Record<string, string> = {
    running: 'border-green-500/30 bg-green-500/5',
    starting: 'border-yellow-500/20 bg-yellow-500/5',
    error: 'border-red-500/30 bg-red-500/5',
    stopped: 'border-border',
    stopping: 'border-yellow-500/20 bg-yellow-500/5',
    external: 'border-blue-400/30 bg-blue-400/5'
  }

  const statusDot: Record<string, string> = {
    running: 'bg-green-500',
    starting: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
    stopped: 'bg-gray-500',
    stopping: 'bg-yellow-500 animate-pulse',
    external: 'bg-blue-400'
  }

  const handleCheckbox = (e: React.MouseEvent, serviceId: string) => {
    e.stopPropagation()
    toggleServiceSelection(serviceId)
  }

  return (
    <div className="mt-4 space-y-4">
      {Object.entries(groups).sort().map(([group, groupServices]) => (
        <div key={group}>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{group}</h3>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {groupServices.map((svc) => {
              const isSelected = selectedServiceIds.has(svc.id)
              const portAvailable = portStatuses.get(svc.id)
              const portOccupied = portAvailable === false && svc.status === 'stopped'

              return (
                <button
                  key={svc.id}
                  onClick={() => setActiveService(svc.id)}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all hover:bg-muted/50',
                    isSelected ? 'ring-1 ring-primary/50' : '',
                    statusColor[svc.status]
                  )}
                >
                  {/* Checkbox */}
                  <div
                    onClick={(e) => handleCheckbox(e, svc.id)}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30 opacity-0 group-hover:opacity-100'
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <div className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusDot[svc.status])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{svc.config.name}</p>
                    <div className="flex items-center gap-1">
                      <p className="truncate text-[10px] text-muted-foreground">
                        {svc.config.port ? `:${svc.config.port}` : svc.config.type}
                      </p>
                      {svc.status === 'external' && (
                        <span className="text-[9px] text-blue-400 font-medium">externe</span>
                      )}
                      {portOccupied && svc.status !== 'external' && (
                        <span className="flex items-center gap-0.5 text-[9px] text-red-400" title={`Port ${svc.config.port} occupé`}>
                          <AlertCircle className="h-2.5 w-2.5" />
                          occupé
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

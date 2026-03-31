import { Circle, Play, Square, ChevronDown, ChevronRight, Check, Minus, RefreshCw, Terminal, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../store'
import * as devIpc from '../services/dev-ipc'
import type { ServiceRuntime, ServiceStatus } from '../types'

const statusColor: Record<ServiceStatus, string> = {
  running: 'text-green-500',
  starting: 'text-yellow-500',
  stopping: 'text-yellow-500',
  stopped: 'text-gray-500',
  error: 'text-red-500',
  external: 'text-blue-400'
}

const statusDotClass: Record<ServiceStatus, string> = {
  running: 'fill-current text-green-500',
  starting: 'fill-current text-yellow-500 animate-pulse',
  stopping: 'fill-current text-yellow-500 animate-pulse',
  stopped: 'fill-current text-gray-500',
  error: 'fill-current text-red-500',
  external: 'fill-current text-blue-400'
}

interface GroupedServices {
  [group: string]: ServiceRuntime[]
}

export function ServiceList() {
  const {
    services,
    activeServiceId,
    setActiveService,
    startService,
    stopService,
    selectedServiceIds,
    toggleServiceSelection,
    selectGroup,
    deselectGroup,
    isAllGroupSelected,
    portStatuses
  } = useDevManagerStore()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Group services
  const grouped: GroupedServices = {}
  for (const svc of services) {
    const group = svc.config.group || 'Autres'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(svc)
  }

  const groups = Object.keys(grouped).sort()

  const toggleGroup = (group: string) => {
    const next = new Set(collapsedGroups)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    setCollapsedGroups(next)
  }

  const { restartService } = useDevManagerStore()

  const handleAction = (e: React.MouseEvent, serviceId: string, status: ServiceStatus) => {
    e.stopPropagation()
    if (status === 'stopping') return
    if (status === 'external') {
      restartService(serviceId)
    } else if (status === 'running' || status === 'starting') {
      stopService(serviceId)
    } else {
      startService(serviceId)
    }
  }

  const handleGroupCheckbox = (e: React.MouseEvent, group: string) => {
    e.stopPropagation()
    if (isAllGroupSelected(group)) {
      deselectGroup(group)
    } else {
      selectGroup(group)
    }
  }

  const handleServiceCheckbox = (e: React.MouseEvent, serviceId: string) => {
    e.stopPropagation()
    toggleServiceSelection(serviceId)
  }

  const hasSelection = selectedServiceIds.size > 0

  return (
    <div className="h-full overflow-auto">
      {groups.map((group) => {
        const groupServices = grouped[group]
        const runningCount = groupServices.filter((s) => s.status === 'running' || s.status === 'external').length
        const isCollapsed = collapsedGroups.has(group)
        const allGroupSelected = isAllGroupSelected(group)
        const someGroupSelected = groupServices.some((s) => selectedServiceIds.has(s.id))

        return (
          <div key={group} className="mb-2">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium uppercase text-muted-foreground hover:text-foreground"
            >
              <div className="flex items-center gap-1.5">
                {/* Group checkbox */}
                <button
                  onClick={(e) => handleGroupCheckbox(e, group)}
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
                    allGroupSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : someGroupSelected
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'
                  )}
                >
                  {allGroupSelected ? (
                    <Check className="h-3 w-3" />
                  ) : someGroupSelected ? (
                    <Minus className="h-3 w-3 text-primary" />
                  ) : null}
                </button>
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {group}
              </div>
              {runningCount > 0 && (
                <span className="text-[10px] text-green-500">{runningCount} on</span>
              )}
            </button>

            {/* Service items */}
            {!isCollapsed && (
              <div className="space-y-0.5">
                {groupServices.map((svc) => {
                  const isSelected = selectedServiceIds.has(svc.id)
                  const portAvailable = portStatuses.get(svc.id)
                  const portOccupied = portAvailable === false && svc.status === 'stopped'

                  return (
                    <div
                      key={svc.id}
                      onClick={() => setActiveService(svc.id)}
                      className={cn(
                        'group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors',
                        svc.id === activeServiceId
                          ? 'bg-primary/10'
                          : isSelected
                            ? 'bg-primary/5'
                            : 'hover:bg-accent'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Service checkbox */}
                        <button
                          onClick={(e) => handleServiceCheckbox(e, svc.id)}
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'
                          )}
                          title={isSelected ? 'Désélectionner' : 'Sélectionner'}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </button>
                        <Circle className={cn('h-2.5 w-2.5 shrink-0', statusDotClass[svc.status])} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{svc.config.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {svc.config.port && (
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px]',
                              portOccupied
                                ? 'bg-red-500/10 text-red-400 font-medium'
                                : 'bg-muted text-muted-foreground'
                            )}
                            title={portOccupied ? `Port ${svc.config.port} occupé` : `Port ${svc.config.port}`}
                          >
                            :{svc.config.port}
                            {portOccupied && ' ●'}
                          </span>
                        )}
                        {svc.status === 'external' && (
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400 font-medium">
                            externe
                          </span>
                        )}
                        {/* Quick actions (terminal/explorer) */}
                        <div className="hidden items-center gap-0.5 group-hover:flex">
                          <button
                            onClick={(e) => { e.stopPropagation(); devIpc.openInTerminal(svc.config.workingDir) }}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Ouvrir dans le terminal"
                          >
                            <Terminal className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); devIpc.openInExplorer(svc.config.workingDir) }}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Ouvrir dans l'explorateur"
                          >
                            <FolderOpen className="h-3 w-3" />
                          </button>
                        </div>
                        {svc.status !== 'stopping' && (
                          <button
                            onClick={(e) => handleAction(e, svc.id, svc.status)}
                            className={cn(
                              'hidden rounded p-1 transition-colors group-hover:block',
                              svc.status === 'running' || svc.status === 'starting'
                                ? 'hover:bg-destructive/10 hover:text-destructive text-muted-foreground'
                                : svc.status === 'external'
                                  ? 'hover:bg-blue-500/10 hover:text-blue-400 text-muted-foreground'
                                  : 'hover:bg-primary/10 hover:text-primary text-muted-foreground'
                            )}
                            title={svc.status === 'external' ? 'Redémarrer via l\'app' : undefined}
                          >
                            {svc.status === 'external' ? (
                              <RefreshCw className="h-3 w-3" />
                            ) : svc.status === 'running' || svc.status === 'starting' ? (
                              <Square className="h-3 w-3" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {services.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          Aucun service configuré
        </p>
      )}
    </div>
  )
}

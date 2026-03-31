import { ArrowLeft, Play, Square, RotateCw, Hammer } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../store'
import { ServiceConfigEditor } from './ServiceConfigEditor'
import type { ServiceStatus, ServiceConfig, DetailTab } from '../types'

const statusLabels: Record<ServiceStatus, string> = {
  running: 'Running',
  starting: 'Starting...',
  stopping: 'Stopping...',
  stopped: 'Stopped',
  error: 'Error',
  external: 'Externe'
}

const statusBadgeVariant: Record<ServiceStatus, 'success' | 'warning' | 'destructive' | 'muted' | 'info'> = {
  running: 'success',
  starting: 'warning',
  stopping: 'warning',
  stopped: 'muted',
  error: 'destructive',
  external: 'info'
}

const tabs: { id: DetailTab; label: string }[] = [
  { id: 'config', label: 'Configuration' },
  { id: 'logs', label: 'Logs' },
  { id: 'environment', label: 'Environnement' }
]

export function ServiceDetail() {
  const {
    services,
    activeServiceId,
    setActiveService,
    detailTab,
    setDetailTab,
    startService,
    stopService,
    restartService,
    buildService,
    updateProfileServices,
    activeProfileId,
    profiles,
    clearLogs
  } = useDevManagerStore()

  const svc = services.find((s) => s.id === activeServiceId)
  if (!svc) return null

  const handleConfigSave = (updated: ServiceConfig) => {
    if (!activeProfileId) return
    const profile = profiles.find((p) => p.id === activeProfileId)
    if (!profile) return
    const newServices = profile.services.map((s) =>
      s.id === updated.id ? updated : s
    )
    updateProfileServices(activeProfileId, newServices)
  }

  const isActive = svc.status === 'running' || svc.status === 'starting' || svc.status === 'stopping' || svc.status === 'external'

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setActiveService(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{svc.config.name}</h2>
              <Badge variant={statusBadgeVariant[svc.status]}>{statusLabels[svc.status]}</Badge>
              {svc.config.port && (
                <a
                  href={`http://localhost:${svc.config.port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  :{svc.config.port}
                </a>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{svc.config.workingDir}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => stopService(svc.id)}
            >
              <Square className="mr-1.5 h-3 w-3" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => startService(svc.id)}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Start
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => restartService(svc.id)}
          >
            <RotateCw className="mr-1.5 h-3 w-3" />
            Restart
          </Button>
          {svc.config.buildCommand && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => buildService(svc.id)}
              disabled={isActive}
            >
              <Hammer className="mr-1.5 h-3 w-3" />
              Build
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              detailTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {detailTab === 'config' && (
          <div className="max-w-lg">
            <ServiceConfigEditor
              config={svc.config}
              onChange={handleConfigSave}
            />
          </div>
        )}

        {detailTab === 'logs' && (
          <div className="h-full">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{svc.logs.length} lignes</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearLogs(svc.id)}
                className="h-6"
              >
                Effacer
              </Button>
            </div>
            <div className="h-[calc(100%-2rem)] overflow-auto rounded-lg border border-border bg-card/50 p-2 font-mono text-[11px] leading-relaxed">
              {svc.logs.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Aucun log</p>
              ) : (
                svc.logs.slice(-500).map((entry, i) => (
                  <div key={i} className="flex gap-2 px-1">
                    <span className="shrink-0 text-muted-foreground/50 select-none">
                      {new Date(entry.timestamp).toLocaleTimeString('fr-FR', { hour12: false })}
                    </span>
                    <span
                      className={cn(
                        'whitespace-pre-wrap break-all',
                        entry.stream === 'stderr' && 'text-red-400',
                        entry.stream === 'system' && 'text-muted-foreground italic'
                      )}
                    >
                      {entry.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {detailTab === 'environment' && (
          <div className="space-y-4 max-w-lg">
            <div>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                Variables du service
              </h3>
              {Object.keys(svc.config.envVars || {}).length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune variable configurée</p>
              ) : (
                <div className="space-y-1 rounded-lg border border-border p-2">
                  {Object.entries(svc.config.envVars || {}).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="font-medium text-primary">{key}</span>
                      <span className="text-muted-foreground">=</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                Informations de runtime
              </h3>
              <div className="space-y-1 rounded-lg border border-border p-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PID</span>
                  <span className="font-mono">{svc.pid || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={statusBadgeVariant[svc.status]}>{statusLabels[svc.status]}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Démarré le</span>
                  <span className="font-mono">
                    {svc.startedAt
                      ? new Date(svc.startedAt).toLocaleString('fr-FR')
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto-restart</span>
                  <span>{svc.config.autoRestart ? 'Oui' : 'Non'}</span>
                </div>
                {svc.healthStatus && svc.healthStatus !== 'unknown' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Health</span>
                    <Badge variant={svc.healthStatus === 'healthy' ? 'success' : 'destructive'}>
                      {svc.healthStatus === 'healthy' ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

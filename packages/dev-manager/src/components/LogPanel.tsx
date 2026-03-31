import { useState, useRef, useEffect } from 'react'
import { X, Trash2, Search, ArrowDownToLine, Lock, Unlock } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../store'
import type { ServiceRuntime, ServiceStatus } from '../types'

const statusBadgeVariant: Record<ServiceStatus, 'success' | 'warning' | 'destructive' | 'muted'> = {
  running: 'success',
  starting: 'warning',
  stopping: 'warning',
  stopped: 'muted',
  error: 'destructive'
}

const MAX_VISIBLE_LINES = 500

export function LogPanel() {
  const { services, logPanelOpen, setLogPanelOpen, clearLogs } = useDevManagerStore()
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [panelHeight, setPanelHeight] = useState(280)
  const logEndRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)

  // Services with logs
  const servicesWithLogs = services.filter((s) => s.logs.length > 0 || s.status !== 'stopped')

  // Auto-select first tab or fallback if current tab is invalid
  useEffect(() => {
    if (servicesWithLogs.length === 0) return
    if (!activeTab || !servicesWithLogs.some((s) => s.id === activeTab)) {
      setActiveTab(servicesWithLogs[0].id)
    }
  }, [servicesWithLogs.length, activeTab])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [services, autoScroll])

  if (!logPanelOpen) return null

  const activeService = services.find((s) => s.id === activeTab)
  const logs = activeService?.logs || []

  // Filter + limit
  const filteredLogs = search
    ? logs.filter((l) => l.text.toLowerCase().includes(search.toLowerCase()))
    : logs
  const visibleLogs = filteredLogs.slice(-MAX_VISIBLE_LINES)

  // Resize logic
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    const startY = e.clientY
    const startHeight = panelHeight

    const onMove = (me: MouseEvent) => {
      if (resizing.current) {
        const delta = startY - me.clientY
        setPanelHeight(Math.max(150, Math.min(600, startHeight + delta)))
      }
    }

    const onUp = () => {
      resizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('fr-FR', { hour12: false })
  }

  return (
    <div ref={panelRef} className="flex flex-col border-t border-border" style={{ height: panelHeight }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1 shrink-0 cursor-ns-resize bg-border/50 hover:bg-primary/30 transition-colors"
      />

      {/* Tab bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {servicesWithLogs.map((svc) => (
            <button
              key={svc.id}
              onClick={() => setActiveTab(svc.id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap',
                activeTab === svc.id
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <div
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  svc.status === 'running' ? 'bg-green-500' :
                  svc.status === 'error' ? 'bg-red-500' :
                  svc.status === 'starting' ? 'bg-yellow-500 animate-pulse' :
                  svc.status === 'stopping' ? 'bg-yellow-500 animate-pulse' :
                  'bg-gray-500'
                )}
              />
              {svc.config.name}
              {svc.logs.length > 0 && (
                <Badge variant={statusBadgeVariant[svc.status]} className="ml-0.5 h-4 px-1 text-[9px]">
                  {svc.logs.length}
                </Badge>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer..."
              className="h-6 w-32 rounded border border-border bg-input pl-6 pr-2 text-[10px] font-mono focus:border-primary focus:outline-none"
            />
          </div>
          {/* Auto-scroll toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Scroll automatique ON' : 'Scroll automatique OFF'}
          >
            {autoScroll ? (
              <Lock className="h-3 w-3 text-primary" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
          </Button>
          {/* Clear */}
          {activeTab && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => clearLogs(activeTab)}
              title="Effacer les logs"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setLogPanelOpen(false)}
            title="Fermer"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Log content */}
      <div className="flex-1 min-h-0 overflow-auto bg-card/50 p-2 font-mono text-[11px] leading-relaxed">
        {visibleLogs.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            {activeTab ? 'Aucun log' : 'Sélectionnez un service'}
          </p>
        ) : (
          <>
            {filteredLogs.length > MAX_VISIBLE_LINES && (
              <p className="text-center text-[10px] text-muted-foreground mb-2">
                {filteredLogs.length - MAX_VISIBLE_LINES} lignes antérieures masquées
              </p>
            )}
            {visibleLogs.map((entry, i) => (
              <div key={i} className="flex gap-2 hover:bg-muted/30 px-1 rounded">
                <span className="shrink-0 text-muted-foreground/50 select-none">
                  {formatTime(entry.timestamp)}
                </span>
                <span
                  className={cn(
                    'whitespace-pre-wrap break-all',
                    entry.stream === 'stderr' && 'text-red-400',
                    entry.stream === 'system' && 'text-muted-foreground italic'
                  )}
                >
                  {search
                    ? highlightMatch(entry.text, search)
                    : entry.text}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </>
        )}
      </div>
    </div>
  )
}

function highlightMatch(text: string, search: string): React.ReactNode {
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  if (parts.length === 1) return text

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-500/30 text-foreground rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

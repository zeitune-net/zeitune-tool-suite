import { Database, ChevronDown, CircleDot, ArrowLeft } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry } from '@shared/types'
import { useState, useRef } from 'react'
import { useClickOutside } from '@shared/hooks/useClickOutside'

export function ConnectionSwitcher({
  connections,
  activeConnection
}: {
  connections: DbConnectionEntry[]
  activeConnection: DbConnectionEntry | null
}) {
  const {
    setActiveConnectionId,
    connectionStates,
    connectToDb,
    setView,
    setActiveProfileId
  } = useDbExplorerStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false))

  const handleSelect = async (conn: DbConnectionEntry) => {
    setOpen(false)
    const state = connectionStates[conn.id]
    if (state?.status !== 'connected') {
      await connectToDb(conn)
    } else {
      setActiveConnectionId(conn.id)
    }
  }

  const handleBack = () => {
    setActiveProfileId(null)
    setView('profiles')
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleBack}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Back to profiles"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:border-border-hi"
        >
          <Database className="h-4 w-4 text-primary" />
          <span className="max-w-[200px] truncate">
            {activeConnection?.database ?? 'Select connection'}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg">
            <div className="p-1">
              {connections.map((conn) => {
                const state = connectionStates[conn.id]
                const isActive = activeConnection?.id === conn.id
                return (
                  <button
                    key={conn.id}
                    onClick={() => handleSelect(conn)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                    )}
                  >
                    <StatusDot status={state?.status} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{conn.name || conn.database}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {conn.host}:{conn.port}/{conn.database}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status?: string }) {
  const color =
    status === 'connected'
      ? 'text-green-500'
      : status === 'error'
        ? 'text-destructive'
        : status === 'testing'
          ? 'text-yellow-500 animate-pulse'
          : 'text-muted-foreground/30'
  return <CircleDot className={cn('h-3 w-3 shrink-0', color)} />
}

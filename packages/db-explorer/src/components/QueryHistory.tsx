import { useState, useMemo, useEffect } from 'react'
import { History, Search, Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/components/ui/button'
import { useDbExplorerStore } from '../store'

export function QueryHistory() {
  const {
    history, activeConnectionId, showHistory, setShowHistory,
    loadHistory, clearHistory, updateTabQuery, activeTabId
  } = useDbExplorerStore()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (showHistory) loadHistory()
  }, [showHistory, loadHistory])

  const filtered = useMemo(() => {
    let entries = activeConnectionId
      ? history.filter((h) => h.connectionId === activeConnectionId)
      : history
    if (search.trim()) {
      const q = search.toLowerCase()
      entries = entries.filter((h) => h.sql.toLowerCase().includes(q))
    }
    return entries
  }, [history, activeConnectionId, search])

  if (!showHistory) return null

  const handleUse = (sql: string) => {
    if (activeTabId) {
      updateTabQuery(activeTabId, sql)
    }
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <History className="h-3.5 w-3.5" />
          History
          <span className="text-muted-foreground">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => clearHistory(activeConnectionId ?? undefined)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Clear history"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowHistory(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative border-b border-border">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search queries..."
          className="w-full bg-transparent py-2 pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
            <History className="mb-2 h-6 w-6 opacity-30" />
            No queries yet
          </div>
        ) : (
          filtered.map((entry) => (
            <button
              key={entry.id}
              onClick={() => handleUse(entry.sql)}
              className="w-full text-left border-b border-border/50 px-3 py-2.5 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                {entry.error ? (
                  <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                )}
                <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{entry.duration}ms</span>
              </div>
              <div className="font-mono text-[11px] text-foreground/80 line-clamp-2 break-all">
                {entry.sql}
              </div>
              {!entry.error && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {entry.rowCount} row{entry.rowCount !== 1 ? 's' : ''}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

import { useState, useMemo, useEffect } from 'react'
import { Bookmark, Search, Trash2, X } from 'lucide-react'
import { useDbExplorerStore } from '../store'

export function SavedQueries() {
  const {
    savedQueries, savedQueriesLoaded, showSavedQueries, setShowSavedQueries,
    loadSavedQueries, deleteSavedQuery, updateTabQuery, activeTabId,
    activeProfileId, activeConnectionId
  } = useDbExplorerStore()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (showSavedQueries && !savedQueriesLoaded) loadSavedQueries()
  }, [showSavedQueries, savedQueriesLoaded, loadSavedQueries])

  const filtered = useMemo(() => {
    let entries = activeProfileId
      ? savedQueries.filter((q) => q.profileId === activeProfileId)
      : savedQueries
    if (search.trim()) {
      const s = search.toLowerCase()
      entries = entries.filter((q) =>
        q.name.toLowerCase().includes(s) || q.sql.toLowerCase().includes(s)
      )
    }
    return entries
  }, [savedQueries, activeProfileId, search])

  if (!showSavedQueries) return null

  const handleUse = (sql: string) => {
    if (activeTabId) updateTabQuery(activeTabId, sql)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteSavedQuery(id)
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Bookmark className="h-3.5 w-3.5" />
          Saved
          <span className="text-muted-foreground">({filtered.length})</span>
        </div>
        <button
          onClick={() => setShowSavedQueries(false)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative border-b border-border">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search saved queries..."
          className="w-full bg-transparent py-2 pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
            <Bookmark className="mb-2 h-6 w-6 opacity-30" />
            No saved queries
          </div>
        ) : (
          filtered.map((entry) => (
            <button
              key={entry.id}
              onClick={() => handleUse(entry.sql)}
              className="group w-full text-left border-b border-border/50 px-3 py-2.5 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-foreground truncate">{entry.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatDate(entry.updatedAt)}</span>
                <button
                  onClick={(e) => handleDelete(e, entry.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="font-mono text-[11px] text-foreground/60 line-clamp-2 break-all">
                {entry.sql}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Play, Loader2, AlertCircle, History, Save, Bookmark } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { SqlEditor } from './SqlEditor'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry } from '@shared/types'

export function QueryEditor({ connection }: { connection: DbConnectionEntry }) {
  const {
    tabs, activeTabId, updateTabQuery, executeTabQuery,
    showHistory, setShowHistory,
    showSavedQueries, setShowSavedQueries,
    saveQuery, activeProfileId,
    schemas, tableDetails, schemaColumns, loadSchemaColumns, activeConnectionId
  } = useDbExplorerStore()
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const handleRun = useCallback(() => {
    if (activeTabId) executeTabQuery(activeTabId, connection)
  }, [activeTabId, connection, executeTabQuery])

  // Eager-load columns for every visible schema so autocomplete works
  // without requiring the user to click each table first.
  useEffect(() => {
    if (!activeConnectionId) return
    const dbSchema = schemas[activeConnectionId]
    if (!dbSchema) return
    for (const s of dbSchema.schemas) {
      loadSchemaColumns(connection, s.name).catch(() => {})
    }
  }, [activeConnectionId, schemas, connection, loadSchemaColumns])

  // Build schema map for auto-completion. Prefer bulk-loaded columns,
  // fall back to per-table details when available.
  const schemaMap = useMemo(() => {
    if (!activeConnectionId) return undefined
    const dbSchema = schemas[activeConnectionId]
    if (!dbSchema) return undefined
    const result: Record<string, string[]> = {}
    for (const s of dbSchema.schemas) {
      const bulk = schemaColumns[`${activeConnectionId}:${s.name}`]
      for (const t of s.tables) {
        const key = s.name === 'public' ? t.name : `${s.name}.${t.name}`
        const detailKey = `${activeConnectionId}:${s.name}.${t.name}`
        const details = tableDetails[detailKey]
        result[key] = details
          ? details.columns.map((c) => c.name)
          : (bulk?.[t.name] ?? [])
      }
    }
    return result
  }, [activeConnectionId, schemas, tableDetails, schemaColumns])

  const handleSaveQuery = async () => {
    if (!saveName.trim() || !activeTab?.query.trim() || !activeProfileId) return
    await saveQuery({
      id: `sq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: saveName.trim(),
      sql: activeTab.query.trim(),
      profileId: activeProfileId,
      connectionId: connection.id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    setSaveName('')
    setShowSaveInput(false)
  }

  if (!activeTab) return null

  return (
    <div className="flex flex-col border-b border-border">
      <SqlEditor
        value={activeTab.query}
        onChange={(val) => updateTabQuery(activeTab.id, val)}
        onRun={handleRun}
        schema={schemaMap}
        dbType={connection.type}
      />
      <div className="flex items-center gap-3 border-t border-border/50 bg-card/30 px-4 py-2">
        <Button
          size="sm"
          onClick={handleRun}
          disabled={activeTab.loading || !activeTab.query.trim()}
        >
          {activeTab.loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          Run
          <span className="ml-1.5 text-[10px] opacity-60">F5</span>
        </Button>

        {activeTab.result && !activeTab.result.error && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Rows: <strong className="text-foreground">{activeTab.result.rowCount}</strong>
            </span>
            <span>
              Time: <strong className="text-foreground">{activeTab.result.duration}ms</strong>
            </span>
          </div>
        )}

        {activeTab.result?.error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="truncate">{activeTab.result.error}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {showSaveInput ? (
            <div className="flex items-center gap-1">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveQuery()
                  if (e.key === 'Escape') setShowSaveInput(false)
                }}
                placeholder="Query name..."
                autoFocus
                className="h-7 w-36 rounded bg-accent/30 px-2 text-xs outline-none placeholder:text-muted-foreground/50"
              />
              <Button size="sm" onClick={handleSaveQuery} disabled={!saveName.trim()}>
                Save
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSaveInput(true)}
              disabled={!activeTab.query.trim()}
              title="Save query"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
          )}

          <Button
            size="sm"
            variant={showSavedQueries ? 'default' : 'ghost'}
            onClick={() => {
              setShowSavedQueries(!showSavedQueries)
              if (!showSavedQueries) setShowHistory(false)
            }}
          >
            <Bookmark className="mr-1.5 h-3.5 w-3.5" />
            Saved
          </Button>

          <Button
            size="sm"
            variant={showHistory ? 'default' : 'ghost'}
            onClick={() => {
              setShowHistory(!showHistory)
              if (!showHistory) setShowSavedQueries(false)
            }}
          >
            <History className="mr-1.5 h-3.5 w-3.5" />
            History
          </Button>
        </div>
      </div>
    </div>
  )
}

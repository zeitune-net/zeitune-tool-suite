import { useRef, useCallback } from 'react'
import { Play, Loader2, AlertCircle, History } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry } from '@shared/types'

export function QueryEditor({ connection }: { connection: DbConnectionEntry }) {
  const {
    tabs, activeTabId, updateTabQuery, executeTabQuery,
    showHistory, setShowHistory
  } = useDbExplorerStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const handleRun = useCallback(() => {
    if (activeTabId) executeTabQuery(activeTabId, connection)
  }, [activeTabId, connection, executeTabQuery])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'F5' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        handleRun()
      }
    },
    [handleRun]
  )

  if (!activeTab) return null

  return (
    <div className="flex flex-col border-b border-border">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={activeTab.query}
          onChange={(e) => updateTabQuery(activeTab.id, e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM ..."
          spellCheck={false}
          className="h-32 w-full resize-y bg-card/50 p-4 font-mono text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
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

        <div className="ml-auto">
          <Button
            size="sm"
            variant={showHistory ? 'default' : 'ghost'}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="mr-1.5 h-3.5 w-3.5" />
            History
          </Button>
        </div>
      </div>
    </div>
  )
}

import { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'

export function QueryTabs() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, renameTab } = useDbExplorerStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDoubleClick = (tabId: string) => {
    setEditingId(tabId)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleRenameBlur = (tabId: string, value: string) => {
    if (value.trim()) renameTab(tabId, value.trim())
    setEditingId(null)
  }

  return (
    <div className="flex items-center gap-0.5 border-b border-border bg-card/30 px-1 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors shrink-0',
            activeTabId === tab.id
              ? 'border-primary text-foreground bg-card/60'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card/40'
          )}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={() => handleDoubleClick(tab.id)}
        >
          {editingId === tab.id ? (
            <input
              ref={inputRef}
              defaultValue={tab.title}
              className="w-20 bg-transparent text-xs outline-none border-b border-primary"
              onBlur={(e) => handleRenameBlur(tab.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameBlur(tab.id, e.currentTarget.value)
                if (e.key === 'Escape') setEditingId(null)
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="truncate max-w-[120px]">{tab.title}</span>
          )}
          {tab.loading && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          )}
          {tabs.length > 1 && (
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={addTab}
        className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-card/40 transition-colors shrink-0 ml-1"
        title="New tab"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

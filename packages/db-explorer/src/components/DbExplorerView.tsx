import { useDbExplorerStore } from '../store'
import { ProfileManager } from './ProfileManager'
import { SchemaTree } from './SchemaTree'
import { QueryEditor } from './QueryEditor'
import { ResultsTable } from './ResultsTable'
import { TableDetails } from './TableDetails'
import { ConnectionSwitcher } from './ConnectionSwitcher'
import { QueryTabs } from './QueryTabs'
import { QueryHistory } from './QueryHistory'
import { DataBrowser } from './DataBrowser'
import { cn } from '@shared/lib/utils'

export function DbExplorerView() {
  const {
    view, profiles, activeProfileId, activeConnectionId, selectedTable,
    explorerPanel, setExplorerPanel, showHistory
  } = useDbExplorerStore()

  // Profile view
  if (view === 'profiles' || !activeProfileId) {
    return <ProfileManager />
  }

  // Explorer view
  const profile = profiles.find((p) => p.id === activeProfileId)
  if (!profile) return <ProfileManager />

  const activeConnection = profile.connections.find((c) => c.id === activeConnectionId) ?? null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <ConnectionSwitcher
            connections={profile.connections}
            activeConnection={activeConnection}
          />
          {activeConnection && (
            <div className="flex items-center gap-0.5 rounded-lg bg-accent/20 p-0.5">
              <button
                onClick={() => setExplorerPanel('query')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  explorerPanel === 'query'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Query
              </button>
              <button
                onClick={() => setExplorerPanel('data-browser')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  explorerPanel === 'data-browser'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Browse
              </button>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {profile.name}
        </div>
      </div>

      {/* Main content */}
      {!activeConnection ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a connection to start exploring
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Schema sidebar */}
          <div className="w-56 shrink-0 border-r border-border">
            <SchemaTree connection={activeConnection} />
          </div>

          {/* Center panel */}
          {explorerPanel === 'query' ? (
            <div className="flex flex-1 overflow-hidden">
              <div className="flex flex-1 flex-col overflow-hidden">
                <QueryTabs />
                <QueryEditor connection={activeConnection} />
                <ResultsTable />
              </div>
              {showHistory && <QueryHistory />}
            </div>
          ) : (
            <DataBrowser connection={activeConnection} />
          )}

          {/* Right: Table details */}
          {selectedTable && (
            <div className="w-72 shrink-0 border-l border-border">
              <TableDetails connection={activeConnection} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

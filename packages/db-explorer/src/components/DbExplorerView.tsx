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
import { SnapshotManager } from './SnapshotManager'
import { Camera } from 'lucide-react'
import { cn } from '@shared/lib/utils'

export function DbExplorerView() {
  const {
    view, setView, profiles, activeProfileId, activeConnectionId, selectedTable,
    explorerPanel, setExplorerPanel, showHistory
  } = useDbExplorerStore()

  // Profile view
  if (view === 'profiles' || !activeProfileId) {
    return <ProfileManager />
  }

  // Snapshot view
  if (view === 'snapshots') {
    return <SnapshotManager />
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('snapshots')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Snapshots"
          >
            <Camera className="h-3.5 w-3.5" />
            Snapshots
          </button>
          <span className="text-xs text-muted-foreground">
            {profile.name}
          </span>
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

import {
  ArrowLeft,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  GitBranch,
  FileText,
  History,
  Archive,
  Loader2,
  Terminal,
  FolderOpen
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import * as gitIpc from '../services/git-ipc'
import { ChangesPanel } from './ChangesPanel'
import { BranchPanel } from './BranchPanel'
import { LogPanel } from './LogPanel'
import { StashPanel } from './StashPanel'
import { CommitPanel } from './CommitPanel'
import { ConflictPanel } from './ConflictPanel'
import type { DetailTab } from '../types'

const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
  { id: 'changes', label: 'Changes', icon: <FileText className="h-3.5 w-3.5" /> },
  { id: 'branches', label: 'Branches', icon: <GitBranch className="h-3.5 w-3.5" /> },
  { id: 'log', label: 'Log', icon: <History className="h-3.5 w-3.5" /> },
  { id: 'stash', label: 'Stash', icon: <Archive className="h-3.5 w-3.5" /> }
]

export function RepoDetail() {
  const {
    repositories,
    activeRepoPath,
    setActiveRepo,
    detailTab,
    setDetailTab,
    refreshRepo,
    pullRepo,
    pushRepo,
    fetchRepo,
    operationLoading
  } = useGitManagerStore()

  const repo = repositories.find((r) => r.path === activeRepoPath)
  if (!repo) return null

  const loading = operationLoading === repo.path || repo.loading

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveRepo(null)}
              className="rounded-lg p-1 hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-sm font-semibold">{repo.name}</h2>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" />
                  {repo.branch}
                </span>
                {repo.ahead > 0 && (
                  <Badge variant="success" className="text-[8px]">
                    {'\u2191'}{repo.ahead}
                  </Badge>
                )}
                {repo.behind > 0 && (
                  <Badge variant="warning" className="text-[8px]">
                    {'\u2193'}{repo.behind}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => gitIpc.openInTerminal(repo.path)}
              title="Ouvrir dans le terminal"
            >
              <Terminal className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => gitIpc.openInExplorer(repo.path)}
              title="Ouvrir dans l'explorateur"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchRepo(repo.path)}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pullRepo(repo.path)}
              disabled={loading}
            >
              <ArrowDownToLine className="mr-1 h-3 w-3" />
              Pull
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pushRepo(repo.path, undefined, repo.ahead > 0)}
              disabled={loading}
            >
              <ArrowUpFromLine className="mr-1 h-3 w-3" />
              Push
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDetailTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                detailTab === tab.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'changes' &&
                repo.staged.length + repo.modified.length + repo.untracked.length > 0 && (
                  <Badge variant="warning" className="ml-1 text-[8px]">
                    {repo.staged.length + repo.modified.length + repo.untracked.length}
                  </Badge>
                )}
              {tab.id === 'stash' && repo.stashes.length > 0 && (
                <Badge variant="muted" className="ml-1 text-[8px]">
                  {repo.stashes.length}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Conflicts always on top */}
        <ConflictPanel repo={repo} />

        {/* Commit panel (visible in changes tab) */}
        {detailTab === 'changes' && (
          <div className="mb-3">
            <CommitPanel repo={repo} />
          </div>
        )}

        {detailTab === 'changes' && <ChangesPanel repo={repo} />}
        {detailTab === 'branches' && <BranchPanel repo={repo} />}
        {detailTab === 'log' && <LogPanel repo={repo} />}
        {detailTab === 'stash' && <StashPanel repo={repo} />}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  )
}

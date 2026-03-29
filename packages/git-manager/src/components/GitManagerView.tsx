import { GitBranch, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import { ProfileSelector } from './ProfileSelector'
import { ProfileWizard } from './ProfileWizard'
import { RepoList } from './RepoList'
import { RepoDetail } from './RepoDetail'
import { BatchActions } from './BatchActions'

export function GitManagerView() {
  const {
    activeProfileId,
    viewMode,
    repositories,
    refreshAllRepos,
    batchLoading
  } = useGitManagerStore()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Git Manager</h1>
            <p className="text-sm text-muted-foreground">
              {repositories.length > 0
                ? `${repositories.length} repositories`
                : 'Gerez vos repos Git'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ProfileSelector />
          {activeProfileId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshAllRepos()}
              disabled={batchLoading}
            >
              {batchLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {!activeProfileId ? (
        <EmptyState />
      ) : viewMode === 'detail' ? (
        <RepoDetail />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Repo list sidebar */}
          <div className="w-72 shrink-0 border-r border-border overflow-hidden p-3">
            <RepoList />
          </div>

          {/* Main area with batch actions */}
          <div className="flex-1 overflow-auto p-6">
            <BatchActions />
            <DashboardGrid />
          </div>
        </div>
      )}

      {/* Wizard modal */}
      <ProfileWizard />
    </div>
  )
}

function EmptyState() {
  const { setWizardOpen } = useGitManagerStore()

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
      <GitBranch className="mb-4 h-16 w-16 opacity-10" />
      <h2 className="mb-1 text-lg font-semibold text-foreground">Bienvenue dans Git Manager</h2>
      <p className="mb-4 text-sm">Creez un profil pour commencer a gerer vos repositories</p>
      <Button onClick={() => setWizardOpen(true)}>Creer un profil</Button>
    </div>
  )
}

function DashboardGrid() {
  const { repositories, setActiveRepo } = useGitManagerStore()

  if (repositories.length === 0) return null

  // Summary stats
  const totalChanges = repositories.reduce(
    (acc, r) => acc + r.staged.length + r.modified.length + r.untracked.length,
    0
  )
  const totalAhead = repositories.reduce((acc, r) => acc + r.ahead, 0)
  const totalBehind = repositories.reduce((acc, r) => acc + r.behind, 0)
  const totalConflicts = repositories.reduce((acc, r) => acc + r.conflicts.length, 0)
  const branches = [...new Set(repositories.map((r) => r.branch))]

  return (
    <div className="mt-6">
      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard
          label="Changes"
          value={totalChanges}
          color={totalChanges > 0 ? 'warning' : 'muted'}
        />
        <StatCard label="Ahead" value={totalAhead} color={totalAhead > 0 ? 'success' : 'muted'} />
        <StatCard
          label="Behind"
          value={totalBehind}
          color={totalBehind > 0 ? 'warning' : 'muted'}
        />
        <StatCard
          label="Conflits"
          value={totalConflicts}
          color={totalConflicts > 0 ? 'destructive' : 'muted'}
        />
      </div>

      {/* Branch overview */}
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">Vue par branche</h3>
      <div className="space-y-3">
        {branches.map((branch) => {
          const repos = repositories.filter((r) => r.branch === branch)
          return (
            <div key={branch} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-mono font-semibold">{branch}</span>
                <span className="text-[10px] text-muted-foreground">
                  ({repos.length} repo{repos.length > 1 ? 's' : ''})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                {repos.map((repo) => {
                  const changes =
                    repo.staged.length + repo.modified.length + repo.untracked.length
                  return (
                    <button
                      key={repo.path}
                      onClick={() => setActiveRepo(repo.path)}
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition-all',
                        repo.conflicts.length > 0
                          ? 'border-destructive/30 bg-destructive/5'
                          : changes > 0
                            ? 'border-warning/20 bg-warning/5'
                            : 'border-border hover:border-border-hi',
                        'hover:bg-muted/50'
                      )}
                    >
                      <span className="truncate text-xs font-medium">{repo.name}</span>
                      <div className="flex items-center gap-1">
                        {repo.conflicts.length > 0 && (
                          <span className="text-[9px] text-destructive">
                            {repo.conflicts.length}C
                          </span>
                        )}
                        {changes > 0 && (
                          <span className="text-[9px] text-warning">{changes}M</span>
                        )}
                        {repo.ahead > 0 && (
                          <span className="text-[9px] text-primary">{'\u2191'}{repo.ahead}</span>
                        )}
                        {repo.behind > 0 && (
                          <span className="text-[9px] text-warning">{'\u2193'}{repo.behind}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: 'success' | 'warning' | 'destructive' | 'muted'
}) {
  const colorMap = {
    success: 'text-primary',
    warning: 'text-warning',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground'
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold', colorMap[color])}>{value}</p>
    </div>
  )
}

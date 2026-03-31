import { useState, useMemo } from 'react'
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Loader2,
  Check,
  Minus,
  Search,
  Terminal,
  FolderOpen,
  ArrowUpDown
} from 'lucide-react'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import * as gitIpc from '../services/git-ipc'
import type { Repository } from '../types'

type SortKey = 'name' | 'changes' | 'branch'

function RepoCard({ repo }: { repo: Repository }) {
  const { selectedRepoPaths, toggleRepoSelection, activeRepoPath, setActiveRepo } =
    useGitManagerStore()

  const isSelected = selectedRepoPaths.includes(repo.path)
  const isActive = activeRepoPath === repo.path
  const totalChanges = repo.staged.length + repo.modified.length + repo.untracked.length
  const hasConflicts = repo.conflicts.length > 0

  return (
    <div
      className={cn(
        'group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all',
        isActive
          ? 'border-primary/30 bg-primary/5'
          : 'border-border hover:border-border-hi hover:bg-card'
      )}
    >
      {/* Selection checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          toggleRepoSelection(repo.path)
        }}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
          isSelected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5'
        )}
        title={isSelected ? 'Désélectionner' : 'Sélectionner'}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </button>

      {/* Repo info */}
      <button
        className="min-w-0 flex-1 text-left"
        onClick={() => setActiveRepo(repo.path)}
      >
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium" title={repo.path}>{repo.name}</p>
          {repo.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <GitBranch className="h-2.5 w-2.5" />
            {repo.branch || '...'}
          </span>
          {repo.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-primary">
              <ArrowUp className="h-2.5 w-2.5" />
              {repo.ahead}
            </span>
          )}
          {repo.behind > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-warning">
              <ArrowDown className="h-2.5 w-2.5" />
              {repo.behind}
            </span>
          )}
        </div>
      </button>

      {/* Quick actions (terminal/explorer) */}
      <div className="hidden items-center gap-0.5 group-hover:flex">
        <button
          onClick={(e) => { e.stopPropagation(); gitIpc.openInTerminal(repo.path) }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ouvrir dans le terminal"
        >
          <Terminal className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); gitIpc.openInExplorer(repo.path) }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ouvrir dans l'explorateur"
        >
          <FolderOpen className="h-3 w-3" />
        </button>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-1">
        {hasConflicts && (
          <Badge variant="destructive">
            <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
            {repo.conflicts.length}
          </Badge>
        )}
        {repo.staged.length > 0 && <Badge variant="success">{repo.staged.length}S</Badge>}
        {totalChanges > 0 && !hasConflicts && (
          <Badge variant="warning">{totalChanges}</Badge>
        )}
        {totalChanges === 0 && !hasConflicts && !repo.loading && (
          <Badge variant="muted">
            <Minus className="h-2.5 w-2.5" />
          </Badge>
        )}
        {repo.error && <Badge variant="destructive">!</Badge>}
      </div>
    </div>
  )
}

export function RepoList() {
  const { repositories, selectedRepoPaths, selectAllRepos, deselectAllRepos } =
    useGitManagerStore()

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  const filteredRepos = useMemo(() => {
    let filtered = repositories
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (r) => r.name.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q)
      )
    }
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'changes') {
        const ca = a.staged.length + a.modified.length + a.untracked.length
        const cb = b.staged.length + b.modified.length + b.untracked.length
        return cb - ca // desc
      }
      if (sortKey === 'branch') return a.branch.localeCompare(b.branch)
      return 0
    })
  }, [repositories, search, sortKey])

  const allSelected = repositories.length > 0 && selectedRepoPaths.length === repositories.length
  const someSelected = selectedRepoPaths.length > 0 && !allSelected

  const cycleSortKey = () => {
    const keys: SortKey[] = ['name', 'changes', 'branch']
    const idx = keys.indexOf(sortKey)
    setSortKey(keys[(idx + 1) % keys.length])
  }

  const sortLabel = { name: 'A-Z', changes: 'Changes', branch: 'Branche' }

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer les repos..."
          className="w-full rounded-lg border border-border bg-input py-1.5 pl-7 pr-2 text-[11px] focus:border-primary/50 focus:outline-none"
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={allSelected ? deselectAllRepos : selectAllRepos}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors',
            allSelected
              ? 'bg-primary/10 text-primary'
              : someSelected
                ? 'bg-primary/5 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {allSelected ? (
            <Check className="h-3 w-3" />
          ) : someSelected ? (
            <Minus className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3 opacity-40" />
          )}
          {selectedRepoPaths.length}/{repositories.length}
        </button>
        <button
          onClick={cycleSortKey}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Changer le tri"
        >
          <ArrowUpDown className="h-2.5 w-2.5" />
          {sortLabel[sortKey]}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 space-y-1 overflow-auto pr-1">
        {filteredRepos.map((repo) => (
          <RepoCard key={repo.path} repo={repo} />
        ))}
        {repositories.length > 0 && filteredRepos.length === 0 && (
          <p className="py-6 text-center text-[10px] text-muted-foreground">
            Aucun résultat pour "{search}"
          </p>
        )}
        {repositories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <GitBranch className="mb-2 h-8 w-8 opacity-20" />
            <p className="text-xs">Sélectionnez un profil pour charger les repos</p>
          </div>
        )}
      </div>
    </div>
  )
}

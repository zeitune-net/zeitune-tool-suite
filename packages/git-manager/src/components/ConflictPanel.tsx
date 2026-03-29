import { AlertTriangle, Check, X, Ban } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { useGitManagerStore } from '../store'
import type { Repository } from '../types'

export function ConflictPanel({ repo }: { repo: Repository }) {
  const { resolveConflict, abortMerge } = useGitManagerStore()

  if (repo.conflicts.length === 0) return null

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">
            {repo.conflicts.length} conflit{repo.conflicts.length > 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => abortMerge(repo.path)}
        >
          <Ban className="mr-1 h-3 w-3" />
          Abort merge
        </Button>
      </div>

      <div className="space-y-1">
        {repo.conflicts.map((conflict) => (
          <div
            key={conflict.path}
            className="flex items-center gap-2 rounded-lg bg-card px-3 py-2"
          >
            <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
            <span className="flex-1 truncate text-xs font-mono">{conflict.path}</span>
            <div className="flex items-center gap-1">
              <Badge variant="muted" className="text-[9px]">
                {conflict.oursStatus}/{conflict.theirsStatus}
              </Badge>
              <button
                onClick={() => resolveConflict(repo.path, conflict.path, 'ours')}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-info hover:bg-info/10"
                title="Garder notre version"
              >
                Ours
              </button>
              <button
                onClick={() => resolveConflict(repo.path, conflict.path, 'theirs')}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-warning hover:bg-warning/10"
                title="Garder leur version"
              >
                Theirs
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Resolvez chaque conflit individuellement ou annulez le merge. Vous pouvez aussi editer
        manuellement les fichiers puis les stage.
      </p>
    </div>
  )
}

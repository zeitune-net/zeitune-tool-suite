import { GitCommit, Tag } from 'lucide-react'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import type { Repository } from '../types'

export function LogPanel({ repo }: { repo: Repository }) {
  if (repo.recentLog.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">Aucun historique disponible</p>
    )
  }

  return (
    <div className="space-y-0.5">
      {repo.recentLog.map((entry, i) => (
        <div
          key={entry.hash}
          className="group flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50"
        >
          {/* Timeline */}
          <div className="flex flex-col items-center pt-1">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                i === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            />
            {i < repo.recentLog.length - 1 && (
              <div className="mt-0.5 h-full w-px bg-border" />
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-primary">{entry.shortHash}</span>
              {entry.refs && (
                <div className="flex items-center gap-1">
                  {entry.refs.split(',').map((ref) => {
                    const trimmed = ref.trim()
                    if (!trimmed) return null
                    const isTag = trimmed.startsWith('tag:')
                    return (
                      <Badge
                        key={trimmed}
                        variant={isTag ? 'purple' : 'info'}
                        className="text-[8px]"
                      >
                        {isTag ? (
                          <Tag className="mr-0.5 h-2 w-2" />
                        ) : (
                          <GitCommit className="mr-0.5 h-2 w-2" />
                        )}
                        {trimmed.replace('tag: ', '').replace('HEAD -> ', '')}
                      </Badge>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs">{entry.message}</p>
            <p className="text-[10px] text-muted-foreground">
              {entry.author} · {new Date(entry.date).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

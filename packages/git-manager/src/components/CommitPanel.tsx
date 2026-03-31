import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import type { Repository } from '../types'

export function CommitPanel({ repo }: { repo: Repository }) {
  const { commitChanges, operationLoading } = useGitManagerStore()
  const [message, setMessage] = useState('')

  const loading = operationLoading === repo.path
  const hasStaged = repo.staged.length > 0
  const canCommit = hasStaged && message.trim().length > 0 && !loading

  const handleCommit = () => {
    if (!canCommit) return
    commitChanges(repo.path, message.trim())
    setMessage('')
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        hasStaged
          ? 'border-primary/20 bg-primary/5'
          : 'border-border bg-muted/30'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={cn('text-xs font-medium', !hasStaged && 'text-muted-foreground')}>
          {hasStaged
            ? `Commit (${repo.staged.length} fichier${repo.staged.length > 1 ? 's' : ''} staged)`
            : 'Aucun fichier staged'}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={hasStaged ? 'Message du commit...' : 'Ajoutez des fichiers au stage pour commit'}
          disabled={!hasStaged}
          className="flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs font-mono focus:border-primary focus:outline-none disabled:opacity-50"
          onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
        />
        <Button size="sm" disabled={!canCommit} onClick={handleCommit}>
          {loading ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Send className="mr-1 h-3 w-3" />
          )}
          Commit
        </Button>
      </div>
    </div>
  )
}

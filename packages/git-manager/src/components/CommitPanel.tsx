import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { useGitManagerStore } from '../store'
import type { Repository } from '../types'

export function CommitPanel({ repo }: { repo: Repository }) {
  const { commitChanges, operationLoading } = useGitManagerStore()
  const [message, setMessage] = useState('')

  const loading = operationLoading === repo.path
  const canCommit = repo.staged.length > 0 && message.trim().length > 0 && !loading

  const handleCommit = () => {
    if (!canCommit) return
    commitChanges(repo.path, message.trim())
    setMessage('')
  }

  if (repo.staged.length === 0) return null

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">
          Commit ({repo.staged.length} fichier{repo.staged.length > 1 ? 's' : ''} staged)
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message du commit..."
          className="flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
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

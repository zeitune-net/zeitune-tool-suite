import { useState } from 'react'
import { Archive, ArrowUpFromLine, Trash2, Plus, X } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { useGitManagerStore } from '../store'
import type { Repository } from '../types'

export function StashPanel({ repo }: { repo: Repository }) {
  const { stashSave, stashPop, stashDrop } = useGitManagerStore()
  const [showSave, setShowSave] = useState(false)
  const [stashMessage, setStashMessage] = useState('')

  const hasChanges = repo.modified.length + repo.untracked.length + repo.staged.length > 0

  const handleSave = () => {
    stashSave(repo.path, stashMessage || undefined)
    setStashMessage('')
    setShowSave(false)
  }

  return (
    <div className="space-y-3">
      {/* Save stash */}
      <div className="flex items-center gap-2">
        <Button
          variant="green"
          size="sm"
          disabled={!hasChanges}
          onClick={() => setShowSave(!showSave)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Stash
        </Button>
      </div>

      {showSave && (
        <div className="flex items-center gap-2 rounded-lg border border-border p-2">
          <input
            type="text"
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            placeholder="Message (optionnel)"
            className="flex-1 rounded-md border border-border bg-input px-2 py-1 text-xs font-mono focus:border-primary focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <Button size="sm" onClick={handleSave}>
            Sauvegarder
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSave(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Stash list */}
      {repo.stashes.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Aucun stash</p>
      ) : (
        <div className="space-y-1">
          {repo.stashes.map((stash) => (
            <div
              key={stash.index}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
            >
              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  stash@{'{'}
                  {stash.index}
                  {'}'}: {stash.message || 'WIP'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(stash.date).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <div className="hidden items-center gap-1 group-hover:flex">
                <button
                  onClick={() => stashPop(repo.path, stash.index)}
                  className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  title="Pop (appliquer et supprimer)"
                >
                  <ArrowUpFromLine className="h-3 w-3" />
                </button>
                <button
                  onClick={() => stashDrop(repo.path, stash.index)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Drop (supprimer)"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

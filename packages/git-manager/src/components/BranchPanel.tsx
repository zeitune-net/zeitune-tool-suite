import { useState, useRef, useEffect } from 'react'
import {
  GitBranch,
  Plus,
  Trash2,
  GitMerge,
  Check,
  X,
  ArrowRight,
  Globe,
  ChevronDown,
  Search
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import type { Repository } from '../types'

function MergeSection({
  repo,
  mergeSrc,
  setMergeSrc,
  onMerge,
  onClose
}: {
  repo: Repository
  mergeSrc: string
  setMergeSrc: (v: string) => void
  onMerge: () => void
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const localBranches = repo.branches.filter((b) => b !== repo.branch)
  const allOptions = [
    ...localBranches.map((b) => ({ label: b, group: 'local' })),
    ...repo.remoteBranches.map((b) => ({ label: b, group: 'remote' }))
  ]
  const filtered = filter
    ? allOptions.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
    : allOptions

  return (
    <div className="flex items-center gap-2 rounded-lg border border-info/20 bg-info/5 p-2">
      <div className="relative flex-1" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            'flex w-full items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-mono transition-colors',
            'hover:border-border-hi focus:border-primary focus:outline-none',
            !mergeSrc && 'text-muted-foreground'
          )}
        >
          <span className="truncate">{mergeSrc || 'Choisir la branche source...'}</span>
          <ChevronDown className={cn('ml-2 h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg">
            <div className="border-b border-border p-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs font-mono focus:border-primary focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-52 overflow-auto p-1">
              {filtered.length === 0 && (
                <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">Aucun resultat</p>
              )}
              {filtered.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => { setMergeSrc(opt.label); setOpen(false); setFilter('') }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-mono transition-colors',
                    'hover:bg-muted',
                    mergeSrc === opt.label && 'bg-primary/10 text-primary'
                  )}
                >
                  {opt.group === 'remote' ? (
                    <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <Badge variant="default">{repo.branch}</Badge>
      <Button size="sm" variant="info" onClick={onMerge} disabled={!mergeSrc}>
        Merge
      </Button>
      <Button variant="ghost" size="sm" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function BranchPanel({ repo }: { repo: Repository }) {
  const { checkoutBranch, createBranch, deleteBranch, mergeBranch } = useGitManagerStore()

  const [showCreate, setShowCreate] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [showMerge, setShowMerge] = useState(false)
  const [mergeSrc, setMergeSrc] = useState('')
  const [showRemote, setShowRemote] = useState(false)

  const handleCreate = () => {
    if (!newBranchName.trim()) return
    createBranch(repo.path, newBranchName.trim())
    setNewBranchName('')
    setShowCreate(false)
  }

  const handleMerge = () => {
    if (!mergeSrc) return
    mergeBranch(repo.path, mergeSrc)
    setMergeSrc('')
    setShowMerge(false)
  }

  return (
    <div className="space-y-3">
      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="green" size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-3 w-3" />
          Nouvelle branche
        </Button>
        <Button variant="info" size="sm" onClick={() => setShowMerge(!showMerge)}>
          <GitMerge className="mr-1 h-3 w-3" />
          Merge
        </Button>
        <Button
          variant={showRemote ? 'outline' : 'ghost'}
          size="sm"
          onClick={() => setShowRemote(!showRemote)}
        >
          <Globe className="mr-1 h-3 w-3" />
          Remote
        </Button>
      </div>

      {/* Create branch */}
      {showCreate && (
        <div className="flex items-center gap-2 rounded-lg border border-border p-2">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="feature/ma-branche"
            className="flex-1 rounded-md border border-border bg-input px-2 py-1 text-xs font-mono focus:border-primary focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button size="sm" onClick={handleCreate} disabled={!newBranchName.trim()}>
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Merge */}
      {showMerge && (
        <MergeSection
          repo={repo}
          mergeSrc={mergeSrc}
          setMergeSrc={setMergeSrc}
          onMerge={handleMerge}
          onClose={() => setShowMerge(false)}
        />
      )}

      {/* Local branches */}
      <div>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">Branches locales</h4>
        <div className="space-y-0.5">
          {repo.branches.map((branch) => {
            const isCurrent = branch === repo.branch
            return (
              <div
                key={branch}
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-2 py-1.5',
                  isCurrent ? 'bg-primary/8' : 'hover:bg-muted/50'
                )}
              >
                <GitBranch
                  className={cn('h-3 w-3', isCurrent ? 'text-primary' : 'text-muted-foreground')}
                />
                <span
                  className={cn(
                    'flex-1 text-xs font-mono',
                    isCurrent ? 'font-semibold text-primary' : ''
                  )}
                >
                  {branch}
                </span>
                {isCurrent && (
                  <Badge variant="success" className="text-[9px]">
                    current
                  </Badge>
                )}
                {!isCurrent && (
                  <div className="hidden items-center gap-0.5 group-hover:flex">
                    <button
                      onClick={() => checkoutBranch(repo.path, branch)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      title="Checkout"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => deleteBranch(repo.path, branch)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Remote branches */}
      {showRemote && repo.remoteBranches.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">Branches remote</h4>
          <div className="space-y-0.5">
            {repo.remoteBranches.map((branch) => (
              <div
                key={branch}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50"
              >
                <Globe className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 text-xs font-mono text-muted-foreground">{branch}</span>
                <button
                  onClick={() => checkoutBranch(repo.path, branch)}
                  className="hidden rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary group-hover:block"
                  title="Checkout"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useCallback } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  GitBranch,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  Send,
  ChevronDown,
  Search
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useClickOutside } from '@shared/hooks/useClickOutside'
import { useGitManagerStore } from '../store'

function BranchDropdown({
  value,
  onChange,
  branches,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  branches: string[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const closeDropdown = useCallback(() => setOpen(false), [])
  useClickOutside(ref, closeDropdown)

  const filtered = filter
    ? branches.filter((b) => b.toLowerCase().includes(filter.toLowerCase()))
    : branches

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-mono transition-colors',
          'hover:border-border-hi focus:border-primary focus:outline-none',
          !value && 'text-muted-foreground'
        )}
      >
        <span className="truncate">{value || placeholder}</span>
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
              <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">Aucun résultat</p>
            )}
            {filtered.map((b) => (
              <button
                key={b}
                onClick={() => { onChange(b); setOpen(false); setFilter('') }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-mono transition-colors',
                  'hover:bg-muted',
                  value === b && 'bg-primary/10 text-primary'
                )}
              >
                <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{b}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function BatchActions() {
  const {
    selectedRepoPaths,
    batchLoading,
    batchResults,
    clearBatchResults,
    batchFetch,
    batchPull,
    batchPush,
    batchCheckout,
    batchCommit,
    repositories
  } = useGitManagerStore()

  const [checkoutBranch, setCheckoutBranch] = useState('')
  const [showCheckoutInput, setShowCheckoutInput] = useState(false)
  const [pullBranch, setPullBranch] = useState('')
  const [showPullInput, setShowPullInput] = useState(false)
  const [showCommitInput, setShowCommitInput] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')

  const disabled = selectedRepoPaths.length === 0 || batchLoading

  // Collect all branches from selected repos for autocomplete
  const allBranches = [
    ...new Set(
      repositories
        .filter((r) => selectedRepoPaths.includes(r.path))
        .flatMap((r) => [...r.branches, ...r.remoteBranches])
    )
  ].sort()

  const handlePull = () => {
    if (pullBranch) {
      batchPull(pullBranch)
      setPullBranch('')
      setShowPullInput(false)
    } else {
      batchPull()
    }
  }

  const handleCheckout = () => {
    if (checkoutBranch) {
      batchCheckout(checkoutBranch)
      setCheckoutBranch('')
      setShowCheckoutInput(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => batchFetch()}>
          {batchLoading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Fetch
        </Button>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={disabled} onClick={handlePull}>
            <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
            Pull
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5"
            onClick={() => setShowPullInput(!showPullInput)}
            title="Pull une branche spécifique"
          >
            <GitBranch className="h-3 w-3" />
          </Button>
        </div>

        <Button variant="outline" size="sm" disabled={disabled} onClick={() => batchPush()}>
          <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
          Push
        </Button>

        <Button
          variant="green"
          size="sm"
          disabled={disabled}
          onClick={() => setShowCheckoutInput(!showCheckoutInput)}
        >
          <GitBranch className="mr-1.5 h-3.5 w-3.5" />
          Checkout
        </Button>

        <Button
          variant="info"
          size="sm"
          disabled={disabled}
          onClick={() => setShowCommitInput(!showCommitInput)}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Commit
        </Button>
      </div>

      {/* Pull branch input */}
      {showPullInput && (
        <div className="flex items-center gap-2">
          <BranchDropdown
            value={pullBranch}
            onChange={setPullBranch}
            branches={allBranches}
            placeholder="Branche a pull (vide = courante)"
          />
          <Button size="sm" disabled={disabled} onClick={handlePull}>
            Pull
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowPullInput(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Checkout branch input */}
      {showCheckoutInput && (
        <div className="flex items-center gap-2">
          <BranchDropdown
            value={checkoutBranch}
            onChange={setCheckoutBranch}
            branches={allBranches}
            placeholder="Nom de la branche"
          />
          <Button size="sm" disabled={!checkoutBranch || disabled} onClick={handleCheckout}>
            Checkout all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowCheckoutInput(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Batch commit input */}
      {showCommitInput && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Message du commit (stage all + commit)"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && commitMessage.trim()) {
                batchCommit(commitMessage.trim())
                setCommitMessage('')
                setShowCommitInput(false)
              }
            }}
          />
          <Button
            size="sm"
            disabled={!commitMessage.trim() || disabled}
            onClick={() => {
              if (commitMessage.trim()) {
                batchCommit(commitMessage.trim())
                setCommitMessage('')
                setShowCommitInput(false)
              }
            }}
          >
            <Send className="mr-1 h-3 w-3" />
            Commit all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowCommitInput(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Batch results */}
      {batchResults.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Résultats</span>
            <button onClick={clearBatchResults} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {batchResults.map((result) => (
              <div
                key={result.repoPath}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1 text-xs',
                  result.success ? 'text-primary' : 'text-destructive'
                )}
              >
                {result.success ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 shrink-0" />
                )}
                <span className="font-medium">{result.repoName}</span>
                <span className="truncate text-muted-foreground">{result.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

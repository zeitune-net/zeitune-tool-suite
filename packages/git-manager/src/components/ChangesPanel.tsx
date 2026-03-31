import { useState } from 'react'
import {
  Plus,
  Minus,
  FileText,
  FilePlus,
  FileX,
  FileEdit,
  Trash2,
  Undo2,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { useConfirm } from '@shared/components/ui/confirm-dialog'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import type { Repository, FileChange } from '../types'

function fileIcon(status: string) {
  switch (status) {
    case 'added':
      return <FilePlus className="h-3 w-3 text-primary" />
    case 'deleted':
      return <FileX className="h-3 w-3 text-destructive" />
    case 'modified':
      return <FileEdit className="h-3 w-3 text-warning" />
    case 'renamed':
      return <FileEdit className="h-3 w-3 text-info" />
    default:
      return <FileText className="h-3 w-3 text-muted-foreground" />
  }
}

function FileItem({
  file,
  type,
  repoPath,
  onStage,
  onUnstage,
  onDiscard,
  onDiscardUntracked,
  onDiscardStaged
}: {
  file: FileChange | string
  type: 'staged' | 'modified' | 'untracked'
  repoPath: string
  onStage: (files: string[]) => void
  onUnstage: (files: string[]) => void
  onDiscard: (files: string[]) => void
  onDiscardUntracked: (files: string[]) => void
  onDiscardStaged: (files: string[]) => void
}) {
  const isString = typeof file === 'string'
  const path = isString ? file : file.path
  const status = isString ? 'untracked' : file.status
  const fileName = path.split(/[/\\]/).pop() || path

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/50">
      {fileIcon(status)}
      <span
        className="flex-1 truncate text-left text-xs font-mono"
        title={path}
      >
        {fileName}
      </span>
      <span className="text-[9px] text-muted-foreground">{path !== fileName ? path : ''}</span>

      <div className="hidden items-center gap-0.5 group-hover:flex">
        {type === 'staged' && (
          <>
            <button
              onClick={() => onUnstage([path])}
              className="rounded p-0.5 hover:bg-warning/10 hover:text-warning"
              title="Unstage"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              onClick={() => onDiscardStaged([path])}
              className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
              title="Annuler les modifications"
            >
              <Undo2 className="h-3 w-3" />
            </button>
          </>
        )}
        {(type === 'modified' || type === 'untracked') && (
          <button
            onClick={() => onStage([path])}
            className="rounded p-0.5 hover:bg-primary/10 hover:text-primary"
            title="Stage"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        {type === 'modified' && (
          <button
            onClick={() => onDiscard([path])}
            className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
            title="Discard"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        {type === 'untracked' && (
          <button
            onClick={() => onDiscardUntracked([path])}
            className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
            title="Supprimer le fichier"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  count,
  variant,
  defaultOpen = true,
  children
}: {
  title: string
  count: number
  variant: 'success' | 'warning' | 'secondary'
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-1 py-1"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">{title}</span>
        <Badge variant={variant} className="text-[9px]">
          {count}
        </Badge>
      </button>
      {open && <div className="ml-1">{children}</div>}
    </div>
  )
}

export function ChangesPanel({ repo }: { repo: Repository }) {
  const { stageFiles, unstageFiles, stageAllFiles, discardFiles, discardUntrackedFiles, discardStagedFiles } = useGitManagerStore()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const handleStage = (files: string[]) => stageFiles(repo.path, files)
  const handleUnstage = (files: string[]) => unstageFiles(repo.path, files)
  const handleDiscard = async (files: string[]) => {
    const ok = await confirm({
      title: 'Annuler les modifications ?',
      description: `Les modifications sur ${files.length} fichier(s) seront perdues. Cette action est irréversible.`,
      variant: 'warning',
      confirmLabel: 'Annuler les modifs'
    })
    if (ok) discardFiles(repo.path, files)
  }
  const handleDiscardStaged = async (files: string[]) => {
    const ok = await confirm({
      title: 'Annuler les modifications staged ?',
      description: `Les modifications sur ${files.length} fichier(s) seront perdues (unstage + revert). Cette action est irréversible.`,
      variant: 'warning',
      confirmLabel: 'Annuler les modifs'
    })
    if (ok) discardStagedFiles(repo.path, files)
  }
  const handleDiscardUntracked = async (files: string[]) => {
    const ok = await confirm({
      title: 'Supprimer ce fichier ?',
      description: `${files.join(', ')} sera définitivement supprimé du disque. Cette action est irréversible.`,
      confirmLabel: 'Supprimer'
    })
    if (ok) discardUntrackedFiles(repo.path, files)
  }
  const totalUnstaged = repo.modified.length + repo.untracked.length

  return (
    <div className="space-y-2">
      {/* Quick actions */}
      <div className="flex items-center gap-2">
        {totalUnstaged > 0 && (
          <Button variant="green" size="sm" onClick={() => stageAllFiles(repo.path)}>
            <Plus className="mr-1 h-3 w-3" />
            Stage all ({totalUnstaged})
          </Button>
        )}
        {repo.staged.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUnstage(repo.staged.map((f) => f.path))}
          >
            <Minus className="mr-1 h-3 w-3" />
            Unstage all
          </Button>
        )}
      </div>

      {/* Staged */}
      <Section title="Staged" count={repo.staged.length} variant="success">
        {repo.staged.map((f) => (
          <FileItem
            key={f.path}
            file={f}
            type="staged"
            repoPath={repo.path}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onDiscard={handleDiscard}
            onDiscardUntracked={handleDiscardUntracked}
            onDiscardStaged={handleDiscardStaged}
          />
        ))}
      </Section>

      {/* Modified */}
      <Section title="Modified" count={repo.modified.length} variant="warning">
        {repo.modified.map((f) => (
          <FileItem
            key={f.path}
            file={f}
            type="modified"
            repoPath={repo.path}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onDiscard={handleDiscard}
            onDiscardUntracked={handleDiscardUntracked}
            onDiscardStaged={handleDiscardStaged}
          />
        ))}
      </Section>

      {/* Untracked */}
      <Section title="Untracked" count={repo.untracked.length} variant="secondary">
        {repo.untracked.map((path) => (
          <FileItem
            key={path}
            file={path}
            type="untracked"
            repoPath={repo.path}
            onStage={handleStage}
            onUnstage={handleUnstage}
            onDiscard={handleDiscard}
            onDiscardUntracked={handleDiscardUntracked}
            onDiscardStaged={handleDiscardStaged}
          />
        ))}
      </Section>

      {/* Empty state */}
      {repo.staged.length === 0 && repo.modified.length === 0 && repo.untracked.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Working tree clean
        </p>
      )}
      {confirmDialog}
    </div>
  )
}

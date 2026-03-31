import { useState, useEffect } from 'react'
import {
  Globe,
  GitBranch,
  User,
  Mail,
  Loader2,
  RefreshCw,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Link,
  Unlink,
  FolderGit2,
  Copy
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { useConfirm } from '@shared/components/ui/confirm-dialog'
import { cn } from '@shared/lib/utils'
import { toast } from '@shared/components/ui/toast'
import { useGitManagerStore } from '../store'
import * as gitIpc from '../services/git-ipc'
import type { Repository, RemoteInfo, BranchTracking } from '../types'

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  badge,
  action
}: {
  icon: React.ReactNode
  title: string
  badge?: number
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
        {badge !== undefined && badge > 0 && (
          <Badge variant="muted" className="text-[8px]">{badge}</Badge>
        )}
      </div>
      {action}
    </div>
  )
}

// ── Inline editable field ───────────────────────────────────────────────────

function EditableField({
  value,
  placeholder,
  onSave,
  mono
}: {
  value: string
  placeholder: string
  onSave: (v: string) => Promise<void>
  mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
    setSaving(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true) }}
        className={cn(
          'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted',
          mono && 'font-mono'
        )}
      >
        <span className={cn('flex-1 truncate', !value && 'italic text-muted-foreground')}>
          {value || placeholder}
        </span>
        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className={cn(
          'flex-1 rounded-md border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary',
          mono && 'font-mono'
        )}
        placeholder={placeholder}
      />
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-primary" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ── Copyable read-only field ────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value)
    toast.success(`${label} copié`)
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 truncate font-mono">{value}</span>
      <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground">
        <Copy className="h-3 w-3" />
      </button>
    </div>
  )
}

// ── Remote Card ─────────────────────────────────────────────────────────────

function RemoteCard({
  remote,
  repoPath,
  onRefresh,
  allRemotes
}: {
  remote: RemoteInfo
  repoPath: string
  onRefresh: () => void
  allRemotes: RemoteInfo[]
}) {
  const confirm = useConfirm()
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(remote.name)

  const handleRemove = async () => {
    const ok = await confirm({
      title: `Supprimer le remote « ${remote.name} » ?`,
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      variant: 'destructive'
    })
    if (!ok) return
    try {
      await gitIpc.removeRemote(repoPath, remote.name)
      toast.success(`Remote ${remote.name} supprimé`)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression remote')
    }
  }

  const handleRename = async () => {
    if (!newName || newName === remote.name) { setRenaming(false); return }
    if (allRemotes.some((r) => r.name === newName)) {
      toast.error(`Le remote « ${newName} » existe déjà`)
      return
    }
    try {
      await gitIpc.renameRemote(repoPath, remote.name, newName)
      toast.success(`Remote renommé en ${newName}`)
      setRenaming(false)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur renommage remote')
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-primary" />
          {renaming ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                className="w-32 rounded-md border border-border bg-input px-2 py-0.5 text-xs font-semibold outline-none focus:border-primary"
              />
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleRename}>
                <Check className="h-3 w-3 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setRenaming(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => { setNewName(remote.name); setRenaming(true) }}
              className="group flex items-center gap-1 text-xs font-semibold"
            >
              {remote.name}
              <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </button>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRemove}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="w-12 shrink-0">Fetch</span>
          <EditableField
            value={remote.fetchUrl}
            placeholder="URL de fetch"
            mono
            onSave={async (url) => {
              await gitIpc.setRemoteUrl(repoPath, remote.name, url, false)
              onRefresh()
            }}
          />
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="w-12 shrink-0">Push</span>
          <EditableField
            value={remote.pushUrl}
            placeholder="URL de push"
            mono
            onSave={async (url) => {
              await gitIpc.setRemoteUrl(repoPath, remote.name, url, true)
              onRefresh()
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Add Remote Form ─────────────────────────────────────────────────────────

function AddRemoteForm({
  repoPath,
  onRefresh,
  onCancel
}: {
  repoPath: string
  onRefresh: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    try {
      await gitIpc.addRemote(repoPath, name.trim(), url.trim())
      toast.success(`Remote ${name} ajouté`)
      onRefresh()
      onCancel()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur ajout remote')
    }
    setSaving(false)
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3">
      <div className="mb-2 text-xs font-semibold text-primary">Nouveau remote</div>
      <div className="space-y-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom (ex: origin, upstream)"
          className="w-full rounded-md border border-border bg-input px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (https://... ou git@...)"
          className="w-full rounded-md border border-border bg-input px-2 py-1 font-mono text-xs outline-none focus:border-primary"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleAdd} disabled={saving || !name.trim() || !url.trim()}>
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
            Ajouter
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuler</Button>
        </div>
      </div>
    </div>
  )
}

// ── Branch Tracking Row ─────────────────────────────────────────────────────

function BranchTrackingRow({
  bt,
  repoPath,
  remoteBranches,
  onRefresh
}: {
  bt: BranchTracking
  repoPath: string
  remoteBranches: string[]
  onRefresh: () => void
}) {
  const [linking, setLinking] = useState(false)
  const [selected, setSelected] = useState(bt.remote || '')

  const handleSet = async () => {
    if (!selected) return
    try {
      await gitIpc.setBranchUpstream(repoPath, bt.local, selected)
      toast.success(`${bt.local} → ${selected}`)
      setLinking(false)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur set upstream')
    }
  }

  const handleUnset = async () => {
    try {
      await gitIpc.unsetBranchUpstream(repoPath, bt.local)
      toast.success(`Tracking supprimé pour ${bt.local}`)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur unset upstream')
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50">
      <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="w-32 shrink-0 truncate font-medium">{bt.local}</span>

      {linking ? (
        <div className="flex flex-1 items-center gap-1">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 rounded-md border border-border bg-input px-2 py-0.5 text-xs outline-none focus:border-primary"
          >
            <option value="">Choisir une branche distante...</option>
            {remoteBranches.map((rb) => (
              <option key={rb} value={rb}>{rb}</option>
            ))}
          </select>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSet} disabled={!selected}>
            <Check className="h-3 w-3 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setLinking(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <>
          <span className="text-muted-foreground">→</span>
          {bt.remote ? (
            <span className={cn('flex-1 truncate font-mono', bt.gone && 'italic text-destructive line-through')}>
              {bt.remote}
              {bt.gone && <span className="ml-1 text-[10px] no-underline">(gone)</span>}
            </span>
          ) : (
            <span className="flex-1 italic text-muted-foreground">non suivi</span>
          )}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => { setSelected(bt.remote || ''); setLinking(true) }}
              title={bt.remote ? 'Changer le tracking' : 'Définir le tracking'}
            >
              <Link className="h-3 w-3" />
            </Button>
            {bt.remote && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleUnset}
                title="Supprimer le tracking"
              >
                <Unlink className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Panel ──────────────────────────────────────────────────────────────

export function RepoSettingsPanel({ repo }: { repo: Repository }) {
  const { repoConfig, repoConfigLoading, loadRepoConfig } = useGitManagerStore()
  const [addingRemote, setAddingRemote] = useState(false)

  useEffect(() => {
    loadRepoConfig(repo.path)
  }, [repo.path])

  const refresh = () => loadRepoConfig(repo.path)

  if (repoConfigLoading && !repoConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!repoConfig) return null

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Paramètres du dépôt</h3>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={repoConfigLoading}>
          <RefreshCw className={cn('h-3.5 w-3.5', repoConfigLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* General info */}
      <div>
        <SectionHeader
          icon={<FolderGit2 className="h-3.5 w-3.5" />}
          title="Informations générales"
        />
        <div className="rounded-lg border border-border bg-card p-2">
          <CopyField label="Répertoire" value={repoConfig.worktree} />
          <CopyField label="Git dir" value={repoConfig.gitDir} />
          {repoConfig.defaultBranch && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">Branche défaut</span>
              <span>{repoConfig.defaultBranch}</span>
            </div>
          )}
          {repoConfig.isBare && (
            <div className="px-2 py-1">
              <Badge variant="warning" className="text-[10px]">Bare repository</Badge>
            </div>
          )}
        </div>
      </div>

      {/* User identity */}
      <div>
        <SectionHeader
          icon={<User className="h-3.5 w-3.5" />}
          title="Identité"
        />
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="w-20 shrink-0 text-muted-foreground">Nom (local)</span>
            <EditableField
              value={repoConfig.userName || ''}
              placeholder={repoConfig.globalUserName || 'Non défini'}
              onSave={async (v) => {
                if (v) await gitIpc.setConfig(repo.path, 'user.name', v)
                else await gitIpc.unsetConfig(repo.path, 'user.name')
                refresh()
              }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span className="w-20 shrink-0 text-muted-foreground">Email (local)</span>
            <EditableField
              value={repoConfig.userEmail || ''}
              placeholder={repoConfig.globalUserEmail || 'Non défini'}
              onSave={async (v) => {
                if (v) await gitIpc.setConfig(repo.path, 'user.email', v)
                else await gitIpc.unsetConfig(repo.path, 'user.email')
                refresh()
              }}
            />
          </div>
          {(repoConfig.globalUserName || repoConfig.globalUserEmail) && (
            <div className="mt-1 border-t border-border pt-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Global (fallback)</div>
              {repoConfig.globalUserName && (
                <div className="flex items-center gap-2 px-2 py-0.5 text-xs text-muted-foreground">
                  <User className="h-2.5 w-2.5" />
                  <span>{repoConfig.globalUserName}</span>
                </div>
              )}
              {repoConfig.globalUserEmail && (
                <div className="flex items-center gap-2 px-2 py-0.5 text-xs text-muted-foreground">
                  <Mail className="h-2.5 w-2.5" />
                  <span>{repoConfig.globalUserEmail}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Remotes */}
      <div>
        <SectionHeader
          icon={<Globe className="h-3.5 w-3.5" />}
          title="Remotes"
          badge={repoConfig.remotes.length}
          action={
            !addingRemote && (
              <Button variant="ghost" size="sm" onClick={() => setAddingRemote(true)}>
                <Plus className="mr-1 h-3 w-3" />
                Ajouter
              </Button>
            )
          }
        />
        <div className="space-y-2">
          {addingRemote && (
            <AddRemoteForm
              repoPath={repo.path}
              onRefresh={refresh}
              onCancel={() => setAddingRemote(false)}
            />
          )}
          {repoConfig.remotes.map((r) => (
            <RemoteCard
              key={r.name}
              remote={r}
              repoPath={repo.path}
              onRefresh={refresh}
              allRemotes={repoConfig.remotes}
            />
          ))}
          {repoConfig.remotes.length === 0 && !addingRemote && (
            <p className="px-2 py-3 text-center text-xs italic text-muted-foreground">
              Aucun remote configuré
            </p>
          )}
        </div>
      </div>

      {/* Branch tracking */}
      <div>
        <SectionHeader
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title="Tracking des branches"
          badge={repoConfig.branches.length}
        />
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {repoConfig.branches.map((bt) => (
            <BranchTrackingRow
              key={bt.local}
              bt={bt}
              repoPath={repo.path}
              remoteBranches={repo.remoteBranches}
              onRefresh={refresh}
            />
          ))}
          {repoConfig.branches.length === 0 && (
            <p className="px-2 py-3 text-center text-xs italic text-muted-foreground">
              Aucune branche locale
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

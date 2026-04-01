import { useState, useEffect, useCallback } from 'react'
import {
  Camera, Trash2, Download, Eye, ChevronRight, Database,
  Loader2, Table2, ArrowLeft, Search, Plus
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { useConfirm } from '@shared/components/ui/confirm-dialog'
import { toast } from '@shared/components/ui/toast'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { SnapshotMetadata, SnapshotData, DbConnectionEntry } from '@shared/types'
import { RestoreWizard } from './RestoreWizard'

export function SnapshotManager() {
  const {
    profiles, activeProfileId, snapshots, snapshotsLoaded,
    snapshotCreating, snapshotProgress, loadSnapshots,
    createSnapshot, deleteSnapshot, getSnapshot, setView,
    schemas, activeConnectionId, connectionStates
  } = useDbExplorerStore()

  const { confirm, dialog } = useConfirm()

  const [inspecting, setInspecting] = useState<SnapshotData | null>(null)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [restoreSnapshotId, setRestoreSnapshotId] = useState<string | null>(null)

  useEffect(() => {
    if (!snapshotsLoaded) loadSnapshots()
  }, [snapshotsLoaded, loadSnapshots])

  const profile = profiles.find((p) => p.id === activeProfileId)
  const activeConnection = profile?.connections.find((c) => c.id === activeConnectionId) ?? null

  const filteredSnapshots = snapshots.filter((s) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return s.name.toLowerCase().includes(q) ||
      s.database.toLowerCase().includes(q) ||
      s.connectionName.toLowerCase().includes(q)
  })

  const handleInspect = useCallback(async (snap: SnapshotMetadata) => {
    setInspectLoading(true)
    const data = await getSnapshot(snap.id)
    setInspecting(data)
    setInspectLoading(false)
  }, [getSnapshot])

  const handleDelete = useCallback(async (snap: SnapshotMetadata) => {
    const ok = await confirm({
      title: 'Supprimer le snapshot',
      description: `Supprimer "${snap.name}" ? Cette action est irréversible.`,
      variant: 'destructive',
      confirmLabel: 'Supprimer'
    })
    if (ok) {
      const success = await deleteSnapshot(snap.id)
      if (success) toast.success('Snapshot supprimé')
      else toast.error('Erreur lors de la suppression')
    }
  }, [confirm, deleteSnapshot])

  // Restore wizard
  if (restoreSnapshotId) {
    return (
      <RestoreWizard
        snapshotId={restoreSnapshotId}
        onClose={() => setRestoreSnapshotId(null)}
      />
    )
  }

  // Inspect view
  if (inspecting) {
    return <SnapshotInspector data={inspecting} onBack={() => setInspecting(null)} />
  }

  return (
    <div className="flex h-full flex-col">
      {dialog}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('explorer')}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Camera className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Snapshots</span>
          <Badge variant="secondary">{snapshots.length}</Badge>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreateForm(true)}
          disabled={!activeConnection || snapshotCreating}
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau snapshot
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && activeConnection && profile && (
        <CreateSnapshotForm
          connection={activeConnection}
          profile={profile}
          creating={snapshotCreating}
          progress={snapshotProgress}
          onClose={() => setShowCreateForm(false)}
        />
      )}

      {/* Filter */}
      <div className="border-b border-border px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer les snapshots..."
            className="w-full rounded-md border border-border bg-muted/30 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary/40"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {!snapshotsLoaded ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSnapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Camera className="mb-3 h-8 w-8 opacity-30" />
            <p className="text-sm">{filter ? 'Aucun snapshot trouvé' : 'Aucun snapshot'}</p>
            <p className="mt-1 text-xs">Créez un snapshot pour sauvegarder l'état de vos données</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSnapshots.map((snap) => (
              <SnapshotCard
                key={snap.id}
                snapshot={snap}
                onInspect={() => handleInspect(snap)}
                onDelete={() => handleDelete(snap)}
                onRestore={() => setRestoreSnapshotId(snap.id)}
                inspectLoading={inspectLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Form ────────────────────────────────────────────────────────────

function CreateSnapshotForm({ connection, profile, creating, progress, onClose }: {
  connection: DbConnectionEntry
  profile: { id: string; name: string; connections: DbConnectionEntry[] }
  creating: boolean
  progress: { table: string; done: number; total: number } | null
  onClose: () => void
}) {
  const { createSnapshot, schemas } = useDbExplorerStore()
  const [name, setName] = useState(`${connection.database} — ${new Date().toLocaleDateString('fr-FR')}`)
  const [mode, setMode] = useState<'full' | 'selection'>('full')
  const [selectedTables, setSelectedTables] = useState<{ schema: string; table: string }[]>([])

  const connSchemas = schemas[connection.id]

  const allTables = connSchemas?.schemas.flatMap((s) =>
    s.tables.filter((t) => t.type === 'table').map((t) => ({ schema: s.name, table: t.name }))
  ) ?? []

  const toggleTable = (schema: string, table: string) => {
    setSelectedTables((prev) => {
      const exists = prev.some((t) => t.schema === schema && t.table === table)
      if (exists) return prev.filter((t) => !(t.schema === schema && t.table === table))
      return [...prev, { schema, table }]
    })
  }

  const handleCreate = async () => {
    const result = await createSnapshot({
      name,
      profileId: profile.id,
      profileName: profile.name,
      connectionId: connection.id,
      connectionName: connection.name,
      connection,
      selectedTables: mode === 'selection' ? selectedTables : undefined
    })
    if (result) {
      toast.success(`Snapshot "${result.name}" créé (${result.totalRows} rows)`)
      onClose()
    } else {
      toast.error('Erreur lors de la création du snapshot')
    }
  }

  return (
    <div className="border-b border-border bg-card/50 p-4">
      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Nom du snapshot</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
          />
        </div>

        {/* Mode */}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Portée</label>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('full')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'full' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              Base complète
            </button>
            <button
              onClick={() => setMode('selection')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'selection' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              Sélection de tables
            </button>
          </div>
        </div>

        {/* Table selection */}
        {mode === 'selection' && (
          <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
            {allTables.length === 0 ? (
              <p className="text-xs text-muted-foreground">Chargement des tables...</p>
            ) : (
              <div className="space-y-0.5">
                {allTables.map((t) => {
                  const checked = selectedTables.some((s) => s.schema === t.schema && s.table === t.table)
                  return (
                    <label
                      key={`${t.schema}.${t.table}`}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTable(t.schema, t.table)}
                        className="accent-primary"
                      />
                      <span className="text-muted-foreground">{t.schema}.</span>
                      <span>{t.table}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        {creating && progress && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Table {progress.done + 1}/{progress.total} : {progress.table}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress.total > 0 ? ((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={creating}>
            Annuler
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating || !name.trim() || (mode === 'selection' && selectedTables.length === 0)}
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {creating ? 'Création...' : 'Créer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Snapshot Card ───────────────────────────────────────────────────────────

function SnapshotCard({ snapshot, onInspect, onDelete, onRestore, inspectLoading }: {
  snapshot: SnapshotMetadata
  onInspect: () => void
  onDelete: () => void
  onRestore: () => void
  inspectLoading: boolean
}) {
  const date = new Date(snapshot.createdAt)
  const formatted = date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }) + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-border-hi">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Camera className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-medium">{snapshot.name}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              {snapshot.database}
            </span>
            <span>·</span>
            <span>{snapshot.connectionName}</span>
            <span>·</span>
            <span>{formatted}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              {snapshot.tables.length} table{snapshot.tables.length > 1 ? 's' : ''}
            </Badge>
            <Badge variant="muted">
              {snapshot.totalRows.toLocaleString('fr-FR')} rows
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" onClick={onInspect} title="Inspecter">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="green" size="sm" onClick={onRestore} title="Restaurer">
            <Download className="h-3.5 w-3.5" />
            Restore
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="Supprimer">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Snapshot Inspector ─────────────────────────────────────────────────────

function SnapshotInspector({ data, onBack }: { data: SnapshotData; onBack: () => void }) {
  const [expandedTable, setExpandedTable] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Eye className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{data.metadata.name}</span>
        <Badge variant="secondary">{data.metadata.totalRows.toLocaleString('fr-FR')} rows</Badge>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {data.tables.map((t) => {
            const key = `${t.schema}.${t.table}`
            const expanded = expandedTable === key
            return (
              <div key={key}>
                <button
                  onClick={() => setExpandedTable(expanded ? null : key)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted/40"
                >
                  <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
                  <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{t.schema}.</span>
                  <span className="font-medium">{t.table}</span>
                  <Badge variant="muted" className="ml-auto">{t.rowCount} rows</Badge>
                  <Badge variant="secondary">{t.columns.length} cols</Badge>
                </button>
                {expanded && (
                  <div className="ml-8 mt-1 rounded-lg border border-border bg-card/50 p-3">
                    {/* Columns */}
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Colonnes</div>
                    <div className="space-y-0.5">
                      {t.columns.map((col) => (
                        <div key={col.name} className="flex items-center gap-2 text-xs">
                          {col.isPrimaryKey && <span className="text-warning">PK</span>}
                          <span className="font-medium">{col.name}</span>
                          <span className="text-muted-foreground">{col.type}</span>
                          {col.nullable && <span className="text-muted-foreground/60">nullable</span>}
                        </div>
                      ))}
                    </div>
                    {/* Sample rows */}
                    {t.rows.length > 0 && (
                      <>
                        <div className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Aperçu ({Math.min(5, t.rows.length)} / {t.rowCount} rows)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="border-b border-border">
                                {t.columns.map((col) => (
                                  <th key={col.name} className="px-2 py-1 text-left font-medium text-muted-foreground">
                                    {col.name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {t.rows.slice(0, 5).map((row, i) => (
                                <tr key={i} className="border-b border-border/50">
                                  {t.columns.map((col) => (
                                    <td key={col.name} className="max-w-[200px] truncate px-2 py-1">
                                      {row[col.name] === null
                                        ? <span className="italic text-muted-foreground/50">NULL</span>
                                        : typeof row[col.name] === 'object'
                                          ? JSON.stringify(row[col.name])
                                          : String(row[col.name])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

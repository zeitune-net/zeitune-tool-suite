import { useState, useEffect, useCallback } from 'react'
import {
  Package, Trash2, Play, Loader2, Plus, Search,
  ArrowLeft, Database, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { useConfirm } from '@shared/components/ui/confirm-dialog'
import { toast } from '@shared/components/ui/toast'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { DataSet, DataSetStatus, DbConnectionEntry } from '@shared/types'

export function DataSetManager() {
  const {
    profiles, activeProfileId, datasets, datasetsLoaded,
    loadDatasets, saveDataset, deleteDataset, checkDatasetStatus,
    snapshots, snapshotsLoaded, loadSnapshots, pipelines, pipelinesLoaded, loadPipelines,
    activeConnectionId, connectionStates, executeRestore, getSnapshot,
    restoreRunning
  } = useDbExplorerStore()

  const { confirm, dialog } = useConfirm()
  const [filter, setFilter] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [statusCache, setStatusCache] = useState<Record<string, DataSetStatus>>({})

  useEffect(() => {
    if (!datasetsLoaded) loadDatasets()
    if (!snapshotsLoaded) loadSnapshots()
    if (!pipelinesLoaded) loadPipelines()
  }, [datasetsLoaded, loadDatasets, snapshotsLoaded, loadSnapshots, pipelinesLoaded, loadPipelines])

  const profile = profiles.find((p) => p.id === activeProfileId)
  const activeConnection = profile?.connections.find((c) => c.id === activeConnectionId) ?? null

  const profileDatasets = datasets.filter((d) => d.profileId === activeProfileId)
  const filteredDatasets = profileDatasets.filter((d) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q)
  })

  const handleDelete = useCallback(async (ds: DataSet) => {
    const ok = await confirm({
      title: 'Supprimer le data set',
      description: `Supprimer "${ds.name}" ? Le snapshot et le pipeline associés ne seront pas supprimés.`,
      variant: 'destructive',
      confirmLabel: 'Supprimer'
    })
    if (ok) {
      const success = await deleteDataset(ds.id)
      if (success) toast.success('Data set supprimé')
      else toast.error('Erreur lors de la suppression')
    }
  }, [confirm, deleteDataset])

  const handleQuickApply = useCallback(async (ds: DataSet) => {
    if (!activeConnection) {
      toast.error('Aucune connexion active')
      return
    }

    // Check status first
    const status = await checkDatasetStatus(ds.id, activeConnection)
    if (!status.snapshotExists) {
      toast.error('Le snapshot source a été supprimé')
      return
    }

    const warnings = status.warnings.length > 0
      ? `\n\nAvertissements :\n${status.warnings.map((w) => `• ${w}`).join('\n')}`
      : ''

    const ok = await confirm({
      title: 'Quick Apply',
      description: `Restaurer "${ds.name}" sur ${activeConnection.database} ?${warnings}`,
      confirmLabel: 'Restaurer'
    })
    if (!ok) return

    // Load pipeline if specified
    let pipeline = null
    if (ds.pipelineId) {
      const p = pipelines.find((pl) => pl.id === ds.pipelineId)
      if (p) pipeline = p
    }

    const snapshot = await getSnapshot(ds.snapshotId)
    if (!snapshot) {
      toast.error('Impossible de charger le snapshot')
      return
    }

    const success = await executeRestore({
      snapshotId: ds.snapshotId,
      targetConnection: activeConnection,
      conflictStrategy: ds.conflictStrategy,
      resetSequences: ds.resetSequences,
      pipeline
    })

    if (success) {
      toast.success(`Data set "${ds.name}" restauré avec succès`)
    } else {
      toast.error('Erreur lors de la restauration')
    }
  }, [activeConnection, checkDatasetStatus, confirm, pipelines, getSnapshot, executeRestore])

  return (
    <div className="flex h-full flex-col">
      {dialog}

      {/* Create form */}
      {showCreateForm && profile && (
        <CreateDataSetForm
          profileId={profile.id}
          snapshots={snapshots}
          pipelines={pipelines}
          onClose={() => setShowCreateForm(false)}
        />
      )}

      {/* Header with create button */}
      <div className="flex items-center justify-between px-4 py-2">
        <Button
          size="sm"
          onClick={() => setShowCreateForm(true)}
          disabled={snapshots.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau data set
        </Button>
      </div>

      {/* Filter */}
      <div className="border-b border-border px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer les data sets..."
            className="w-full rounded-md border border-border bg-muted/30 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary/40"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {!datasetsLoaded ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="mb-3 h-8 w-8 opacity-30" />
            <p className="text-sm">{filter ? 'Aucun data set trouvé' : 'Aucun data set'}</p>
            <p className="mt-1 text-xs">Créez un data set pour restaurer vos données en un clic</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDatasets.map((ds) => {
              const snapshot = snapshots.find((s) => s.id === ds.snapshotId)
              const pipeline = ds.pipelineId ? pipelines.find((p) => p.id === ds.pipelineId) : null
              return (
                <DataSetCard
                  key={ds.id}
                  dataset={ds}
                  snapshotName={snapshot?.name}
                  pipelineName={pipeline?.name}
                  onQuickApply={() => handleQuickApply(ds)}
                  onDelete={() => handleDelete(ds)}
                  restoreRunning={restoreRunning}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Form ────────────────────────────────────────────────────────────

function CreateDataSetForm({ profileId, snapshots, pipelines, onClose }: {
  profileId: string
  snapshots: { id: string; name: string; database: string }[]
  pipelines: { id: string; name: string }[]
  onClose: () => void
}) {
  const { saveDataset } = useDbExplorerStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [snapshotId, setSnapshotId] = useState(snapshots[0]?.id ?? '')
  const [pipelineId, setPipelineId] = useState('')
  const [conflictStrategy, setConflictStrategy] = useState<'upsert' | 'skip' | 'replace' | 'fail'>('upsert')
  const [resetSequences, setResetSequences] = useState(true)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    setSaving(true)
    const dataset: DataSet = {
      id: `ds-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      description: description.trim() || undefined,
      profileId,
      snapshotId,
      pipelineId: pipelineId || undefined,
      conflictStrategy,
      resetSequences,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const saved = await saveDataset(dataset)
    setSaving(false)
    if (saved) {
      toast.success(`Data set "${saved.name}" créé`)
      onClose()
    } else {
      toast.error('Erreur lors de la création')
    }
  }

  return (
    <div className="border-b border-border bg-card/50 p-4">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Nom</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
            placeholder="Zeitune - jeu minimal"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Description (optionnelle)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
            placeholder="Données minimales pour le dev local"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Snapshot source</label>
          <select
            value={snapshotId}
            onChange={(e) => setSnapshotId(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
          >
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.database})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Pipeline (optionnel)</label>
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
          >
            <option value="">Aucun (données brutes)</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Stratégie de conflit</label>
          <select
            value={conflictStrategy}
            onChange={(e) => setConflictStrategy(e.target.value as typeof conflictStrategy)}
            className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
          >
            <option value="upsert">Upsert</option>
            <option value="skip">Skip</option>
            <option value="replace">Replace</option>
            <option value="fail">Fail</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={resetSequences}
            onChange={(e) => setResetSequences(e.target.checked)}
            className="accent-primary"
          />
          Reset des séquences
        </label>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim() || !snapshotId}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Créer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Data Set Card ──────────────────────────────────────────────────────────

function DataSetCard({ dataset, snapshotName, pipelineName, onQuickApply, onDelete, restoreRunning }: {
  dataset: DataSet
  snapshotName?: string
  pipelineName?: string | null
  onQuickApply: () => void
  onDelete: () => void
  restoreRunning: boolean
}) {
  const date = new Date(dataset.updatedAt)
  const formatted = date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })

  return (
    <div className="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-border-hi">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-special" />
            <span className="text-sm font-medium">{dataset.name}</span>
          </div>
          {dataset.description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{dataset.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              {snapshotName ?? 'Snapshot inconnu'}
            </span>
            {pipelineName && (
              <>
                <span>·</span>
                <span>Pipeline: {pipelineName}</span>
              </>
            )}
            <span>·</span>
            <span>{formatted}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{dataset.conflictStrategy}</Badge>
            {dataset.resetSequences && <Badge variant="muted">seq reset</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="green"
            size="sm"
            onClick={onQuickApply}
            disabled={restoreRunning}
            title="Quick Apply"
          >
            <Play className="h-3.5 w-3.5" />
            Quick Apply
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="Supprimer">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  )
}

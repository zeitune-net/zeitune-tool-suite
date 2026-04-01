import { useState, useEffect } from 'react'
import {
  ArrowLeft, ArrowRight, Download, Loader2, CheckCircle2,
  XCircle, Database, Table2, AlertTriangle
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { toast } from '@shared/components/ui/toast'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { SnapshotData, RestoreConflictStrategy, DbConnectionEntry } from '@shared/types'

type WizardStep = 'select' | 'options' | 'execute'

export function RestoreWizard({ snapshotId, onClose }: {
  snapshotId: string
  onClose: () => void
}) {
  const {
    profiles, activeProfileId, getSnapshot,
    executeRestore, restoreRunning, restoreProgress, connectionStates
  } = useDbExplorerStore()

  const [step, setStep] = useState<WizardStep>('select')
  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null)
  const [loading, setLoading] = useState(true)

  // Options state
  const [targetConnectionId, setTargetConnectionId] = useState<string | null>(null)
  const [conflictStrategy, setConflictStrategy] = useState<RestoreConflictStrategy>('upsert')
  const [resetSequences, setResetSequences] = useState(true)
  const [selectedTables, setSelectedTables] = useState<{ schema: string; table: string }[]>([])
  const [selectAllTables, setSelectAllTables] = useState(true)

  // Load snapshot
  useEffect(() => {
    (async () => {
      setLoading(true)
      const data = await getSnapshot(snapshotId)
      setSnapshotData(data)
      if (data) {
        setSelectedTables(data.tables.map((t) => ({ schema: t.schema, table: t.table })))
      }
      setLoading(false)
    })()
  }, [snapshotId, getSnapshot])

  const profile = profiles.find((p) => p.id === activeProfileId)
  const allConnections = profile?.connections ?? []
  const connectedConnections = allConnections.filter((c) =>
    connectionStates[c.id]?.status === 'connected'
  )
  const targetConnection = allConnections.find((c) => c.id === targetConnectionId) ?? null

  const toggleTable = (schema: string, table: string) => {
    setSelectedTables((prev) => {
      const exists = prev.some((t) => t.schema === schema && t.table === table)
      if (exists) {
        setSelectAllTables(false)
        return prev.filter((t) => !(t.schema === schema && t.table === table))
      }
      const next = [...prev, { schema, table }]
      if (snapshotData && next.length === snapshotData.tables.length) setSelectAllTables(true)
      return next
    })
  }

  const toggleAll = () => {
    if (selectAllTables) {
      setSelectedTables([])
      setSelectAllTables(false)
    } else {
      setSelectedTables(snapshotData?.tables.map((t) => ({ schema: t.schema, table: t.table })) ?? [])
      setSelectAllTables(true)
    }
  }

  const handleRestore = async () => {
    if (!targetConnection || !snapshotData) return
    setStep('execute')
    const success = await executeRestore({
      snapshotId,
      targetConnection,
      conflictStrategy,
      selectedTables: selectAllTables ? undefined : selectedTables,
      resetSequences
    })
    if (success) {
      toast.success(`Restore terminé — ${restoreProgress?.rowsInserted ?? 0} rows insérées`)
    } else {
      toast.error(`Erreur restore : ${restoreProgress?.error ?? 'Erreur inconnue'}`)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!snapshotData) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <XCircle className="h-8 w-8" />
        <p className="text-sm">Snapshot introuvable</p>
        <Button variant="ghost" size="sm" onClick={onClose}>Retour</Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={restoreRunning}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Download className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Restaurer — {snapshotData.metadata.name}</span>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        {(['select', 'options', 'execute'] as WizardStep[]).map((s, i) => {
          const labels = ['Cible', 'Options', 'Exécution']
          const isCurrent = step === s
          const isDone = (step === 'options' && i === 0) || (step === 'execute' && i < 2)
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
              <span className={cn(
                'text-xs font-medium',
                isCurrent ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {labels[i]}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-4">
        {step === 'select' && (
          <StepSelect
            connections={allConnections}
            connectedConnections={connectedConnections}
            targetConnectionId={targetConnectionId}
            onSelect={setTargetConnectionId}
            connectionStates={connectionStates}
            snapshotData={snapshotData}
          />
        )}
        {step === 'options' && (
          <StepOptions
            snapshotData={snapshotData}
            conflictStrategy={conflictStrategy}
            setConflictStrategy={setConflictStrategy}
            resetSequences={resetSequences}
            setResetSequences={setResetSequences}
            selectedTables={selectedTables}
            selectAllTables={selectAllTables}
            toggleTable={toggleTable}
            toggleAll={toggleAll}
          />
        )}
        {step === 'execute' && (
          <StepExecute
            restoreRunning={restoreRunning}
            restoreProgress={restoreProgress}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (step === 'options') setStep('select')
            else onClose()
          }}
          disabled={restoreRunning}
        >
          {step === 'select' ? 'Annuler' : 'Précédent'}
        </Button>
        {step === 'select' && (
          <Button
            size="sm"
            onClick={() => setStep('options')}
            disabled={!targetConnectionId}
          >
            Suivant
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
        {step === 'options' && (
          <Button
            size="sm"
            onClick={handleRestore}
            disabled={selectedTables.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Restaurer
          </Button>
        )}
        {step === 'execute' && !restoreRunning && (
          <Button size="sm" onClick={onClose}>
            Fermer
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Step: Select Target ────────────────────────────────────────────────────

function StepSelect({ connections, connectedConnections, targetConnectionId, onSelect, connectionStates, snapshotData }: {
  connections: DbConnectionEntry[]
  connectedConnections: DbConnectionEntry[]
  targetConnectionId: string | null
  onSelect: (id: string) => void
  connectionStates: Record<string, { status: string }>
  snapshotData: SnapshotData
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Source</h3>
        <div className="mt-2 rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center gap-2 text-xs">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{snapshotData.metadata.database}</span>
            <span className="text-muted-foreground">({snapshotData.metadata.connectionName})</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {snapshotData.metadata.tables.length} tables · {snapshotData.metadata.totalRows.toLocaleString('fr-FR')} rows
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Connexion cible</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sélectionnez la base de données de destination
        </p>
        <div className="mt-2 space-y-1">
          {connections.map((conn) => {
            const status = connectionStates[conn.id]?.status
            const isConnected = status === 'connected'
            const isSelected = targetConnectionId === conn.id
            return (
              <button
                key={conn.id}
                onClick={() => isConnected && onSelect(conn.id)}
                disabled={!isConnected}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : isConnected
                      ? 'border-border hover:border-border-hi hover:bg-muted/30'
                      : 'border-border/50 opacity-50'
                )}
              >
                <div className={cn(
                  'h-2 w-2 rounded-full',
                  isConnected ? 'bg-primary' : 'bg-muted-foreground/30'
                )} />
                <div className="flex-1">
                  <span className="font-medium">{conn.name}</span>
                  <span className="ml-2 text-muted-foreground">{conn.database}</span>
                </div>
                <span className="text-muted-foreground">{conn.host}:{conn.port}</span>
                {!isConnected && <Badge variant="muted">Déconnecté</Badge>}
              </button>
            )
          })}
        </div>
        {connectedConnections.length === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            Aucune connexion active. Connectez-vous d'abord à une base.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step: Options ──────────────────────────────────────────────────────────

function StepOptions({ snapshotData, conflictStrategy, setConflictStrategy, resetSequences, setResetSequences, selectedTables, selectAllTables, toggleTable, toggleAll }: {
  snapshotData: SnapshotData
  conflictStrategy: RestoreConflictStrategy
  setConflictStrategy: (s: RestoreConflictStrategy) => void
  resetSequences: boolean
  setResetSequences: (v: boolean) => void
  selectedTables: { schema: string; table: string }[]
  selectAllTables: boolean
  toggleTable: (schema: string, table: string) => void
  toggleAll: () => void
}) {
  const strategies: { value: RestoreConflictStrategy; label: string; desc: string }[] = [
    { value: 'upsert', label: 'Upsert', desc: 'INSERT ou UPDATE si la PK existe déjà' },
    { value: 'skip', label: 'Skip', desc: 'Ignorer les doublons (ON CONFLICT DO NOTHING)' },
    { value: 'replace', label: 'Replace', desc: 'DELETE tout puis INSERT (écrase les données)' },
    { value: 'fail', label: 'Fail', desc: 'Arrêter à la première erreur de contrainte' }
  ]

  return (
    <div className="space-y-5">
      {/* Conflict strategy */}
      <div>
        <h3 className="text-sm font-semibold">Stratégie de conflit</h3>
        <div className="mt-2 space-y-1">
          {strategies.map((s) => (
            <label
              key={s.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                conflictStrategy === s.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border-hi'
              )}
            >
              <input
                type="radio"
                name="strategy"
                checked={conflictStrategy === s.value}
                onChange={() => setConflictStrategy(s.value)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <span className="text-xs font-medium">{s.label}</span>
                <p className="text-[11px] text-muted-foreground">{s.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Reset sequences */}
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:border-border-hi">
        <input
          type="checkbox"
          checked={resetSequences}
          onChange={(e) => setResetSequences(e.target.checked)}
          className="accent-primary"
        />
        <div>
          <span className="text-xs font-medium">Reset des séquences</span>
          <p className="text-[11px] text-muted-foreground">Remet les séquences au MAX(id) + 1 après import</p>
        </div>
      </label>

      {/* Table selection */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Tables à restaurer</h3>
          <button onClick={toggleAll} className="text-[11px] text-primary hover:underline">
            {selectAllTables ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>
        <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-card/50 p-2">
          {snapshotData.tables.map((t) => {
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
                <Table2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">{t.schema}.</span>
                <span className="font-medium">{t.table}</span>
                <Badge variant="muted" className="ml-auto">{t.rowCount} rows</Badge>
              </label>
            )
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {selectedTables.length} / {snapshotData.tables.length} tables sélectionnées
        </p>
      </div>
    </div>
  )
}

// ── Step: Execute ──────────────────────────────────────────────────────────

function StepExecute({ restoreRunning, restoreProgress }: {
  restoreRunning: boolean
  restoreProgress: { phase: string; currentTable?: string; tablesTotal: number; tablesDone: number; rowsInserted: number; error?: string } | null
}) {
  if (!restoreProgress) return null

  const percent = restoreProgress.tablesTotal > 0
    ? Math.round((restoreProgress.tablesDone / restoreProgress.tablesTotal) * 100)
    : 0

  const phaseLabels: Record<string, string> = {
    preparing: 'Préparation...',
    restoring: 'Restauration en cours...',
    sequences: 'Reset des séquences...',
    done: 'Terminé',
    error: 'Erreur'
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {restoreProgress.phase === 'done' ? (
        <>
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <h3 className="mt-4 text-sm font-semibold">Restore terminé</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {restoreProgress.rowsInserted.toLocaleString('fr-FR')} rows insérées dans {restoreProgress.tablesDone} tables
          </p>
        </>
      ) : restoreProgress.phase === 'error' ? (
        <>
          <XCircle className="h-12 w-12 text-destructive" />
          <h3 className="mt-4 text-sm font-semibold text-destructive">Erreur</h3>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            {restoreProgress.error}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Rollback effectué — aucune donnée n'a été modifiée
          </p>
        </>
      ) : (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <h3 className="mt-4 text-sm font-semibold">
            {phaseLabels[restoreProgress.phase] ?? restoreProgress.phase}
          </h3>
          {restoreProgress.currentTable && (
            <p className="mt-1 text-xs text-muted-foreground">
              Table : {restoreProgress.currentTable}
            </p>
          )}
          <div className="mt-4 w-64">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{restoreProgress.tablesDone}/{restoreProgress.tablesTotal} tables</span>
              <span>{restoreProgress.rowsInserted.toLocaleString('fr-FR')} rows</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

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
import { StepSchemaDiff } from './StepSchemaDiff'
import { StepTransformEditor } from './StepTransformEditor'
import type {
  SnapshotData, RestoreConflictStrategy, DbConnectionEntry,
  TransformPipeline, SchemaDiffResult, TableTransform, ColumnMapping
} from '@shared/types'

type WizardStep = 'select' | 'schema-diff' | 'transform' | 'options' | 'execute'

const STEP_LABELS: Record<WizardStep, string> = {
  'select': 'Cible',
  'schema-diff': 'Schema',
  'transform': 'Transformations',
  'options': 'Options',
  'execute': 'Exécution'
}

const STEPS: WizardStep[] = ['select', 'schema-diff', 'transform', 'options', 'execute']

export function RestoreWizard({ snapshotId, onClose }: {
  snapshotId: string
  onClose: () => void
}) {
  const {
    profiles, activeProfileId, getSnapshot,
    executeRestore, restoreRunning, restoreProgress, connectionStates,
    computeSchemaDiff, schemaDiff, schemaDiffLoading,
    currentPipeline, setCurrentPipeline
  } = useDbExplorerStore()

  const [step, setStep] = useState<WizardStep>('select')
  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null)
  const [loading, setLoading] = useState(true)

  // Options state
  const [targetConnectionId, setTargetConnectionId] = useState<string | null>(null)
  const [conflictStrategy, setConflictStrategy] = useState<RestoreConflictStrategy>('upsert')
  const [resetSequences, setResetSequences] = useState(true)

  // Load snapshot
  useEffect(() => {
    (async () => {
      setLoading(true)
      const data = await getSnapshot(snapshotId)
      setSnapshotData(data)
      setLoading(false)
    })()
  }, [snapshotId, getSnapshot])

  const profile = profiles.find((p) => p.id === activeProfileId)
  const allConnections = profile?.connections ?? []
  const connectedConnections = allConnections.filter((c) =>
    connectionStates[c.id]?.status === 'connected'
  )
  const targetConnection = allConnections.find((c) => c.id === targetConnectionId) ?? null

  // Generate initial pipeline from schema diff
  const generatePipelineFromDiff = (diffResult: SchemaDiffResult): TransformPipeline => {
    const tableTransforms: TableTransform[] = diffResult.tables
      .filter((t) => t.status !== 'added') // skip live-only tables
      .map((t) => {
        const mappings: ColumnMapping[] = []
        const defaultValues: Record<string, string> = {}

        for (const col of t.columns) {
          if (col.status === 'identical' && col.snapshotColumn && col.liveColumn) {
            mappings.push({ sourceColumn: col.snapshotColumn.name, targetColumn: col.liveColumn.name })
          } else if (col.status === 'renamed' && col.snapshotColumn && col.liveColumn) {
            mappings.push({ sourceColumn: col.snapshotColumn.name, targetColumn: col.liveColumn.name })
          } else if (col.status === 'type-changed' && col.snapshotColumn && col.liveColumn) {
            if (col.autoConvertible) {
              mappings.push({ sourceColumn: col.snapshotColumn.name, targetColumn: col.liveColumn.name })
            } else {
              mappings.push({
                sourceColumn: col.snapshotColumn.name,
                targetColumn: col.liveColumn.name,
                expression: `$source::${col.liveColumn.type}`
              })
            }
          } else if (col.status === 'added' && col.liveColumn) {
            if (col.liveColumn.defaultValue) {
              defaultValues[col.liveColumn.name] = col.liveColumn.defaultValue
            } else if (col.liveColumn.nullable) {
              defaultValues[col.liveColumn.name] = 'NULL'
            }
            // If not nullable and no default → user must provide value in transform editor
          }
          // 'removed' columns → not mapped (ignored)
        }

        return {
          sourceSchema: t.snapshotSchema,
          sourceTable: t.snapshotTable,
          targetSchema: t.liveSchema ?? t.snapshotSchema,
          targetTable: t.liveTable ?? t.snapshotTable,
          columnMappings: mappings,
          defaultValues,
          skip: t.status === 'removed'
        }
      })

    return {
      id: `pipeline-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: 'Pipeline auto-généré',
      profileId: activeProfileId ?? '',
      sourceSnapshotId: snapshotId,
      tableTransforms,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  }

  const handleGoToSchemaDiff = async () => {
    if (!snapshotData || !targetConnection) return
    setStep('schema-diff')
    const result = await computeSchemaDiff(snapshotData, targetConnection)
    if (result) {
      setCurrentPipeline(generatePipelineFromDiff(result))
    }
  }

  const handleLoadPipeline = (pipeline: TransformPipeline) => {
    setCurrentPipeline(pipeline)
  }

  const handleRestore = async () => {
    if (!targetConnection || !snapshotData) return
    setStep('execute')

    // Determine selected tables from pipeline (non-skipped tables)
    const selectedTables = currentPipeline
      ? currentPipeline.tableTransforms
          .filter((t) => !t.skip)
          .map((t) => ({ schema: t.sourceSchema, table: t.sourceTable }))
      : undefined

    const success = await executeRestore({
      snapshotId,
      targetConnection,
      conflictStrategy,
      selectedTables,
      resetSequences,
      pipeline: currentPipeline
    })
    if (success) {
      toast.success(`Restore terminé — ${restoreProgress?.rowsInserted ?? 0} rows insérées`)
    } else {
      toast.error(`Erreur restore : ${restoreProgress?.error ?? 'Erreur inconnue'}`)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  const canGoNext = () => {
    if (step === 'select') return !!targetConnectionId
    if (step === 'schema-diff') return !!schemaDiff && !schemaDiffLoading
    if (step === 'transform') return !!currentPipeline
    if (step === 'options') return true
    return false
  }

  const handleNext = () => {
    if (step === 'select') handleGoToSchemaDiff()
    else if (step === 'schema-diff') setStep('transform')
    else if (step === 'transform') setStep('options')
    else if (step === 'options') handleRestore()
  }

  const handleBack = () => {
    if (stepIndex > 0 && step !== 'execute') {
      setStep(STEPS[stepIndex - 1])
    } else {
      onClose()
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
        {STEPS.map((s, i) => {
          const isCurrent = step === s
          const isDone = stepIndex > i
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
              <span className={cn(
                'text-xs font-medium',
                isCurrent ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {STEP_LABELS[s]}
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
        {step === 'schema-diff' && (
          <StepSchemaDiff
            diff={schemaDiff}
            loading={schemaDiffLoading}
            onLoadPipeline={handleLoadPipeline}
          />
        )}
        {step === 'transform' && currentPipeline && schemaDiff && (
          <StepTransformEditor
            pipeline={currentPipeline}
            schemaDiff={schemaDiff}
          />
        )}
        {step === 'options' && (
          <StepOptions
            conflictStrategy={conflictStrategy}
            setConflictStrategy={setConflictStrategy}
            resetSequences={resetSequences}
            setResetSequences={setResetSequences}
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
          onClick={handleBack}
          disabled={restoreRunning}
        >
          {stepIndex === 0 ? 'Annuler' : 'Précédent'}
        </Button>
        {step !== 'execute' && (
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canGoNext()}
          >
            {step === 'options' ? (
              <>
                <Download className="h-3.5 w-3.5" />
                Restaurer
              </>
            ) : (
              <>
                Suivant
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
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

function StepOptions({ conflictStrategy, setConflictStrategy, resetSequences, setResetSequences }: {
  conflictStrategy: RestoreConflictStrategy
  setConflictStrategy: (s: RestoreConflictStrategy) => void
  resetSequences: boolean
  setResetSequences: (v: boolean) => void
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

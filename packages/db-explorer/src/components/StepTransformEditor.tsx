import { useState } from 'react'
import {
  Table2, ArrowRight, Save, SkipForward, Filter,
  CheckCircle2, AlertTriangle, XCircle, Pencil
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { toast } from '@shared/components/ui/toast'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type {
  TransformPipeline, SchemaDiffResult, TableTransform,
  ColumnMapping, TableDiff
} from '@shared/types'

export function StepTransformEditor({ pipeline, schemaDiff }: {
  pipeline: TransformPipeline
  schemaDiff: SchemaDiffResult
}) {
  const { updateTableTransform, savePipeline, setCurrentPipeline } = useDbExplorerStore()
  const [selectedTable, setSelectedTable] = useState<string | null>(
    pipeline.tableTransforms[0]
      ? `${pipeline.tableTransforms[0].sourceSchema}.${pipeline.tableTransforms[0].sourceTable}`
      : null
  )
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState(pipeline.name)
  const [saveDesc, setSaveDesc] = useState(pipeline.description ?? '')

  const selectedTransform = pipeline.tableTransforms.find(
    (t) => `${t.sourceSchema}.${t.sourceTable}` === selectedTable
  )

  const diffForTable = (t: TableTransform): TableDiff | undefined =>
    schemaDiff.tables.find(
      (d) => d.snapshotSchema === t.sourceSchema && d.snapshotTable === t.sourceTable
    )

  const handleSave = async () => {
    const toSave: TransformPipeline = {
      ...pipeline,
      name: saveName.trim() || 'Pipeline sans nom',
      description: saveDesc.trim() || undefined,
      updatedAt: Date.now()
    }
    const saved = await savePipeline(toSave)
    if (saved) {
      setCurrentPipeline(saved)
      toast.success(`Pipeline "${saved.name}" sauvegardé`)
      setShowSaveDialog(false)
    } else {
      toast.error('Erreur lors de la sauvegarde')
    }
  }

  return (
    <div className="flex gap-3" style={{ minHeight: 400 }}>
      {/* Left: table list */}
      <div className="w-56 shrink-0 space-y-1 overflow-y-auto rounded-lg border border-border bg-card/50 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tables</span>
          <Button variant="ghost" size="icon" onClick={() => setShowSaveDialog(true)} title="Sauvegarder le pipeline">
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>
        {pipeline.tableTransforms.map((t) => {
          const key = `${t.sourceSchema}.${t.sourceTable}`
          const isSelected = selectedTable === key
          const diff = diffForTable(t)
          const statusIcon = t.skip
            ? <SkipForward className="h-3 w-3 text-muted-foreground" />
            : diff?.status === 'identical'
              ? <CheckCircle2 className="h-3 w-3 text-primary" />
              : diff?.status === 'modified'
                ? <AlertTriangle className="h-3 w-3 text-warning" />
                : <XCircle className="h-3 w-3 text-destructive" />

          return (
            <button
              key={key}
              onClick={() => setSelectedTable(key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40',
                t.skip && 'opacity-50'
              )}
            >
              {statusIcon}
              <span className="truncate font-medium">{t.sourceTable}</span>
              {t.skip && <Badge variant="muted" className="ml-auto text-[9px]">Skip</Badge>}
            </button>
          )
        })}
      </div>

      {/* Right: mapping editor */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-card/50 p-3">
        {!selectedTransform ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sélectionnez une table
          </div>
        ) : (
          <TableTransformEditor
            transform={selectedTransform}
            diff={diffForTable(selectedTransform)}
            onUpdate={(updates) =>
              updateTableTransform(selectedTransform.sourceSchema, selectedTransform.sourceTable, updates)
            }
          />
        )}
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-sm font-semibold">Sauvegarder le pipeline</h3>
            <div className="mt-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Nom</label>
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
                  placeholder="Mon pipeline de transformation"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Description (optionnelle)</label>
                <input
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
                  placeholder="Transformation pour migration v2 → v3"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowSaveDialog(false)}>Annuler</Button>
              <Button size="sm" onClick={handleSave} disabled={!saveName.trim()}>
                <Save className="h-3.5 w-3.5" />
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Per-table transform editor ─────────────────────────────────────────────

function TableTransformEditor({ transform, diff, onUpdate }: {
  transform: TableTransform
  diff: TableDiff | undefined
  onUpdate: (updates: Partial<TableTransform>) => void
}) {
  const liveColumns = diff?.columns
    .filter((c) => c.liveColumn)
    .map((c) => c.liveColumn!.name) ?? []

  const addedColumns = diff?.columns
    .filter((c) => c.status === 'added' && c.liveColumn)
    .map((c) => c.liveColumn!) ?? []

  const handleMappingChange = (index: number, field: keyof ColumnMapping, value: string) => {
    const updated = transform.columnMappings.map((m, i) =>
      i === index ? { ...m, [field]: value } : m
    )
    onUpdate({ columnMappings: updated })
  }

  const handleRemoveMapping = (index: number) => {
    onUpdate({ columnMappings: transform.columnMappings.filter((_, i) => i !== index) })
  }

  const handleAddMapping = () => {
    onUpdate({
      columnMappings: [...transform.columnMappings, { sourceColumn: '', targetColumn: '' }]
    })
  }

  const handleDefaultChange = (colName: string, value: string) => {
    onUpdate({
      defaultValues: { ...transform.defaultValues, [colName]: value }
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{transform.sourceSchema}.</span>
          <span className="text-sm font-semibold">{transform.sourceTable}</span>
          {transform.targetTable !== transform.sourceTable && (
            <>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold text-info">{transform.targetTable}</span>
            </>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={transform.skip}
            onChange={(e) => onUpdate({ skip: e.target.checked })}
            className="accent-primary"
          />
          <SkipForward className="h-3 w-3" />
          Skip
        </label>
      </div>

      {transform.skip ? (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
          Cette table sera ignorée lors de la restauration
        </div>
      ) : (
        <>
          {/* Column mappings */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mappings colonnes ({transform.columnMappings.length})
              </span>
              <button onClick={handleAddMapping} className="text-[11px] text-primary hover:underline">
                + Ajouter
              </button>
            </div>
            <div className="space-y-1">
              {transform.columnMappings.map((mapping, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={mapping.sourceColumn}
                    onChange={(e) => handleMappingChange(i, 'sourceColumn', e.target.value)}
                    className="w-32 rounded border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] outline-none focus:border-primary/40"
                    placeholder="source"
                  />
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <select
                    value={mapping.targetColumn}
                    onChange={(e) => handleMappingChange(i, 'targetColumn', e.target.value)}
                    className="w-32 rounded border border-border bg-muted/30 px-2 py-1 text-[11px] outline-none focus:border-primary/40"
                  >
                    <option value="">— cible —</option>
                    {liveColumns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <input
                    value={mapping.expression ?? ''}
                    onChange={(e) => handleMappingChange(i, 'expression', e.target.value || '')}
                    className="flex-1 rounded border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] outline-none focus:border-primary/40"
                    placeholder="Expression SQL (optionnel)"
                  />
                  <button
                    onClick={() => handleRemoveMapping(i)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {transform.columnMappings.length === 0 && (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  Aucun mapping — toutes les colonnes seront ignorées
                </p>
              )}
            </div>
          </div>

          {/* Default values for added columns */}
          {addedColumns.length > 0 && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nouvelles colonnes — valeurs par défaut
              </span>
              <div className="mt-2 space-y-1">
                {addedColumns.map((col) => (
                  <div key={col.name} className="flex items-center gap-2">
                    <div className="flex w-40 items-center gap-1.5 text-xs">
                      <Pencil className="h-3 w-3 text-info" />
                      <span className="font-medium">{col.name}</span>
                      <span className="text-muted-foreground">({col.type})</span>
                    </div>
                    <input
                      value={transform.defaultValues[col.name] ?? ''}
                      onChange={(e) => handleDefaultChange(col.name, e.target.value)}
                      className="flex-1 rounded border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] outline-none focus:border-primary/40"
                      placeholder={col.nullable ? 'NULL' : col.defaultValue ?? 'Valeur requise'}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row filter */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Filtre de rows (optionnel)
              </span>
            </div>
            <input
              value={transform.rowFilter ?? ''}
              onChange={(e) => onUpdate({ rowFilter: e.target.value || undefined })}
              className="w-full rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-primary/40"
              placeholder="WHERE status = 'ACTIVE' AND created_at > '2024-01-01'"
            />
          </div>
        </>
      )}
    </div>
  )
}

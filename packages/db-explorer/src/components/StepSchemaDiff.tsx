import { useState } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronRight,
  ArrowRight, Loader2, Upload
} from 'lucide-react'
import { Badge } from '@shared/components/ui/badge'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import type {
  SchemaDiffResult, TableDiff, ColumnDiff, TransformPipeline
} from '@shared/types'
import { useDbExplorerStore } from '../store'

const STATUS_CONFIG = {
  identical: { icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10', label: 'Identique' },
  modified: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Modifiée' },
  removed: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Supprimée' },
  added: { icon: CheckCircle2, color: 'text-info', bg: 'bg-info/10', label: 'Nouvelle' },
} as const

const COL_STATUS_CONFIG = {
  identical: { color: 'text-primary', label: 'Identique' },
  added: { color: 'text-info', label: 'Ajoutée' },
  removed: { color: 'text-destructive', label: 'Supprimée' },
  renamed: { color: 'text-special', label: 'Renommée' },
  'type-changed': { color: 'text-warning', label: 'Type changé' },
} as const

export function StepSchemaDiff({ diff, loading, onLoadPipeline }: {
  diff: SchemaDiffResult | null
  loading: boolean
  onLoadPipeline: (pipeline: TransformPipeline) => void
}) {
  const { pipelines, pipelinesLoaded, loadPipelines } = useDbExplorerStore()
  const [expandedTable, setExpandedTable] = useState<string | null>(null)
  const [showPipelineDropdown, setShowPipelineDropdown] = useState(false)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Analyse du schéma en cours...</p>
      </div>
    )
  }

  if (!diff) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <XCircle className="h-8 w-8" />
        <p className="mt-3 text-sm">Impossible de calculer le diff</p>
      </div>
    )
  }

  const handleShowPipelines = async () => {
    if (!pipelinesLoaded) await loadPipelines()
    setShowPipelineDropdown(!showPipelineDropdown)
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2">
        {(['identical', 'modified', 'removed', 'added'] as const).map((status) => {
          const cfg = STATUS_CONFIG[status]
          const Icon = cfg.icon
          const count = diff.summary[status]
          return (
            <div key={status} className={cn('rounded-lg border border-border p-3 text-center', cfg.bg)}>
              <Icon className={cn('mx-auto h-5 w-5', cfg.color)} />
              <div className="mt-1 text-lg font-bold">{count}</div>
              <div className="text-[11px] text-muted-foreground">{cfg.label}{count !== 1 ? 's' : ''}</div>
            </div>
          )
        })}
      </div>

      {/* Load pipeline button */}
      <div className="relative">
        <Button variant="ghost" size="sm" onClick={handleShowPipelines}>
          <Upload className="h-3.5 w-3.5" />
          Charger un pipeline sauvegardé
        </Button>
        {showPipelineDropdown && (
          <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-border bg-card p-2 shadow-lg">
            {pipelines.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Aucun pipeline sauvegardé</p>
            ) : (
              pipelines.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onLoadPipeline(p); setShowPipelineDropdown(false) }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.description && (
                    <span className="truncate text-muted-foreground">{p.description}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Table list */}
      <div className="space-y-1">
        {diff.tables
          .filter((t) => t.status !== 'added') // hide tables only in live DB
          .sort((a, b) => {
            const order = { removed: 0, modified: 1, identical: 2, added: 3 }
            return order[a.status] - order[b.status]
          })
          .map((tableDiff) => {
            const key = `${tableDiff.snapshotSchema}.${tableDiff.snapshotTable}`
            const expanded = expandedTable === key
            const cfg = STATUS_CONFIG[tableDiff.status]
            const Icon = cfg.icon

            return (
              <div key={key}>
                <button
                  onClick={() => setExpandedTable(expanded ? null : key)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted/40"
                >
                  <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
                  <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                  <span className="text-muted-foreground">{tableDiff.snapshotSchema}.</span>
                  <span className="font-medium">{tableDiff.snapshotTable}</span>
                  {tableDiff.liveTable && tableDiff.liveTable !== tableDiff.snapshotTable && (
                    <>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-info">{tableDiff.liveTable}</span>
                    </>
                  )}
                  <Badge variant={tableDiff.status === 'identical' ? 'default' : tableDiff.status === 'modified' ? 'warning' : 'destructive'} className="ml-auto">
                    {cfg.label}
                  </Badge>
                </button>

                {expanded && tableDiff.columns.length > 0 && (
                  <ColumnDiffTable columns={tableDiff.columns} warnings={tableDiff.warnings} />
                )}

                {expanded && tableDiff.status === 'removed' && (
                  <div className="ml-8 mt-1 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Cette table n'existe plus dans la base cible. Ses données ne seront pas restaurées.
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {/* Info about added tables */}
      {diff.summary.added > 0 && (
        <div className="rounded-lg border border-info/20 bg-info/5 px-3 py-2 text-xs text-info">
          {diff.summary.added} table(s) présente(s) dans la cible mais absente(s) du snapshot (ignorée(s)).
        </div>
      )}
    </div>
  )
}

function ColumnDiffTable({ columns, warnings }: { columns: ColumnDiff[]; warnings: string[] }) {
  return (
    <div className="ml-8 mt-1 rounded-lg border border-border bg-card/50 p-3">
      {warnings.length > 0 && (
        <div className="mb-2 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-1 pr-3 font-medium">Statut</th>
            <th className="pb-1 pr-3 font-medium">Snapshot</th>
            <th className="pb-1 pr-3 font-medium">Cible</th>
            <th className="pb-1 font-medium">Détail</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => {
            const cfg = COL_STATUS_CONFIG[col.status]
            return (
              <tr key={i} className="border-b border-border/30">
                <td className={cn('py-1 pr-3 font-medium', cfg.color)}>{cfg.label}</td>
                <td className="py-1 pr-3">
                  {col.snapshotColumn ? (
                    <span>
                      <span className="font-medium">{col.snapshotColumn.name}</span>
                      <span className="ml-1 text-muted-foreground">({col.snapshotColumn.type})</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="py-1 pr-3">
                  {col.liveColumn ? (
                    <span>
                      <span className="font-medium">{col.liveColumn.name}</span>
                      <span className="ml-1 text-muted-foreground">({col.liveColumn.type})</span>
                    </span>
                  ) : '—'}
                </td>
                <td className="py-1">
                  {col.status === 'renamed' && col.confidence !== undefined && (
                    <Badge variant="secondary">confiance {Math.round(col.confidence * 100)}%</Badge>
                  )}
                  {col.status === 'type-changed' && (
                    <Badge variant={col.autoConvertible ? 'default' : 'warning'}>
                      {col.autoConvertible ? 'Auto-convertible' : 'Conversion manuelle'}
                    </Badge>
                  )}
                  {col.status === 'added' && col.liveColumn && (
                    <span className="text-muted-foreground">
                      {col.liveColumn.nullable ? 'Nullable → NULL' : col.liveColumn.defaultValue ? `Default: ${col.liveColumn.defaultValue}` : 'Valeur requise'}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

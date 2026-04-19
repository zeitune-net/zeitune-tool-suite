import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Play, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, Download, Filter, TableIcon, Pencil, Save, X, Check
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { inferColumnKind, type ColumnKind } from '@shared/lib/column-kind'
import { InsertRowDialog } from './InsertRowDialog'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry, DataBrowserFilter, FilterOperator, PageSize, ExportFormat } from '@shared/types'

const OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'ILIKE', 'NOT LIKE', 'IN', 'NOT IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL']
const PAGE_SIZES: PageSize[] = [25, 50, 100, 500]
const UNARY_OPS: FilterOperator[] = ['IS NULL', 'IS NOT NULL']
const MULTI_VALUE_PLACEHOLDER: Partial<Record<FilterOperator, string>> = {
  'IN': '1, 2, 3',
  'NOT IN': '1, 2, 3',
  'BETWEEN': 'min, max'
}

export function DataBrowser({ connection }: { connection: DbConnectionEntry }) {
  const {
    dataBrowserSchema, dataBrowserTable, dataBrowserFilters, dataBrowserSortColumn,
    dataBrowserSortDir, dataBrowserPage, dataBrowserPageSize, dataBrowserResult,
    dataBrowserLoading, dataBrowserTotalRows, setDataBrowserFilters, setDataBrowserSort,
    setDataBrowserPage, setDataBrowserPageSize, loadDataBrowserPage, exportResults,
    selectedSchema, selectedTable, setDataBrowserTarget, schemas, activeConnectionId,
    dataBrowserEditing, dataBrowserPendingChanges, setDataBrowserEditing,
    setCellValue, discardChanges, commitChanges, insertNewRow, deleteRow
  } = useDbExplorerStore()

  const [showInsertDialog, setShowInsertDialog] = useState(false)
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)

  // Get table details for PK info
  const detailKey = activeConnectionId && dataBrowserSchema && dataBrowserTable
    ? `${activeConnectionId}:${dataBrowserSchema}.${dataBrowserTable}` : null
  const tableInfo = detailKey ? useDbExplorerStore.getState().tableDetails[detailKey] : undefined
  const pkColumns = tableInfo?.primaryKey ?? []
  const canEdit = pkColumns.length > 0

  // Sync schema tree selection → data browser target
  useEffect(() => {
    if (selectedSchema && selectedTable) {
      setDataBrowserTarget(selectedSchema, selectedTable)
    }
  }, [selectedSchema, selectedTable, setDataBrowserTarget])

  // Auto-load when target/filters/sort/page changes
  useEffect(() => {
    if (dataBrowserSchema && dataBrowserTable) {
      loadDataBrowserPage(connection)
    }
  }, [dataBrowserSchema, dataBrowserTable, dataBrowserFilters, dataBrowserSortColumn, dataBrowserSortDir, dataBrowserPage, dataBrowserPageSize, connection, loadDataBrowserPage])

  // Exit edit mode when changing table
  useEffect(() => {
    setDataBrowserEditing(false)
    setEditingCell(null)
  }, [dataBrowserSchema, dataBrowserTable, setDataBrowserEditing])

  const totalPages = Math.max(1, Math.ceil(dataBrowserTotalRows / dataBrowserPageSize))

  const handleSort = (col: string) => {
    if (dataBrowserSortColumn === col) {
      setDataBrowserSort(col, dataBrowserSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setDataBrowserSort(col, 'asc')
    }
  }

  const handleExport = (format: ExportFormat) => {
    if (!dataBrowserResult?.columns) return
    const colNames = dataBrowserResult.columns.map((c) => c.name)
    const name = `${dataBrowserTable ?? 'export'}.${format}`
    exportResults(colNames, dataBrowserResult.rows, format, name)
  }

  const getRowPk = (row: Record<string, unknown>): Record<string, unknown> => {
    const pk: Record<string, unknown> = {}
    for (const col of pkColumns) {
      pk[col] = row[col]
    }
    return pk
  }

  const getRowKey = (row: Record<string, unknown>): string => {
    return JSON.stringify(getRowPk(row), (_k, v) => typeof v === 'bigint' ? v.toString() : v)
  }

  const handleCellDoubleClick = (rowIdx: number, col: string, currentValue: unknown) => {
    if (!dataBrowserEditing || !canEdit) return
    setEditingCell({ rowIdx, col })
    setEditValue(currentValue === null || currentValue === undefined ? '' : String(currentValue))
  }

  const handleCellSave = (row: Record<string, unknown>) => {
    if (!editingCell) return
    const rowKey = getRowKey(row)
    let parsedValue: unknown = editValue
    if (editValue === '' || editValue.toLowerCase() === 'null') parsedValue = null
    else if (editValue.toLowerCase() === 'true') parsedValue = true
    else if (editValue.toLowerCase() === 'false') parsedValue = false
    setCellValue(rowKey, editingCell.col, parsedValue)
    setEditingCell(null)
  }

  const handleCommit = async () => {
    setCommitError(null)
    const result = await commitChanges(connection)
    if (!result.success) {
      setCommitError(result.errors.join('; '))
    }
  }

  const handleDeleteRow = async (row: Record<string, unknown>) => {
    const pk = getRowPk(row)
    await deleteRow(connection, pk)
    setDeleteConfirm(null)
  }

  const pendingCount = Object.keys(dataBrowserPendingChanges).length

  if (!dataBrowserSchema || !dataBrowserTable) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
        <TableIcon className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">Select a table to browse data</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-card/30">
        <span className="text-xs font-medium text-foreground">
          {dataBrowserSchema}.{dataBrowserTable}
        </span>
        <span className="text-xs text-muted-foreground">
          ({dataBrowserTotalRows.toLocaleString()} rows)
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {dataBrowserEditing && (
            <>
              {pendingCount > 0 && (
                <>
                  <Button size="sm" onClick={handleCommit}>
                    <Save className="mr-1 h-3 w-3" />
                    Save ({pendingCount})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={discardChanges}>
                    Discard
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setShowInsertDialog(true)}>
                <Plus className="mr-1 h-3 w-3" />
                Add Row
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={dataBrowserEditing ? 'default' : 'ghost'}
            onClick={() => setDataBrowserEditing(!dataBrowserEditing)}
            disabled={!canEdit}
            title={canEdit ? 'Toggle edit mode' : 'No primary key — editing disabled'}
          >
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleExport('csv')} disabled={!dataBrowserResult?.rows?.length}>
            <Download className="mr-1 h-3 w-3" />
            CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleExport('json')} disabled={!dataBrowserResult?.rows?.length}>
            <Download className="mr-1 h-3 w-3" />
            JSON
          </Button>
        </div>
      </div>

      {commitError && (
        <div className="bg-destructive/10 px-4 py-2 text-xs text-destructive">{commitError}</div>
      )}

      {/* Filters */}
      <FilterBar
        filters={dataBrowserFilters}
        columns={dataBrowserResult?.columns?.map((c) => c.name) ?? []}
        onChange={setDataBrowserFilters}
        tableDetails={(() => {
          const key = activeConnectionId ? `${activeConnectionId}:${dataBrowserSchema}.${dataBrowserTable}` : null
          return key ? useDbExplorerStore.getState().tableDetails[key] : undefined
        })()}
      />

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {dataBrowserLoading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dataBrowserResult?.error ? (
          <div className="p-4">
            <div className="rounded-lg bg-destructive/10 p-4 font-mono text-sm text-destructive">
              {dataBrowserResult.error}
            </div>
          </div>
        ) : dataBrowserResult && dataBrowserResult.columns.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] text-muted-foreground font-medium w-12">#</th>
                {dataBrowserResult.columns.map((col) => (
                  <th
                    key={col.name}
                    onClick={() => handleSort(col.name)}
                    className="cursor-pointer select-none px-4 py-2.5 text-left font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <div className="flex items-center gap-1">
                      <span className="uppercase text-xs">{col.name}</span>
                      {dataBrowserSortColumn === col.name ? (
                        dataBrowserSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                ))}
                {dataBrowserEditing && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {dataBrowserResult.rows.map((row, idx) => {
                const rowKey = canEdit ? getRowKey(row) : ''
                const rowChanges = dataBrowserPendingChanges[rowKey]
                return (
                  <tr key={idx} className={cn(
                    'border-b border-border/50 transition-colors hover:bg-accent/50',
                    rowChanges && 'bg-primary/5'
                  )}>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">
                      {dataBrowserPage * dataBrowserPageSize + idx + 1}
                    </td>
                    {dataBrowserResult.columns.map((col) => {
                      const isEditing = editingCell?.rowIdx === idx && editingCell?.col === col.name
                      const hasPendingChange = rowChanges && col.name in rowChanges
                      const displayValue = hasPendingChange ? rowChanges[col.name] : row[col.name]

                      return (
                        <td
                          key={col.name}
                          onDoubleClick={() => handleCellDoubleClick(idx, col.name, displayValue)}
                          className={cn(
                            'px-4 py-2 font-mono text-xs',
                            dataBrowserEditing && canEdit && 'cursor-pointer',
                            hasPendingChange && 'border-l-2 border-l-primary'
                          )}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellSave(row)
                                  if (e.key === 'Escape') setEditingCell(null)
                                }}
                                autoFocus
                                className="h-6 w-full min-w-[60px] rounded bg-accent/30 px-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-primary/50"
                              />
                              <button onClick={() => handleCellSave(row)} className="text-primary hover:text-primary/80">
                                <Check className="h-3 w-3" />
                              </button>
                              <button onClick={() => setEditingCell(null)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <CellValue value={displayValue} />
                          )}
                        </td>
                      )
                    })}
                    {dataBrowserEditing && (
                      <td className="px-2 py-2">
                        {deleteConfirm === idx ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteRow(row)}
                              className="text-destructive hover:text-destructive/80 text-[10px] font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(idx)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">No data</div>
        )}
      </div>

      {/* Pagination */}
      <Pagination
        page={dataBrowserPage}
        pageSize={dataBrowserPageSize}
        totalRows={dataBrowserTotalRows}
        loadedRows={dataBrowserResult?.rows.length ?? 0}
        totalPages={totalPages}
        onPageChange={setDataBrowserPage}
        onPageSizeChange={setDataBrowserPageSize}
      />

      {/* Insert dialog */}
      {showInsertDialog && tableInfo && (
        <InsertRowDialog
          columns={tableInfo.columns}
          onInsert={(row) => insertNewRow(connection, row)}
          onClose={() => setShowInsertDialog(false)}
        />
      )}
    </div>
  )
}

// ── Pagination ──────────────────────────────────────────────────────────────

function Pagination({
  page, pageSize, totalRows, loadedRows, totalPages,
  onPageChange, onPageSizeChange
}: {
  page: number
  pageSize: PageSize
  totalRows: number
  loadedRows: number
  totalPages: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: PageSize) => void
}) {
  const [jumpValue, setJumpValue] = useState('')
  const fromRow = totalRows === 0 ? 0 : page * pageSize + 1
  const toRow = page * pageSize + loadedRows

  const handleJump = () => {
    const n = parseInt(jumpValue, 10)
    if (isNaN(n) || n < 1) return
    onPageChange(Math.min(totalPages, Math.max(1, n)) - 1)
    setJumpValue('')
  }

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2 bg-card/30">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            className="bg-transparent text-xs outline-none cursor-pointer text-foreground"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted-foreground">
          Showing <strong className="text-foreground">{fromRow.toLocaleString()}–{toRow.toLocaleString()}</strong> of <strong className="text-foreground">{totalRows.toLocaleString()}</strong>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          title="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          title="Previous"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs text-muted-foreground tabular-nums px-1">
          Page <strong className="text-foreground">{page + 1}</strong> / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          title="Next"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          title="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
        {totalPages > 5 && (
          <input
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJump() }}
            onBlur={handleJump}
            placeholder="Go to"
            className="ml-2 h-6 w-14 rounded bg-accent/30 px-1.5 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/50 tabular-nums"
          />
        )}
      </div>
    </div>
  )
}

// ── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  columns,
  onChange,
  tableDetails
}: {
  filters: DataBrowserFilter[]
  columns: string[]
  onChange: (filters: DataBrowserFilter[]) => void
  tableDetails?: { columns: { name: string; type: string }[] }
}) {
  const colOptions = tableDetails?.columns?.map((c) => c.name) ?? columns
  const typeByCol: Record<string, string> = {}
  for (const c of tableDetails?.columns ?? []) typeByCol[c.name] = c.type

  const kindOf = (column: string): ColumnKind => inferColumnKind(typeByCol[column])

  const addFilter = () => {
    if (colOptions.length === 0) return
    onChange([...filters, { column: colOptions[0], operator: '=', value: '' }])
  }

  const removeFilter = (idx: number) => {
    onChange(filters.filter((_, i) => i !== idx))
  }

  const updateFilter = (idx: number, patch: Partial<DataBrowserFilter>) => {
    onChange(filters.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  return (
    <div className="border-b border-border/50 px-4 py-1.5 bg-card/20">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
        {filters.map((f, idx) => {
          const kind = kindOf(f.column)
          const isMulti = f.operator === 'IN' || f.operator === 'NOT IN' || f.operator === 'BETWEEN'
          return (
            <div key={idx} className="flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5">
              <select
                value={f.column}
                onChange={(e) => updateFilter(idx, { column: e.target.value, value: '' })}
                className="bg-transparent text-xs outline-none cursor-pointer max-w-[100px]"
                title={typeByCol[f.column] ? `Type : ${typeByCol[f.column]}` : undefined}
              >
                {colOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={(e) => updateFilter(idx, { operator: e.target.value as FilterOperator })}
                className="bg-transparent text-xs outline-none cursor-pointer"
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              {!UNARY_OPS.includes(f.operator) && (
                <FilterValueInput
                  kind={kind}
                  multi={isMulti}
                  operator={f.operator}
                  value={f.value}
                  onChange={(v) => updateFilter(idx, { value: v })}
                  onEnter={() => onChange([...filters])}
                />
              )}
              <button onClick={() => removeFilter(idx)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )
        })}
        <button
          onClick={addFilter}
          className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          Filter
        </button>
      </div>
    </div>
  )
}

function FilterValueInput({
  kind,
  multi,
  operator,
  value,
  onChange,
  onEnter
}: {
  kind: ColumnKind
  multi: boolean
  operator: FilterOperator
  value: string
  onChange: (v: string) => void
  onEnter: () => void
}) {
  const common =
    'bg-transparent text-xs outline-none font-mono placeholder:text-muted-foreground/40'
  const width = multi ? 'w-32' : 'w-20'
  const placeholder = MULTI_VALUE_PLACEHOLDER[operator] ?? 'value'

  // LIKE/ILIKE/NOT LIKE → text même sur colonne non-string (pattern matching)
  const isLikeOp = operator === 'LIKE' || operator === 'ILIKE' || operator === 'NOT LIKE'
  const effectiveKind: ColumnKind = isLikeOp ? 'string' : kind

  // Boolean (mono-valeur) → select
  if (effectiveKind === 'boolean' && !multi) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(common, 'cursor-pointer w-20')}
      >
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }

  // Number (mono-valeur) → type="number"
  if (effectiveKind === 'number' && !multi) {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(common, width)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter()
        }}
      />
    )
  }

  // Date (mono-valeur)
  if (effectiveKind === 'date' && !multi) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(common, 'w-28')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter()
        }}
      />
    )
  }

  // Datetime (mono-valeur)
  if (effectiveKind === 'datetime' && !multi) {
    return (
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(common, 'w-40')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter()
        }}
      />
    )
  }

  // Défaut : input texte (string, ou multi-valeur où on accepte la saisie libre)
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(common, width)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter()
      }}
    />
  )
}

// ── Cell Value ──────────────────────────────────────────────────────────────

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground/50">NULL</span>
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-green-500' : 'text-destructive'}>{String(value)}</span>
  }
  if (typeof value === 'bigint') {
    return <span>{value.toString()}</span>
  }
  if (value instanceof Date) {
    return <span>{value.toISOString()}</span>
  }
  if (typeof value === 'object') {
    let serialized: string
    try {
      serialized = JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v)
    } catch {
      serialized = String(value)
    }
    return <span className="text-muted-foreground">{serialized}</span>
  }
  return <span>{String(value)}</span>
}

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Play, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, Download, Filter, TableIcon
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry, DataBrowserFilter, FilterOperator, PageSize, ExportFormat } from '@shared/types'

const OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL']
const PAGE_SIZES: PageSize[] = [25, 50, 100, 500]
const UNARY_OPS: FilterOperator[] = ['IS NULL', 'IS NOT NULL']

export function DataBrowser({ connection }: { connection: DbConnectionEntry }) {
  const {
    dataBrowserSchema, dataBrowserTable, dataBrowserFilters, dataBrowserSortColumn,
    dataBrowserSortDir, dataBrowserPage, dataBrowserPageSize, dataBrowserResult,
    dataBrowserLoading, dataBrowserTotalRows, setDataBrowserFilters, setDataBrowserSort,
    setDataBrowserPage, setDataBrowserPageSize, loadDataBrowserPage, exportResults,
    selectedSchema, selectedTable, setDataBrowserTarget, schemas, activeConnectionId
  } = useDbExplorerStore()

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
              </tr>
            </thead>
            <tbody>
              {dataBrowserResult.rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border/50 transition-colors hover:bg-accent/50">
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">
                    {dataBrowserPage * dataBrowserPageSize + idx + 1}
                  </td>
                  {dataBrowserResult.columns.map((col) => (
                    <td key={col.name} className="px-4 py-2 font-mono text-xs">
                      <CellValue value={row[col.name]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">No data</div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 bg-card/30">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page:</span>
          <select
            value={dataBrowserPageSize}
            onChange={(e) => setDataBrowserPageSize(Number(e.target.value) as PageSize)}
            className="bg-transparent text-xs outline-none cursor-pointer text-foreground"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            Page {dataBrowserPage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setDataBrowserPage(0)}
            disabled={dataBrowserPage === 0}
            className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setDataBrowserPage(dataBrowserPage - 1)}
            disabled={dataBrowserPage === 0}
            className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setDataBrowserPage(dataBrowserPage + 1)}
            disabled={dataBrowserPage >= totalPages - 1}
            className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setDataBrowserPage(totalPages - 1)}
            disabled={dataBrowserPage >= totalPages - 1}
            className="p-1 rounded hover:bg-accent/50 disabled:opacity-30 transition-colors"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
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
        {filters.map((f, idx) => (
          <div key={idx} className="flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5">
            <select
              value={f.column}
              onChange={(e) => updateFilter(idx, { column: e.target.value })}
              className="bg-transparent text-xs outline-none cursor-pointer max-w-[100px]"
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
              <input
                value={f.value}
                onChange={(e) => updateFilter(idx, { value: e.target.value })}
                placeholder="value"
                className="bg-transparent text-xs outline-none w-16 font-mono placeholder:text-muted-foreground/40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onChange([...filters]) // trigger reload
                  }
                }}
              />
            )}
            <button onClick={() => removeFilter(idx)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
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

// ── Cell Value ──────────────────────────────────────────────────────────────

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground/50">NULL</span>
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-green-500' : 'text-destructive'}>{String(value)}</span>
  }
  if (typeof value === 'object') {
    return <span className="text-muted-foreground">{JSON.stringify(value)}</span>
  }
  return <span>{String(value)}</span>
}

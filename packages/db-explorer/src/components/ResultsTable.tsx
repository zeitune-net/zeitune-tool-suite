import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, TableIcon, Download } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { ExportFormat } from '@shared/types'

export function ResultsTable() {
  const { tabs, activeTabId, exportResults } = useDbExplorerStore()
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const queryResult = activeTab?.result ?? null

  const handleSort = (colName: string) => {
    if (sortCol === colName) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(colName)
      setSortDir('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!queryResult?.rows?.length || !sortCol) return queryResult?.rows ?? []
    return [...queryResult.rows].sort((a, b) => {
      const aVal = a[sortCol]
      const bVal = b[sortCol]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return sortDir === 'asc' ? -1 : 1
      if (bVal == null) return sortDir === 'asc' ? 1 : -1
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [queryResult?.rows, sortCol, sortDir])

  const handleExport = (format: ExportFormat) => {
    if (!queryResult?.columns) return
    const colNames = queryResult.columns.map((c) => c.name)
    exportResults(colNames, queryResult.rows, format, `query-result.${format}`)
  }

  if (!queryResult || queryResult.columns.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
        <TableIcon className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">Run a query to see results</p>
      </div>
    )
  }

  if (queryResult.error) {
    return (
      <div className="flex-1 p-4">
        <div className="rounded-lg bg-destructive/10 p-4 font-mono text-sm text-destructive">
          {queryResult.error}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Export toolbar */}
      {queryResult.rows.length > 0 && (
        <div className="flex items-center justify-end gap-1.5 border-b border-border/50 px-4 py-1 bg-card/20">
          <Button size="sm" variant="ghost" onClick={() => handleExport('csv')}>
            <Download className="mr-1 h-3 w-3" />
            CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleExport('json')}>
            <Download className="mr-1 h-3 w-3" />
            JSON
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr>
              {queryResult.columns.map((col) => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="cursor-pointer select-none px-4 py-2.5 text-left font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <div className="flex items-center gap-1">
                    <span className="uppercase text-xs">{col.name}</span>
                    {sortCol === col.name ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-border/50 transition-colors hover:bg-accent/50"
              >
                {queryResult.columns.map((col) => (
                  <td key={col.name} className="px-4 py-2 font-mono text-xs">
                    <CellValue value={row[col.name]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedRows.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">No rows returned</div>
        )}
      </div>
    </div>
  )
}

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

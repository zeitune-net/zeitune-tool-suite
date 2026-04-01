import { Key, Link2, Hash, Database } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore, type DetailTab } from '../store'
import type { DbConnectionEntry } from '@shared/types'
import { Badge } from '@shared/components/ui/badge'

const tabs: { id: DetailTab; label: string }[] = [
  { id: 'columns', label: 'Columns' },
  { id: 'foreignKeys', label: 'Foreign Keys' },
  { id: 'indexes', label: 'Indexes' }
]

export function TableDetails({ connection }: { connection: DbConnectionEntry }) {
  const { selectedSchema, selectedTable, tableDetails, detailTab, setDetailTab } =
    useDbExplorerStore()

  if (!selectedSchema || !selectedTable) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Database className="mr-2 h-4 w-4 opacity-40" />
        Select a table to view details
      </div>
    )
  }

  const key = `${connection.id}:${selectedSchema}.${selectedTable}`
  const details = tableDetails[key]

  if (!details) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h3 className="font-medium text-sm">
          <span className="text-muted-foreground">{selectedSchema}.</span>
          {selectedTable}
        </h3>
        <Badge variant="muted" className="text-[10px]">
          ~{details.rowEstimate.toLocaleString()} rows
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              detailTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.id === 'columns' && (
              <span className="ml-1 opacity-50">{details.columns.length}</span>
            )}
            {tab.id === 'foreignKeys' && (
              <span className="ml-1 opacity-50">{details.foreignKeys.length}</span>
            )}
            {tab.id === 'indexes' && (
              <span className="ml-1 opacity-50">{details.indexes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {detailTab === 'columns' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Nullable</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Default</th>
              </tr>
            </thead>
            <tbody>
              {details.columns.map((col) => (
                <tr key={col.name} className="border-b border-border/50">
                  <td className="px-4 py-1.5 font-mono">
                    <div className="flex items-center gap-1.5">
                      {col.isPrimaryKey && <Key className="h-3 w-3 text-yellow-500" />}
                      <span className={col.isPrimaryKey ? 'text-primary' : ''}>{col.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground">{col.type}</td>
                  <td className="px-4 py-1.5">
                    {col.nullable ? (
                      <span className="text-muted-foreground">yes</span>
                    ) : (
                      <span className="text-foreground">no</span>
                    )}
                  </td>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground">
                    {col.defaultValue ?? <span className="opacity-30">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {detailTab === 'foreignKeys' && (
          <div className="p-4 space-y-2">
            {details.foreignKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No foreign keys</p>
            ) : (
              details.foreignKeys.map((fk) => (
                <div key={fk.constraintName} className="rounded-lg border border-border p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                    <Link2 className="h-3 w-3 text-primary" />
                    {fk.constraintName}
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {fk.column} → {fk.referencedSchema}.{fk.referencedTable}.{fk.referencedColumn}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {detailTab === 'indexes' && (
          <div className="p-4 space-y-2">
            {details.indexes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No indexes</p>
            ) : (
              details.indexes.map((idx) => (
                <div key={idx.name} className="rounded-lg border border-border p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                    <Hash className="h-3 w-3 text-primary" />
                    {idx.name}
                    {idx.unique && (
                      <Badge variant="info" className="text-[9px] px-1 py-0">UNIQUE</Badge>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {idx.type} ({idx.columns.join(', ')})
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import {
  Database,
  Table2,
  Eye,
  ChevronRight,
  ChevronDown,
  Search,
  Columns3,
  Key,
  RefreshCw
} from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry, SchemaInfo, TableInfo } from '@shared/types'

export function SchemaTree({ connection }: { connection: DbConnectionEntry }) {
  const {
    schemas,
    loadSchemas,
    selectedSchema,
    setSelectedSchema,
    selectedTable,
    setSelectedTable,
    loadTableDetails,
    schemaFilter,
    setSchemaFilter
  } = useDbExplorerStore()

  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const dbSchema = schemas[connection.id]

  useEffect(() => {
    if (!dbSchema) {
      handleRefresh()
    }
  }, [connection.id])

  useEffect(() => {
    if (dbSchema && dbSchema.schemas.length > 0 && expandedSchemas.size === 0) {
      setExpandedSchemas(new Set([dbSchema.schemas[0].name]))
      if (!selectedSchema) setSelectedSchema(dbSchema.schemas[0].name)
    }
  }, [dbSchema])

  const handleRefresh = async () => {
    setLoading(true)
    await loadSchemas(connection)
    setLoading(false)
  }

  const toggleSchema = (name: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
    setSelectedSchema(name)
  }

  const handleSelectTable = (schema: string, table: string) => {
    setSelectedSchema(schema)
    setSelectedTable(table)
    loadTableDetails(connection, schema, table)
  }

  const filterText = schemaFilter.toLowerCase()

  const filteredSchemas: SchemaInfo[] = dbSchema
    ? dbSchema.schemas.map((s) => ({
        ...s,
        tables: s.tables.filter((t) =>
          filterText ? t.name.toLowerCase().includes(filterText) : true
        )
      })).filter((s) => s.tables.length > 0 || !filterText)
    : []

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={schemaFilter}
            onChange={(e) => setSchemaFilter(e.target.value)}
            placeholder="Filter tables..."
            className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none transition-colors focus:border-primary"
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2">
        {/* Connection name */}
        <div className="mb-1 flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{connection.database}</span>
        </div>

        {loading && !dbSchema ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">Loading schema...</div>
        ) : filteredSchemas.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">No tables found</div>
        ) : (
          filteredSchemas.map((schema) => (
            <SchemaNode
              key={schema.name}
              schema={schema}
              expanded={expandedSchemas.has(schema.name)}
              selectedTable={selectedSchema === schema.name ? selectedTable : null}
              onToggle={() => toggleSchema(schema.name)}
              onSelectTable={(table) => handleSelectTable(schema.name, table)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SchemaNode({
  schema,
  expanded,
  selectedTable,
  onToggle,
  onSelectTable
}: {
  schema: SchemaInfo
  expanded: boolean
  selectedTable: string | null
  onToggle: () => void
  onSelectTable: (table: string) => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <Columns3 className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{schema.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{schema.tables.length}</span>
      </button>

      {expanded && (
        <div className="ml-3">
          {schema.tables.map((table) => (
            <TableNode
              key={table.name}
              table={table}
              selected={selectedTable === table.name}
              onSelect={() => onSelectTable(table.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TableNode({
  table,
  selected,
  onSelect
}: {
  table: TableInfo
  selected: boolean
  onSelect: () => void
}) {
  const Icon = table.type === 'view' ? Eye : Table2
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors',
        selected
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{table.name}</span>
      {table.primaryKey.length > 0 && <Key className="ml-auto h-2.5 w-2.5 opacity-40" />}
    </button>
  )
}

// ── Database Types ──────────────────────────────────────────────────────────

export type DbType = 'postgresql'

export type ConnectionStatus = 'connected' | 'disconnected' | 'testing' | 'error'

export interface DbConnectionEntry {
  id: string
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string // encrypted via safeStorage in storage, plain in memory
  type: DbType
}

export interface DbProfile {
  id: string
  name: string
  connections: DbConnectionEntry[]
  createdAt: number
}

// ── Schema Types ────────────────────────────────────────────────────────────

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
  comment: string | null
}

export interface ForeignKeyInfo {
  constraintName: string
  column: string
  referencedTable: string
  referencedSchema: string
  referencedColumn: string
}

export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
  type: string
}

export interface TableInfo {
  name: string
  schema: string
  type: 'table' | 'view'
  columns: ColumnInfo[]
  primaryKey: string[]
  foreignKeys: ForeignKeyInfo[]
  indexes: IndexInfo[]
  rowEstimate: number
}

export interface SchemaInfo {
  name: string
  tables: TableInfo[]
}

export interface DatabaseSchema {
  connectionId: string
  schemas: SchemaInfo[]
}

// ── Query Types ─────────────────────────────────────────────────────────────

export interface QueryColumn {
  name: string
  type: string
}

export interface QueryResult {
  columns: QueryColumn[]
  rows: Record<string, unknown>[]
  rowCount: number
  duration: number
  error?: string
}

// ── Connection Test ─────────────────────────────────────────────────────────

export interface ConnectionTestResult {
  success: boolean
  message: string
  serverVersion?: string
}

// ── Query Tabs ─────────────────────────────────────────────────────────────

export interface QueryTab {
  id: string
  title: string
  connectionId: string | null
  query: string
  result: QueryResult | null
  loading: boolean
}

// ── Query History ──────────────────────────────────────────────────────────

export interface QueryHistoryEntry {
  id: string
  connectionId: string
  sql: string
  timestamp: number
  duration: number
  rowCount: number
  error?: string
}

// ── Data Browser ───────────────────────────────────────────────────────────

export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE' | 'IS NULL' | 'IS NOT NULL'

export interface DataBrowserFilter {
  column: string
  operator: FilterOperator
  value: string
}

export type PageSize = 25 | 50 | 100 | 500

// ── Export ──────────────────────────────────────────────────────────────────

export type ExportFormat = 'csv' | 'json'

// ── Snapshots ─────────────────────────────────────────────────────────────

export interface SnapshotTableData {
  schema: string
  table: string
  columns: ColumnInfo[]
  primaryKey: string[]
  foreignKeys: ForeignKeyInfo[]
  rows: Record<string, unknown>[]
  rowCount: number
}

export interface SnapshotMetadata {
  id: string
  name: string
  profileId: string
  profileName: string
  connectionId: string
  connectionName: string
  database: string
  tables: { schema: string; table: string; rowCount: number }[]
  totalRows: number
  createdAt: number
}

export interface SnapshotData {
  metadata: SnapshotMetadata
  tables: SnapshotTableData[]
}

export interface SnapshotCreateOptions {
  name: string
  profileId: string
  profileName: string
  connectionId: string
  connectionName: string
  connection: DbConnectionEntry
  /** If empty, snapshot all tables */
  selectedTables?: { schema: string; table: string }[]
}

export type RestoreConflictStrategy = 'upsert' | 'skip' | 'replace' | 'fail'

export interface RestoreOptions {
  snapshotId: string
  targetConnection: DbConnectionEntry
  conflictStrategy: RestoreConflictStrategy
  selectedTables?: { schema: string; table: string }[]
  resetSequences: boolean
}

export interface RestoreProgress {
  phase: 'preparing' | 'restoring' | 'sequences' | 'done' | 'error'
  currentTable?: string
  tablesTotal: number
  tablesDone: number
  rowsInserted: number
  error?: string
}

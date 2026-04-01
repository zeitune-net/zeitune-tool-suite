// ── Database Types ──────────────────────────────────────────────────────────

export type DbType = 'postgresql' | 'mysql' | 'sqlite'

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
  pipeline?: TransformPipeline | null
}

export interface RestoreProgress {
  phase: 'preparing' | 'restoring' | 'sequences' | 'done' | 'error'
  currentTable?: string
  tablesTotal: number
  tablesDone: number
  rowsInserted: number
  error?: string
}

// ── Schema Diff ──────────────────────────────────────────────────────────

export type ColumnDiffStatus = 'identical' | 'added' | 'removed' | 'renamed' | 'type-changed'

export interface ColumnDiff {
  status: ColumnDiffStatus
  snapshotColumn: ColumnInfo | null
  liveColumn: ColumnInfo | null
  confidence?: number
  autoConvertible?: boolean
}

export type TableDiffStatus = 'identical' | 'modified' | 'removed' | 'added'

export interface TableDiff {
  snapshotTable: string
  snapshotSchema: string
  liveTable: string | null
  liveSchema: string | null
  status: TableDiffStatus
  columns: ColumnDiff[]
  warnings: string[]
}

export interface SchemaDiffResult {
  tables: TableDiff[]
  summary: { identical: number; modified: number; removed: number; added: number }
}

// ── Transform Pipeline ───────────────────────────────────────────────────

export interface ColumnMapping {
  sourceColumn: string
  targetColumn: string
  expression?: string
}

export interface TableTransform {
  sourceSchema: string
  sourceTable: string
  targetSchema: string
  targetTable: string
  columnMappings: ColumnMapping[]
  defaultValues: Record<string, string>
  rowFilter?: string
  skip: boolean
}

export interface TransformPipeline {
  id: string
  name: string
  description?: string
  profileId: string
  sourceSnapshotId?: string
  tableTransforms: TableTransform[]
  createdAt: number
  updatedAt: number
}

// ── Data Sets ────────────────────────────────────────────────────────────

export interface DataSet {
  id: string
  name: string
  description?: string
  profileId: string
  snapshotId: string
  pipelineId?: string
  targetConnectionId?: string
  conflictStrategy: RestoreConflictStrategy
  resetSequences: boolean
  createdAt: number
  updatedAt: number
}

export interface DataSetStatus {
  snapshotExists: boolean
  pipelineExists: boolean
  schemaCompatible: boolean | null
  warnings: string[]
}

// ── Saved Queries ──────────────────────────────────────────────────────

export interface SavedQuery {
  id: string
  name: string
  sql: string
  profileId: string
  connectionId?: string
  createdAt: number
  updatedAt: number
}

// ── Row Mutations ──────────────────────────────────────────────────────

export interface RowMutationResult {
  success: boolean
  error?: string
  affectedRows?: number
}

// ── Monitoring ─────────────────────────────────────────────────────────

export interface TableSizeInfo {
  schema: string
  table: string
  totalSize: string
  totalSizeBytes: number
  rowEstimate: number
}

export interface ActiveConnectionInfo {
  pid: number
  database: string
  username: string
  state: string
  query: string
  duration: string
  clientAddr: string
}

export interface PoolStats {
  total: number
  idle: number
  waiting: number
}

export interface MonitorStats {
  tableSizes: TableSizeInfo[]
  activeConnections: ActiveConnectionInfo[]
  poolStats: PoolStats
  serverVersion: string
}

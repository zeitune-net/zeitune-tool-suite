// ── Driver abstraction for multi-DB support ────────────────────────────────

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

export interface DriverQueryResult {
  columns: { name: string; type: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
}

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

export interface DbDriver {
  // Schema introspection
  getSchemas(pool: unknown): Promise<string[]>
  getTables(pool: unknown, schema: string): Promise<{ name: string; type: 'table' | 'view' }[]>
  getColumns(pool: unknown, schema: string, table: string): Promise<ColumnInfo[]>
  getForeignKeys(pool: unknown, schema: string, table: string): Promise<ForeignKeyInfo[]>
  getIndexes(pool: unknown, schema: string, table: string): Promise<IndexInfo[]>
  getRowEstimate(pool: unknown, schema: string, table: string): Promise<number>

  // Query execution
  query(pool: unknown, sql: string, params?: unknown[]): Promise<DriverQueryResult>

  // Transaction support
  getClient(pool: unknown): Promise<DriverClient>

  // Dialect helpers
  quoteIdentifier(name: string): string
  paramPlaceholder(index: number): string

  // Optional: sequence reset
  getSequenceResetSql?(schema: string, table: string, column: string): string | null

  // Optional: constraint deferral
  deferConstraintsSql?(): string | null
  disableFkChecksSql?(): string | null
  enableFkChecksSql?(): string | null

  // Optional: monitoring
  getTableSizes?(pool: unknown): Promise<TableSizeInfo[]>
  getActiveConnections?(pool: unknown): Promise<ActiveConnectionInfo[]>
  getPoolStats?(pool: unknown): { total: number; idle: number; waiting: number }
  getServerVersion?(pool: unknown): Promise<string>

  // Optional: upsert dialect
  buildUpsertSql(
    qualifiedTable: string,
    columns: string[],
    placeholders: string[],
    pkColumns: string[],
    updateColumns: string[]
  ): string
  buildSkipSql(
    qualifiedTable: string,
    columns: string[],
    placeholders: string[],
    pkColumns: string[]
  ): string
}

export interface DriverClient {
  query(sql: string, params?: unknown[]): Promise<DriverQueryResult>
  release(): void
}

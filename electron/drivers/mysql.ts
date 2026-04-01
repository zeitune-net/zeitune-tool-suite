import mysql from 'mysql2/promise'
import type { DbDriver, DriverClient, DriverQueryResult, ColumnInfo, ForeignKeyInfo, IndexInfo, TableSizeInfo, ActiveConnectionInfo } from './types'

export interface MysqlConnectionConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export function createMysqlPool(config: MysqlConnectionConfig): mysql.Pool {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10000,
    idleTimeout: 30000
  })
}

export async function testMysqlConnection(config: MysqlConnectionConfig): Promise<{ success: boolean; message: string; serverVersion?: string }> {
  let conn: mysql.Connection | null = null
  try {
    conn = await mysql.createConnection({ ...config, connectTimeout: 5000 })
    const [rows] = await conn.query('SELECT VERSION() as version')
    const version = (rows as Record<string, unknown>[])[0]?.version ?? 'Unknown'
    return { success: true, message: 'Connected', serverVersion: String(version) }
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (conn) await conn.end().catch(() => {})
  }
}

function toDriverResult(rows: unknown, fields?: unknown[]): DriverQueryResult {
  const resultRows = Array.isArray(rows) ? rows as Record<string, unknown>[] : []
  const columns = Array.isArray(fields)
    ? (fields as Array<{ name: string; type: number }>).map((f) => ({ name: f.name, type: String(f.type ?? '') }))
    : []
  return { columns, rows: resultRows, rowCount: resultRows.length }
}

export const mysqlDriver: DbDriver = {
  async getSchemas(pool: mysql.Pool): Promise<string[]> {
    const [rows] = await pool.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
       ORDER BY schema_name`
    )
    return (rows as Record<string, unknown>[]).map((r) => r.schema_name as string)
  },

  async getTables(pool: mysql.Pool, schema: string) {
    const [rows] = await pool.query(
      `SELECT table_name, table_type
       FROM information_schema.tables
       WHERE table_schema = ?
       ORDER BY table_name`,
      [schema]
    )
    return (rows as Record<string, unknown>[]).map((r) => ({
      name: r.TABLE_NAME as string ?? r.table_name as string,
      type: ((r.TABLE_TYPE as string) ?? (r.table_type as string)) === 'VIEW' ? 'view' as const : 'table' as const
    }))
  },

  async getColumns(pool: mysql.Pool, schema: string, table: string): Promise<ColumnInfo[]> {
    const [rows] = await pool.query(
      `SELECT column_name, data_type, column_type, is_nullable, column_default, column_key, column_comment
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [schema, table]
    )
    return (rows as Record<string, unknown>[]).map((r) => ({
      name: (r.COLUMN_NAME ?? r.column_name) as string,
      type: (r.DATA_TYPE ?? r.data_type) as string,
      nullable: (r.IS_NULLABLE ?? r.is_nullable) === 'YES',
      defaultValue: (r.COLUMN_DEFAULT ?? r.column_default) as string | null,
      isPrimaryKey: (r.COLUMN_KEY ?? r.column_key) === 'PRI',
      comment: ((r.COLUMN_COMMENT ?? r.column_comment) as string) || null
    }))
  },

  async getForeignKeys(pool: mysql.Pool, schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const [rows] = await pool.query(
      `SELECT
         constraint_name, column_name,
         referenced_table_name, referenced_table_schema, referenced_column_name
       FROM information_schema.key_column_usage
       WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
      [schema, table]
    )
    return (rows as Record<string, unknown>[]).map((r) => ({
      constraintName: (r.CONSTRAINT_NAME ?? r.constraint_name) as string,
      column: (r.COLUMN_NAME ?? r.column_name) as string,
      referencedTable: (r.REFERENCED_TABLE_NAME ?? r.referenced_table_name) as string,
      referencedSchema: (r.REFERENCED_TABLE_SCHEMA ?? r.referenced_table_schema) as string,
      referencedColumn: (r.REFERENCED_COLUMN_NAME ?? r.referenced_column_name) as string
    }))
  },

  async getIndexes(pool: mysql.Pool, schema: string, table: string): Promise<IndexInfo[]> {
    const [rows] = await pool.query(
      `SELECT index_name, column_name, non_unique, index_type
       FROM information_schema.statistics
       WHERE table_schema = ? AND table_name = ?
       ORDER BY index_name, seq_in_index`,
      [schema, table]
    )
    const indexMap = new Map<string, IndexInfo>()
    for (const r of rows as Record<string, unknown>[]) {
      const name = (r.INDEX_NAME ?? r.index_name) as string
      const col = (r.COLUMN_NAME ?? r.column_name) as string
      if (!indexMap.has(name)) {
        indexMap.set(name, {
          name,
          columns: [],
          unique: Number(r.NON_UNIQUE ?? r.non_unique) === 0,
          type: (r.INDEX_TYPE ?? r.index_type) as string
        })
      }
      indexMap.get(name)!.columns.push(col)
    }
    return [...indexMap.values()]
  },

  async getRowEstimate(pool: mysql.Pool, schema: string, table: string): Promise<number> {
    const [rows] = await pool.query(
      `SELECT table_rows FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
      [schema, table]
    )
    return Number((rows as Record<string, unknown>[])[0]?.TABLE_ROWS ?? (rows as Record<string, unknown>[])[0]?.table_rows ?? 0)
  },

  async query(pool: mysql.Pool, sql: string, params?: unknown[]): Promise<DriverQueryResult> {
    const [rows, fields] = params
      ? await pool.query(sql, params)
      : await pool.query(sql)
    return toDriverResult(rows, fields as unknown[])
  },

  async getClient(pool: mysql.Pool): Promise<DriverClient> {
    const conn = await pool.getConnection()
    return {
      async query(sql: string, params?: unknown[]): Promise<DriverQueryResult> {
        const [rows, fields] = params ? await conn.query(sql, params) : await conn.query(sql)
        return toDriverResult(rows, fields as unknown[])
      },
      release() {
        conn.release()
      }
    }
  },

  quoteIdentifier(name: string): string {
    return `\`${name}\``
  },

  paramPlaceholder(_index: number): string {
    return '?'
  },

  disableFkChecksSql(): string {
    return 'SET FOREIGN_KEY_CHECKS = 0'
  },

  enableFkChecksSql(): string {
    return 'SET FOREIGN_KEY_CHECKS = 1'
  },

  async getTableSizes(pool: mysql.Pool): Promise<TableSizeInfo[]> {
    const [rows] = await pool.query(
      `SELECT
         table_schema AS \`schema\`,
         table_name AS \`table\`,
         CONCAT(ROUND((data_length + index_length) / 1024 / 1024, 2), ' MB') AS total_size,
         (data_length + index_length) AS total_size_bytes,
         table_rows AS row_estimate
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY (data_length + index_length) DESC`
    )
    return (rows as Record<string, unknown>[]).map((r) => ({
      schema: r.schema as string,
      table: r.table as string,
      totalSize: r.total_size as string,
      totalSizeBytes: Number(r.total_size_bytes),
      rowEstimate: Number(r.row_estimate)
    }))
  },

  async getActiveConnections(pool: mysql.Pool): Promise<ActiveConnectionInfo[]> {
    const [rows] = await pool.query('SHOW PROCESSLIST')
    return (rows as Record<string, unknown>[]).map((r) => ({
      pid: Number(r.Id ?? r.id),
      database: (r.db ?? r.DB ?? '') as string,
      username: (r.User ?? r.user ?? '') as string,
      state: (r.Command ?? r.command ?? '') as string,
      query: (r.Info ?? r.info ?? '') as string,
      duration: `${r.Time ?? r.time ?? 0}s`,
      clientAddr: (r.Host ?? r.host ?? '') as string
    }))
  },

  getPoolStats(pool: mysql.Pool): { total: number; idle: number; waiting: number } {
    const p = pool.pool
    return {
      total: p?._allConnections?.length ?? 0,
      idle: p?._freeConnections?.length ?? 0,
      waiting: p?._connectionQueue?.length ?? 0
    }
  },

  async getServerVersion(pool: mysql.Pool): Promise<string> {
    const [rows] = await pool.query('SELECT VERSION() as version')
    return String((rows as Record<string, unknown>[])[0]?.version ?? 'Unknown')
  },

  buildUpsertSql(qualifiedTable, columns, placeholders, _pkColumns, updateColumns) {
    const quotedCols = columns.map((c) => `\`${c}\``)
    if (updateColumns.length === 0) {
      return `INSERT IGNORE INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`
    }
    const updateSet = updateColumns.map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
    return `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON DUPLICATE KEY UPDATE ${updateSet.join(', ')}`
  },

  buildSkipSql(qualifiedTable, columns, placeholders, _pkColumns) {
    const quotedCols = columns.map((c) => `\`${c}\``)
    return `INSERT IGNORE INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`
  }
}

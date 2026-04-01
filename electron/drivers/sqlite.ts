import Database from 'better-sqlite3'
import type { DbDriver, DriverClient, DriverQueryResult, ColumnInfo, ForeignKeyInfo, IndexInfo, TableSizeInfo } from './types'

export function createSqliteDb(filePath: string): Database.Database {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function testSqliteConnection(filePath: string): { success: boolean; message: string; serverVersion?: string } {
  try {
    const db = new Database(filePath, { readonly: true })
    const row = db.prepare('SELECT sqlite_version() as version').get() as { version: string }
    const version = row?.version ?? 'Unknown'
    db.close()
    return { success: true, message: 'Connected', serverVersion: `SQLite ${version}` }
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  }
}

function stmtToResult(stmt: Database.Statement, params?: unknown[]): DriverQueryResult {
  try {
    const rows = params ? stmt.all(...params) : stmt.all()
    const resultRows = rows as Record<string, unknown>[]
    const columns = stmt.columns().map((c) => ({ name: c.name, type: c.type ?? 'TEXT' }))
    return { columns, rows: resultRows, rowCount: resultRows.length }
  } catch {
    return { columns: [], rows: [], rowCount: 0 }
  }
}

export const sqliteDriver: DbDriver = {
  async getSchemas(_db: Database.Database): Promise<string[]> {
    return ['main']
  },

  async getTables(db: Database.Database, _schema: string) {
    const rows = db.prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    ).all() as { name: string; type: string }[]
    return rows.map((r) => ({
      name: r.name,
      type: r.type === 'view' ? 'view' as const : 'table' as const
    }))
  },

  async getColumns(db: Database.Database, _schema: string, table: string): Promise<ColumnInfo[]> {
    const rows = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{
      cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number
    }>
    return rows.map((r) => ({
      name: r.name,
      type: r.type || 'TEXT',
      nullable: r.notnull === 0,
      defaultValue: r.dflt_value,
      isPrimaryKey: r.pk > 0,
      comment: null
    }))
  },

  async getForeignKeys(db: Database.Database, _schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const rows = db.prepare(`PRAGMA foreign_key_list('${table}')`).all() as Array<{
      id: number; seq: number; table: string; from: string; to: string
    }>
    return rows.map((r) => ({
      constraintName: `fk_${table}_${r.from}`,
      column: r.from,
      referencedTable: r.table,
      referencedSchema: 'main',
      referencedColumn: r.to
    }))
  },

  async getIndexes(db: Database.Database, _schema: string, table: string): Promise<IndexInfo[]> {
    const indexList = db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{
      seq: number; name: string; unique: number; origin: string
    }>
    return indexList.map((idx) => {
      const infos = db.prepare(`PRAGMA index_info('${idx.name}')`).all() as Array<{
        seqno: number; cid: number; name: string
      }>
      return {
        name: idx.name,
        columns: infos.map((i) => i.name),
        unique: idx.unique === 1,
        type: 'btree'
      }
    })
  },

  async getRowEstimate(db: Database.Database, _schema: string, table: string): Promise<number> {
    const row = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count: number }
    return row?.count ?? 0
  },

  async query(db: Database.Database, sql: string, params?: unknown[]): Promise<DriverQueryResult> {
    const trimmed = sql.trim().toUpperCase()
    // Check if this is a SELECT/PRAGMA/EXPLAIN that returns rows
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('EXPLAIN') || trimmed.startsWith('WITH')) {
      const stmt = db.prepare(sql)
      return stmtToResult(stmt, params)
    }
    // Otherwise it's a write statement (INSERT, UPDATE, DELETE, CREATE, etc.)
    const stmt = db.prepare(sql)
    const result = params ? stmt.run(...params) : stmt.run()
    return {
      columns: [],
      rows: [],
      rowCount: result.changes
    }
  },

  async getClient(db: Database.Database): Promise<DriverClient> {
    // SQLite is synchronous — wrap in async interface
    return {
      async query(sql: string, params?: unknown[]): Promise<DriverQueryResult> {
        return sqliteDriver.query(db, sql, params)
      },
      release() {
        // Nothing to release for SQLite
      }
    }
  },

  quoteIdentifier(name: string): string {
    return `"${name}"`
  },

  paramPlaceholder(_index: number): string {
    return '?'
  },

  disableFkChecksSql(): string {
    return 'PRAGMA foreign_keys = OFF'
  },

  enableFkChecksSql(): string {
    return 'PRAGMA foreign_keys = ON'
  },

  async getTableSizes(db: Database.Database): Promise<TableSizeInfo[]> {
    const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number })?.page_size ?? 4096
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    ).all() as { name: string }[]

    return tables.map((t) => {
      const count = (db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number })?.c ?? 0
      // Estimate size based on row count (SQLite doesn't expose per-table sizes easily)
      const estimatedSize = count * 100 // rough estimate
      const sizeStr = estimatedSize > 1024 * 1024
        ? `${(estimatedSize / 1024 / 1024).toFixed(1)} MB`
        : `${(estimatedSize / 1024).toFixed(1)} KB`
      return {
        schema: 'main',
        table: t.name,
        totalSize: sizeStr,
        totalSizeBytes: estimatedSize,
        rowEstimate: count
      }
    })
  },

  getPoolStats(_db: Database.Database): { total: number; idle: number; waiting: number } {
    return { total: 1, idle: 1, waiting: 0 }
  },

  async getServerVersion(db: Database.Database): Promise<string> {
    const row = db.prepare('SELECT sqlite_version() as v').get() as { v: string }
    return `SQLite ${row?.v ?? 'Unknown'}`
  },

  buildUpsertSql(qualifiedTable, columns, placeholders, pkColumns, updateColumns) {
    const quotedCols = columns.map((c) => `"${c}"`)
    if (updateColumns.length === 0) {
      return `INSERT OR IGNORE INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`
    }
    const updateSet = updateColumns.map((c) => {
      const idx = columns.indexOf(c)
      return `"${c}" = ${placeholders[idx]}`
    })
    const pkQuoted = pkColumns.map((c) => `"${c}"`)
    return `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${pkQuoted.join(', ')}) DO UPDATE SET ${updateSet.join(', ')}`
  },

  buildSkipSql(qualifiedTable, columns, placeholders, _pkColumns) {
    const quotedCols = columns.map((c) => `"${c}"`)
    return `INSERT OR IGNORE INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`
  }
}

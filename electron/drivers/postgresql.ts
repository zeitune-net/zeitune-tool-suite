import pg from 'pg'
import type { DbDriver, DriverClient, DriverQueryResult, ColumnInfo, ForeignKeyInfo, IndexInfo, TableSizeInfo, ActiveConnectionInfo } from './types'

const { Pool } = pg

export interface PgConnectionConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export function createPgPool(config: PgConnectionConfig): pg.Pool {
  return new Pool({
    ...config,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  })
}

export async function testPgConnection(config: PgConnectionConfig): Promise<{ success: boolean; message: string; serverVersion?: string }> {
  const pool = new Pool({ ...config, max: 1, connectionTimeoutMillis: 5000 })
  try {
    const res = await pool.query('SELECT version()')
    const version = res.rows[0]?.version ?? 'Unknown'
    return { success: true, message: 'Connected', serverVersion: version }
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    await pool.end().catch(() => {})
  }
}

export const postgresqlDriver: DbDriver = {
  async getSchemas(pool: pg.Pool): Promise<string[]> {
    const res = await pool.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY schema_name`
    )
    return res.rows.map((r: { schema_name: string }) => r.schema_name)
  },

  async getTables(pool: pg.Pool, schema: string) {
    const res = await pool.query(
      `SELECT table_name, table_type
       FROM information_schema.tables
       WHERE table_schema = $1
       ORDER BY table_name`,
      [schema]
    )
    return res.rows.map((r: { table_name: string; table_type: string }) => ({
      name: r.table_name,
      type: r.table_type === 'VIEW' ? 'view' as const : 'table' as const
    }))
  },

  async getColumns(pool: pg.Pool, schema: string, table: string): Promise<ColumnInfo[]> {
    const res = await pool.query(
      `SELECT
         c.column_name,
         c.udt_name,
         c.is_nullable,
         c.column_default,
         pgd.description as comment,
         CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
       FROM information_schema.columns c
       LEFT JOIN pg_catalog.pg_statio_all_tables st
         ON st.schemaname = c.table_schema AND st.relname = c.table_name
       LEFT JOIN pg_catalog.pg_description pgd
         ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
       LEFT JOIN (
         SELECT ku.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage ku
           ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = $1 AND tc.table_name = $2
       ) pk ON pk.column_name = c.column_name
       WHERE c.table_schema = $1 AND c.table_name = $2
       ORDER BY c.ordinal_position`,
      [schema, table]
    )
    return res.rows.map((r: Record<string, unknown>) => ({
      name: r.column_name as string,
      type: r.udt_name as string,
      nullable: r.is_nullable === 'YES',
      defaultValue: r.column_default as string | null,
      isPrimaryKey: r.is_primary_key as boolean,
      comment: r.comment as string | null
    }))
  },

  async getForeignKeys(pool: pg.Pool, schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const res = await pool.query(
      `SELECT
         tc.constraint_name,
         kcu.column_name,
         ccu.table_name AS referenced_table,
         ccu.table_schema AS referenced_schema,
         ccu.column_name AS referenced_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = $1 AND tc.table_name = $2`,
      [schema, table]
    )
    return res.rows.map((r: Record<string, unknown>) => ({
      constraintName: r.constraint_name as string,
      column: r.column_name as string,
      referencedTable: r.referenced_table as string,
      referencedSchema: r.referenced_schema as string,
      referencedColumn: r.referenced_column as string
    }))
  },

  async getIndexes(pool: pg.Pool, schema: string, table: string): Promise<IndexInfo[]> {
    const res = await pool.query(
      `SELECT
         i.relname AS index_name,
         array_agg(a.attname ORDER BY k.n) AS columns,
         ix.indisunique AS is_unique,
         am.amname AS index_type
       FROM pg_catalog.pg_index ix
       JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
       JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_catalog.pg_am am ON am.oid = i.relam
       CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n)
       JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
       WHERE n.nspname = $1 AND t.relname = $2
       GROUP BY i.relname, ix.indisunique, am.amname
       ORDER BY i.relname`,
      [schema, table]
    )
    return res.rows.map((r: Record<string, unknown>) => ({
      name: r.index_name as string,
      columns: r.columns as string[],
      unique: r.is_unique as boolean,
      type: r.index_type as string
    }))
  },

  async getRowEstimate(pool: pg.Pool, schema: string, table: string): Promise<number> {
    const res = await pool.query(
      `SELECT reltuples::bigint AS estimate
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2`,
      [schema, table]
    )
    return res.rows[0]?.estimate ?? 0
  },

  async query(pool: pg.Pool, sql: string, params?: unknown[]): Promise<DriverQueryResult> {
    const res = params ? await pool.query(sql, params) : await pool.query(sql)
    const columns = (res.fields ?? []).map((f) => ({
      name: f.name,
      type: String(f.dataTypeID)
    }))
    return {
      columns,
      rows: res.rows ?? [],
      rowCount: res.rowCount ?? res.rows?.length ?? 0
    }
  },

  async getClient(pool: pg.Pool): Promise<DriverClient> {
    const client = await pool.connect()
    return {
      async query(sql: string, params?: unknown[]): Promise<DriverQueryResult> {
        const res = params ? await client.query(sql, params) : await client.query(sql)
        return {
          columns: (res.fields ?? []).map((f) => ({ name: f.name, type: String(f.dataTypeID) })),
          rows: res.rows ?? [],
          rowCount: res.rowCount ?? res.rows?.length ?? 0
        }
      },
      release() {
        client.release()
      }
    }
  },

  quoteIdentifier(name: string): string {
    return `"${name}"`
  },

  paramPlaceholder(index: number): string {
    return `$${index}`
  },

  getSequenceResetSql(schema: string, table: string, column: string): string | null {
    return `SELECT setval(pg_get_serial_sequence('${schema}.${table}', '${column}'), COALESCE((SELECT MAX("${column}") FROM "${schema}"."${table}"), 1))`
  },

  deferConstraintsSql(): string {
    return 'SET CONSTRAINTS ALL DEFERRED'
  },

  // Monitoring
  async getTableSizes(pool: pg.Pool): Promise<TableSizeInfo[]> {
    const res = await pool.query(
      `SELECT
         schemaname AS schema,
         relname AS table,
         pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS total_size,
         pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) AS total_size_bytes,
         n_live_tup AS row_estimate
       FROM pg_stat_user_tables
       ORDER BY pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) DESC`
    )
    return res.rows.map((r: Record<string, unknown>) => ({
      schema: r.schema as string,
      table: r.table as string,
      totalSize: r.total_size as string,
      totalSizeBytes: Number(r.total_size_bytes),
      rowEstimate: Number(r.row_estimate)
    }))
  },

  async getActiveConnections(pool: pg.Pool): Promise<ActiveConnectionInfo[]> {
    const res = await pool.query(
      `SELECT
         pid, datname, usename, state,
         COALESCE(query, '') AS query,
         COALESCE(EXTRACT(EPOCH FROM (now() - query_start))::text, '0') AS duration,
         COALESCE(client_addr::text, 'local') AS client_addr
       FROM pg_stat_activity
       WHERE datname = current_database()
       ORDER BY query_start DESC NULLS LAST`
    )
    return res.rows.map((r: Record<string, unknown>) => ({
      pid: Number(r.pid),
      database: r.datname as string,
      username: r.usename as string,
      state: (r.state as string) ?? 'unknown',
      query: r.query as string,
      duration: `${Math.round(Number(r.duration))}s`,
      clientAddr: r.client_addr as string
    }))
  },

  getPoolStats(pool: pg.Pool): { total: number; idle: number; waiting: number } {
    return {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    }
  },

  async getServerVersion(pool: pg.Pool): Promise<string> {
    const res = await pool.query('SHOW server_version')
    return res.rows[0]?.server_version ?? 'Unknown'
  },

  buildUpsertSql(qualifiedTable, columns, placeholders, pkColumns, updateColumns) {
    const quotedCols = columns.map((c) => `"${c}"`)
    const pkQuoted = pkColumns.map((c) => `"${c}"`)
    if (updateColumns.length === 0) {
      return `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${pkQuoted.join(', ')}) DO NOTHING`
    }
    const updateSet = updateColumns.map((c) => {
      const idx = columns.indexOf(c)
      return `"${c}" = ${placeholders[idx]}`
    })
    return `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${pkQuoted.join(', ')}) DO UPDATE SET ${updateSet.join(', ')}`
  },

  buildSkipSql(qualifiedTable, columns, placeholders, pkColumns) {
    const quotedCols = columns.map((c) => `"${c}"`)
    const pkQuoted = pkColumns.map((c) => `"${c}"`)
    return `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${pkQuoted.join(', ')}) DO NOTHING`
  }
}

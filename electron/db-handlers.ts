import { ipcMain, app, safeStorage, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import pg from 'pg'

const { Pool } = pg

// ── Types (duplicated from shared to avoid cross-compilation issues) ────────

interface DbConnectionEntry {
  id: string
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  type: 'postgresql'
}

interface DbProfile {
  id: string
  name: string
  connections: StoredConnection[]
  createdAt: number
}

interface StoredConnection extends Omit<DbConnectionEntry, 'password'> {
  encryptedPassword: string
}

// ── Credential Encryption ───────────────────────────────────────────────────

function encryptPassword(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(plain).toString('base64')
  return safeStorage.encryptString(plain).toString('base64')
}

function decryptPassword(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(encrypted, 'base64').toString()
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

// ── Profile Persistence ─────────────────────────────────────────────────────

const profilesPath = () => join(app.getPath('userData'), 'db-profiles.json')

async function loadProfiles(): Promise<DbProfile[]> {
  try {
    const data = await readFile(profilesPath(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveProfiles(profiles: DbProfile[]): Promise<void> {
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  await writeFile(profilesPath(), JSON.stringify(profiles, null, 2), 'utf-8')
}

function profileToPublic(profile: DbProfile): { id: string; name: string; connections: DbConnectionEntry[]; createdAt: number } {
  return {
    id: profile.id,
    name: profile.name,
    createdAt: profile.createdAt,
    connections: profile.connections.map((c) => ({
      id: c.id,
      name: c.name,
      host: c.host,
      port: c.port,
      database: c.database,
      username: c.username,
      password: decryptPassword(c.encryptedPassword),
      type: c.type
    }))
  }
}

function connectionToStored(conn: DbConnectionEntry): StoredConnection {
  const { password, ...rest } = conn
  return { ...rest, encryptedPassword: encryptPassword(password) }
}

// ── Connection Pool Management ──────────────────────────────────────────────

const pools = new Map<string, pg.Pool>()

function getPoolKey(conn: DbConnectionEntry): string {
  return `${conn.host}:${conn.port}/${conn.database}/${conn.username}`
}

function getOrCreatePool(conn: DbConnectionEntry): pg.Pool {
  const key = getPoolKey(conn)
  let pool = pools.get(key)
  if (!pool) {
    pool = new Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      password: conn.password,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
    pools.set(key, pool)
  }
  return pool
}

function removePool(conn: DbConnectionEntry): void {
  const key = getPoolKey(conn)
  const pool = pools.get(key)
  if (pool) {
    pool.end().catch(() => {})
    pools.delete(key)
  }
}

async function closeAllPools(): Promise<void> {
  for (const pool of pools.values()) {
    await pool.end().catch(() => {})
  }
  pools.clear()
}

// ── Schema Queries ──────────────────────────────────────────────────────────

async function getSchemas(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
     ORDER BY schema_name`
  )
  return res.rows.map((r: { schema_name: string }) => r.schema_name)
}

async function getTables(pool: pg.Pool, schema: string) {
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
}

async function getColumns(pool: pg.Pool, schema: string, table: string) {
  const res = await pool.query(
    `SELECT
       c.column_name,
       c.data_type,
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
}

async function getForeignKeys(pool: pg.Pool, schema: string, table: string) {
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
}

async function getIndexes(pool: pg.Pool, schema: string, table: string) {
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
}

async function getRowEstimate(pool: pg.Pool, schema: string, table: string): Promise<number> {
  const res = await pool.query(
    `SELECT reltuples::bigint AS estimate
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, table]
  )
  return res.rows[0]?.estimate ?? 0
}

// ── Register IPC Handlers ───────────────────────────────────────────────────

export function registerDbHandlers(): void {
  // ── Profile CRUD ──────────────────────────────────────────────────────

  ipcMain.handle('db:profile:list', async () => {
    const profiles = await loadProfiles()
    return profiles.map(profileToPublic)
  })

  ipcMain.handle('db:profile:save', async (_e, profile: { id: string; name: string; connections: DbConnectionEntry[]; createdAt: number }) => {
    const profiles = await loadProfiles()
    const stored: DbProfile = {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      connections: profile.connections.map(connectionToStored)
    }
    const idx = profiles.findIndex((p) => p.id === stored.id)
    if (idx >= 0) {
      // Remove old pools for connections that changed
      const old = profiles[idx]
      for (const oldConn of old.connections) {
        const newConn = stored.connections.find((c) => c.id === oldConn.id)
        if (!newConn || newConn.host !== oldConn.host || newConn.port !== oldConn.port || newConn.database !== oldConn.database) {
          const decrypted = { ...oldConn, password: decryptPassword(oldConn.encryptedPassword) } as unknown as DbConnectionEntry
          removePool(decrypted)
        }
      }
      profiles[idx] = stored
    } else {
      profiles.push(stored)
    }
    await saveProfiles(profiles)
    return profiles.map(profileToPublic)
  })

  ipcMain.handle('db:profile:delete', async (_e, profileId: string) => {
    let profiles = await loadProfiles()
    const toDelete = profiles.find((p) => p.id === profileId)
    if (toDelete) {
      for (const conn of toDelete.connections) {
        const decrypted = { ...conn, password: decryptPassword(conn.encryptedPassword) } as unknown as DbConnectionEntry
        removePool(decrypted)
      }
    }
    profiles = profiles.filter((p) => p.id !== profileId)
    await saveProfiles(profiles)
    return profiles.map(profileToPublic)
  })

  // ── Connection Test ───────────────────────────────────────────────────

  ipcMain.handle('db:test-connection', async (_e, conn: DbConnectionEntry) => {
    const pool = new Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      password: conn.password,
      max: 1,
      connectionTimeoutMillis: 5000
    })
    try {
      const res = await pool.query('SELECT version()')
      const version = res.rows[0]?.version ?? 'Unknown'
      return { success: true, message: 'Connected', serverVersion: version }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    } finally {
      await pool.end().catch(() => {})
    }
  })

  // ── Connect / Disconnect ──────────────────────────────────────────────

  ipcMain.handle('db:connect', async (_e, conn: DbConnectionEntry) => {
    const pool = getOrCreatePool(conn)
    try {
      await pool.query('SELECT 1')
      return { success: true }
    } catch (err: unknown) {
      removePool(conn)
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    }
  })

  ipcMain.handle('db:disconnect', async (_e, conn: DbConnectionEntry) => {
    removePool(conn)
    return { success: true }
  })

  // ── Schema Browsing ───────────────────────────────────────────────────

  ipcMain.handle('db:schemas', async (_e, conn: DbConnectionEntry) => {
    const pool = getOrCreatePool(conn)
    const schemaNames = await getSchemas(pool)
    const schemas = []
    for (const schemaName of schemaNames) {
      const tables = await getTables(pool, schemaName)
      schemas.push({
        name: schemaName,
        tables: tables.map((t) => ({
          name: t.name,
          schema: schemaName,
          type: t.type,
          columns: [],
          primaryKey: [],
          foreignKeys: [],
          indexes: [],
          rowEstimate: 0
        }))
      })
    }
    return { connectionId: conn.id, schemas }
  })

  ipcMain.handle('db:table-details', async (_e, conn: DbConnectionEntry, schema: string, table: string) => {
    const pool = getOrCreatePool(conn)
    const [columns, foreignKeys, indexes, rowEstimate] = await Promise.all([
      getColumns(pool, schema, table),
      getForeignKeys(pool, schema, table),
      getIndexes(pool, schema, table),
      getRowEstimate(pool, schema, table)
    ])
    const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
    return {
      name: table,
      schema,
      type: 'table' as const,
      columns,
      primaryKey,
      foreignKeys,
      indexes,
      rowEstimate
    }
  })

  // ── Query Execution ───────────────────────────────────────────────────

  ipcMain.handle('db:query', async (_e, conn: DbConnectionEntry, sql: string) => {
    const pool = getOrCreatePool(conn)
    const start = performance.now()
    try {
      const res = await pool.query(sql)
      const duration = Math.round(performance.now() - start)
      const columns = (res.fields ?? []).map((f) => ({
        name: f.name,
        type: String(f.dataTypeID)
      }))
      return {
        columns,
        rows: res.rows ?? [],
        rowCount: res.rowCount ?? res.rows?.length ?? 0,
        duration
      }
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - start)
      const msg = err instanceof Error ? err.message : String(err)
      return { columns: [], rows: [], rowCount: 0, duration, error: msg }
    }
  })
  // ── Query History ──────────────────────────────────────────────────────

  const historyPath = () => join(app.getPath('userData'), 'db-query-history.json')

  ipcMain.handle('db:history:load', async () => {
    try {
      const data = await readFile(historyPath(), 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  })

  ipcMain.handle('db:history:save', async (_e, entries: unknown[]) => {
    const dir = app.getPath('userData')
    await mkdir(dir, { recursive: true })
    await writeFile(historyPath(), JSON.stringify(entries, null, 2), 'utf-8')
  })

  // ── Export ────────────────────────────────────────────────────────────

  ipcMain.handle('db:export', async (_e, data: { columns: string[]; rows: Record<string, unknown>[]; format: 'csv' | 'json'; defaultName?: string }) => {
    const ext = data.format === 'csv' ? 'csv' : 'json'
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: data.defaultName ?? `export.${ext}`,
      filters: [
        data.format === 'csv'
          ? { name: 'CSV', extensions: ['csv'] }
          : { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (result.canceled || !result.filePath) return { success: false }

    let content: string
    if (data.format === 'csv') {
      const escapeCsv = (val: unknown) => {
        if (val === null || val === undefined) return ''
        const s = typeof val === 'object' ? JSON.stringify(val) : String(val)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }
      const header = data.columns.map(escapeCsv).join(',')
      const rows = data.rows.map((row) => data.columns.map((col) => escapeCsv(row[col])).join(','))
      content = [header, ...rows].join('\n')
    } else {
      content = JSON.stringify(data.rows, null, 2)
    }

    await writeFile(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
  })
}

// ── Cleanup on app quit ─────────────────────────────────────────────────────

app.on('before-quit', () => {
  closeAllPools()
})

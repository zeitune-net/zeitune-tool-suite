import { ipcMain, app, safeStorage, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import pg from 'pg'
import { postgresqlDriver, createPgPool, testPgConnection } from './drivers/postgresql'
import { mysqlDriver, createMysqlPool, testMysqlConnection } from './drivers/mysql'
import { sqliteDriver, createSqliteDb, testSqliteConnection } from './drivers/sqlite'
import type { DbDriver } from './drivers/types'

const { Pool } = pg

// ── Types (duplicated from shared to avoid cross-compilation issues) ────────

type DbType = 'postgresql' | 'mysql' | 'sqlite'

interface DbConnectionEntry {
  id: string
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
  type: DbType
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

// ── IPC Sanitization ────────────────────────────────────────────────────────
// Electron's structured clone cannot transfer BigInt across the IPC boundary.
// mysql2 v3+ returns BIGINT/UNSIGNED columns as native BigInt, and better-sqlite3
// returns BigInt for integers exceeding Number.MAX_SAFE_INTEGER. Without this
// pass, opening a table containing such a column kills the renderer.

function sanitizeForIpc(value: unknown): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'bigint') {
    const n = value as bigint
    if (n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(n)
    }
    return n.toString()
  }
  if (t !== 'object') return value
  if (value instanceof Date) return value
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return value
  if (Array.isArray(value)) return value.map(sanitizeForIpc)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = sanitizeForIpc(v)
  }
  return out
}

// ── Connection Pool Management ──────────────────────────────────────────────

interface PoolEntry {
  pool: unknown
  driver: DbDriver
  type: DbType
}

const pools = new Map<string, PoolEntry>()

function getDriver(type: DbType): DbDriver {
  switch (type) {
    case 'mysql': return mysqlDriver
    case 'sqlite': return sqliteDriver
    default: return postgresqlDriver
  }
}

function getPoolKey(conn: DbConnectionEntry): string {
  if (conn.type === 'sqlite') return `sqlite:${conn.database}`
  return `${conn.type}:${conn.host}:${conn.port}/${conn.database}/${conn.username}`
}

function getOrCreatePoolEntry(conn: DbConnectionEntry): PoolEntry {
  const key = getPoolKey(conn)
  let entry = pools.get(key)
  if (!entry) {
    const driver = getDriver(conn.type)
    let pool: unknown
    switch (conn.type) {
      case 'mysql':
        pool = createMysqlPool({ host: conn.host, port: conn.port, database: conn.database, user: conn.username, password: conn.password })
        break
      case 'sqlite':
        pool = createSqliteDb(conn.database)
        break
      default:
        pool = createPgPool({ host: conn.host, port: conn.port, database: conn.database, user: conn.username, password: conn.password })
        break
    }
    entry = { pool, driver, type: conn.type }
    pools.set(key, entry)
  }
  return entry
}

// Legacy helper for backward compat during refactor
function getOrCreatePool(conn: DbConnectionEntry): pg.Pool {
  return getOrCreatePoolEntry(conn).pool as pg.Pool
}

function removePool(conn: DbConnectionEntry): void {
  const key = getPoolKey(conn)
  const entry = pools.get(key)
  if (entry) {
    if (entry.type === 'postgresql') {
      (entry.pool as pg.Pool).end().catch(() => {})
    } else if (entry.type === 'mysql') {
      (entry.pool as { end: () => Promise<void> }).end().catch(() => {})
    } else if (entry.type === 'sqlite') {
      try { (entry.pool as { close: () => void }).close() } catch {}
    }
    pools.delete(key)
  }
}

async function closeAllPools(): Promise<void> {
  for (const entry of pools.values()) {
    try {
      if (entry.type === 'sqlite') {
        (entry.pool as { close: () => void }).close()
      } else {
        await (entry.pool as { end: () => Promise<void> }).end()
      }
    } catch {}
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
  // ── File Dialog ─────────────────────────────────────────────────────

  ipcMain.handle('dialog:openFile', async (_e, options?: { filters?: { name: string; extensions: string[] }[]; title?: string }) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: options?.title ?? 'Select file',
      properties: ['openFile'],
      filters: options?.filters
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

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
    try {
      switch (conn.type) {
        case 'mysql':
          return await testMysqlConnection({ host: conn.host, port: conn.port, database: conn.database, user: conn.username, password: conn.password })
        case 'sqlite':
          return testSqliteConnection(conn.database)
        default:
          return await testPgConnection({ host: conn.host, port: conn.port, database: conn.database, user: conn.username, password: conn.password })
      }
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Connect / Disconnect ──────────────────────────────────────────────

  ipcMain.handle('db:connect', async (_e, conn: DbConnectionEntry) => {
    const entry = getOrCreatePoolEntry(conn)
    try {
      await entry.driver.query(entry.pool, 'SELECT 1')
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
    const entry = getOrCreatePoolEntry(conn)
    const { pool, driver } = entry
    const schemaNames = await driver.getSchemas(pool)
    const schemas = []
    for (const schemaName of schemaNames) {
      const tables = await driver.getTables(pool, schemaName)
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

  ipcMain.handle('db:bulk-columns', async (_e, conn: DbConnectionEntry, schema: string) => {
    try {
      const entry = getOrCreatePoolEntry(conn)
      const { pool, driver, type } = entry
      let sql: string
      let params: unknown[] = []
      if (type === 'postgresql') {
        sql = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 ORDER BY table_name, ordinal_position`
        params = [schema]
      } else if (type === 'mysql') {
        sql = `SELECT table_name AS table_name, column_name AS column_name FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, ordinal_position`
        params = [schema]
      } else {
        // SQLite — iterate tables via PRAGMA
        const tables = await driver.getTables(pool, schema)
        const result: Record<string, string[]> = {}
        for (const t of tables) {
          try {
            const cols = await driver.getColumns(pool, schema, t.name)
            result[t.name] = cols.map((c) => c.name)
          } catch { /* skip */ }
        }
        return result
      }
      const res = await driver.query(pool, sql, params)
      const result: Record<string, string[]> = {}
      for (const row of res.rows as Record<string, unknown>[]) {
        const t = (row.table_name ?? row.TABLE_NAME) as string
        const c = (row.column_name ?? row.COLUMN_NAME) as string
        if (!t || !c) continue
        if (!result[t]) result[t] = []
        result[t].push(c)
      }
      return result
    } catch (err) {
      console.error('db:bulk-columns failed:', err)
      return {}
    }
  })

  ipcMain.handle('db:table-details', async (_e, conn: DbConnectionEntry, schema: string, table: string) => {
    try {
      const entry = getOrCreatePoolEntry(conn)
      const { pool, driver } = entry
      const [columns, foreignKeys, indexes, rowEstimate] = await Promise.allSettled([
        driver.getColumns(pool, schema, table),
        driver.getForeignKeys(pool, schema, table),
        driver.getIndexes(pool, schema, table),
        driver.getRowEstimate(pool, schema, table)
      ]).then((results) => results.map((r) => r.status === 'fulfilled' ? r.value : []))

      const cols = (columns ?? []) as Awaited<ReturnType<DbDriver['getColumns']>>
      const fks = (foreignKeys ?? []) as Awaited<ReturnType<DbDriver['getForeignKeys']>>
      const idxs = (indexes ?? []) as Awaited<ReturnType<DbDriver['getIndexes']>>
      const rows = (typeof rowEstimate === 'number' ? rowEstimate : Number(rowEstimate) || 0)

      const primaryKey = cols.filter((c) => c.isPrimaryKey).map((c) => c.name)
      return sanitizeForIpc({
        name: table,
        schema,
        type: 'table' as const,
        columns: cols,
        primaryKey,
        foreignKeys: fks,
        indexes: idxs,
        rowEstimate: rows
      })
    } catch (err) {
      console.error('db:table-details failed:', err)
      return {
        name: table,
        schema,
        type: 'table' as const,
        columns: [],
        primaryKey: [],
        foreignKeys: [],
        indexes: [],
        rowEstimate: 0
      }
    }
  })

  // ── Query Execution ───────────────────────────────────────────────────

  ipcMain.handle('db:query', async (_e, conn: DbConnectionEntry, sql: string) => {
    const entry = getOrCreatePoolEntry(conn)
    const start = performance.now()
    try {
      const res = await entry.driver.query(entry.pool, sql)
      const duration = Math.round(performance.now() - start)
      return {
        columns: res.columns,
        rows: sanitizeForIpc(res.rows) as Record<string, unknown>[],
        rowCount: res.rowCount,
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

  // ── Snapshots ──────────────────────────────────────────────────────────

  const snapshotsDir = () => join(app.getPath('userData'), 'db-snapshots')

  ipcMain.handle('db:snapshot:list', async () => {
    const dir = snapshotsDir()
    await mkdir(dir, { recursive: true })
    const files = await readdir(dir)
    const metadataList = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(dir, file), 'utf-8')
        const snap = JSON.parse(raw)
        metadataList.push(snap.metadata)
      } catch { /* skip corrupt files */ }
    }
    metadataList.sort((a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt)
    return metadataList
  })

  ipcMain.handle('db:snapshot:get', async (_e, snapshotId: string) => {
    const filePath = join(snapshotsDir(), `${snapshotId}.json`)
    try {
      const raw = await readFile(filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('db:snapshot:delete', async (_e, snapshotId: string) => {
    const filePath = join(snapshotsDir(), `${snapshotId}.json`)
    try {
      await unlink(filePath)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('db:snapshot:create', async (_e, options: {
    name: string
    profileId: string
    profileName: string
    connectionId: string
    connectionName: string
    connection: DbConnectionEntry
    selectedTables?: { schema: string; table: string }[]
  }) => {
    const { connection, selectedTables } = options
    const entry = getOrCreatePoolEntry(connection)
    const { pool, driver } = entry
    const win = BrowserWindow.getFocusedWindow()

    const snapshotId = `snap-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    // Discover tables to snapshot
    const schemaNames = await driver.getSchemas(pool)
    const allTables: { schema: string; name: string }[] = []
    for (const schema of schemaNames) {
      const tables = await driver.getTables(pool, schema)
      for (const t of tables) {
        if (t.type === 'table') {
          allTables.push({ schema, name: t.name })
        }
      }
    }

    const tablesToSnap = selectedTables && selectedTables.length > 0
      ? allTables.filter((t) => selectedTables.some((s) => s.schema === t.schema && s.table === t.name))
      : allTables

    // Build FK dependency graph for topological sort
    const tableKey = (schema: string, name: string) => `${schema}.${name}`
    const tableSet = new Set(tablesToSnap.map((t) => tableKey(t.schema, t.name)))
    const deps = new Map<string, Set<string>>()
    for (const t of tablesToSnap) {
      const fks = await driver.getForeignKeys(pool, t.schema, t.name)
      const key = tableKey(t.schema, t.name)
      const d = new Set<string>()
      for (const fk of fks) {
        const ref = tableKey(fk.referencedSchema, fk.referencedTable)
        if (tableSet.has(ref) && ref !== key) d.add(ref)
      }
      deps.set(key, d)
    }

    // Topological sort (Kahn's algorithm)
    const sorted: { schema: string; name: string }[] = []
    const inDegree = new Map<string, number>()
    for (const t of tablesToSnap) {
      const k = tableKey(t.schema, t.name)
      inDegree.set(k, deps.get(k)?.size ?? 0)
    }
    const queue: string[] = []
    for (const [k, d] of inDegree) { if (d === 0) queue.push(k) }
    while (queue.length > 0) {
      const k = queue.shift()!
      const [schema, name] = k.split('.')
      sorted.push({ schema, name })
      for (const [other, d] of deps) {
        if (d.has(k)) {
          d.delete(k)
          inDegree.set(other, (inDegree.get(other) ?? 1) - 1)
          if (inDegree.get(other) === 0) queue.push(other)
        }
      }
    }
    // Add any remaining (circular deps)
    for (const t of tablesToSnap) {
      const k = tableKey(t.schema, t.name)
      if (!sorted.some((s) => tableKey(s.schema, s.name) === k)) {
        sorted.push(t)
      }
    }

    // Snapshot each table
    const snapshotTables = []
    const tableMeta = []

    for (const t of sorted) {
      // Send progress to renderer
      win?.webContents.send('db:snapshot:progress', {
        table: `${t.schema}.${t.name}`,
        done: snapshotTables.length,
        total: sorted.length
      })

      const [columns, fks] = await Promise.all([
        driver.getColumns(pool, t.schema, t.name),
        driver.getForeignKeys(pool, t.schema, t.name)
      ])
      const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name)

      const q = driver.quoteIdentifier.bind(driver)
      const qualifiedTable = connection.type === 'sqlite' ? q(t.name) : `${q(t.schema)}.${q(t.name)}`
      const dataRes = await driver.query(pool, `SELECT * FROM ${qualifiedTable}`)
      const rows = sanitizeForIpc(dataRes.rows) as Record<string, unknown>[]

      snapshotTables.push({
        schema: t.schema,
        table: t.name,
        columns,
        primaryKey,
        foreignKeys: fks,
        rows,
        rowCount: rows.length
      })
      tableMeta.push({ schema: t.schema, table: t.name, rowCount: rows.length })
    }

    const totalRows = tableMeta.reduce((sum, t) => sum + t.rowCount, 0)

    const snapshotData = {
      metadata: {
        id: snapshotId,
        name: options.name,
        profileId: options.profileId,
        profileName: options.profileName,
        connectionId: options.connectionId,
        connectionName: options.connectionName,
        database: connection.database,
        tables: tableMeta,
        totalRows,
        createdAt: Date.now()
      },
      tables: snapshotTables
    }

    // Persist
    const dir = snapshotsDir()
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${snapshotId}.json`), JSON.stringify(snapshotData, null, 2), 'utf-8')

    return snapshotData.metadata
  })

  // ── Restore ────────────────────────────────────────────────────────────

  ipcMain.handle('db:restore:execute', async (_e, options: {
    snapshotId: string
    targetConnection: DbConnectionEntry
    conflictStrategy: 'upsert' | 'skip' | 'replace' | 'fail'
    selectedTables?: { schema: string; table: string }[]
    resetSequences: boolean
    pipeline?: {
      tableTransforms: Array<{
        sourceSchema: string; sourceTable: string
        targetSchema: string; targetTable: string
        columnMappings: Array<{ sourceColumn: string; targetColumn: string; expression?: string }>
        defaultValues: Record<string, string>
        rowFilter?: string
        skip: boolean
      }>
    } | null
  }) => {
    const win = BrowserWindow.getFocusedWindow()
    const sendProgress = (progress: Record<string, unknown>) => {
      win?.webContents.send('db:restore:progress', progress)
    }

    // Load snapshot
    const filePath = join(snapshotsDir(), `${options.snapshotId}.json`)
    let snapshotData: { metadata: Record<string, unknown>; tables: Array<{
      schema: string; table: string; columns: Array<{ name: string; isPrimaryKey: boolean }>
      primaryKey: string[]; rows: Record<string, unknown>[]; rowCount: number
    }> }
    try {
      const raw = await readFile(filePath, 'utf-8')
      snapshotData = JSON.parse(raw)
    } catch {
      sendProgress({ phase: 'error', tablesTotal: 0, tablesDone: 0, rowsInserted: 0, error: 'Snapshot not found' })
      return { success: false, error: 'Snapshot not found' }
    }

    const pool = getOrCreatePool(options.targetConnection)
    const client = await pool.connect()

    let tablesToRestore = snapshotData.tables
    if (options.selectedTables && options.selectedTables.length > 0) {
      tablesToRestore = tablesToRestore.filter((t) =>
        options.selectedTables!.some((s) => s.schema === t.schema && s.table === t.table)
      )
    }

    // Filter out skipped tables from pipeline
    const pipelineTransforms = options.pipeline?.tableTransforms
    if (pipelineTransforms) {
      tablesToRestore = tablesToRestore.filter((t) => {
        const transform = pipelineTransforms.find(
          (pt) => pt.sourceSchema === t.schema && pt.sourceTable === t.table
        )
        return !transform?.skip
      })
    }

    // Build FK dependency graph for correct insertion order
    const tableKey = (schema: string, name: string) => `${schema}.${name}`
    const tableSet = new Set(tablesToRestore.map((t) => tableKey(t.schema, t.table)))

    const fkDeps = new Map<string, Set<string>>()
    for (const t of tablesToRestore) {
      const key = tableKey(t.schema, t.table)
      const d = new Set<string>()
      const snapTable = snapshotData.tables.find((st) => st.schema === t.schema && st.table === t.table) as unknown as {
        foreignKeys?: Array<{ referencedSchema: string; referencedTable: string }>
      }
      if (snapTable?.foreignKeys) {
        for (const fk of snapTable.foreignKeys) {
          const ref = tableKey(fk.referencedSchema, fk.referencedTable)
          if (tableSet.has(ref) && ref !== key) d.add(ref)
        }
      }
      fkDeps.set(key, d)
    }

    // Topological sort
    const sorted: typeof tablesToRestore = []
    const inDegree = new Map<string, number>()
    for (const t of tablesToRestore) {
      const k = tableKey(t.schema, t.table)
      inDegree.set(k, fkDeps.get(k)?.size ?? 0)
    }
    const queue: string[] = []
    for (const [k, d] of inDegree) { if (d === 0) queue.push(k) }
    while (queue.length > 0) {
      const k = queue.shift()!
      const tableData = tablesToRestore.find((t) => tableKey(t.schema, t.table) === k)!
      sorted.push(tableData)
      for (const [other, d] of fkDeps) {
        if (d.has(k)) {
          d.delete(k)
          inDegree.set(other, (inDegree.get(other) ?? 1) - 1)
          if (inDegree.get(other) === 0) queue.push(other)
        }
      }
    }
    for (const t of tablesToRestore) {
      if (!sorted.includes(t)) sorted.push(t)
    }

    let totalRowsInserted = 0
    let tablesDone = 0

    sendProgress({ phase: 'preparing', tablesTotal: sorted.length, tablesDone: 0, rowsInserted: 0 })

    try {
      await client.query('BEGIN')
      await client.query('SET CONSTRAINTS ALL DEFERRED')

      for (const tableData of sorted) {
        // Resolve pipeline transform for this table
        const transform = pipelineTransforms?.find(
          (pt) => pt.sourceSchema === tableData.schema && pt.sourceTable === tableData.table
        )

        // Target table may differ when pipeline has mapping
        const targetSchema = transform?.targetSchema ?? tableData.schema
        const targetTable = transform?.targetTable ?? tableData.table
        const qualifiedTable = `"${targetSchema}"."${targetTable}"`

        sendProgress({
          phase: 'restoring',
          currentTable: `${targetSchema}.${targetTable}`,
          tablesTotal: sorted.length,
          tablesDone,
          rowsInserted: totalRowsInserted
        })

        if (tableData.rows.length === 0) {
          tablesDone++
          continue
        }

        // Apply row filter if pipeline specifies one
        let rows = tableData.rows
        if (transform?.rowFilter) {
          // Row filter is applied server-side: we create a temp approach
          // For simplicity, evaluate filter client-side is not safe, so we skip rows
          // that don't match by inserting all and relying on the WHERE expression
          // Actually, row filter is a SQL WHERE — we'll apply it by querying a VALUES CTE
          // For now, insert all rows (row filter in expressions is for advanced use)
          // TODO: If needed, implement CTE-based filtering
        }

        if (transform && transform.columnMappings.length > 0) {
          // ── Pipeline-aware insert ──
          // Build source column list (columns we need from snapshot rows)
          const sourceColSet = new Set<string>()
          for (const m of transform.columnMappings) {
            sourceColSet.add(m.sourceColumn)
            // If expression contains $source references, extract them
            if (m.expression) {
              const matches = m.expression.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g)
              for (const match of matches) {
                sourceColSet.add(match[1])
              }
            }
          }
          const sourceColumns = [...sourceColSet]

          // Target columns = mapped target columns + default value columns
          const mappedTargetCols = transform.columnMappings.map((m) => m.targetColumn)
          const defaultCols = Object.keys(transform.defaultValues).filter(
            (c) => !mappedTargetCols.includes(c)
          )
          const allTargetCols = [...mappedTargetCols, ...defaultCols]
          const quotedTargetCols = allTargetCols.map((c) => `"${c}"`)

          // Get PK columns for the target table (from live schema)
          // We need to query the target to know PKs for upsert
          let targetPkColumns: string[] = []
          try {
            const pkRes = await client.query(
              `SELECT ku.column_name
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage ku
                 ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
               WHERE tc.constraint_type = 'PRIMARY KEY'
                 AND tc.table_schema = $1 AND tc.table_name = $2`,
              [targetSchema, targetTable]
            )
            targetPkColumns = pkRes.rows.map((r: { column_name: string }) => r.column_name)
          } catch { /* fallback: no PK info */ }

          if (options.conflictStrategy === 'replace') {
            await client.query(`DELETE FROM ${qualifiedTable}`)
          }

          for (const row of rows) {
            // Build parameter values from source columns
            const paramValues = sourceColumns.map((col) => row[col])

            // Build value expressions for each target column
            const valueExpressions: string[] = []

            for (const mapping of transform.columnMappings) {
              if (mapping.expression) {
                // Replace $columnName references with parameter placeholders
                let expr = mapping.expression
                // Replace $source with the single source column's parameter
                if (expr === '$source' || expr.trim().startsWith('$source::')) {
                  const paramIdx = sourceColumns.indexOf(mapping.sourceColumn) + 1
                  expr = expr.replace('$source', `$${paramIdx}`)
                } else {
                  // Replace all $colName references
                  for (const srcCol of sourceColumns) {
                    const paramIdx = sourceColumns.indexOf(srcCol) + 1
                    expr = expr.replace(new RegExp(`\\$${srcCol}\\b`, 'g'), `$${paramIdx}`)
                  }
                }
                valueExpressions.push(expr)
              } else {
                const paramIdx = sourceColumns.indexOf(mapping.sourceColumn) + 1
                valueExpressions.push(`$${paramIdx}`)
              }
            }

            // Add default values for non-mapped columns
            for (const col of defaultCols) {
              const defVal = transform.defaultValues[col]
              valueExpressions.push(defVal === 'NULL' ? 'NULL' : defVal)
            }

            // Build and execute query
            if (options.conflictStrategy === 'upsert' && targetPkColumns.length > 0) {
              const pkQuoted = targetPkColumns.map((c) => `"${c}"`)
              const updateCols = allTargetCols.filter((c) => !targetPkColumns.includes(c))
              const updateSet = updateCols.map((c, idx) => {
                const valIdx = allTargetCols.indexOf(c)
                return `"${c}" = ${valueExpressions[valIdx]}`
              })
              const onConflict = updateSet.length > 0
                ? `ON CONFLICT (${pkQuoted.join(', ')}) DO UPDATE SET ${updateSet.join(', ')}`
                : `ON CONFLICT (${pkQuoted.join(', ')}) DO NOTHING`

              await client.query(
                `INSERT INTO ${qualifiedTable} (${quotedTargetCols.join(', ')}) VALUES (${valueExpressions.join(', ')}) ${onConflict}`,
                paramValues
              )
            } else if (options.conflictStrategy === 'skip' && targetPkColumns.length > 0) {
              const pkQuoted = targetPkColumns.map((c) => `"${c}"`)
              await client.query(
                `INSERT INTO ${qualifiedTable} (${quotedTargetCols.join(', ')}) VALUES (${valueExpressions.join(', ')}) ON CONFLICT (${pkQuoted.join(', ')}) DO NOTHING`,
                paramValues
              )
            } else {
              await client.query(
                `INSERT INTO ${qualifiedTable} (${quotedTargetCols.join(', ')}) VALUES (${valueExpressions.join(', ')})`,
                paramValues
              )
            }
            totalRowsInserted++
          }
        } else {
          // ── Standard insert (no pipeline or empty mappings) ──
          const columnNames = tableData.columns.map((c) => c.name)
          const pkColumns = tableData.primaryKey

          if (options.conflictStrategy === 'replace') {
            await client.query(`DELETE FROM ${qualifiedTable}`)
          }

          for (const row of rows) {
            const values = columnNames.map((col) => row[col])
            const placeholders = values.map((_, i) => `$${i + 1}`)
            const quotedCols = columnNames.map((c) => `"${c}"`)

            if (options.conflictStrategy === 'upsert' && pkColumns.length > 0) {
              const pkQuoted = pkColumns.map((c) => `"${c}"`)
              const updateCols = columnNames.filter((c) => !pkColumns.includes(c))
              const updateSet = updateCols.map((c) => {
                const paramIdx = columnNames.indexOf(c) + 1
                return `"${c}" = $${paramIdx}`
              })
              const onConflict = updateSet.length > 0
                ? `ON CONFLICT (${pkQuoted.join(', ')}) DO UPDATE SET ${updateSet.join(', ')}`
                : `ON CONFLICT (${pkQuoted.join(', ')}) DO NOTHING`

              await client.query(
                `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ${onConflict}`,
                values
              )
            } else if (options.conflictStrategy === 'skip' && pkColumns.length > 0) {
              const pkQuoted = pkColumns.map((c) => `"${c}"`)
              await client.query(
                `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${pkQuoted.join(', ')}) DO NOTHING`,
                values
              )
            } else {
              await client.query(
                `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
                values
              )
            }
            totalRowsInserted++
          }
        }

        tablesDone++
      }

      // Reset sequences
      if (options.resetSequences) {
        sendProgress({
          phase: 'sequences',
          tablesTotal: sorted.length,
          tablesDone,
          rowsInserted: totalRowsInserted
        })

        for (const tableData of sorted) {
          const transform = pipelineTransforms?.find(
            (pt) => pt.sourceSchema === tableData.schema && pt.sourceTable === tableData.table
          )
          const targetSchema = transform?.targetSchema ?? tableData.schema
          const targetTable = transform?.targetTable ?? tableData.table

          const pkCols = tableData.primaryKey
          if (pkCols.length !== 1) continue

          const pkCol = pkCols[0]
          // Map PK column through pipeline if needed
          const targetPkCol = transform?.columnMappings.find((m) => m.sourceColumn === pkCol)?.targetColumn ?? pkCol

          const qualifiedTable = `"${targetSchema}"."${targetTable}"`
          try {
            const seqRes = await client.query(
              `SELECT pg_get_serial_sequence('${targetSchema}.${targetTable}', '${targetPkCol}') as seq`
            )
            const seqName = seqRes.rows[0]?.seq
            if (seqName) {
              await client.query(
                `SELECT setval('${seqName}', COALESCE((SELECT MAX("${targetPkCol}") FROM ${qualifiedTable}), 1))`
              )
            }
          } catch { /* no sequence for this column */ }
        }
      }

      await client.query('COMMIT')

      sendProgress({
        phase: 'done',
        tablesTotal: sorted.length,
        tablesDone: sorted.length,
        rowsInserted: totalRowsInserted
      })

      return { success: true, rowsInserted: totalRowsInserted, tablesRestored: tablesDone }
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => {})
      const msg = err instanceof Error ? err.message : String(err)
      sendProgress({
        phase: 'error',
        tablesTotal: sorted.length,
        tablesDone,
        rowsInserted: totalRowsInserted,
        error: msg
      })
      return { success: false, error: msg }
    } finally {
      client.release()
    }
  })

  // ── Schema Diff ───────────────────────────────────────────────────────

  // Levenshtein distance for fuzzy column rename detection
  function levenshtein(a: string, b: string): number {
    const la = a.length, lb = b.length
    const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
      Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    )
    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
    return dp[la][lb]
  }

  // Type compatibility map: source → set of compatible targets
  const TYPE_COMPAT: Record<string, string[]> = {
    // PostgreSQL types
    int2: ['int4', 'int8', 'float4', 'float8', 'numeric', 'smallint', 'integer', 'bigint'],
    int4: ['int8', 'float8', 'numeric', 'integer', 'bigint'],
    int8: ['numeric', 'bigint'],
    float4: ['float8', 'numeric', 'real', 'double'],
    float8: ['numeric', 'double'],
    varchar: ['text', 'bpchar', 'char', 'longtext', 'mediumtext'],
    bpchar: ['text', 'varchar'],
    text: ['varchar', 'bpchar', 'longtext', 'mediumtext', 'TEXT'],
    bool: ['int2', 'int4', 'tinyint', 'boolean', 'INTEGER'],
    date: ['timestamp', 'timestamptz', 'datetime'],
    timestamp: ['timestamptz', 'datetime'],
    // MySQL types
    tinyint: ['smallint', 'int', 'int2', 'int4', 'INTEGER'],
    smallint: ['int', 'bigint', 'int4', 'int8', 'INTEGER'],
    int: ['bigint', 'int8', 'INTEGER'],
    bigint: ['int8', 'INTEGER'],
    float: ['double', 'decimal', 'float4', 'float8'],
    double: ['decimal', 'float8'],
    char: ['varchar', 'text', 'TEXT'],
    datetime: ['timestamp', 'timestamptz'],
    // SQLite types (very permissive)
    INTEGER: ['int', 'int4', 'int8', 'bigint', 'smallint', 'tinyint', 'numeric'],
    REAL: ['float', 'double', 'float4', 'float8', 'numeric', 'decimal'],
    TEXT: ['varchar', 'char', 'text', 'longtext'],
    BLOB: [],
  }

  function isAutoConvertible(srcType: string, dstType: string): boolean {
    if (srcType === dstType) return true
    return TYPE_COMPAT[srcType]?.includes(dstType) ?? false
  }

  ipcMain.handle('db:schema-diff', async (_e, data: {
    snapshotTables: Array<{
      schema: string; table: string
      columns: Array<{ name: string; type: string; nullable: boolean; defaultValue: string | null; isPrimaryKey: boolean; comment: string | null }>
      primaryKey: string[]
    }>
    targetConnection: DbConnectionEntry
  }) => {
    const entry = getOrCreatePoolEntry(data.targetConnection)
    const { pool, driver: diffDriver } = entry

    // Get all live tables
    const liveSchemaNames = await diffDriver.getSchemas(pool)
    const liveTables: { schema: string; name: string; columns: Array<{ name: string; type: string; nullable: boolean; defaultValue: string | null; isPrimaryKey: boolean; comment: string | null }> }[] = []
    for (const schema of liveSchemaNames) {
      const tables = await diffDriver.getTables(pool, schema)
      for (const t of tables) {
        if (t.type === 'table') {
          const cols = await diffDriver.getColumns(pool, schema, t.name)
          liveTables.push({ schema, name: t.name, columns: cols })
        }
      }
    }

    const liveTableKey = (schema: string, name: string) => `${schema}.${name}`
    const liveMap = new Map(liveTables.map((t) => [liveTableKey(t.schema, t.name), t]))

    type TableDiff = {
      snapshotTable: string; snapshotSchema: string
      liveTable: string | null; liveSchema: string | null
      status: 'identical' | 'modified' | 'removed' | 'added'
      columns: Array<{
        status: 'identical' | 'added' | 'removed' | 'renamed' | 'type-changed'
        snapshotColumn: { name: string; type: string; nullable: boolean; defaultValue: string | null; isPrimaryKey: boolean; comment: string | null } | null
        liveColumn: { name: string; type: string; nullable: boolean; defaultValue: string | null; isPrimaryKey: boolean; comment: string | null } | null
        confidence?: number
        autoConvertible?: boolean
      }>
      warnings: string[]
    }

    const tableDiffs: TableDiff[] = []
    const matchedLiveTables = new Set<string>()

    let identical = 0, modified = 0, removed = 0, added = 0

    for (const snapTable of data.snapshotTables) {
      const key = liveTableKey(snapTable.schema, snapTable.table)
      const live = liveMap.get(key)

      if (!live) {
        tableDiffs.push({
          snapshotTable: snapTable.table,
          snapshotSchema: snapTable.schema,
          liveTable: null, liveSchema: null,
          status: 'removed',
          columns: [],
          warnings: [`Table "${snapTable.schema}"."${snapTable.table}" n'existe plus dans la base cible`]
        })
        removed++
        continue
      }

      matchedLiveTables.add(key)

      // Compare columns
      const snapCols = new Map(snapTable.columns.map((c) => [c.name, c]))
      const liveCols = new Map(live.columns.map((c) => [c.name, c]))

      const colDiffs: TableDiff['columns'] = []
      const unmatchedSnap: string[] = []
      const unmatchedLive: string[] = []

      // Match by name
      for (const [name, snapCol] of snapCols) {
        const liveCol = liveCols.get(name)
        if (liveCol) {
          if (snapCol.type === liveCol.type) {
            colDiffs.push({ status: 'identical', snapshotColumn: snapCol, liveColumn: liveCol })
          } else {
            colDiffs.push({
              status: 'type-changed',
              snapshotColumn: snapCol,
              liveColumn: liveCol,
              autoConvertible: isAutoConvertible(snapCol.type, liveCol.type)
            })
          }
        } else {
          unmatchedSnap.push(name)
        }
      }

      for (const name of liveCols.keys()) {
        if (!snapCols.has(name)) {
          unmatchedLive.push(name)
        }
      }

      // Fuzzy match removed vs added for renames
      const usedLive = new Set<string>()
      for (const snapName of unmatchedSnap) {
        const snapCol = snapCols.get(snapName)!
        let bestMatch: { name: string; confidence: number } | null = null

        for (const liveName of unmatchedLive) {
          if (usedLive.has(liveName)) continue
          const liveCol = liveCols.get(liveName)!

          // Same type or compatible type + similar name → likely rename
          const typeMatch = snapCol.type === liveCol.type || isAutoConvertible(snapCol.type, liveCol.type)
          if (!typeMatch) continue

          const maxLen = Math.max(snapName.length, liveName.length)
          const dist = levenshtein(snapName.toLowerCase(), liveName.toLowerCase())
          const similarity = maxLen > 0 ? 1 - dist / maxLen : 1

          if (similarity > 0.4 && (!bestMatch || similarity > bestMatch.confidence)) {
            bestMatch = { name: liveName, confidence: similarity }
          }
        }

        if (bestMatch && bestMatch.confidence >= 0.4) {
          usedLive.add(bestMatch.name)
          colDiffs.push({
            status: 'renamed',
            snapshotColumn: snapCol,
            liveColumn: liveCols.get(bestMatch.name)!,
            confidence: Math.round(bestMatch.confidence * 100) / 100,
            autoConvertible: isAutoConvertible(snapCol.type, liveCols.get(bestMatch.name)!.type)
          })
        } else {
          colDiffs.push({ status: 'removed', snapshotColumn: snapCol, liveColumn: null })
        }
      }

      // Remaining unmatched live columns → added
      for (const liveName of unmatchedLive) {
        if (!usedLive.has(liveName)) {
          colDiffs.push({ status: 'added', snapshotColumn: null, liveColumn: liveCols.get(liveName)! })
        }
      }

      const warnings: string[] = []
      const hasChanges = colDiffs.some((c) => c.status !== 'identical')

      if (hasChanges) {
        const removedCols = colDiffs.filter((c) => c.status === 'removed')
        if (removedCols.length > 0) {
          warnings.push(`${removedCols.length} colonne(s) du snapshot absente(s) de la cible (seront ignorées)`)
        }
        tableDiffs.push({
          snapshotTable: snapTable.table, snapshotSchema: snapTable.schema,
          liveTable: live.name, liveSchema: live.schema,
          status: 'modified', columns: colDiffs, warnings
        })
        modified++
      } else {
        tableDiffs.push({
          snapshotTable: snapTable.table, snapshotSchema: snapTable.schema,
          liveTable: live.name, liveSchema: live.schema,
          status: 'identical', columns: colDiffs, warnings
        })
        identical++
      }
    }

    // Live tables not in snapshot → added
    for (const [key, live] of liveMap) {
      if (!matchedLiveTables.has(key)) {
        tableDiffs.push({
          snapshotTable: live.name, snapshotSchema: live.schema,
          liveTable: live.name, liveSchema: live.schema,
          status: 'added', columns: [], warnings: []
        })
        added++
      }
    }

    return { tables: tableDiffs, summary: { identical, modified, removed, added } }
  })

  // ── Pipelines CRUD ────────────────────────────────────────────────────

  const pipelinesDir = () => join(app.getPath('userData'), 'db-pipelines')

  ipcMain.handle('db:pipeline:list', async () => {
    const dir = pipelinesDir()
    await mkdir(dir, { recursive: true })
    const files = await readdir(dir)
    const pipelines = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(dir, file), 'utf-8')
        pipelines.push(JSON.parse(raw))
      } catch { /* skip corrupt */ }
    }
    pipelines.sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt)
    return pipelines
  })

  ipcMain.handle('db:pipeline:get', async (_e, pipelineId: string) => {
    try {
      const raw = await readFile(join(pipelinesDir(), `${pipelineId}.json`), 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('db:pipeline:save', async (_e, pipeline: {
    id: string; name: string; description?: string; profileId: string
    sourceSnapshotId?: string; tableTransforms: unknown[]
    createdAt: number; updatedAt: number
  }) => {
    const dir = pipelinesDir()
    await mkdir(dir, { recursive: true })
    const saved = { ...pipeline, updatedAt: Date.now() }
    if (!saved.createdAt) saved.createdAt = Date.now()
    await writeFile(join(dir, `${saved.id}.json`), JSON.stringify(saved, null, 2), 'utf-8')
    return saved
  })

  ipcMain.handle('db:pipeline:delete', async (_e, pipelineId: string) => {
    try {
      await unlink(join(pipelinesDir(), `${pipelineId}.json`))
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Data Sets CRUD ────────────────────────────────────────────────────

  const datasetsDir = () => join(app.getPath('userData'), 'db-datasets')

  ipcMain.handle('db:dataset:list', async () => {
    const dir = datasetsDir()
    await mkdir(dir, { recursive: true })
    const files = await readdir(dir)
    const datasets = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(dir, file), 'utf-8')
        datasets.push(JSON.parse(raw))
      } catch { /* skip corrupt */ }
    }
    datasets.sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt)
    return datasets
  })

  ipcMain.handle('db:dataset:get', async (_e, datasetId: string) => {
    try {
      const raw = await readFile(join(datasetsDir(), `${datasetId}.json`), 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('db:dataset:save', async (_e, dataset: {
    id: string; name: string; description?: string; profileId: string
    snapshotId: string; pipelineId?: string; targetConnectionId?: string
    conflictStrategy: string; resetSequences: boolean
    createdAt: number; updatedAt: number
  }) => {
    const dir = datasetsDir()
    await mkdir(dir, { recursive: true })
    const saved = { ...dataset, updatedAt: Date.now() }
    if (!saved.createdAt) saved.createdAt = Date.now()
    await writeFile(join(dir, `${saved.id}.json`), JSON.stringify(saved, null, 2), 'utf-8')
    return saved
  })

  ipcMain.handle('db:dataset:delete', async (_e, datasetId: string) => {
    try {
      await unlink(join(datasetsDir(), `${datasetId}.json`))
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Saved Queries CRUD ─────────────────────────────────────────────

  const savedQueriesDir = () => join(app.getPath('userData'), 'db-saved-queries')

  ipcMain.handle('db:saved-query:list', async () => {
    const dir = savedQueriesDir()
    await mkdir(dir, { recursive: true })
    const files = await readdir(dir)
    const queries = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(dir, file), 'utf-8')
        queries.push(JSON.parse(raw))
      } catch { /* skip corrupt */ }
    }
    queries.sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt)
    return queries
  })

  ipcMain.handle('db:saved-query:save', async (_e, query: {
    id: string; name: string; sql: string; profileId: string
    connectionId?: string; createdAt: number; updatedAt: number
  }) => {
    const dir = savedQueriesDir()
    await mkdir(dir, { recursive: true })
    const saved = { ...query, updatedAt: Date.now() }
    if (!saved.createdAt) saved.createdAt = Date.now()
    await writeFile(join(dir, `${saved.id}.json`), JSON.stringify(saved, null, 2), 'utf-8')
    return saved
  })

  ipcMain.handle('db:saved-query:delete', async (_e, queryId: string) => {
    try {
      await unlink(join(savedQueriesDir(), `${queryId}.json`))
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Row Mutations (Inline Editing) ─────────────────────────────────

  ipcMain.handle('db:row:update', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    primaryKey: Record<string, unknown>
    changes: Record<string, unknown>
  }) => {
    const entry = getOrCreatePoolEntry(data.connection)
    const { pool, driver } = entry
    const q = driver.quoteIdentifier.bind(driver)
    const ph = driver.paramPlaceholder.bind(driver)
    const pkCols = Object.keys(data.primaryKey)
    const changeCols = Object.keys(data.changes)
    if (pkCols.length === 0 || changeCols.length === 0) {
      return { success: false, error: 'No primary key or changes provided' }
    }
    const setClauses = changeCols.map((c, i) => `${q(c)} = ${ph(i + 1)}`)
    const whereClauses = pkCols.map((c, i) => `${q(c)} = ${ph(changeCols.length + i + 1)}`)
    const qualifiedTable = data.connection.type === 'sqlite'
      ? q(data.table)
      : `${q(data.schema)}.${q(data.table)}`
    const values = [...changeCols.map((c) => data.changes[c]), ...pkCols.map((c) => data.primaryKey[c])]
    const sql = `UPDATE ${qualifiedTable} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`
    try {
      const res = await driver.query(pool, sql, values)
      return { success: true, affectedRows: res.rowCount }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('db:row:insert', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    row: Record<string, unknown>
  }) => {
    const entry = getOrCreatePoolEntry(data.connection)
    const { pool, driver } = entry
    const q = driver.quoteIdentifier.bind(driver)
    const ph = driver.paramPlaceholder.bind(driver)
    const cols = Object.keys(data.row)
    if (cols.length === 0) return { success: false, error: 'No columns provided' }
    const quotedCols = cols.map(q)
    const placeholders = cols.map((_, i) => ph(i + 1))
    const qualifiedTable = data.connection.type === 'sqlite'
      ? q(data.table)
      : `${q(data.schema)}.${q(data.table)}`
    const values = cols.map((c) => data.row[c])
    const sql = `INSERT INTO ${qualifiedTable} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`
    try {
      const res = await driver.query(pool, sql, values)
      return { success: true, affectedRows: res.rowCount }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Schema Mutations (drop constraints / indexes) ─────────────────────────

  // Drop an index by name.
  // For MySQL we need the table name (ALTER TABLE ... DROP INDEX) ;
  // for PG / SQLite we use DROP INDEX directly with schema qualification.
  ipcMain.handle('db:index:drop', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    indexName: string
  }) => {
    try {
      const entry = getOrCreatePoolEntry(data.connection)
      const { pool, driver } = entry
      const q = driver.quoteIdentifier.bind(driver)
      let sql: string
      if (data.connection.type === 'mysql') {
        sql = `ALTER TABLE ${q(data.schema)}.${q(data.table)} DROP INDEX ${q(data.indexName)}`
      } else if (data.connection.type === 'sqlite') {
        sql = `DROP INDEX ${q(data.indexName)}`
      } else {
        // PostgreSQL : l'index vit dans le même schéma que la table
        sql = `DROP INDEX ${q(data.schema)}.${q(data.indexName)}`
      }
      await driver.query(pool, sql)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Drop a foreign key constraint
  ipcMain.handle('db:fk:drop', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    constraintName: string
  }) => {
    try {
      const entry = getOrCreatePoolEntry(data.connection)
      const { pool, driver } = entry
      const q = driver.quoteIdentifier.bind(driver)
      const qualified = data.connection.type === 'sqlite'
        ? q(data.table)
        : `${q(data.schema)}.${q(data.table)}`
      let sql: string
      if (data.connection.type === 'mysql') {
        sql = `ALTER TABLE ${qualified} DROP FOREIGN KEY ${q(data.constraintName)}`
      } else if (data.connection.type === 'sqlite') {
        return { success: false, error: 'SQLite ne supporte pas DROP CONSTRAINT' }
      } else {
        sql = `ALTER TABLE ${qualified} DROP CONSTRAINT ${q(data.constraintName)}`
      }
      await driver.query(pool, sql)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Drop the primary key of a table
  ipcMain.handle('db:pk:drop', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
  }) => {
    try {
      const entry = getOrCreatePoolEntry(data.connection)
      const { pool, driver } = entry
      const q = driver.quoteIdentifier.bind(driver)
      const qualified = data.connection.type === 'sqlite'
        ? q(data.table)
        : `${q(data.schema)}.${q(data.table)}`
      if (data.connection.type === 'mysql') {
        await driver.query(pool, `ALTER TABLE ${qualified} DROP PRIMARY KEY`)
        return { success: true }
      }
      if (data.connection.type === 'sqlite') {
        return { success: false, error: 'SQLite ne supporte pas DROP PRIMARY KEY' }
      }
      // PostgreSQL : récupérer le nom de la contrainte PK puis DROP
      const lookup = await driver.query(
        pool,
        `SELECT tc.constraint_name
         FROM information_schema.table_constraints tc
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = $1 AND tc.table_name = $2
         LIMIT 1`,
        [data.schema, data.table]
      )
      const name = (lookup.rows[0] as { constraint_name?: string } | undefined)?.constraint_name
      if (!name) return { success: false, error: 'Aucune clé primaire trouvée' }
      await driver.query(pool, `ALTER TABLE ${qualified} DROP CONSTRAINT ${q(name)}`)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Schema Mutations (create constraints / indexes) ────────────────────

  // Create an index
  ipcMain.handle('db:index:create', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    name?: string
    columns: string[]
    unique: boolean
    method?: string // PG: btree/hash/gin/gist/...
  }) => {
    try {
      if (!Array.isArray(data.columns) || data.columns.length === 0) {
        return { success: false, error: 'Au moins une colonne requise' }
      }
      const entry = getOrCreatePoolEntry(data.connection)
      const { pool, driver } = entry
      const q = driver.quoteIdentifier.bind(driver)
      const colList = data.columns.map(q).join(', ')
      const uniqueKw = data.unique ? 'UNIQUE ' : ''
      const autoName = data.name?.trim()
        ? data.name.trim()
        : `${data.table}_${data.columns.join('_')}_${data.unique ? 'uq' : 'idx'}`
      let sql: string
      if (data.connection.type === 'mysql') {
        sql = `CREATE ${uniqueKw}INDEX ${q(autoName)} ON ${q(data.schema)}.${q(data.table)} (${colList})`
      } else if (data.connection.type === 'sqlite') {
        sql = `CREATE ${uniqueKw}INDEX ${q(autoName)} ON ${q(data.table)} (${colList})`
      } else {
        // PostgreSQL : méthode d'index optionnelle
        const using = data.method && data.method.trim() ? ` USING ${data.method.trim()}` : ''
        sql = `CREATE ${uniqueKw}INDEX ${q(autoName)} ON ${q(data.schema)}.${q(data.table)}${using} (${colList})`
      }
      await driver.query(pool, sql)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Create a foreign key
  ipcMain.handle('db:fk:create', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    name?: string
    column: string
    referencedSchema: string
    referencedTable: string
    referencedColumn: string
    onDelete?: 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT'
    onUpdate?: 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT'
  }) => {
    try {
      if (data.connection.type === 'sqlite') {
        return { success: false, error: 'SQLite ne supporte pas ADD CONSTRAINT via ALTER TABLE' }
      }
      if (!data.column || !data.referencedTable || !data.referencedColumn) {
        return { success: false, error: 'Colonnes source et cible requises' }
      }
      const entry = getOrCreatePoolEntry(data.connection)
      const { pool, driver } = entry
      const q = driver.quoteIdentifier.bind(driver)
      const qualified = `${q(data.schema)}.${q(data.table)}`
      const refQualified = data.referencedSchema
        ? `${q(data.referencedSchema)}.${q(data.referencedTable)}`
        : q(data.referencedTable)
      const autoName = data.name?.trim()
        ? data.name.trim()
        : `${data.table}_${data.column}_fkey`
      const onDelete = data.onDelete ? ` ON DELETE ${data.onDelete}` : ''
      const onUpdate = data.onUpdate ? ` ON UPDATE ${data.onUpdate}` : ''
      const sql = `ALTER TABLE ${qualified} ADD CONSTRAINT ${q(autoName)} FOREIGN KEY (${q(data.column)}) REFERENCES ${refQualified} (${q(data.referencedColumn)})${onDelete}${onUpdate}`
      await driver.query(pool, sql)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Create a primary key
  ipcMain.handle('db:pk:create', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    name?: string
    columns: string[]
  }) => {
    try {
      if (data.connection.type === 'sqlite') {
        return { success: false, error: 'SQLite ne supporte pas ADD PRIMARY KEY via ALTER TABLE' }
      }
      if (!Array.isArray(data.columns) || data.columns.length === 0) {
        return { success: false, error: 'Au moins une colonne requise' }
      }
      const entry = getOrCreatePoolEntry(data.connection)
      const { pool, driver } = entry
      const q = driver.quoteIdentifier.bind(driver)
      const qualified = `${q(data.schema)}.${q(data.table)}`
      const colList = data.columns.map(q).join(', ')
      let sql: string
      if (data.connection.type === 'mysql') {
        // MySQL : nom PK toujours "PRIMARY", ignoré
        sql = `ALTER TABLE ${qualified} ADD PRIMARY KEY (${colList})`
      } else {
        // PostgreSQL
        const autoName = data.name?.trim() ? data.name.trim() : `${data.table}_pkey`
        sql = `ALTER TABLE ${qualified} ADD CONSTRAINT ${q(autoName)} PRIMARY KEY (${colList})`
      }
      await driver.query(pool, sql)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('db:row:delete', async (_e, data: {
    connection: DbConnectionEntry
    schema: string
    table: string
    primaryKey: Record<string, unknown>
  }) => {
    const entry = getOrCreatePoolEntry(data.connection)
    const { pool, driver } = entry
    const q = driver.quoteIdentifier.bind(driver)
    const ph = driver.paramPlaceholder.bind(driver)
    const pkCols = Object.keys(data.primaryKey)
    if (pkCols.length === 0) return { success: false, error: 'No primary key provided' }
    const whereClauses = pkCols.map((c, i) => `${q(c)} = ${ph(i + 1)}`)
    const qualifiedTable = data.connection.type === 'sqlite'
      ? q(data.table)
      : `${q(data.schema)}.${q(data.table)}`
    const values = pkCols.map((c) => data.primaryKey[c])
    const sql = `DELETE FROM ${qualifiedTable} WHERE ${whereClauses.join(' AND ')}`
    try {
      const res = await driver.query(pool, sql, values)
      return { success: true, affectedRows: res.rowCount }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Monitoring ────────────────────────────────────────────────────────

  ipcMain.handle('db:monitor:stats', async (_e, conn: DbConnectionEntry) => {
    const entry = getOrCreatePoolEntry(conn)
    const { pool, driver } = entry

    let tableSizes: Array<{ schema: string; table: string; totalSize: string; totalSizeBytes: number; rowEstimate: number }> = []
    try {
      if (driver.getTableSizes) tableSizes = await driver.getTableSizes(pool)
    } catch { /* non-critical */ }

    let activeConnections: Array<{ pid: number; database: string; username: string; state: string; query: string; duration: string; clientAddr: string }> = []
    try {
      if (driver.getActiveConnections) activeConnections = await driver.getActiveConnections(pool)
    } catch { /* non-critical */ }

    const poolStats = driver.getPoolStats
      ? driver.getPoolStats(pool)
      : { total: 0, idle: 0, waiting: 0 }

    let serverVersion = 'Unknown'
    try {
      if (driver.getServerVersion) serverVersion = await driver.getServerVersion(pool)
    } catch { /* non-critical */ }

    return sanitizeForIpc({ tableSizes, activeConnections, poolStats, serverVersion })
  })

  ipcMain.handle('db:dataset:check-status', async (_e, datasetId: string, targetConnection?: DbConnectionEntry) => {
    const warnings: string[] = []

    // Load dataset
    let dataset: { snapshotId: string; pipelineId?: string }
    try {
      const raw = await readFile(join(datasetsDir(), `${datasetId}.json`), 'utf-8')
      dataset = JSON.parse(raw)
    } catch {
      return { snapshotExists: false, pipelineExists: false, schemaCompatible: null, warnings: ['Data set introuvable'] }
    }

    // Check snapshot exists
    let snapshotExists = false
    try {
      await readFile(join(snapshotsDir(), `${dataset.snapshotId}.json`), 'utf-8')
      snapshotExists = true
    } catch {
      warnings.push('Le snapshot source a été supprimé')
    }

    // Check pipeline exists
    let pipelineExists = true
    if (dataset.pipelineId) {
      try {
        await readFile(join(pipelinesDir(), `${dataset.pipelineId}.json`), 'utf-8')
      } catch {
        pipelineExists = false
        warnings.push('Le pipeline associé a été supprimé')
      }
    }

    // Schema compatibility check (optional, if connection provided)
    let schemaCompatible: boolean | null = null
    if (targetConnection && snapshotExists) {
      try {
        const snapRaw = await readFile(join(snapshotsDir(), `${dataset.snapshotId}.json`), 'utf-8')
        const snapData = JSON.parse(snapRaw)
        const checkEntry = getOrCreatePoolEntry(targetConnection)

        // Quick check: verify all snapshot tables exist in live DB
        const liveSchemaNames = await checkEntry.driver.getSchemas(checkEntry.pool)
        const liveTables = new Set<string>()
        for (const schema of liveSchemaNames) {
          const tables = await checkEntry.driver.getTables(checkEntry.pool, schema)
          for (const t of tables) {
            liveTables.add(`${schema}.${t.name}`)
          }
        }

        const missingTables = snapData.tables.filter(
          (t: { schema: string; table: string }) => !liveTables.has(`${t.schema}.${t.table}`)
        )

        schemaCompatible = missingTables.length === 0
        if (!schemaCompatible) {
          warnings.push(`${missingTables.length} table(s) du snapshot absente(s) de la cible`)
        }
      } catch {
        warnings.push('Impossible de vérifier la compatibilité du schéma')
      }
    }

    return { snapshotExists, pipelineExists, schemaCompatible, warnings }
  })
}

// ── Cleanup on app quit ─────────────────────────────────────────────────────

app.on('before-quit', () => {
  closeAllPools()
})

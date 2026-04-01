import type {
  DbConnectionEntry,
  DbProfile,
  DatabaseSchema,
  TableInfo,
  QueryResult,
  ConnectionTestResult,
  QueryHistoryEntry,
  ExportFormat,
  SnapshotMetadata,
  SnapshotData,
  SnapshotCreateOptions,
  RestoreOptions
} from '@shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ipc = (window as any).electron.ipcRenderer

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipc.invoke(channel, ...args)
}

// ── Profiles ────────────────────────────────────────────────────────────────

export type PublicProfile = { id: string; name: string; connections: DbConnectionEntry[]; createdAt: number }

export const listDbProfiles = () => invoke<PublicProfile[]>('db:profile:list')

export const saveDbProfile = (profile: PublicProfile) =>
  invoke<PublicProfile[]>('db:profile:save', profile)

export const deleteDbProfile = (profileId: string) =>
  invoke<PublicProfile[]>('db:profile:delete', profileId)

// ── Connection ──────────────────────────────────────────────────────────────

export const testConnection = (conn: DbConnectionEntry) =>
  invoke<ConnectionTestResult>('db:test-connection', conn)

export const connectToDb = (conn: DbConnectionEntry) =>
  invoke<{ success: boolean; message?: string }>('db:connect', conn)

export const disconnectFromDb = (conn: DbConnectionEntry) =>
  invoke<{ success: boolean }>('db:disconnect', conn)

// ── Schema ──────────────────────────────────────────────────────────────────

export const getSchemas = (conn: DbConnectionEntry) =>
  invoke<DatabaseSchema>('db:schemas', conn)

export const getTableDetails = (conn: DbConnectionEntry, schema: string, table: string) =>
  invoke<TableInfo>('db:table-details', conn, schema, table)

// ── Query ───────────────────────────────────────────────────────────────────

export const executeQuery = (conn: DbConnectionEntry, sql: string) =>
  invoke<QueryResult>('db:query', conn, sql)

// ── History ────────────────────────────────────────────────────────────────

export const loadHistory = () => invoke<QueryHistoryEntry[]>('db:history:load')

export const saveHistory = (entries: QueryHistoryEntry[]) =>
  invoke<void>('db:history:save', entries)

// ── Export ──────────────────────────────────────────────────────────────────

export const exportData = (data: {
  columns: string[]
  rows: Record<string, unknown>[]
  format: ExportFormat
  defaultName?: string
}) => invoke<{ success: boolean; filePath?: string }>('db:export', data)

// ── Snapshots ─────────────────────────────────────────────────────────────

export const listSnapshots = () => invoke<SnapshotMetadata[]>('db:snapshot:list')

export const getSnapshot = (snapshotId: string) =>
  invoke<SnapshotData | null>('db:snapshot:get', snapshotId)

export const deleteSnapshot = (snapshotId: string) =>
  invoke<{ success: boolean; error?: string }>('db:snapshot:delete', snapshotId)

export const createSnapshot = (options: SnapshotCreateOptions) =>
  invoke<SnapshotMetadata>('db:snapshot:create', options)

// ── Restore ───────────────────────────────────────────────────────────────

export const executeRestore = (options: RestoreOptions) =>
  invoke<{ success: boolean; rowsInserted?: number; tablesRestored?: number; error?: string }>('db:restore:execute', options)

// ── Event listeners ───────────────────────────────────────────────────────

export const onSnapshotProgress = (callback: (progress: { table: string; done: number; total: number }) => void) =>
  ipc.on('db:snapshot:progress', callback)

export const onRestoreProgress = (callback: (progress: Record<string, unknown>) => void) =>
  ipc.on('db:restore:progress', callback)

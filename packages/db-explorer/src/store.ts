import { create } from 'zustand'
import type {
  DbConnectionEntry,
  DatabaseSchema,
  TableInfo,
  QueryResult,
  ConnectionStatus,
  ConnectionTestResult,
  QueryTab,
  QueryHistoryEntry,
  DataBrowserFilter,
  PageSize,
  ExportFormat,
  SnapshotMetadata,
  SnapshotData,
  SnapshotCreateOptions,
  RestoreOptions,
  RestoreProgress
} from '@shared/types'
import type { PublicProfile } from './services/db-ipc'
import * as dbIpc from './services/db-ipc'

// ── View Types ──────────────────────────────────────────────────────────────

export type DbView = 'profiles' | 'explorer' | 'snapshots'
export type DetailTab = 'columns' | 'foreignKeys' | 'indexes'
export type ExplorerPanel = 'query' | 'data-browser'

interface ConnectionState {
  status: ConnectionStatus
  testResult?: ConnectionTestResult
}

// ── Helpers ─────────────────────────────────────────────────────────────────

let tabCounter = 0
function createTab(connectionId: string | null): QueryTab {
  tabCounter++
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    title: `Query ${tabCounter}`,
    connectionId,
    query: '',
    result: null,
    loading: false
  }
}

const MAX_HISTORY = 200

// ── Store ───────────────────────────────────────────────────────────────────

interface DbExplorerStore {
  // View
  view: DbView
  setView: (view: DbView) => void
  explorerPanel: ExplorerPanel
  setExplorerPanel: (panel: ExplorerPanel) => void

  // Profiles
  profiles: PublicProfile[]
  activeProfileId: string | null
  loadProfiles: () => Promise<void>
  saveProfile: (profile: PublicProfile) => Promise<void>
  deleteProfile: (profileId: string) => Promise<void>
  setActiveProfileId: (id: string | null) => void

  // Connections
  connectionStates: Record<string, ConnectionState>
  activeConnectionId: string | null
  setActiveConnectionId: (id: string | null) => void
  testConnection: (conn: DbConnectionEntry) => Promise<ConnectionTestResult>
  connectToDb: (conn: DbConnectionEntry) => Promise<boolean>
  disconnectFromDb: (conn: DbConnectionEntry) => Promise<void>
  testAllConnections: (connections: DbConnectionEntry[]) => Promise<void>

  // Schema
  schemas: Record<string, DatabaseSchema>
  loadSchemas: (conn: DbConnectionEntry) => Promise<void>
  selectedSchema: string | null
  setSelectedSchema: (schema: string | null) => void
  selectedTable: string | null
  setSelectedTable: (table: string | null) => void
  tableDetails: Record<string, TableInfo>
  loadTableDetails: (conn: DbConnectionEntry, schema: string, table: string) => Promise<void>
  detailTab: DetailTab
  setDetailTab: (tab: DetailTab) => void

  // Query Tabs
  tabs: QueryTab[]
  activeTabId: string | null
  addTab: () => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabQuery: (tabId: string, query: string) => void
  renameTab: (tabId: string, title: string) => void
  executeTabQuery: (tabId: string, conn: DbConnectionEntry) => Promise<void>

  // Query History
  history: QueryHistoryEntry[]
  historyLoaded: boolean
  loadHistory: () => Promise<void>
  addHistoryEntry: (entry: QueryHistoryEntry) => void
  clearHistory: (connectionId?: string) => void
  showHistory: boolean
  setShowHistory: (show: boolean) => void

  // Data Browser
  dataBrowserSchema: string | null
  dataBrowserTable: string | null
  dataBrowserFilters: DataBrowserFilter[]
  dataBrowserSortColumn: string | null
  dataBrowserSortDir: 'asc' | 'desc'
  dataBrowserPage: number
  dataBrowserPageSize: PageSize
  dataBrowserResult: QueryResult | null
  dataBrowserLoading: boolean
  dataBrowserTotalRows: number
  setDataBrowserTarget: (schema: string, table: string) => void
  setDataBrowserFilters: (filters: DataBrowserFilter[]) => void
  setDataBrowserSort: (column: string | null, dir: 'asc' | 'desc') => void
  setDataBrowserPage: (page: number) => void
  setDataBrowserPageSize: (size: PageSize) => void
  loadDataBrowserPage: (conn: DbConnectionEntry) => Promise<void>

  // Export
  exportResults: (columns: string[], rows: Record<string, unknown>[], format: ExportFormat, defaultName?: string) => Promise<void>

  // Schema filter
  schemaFilter: string
  setSchemaFilter: (filter: string) => void

  // Snapshots
  snapshots: SnapshotMetadata[]
  snapshotsLoaded: boolean
  snapshotCreating: boolean
  snapshotProgress: { table: string; done: number; total: number } | null
  loadSnapshots: () => Promise<void>
  createSnapshot: (options: SnapshotCreateOptions) => Promise<SnapshotMetadata | null>
  deleteSnapshot: (snapshotId: string) => Promise<boolean>
  getSnapshot: (snapshotId: string) => Promise<SnapshotData | null>

  // Restore
  restoreRunning: boolean
  restoreProgress: RestoreProgress | null
  executeRestore: (options: RestoreOptions) => Promise<boolean>
}

export const useDbExplorerStore = create<DbExplorerStore>()((set, get) => ({
  // View
  view: 'profiles',
  setView: (view) => set({ view }),
  explorerPanel: 'query',
  setExplorerPanel: (panel) => set({ explorerPanel: panel }),

  // Profiles
  profiles: [],
  activeProfileId: null,
  loadProfiles: async () => {
    const profiles = await dbIpc.listDbProfiles()
    set({ profiles })
  },
  saveProfile: async (profile) => {
    const profiles = await dbIpc.saveDbProfile(profile)
    set({ profiles })
  },
  deleteProfile: async (profileId) => {
    const profiles = await dbIpc.deleteDbProfile(profileId)
    set((s) => ({
      profiles,
      activeProfileId: s.activeProfileId === profileId ? null : s.activeProfileId
    }))
  },
  setActiveProfileId: (id) => {
    const firstTab = createTab(null)
    set({
      activeProfileId: id,
      activeConnectionId: null,
      selectedSchema: null,
      selectedTable: null,
      schemas: {},
      tableDetails: {},
      tabs: [firstTab],
      activeTabId: firstTab.id,
      dataBrowserResult: null,
      view: id ? 'explorer' : 'profiles'
    })
  },

  // Connections
  connectionStates: {},
  activeConnectionId: null,
  setActiveConnectionId: (id) => set({
    activeConnectionId: id,
    selectedSchema: null,
    selectedTable: null,
    dataBrowserResult: null,
    dataBrowserTable: null,
    dataBrowserSchema: null
  }),
  testConnection: async (conn) => {
    set((s) => ({
      connectionStates: { ...s.connectionStates, [conn.id]: { status: 'testing' } }
    }))
    const result = await dbIpc.testConnection(conn)
    set((s) => ({
      connectionStates: {
        ...s.connectionStates,
        [conn.id]: {
          status: result.success ? 'connected' : 'error',
          testResult: result
        }
      }
    }))
    return result
  },
  connectToDb: async (conn) => {
    set((s) => ({
      connectionStates: { ...s.connectionStates, [conn.id]: { status: 'testing' } }
    }))
    const res = await dbIpc.connectToDb(conn)
    set((s) => ({
      connectionStates: {
        ...s.connectionStates,
        [conn.id]: { status: res.success ? 'connected' : 'error' }
      }
    }))
    if (res.success) {
      set({ activeConnectionId: conn.id })
      get().loadSchemas(conn)
    }
    return res.success
  },
  disconnectFromDb: async (conn) => {
    await dbIpc.disconnectFromDb(conn)
    set((s) => ({
      connectionStates: { ...s.connectionStates, [conn.id]: { status: 'disconnected' } },
      activeConnectionId: s.activeConnectionId === conn.id ? null : s.activeConnectionId
    }))
  },
  testAllConnections: async (connections) => {
    await Promise.all(connections.map((conn) => get().testConnection(conn)))
  },

  // Schema
  schemas: {},
  loadSchemas: async (conn) => {
    const dbSchema = await dbIpc.getSchemas(conn)
    set((s) => ({
      schemas: { ...s.schemas, [conn.id]: dbSchema },
      selectedSchema: dbSchema.schemas.length > 0 ? dbSchema.schemas[0].name : null
    }))
  },
  selectedSchema: null,
  setSelectedSchema: (schema) => set({ selectedSchema: schema, selectedTable: null }),
  selectedTable: null,
  setSelectedTable: (table) => set({ selectedTable: table }),
  tableDetails: {},
  loadTableDetails: async (conn, schema, table) => {
    const details = await dbIpc.getTableDetails(conn, schema, table)
    const key = `${conn.id}:${schema}.${table}`
    set((s) => ({
      tableDetails: { ...s.tableDetails, [key]: details }
    }))
  },
  detailTab: 'columns',
  setDetailTab: (tab) => set({ detailTab: tab }),

  // Query Tabs
  tabs: [],
  activeTabId: null,
  addTab: () => {
    const { activeConnectionId } = get()
    const tab = createTab(activeConnectionId)
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id
    }))
  },
  closeTab: (tabId) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      if (tabs.length === 0) {
        const newTab = createTab(s.activeConnectionId)
        return { tabs: [newTab], activeTabId: newTab.id }
      }
      const activeTabId = s.activeTabId === tabId
        ? tabs[Math.min(tabs.findIndex((_, i, arr) => i === arr.length - 1), tabs.length - 1)].id
        : s.activeTabId
      return { tabs, activeTabId }
    })
  },
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  updateTabQuery: (tabId, query) => {
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === tabId ? { ...t, query } : t)
    }))
  },
  renameTab: (tabId, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === tabId ? { ...t, title } : t)
    }))
  },
  executeTabQuery: async (tabId, conn) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab || !tab.query.trim()) return

    set((s) => ({
      tabs: s.tabs.map((t) => t.id === tabId ? { ...t, loading: true, result: null } : t)
    }))

    const result = await dbIpc.executeQuery(conn, tab.query)

    set((s) => ({
      tabs: s.tabs.map((t) => t.id === tabId ? { ...t, loading: false, result } : t)
    }))

    // Add to history
    const entry: QueryHistoryEntry = {
      id: `hist-${Date.now()}`,
      connectionId: conn.id,
      sql: tab.query.trim(),
      timestamp: Date.now(),
      duration: result.duration,
      rowCount: result.rowCount,
      error: result.error
    }
    get().addHistoryEntry(entry)
  },

  // Query History
  history: [],
  historyLoaded: false,
  loadHistory: async () => {
    if (get().historyLoaded) return
    const entries = await dbIpc.loadHistory()
    set({ history: entries, historyLoaded: true })
  },
  addHistoryEntry: (entry) => {
    set((s) => {
      const history = [entry, ...s.history].slice(0, MAX_HISTORY)
      // Persist async (fire & forget)
      dbIpc.saveHistory(history)
      return { history }
    })
  },
  clearHistory: (connectionId) => {
    set((s) => {
      const history = connectionId
        ? s.history.filter((h) => h.connectionId !== connectionId)
        : []
      dbIpc.saveHistory(history)
      return { history }
    })
  },
  showHistory: false,
  setShowHistory: (show) => set({ showHistory: show }),

  // Data Browser
  dataBrowserSchema: null,
  dataBrowserTable: null,
  dataBrowserFilters: [],
  dataBrowserSortColumn: null,
  dataBrowserSortDir: 'asc',
  dataBrowserPage: 0,
  dataBrowserPageSize: 50,
  dataBrowserResult: null,
  dataBrowserLoading: false,
  dataBrowserTotalRows: 0,
  setDataBrowserTarget: (schema, table) => set({
    dataBrowserSchema: schema,
    dataBrowserTable: table,
    dataBrowserFilters: [],
    dataBrowserSortColumn: null,
    dataBrowserSortDir: 'asc',
    dataBrowserPage: 0,
    dataBrowserResult: null,
    dataBrowserTotalRows: 0
  }),
  setDataBrowserFilters: (filters) => set({ dataBrowserFilters: filters, dataBrowserPage: 0 }),
  setDataBrowserSort: (column, dir) => set({ dataBrowserSortColumn: column, dataBrowserSortDir: dir, dataBrowserPage: 0 }),
  setDataBrowserPage: (page) => set({ dataBrowserPage: page }),
  setDataBrowserPageSize: (size) => set({ dataBrowserPageSize: size, dataBrowserPage: 0 }),
  loadDataBrowserPage: async (conn) => {
    const { dataBrowserSchema, dataBrowserTable, dataBrowserFilters, dataBrowserSortColumn, dataBrowserSortDir, dataBrowserPage, dataBrowserPageSize } = get()
    if (!dataBrowserSchema || !dataBrowserTable) return

    set({ dataBrowserLoading: true })

    const qualifiedTable = `"${dataBrowserSchema}"."${dataBrowserTable}"`

    // Build WHERE clause
    const whereParts: string[] = []
    const params: string[] = []
    dataBrowserFilters.forEach((f) => {
      if (f.operator === 'IS NULL') {
        whereParts.push(`"${f.column}" IS NULL`)
      } else if (f.operator === 'IS NOT NULL') {
        whereParts.push(`"${f.column}" IS NOT NULL`)
      } else {
        params.push(f.value)
        whereParts.push(`"${f.column}" ${f.operator} $${params.length}`)
      }
    })
    const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : ''

    // Build ORDER BY
    const orderClause = dataBrowserSortColumn
      ? ` ORDER BY "${dataBrowserSortColumn}" ${dataBrowserSortDir.toUpperCase()}`
      : ''

    const offset = dataBrowserPage * dataBrowserPageSize

    // Count query — use parameterized approach via raw SQL (params embedded safely)
    // Since db:query doesn't support parameterized queries, we escape values manually
    const escapeValue = (v: string) => v.replace(/'/g, "''")
    const whereClauseRaw = whereParts.length > 0
      ? ` WHERE ${dataBrowserFilters.map((f) => {
          if (f.operator === 'IS NULL') return `"${f.column}" IS NULL`
          if (f.operator === 'IS NOT NULL') return `"${f.column}" IS NOT NULL`
          return `"${f.column}" ${f.operator} '${escapeValue(f.value)}'`
        }).join(' AND ')}`
      : ''

    const countSql = `SELECT COUNT(*) as total FROM ${qualifiedTable}${whereClauseRaw}`
    const dataSql = `SELECT * FROM ${qualifiedTable}${whereClauseRaw}${orderClause} LIMIT ${dataBrowserPageSize} OFFSET ${offset}`

    try {
      const [countResult, dataResult] = await Promise.all([
        dbIpc.executeQuery(conn, countSql),
        dbIpc.executeQuery(conn, dataSql)
      ])

      const totalRows = countResult.rows?.[0]?.total
        ? Number(countResult.rows[0].total)
        : 0

      set({
        dataBrowserResult: dataResult,
        dataBrowserTotalRows: totalRows,
        dataBrowserLoading: false
      })
    } catch {
      set({ dataBrowserLoading: false })
    }
  },

  // Export
  exportResults: async (columns, rows, format, defaultName) => {
    await dbIpc.exportData({ columns, rows, format, defaultName })
  },

  // Schema filter
  schemaFilter: '',
  setSchemaFilter: (filter) => set({ schemaFilter: filter }),

  // Snapshots
  snapshots: [],
  snapshotsLoaded: false,
  snapshotCreating: false,
  snapshotProgress: null,
  loadSnapshots: async () => {
    const snapshots = await dbIpc.listSnapshots()
    set({ snapshots, snapshotsLoaded: true })
  },
  createSnapshot: async (options) => {
    set({ snapshotCreating: true, snapshotProgress: null })
    const unsub = dbIpc.onSnapshotProgress((progress) => {
      set({ snapshotProgress: progress })
    })
    try {
      const metadata = await dbIpc.createSnapshot(options)
      set((s) => ({
        snapshots: [metadata, ...s.snapshots],
        snapshotCreating: false,
        snapshotProgress: null
      }))
      return metadata
    } catch {
      set({ snapshotCreating: false, snapshotProgress: null })
      return null
    } finally {
      unsub?.()
    }
  },
  deleteSnapshot: async (snapshotId) => {
    const result = await dbIpc.deleteSnapshot(snapshotId)
    if (result.success) {
      set((s) => ({
        snapshots: s.snapshots.filter((snap) => snap.id !== snapshotId)
      }))
    }
    return result.success
  },
  getSnapshot: async (snapshotId) => {
    return dbIpc.getSnapshot(snapshotId)
  },

  // Restore
  restoreRunning: false,
  restoreProgress: null,
  executeRestore: async (options) => {
    set({ restoreRunning: true, restoreProgress: { phase: 'preparing', tablesTotal: 0, tablesDone: 0, rowsInserted: 0 } })
    const unsub = dbIpc.onRestoreProgress((progress) => {
      set({ restoreProgress: progress as RestoreProgress })
    })
    try {
      const result = await dbIpc.executeRestore(options)
      set({ restoreRunning: false })
      return result.success
    } catch {
      set({ restoreRunning: false })
      return false
    } finally {
      unsub?.()
    }
  }
}))

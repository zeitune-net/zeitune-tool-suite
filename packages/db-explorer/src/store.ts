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
  RestoreProgress,
  SchemaDiffResult,
  TransformPipeline,
  TableTransform,
  DataSet,
  DataSetStatus,
  SavedQuery,
  MonitorStats
} from '@shared/types'
import type { PublicProfile } from './services/db-ipc'
import * as dbIpc from './services/db-ipc'

// ── View Types ──────────────────────────────────────────────────────────────

export type DbView = 'profiles' | 'explorer' | 'snapshots'
export type DetailTab = 'columns' | 'foreignKeys' | 'indexes'
export type ExplorerPanel = 'query' | 'data-browser' | 'monitor'

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

  // Schema Diff
  schemaDiff: SchemaDiffResult | null
  schemaDiffLoading: boolean
  computeSchemaDiff: (snapshotData: SnapshotData, targetConn: DbConnectionEntry) => Promise<SchemaDiffResult | null>

  // Current pipeline (in-progress during wizard)
  currentPipeline: TransformPipeline | null
  setCurrentPipeline: (pipeline: TransformPipeline | null) => void
  updateTableTransform: (sourceSchema: string, sourceTable: string, updates: Partial<TableTransform>) => void

  // Saved pipelines
  pipelines: TransformPipeline[]
  pipelinesLoaded: boolean
  loadPipelines: () => Promise<void>
  savePipeline: (pipeline: TransformPipeline) => Promise<TransformPipeline | null>
  deletePipeline: (pipelineId: string) => Promise<boolean>

  // Data Sets
  datasets: DataSet[]
  datasetsLoaded: boolean
  loadDatasets: () => Promise<void>
  saveDataset: (dataset: DataSet) => Promise<DataSet | null>
  deleteDataset: (datasetId: string) => Promise<boolean>
  checkDatasetStatus: (datasetId: string, conn?: DbConnectionEntry) => Promise<DataSetStatus>

  // Saved Queries
  savedQueries: SavedQuery[]
  savedQueriesLoaded: boolean
  showSavedQueries: boolean
  setShowSavedQueries: (show: boolean) => void
  loadSavedQueries: () => Promise<void>
  saveQuery: (query: SavedQuery) => Promise<SavedQuery | null>
  deleteSavedQuery: (id: string) => Promise<boolean>

  // Inline Editing
  dataBrowserEditing: boolean
  dataBrowserPendingChanges: Record<string, Record<string, unknown>>
  setDataBrowserEditing: (editing: boolean) => void
  setCellValue: (rowKey: string, column: string, value: unknown) => void
  discardChanges: () => void
  commitChanges: (conn: DbConnectionEntry) => Promise<{ success: boolean; errors: string[] }>
  insertNewRow: (conn: DbConnectionEntry, row: Record<string, unknown>) => Promise<boolean>
  deleteRow: (conn: DbConnectionEntry, primaryKey: Record<string, unknown>) => Promise<boolean>

  // Monitoring
  monitorStats: MonitorStats | null
  monitorLoading: boolean
  loadMonitorStats: (conn: DbConnectionEntry) => Promise<void>
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
    try {
      const details = await dbIpc.getTableDetails(conn, schema, table)
      const key = `${conn.id}:${schema}.${table}`
      set((s) => ({
        tableDetails: { ...s.tableDetails, [key]: details }
      }))
    } catch (err) {
      console.error('Failed to load table details:', err)
    }
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

    // Dialect-aware quoting
    const q = (name: string) => {
      if (conn.type === 'mysql') return `\`${name}\``
      return `"${name}"`
    }
    const qualifiedTable = conn.type === 'sqlite'
      ? q(dataBrowserTable)
      : `${q(dataBrowserSchema)}.${q(dataBrowserTable)}`

    // Build WHERE clause with escaped values
    const escapeValue = (v: string) => v.replace(/'/g, "''")
    const whereClauseRaw = dataBrowserFilters.length > 0
      ? ` WHERE ${dataBrowserFilters.map((f) => {
          if (f.operator === 'IS NULL') return `${q(f.column)} IS NULL`
          if (f.operator === 'IS NOT NULL') return `${q(f.column)} IS NOT NULL`
          return `${q(f.column)} ${f.operator} '${escapeValue(f.value)}'`
        }).join(' AND ')}`
      : ''

    const orderClause = dataBrowserSortColumn
      ? ` ORDER BY ${q(dataBrowserSortColumn)} ${dataBrowserSortDir.toUpperCase()}`
      : ''

    const offset = dataBrowserPage * dataBrowserPageSize

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
  },

  // Schema Diff
  schemaDiff: null,
  schemaDiffLoading: false,
  computeSchemaDiff: async (snapshotData, targetConn) => {
    set({ schemaDiffLoading: true, schemaDiff: null })
    try {
      const result = await dbIpc.computeSchemaDiff({
        snapshotTables: snapshotData.tables,
        targetConnection: targetConn
      })
      set({ schemaDiff: result, schemaDiffLoading: false })
      return result
    } catch {
      set({ schemaDiffLoading: false })
      return null
    }
  },

  // Current pipeline
  currentPipeline: null,
  setCurrentPipeline: (pipeline) => set({ currentPipeline: pipeline }),
  updateTableTransform: (sourceSchema, sourceTable, updates) => {
    set((s) => {
      if (!s.currentPipeline) return s
      const transforms = s.currentPipeline.tableTransforms.map((t) =>
        t.sourceSchema === sourceSchema && t.sourceTable === sourceTable
          ? { ...t, ...updates }
          : t
      )
      return {
        currentPipeline: { ...s.currentPipeline, tableTransforms: transforms, updatedAt: Date.now() }
      }
    })
  },

  // Saved pipelines
  pipelines: [],
  pipelinesLoaded: false,
  loadPipelines: async () => {
    const pipelines = await dbIpc.listPipelines()
    set({ pipelines, pipelinesLoaded: true })
  },
  savePipeline: async (pipeline) => {
    try {
      const saved = await dbIpc.savePipeline(pipeline)
      set((s) => {
        const idx = s.pipelines.findIndex((p) => p.id === saved.id)
        const pipelines = idx >= 0
          ? s.pipelines.map((p) => p.id === saved.id ? saved : p)
          : [saved, ...s.pipelines]
        return { pipelines }
      })
      return saved
    } catch {
      return null
    }
  },
  deletePipeline: async (pipelineId) => {
    const result = await dbIpc.deletePipeline(pipelineId)
    if (result.success) {
      set((s) => ({ pipelines: s.pipelines.filter((p) => p.id !== pipelineId) }))
    }
    return result.success
  },

  // Data Sets
  datasets: [],
  datasetsLoaded: false,
  loadDatasets: async () => {
    const datasets = await dbIpc.listDatasets()
    set({ datasets, datasetsLoaded: true })
  },
  saveDataset: async (dataset) => {
    try {
      const saved = await dbIpc.saveDataset(dataset)
      set((s) => {
        const idx = s.datasets.findIndex((d) => d.id === saved.id)
        const datasets = idx >= 0
          ? s.datasets.map((d) => d.id === saved.id ? saved : d)
          : [saved, ...s.datasets]
        return { datasets }
      })
      return saved
    } catch {
      return null
    }
  },
  deleteDataset: async (datasetId) => {
    const result = await dbIpc.deleteDataset(datasetId)
    if (result.success) {
      set((s) => ({ datasets: s.datasets.filter((d) => d.id !== datasetId) }))
    }
    return result.success
  },
  checkDatasetStatus: async (datasetId, conn) => {
    return dbIpc.checkDatasetStatus(datasetId, conn)
  },

  // Saved Queries
  savedQueries: [],
  savedQueriesLoaded: false,
  showSavedQueries: false,
  setShowSavedQueries: (show) => set({ showSavedQueries: show }),
  loadSavedQueries: async () => {
    const queries = await dbIpc.listSavedQueries()
    set({ savedQueries: queries, savedQueriesLoaded: true })
  },
  saveQuery: async (query) => {
    try {
      const saved = await dbIpc.saveSavedQuery(query)
      set((s) => {
        const idx = s.savedQueries.findIndex((q) => q.id === saved.id)
        const savedQueries = idx >= 0
          ? s.savedQueries.map((q) => q.id === saved.id ? saved : q)
          : [saved, ...s.savedQueries]
        return { savedQueries }
      })
      return saved
    } catch {
      return null
    }
  },
  deleteSavedQuery: async (id) => {
    const result = await dbIpc.deleteSavedQuery(id)
    if (result.success) {
      set((s) => ({ savedQueries: s.savedQueries.filter((q) => q.id !== id) }))
    }
    return result.success
  },

  // Inline Editing
  dataBrowserEditing: false,
  dataBrowserPendingChanges: {},
  setDataBrowserEditing: (editing) => set({
    dataBrowserEditing: editing,
    dataBrowserPendingChanges: editing ? {} : {}
  }),
  setCellValue: (rowKey, column, value) => {
    set((s) => {
      const existing = s.dataBrowserPendingChanges[rowKey] ?? {}
      return {
        dataBrowserPendingChanges: {
          ...s.dataBrowserPendingChanges,
          [rowKey]: { ...existing, [column]: value }
        }
      }
    })
  },
  discardChanges: () => set({ dataBrowserPendingChanges: {} }),
  commitChanges: async (conn) => {
    const { dataBrowserSchema, dataBrowserTable, dataBrowserPendingChanges } = get()
    if (!dataBrowserSchema || !dataBrowserTable) return { success: false, errors: ['No table selected'] }

    const errors: string[] = []
    for (const [rowKey, changes] of Object.entries(dataBrowserPendingChanges)) {
      const primaryKey = JSON.parse(rowKey) as Record<string, unknown>
      const result = await dbIpc.updateRow({
        connection: conn,
        schema: dataBrowserSchema,
        table: dataBrowserTable,
        primaryKey,
        changes
      })
      if (!result.success) {
        errors.push(result.error ?? `Failed to update row ${rowKey}`)
      }
    }

    set({ dataBrowserPendingChanges: {} })
    // Reload data
    get().loadDataBrowserPage(conn)
    return { success: errors.length === 0, errors }
  },
  insertNewRow: async (conn, row) => {
    const { dataBrowserSchema, dataBrowserTable } = get()
    if (!dataBrowserSchema || !dataBrowserTable) return false
    const result = await dbIpc.insertRow({
      connection: conn,
      schema: dataBrowserSchema,
      table: dataBrowserTable,
      row
    })
    if (result.success) {
      get().loadDataBrowserPage(conn)
    }
    return result.success
  },
  deleteRow: async (conn, primaryKey) => {
    const { dataBrowserSchema, dataBrowserTable } = get()
    if (!dataBrowserSchema || !dataBrowserTable) return false
    const result = await dbIpc.deleteRow({
      connection: conn,
      schema: dataBrowserSchema,
      table: dataBrowserTable,
      primaryKey
    })
    if (result.success) {
      get().loadDataBrowserPage(conn)
    }
    return result.success
  },

  // Monitoring
  monitorStats: null,
  monitorLoading: false,
  loadMonitorStats: async (conn) => {
    set({ monitorLoading: true })
    try {
      const stats = await dbIpc.getMonitorStats(conn)
      set({ monitorStats: stats, monitorLoading: false })
    } catch {
      set({ monitorLoading: false })
    }
  }
}))

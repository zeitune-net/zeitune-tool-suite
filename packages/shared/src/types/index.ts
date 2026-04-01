export type ModuleId = 'git-manager' | 'dev-manager' | 'db-explorer' | 'settings'

export type {
  DbType,
  ConnectionStatus,
  DbConnectionEntry,
  DbProfile,
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
  TableInfo,
  SchemaInfo,
  DatabaseSchema,
  QueryColumn,
  QueryResult,
  ConnectionTestResult,
  QueryTab,
  QueryHistoryEntry,
  FilterOperator,
  DataBrowserFilter,
  PageSize,
  ExportFormat,
  SnapshotTableData,
  SnapshotMetadata,
  SnapshotData,
  SnapshotCreateOptions,
  RestoreConflictStrategy,
  RestoreOptions,
  RestoreProgress
} from './db-explorer'

export interface ModuleDefinition {
  id: ModuleId
  label: string
  shortLabel: string
  icon: string
}

export type Theme = 'dark' | 'light'

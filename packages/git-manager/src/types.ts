// ── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  name: string
  rootPath: string
  repoPaths: string[] // selected repo absolute paths
  createdAt: number
}

// ── Repository & Git Status ──────────────────────────────────────────────────

export interface Repository {
  name: string
  path: string
  branch: string
  branches: string[]
  remoteBranches: string[]
  ahead: number
  behind: number
  staged: FileChange[]
  modified: FileChange[]
  untracked: string[]
  conflicts: ConflictFile[]
  stashes: StashEntry[]
  recentLog: LogEntry[]
  loading: boolean
  error: string | null
}

export interface FileChange {
  path: string
  status: FileStatus
  oldPath?: string // for renames
}

export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'

export interface ConflictFile {
  path: string
  oursStatus: string
  theirsStatus: string
}

export interface StashEntry {
  index: number
  message: string
  date: string
}

export interface LogEntry {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  refs: string
}

// ── IPC Request/Response ─────────────────────────────────────────────────────

export interface ScanResult {
  path: string
  name: string
}

export interface GitStatusResult {
  branch: string
  ahead: number
  behind: number
  staged: FileChange[]
  modified: FileChange[]
  untracked: string[]
  conflicts: ConflictFile[]
}

export interface BranchListResult {
  current: string
  local: string[]
  remote: string[]
}

export interface LogResult {
  entries: LogEntry[]
}

export interface StashListResult {
  stashes: StashEntry[]
}

export interface MergeResult {
  success: boolean
  conflicts: ConflictFile[]
  message: string
}

export interface PullResult {
  success: boolean
  conflicts: ConflictFile[]
  message: string
  behind: number
}

export interface PushResult {
  success: boolean
  message: string
}

export interface DiffResult {
  diff: string
}

// ── Batch operation ──────────────────────────────────────────────────────────

export interface BatchOperationResult {
  repoPath: string
  repoName: string
  success: boolean
  message: string
  conflicts?: ConflictFile[]
}

// ── Store types ──────────────────────────────────────────────────────────────

export type ViewMode = 'dashboard' | 'detail'

export type DetailTab = 'changes' | 'branches' | 'log' | 'stash'

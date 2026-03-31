import type {
  Profile,
  ScanResult,
  GitStatusResult,
  BranchListResult,
  LogResult,
  StashListResult,
  MergeResult,
  PullResult,
  PushResult
} from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ipc = (window as any).electron.ipcRenderer

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipc.invoke(channel, ...args)
}

// ── Dialog ─────────────────────────────────────────────────────────────────

export const openDirectoryDialog = () => invoke<string | null>('dialog:openDirectory')

// ── Profiles ───────────────────────────────────────────────────────────────

export const listProfiles = () => invoke<Profile[]>('profile:list')
export const saveProfile = (profile: Profile) => invoke<Profile[]>('profile:save', profile)
export const deleteProfile = (profileId: string) => invoke<Profile[]>('profile:delete', profileId)

// ── Scan ───────────────────────────────────────────────────────────────────

export const scanRepos = (rootPath: string) => invoke<ScanResult[]>('git:scanRepos', rootPath)

// ── Git Status ─────────────────────────────────────────────────────────────

export const getStatus = (repoPath: string) => invoke<GitStatusResult>('git:status', repoPath)

// ── Branches ───────────────────────────────────────────────────────────────

export const getBranches = (repoPath: string) => invoke<BranchListResult>('git:branches', repoPath)
export const checkout = (repoPath: string, branch: string) =>
  invoke<boolean>('git:checkout', repoPath, branch)
export const createBranch = (repoPath: string, name: string, startPoint?: string) =>
  invoke<boolean>('git:createBranch', repoPath, name, startPoint)
export const deleteBranch = (repoPath: string, branch: string, force: boolean = false) =>
  invoke<boolean>('git:deleteBranch', repoPath, branch, force)

// ── Fetch / Pull / Push ────────────────────────────────────────────────────

export const fetch = (repoPath: string) => invoke<boolean>('git:fetch', repoPath)
export const pull = (repoPath: string, branch?: string) =>
  invoke<PullResult>('git:pull', repoPath, branch)
export const push = (repoPath: string, branch?: string, setUpstream?: boolean) =>
  invoke<PushResult>('git:push', repoPath, branch, setUpstream)

// ── Staging ────────────────────────────────────────────────────────────────

export const stage = (repoPath: string, files: string[]) =>
  invoke<boolean>('git:stage', repoPath, files)
export const unstage = (repoPath: string, files: string[]) =>
  invoke<boolean>('git:unstage', repoPath, files)
export const stageAll = (repoPath: string) => invoke<boolean>('git:stageAll', repoPath)
export const discardChanges = (repoPath: string, files: string[], includeUntracked?: boolean) =>
  invoke<boolean>('git:discardChanges', repoPath, files, includeUntracked)
export const discardStagedChanges = (repoPath: string, files: string[]) =>
  invoke<boolean>('git:discardStagedChanges', repoPath, files)

// ── Diff ──────────────────────────────────────────────────────────────────

export const getDiff = (repoPath: string, filePath: string, staged: boolean) =>
  invoke<string>('git:diff', repoPath, filePath, staged)
export const showFile = (repoPath: string, filePath: string) =>
  invoke<string>('git:showFile', repoPath, filePath)
export const fileContent = (repoPath: string, filePath: string) =>
  invoke<string>('git:fileContent', repoPath, filePath)

// ── Commit ─────────────────────────────────────────────────────────────────

export const commit = (repoPath: string, message: string, stagedFiles?: string[]) =>
  invoke<boolean>('git:commit', repoPath, message, stagedFiles)

// ── Merge ──────────────────────────────────────────────────────────────────

export const merge = (repoPath: string, branch: string) =>
  invoke<MergeResult>('git:merge', repoPath, branch)
export const mergeAbort = (repoPath: string) => invoke<boolean>('git:mergeAbort', repoPath)
export const resolveConflict = (repoPath: string, file: string, strategy: 'ours' | 'theirs') =>
  invoke<boolean>('git:resolveConflict', repoPath, file, strategy)

// ── Stash ──────────────────────────────────────────────────────────────────

export const stashList = (repoPath: string) => invoke<StashListResult>('git:stashList', repoPath)
export const stashSave = (repoPath: string, message?: string) =>
  invoke<boolean>('git:stashSave', repoPath, message)
export const stashPop = (repoPath: string, index?: number) =>
  invoke<boolean>('git:stashPop', repoPath, index)
export const stashDrop = (repoPath: string, index: number) =>
  invoke<boolean>('git:stashDrop', repoPath, index)

// ── Log ────────────────────────────────────────────────────────────────────

export const getLog = (repoPath: string, count?: number) =>
  invoke<LogResult>('git:log', repoPath, count)

// ── Shell actions ─────────────────────────────────────────────────────────

export const openInTerminal = (dirPath: string) =>
  invoke<boolean>('shell:openInTerminal', dirPath)
export const openInExplorer = (dirPath: string) =>
  invoke<boolean>('shell:openInExplorer', dirPath)

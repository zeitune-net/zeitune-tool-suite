import { create } from 'zustand'
import { toast } from '@shared/components/ui/toast'
import type {
  Profile,
  Repository,
  ScanResult,
  ViewMode,
  DetailTab,
  BatchOperationResult
} from './types'
import * as gitIpc from './services/git-ipc'

interface GitManagerStore {
  // ── Profiles ─────────────────────────────────────────────────────────────
  profiles: Profile[]
  activeProfileId: string | null
  loadProfiles: () => Promise<void>
  setActiveProfile: (id: string | null) => void
  createProfile: (name: string, rootPath: string, repoPaths: string[]) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  updateProfileRepos: (profileId: string, repoPaths: string[]) => Promise<void>

  // ── Scanning ─────────────────────────────────────────────────────────────
  scanning: boolean
  scanResults: ScanResult[]
  scanDirectory: (rootPath: string) => Promise<void>
  clearScan: () => void

  // ── Repositories ─────────────────────────────────────────────────────────
  repositories: Repository[]
  selectedRepoPaths: string[]
  activeRepoPath: string | null
  loadRepositories: () => Promise<void>
  refreshRepo: (repoPath: string) => Promise<void>
  refreshAllRepos: () => Promise<void>
  toggleRepoSelection: (repoPath: string) => void
  selectAllRepos: () => void
  deselectAllRepos: () => void
  setActiveRepo: (repoPath: string | null) => void

  // ── View ─────────────────────────────────────────────────────────────────
  viewMode: ViewMode
  detailTab: DetailTab
  setViewMode: (mode: ViewMode) => void
  setDetailTab: (tab: DetailTab) => void

  // ── Wizard ───────────────────────────────────────────────────────────────
  wizardOpen: boolean
  setWizardOpen: (open: boolean) => void

  // ── Batch operations ─────────────────────────────────────────────────────
  batchLoading: boolean
  batchResults: BatchOperationResult[]
  clearBatchResults: () => void
  batchFetch: () => Promise<void>
  batchPull: (branch?: string) => Promise<void>
  batchPush: (branch?: string) => Promise<void>
  batchCheckout: (branch: string) => Promise<void>
  batchCommit: (message: string) => Promise<void>

  // ── Single repo operations ───────────────────────────────────────────────
  operationLoading: string | null // repoPath currently loading
  checkoutBranch: (repoPath: string, branch: string) => Promise<void>
  createBranch: (repoPath: string, name: string, startPoint?: string) => Promise<void>
  deleteBranch: (repoPath: string, branch: string, force?: boolean) => Promise<void>
  stageFiles: (repoPath: string, files: string[]) => Promise<void>
  unstageFiles: (repoPath: string, files: string[]) => Promise<void>
  stageAllFiles: (repoPath: string) => Promise<void>
  discardFiles: (repoPath: string, files: string[]) => Promise<void>
  commitChanges: (repoPath: string, message: string) => Promise<void>
  pullRepo: (repoPath: string, branch?: string) => Promise<void>
  pushRepo: (repoPath: string, branch?: string, setUpstream?: boolean) => Promise<void>
  fetchRepo: (repoPath: string) => Promise<void>
  mergeBranch: (repoPath: string, branch: string) => Promise<void>
  abortMerge: (repoPath: string) => Promise<void>
  resolveConflict: (repoPath: string, file: string, strategy: 'ours' | 'theirs') => Promise<void>
  stashSave: (repoPath: string, message?: string) => Promise<void>
  stashPop: (repoPath: string, index?: number) => Promise<void>
  stashDrop: (repoPath: string, index: number) => Promise<void>
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

async function fetchRepoData(repoPath: string, name: string): Promise<Repository> {
  try {
    const [status, branches, logResult, stashResult] = await Promise.all([
      gitIpc.getStatus(repoPath),
      gitIpc.getBranches(repoPath),
      gitIpc.getLog(repoPath, 15),
      gitIpc.stashList(repoPath)
    ])
    return {
      name,
      path: repoPath,
      branch: status.branch,
      branches: branches.local,
      remoteBranches: branches.remote,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      untracked: status.untracked,
      conflicts: status.conflicts,
      stashes: stashResult.stashes,
      recentLog: logResult.entries,
      loading: false,
      error: null
    }
  } catch (err) {
    return {
      name,
      path: repoPath,
      branch: 'unknown',
      branches: [],
      remoteBranches: [],
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      untracked: [],
      conflicts: [],
      stashes: [],
      recentLog: [],
      loading: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export const useGitManagerStore = create<GitManagerStore>()((set, get) => ({
  // ── Profiles ─────────────────────────────────────────────────────────────

  profiles: [],
  activeProfileId: null,

  loadProfiles: async () => {
    const profiles = await gitIpc.listProfiles()
    set({ profiles })
    // Auto-select first profile if none active
    if (!get().activeProfileId && profiles.length > 0) {
      get().setActiveProfile(profiles[0].id)
    }
  },

  setActiveProfile: (id) => {
    set({ activeProfileId: id, repositories: [], selectedRepoPaths: [], activeRepoPath: null })
    if (id) get().loadRepositories()
  },

  createProfile: async (name, rootPath, repoPaths) => {
    const profile: Profile = {
      id: generateId(),
      name,
      rootPath,
      repoPaths,
      createdAt: Date.now()
    }
    const profiles = await gitIpc.saveProfile(profile)
    set({ profiles, wizardOpen: false })
    get().setActiveProfile(profile.id)
  },

  deleteProfile: async (id) => {
    const profiles = await gitIpc.deleteProfile(id)
    set({ profiles })
    if (get().activeProfileId === id) {
      const next = profiles.length > 0 ? profiles[0].id : null
      get().setActiveProfile(next)
    }
  },

  updateProfileRepos: async (profileId, repoPaths) => {
    const profile = get().profiles.find((p) => p.id === profileId)
    if (!profile) return
    const updated = { ...profile, repoPaths }
    const profiles = await gitIpc.saveProfile(updated)
    set({ profiles })
    if (get().activeProfileId === profileId) get().loadRepositories()
  },

  // ── Scanning ─────────────────────────────────────────────────────────────

  scanning: false,
  scanResults: [],

  scanDirectory: async (rootPath) => {
    set({ scanning: true, scanResults: [] })
    try {
      const results = await gitIpc.scanRepos(rootPath)
      set({ scanResults: results, scanning: false })
    } catch {
      set({ scanning: false })
    }
  },

  clearScan: () => set({ scanResults: [] }),

  // ── Repositories ─────────────────────────────────────────────────────────

  repositories: [],
  selectedRepoPaths: [],
  activeRepoPath: null,

  loadRepositories: async () => {
    const profile = get().profiles.find((p) => p.id === get().activeProfileId)
    if (!profile) return

    // Set all repos as loading
    const loadingRepos: Repository[] = profile.repoPaths.map((p) => ({
      name: p.split(/[/\\]/).pop() || p,
      path: p,
      branch: '',
      branches: [],
      remoteBranches: [],
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      untracked: [],
      conflicts: [],
      stashes: [],
      recentLog: [],
      loading: true,
      error: null
    }))
    set({ repositories: loadingRepos })

    // Fetch all repo data in parallel
    const repos = await Promise.all(
      profile.repoPaths.map((p) => fetchRepoData(p, p.split(/[/\\]/).pop() || p))
    )
    set({ repositories: repos, selectedRepoPaths: repos.map((r) => r.path) })
  },

  refreshRepo: async (repoPath) => {
    const repo = get().repositories.find((r) => r.path === repoPath)
    if (!repo) return
    set({
      repositories: get().repositories.map((r) =>
        r.path === repoPath ? { ...r, loading: true } : r
      )
    })
    const updated = await fetchRepoData(repoPath, repo.name)
    set({
      repositories: get().repositories.map((r) => (r.path === repoPath ? updated : r))
    })
  },

  refreshAllRepos: async () => {
    const repos = get().repositories
    set({ repositories: repos.map((r) => ({ ...r, loading: true })) })
    const updated = await Promise.all(repos.map((r) => fetchRepoData(r.path, r.name)))
    set({ repositories: updated })
  },

  toggleRepoSelection: (repoPath) => {
    const sel = get().selectedRepoPaths
    if (sel.includes(repoPath)) {
      set({ selectedRepoPaths: sel.filter((p) => p !== repoPath) })
    } else {
      set({ selectedRepoPaths: [...sel, repoPath] })
    }
  },

  selectAllRepos: () => {
    set({ selectedRepoPaths: get().repositories.map((r) => r.path) })
  },

  deselectAllRepos: () => {
    set({ selectedRepoPaths: [] })
  },

  setActiveRepo: (repoPath) => {
    set({ activeRepoPath: repoPath, viewMode: repoPath ? 'detail' : 'dashboard' })
  },

  // ── View ─────────────────────────────────────────────────────────────────

  viewMode: 'dashboard',
  detailTab: 'changes',
  setViewMode: (mode) => set({ viewMode: mode }),
  setDetailTab: (tab) => set({ detailTab: tab }),

  // ── Wizard ───────────────────────────────────────────────────────────────

  wizardOpen: false,
  setWizardOpen: (open) => set({ wizardOpen: open }),

  // ── Batch operations ─────────────────────────────────────────────────────

  batchLoading: false,
  batchResults: [],
  clearBatchResults: () => set({ batchResults: [] }),

  batchFetch: async () => {
    const selected = get().selectedRepoPaths
    const repos = get().repositories.filter((r) => selected.includes(r.path))
    set({ batchLoading: true, batchResults: [] })
    const results: BatchOperationResult[] = await Promise.all(
      repos.map(async (r) => {
        try {
          await gitIpc.fetch(r.path)
          return { repoPath: r.path, repoName: r.name, success: true, message: 'Fetched' }
        } catch (err) {
          return {
            repoPath: r.path,
            repoName: r.name,
            success: false,
            message: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )
    set({ batchResults: results, batchLoading: false })
    const ok = results.filter((r) => r.success).length
    if (ok === results.length) toast.success(`Fetch : ${ok} repos`)
    else toast.warning(`Fetch : ${ok}/${results.length} OK`)
    get().refreshAllRepos()
  },

  batchPull: async (branch?) => {
    const selected = get().selectedRepoPaths
    const repos = get().repositories.filter((r) => selected.includes(r.path))
    set({ batchLoading: true, batchResults: [] })
    const results: BatchOperationResult[] = await Promise.all(
      repos.map(async (r) => {
        try {
          const res = await gitIpc.pull(r.path, branch)
          return {
            repoPath: r.path,
            repoName: r.name,
            success: res.success,
            message: res.message,
            conflicts: res.conflicts
          }
        } catch (err) {
          return {
            repoPath: r.path,
            repoName: r.name,
            success: false,
            message: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )
    set({ batchResults: results, batchLoading: false })
    const ok = results.filter((r) => r.success).length
    const fail = results.length - ok
    if (fail === 0) toast.success(`Pull : ${ok} repos`)
    else toast.warning(`Pull : ${ok} OK, ${fail} erreurs`)
    get().refreshAllRepos()
  },

  batchPush: async (branch?) => {
    const selected = get().selectedRepoPaths
    const repos = get().repositories.filter((r) => selected.includes(r.path))
    set({ batchLoading: true, batchResults: [] })
    const results: BatchOperationResult[] = await Promise.all(
      repos.map(async (r) => {
        try {
          const res = await gitIpc.push(r.path, branch)
          return { repoPath: r.path, repoName: r.name, success: res.success, message: res.message }
        } catch (err) {
          return {
            repoPath: r.path,
            repoName: r.name,
            success: false,
            message: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )
    set({ batchResults: results, batchLoading: false })
    const ok = results.filter((r) => r.success).length
    const fail = results.length - ok
    if (fail === 0) toast.success(`Push : ${ok} repos`)
    else toast.warning(`Push : ${ok} OK, ${fail} erreurs`)
    get().refreshAllRepos()
  },

  batchCheckout: async (branch) => {
    const selected = get().selectedRepoPaths
    const repos = get().repositories.filter((r) => selected.includes(r.path))
    set({ batchLoading: true, batchResults: [] })
    const results: BatchOperationResult[] = await Promise.all(
      repos.map(async (r) => {
        try {
          await gitIpc.checkout(r.path, branch)
          return {
            repoPath: r.path,
            repoName: r.name,
            success: true,
            message: `Switched to ${branch}`
          }
        } catch (err) {
          return {
            repoPath: r.path,
            repoName: r.name,
            success: false,
            message: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )
    set({ batchResults: results, batchLoading: false })
    const ok = results.filter((r) => r.success).length
    const fail = results.length - ok
    if (fail === 0) toast.success(`Checkout ${branch} : ${ok} repos`)
    else toast.warning(`Checkout : ${ok} OK, ${fail} erreurs`)
    get().refreshAllRepos()
  },

  batchCommit: async (message) => {
    const selected = get().selectedRepoPaths
    const repos = get().repositories.filter(
      (r) => selected.includes(r.path) && (r.staged.length > 0 || r.modified.length > 0 || r.untracked.length > 0)
    )
    if (repos.length === 0) {
      toast.warning('Aucun repo avec des changements')
      return
    }
    set({ batchLoading: true, batchResults: [] })
    const results: BatchOperationResult[] = await Promise.all(
      repos.map(async (r) => {
        try {
          // Stage all changes then commit
          await gitIpc.stageAll(r.path)
          await gitIpc.commit(r.path, message)
          return {
            repoPath: r.path,
            repoName: r.name,
            success: true,
            message: 'Committed'
          }
        } catch (err) {
          return {
            repoPath: r.path,
            repoName: r.name,
            success: false,
            message: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )
    set({ batchResults: results, batchLoading: false })
    const ok = results.filter((r) => r.success).length
    const fail = results.length - ok
    if (fail === 0) toast.success(`Commit : ${ok} repos`)
    else toast.warning(`Commit : ${ok} OK, ${fail} erreurs`)
    get().refreshAllRepos()
  },

  // ── Single repo operations ───────────────────────────────────────────────

  operationLoading: null,

  checkoutBranch: async (repoPath, branch) => {
    set({ operationLoading: repoPath })
    try {
      await gitIpc.checkout(repoPath, branch)
      toast.success(`Checkout ${branch}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur checkout')
    }
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  createBranch: async (repoPath, name, startPoint?) => {
    set({ operationLoading: repoPath })
    await gitIpc.createBranch(repoPath, name, startPoint)
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  deleteBranch: async (repoPath, branch, force?) => {
    set({ operationLoading: repoPath })
    await gitIpc.deleteBranch(repoPath, branch, force || false)
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  stageFiles: async (repoPath, files) => {
    await gitIpc.stage(repoPath, files)
    get().refreshRepo(repoPath)
  },

  unstageFiles: async (repoPath, files) => {
    await gitIpc.unstage(repoPath, files)
    get().refreshRepo(repoPath)
  },

  stageAllFiles: async (repoPath) => {
    await gitIpc.stageAll(repoPath)
    get().refreshRepo(repoPath)
  },

  discardFiles: async (repoPath, files) => {
    await gitIpc.discardChanges(repoPath, files)
    get().refreshRepo(repoPath)
  },

  commitChanges: async (repoPath, message) => {
    set({ operationLoading: repoPath })
    try {
      await gitIpc.commit(repoPath, message)
      const name = get().repositories.find((r) => r.path === repoPath)?.name || ''
      toast.success(`Commit sur ${name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur commit')
    }
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  pullRepo: async (repoPath, branch?) => {
    set({ operationLoading: repoPath })
    try {
      const res = await gitIpc.pull(repoPath, branch)
      const name = get().repositories.find((r) => r.path === repoPath)?.name || ''
      if (res.success) toast.success(`Pull ${name}`)
      else toast.warning(`Pull ${name} : conflits`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur pull')
    }
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  pushRepo: async (repoPath, branch?, setUpstream?) => {
    set({ operationLoading: repoPath })
    try {
      const res = await gitIpc.push(repoPath, branch, setUpstream)
      const name = get().repositories.find((r) => r.path === repoPath)?.name || ''
      if (res.success) toast.success(`Push ${name}`)
      else toast.error(`Push ${name} : ${res.message}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur push')
    }
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  fetchRepo: async (repoPath) => {
    set({ operationLoading: repoPath })
    await gitIpc.fetch(repoPath)
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  mergeBranch: async (repoPath, branch) => {
    set({ operationLoading: repoPath })
    await gitIpc.merge(repoPath, branch)
    set({ operationLoading: null })
    get().refreshRepo(repoPath)
  },

  abortMerge: async (repoPath) => {
    await gitIpc.mergeAbort(repoPath)
    get().refreshRepo(repoPath)
  },

  resolveConflict: async (repoPath, file, strategy) => {
    await gitIpc.resolveConflict(repoPath, file, strategy)
    get().refreshRepo(repoPath)
  },

  stashSave: async (repoPath, message?) => {
    await gitIpc.stashSave(repoPath, message)
    get().refreshRepo(repoPath)
  },

  stashPop: async (repoPath, index?) => {
    await gitIpc.stashPop(repoPath, index)
    get().refreshRepo(repoPath)
  },

  stashDrop: async (repoPath, index) => {
    await gitIpc.stashDrop(repoPath, index)
    get().refreshRepo(repoPath)
  }
}))

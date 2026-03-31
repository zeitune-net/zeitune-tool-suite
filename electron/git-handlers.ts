import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { execFile, exec, spawn } from 'child_process'
import { promisify } from 'util'
import { readdir, stat, access } from 'fs/promises'
import { join, basename } from 'path'

const execFileAsync = promisify(execFile)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function git(cwd: string, args: string[], timeoutMs = 30_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs
    })
    return stdout.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  } catch (err: unknown) {
    const e = err as Error & { stderr?: string; stdout?: string }
    const detail = e.stderr?.trim() || e.stdout?.trim() || e.message
    throw new Error(detail)
  }
}

async function gitSafe(cwd: string, args: string[]): Promise<string> {
  try {
    return await git(cwd, args)
  } catch {
    return ''
  }
}

async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await access(join(dirPath, '.git'))
    return true
  } catch {
    return false
  }
}

type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked'

interface FileChange {
  path: string
  status: FileStatus
  oldPath?: string
}

interface ConflictFile {
  path: string
  oursStatus: string
  theirsStatus: string
}

function parseStatusCode(code: string): FileStatus {
  switch (code) {
    case 'A': return 'added'
    case 'M': return 'modified'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case '?': return 'untracked'
    default: return 'modified'
  }
}

function parseGitStatus(raw: string): {
  staged: FileChange[]
  modified: FileChange[]
  untracked: string[]
  conflicts: ConflictFile[]
} {
  const staged: FileChange[] = []
  const modified: FileChange[] = []
  const untracked: string[] = []
  const conflicts: ConflictFile[] = []

  if (!raw) return { staged, modified, untracked, conflicts }

  const lines = raw.split('\n').filter(Boolean)
  for (const line of lines) {
    const x = line[0] // index status
    const y = line[1] // worktree status
    const filepath = line.substring(3)

    // Conflict detection (both modified, added by both, etc.)
    if (
      (x === 'U' || y === 'U') ||
      (x === 'A' && y === 'A') ||
      (x === 'D' && y === 'D')
    ) {
      conflicts.push({ path: filepath, oursStatus: x, theirsStatus: y })
      continue
    }

    // Staged changes
    if (x !== ' ' && x !== '?') {
      const change: FileChange = { path: filepath, status: parseStatusCode(x) }
      if (x === 'R' || x === 'C') {
        const parts = filepath.split(' -> ')
        change.oldPath = parts[0]
        change.path = parts[1] || parts[0]
      }
      staged.push(change)
    }

    // Worktree changes
    if (y === 'M' || y === 'D') {
      modified.push({ path: filepath, status: parseStatusCode(y) })
    }

    // Untracked
    if (x === '?' && y === '?') {
      untracked.push(filepath)
    }
  }

  return { staged, modified, untracked, conflicts }
}

// ── Profile persistence ──────────────────────────────────────────────────────

import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'

interface Profile {
  id: string
  name: string
  rootPath: string
  repoPaths: string[]
  createdAt: number
}

const profilesPath = () => join(app.getPath('userData'), 'git-profiles.json')

async function loadProfiles(): Promise<Profile[]> {
  try {
    const data = await readFile(profilesPath(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveProfiles(profiles: Profile[]): Promise<void> {
  await writeFile(profilesPath(), JSON.stringify(profiles, null, 2), 'utf-8')
}

const activeProfilePath = () => join(app.getPath('userData'), 'git-active-profile.json')

async function loadActiveProfileId(): Promise<string | null> {
  try {
    const data = await readFile(activeProfilePath(), 'utf-8')
    const parsed = JSON.parse(data)
    return parsed.activeProfileId ?? null
  } catch {
    return null
  }
}

async function saveActiveProfileId(id: string | null): Promise<void> {
  await writeFile(activeProfilePath(), JSON.stringify({ activeProfileId: id }), 'utf-8')
}

// ── Register all IPC handlers ────────────────────────────────────────────────

export function registerGitHandlers(): void {
  // ── Dialog ───────────────────────────────────────────────────────────────

  ipcMain.handle('dialog:openDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── Profile CRUD ─────────────────────────────────────────────────────────

  ipcMain.handle('profile:list', async () => {
    return loadProfiles()
  })

  ipcMain.handle('profile:save', async (_e, profile: Profile) => {
    const profiles = await loadProfiles()
    const idx = profiles.findIndex((p) => p.id === profile.id)
    if (idx >= 0) {
      profiles[idx] = profile
    } else {
      profiles.push(profile)
    }
    await saveProfiles(profiles)
    return profiles
  })

  ipcMain.handle('profile:delete', async (_e, profileId: string) => {
    let profiles = await loadProfiles()
    profiles = profiles.filter((p) => p.id !== profileId)
    await saveProfiles(profiles)
    return profiles
  })

  ipcMain.handle('profile:getActive', async () => {
    return loadActiveProfileId()
  })

  ipcMain.handle('profile:setActive', async (_e, id: string | null) => {
    await saveActiveProfileId(id)
  })

  // ── Scan for git repos ───────────────────────────────────────────────────

  ipcMain.handle('git:scanRepos', async (_e, rootPath: string) => {
    const repos: { path: string; name: string }[] = []

    async function scanDir(dirPath: string, depth: number): Promise<void> {
      if (depth > 2) return
      try {
        if (await isGitRepo(dirPath)) {
          repos.push({ path: dirPath, name: basename(dirPath) })
          return // don't recurse into git repos
        }
        if (depth < 2) {
          const entries = await readdir(dirPath, { withFileTypes: true })
          const dirs = entries.filter(
            (e) => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.') && e.name !== 'node_modules'
          )
          await Promise.all(dirs.map((d) => scanDir(join(dirPath, d.name), depth + 1)))
        }
      } catch {
        // skip inaccessible dirs
      }
    }

    await scanDir(rootPath, 0)
    return repos
  })

  // ── Git Status ───────────────────────────────────────────────────────────

  ipcMain.handle('git:status', async (_e, repoPath: string) => {
    const raw = await gitSafe(repoPath, ['status', '--porcelain'])
    const { staged, modified, untracked, conflicts } = parseGitStatus(raw)

    // Branch info
    const branch = await gitSafe(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])

    // Ahead/behind
    let ahead = 0
    let behind = 0
    const tracking = await gitSafe(repoPath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    ])
    if (tracking) {
      const abRaw = await gitSafe(repoPath, [
        'rev-list',
        '--left-right',
        '--count',
        `${tracking}...HEAD`
      ])
      if (abRaw) {
        const parts = abRaw.split('\t')
        behind = parseInt(parts[0]) || 0
        ahead = parseInt(parts[1]) || 0
      }
    }

    return { branch, ahead, behind, staged, modified, untracked, conflicts }
  })

  // ── Branches ─────────────────────────────────────────────────────────────

  ipcMain.handle('git:branches', async (_e, repoPath: string) => {
    const current = await gitSafe(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])

    const localRaw = await gitSafe(repoPath, ['branch', '--format=%(refname:short)'])
    const local = localRaw ? localRaw.split('\n').filter(Boolean) : []

    const remoteRaw = await gitSafe(repoPath, [
      'branch',
      '-r',
      '--format=%(refname:short)'
    ])
    const remote = remoteRaw
      ? remoteRaw
          .split('\n')
          .filter((b) => b && !b.endsWith('/HEAD'))
      : []

    return { current, local, remote }
  })

  ipcMain.handle('git:checkout', async (_e, repoPath: string, branch: string) => {
    await git(repoPath, ['checkout', branch])
    return true
  })

  ipcMain.handle(
    'git:createBranch',
    async (_e, repoPath: string, branchName: string, startPoint?: string) => {
      const args = ['checkout', '-b', branchName]
      if (startPoint) args.push(startPoint)
      await git(repoPath, args)
      return true
    }
  )

  ipcMain.handle('git:deleteBranch', async (_e, repoPath: string, branch: string, force: boolean) => {
    await git(repoPath, ['branch', force ? '-D' : '-d', branch])
    return true
  })

  // ── Fetch / Pull / Push ──────────────────────────────────────────────────

  ipcMain.handle('git:fetch', async (_e, repoPath: string) => {
    await git(repoPath, ['fetch', '--all', '--prune'], 60_000)
    return true
  })

  ipcMain.handle('git:pull', async (_e, repoPath: string, branch?: string) => {
    try {
      const args = ['pull']
      if (branch) {
        args.push('origin', branch)
      }
      const output = await git(repoPath, args, 60_000)
      return { success: true, conflicts: [], message: output, behind: 0 }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Check if pull resulted in conflicts
      if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
        const statusRaw = await gitSafe(repoPath, ['status', '--porcelain'])
        const { conflicts } = parseGitStatus(statusRaw)
        return { success: false, conflicts, message: msg, behind: 0 }
      }
      throw err
    }
  })

  ipcMain.handle('git:push', async (_e, repoPath: string, branch?: string, setUpstream?: boolean) => {
    try {
      const args = ['push']
      if (setUpstream) args.push('-u')
      if (branch) {
        args.push('origin', branch)
      }
      const output = await git(repoPath, args, 60_000)
      return { success: true, message: output }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    }
  })

  // ── Staging ──────────────────────────────────────────────────────────────

  ipcMain.handle('git:stage', async (_e, repoPath: string, files: string[]) => {
    await git(repoPath, ['add', ...files])
    return true
  })

  ipcMain.handle('git:unstage', async (_e, repoPath: string, files: string[]) => {
    await git(repoPath, ['reset', 'HEAD', '--', ...files])
    return true
  })

  ipcMain.handle('git:stageAll', async (_e, repoPath: string) => {
    await git(repoPath, ['add', '-A'])
    return true
  })

  ipcMain.handle(
    'git:discardChanges',
    async (_e, repoPath: string, files: string[], includeUntracked?: boolean) => {
      if (includeUntracked) {
        await git(repoPath, ['clean', '-f', '--', ...files])
      } else {
        await git(repoPath, ['checkout', '--', ...files])
      }
      return true
    }
  )

  ipcMain.handle(
    'git:discardStagedChanges',
    async (_e, repoPath: string, files: string[]) => {
      // Revert both staged and worktree changes back to HEAD
      await git(repoPath, ['checkout', 'HEAD', '--', ...files])
      return true
    }
  )

  // ── Commit ───────────────────────────────────────────────────────────────

  ipcMain.handle('git:commit', async (_e, repoPath: string, message: string, stagedFiles?: string[]) => {
    // Re-stage files to ensure index matches UI state
    if (stagedFiles && stagedFiles.length > 0) {
      await git(repoPath, ['add', ...stagedFiles])
    }
    await git(repoPath, ['commit', '-m', message])
    return true
  })

  // ── Diff ─────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'git:diff',
    async (_e, repoPath: string, filePath: string, staged: boolean) => {
      if (staged) {
        return await gitSafe(repoPath, ['diff', '--cached', '--', filePath])
      }
      return await gitSafe(repoPath, ['diff', '--', filePath])
    }
  )

  ipcMain.handle('git:showFile', async (_e, repoPath: string, filePath: string) => {
    return await gitSafe(repoPath, ['show', `HEAD:${filePath}`])
  })

  ipcMain.handle('git:fileContent', async (_e, repoPath: string, filePath: string) => {
    const { readFile } = await import('fs/promises')
    const { join } = await import('path')
    try {
      return await readFile(join(repoPath, filePath), 'utf-8')
    } catch {
      return ''
    }
  })

  // ── Merge ────────────────────────────────────────────────────────────────

  ipcMain.handle('git:merge', async (_e, repoPath: string, branch: string) => {
    try {
      const output = await git(repoPath, ['merge', branch])
      return { success: true, conflicts: [], message: output }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
        const statusRaw = await gitSafe(repoPath, ['status', '--porcelain'])
        const { conflicts } = parseGitStatus(statusRaw)
        return { success: false, conflicts, message: msg }
      }
      throw err
    }
  })

  ipcMain.handle('git:mergeAbort', async (_e, repoPath: string) => {
    await git(repoPath, ['merge', '--abort'])
    return true
  })

  ipcMain.handle(
    'git:resolveConflict',
    async (_e, repoPath: string, file: string, strategy: 'ours' | 'theirs') => {
      await git(repoPath, ['checkout', `--${strategy}`, '--', file])
      await git(repoPath, ['add', file])
      return true
    }
  )

  // ── Stash ────────────────────────────────────────────────────────────────

  ipcMain.handle('git:stashList', async (_e, repoPath: string) => {
    const raw = await gitSafe(repoPath, [
      'stash',
      'list',
      '--format=%gd||%gs||%ci'
    ])
    if (!raw) return { stashes: [] }
    const stashes = raw.split('\n').filter(Boolean).map((line) => {
      const [ref, message, date] = line.split('||')
      const index = parseInt(ref.replace('stash@{', '').replace('}', ''))
      return { index, message: message || '', date: date || '' }
    })
    return { stashes }
  })

  ipcMain.handle('git:stashSave', async (_e, repoPath: string, message?: string) => {
    const args = ['stash', 'push']
    if (message) args.push('-m', message)
    await git(repoPath, args)
    return true
  })

  ipcMain.handle('git:stashPop', async (_e, repoPath: string, index?: number) => {
    const args = ['stash', 'pop']
    if (index !== undefined) args.push(`stash@{${index}}`)
    await git(repoPath, args)
    return true
  })

  ipcMain.handle('git:stashDrop', async (_e, repoPath: string, index: number) => {
    await git(repoPath, ['stash', 'drop', `stash@{${index}}`])
    return true
  })

  // ── Log ──────────────────────────────────────────────────────────────────

  ipcMain.handle('git:log', async (_e, repoPath: string, count: number = 20) => {
    const raw = await gitSafe(repoPath, [
      'log',
      `-${count}`,
      '--format=%H||%h||%s||%an||%ci||%D'
    ])
    if (!raw) return { entries: [] }
    const entries = raw.split('\n').filter(Boolean).map((line) => {
      const [hash, shortHash, message, author, date, refs] = line.split('||')
      return { hash, shortHash, message, author, date, refs: refs || '' }
    })
    return { entries }
  })

  // ── Repo config & settings ──────────────────────────────────────────────

  ipcMain.handle('git:repoConfig', async (_e, repoPath: string) => {
    // Remotes
    const remotesRaw = await gitSafe(repoPath, ['remote'])
    const remoteNames = remotesRaw ? remotesRaw.split('\n').filter(Boolean) : []
    const remotes = await Promise.all(
      remoteNames.map(async (name) => {
        const fetchUrl = await gitSafe(repoPath, ['remote', 'get-url', name])
        const pushUrl = await gitSafe(repoPath, ['remote', 'get-url', '--push', name])
        return { name, fetchUrl: fetchUrl || '', pushUrl: pushUrl || fetchUrl || '' }
      })
    )

    // Branch tracking
    const branchRaw = await gitSafe(repoPath, [
      'for-each-ref',
      '--format=%(refname:short)||%(upstream:short)||%(upstream:remotename)||%(upstream:remoteref:short)||%(upstream:track)',
      'refs/heads/'
    ])
    const branches = branchRaw
      ? branchRaw.split('\n').filter(Boolean).map((line) => {
          const [local, upstream, remoteName, remoteBranch, track] = line.split('||')
          return {
            local,
            remote: upstream || null,
            remoteName: remoteName || null,
            remoteBranch: remoteBranch || null,
            gone: track ? track.includes('gone') : false
          }
        })
      : []

    // Local user config
    const userName = (await gitSafe(repoPath, ['config', '--local', 'user.name'])) || null
    const userEmail = (await gitSafe(repoPath, ['config', '--local', 'user.email'])) || null

    // Global user config (fallback)
    const globalUserName = (await gitSafe(repoPath, ['config', '--global', 'user.name'])) || null
    const globalUserEmail = (await gitSafe(repoPath, ['config', '--global', 'user.email'])) || null

    // Default branch
    const defaultBranch = (await gitSafe(repoPath, ['config', 'init.defaultBranch'])) || null

    // Repo metadata
    const isBareRaw = await gitSafe(repoPath, ['rev-parse', '--is-bare-repository'])
    const isBare = isBareRaw === 'true'
    const worktree = await gitSafe(repoPath, ['rev-parse', '--show-toplevel'])
    const gitDir = await gitSafe(repoPath, ['rev-parse', '--git-dir'])

    return {
      remotes,
      branches,
      userName,
      userEmail,
      globalUserName,
      globalUserEmail,
      defaultBranch,
      isBare,
      worktree,
      gitDir
    }
  })

  ipcMain.handle(
    'git:setConfig',
    async (_e, repoPath: string, key: string, value: string, global: boolean = false) => {
      const args = ['config', global ? '--global' : '--local', key, value]
      await git(repoPath, args)
      return true
    }
  )

  ipcMain.handle(
    'git:unsetConfig',
    async (_e, repoPath: string, key: string, global: boolean = false) => {
      try {
        await git(repoPath, ['config', global ? '--global' : '--local', '--unset', key])
      } catch {
        // ignore if key doesn't exist
      }
      return true
    }
  )

  ipcMain.handle(
    'git:addRemote',
    async (_e, repoPath: string, name: string, url: string) => {
      await git(repoPath, ['remote', 'add', name, url])
      return true
    }
  )

  ipcMain.handle(
    'git:removeRemote',
    async (_e, repoPath: string, name: string) => {
      await git(repoPath, ['remote', 'remove', name])
      return true
    }
  )

  ipcMain.handle(
    'git:setRemoteUrl',
    async (_e, repoPath: string, name: string, url: string, push: boolean = false) => {
      const args = ['remote', 'set-url']
      if (push) args.push('--push')
      args.push(name, url)
      await git(repoPath, args)
      return true
    }
  )

  ipcMain.handle(
    'git:renameRemote',
    async (_e, repoPath: string, oldName: string, newName: string) => {
      await git(repoPath, ['remote', 'rename', oldName, newName])
      return true
    }
  )

  ipcMain.handle(
    'git:setBranchUpstream',
    async (_e, repoPath: string, localBranch: string, upstream: string) => {
      await git(repoPath, ['branch', `--set-upstream-to=${upstream}`, localBranch])
      return true
    }
  )

  ipcMain.handle(
    'git:unsetBranchUpstream',
    async (_e, repoPath: string, localBranch: string) => {
      await git(repoPath, ['branch', '--unset-upstream', localBranch])
      return true
    }
  )

  // ── Shell actions ─────────────────────────────────────────────────────────

  ipcMain.handle('shell:openInTerminal', async (_e, dirPath: string) => {
    const platform = process.platform
    if (platform === 'win32') {
      spawn('cmd.exe', ['/K', `cd /d "${dirPath}"`], { detached: true, stdio: 'ignore' }).unref()
    } else if (platform === 'darwin') {
      execFile('open', ['-a', 'Terminal', dirPath])
    } else {
      spawn('x-terminal-emulator', [`--working-directory=${dirPath}`], { detached: true, stdio: 'ignore' }).unref()
    }
    return true
  })

  ipcMain.handle('shell:openInExplorer', async (_e, dirPath: string) => {
    shell.openPath(dirPath)
    return true
  })
}

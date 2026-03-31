import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { spawn, exec, ChildProcess } from 'child_process'
import { readdir, readFile, writeFile, access, stat } from 'fs/promises'
import { join, basename } from 'path'
import * as net from 'net'
import * as http from 'http'
import * as https from 'https'

// ── Types ───────────────────────────────────────────────────────────────────

type ServiceType =
  | 'spring-boot-maven'
  | 'spring-boot-gradle'
  | 'node'
  | 'python'
  | 'docker-compose'
  | 'custom'

interface ServiceConfig {
  id: string
  name: string
  type: ServiceType
  workingDir: string
  command: string
  buildCommand?: string
  port?: number
  healthCheckUrl?: string
  group?: string
  dependsOn?: string[]
  envVars?: Record<string, string>
  autoRestart: boolean
}

interface DevProfile {
  id: string
  name: string
  rootPath: string
  services: ServiceConfig[]
  createdAt: number
}

interface ServiceScanResult {
  name: string
  type: ServiceType
  workingDir: string
  suggestedCommand: string
  suggestedBuildCommand?: string
  suggestedPort?: number
  subServices?: ServiceScanResult[]
}

interface ManagedProcess {
  profileId: string
  serviceId: string
  process: ChildProcess
  startedAt: number
  autoRestart: boolean
  config: ServiceConfig
}

// ── Profile Persistence ─────────────────────────────────────────────────────

const profilesPath = () => join(app.getPath('userData'), 'dev-profiles.json')

async function loadProfiles(): Promise<DevProfile[]> {
  try {
    const data = await readFile(profilesPath(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function saveProfiles(profiles: DevProfile[]): Promise<void> {
  await writeFile(profilesPath(), JSON.stringify(profiles, null, 2), 'utf-8')
}

// ── Process Management ──────────────────────────────────────────────────────

const processes = new Map<string, ManagedProcess>()

function processKey(profileId: string, serviceId: string): string {
  return `${profileId}:${serviceId}`
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function sendToRenderer(channel: string, data: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

function sendLog(serviceId: string, stream: 'stdout' | 'stderr' | 'system', text: string): void {
  sendToRenderer('dev:service:log', {
    serviceId,
    entry: { timestamp: Date.now(), stream, text }
  })
}

function sendStatus(
  serviceId: string,
  status: string,
  extra?: { pid?: number; error?: string }
): void {
  sendToRenderer('dev:service:status', { serviceId, status, ...extra })
}

async function startServiceProcess(
  profileId: string,
  config: ServiceConfig
): Promise<void> {
  const key = processKey(profileId, config.id)

  // Kill existing if running
  if (processes.has(key)) {
    await killProcess(key)
  }

  // Check port availability
  if (config.port) {
    const available = await isPortAvailable(config.port)
    if (!available) {
      sendStatus(config.id, 'error', { error: `Port ${config.port} already in use` })
      sendLog(config.id, 'system', `Port ${config.port} deja utilise`)
      return
    }
  }

  // Build environment
  const env = { ...process.env, ...(config.envVars || {}) }

  sendStatus(config.id, 'starting')
  sendLog(config.id, 'system', `Demarrage: ${config.command}`)
  sendLog(config.id, 'system', `Repertoire: ${config.workingDir}`)

  const child = spawn(config.command, [], {
    cwd: config.workingDir,
    env,
    shell: true,
    windowsHide: true
  })

  const managed: ManagedProcess = {
    profileId,
    serviceId: config.id,
    process: child,
    startedAt: Date.now(),
    autoRestart: config.autoRestart,
    config
  }

  processes.set(key, managed)

  // Buffer log lines to avoid flooding IPC (batch every 100ms)
  let stdoutBuffer = ''
  let stderrBuffer = ''
  let flushTimer: NodeJS.Timeout | null = null

  function flushBuffers(): void {
    if (stdoutBuffer) {
      const lines = stdoutBuffer
      stdoutBuffer = ''
      sendLog(config.id, 'stdout', lines.trimEnd())
    }
    if (stderrBuffer) {
      const lines = stderrBuffer
      stderrBuffer = ''
      sendLog(config.id, 'stderr', lines.trimEnd())
    }
    flushTimer = null
  }

  function scheduleFlush(): void {
    if (!flushTimer) {
      flushTimer = setTimeout(flushBuffers, 100)
    }
  }

  child.stdout?.on('data', (data: Buffer) => {
    stdoutBuffer += data.toString()
    scheduleFlush()
  })

  child.stderr?.on('data', (data: Buffer) => {
    stderrBuffer += data.toString()
    scheduleFlush()
  })

  child.on('error', (err) => {
    flushBuffers()
    sendLog(config.id, 'system', `Erreur: ${err.message}`)
    sendStatus(config.id, 'error', { error: err.message })
    processes.delete(key)
  })

  child.on('exit', (code, signal) => {
    flushBuffers()
    if (flushTimer) clearTimeout(flushTimer)
    processes.delete(key)

    const msg = signal
      ? `Processus arrete par signal ${signal}`
      : `Processus termine avec code ${code}`
    sendLog(config.id, 'system', msg)

    if (code !== 0 && code !== null && !signal) {
      sendStatus(config.id, 'error', { error: `Exit code ${code}` })

      // Auto-restart on error
      if (managed.autoRestart) {
        sendLog(config.id, 'system', 'Redemarrage automatique dans 2s...')
        setTimeout(() => {
          startServiceProcess(profileId, config)
        }, 2000)
      }
    } else {
      sendStatus(config.id, 'stopped')
    }
  })

  // Start health check polling
  if (config.type === 'docker-compose') {
    // For docker-compose, poll container status
    pollDockerCompose(config.id, config.workingDir, config.command, key)
  } else if (config.port) {
    pollPort(config.id, config.port, 60000, child.pid)
  } else {
    // No port to check, mark as running after a short delay
    setTimeout(() => {
      if (processes.has(key)) {
        sendStatus(config.id, 'running', { pid: child.pid })
      }
    }, 1000)
  }
}

async function killProcess(key: string): Promise<void> {
  const managed = processes.get(key)
  if (!managed) return

  // Prevent auto-restart during intentional stop
  managed.autoRestart = false

  const { process: child } = managed
  const pid = child.pid

  if (!pid) {
    processes.delete(key)
    return
  }

  return new Promise<void>((resolve) => {
    const onExit = () => {
      processes.delete(key)
      resolve()
    }

    child.once('exit', onExit)

    if (process.platform === 'win32') {
      // On Windows, use taskkill to kill the process tree
      exec(`taskkill /pid ${pid} /T /F`, () => {
        // If taskkill fails, the process might already be dead
        setTimeout(() => {
          if (processes.has(key)) {
            processes.delete(key)
            resolve()
          }
        }, 1000)
      })
    } else {
      child.kill('SIGTERM')
      // Fallback SIGKILL after 5 seconds
      setTimeout(() => {
        if (processes.has(key)) {
          child.kill('SIGKILL')
          setTimeout(onExit, 500)
        }
      }, 5000)
    }
  })
}

// ── Kill External Process ───────────────────────────────────────────────────

function killByPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // Find PID listening on port, then taskkill
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(false)
          return
        }
        // Extract PID from last column
        const pids = new Set<string>()
        for (const line of stdout.trim().split('\n')) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
        }
        if (pids.size === 0) {
          resolve(false)
          return
        }
        const kills = Array.from(pids).map(
          (pid) =>
            new Promise<void>((res) => {
              exec(`taskkill /pid ${pid} /T /F`, () => res())
            })
        )
        Promise.all(kills).then(() => resolve(true))
      })
    } else {
      // Unix: lsof + kill
      exec(`lsof -ti:${port}`, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(false)
          return
        }
        const pids = stdout.trim().split('\n').filter((p) => /^\d+$/.test(p))
        if (pids.length === 0) {
          resolve(false)
          return
        }
        exec(`kill -9 ${pids.join(' ')}`, () => resolve(true))
      })
    }
  })
}

function killExternalService(config: ServiceConfig): Promise<boolean> {
  return new Promise(async (resolve) => {
    if (config.type === 'docker-compose') {
      const fileMatch = config.command.match(/-f\s+(\S+)/)
      const composeFile = fileMatch ? fileMatch[1] : 'docker-compose.yml'
      exec(
        `docker compose -f ${composeFile} stop`,
        { cwd: config.workingDir, timeout: 30000 },
        (err) => resolve(!err)
      )
    } else if (config.port) {
      const killed = await killByPort(config.port)
      // Wait a moment for the port to be released
      if (killed) {
        await new Promise((r) => setTimeout(r, 1000))
      }
      resolve(killed)
    } else {
      resolve(false)
    }
  })
}

// ── Port Check ──────────────────────────────────────────────────────────────

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

function pollPort(
  serviceId: string,
  port: number,
  timeout: number,
  pid?: number
): void {
  const startTime = Date.now()

  const check = () => {
    const socket = new net.Socket()
    socket.setTimeout(1000)

    socket.on('connect', () => {
      socket.destroy()
      sendStatus(serviceId, 'running', { pid })
      sendLog(serviceId, 'system', `Port ${port} accessible - service pret`)
    })

    socket.on('error', () => {
      socket.destroy()
      if (Date.now() - startTime < timeout) {
        setTimeout(check, 2000)
      } else {
        sendLog(serviceId, 'system', `Timeout: port ${port} non accessible apres ${timeout / 1000}s`)
      }
    })

    socket.on('timeout', () => {
      socket.destroy()
      if (Date.now() - startTime < timeout) {
        setTimeout(check, 2000)
      }
    })

    socket.connect(port, '127.0.0.1')
  }

  // Wait 2s before first check
  setTimeout(check, 2000)
}

function checkHealthUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      // Any 2xx or 3xx response = healthy
      resolve(res.statusCode !== undefined && res.statusCode < 400)
      res.resume() // consume response to free resources
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

function checkDockerComposeRunning(workingDir: string, composeFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Try --format json first
    const jsonCmd = `docker compose -f ${composeFile} ps --format json`
    exec(jsonCmd, { cwd: workingDir, timeout: 10000 }, (err, stdout) => {
      if (!err && stdout.trim()) {
        try {
          const lines = stdout.trim().split('\n')
          const containers = lines.map((line) => JSON.parse(line))
          if (containers.length > 0) {
            resolve(
              containers.some((c: { State?: string }) =>
                (c.State || '').toLowerCase() === 'running'
              )
            )
            return
          }
        } catch {
          // JSON parse failed — fall through to plain text
        }
      }

      // Fallback: plain docker compose ps (look for "running" or "Up" in output)
      const plainCmd = `docker compose -f ${composeFile} ps`
      exec(plainCmd, { cwd: workingDir, timeout: 10000 }, (err2, stdout2) => {
        if (err2 || !stdout2.trim()) {
          resolve(false)
          return
        }
        // docker compose ps outputs lines with state columns containing "running" or "Up"
        const lines = stdout2.trim().split('\n')
        // Skip header line, check if any line contains running/Up
        const hasRunning = lines.some((line) =>
          /\brunning\b/i.test(line) || /\bUp\b/.test(line)
        )
        resolve(hasRunning)
      })
    })
  })
}

function pollDockerCompose(
  serviceId: string,
  workingDir: string,
  command: string,
  procKey: string
): void {
  const startTime = Date.now()
  const timeout = 120000 // 2 min for docker compose

  const fileMatch = command.match(/-f\s+(\S+)/)
  const composeFile = fileMatch ? fileMatch[1] : 'docker-compose.yml'

  const check = async () => {
    const managed = processes.get(procKey)
    if (!managed) return

    const pid = managed.process.pid

    const running = await checkDockerComposeRunning(workingDir, composeFile)

    if (!processes.has(procKey)) return

    if (running) {
      sendLog(serviceId, 'system', 'Containers prets - service running')
      sendStatus(serviceId, 'running', { pid })
    } else if (Date.now() - startTime < timeout) {
      setTimeout(check, 3000)
    } else {
      sendLog(serviceId, 'system', 'Timeout: containers non prets apres 2min')
      sendStatus(serviceId, 'running', { pid }) // Mark running anyway
    }
  }

  // Wait 5s before first check to let containers start
  setTimeout(check, 5000)
}

// ── Service Scanner ─────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function fileContains(filePath: string, needle: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return content.includes(needle)
  } catch {
    return false
  }
}

const isWin = process.platform === 'win32'

async function detectService(dirPath: string): Promise<ServiceScanResult | null> {
  const name = basename(dirPath)

  // Spring Boot Maven
  const pomPath = join(dirPath, 'pom.xml')
  if (await fileExists(pomPath)) {
    if (await fileContains(pomPath, 'spring-boot')) {
      const command = isWin ? 'mvnw.cmd spring-boot:run' : './mvnw spring-boot:run'
      const buildCommand = isWin ? 'mvnw.cmd clean package -DskipTests' : './mvnw clean package -DskipTests'
      const port = await detectSpringPort(dirPath)
      return { name, type: 'spring-boot-maven', workingDir: dirPath, suggestedCommand: command, suggestedBuildCommand: buildCommand, suggestedPort: port }
    }
  }

  // Spring Boot Gradle
  const gradlePath = join(dirPath, 'build.gradle')
  const gradleKtsPath = join(dirPath, 'build.gradle.kts')
  for (const gp of [gradlePath, gradleKtsPath]) {
    if (await fileExists(gp)) {
      if (await fileContains(gp, 'spring-boot')) {
        const command = isWin ? 'gradlew.bat bootRun' : './gradlew bootRun'
        const buildCommand = isWin ? 'gradlew.bat clean build -x test' : './gradlew clean build -x test'
        const port = await detectSpringPort(dirPath)
        return { name, type: 'spring-boot-gradle', workingDir: dirPath, suggestedCommand: command, suggestedBuildCommand: buildCommand, suggestedPort: port }
      }
    }
  }

  // Node.js
  const pkgPath = join(dirPath, 'package.json')
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
      const scripts = pkg.scripts || {}
      let command = 'npm start'
      if (scripts.dev) command = 'npm run dev'
      else if (scripts.start) command = 'npm start'
      else return null // No runnable script
      const buildCommand = scripts.build ? 'npm run build' : undefined
      const port = pkg.config?.port || undefined
      return { name, type: 'node', workingDir: dirPath, suggestedCommand: command, suggestedBuildCommand: buildCommand, suggestedPort: port }
    } catch {
      // Invalid package.json
    }
  }

  // Python
  if (await fileExists(join(dirPath, 'manage.py'))) {
    return { name, type: 'python', workingDir: dirPath, suggestedCommand: 'python manage.py runserver', suggestedPort: 8000 }
  }
  if (await fileExists(join(dirPath, 'pyproject.toml'))) {
    return { name, type: 'python', workingDir: dirPath, suggestedCommand: 'python -m uvicorn main:app', suggestedPort: 8000 }
  }

  // Docker Compose
  for (const dcFile of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml']) {
    if (await fileExists(join(dirPath, dcFile))) {
      const buildCommand = `docker compose -f ${dcFile} build`
      return { name, type: 'docker-compose', workingDir: dirPath, suggestedCommand: `docker compose -f ${dcFile} up`, suggestedBuildCommand: buildCommand }
    }
  }

  return null
}

function extractPortFromYml(content: string): number | undefined {
  // Match server.port or port: under server: block
  const match = content.match(/(?:server\.port|^\s*port)\s*[:=]\s*(\d+)/m)
  if (match) return parseInt(match[1])
  return undefined
}

function extractPortFromProperties(content: string): number | undefined {
  const match = content.match(/server\.port\s*=\s*(\d+)/)
  if (match) return parseInt(match[1])
  return undefined
}

async function detectSpringPort(dirPath: string): Promise<number | undefined> {
  const resourcesDir = join(dirPath, 'src', 'main', 'resources')

  // 1. application.yml / application.yaml
  for (const ext of ['yml', 'yaml']) {
    const filePath = join(resourcesDir, `application.${ext}`)
    try {
      const content = await readFile(filePath, 'utf-8')
      const port = extractPortFromYml(content)
      if (port) return port
    } catch { /* not found */ }
  }

  // 2. application-local.yml / application-local.yaml
  for (const ext of ['yml', 'yaml']) {
    const filePath = join(resourcesDir, `application-local.${ext}`)
    try {
      const content = await readFile(filePath, 'utf-8')
      const port = extractPortFromYml(content)
      if (port) return port
    } catch { /* not found */ }
  }

  // 3. First application-*.yml found
  try {
    const entries = await readdir(resourcesDir)
    const profileYml = entries.find(
      (f) => /^application-.+\.ya?ml$/.test(f) && !f.startsWith('application-local.')
    )
    if (profileYml) {
      const content = await readFile(join(resourcesDir, profileYml), 'utf-8')
      const port = extractPortFromYml(content)
      if (port) return port
    }
  } catch { /* dir not found */ }

  // 4. Fallback: application.properties
  try {
    const content = await readFile(join(resourcesDir, 'application.properties'), 'utf-8')
    const port = extractPortFromProperties(content)
    if (port) return port
  } catch { /* not found */ }

  return undefined
}

async function scanDirectory(rootPath: string): Promise<ServiceScanResult[]> {
  const results: ServiceScanResult[] = []

  async function scanDir(dirPath: string, depth: number): Promise<void> {
    if (depth > 2) return
    try {
      const detected = await detectService(dirPath)
      if (detected) {
        results.push(detected)
        // Don't recurse into detected services (except docker-compose)
        if (detected.type !== 'docker-compose') return
      }

      if (depth < 2) {
        const entries = await readdir(dirPath, { withFileTypes: true })
        const dirs = entries.filter(
          (e) =>
            e.isDirectory() &&
            !e.name.startsWith('.') &&
            e.name !== 'node_modules' &&
            e.name !== 'target' &&
            e.name !== 'build' &&
            e.name !== 'dist' &&
            e.name !== '__pycache__'
        )
        await Promise.all(dirs.map((d) => scanDir(join(dirPath, d.name), depth + 1)))
      }
    } catch {
      // skip inaccessible dirs
    }
  }

  await scanDir(rootPath, 0)
  return results
}

// ── Topological Sort for Dependencies ───────────────────────────────────────

function topologicalSort(services: ServiceConfig[]): string[][] {
  const idSet = new Set(services.map((s) => s.id))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const s of services) {
    inDegree.set(s.id, 0)
    adj.set(s.id, [])
  }

  for (const s of services) {
    if (s.dependsOn) {
      for (const dep of s.dependsOn) {
        if (idSet.has(dep)) {
          adj.get(dep)!.push(s.id)
          inDegree.set(s.id, (inDegree.get(s.id) || 0) + 1)
        }
      }
    }
  }

  const layers: string[][] = []
  let remaining = services.length

  while (remaining > 0) {
    const layer: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) layer.push(id)
    }

    if (layer.length === 0) {
      // Cycle detected — just add all remaining
      const leftover: string[] = []
      for (const [id, deg] of inDegree) {
        if (deg > 0) leftover.push(id)
      }
      layers.push(leftover)
      break
    }

    for (const id of layer) {
      inDegree.delete(id)
      for (const next of adj.get(id) || []) {
        if (inDegree.has(next)) {
          inDegree.set(next, (inDegree.get(next) || 0) - 1)
        }
      }
    }

    layers.push(layer)
    remaining -= layer.length
  }

  return layers
}

// ── Register All IPC Handlers ───────────────────────────────────────────────

export function registerDevHandlers(): void {
  // ── Profile CRUD ────────────────────────────────────────────────────────

  ipcMain.handle('dev:profile:list', async () => {
    return loadProfiles()
  })

  ipcMain.handle('dev:profile:save', async (_e, profile: DevProfile) => {
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

  ipcMain.handle('dev:profile:delete', async (_e, profileId: string) => {
    // Stop all services for this profile
    for (const [key, managed] of processes) {
      if (managed.profileId === profileId) {
        await killProcess(key)
      }
    }
    let profiles = await loadProfiles()
    profiles = profiles.filter((p) => p.id !== profileId)
    await saveProfiles(profiles)
    return profiles
  })

  ipcMain.handle('dev:profile:export', async (_e, profile: DevProfile) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const result = await dialog.showSaveDialog(win, {
      title: 'Exporter le profil',
      defaultPath: `${profile.name.replace(/\s+/g, '-')}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, JSON.stringify(profile, null, 2), 'utf-8')
    return true
  })

  ipcMain.handle('dev:profile:import', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Importer un profil',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    try {
      const data = await readFile(result.filePaths[0], 'utf-8')
      const imported = JSON.parse(data) as DevProfile

      // Validate shape
      if (!imported.name || !imported.rootPath || !Array.isArray(imported.services)) {
        return null
      }

      // Assign new ID to avoid collisions
      imported.id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
      imported.createdAt = Date.now()

      const profiles = await loadProfiles()
      profiles.push(imported)
      await saveProfiles(profiles)
      return profiles
    } catch {
      return null
    }
  })

  // ── Service Scanner ─────────────────────────────────────────────────────

  ipcMain.handle('dev:scan', async (_e, rootPath: string) => {
    return scanDirectory(rootPath)
  })

  // ── Service Lifecycle ───────────────────────────────────────────────────

  ipcMain.handle('dev:service:start', async (_e, profileId: string, serviceId: string) => {
    const profiles = await loadProfiles()
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return false

    const config = profile.services.find((s) => s.id === serviceId)
    if (!config) return false

    await startServiceProcess(profileId, config)
    return true
  })

  ipcMain.handle('dev:service:stop', async (_e, profileId: string, serviceId: string) => {
    const key = processKey(profileId, serviceId)
    sendStatus(serviceId, 'stopping')

    if (processes.has(key)) {
      // Managed by us
      await killProcess(key)
    } else {
      // External — try to kill it
      const profiles = await loadProfiles()
      const profile = profiles.find((p) => p.id === profileId)
      const config = profile?.services.find((s) => s.id === serviceId)
      if (config) {
        sendLog(serviceId, 'system', 'Arret du service externe...')
        await killExternalService(config)
      }
    }

    sendStatus(serviceId, 'stopped')
    return true
  })

  ipcMain.handle('dev:service:restart', async (_e, profileId: string, serviceId: string) => {
    const key = processKey(profileId, serviceId)

    const profiles = await loadProfiles()
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return false

    const config = profile.services.find((s) => s.id === serviceId)
    if (!config) return false

    sendStatus(serviceId, 'stopping')

    if (processes.has(key)) {
      // Managed by us — kill managed process
      await killProcess(key)
    } else {
      // External — kill external process first
      sendLog(serviceId, 'system', 'Arret du service externe...')
      await killExternalService(config)
    }

    // Start via the app
    await startServiceProcess(profileId, config)
    return true
  })

  ipcMain.handle(
    'dev:service:startBatch',
    async (_e, profileId: string, serviceIds: string[]) => {
      const profiles = await loadProfiles()
      const profile = profiles.find((p) => p.id === profileId)
      if (!profile) return false

      const configs = profile.services.filter((s) => serviceIds.includes(s.id))
      const layers = topologicalSort(configs)

      for (const layer of layers) {
        await Promise.all(
          layer.map((id) => {
            const config = configs.find((c) => c.id === id)
            if (config) return startServiceProcess(profileId, config)
            return Promise.resolve()
          })
        )
        // Wait a moment between layers for dependencies to start
        if (layers.indexOf(layer) < layers.length - 1) {
          await new Promise((r) => setTimeout(r, 3000))
        }
      }

      return true
    }
  )

  ipcMain.handle(
    'dev:service:stopBatch',
    async (_e, profileId: string, serviceIds: string[]) => {
      const profiles = await loadProfiles()
      const profile = profiles.find((p) => p.id === profileId)

      await Promise.all(
        serviceIds.map(async (serviceId) => {
          const key = processKey(profileId, serviceId)
          sendStatus(serviceId, 'stopping')

          if (processes.has(key)) {
            await killProcess(key)
          } else if (profile) {
            // External service — kill by port or docker compose stop
            const config = profile.services.find((s) => s.id === serviceId)
            if (config) await killExternalService(config)
          }
        })
      )
      for (const serviceId of serviceIds) {
        sendStatus(serviceId, 'stopped')
      }
      return true
    }
  )

  // ── Build ────────────────────────────────────────────────────────────────

  ipcMain.handle('dev:service:build', async (_e, profileId: string, serviceId: string) => {
    const profiles = await loadProfiles()
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return false

    const config = profile.services.find((s) => s.id === serviceId)
    if (!config || !config.buildCommand) return false

    // Run build as a one-shot process (not managed long-running)
    const key = `build:${profileId}:${serviceId}`

    sendLog(serviceId, 'system', `Build: ${config.buildCommand}`)
    sendLog(serviceId, 'system', `Repertoire: ${config.workingDir}`)
    sendStatus(serviceId, 'starting')

    return new Promise<boolean>((resolve) => {
      const env = { ...process.env, ...(config.envVars || {}) }

      const child = spawn(config.buildCommand!, [], {
        cwd: config.workingDir,
        env,
        shell: true,
        windowsHide: true
      })

      child.stdout?.on('data', (data: Buffer) => {
        sendLog(serviceId, 'stdout', data.toString().trimEnd())
      })

      child.stderr?.on('data', (data: Buffer) => {
        sendLog(serviceId, 'stderr', data.toString().trimEnd())
      })

      child.on('error', (err) => {
        sendLog(serviceId, 'system', `Erreur build: ${err.message}`)
        sendStatus(serviceId, 'error', { error: err.message })
        resolve(false)
      })

      child.on('exit', (code) => {
        if (code === 0) {
          sendLog(serviceId, 'system', 'Build termine avec succes')
          sendStatus(serviceId, 'stopped')
          resolve(true)
        } else {
          sendLog(serviceId, 'system', `Build echoue (code ${code})`)
          sendStatus(serviceId, 'error', { error: `Build exit code ${code}` })
          resolve(false)
        }
      })
    })
  })

  // ── Restart Batch ────────────────────────────────────────────────────────

  ipcMain.handle(
    'dev:service:restartBatch',
    async (_e, profileId: string, serviceIds: string[]) => {
      const profiles = await loadProfiles()
      const profile = profiles.find((p) => p.id === profileId)
      if (!profile) return false

      // Stop all first (managed + external)
      await Promise.all(
        serviceIds.map(async (serviceId) => {
          const key = processKey(profileId, serviceId)
          sendStatus(serviceId, 'stopping')

          if (processes.has(key)) {
            await killProcess(key)
          } else {
            const config = profile.services.find((s) => s.id === serviceId)
            if (config) await killExternalService(config)
          }
        })
      )

      // Then start with topological sort
      const configs = profile.services.filter((s) => serviceIds.includes(s.id))
      const layers = topologicalSort(configs)

      for (const layer of layers) {
        await Promise.all(
          layer.map((id) => {
            const config = configs.find((c) => c.id === id)
            if (config) return startServiceProcess(profileId, config)
            return Promise.resolve()
          })
        )
        if (layers.indexOf(layer) < layers.length - 1) {
          await new Promise((r) => setTimeout(r, 3000))
        }
      }

      return true
    }
  )

  // ── Port Check ──────────────────────────────────────────────────────────

  ipcMain.handle('dev:port:check', async (_e, port: number) => {
    const available = await isPortAvailable(port)
    return { available }
  })

  ipcMain.handle(
    'dev:port:checkBatch',
    async (_e, ports: { serviceId: string; port: number }[]) => {
      const results: { serviceId: string; port: number; available: boolean }[] = []
      await Promise.all(
        ports.map(async ({ serviceId, port }) => {
          const available = await isPortAvailable(port)
          results.push({ serviceId, port, available })
        })
      )
      return results
    }
  )

  // ── Docker Compose Health Check ─────────────────────────────────────────

  ipcMain.handle(
    'dev:docker:health',
    async (_e, workingDir: string, composeFile?: string) => {
      const file = composeFile || 'docker-compose.yml'
      return new Promise<{ status: 'up' | 'partial' | 'down'; services: { name: string; state: string; health: string }[] }>((resolve) => {
        const cmd = `docker compose -f ${file} ps --format json`
        exec(cmd, { cwd: workingDir }, (err, stdout) => {
          if (err || !stdout.trim()) {
            resolve({ status: 'down', services: [] })
            return
          }

          try {
            // docker compose ps --format json outputs one JSON object per line
            const lines = stdout.trim().split('\n')
            const containers = lines.map((line) => {
              const obj = JSON.parse(line)
              return {
                name: obj.Name || obj.Service || '',
                state: (obj.State || '').toLowerCase(),
                health: (obj.Health || '').toLowerCase()
              }
            })

            const allRunning = containers.every(
              (c) => c.state === 'running'
            )
            const someRunning = containers.some(
              (c) => c.state === 'running'
            )

            resolve({
              status: allRunning ? 'up' : someRunning ? 'partial' : 'down',
              services: containers
            })
          } catch {
            resolve({ status: 'down', services: [] })
          }
        })
      })
    }
  )

  // ── Service Probe (auto-detection) ───────────────────────────────────────

  ipcMain.handle(
    'dev:service:probe',
    async (_e, profileId: string) => {
      const profiles = await loadProfiles()
      const profile = profiles.find((p) => p.id === profileId)
      if (!profile) return []

      const results: { serviceId: string; detected: boolean; viaHealthCheck: boolean }[] = []

      await Promise.all(
        profile.services.map(async (config) => {
          const key = processKey(profileId, config.id)
          const managedByUs = processes.has(key)

          // Skip services we manage — their status is already tracked
          if (managedByUs) return

          let detected = false
          let viaHealthCheck = false

          // 1. Try health check URL first (most reliable)
          if (config.healthCheckUrl) {
            const healthy = await checkHealthUrl(config.healthCheckUrl)
            if (healthy) {
              detected = true
              viaHealthCheck = true
            }
          }

          // 2. If no health check or it failed, fall back to port/docker check
          if (!detected) {
            if (config.type === 'docker-compose') {
              const fileMatch = config.command.match(/-f\s+(\S+)/)
              const composeFile = fileMatch ? fileMatch[1] : 'docker-compose.yml'
              detected = await checkDockerComposeRunning(config.workingDir, composeFile)
              // docker compose ps confirms identity — treat as health check
              if (detected) viaHealthCheck = true
            } else if (config.port) {
              detected = !(await isPortAvailable(config.port))
            }
          }

          results.push({ serviceId: config.id, detected, viaHealthCheck })
        })
      )

      return results
    }
  )

  // ── Managed Process List (for renderer reconciliation) ──────────────────

  ipcMain.handle('dev:process:list', async (_e, profileId: string) => {
    const result: { serviceId: string; pid: number; startedAt: number }[] = []
    for (const [, managed] of processes) {
      if (managed.profileId === profileId && managed.process.pid) {
        result.push({
          serviceId: managed.serviceId,
          pid: managed.process.pid,
          startedAt: managed.startedAt
        })
      }
    }
    return result
  })

  // ── Cleanup on Quit ─────────────────────────────────────────────────────

  app.on('before-quit', async () => {
    const keys = Array.from(processes.keys())
    await Promise.all(keys.map((key) => killProcess(key)))
  })
}

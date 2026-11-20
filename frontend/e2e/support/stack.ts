import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { FRONTEND_DIR, WORKSPACE_DIR, STATE_DIR, STATE_FILE, E2E_DIR } from './paths'

// Single-port stack: the Go backend embeds the web UI (backend/internal/webui/dist),
// so /api/* and the SPA are same-origin on 19201. This avoids a cross-port proxy and CORS.
export const API_PORT = Number(process.env.E2E_API_PORT ?? 19201)
export const WEB_PORT = API_PORT
export const API_BASE = `http://127.0.0.1:${API_PORT}`
export const WEB_BASE = API_BASE

const LOCK_FILE = join(STATE_DIR, 'run.lock')

interface LockInfo {
  runId: string
  pid: number
  startedAt: string
}

export interface StackState {
  apiBase: string
  webBase: string
  runDir: string
  apiPid: number
  backendExe: string
  startedAt: string
  runId: string
  runnerPid: number
}

let apiChild: ChildProcess | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function log(message: string): void {
  process.stdout.write(`[e2e-stack] ${message}\n`)
}

function resolveBackendExe(): string {
  const fromEnv = process.env.E2E_BACKEND_EXE
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`E2E_BACKEND_EXE does not exist: ${fromEnv}`)
    return fromEnv
  }
  const preferred = join(WORKSPACE_DIR, 'backend', 'simo-live-composer.exe')
  if (existsSync(preferred)) return preferred
  const backendDir = join(WORKSPACE_DIR, 'backend')
  if (!existsSync(backendDir)) {
    throw new Error(`backend directory not found: ${backendDir}; set E2E_BACKEND_EXE to a built simo binary`)
  }
  const candidates = readdirSync(backendDir)
    .filter((name) => /^simo.*\.exe$/i.test(name))
    .map((name) => join(backendDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (candidates.length === 0) {
    throw new Error('no simo*.exe under backend/; build one or set E2E_BACKEND_EXE')
  }
  log(`simo-live-composer.exe not found; falling back to newest binary: ${candidates[0]}`)
  return candidates[0]
}

async function waitHttp(url: string, label: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        if (url.endsWith('/api/health')) {
          const body = (await response.json()) as { ready?: boolean }
          if (body.ready === false) {
            lastError = 'health.ready=false'
            await sleep(300)
            continue
          }
        }
        return
      }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = (error as Error).message
    }
    await sleep(300)
  }
  throw new Error(`timed out waiting for ${label} (${timeoutMs}ms): ${url}; last error: ${lastError}`)
}

function isAlive(pid: number | undefined): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function stopPid(pid: number | undefined, label: string): Promise<boolean> {
  if (!pid || !isAlive(pid)) return true
  try {
    process.kill(pid)
  } catch (error) {
    log(`failed to stop ${label} (pid=${pid}): ${(error as Error).message}`)
    return !isAlive(pid)
  }
  const deadline = Date.now() + 5000
  while (Date.now() < deadline && isAlive(pid)) await sleep(100)
  if (isAlive(pid)) {
    log(`warning: ${label} (pid=${pid}) did not exit within 5s`)
    return false
  }
  log(`stopped ${label} (pid=${pid})`)
  return true
}

function readLock(): Partial<LockInfo> | null {
  if (!existsSync(LOCK_FILE)) return null
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as Partial<LockInfo>
  } catch {
    return null
  }
}

/**
 * Run lock: prevent two Playwright processes from fighting over 19201 and deleting
 * each other's temp dirs. Use the current Node pid (not ppid: an interactive shell may
 * outlive Playwright, making a stale lock look alive). Global teardown releases by runId.
 */
function acquireRunLock(): LockInfo {
  mkdirSync(STATE_DIR, { recursive: true })
  const info: LockInfo = {
    runId: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(LOCK_FILE, JSON.stringify(info, null, 2), { encoding: 'utf8', flag: 'wx' })
      log(`acquired run lock: ${LOCK_FILE} (runner pid=${info.pid}, runId=${info.runId})`)
      return info
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const existing = readLock()
      if (existing?.pid && existing.pid !== info.pid && isAlive(existing.pid)) {
        throw new Error(
          `another E2E run is in progress (runner pid=${existing.pid}, started at ${existing.startedAt ?? 'unknown'}). ` +
            `Wait for it to finish; if you are sure no E2E process is running, delete ${LOCK_FILE} and retry.`,
        )
      }
      log(`removing stale run lock (pid=${existing?.pid ?? 'unknown'} is gone)`)
      rmSync(LOCK_FILE, { force: true })
    }
  }
  throw new Error(`cannot acquire E2E run lock: ${LOCK_FILE}`)
}

function releaseRunLock(runId?: string): void {
  try {
    const lock = readLock()
    if (lock && (!runId || !lock.runId || lock.runId === runId)) {
      rmSync(LOCK_FILE, { force: true })
      log('released run lock')
    }
  } catch {
    // ignore
  }
}

function assertPortSane(port: number, label: string): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65000) throw new Error(`${label} port is invalid: ${port}`)
  if (port === 8787) throw new Error('E2E must not use 8787 (live instance port)')
}

/** Check that nothing is listening on the port before we start. */
async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let settled = false
    const done = (error?: Error): void => {
      if (settled) return
      settled = true
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }
    socket.setTimeout(1200)
    socket.once('connect', () => done(new Error(`E2E port ${port} is already in use; stop the process using it (or set E2E_API_PORT) and retry.`)))
    socket.once('timeout', () => done())
    socket.once('error', () => done())
  })
}

async function reclaimStaleState(): Promise<void> {
  if (!existsSync(STATE_FILE)) return
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<StackState>
    log(`cleaning stale run: api=${state.apiPid} runDir=${state.runDir}`)
    const stopped = await stopPid(state.apiPid, 'stale api')
    if (stopped && state.runDir) await safeRemoveRunDir(state.runDir)
    rmSync(STATE_FILE, { force: true })
  } catch {
    // Corrupt state file: ignore and let the port check report the real problem.
  }
}

/**
 * Default is an empty SIMO_HOME (main session is initialized by the backend), so tests
 * are fully self-seeded and repeatable. E2E_SEED_HOME copies real data for manual debugging.
 */
function seedHome(homeDir: string): void {
  const source = process.env.E2E_SEED_HOME
  if (!source) {
    log('using empty home; all test data is seeded via API')
    return
  }
  if (!existsSync(source)) throw new Error(`E2E_SEED_HOME does not exist: ${source}`)
  cpSync(source, homeDir, { recursive: true, force: true })
  for (const leftover of ['simo.db-wal', 'simo.db-shm', 'simo.db.lock']) {
    rmSync(join(homeDir, leftover), { force: true })
  }
  log(`copied explicit seed home: ${source} -> ${homeDir}`)
}

async function safeRemoveRunDir(runDir: string): Promise<void> {
  const tmpRoot = join(WORKSPACE_DIR, '.tmp')
  const normalized = runDir.replace(/\\/g, '/')
  const base = normalized.split('/').pop() ?? ''
  if (!normalized.startsWith(tmpRoot.replace(/\\/g, '/')) || !base.startsWith('e2e-run-')) {
    log(`skip cleanup (path is not under .tmp/e2e-run-*): ${runDir}`)
    return
  }
  // Right after the backend exits Windows may still hold the log handle briefly
  // (Defender / delayed reclaim); retry a few times before giving up.
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      rmSync(runDir, { recursive: true, force: true })
      log(`removed run dir: ${runDir}`)
      return
    } catch (error) {
      if (attempt === 20) {
        log(`failed to remove run dir (logs kept): ${(error as Error).message}`)
        return
      }
      await sleep(250)
    }
  }
}

export async function startStack(): Promise<StackState> {
  const lock = acquireRunLock()
  try {
    await reclaimStaleState()
    assertPortSane(API_PORT, 'API')
    await assertPortFree(API_PORT)

    // The backend embeds the web UI; fail early with a clear message if the build is missing.
    const embeddedIndex = join(WORKSPACE_DIR, 'backend', 'internal', 'webui', 'dist', 'index.html')
    const frontendIndex = join(FRONTEND_DIR, 'dist', 'index.html')
    if (!existsSync(embeddedIndex) && !existsSync(frontendIndex)) {
      throw new Error(`web build output not found: ${embeddedIndex} or ${frontendIndex}; build frontend and rebuild backend first`)
    }

    const backendExe = resolveBackendExe()
    mkdirSync(join(WORKSPACE_DIR, '.tmp'), { recursive: true })
    const runDir = mkdtempSync(join(WORKSPACE_DIR, '.tmp', 'e2e-run-'))
    const homeDir = join(runDir, 'home')
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(join(homeDir, 'artifacts'), { recursive: true })
    mkdirSync(join(homeDir, 'workspace'), { recursive: true })
    mkdirSync(join(homeDir, 'logs'), { recursive: true })
    seedHome(homeDir)

    const apiLogFd = openSync(join(runDir, 'api.log'), 'a')
    let childSpawned = false
    try {
      log(`backend: ${backendExe}`)
      log(`data dir: ${homeDir}`)
      apiChild = spawn(backendExe, ['serve', '-addr', `127.0.0.1:${API_PORT}`, '-model', 'mock'], {
        cwd: WORKSPACE_DIR,
        env: {
          ...process.env,
          SIMO_HOME: homeDir,
          SIMO_LLM: 'mock',
          SIMO_MODEL: 'mock',
          SIMO_DEBUG: '1',
        },
        stdio: ['ignore', apiLogFd, apiLogFd],
        windowsHide: true,
      })
      childSpawned = true
    } finally {
      // On Windows the parent must release the log fd, otherwise teardown cannot delete runDir (EPERM).
      // The child has already inherited its own handle.
      closeSync(apiLogFd)
    }
    if (childSpawned) {
      apiChild?.on('exit', (code, signal) => log(`backend exited: code=${code} signal=${signal}`))
      apiChild?.on('error', (error) => log(`backend spawn failed: ${error.message}`))
    }

    try {
      await waitHttp(`${API_BASE}/api/health`, 'backend /api/health', 45_000)
      // Same-port SPA: confirm the index page is served and references the built assets.
      await waitHttp(`${API_BASE}/`, 'embedded web /', 15_000)
    } catch (error) {
      log(`backend failed to start; log: ${join(runDir, 'api.log')}`)
      throw error
    }

    const state: StackState = {
      apiBase: API_BASE,
      webBase: WEB_BASE,
      runDir,
      apiPid: apiChild.pid ?? 0,
      backendExe,
      startedAt: new Date().toISOString(),
      runId: lock.runId,
      runnerPid: lock.pid,
    }
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
    log(`ready: base=${API_BASE} apiPid=${state.apiPid} runDir=${runDir}`)
    return state
  } catch (error) {
    releaseRunLock(lock.runId)
    throw error
  }
}

export async function stopStack(): Promise<void> {
  const keep = process.env.E2E_KEEP_STACK === '1'
  let state: Partial<StackState> = {}
  try {
    if (existsSync(STATE_FILE)) state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<StackState>
  } catch {
    // ignore
  }
  const pid = apiChild?.pid ?? state.apiPid
  if (keep) {
    log(`E2E_KEEP_STACK=1; keeping service: pid=${pid} runDir=${state.runDir} (run lock released)`)
    releaseRunLock(state.runId)
    return
  }
  const stopped = await stopPid(pid, 'api')
  if (stopped) {
    if (state.runDir) await safeRemoveRunDir(state.runDir)
    try {
      rmSync(STATE_FILE, { force: true })
    } catch {
      // ignore
    }
    log('stopped E2E service and removed temp data')
  } else {
    log(`service did not exit; keeping runDir and state for debugging: pid=${pid} runDir=${state.runDir}`)
  }
  releaseRunLock(state.runId)
}

export function readStack(): StackState {
  if (!existsSync(STATE_FILE)) {
    throw new Error(`missing E2E state: ${STATE_FILE}; run through pnpm test:e2e (globalSetup starts the isolated stack)`)
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as StackState
}

// Kept for scripts (preflight etc.); tests do not import these.
export const E2E_RUN_ROOT = join(WORKSPACE_DIR, '.tmp')
export const E2E_DIR_REF = E2E_DIR

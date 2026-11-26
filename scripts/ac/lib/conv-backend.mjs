// scripts/ac/lib/conv-backend.mjs
// P1-CONV 任务域接口组公共层（AC-CONV-009-01..04/14..18、AC-CHG-CONV-007-02/03/04/08）。
// 口径：真后端隔离实例 127.0.0.1:8789，SIMO_HOME=.tmp/ac-conv-009/home，Mock 执行器；
// 每个脚本独占实例（文件锁串行），脚本自带夹具与清理，结束后停服务。
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { ROOT, report } from './harness.mjs'

export const T06 = path.join(ROOT, '.tmp', 'chg-007-T06')
export const HOME = process.env.AC_CONV_HOME || path.join(ROOT, '.tmp', 'ac-conv-009', 'home')
export const BASE = (process.env.AC_CONV_BASE || 'http://127.0.0.1:8789').replace(/\/+$/, '')
export const DB_FILE = path.join(HOME, 'simo.db')
// 端口从 AC_CONV_BASE 派生：多个并行任务共用一台机器时各用各的隔离端口与隔离 SIMO_HOME，
// 默认仍是 8789（唯一实例），假上游默认 8790（非默认端口时取 PORT+1）。
export const PORT = Number(new URL(BASE).port || (BASE.startsWith('https') ? 443 : 80))
export const UPSTREAM_PORT = Number(process.env.AC_CONV_UPSTREAM_PORT || (PORT === 8789 ? 8790 : PORT + 1))
export const UPSTREAM_BASE = `http://127.0.0.1:${UPSTREAM_PORT}`
const EXE = path.join(T06, 'simo.exe')
// 带 -tags testclock 的测试构建：只用于时间类判据（30 分钟窗口、1 分钟提醒），
// 通过 SIMO_TEST_CLOCK 放大服务端时钟。生产构建 simo.exe 不含这段代码，传了环境变量也无效。
const EXE_TESTCLOCK = path.join(T06, 'simo-testclock.exe')
const TEST_CLOCK_DEFAULT = 'rate=200'
// 单脚本模式的实例锁：默认仍是共享的一把（旧行为不变）；cdp 并发泳道由 harness 经 AC_CONV_LOCK
// 下发各自 HOME 下的独立锁，否则 4 条泳道会抢同一把锁而退化成串行。
const LOCK = process.env.AC_CONV_LOCK || path.join(T06, 'backend.lock')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 批次共享模式：run-ac.mjs 已起好实例并经 AC_CONV_BASE / AC_CONV_HOME 下发；
// 脚本不再抢锁、不再起停服务。未设时保持单脚本模式（自起自停，作回退与对照基线）。
export const SHARED = process.env.AC_CONV_SHARED === '1'
// 失败快速停：断言失败立刻抛 AcStop，剩余步骤不再跑（只在失败路径生效，通过路径断言条数不变）。
const FAIL_FAST = process.env.AC_FAIL_FAST === '1'

export class AcError extends Error {
  constructor(code, message, expected, actual) {
    super(message)
    this.code = code
    this.expected = expected
    this.actual = actual
  }
}

/** 失败快速停：带上首条失败断言的 code/期望/实得，交给 runAc 统一转失败详情。 */
export class AcStop extends AcError {
  constructor(item) {
    super(item.code || 'R-SCRIPT', `断言失败: ${item.label}`, item.expected, item.actual)
    this.check = item
  }
}

/* ---------- 断言 ---------- */

export function makeCtx() {
  return {
    checks: [],
    raw: {},
    check(ok, label, expected, actual, code = 'R-SCRIPT') {
      const item = { label, ok: Boolean(ok), expected, actual }
      if (!ok) item.code = code
      this.checks.push(item)
      if (!ok && !this.failed) this.failed = item
      // 失败快速停：关键判据先跑，一旦不成立立刻中止，不再跑后面的步骤与等待。
      if (!ok && FAIL_FAST) throw new AcStop(item)
      return Boolean(ok)
    },
    eq(actual, expected, label, code = 'R-SCRIPT') {
      return this.check(Object.is(actual, expected), label, JSON.stringify(expected), JSON.stringify(actual), code)
    },
    match(actual, re, label, code = 'R-SCRIPT') {
      return this.check(typeof actual === 'string' && re.test(actual), label, String(re), JSON.stringify(actual), code)
    },
  }
}

function failureDetail(ac, err) {
  const code = err.code || 'R-SCRIPT'
  const exp = err.expected === undefined ? '' : ` 预期=${err.expected}`
  const act = err.actual === undefined ? '' : ` 实得=${err.actual}`
  return `${code} ${ac}: ${err.message}${exp}${act}`
}

/* ---------- HTTP ---------- */

export async function api(method, p, body, timeoutMs = 8000) {
  let res
  try {
    res = await fetch(BASE + p, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new AcError('R-ENV', `${method} ${p} 请求失败: ${err.message}`, 'HTTP 响应', err.message)
  }
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, json, text, headers: res.headers }
}

export async function createSession(title) {
  const res = await api('POST', '/api/sessions', { title, draft: false })
  if (res.status !== 201) throw new AcError('R-ENV', `创建会话失败: ${res.status} ${res.text.slice(0, 200)}`, 201, res.status)
  const id = res.json && res.json.session && res.json.session.id
  if (!id) throw new AcError('R-ENV', '创建会话响应缺少 session.id', 'session.id', res.text.slice(0, 200))
  return id
}

export async function createBatch(sessionId, body) {
  return api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks`, body)
}

export async function detail(sessionId, taskId, query = '') {
  return api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${encodeURIComponent(taskId)}${query}`)
}

export async function list(sessionId, query = '') {
  return api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/tasks${query}`)
}

export async function graph(sessionId, query = '') {
  return api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/graph${query}`)
}

export async function waitFor(fn, { timeoutMs = 30000, intervalMs = 400, label = 'condition' } = {}) {
  const end = Date.now() + timeoutMs
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(intervalMs)
  }
  throw new AcError('R-ENV', `等待超时: ${label}`, '条件成立', '超时未成立')
}

export async function waitTaskStatus(sessionId, taskId, statuses, timeoutMs = 30000) {
  const want = Array.isArray(statuses) ? statuses : [statuses]
  return waitFor(async () => {
    const res = await detail(sessionId, taskId)
    if (res.status !== 200) return null
    const task = res.json && res.json.task
    return task && want.includes(task.status) ? { detail: res.json, task } : null
  }, { timeoutMs, label: `task ${taskId} -> ${want.join('/')}` })
}

// 等待任务进入「running + waitingReason=<reason>」的审批等待态（CT-CONV-514）。
export async function waitTaskWaiting(sessionId, taskId, reason = 'confirmation', timeoutMs = 45000) {
  return waitFor(async () => {
    const res = await detail(sessionId, taskId)
    if (res.status !== 200) return null
    const task = res.json && res.json.task
    return task && task.status === 'running' && task.waitingReason === reason
      ? { detail: res.json, task }
      : null
  }, { timeoutMs, label: `task ${taskId} running+${reason}` })
}

// 提交确认（CT-CONV-507/514）：decision=confirm|cancel，不幂等。
export async function confirmTask(sessionId, taskId, decision = 'confirm', note = '') {
  return api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${encodeURIComponent(taskId)}/confirmation`, { decision, note })
}

/* ---------- 数据库夹具 ---------- */

export function openDb() {
  const db = new DatabaseSync(DB_FILE)
  db.exec('PRAGMA busy_timeout=5000')
  return db
}

export function seedHistory(sessionId, count = 20) {
  const db = openDb()
  try {
    const now = Date.now()
    const stmt = db.prepare('INSERT OR REPLACE INTO messages (id, session_id, role, text, at, status) VALUES (?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < count; i += 1) {
      stmt.run(`fx-hist-${sessionId}-${i}`, sessionId, i % 2 === 0 ? 'user' : 'agent', `HIST-MESSAGE-${i + 1}`, now - (count - i) * 1000, 'done')
    }
    return count
  } finally { db.close() }
}

export function seedArtifact(taskId, { name, mime, size, buffer }) {
  const rel = `conv-fixtures/${taskId}-${name}`
  const abs = path.join(HOME, 'artifacts', rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const data = buffer || Buffer.alloc(size, 0x41)
  fs.writeFileSync(abs, data)
  const id = `art-${Math.random().toString(16).slice(2, 10)}`
  const db = openDb()
  try {
    db.prepare(`INSERT INTO task_artifacts
      (id, task_id, name, rel_path, mime, size, created_at, delivery_kind, storage_scope, workspace_rel_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'user_delivery', 'legacy_artifacts', '')`)
      .run(id, taskId, name, rel, mime, data.length, Date.now())
  } finally { db.close() }
  return { id, rel, abs, size: data.length }
}

export function queryRows(sql, params = []) {
  const db = openDb()
  try { return db.prepare(sql).all(...params) } finally { db.close() }
}

/** 直接改隔离库的行（只为构造夹具：失败态任务、清理旧产物）。 */
export function execDb(sql, params = []) {
  const db = openDb()
  try { return db.prepare(sql).run(...params) } finally { db.close() }
}

/* ---------- 实例生命周期 ---------- */

async function portHealthy() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1200) })
    return res.status === 200
  } catch { return false }
}

async function acquireLock() {
  fs.mkdirSync(T06, { recursive: true })
  fs.mkdirSync(path.dirname(LOCK), { recursive: true })
  const end = Date.now() + 240000
  while (Date.now() < end) {
    try {
      fs.mkdirSync(LOCK)
      fs.writeFileSync(path.join(LOCK, 'owner'), `${process.pid} ${new Date().toISOString()}`)
      return
    } catch (err) {
      if (err.code !== 'EEXIST') throw new AcError('R-ENV', `获取实例锁失败: ${err.message}`)
      let stale = false
      try { stale = Date.now() - fs.statSync(LOCK).mtimeMs > 600000 } catch { /* 已被释放 */ }
      if (stale) {
        try { fs.rmdirSync(LOCK) } catch { /* 忽略并发清理 */ }
        continue
      }
      await sleep(500)
    }
  }
  throw new AcError('R-ENV', `等待实例锁超时（另一个 AC 脚本长时间占用 ${PORT} 的锁 ${LOCK}）`, '240s 内取得锁', '超时')
}

function releaseLock() {
  try { fs.rmSync(path.join(LOCK, 'owner'), { force: true }) } catch { /* ignore */ }
  try { fs.rmdirSync(LOCK) } catch { /* ignore */ }
}

async function startBackend(ac, opts = {}) {
  const exe = opts.testClock ? EXE_TESTCLOCK : EXE
  if (!fs.existsSync(exe)) {
    throw new AcError('R-BUILD', `缺少后端构建产物 ${path.relative(ROOT, exe)}`, '先构建 backend', '文件不存在')
  }
  if (await portHealthy()) {
    throw new AcError('R-ENV', `端口 ${PORT} 已有实例在跑（非本脚本启动，拒绝复用）`, '端口空闲', '已被占用')
  }
  fs.mkdirSync(HOME, { recursive: true })
  clearStaleDbLock()
  let upstream = null
  let configBackup = null
  if (opts.tools) {
    upstream = await startToolsUpstream(ac)
    configBackup = enableRealMode()
  }
  const logFile = path.join(T06, `server-${ac}.log`)
  const fd = fs.openSync(logFile, 'a')
  const child = spawn(exe, ['serve', '-addr', `127.0.0.1:${PORT}`, '-model', opts.tools ? 'real' : 'mock'], {
    cwd: HOME,
    env: {
      ...process.env,
      SIMO_HOME: HOME,
      SIMO_LLM: opts.tools ? 'real' : 'mock',
      SIMO_ADDR: `127.0.0.1:${PORT}`,
      // 时间类判据用推进代替等待：测试构建把真实经过时间乘以 rate。生产构建忽略这个变量。
      ...(opts.testClock ? { SIMO_TEST_CLOCK: typeof opts.testClock === 'string' ? opts.testClock : TEST_CLOCK_DEFAULT } : {}),
    },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  child.once('error', () => {})
  fs.closeSync(fd)
  const end = Date.now() + 25000
  while (Date.now() < end) {
    if (await portHealthy()) return { child, logFile, upstream, configBackup }
    if (child.exitCode !== null) break
    await sleep(300)
  }
  const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-1200) : ''
  await stopBackend(child)
  if (upstream) await stopBackend(upstream)
  restoreRealMode(configBackup)
  throw new AcError('R-ENV', `后端 ${PORT} 未就绪；日志尾部: ${tail.replace(/\s+/g, ' ').slice(-500)}`, 'GET /api/health 200', '未就绪')
}

/**
 * 清理上次被强杀后遗留的 SQLite 实例锁（HOME/simo.db.lock）。
 * 锁里的 pid 仍存活时判为真占用（R-ENV 拒绝启动）；pid 已死则把锁移进隔离删除目录后继续。
 */
function clearStaleDbLock() {
  const lockFile = path.join(HOME, 'simo.db.lock')
  if (!fs.existsSync(lockFile)) return
  let pid = 0
  try { pid = Number(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid) || 0 } catch { /* 非 JSON 视为陈旧 */ }
  if (pid > 0) {
    try {
      process.kill(pid, 0)
      throw new AcError('R-ENV', `隔离库被另一 simo 实例占用（pid=${pid}）`, '无实例持有 simo.db', `pid ${pid} 仍存活`)
    } catch (err) {
      if (err instanceof AcError) throw err
      // ESRCH：进程已退出，继续清理
    }
  }
  const trashDir = path.join('E:', 'dsh_home', 'trash', 'pending-delete', 'ac-conv-009')
  fs.mkdirSync(trashDir, { recursive: true })
  try { fs.renameSync(lockFile, path.join(trashDir, `simo.db.lock.${Date.now()}`)) } catch { /* 已被别的脚本清掉 */ }
}

/** 启动假上游 8790（mock-llm tools 模式）：返回含 tool_calls 的 SSE，驱动真实执行器。 */
async function startToolsUpstream(ac) {
  const mock = path.join(ROOT, 'scripts', 'ac', 'lib', 'mock-llm.mjs')
  if (!fs.existsSync(mock)) throw new AcError('R-BUILD', '缺少假上游 scripts/ac/lib/mock-llm.mjs', '文件存在', '缺失')
  const logFile = path.join(T06, `upstream-${ac}.log`)
  const fd = fs.openSync(logFile, 'a')
  const child = spawn(process.execPath, [mock, '--port', String(UPSTREAM_PORT), '--mode', 'tools'], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  child.once('error', () => {})
  fs.closeSync(fd)
  const end = Date.now() + 15000
  while (Date.now() < end) {
    try {
      const res = await fetch(`${UPSTREAM_BASE}/health`, { signal: AbortSignal.timeout(1200) })
      if (res.status === 200) return child
    } catch { /* not ready */ }
    if (child.exitCode !== null) break
    await sleep(250)
  }
  await stopBackend(child)
  const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-800) : ''
  throw new AcError('R-ENV', `假上游 ${UPSTREAM_PORT} 未就绪；日志尾部: ${tail.replace(/\s+/g, ' ').slice(-400)}`, `GET :${UPSTREAM_PORT}/health 200`, '未就绪')
}

/** 把隔离库切到 real 模式并指向 8790；返回原配置备份路径（可能为 null）。 */
function enableRealMode() {
  const configPath = path.join(HOME, 'config.local.json')
  let backup = null
  if (fs.existsSync(configPath)) {
    backup = configPath + '.bak'
    fs.renameSync(configPath, backup)
  }
  fs.writeFileSync(configPath, JSON.stringify({
    modelMode: 'real',
    baseURL: `${UPSTREAM_BASE}/v1`,
    apiKey: 'mock-key-ac',
    model: 'mock',
  }, null, 2))
  return backup
}

/** 收尾：删掉临时 real 配置并恢复备份（不就地删除，移到 trash）。 */
function restoreRealMode(backup) {
  const configPath = path.join(HOME, 'config.local.json')
  try {
    if (fs.existsSync(configPath)) {
      const trash = process.env.SIMO_TRASH || 'E:\\dsh_home\\trash\\pending-delete'
      const target = path.join(trash, 'ac-conv-009', 'config.local.json')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.renameSync(configPath, target)
    }
    if (backup && fs.existsSync(backup)) fs.renameSync(backup, configPath)
  } catch { /* 收尾失败不掩盖断言结果 */ }
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return
  try { child.kill() } catch { /* ignore */ }
  const end = Date.now() + 6000
  while (Date.now() < end && child.exitCode === null) await sleep(150)
  if (child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    const end2 = Date.now() + 4000
    while (Date.now() < end2 && child.exitCode === null) await sleep(150)
  }
}

// 当前脚本持有的实例（单脚本模式）。重启类判据（AC-TASK-003-04）需要杀掉再起同一 HOME 的实例。
let currentServer = null

/**
 * 重启隔离实例：停掉当前进程、等端口释放，再用同一 SIMO_HOME 起一份。
 * 只在单脚本模式可用；共享模式下实例由 run-ac 统一管理，杀掉会波及同批其它脚本。
 */
export async function restartBackend(ac = 'restart') {
  if (SHARED) {
    throw new AcError('R-ENV', '重启判据只能在单脚本模式执行（cdp 组）', 'AC_CONV_SHARED!=1', SHARED)
  }
  if (!currentServer) {
    throw new AcError('R-ENV', '没有可重启的实例（未通过 runAc 启动）', 'currentServer', 'null')
  }
  const server = currentServer
  currentServer = null
  if (server.upstream) await stopBackend(server.upstream)
  if ('configBackup' in server) restoreRealMode(server.configBackup)
  await stopBackend(server.child)
  const end = Date.now() + 10000
  while (Date.now() < end && await portHealthy()) await sleep(200)
  currentServer = await startBackend(ac, {})
  return currentServer
}

export async function runAc(ac, fn, opts = {}) {
  const ctx = makeCtx()
  let server = null
  let outcome
  try {
    // 批次共享模式：实例由 run-ac.mjs 的 harness 起好并统一停，这里只跑断言。
    if (!SHARED) {
      await acquireLock()
      server = await startBackend(ac, opts)
      currentServer = server
    }
    await fn(ctx)
    const failed = ctx.checks.filter((c) => !c.ok)
    outcome = {
      pass: failed.length === 0,
      detail: failed.length === 0
        ? `${ctx.checks.length} 条断言通过`
        : failureDetail(ac, new AcError(failed[0].code || 'R-SCRIPT', `断言失败: ${failed[0].label}`, failed[0].expected, failed[0].actual)),
      checks: Object.fromEntries(ctx.checks.map((c) => [c.label, { ok: c.ok, expected: c.expected, actual: c.actual, ...(c.code ? { code: c.code } : {}) }])),
      raw: ctx.raw,
    }
  } catch (err) {
    outcome = {
      pass: false,
      detail: failureDetail(ac, err),
      checks: Object.fromEntries(ctx.checks.map((c) => [c.label, { ok: c.ok, expected: c.expected, actual: c.actual, ...(c.code ? { code: c.code } : {}) }])),
      raw: { ...ctx.raw, blocked: ['R-ENV', 'R-EXT', 'R-BUILD'].includes(err.code) ? err.message : undefined },
    }
  } finally {
    if (!SHARED) {
      server = currentServer || server
      if (server && server.upstream) await stopBackend(server.upstream)
      if (server && 'configBackup' in server) restoreRealMode(server.configBackup)
      await stopBackend(server && server.child)
      currentServer = null
      releaseLock()
    }
  }
  // report 内部会 process.exit，必须放在清理完成之后。
  await report(ac, outcome)
}

// 供脚本做 30 秒窗口采样
export { sleep }

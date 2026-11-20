// 本机可运行的 E2E 预检：不依赖 Playwright / 浏览器，验证
// 后端二进制（内嵌前端）+ 复制 data 到临时 home + API 种子 + 首页 HTML 全链路。
// 浏览器用例本身仍由 playwright test 执行；本脚本用于在受限环境证明“栈与种子可用”。
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const E2E_DIR = resolve(HERE, '..')
const FRONTEND_DIR = resolve(E2E_DIR, '..')
const WORKSPACE_DIR = resolve(FRONTEND_DIR, '..')
const PORT = Number(process.env.E2E_PREFLIGHT_PORT ?? 19202)
const BASE = `http://127.0.0.1:${PORT}`
const CHROME = process.env.E2E_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

function log(message) {
  process.stdout.write(`[e2e-preflight] ${message}\n`)
}

function fail(message) {
  throw new Error(message)
}

async function waitFor(label, probe, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const value = await probe()
      if (value) return value
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await sleep(intervalMs)
  }
  fail(`等待超时：${label}${last ? `；最后错误：${last}` : ''}`)
}

async function json(path, init) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  if (!response.ok) fail(`${init?.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : {}
}

function resolveBackendExe() {
  const fromEnv = process.env.E2E_BACKEND_EXE
  if (fromEnv) {
    if (!existsSync(fromEnv)) fail(`E2E_BACKEND_EXE 不存在：${fromEnv}`)
    return fromEnv
  }
  const preferred = join(WORKSPACE_DIR, 'backend', 'simo-live-composer.exe')
  if (existsSync(preferred)) return preferred
  const dir = join(WORKSPACE_DIR, 'backend')
  const candidates = readdirSync(dir)
    .filter((name) => /^simo.*\.exe$/i.test(name))
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (candidates.length === 0) fail('backend/ 下没有 simo*.exe')
  return candidates[0]
}

function copySeedHome(homeDir) {
  const source = process.env.E2E_SEED_HOME
  if (!source) return false
  if (!existsSync(source)) return false
  cpSync(source, homeDir, {
    recursive: true,
    force: true,
    filter: (srcPath) => {
      const relative = srcPath.slice(source.length).replace(/^[\\/]/, '')
      if (!relative) return true
      const top = relative.split(/[\\/]/)[0]
      return top !== 'backups' && top !== 'logs' && top !== 'tmp' && top !== 'workspace' && !/^simo\.db\.bak-/.test(relative)
    },
  })
  // 复制来的 WAL/SHM/lock 可能属于另一个进程，必须剔除，避免 SQLite 锁或损坏。
  for (const leftover of ['simo.db-wal', 'simo.db-shm', 'simo.db.lock']) {
    rmSync(join(homeDir, leftover), { force: true })
  }
  return true
}

function cleanupRunDir(runDir) {
  const tmpRoot = join(WORKSPACE_DIR, '.tmp')
  const base = runDir.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!runDir.startsWith(tmpRoot) || !base.startsWith('e2e-preflight-')) {
    log(`跳过清理（路径校验失败）：${runDir}`)
    return
  }
  rmSync(runDir, { recursive: true, force: true })
}

async function main() {
  if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65000 || PORT === 8787) fail(`端口不合理：${PORT}`)
  const backendExe = resolveBackendExe()
  mkdirSync(join(WORKSPACE_DIR, '.tmp'), { recursive: true })
  const runDir = mkdtempSync(join(WORKSPACE_DIR, '.tmp', 'e2e-preflight-'))
  const homeDir = join(runDir, 'home')
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(join(homeDir, 'artifacts'), { recursive: true })
  mkdirSync(join(homeDir, 'workspace'), { recursive: true })
  mkdirSync(join(homeDir, 'logs'), { recursive: true })
  const copied = copySeedHome(homeDir)
  const logFd = openSync(join(runDir, 'backend.log'), 'a')
  const child = spawn(backendExe, ['serve', '-addr', `127.0.0.1:${PORT}`, '-model', 'mock'], {
    cwd: WORKSPACE_DIR,
    env: { ...process.env, SIMO_HOME: homeDir, SIMO_LLM: 'mock', SIMO_MODEL: 'mock', SIMO_DEBUG: '1' },
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  })
  let exited = null
  child.on('exit', (code) => { exited = code })

  try {
    await waitFor('后端 /api/health', async () => {
      if (exited !== null) fail(`后端提前退出：${exited}；日志：${join(runDir, 'backend.log')}`)
      const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) })
      return response.ok
    }, 45_000)

    const health = await json('/api/health')
    const html = await (await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) })).text()
    if (!/<div id="root"><\/div>/.test(html)) fail('首页 HTML 不是前端 SPA（缺少 #root）')
    const tree = await json('/api/sessions/tree')
    const treeCount = Array.isArray(tree.sessions) ? tree.sessions.length : 0

    const created = await json('/api/sessions', { method: 'POST', body: JSON.stringify({ title: `preflight ${Date.now()}`, draft: false }) })
    const sessionId = created.session?.id
    if (!sessionId) fail('创建会话失败：响应缺少 session.id')
    await json('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, text: 'preflight 消息' }) })
    const reply = await waitFor('mock 回复落库', async () => {
      const data = await json(`/api/messages?sessionId=${encodeURIComponent(sessionId)}&limit=50`)
      return (data.messages ?? []).find((message) => message.role === 'agent' && String(message.text).includes('Mock 模型')) ?? null
    }, 45_000)

    const chromeExists = existsSync(CHROME)

    // 与 06-task-locate 相同的后端前置：任务完成 + projection 可见。
    await json('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, text: `帮我整理一份周报 ${Date.now()}` }) })
    const doneTask = await waitFor('任务完成', async () => {
      const data = await json(`/api/tasks?sessionId=${encodeURIComponent(sessionId)}`)
      return (data.tasks ?? []).find((task) => task.status === 'done' && String(task.title).includes('周报')) ?? null
    }, 30_000)
    const projection = await waitFor('任务进入 spec projection', async () => {
      const data = await json(`/api/sessions/${encodeURIComponent(sessionId)}/spec-projection?taskLimit=3`)
      const items = data.tasks?.done?.items ?? []
      return items.find((item) => item.id === doneTask.id) ?? null
    }, 15_000)
    log(`任务：id=${doneTask.id} state=${doneTask.status} projection=${projection.state}`)

    // 与 07-download 相同的后端前置：mock:write → 待审批 → allow → 用户交付物。
    await json('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, text: 'mock:write' }) })
    const approval = await waitFor('待审批 mock-write.txt', async () => {
      const data = await json('/api/approvals')
      return (data.approvals ?? []).find((item) => item.status === 'pending' && String(item.args ?? '').includes('mock-write.txt')) ?? null
    }, 30_000)
    await json(`/api/approvals/${encodeURIComponent(approval.id)}`, { method: 'POST', body: JSON.stringify({ decision: 'allow' }) })
    const deliverable = await waitFor('用户交付物 mock-write.txt', async () => {
      const data = await json('/api/deliverables')
      return (data.deliverables ?? []).find((item) => item.name === 'mock-write.txt') ?? null
    }, 30_000)
    log(`交付物：${deliverable.name} downloadUrl=${Boolean(deliverable.downloadUrl)}`)

    log(`健康：${JSON.stringify(health)}`)
    log(`种子：copiedData=${copied} treeRoots=${treeCount}`)
    log(`消息：${String(reply.text).slice(0, 60)}`)
    log(`系统 Chrome：${CHROME} → ${chromeExists ? '存在（本环境启动受沙箱限制，见 README）' : '不存在'}`)
    log(`JSON_RESULT ${JSON.stringify({ ok: true, base: BASE, backendExe, copiedData: copied, treeRoots: treeCount, sessionId, taskId: doneTask.id, deliverable: deliverable.name, chromeExists, runDir })}`)
    if (!chromeExists) process.exitCode = 2
  } finally {
    if (child.pid) {
      try { child.kill() } catch { /* ignore */ }
      const deadline = Date.now() + 5000
      while (exited === null && Date.now() < deadline) await sleep(100)
    }
    if (process.env.E2E_KEEP_STACK !== '1') cleanupRunDir(runDir)
  }
}

main().catch((error) => {
  process.stderr.write(`[e2e-preflight] 失败：${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
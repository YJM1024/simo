#!/usr/bin/env node
/**
 * AC-TASK-006-03：取消成功后 30 秒窗口内不再新增消息与产物
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-006-03
 * 时钟：使用本批（2026-11-27 00:46:37）构建的 testclock 二进制
 *       .tmp/p2-build-verify/simo-testclock.exe（SIMO_TEST_CLOCK=rate=200），脚本自行拉起该实例；
 *       脚本固定校验其 sha256 与构建时间，防止误跑到旧程序上。
 * 断言点：
 *   1) 取消接口 200 且任务进入 cancelled；
 *   2) 取消后记录消息数与产物数，等 2 秒真实时间（rate=200 约合 400 秒模拟时间，覆盖 30 秒窗口）；
 *   3) 两表 task_id=T 的增量都为 0；
 *   4) 同一次等待里服务端时钟真的推进 ≥400 秒、且加速倍率 ≥100，证明窗口是用推进覆盖的而非真实等待；
 *   5) 所用二进制的 sha256 与构建时间都等于本批构建记录的固定值。
 * 断言条数以本轮运行结果为准（共 16 条）。
 * 说明：重新构建 testclock 后必须同步更新 EXPECTED_SHA256 与 EXPECTED_BUILT_AT。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

process.env.AC_CONV_SHARED = '1'
const { runAc, createSession, api, sleep, waitFor, detail, queryRows, HOME, PORT, BASE } = await import('./lib/conv-backend.mjs')
const { seedTask, settle, setTask, countMessages, countArtifacts } = await import('./lib/task-006.mjs')

const EXE = path.resolve('.tmp', 'p2-build-verify', 'simo-testclock.exe')
const EXPECTED_SHA256 = '0e2bc00772a6d32030dcf3497625659bcec4fa54daf034766d5cd091b16e8e01'
const EXPECTED_BUILT_AT = '2026-11-27T00:46:37.985+08:00'
const BUILT_AT_TOLERANCE_MS = 2000
const LOG = path.resolve('.tmp', 'p2-script-gaps', 'testclock-006-03.log')
const TRASH = path.join('E:', 'dsh_home', 'trash', 'pending-delete', 'p2-script-gaps')

function clearStaleLock() {
  const lockFile = path.join(HOME, 'simo.db.lock')
  if (!fs.existsSync(lockFile)) return
  let pid = 0
  try { pid = Number(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid) || 0 } catch { /* 非 JSON 视为陈旧 */ }
  let alive = false
  if (pid > 0) {
    try { process.kill(pid, 0); alive = true } catch { alive = false }
  }
  if (alive) throw new Error(`隔离库被另一 simo 实例占用（pid=${pid}）`)
  fs.mkdirSync(TRASH, { recursive: true })
  try { fs.renameSync(lockFile, path.join(TRASH, `simo.db.lock.${Date.now()}`)) } catch { /* 已被清掉 */ }
}

async function health() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1200) })
    return res.status
  } catch { return 0 }
}

async function startTestclock(ctx) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true })
  const fd = fs.openSync(LOG, 'a')
  const child = spawn(EXE, ['serve', '-addr', `127.0.0.1:${PORT}`, '-model', 'mock'], {
    cwd: path.resolve('.'),
    env: { ...process.env, SIMO_HOME: HOME, SIMO_TEST_CLOCK: 'rate=200', SIMO_ADDR: `127.0.0.1:${PORT}` },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  fs.closeSync(fd)
  child.once('error', () => {})
  const end = Date.now() + 25000
  while (Date.now() < end) {
    if (await health() === 200) return child
    if (child.exitCode !== null) break
    await sleep(250)
  }
  const tail = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').slice(-600).replace(/\s+/g, ' ') : ''
  ctx.check(false, 'testclock 实例在 25 秒内就绪', 200, child.exitCode === null ? '未就绪' : `退出码 ${child.exitCode}；日志 ${tail}`)
  return child
}

async function stopServer(child) {
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

/**
 * 用 GET /api/runtime/status 的 at 读服务端时钟：该字段直接取 clock.NowUnixMilli()，
 * 是 testclock 生效与否的唯一可见面（消息 at、任务时间戳走的是 time.Now）。
 */
async function clockProbe() {
  const res = await api('GET', '/api/runtime/status')
  return { status: res.status, at: Number((res.json && res.json.at) || 0), host: Date.now() }
}

await runAc('AC-TASK-006-03', async (ctx) => {
  const startedAt = Date.now()
  ctx.check(fs.existsSync(EXE), 'testclock 二进制存在', EXE, fs.existsSync(EXE) ? '存在' : '缺失')
  const stat = fs.existsSync(EXE) ? fs.statSync(EXE) : null
  const sha = stat ? (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(EXE)).digest('hex') : ''
  ctx.check(sha === EXPECTED_SHA256, 'testclock sha256 与本批构建一致', EXPECTED_SHA256, sha || '空')
  const builtAtOk = stat !== null && Math.abs(stat.mtimeMs - Date.parse(EXPECTED_BUILT_AT)) <= BUILT_AT_TOLERANCE_MS
  ctx.check(builtAtOk, 'testclock 构建时间与本批构建一致', EXPECTED_BUILT_AT, stat ? new Date(stat.mtimeMs).toISOString() : '缺失')

  const preHealth = await health()
  ctx.check(preHealth !== 200, '启动前端口空闲（没有沿用在跑实例）', '非 200', preHealth)
  clearStaleLock()
  const server = await startTestclock(ctx)
  let exitCode = null
  server.once('exit', (code) => { exitCode = code })
  try {
    const sessionId = await createSession('AC-TASK-006-03 取消后静默')
    const taskId = await seedTask(sessionId, { title: '取消后静默任务', steps: ['准备', '执行'] })
    await settle(sessionId)
    setTask(taskId, { status: 'running', progress: 30 })
    const cancel = await api('POST', `/api/tasks/${taskId}/cancel?sessionId=${sessionId}`)
    ctx.check(cancel.status === 200, '取消接口返回 200', 200, cancel.status, 'R-API')
    await waitFor(async () => (await detail(sessionId, taskId)).json?.task?.status === 'cancelled', { timeoutMs: 10000, label: '任务进入 cancelled' })
    ctx.check((await detail(sessionId, taskId)).json?.task?.status === 'cancelled', '任务状态为 cancelled', 'cancelled', (await detail(sessionId, taskId)).json?.task?.status, 'R-DATA')

    const beforeMessages = countMessages(taskId)
    const beforeArtifacts = countArtifacts(taskId)
    ctx.check(Number.isInteger(beforeMessages) && Number.isInteger(beforeArtifacts), '取消后基线计数可读', '整数', `${beforeMessages}/${beforeArtifacts}`)

    // 同一段等待里同时量服务端时钟：先探针，再等 2 秒真实时间，再探针。
    const probe1 = await clockProbe()
    ctx.check(probe1.status === 200 && probe1.at > 0, '时钟探针 1 读到服务端时间', '200 且 at>0', `${probe1.status}/${probe1.at}`, 'R-DATA')
    ctx.check(probe1.at - probe1.host > 60000, '服务端时钟已领先主机 60 秒以上（testclock 生效）', '>60000ms', `${probe1.at - probe1.host}ms`, 'R-CLOCK')
    await sleep(2000)
    const probe2 = await clockProbe()
    ctx.check(probe2.status === 200 && probe2.at > 0, '时钟探针 2 读到服务端时间', '200 且 at>0', `${probe2.status}/${probe2.at}`, 'R-DATA')

    const afterMessages = countMessages(taskId)
    const afterArtifacts = countArtifacts(taskId)
    const deltaMessages = afterMessages - beforeMessages
    const deltaArtifacts = afterArtifacts - beforeArtifacts
    const serverDelta = probe2.at - probe1.at
    const hostDelta = probe2.host - probe1.host

    ctx.check(hostDelta >= 1500 && hostDelta <= 8000, '真实等待约 2 秒（未真实等 30 秒）', '1500–8000ms', `${hostDelta}ms`, 'R-DATA')
    ctx.check(serverDelta >= 30000, '等待期间服务端推进覆盖 30 秒窗口', '>= 30000ms', `${serverDelta}ms`, 'R-CLOCK')
    ctx.check(serverDelta >= 300000, '2 秒真实等待约合 400 秒模拟时间', '>= 300000ms', `${serverDelta}ms`, 'R-CLOCK')
    ctx.check(serverDelta >= hostDelta * 100, '测试时钟加速倍率不低于 100 倍', '>= 100x', `${(serverDelta / Math.max(hostDelta, 1)).toFixed(1)}x`, 'R-CLOCK')
    ctx.check(deltaMessages === 0, '窗口内 task_id 消息增量为 0', 0, deltaMessages, 'R-DATA')
    ctx.check(deltaArtifacts === 0, '窗口内 task_id 产物增量为 0', 0, deltaArtifacts, 'R-DATA')

    ctx.raw = {
      sessionId,
      taskId,
      before: { messages: beforeMessages, artifacts: beforeArtifacts },
      after: { messages: afterMessages, artifacts: afterArtifacts },
      serverDelta,
      hostDelta,
      probe1,
      probe2,
      testclock: { path: EXE, sha256: sha, bytes: stat ? stat.size : 0, builtAt: stat ? new Date(stat.mtimeMs).toISOString() : '' },
      startedAt: new Date(startedAt).toISOString(),
      exitCode,
    }
  } finally {
    await stopServer(server)
  }
})

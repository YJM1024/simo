// AC-TASK-006-03：取消成功后 30 秒窗口内不再新增消息与产物；16 条断言。
// 时钟用 build/manifest.json 里的 testclock 二进制（SIMO_TEST_CLOCK=rate=200），
// 路径、sha256、构建时间都来自清单，改坏或换旧文件会先被 verify-all 拦住。
import fs from 'node:fs'
import path from 'node:path'
import { freePort, testclockExe, artifactStamp } from './lib/core/bootstrap.mjs'
import { probeClock, realWait, advanceSummary } from './lib/core/clock.mjs'

const PORT = await freePort()
process.env.AC_CONV_SHARED = '1'
process.env.AC_CONV_BASE = `http://127.0.0.1:${PORT}`
const { runAc, createSession, api, waitFor, detail, queryRows, sleep, HOME, BASE } = await import('./lib/conv-backend.mjs')
const { seedTask, settle, setTask, countMessages, countArtifacts } = await import('./lib/task-006.mjs')
const { startBackend, stop } = await import('./lib/core/bootstrap.mjs')

const TRASH = path.join('E:', 'dsh_home', 'trash', 'pending-delete', 'p2-script-gaps')

function clearStaleLock() {
  const lockFile = path.join(HOME, 'simo.db.lock')
  if (!fs.existsSync(lockFile)) return
  let pid = 0
  try { pid = Number(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid) || 0 } catch { /* 陈旧锁 */ }
  if (pid > 0) {
    try { process.kill(pid, 0); throw new Error(`隔离库被另一 simo 实例占用（pid=${pid}）`) } catch (err) { if (String(err.message).includes('占用')) throw err }
  }
  fs.mkdirSync(TRASH, { recursive: true })
  try { fs.renameSync(lockFile, path.join(TRASH, `simo.db.lock.${Date.now()}`)) } catch { /* 已被清掉 */ }
}

await runAc('AC-TASK-006-03', async (ctx) => {
  const exe = testclockExe()
  const stamp = artifactStamp()
  const info = (stamp.artifacts && stamp.artifacts.testclock) || {}
  ctx.check(fs.existsSync(exe), 'testclock 二进制来自清单且存在', exe, fs.existsSync(exe) ? '存在' : '缺失')
  ctx.check(info.sha256 && info.sha256.length === 64, '清单记录了 testclock sha256', '64 位', String(info.sha256 || '').slice(0, 12))
  ctx.check(Boolean(info.builtAt), '清单记录了构建时间', 'ISO', info.builtAt)

  clearStaleLock()
  const pre = await probeClock(BASE)
  ctx.check(pre.status !== 200, '启动前端口空闲（没有沿用在跑实例）', '非 200', pre.status)
  const server = await startBackend({ exe, port: PORT, home: HOME, mode: 'mock', testClock: 'rate=200', env: { SIMO_LLM: process.env.SIMO_LLM || '' } })
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

    const probe1 = await probeClock(BASE)
    ctx.check(probe1.status === 200 && Number(probe1.at) > 0, '时钟探针 1 读到服务端时间', '200 且 at>0', `${probe1.status}/${probe1.at}`, 'R-DATA')
    ctx.check(probe1.at - probe1.host > 60000, '服务端时钟已领先主机 60 秒以上（testclock 生效）', '>60000ms', `${probe1.at - probe1.host}ms`, 'R-CLOCK')
    await realWait(2000, { reason: 'AC-TASK-006-03 用 2 秒真实等待换取 400 秒模拟窗口', approvedBy: 'AGENTS.md 时间类验收第 2 条', maxMs: 8000 })
    const probe2 = await probeClock(BASE)
    ctx.check(probe2.status === 200 && Number(probe2.at) > 0, '时钟探针 2 读到服务端时间', '200 且 at>0', `${probe2.status}/${probe2.at}`, 'R-DATA')

    const deltaMessages = countMessages(taskId) - beforeMessages
    const deltaArtifacts = countArtifacts(taskId) - beforeArtifacts
    const advance = advanceSummary(probe1, probe2)
    ctx.check(advance.hostDeltaMs >= 1500 && advance.hostDeltaMs <= 8000, '真实等待约 2 秒（未真实等 30 秒）', '1500–8000ms', `${advance.hostDeltaMs}ms`, 'R-DATA')
    ctx.check(advance.serverDeltaMs >= 30000, '等待期间服务端推进覆盖 30 秒窗口', '>= 30000ms', `${advance.serverDeltaMs}ms`, 'R-CLOCK')
    ctx.check(advance.serverDeltaMs >= 300000, '2 秒真实等待约合 400 秒模拟时间', '>= 300000ms', `${advance.serverDeltaMs}ms`, 'R-CLOCK')
    ctx.check(advance.rate >= 100, '测试时钟加速倍率不低于 100 倍', '>= 100x', `${advance.rate.toFixed(1)}x`, 'R-CLOCK')
    ctx.check(deltaMessages === 0, '窗口内 task_id 消息增量为 0', 0, deltaMessages, 'R-DATA')
    ctx.check(deltaArtifacts === 0, '窗口内 task_id 产物增量为 0', 0, deltaArtifacts, 'R-DATA')

    ctx.raw = { sessionId, taskId, serverDelta: advance.serverDeltaMs, hostDelta: advance.hostDeltaMs, testclock: { path: exe, ...info }, before: { messages: beforeMessages, artifacts: beforeArtifacts } }
  } finally {
    stop(server)
  }
})

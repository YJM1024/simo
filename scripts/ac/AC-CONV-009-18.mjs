#!/usr/bin/env node
/**
 * AC-CONV-009-18（判据 CT-CONV-538 / TC-P1-CONV-054）
 * deadline-1m：有时限任务到点取消 0 个、提醒 1 条（scanDeadlines 只提醒不取消）；无时限任务运行 30 分钟不自动取消。
 *
 * 时间推进（不是跳过）：本脚本用 `-tags testclock` 的测试构建启动后端，`SIMO_TEST_CLOCK=rate=200`
 * 把服务端时钟按真实经过时间放大 200 倍（见 backend/internal/platform/clock/clock_testclock.go）。
 * 30 分钟窗口只等 9 秒真实时间；生产构建不含这段代码，传同一变量也无效。
 * 提醒扫描是 30 秒真实周期（conv.go:1945 time.NewTicker），所以提醒仍按真实 30 秒周期等待。
 */
import { runAc, createSession, createBatch, detail, waitFor, queryRows, sleep } from './lib/conv-backend.mjs'

// 30 分钟窗口 + 1 分钟时限：rate=200 时分别等于 9 秒与 0.3 秒真实时间。
const WINDOW_MS = 30 * 60 * 1000
const CLOCK_RATE = 200

await runAc('AC-CONV-009-18', async (ctx) => {
  /* ---- 有时限任务：到点只提醒、不取消 ---- */
  const sessionId = await createSession('AC-CONV-009-18 时限 1 分钟')
  const deadlineAt = Date.now() + 2000
  const created = await createBatch(sessionId, {
    mode: 'plan', goal: '到期只提醒，不自动取消。',
    inputs: ['上游会失败，下游保持等待以观察到期行为。'], constraints: ['到点取消 0 个。'],
    tasks: [
      { key: 'a', title: 'mock:fail 上游：定时观察', mode: 'plan', goal: '上游失败。' },
      { key: 'b', title: '下游：等待上游', mode: 'plan', goal: '下游等待。', dependsOn: ['a'], joinMode: 'all', deadlineAt },
    ],
    clientMutationId: 'ac-conv-009-18',
  })
  ctx.eq(created.status, 201, '带 deadlineAt 的批次创建 201')
  const tasks = created.json.tasks
  const upstream = tasks.find((t) => t.title.startsWith('mock:fail'))
  const downstream = tasks.find((t) => t.title.startsWith('下游'))
  // 时限是逐任务字段（conv.go:603 DeadlineAt: raw.DeadlineAt），批次级 deadlineAt 不会落库。
  ctx.eq(Number(downstream.deadlineAt || 0), deadlineAt, '下游任务记录 deadlineAt（毫秒时间戳）')
  ctx.check(queryRows('SELECT deadline_at FROM tasks WHERE id = ?', [downstream.id])[0].deadline_at > 0, 'deadline_at 已落库', '>0',
    String(queryRows('SELECT deadline_at FROM tasks WHERE id = ?', [downstream.id])[0].deadline_at))

  await waitFor(async () => {
    const res = await detail(sessionId, upstream.id)
    return res.json && res.json.task && res.json.task.status === 'failed' ? true : null
  }, { timeoutMs: 30000, label: '上游 mock:fail 失败' })
  const pending = await detail(sessionId, downstream.id)
  ctx.eq(pending.json.task.status, 'pending', '到期前下游仍 pending')
  ctx.eq(pending.json.task.waitingReason, 'dependency', '下游 waitingReason=dependency')

  // 等 30 秒真实扫描周期：deadline 已过（模拟时间），任务非终态 → 应写 deadline_reminded_at。
  const reminder = await waitFor(async () => {
    const rows = queryRows('SELECT id, deadline_reminded_at FROM tasks WHERE id = ?', [downstream.id])
    return rows[0] && rows[0].deadline_reminded_at > 0 ? rows[0] : null
  }, { timeoutMs: 60000, intervalMs: 1000, label: 'deadline_reminded_at 落库' }).catch(() => null)
  ctx.check(Boolean(reminder), '到点提醒 1 条（deadline_reminded_at 写入）', '>0', JSON.stringify(reminder && reminder.deadline_reminded_at))
  const remindedRows = queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ? AND deadline_reminded_at > 0', [sessionId])
  ctx.eq(remindedRows[0].n, 1, '本会话提醒条数恰为 1')

  const after = await detail(sessionId, downstream.id)
  ctx.eq(after.json.task.status, 'pending', '到点后任务未被取消（仍 pending）')
  const cancelledRows = queryRows("SELECT COUNT(*) AS n FROM tasks WHERE session_id = ? AND status = 'cancelled'", [sessionId])
  ctx.eq(cancelledRows[0].n, 0, '到点取消 0 个')

  // 服务端时钟相对真实时间的领先量：reminded_at 由 clock.NowUnixMilli 写入（conv.go:1967/1986）。
  const clockOffset = reminder ? reminder.deadline_reminded_at - Date.now() : 0
  ctx.check(clockOffset > 60000, 'testclock 生效：服务端时钟领先真实时间 >1 分钟', '>60000', String(clockOffset))

  /* ---- 无时限任务：模拟 30 分钟内保持等待、不被自动取消 ---- */
  const sessionWin = await createSession('AC-CONV-009-18 无时限 30 分钟窗口')
  // 时钟探针的时限 = 服务端当前模拟时间 + 30 分钟：只有模拟时间真的推进 30 分钟，扫描才会判定到期。
  const windowDeadline = Date.now() + clockOffset + WINDOW_MS
  const win = await createBatch(sessionWin, {
    mode: 'plan', goal: '无时限任务不自动取消。',
    tasks: [
      { key: 'w1', title: 'mock:fail 无时限上游', mode: 'plan', goal: '上游失败。' },
      { key: 'w2', title: '无时限下游', mode: 'plan', goal: '长期等待。', dependsOn: ['w1'], joinMode: 'all' },
      { key: 'p', title: '30 分钟时钟探针', mode: 'plan', goal: '计时。', dependsOn: ['w1'], joinMode: 'all', deadlineAt: windowDeadline },
    ],
    clientMutationId: 'ac-conv-009-18-window',
  })
  const winTasks = win.json.tasks
  const winDown = winTasks.find((t) => t.title.startsWith('无时限下游'))
  const probe = winTasks.find((t) => t.title.startsWith('30 分钟时钟探针'))
  ctx.eq(Number(probe.deadlineAt || 0), windowDeadline, '时钟探针记录 30 分钟后的时限')
  await waitFor(async () => {
    const rows = queryRows('SELECT status, waiting_reason FROM tasks WHERE id = ?', [winDown.id])
    return rows[0] && rows[0].status === 'pending' && rows[0].waiting_reason === 'dependency' ? rows[0] : null
  }, { timeoutMs: 30000, label: '无时限下游进入 pending/dependency' })

  const statuses = new Set()
  const realStart = Date.now()
  const until = realStart + Math.ceil(WINDOW_MS / CLOCK_RATE)
  while (Date.now() < until) {
    const row = queryRows('SELECT status FROM tasks WHERE id = ?', [winDown.id])[0]
    if (row) statuses.add(row.status)
    await sleep(400)
  }
  const realElapsed = Date.now() - realStart

  const probeRow = await waitFor(async () => {
    const row = queryRows('SELECT deadline_reminded_at FROM tasks WHERE id = ?', [probe.id])[0]
    return row && row.deadline_reminded_at > 0 ? row : null
  }, { timeoutMs: 45000, intervalMs: 1000, label: '30 分钟时限探针到期提醒' }).catch(() => null)
  ctx.check(Boolean(probeRow), '30 分钟后的时限被判定到期并提醒（时钟推进 ≥30 分钟）', '>0', JSON.stringify(probeRow && probeRow.deadline_reminded_at))
  ctx.check(Boolean(probeRow) && probeRow.deadline_reminded_at >= windowDeadline,
    '提醒时间戳不早于 30 分钟后的时限（clock.NowUnixMilli 推进到位）', `>=${windowDeadline}`, String(probeRow && probeRow.deadline_reminded_at))

  const windowRow = queryRows('SELECT status, deadline_at, deadline_reminded_at FROM tasks WHERE id = ?', [winDown.id])[0]
  ctx.eq(windowRow.status, 'pending', '无时限任务 30 分钟窗口后仍 pending')
  ctx.check(!statuses.has('cancelled'), '窗口内任一采样点都未被取消', '不含 cancelled', JSON.stringify([...statuses]))
  ctx.eq(windowRow.deadline_at, 0, '无时限任务 deadline_at=0')
  ctx.eq(windowRow.deadline_reminded_at, 0, '无时限任务不产生提醒')

  ctx.raw = {
    sessionId, downstreamId: downstream.id, deadlineAt,
    reminderWrittenAt: reminder && reminder.deadline_reminded_at,
    windowSessionId: sessionWin, windowDownstreamId: winDown.id, probeTaskId: probe.id,
    clockRate: CLOCK_RATE, clockOffsetMs: clockOffset, windowRealMs: realElapsed, probeDeadlineAt: windowDeadline,
    probeRemindedAt: probeRow && probeRow.deadline_reminded_at,
    sampledStatuses: [...statuses],
  }
}, { testClock: `rate=${CLOCK_RATE}` })

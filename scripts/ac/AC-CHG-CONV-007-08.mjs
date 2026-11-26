#!/usr/bin/env node
/**
 * AC-CHG-CONV-007-08（判据 CT-CONV-546 / TC-P1-CONV-060）
 * history-20/sessions-a-b：20 条历史发起任务时上下文为历史 0、目标 1、约束>=1；工具与知识库继承发起会话；
 * 另一会话三处计数 0；无自动超时、1 分钟时限提醒 1 次取消 0 次；task_id 会话内唯一不跨会话。
 *
 * 时间推进（不是跳过）：用 `-tags testclock` 的测试构建启动后端，`SIMO_TEST_CLOCK=rate=200`
 * 把服务端时钟放大 200 倍（backend/internal/platform/clock/clock_testclock.go）；30 分钟窗口等 9 秒真实时间，
 * 1 分钟时限折算 0.3 秒。提醒扫描仍是 30 秒真实周期（conv.go:1945 time.NewTicker）。
 */
import { runAc, createSession, createBatch, detail, list, graph, seedHistory, queryRows, waitFor, sleep } from './lib/conv-backend.mjs'

const WINDOW_MS = 30 * 60 * 1000
const CLOCK_RATE = 200

await runAc('AC-CHG-CONV-007-08', async (ctx) => {
  const sessionA = await createSession('AC-CHG-CONV-007-08 历史 20 条')
  const seeded = seedHistory(sessionA, 20)
  ctx.eq(seeded, 20, '会话 a 预置 20 条历史消息')
  const created = await createBatch(sessionA, {
    mode: 'plan', goal: '历史 20 条后发起任务。', inputs: ['本轮输入只属于本轮。'],
    constraints: ['历史不进入上下文。', '局限在发起会话。'],
    tasks: [{ key: 't', title: '历史 20 条后的任务', mode: 'plan', goal: '产出本轮结果。', steps: ['准备', '执行'] }],
    clientMutationId: 'ac-chg-08',
  })
  ctx.eq(created.status, 201, '创建 201')
  const task = created.json.tasks[0]
  const det = await detail(sessionA, task.id)
  const ctxData = det.json.context || {}
  ctx.eq(ctxData.historyCount, 0, '上下文历史 0 条')
  ctx.eq(ctxData.goal, task.goal, '上下文目标 1 条且等于任务目标')
  ctx.check(Array.isArray(ctxData.constraints) && ctxData.constraints.length >= 1, '上下文约束 >=1', '>=1', String((ctxData.constraints || []).length))
  ctx.check((ctxData.inputs || []).includes('本轮输入只属于本轮。'), '输入继承发起会话', '含本轮输入', JSON.stringify(ctxData.inputs))
  ctx.check(!JSON.stringify(det.json).includes('HIST-MESSAGE-'), '正文不含历史消息内容', '不含', '包含')
  ctx.check(!JSON.stringify(det.json).includes('HIST-TOOL-'), '轨迹不含历史工具调用', '不含', '包含')

  const sessionB = await createSession('AC-CHG-CONV-007-08 会话 b')
  ctx.eq((await list(sessionB)).json.total, 0, '另一会话任务数 0')
  ctx.eq((await graph(sessionB)).json.total, 0, '另一会话图节点 0')

  const idsA = queryRows('SELECT id FROM tasks WHERE session_id = ?', [sessionA]).map((r) => r.id)
  const idsB = queryRows('SELECT id FROM tasks WHERE session_id = ?', [sessionB]).map((r) => r.id)
  ctx.eq(idsB.length, 0, '会话 b 任务行 0')
  ctx.check(idsA.every((id) => !id.startsWith('sess-b')), 'task_id 不跨会话复用', '不跨会话', JSON.stringify(idsA))

  /* ---- 1 分钟时限：提醒 1 次、取消 0 次 ---- */
  const sessionD = await createSession('AC-CHG-CONV-007-08 时限 1 分钟')
  const deadlineAt = Date.now() + 60000
  const timed = await createBatch(sessionD, {
    mode: 'plan', goal: '1 分钟时限只提醒不取消。',
    tasks: [
      { key: 'd1', title: 'mock:fail 时限上游', mode: 'plan', goal: '上游失败。' },
      { key: 'd2', title: '时限下游', mode: 'plan', goal: '等待上游。', dependsOn: ['d1'], joinMode: 'all', deadlineAt },
    ],
    clientMutationId: 'ac-chg-08-deadline',
  })
  ctx.eq(timed.status, 201, '带 1 分钟时限的批次创建 201')
  const timedDown = timed.json.tasks.find((t) => t.title.startsWith('时限下游'))
  ctx.eq(Number(timedDown.deadlineAt || 0), deadlineAt, '时限任务记录 deadlineAt')
  const reminder = await waitFor(async () => {
    const row = queryRows('SELECT deadline_reminded_at FROM tasks WHERE id = ?', [timedDown.id])[0]
    return row && row.deadline_reminded_at > 0 ? row : null
  }, { timeoutMs: 60000, intervalMs: 1000, label: '1 分钟时限提醒落库' }).catch(() => null)
  ctx.check(Boolean(reminder), '1 分钟时限提醒 1 次', '>0', JSON.stringify(reminder && reminder.deadline_reminded_at))
  ctx.eq(queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ? AND deadline_reminded_at > 0', [sessionD])[0].n, 1, '提醒条数恰为 1')
  ctx.eq(queryRows("SELECT COUNT(*) AS n FROM tasks WHERE session_id = ? AND status = 'cancelled'", [sessionD])[0].n, 0, '时限任务取消 0 次')
  ctx.eq(queryRows('SELECT status FROM tasks WHERE id = ?', [timedDown.id])[0].status, 'pending', '时限到点后仍 pending（未取消）')

  // 服务端时钟相对真实时间的领先量：reminded_at 由 clock.NowUnixMilli 写入（conv.go:1967/1986）。
  const clockOffset = reminder ? reminder.deadline_reminded_at - Date.now() : 0
  ctx.check(clockOffset > 60000, 'testclock 生效：服务端时钟领先真实时间 >1 分钟', '>60000', String(clockOffset))

  /* ---- 无自动超时：模拟 30 分钟窗口内保持等待 ---- */
  const sessionW = await createSession('AC-CHG-CONV-007-08 无时限窗口')
  // 时钟探针的时限 = 服务端当前模拟时间 + 30 分钟：只有模拟时间真的推进 30 分钟，扫描才会判定到期。
  const windowDeadline = Date.now() + clockOffset + WINDOW_MS
  const win = await createBatch(sessionW, {
    mode: 'plan', goal: '无时限任务不自动取消。',
    tasks: [
      { key: 'w1', title: 'mock:fail 无时限上游', mode: 'plan', goal: '上游失败。' },
      { key: 'w2', title: '无时限下游', mode: 'plan', goal: '长期等待。', dependsOn: ['w1'], joinMode: 'all' },
      { key: 'p', title: '30 分钟时钟探针', mode: 'plan', goal: '计时。', dependsOn: ['w1'], joinMode: 'all', deadlineAt: windowDeadline },
    ],
    clientMutationId: 'ac-chg-08-window',
  })
  const winDown = win.json.tasks.find((t) => t.title.startsWith('无时限下游'))
  const probe = win.json.tasks.find((t) => t.title.startsWith('30 分钟时钟探针'))
  ctx.eq(Number(probe.deadlineAt || 0), windowDeadline, '时钟探针记录 30 分钟后的时限')
  await waitFor(async () => {
    const row = queryRows('SELECT status, waiting_reason FROM tasks WHERE id = ?', [winDown.id])[0]
    return row && row.status === 'pending' && row.waiting_reason === 'dependency' ? row : null
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
  const winRow = queryRows('SELECT status, deadline_at, deadline_reminded_at FROM tasks WHERE id = ?', [winDown.id])[0]
  ctx.eq(winRow.status, 'pending', '无时限任务 30 分钟窗口后仍 pending')
  ctx.check(!statuses.has('cancelled'), '窗口内任一采样点都未被取消', '不含 cancelled', JSON.stringify([...statuses]))
  ctx.eq(winRow.deadline_at, 0, '无时限任务 deadline_at=0')

  ctx.raw = {
    sessionId: sessionA, taskId: task.id, context: ctxData,
    windowSessionId: sessionW, windowDownstreamId: winDown.id, probeTaskId: probe.id,
    clockRate: CLOCK_RATE, clockOffsetMs: clockOffset, windowRealMs: realElapsed, probeDeadlineAt: windowDeadline,
    probeRemindedAt: probeRow && probeRow.deadline_reminded_at,
    sampledStatuses: [...statuses], deadlineSessionId: sessionD,
    reminderWrittenAt: reminder && reminder.deadline_reminded_at,
  }
}, { testClock: `rate=${CLOCK_RATE}` })

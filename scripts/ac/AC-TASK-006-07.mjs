#!/usr/bin/env node
/**
 * AC-TASK-006-07：重启后 queued 任务继续启动，原 running 任务标记为 interrupted
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-006-07
 * 口径：重启前库里放 1 条 queued（attempt=1）与 1 条 running；
 *   步数预算设为 1，让被接手的任务稳定停在资源等待（status=running），不会瞬间跑完。
 * 断言点：
 *   1) 夹具两条任务状态就位；
 *   2) 重启后 10 秒内 queued 变 running，attempt 不变；
 *   3) queued→running 只发 1 条 task.updated（不含步骤事件与预算暂停事件），
 *      且该事件 payload 的 status/displayStatus 都是 running、attempt 仍为 1；
 *   4) 该任务 task_id 的事件总量（含步骤事件）至少 1 条，不出现 0 条；
 *   5) 原 running 任务变 interrupted；
 *   6) 库里没有多出任务。
 * 断言条数以本轮运行结果为准（共 12 条）。
 * 说明：事件计数用 events 表；步骤事件带 "step" 键，预算暂停事件由 waitingReason 区分。
 */
process.env.SIMO_TASK_MAX_STEPS = '1'

import { runAc, createSession, restartBackend, waitFor, queryRows } from './lib/conv-backend.mjs'
import { seedTask, settle, setTask, taskRow, countTaskUpdated, countTaskTransitions, setSteps } from './lib/task-006.mjs'

await runAc('AC-TASK-006-07', async (ctx) => {
  const sessionId = await createSession('AC-TASK-006-07 重启恢复')
  const queuedId = await seedTask(sessionId, { title: '重启后继续的任务', steps: ['准备', '执行'], key: 'q' })
  const runningId = await seedTask(sessionId, { title: '重启时在跑的任务', steps: ['搜集', '整理'], key: 'r' })
  await settle(sessionId)

  // 夹具：一条 queued（attempt=1，未被启动），一条 running（无检查点，重启后应收为 interrupted）。
  setTask(queuedId, { status: 'queued', attempt: 1, progress: 0, waitingReason: '', outcome: '' })
  setSteps(queuedId, (steps) => { steps.forEach((s) => { s.status = 'pending' }) })
  setTask(runningId, { status: 'running', attempt: 1, progress: 50 })
  setSteps(runningId, (steps) => { steps.forEach((s, i) => { s.status = i === 0 ? 'done' : 'running' }) })
  const total = queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', [sessionId])[0].n
  const eventsBefore = countTaskTransitions(queuedId)
  const allBefore = countTaskUpdated(queuedId)
  ctx.eq(taskRow(queuedId).status, 'queued', '夹具 queued 任务就位')
  ctx.eq(taskRow(runningId).status, 'running', '夹具 running 任务就位')

  await restartBackend('AC-TASK-006-07')

  const started = Date.now()
  const row = await waitFor(() => {
    const cur = taskRow(queuedId)
    return cur && cur.status === 'running' ? cur : null
  }, { timeoutMs: 10000, intervalMs: 100, label: 'queued 任务 10 秒内变 running' })
  const elapsed = Date.now() - started
  ctx.eq(row.status, 'running', 'queued 任务重启后被启动')
  ctx.check(elapsed <= 10000, '启动发生在 10 秒内', '<=10000ms', `${elapsed}ms`)
  ctx.eq(row.attempt, 1, '重启续跑不改 attempt')

  // 行状态先变、事件后提交（曾观测到 114ms 延迟）：先按 50ms 轮询等 task.updated 落库（最多 3 秒），
  // 再数条数，避免把“尚未提交”采样成 0。超时也继续，由下面的断言给出实际条数。
  const eventDeadline = Date.now() + 3000
  while (Date.now() < eventDeadline && countTaskTransitions(queuedId) - eventsBefore <= 0) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // 只数非步骤事件：queued→running 这一跳应当恰好 1 条，重复补写或多写都会红。
  const eventsAfter = countTaskTransitions(queuedId)
  const allAfter = countTaskUpdated(queuedId)
  const transitionDelta = eventsAfter - eventsBefore
  ctx.eq(transitionDelta, 1, 'queued→running 只发 1 条 task.updated 事件')
  const startEvent = queryRows(
    `SELECT payload FROM events WHERE type = 'task.updated' AND payload LIKE ? AND payload NOT LIKE '%"step":%' ORDER BY id DESC LIMIT 1`,
    [`%"id":"${queuedId}"%`],
  )[0]
  const payload = JSON.parse(startEvent.payload)
  ctx.eq(payload.status, 'running', '启动事件 status=running')
  ctx.eq(payload.displayStatus, 'running', '启动事件 displayStatus=running')
  ctx.eq(payload.attempt, 1, '启动事件 attempt 保持 1')
  ctx.check(allAfter - allBefore >= 1, '该任务 task_id 事件总量至少 1 条', '>=1', String(allAfter - allBefore))

  const interrupted = await waitFor(() => {
    const cur = taskRow(runningId)
    return cur && cur.status === 'interrupted' ? cur : null
  }, { timeoutMs: 10000, intervalMs: 100, label: 'running 任务收为 interrupted' })
  ctx.eq(interrupted.status, 'interrupted', '原 running 任务变 interrupted')

  const totalAfter = queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', [sessionId])[0].n
  ctx.eq(totalAfter, total, '重启没有新增任务')

  ctx.raw = { sessionId, queuedId, runningId, elapsed, eventsBefore, eventsAfter, allBefore, allAfter, total, totalAfter, payload }
})

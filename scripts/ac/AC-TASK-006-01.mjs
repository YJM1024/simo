#!/usr/bin/env node
/**
 * AC-TASK-006-01：取消运行中任务，5 秒内进入 cancelled 且没有步骤停在 running
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-006-01
 * 断言点：
 *   1) POST /api/tasks/T/cancel 返回 200；
 *   2) 5 秒内 GET 看到 status=cancelled；
 *   3) DB 里该任务 steps 没有任何 running，未开始步骤回 pending；
 *   4) 终态任务带 finishedAt 语义（updated_at 前进）。
 * 夹具：createBatch 建 3 步任务，等执行器收尾后落库改成「running + 第 1 步 running」。
 */
import { runAc, createSession, api, detail, waitFor } from './lib/conv-backend.mjs'
import { seedTask, settle, setTask, setSteps, stepStates, taskRow } from './lib/task-006.mjs'

await runAc('AC-TASK-006-01', async (ctx) => {
  const sessionId = await createSession('AC-TASK-006-01 取消运行中')
  const taskId = await seedTask(sessionId, { title: '取消运行中任务', steps: ['收集资料', '整理结论', '输出摘要'] })
  await settle(sessionId)

  setTask(taskId, { status: 'running', progress: 40, attempt: 1, waitingReason: '', outcome: '' })
  setSteps(taskId, (steps) => {
    steps.forEach((step, i) => { step.status = i === 0 ? 'running' : 'pending' })
  })
  const before = taskRow(taskId)
  ctx.eq(before.status, 'running', '夹具任务处于 running')

  const started = Date.now()
  const res = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/cancel?sessionId=${encodeURIComponent(sessionId)}`)
  ctx.eq(res.status, 200, '取消接口返回 200')

  const cancelled = await waitFor(async () => {
    const r = await detail(sessionId, taskId)
    const task = r.json && r.json.task
    return task && task.status === 'cancelled' ? task : null
  }, { timeoutMs: 5000, intervalMs: 100, label: '5 秒内进入 cancelled' })
  const elapsed = Date.now() - started
  ctx.eq(cancelled.status, 'cancelled', '任务状态变为 cancelled')
  ctx.check(elapsed <= 5000, '取消在 5 秒内完成', '<=5000ms', `${elapsed}ms`)

  const states = stepStates(taskId)
  ctx.eq(states.filter((step) => step.status === 'running').length, 0, 'DB 中没有 running 步骤')
  ctx.eq(states.filter((step) => step.status === 'pending').length, states.length, '未完成步骤全部回 pending')
  const after = taskRow(taskId)
  ctx.eq(after.status, 'cancelled', 'DB 状态为 cancelled')
  ctx.check(after.updated_at >= before.updated_at, '取消写入更新了 updated_at', `>=${before.updated_at}`, `${after.updated_at}`)

  ctx.raw = { sessionId, taskId, elapsedMs: elapsed, states }
})

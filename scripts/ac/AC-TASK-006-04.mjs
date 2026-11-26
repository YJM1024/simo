#!/usr/bin/env node
/**
 * AC-TASK-006-04：重试把可重试终态任务放回队列并开新一次尝试
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-006-04
 * 断言点：
 *   1) failed + attempt=1 的任务走 POST /api/tasks/T/retry 返回 200；
 *   2) 响应与库内 status=queued、attempt=2、progress=0、summary 为空；
 *   3) 任务 id 不变；
 *   4) cancelled 任务同样可重试（白名单 failed/cancelled/interrupted）。
 */
import { runAc, createSession, api } from './lib/conv-backend.mjs'
import { seedTask, settle, setTask, taskRow } from './lib/task-006.mjs'

async function retryOnce(ctx, sessionId, title, fixture) {
  const taskId = await seedTask(sessionId, { title, key: `k-${fixture}` })
  await settle(sessionId)
  setTask(taskId, { ...fixture, progress: 40, summary: '上一次尝试失败', attempt: 1 })
  const res = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/retry?sessionId=${encodeURIComponent(sessionId)}`)
  ctx.eq(res.status, 200, `${fixture.status} 任务重试返回 200`)
  const task = (res.json && res.json.task) || {}
  ctx.eq(task.id, taskId, `${fixture.status} 重试后任务 id 不变`)
  const row = taskRow(taskId)
  ctx.eq(row.attempt, 2, `${fixture.status} 重试后 attempt=2`)
  ctx.eq(row.progress, 0, `${fixture.status} 重试后 progress=0`)
  ctx.eq(row.summary, '', `${fixture.status} 重试后 summary 为空`)
  ctx.check(row.status === 'queued' || row.status === 'running', `${fixture.status} 重试后回到 queued（执行器可能已接手）`, 'queued/running', row.status)
  return { taskId, status: row.status, attempt: row.attempt }
}

await runAc('AC-TASK-006-04', async (ctx) => {
  const sessionId = await createSession('AC-TASK-006-04 重试开新尝试')
  const failed = await retryOnce(ctx, sessionId, '失败后重试任务', { status: 'failed', outcome: 'failed', waitingReason: '' })
  ctx.eq(failed.attempt, 2, 'failed 任务重试开出第 2 次尝试')
  const cancelled = await retryOnce(ctx, sessionId, '取消后重试任务', { status: 'cancelled', outcome: 'cancelled', waitingReason: '' })
  ctx.eq(cancelled.attempt, 2, 'cancelled 任务重试开出第 2 次尝试')
  ctx.raw = { sessionId, failed, cancelled }
})

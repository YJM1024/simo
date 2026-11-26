#!/usr/bin/env node
/**
 * AC-TASK-004-03：C4 总方案拒绝后无任务、无子会话、无产物，且没有确认事件
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-004-03。
 * 断言点：
 *   1) C4 方案在确认前处于 pending；
 *   2) 拒绝后父级方案为 rejected，任务 0、子会话 0、产物 0；
 *   3) events 表中该会话的 task_confirmed 行数为 0。
 * 夹具与清理：独立会话建一份 C4 方案后拒绝，数据留在隔离库。
 */
import { runAc, createSession, api, queryRows } from './lib/conv-backend.mjs'

const count = (sql, ...params) => queryRows(sql, params)[0].n

await runAc('AC-TASK-004-03', async (ctx) => {
  const sessionId = await createSession('AC-TASK-004-03 C4 拒绝')
  const created = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans`, {
    requestText: '并行做三块', crossDomain: true, steps: ['一', '二', '三'],
  })
  ctx.eq(created.status, 201, 'C4 分级返回 201')
  ctx.eq(created.json && created.json.complexity, 'C4', '方案等级为 C4')
  const planId = created.json && created.json.planId
  ctx.eq(count('SELECT COUNT(*) AS n FROM task_plans WHERE id = ? AND status = ?', planId, 'pending'), 1, '拒绝前方案为 pending')

  const rejected = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans/${encodeURIComponent(planId)}/reject`, { reason: '范围要重排' })
  ctx.eq(rejected.status, 200, '拒绝返回 200')
  ctx.eq(rejected.json && rejected.json.plan && rejected.json.plan.status, 'rejected', '方案标记 rejected')
  ctx.eq(rejected.json && rejected.json.plan && rejected.json.plan.rejectedReason, '范围要重排', '拒绝原因落库')
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId), 0, '拒绝后任务 0')
  ctx.eq(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessionId), 0, '拒绝后子会话 0')
  ctx.eq(count('SELECT COUNT(*) AS n FROM task_artifacts WHERE task_id IN (SELECT id FROM tasks WHERE session_id = ?)', sessionId), 0, '拒绝后产物 0')
  ctx.eq(count('SELECT COUNT(*) AS n FROM task_plans WHERE id = ? AND status = ?', planId, 'rejected'), 1, '方案状态为 rejected')

  const rows = queryRows(`SELECT payload FROM events WHERE type = 'task_confirmed'`)
  const hits = rows.filter((row) => {
    try { return JSON.parse(row.payload).session_id === sessionId } catch { return false }
  })
  ctx.eq(hits.length, 0, 'eventlog 中该会话 task_confirmed 行数为 0')

  ctx.raw = { sessionId, planId, confirmedEvents: hits.length }
})

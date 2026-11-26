#!/usr/bin/env node
/**
 * AC-TASK-004-04：C4 一次确认写入各 1 条分级与确认事件，重复确认不重复写
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-004-04。
 * 断言点：
 *   1) C4 确认一次后，events 中 payload.session_id=父会话 的 complexity_classified 与 task_confirmed 各 1；
 *   2) 再次确认返回 200 且幂等，两类事件仍各 1，子会话/任务不重复创建。
 * 夹具与清理：独立会话建一份 C4 方案，确认两次，数据留在隔离库。
 */
import { runAc, createSession, api, queryRows } from './lib/conv-backend.mjs'

const count = (sql, ...params) => queryRows(sql, params)[0].n

function eventCounts(sessionId) {
  const rows = queryRows(`SELECT type, payload FROM events WHERE type IN ('complexity_classified', 'task_confirmed')`)
  const counts = { complexity_classified: 0, task_confirmed: 0 }
  for (const row of rows) {
    let payload
    try { payload = JSON.parse(row.payload) } catch { continue }
    if (payload.session_id !== sessionId) continue
    if (row.type in counts) counts[row.type] += 1
  }
  return counts
}

await runAc('AC-TASK-004-04', async (ctx) => {
  const sessionId = await createSession('AC-TASK-004-04 C4 事件')
  const created = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans`, {
    requestText: '并行做三块', crossDomain: true, steps: ['一', '二', '三'],
  })
  ctx.eq(created.status, 201, 'C4 分级返回 201')
  const planId = created.json && created.json.planId
  const afterCreate = eventCounts(sessionId)
  ctx.eq(afterCreate.complexity_classified, 1, '创建分级后 complexity_classified 1 条')
  ctx.eq(afterCreate.task_confirmed, 0, '确认前 task_confirmed 0 条')

  const first = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans/${encodeURIComponent(planId)}/confirm`)
  ctx.eq(first.status, 200, '首次确认返回 200')
  const children = (first.json && first.json.childSessionIds) || []
  const tasks = (first.json && first.json.tasks) || []
  const afterConfirm = eventCounts(sessionId)
  ctx.eq(afterConfirm.complexity_classified, 1, '确认后 complexity_classified 仍为 1 条')
  ctx.eq(afterConfirm.task_confirmed, 1, '确认后 task_confirmed 1 条')
  ctx.eq(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessionId), children.length, '子会话数与确认响应一致')
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId), 0, 'C4 父级无任务')
  ctx.eq(tasks.length, children.length, '每个子会话各 1 个任务')

  const second = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans/${encodeURIComponent(planId)}/confirm`)
  ctx.eq(second.status, 200, '重复确认返回 200')
  const afterRepeat = eventCounts(sessionId)
  ctx.eq(afterRepeat.complexity_classified, 1, '重复确认后 complexity_classified 仍为 1 条')
  ctx.eq(afterRepeat.task_confirmed, 1, '重复确认后 task_confirmed 仍为 1 条')
  ctx.eq(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessionId), children.length, '重复确认不重复建子会话')
  ctx.eq(
    count(`SELECT COUNT(*) AS n FROM tasks WHERE session_id IN (${children.map(() => '?').join(',')})`, ...children),
    children.length,
    '重复确认不重复建任务',
  )

  ctx.raw = { sessionId, planId, childCount: children.length, taskCount: tasks.length, afterCreate, afterConfirm, afterRepeat }
})

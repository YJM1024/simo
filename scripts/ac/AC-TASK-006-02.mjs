#!/usr/bin/env node
/**
 * AC-TASK-006-02：终态任务再取消是幂等的（200，状态与 updatedAt 都不变）
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-006-02
 * 断言点：
 *   1) 对 done 任务取消返回 200；
 *   2) 状态仍为 done；
 *   3) 取消前后两次读取的 updatedAt 相同；
 *   4) 新接口同时给出 changed=false。
 */
import { runAc, createSession, api, detail } from './lib/conv-backend.mjs'
import { seedTask, settle, setTask, taskRow } from './lib/task-006.mjs'

await runAc('AC-TASK-006-02', async (ctx) => {
  const sessionId = await createSession('AC-TASK-006-02 终态再取消')
  const taskId = await seedTask(sessionId, { title: '终态再取消任务' })
  await settle(sessionId)

  setTask(taskId, { status: 'done', progress: 100, outcome: 'success' })
  const before = taskRow(taskId)
  ctx.eq(before.status, 'done', '夹具任务处于终态 done')

  const res = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/cancel?sessionId=${encodeURIComponent(sessionId)}`)
  ctx.eq(res.status, 200, '终态取消返回 200')
  const bodyTask = res.json && (res.json.task || res.json.data)
  ctx.check(Boolean(bodyTask && bodyTask.status === 'done'), '响应体任务仍是 done', 'done', JSON.stringify(bodyTask && bodyTask.status))

  const after = await detail(sessionId, taskId)
  const task = after.json && after.json.task
  ctx.eq(task && task.status, 'done', '详情与 DB 状态都不变')
  ctx.eq(taskRow(taskId).updated_at, before.updated_at, 'updatedAt 不变')

  const conv = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${encodeURIComponent(taskId)}/cancel`, { scope: 'self' })
  ctx.eq(conv.status, 200, '新取消接口对终态也返回 200')
  ctx.eq(conv.json && conv.json.changed, false, '新接口 changed=false（幂等）')
  ctx.eq(conv.json && conv.json.task && conv.json.task.status, 'done', '新接口不改状态')

  ctx.raw = { sessionId, taskId, updatedAt: before.updated_at, changed: conv.json && conv.json.changed }
})

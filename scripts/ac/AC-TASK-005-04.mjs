#!/usr/bin/env node
/**
 * AC-TASK-005-04：归档父会话不改子任务状态，子任务保留可查
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-005-04。
 * 断言点：
 *   1) 归档父会话 P 之前，子任务 T 有确定状态（这里先取消成 cancelled，避免执行器改写）；
 *   2) 归档 P 之后 GET /api/tasks/T 仍 200、sessionId 仍是 C、status 与标题不变；
 *   3) 子会话列表仍能查到 T，父会话 children 仍列出 C，父投影状态变 archived 但子会话计数保留。
 * 夹具与清理：P/C 两会话、C 里 1 条任务，留在隔离库。
 */
import { runAc, api } from './lib/conv-backend.mjs'

async function createSession(title, parentId) {
  const body = parentId ? { title, parentId, draft: false } : { title, draft: false }
  const res = await api('POST', '/api/sessions', body)
  if (res.status !== 201) throw new Error(`创建会话失败: ${res.status} ${res.text.slice(0, 200)}`)
  return res.json.session.id
}

async function createTask(sessionId, title) {
  const res = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks`, {
    title, steps: ['先做一步', '再做一步'],
  })
  if (res.status !== 201) throw new Error(`创建任务失败: ${res.status} ${res.text.slice(0, 200)}`)
  return (res.json.tasks || [])[0]
}

await runAc('AC-TASK-005-04', async (ctx) => {
  const parentId = await createSession('AC-TASK-005-04 父会话')
  const childId = await createSession('AC-TASK-005-04 子会话', parentId)
  const task = await createTask(childId, '归档前就存在的子任务')
  const taskId = task.id

  // 让任务进入终态，归档前后的比较才有确定值。
  const cancel = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/cancel?sessionId=${encodeURIComponent(childId)}`)
  ctx.eq(cancel.status, 200, '先把子任务取消到终态')
  const before = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}?sessionId=${encodeURIComponent(childId)}`)
  ctx.eq(before.status, 200, '归档前子任务可读')
  ctx.eq(before.json.task.status, 'cancelled', '归档前子任务状态为 cancelled')

  const archive = await api('POST', `/api/sessions/${encodeURIComponent(parentId)}/archive`)
  ctx.eq(archive.status, 200, '归档父会话 200')
  const parentAfterArchive = await api('GET', `/api/sessions/${encodeURIComponent(parentId)}/spec-projection`)
  ctx.eq(parentAfterArchive.status, 200, '归档后父会话投影仍可读')
  ctx.eq(parentAfterArchive.json.status, 'archived', '父会话投影状态为 archived')

  const after = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}?sessionId=${encodeURIComponent(childId)}`)
  ctx.eq(after.status, 200, '归档父会话后子任务仍 200')
  ctx.eq(after.json.task.id, taskId, '归档后任务 id 不变')
  ctx.eq(after.json.task.sessionId, childId, '归档后任务仍归子会话 C')
  ctx.eq(after.json.task.status, before.json.task.status, '归档不改变子任务状态')
  ctx.eq(after.json.task.title, before.json.task.title, '归档不改变子任务标题')

  const childList = await api('GET', `/api/sessions/${encodeURIComponent(childId)}/tasks`)
  ctx.eq(childList.status, 200, '归档后子会话任务列表仍可读')
  const kept = (childList.json.tasks || []).find((item) => item.id === taskId)
  ctx.check(Boolean(kept), '子会话列表仍包含被归档父会话下的子任务', 'tasks', JSON.stringify((childList.json.tasks || []).map((item) => item.id)))

  const children = await api('GET', `/api/sessions/${encodeURIComponent(parentId)}/children`)
  ctx.eq(children.status, 200, '归档父会话后 children 仍可读')
  ctx.eq(children.json.count, 1, '归档后直接子会话仍为 1')
  ctx.eq(children.json.children[0] && children.json.children[0].id, childId, '归档后 children 仍指向子会话 C')
  ctx.eq(children.json.children[0] && children.json.children[0].archived, 0, '子会话没有被父会话归档牵连')

  ctx.raw = {
    parentId, childId, taskId, beforeStatus: before.json.task.status, afterStatus: after.json.task.status,
    parentProjectionStatus: parentAfterArchive.json.status, childrenCount: children.json.count,
  }
})

#!/usr/bin/env node
/**
 * AC-TASK-005-01：子会话任务归属——在子会话 C 内建任务 T，GET /api/tasks/T 返回 sessionId=C
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-005-01。
 * 断言点：
 *   1) 子会话 C 建出的任务 T，详情与列表都把 T 归到 C；
 *   2) 父会话 P 的详情入口拿不到 T（sessionId 不一致即 404），避免归属漂移；
 *   3) 任务详情带 childSessionIds/childSessionCount 投影字段（T 在叶子会话，两者为空/0）。
 * 夹具与清理：P/C 两个会话与 1 条任务留在隔离库。
 */
import { runAc, api } from './lib/conv-backend.mjs'

async function createChildSession(parentId, title) {
  const res = await api('POST', '/api/sessions', { title, parentId, draft: false })
  if (res.status !== 201) throw new Error(`创建子会话失败: ${res.status} ${res.text.slice(0, 200)}`)
  return res.json.session.id
}

async function createTask(sessionId, title) {
  const res = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks`, {
    title, steps: ['梳理现状', '落实现状'],
  })
  if (res.status !== 201) throw new Error(`创建任务失败: ${res.status} ${res.text.slice(0, 200)}`)
  const task = (res.json && res.json.tasks && res.json.tasks[0]) || {}
  if (!task.id) throw new Error(`创建任务响应缺少 tasks[0].id: ${res.text.slice(0, 200)}`)
  return task
}

await runAc('AC-TASK-005-01', async (ctx) => {
  const parentId = (await api('POST', '/api/sessions', { title: 'AC-TASK-005-01 父会话', draft: false })).json.session.id
  const childId = await createChildSession(parentId, 'AC-TASK-005-01 子会话')
  ctx.check(Boolean(childId && childId !== parentId), '子会话创建成功且与父不同', 'childId', childId)

  const task = await createTask(childId, '子会话里的任务')
  const taskId = task.id
  ctx.eq(task.sessionId, childId, '创建响应里任务归属子会话')

  const legacy = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}?sessionId=${encodeURIComponent(childId)}`)
  ctx.eq(legacy.status, 200, '父层旧详情接口按子会话查任务 200')
  ctx.eq(legacy.json.task.id, taskId, '详情返回同一个任务')
  ctx.eq(legacy.json.task.sessionId, childId, '详情 sessionId 等于子会话 C')
  ctx.check(Array.isArray(legacy.json.task.childSessionIds), '任务详情带 childSessionIds 数组', 'type', typeof legacy.json.task.childSessionIds)
  ctx.eq(legacy.json.task.childSessionCount, 0, '叶子子会话的任务 childSessionCount=0')

  const conv = await api('GET', `/api/sessions/${encodeURIComponent(childId)}/tasks/${encodeURIComponent(taskId)}`)
  ctx.eq(conv.status, 200, '会话内详情接口 200')
  ctx.eq(conv.json.task.sessionId, childId, '会话内详情的 sessionId 仍是子会话 C')

  const scopedList = await api('GET', `/api/sessions/${encodeURIComponent(childId)}/tasks`)
  ctx.eq(scopedList.status, 200, '子会话任务列表 200')
  const listed = (scopedList.json.tasks || []).find((item) => item.id === taskId)
  ctx.check(Boolean(listed), '子会话列表能查到 T', 'tasks', JSON.stringify((scopedList.json.tasks || []).map((item) => item.id)))
  ctx.eq(listed && listed.sessionId, childId, '列表里 T 的 sessionId 等于子会话 C')

  // 父会话按同一任务 id 查询必须 404，说明归属只认任务自己的 session_id。
  const wrongScope = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}?sessionId=${encodeURIComponent(parentId)}`)
  ctx.eq(wrongScope.status, 404, '父会话查子任务 404')
  ctx.check(wrongScope.text.includes('task_not_found'), '404 错误码为 task_not_found', 'body', wrongScope.text.slice(0, 200))

  ctx.raw = { parentId, childId, taskId, legacyStatus: legacy.status, wrongScopeStatus: wrongScope.status }
})

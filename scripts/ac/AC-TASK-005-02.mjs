#!/usr/bin/env node
/**
 * AC-TASK-005-02：父任务组不混入子任务，父层给「含 N 个子会话」入口的数据源
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-005-02。
 * 断言点：
 *   1) 父会话 P 自有 1 条任务、子会话 C 有 1 条任务；
 *   2) GET /api/tasks?sessionId=P 只返回 P 的 1 条，计数 counts.all=1，正文不含子任务；
 *   3) GET /api/sessions/P/spec-projection 的三组任务合计 1、不含子任务，且 childSessionCount=1、
 *      childSessionIds=[C]（前端「含 N 个子会话」入口取这两个字段，N>0 才启用）；
 *   4) GET /api/sessions/P/children 只列直接子会话 C，taskCount=1，与入口数量一致；
 *   5) 进入子会话后 GET /api/sessions/C/tasks 能看到子任务，子任务不计入父层任何计数。
 * 夹具与清理：P/C 两会话各 1 条任务，留在隔离库。
 */
import { runAc, api } from './lib/conv-backend.mjs'

async function createSession(title, parentId) {
  const body = parentId ? { title, parentId, draft: false } : { title, draft: false }
  const res = await api('POST', '/api/sessions', body)
  if (res.status !== 201) throw new Error(`创建会话失败: ${res.status} ${res.text.slice(0, 200)}`)
  return res.json.session.id
}

async function createTask(sessionId, title, steps) {
  const res = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks`, { title, steps })
  if (res.status !== 201) throw new Error(`创建任务失败: ${res.status} ${res.text.slice(0, 200)}`)
  return (res.json.tasks || [])[0]
}

function projectionTotal(projection) {
  const groups = (projection && projection.tasks) || {}
  const totalOf = (group) => (group && Number(group.total)) || 0
  return totalOf(groups.done) + totalOf(groups.running) + totalOf(groups.pending)
}

function projectionItems(projection) {
  const groups = (projection && projection.tasks) || {}
  return ['done', 'running', 'pending'].flatMap((key) => ((groups[key] && groups[key].items) || []))
}

await runAc('AC-TASK-005-02', async (ctx) => {
  const parentId = await createSession('AC-TASK-005-02 父会话')
  const parentTask = await createTask(parentId, '父会话自己的任务', ['做一件事'])
  const childId = await createSession('AC-TASK-005-02 子会话', parentId)
  const childTask = await createTask(childId, '子会话自己的任务', ['做另一件事'])
  ctx.check(Boolean(parentTask.id && childTask.id && parentTask.id !== childTask.id), '两条任务分别落在两个会话', 'ids', `${parentTask.id}/${childTask.id}`)

  const parentList = await api('GET', `/api/tasks?sessionId=${encodeURIComponent(parentId)}`)
  ctx.eq(parentList.status, 200, '父会话任务列表 200')
  const parentItems = parentList.json.tasks || []
  ctx.eq(parentItems.length, 1, '父会话列表只有自己的 1 条任务')
  ctx.eq(parentItems[0] && parentItems[0].id, parentTask.id, '父会话列表里是父任务')
  ctx.eq(parentList.json.counts && parentList.json.counts.all, 1, '父会话 counts.all=1')
  ctx.check(!parentList.text.includes(childTask.id), '父会话列表正文不含子任务 id', 'childTaskId', childTask.id)
  ctx.check(!parentList.text.includes('子会话自己的任务'), '父会话列表正文不含子任务标题', 'body', parentList.text.slice(0, 200))

  const parentProjection = await api('GET', `/api/sessions/${encodeURIComponent(parentId)}/spec-projection`)
  ctx.eq(parentProjection.status, 200, '父会话投影 200')
  const projection = parentProjection.json
  ctx.eq(projectionTotal(projection), 1, '父投影三组任务合计 1')
  const items = projectionItems(projection)
  ctx.check(items.length === 1 && items[0].id === parentTask.id, '父投影任务项只有父任务', 'items', JSON.stringify(items.map((item) => item.id)))
  ctx.eq(projection.childSessionCount, 1, '父投影 childSessionCount=1')
  ctx.check(Array.isArray(projection.childSessionIds) && projection.childSessionIds.length === 1, '父投影 childSessionIds 有 1 项', 'ids', JSON.stringify(projection.childSessionIds))
  ctx.eq(projection.childSessionIds && projection.childSessionIds[0], childId, '父投影 childSessionIds 指向子会话 C')

  const children = await api('GET', `/api/sessions/${encodeURIComponent(parentId)}/children`)
  ctx.eq(children.status, 200, '父会话 children 接口 200')
  ctx.eq(children.json.count, 1, 'children 数量与入口数量一致')
  ctx.eq(children.json.children[0] && children.json.children[0].id, childId, 'children 只列直接子会话 C')
  ctx.eq(children.json.children[0] && children.json.children[0].taskCount, 1, '子会话 C 的任务数为 1')

  // 点击入口进入 C 后能看到子任务；C 里不再出现父任务。
  const childList = await api('GET', `/api/sessions/${encodeURIComponent(childId)}/tasks`)
  ctx.eq(childList.status, 200, '进入子会话后任务列表 200')
  const childItems = childList.json.tasks || []
  ctx.eq(childItems.length, 1, '子会话列表只有自己的 1 条任务')
  ctx.eq(childItems[0] && childItems[0].id, childTask.id, '子会话列表里是子任务')
  ctx.check(!childList.text.includes(parentTask.id), '子会话列表正文不含父任务 id', 'parentTaskId', parentTask.id)

  ctx.raw = {
    parentId, childId, parentTaskId: parentTask.id, childTaskId: childTask.id,
    parentCounts: parentList.json.counts, projectionCount: projection.childSessionCount,
    projectionIds: projection.childSessionIds, childrenCount: children.json.count,
  }
})

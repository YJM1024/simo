#!/usr/bin/env node
/**
 * AC-TASK-005-03：跨会话读写一律按不存在处理（负路径）
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-005-03。
 * 断言点：
 *   1) GET /api/sessions/P/files 与 GET /api/tasks?sessionId=P 正文不含子任务 id 与标题；
 *   2) 六个写/读入口在错会话下全部 404 且错误码 task_not_found：列表（会话内）、详情（新旧两条）、
 *      取消、重试、恢复、确认；
 *   3) 负路径之后任务本身不变（仍 pending/queued、sessionId 仍是 C），正确会话下取消可成功。
 * 夹具与清理：P/C 两会话、子任务 1 条，留在隔离库。
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
    title, steps: ['准备材料', '交付材料'],
  })
  if (res.status !== 201) throw new Error(`创建任务失败: ${res.status} ${res.text.slice(0, 200)}`)
  return (res.json.tasks || [])[0]
}

function expectNotFound(ctx, res, label) {
  ctx.eq(res.status, 404, `${label} 返回 404`)
  ctx.check(res.text.includes('task_not_found'), `${label} 错误码 task_not_found`, 'body', res.text.slice(0, 200))
}

await runAc('AC-TASK-005-03', async (ctx) => {
  const parentId = await createSession('AC-TASK-005-03 父会话')
  const childId = await createSession('AC-TASK-005-03 子会话', parentId)
  const task = await createTask(childId, '不该被父会话看到的任务')
  const taskId = task.id

  const files = await api('GET', `/api/sessions/${encodeURIComponent(parentId)}/files`)
  ctx.eq(files.status, 200, '父会话文件聚合 200')
  ctx.check(!files.text.includes(taskId), '父会话文件正文不含子任务 id', 'taskId', taskId)
  ctx.check(!files.text.includes('不该被父会话看到的任务'), '父会话文件正文不含子任务标题', 'body', files.text.slice(0, 200))

  const parentList = await api('GET', `/api/tasks?sessionId=${encodeURIComponent(parentId)}`)
  ctx.eq(parentList.status, 200, '父会话任务列表 200')
  ctx.check(!parentList.text.includes(taskId), '父会话列表正文不含子任务 id', 'taskId', taskId)
  ctx.check(!parentList.text.includes('不该被父会话看到的任务'), '父会话列表正文不含子任务标题', 'body', parentList.text.slice(0, 200))

  // 会话内列表只按 session_id 精确匹配，不递归子会话。
  const wrongScopedList = await api('GET', `/api/sessions/${encodeURIComponent(parentId)}/tasks`)
  ctx.eq(wrongScopedList.status, 200, '父会话会话内列表 200')
  ctx.check(!wrongScopedList.text.includes(taskId), '父会话会话内列表不含子任务 id', 'body', wrongScopedList.text.slice(0, 200))

  const wrongDetailLegacy = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}?sessionId=${encodeURIComponent(parentId)}`)
  expectNotFound(ctx, wrongDetailLegacy, '旧详情按父会话读子任务')

  const wrongDetailConv = await api('GET', `/api/sessions/${encodeURIComponent(parentId)}/tasks/${encodeURIComponent(taskId)}`)
  expectNotFound(ctx, wrongDetailConv, '会话内详情按父会话读子任务')

  const wrongCancel = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/cancel?sessionId=${encodeURIComponent(parentId)}`)
  expectNotFound(ctx, wrongCancel, '旧取消按父会话操作子任务')

  const wrongRetry = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/retry?sessionId=${encodeURIComponent(parentId)}`)
  expectNotFound(ctx, wrongRetry, '旧重试按父会话操作子任务')

  const wrongResume = await api('POST', `/api/sessions/${encodeURIComponent(parentId)}/tasks/${encodeURIComponent(taskId)}/resume`)
  expectNotFound(ctx, wrongResume, '会话内恢复按父会话操作子任务')

  const wrongConfirm = await api('POST', `/api/sessions/${encodeURIComponent(parentId)}/tasks/${encodeURIComponent(taskId)}/confirmation`, { decision: 'confirm' })
  expectNotFound(ctx, wrongConfirm, '会话内确认按父会话操作子任务')

  const wrongConvCancel = await api('POST', `/api/sessions/${encodeURIComponent(parentId)}/tasks/${encodeURIComponent(taskId)}/cancel`)
  expectNotFound(ctx, wrongConvCancel, '会话内取消按父会话操作子任务')

  const wrongConvRetry = await api('POST', `/api/sessions/${encodeURIComponent(parentId)}/tasks/${encodeURIComponent(taskId)}/retry`)
  expectNotFound(ctx, wrongConvRetry, '会话内重试按父会话操作子任务')

  // 负路径不产生副作用：任务仍归 C，且还能被正确会话取消。
  const afterNegative = await api('GET', `/api/sessions/${encodeURIComponent(childId)}/tasks/${encodeURIComponent(taskId)}`)
  ctx.eq(afterNegative.status, 200, '正确会话下任务仍可读')
  ctx.eq(afterNegative.json.task.sessionId, childId, '负路径后任务仍归子会话 C')
  const statusAfterNegative = afterNegative.json.task.status
  ctx.check(statusAfterNegative !== 'cancelled', '负路径没有取消掉任务', 'status', statusAfterNegative)

  const cancelOk = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/cancel?sessionId=${encodeURIComponent(childId)}`)
  ctx.eq(cancelOk.status, 200, '正确会话下取消 200')
  const afterCancel = await api('GET', `/api/sessions/${encodeURIComponent(childId)}/tasks/${encodeURIComponent(taskId)}`)
  ctx.eq(afterCancel.json.task.status, 'cancelled', '正确会话下取消生效')

  ctx.raw = {
    parentId, childId, taskId, statusAfterNegative,
    wrongScopeStatuses: [wrongDetailLegacy.status, wrongDetailConv.status, wrongCancel.status, wrongRetry.status,
      wrongResume.status, wrongConfirm.status, wrongConvCancel.status, wrongConvRetry.status],
  }
})

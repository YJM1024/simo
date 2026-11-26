#!/usr/bin/env node
/**
 * AC-CONV-009-01（判据 CT-CONV-521 / TC-P1-CONV-037）
 * batch-10 单任务：创建 1 个任务 201、counts.all 加 1、messageId 非空、列表 1 条且 mode=plan。
 * 同时覆盖契约负例：批量超限 400、空批量 400、上下文超限 413、跨会话 404、非法 limit 400。
 * 夹具：新建会话 + 单任务请求体；清理：会话与任务留在隔离库，服务由公共层停掉。
 */
import { runAc, createSession, createBatch, detail, list, graph } from './lib/conv-backend.mjs'

await runAc('AC-CONV-009-01', async (ctx) => {
  const sessionId = await createSession('AC-CONV-009-01 单任务创建')
  const before = await list(sessionId)
  ctx.eq(before.status, 200, '创建前列表 200')
  const baseCount = Number(before.json && before.json.counts && before.json.counts.all)

  const res = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证单任务创建主路径。',
    inputs: ['输入一：会话内只建 1 个任务。'],
    constraints: ['不依赖其它任务。'],
    tasks: [{ key: 't1', title: '单任务：整理一份结论', mode: 'plan', goal: '输出三条结论。' }],
    clientMutationId: 'ac-conv-009-01',
  })
  ctx.eq(res.status, 201, '创建任务返回 201')
  const body = res.json || {}
  ctx.match(body.batchId, /^batch-[0-9a-f]{16}$/, 'batchId 为 batch-<16 hex>')
  ctx.eq(body.total, 1, '本批任务数为 1')
  ctx.check(Boolean(body.messageId), 'messageId 非空', '非空字符串', JSON.stringify(body.messageId))
  ctx.check(Array.isArray(body.tasks) && body.tasks.length === 1, 'tasks 含 1 条', 1, Array.isArray(body.tasks) ? body.tasks.length : 'not-array')
  const taskId = body.tasks && body.tasks[0] && body.tasks[0].id
  ctx.check(Boolean(taskId), '返回任务 id 非空', 'task_id', JSON.stringify(taskId))
  ctx.eq(body.counts && body.counts.all, baseCount + 1, 'counts.all 加 1')

  const after = await list(sessionId)
  ctx.eq(after.status, 200, '列表 200')
  ctx.eq(after.json.total, 1, '列表 total=1')
  ctx.eq(after.json.tasks[0] && after.json.tasks[0].id, taskId, '列表 task_id 与创建一致')
  ctx.eq(after.json.tasks[0] && after.json.tasks[0].mode, 'plan', '列表 mode=plan')

  const other = await createSession('AC-CONV-009-01 跨会话对照')
  const cross = await detail(other, taskId)
  ctx.eq(cross.status, 404, '跨会话详情 404')
  ctx.eq(cross.json && cross.json.code, 'task_not_found', '跨会话失败码 task_not_found')
  ctx.check(!cross.text.includes('单任务：整理一份结论') && !cross.text.includes('输出三条结论'), '跨会话 404 响应不含标题与目标', '不含', '包含')

  const tooMany = await createBatch(sessionId, {
    mode: 'plan',
    tasks: Array.from({ length: 13 }, (_, i) => ({ key: `x${i}`, title: `超限任务 ${i}`, mode: 'plan' })),
  })
  ctx.eq(tooMany.status, 400, '批量 13 条返回 400')
  ctx.eq(tooMany.json && tooMany.json.code, 'task_batch_too_large', '批量超限失败码 task_batch_too_large')

  const empty = await createBatch(sessionId, { mode: 'plan', tasks: [] })
  ctx.eq(empty.status, 400, '空批量返回 400')
  ctx.eq(empty.json && empty.json.code, 'invalid_task_mode', '空批量失败码 invalid_task_mode')

  const huge = await createBatch(sessionId, {
    mode: 'plan', goal: 'x'.repeat(2001),
    tasks: [{ key: 't', title: '上下文超限', mode: 'plan' }],
  })
  ctx.eq(huge.status, 413, 'goal 超 2000 字返回 413')
  ctx.eq(huge.json && huge.json.code, 'task_context_too_large', '超限失败码 task_context_too_large')

  const badLimit = await list(sessionId, '?limit=0')
  ctx.eq(badLimit.status, 400, 'limit=0 返回 400')
  ctx.eq(badLimit.json && badLimit.json.code, 'invalid_task_limit', 'limit 非法失败码 invalid_task_limit')

  const badBatch = await graph(sessionId, '?batchId=not-a-batch')
  ctx.eq(badBatch.status, 400, 'batchId 非法返回 400')
  ctx.eq(badBatch.json && badBatch.json.code, 'invalid_argument', 'batchId 非法失败码 invalid_argument')

  ctx.raw = { sessionId, taskId, batchId: body.batchId, baseCount }
})

#!/usr/bin/env node
/**
 * AC-CONV-009-17（判据 CT-CONV-537 / TC-P1-CONV-053）
 * sessions-a-b：会话 B 任务数 0、图节点 0、跨会话查询 0 条；
 * 用 B 的会话段请求 A 的任务详情返回 404，响应体不含 A 的标题与目标；不存在的会话 404。
 */
import { runAc, createSession, createBatch, detail, list, graph, api } from './lib/conv-backend.mjs'

await runAc('AC-CONV-009-17', async (ctx) => {
  const sessionA = await createSession('AC-CONV-009-17 会话 a')
  const created = await createBatch(sessionA, {
    mode: 'plan', goal: '会话 a：两条任务与两份产物。',
    inputs: ['会话 a 的输入只属于 a。'], constraints: ['不得泄漏到会话 b。'],
    tasks: [
      { key: 'r', title: '会话 a：写会议纪要', mode: 'plan', goal: '输出纪要。' },
      { key: 's', title: '会话 a：截图存档', mode: 'plan', goal: '输出截图。' },
    ],
    clientMutationId: 'ac-conv-009-17-a',
  })
  ctx.eq(created.status, 201, '会话 a 创建 2 条任务 201')
  const taskA = created.json.tasks[0]

  const sessionB = await createSession('AC-CONV-009-17 会话 b')
  const listB = await list(sessionB)
  ctx.eq(listB.status, 200, '会话 b 列表 200')
  ctx.eq(listB.json.total, 0, '会话 b 任务数 0')
  ctx.eq(listB.json.counts && listB.json.counts.all, 0, '会话 b counts.all=0')

  const graphB = await graph(sessionB)
  ctx.eq(graphB.status, 200, '会话 b 图 200')
  ctx.eq(graphB.json.total, 0, '会话 b 图节点 0')
  ctx.eq((graphB.json.nodes || []).length, 0, '会话 b nodes 为空数组')
  ctx.eq((graphB.json.edges || []).length, 0, '会话 b edges 为空数组')

  const cross = await detail(sessionB, taskA.id)
  ctx.eq(cross.status, 404, '用 b 的会话段请求 a 的任务详情 404')
  ctx.eq(cross.json && cross.json.code, 'task_not_found', '失败码 task_not_found')
  ctx.check(!cross.text.includes('会话 a：写会议纪要'), '404 响应不含 a 的标题', '不含', '包含')
  ctx.check(!cross.text.includes('输出纪要'), '404 响应不含 a 的目标', '不含', '包含')

  const listA = await list(sessionA)
  ctx.eq(listA.json.total, 2, '会话 a 任务数 2（与 b 隔离）')

  const delivB = await api('GET', `/api/sessions/${encodeURIComponent(sessionB)}/deliverables`)
  ctx.eq(delivB.status, 200, '会话 b 交付物 200')
  ctx.eq(delivB.json.fileCount, 0, '会话 b 交付物 0 个')

  const missing = await list('sess-does-not-exist')
  ctx.eq(missing.status, 404, '不存在会话列表 404')
  ctx.eq(missing.json && missing.json.code, 'task_not_found', '不存在会话失败码 task_not_found')

  ctx.raw = { sessionA, sessionB, taskA: taskA.id, crossText: cross.text.slice(0, 240) }
})

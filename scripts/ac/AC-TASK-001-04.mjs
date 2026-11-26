#!/usr/bin/env node
/**
 * AC-TASK-001-04：空会话任务空态
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-001-04
 * 前置：隔离后端以 mock 模型运行；frontend/dist 已构建；新建会话不创建任何任务。
 * 断言点：
 *   1) 投影接口 tasks.running/pending/done 的 total 与 items 全为 0；
 *   2) 概览任务块出现空态文案「本会话还没有任务。」，任务行数为 0；
 *   3) 计数文案为 0 进行中 / 0 未开始 / 0 已完成，不出现假计数。
 * 夹具与清理：只建空会话 S0；数据留在隔离库。
 */
import { runAc, createSession, api, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, count, text } from './lib/task-ui-helpers.mjs'

await runAc('AC-TASK-001-04', async (ctx) => {
  const sessionId = await createSession('AC-TASK-001-04 空会话任务空态')

  const pj = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/spec-projection?taskLimit=3`)
  ctx.eq(pj.status, 200, '投影接口返回 200')
  const groups = pj.json && pj.json.tasks
  ctx.check(Boolean(groups), '投影返回 tasks 分组', 'tasks 对象', JSON.stringify(pj.json).slice(0, 200))
  let itemCount = 0
  for (const key of ['running', 'pending', 'done']) {
    const group = (groups && groups[key]) || {}
    ctx.eq(group.total, 0, `投影 ${key}.total=0`)
    ctx.eq(Array.isArray(group.items) ? group.items.length : -1, 0, `投影 ${key}.items 为空`)
    itemCount += Array.isArray(group.items) ? group.items.length : 0
  }
  ctx.eq(itemCount, 0, '投影任务条数为 0')

  const server = await startDistServer({ apiBase: BASE })
  let client
  try {
    client = await openConversation(sessionId, { url: server.url })
    await uiWaitFor(client, `document.querySelector('#insp-block-tasks .insp-text') !== null`, {
      timeout: 10000,
      label: '概览任务块出现空态',
    })
    ctx.eq(await count(client, '#insp-block-tasks .exec-row'), 0, '概览任务行数为 0')
    const emptyText = (await text(client, '#insp-block-tasks .insp-text') || '').trim()
    ctx.check(emptyText.includes('本会话还没有任务'), '空态文案为「本会话还没有任务。」', '包含「本会话还没有任务」', emptyText)
    const countsText = (await text(client, '#insp-block-tasks .insp-task-counts') || '').trim()
    ctx.check(/0\s*进行中/.test(countsText), '计数文案 0 进行中', '包含「0 进行中」', countsText)
    ctx.check(/0\s*未开始/.test(countsText), '计数文案 0 未开始', '包含「0 未开始」', countsText)
    ctx.check(/0\s*已完成/.test(countsText), '计数文案 0 已完成', '包含「0 已完成」', countsText)
    ctx.eq(await count(client, '#insp-block-tasks .insp-more'), 0, '空会话不出现「还有 N 个」入口')

    ctx.raw = { sessionId, countsText, emptyText }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

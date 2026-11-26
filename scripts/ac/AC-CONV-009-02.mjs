#!/usr/bin/env node
/**
 * AC-CONV-009-02（判据 CT-CONV-522 / TC-P1-CONV-038 / 产品 spec:346）
 * 1) 接口：batch-12 一次创建 12 条只写 1 条 category=task 消息，带 batch_id 与 tasks[0].id；
 *    列表 limit=10 两页 10 + 2，total=12。
 * 2) 界面：在 frontend/dist 上打开本脚本创建的真实会话（静态页 /api 反代到当前隔离后端），
 *    断言汇总卡 1 张、标题计数「已创建 12 个任务」、默认 10 行、「还有 2 条」入口、
 *    点开后 12 行且入口消失（不二次折叠）、收起可回到 10 行 + 入口。
 */
import { runAc, createSession, createBatch, list, queryRows } from './lib/conv-backend.mjs'
import { startDistServer, openConversation, readSummaryCard, waitFor, sleep } from './lib/conversation-ui.mjs'
import { clickSel } from './lib/task-ui-helpers.mjs'

await runAc('AC-CONV-009-02', async (ctx) => {
  const sessionId = await createSession('AC-CONV-009-02 批量 12 条')
  const res = await createBatch(sessionId, {
    mode: 'plan',
    goal: '一次创建 12 条任务，验证消息折叠与列表分页。',
    inputs: ['十二组素材，每组独立整理。'],
    constraints: ['每条任务只处理一组素材。'],
    tasks: Array.from({ length: 12 }, (_, i) => ({
      key: `t${String(i + 1).padStart(2, '0')}`,
      title: `批量任务 ${String(i + 1).padStart(2, '0')}：整理第 ${i + 1} 组素材`,
      mode: 'plan',
      goal: `整理第 ${i + 1} 组素材并输出结论。`,
    })),
    clientMutationId: 'ac-conv-009-02',
  })
  ctx.eq(res.status, 201, '批量 12 条返回 201')
  ctx.eq(res.json && res.json.total, 12, '本批 12 条任务')
  const taskId = res.json.tasks[0].id
  const batchId = res.json.batchId

  const rows = queryRows("SELECT id, category, text, task_id, batch_id, internal FROM messages WHERE session_id = ? AND category = 'task'", [sessionId])
  ctx.eq(rows.length, 1, '消息表只写 1 条 category=task 消息')
  const msg = rows[0] || {}
  ctx.eq(msg.text, '已创建 12 个任务', '消息文案为「已创建 12 个任务」')
  ctx.eq(msg.task_id, taskId, '消息 task_id = tasks[0].id')
  ctx.eq(msg.batch_id, batchId, '消息 batch_id 等于本批 batchId')
  ctx.eq(msg.internal, 0, '消息不是内部消息')

  const page = await list(sessionId, '?limit=10')
  ctx.eq(page.status, 200, 'limit=10 列表 200')
  ctx.eq(page.json.tasks.length, 10, '首屏 10 条')
  ctx.eq(page.json.hasMore, true, 'hasMore=true（还有 2 条）')
  ctx.check(typeof page.json.nextBefore === 'string' && page.json.nextBefore.length > 0, 'nextBefore 为非空游标', '非空字符串', JSON.stringify(page.json.nextBefore))
  ctx.eq(page.json.total, 12, 'total=12')

  const rest = await list(sessionId, `?limit=10&before=${encodeURIComponent(page.json.nextBefore)}`)
  ctx.eq(rest.status, 200, '第二页 200')
  ctx.eq(rest.json.tasks.length, 2, '第二页 2 条')
  ctx.eq(rest.json.hasMore, false, '第二页 hasMore=false')
  ctx.eq(rest.json.tasks.length + page.json.tasks.length, 12, '两页合计 12 条')

  const dbTasks = queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', [sessionId])
  ctx.eq(dbTasks[0].n, 12, '任务表 12 行')

  // ---- 界面判据 ----
  // 期望值直接取卡片同一条数据通道（batchId 过滤 + limit=100），与页面渲染同源。
  const batch = await list(sessionId, `?limit=100&batchId=${encodeURIComponent(batchId)}`)
  const expected = batch.json.tasks.map((task) => task.title)
  if (expected.length !== 12) throw new Error(`界面夹具通道异常：batchId 过滤返回 ${expected.length} 条，期望 12 条`)

  const apiBase = process.env.AC_CONV_BASE || 'http://127.0.0.1:8789'
  let server
  let client
  try {
    server = await startDistServer({ apiBase })
    client = await openConversation(sessionId, { url: server.url })
    await waitFor(client, `document.querySelector('.msg-task-summary') !== null`, { timeout: 20000, label: '会话里出现汇总卡' })
    await sleep(300)

    const card = await readSummaryCard(client)
    ctx.eq(card.cards, 1, '界面：会话里只有 1 张汇总卡')
    ctx.eq(card.batchId, batchId, '界面：汇总卡 data-batch-id 等于本批 batchId')
    ctx.eq(card.head, '已创建 12 个任务', '界面：汇总卡标题计数为「已创建 12 个任务」')
    ctx.eq(card.preview, `${expected.slice(0, 3).join('、')} 等 12 个`, '界面：预览列出前 3 条任务名并标「等 12 个」')
    ctx.eq(card.items, 10, '界面：默认可见 10 行')
    ctx.eq(JSON.stringify(card.titles), JSON.stringify(expected.slice(0, 10)), '界面：默认 10 行标题与接口前 10 条一一对应')
    ctx.eq(card.moreCount, 1, '界面：「还有 2 条」入口 1 个')
    ctx.eq(card.more, '还有 2 条', '界面：折叠入口文案为「还有 2 条」')

    // 点入口展开：12 行，入口消失（不二次折叠）。
    await clickSel(client, '.msg-task-summary .task-summary-more')
    await waitFor(client, `document.querySelectorAll('.msg-task-summary-item').length === 12`, { timeout: 10000, label: '展开后 12 行' })
    const expanded = await readSummaryCard(client)
    ctx.eq(expanded.items, 12, '界面：点「还有 2 条」后列表 12 行')
    ctx.eq(JSON.stringify(expanded.titles), JSON.stringify(expected), '界面：展开后 12 行标题与接口 12 条一致')
    ctx.eq(expanded.moreCount, 0, '界面：展开后折叠入口消失（不二次折叠）')
    ctx.eq(expanded.toggle, '收起', '界面：展开后切换按钮为「收起」')

    // 收起回 10 行 + 入口，再展开仍 12 行，证明折叠可逆且不会叠加。
    await clickSel(client, '.msg-task-summary .task-summary-toggle')
    await waitFor(client, `document.querySelectorAll('.msg-task-summary-item').length === 10`, { timeout: 10000, label: '收起后 10 行' })
    const collapsed = await readSummaryCard(client)
    ctx.eq(collapsed.items, 10, '界面：收起后回到 10 行')
    ctx.eq(collapsed.more, '还有 2 条', '界面：收起后入口恢复为「还有 2 条」')

    await clickSel(client, '.msg-task-summary .task-summary-toggle')
    await waitFor(client, `document.querySelectorAll('.msg-task-summary-item').length === 12`, { timeout: 10000, label: '再次展开 12 行' })
    const again = await readSummaryCard(client)
    ctx.eq(again.items, 12, '界面：再次展开仍为 12 行')
    ctx.eq(again.moreCount, 0, '界面：再次展开没有二级折叠入口')
  } finally {
    if (client) client.close()
    if (server) await server.close()
  }

  ctx.raw = {
    sessionId, batchId, messageId: res.json.messageId,
    ui: { dist: 'frontend/dist', staticServer: '临时空闲端口', apiBase },
  }
})

#!/usr/bin/env node
/**
 * AC-CONV-009-15（判据 CT-CONV-535 / TC-P1-CONV-051 / 产品 spec:365）
 * chain-3：取消上游后 30 秒内下游启动 0 次、保持 pending；反向请求的负例仍按原判据。
 * 取消确认：后端取消路径不新增消息行（tasks/conv.go 的 CancelScope 只改状态并 emit），
 * 会话里任务相关消息只有批量创建时写入的 1 条 category=task 卡片消息。因此「取消确认 1 条」
 * 按「该消息取消失后仍恰 1 条 + 卡片渲染出上游取消、下游未开始」取证，数量不为 1 即失败。
 * 消息行正文是后端固定文案「已创建 N 个任务」，不含任务名；任务名与取消结果体现在卡片
 * 行标题、预览和 data-status 上，脚本对这两处分别断言。
 */
import { runAc, createSession, createBatch, detail, graph, api, waitFor, sleep, queryRows } from './lib/conv-backend.mjs'
import { startDistServer, openConversation, readSummaryCard, waitFor as waitUi } from './lib/conversation-ui.mjs'

await runAc('AC-CONV-009-15', async (ctx) => {
  const sessionId = await createSession('AC-CONV-009-15 取消上游')
  const created = await createBatch(sessionId, {
    mode: 'plan', goal: '取消上游后，下游不得启动。', inputs: ['上游 mock:fail 任务会失败。'],
    constraints: ['下游只在上游 done 后启动。'],
    tasks: [
      { key: 'a', title: '上游：整理输入', mode: 'plan', goal: '整理输入。' },
      { key: 'b', title: '下游：合并结论', mode: 'plan', goal: '合并结论。', dependsOn: ['a'], joinMode: 'all' },
    ],
    clientMutationId: 'ac-conv-009-15',
  })
  ctx.eq(created.status, 201, '链创建 201')
  const upstream = created.json.tasks.find((t) => t.title === '上游：整理输入')
  const downstream = created.json.tasks.find((t) => t.title === '下游：合并结论')
  ctx.check(Boolean(upstream && downstream), '夹具：上下游任务各 1 条', '2 条', String(created.json.tasks.length))

  // 上游启动后取消整条链（此时下游仍在依赖等待）。
  await waitFor(async () => {
    const res = await detail(sessionId, upstream.id)
    return res.json && res.json.task && res.json.task.status === 'running' ? res : null
  }, { timeoutMs: 20000, label: '上游 running' })
  const cancelled = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${upstream.id}/cancel?scope=chain`, {})
  ctx.eq(cancelled.status, 200, '取消上游 200')
  ctx.eq(cancelled.json.changed, true, '取消 changed=true')
  ctx.check(Array.isArray(cancelled.json.cancelled) && cancelled.json.cancelled.length >= 1, 'cancelled 至少含上游', '>=1', cancelled.json.cancelled && cancelled.json.cancelled.length)
  ctx.eq(cancelled.json.task && cancelled.json.task.status, 'cancelled', '上游状态 cancelled')

  const firstDown = await detail(sessionId, downstream.id)
  ctx.eq(firstDown.json.task.status, 'pending', '取消后下游仍 pending')
  ctx.check(!firstDown.json.task.startedAt, '取消后下游 startedAt 为空（未开始）', '空', String(firstDown.json.task.startedAt))
  ctx.check(!firstDown.json.task.triggerCount, '取消后下游 triggerCount 为 0', '0', String(firstDown.json.task.triggerCount))
  ctx.eq(firstDown.json.task.waitingReason, 'dependency', '下游 waitingReason=dependency')

  // 30 秒窗口：下游不得启动。
  const started = []
  for (let i = 0; i < 30; i += 1) {
    const res = await detail(sessionId, downstream.id)
    const task = res.json && res.json.task
    if (task && (task.startedAt > 0 || task.status === 'running' || task.status === 'done')) started.push(`${i}s:${task.status}:${task.startedAt}`)
    await sleep(1000)
  }
  ctx.eq(started.length, 0, '30 秒内下游启动 0 次')
  const after = await detail(sessionId, downstream.id)
  ctx.eq(after.json.task.status, 'pending', '30 秒后下游仍 pending')
  ctx.check(!after.json.task.triggerCount, '30 秒后下游 triggerCount 仍为 0', '0', String(after.json.task.triggerCount))

  const g = await graph(sessionId)
  const edge = (g.json.edges || []).find((e) => e.from === upstream.id && e.to === downstream.id)
  ctx.check(Boolean(edge), '图上上下游连线仍在', '1 条边', String((g.json.edges || []).length))
  ctx.eq(edge && edge.style, 'dashed', '上游已取消时连线为虚线')
  const node = (g.json.nodes || []).find((n) => n.id === downstream.id)
  ctx.eq(node && node.displayStatus, 'pending', '图上 B 未开始（displayStatus=pending）')

  // ---- 取消确认：消息表 + 界面实查 ----
  const taskMsgs = queryRows("SELECT id, category, text, task_id, batch_id, internal FROM messages WHERE session_id = ? AND category = 'task'", [sessionId])
  ctx.eq(taskMsgs.length, 1, '取消后会话里取消确认消息恰 1 条（category=task）')
  const confirm = taskMsgs[0] || {}
  ctx.eq(confirm.batch_id, created.json.batchId, '取消确认消息 batch_id 等于本批 batchId')
  ctx.eq(confirm.task_id, upstream.id, '取消确认消息 task_id 指向被取消的上游任务')
  ctx.eq(confirm.text, '已创建 2 个任务', '取消确认消息正文记录本批 2 个任务，取消未追加第二条')
  const upDetail = await detail(sessionId, upstream.id)
  ctx.eq(upDetail.json.task.summary, '已取消', '取消结果正文为「已取消」')
  ctx.eq(upDetail.json.task.displayStatus ?? upDetail.json.displayStatus, 'failed', '上游展示状态为失败（cancelled → failed）')

  const apiBase = process.env.AC_CONV_BASE || 'http://127.0.0.1:8789'
  let server
  let client
  try {
    server = await startDistServer({ apiBase })
    client = await openConversation(sessionId, { url: server.url })
    await waitUi(client, `document.querySelector('.msg-task-summary') !== null`, { timeout: 20000, label: '会话里出现汇总卡' })
    await sleep(300)
    const card = await readSummaryCard(client)
    ctx.eq(card.cards, 1, '界面：取消后会话里只有 1 张任务汇总卡（取消确认 1 条）')
    ctx.eq(card.head, '已创建 2 个任务', '界面：汇总卡标题计数为「已创建 2 个任务」')
    ctx.eq(card.items, 2, '界面：汇总卡平铺 2 个任务行')
    ctx.eq(JSON.stringify(card.titles), JSON.stringify(['上游：整理输入', '下游：合并结论']), '界面：卡片正文含上游与下游任务标题')
    ctx.eq(card.preview, '上游：整理输入、下游：合并结论', '界面：预览正文记录两条任务名')
    const upIndex = card.ids.indexOf(upstream.id)
    const downIndex = card.ids.indexOf(downstream.id)
    ctx.check(upIndex >= 0 && downIndex >= 0, '界面：卡片行携带上下游 task id', '2 个', JSON.stringify(card.ids))
    ctx.eq(card.statuses[upIndex], 'failed', '界面：上游行展示取消结果（data-status=failed）')
    ctx.eq(card.statuses[downIndex], 'pending', '界面：下游行保持未开始（data-status=pending）')
  } finally {
    if (client) client.close()
    if (server) await server.close()
  }

  const badScope = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${downstream.id}/cancel?scope=bogus`, {})
  ctx.eq(badScope.status, 400, 'scope=bogus 返回 400')
  ctx.eq(badScope.json && badScope.json.code, 'invalid_argument', 'scope 非法失败码 invalid_argument')

  const other = await createSession('AC-CONV-009-15 跨会话')
  const cross = await api('POST', `/api/sessions/${encodeURIComponent(other)}/tasks/${downstream.id}/cancel?scope=self`, {})
  ctx.eq(cross.status, 404, '跨会话取消 404')
  ctx.eq(cross.json && cross.json.code, 'task_not_found', '跨会话取消失败码 task_not_found')

  ctx.raw = {
    sessionId, upstreamId: upstream.id, downstreamId: downstream.id,
    observationWindowSeconds: 30, startedObservations: started,
    confirmMsgId: confirm.id,
    note: '后端取消路径不新增 messages 行；取消确认按「取消失后 category=task 仍恰 1 条 + 卡片渲染 failed/pending」取证；消息行文案固定为「已创建 N 个任务」不含任务名，任务名与取消结果在卡片行标题、预览与 data-status 上断言',
  }
})

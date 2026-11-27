// AC-TASK-003-01：对话发起复杂请求先出方案卡，确认前不建任务；断言 22 条。
// 夹具见 lib/fixtures/task-003.mjs。
import { runAc, createSession, list, api } from './lib/conv-backend.mjs'
import { messages, findReply, waitCard, countSession } from './lib/fixtures/task-003.mjs'

const REQUEST = '请把导出功能做完：1. 梳理现有导出链路 2. 设计新的导出接口 3. 实现并补单元测试'

await runAc('AC-TASK-003-01', async (ctx) => {
  const sessionId = await createSession('AC-TASK-003-01 对话方案确认')
  const t0 = Date.now()
  const chat = await api('POST', '/api/chat', { sessionId, text: REQUEST, clientMutationId: `ac-003-01-chat-${Date.now()}` })
  const chatMs = Date.now() - t0

  ctx.check(chat.status === 200 || chat.status === 202, '复杂请求返回 2xx（200/202）', '200 或 202', chat.status)
  ctx.check(chatMs < 5000, '对话请求在 5 秒内返回', '<5000ms', `${chatMs}ms`)
  ctx.check(Boolean(chat.json && (chat.json.messageId || chat.json.id)), '对话响应含用户消息 id', 'messageId', JSON.stringify(chat.json).slice(0, 200))

  const initial = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  ctx.eq(initial.status, 200, '读取会话消息返回 200')
  const card = await waitCard(sessionId)
  ctx.check(Boolean(card), '对话回合落一张 category=confirmation 的方案卡', 'confirmation+taskPlan', JSON.stringify(card && card.category))
  ctx.check(card?.taskPlan?.status === 'pending', '方案卡状态为 pending', 'pending', card?.taskPlan?.status)
  ctx.check(card?.taskPlan?.complexity === 'C2', '3 步请求判为 C2', 'C2', card?.taskPlan?.complexity)
  const planId = card?.taskPlan?.id
  ctx.check(Boolean(planId), '方案卡带 planId', 'planId', planId)

  const before = countSession(sessionId)
  ctx.check(before.tasks === 0, '确认前 tasks 表无新行', '0', before.tasks)
  ctx.check(before.children === 0, '确认前 sessions 无子会话', '0', before.children)
  ctx.check(before.artifacts === 0, '确认前无产物', '0', before.artifacts)

  const beforeList = await list(sessionId, '?limit=50')
  ctx.eq(beforeList.status, 200, '确认前任务列表返回 200')
  ctx.check(((beforeList.json && beforeList.json.tasks) || []).length === 0, '确认前任务列表为空（未走创建接口）', '0 条', JSON.stringify(((beforeList.json && beforeList.json.tasks) || []).map((item) => item.id)))

  const reply = findReply(await messages(sessionId))
  ctx.check(Boolean(reply), '助手说明指向确认入口', '含“确认前”', String(reply?.text || '').slice(0, 120))

  const confirm = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans/${encodeURIComponent(planId)}/confirm`, {})
  ctx.eq(confirm.status, 200, '确认方案返回 200')
  ctx.check(confirm.json?.plan?.status === 'confirmed', '确认后方案状态为 confirmed', 'confirmed', confirm.json?.plan?.status)
  const after = countSession(sessionId)
  ctx.check(after.tasks === 1, '确认后当前会话 1 条任务', '1', after.tasks)
  ctx.check(after.c2 === 1, '确认后任务记录复杂度 C2', '1', after.c2)
  ctx.check(after.children === 0, 'C2 确认后不建子会话', '0', after.children)

  const afterList = await list(sessionId, '?limit=50')
  ctx.eq(afterList.status, 200, '确认后任务列表返回 200')
  const tasks = (afterList.json && afterList.json.tasks) || []
  ctx.check(tasks.length === 1 && tasks[0]?.complexity === 'C2', '确认后任务出现在列表且为 C2', '1 条 C2', JSON.stringify(tasks.map((item) => ({ id: item.id, complexity: item.complexity, status: item.status }))))
  const taskStatus = tasks[0]?.status
  ctx.check(taskStatus === 'queued' || taskStatus === 'running', '确认后任务状态为 queued 或 running', 'queued|running', taskStatus)
  ctx.check(after.active === 1, '库内任务状态为 queued 或 running', '1', after.active)
  const cardText = String(card?.text || '')
  ctx.check(cardText.includes('判定依据'), '方案卡正文含判定依据（DEC-43）', '判定依据', cardText.slice(0, 160))
  ctx.check(cardText.includes('行内编号'), '判定依据写明步骤来源为行内编号', '行内编号', cardText.slice(0, 160))

  ctx.raw = { sessionId, planId, chatMs, chatStatus: chat.status, planStatus: card?.taskPlan?.status, beforeTaskRows: 0, taskStatus }
})

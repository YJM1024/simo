#!/usr/bin/env node
/**
 * AC-TASK-003-01：对话发起复杂请求先出方案卡，确认前不建任务
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-003-01，DEC-39。
 * 前置：隔离后端以 mock 模型运行；复杂请求由 /api/chat 发起，走复杂度判定与方案落卡。
 * 断言点：
 *   1) 复杂请求的 POST /api/chat 在 5 秒内返回 202（异步受理，不阻塞会话）；
 *   2) 对话回合在父会话消息流里落一张 category=confirmation 的方案卡（taskPlan 投影）；
 *   3) 方案为 pending、等级 C2，确认前 tasks 表无新行、sessions 无子会话、无产物；
 *   4) 确认前任务列表为空，说明没有走任务创建接口；
 *   5) 助手说明指向卡片上的确认入口；
 *   6) 确认返回 200，方案转 confirmed；
 *   7) 确认后当前会话 1 条 C2 任务且出现在任务列表，状态为 queued 或 running，C2 不建子会话；
 *   8) 方案卡正文带判定依据，理由写明步骤来源为行内编号（DEC-43）。
 * 夹具与清理：createSession 建会话，数据留在隔离库。
 */
import { runAc, createSession, list, api, waitFor, queryRows } from './lib/conv-backend.mjs'

const REQUEST = '请把导出功能做完：1. 梳理现有导出链路 2. 设计新的导出接口 3. 实现并补单元测试'
const count = (sql, ...params) => Number((queryRows(sql, params)[0] || {}).n || 0)

await runAc('AC-TASK-003-01', async (ctx) => {
  const sessionId = await createSession('AC-TASK-003-01 对话方案确认')
  const t0 = Date.now()
  const chat = await api('POST', '/api/chat', {
    sessionId,
    text: REQUEST,
    clientMutationId: `ac-003-01-chat-${Date.now()}`,
  })
  const chatMs = Date.now() - t0

  ctx.check(chat.status === 200 || chat.status === 202, '复杂请求返回 2xx（200/202）', '200 或 202', chat.status)
  ctx.check(chatMs < 5000, '对话请求在 5 秒内返回', '<5000ms', `${chatMs}ms`)
  ctx.check(Boolean(chat.json && (chat.json.messageId || chat.json.id)), '对话响应含用户消息 id', 'messageId', JSON.stringify(chat.json).slice(0, 200))

  const messages = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  ctx.eq(messages.status, 200, '读取会话消息返回 200')
  const card = await waitFor(async () => {
    const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
    const items = (res.json && res.json.messages) || []
    return items.find((item) => item.category === 'confirmation' && item.taskPlan) || null
  }, { timeoutMs: 8000, intervalMs: 200, label: '方案卡消息' })

  ctx.check(Boolean(card), '对话回合落一张 category=confirmation 的方案卡', 'confirmation+taskPlan', JSON.stringify(card && card.category))
  ctx.check(Boolean(card && card.taskPlan && card.taskPlan.status === 'pending'), '方案卡状态为 pending', 'pending', card && card.taskPlan && card.taskPlan.status)
  ctx.check(Boolean(card && card.taskPlan && card.taskPlan.complexity === 'C2'), '3 步请求判为 C2', 'C2', card && card.taskPlan && card.taskPlan.complexity)
  const planId = card && card.taskPlan && card.taskPlan.id
  ctx.check(Boolean(planId), '方案卡带 planId', 'planId', planId)

  ctx.check(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=?', sessionId) === 0, '确认前 tasks 表无新行', '0', count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=?', sessionId))
  ctx.check(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id=?', sessionId) === 0, '确认前 sessions 无子会话', '0', count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id=?', sessionId))
  ctx.check(count('SELECT COUNT(*) AS n FROM task_artifacts WHERE task_id IN (SELECT id FROM tasks WHERE session_id=?)', sessionId) === 0, '确认前无产物', '0', count('SELECT COUNT(*) AS n FROM task_artifacts WHERE task_id IN (SELECT id FROM tasks WHERE session_id=?)', sessionId))

  const beforeList = await list(sessionId, '?limit=50')
  ctx.eq(beforeList.status, 200, '确认前任务列表返回 200')
  ctx.check(((beforeList.json && beforeList.json.tasks) || []).length === 0, '确认前任务列表为空（未走创建接口）', '0 条', JSON.stringify(((beforeList.json && beforeList.json.tasks) || []).map((item) => item.id)))

  const reply = await waitFor(async () => {
    const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
    const items = (res.json && res.json.messages) || []
    return items.find((item) => item.role === 'agent' && item.category === 'progress' && String(item.text || '').includes('确认前')) || null
  }, { timeoutMs: 5000, intervalMs: 200, label: '方案说明消息' })
  ctx.check(Boolean(reply), '助手说明指向确认入口', '含“确认前”', reply && String(reply.text || '').slice(0, 120))

  const confirm = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans/${encodeURIComponent(planId)}/confirm`, {})
  ctx.eq(confirm.status, 200, '确认方案返回 200')
  ctx.check(Boolean(confirm.json && confirm.json.plan && confirm.json.plan.status === 'confirmed'), '确认后方案状态为 confirmed', 'confirmed', confirm.json && confirm.json.plan && confirm.json.plan.status)
  ctx.check(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=?', sessionId) === 1, '确认后当前会话 1 条任务', '1', count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=?', sessionId))
  ctx.check(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=? AND complexity=?', sessionId, 'C2') === 1, '确认后任务记录复杂度 C2', '1', count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=? AND complexity=?', sessionId, 'C2'))
  ctx.check(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id=?', sessionId) === 0, 'C2 确认后不建子会话', '0', count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id=?', sessionId))

  const afterList = await list(sessionId, '?limit=50')
  ctx.eq(afterList.status, 200, '确认后任务列表返回 200')
  const tasks = (afterList.json && afterList.json.tasks) || []
  ctx.check(tasks.length === 1 && tasks[0] && tasks[0].complexity === 'C2', '确认后任务出现在列表且为 C2', '1 条 C2', JSON.stringify(tasks.map((item) => ({ id: item.id, complexity: item.complexity, status: item.status }))))
  const taskStatus = tasks[0] && tasks[0].status
  ctx.check(taskStatus === 'queued' || taskStatus === 'running', '确认后任务状态为 queued 或 running', 'queued|running', taskStatus)
  ctx.check(count("SELECT COUNT(*) AS n FROM tasks WHERE session_id=? AND status IN ('queued','running')", sessionId) === 1, '库内任务状态为 queued 或 running', '1', count("SELECT COUNT(*) AS n FROM tasks WHERE session_id=? AND status IN ('queued','running')", sessionId))
  const cardText = String((card && card.text) || '')
  ctx.check(cardText.includes('判定依据'), '方案卡正文含判定依据（DEC-43）', '判定依据', cardText.slice(0, 160))
  ctx.check(cardText.includes('行内编号'), '判定依据写明步骤来源为行内编号', '行内编号', cardText.slice(0, 160))

  ctx.raw = {
    sessionId,
    planId,
    chatMs,
    chatStatus: chat.status,
    planStatus: card && card.taskPlan && card.taskPlan.status,
    beforeTaskRows: 0,
    taskStatus: tasks[0] && tasks[0].status,
  }
})

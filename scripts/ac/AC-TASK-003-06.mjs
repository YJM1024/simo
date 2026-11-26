#!/usr/bin/env node
/**
 * AC-TASK-003-06：C0/C1 轻量请求直接回答，不建任务、不出方案卡（DEC-43）
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-003-06，docs/task-complexity.md 的 C0/C1 行为。
 * 前置：隔离后端以 mock 模型运行；两条请求都经对话入口的 DELEGATE 判定与复杂度分级。
 * 断言点：
 *   1) C0 请求：无编号、无顺序词的单句完成型，回合正常结束并给出助手回复；
 *   2) C0 请求后 tasks 0 条、confirmation 方案卡 0 张、无子会话；
 *   3) C1 请求：只有两步且带编号，回合正常结束并给出助手回复；
 *   4) C1 请求后 tasks 仍 0 条、方案卡仍 0 张、无子会话；
 *   5) complexity_classified 事件各 1 条，payload 带等级与判定理由，理由说明步骤来源。
 * 夹具与清理：createSession 建会话，数据留在隔离库。
 */
import { runAc, createSession, list, api, waitFor, queryRows } from './lib/conv-backend.mjs'

const C0_REQUEST = '把当前的配置导出成一份 json 文件'
const C1_REQUEST = '请整理一份周报：1. 汇总本周进展 2. 列出下周计划'
const count = (sql, ...params) => Number((queryRows(sql, params)[0] || {}).n || 0)

function classifiedEvents(sessionId) {
  const rows = queryRows("SELECT payload FROM events WHERE type = 'complexity_classified' ORDER BY id")
  const out = []
  for (const row of rows) {
    let payload
    try { payload = JSON.parse(row.payload) } catch { continue }
    if (payload.session_id !== sessionId) continue
    out.push(payload)
  }
  return out
}

async function agentReplies(sessionId) {
  const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  const items = (res.json && res.json.messages) || []
  return items.filter((item) => item.role === 'agent' && item.status === 'done' && String(item.text || '').trim() !== '')
}

async function sendTurn(ctx, sessionId, text, label) {
  const startedAt = Date.now()
  const chat = await api('POST', '/api/chat', {
    sessionId,
    text,
    clientMutationId: `ac-003-06-${label}-${Date.now()}`,
  })
  const elapsed = Date.now() - startedAt
  ctx.check(chat.status === 200 || chat.status === 202, `${label} 请求返回 2xx`, '200 或 202', chat.status)
  ctx.check(elapsed < 5000, `${label} 请求在 5 秒内返回`, '<5000ms', `${elapsed}ms`)
  return chat
}

await runAc('AC-TASK-003-06', async (ctx) => {
  const sessionId = await createSession('AC-TASK-003-06 C0/C1 直接回答')

  const c0Chat = await sendTurn(ctx, sessionId, C0_REQUEST, 'C0')
  const c0Reply = await waitFor(async () => {
    const replies = await agentReplies(sessionId)
    return replies.length > 0 ? replies[replies.length - 1] : null
  }, { timeoutMs: 8000, intervalMs: 200, label: 'C0 助手回复' })
  ctx.check(Boolean(c0Reply), 'C0 回合给出助手回复', '1 条 done 回复', c0Reply && String(c0Reply.text || '').slice(0, 120))

  ctx.check(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId) === 0, 'C0 请求后 tasks 0 条', '0', count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId))
  ctx.check(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND category = 'confirmation'", sessionId) === 0, 'C0 请求不出方案卡', '0 张', count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND category = 'confirmation'", sessionId))
  const c0Events = classifiedEvents(sessionId)
  ctx.eq(c0Events.length, 1, 'C0 请求发 1 条 complexity_classified 事件')
  ctx.eq(c0Events[0] && c0Events[0].complexity, 'C0', 'C0 请求判为 C0')
  ctx.check(Boolean(c0Events[0] && String(c0Events[0].reason || '').includes('判定 C0')), 'C0 事件带判定理由', '含“判定 C0”', c0Events[0] && String(c0Events[0].reason || '').slice(0, 160))
  ctx.eq(c0Events[0] && c0Events[0].step_source, 'none', 'C0 理由写明步骤来源为无编号或顺序词')

  const c1Chat = await sendTurn(ctx, sessionId, C1_REQUEST, 'C1')
  const c1Reply = await waitFor(async () => {
    const replies = await agentReplies(sessionId)
    return replies.length > 1 ? replies[replies.length - 1] : null
  }, { timeoutMs: 8000, intervalMs: 200, label: 'C1 助手回复' })
  ctx.check(Boolean(c1Reply), 'C1 回合给出助手回复', '2 条 done 回复', c1Reply && String(c1Reply.text || '').slice(0, 120))

  ctx.check(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId) === 0, 'C1 请求后 tasks 仍 0 条', '0', count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId))
  ctx.check(count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND category = 'confirmation'", sessionId) === 0, 'C1 请求不出方案卡', '0 张', count("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND category = 'confirmation'", sessionId))
  const c1Events = classifiedEvents(sessionId)
  ctx.eq(c1Events.length, 2, 'C1 请求后共 2 条 complexity_classified 事件')
  const latest = c1Events[c1Events.length - 1]
  ctx.eq(latest && latest.complexity, 'C1', '两步编号请求判为 C1')
  ctx.check(Boolean(latest && String(latest.reason || '').includes('判定 C1')), 'C1 事件带判定理由', '含“判定 C1”', latest && String(latest.reason || '').slice(0, 160))
  ctx.eq(latest && latest.step_source, 'inline_numbers', 'C1 理由写明步骤来源为行内编号')
  ctx.check(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessionId) === 0, '两次请求都不建子会话', '0', count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessionId))

  const taskList = await list(sessionId, '?limit=50')
  ctx.eq(taskList.status, 200, '任务列表返回 200')
  ctx.check(((taskList.json && taskList.json.tasks) || []).length === 0, '任务列表为空', '0 条', JSON.stringify(((taskList.json && taskList.json.tasks) || []).map((item) => item.id)))

  ctx.raw = {
    sessionId,
    c0Request: C0_REQUEST,
    c1Request: C1_REQUEST,
    c0Complexity: c0Events[0] && c0Events[0].complexity,
    c0Reason: c0Events[0] && c0Events[0].reason,
    c1Complexity: latest && latest.complexity,
    c1Reason: latest && latest.reason,
    tasks: 0,
    confirmations: 0,
  }
})

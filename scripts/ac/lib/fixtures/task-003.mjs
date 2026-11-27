// AC-TASK-003 对话方案卡场景的夹具：消息读取、卡片/回复定位、库内计数。
import { api, queryRows } from '../conv-backend.mjs'

export async function messages(sessionId) {
  const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  return (res.json && res.json.messages) || []
}

export function findCard(items) {
  return items.find((item) => item.category === 'confirmation' && item.taskPlan) || null
}

export function findReply(items) {
  return items.find((item) => item.role === 'agent' && item.category === 'progress' && String(item.text || '').includes('确认前')) || null
}

export async function waitCard(sessionId, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const card = findCard(await messages(sessionId))
    if (card) return card
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

export function count(sql, ...params) {
  return Number((queryRows(sql, params)[0] || {}).n || 0)
}

export function countSession(sessionId) {
  return {
    tasks: count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=?', sessionId),
    children: count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id=?', sessionId),
    artifacts: count('SELECT COUNT(*) AS n FROM task_artifacts WHERE task_id IN (SELECT id FROM tasks WHERE session_id=?)', sessionId),
    c2: count('SELECT COUNT(*) AS n FROM tasks WHERE session_id=? AND complexity=?', sessionId, 'C2'),
    active: count("SELECT COUNT(*) AS n FROM tasks WHERE session_id=? AND status IN ('queued','running')", sessionId),
  }
}

// scripts/ac/lib/task-006.mjs
// AC-TASK-006 公共夹具：预算、取消、重试、恢复四条链路的建任务与直改库辅助。
// 口径：任务行与步骤的真相都在 tasks 表（steps 为 JSON），执行器用 Mock 模型（无工具调用，一步即收尾）。
import { createBatch, execDb, queryRows, waitFor, sleep } from './conv-backend.mjs'

const COLUMNS = {
  status: 'status',
  attempt: 'attempt',
  progress: 'progress',
  summary: 'summary',
  outcome: 'outcome',
  waitingReason: 'waiting_reason',
  endMessageId: 'end_message_id',
  reportMessageId: 'report_message_id',
  budgetJSON: 'budget_json',
  steps: 'steps',
  updatedAt: 'updated_at',
}

export async function seedTask(sessionId, { title = 'AC6-任务', steps = ['第一步', '第二步', '第三步'], dependsOn = [], key = 'ac6' } = {}) {
  const res = await createBatch(sessionId, {
    mode: 'plan',
    goal: `${title}的目标`,
    tasks: [{ key, title, mode: 'plan', goal: `${title}的目标`, steps, dependsOn }],
  })
  if (res.status !== 201) throw new Error(`建任务失败: ${res.status} ${res.text.slice(0, 200)}`)
  const list = (res.json && res.json.tasks) || []
  if (!list.length) throw new Error('建任务响应缺少 tasks[0].id')
  return list[0].id
}

// 等执行器把手上的任务跑到终态或等待态，再改库，避免被后台写入覆盖。
export async function settle(sessionId) {
  await waitFor(() => queryRows(`SELECT COUNT(*) AS n FROM tasks WHERE session_id = ? AND status IN ('queued','running')`, [sessionId])[0].n === 0, {
    timeoutMs: 30000, label: '本会话任务离开运行态',
  })
  await sleep(300)
}

export function taskRow(id) {
  return queryRows(`SELECT id, session_id, status, attempt, progress, summary, outcome, waiting_reason,
    budget_json, steps, updated_at, end_message_id, report_message_id FROM tasks WHERE id = ?`, [id])[0]
}

export function stepStates(id) {
  const row = taskRow(id)
  if (!row || !row.steps) return []
  try {
    return JSON.parse(row.steps).map((s) => ({ id: s.id, seq: s.seq, title: s.title, status: s.status }))
  } catch {
    return []
  }
}

/** 直接改任务行（只为构造夹具）：字段名用 COLUMNS 的驼峰键，值原样写入。 */
export function setTask(id, patch) {
  const sets = []
  const params = []
  for (const [key, value] of Object.entries(patch)) {
    const column = COLUMNS[key]
    if (!column) throw new Error(`setTask 不支持的字段: ${key}`)
    sets.push(`${column} = ?`)
    params.push(value)
  }
  if (!sets.length) return
  execDb(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
}

/** 把步骤状态按 mutate 回调就地改写后写回 tasks.steps。 */
export function setSteps(id, mutate) {
  const row = taskRow(id)
  const steps = JSON.parse(row.steps || '[]')
  mutate(steps)
  setTask(id, { steps: JSON.stringify(steps) })
}

export function artifactsOf(id) {
  return queryRows('SELECT id, name FROM task_artifacts WHERE task_id = ? ORDER BY id', [id])
}

/** task.updated 事件按 payload 顶层 id 归属（taskEvent 用 id，不是 taskId）。 */
export function countTaskUpdated(id) {
  return queryRows(`SELECT COUNT(*) AS n FROM events WHERE type = 'task.updated' AND payload LIKE ?`, [`%"id":"${id}"%`])[0].n
}

/**
 * 只数“状态迁移”事件：taskEvent 给步骤级事件带 "step" 键，迁移事件不带。
 * 重启恢复的判据是恢复过程本身不重复派发、只发一条 running 迁移，步骤推进事件属于正常执行。
 */
export function countTaskTransitions(id) {
  return queryRows(
    `SELECT COUNT(*) AS n FROM events WHERE type = 'task.updated' AND payload LIKE ? AND payload LIKE '%"displayStatus":"running"%' AND payload NOT LIKE '%"step":%'`,
    [`%"id":"${id}"%`],
  )[0].n
}

export function countMessages(taskId) {
  return queryRows('SELECT COUNT(*) AS n FROM messages WHERE task_id = ?', [taskId])[0].n
}

export function countArtifacts(taskId) {
  return queryRows('SELECT COUNT(*) AS n FROM task_artifacts WHERE task_id = ?', [taskId])[0].n
}

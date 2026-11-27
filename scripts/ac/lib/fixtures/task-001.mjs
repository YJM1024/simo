// AC-TASK-001 概览/分页场景的夹具：建任务、钉状态、克隆到 55 条、读 DOM 行与卡片。
import {
  createSession, createBatch, detail, list, execDb, queryRows, sleep,
} from '../conv-backend.mjs'

const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])

export async function settle(sessionId, ids) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const res = await list(sessionId, '?limit=100')
    const byId = new Map((res.json?.tasks || []).map((t) => [t.id, t.status]))
    const pending = ids.filter((id) => !TERMINAL.has(byId.get(id))).length
    if (pending === 0) return
    await sleep(200)
  }
  throw new Error('任务未在 60s 内进入终态')
}

export async function seed(title, taskTitles) {
  const sessionId = await createSession(title)
  const batch = await createBatch(sessionId, {
    mode: 'plan',
    goal: title,
    tasks: taskTitles.map((t, i) => ({ key: `t${i + 1}`, title: t, mode: 'plan', goal: t })),
    clientMutationId: `ac-001-01-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  })
  const ids = (batch.json.tasks || []).map((t) => t.id)
  const batchId = batch.json.batch?.id || ''
  await settle(sessionId, ids)
  return { sessionId, ids, batchId }
}

export async function pinTask(sessionId, taskId, status, progress) {
  execDb('UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?', [status, progress, Date.now(), taskId])
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const r = await detail(sessionId, taskId)
    if (r.json?.task?.status === status && Number(r.json?.task?.progress) === progress) return
    await sleep(150)
  }
  throw new Error(`任务 ${taskId} 未能固定到 ${status}/${progress}`)
}

export function cloneTasks(sourceId, total) {
  const cols = queryRows('PRAGMA table_info(tasks)').map((c) => c.name).filter((c) => c !== 'id')
  const colList = cols.join(', ')
  const insert = `INSERT INTO tasks (id, ${colList}) SELECT ?, ${colList} FROM tasks WHERE id = ?`
  const base = Date.now()
  for (let i = 2; i <= total; i += 1) {
    const id = `fx-00101-${i}-${base}`
    execDb(insert, [id, sourceId])
    execDb(
      "UPDATE tasks SET title = ?, status = 'done', progress = 100, updated_at = ?, created_at = ? WHERE id = ?",
      [`分页任务 ${String(i).padStart(2, '0')}`, base + i, base + i, id],
    )
  }
}

export function projectionItems(json) {
  const tasks = json?.tasks || {}
  // 与右栏概览一致：running → pending → done 依次拼接。
  return [...(tasks.running?.items || []), ...(tasks.pending?.items || []), ...(tasks.done?.items || [])]
}

export async function rowsOf(client) {
  return client.evaluate(`(() => Array.from(document.querySelectorAll('#insp-block-tasks .exec-row')).map((el) => {
    const title = el.querySelector('.exec-title')?.textContent?.trim() || ''
    const status = el.querySelector('.exec-time')?.textContent?.trim() || ''
    return { id: el.getAttribute('data-task-id') || '', title, status }
  }))()`)
}

export async function cardTitles(client) {
  return client.evaluate(`(() => Array.from(document.querySelectorAll('.task-card')).map((el) => el.querySelector('.task-card-title')?.textContent?.trim() || ''))()`)
}

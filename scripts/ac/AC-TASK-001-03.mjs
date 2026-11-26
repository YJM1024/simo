#!/usr/bin/env node
/**
 * AC-TASK-001-03：8 种任务状态封闭
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-001-03
 * 前置：隔离后端以 mock 模型运行；frontend/dist 已构建。
 * 断言点：
 *   1) 接口返回的 status 只落在 pending/blocked/queued/running/done/failed/cancelled/interrupted 八值内；
 *   2) 八条任务按八种状态落库后，列表接口能读回全部八值；
 *   3) 任务标签页 DOM 的状态文案去重后正好 8 个，两两不同且非空。
 * 夹具与清理：createSession + createBatch 建 8 条任务（单批上限内），逐条落库改状态；数据留在隔离库。
 */
import { runAc, createSession, createBatch, list, detail, execDb, waitFor, sleep, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, clickSel, count } from './lib/task-ui-helpers.mjs'

const STATUSES = ['pending', 'blocked', 'queued', 'running', 'done', 'failed', 'cancelled', 'interrupted']
const PROGRESS = { pending: 0, blocked: 0, queued: 0, running: 40, done: 100, failed: 60, cancelled: 20, interrupted: 80 }
const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])

async function settle(sessionId) {
  try {
    await waitFor(async () => {
      const res = await list(sessionId, '?limit=50')
      if (res.status !== 200) return false
      const tasks = (res.json && res.json.tasks) || []
      return tasks.length > 0 && tasks.every((t) => TERMINAL.has(t.status))
    }, { timeoutMs: 25000, intervalMs: 300, label: '任务批次进入终态' })
  } catch { /* 仍按落库状态做夹具 */ }
}

async function pinTask(sessionId, id, status) {
  const progress = PROGRESS[status]
  let task = null
  for (let i = 0; i < 3; i += 1) {
    execDb('UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?', [status, progress, Date.now(), id])
    await sleep(100)
    const res = await detail(sessionId, id)
    task = res.json && res.json.task
    if (task && task.status === status) return task
  }
  return task
}

await runAc('AC-TASK-001-03', async (ctx) => {
  const sessionId = await createSession('AC-TASK-001-03 八状态封闭')
  const titles = STATUSES.map((status) => `状态样本：${status}`)
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证八种任务状态。',
    tasks: titles.map((title, i) => ({ key: `t${i + 1}`, title, mode: 'plan', goal: title })),
    clientMutationId: `ac-001-03-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建 8 条任务返回 201')
  const ids = (created.json && created.json.tasks ? created.json.tasks : []).map((t) => t.id)
  ctx.eq(ids.length, 8, '创建响应含 8 条任务')

  await settle(sessionId)
  for (let i = 0; i < STATUSES.length; i += 1) {
    await pinTask(sessionId, ids[i], STATUSES[i])
  }

  const all = await list(sessionId, '?limit=50')
  ctx.eq(all.status, 200, '任务列表返回 200')
  const tasks = (all.json && all.json.tasks) || []
  ctx.eq(tasks.length, 8, '列表返回 8 条任务')
  ctx.check(tasks.every((task) => STATUSES.includes(task.status)), '列表 status 全部落在八值封闭集内', JSON.stringify(STATUSES), JSON.stringify(tasks.map((task) => task.status)))
  const apiStatuses = Array.from(new Set(tasks.map((task) => task.status))).sort()
  ctx.check(JSON.stringify(apiStatuses) === JSON.stringify([...STATUSES].sort()), '八种状态在接口中全部出现', JSON.stringify([...STATUSES].sort()), JSON.stringify(apiStatuses))

  const server = await startDistServer({ apiBase: BASE })
  let client
  try {
    client = await openConversation(sessionId, { url: server.url })
    await clickSel(client, '.insp-rail button[data-tab="tasks"]')
    await uiWaitFor(client, `document.querySelectorAll('#task-list .task-card').length === 8`, {
      timeout: 10000,
      label: '任务标签页出现 8 张卡片',
    })
    const labels = await client.evaluate(`Array.from(document.querySelectorAll('#task-list .task-card .task-status')).map((el) => (el.textContent || '').trim()).filter((value) => value.length > 0)`)
    const unique = Array.from(new Set(labels)).sort()
    ctx.eq(await count(client, '#task-list .task-card'), 8, 'DOM 任务卡片 8 张')
    ctx.check(labels.every((label) => label.length > 0), '每张卡片都有状态文案', '非空文案', JSON.stringify(labels))
    ctx.eq(unique.length, 8, 'DOM 状态文案去重后为 8 个')
    ctx.check(JSON.stringify(unique) === JSON.stringify([...new Set(labels)].sort()) && new Set(labels).size === labels.length, '八种状态文案两两不同', '8 个互不相同', JSON.stringify(labels))

    ctx.raw = { sessionId, ids, apiStatuses, domLabels: labels, domUnique: unique }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

#!/usr/bin/env node
/**
 * AC-TASK-001-02：任务详情五字段
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-001-02
 * 前置：隔离后端以 mock 模型运行；frontend/dist 已构建。
 * 断言点：
 *   1) GET /api/tasks/T?sessionId=S 返回 200 且 ok=true，task 含 id/title/status/progress/attempt 五字段；
 *   2) 点击任务卡打开详情面板，面板标题等于任务标题，状态文案与状态一致，含进度数值与尝试次数。
 * 夹具与清理：createSession + createBatch 建 1 条任务，落库置 done/100/attempt=2；数据留在隔离库。
 */
import { runAc, createSession, createBatch, api, detail, list, execDb, waitFor, sleep, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, text, clickSel, count } from './lib/task-ui-helpers.mjs'

const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])
const TITLE = '五字段校验任务'

async function settle(sessionId) {
  try {
    await waitFor(async () => {
      const res = await list(sessionId, '?limit=50')
      if (res.status !== 200) return false
      const tasks = (res.json && res.json.tasks) || []
      return tasks.length > 0 && tasks.every((t) => TERMINAL.has(t.status))
    }, { timeoutMs: 20000, intervalMs: 300, label: '任务批次进入终态' })
  } catch { /* 仍按落库状态做夹具 */ }
}

async function pinTask(sessionId, id, status, progress, attempt) {
  let task = null
  for (let i = 0; i < 3; i += 1) {
    execDb('UPDATE tasks SET status = ?, progress = ?, attempt = ?, updated_at = ? WHERE id = ?', [status, progress, attempt, Date.now(), id])
    await sleep(120)
    const res = await detail(sessionId, id)
    task = res.json && res.json.task
    if (task && task.status === status && task.progress === progress && task.attempt === attempt) return task
  }
  return task
}

await runAc('AC-TASK-001-02', async (ctx) => {
  const sessionId = await createSession('AC-TASK-001-02 详情五字段')
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证任务详情五字段。',
    tasks: [{ key: 't1', title: TITLE, mode: 'plan', goal: '输出五字段。' }],
    clientMutationId: `ac-001-02-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建任务返回 201')
  const taskId = created.json && created.json.tasks && created.json.tasks[0] && created.json.tasks[0].id
  ctx.check(Boolean(taskId), '创建响应含任务 id', '非空 task id', JSON.stringify(taskId))

  await settle(sessionId)
  const pinned = await pinTask(sessionId, taskId, 'done', 100, 2)
  ctx.eq(pinned && pinned.status, 'done', '夹具任务状态为 done')

  const legacy = await api('GET', `/api/tasks/${encodeURIComponent(taskId)}?sessionId=${encodeURIComponent(sessionId)}`)
  ctx.eq(legacy.status, 200, '旧路由带 sessionId 返回 200')
  const body = legacy.json || {}
  ctx.eq(body.ok, true, '旧路由响应 ok=true')
  const task = body.task || {}
  for (const key of ['id', 'title', 'status', 'progress', 'attempt']) {
    ctx.check(Object.prototype.hasOwnProperty.call(task, key), `task 含字段 ${key}`, `字段 ${key}`, JSON.stringify(Object.keys(task)))
  }
  ctx.eq(task.id, taskId, 'task.id 与请求一致')
  ctx.eq(task.title, TITLE, 'task.title 与创建一致')
  ctx.eq(task.status, 'done', 'task.status=done')
  ctx.eq(task.progress, 100, 'task.progress=100')
  ctx.eq(task.attempt, 2, 'task.attempt=2')

  const server = await startDistServer({ apiBase: BASE })
  let client
  try {
    client = await openConversation(sessionId, { url: server.url })
    await clickSel(client, '.insp-rail button[data-tab="tasks"]')
    await uiWaitFor(client, `document.querySelector('.task-card[data-task-id="${taskId}"]') !== null`, {
      timeout: 10000,
      label: '任务卡片出现',
    })
    await clickSel(client, `.task-card[data-task-id="${taskId}"]`)
    await uiWaitFor(client, `document.querySelector('.task-detail[data-task-id="${taskId}"]') !== null`, {
      timeout: 10000,
      label: '任务详情面板打开',
    })
    const panelTitle = await text(client, `.task-detail[data-task-id="${taskId}"] .task-detail-title`)
    const panelText = await text(client, `.task-detail[data-task-id="${taskId}"]`)
    ctx.eq((panelTitle || '').trim(), TITLE, '详情面板标题等于任务标题')
    ctx.check(panelText.includes('已完成'), '详情面板状态文案为已完成', '包含「已完成」', panelText.slice(0, 300))
    ctx.check(panelText.includes('100%'), '详情面板含进度数值 100%', '包含「100%」', panelText.slice(0, 300))
    ctx.check(/尝试\s*2/.test(panelText), '详情面板含尝试次数 2', '匹配 /尝试\\s*2/', panelText.slice(0, 300))
    ctx.eq(await count(client, `.task-detail[data-task-id="${taskId}"]`), 1, '详情面板唯一')

    ctx.raw = { sessionId, taskId, taskKeys: Object.keys(task), panelTitle: panelTitle.trim(), panelText: panelText.slice(0, 800) }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

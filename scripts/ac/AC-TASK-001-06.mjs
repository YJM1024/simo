#!/usr/bin/env node
/**
 * AC-TASK-001-06：跨会话任务详情 404
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-001-06（现状差异 D-04 的实现项）
 * 前置：隔离后端以 mock 模型运行；frontend/dist 已构建；会话 S1 与 S2 各建任务，T2 属于 S2。
 * 断言点：
 *   1) GET /api/tasks/T2 缺 sessionId 返回 400，错误码 task_session_required；
 *   2) GET /api/tasks/T2?sessionId=S1 返回 404，错误码 task_not_found，message「任务不存在」；
 *   3) GET /api/tasks/T2?sessionId=S2 返回 200；
 *   4) 会话内路由 GET /api/sessions/S1/tasks/T2 返回 404 task_not_found；
 *   5) 前端打开 S1 的任务标签页后 DOM 不含 T2 的卡片刻与标题。
 * 夹具与清理：两个会话各建任务并置 done；数据留在隔离库。前端没有跨会话任务深链，
 *   「打开 T2 详情」按「S1 会话内无法出现 T2、详情面板打不开 T2」断言，并用会话内接口确认 404。
 */
import { runAc, createSession, createBatch, api, detail, list, execDb, waitFor, sleep, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, clickSel, count } from './lib/task-ui-helpers.mjs'

const T2_TITLE = '跨会话隐藏任务 T2'
const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])

async function seed(title, taskTitle) {
  const sessionId = await createSession(title)
  const res = await createBatch(sessionId, {
    mode: 'plan',
    goal: title,
    tasks: [{ key: 't1', title: taskTitle, mode: 'plan', goal: taskTitle }],
    clientMutationId: `ac-001-06-${Date.now()}`,
  })
  if (res.status !== 201 || !res.json || !res.json.tasks || !res.json.tasks[0]) {
    throw new Error(`创建夹具失败: ${res.status} ${String(res.text).slice(0, 200)}`)
  }
  return { sessionId, taskId: res.json.tasks[0].id }
}

async function settle(sessionId) {
  try {
    await waitFor(async () => {
      const res = await list(sessionId, '?limit=50')
      if (res.status !== 200) return false
      const tasks = (res.json && res.json.tasks) || []
      return tasks.length > 0 && tasks.every((t) => TERMINAL.has(t.status))
    }, { timeoutMs: 20000, intervalMs: 300, label: '任务进入终态' })
  } catch { /* 仍按落库状态做夹具 */ }
}

async function pinDone(sessionId, taskId) {
  for (let i = 0; i < 3; i += 1) {
    execDb("UPDATE tasks SET status = 'done', progress = 100, updated_at = ? WHERE id = ?", [Date.now(), taskId])
    await sleep(120)
    const res = await detail(sessionId, taskId)
    const task = res.json && res.json.task
    if (task && task.status === 'done') return task
  }
  return null
}

function errCode(body) {
  return (body && body.code) || (body && body.error && body.error.code)
}

function errMessage(body) {
  if (!body) return ''
  if (typeof body.error === 'string' && body.error) return body.error
  return body.message || (body.error && body.error.message) || ''
}

await runAc('AC-TASK-001-06', async (ctx) => {
  const current = await seed('AC-TASK-001-06 当前会话 S1', '当前会话任务')
  const other = await seed('AC-TASK-001-06 另一会话 S2', T2_TITLE)
  await settle(current.sessionId)
  await settle(other.sessionId)
  await pinDone(current.sessionId, current.taskId)
  await pinDone(other.sessionId, other.taskId)

  const missing = await api('GET', `/api/tasks/${encodeURIComponent(other.taskId)}`)
  ctx.eq(missing.status, 400, '缺 sessionId 的旧路由返回 400')
  ctx.eq(errCode(missing.json), 'task_session_required', '缺 sessionId 失败码 task_session_required')

  const cross = await api('GET', `/api/tasks/${encodeURIComponent(other.taskId)}?sessionId=${encodeURIComponent(current.sessionId)}`)
  ctx.eq(cross.status, 404, '跨会话旧路由返回 404')
  ctx.eq(errCode(cross.json), 'task_not_found', '跨会话旧路由失败码 task_not_found')
  ctx.eq(errMessage(cross.json), '任务不存在', '跨会话旧路由 message 为「任务不存在」')

  const own = await api('GET', `/api/tasks/${encodeURIComponent(other.taskId)}?sessionId=${encodeURIComponent(other.sessionId)}`)
  ctx.eq(own.status, 200, '会话一致时旧路由返回 200')
  ctx.check(Boolean(own.json && own.json.ok === true), '会话一致时 ok=true', true, JSON.stringify(own.json && own.json.ok))

  const scoped = await detail(current.sessionId, other.taskId)
  ctx.eq(scoped.status, 404, '会话内路由跨会话返回 404')
  ctx.eq(errCode(scoped.json), 'task_not_found', '会话内路由失败码 task_not_found')
  ctx.eq(errMessage(scoped.json), '任务不存在', '会话内路由 message 为「任务不存在」')

  const server = await startDistServer({ apiBase: BASE })
  let client
  try {
    client = await openConversation(current.sessionId, { url: server.url })
    await clickSel(client, '.insp-rail button[data-tab="tasks"]')
    await uiWaitFor(client, `document.querySelector('.task-card[data-task-id="${current.taskId}"]') !== null`, {
      timeout: 10000,
      label: '当前会话任务卡加载完成',
    })
    ctx.eq(await count(client, `.task-card[data-task-id="${other.taskId}"]`), 0, '当前会话 DOM 无 T2 卡片')
    const asideText = await client.evaluate(`((document.querySelector('aside.inspector') || {}).textContent || '')`)
    ctx.check(!asideText.includes(T2_TITLE), '右栏 DOM 不含 T2 标题', '不含 T2 标题', asideText.includes(T2_TITLE) ? '包含 T2 标题' : '不含')
    const cards = await client.evaluate(`Array.from(document.querySelectorAll('#task-list .task-card')).map((el) => el.getAttribute('data-task-id'))`)
    ctx.check(Array.isArray(cards) && !cards.includes(other.taskId), '任务列表数据中没有 T2', '不含 T2', JSON.stringify(cards))

    ctx.raw = {
      currentSessionId: current.sessionId,
      otherSessionId: other.sessionId,
      t2: other.taskId,
      legacyMissing: { status: missing.status, body: missing.json },
      legacyCross: { status: cross.status, body: cross.json },
      scopedCross: { status: scoped.status, body: scoped.json },
      domCards: cards,
    }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

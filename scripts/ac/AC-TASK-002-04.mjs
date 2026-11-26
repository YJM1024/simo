#!/usr/bin/env node
/**
 * AC-TASK-002-04：任务列表加载期间不显示进度百分比
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-002-04
 * 前置：隔离后端以 mock 模型运行；frontend/dist 已构建；会话有 3 条带进度的任务。
 * 断言点：
 *   1) 把任务列表接口延迟 2 秒（页面 fetch 桩注入，不改后端）；
 *   2) 加载期间存在加载态节点（.task-skeleton[aria-label="任务加载中"]），且整页无文本匹配 /\d+%/ 的节点；
 *   3) 接口返回后加载态消失、任务卡出现，并且进度百分比此时才出现（证明第 2 条不是空断言）。
 * 夹具与清理：createSession + createBatch 建 3 条任务，落库置 done=100 / running=40 / queued=0；
 *   列表响应体先经真实接口取得，再由桩延迟返回；数据留在隔离库。
 */
import { runAc, createSession, createBatch, list, detail, execDb, waitFor, sleep, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, clickSel, count, READY_INSPECTOR } from './lib/task-ui-helpers.mjs'
import { installStub, setStub, READY_SIDEBAR } from '../lib/ac-cdp.mjs'

const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])
const PLAN = [
  ['done', 100, '加载样本：已完成'],
  ['running', 40, '加载样本：进行中'],
  ['queued', 0, '加载样本：排队中'],
]

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

await runAc('AC-TASK-002-04', async (ctx) => {
  const sessionId = await createSession('AC-TASK-002-04 加载期不显示进度')
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证任务列表加载期间不显示进度百分比。',
    tasks: PLAN.map(([, , title], i) => ({ key: `t${i + 1}`, title, mode: 'plan', goal: title })),
    clientMutationId: `ac-002-04-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建 3 条任务返回 201')
  const ids = (created.json && created.json.tasks ? created.json.tasks : []).map((t) => t.id)
  ctx.eq(ids.length, 3, '创建响应含 3 条任务')
  await settle(sessionId)
  for (let i = 0; i < PLAN.length; i += 1) {
    await pinTask(sessionId, ids[i], PLAN[i][0], PLAN[i][1])
  }

  const realList = await list(sessionId, '?limit=50')
  ctx.eq(realList.status, 200, '真实任务列表返回 200')
  ctx.eq(Array.isArray(realList.json && realList.json.tasks) ? realList.json.tasks.length : -1, 3, '真实任务列表 3 条')

  const server = await startDistServer({ apiBase: BASE })
  let client
  try {
    client = await openConversation(sessionId, { url: server.url })
    await installStub(client)
    // 桩的配置在页面脚本启动时读取，因此必须先写桩再 reload；reload 后首屏任务请求就被延迟 2 秒。
    await setStub(client, {
      rules: [{
        match: `/api/sessions/${sessionId}/tasks(\\?|$)`,
        status: 200,
        body: realList.json,
        delayMs: 2000,
      }],
    })
    // reload 的 ready 是 JS 表达式而非选择器；用会话行出现作为就绪信号，任务列表请求此时仍在延迟中。
    await client.reload({ ready: READY_SIDEBAR })
    const startedAt = Date.now()
    // 首屏任务请求还在飞（tasksLoading=true），此时点任务标签应直接进入骨架态；
    // 若点击早于 React 置 loading，按 50ms 重试到面板挂载为止。
    for (let i = 0; i < 30; i += 1) {
      const opened = await client.evaluate(`(() => {
        if (document.querySelector('.task-panel')) return true
        const button = document.querySelector('.insp-rail button[data-tab="tasks"]')
        if (button) button.click()
        return document.querySelector('.task-panel') !== null
      })()`)
      if (opened) break
      await sleep(50)
    }

    const samples = []
    let loadingSeen = 0
    const percents = []
    while (Date.now() - startedAt <= 4000) {
      const sample = await client.evaluate(`(() => {
        const loading = document.querySelector('.task-skeleton[aria-label="任务加载中"]') !== null
        const nodes = Array.from(document.body.querySelectorAll('*')).filter((el) => el.children.length === 0 && /\\d+%/.test(el.textContent || ''))
        const calls = (window.__ac && window.__ac.calls ? window.__ac.calls : []).filter((call) => /\\/tasks(\\?|$)/.test(call.url)).map((call) => call.status)
        const panel = document.querySelector('.task-panel')
        return {
          loading,
          percents: nodes.map((el) => (el.textContent || '').trim()).slice(0, 6),
          cards: document.querySelectorAll('#task-list .task-card').length,
          panel: panel ? { filter: panel.getAttribute('data-filter'), text: (panel.textContent || '').slice(0, 60) } : null,
          calls,
        }
      })()`)
      samples.push({ ms: Date.now() - startedAt, loading: sample.loading, percents: sample.percents, cards: sample.cards, panel: sample.panel, calls: sample.calls })
      // 只统计加载态样本里的百分比；加载结束那一帧的百分比属于「返回后」断言。
      if (sample.loading) {
        loadingSeen += 1
        if (sample.percents.length > 0) percents.push(...sample.percents)
      }
      if (!sample.loading && loadingSeen > 0) break
      await sleep(80)
    }
    ctx.raw = {
      sessionId,
      ids,
      delayedMs: 2000,
      loadingSamples: loadingSeen,
      samples,
      percentsDuringLoading: percents,
      panelText: await client.evaluate(`(document.querySelector('.insp-panel') || document.body).textContent.slice(0, 400)`),
    }
    ctx.check(loadingSeen > 0, '加载期间存在加载态节点', '至少一次命中 .task-skeleton[aria-label="任务加载中"]', `命中 ${loadingSeen} 次`)
    ctx.eq(percents.length, 0, '加载期间整页无匹配 /\\d+%/ 的文本')

    try {
      await uiWaitFor(client, `document.querySelector('.task-skeleton[aria-label="任务加载中"]') === null`, { timeout: 8000, label: '加载态消失' })
      await uiWaitFor(client, `document.querySelectorAll('#task-list .task-card').length === 3`, { timeout: 8000, label: '任务卡渲染 3 张' })
    } catch (err) {
      ctx.raw.failText = await client.evaluate(`(document.querySelector('.insp-panel') || document.body).textContent.slice(0, 600)`)
      ctx.raw.failCalls = await client.evaluate(`(window.__ac && window.__ac.calls ? window.__ac.calls : []).slice(-12).map((c) => ({ url: c.url, status: c.status }))`)
      ctx.check(false, '等待加载结束失败', err.message, JSON.stringify(ctx.raw.failCalls))
    }
    ctx.eq(await count(client, '.task-skeleton[aria-label="任务加载中"]'), 0, '接口返回后加载态消失')
    const percentText = await client.evaluate(`Array.from(document.querySelectorAll('#task-list .task-progress-text')).map((el) => (el.textContent || '').trim())`)
    ctx.check(percentText.includes('40%') && percentText.includes('100%'), '加载完成后才出现进度百分比文本', '包含 40% 与 100%', JSON.stringify(percentText))

    ctx.raw = {
      sessionId,
      ids,
      delayedMs: 2000,
      loadingSamples: loadingSeen,
      // 样本只留首尾若干条，证据文件控制在 8KB 内且保持 JSON 合法。
      samples: [...samples.slice(0, 3), ...samples.slice(-3)],
      percentsDuringLoading: percents,
      percentText,
    }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

#!/usr/bin/env node
/**
 * AC-TASK-002-03：界面进度跟随接口进度（不刷新页面，5 秒内），刷新后计数与进度不回落
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-002-03
 * 前置：隔离后端以 mock 模型运行（StartDelay 3s、RunDelay 5s）；frontend/dist 已构建。
 * 断言点：
 *   1) 页面打开后任务卡显示接口当时的进度；
 *   2) mock 执行器推进任务时，以接口返回的新值为准；5 秒窗口内 DOM 的 data-task-progress 追上接口值，且比初始值有前进；
 *   3) 5 秒窗口内不调用 reload，证据带接口值与 DOM 值的对应采样；
 *   4) 窗口结束后重新加载页面，任务卡数量与进度都不回落，且刷新后 5 秒内 DOM 再次等于接口最新值。
 * 夹具与清理：createSession + createBatch 建 1 条任务，页面打开后让执行器自然推进；数据留在隔离库。
 * 断言条数以本轮运行结果为准（共 12 条）。
 */
import { runAc, createSession, createBatch, detail, sleep, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, clickSel, attr, text, count } from './lib/task-ui-helpers.mjs'

const TITLE = '进度跟随任务'
const CARD = (taskId) => `.task-card[data-task-id="${taskId}"]`
const PROGRESS = (taskId) => `${CARD(taskId)} .task-progress-text`

async function sampleUntilMatched(client, sessionId, taskId, { baseline, timeoutMs, requireProgress = false }) {
  const samples = []
  let latestApi = -1
  let matched = false
  let progressed = false
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    const res = await detail(sessionId, taskId)
    const task = res.json && res.json.task
    const apiValue = task && typeof task.progress === 'number' ? task.progress : -1
    latestApi = apiValue
    const domValue = String(await attr(client, PROGRESS(taskId), 'data-task-progress'))
    samples.push({ ms: Date.now() - start, api: apiValue, dom: domValue, status: task && task.status })
    if (Number(domValue) > Number(baseline)) progressed = true
    // 第一段必须等到“比初始值前进”之后才算追上，避免初始 0 与接口 0 立即相等造成空断言。
    if (requireProgress && !progressed) { await sleep(120); continue }
    if (Number(domValue) === apiValue) { matched = true; break }
    await sleep(120)
  }
  return { samples, latestApi, matched, progressed, elapsedMs: Date.now() - start }
}

await runAc('AC-TASK-002-03', async (ctx) => {
  const sessionId = await createSession('AC-TASK-002-03 进度跟随')
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证界面进度跟随接口进度。',
    tasks: [{ key: 't1', title: TITLE, mode: 'plan', goal: TITLE }],
    clientMutationId: `ac-002-03-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建任务返回 201')
  const taskId = created.json && created.json.tasks && created.json.tasks[0] && created.json.tasks[0].id
  ctx.check(Boolean(taskId), '创建响应含任务 id', '非空 task id', JSON.stringify(taskId))

  // 页面先打开，执行器在 3 秒后才开始推进，保证能观察到进度变化。
  const server = await startDistServer({ apiBase: BASE })
  let client
  try {
    client = await openConversation(sessionId, { url: server.url })
    await clickSel(client, '.insp-rail button[data-tab="tasks"]')
    await uiWaitFor(client, `document.querySelector('${PROGRESS(taskId)}') !== null`, {
      timeout: 10000,
      label: '任务卡出现进度文本',
    })
    const initial = String(await attr(client, PROGRESS(taskId), 'data-task-progress'))
    const initialText = ((await text(client, PROGRESS(taskId))) || '').trim()
    ctx.check(/^\d+$/.test(initial), '初始进度是数字', '数字字符串', initial)

    // 第一段：不刷新页面，5 秒内追上接口最新值。
    const live = await sampleUntilMatched(client, sessionId, taskId, { baseline: initial, timeoutMs: 5000, requireProgress: true })
    ctx.check(live.progressed, '5 秒内界面进度比初始值前进', `> ${initial}`, JSON.stringify(live.samples.slice(-6)))
    ctx.check(live.matched, '界面进度与接口最新值一致', `DOM=${live.latestApi}`, JSON.stringify(live.samples.slice(-6)))
    const finalText = ((await text(client, PROGRESS(taskId))) || '').trim()
    const finalDom = String(await attr(client, PROGRESS(taskId), 'data-task-progress'))
    ctx.eq(finalText, `${finalDom}%`, '进度文本与 data-task-progress 一致')
    const matchedAt = Date.now()

    const cardsBefore = await count(client, '.task-card')
    ctx.check(cardsBefore === 1, '刷新前任务卡数量为 1', 1, cardsBefore)

    // 第二段：重新加载页面，计数与进度不回落，再等一次 DOM 追上接口。
    const reloadStart = Date.now()
    await client.reload({
      ready: `document.querySelector('aside.inspector')?.getAttribute('data-session') === ${JSON.stringify(sessionId)}`,
      timeout: 15000,
    })
    const reloadMs = Date.now() - reloadStart
    ctx.check(reloadStart >= matchedAt, '刷新发生在 5 秒匹配之后', `>= ${matchedAt}`, reloadStart)
    await uiWaitFor(client, `document.querySelector('.insp-rail button[data-tab="tasks"]') !== null`, { timeout: 10000, label: '刷新后右栏任务入口' })
    await clickSel(client, '.insp-rail button[data-tab="tasks"]')
    await uiWaitFor(client, `document.querySelector('${PROGRESS(taskId)}') !== null`, { timeout: 10000, label: '刷新后任务卡出现' })

    const cardsAfter = await count(client, '.task-card')
    ctx.check(cardsAfter === cardsBefore, '刷新后任务卡数量不回落', cardsBefore, cardsAfter)
    const reloadedDom = String(await attr(client, PROGRESS(taskId), 'data-task-progress'))
    ctx.check(Number(reloadedDom) >= Number(finalDom), '刷新后进度不回落', `>= ${finalDom}`, reloadedDom)

    const after = await sampleUntilMatched(client, sessionId, taskId, { baseline: String(Number(reloadedDom) - 1), timeoutMs: 5000 })
    ctx.check(after.matched, '刷新后 5 秒内界面进度再次等于接口值', `DOM=${after.latestApi}`, JSON.stringify(after.samples.slice(-6)))
    const afterText = ((await text(client, PROGRESS(taskId))) || '').trim()
    ctx.eq(afterText, `${after.latestApi}%`, '刷新后进度文本与接口一致')

    ctx.raw = {
      sessionId,
      taskId,
      initial: `${initial} (${initialText})`,
      finalDom,
      latestApi: live.latestApi,
      samples: live.samples,
      elapsedMs: live.elapsedMs,
      reloaded: true,
      reloadMs,
      cardsBefore,
      cardsAfter,
      reloadedDom,
      afterSamples: after.samples,
    }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

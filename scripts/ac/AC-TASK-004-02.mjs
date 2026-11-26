#!/usr/bin/env node
/**
 * AC-TASK-004-02：C3 方案卡确认前无副作用，等 60 秒确认后 1 子会话 1 任务，拒绝后三项归零；
 * 30 分钟与 12 小时只做前端标记、不自动执行。
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-004-02。
 * 断言点：
 *   1) 方案卡 pending、attempt=0；确认前父级任务 0、子会话 0、产物 0；
 *   2) 确认后子会话 1、其中任务 1，父级任务 0；另一份方案拒绝后三项 0；
 *   3) 界面按假时钟推进：把浏览器 Date.now 前移 61 秒后点确认，确认仍执行；
 *   4) 前移 31 分钟时方案卡出现“已等待 31 分钟未确认”提示，确认/拒绝入口仍在，库中仍 pending、子会话 0、任务 0；
 *   5) 前移 12 小时 1 分钟时方案卡出现“待确认超时”标记，库中仍 pending、子会话 0、任务 0。
 * 说明：前端 TaskPlanCard 用 Date.now()/createdAt 计算等待时长，没有可注入的服务端时钟，
 *       脚本用 CDP 在文档加载前覆写 Date.now 来推进界面时间；库侧用真实接口校验不自动执行。
 * 夹具与清理：每个场景一个独立会话，数据留在隔离库。
 * 断言条数以本轮运行结果为准（共 41 条）。
 */
import { runAc, createSession, api, queryRows, BASE } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, clickSel } from './lib/task-ui-helpers.mjs'

const count = (sql, ...params) => queryRows(sql, params)[0].n

const CLOCK_SCRIPT = `(() => {
  try {
    const shift = Number(localStorage.getItem('ac.plan-clock-shift') || '0') || 0;
    if (!shift) return;
    // 同一文档里这段脚本可能被多个 addScriptToEvaluateOnNewDocument 注册重复执行，
    // 因此把“原始 Date.now”只记一次，再赋绝对偏移；重复执行不会叠加偏移。
    const origin = window.__acPlanRealNow || (window.__acPlanRealNow = Date.now.bind(Date));
    const RealDate = window.__acPlanRealDate || (window.__acPlanRealDate = Date);
    Date.now = () => origin() + shift;
    const ShiftedDate = class extends RealDate {
      constructor(...args) { if (args.length === 0) super(origin() + shift); else super(...args); }
      static now() { return origin() + shift; }
    };
    window.Date = ShiftedDate;
  } catch (error) { /* 文档未就绪时忽略 */ }
})()`

async function createPlan(sessionId) {
  const res = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans`, {
    requestText: '重构导出流程', multiRound: true, steps: ['梳理', '设计', '实现'],
  })
  if (res.status !== 201) throw new Error(`创建 C3 方案失败: ${res.status} ${res.text.slice(0, 200)}`)
  return res.json
}

function snapshot(sessionId) {
  return {
    tasks: count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId),
    children: count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessionId),
    artifacts: count('SELECT COUNT(*) AS n FROM task_artifacts WHERE task_id IN (SELECT id FROM tasks WHERE session_id = ?)', sessionId),
  }
}

function planRow(planId) {
  return queryRows('SELECT status, attempt, child_session_ids FROM task_plans WHERE id = ?', [planId])[0]
}

async function openPlan(server, sessionId, shiftMs) {
  const client = await openConversation(sessionId, { url: server.url })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK_SCRIPT })
  await client.evaluate(`localStorage.setItem('ac.plan-clock-shift', ${JSON.stringify(String(shiftMs))}); true`)
  await client.reload({
    ready: `document.querySelector('aside.inspector')?.getAttribute('data-session') === ${JSON.stringify(sessionId)}`,
    timeout: 15000,
  })
  return client
}

async function planCard(client, planId) {
  await uiWaitFor(client, `document.querySelector('.msg-plan-card[data-plan-id="${planId}"]') !== null`, { timeout: 12000, label: `方案卡 ${planId}` })
  return client.evaluate(`(() => {
    const card = document.querySelector('.msg-plan-card[data-plan-id="${planId}"]');
    return {
      status: card.getAttribute('data-status'),
      hint: (card.querySelector('.msg-plan-hint')?.textContent || '').trim(),
      expired: card.querySelectorAll('.msg-plan-hint.is-expired').length,
      confirmButtons: card.querySelectorAll('.msg-plan-actions button').length,
    };
  })()`)
}

await runAc('AC-TASK-004-02', async (ctx) => {
  const sessionId = await createSession('AC-TASK-004-02 C3 确认门禁')
  const created = await createPlan(sessionId)
  ctx.eq(created.complexity, 'C3', '方案等级为 C3')
  const planId = created.planId
  ctx.check(Boolean(planId), '创建响应含 planId', 'planId', JSON.stringify(created))
  ctx.eq(count('SELECT COUNT(*) AS n FROM task_plans WHERE id = ? AND status = ?', planId, 'pending'), 1, '方案落为 pending')
  ctx.eq(count('SELECT attempt AS n FROM task_plans WHERE id = ?', planId), 0, '确认前 attempt=0')
  ctx.eq(
    count('SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND category = ? AND id = (SELECT plan_message_id FROM task_plans WHERE id = ?)', sessionId, 'confirmation', planId),
    1,
    '父会话消息流里有 1 张方案卡',
  )

  const before = snapshot(sessionId)
  ctx.eq(before.tasks, 0, '确认前父级任务 0')
  ctx.eq(before.children, 0, '确认前子会话 0')
  ctx.eq(before.artifacts, 0, '确认前产物 0')

  const confirmed = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans/${encodeURIComponent(planId)}/confirm`)
  ctx.eq(confirmed.status, 200, '确认返回 200')
  const children = (confirmed.json && confirmed.json.childSessionIds) || []
  ctx.eq(children.length, 1, '确认后子会话 1')
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId), 0, '确认后父级任务仍为 0')
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', children[0]), 1, '确认后子会话 1 个任务')
  ctx.eq(count('SELECT status AS n FROM task_plans WHERE id = ?', planId), 'confirmed', '方案状态为 confirmed')

  // 拒绝路径：新会话建 C3 方案后拒绝，三项都保持 0。
  const rejectSession = await createSession('AC-TASK-004-02 C3 拒绝')
  const rejectPlan = await createPlan(rejectSession)
  const rejected = await api('POST', `/api/sessions/${encodeURIComponent(rejectSession)}/task-plans/${encodeURIComponent(rejectPlan.planId)}/reject`, { reason: '不需要了' })
  ctx.eq(rejected.status, 200, '拒绝返回 200')
  ctx.eq(rejected.json && rejected.json.plan && rejected.json.plan.status, 'rejected', '拒绝后方案标记 rejected')
  const after = snapshot(rejectSession)
  ctx.eq(after.tasks, 0, '拒绝后任务 0')
  ctx.eq(after.children, 0, '拒绝后子会话 0')
  ctx.eq(after.artifacts, 0, '拒绝后产物 0')

  // 界面段：假时钟推进，验证 60 秒确认、30 分钟提示、12 小时超时标记。
  const server = await startDistServer({ apiBase: BASE })
  const clients = []
  try {
    // 60 秒后点确认：仍可执行。
    const uiSession = await createSession('AC-TASK-004-02 等 60 秒确认')
    const uiPlan = await createPlan(uiSession)
    const uiClient = await openPlan(server, uiSession, 61_000)
    clients.push(uiClient)
    const card0 = await planCard(uiClient, uiPlan.planId)
    ctx.eq(card0.status, 'pending', '界面方案卡为待确认')
    ctx.check(card0.confirmButtons === 2 && card0.hint === '', '61 秒时未出现超时提示且确认/拒绝入口各 1 个', '2 个按钮，无提示', JSON.stringify(card0))
    await clickSel(uiClient, `.msg-plan-card[data-plan-id="${uiPlan.planId}"] .msg-plan-actions button.primary`)
    await uiWaitFor(uiClient, `document.querySelector('.msg-plan-card[data-plan-id="${uiPlan.planId}"]').getAttribute('data-status') === 'confirmed'`, { timeout: 15000, label: '界面确认后方案卡变 confirmed' })
    const uiRow = planRow(uiPlan.planId)
    ctx.eq(uiRow.status, 'confirmed', '等 60 秒后点确认，方案 confirmed')
    ctx.eq(Number(uiRow.attempt), 1, '界面确认后 attempt=1')
    ctx.eq(snapshot(uiSession).children, 1, '界面确认后子会话 1')
    const uiChildren = queryRows('SELECT id FROM sessions WHERE parent_id = ?', [uiSession]).map((r) => r.id)
    ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', uiChildren[0]), 1, '界面确认后子会话 1 个任务')

    // 30 分钟：只提示、不执行。
    const halfSession = await createSession('AC-TASK-004-02 等 30 分钟')
    const halfPlan = await createPlan(halfSession)
    const halfClient = await openPlan(server, halfSession, 31 * 60_000)
    clients.push(halfClient)
    const card30 = await planCard(halfClient, halfPlan.planId)
    ctx.eq(card30.hint, '已等待 31 分钟未确认，确认后才会创建任务。', '31 分钟时出现等待提示')
    ctx.eq(card30.expired, 0, '31 分钟时未标记 12 小时超时')
    ctx.check(card30.confirmButtons === 2, '31 分钟时确认/拒绝入口仍在', 2, card30.confirmButtons)
    const row30 = planRow(halfPlan.planId)
    ctx.eq(row30.status, 'pending', '31 分钟未确认时方案仍 pending（不自动执行）')
    ctx.eq(Number(row30.attempt), 0, '31 分钟未确认时 attempt 仍为 0')
    ctx.eq(snapshot(halfSession).children, 0, '31 分钟时子会话仍为 0')
    ctx.eq(snapshot(halfSession).tasks, 0, '31 分钟时任务仍为 0')

    // 12 小时：只标记超时、不执行。
    const daySession = await createSession('AC-TASK-004-02 等 12 小时')
    const dayPlan = await createPlan(daySession)
    const dayClient = await openPlan(server, daySession, 12 * 60 * 60_000 + 60_000)
    clients.push(dayClient)
    const card12 = await planCard(dayClient, dayPlan.planId)
    ctx.eq(card12.expired, 1, '12 小时后出现超时标记')
    ctx.check(card12.hint.includes('待确认超时'), '超时文案为“待确认超时”', '含“待确认超时”', card12.hint)
    ctx.check(card12.confirmButtons === 2, '超时后确认/拒绝入口仍在（只标记不执行）', 2, card12.confirmButtons)
    const row12 = planRow(dayPlan.planId)
    ctx.eq(row12.status, 'pending', '12 小时未确认时方案仍 pending')
    ctx.eq(snapshot(daySession).children, 0, '12 小时时子会话仍为 0')
    ctx.eq(snapshot(daySession).tasks, 0, '12 小时时任务仍为 0')

    // 另起一次等 60 秒后点拒绝：不建任何东西。
    const uiRejectSession = await createSession('AC-TASK-004-02 等 60 秒拒绝')
    const uiRejectPlan = await createPlan(uiRejectSession)
    const rejectClient = await openPlan(server, uiRejectSession, 61_000)
    clients.push(rejectClient)
    await planCard(rejectClient, uiRejectPlan.planId)
    await clickSel(rejectClient, `.msg-plan-card[data-plan-id="${uiRejectPlan.planId}"] .msg-plan-actions button:not(.primary)`)
    await uiWaitFor(rejectClient, `document.querySelector('.msg-plan-card[data-plan-id="${uiRejectPlan.planId}"]').getAttribute('data-status') === 'rejected'`, { timeout: 15000, label: '界面拒绝后方案卡变 rejected' })
    ctx.eq(planRow(uiRejectPlan.planId).status, 'rejected', '等 60 秒后点拒绝，方案 rejected')
    ctx.eq(snapshot(uiRejectSession).children, 0, '界面拒绝后子会话 0')
    ctx.eq(snapshot(uiRejectSession).tasks, 0, '界面拒绝后任务 0')
    ctx.eq(snapshot(uiRejectSession).artifacts, 0, '界面拒绝后产物 0')

    ctx.raw = {
      sessionId, planId, children, rejectSession, rejectPlanId: rejectPlan.planId, before, after,
      ui: { sessionId: uiSession, planId: uiPlan.planId, row: uiRow, children: uiChildren },
      half: { sessionId: halfSession, card: card30, row: row30 },
      day: { sessionId: daySession, card: card12, row: row12 },
      uiReject: { sessionId: uiRejectSession, card: planRow(uiRejectPlan.planId) },
    }
  } finally {
    for (const client of clients) { try { client.close() } catch { /* 已关闭 */ } }
    await server.close().catch(() => {})
  }
})

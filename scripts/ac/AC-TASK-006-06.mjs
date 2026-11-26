#!/usr/bin/env node
/**
 * AC-TASK-006-06：预算触顶进入资源等待，界面只给一个恢复入口，恢复后从暂停步继续
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-006-06、DEC-40
 * 预算口径：本脚本把 SIMO_TASK_MAX_TOKENS 设成 1（Mock 模型单步就报 23 token），
 *   首个模型调用即触顶，任务停在原地而不是落 blocked。
 * 断言点：
 *   1) DB：status=running、waitingReason=resource、outcome=budget_exceeded、attempt 不变、progress 不前进；
 *   2) DOM：预算文案 1 个、[data-task-resume="resource"] 1 个，恢复按钮只有 1 个；
 *   3) 点恢复后「已从第 N 步「标题」继续」出现，恢复步骤就是暂停步；
 *   4) 恢复后 waitingReason 与 outcome 不再停在预算态，暂停前已完成的步骤仍是 done；
 *   5) 恢复后 task_steps 里已完成步骤的起止时间与执行事件数都不变，判定为不重跑；
 *      暂停步的 started_at 不早于点击恢复，attempt 也不增加。
 * 断言条数以本轮运行结果为准（共 25 条）。
 */
process.env.SIMO_TASK_MAX_STEPS = '1'

import { runAc, createSession, sleep, waitFor, queryRows } from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor } from './lib/task-ui-helpers.mjs'
import { seedTask, taskRow, stepStates } from './lib/task-006.mjs'

await runAc('AC-TASK-006-06', async (ctx) => {
  const sessionId = await createSession('AC-TASK-006-06 预算触顶与恢复')
  const taskId = await seedTask(sessionId, { title: '预算触顶任务', steps: ['收集资料', '撰写正文', '校对成稿'] })

  const paused = await waitFor(() => {
    const row = taskRow(taskId)
    return row && row.status === 'running' && row.waiting_reason === 'resource' && row.outcome === 'budget_exceeded' ? row : null
  }, { timeoutMs: 30000, intervalMs: 200, label: '任务进入资源等待' })

  ctx.eq(paused.status, 'running', 'DB status 保持 running')
  ctx.eq(paused.waiting_reason, 'resource', 'DB waitingReason=resource')
  ctx.eq(paused.outcome, 'budget_exceeded', 'DB outcome=budget_exceeded')
  ctx.eq(paused.attempt, 1, '触顶不改 attempt')
  const progressBefore = paused.progress
  await sleep(800)
  ctx.eq(taskRow(taskId).progress, progressBefore, '等待中 progress 不前进')
  const budget = JSON.parse(paused.budget_json || '{}')
  ctx.check(budget.maxSteps === 1 && budget.usedSteps >= 1, '预算按可配置上限记账（maxSteps=1、usedSteps>=1）', 'maxSteps=1 usedSteps>=1', JSON.stringify(budget))

  // Mock 执行器按步记账：第 1 步已 done，任务停在第 2 步之前。
  const pausedStep = stepStates(taskId).find((step) => step.status === 'pending')
  ctx.check(Boolean(pausedStep), '存在未开始的暂停步', 'pending 步骤', JSON.stringify(stepStates(taskId)))
  ctx.eq(stepStates(taskId)[0].status, 'done', '暂停前第 1 步已完成')
  // 步骤起止时间落在规范化表 task_steps；tasks.steps 是兼容 JSON，mirrorSteps 只保留 id/title/status。
  const stepTiming = () => queryRows('SELECT id, seq, title, status, started_at, finished_at FROM task_steps WHERE task_id = ? ORDER BY seq', [taskId])
  const stepEventCount = (stepId) => queryRows("SELECT COUNT(*) AS n FROM events WHERE type = 'task.updated' AND payload LIKE ?", [`%"step":"${stepId}"%`])[0].n
  const timingBefore = stepTiming()
  const doneBefore = timingBefore.filter((step) => step.status === 'done')
  ctx.check(doneBefore.length >= 1 && doneBefore.every((step) => step.started_at > 0 && step.finished_at > 0),
    '暂停前已完成步骤都有起止时间（可作不重跑基准）', '至少 1 个带 started_at/finished_at 的 done 步骤', JSON.stringify(doneBefore))
  const step1EventsBefore = doneBefore.length ? stepEventCount(doneBefore[0].id) : 0

  const server = await startDistServer({ apiBase: process.env.AC_CONV_BASE || 'http://127.0.0.1:8789' })
  let client
  try {
    client = await openConversation(sessionId, { url: server.url })
    // 打开任务详情层：详情尚未出现就重复点一次，避免首次点击早于任务列表/详情取回而空等。
    await uiWaitFor(client, `(() => {
      if (document.querySelector('.task-detail[data-task-id="${taskId}"]')) return true
      const card = document.querySelector('.msg-task-card[data-task-id="${taskId}"]') || document.querySelector('.msg-task-card')
      const btn = card && Array.from(card.querySelectorAll('button')).find((b) => (b.textContent || '').includes('查看任务'))
      if (btn) btn.click()
      return false
    })()`, { timeout: 25000, label: '任务详情层打开' })
    ctx.eq(await client.evaluate(`document.querySelectorAll('.task-detail[data-task-id="${taskId}"]').length`), 1, '详情层只渲染一个')

    const dom = await client.evaluate(`(() => {
      const root = document.querySelector('.task-detail[data-task-id="${taskId}"]')
      const budgetEl = root.querySelectorAll('.task-budget')
      const resume = root.querySelectorAll('[data-task-resume="resource"]')
      const buttons = root.querySelectorAll('.task-resume-btn')
      return {
        budgetCount: budgetEl.length,
        budgetText: (budgetEl[0] && (budgetEl[0].textContent || '').trim()) || '',
        resumeCount: resume.length,
        resumeButtons: buttons.length,
        pausedTitle: ((root.querySelector('.task-step.is-running .task-step-title, .task-step[data-status="running"] .task-step-title, .task-step-title') || {}).textContent || '').trim(),
      }
    })()`)
    ctx.eq(dom.budgetCount, 1, '界面预算文案 1 个')
    ctx.check(dom.budgetText.includes('tokens'), '预算文案含 tokens 用量', '含 tokens', dom.budgetText)
    ctx.eq(dom.resumeCount, 1, '恢复入口 1 个')
    ctx.eq(dom.resumeButtons, 1, '恢复按钮只有 1 个')

    const resumeClickAt = Date.now()
    await client.evaluate(`(() => { const b = document.querySelector('.task-resume-btn'); if (b) b.click(); return Boolean(b) })()`)
    const notice = await uiWaitFor(client, `(() => {
      const el = document.querySelector('.task-resume-notice')
      const text = el && (el.textContent || '').trim()
      return text && text.includes('继续') ? text : false
    })()`, { timeout: 20000, label: '恢复后出现「已从第 N 步继续」提示' })
    ctx.check(notice.includes(pausedStep.title), '提示写清从暂停步继续', pausedStep.title, notice)
    ctx.match(notice, /第\s*2\s*步/, '提示写明暂停步序号 2')

    const resumed = await waitFor(() => {
      const row = taskRow(taskId)
      return row && row.waiting_reason === '' && row.outcome !== 'budget_exceeded' ? row : null
    }, { timeoutMs: 30000, intervalMs: 200, label: '恢复后离开预算等待' })
    ctx.eq(resumed.waiting_reason, '', '恢复后 waitingReason 清空')
    ctx.check(resumed.outcome !== 'budget_exceeded', '恢复后 outcome 不再是 budget_exceeded', '!=budget_exceeded', resumed.outcome)
    const states = stepStates(taskId)
    ctx.eq(states[0].status, 'done', '恢复前已完成的第 1 步仍是 done（不重跑）')
    await waitFor(() => {
      const row = stepTiming().find((step) => step.id === pausedStep.id)
      return row && row.started_at > 0 ? row : null
    }, { timeoutMs: 30000, intervalMs: 200, label: '暂停步在恢复后开始执行' })
    const timingAfter = stepTiming()
    const resumedStep = timingAfter.find((step) => step.id === pausedStep.id)
    ctx.check(timingAfter.length === timingBefore.length, '恢复不增删步骤', timingBefore.length, timingAfter.length)
    ctx.check(doneBefore.every((before) => {
      const after = timingAfter.find((step) => step.id === before.id)
      return after && after.status === 'done' && Number(after.started_at) === Number(before.started_at) && Number(after.finished_at) === Number(before.finished_at)
    }), '已完成步骤起止时间未变（恢复未重写步骤表）', JSON.stringify(doneBefore.map((s) => [s.id, s.started_at, s.finished_at])), JSON.stringify(timingAfter.filter((s) => doneBefore.some((b) => b.id === s.id)).map((s) => [s.id, s.started_at, s.finished_at])))
    ctx.eq(stepEventCount(doneBefore[0].id), step1EventsBefore, '恢复后已完成步骤没有新的执行事件（不重跑）')
    ctx.check(Number(resumedStep.started_at) >= resumeClickAt - 2000, '恢复只从暂停步开始执行', `>= ${resumeClickAt - 2000}`, resumedStep.started_at)
    ctx.eq(taskRow(taskId).attempt, 1, '恢复不增加 attempt')
    const resumedBudget = JSON.parse(taskRow(taskId).budget_json || '{}')
    ctx.check(resumedBudget.maxSteps > 1, '恢复追加了预算窗口', '>1', String(resumedBudget.maxSteps))

    ctx.raw = { sessionId, taskId, dom, notice, budget, resumedBudget, progressBefore, states }
  } finally {
    if (client) client.close()
    await server.close()
  }
})

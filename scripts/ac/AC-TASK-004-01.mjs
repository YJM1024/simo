#!/usr/bin/env node
/**
 * AC-TASK-004-01：五级复杂度都可判定，并按等级派生任务与子会话
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-004-01。
 * 断言点：
 *   1) 5 次请求分别落在 C0/C1/C2/C3/C4，取值不越界；
 *   2) C0、C1 不建任务、不建子会话；
 *   3) C2 在当前会话建 1 个任务、0 个子会话；
 *   4) C3 建 1 个子会话且其中 1 个任务，父级 0 任务；
 *   5) C4 建 3–4 个子会话、每个子会话 1 个任务，父级 0 任务。
 * 夹具与清理：每次请求独立会话，数据留在隔离库。
 */
import { runAc, createSession, api, queryRows } from './lib/conv-backend.mjs'

const count = (sql, ...params) => queryRows(sql, params)[0].n

async function createPlan(sessionId, body) {
  return api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/task-plans`, body)
}

await runAc('AC-TASK-004-01', async (ctx) => {
  const cases = [
    { level: 'C0', body: { requestText: '现在几点', steps: ['回答'] } },
    { level: 'C1', body: { requestText: '改一个错别字', steps: ['定位', '修改'] } },
    { level: 'C2', body: { requestText: '整理季度数据', steps: ['取数', '清洗', '出表'] } },
    { level: 'C3', body: { requestText: '重构导出流程', multiRound: true, steps: ['梳理', '设计', '实现', '回归'] } },
    { level: 'C4', body: { requestText: '并行做三块', crossDomain: true, steps: ['一', '二', '三'] } },
  ]
  const sessions = {}
  const plans = {}
  const levels = []
  for (const item of cases) {
    const sessionId = await createSession(`AC-TASK-004-01 ${item.level}`)
    const res = await createPlan(sessionId, item.body)
    ctx.eq(res.status, 201, `${item.level} 分级请求返回 201`)
    const got = res.json && res.json.complexity
    levels.push(got)
    ctx.eq(got, item.level, `${item.level} 请求判定为 ${item.level}`)
    sessions[item.level] = sessionId
    plans[item.level] = res.json
    ctx.check(['C0', 'C1', 'C2', 'C3', 'C4'].includes(got), `${item.level} 等级在 C0–C4 内`, 'C0..C4', got)
  }

  // C0/C1：无任务、无方案、无子会话。
  for (const level of ['C0', 'C1']) {
    const sessionId = sessions[level]
    ctx.eq(plans[level] && plans[level].plan, null, `${level} 不生成方案卡`)
    ctx.eq(plans[level] && plans[level].requiresConfirmation, false, `${level} 不需要确认`)
    ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessionId), 0, `${level} 不建任务`)
    ctx.eq(count('SELECT COUNT(*) AS n FROM task_plans WHERE session_id = ?', sessionId), 0, `${level} 不写方案`)
    ctx.eq(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessionId), 0, `${level} 不建子会话`)
  }

  // C2：当前会话 1 任务。
  const c2 = await api('POST', `/api/sessions/${encodeURIComponent(sessions.C2)}/task-plans/${encodeURIComponent(plans.C2.planId)}/confirm`)
  ctx.eq(c2.status, 200, 'C2 确认返回 200')
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessions.C2), 1, 'C2 当前会话 1 个任务')
  ctx.eq(count('SELECT COUNT(*) AS n FROM sessions WHERE parent_id = ?', sessions.C2), 0, 'C2 不建子会话')

  // C3：1 子会话，其中 1 任务；父级 0。
  const c3 = await api('POST', `/api/sessions/${encodeURIComponent(sessions.C3)}/task-plans/${encodeURIComponent(plans.C3.planId)}/confirm`)
  ctx.eq(c3.status, 200, 'C3 确认返回 200')
  const c3Children = (c3.json && c3.json.childSessionIds) || []
  ctx.eq(c3Children.length, 1, 'C3 建 1 个子会话')
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessions.C3), 0, 'C3 父级 0 任务')
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', c3Children[0]), 1, 'C3 子会话 1 个任务')

  // C4：3–4 子会话，各 1 任务；父级 0。
  const c4 = await api('POST', `/api/sessions/${encodeURIComponent(sessions.C4)}/task-plans/${encodeURIComponent(plans.C4.planId)}/confirm`)
  ctx.eq(c4.status, 200, 'C4 确认返回 200')
  const c4Children = (c4.json && c4.json.childSessionIds) || []
  ctx.check(c4Children.length >= 3 && c4Children.length <= 4, 'C4 建 3–4 个子会话', '3..4', c4Children.length)
  ctx.eq(count('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', sessions.C4), 0, 'C4 父级 0 任务')
  const c4Tasks = count(
    `SELECT COUNT(*) AS n FROM tasks WHERE session_id IN (${c4Children.map(() => '?').join(',')})`,
    ...c4Children,
  )
  ctx.eq(c4Tasks, c4Children.length, 'C4 每个子会话各 1 个任务')

  ctx.raw = {
    levels,
    sessions,
    c2PlanId: plans.C2 && plans.C2.planId,
    c3PlanId: plans.C3 && plans.C3.planId,
    c4PlanId: plans.C4 && plans.C4.planId,
    childCounts: { C3: c3Children.length, C4: c4Children.length },
  }
})

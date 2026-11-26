#!/usr/bin/env node
/**
 * AC-TASK-002-02：概览三计数与按状态列表一致
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-002-02
 * 前置：隔离后端以 mock 模型运行；会话内有 2 running、1 queued、3 done。
 * 断言点：
 *   1) 列表接口 counts.running=2、counts.pending=1、counts.done=3、counts.all=6；
 *   2) GET .../tasks?status=running|queued|done 的 tasks.length 分别为 2/1/3，与 counts 对应相等；
 *   3) 投影接口 ?taskLimit=3 的 tasks.running/pending/done.total 分别为 2/1/3。
 * 夹具与清理：createSession + createBatch 建 6 条任务，逐条落库改状态；数据留在隔离库。
 */
import { runAc, createSession, createBatch, list, detail, api, execDb, waitFor, sleep } from './lib/conv-backend.mjs'

const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])
const PLAN = [
  ['running', 10],
  ['running', 40],
  ['queued', 0],
  ['done', 100],
  ['done', 100],
  ['done', 100],
]

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

async function pinTask(sessionId, id, status, progress) {
  for (let i = 0; i < 3; i += 1) {
    execDb('UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?', [status, progress, Date.now(), id])
    await sleep(100)
    const res = await detail(sessionId, id)
    const task = res.json && res.json.task
    if (task && task.status === status && task.progress === progress) return task
  }
  return null
}

await runAc('AC-TASK-002-02', async (ctx) => {
  const sessionId = await createSession('AC-TASK-002-02 概览计数一致性')
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证概览三计数与按状态列表一致。',
    tasks: PLAN.map(([status, progress], i) => ({
      key: `t${i + 1}`,
      title: `计数样本 ${i + 1}：${status}`,
      mode: 'plan',
      goal: `计数样本 ${i + 1}`,
    })),
    clientMutationId: `ac-002-02-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建 6 条任务返回 201')
  const ids = (created.json && created.json.tasks ? created.json.tasks : []).map((t) => t.id)
  ctx.eq(ids.length, 6, '创建响应含 6 条任务')

  await settle(sessionId)
  for (let i = 0; i < PLAN.length; i += 1) {
    await pinTask(sessionId, ids[i], PLAN[i][0], PLAN[i][1])
  }

  const all = await list(sessionId, '?limit=50')
  ctx.eq(all.status, 200, '全量列表返回 200')
  const counts = (all.json && all.json.counts) || {}
  ctx.eq(counts.all, 6, 'counts.all=6')
  ctx.eq(counts.running, 2, 'counts.running=2')
  ctx.eq(counts.pending, 1, 'counts.pending=1（queued 归入未开始）')
  ctx.eq(counts.done, 3, 'counts.done=3')

  const byStatus = {}
  for (const [status, expected] of [['running', 2], ['queued', 1], ['done', 3]]) {
    const res = await list(sessionId, `?status=${status}`)
    ctx.eq(res.status, 200, `status=${status} 列表返回 200`)
    const tasks = (res.json && res.json.tasks) || []
    byStatus[status] = tasks.length
    ctx.eq(tasks.length, expected, `status=${status} tasks.length=${expected}`)
    ctx.check(tasks.every((task) => task.status === status), `status=${status} 只返回该状态`, '全部同状态', JSON.stringify(tasks.map((task) => task.status)))
  }
  ctx.eq(counts.running, byStatus.running, 'counts.running 等于 status=running 列表长度')
  ctx.eq(counts.pending, byStatus.queued, 'counts.pending 等于 status=queued 列表长度')
  ctx.eq(counts.done, byStatus.done, 'counts.done 等于 status=done 列表长度')

  const pj = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/spec-projection?taskLimit=3`)
  ctx.eq(pj.status, 200, '投影接口返回 200')
  const groups = (pj.json && pj.json.tasks) || {}
  ctx.eq(groups.running && groups.running.total, 2, '投影 running.total=2')
  ctx.eq(groups.pending && groups.pending.total, 1, '投影 pending.total=1')
  ctx.eq(groups.done && groups.done.total, 3, '投影 done.total=3')
  ctx.eq(groups.done && Array.isArray(groups.done.items) ? groups.done.items.length : -1, 3, '投影 done.items 受 taskLimit=3 限制为 3 条')

  ctx.raw = { sessionId, ids, counts, byStatus, projectionTotals: { running: groups.running && groups.running.total, pending: groups.pending && groups.pending.total, done: groups.done && groups.done.total } }
})

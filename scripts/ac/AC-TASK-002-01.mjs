#!/usr/bin/env node
/**
 * AC-TASK-002-01：按状态读取任务与进度取值
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-002-01
 * 前置：隔离后端以 mock 模型运行；会话内有 done/running/queued 各 1 条。
 * 断言点：
 *   1) GET /api/sessions/S/tasks?status=done 只返回 done，progress=100；
 *   2) status=queued 只返回 queued，progress=0；
 *   3) status=running 只返回 running，progress 在 1..99；
 *   4) 会话内所有任务的 progress 都是 0..100 的整数，越界或非整数即失败。
 * 夹具与清理：createSession + createBatch 建 3 条任务，落库改状态；数据留在隔离库。
 */
import { runAc, createSession, createBatch, list, detail, execDb, waitFor, sleep } from './lib/conv-backend.mjs'

const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])
const STATUS_QUERY = { done: '?status=done', queued: '?status=queued', running: '?status=running' }

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

await runAc('AC-TASK-002-01', async (ctx) => {
  const sessionId = await createSession('AC-TASK-002-01 状态与进度取值')
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证按状态读任务与进度取值。',
    tasks: [
      { key: 't1', title: '进度样本：已完成', mode: 'plan' },
      { key: 't2', title: '进度样本：进行中', mode: 'plan' },
      { key: 't3', title: '进度样本：排队中', mode: 'plan' },
    ],
    clientMutationId: `ac-002-01-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建 3 条任务返回 201')
  const ids = (created.json && created.json.tasks ? created.json.tasks : []).map((t) => t.id)
  ctx.eq(ids.length, 3, '创建响应含 3 条任务')

  await settle(sessionId)
  await pinTask(sessionId, ids[0], 'done', 100)
  await pinTask(sessionId, ids[1], 'running', 40)
  await pinTask(sessionId, ids[2], 'queued', 0)

  const all = await list(sessionId, '?limit=50')
  ctx.eq(all.status, 200, '全量列表返回 200')
  const allTasks = (all.json && all.json.tasks) || []
  ctx.eq(allTasks.length, 3, '全量列表 3 条')
  ctx.check(allTasks.every((task) => Number.isInteger(task.progress) && task.progress >= 0 && task.progress <= 100), '所有任务 progress 为 0..100 的整数', '0..100 整数', JSON.stringify(allTasks.map((task) => task.progress)))

  const done = await list(sessionId, STATUS_QUERY.done)
  ctx.eq(done.status, 200, 'status=done 列表返回 200')
  const doneTasks = (done.json && done.json.tasks) || []
  ctx.eq(doneTasks.length, 1, 'status=done 返回 1 条')
  ctx.check(doneTasks.every((task) => task.status === 'done'), 'status=done 只返回 done', '全部 done', JSON.stringify(doneTasks.map((task) => task.status)))
  ctx.eq(doneTasks[0] && doneTasks[0].progress, 100, 'done 任务 progress=100')

  const queued = await list(sessionId, STATUS_QUERY.queued)
  ctx.eq(queued.status, 200, 'status=queued 列表返回 200')
  const queuedTasks = (queued.json && queued.json.tasks) || []
  ctx.eq(queuedTasks.length, 1, 'status=queued 返回 1 条')
  ctx.check(queuedTasks.every((task) => task.status === 'queued'), 'status=queued 只返回 queued', '全部 queued', JSON.stringify(queuedTasks.map((task) => task.status)))
  ctx.eq(queuedTasks[0] && queuedTasks[0].progress, 0, 'queued 任务 progress=0')

  const running = await list(sessionId, STATUS_QUERY.running)
  ctx.eq(running.status, 200, 'status=running 列表返回 200')
  const runningTasks = (running.json && running.json.tasks) || []
  ctx.eq(runningTasks.length, 1, 'status=running 返回 1 条')
  ctx.check(runningTasks.every((task) => task.status === 'running'), 'status=running 只返回 running', '全部 running', JSON.stringify(runningTasks.map((task) => task.status)))
  ctx.check(runningTasks.every((task) => Number.isInteger(task.progress) && task.progress >= 1 && task.progress <= 99), 'running 任务 progress 在 1..99', '1..99 整数', JSON.stringify(runningTasks.map((task) => task.progress)))

  ctx.raw = {
    sessionId,
    ids,
    progress: { done: doneTasks[0] && doneTasks[0].progress, queued: queuedTasks[0] && queuedTasks[0].progress, running: runningTasks[0] && runningTasks[0].progress },
    allProgress: allTasks.map((task) => ({ status: task.status, progress: task.progress })),
  }
})

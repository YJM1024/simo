#!/usr/bin/env node
/**
 * AC-CHG-CONV-007-02（判据 CT-CONV-540 / TC-P1-CONV-056）
 * graph-8：失败任务状态 failed、图节点 failReason 1 条、失败计数加 1；重试 1 次后 task_id 不变、
 * 不重复建行、attempt 加一；同会话其它任务不受影响。
 * 失败原因由执行器写入（real_executor.go:76-84 与 service.go:502-511），三类为「工具拒绝 / 步骤超时 / 执行器异常」。
 */
import { runAc, createSession, createBatch, detail, graph, api, list, waitFor, queryRows } from './lib/conv-backend.mjs'

await runAc('AC-CHG-CONV-007-02', async (ctx) => {
  const sessionId = await createSession('AC-CHG-CONV-007-02 graph-8 失败重试')
  const created = await createBatch(sessionId, {
    mode: 'plan', goal: '失败重试不重建行。',
    tasks: [
      { key: 'f', title: 'mock:fail 图节点失败任务', mode: 'plan', goal: '模拟失败。', steps: ['准备', '执行', '收尾'] },
      { key: 'o', title: '同会话其它任务', mode: 'plan', goal: '不受影响。', steps: ['执行'] },
    ],
    clientMutationId: 'ac-chg-02',
  })
  ctx.eq(created.status, 201, '夹具批次创建 201')
  const bad = created.json.tasks.find((t) => t.title.startsWith('mock:fail'))
  const other = created.json.tasks.find((t) => t.title === '同会话其它任务')

  const failed = await waitFor(async () => {
    const res = await detail(sessionId, bad.id)
    return res.json.task.status === 'failed' ? res.json.task : null
  }, { timeoutMs: 40000, label: '失败任务 failed' })
  ctx.eq(failed.status, 'failed', '失败任务状态 failed')
  ctx.check(Boolean(failed.failReason), '失败原因 1 条（failReason 非空）', '非空', JSON.stringify(failed.failReason))

  // 「失败计数加 1」要在失败态、重试之前采样：重试会把任务改回 queued，failed 计数随之回落。
  const listedAtFailure = await list(sessionId)
  const countsFailedAtFailure = (listedAtFailure.json.counts && listedAtFailure.json.counts.failed) || 0
  ctx.check(countsFailedAtFailure >= 1, '失败计数加 1（失败态下 counts.failed≥1）',
    '>=1', String(countsFailedAtFailure))
  const countsAllAtFailure = (listedAtFailure.json.counts && listedAtFailure.json.counts.all) || 0
  ctx.eq(countsAllAtFailure, 2, '失败时任务总数仍为 2（不重复建行）')

  const g = await graph(sessionId)
  const node = (g.json.nodes || []).find((n) => n.id === bad.id)
  ctx.check(Boolean(node && node.failReason), '图节点带 failReason', '非空', JSON.stringify(node && node.failReason))
  ctx.eq(node && node.displayStatus, 'failed', '图节点 displayStatus=failed')

  const rowsBefore = queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', [sessionId])[0].n
  const retried = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${bad.id}/retry`, {})
  ctx.eq(retried.status, 200, '重试 200')
  ctx.eq(retried.json.task && retried.json.task.id, bad.id, '重试后 task_id 不变')
  ctx.eq(retried.json.attempt, 2, '重试后 attempt=2')
  const rowsAfter = queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', [sessionId])[0].n
  ctx.eq(rowsAfter, rowsBefore, '重试不重复建行')
  const again = await detail(sessionId, bad.id)
  ctx.check(again.json.task.status !== 'cancelled', '重试后任务继续执行', '非 cancelled', again.json.task.status)

  const otherDone = await waitFor(async () => {
    const res = await detail(sessionId, other.id)
    return res.json.task.status === 'done' ? res.json.task : null
  }, { timeoutMs: 30000, label: '其它任务 done' })
  ctx.eq(otherDone.status, 'done', '同会话其它任务不受影响（done）')

  // 失败原因归三类（real_executor.go 末尾 failureReason）：工具拒绝 / 步骤超时 / 执行器异常。
  ctx.check(/^(工具拒绝|步骤超时|执行器异常):/.test(String(failed.failReason || '')),
    '失败原因属于三类之一', '工具拒绝/步骤超时/执行器异常 前缀', JSON.stringify(String(failed.failReason || '').slice(0, 80)))

  const againAfterRetry = again

  ctx.raw = {
    sessionId, badTaskId: bad.id, otherTaskId: other.id,
    status: failed.status, failReason: failed.failReason || '', graphFailReason: node && node.failReason,
    countsFailedAtFailure, countsAllAtFailure,
    attemptAfterRetry: retried.json.attempt, taskRowsBefore: rowsBefore, taskRowsAfter: rowsAfter,
    statusAfterRetry: againAfterRetry.json.task.status,
  }
})

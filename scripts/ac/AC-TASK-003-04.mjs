#!/usr/bin/env node
/**
 * AC-TASK-003-04：重启不重复写开始消息
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-003-04；口径见 DEC-41/DEC-42。
 * 前置：任务 T 处于 running，开始消息已写 1 条、结束消息 0 条。
 * 断言点：
 *   1) 重启前：开始消息 1 条、结束消息 0 条、endMessageId 为空；
 *   2) 重启后：T 变为 interrupted，开始消息仍 1 条、结束消息 0 条、endMessageId 仍为空；
 *   3) 重试后：开始消息增为 2 条（新 attempt 重新开始），结束消息仍 0 条、endMessageId 仍为空。
 * 夹具说明：任务进入 running 时会写 dispatch 恢复点；DEC-42 的 running→interrupted 分支
 * 只在没有恢复点时成立，因此重启前删掉该任务的 runtime_checkpoints 行，模拟恢复点未落盘。
 * 本脚本必须单脚本模式运行（cdp 组），重启会杀掉当前实例。
 * 夹具与清理：数据留在隔离库；实例由 runAc 收尾停止。
 */
import { runAc, createSession, createBatch, detail, list, api, execDb, waitFor, waitTaskStatus, restartBackend } from './lib/conv-backend.mjs'

const START_PREFIX = '任务开始：'
const END_PREFIX = '任务结束：'

async function messagesOf(sessionId) {
  const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  if (res.status !== 200) return []
  return (res.json && res.json.messages) || []
}

function countNotice(messages, taskId, prefix) {
  return messages.filter((msg) => msg.taskId === taskId && msg.category === 'progress' && String(msg.text || '').startsWith(prefix)).length
}

await runAc('AC-TASK-003-04', async (ctx) => {
  const sessionId = await createSession('AC-TASK-003-04 重启不重复写开始消息')
  const title = '重启恢复样本：长任务'
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证重启后开始消息不重复、结束消息不补写。',
    tasks: [{ key: 't1', title, mode: 'plan' }],
    clientMutationId: `ac-003-04-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建任务返回 201')
  const task = created.json && created.json.tasks && created.json.tasks[0]
  ctx.check(Boolean(task && task.id), '创建响应含任务 id', 'task.id', JSON.stringify(created.json && created.json.tasks))

  await waitTaskStatus(sessionId, task.id, ['running'], 45000)
  const before = await waitFor(async () => {
    const detailRes = await detail(sessionId, task.id)
    const current = detailRes.json && detailRes.json.task
    if (!current || !current.reportMessageId) return null
    const messages = await messagesOf(sessionId)
    return countNotice(messages, task.id, START_PREFIX) === 1 ? { current, messages } : null
  }, { timeoutMs: 30000, intervalMs: 300, label: '重启前开始消息落库' })

  ctx.eq(before.current.status, 'running', '重启前任务为 running')
  ctx.eq(countNotice(before.messages, task.id, START_PREFIX), 1, '重启前开始消息 1 条')
  ctx.eq(countNotice(before.messages, task.id, END_PREFIX), 0, '重启前结束消息 0 条')
  ctx.eq(before.current.endMessageId || '', '', '重启前 endMessageId 为空')

  execDb('DELETE FROM runtime_checkpoints WHERE scope = ? AND ref_id = ?', ['task', task.id])
  await restartBackend('AC-TASK-003-04')

  const afterRestart = await waitFor(async () => {
    const detailRes = await detail(sessionId, task.id)
    if (detailRes.status !== 200) return null
    const current = detailRes.json && detailRes.json.task
    return current && current.status === 'interrupted' ? current : null
  }, { timeoutMs: 45000, intervalMs: 300, label: '重启后任务变 interrupted' })

  const messagesAfterRestart = await messagesOf(sessionId)
  ctx.eq(afterRestart.status, 'interrupted', '重启后任务变 interrupted')
  ctx.eq(countNotice(messagesAfterRestart, task.id, START_PREFIX), 1, '重启后开始消息仍 1 条')
  ctx.eq(countNotice(messagesAfterRestart, task.id, END_PREFIX), 0, '重启后结束消息 0 条')
  ctx.eq(afterRestart.endMessageId || '', '', '重启后 endMessageId 仍为空')

  const retry = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${encodeURIComponent(task.id)}/retry`, {})
  ctx.eq(retry.status, 200, '重试返回 200')
  const retried = retry.json && retry.json.task
  ctx.eq(retried && retried.endMessageId || '', '', '重试响应 endMessageId 为空')

  const secondStart = await waitFor(async () => {
    const messages = await messagesOf(sessionId)
    return countNotice(messages, task.id, START_PREFIX) >= 2 ? messages : null
  }, { timeoutMs: 45000, intervalMs: 250, label: '重试后第二条开始消息' })

  const detailRes = await detail(sessionId, task.id)
  const current = detailRes.json && detailRes.json.task
  ctx.eq(countNotice(secondStart, task.id, START_PREFIX), 2, '重试后开始消息增为 2 条')
  ctx.eq(countNotice(secondStart, task.id, END_PREFIX), 0, '重试后结束消息仍 0 条')
  ctx.eq(current && current.endMessageId || '', '', '重试后 endMessageId 仍为空')

  const listed = await list(sessionId, '?limit=50')
  const listedTask = ((listed.json && listed.json.tasks) || []).find((item) => item.id === task.id)
  ctx.check(Boolean(listedTask), '任务仍在会话任务列表里', task.id, JSON.stringify(((listed.json && listed.json.tasks) || []).map((item) => item.id)))

  ctx.raw = {
    sessionId,
    taskId: task.id,
    before: { status: before.current.status, starts: 1, ends: 0, endMessageId: before.current.endMessageId },
    afterRestart: { status: afterRestart.status, starts: countNotice(messagesAfterRestart, task.id, START_PREFIX), ends: countNotice(messagesAfterRestart, task.id, END_PREFIX), endMessageId: afterRestart.endMessageId },
    afterRetry: { status: current && current.status, attempt: current && current.attempt, starts: countNotice(secondStart, task.id, START_PREFIX), ends: countNotice(secondStart, task.id, END_PREFIX), endMessageId: current && current.endMessageId },
  }
})

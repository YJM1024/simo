#!/usr/bin/env node
/**
 * AC-TASK-003-02：开始消息落库
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-003-02。
 * 前置：任务 T 由 queued 进入 running。
 * 断言点：
 *   1) 会话消息里出现 1 条 role=agent、category=progress、taskId=T 的开始消息；
 *   2) 正文含任务标题，reportMessageId 等于该消息 id；
 *   3) 开始消息与任务卡消息并存，任务卡不被替换；
 *   4) 同一任务只有 1 条开始消息（重复调用不补写）。
 * 夹具与清理：createSession + createBatch 建单任务，等任务进入 running 后读取；数据留在隔离库。
 */
import { runAc, createSession, createBatch, detail, api, waitFor, waitTaskStatus } from './lib/conv-backend.mjs'

const START_PREFIX = '任务开始：'

async function messagesOf(sessionId) {
  const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  if (res.status !== 200) return []
  return (res.json && res.json.messages) || []
}

await runAc('AC-TASK-003-02', async (ctx) => {
  const sessionId = await createSession('AC-TASK-003-02 开始消息落库')
  const title = '开始消息样本：写季度总结'
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证任务开始时写一条进度消息。',
    tasks: [{ key: 't1', title, mode: 'plan' }],
    clientMutationId: `ac-003-02-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建任务返回 201')
  const task = created.json && created.json.tasks && created.json.tasks[0]
  ctx.check(Boolean(task && task.id), '创建响应含任务 id', 'task.id', JSON.stringify(created.json && created.json.tasks))

  const running = await waitTaskStatus(sessionId, task.id, ['running'], 45000)
  ctx.eq(running.task.status, 'running', '任务进入 running')

  const found = await waitFor(async () => {
    const detailRes = await detail(sessionId, task.id)
    const current = detailRes.json && detailRes.json.task
    if (!current || !current.reportMessageId) return null
    const messages = await messagesOf(sessionId)
    const start = messages.find((msg) => msg.id === current.reportMessageId)
    return start ? { current, messages, start } : null
  }, { timeoutMs: 30000, intervalMs: 300, label: '开始消息落库' })

  const { current, messages, start } = found
  ctx.eq(start.role, 'agent', '开始消息 role=agent')
  ctx.eq(start.category, 'progress', '开始消息 category=progress')
  ctx.eq(start.taskId, task.id, '开始消息 taskId 指向任务')
  ctx.check(String(start.text || '').includes(title), '开始消息正文含任务标题', title, start.text)
  ctx.check(String(start.text || '').startsWith(START_PREFIX), '开始消息正文以「任务开始：」开头', START_PREFIX, start.text)
  ctx.eq(current.reportMessageId, start.id, 'reportMessageId 等于开始消息 id')

  const starts = messages.filter((msg) => msg.taskId === task.id && msg.category === 'progress' && String(msg.text || '').startsWith(START_PREFIX))
  ctx.eq(starts.length, 1, '该任务只有 1 条开始消息')

  const card = messages.find((msg) => msg.category === 'task' && (msg.taskId === task.id || (created.json && msg.batchId === created.json.batchId)))
  ctx.check(Boolean(card), '任务卡消息仍存在（开始消息不替代任务卡）', 'category=task 且 taskId/batchId 匹配', JSON.stringify(messages.filter((msg) => msg.category === 'task').map((msg) => ({ id: msg.id, taskId: msg.taskId, batchId: msg.batchId }))))

  ctx.raw = {
    sessionId,
    taskId: task.id,
    startMessageId: start.id,
    reportMessageId: current.reportMessageId,
    startText: start.text,
    startCount: starts.length,
    taskCardId: card && card.id,
  }
})

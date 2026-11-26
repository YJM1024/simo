#!/usr/bin/env node
/**
 * AC-TASK-003-03：结束消息落库且不重复
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-003-03。
 * 前置：任务 T 执行成功进入 done，且至少产生 1 个产物。
 * 断言点：
 *   1) task_id=T 的结束消息恰好 1 条，正文含状态、结论与至少 1 个产物名；
 *   2) task.endMessageId 等于该消息 id；
 *   3) task.reportMessageId 仍指向开始消息，没有被结束消息覆盖；
 *   4) 终态后 30 秒内该 taskId 的消息数不再增加。
 * 说明：第 4 条按 spec 原文保留 30 秒观察窗口。消息写入由终态事务一次性完成，
 * 没有可注入的时钟参与判定，因此这里真实等待 30 秒而不是推进测试时钟。
 * 夹具与清理：createSession + createBatch 建单任务，等 done 后读取；数据留在隔离库。
 */
import { runAc, createSession, createBatch, detail, api, queryRows, sleep, waitTaskStatus } from './lib/conv-backend.mjs'

const START_PREFIX = '任务开始：'
const END_PREFIX = '任务结束：'

async function messagesOf(sessionId) {
  const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  if (res.status !== 200) return []
  return (res.json && res.json.messages) || []
}

await runAc('AC-TASK-003-03', async (ctx) => {
  const sessionId = await createSession('AC-TASK-003-03 结束消息落库')
  const title = '结束消息样本：生成季度报告'
  const created = await createBatch(sessionId, {
    mode: 'plan',
    goal: '验证任务结束时写一条带结论与产物的进度消息。',
    tasks: [{ key: 't1', title, mode: 'plan' }],
    clientMutationId: `ac-003-03-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建任务返回 201')
  const task = created.json && created.json.tasks && created.json.tasks[0]
  ctx.check(Boolean(task && task.id), '创建响应含任务 id', 'task.id', JSON.stringify(created.json && created.json.tasks))

  const done = await waitTaskStatus(sessionId, task.id, ['done'], 120000)
  ctx.eq(done.task.status, 'done', '任务执行成功进入 done')

  const messages = await messagesOf(sessionId)
  const endMessages = messages.filter((msg) => msg.taskId === task.id && msg.category === 'progress' && String(msg.text || '').startsWith(END_PREFIX))
  ctx.eq(endMessages.length, 1, '结束消息恰好 1 条')
  const end = endMessages[0]
  ctx.check(Boolean(end), '结束消息存在', '1 条', String(endMessages.length))
  if (!end) {
    ctx.raw = { sessionId, taskId: task.id, messages: messages.map((msg) => ({ id: msg.id, category: msg.category, text: msg.text })) }
    return
  }
  ctx.eq(end.role, 'agent', '结束消息 role=agent')
  ctx.eq(end.category, 'progress', '结束消息 category=progress')
  ctx.check(String(end.text || '').includes('状态：已完成'), '结束消息含终态', '状态：已完成', end.text)
  ctx.check(String(end.text || '').includes('结论：'), '结束消息含结论', '结论：', end.text)

  const artifacts = queryRows('SELECT name FROM task_artifacts WHERE task_id = ?', [task.id])
  ctx.check(artifacts.length >= 1, '任务至少有 1 个产物', '>=1', String(artifacts.length))
  ctx.check(artifacts.every((artifact) => String(end.text || '').includes(artifact.name)), '结束消息正文含产物名', JSON.stringify(artifacts.map((artifact) => artifact.name)), end.text)
  ctx.check(!String(end.text || '').includes('产物：无'), '结束消息的产物不是「无」', '有产物名', end.text)

  ctx.eq(done.task.endMessageId, end.id, 'task.endMessageId 等于结束消息 id')
  const start = messages.find((msg) => msg.id === done.task.reportMessageId)
  ctx.check(Boolean(start), 'reportMessageId 仍能找到开始消息', done.task.reportMessageId, JSON.stringify(messages.filter((msg) => msg.taskId === task.id).map((msg) => msg.id)))
  ctx.check(Boolean(start) && String(start.text || '').startsWith(START_PREFIX), 'reportMessageId 指向开始消息而不是结束消息', START_PREFIX, start && start.text)

  const countBefore = messages.filter((msg) => msg.taskId === task.id).length
  await sleep(30000)
  const after = await messagesOf(sessionId)
  const countAfter = after.filter((msg) => msg.taskId === task.id).length
  ctx.eq(countAfter, countBefore, '终态后 30 秒内该任务消息数不再增加')

  ctx.raw = {
    sessionId,
    taskId: task.id,
    endMessageId: end.id,
    endText: end.text,
    reportMessageId: done.task.reportMessageId,
    artifacts: artifacts.map((artifact) => artifact.name),
    countBefore,
    countAfter,
    waitedMs: 30000,
  }
})

#!/usr/bin/env node
/**
 * AC-CONV-009-03（判据 CT-CONV-523 / TC-P1-CONV-039）
 * history-20：会话已有 20 条历史消息时发起任务，详情 context 仍为
 * historyCount=0、goal 与请求一致、constraints 至少 1 条、inputs 继承发起会话。
 * 负例：traceLimit=0/501、traceBefore=-1 → 400 invalid_task_limit。
 */
import { runAc, createSession, createBatch, detail, seedHistory, queryRows } from './lib/conv-backend.mjs'

await runAc('AC-CONV-009-03', async (ctx) => {
  const sessionId = await createSession('AC-CONV-009-03 历史 20 条')
  seedHistory(sessionId, 20)
  const historyRows = queryRows('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?', [sessionId])
  ctx.eq(historyRows[0].n, 20, '夹具：会话内已有 20 条历史消息')

  const goal = '在 20 条历史消息之后发起任务，上下文只带目标与约束。'
  const inputs = ['历史消息 1 到 20 不应进入任务上下文。', '只注入本次显式输入。']
  const constraints = ['不读取历史消息正文。', '产物只落在本会话。']
  const created = await createBatch(sessionId, {
    mode: 'plan', goal, inputs, constraints,
    tasks: [{ key: 't1', title: '历史 20 条后发起任务', mode: 'plan' }],
    clientMutationId: 'ac-conv-009-03',
  })
  ctx.eq(created.status, 201, '创建任务 201')
  const taskId = created.json.tasks[0].id
  const taskGoal = created.json.tasks[0].goal

  const res = await detail(sessionId, taskId)
  ctx.eq(res.status, 200, '详情 200')
  const ctxBody = (res.json && res.json.context) || {}
  ctx.eq(ctxBody.historyCount, 0, 'context.historyCount=0')
  ctx.eq(ctxBody.goal, taskGoal, 'context.goal 与任务目标一致（恰 1 条）')
  ctx.check(Boolean(taskGoal), '任务带非空目标', '非空', JSON.stringify(taskGoal))
  ctx.check(Array.isArray(ctxBody.constraints) && ctxBody.constraints.length >= 1, 'context.constraints 至少 1 条', '>=1', Array.isArray(ctxBody.constraints) ? ctxBody.constraints.length : 'not-array')
  ctx.check(Array.isArray(ctxBody.inputs) && ctxBody.inputs.length === inputs.length, 'context.inputs 继承发起会话', inputs.length, Array.isArray(ctxBody.inputs) ? ctxBody.inputs.length : 'not-array')
  const text = JSON.stringify(ctxBody)
  ctx.check(!text.includes('HIST-MESSAGE-'), 'context 不含历史消息正文', '不含 HIST-MESSAGE-', '包含')

  const stepRows = queryRows('SELECT COUNT(*) AS n FROM task_steps WHERE task_id = ?', [taskId])
  ctx.check(stepRows[0].n >= 1, '任务至少 1 个步骤', '>=1', stepRows[0].n)

  for (const [query, label] of [['?traceLimit=0', 'traceLimit=0'], ['?traceLimit=501', 'traceLimit=501'], ['?traceBefore=-1', 'traceBefore=-1']]) {
    const bad = await detail(sessionId, taskId, query)
    ctx.eq(bad.status, 400, `${label} 返回 400`)
    ctx.eq(bad.json && bad.json.code, 'invalid_task_limit', `${label} 失败码 invalid_task_limit`)
  }

  ctx.raw = { sessionId, taskId, context: ctxBody }
})

#!/usr/bin/env node
/**
 * AC-TASK-003-05：单任务与工作流消息同构
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-003-05。
 * 前置：一条 workflow 任务（POST /api/actions/workflow.start）与一条非 workflow 单任务各跑完。
 * 断言点：
 *   1) 两条任务都有结束消息，且 task.endMessageId 分别等于各自消息 id；
 *   2) 两条消息的字段名集合相同（workflowId 是唯一允许的差异键）；
 *   3) 两条消息都带 taskId、category=progress，正文都有产物名。
 * 夹具与清理：两个隔离会话各建一个任务；workflow.start 属 R3 动作，脚本先按本机审批流程
 * 批准一次（allow_session），批准时动作已执行，直接使用其结果，避免重复建工作流；
 * 启动前把隔离库遗留的未终态任务置为 cancelled，释放工作流并发槽位。数据留在隔离库。
 */
import { runAc, createSession, createBatch, detail, api, execDb, queryRows, waitTaskStatus } from './lib/conv-backend.mjs'

const END_PREFIX = '任务结束：'

async function messagesOf(sessionId) {
  const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  if (res.status !== 200) return []
  return (res.json && res.json.messages) || []
}

async function endMessageOf(sessionId, taskId) {
  const detailRes = await detail(sessionId, taskId)
  const task = detailRes.json && detailRes.json.task
  const messages = await messagesOf(sessionId)
  const message = messages.find((item) => item.id === (task && task.endMessageId))
  return { task, messages, message }
}

async function startWorkflow(ctx, sessionId, title) {
  const body = { sessionId, title }
  let response = await api('POST', '/api/actions/workflow.start', body, 20000)
  if (response.status === 409) {
    const approvalId = response.json && response.json.error && response.json.error.approvalId
    ctx.check(Boolean(approvalId), 'workflow.start 返回审批请求', 'approvalId', JSON.stringify(response.json))
    const decision = await api('POST', `/api/approvals/${encodeURIComponent(approvalId || '')}`, { decision: 'allow_session' }, 20000)
    ctx.eq(decision.status, 200, '本机批准 workflow.start')
    // 批准时动作工具已经执行，结果里就是新建的工作流；再发一次会多建一个工作流。
    let approved = null
    if (typeof decision.json?.result === 'string') {
      try { approved = JSON.parse(decision.json.result) } catch { approved = null }
    }
    if (approved && approved.id) return { status: 200, json: { ok: true, data: approved } }
    response = await api('POST', '/api/actions/workflow.start', body, 20000)
  }
  return response
}

await runAc('AC-TASK-003-05', async (ctx) => {
  // 隔离库里前几条脚本可能留下未终态任务，它们占用工作流并发槽位；先释放槽位再起工作流。
  execDb("UPDATE tasks SET status = 'cancelled', outcome = 'cancelled', summary = 'AC 夹具清理：释放并发槽位', updated_at = ? WHERE status IN ('queued', 'running')", [Date.now()])
  const workflowSession = await createSession('AC-TASK-003-05 工作流任务')
  const started = await startWorkflow(ctx, workflowSession, '同构样本：工作流任务')
  ctx.eq(started.status, 200, '启动工作流返回 200')
  const workflow = started.json && started.json.data
  ctx.check(Boolean(workflow && workflow.id), '工作流响应含 id', 'workflow.id', JSON.stringify(started.json && started.json.data).slice(0, 300))
  const workflowTaskID = workflow && workflow.tasks && workflow.tasks[0] && workflow.tasks[0].id
  ctx.check(Boolean(workflowTaskID), '工作流响应含任务 id', 'tasks[0].id', JSON.stringify(workflow && workflow.tasks))

  await waitTaskStatus(workflowSession, workflowTaskID, ['done'], 60000)

  const singleSession = await createSession('AC-TASK-003-05 非工作流单任务')
  const created = await createBatch(singleSession, {
    mode: 'plan',
    goal: '同构对照：非工作流单任务。',
    tasks: [{ key: 't1', title: '同构样本：非工作流单任务', mode: 'plan' }],
    clientMutationId: `ac-003-05-${Date.now()}`,
  })
  ctx.eq(created.status, 201, '创建单任务返回 201')
  const singleTaskID = created.json && created.json.tasks && created.json.tasks[0] && created.json.tasks[0].id
  ctx.check(Boolean(singleTaskID), '创建响应含单任务 id', 'task.id', JSON.stringify(created.json && created.json.tasks))
  await waitTaskStatus(singleSession, singleTaskID, ['done'], 45000)

  const workflowEnd = await endMessageOf(workflowSession, workflowTaskID)
  const singleEnd = await endMessageOf(singleSession, singleTaskID)

  ctx.check(Boolean(workflowEnd.message), '工作流任务有结束消息', '1 条', JSON.stringify((workflowEnd.messages || []).map((item) => ({ id: item.id, end: item.id === (workflowEnd.task && workflowEnd.task.endMessageId) }))))
  ctx.check(Boolean(singleEnd.message), '非工作流单任务有结束消息', '1 条', JSON.stringify((singleEnd.messages || []).map((item) => ({ id: item.id, end: item.id === (singleEnd.task && singleEnd.task.endMessageId) }))))
  if (!workflowEnd.message || !singleEnd.message) {
    ctx.raw = { workflowSession, singleSession, workflowTaskID, singleTaskID }
    return
  }
  ctx.eq(workflowEnd.task.endMessageId, workflowEnd.message.id, '工作流任务 endMessageId 指向其结束消息')
  ctx.eq(singleEnd.task.endMessageId, singleEnd.message.id, '单任务 endMessageId 指向其结束消息')
  ctx.eq(workflowEnd.message.taskId, workflowTaskID, '工作流结束消息带正确 taskId')
  ctx.eq(singleEnd.message.taskId, singleTaskID, '单任务结束消息带正确 taskId')
  ctx.eq(workflowEnd.message.category, 'progress', '工作流结束消息 category=progress')
  ctx.eq(singleEnd.message.category, 'progress', '单任务结束消息 category=progress')

  const keysOf = (message) => Object.keys(message).filter((key) => key !== 'workflowId').sort()
  const workflowKeys = keysOf(workflowEnd.message)
  const singleKeys = keysOf(singleEnd.message)
  const onlyWorkflow = workflowKeys.filter((key) => !singleKeys.includes(key))
  const onlySingle = singleKeys.filter((key) => !workflowKeys.includes(key))
  ctx.eq(onlyWorkflow.length, 0, '工作流结束消息没有单任务缺失的字段')
  ctx.eq(onlySingle.length, 0, '单任务结束消息没有工作流缺失的字段')
  ctx.check(Boolean(workflowEnd.message.workflowId), '工作流结束消息带 workflowId', '非空', workflowEnd.message.workflowId)
  ctx.check(!singleEnd.message.workflowId, '单任务结束消息不带 workflowId', '空', singleEnd.message.workflowId)

  const workflowArtifacts = queryRows('SELECT name FROM task_artifacts WHERE task_id = ?', [workflowTaskID])
  const singleArtifacts = queryRows('SELECT name FROM task_artifacts WHERE task_id = ?', [singleTaskID])
  ctx.check(workflowArtifacts.length >= 1, '工作流任务至少有 1 个产物', '>=1', String(workflowArtifacts.length))
  ctx.check(singleArtifacts.length >= 1, '单任务至少有 1 个产物', '>=1', String(singleArtifacts.length))
  ctx.check(workflowArtifacts.some((artifact) => String(workflowEnd.message.text || '').includes(artifact.name)), '工作流结束消息正文含产物名', JSON.stringify(workflowArtifacts.map((artifact) => artifact.name)), workflowEnd.message.text)
  ctx.check(singleArtifacts.some((artifact) => String(singleEnd.message.text || '').includes(artifact.name)), '单任务结束消息正文含产物名', JSON.stringify(singleArtifacts.map((artifact) => artifact.name)), singleEnd.message.text)
  ctx.check(String(workflowEnd.message.text || '').startsWith(END_PREFIX), '工作流结束消息以「任务结束：」开头', END_PREFIX, workflowEnd.message.text)
  ctx.check(String(singleEnd.message.text || '').startsWith(END_PREFIX), '单任务结束消息以「任务结束：」开头', END_PREFIX, singleEnd.message.text)

  ctx.raw = {
    workflowSession,
    singleSession,
    workflowTaskID,
    singleTaskID,
    workflowEnd: { id: workflowEnd.message.id, taskId: workflowEnd.message.taskId, workflowId: workflowEnd.message.workflowId, keys: workflowKeys, text: workflowEnd.message.text },
    singleEnd: { id: singleEnd.message.id, taskId: singleEnd.message.taskId, workflowId: singleEnd.message.workflowId || '', keys: singleKeys, text: singleEnd.message.text },
    workflowArtifacts: workflowArtifacts.map((artifact) => artifact.name),
    singleArtifacts: singleArtifacts.map((artifact) => artifact.name),
  }
})

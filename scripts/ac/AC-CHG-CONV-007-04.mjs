#!/usr/bin/env node
/**
 * AC-CHG-CONV-007-04（判据 CT-CONV-542 / TC-P1-CONV-058）
 * sessions-a-b/tools-403：权限外请求 403 一次、合法请求成功一次，都不写产出；B 三处计数 0；
 * B 的会话段请求 A 详情 404 且不返回正文；构造越权后端仍拒绝。
 * 驱动方式：后端 real 模式 + 假上游 8790（mock-llm --mode tools：首轮两个 tool_calls，第二轮文本），
 * 任务进入 running + waitingReason=confirmation 后调用确认接口放行，再断言轨迹与产出抑制。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  runAc, AcError, HOME, createSession, createBatch, detail, list, graph, api,
  waitTaskStatus, waitTaskWaiting, confirmTask, queryRows,
} from './lib/conv-backend.mjs'

await runAc('AC-CHG-CONV-007-04', async (ctx) => {
  // 前置清理：上一轮遗留的 notes/ac-04-output.md 会让 write 工具返回「写前未 read」错误，
  // 从而改变 action 轨迹条数。按文件安全规则移入隔离目录，不就地删除。
  const outputFile = path.join(HOME, 'workspace', 'notes', 'ac-04-output.md')
  if (fs.existsSync(outputFile)) {
    const trashDir = path.join('E:', 'dsh_home', 'trash', 'pending-delete', 'ac-conv-009', 'workspace', 'notes')
    fs.mkdirSync(trashDir, { recursive: true })
    fs.renameSync(outputFile, path.join(trashDir, `ac-chg-04-output.md.${Date.now()}`))
  }

  const sessionA = await createSession('AC-CHG-CONV-007-04 会话 a')
  const created = await createBatch(sessionA, {
    mode: 'react',
    goal: '越权被拒且不写产出。',
    inputs: ['tools-403 夹具：一次合法请求与一次权限外请求。'],
    constraints: ['越权不落产出。'],
    tasks: [
      { key: 't', title: 'tools-403：越权与合法请求', mode: 'react', goal: '调用工具。', steps: ['准备', '调用', '收尾'] },
    ],
    clientMutationId: 'ac-chg-04',
  })
  if (created.status !== 201) {
    ctx.raw = { createStatus: created.status, createBody: created.text.slice(0, 200) }
    throw new AcError('R-BUILD', '创建 react 任务失败，无法验证越权链路',
      '201 且 tasks[0].id 非空', created.status + ' ' + created.text.slice(0, 120))
  }
  const task = created.json.tasks[0]

  // 审批门：等待 running+confirmation → 确认 → 等终态。
  const confirmations = []
  let done = null
  for (let round = 0; round < 3; round += 1) {
    const gate = await waitTaskWaiting(sessionA, task.id, 'confirmation', 30000)
    ctx.eq(gate.task.waitingReason, 'confirmation', `第 ${round + 1} 次审批等待原因`)
    const conf = await confirmTask(sessionA, task.id, 'confirm', 'AC-CHG-CONV-007-04 放行')
    ctx.eq(conf.status, 200, `第 ${round + 1} 次确认接口 200`)
    confirmations.push(round + 1)
    try {
      done = await waitTaskStatus(sessionA, task.id, ['done', 'failed'], 12000)
      break
    } catch { /* 继续下一轮确认 */ }
  }
  if (!done) done = await waitTaskStatus(sessionA, task.id, ['done', 'failed'], 60000)
  ctx.eq(done.task.status, 'done', '越权与合法请求都执行完，任务 done')

  const traces = queryRows('SELECT category, tool, text FROM task_traces WHERE task_id = ? ORDER BY seq', [task.id])
  const denied = traces.filter((t) => t.category === 'observe' && String(t.text || '').startsWith('403 '))
  const actions = traces.filter((t) => t.category === 'action')
  ctx.eq(denied.length, 1, '权限外请求 403 恰 1 次')
  ctx.check(/403 permission_denied/.test(String(denied[0] && denied[0].text)), '越权轨迹带 permission_denied 失败码',
    '403 permission_denied…', String(denied[0] && denied[0].text).slice(0, 80))
  ctx.eq(actions.length, 1, '合法请求成功恰 1 次')

  // 产出抑制：工具写了工作区文件，但不得登记为用户交付物；task_artifacts 不得因越权新增。
  const userFiles = queryRows("SELECT id FROM task_artifacts WHERE task_id = ? AND delivery_kind = 'user_delivery'", [task.id])
  ctx.eq(userFiles.length, 0, '不写用户交付物（task_artifacts user_delivery 0 条）')
  const detailA = await detail(sessionA, task.id)
  ctx.eq((detailA.json.deliverables || []).length, 0, '详情 deliverables 为空')

  const sessionB = await createSession('AC-CHG-CONV-007-04 会话 b')
  const listB = await list(sessionB)
  const graphB = await graph(sessionB)
  const delivB = await api('GET', `/api/sessions/${encodeURIComponent(sessionB)}/deliverables`)
  ctx.eq(listB.json.total, 0, 'B 任务数 0')
  ctx.eq(graphB.json.total, 0, 'B 图节点 0')
  ctx.eq(delivB.json.fileCount, 0, 'B 交付物 0')

  const cross = await detail(sessionB, task.id)
  ctx.eq(cross.status, 404, 'B 路径请求 A 详情 404')
  ctx.check(!cross.text.includes('越权与合法请求') && !cross.text.includes('越权被拒且不写产出'),
    '404 响应不返回 A 的标题与目标', '不含标题与目标', cross.text.slice(0, 80))

  // 构造越权：A 会话任务详情的跨会话访问已 404，再用 B 取消 A 任务验证归属分流。
  const crossCancel = await api('POST', `/api/sessions/${encodeURIComponent(sessionB)}/tasks/${encodeURIComponent(task.id)}/cancel?scope=self`)
  ctx.eq(crossCancel.status, 404, 'B 路径取消 A 任务 404（后端仍拒绝越权）')
  ctx.eq(crossCancel.json && crossCancel.json.code, 'task_not_found', '跨会话取消失败码 task_not_found')

  ctx.raw = {
    sessionA, sessionB, taskId: task.id, status: done.task.status,
    confirmations, deniedTraces: denied.map((t) => t.text), actionTraces: actions.length,
    userDeliverables: userFiles.length, crossStatus: cross.status,
    crossCancelStatus: crossCancel.status,
  }
}, { tools: true })

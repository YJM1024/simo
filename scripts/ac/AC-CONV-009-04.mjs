#!/usr/bin/env node
/**
 * AC-CONV-009-04（判据 CT-CONV-524 / TC-P1-CONV-040）
 * tools-403：成功工具调用 1 次并产出 1 个文件；越权 1 次 403 permission_denied，轨迹 observe 1 条以 "403 " 开头。
 * 驱动方式：后端以 real 模式启动（config.local.json 指向假上游 8790），假上游 mock-llm 的 tools 模式在
 * 第一轮返回两个 tool_calls（write_file 合法写、read_file 越权读），第二轮返回报告文本，从而走真实执行器。
 * 执行链：任务先进入 running + waitingReason=confirmation（CT-CONV-514 审批门），脚本调用确认接口放行后
 * 工具才真正执行（2026-11-25 修复：确认分支先释放审批再清等待）。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  runAc, AcError, HOME, createSession, createBatch, detail,
  waitTaskStatus, waitTaskWaiting, confirmTask, queryRows,
} from './lib/conv-backend.mjs'

await runAc('AC-CONV-009-04', async (ctx) => {
  // 前置清理：上一轮若留下 notes/ac-04-output.md，write 工具会因「写前未 read」返回 Error，
  // 导致合法工具调用不产生 action 轨迹（脚本因此不可重复运行）。按文件安全规则移入隔离目录，不就地删除。
  const outputFile = path.join(HOME, 'workspace', 'notes', 'ac-04-output.md')
  if (fs.existsSync(outputFile)) {
    const trashDir = path.join('E:', 'dsh_home', 'trash', 'pending-delete', 'ac-conv-009', 'workspace', 'notes')
    fs.mkdirSync(trashDir, { recursive: true })
    fs.renameSync(outputFile, path.join(trashDir, `ac-04-output.md.${Date.now()}`))
  }

  const sessionId = await createSession('AC-CONV-009-04 tools-403')
  const created = await createBatch(sessionId, {
    mode: 'react',
    goal: '读取工作区资料一次，再尝试越权读取沙箱外路径一次。',
    inputs: ['允许：写工作区内的说明文件。', '越权：读取 SIMO_HOME 之外的路径。'],
    constraints: ['越权必须被拒绝，且不得写出文件。'],
    tasks: [{
      key: 'tool', title: 'tools-403：合法写一次、越权读一次', mode: 'react',
      goal: '调用 write 写工作区文件，再调用 read 读取越权路径。',
      steps: ['合法写入', '越权读取', '汇总'],
    }],
    clientMutationId: 'ac-conv-009-04',
  })
  if (created.status !== 201) {
    // 回归护栏：若再次出现 2026-11-25 的 task_steps 固定主键冲突（collect/draft/finalize），
    // 创建会返回 500 internal。此时给出可定位证据，不把构建缺陷记成断言失败。
    const fixedIds = queryRows("SELECT id, task_id FROM task_steps WHERE id IN ('collect','draft','finalize')")
    ctx.raw = { createStatus: created.status, createBody: created.text.slice(0, 200), fixedStepRows: fixedIds }
    throw new AcError('R-BUILD',
      '创建 react 任务返回 500 internal：疑似 task_steps 固定主键 collect/draft/finalize 冲突',
      '201 且 tasks[0].id 非空',
      created.status + ' ' + created.text.slice(0, 120) + '；固定 id 行 ' + fixedIds.length + ' 条')
  }
  const taskId = (created.json.tasks || [])[0] && created.json.tasks[0].id
  if (!taskId) throw new AcError('R-SCRIPT', '创建响应无 tasks', 'tasks[0].id', created.status + ' ' + created.text.slice(0, 160))

  // 审批门：等到 running + confirmation，再调用确认接口。放行后可能再次进入审批（多轮工具调用），
  // 因此按「等待审批→确认」循环，最多 3 轮，直到任务进入终态。
  const confirmations = []
  let done = null
  for (let round = 0; round < 3; round += 1) {
    const gate = await waitTaskWaiting(sessionId, taskId, 'confirmation', 30000)
    ctx.eq(gate.task.status, 'running', `第 ${round + 1} 次进入审批时任务为 running`)
    ctx.eq(gate.task.waitingReason, 'confirmation', `第 ${round + 1} 次审批等待原因为 confirmation`)
    const conf = await confirmTask(sessionId, taskId, 'confirm', 'AC-CONV-009-04 放行')
    ctx.eq(conf.status, 200, `第 ${round + 1} 次确认接口 200`)
    confirmations.push({ round: round + 1, status: conf.status, decision: (conf.json && conf.json.decision) || 'confirm' })
    try {
      done = await waitTaskStatus(sessionId, taskId, ['done', 'failed'], 12000)
      break
    } catch {
      // 仍在等待态：继续下一轮确认
    }
  }
  if (!done) done = await waitTaskStatus(sessionId, taskId, ['done', 'failed'], 60000)
  ctx.eq(done.task.status, 'done', '真实执行器跑完且任务 done')

  const traces = queryRows('SELECT category, tool, text FROM task_traces WHERE task_id = ? ORDER BY seq', [taskId])
  const forbidden = traces.filter((t) => String(t.text || '').startsWith('403 '))
  const observe403 = forbidden.filter((t) => t.category === 'observe')
  ctx.eq(observe403.length, 1, '越权 1 次：observe 轨迹恰 1 条')
  ctx.check(observe403[0] && String(observe403[0].text).startsWith('403 permission_denied'), '403 轨迹以 "403 " 开头并带 permission_denied', '403 permission_denied…', String(observe403[0] && observe403[0].text).slice(0, 80))

  const actions = traces.filter((t) => t.category === 'action')
  ctx.eq(actions.length, 1, '成功工具调用 1 次（action 轨迹恰 1 条）')
  // 后端把工具名规范成短名（write_file -> write），断言只认「写」这一类。
  ctx.check(!actions[0] || /^write/.test(String(actions[0].tool)), '成功的是合法写入工具', 'write（write_file 规范名）', String(actions[0] && actions[0].tool))

  const produced = fs.existsSync(outputFile) ? fs.statSync(outputFile).size : 0
  ctx.check(produced > 0, '合法工具调用产出 1 个文件', '>0 字节', String(produced))
  const outputText = produced > 0 ? fs.readFileSync(outputFile, 'utf8') : ''
  ctx.check(outputText.includes('AC-CONV-009-04'), '产出文件内容来自本次执行', '含标记 AC-CONV-009-04', JSON.stringify(outputText.slice(0, 60)))

  const artifacts = queryRows("SELECT name FROM task_artifacts WHERE task_id = ? AND delivery_kind = 'user_delivery'", [taskId])
  ctx.check(artifacts.length <= 1, '越权请求没有额外写产出（用户交付物 <=1）', '<=1', String(artifacts.length))

  const detailRes = await detail(sessionId, taskId)
  ctx.eq(detailRes.status, 200, '任务详情 200')

  ctx.raw = {
    sessionId, taskId, status: done.task.status, traceCount: traces.length,
    confirmations, actionTraces: actions.length,
    forbiddenTraces: forbidden.map((t) => t.text), producedBytes: produced,
    userDeliverables: artifacts.length, outputFile,
  }
}, { tools: true })

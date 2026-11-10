#!/usr/bin/env node
// scripts/check-m10-workflows.mjs —— M10 任务选项卡/工作流/汇报卡片纯逻辑 + 源码约束自测
//
// 覆盖：
//   - features/tasks/workflows.ts：工作流归一化、状态分组、按工作流分组、进度、依赖、动作、耗时；
//   - features/tasks/model.ts：任务新增字段（workflow/depends_on/duration/report）；
//   - features/chat/TaskReportCard.tsx：汇报卡片解析与判定；
//   - frames：workflow.* 帧与 task.report 解析；
//   - 源码约束：任务选项卡/状态分组、工作流暂停恢复取消、「停」按钮、汇报卡片 TASK_OPEN、无 Spec。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'features/tasks/workflows.ts'))}
export { normalizeTask, normalizeTaskList, normalizeTaskDetail } from ${JSON.stringify(resolve(src, 'features/tasks/model.ts'))}
export { parseWorkflowFrame, parseTaskReport } from ${JSON.stringify(resolve(src, 'features/tasks/frames.ts'))}
export { parseTaskCard, isTaskReportMessage } from ${JSON.stringify(resolve(src, 'features/chat/TaskReportCard.tsx'))}
export { toChatMessage } from ${JSON.stringify(resolve(src, 'platform/types.ts'))}
`

const result = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent',
})
const output = result.outputFiles?.[0]
if (!output) {
  console.error('✖ 无法生成测试模块（esbuild 未输出）')
  process.exit(1)
}
const mod = await import(`data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`)

let passed = 0
let failed = 0
function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✔ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✖ ${name}`)
    console.error(`    ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('M10 任务/工作流/汇报自测（前端）')

// ---- 1. 工作流归一化 ----
const workflowFixture = {
  id: 'wf-1',
  sessionId: 'main',
  title: '整理季度报告',
  status: 'running',
  createdAt: 1,
  updatedAt: 2,
  tasks: [
    { id: 't1', key: 'collect', title: '收集数据', status: 'done', workflowId: 'wf-1', orderIndex: 0, durationMs: 1200, reportMessageId: 'm-1' },
    { id: 't2', key: 'draft', title: '撰写初稿', status: 'running', workflowId: 'wf-1', dependsOn: ['collect'], orderIndex: 1, durationMs: null },
    { id: 't3', key: 'review', title: '校对', status: 'pending', workflowId: 'wf-1', dependsOn: ['draft'], orderIndex: 2 },
  ],
}

check('工作流归一化：包装/tasks/进度/耗时/依赖', () => {
  const wf = mod.normalizeWorkflow(workflowFixture)
  assert.equal(wf.id, 'wf-1')
  assert.equal(wf.status, 'running')
  assert.equal(wf.tasks.length, 3)
  assert.equal(wf.tasks[0].workflowId, 'wf-1')
  assert.deepEqual(wf.tasks[1].dependsOn, ['collect'])
  assert.equal(wf.tasks[0].durationMs, 1200)
  assert.equal(wf.tasks[0].reportMessageId, 'm-1')
  assert.equal(wf.tasks[0].key, 'collect')
  assert.equal(wf.tasks[0].orderIndex, 0)
  // 1/3 完成 → 33%
  assert.equal(mod.workflowProgressPercent(wf), 33)
  assert.equal(mod.workflowCounts(wf).done, 1)
})

check('工作流列表/详情：多种包装 + 坏条目', () => {
  const list = mod.normalizeWorkflowList({ ok: true, workflows: [workflowFixture, { title: 'no-id' }] })
  assert.equal(list.length, 1)
  assert.equal(mod.normalizeWorkflowList([workflowFixture]).length, 1)
  assert.equal(mod.normalizeWorkflowList({ workflows: [] }).length, 0)
  const detail = mod.normalizeWorkflowDetail({ workflow: workflowFixture })
  assert.equal(detail?.id, 'wf-1')
  assert.equal(mod.normalizeWorkflowDetail(null), null)
})

check('工作流状态别名 / 文案 / 色调 / 动作', () => {
  assert.equal(mod.normalizeWorkflowStatus('in_progress'), 'running')
  assert.equal(mod.normalizeWorkflowStatus('completed'), 'done')
  assert.equal(mod.normalizeWorkflowStatus('interrupted'), 'failed')
  assert.equal(mod.workflowStatusLabel('paused'), '已暂停')
  assert.equal(mod.workflowStatusTone('running'), 'accent')
  assert.equal(mod.workflowStatusTone('failed'), 'danger')
  const running = mod.normalizeWorkflow({ id: 'a', status: 'running' })
  assert.deepEqual(mod.workflowActions(running), ['pause', 'cancel'])
  const paused = mod.normalizeWorkflow({ id: 'b', status: 'paused' })
  assert.deepEqual(mod.workflowActions(paused), ['resume', 'cancel'])
  const done = mod.normalizeWorkflow({ id: 'c', status: 'done' })
  assert.deepEqual(mod.workflowActions(done), [])
})

// ---- 2. 任务分组 ----
check('任务状态 → 四个面板分组（blocked 归执行中，cancelled 归失败）', () => {
  assert.equal(mod.taskStatusGroup('running'), 'running')
  assert.equal(mod.taskStatusGroup('blocked'), 'running')
  assert.equal(mod.taskStatusGroup('pending'), 'pending')
  assert.equal(mod.taskStatusGroup('queued'), 'pending')
  assert.equal(mod.taskStatusGroup('done'), 'done')
  assert.equal(mod.taskStatusGroup('failed'), 'failed')
  assert.equal(mod.taskStatusGroup('cancelled'), 'failed')
  assert.equal(mod.taskStatusGroup('interrupted'), 'failed')
  assert.equal(mod.taskStatusGroupLabel('running'), '执行中')
})

const tasksFixture = mod.normalizeTaskList({
  tasks: [
    { id: 'a1', title: 'A1 运行', status: 'running', workflowId: 'wf-1', orderIndex: 1 },
    { id: 'a2', title: 'A2 阻塞', status: 'blocked', workflowId: 'wf-1', orderIndex: 2 },
    { id: 'b1', title: 'B1 待开始', status: 'pending', workflowId: 'wf-2', orderIndex: 1 },
    { id: 'a0', title: 'A0 完成', status: 'done', workflowId: 'wf-1', orderIndex: 0 },
    { id: 'b2', title: 'B2 失败', status: 'failed', workflowId: 'wf-2', orderIndex: 0 },
    { id: 'x1', title: '未分组', status: 'running', orderIndex: 9 },
  ],
})

check('groupTasksByStatus：分组与计数', () => {
  const groups = mod.groupTasksByStatus(tasksFixture)
  assert.equal(groups.running.length, 3) // a1 + a2 + x1
  assert.equal(groups.pending.length, 1)
  assert.equal(groups.done.length, 1)
  assert.equal(groups.failed.length, 1)
})

check('groupTasksByWorkflow：工作流顺序 + 未分组最后 + 组内 orderIndex', () => {
  const wf1 = mod.normalizeWorkflow({ id: 'wf-1', title: '工作流一', status: 'running', tasks: tasksFixture.filter((t) => t.workflowId === 'wf-1') })
  const wf2 = mod.normalizeWorkflow({ id: 'wf-2', title: '工作流二', status: 'paused', tasks: tasksFixture.filter((t) => t.workflowId === 'wf-2') })
  const groups = mod.groupTasksByWorkflow(tasksFixture, [wf1, wf2])
  assert.equal(groups.length, 3)
  assert.equal(groups[0].workflow?.id, 'wf-1')
  assert.deepEqual(groups[0].tasks.map((task) => task.id), ['a0', 'a1', 'a2'])
  assert.equal(groups[1].workflow?.id, 'wf-2')
  assert.equal(groups[2].workflow, null) // 未分组
  assert.deepEqual(groups[2].tasks.map((task) => task.id), ['x1'])
})

check('groupTasksByWorkflow：未知 workflowId 用占位工作流展示', () => {
  const orphanWf = mod.normalizeTaskList({ tasks: [{ id: 'z1', title: 'Z', status: 'running', workflowId: 'wf-missing' }] })
  const groups = mod.groupTasksByWorkflow(orphanWf, [])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].workflow?.id, 'wf-missing')
  assert.equal(groups[0].workflow?.title, '工作流')
})

check('依赖标题解析 + 耗时格式', () => {
  const task = tasksFixture.find((entry) => entry.id === 'a2')
  assert.deepEqual(mod.dependencyLabels(task, tasksFixture), [])
  const withDeps = mod.normalizeTask({ id: 'd1', title: 'D', status: 'pending', dependsOn: ['collect', 't2'] })
  const all = [mod.normalizeTask({ id: 't2', title: '任务二', key: 'collect', status: 'done' })]
  // 两个引用都解析到同一任务（id 与 key）
  assert.deepEqual(mod.dependencyLabels(withDeps, all), ['任务二', '任务二'])
  assert.equal(mod.formatDurationMs(1200), '1.2s')
  assert.equal(mod.formatDurationMs(65_000), '1m5s')
  assert.equal(mod.formatDurationMs(null), '')
})

// ---- 3. 汇报卡片 / 帧 ----
check('toChatMessage 解析 taskId/workflowId；isTaskReportMessage', () => {
  const message = mod.toChatMessage({ id: 'm1', role: 'agent', text: '任务 A 完成', taskId: 't1', workflowId: 'wf-1' })
  assert.equal(message.taskId, 't1')
  assert.equal(message.workflowId, 'wf-1')
  assert.equal(mod.isTaskReportMessage(message), true)
  assert.equal(mod.isTaskReportMessage({ role: 'user', taskId: 't1' }), false)
  assert.equal(mod.isTaskReportMessage({ role: 'agent' }), false)
})

check('parseTaskCard：从 GET /api/tasks/{id} 提取任务名/状态/产物', () => {
  const card = mod.parseTaskCard({
    ok: true,
    task: {
      id: 't1',
      title: '整理报告',
      status: 'done',
      artifacts: [{ id: 'a1', name: 'report.md' }, { name: 'chart.png' }, { bad: true }],
    },
  })
  assert.equal(card.title, '整理报告')
  assert.equal(card.status, 'done')
  assert.deepEqual(card.artifacts, ['report.md', 'chart.png'])
  assert.equal(mod.parseTaskCard({ task: { id: 'x' } }), null)
  assert.equal(mod.parseTaskCard(null), null)
})

check('workflow.* 帧与 task.report 帧解析', () => {
  const frame = mod.parseWorkflowFrame({ id: 'wf-1', status: 'paused', progress: 0.5 })
  assert.equal(frame.id, 'wf-1')
  assert.equal(frame.status, 'paused')
  assert.equal(frame.fields.progress, 0.5)
  const report = mod.parseTaskReport({ message: { id: 'm-9', taskId: 't1', workflowId: 'wf-1' } })
  assert.equal(report.taskId, 't1')
  assert.equal(report.messageId, 'm-9')
  assert.equal(mod.parseTaskReport({ id: 'x' }), null)
})

// ---- 4. 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const read = (path) => readFileSync(path, 'utf8')
const taskPanel = read(resolve(src, 'features/tasks/TaskPanel.tsx'))
const taskDetail = read(resolve(src, 'features/tasks/TaskDetail.tsx'))
const chatCenter = read(resolve(src, 'features/chat/ChatCenter.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const reportCard = read(resolve(src, 'features/chat/TaskReportCard.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('任务选项卡：role=tablist/tab + 四状态分组', () => {
  assert.match(taskPanel, /WorkflowGroupHeader/)
})

check('工作流控制：暂停/恢复/取消按钮 + detail 依赖/工作流区', () => {
  assert.match(taskPanel, /handleWorkflowAction/)
  assert.match(taskDetail, /所属工作流/)
  assert.match(taskDetail, /依赖/)
  assert.match(taskDetail, /workflowActions\(workflow\)/)
  assert.match(taskDetail, /暂停.*恢复.*取消/s)
})

check('汇报卡片：TaskReportCard + 点击发 TASK_OPEN；消息流接入', () => {
  assert.match(messageList, /TaskReportCard/)
  assert.match(reportCard, /EVENTS\.TASK_OPEN/)
  assert.match(reportCard, /emit\(EVENTS\.TASK_OPEN/)
})

check('「停」按钮：输入框仍可用（chat 顶栏按钮，不禁用 Composer）', () => {
  assert.match(chatCenter, /runtime\.workflowRunning/)
  assert.match(chatCenter, /runtime\.send\('停'\)/)
  const composer = read(resolve(src, 'features/chat/Composer.tsx'))
  assert.equal(/停.*disabled|disabled.*停/.test(composer), false)
  assert.match(composer, /onSend/)
})

check('门禁链包含 check-m10；无第三方 UI 库；无 Spec 概念', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m10-workflows\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

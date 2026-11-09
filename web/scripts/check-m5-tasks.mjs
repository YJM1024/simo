#!/usr/bin/env node
// scripts/check-m5-tasks.mjs —— M5 任务详情/产物/审批纯逻辑自测（不依赖浏览器/后端）
//
// 覆盖 features/tasks/model.ts：
//   - 列表/详情归一化（含 payload JSON 字符串、阶段/步骤状态同义词、产物分类、审批）；
//   - 进度推导、当前步骤文案、取消/重试可用性、待审批去重、审批提交体；
//   - Markdown 极简渲染块解析；中和标记处理。
// 以及 tasks/frames.ts 的 task.updated / approval.* 帧解析。

import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')

const entry = `
export {
  normalizeTask, normalizeTaskList, normalizeTaskDetail, upsertCreated, applyUpdated,
  normalizeStatus, normalizeProgress, normalizePhases, classifyArtifact,
  countRunning, taskStatusMeta, stepIcon, stepTone, phaseLabel,
  progressPercent, currentProgressLabel, canCancel, canRetry, pendingApprovals,
  approvalDecisionBody, normalizeApproval, normalizeApprovalList,
  parseMarkdown, formatTime, formatSize,
} from ${JSON.stringify(resolve(src, 'features/tasks/model.ts'))}
export { parseTaskCreated, parseTaskUpdated, parseApprovalRequested, parseApprovalResolved } from ${JSON.stringify(resolve(src, 'features/tasks/frames.ts'))}
export { hasNeutralized, stripNeutralized } from ${JSON.stringify(resolve(src, 'platform/types.ts'))}
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

console.log('M5 任务详情/产物/审批逻辑自测（前端）')

// ---- 1. 列表/详情归一化 ----
const rawTask = {
  id: 'task-1',
  title: '调研支付流程',
  status: 'running',
  progress: 0.4,
  summary: '正在整理阶段产物',
  createdAt: 1793980000000,
  updatedAt: 1793980100000,
  phases: [
    {
      id: 'p1',
      title: '资料收集',
      status: 'completed',
      steps: [
        { id: 's1', title: '列出竞品', status: 'done' },
        { id: 's2', title: '整理要点', status: 'active' },
      ],
    },
    { id: 'p2', title: '输出报告', status: 'pending', steps: ['写初稿', '校对'] },
  ],
  artifacts: [
    { id: 'art-1', name: 'report.md', mime: 'text/markdown', size: 2048 },
    { id: 'art-2', name: 'chart.png', mime: 'image/png' },
    { id: 'art-3', name: 'notes.txt', mime: 'text/plain' },
    { id: 'art-4', name: 'data.bin' },
  ],
  approvals: [{ id: 'ap-1', title: 'read_file /etc/hosts', summary: '只读', kind: 'tool' }],
}

check('normalizeTaskList：阶段/步骤/产物/审批 + 状态同义词归一', () => {
  const tasks = mod.normalizeTaskList({ ok: true, tasks: [rawTask] })
  assert.equal(tasks.length, 1)
  const task = tasks[0]
  assert.equal(task.id, 'task-1')
  assert.equal(task.status, 'running')
  assert.equal(task.progress, 0.4)
  assert.equal(task.phases.length, 2)
  assert.equal(task.phases[0].status, 'done') // completed → done
  assert.equal(task.phases[0].steps[1].status, 'running') // active → running
  assert.deepEqual(task.phases[1].steps.map((step) => step.title), ['写初稿', '校对'])
  assert.deepEqual(task.artifacts.map((artifact) => artifact.kind), ['markdown', 'image', 'text', 'other'])
  assert.equal(task.approvals.length, 1)
  assert.equal(task.approvals[0].status, 'pending')
  assert.equal(task.neutralized, false)
})

check('payload 为 JSON 字符串时合并（顶层优先）', () => {
  const task = mod.normalizeTask({
    id: 'task-2',
    title: 'JSON payload 任务',
    status: 'done',
    payload: JSON.stringify({
      progress: 1,
      phases: [{ id: 'p', title: '阶段', status: 'done', steps: [] }],
      artifacts: ['out.md'],
      approvals: [{ id: 'ap', title: '确认', status: 'approved' }],
    }),
  })
  assert.equal(task.progress, 1)
  assert.equal(task.phases.length, 1)
  assert.equal(task.artifacts[0].kind, 'markdown')
  assert.equal(task.approvals[0].status, 'approved') // approved 保持原值
})

check('normalizeTaskDetail 兼容 {task}/{data} 包装', () => {
  assert.equal(mod.normalizeTaskDetail({ task: rawTask })?.id, 'task-1')
  assert.equal(mod.normalizeTaskDetail({ data: { task: rawTask } })?.id, 'task-1')
  assert.equal(mod.normalizeTaskDetail(rawTask)?.id, 'task-1')
  assert.equal(mod.normalizeTaskDetail(null), null)
})

check('normalizeProgress：0–1 / 0–100 / 非法', () => {
  assert.equal(mod.normalizeProgress(0.42), 0.42)
  assert.equal(mod.normalizeProgress(42), 0.42)
  assert.equal(mod.normalizeProgress(-5), 0)
  assert.equal(mod.normalizeProgress('abc'), null)
})

// ---- 2. WS 归约 ----
check('applyUpdated：阶段/产物/审批随帧更新', () => {
  let tasks = mod.normalizeTaskList({ tasks: [rawTask] })
  tasks = mod.applyUpdated(tasks, {
    id: 'task-1',
    fields: {
      status: 'done',
      summary: '完成',
      progress: 1,
      artifacts: [{ id: 'art-9', name: 'final.md', mime: 'text/markdown' }],
    },
  })
  assert.equal(tasks[0].status, 'done')
  assert.equal(tasks[0].progress, 1)
  assert.equal(tasks[0].artifacts.length, 1)
  assert.equal(tasks[0].artifacts[0].id, 'art-9')
  assert.equal(tasks[0].phases.length, 2) // 未出现的字段保留
})

check('后端 flat steps 按 phaseId 挂到对应阶段', () => {
  const task = mod.normalizeTask({
    id: 'task-flat',
    status: 'running',
    progress: 40,
    phases: [
      { id: 'plan', title: '规划', status: 'done' },
      { id: 'execute', title: '执行', status: 'running' },
    ],
    steps: [
      { id: 'collect', phaseId: 'plan', title: '收集信息', status: 'done' },
      { id: 'draft', phaseId: 'execute', title: '产出草稿', status: 'running' },
      { id: 'loose', title: '游离步骤', status: 'pending' },
    ],
  })
  assert.equal(task.phases.length, 3) // plan / execute / 游离步骤
  assert.deepEqual(task.phases[0].steps.map((step) => step.title), ['收集信息'])
  assert.deepEqual(task.phases[1].steps.map((step) => step.title), ['产出草稿'])
  assert.equal(task.phases[2].title, '步骤')
  assert.deepEqual(task.phases[2].steps.map((step) => step.title), ['游离步骤'])
})

check('upsertCreated：重连补发幂等', () => {
  let tasks = []
  const payload = { id: 'task-3', title: '新任务', status: 'queued', fields: {} }
  tasks = mod.upsertCreated(tasks, payload)
  tasks = mod.upsertCreated(tasks, payload)
  assert.equal(tasks.length, 1)
})

check('帧解析：task.updated 保留阶段字段；approval.requested/resolved', () => {
  const patch = mod.parseTaskUpdated({ id: 't1', status: 'running', progress: 0.5, phases: [] })
  assert.equal(patch.id, 't1')
  assert.equal(patch.fields.progress, 0.5)

  const requested = mod.parseApprovalRequested({ id: 'a1', taskId: 't1', action: 'write_file', reason: '需要写文件', kind: 'tool' })
  assert.equal(requested.id, 'a1')
  assert.equal(requested.taskId, 't1')
  assert.equal(requested.title, 'write_file')
  assert.equal(requested.summary, '需要写文件')

  const resolved = mod.parseApprovalResolved({ id: 'a1', status: 'approved' })
  assert.equal(resolved.id, 'a1')
  assert.equal(resolved.status, 'approved')
  assert.equal(resolved.policyDenied, false)
  assert.equal(mod.parseApprovalRequested({}), null)
})

// ---- 3. 进度/文案/动作 ----
check('progressPercent：显式 progress / 阶段比例 / done', () => {
  const explicit = mod.normalizeTask({ id: 'x', status: 'running', progress: 0.4 })
  assert.equal(mod.progressPercent(explicit), 40)

  const byPhases = mod.normalizeTask({
    id: 'y',
    status: 'running',
    phases: [
      { title: 'A', status: 'done' },
      { title: 'B', status: 'running' },
    ],
  })
  assert.equal(mod.progressPercent(byPhases), 50)

  const done = mod.normalizeTask({ id: 'z', status: 'done' })
  assert.equal(mod.progressPercent(done), 100)
  const queued = mod.normalizeTask({ id: 'q', status: 'queued' })
  assert.equal(mod.progressPercent(queued), null)
})

check('currentProgressLabel：当前步骤 > 进行中阶段 > 阶段计数', () => {
  const withStep = mod.normalizeTask({
    id: 'a',
    status: 'running',
    phases: [{ title: '阶段一', status: 'running', steps: [{ title: '步骤一', status: 'running' }] }],
  })
  assert.equal(mod.currentProgressLabel(withStep), '阶段一 · 步骤一')

  const withPhase = mod.normalizeTask({ id: 'b', status: 'running', phases: [{ title: '阶段二', status: 'running' }] })
  assert.equal(mod.currentProgressLabel(withPhase), '阶段二（进行中）')

  const counted = mod.normalizeTask({
    id: 'c',
    status: 'running',
    phases: [
      { title: 'A', status: 'done' },
      { title: 'B', status: 'pending' },
    ],
  })
  assert.equal(mod.currentProgressLabel(counted), '阶段 1/2')
})

check('canCancel / canRetry / 状态展示', () => {
  assert.equal(mod.canCancel({ status: 'running' }), true)
  assert.equal(mod.canCancel({ status: 'queued' }), true)
  assert.equal(mod.canCancel({ status: 'done' }), false)
  assert.equal(mod.canRetry({ status: 'failed' }), true)
  assert.equal(mod.canRetry({ status: 'cancelled' }), true)
  assert.equal(mod.canRetry({ status: 'done' }), false)
  assert.equal(mod.taskStatusMeta('running').label, '执行中')
  assert.equal(mod.taskStatusMeta('mystery').label, 'mystery')
  assert.equal(mod.stepIcon('done'), '✓')
  assert.equal(mod.stepIcon('running'), '▶')
  assert.equal(mod.stepTone('failed'), 'text-danger-ink')
  assert.equal(mod.phaseLabel('done'), '已完成')
})

check('pendingApprovals 去重 + approvalDecisionBody 兼容字段', () => {
  const tasks = mod.normalizeTaskList({
    tasks: [
      { id: 't1', status: 'running', approvals: [{ id: 'a1', title: 'A' }, { id: 'a1', title: 'A dup' }] },
      { id: 't2', status: 'running', approvals: [{ id: 'a2', title: 'B', status: 'approved' }] },
    ],
  })
  const pending = mod.pendingApprovals(tasks)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].id, 'a1')
  assert.deepEqual(mod.approvalDecisionBody('approve'), { decision: 'allow', approved: true, action: 'allow' })
  assert.deepEqual(mod.approvalDecisionBody('deny'), { decision: 'deny', approved: false, action: 'deny' })
})

check('REST approvals 归一化：{id,tool,args,status}', () => {
  const approvals = mod.normalizeApprovalList({
    ok: true,
    approvals: [
      { id: 'appr-1', tool: 'write_file', args: '{"path":"a.txt"}', status: 'pending', createdAt: 1793980000000 },
      { id: 'appr-2', tool: 'read_file', args: '{}', status: 'approved' },
    ],
  })
  assert.equal(approvals.length, 2)
  assert.equal(approvals[0].id, 'appr-1')
  assert.equal(approvals[0].title, 'write_file')
  assert.equal(approvals[0].kind, 'write_file') // kind 直接展示工具名
  assert.equal(approvals[0].summary, '{"path":"a.txt"}')
  assert.equal(approvals[0].status, 'pending')
  assert.equal(approvals[1].status, 'approved')
  assert.equal(mod.normalizeApproval({ id: 'x', tool: 't' })?.kind, 't')
  assert.equal(mod.normalizeApprovalList(null).length, 0)
})

// ---- 4. Markdown / 中和 / 格式化 ----
check('parseMarkdown：标题/列表/代码块/引用/分隔线/段落', () => {
  const blocks = mod.parseMarkdown(
    ['# 标题', '', '段落一', '段落二', '', '- a', '- b', '', '1. one', '2. two', '', '```js', 'const x = 1', '```', '', '> 引用', '', '---'].join('\n'),
  )
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['heading', 'paragraph', 'list', 'list', 'code', 'quote', 'rule'],
  )
  assert.equal(blocks[0].text, '标题')
  assert.equal(blocks[2].items.length, 2)
  assert.equal(blocks[4].lang, 'js')
  assert.equal(blocks[4].text, 'const x = 1')
})

check('中和标记：检测 + 去除', () => {
  assert.equal(mod.hasNeutralized('输出 [harness: neutralized] 完成'), true)
  assert.equal(mod.hasNeutralized('[HARNESS: NEUTRALIZED]'), true)
  assert.equal(mod.hasNeutralized('普通输出'), false)
  assert.equal(mod.stripNeutralized('输出 [harness: neutralized] 完成'), '输出 完成')
})

check('formatSize / formatTime', () => {
  assert.equal(mod.formatSize(512), '512 B')
  assert.equal(mod.formatSize(2048), '2.0 KB')
  assert.equal(mod.formatSize(null), '')
  assert.equal(mod.formatTime(null), '')
  assert.match(mod.formatTime(1793980000000), /^\d{2}-\d{2} \d{2}:\d{2}$/)
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

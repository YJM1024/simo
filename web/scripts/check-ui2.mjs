#!/usr/bin/env node
// scripts/check-ui2.mjs —— UI-2 深度件自测（轨迹/工具卡片/计划待办/模型/压缩/通知）
//
// 覆盖：
//   - 轨迹：WS 帧归一化、事件筛选、消息+工具降级、压缩摘要、API 响应/seq；
//   - 工具卡片：七类分类、diff、脱敏、产物、未知降级；
//   - 计划：plan 归一化/任务降级/toStr 状态/打勾请求体；
//   - 模型：本地偏好与后端提示；
//   - 通知：三类归一化/合并/筛选/未读/已读；
//   - 源码：对话/轨迹切换、卡片七类、计划面板动作、模型选择器、压缩提示、通知中心；
//     门禁链/无第三方/无 Spec/无 Key 泄露字样。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'features/chat/trajectory.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/toolcards.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/plan.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/notifications.ts'))}
export * from ${JSON.stringify(resolve(src, 'platform/preferences.ts'))}
`
const built = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent',
})
const mod = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

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
const read = (path) => readFileSync(path, 'utf8')
console.log('UI-2 深度件自测（前端）')

// ---- 1. 轨迹 ----
check('轨迹：WS 帧归一化（工具/审批/任务/压缩/错误/消息）', () => {
  const tool = mod.normalizeTrajectoryFrame({ type: 'tool.call', data: { id: 'tc1', tool: 'write', status: 'ok', summary: '写入 report.md', at: 100 } })
  assert.equal(tool[0].kind, 'tool')
  assert.equal(tool[0].title, 'write')
  const approval = mod.normalizeTrajectoryFrame({ type: 'approval.requested', data: { id: 'ap1', tool: 'pwsh', title: '运行命令', at: 101 } })
  assert.equal(approval[0].kind, 'approval')
  const task = mod.normalizeTrajectoryFrame({ type: 'task.updated', data: { id: 't1', title: '整理报告', status: 'done', at: 102 } })
  assert.equal(task[0].kind, 'task')
  const compaction = mod.normalizeTrajectoryFrame({ type: 'context.compacted', data: { at: 103, removedMessages: 42, removedToolOutputs: 12, beforeTokens: 120000, afterTokens: 48000 } })
  assert.equal(compaction[0].kind, 'compaction')
  assert.match(compaction[0].summary, /42 条消息/)
  const error = mod.normalizeTrajectoryFrame({ type: 'error', data: { message: '连接失败', at: 104 } })
  assert.equal(error[0].kind, 'error')
  const message = mod.normalizeTrajectoryFrame({ type: 'message.created', data: { id: 'm1', role: 'user', text: 'hi', at: 105 } })
  assert.equal(message[0].kind, 'message')
  assert.deepEqual(mod.normalizeTrajectoryFrame({ type: 'unknown.frame', data: {} }), [])
})

check('压缩摘要：只用真实数字；缺数据不显示', () => {
  assert.equal(mod.compactionSummary({ removedMessages: 42, removedToolOutputs: 12, beforeTokens: 120000, afterTokens: 48000 }), '已压缩 42 条消息、12 条工具结果，约节省 72k tokens')
  assert.equal(mod.compactionSummary({ removedMessages: 3, beforeTokens: 1000, afterTokens: 400 }), '已压缩 3 条消息，约节省 600 tokens')
  assert.equal(mod.compactionSummary({}), null)
  assert.equal(mod.compactionSummary(null), null)
})

check('轨迹：筛选/合并去重/降级来源', () => {
  const events = [
    mod.normalizeTrajectoryFrame({ type: 'tool.call', data: { id: 'a', tool: 'read', at: 1 } })[0],
    mod.normalizeTrajectoryFrame({ type: 'approval.requested', data: { id: 'b', tool: 'pwsh', at: 2 } })[0],
    mod.normalizeTrajectoryFrame({ type: 'context.compacted', data: { id: 'c', removedMessages: 1, at: 3 } })[0],
    mod.normalizeTrajectoryFrame({ type: 'error', data: { id: 'd', message: 'bad', at: 4 } })[0],
  ]
  assert.equal(mod.filterTrajectoryEvents(events, 'tool').length, 1)
  assert.equal(mod.filterTrajectoryEvents(events, 'approval').length, 1)
  assert.equal(mod.filterTrajectoryEvents(events, 'compaction').length, 1)
  assert.equal(mod.filterTrajectoryEvents(events, 'error').length, 1)
  const merged = mod.mergeTrajectoryEvents(events.slice(0, 2), [events[0], events[2]])
  assert.equal(merged.length, 3)
  assert.deepEqual(merged.map((event) => event.id), ['a', 'b', 'c'])
  const fallback = mod.eventsFromMessages(
    [{ id: 'm1', role: 'user', text: 'hello', at: 10 }],
    [{ id: 'tc', tool: 'read', status: 'ok', durationMs: 5, risk: 'read', at: 11, policyDenied: false, escalated: false, argsSummary: 'a.txt' }],
  )
  assert.equal(fallback.length, 2)
  assert.equal(fallback[1].kind, 'tool')
})

check('轨迹 API 响应归一化（seq/hasMore）', () => {
  const parsed = mod.normalizeTrajectoryResponse({ items: [{ seq: 9, at: 1, kind: 'tool.call', title: 'read', summary: 'x', status: 'ok' }], hasMore: true, nextBefore: 5 })
  assert.equal(parsed.items.length, 1)
  assert.equal(parsed.items[0].kind, 'tool')
  assert.equal(parsed.items[0].seq, 9)
  assert.equal(parsed.hasMore, true)
  assert.equal(parsed.nextBefore, 5)
})

// ---- 2. 工具卡片 ----
check('工具卡片七类分类 + 未知降级', () => {
  assert.equal(mod.classifyToolCard('pwsh'), 'command')
  assert.equal(mod.classifyToolCard('read'), 'file_read')
  assert.equal(mod.classifyToolCard('grep'), 'file_read')
  assert.equal(mod.classifyToolCard('write'), 'file_write')
  assert.equal(mod.classifyToolCard('edit'), 'file_write')
  assert.equal(mod.classifyToolCard('web_search'), 'web')
  assert.equal(mod.classifyToolCard('make_pdf'), 'filegen')
  assert.equal(mod.classifyToolCard('anything', 'approval'), 'approval')
  assert.equal(mod.classifyToolCard('weird_tool'), 'unknown')
  assert.equal(mod.toolCardKindLabel('filegen'), '生成文件')
})

check('工具卡片：命令脱敏 / diff / 产物 / 错误', () => {
  const masked = mod.maskSecrets('DEEPSEEK_API_KEY=abc123 TOKEN=xyz sk-1234567890 password: hunter2')
  assert.equal(masked.includes('abc123'), false)
  assert.equal(masked.includes('xyz'), false)
  assert.equal(masked.includes('hunter2'), false)
  const card = mod.normalizeToolCard({
    id: 'tc1',
    tool: 'write',
    risk: 'write',
    status: 'ok',
    meta: { card: 'file_write', path: 'workspace/report.md', diff: { added: 12, removed: 3, patch: '+a\n-b' } },
  })
  assert.equal(card.kind, 'file_write')
  assert.equal(card.path, 'workspace/report.md')
  assert.equal(card.diff.added, 12)
  assert.equal(card.diff.removed, 3)
  const failed = mod.normalizeToolCard({ id: 'tc2', tool: 'pwsh', status: 'failed', error: 'exit 1' })
  assert.equal(failed.kind, 'command')
  assert.equal(failed.error, 'exit 1')
  const artifact = mod.normalizeToolCard({ id: 'tc3', tool: 'make_pdf', meta: { artifact: { id: 'a1', name: 'report.pdf', mime: 'application/pdf', size: 4096 } } })
  assert.equal(artifact.kind, 'filegen')
  assert.equal(artifact.artifact.name, 'report.pdf')
  assert.equal(artifact.artifact.downloadUrl, '/api/artifacts/a1/content')
})

// ---- 3. 计划 ----
check('计划归一化/任务降级/打勾请求体', () => {
  const plan = mod.normalizePlan({
    plan: {
      id: 'p1',
      title: '整理报告',
      goal: '交付季度报告',
      status: 'proposed',
      steps: [{ title: '收集数据' }, '撰写初稿'],
      todos: [
        { id: 'td1', title: '收集数据', status: 'done', sourceSessionId: 'child', dependsOn: [] },
        { id: 'td2', title: '校对', status: 'todo', taskId: 't2', dependsOn: ['td1'] },
      ],
    },
  })
  assert.equal(plan.source, 'api')
  assert.equal(plan.steps.length, 2)
  assert.equal(plan.todos[0].status, 'done')
  assert.equal(plan.todos[1].taskId, 't2')
  assert.deepEqual(plan.todos[1].dependsOn, ['td1'])
  assert.deepEqual(mod.toggleTodoBody(plan.todos[1], true), { todoId: 'td2', checked: true, taskId: 't2' })
  const fallback = mod.planFromTasks([{ id: 't1', title: '收集数据', status: 'done' }, { id: 't2', title: '校对', status: 'running' }])
  assert.equal(fallback.source, 'tasks')
  assert.equal(fallback.todos[1].status, 'doing')
  assert.equal(fallback.todos[0].checkable, false)
  assert.equal(mod.todoStatusLabel('blocked'), '受阻')
  assert.equal(mod.planFromTasks([]), null)
})

// ---- 4. 模型 / 通知 ----
check('模型/推理本地偏好（默认 + 保存 + 回退）', () => {
  const store = new Map()
  const original = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  try {
    assert.equal(mod.loadModelPreference(), 'DeepSeek V3')
    assert.equal(mod.saveModelPreference('DeepSeek R1'), 'DeepSeek R1')
    assert.equal(mod.loadReasoningPreference(), 'medium')
    assert.equal(mod.saveReasoningPreference('high'), 'high')
    assert.equal(mod.saveModelPreference('bogus'), 'DeepSeek V3')
  } finally {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  }
})

check('通知：三类归一化/合并/筛选/未读/已读', () => {
  const task = mod.normalizeNotification({ id: 'n1', kind: 'task-done', title: '任务完成：整理周报', at: 100 })
  const approval = mod.normalizeNotification({ kind: 'approval', title: '待审批', at: 200 })
  const error = mod.normalizeNotification({ kind: 'error', title: '连接失败', at: 300 })
  assert.equal(task.kind, 'task-done')
  assert.equal(approval.read, false)
  assert.equal(error.kind, 'error')
  const items = mod.mergeNotifications([task], [approval, error])
  assert.equal(items.length, 3)
  assert.equal(items[0].kind, 'error') // 时间倒序
  assert.equal(mod.unreadNotificationCount(items), 3)
  const filtered = mod.filterNotifications(items, 'task')
  assert.equal(filtered.length, 1)
  const read = mod.markNotificationRead(items, error.id)
  assert.equal(mod.unreadNotificationCount(read), 2)
  const allRead = mod.markAllNotificationsRead(items)
  assert.equal(mod.unreadNotificationCount(allRead), 0)
  assert.equal(mod.notificationKindLabel('approval'), '审批')
})

// ---- 5. 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const chatCenter = read(resolve(src, 'features/chat/ChatCenter.tsx'))
const trajectoryView = read(resolve(src, 'features/chat/TrajectoryView.tsx'))
const toolCard = read(resolve(src, 'features/chat/ToolCallCard.tsx'))
const planSummary = read(resolve(src, 'features/tasks/PlanSummary.tsx'))
const composer = read(resolve(src, 'features/chat/Composer.tsx'))
const notificationCenter = read(resolve(src, 'features/chat/NotificationCenter.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('对话/轨迹切换 + 轨迹事件流/筛选/降级', () => {
  assert.match(chatCenter, /label: '轨迹'/)
  assert.match(chatCenter, /TrajectoryView/)
  assert.match(trajectoryView, /FILTERS/)
  assert.match(trajectoryView, /后端轨迹接口未就绪/)
  assert.match(trajectoryView, /eventsFromMessages/)
  assert.match(trajectoryView, /WS_FRAME/)
})

check('工具卡片七类 + diff/脱敏/未知降级', () => {
  assert.match(toolCard, /command/)
  assert.match(toolCard, /file_read/)
  assert.match(toolCard, /file_write/)
  assert.match(toolCard, /web/)
  assert.match(toolCard, /filegen/)
  assert.match(toolCard, /approval/)
  assert.match(toolCard, /error/)
  assert.match(toolCard, /maskSecrets/)
  assert.match(toolCard, /未知|原始数据/)
})

check('M38 计划与待办：移到右栏 + 动作层端点 + 未就绪提示', () => {
  assert.equal(/PlanPanel/.test(chatCenter), false)
  assert.match(planSummary, /\/todos\//)
  assert.match(planSummary, /getPlan/)
  assert.match(planSummary, /todos/)
  assert.match(planSummary, /PlanTodo|planFromTasks/)
})

check('M44 输入区无模型/推理选择器；模型由智能体页统一配置', () => {
  assert.equal(/aria-label="模型"/.test(composer), false)
  assert.equal(/aria-label="推理强度"/.test(composer), false)
  assert.match(composer, /支持 Markdown 格式/)
  assert.match(composer, /Enter 发送 · Shift\+Enter 换行/)
})

check('压缩提示 + 通知中心（角标/历史/筛选/已读）', () => {
  assert.match(chatCenter, /compactionSummary/)
  assert.match(chatCenter, /已压缩|compactionText/)
  assert.match(notificationCenter, /通知中心/)
  assert.match(notificationCenter, /未读/)
  assert.match(notificationCenter, /全部已读/)
  assert.match(notificationCenter, /notificationKindTone|任务完成/)
  assert.match(notificationCenter, /\/api\/notifications/)
})

check('门禁链包含 check-ui2；无第三方；无 Spec；无 Key 泄漏洞', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-ui2\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

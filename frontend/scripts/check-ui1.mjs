#!/usr/bin/env node
// scripts/check-ui1.mjs —— UI-1 工作台体验自测（纯逻辑 + 源码约束）
//
// 覆盖：
//   - 用量统计：会话树构建/缩进行/折叠隐藏/父行汇总/时间桶(天/周/月)/范围(7/30/自定义)/sparkline；
//   - 命令面板：命令过滤、会话命令、合并；斜杠命令：解析/校验/提示；
//   - @ 引用：触发检测/过滤/插入、会话/文件候选、重试取上一条用户消息；
//   - 消息操作/交付物归一化；
//   - 源码：Ctrl+K、设置中心分区、会话树搜索/置顶/未读/执行中、输入框 @/斜杠、消息操作、交付物栏；
//     门禁链/无第三方/无 Spec。

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'features/workbench/usage.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/workbench/commands.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/slash.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/mentions.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/deliverables.ts'))}
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
console.log('UI-1 工作台自测（前端）')

// ---- 1. 用量 ----
const now = Date.parse('2026-11-08T12:00:00+08:00')
const sessions = [
  { id: 'main', title: '主会话', messageCount: 20, createdAt: now - 3 * 86_400_000 },
  { id: 'child-a', title: '季度报告', parentId: 'main', messageCount: 10, createdAt: now - 2 * 86_400_000 },
  { id: 'child-b', title: '数据整理', parentId: 'main', messageCount: 5, createdAt: now - 86_400_000 },
  { id: 'grand', title: '初稿校对', parentId: 'child-a', messageCount: 3, createdAt: now - 3_600_000 },
]

check('用量树：父子结构 + 主题名称 + token 估算', () => {
  const tree = mod.buildUsageTree(sessions, now)
  assert.equal(tree.length, 1)
  assert.equal(tree[0].id, 'main')
  assert.equal(tree[0].children.length, 2)
  assert.equal(tree[0].children.find((node) => node.id === 'child-a').children.length, 1)
  assert.ok(tree[0].tokens > 0)
})

check('时间桶：天/周/月开始与数量', () => {
  const bounds = mod.usageRangeBounds('7', now)
  const day = mod.buildBuckets(bounds.start, bounds.end, 'day')
  const week = mod.buildBuckets(bounds.start, bounds.end, 'week')
  const month = mod.buildBuckets(bounds.start, bounds.end, 'month')
  assert.equal(day.length, 7)
  assert.ok(week.length >= 1 && week.length <= 3)
  assert.ok(month.length >= 1)
  assert.match(day[0].label, /^\d{1,2}\/\d{1,2}$/)
  assert.match(month[0].label, /^\d{4}年\d{1,2}月$/)
})

check('范围：7/30/自定义 + 非法回退', () => {
  const seven = mod.usageRangeBounds('7', now)
  assert.equal(Math.round((seven.end - seven.start) / 86_400_000), 7)
  const thirty = mod.usageRangeBounds('30', now)
  assert.equal(Math.round((thirty.end - thirty.start) / 86_400_000), 30)
  const custom = mod.usageRangeBounds('custom', now, '2026-10-01', '2026-10-05')
  assert.equal(Math.round((custom.end - custom.start) / 86_400_000), 5)
  assert.deepEqual(mod.usageRangeBounds('custom', now, 'bad', 'bad'), seven)
})

check('行展开/折叠：折叠父行隐藏子孙；父行汇总子会话', () => {
  const tree = mod.buildUsageTree(sessions, now)
  const buckets = mod.buildBuckets(...Object.values(mod.usageRangeBounds('7', now)), 'day')
  const all = mod.flattenUsageRows(tree, buckets, 'messages', new Set())
  assert.deepEqual(all.map((row) => row.node.id), ['main', 'child-a', 'grand', 'child-b'])
  assert.equal(all[0].depth, 0)
  assert.equal(all[2].depth, 2)
  const collapsed = mod.flattenUsageRows(tree, buckets, 'messages', new Set(['main']))
  assert.deepEqual(collapsed.map((row) => row.node.id), ['main'])
  const collapsedChild = mod.flattenUsageRows(tree, buckets, 'messages', new Set(['child-a']))
  assert.deepEqual(collapsedChild.map((row) => row.node.id), ['main', 'child-a', 'child-b'])
  // 父行消息总数 = 20 + 10 + 5 + 3
  assert.equal(all[0].totalMessages, 38)
  assert.equal(all[1].totalMessages, 13)
  assert.ok(all[0].series.length === buckets.length)
})

check('sparkline：points 数量/坐标格式；数值格式化', () => {
  const points = mod.sparklinePoints([0, 5, 2, 9])
  assert.equal(points.split(' ').length, 4)
  assert.match(points, /^\d+\.\d,\d+\.\d/)
  assert.equal(mod.sparklinePoints([]), '')
  assert.equal(mod.formatUsageNumber(1200), '1.2k')
  assert.equal(mod.formatUsageNumber(12_000), '12k')
})

// ---- 2. 命令面板 / 斜杠 ----
check('命令面板过滤与合并（会话命令带缩进）', () => {
  const commands = mod.mergePaletteCommands(mod.BASE_COMMANDS, sessions)
  assert.ok(commands.length >= 6 + sessions.length)
  const filtered = mod.filterPalette(commands, '设置')
  assert.ok(filtered.some((command) => command.action === 'open-settings'))
  assert.equal(mod.filterPalette(commands, 'zzz').length, 0)
  const sessionCommand = commands.find((command) => command.action === 'switch-session' && command.sessionId === 'main')
  assert.ok(sessionCommand)
  assert.equal(sessionCommand.detail.includes('切换会话'), true)
})

check('斜杠命令：解析/校验/提示', () => {
  const parsed = mod.parseSlash('  /rename 新标题 ')
  assert.deepEqual(parsed, { command: 'rename', arg: '新标题', raw: '/rename 新标题' })
  assert.equal(mod.parseSlash('普通消息'), null)
  assert.equal(mod.parseSlash('/'), null)
  assert.equal(mod.validateSlash(mod.parseSlash('/pause')), null)
  assert.match(mod.validateSlash(mod.parseSlash('/rename')) ?? '', /用法/)
  assert.match(mod.validateSlash(mod.parseSlash('/unknown')) ?? '', /未知命令/)
  assert.deepEqual(mod.slashSuggestions('/re').map((command) => command.name), ['rename'])
  assert.deepEqual(mod.slashSuggestions('/rename 标题'), [])
})

// ---- 3. @ 引用 / 消息操作 ----
check('@ 触发、过滤、插入与光标位置', () => {
  assert.deepEqual(mod.detectMentionTrigger('看一下 @报告', 7), { start: 4, query: '报告' })
  assert.deepEqual(mod.detectMentionTrigger('email@x', 7), null)
  assert.deepEqual(mod.detectMentionTrigger('@', 1), { start: 0, query: '' })
  const items = [
    { kind: 'session', id: 's1', label: '季度报告' },
    { kind: 'file', id: 'f1', label: '报告.md' },
  ]
  assert.equal(mod.filterMentions(items, '报告').length, 2)
  assert.equal(mod.filterMentions(items, '季度')[0].id, 's1')
  const inserted = mod.insertMention('请参考 @报', { start: 4, query: '报' }, '报告.md')
  assert.equal(inserted.text, '请参考 @报告.md ')
  assert.equal(inserted.caret, inserted.text.length)
})

check('@ 候选归一化', () => {
  const sessionsItems = mod.normalizeMentionSessions({ sessions: [{ id: 'main', title: '主会话' }] })
  assert.equal(sessionsItems[0].kind, 'session')
  const fileItems = mod.normalizeMentionFiles({ files: [{ id: 'f1', name: 'a.md', kind: 'artifact' }] })
  assert.equal(fileItems[0].subtitle, '任务产物')
})

check('交付物归一化：字段/去重/预览类型/大小', () => {
  const items = mod.normalizeDeliverables({
    artifacts: [
      { id: 'a1', name: 'report.md', mime: 'text/markdown', size: 2048 },
      { id: 'a2', name: 'chart.png', contentType: 'image/png' },
      { id: 'a1', name: '重复' },
      { id: 'a3', name: 'data.bin' },
    ],
  })
  assert.equal(items.length, 3)
  assert.equal(items[0].kind, 'markdown')
  assert.equal(items[1].kind, 'image')
  assert.equal(items[2].previewUrl, '/api/artifacts/a3/content')
  assert.equal(mod.formatDeliverableSize(2048), '2.0 KB')
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
const workbenchEntry = read(resolve(src, 'features/workbench/WorkbenchEntry.tsx'))
const palette = read(resolve(src, 'features/workbench/CommandPalette.tsx'))
const settingsPage = read(resolve(src, 'features/workbench/SettingsPage.tsx'))
const usagePage = read(resolve(src, 'features/workbench/UsagePage.tsx'))
const composer = read(resolve(src, 'features/chat/Composer.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const chatCenter = read(resolve(src, 'features/chat/ChatCenter.tsx'))
const taskPanel = read(resolve(src, 'features/tasks/TaskPanel.tsx'))
const sessionPanel = read(resolve(src, 'features/sessions/SessionTreePanel.tsx'))
const registry = read(resolve(src, 'features/registry.ts'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('Ctrl+K 命令面板 + 切会话/新建/权限/设置/暂停', () => {
  assert.match(workbenchEntry, /Ctrl|⌘/)
  assert.match(workbenchEntry, /event\.key\.toLowerCase\(\) === 'k'/)
  assert.match(palette, /onOpenPage\('settings', 'permissions'\)/)
  assert.match(palette, /createSession/)
  assert.match(palette, /sendChat\('停'\)/)
  assert.match(palette, /SESSION_SELECT/)
})

check('设置中心：模型/权限/主题/数据目录/快捷键', () => {
  assert.match(settingsPage, /模型/)
  assert.match(settingsPage, /权限/)
  assert.match(settingsPage, /主题/)
  assert.match(settingsPage, /数据目录/)
  assert.match(settingsPage, /快捷键/)
  assert.match(settingsPage, /updatePermissions/)
})

check('用量页：树状行 + 每行 sparkline + 指标/粒度/范围/折叠', () => {
  assert.match(usagePage, /flattenUsageRows/)
  assert.match(usagePage, /UsageSparkline/)
  assert.match(usagePage, /消息数/)
  assert.match(usagePage, /token/)
  assert.match(usagePage, /天/)
  assert.match(usagePage, /自定义/)
  assert.match(usagePage, /toggleCollapsed/)
  assert.match(usagePage, /<svg/)
})

check('输入框 @ 引用 + 斜杠命令提示；消息操作（M50 无编辑/重发）', () => {
  assert.match(composer, /detectMentionTrigger/)
  assert.match(composer, /insertMention/)
  assert.match(composer, /slashSuggestions/)
  assert.match(composer, /onSlashCommand/)
  assert.match(messageList, /复制消息/)
  assert.match(messageList, /引用/)
  assert.match(messageList, /跳到原文/)
  assert.equal(/编辑重发|onEditResend|onRetryMessage|retryPrompt/.test(messageList), false)
  assert.equal(/DeliverablesBar/.test(chatCenter), false)
  assert.match(taskPanel, /交付物（当前会话）/)
  assert.match(chatCenter, /parseSlash/)
})

check('会话树：搜索/置顶/未读/执行中；注册与门禁链', () => {
  assert.match(sessionPanel, /搜索会话/)
  assert.match(sessionPanel, /togglePinnedSession/)
  assert.match(sessionPanel, /未读/)
  assert.match(sessionPanel, /statusTone/)
  assert.match(registry, /workbenchFeature/)
  assert.match(packageJson.scripts['check'] ?? '', /check-ui1\.mjs/)
  assert.ok(existsSync(resolve(root, 'public/icon.svg')))
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

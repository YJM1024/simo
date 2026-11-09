#!/usr/bin/env node
// scripts/check-m14-tags.mjs —— M14 消息标签 / 会话路径 / 时间轴预览 + 概览列表化自测
//
// 覆盖：
//   - chat/message-meta.ts：四类分类（progress=进度汇报，旧 delivery 兼容）、颜色/文案、
//     会话路径归一化/回溯/>3 级折叠、摘要 ≤120 字；
//   - platform/types：ChatMessage category/sessionPath HTTP/WS 归一化；
//   - chat/history.ts：时间轴 tick 分类/路径/预览长度；
//   - chat/overview.ts：已完成/待办/约束/时间线列表化（新旧格式）、时间前缀格式（HH:mm/M月D日/
//     YYYY年M月/YYYY年）、有序时间线、空列表不渲染；
//   - 源码约束：分类徽标仅 agent、会话路径可点击、user 只显示路径+时间、时间轴 hover/聚焦预览、
//     Tab/Enter、折叠/视口高亮保留、概览只读无 input/table、门禁链、无 Spec。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'features/chat/message-meta.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/history.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/overview.ts'))}
export { toChatMessage, toSessionPath } from ${JSON.stringify(resolve(src, 'platform/types.ts'))}
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

console.log('M14 消息标签/时间轴预览/概览列表化自测（前端）')

// ---- 1. 分类 ----
check('分类：四类 key + 中文名（进度汇报=progress，旧 delivery 兼容）', () => {
  assert.equal(mod.normalizeCategory('requirement'), 'requirement')
  assert.equal(mod.normalizeCategory('clarification'), 'clarification')
  assert.equal(mod.normalizeCategory('progress'), 'progress')
  assert.equal(mod.normalizeCategory('delivery'), 'progress')
  assert.equal(mod.normalizeCategory('consultation'), 'consultation')
  assert.equal(mod.normalizeCategory('unknown'), null)
  assert.equal(mod.normalizeCategory(undefined), null)
  assert.equal(mod.categoryMeta('progress')?.label, '进度汇报')
  assert.equal(mod.categoryMeta('requirement')?.label, '需求提出')
  assert.equal(mod.categoryMeta('clarification')?.label, '需求澄清')
  assert.equal(mod.categoryMeta('consultation')?.label, '信息咨询')
  assert.equal(mod.categoryMeta('progress')?.tone, 'ok')
  assert.match(mod.categoryMeta('progress')?.tickClass ?? '', /bg-ok/)
  assert.match(mod.categoryMeta('clarification')?.tickClass ?? '', /bg-warn/)
  assert.match(mod.categoryMeta('consultation')?.tickClass ?? '', /bg-muted/)
  assert.equal(mod.categoryMeta(null), null)
})

// ---- 2. 会话路径 ----
check('sessionPath 归一化：对象/字符串/防环/限深', () => {
  const path = mod.normalizeSessionPath([
    { id: 'main', title: '主会话' },
    { id: 'child', title: '子会话' },
    { id: 'main', title: '重复' },
  ])
  assert.deepEqual(path, [
    { id: 'main', title: '主会话' },
    { id: 'child', title: '子会话' },
  ])
  assert.equal(mod.normalizeSessionPath(['主会话', '子会话']).length, 2)
  assert.equal(mod.normalizeSessionPath(null).length, 0)
  assert.equal(mod.normalizeSessionPath(Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, title: `S${i}` }))).length, 16)
})

const meta = new Map([
  ['main', { id: 'main', title: '主会话', depth: 0 }],
  ['child', { id: 'child', title: '子会话', depth: 1, parentId: 'main' }],
  ['grand', { id: 'grand', title: '孙会话', depth: 2, parentId: 'child' }],
  ['great', { id: 'great', title: '曾孙会话', depth: 3, parentId: 'grand' }],
])

check('会话路径：优先消息自带；旧消息按 parentId 回溯；标题兜底', () => {
  const provided = mod.deriveSessionPath({ sessionId: 'grand', sessionPath: [{ id: 'x', title: '来自后端' }] }, meta)
  assert.deepEqual(provided, [{ id: 'x', title: '来自后端' }])
  const derived = mod.deriveSessionPath({ sessionId: 'great' }, meta)
  assert.deepEqual(derived.map((item) => item.title), ['主会话', '子会话', '孙会话', '曾孙会话'])
  const fallback = mod.deriveSessionPath({ sessionTitle: '旧会话' }, meta)
  assert.deepEqual(fallback, [{ id: '', title: '旧会话' }])
})

check('>3 级折叠中间：保留第一级与最后两级', () => {
  const path = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' },
    { id: 'd', title: 'D' },
  ]
  const parts = mod.collapseSessionPath(path)
  assert.equal(parts.length, 4)
  assert.deepEqual(parts[0], { kind: 'item', item: { id: 'a', title: 'A' } })
  assert.equal(parts[1].kind, 'ellipsis')
  assert.deepEqual(parts[1].hidden, [{ id: 'b', title: 'B' }])
  assert.deepEqual(parts[2], { kind: 'item', item: { id: 'c', title: 'C' } })
  assert.deepEqual(parts[3], { kind: 'item', item: { id: 'd', title: 'D' } })
  const short = mod.collapseSessionPath(path.slice(0, 3))
  assert.equal(short.length, 3)
  assert.ok(short.every((part) => part.kind === 'item'))
  const five = mod.collapseSessionPath([...path, { id: 'e', title: 'E' }])
  assert.equal(five[1].kind, 'ellipsis')
  assert.equal(five[1].hidden.length, 2)
  assert.equal(mod.sessionPathText(path), 'A › B › C › D')
})

check('预览摘要 ≤120 字，按词/空格回退', () => {
  assert.equal(mod.truncateSummary('短消息', 120), '短消息')
  const long = '这是一个很长的消息 '.repeat(30)
  const cut = mod.truncateSummary(long, 120)
  assert.ok(cut.length <= 120)
  assert.ok(cut.endsWith('…'))
  assert.equal(mod.truncateSummary('word '.repeat(60), 120).length <= 120, true)
})

// ---- 3. HTTP/WS 归一化 ----
check('toChatMessage：category + sessionPath（camel/snake）', () => {
  const message = mod.toChatMessage({
    id: 'm1',
    role: 'agent',
    text: '已收到需求',
    category: 'progress',
    session_path: [
      { id: 'main', title: '主会话' },
      { id: 'child', title: '子会话' },
    ],
  })
  assert.equal(message.category, 'progress')
  assert.deepEqual(message.sessionPath?.map((item) => item.id), ['main', 'child'])
  const camel = mod.toChatMessage({ id: 'm2', role: 'agent', text: 'x', category: 'clarification', sessionPath: ['A', 'B'] })
  assert.equal(camel.category, 'clarification')
  assert.equal(camel.sessionPath?.length, 2)
  const plain = mod.toChatMessage({ id: 'm3', role: 'user', text: 'x' })
  assert.equal(plain.category, undefined)
  assert.equal(plain.sessionPath, undefined)
})

check('时间轴 tick：分类/路径/预览≤120', () => {
  const messages = [
    { id: 'u1', role: 'user', text: '请整理报告', at: 1, sessionPath: [{ id: 'main', title: '主会话' }] },
    { id: 'a1', role: 'agent', text: '收到，我先确认范围。', at: 2, category: 'clarification', sessionPath: [{ id: 'main', title: '主会话' }, { id: 'child', title: '子会话' }] },
    { id: 'a2', role: 'agent', text: '报告已完成。', at: 3, category: 'progress' },
  ]
  const ticks = mod.buildTimeline(messages)
  assert.equal(ticks.length, 3)
  assert.equal(ticks[0].category, null)
  assert.equal(ticks[1].category, 'clarification')
  assert.equal(ticks[2].category, 'progress')
  assert.equal(ticks[1].sessionPath.length, 2)
  assert.ok(ticks.every((tick) => tick.preview.length <= 121))
})

// ---- 4. 概览列表化 + 时间线时间前缀 ----
check('概览：已完成/待办/约束数组、时间线 [{at,text}]', () => {
  const now = Date.parse('2026-11-07T12:00:00+08:00')
  const overview = mod.normalizeOverview({
    overview: {
      goal: '这个会话在整理季度报告。',
      constraints: ['只使用本地数据。', '周五前完成。'],
      current: '正在校对初稿。',
      completed: ['数据已经收集完毕。', '初稿已经写完。'],
      pending: ['还需要校对排版。'],
      notes: '数字口径要与上月一致。',
      timeline: [
        { at: now - 2 * 3_600_000, text: '先收集了数据。' },
        { at: now - 2 * 24 * 3_600_000, text: '随后完成了分析。' },
        { at: now - 60 * 24 * 3_600_000, text: '然后撰写了初稿。' },
        { at: now - 2 * 365 * 24 * 3_600_000, text: '最后归档了旧数据。' },
      ],
    },
  })
  assert.equal(overview.lists.completed.length, 2)
  assert.deepEqual(overview.lists.pending, ['还需要校对排版。'])
  const lists = mod.overviewListSections(overview)
  const kinds = Object.fromEntries(lists.map((section) => [section.key, section.kind]))
  assert.equal(kinds.constraints, 'list')
  assert.equal(kinds.completed, 'done')
  assert.equal(kinds.pending, 'pending')
  assert.equal(kinds.timeline, 'ordered')

  const items = mod.timelineListItems(overview, now)
  assert.equal(items.length, 4)
  assert.match(items[0].prefix, /^\d{2}:\d{2}$/)
  assert.match(items[1].prefix, /^\d{1,2}月\d{1,2}日$/)
  assert.match(items[2].prefix, /^\d{4}年\d{1,2}月$/)
  assert.match(items[3].prefix, /^\d{4}年$/)
  assert.ok(items.every((item) => item.text.endsWith('。')))
})

check('概览旧字符串兼容：换行/分号 → 列表项；空列表不渲染', () => {
  const overview = mod.normalizeOverview({
    overview: {
      goal: '目标。',
      constraints: '只能用本地数据；周五前完成。',
      completed: '数据收集完毕。\n初稿写完。',
      pending: '',
      timeline: '先收集数据，随后撰写，最后校对。',
    },
  })
  assert.deepEqual(overview.lists.constraints, ['只能用本地数据', '周五前完成。'])
  assert.deepEqual(overview.lists.completed, ['数据收集完毕。', '初稿写完。'])
  assert.deepEqual(overview.lists.pending, [])
  const lists = mod.overviewListSections(overview)
  assert.equal(lists.some((section) => section.key === 'pending'), false)
  assert.deepEqual(mod.timelineListItems(overview).map((item) => item.text), ['先收集数据，随后撰写，最后校对。'])
})

check('时间前缀：24h 内 HH:mm、超天 M月D日、超月 YYYY年M月、超年 YYYY年', () => {
  const now = Date.parse('2026-11-07T12:00:00+08:00')
  const at = (ms) => new Date(now - ms).toISOString()
  assert.match(mod.formatTimelineAge(Date.parse(at(2 * 3_600_000)), now), /^\d{2}:\d{2}$/)
  assert.match(mod.formatTimelineAge(Date.parse(at(2 * 24 * 3_600_000)), now), /^\d{1,2}月\d{1,2}日$/)
  assert.match(mod.formatTimelineAge(Date.parse(at(60 * 24 * 3_600_000)), now), /^\d{4}年\d{1,2}月$/)
  assert.match(mod.formatTimelineAge(Date.parse(at(2 * 365 * 24 * 3_600_000)), now), /^\d{4}年$/)
  assert.equal(mod.formatTimelineAge(null, now), '')
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
const read = (path) => readFileSync(path, 'utf8')
const badges = read(resolve(src, 'features/chat/MessageBadges.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const historyRail = read(resolve(src, 'features/chat/HistoryRail.tsx'))
const overviewView = read(resolve(src, 'features/chat/OverviewView.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('分类徽标仅 agent；user 无分类；未分类不显示', () => {
  assert.match(badges, /message\.role !== 'agent'/)
  assert.match(badges, /categoryMeta\(message\.category\)/)
  assert.match(messageList, /<CategoryBadge message=\{message\}/)
})

check('会话路径：多级 + 折叠 + 点击跳转 + user 也显示', () => {
  assert.match(badges, /collapseSessionPath/)
  assert.match(badges, /onJumpSession\(part\.item\.id\)/)
  assert.match(badges, /aria-label={`跳转到会话/)
  assert.match(messageList, /<SessionPathBadge message=\{message\} meta=\{meta\} onJumpSession=\{onJumpSession\}/)
})

check('时间轴：hover/聚焦预览、分类颜色、Tab/Enter、关闭、折叠/视口高亮保留', () => {
  assert.match(historyRail, /onMouseEnter/)
  assert.match(historyRail, /onFocus/)
  assert.match(historyRail, /role="dialog"/)
  assert.match(historyRail, /关闭消息预览/)
  assert.match(historyRail, /tickColor/)
  assert.match(historyRail, /categoryMeta/)
  assert.match(historyRail, /aria-label="消息时间轴"/)
  assert.match(historyRail, /折叠消息时间轴|展开消息时间轴/)
  assert.match(historyRail, /activeMessageId/)
  // tick 是 button，原生 Tab 聚焦 + Enter 触发
  assert.match(historyRail, /<button/)
})

check('概览列表化：线性 check/square/约束列表/有序时间线；只读无 input/table', () => {
  assert.match(overviewView, /已完成/)
  assert.match(overviewView, /待办/)
  assert.match(overviewView, /name="check"/)
  assert.match(overviewView, /name="square"/)
  assert.match(overviewView, /<ol/)
  assert.match(overviewView, /timelineListItems/)
  assert.match(overviewView, /overviewListSections/)
  assert.match(overviewView, /overviewSections/)
  assert.equal(/<input |<textarea|<table/.test(overviewView), false)
  assert.match(overviewView, /只读/)
})

check('门禁链包含 check-m14；无第三方库；无 Spec 概念', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m14-tags\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

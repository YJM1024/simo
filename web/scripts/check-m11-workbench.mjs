#!/usr/bin/env node
// scripts/check-m11-workbench.mjs —— M11 文件选项卡/历史导航/概览 纯逻辑 + 源码约束自测
//
// 覆盖：
//   - features/chat/files.ts：文件归一化/按路径去重/类型与来源/预览下载兜底/大小时间；
//   - features/chat/overview.ts：概览归一化（字符串/数组）、空态、自然汇报体段落顺序、时间线；
//   - features/chat/history.ts：消息摘要、时间轴、分页合并去重、视口高亮、加载更早启发式；
//   - 源码约束：会话顶部三标签、文件列表无上传/编辑、概览只读且无表格、时间轴可折叠/highlight、
//     分页 before/limit、门禁链、无 Spec 概念。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'features/chat/files.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/overview.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/history.ts'))}
export { getMessages } from ${JSON.stringify(resolve(src, 'platform/http.ts'))}
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

console.log('M11 文件/历史导航/概览自测（前端）')

// ---- 1. 文件 ----
const filesFixture = {
  ok: true,
  total: 4,
  files: [
    {
      id: 'f1',
      kind: 'artifact',
      name: 'report.md',
      mime: 'text/markdown',
      size: 2048,
      createdAt: 1794020000000,
      source: { taskId: 'task-1', path: 'artifacts/report.md' },
      previewUrl: '/api/artifacts/f1/content',
      downloadUrl: '/api/artifacts/f1/content?download=1',
    },
    {
      id: 'f2',
      kind: 'upload',
      name: 'diagram.png',
      mime: 'image/png',
      size: 4096,
      createdAt: 1794020001000,
      source: { messageId: 'm-1', path: 'uploads/main/diagram.png' },
    },
    {
      // 与 f1 同路径：应去重
      id: 'f1-dup',
      kind: 'workspace',
      name: 'report.md',
      mime: 'text/markdown',
      size: 2048,
      source: { path: 'artifacts/report.md' },
    },
    { id: 'f3', kind: 'workspace', name: 'notes.txt', size: 10, source: { path: 'workspace/notes.txt' } },
    { name: 'no-id.txt' },
  ],
}

check('文件归一化 + 按路径去重 + 预览/下载兜底', () => {
  const files = mod.normalizeSessionFiles(filesFixture)
  assert.equal(files.length, 3)
  assert.equal(files[0].source.taskId, 'task-1')
  assert.equal(files[1].previewUrl, '/api/uploads/f2')
  assert.equal(files[1].downloadUrl, '/api/uploads/f2')
  assert.equal(files[2].previewUrl, null) // workspace 无兜底
  assert.equal(files[2].downloadUrl, null)
})

check('文件类型/预览类型/来源/大小时间', () => {
  const files = mod.normalizeSessionFiles(filesFixture)
  assert.equal(mod.fileKindLabel('artifact'), '任务产物')
  assert.equal(mod.fileKindTone('upload'), 'warn')
  assert.equal(mod.filePreviewKind(files[0]), 'markdown')
  assert.equal(mod.filePreviewKind(files[1]), 'image')
  assert.equal(mod.filePreviewKind({ name: 'a.txt', mime: '' }), 'text')
  assert.equal(mod.filePreviewKind({ name: 'a.pdf', mime: 'application/pdf' }), 'other')
  assert.equal(mod.fileSourceLabel(files[0]), '任务 task-1')
  assert.equal(mod.fileSourceLabel(files[1]), '消息 m-1')
  assert.equal(mod.formatFileSize(2048), '2.0 KB')
  assert.equal(mod.formatFileSize(null), '—')
  assert.match(mod.formatFileTime(1794020000000), /^\d{2}-\d{2} \d{2}:\d{2}$/)
})

check('空/坏 payload', () => {
  assert.equal(mod.normalizeSessionFiles(null).length, 0)
  assert.equal(mod.normalizeSessionFiles({ files: [] }).length, 0)
  assert.equal(mod.normalizeSessionFile({ id: 'x' })?.kind, 'artifact')
})

// ---- 2. 概览 ----
check('概览归一化：包装/字符串/数组/时间线', () => {
  const overview = mod.normalizeOverview({
    ok: true,
    overview: {
      goal: '这个会话要整理季度报告。',
      constraints: ['只能用本地数据。', '周五前完成。'],
      current: '正在撰写初稿。',
      completed: '数据已经收集完毕。',
      pending: '还需要校对与排版。',
      notes: { text: '报告需要给财务看。' },
      timeline: ['先收集数据。', '随后撰写初稿。', '然后校对。'],
      updatedAt: 1794020000000,
      version: 3,
    },
  })
  assert.equal(overview.goal, '这个会话要整理季度报告。')
  assert.equal(overview.constraints, '只能用本地数据。 周五前完成。')
  assert.equal(overview.notes, '报告需要给财务看。')
  assert.equal(overview.timeline, '先收集数据。 随后撰写初稿。 然后校对。')
  assert.equal(overview.version, 3)
  assert.equal(mod.isOverviewEmpty(overview), false)
})

check('概览空态 / 空对象 / 自然汇报体段落顺序', () => {
  assert.equal(mod.normalizeOverview(null), null)
  assert.equal(mod.normalizeOverview({ overview: {} }), null)
  assert.equal(mod.isOverviewEmpty(null), true)
  const overview = mod.normalizeOverview({
    overview: {
      goal: '目标是交付报告。',
      current: '现在进展顺利。\n\n下一步等校对。',
      timeline: '先收集数据，随后撰写，最后校对。',
    },
  })
  const sections = mod.overviewSections(overview)
  assert.deepEqual(sections.map((section) => section.title), ['目标', '现状', '时间线'])
  assert.deepEqual(sections[1].paragraphs, ['现在进展顺利。', '下一步等校对。'])
  // 时间线是完整叙述句
  assert.ok(sections[2].paragraphs[0].includes('随后'))
  assert.match(mod.formatOverviewTime(1794020000000), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
})

// ---- 3. 历史导航 ----
const messages = Array.from({ length: 30 }, (_, index) => ({
  id: `m${index}`,
  role: index % 2 === 0 ? 'user' : 'agent',
  text: `第 ${index} 条消息：**要点** 与 \`code\``,
  at: 1000 + index,
}))

check('消息摘要：去 Markdown、压空白、截断、撤回', () => {
  assert.equal(mod.summarizeMessage({ text: '## 标题\n\n**要点** `x`', status: 'done' }), '标题 要点 x')
  assert.equal(mod.summarizeMessage({ text: 'a'.repeat(200), status: 'done' }, 10), `${'a'.repeat(10)}…`)
  assert.equal(mod.summarizeMessage({ text: '内容', status: 'retracted' }), '（已撤回）')
  assert.equal(mod.summarizeMessage({ text: '   ', status: 'done' }), '（无文字内容）')
})

check('时间轴：每条消息一个 tick，区分 user/agent', () => {
  const ticks = mod.buildTimeline(messages)
  assert.equal(ticks.length, 30)
  assert.equal(ticks[0].role, 'user')
  assert.equal(ticks[1].role, 'agent')
  assert.ok(ticks[0].preview.includes('第 0 条消息'))
})

check('分页合并：去重 + 按时间升序；加载更早启发式', () => {
  const current = mod.buildTimeline(messages).length // 仅计数
  assert.equal(current, 30)
  const page1 = messages.slice(10)
  const older = messages.slice(0, 12)
  const merged = mod.mergeOlderMessages(page1, older)
  assert.equal(merged.length, 30)
  assert.equal(merged[0].id, 'm0')
  assert.equal(merged[merged.length - 1].id, 'm29')
  assert.equal(mod.shouldOfferOlder(messages), false) // 30 < 50
  assert.equal(mod.shouldOfferOlder(Array.from({ length: 50 }, () => ({ id: 'x', text: '', at: 0 }))), true)
})

check('当前视口高亮：取可见消息中最早的一条', () => {
  const ids = messages.map((message) => message.id)
  assert.equal(mod.pickActiveTick(['m5', 'm6'], ids), 'm5')
  assert.equal(mod.pickActiveTick(['m29', 'm10'], ids), 'm10')
  assert.equal(mod.pickActiveTick([], ids), null)
  assert.equal(mod.pickActiveTick(['unknown'], ids), null)
})

check('getMessages 分页参数（before/limit）', () => {
  const url = mod.getMessages.toString()
  assert.match(url, /before/)
  assert.match(url, /limit/)
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
const chatCenter = read(resolve(src, 'features/chat/ChatCenter.tsx'))
const filesView = read(resolve(src, 'features/chat/SessionFilesView.tsx'))
const overviewView = read(resolve(src, 'features/chat/OverviewView.tsx'))
const historyRail = read(resolve(src, 'features/chat/HistoryRail.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('M38/M40 会话标签：对话/轨迹/文件（概览移到右栏）+ 统一 Tabs', () => {
  assert.match(chatCenter, /Tabs/)
  assert.match(chatCenter, /label: '对话'/)
  assert.match(chatCenter, /label: '轨迹'/)
  assert.match(chatCenter, /label: '文件'/)
  assert.equal(/label: '概览'/.test(chatCenter), false)
  assert.match(chatCenter, /ariaLabel="会话标签"/)
})

check('文件页：列表/预览/下载，无上传或编辑控件', () => {
  assert.match(filesView, /fetchSessionFiles/)
  assert.match(filesView, /预览/)
  assert.match(filesView, /下载/)
  assert.match(filesView, /这个会话还没有文件/)
  assert.equal(/type="file"/.test(filesView), false)
  assert.equal(/<textarea|<input /.test(filesView), false)
})

check('概览只读：缓存加载 + 更新概览按钮 + 无表格/编辑控件', () => {
  assert.match(overviewView, /fetchSessionOverview/)
  assert.match(overviewView, /refreshSessionOverview/)
  assert.match(overviewView, /更新概览/)
  assert.match(overviewView, /只读/)
  assert.equal(/<table/.test(overviewView), false)
  assert.equal(/<textarea|<input /.test(overviewView), false)
  assert.match(overviewView, /overviewSections/)
})

check('历史导航：时间轴居中 + 点击跳转高亮 + data-message-id', () => {
  assert.match(historyRail, /aria-label="消息时间轴"/)
  assert.equal(/折叠消息时间轴|展开消息时间轴/.test(historyRail), false)
  assert.match(historyRail, /my-auto/)
  assert.match(historyRail, /onJump/)
  assert.match(messageList, /data-message-id/)
  assert.match(messageList, /highlightId/)
  assert.match(chatCenter, /HistoryRail/)
  assert.match(chatCenter, /jumpToMessage/)
  assert.match(chatCenter, /IntersectionObserver/)
})

check('门禁链包含 check-m11；无第三方库；无 Spec 概念', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m11-workbench\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

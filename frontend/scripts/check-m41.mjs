#!/usr/bin/env node
// scripts/check-m41.mjs —— M41 消息内联交互卡片自测
//
// 纯逻辑：卡片归一化/无效 schema fallback/去重、动作 payload+baseVersion、状态可交互性、
//         WS card.updated 解析。
// 源码：MessageList 内联渲染、复用 ViewRenderer、POST /api/cards/{id}/actions/{actionId}、
//        route=agent/action、submitted/disabled/expired、409 冲突刷新、白底/边框/8px/移动端、
//        不裸 JSON/不渲染 HTML；门禁链。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const built = await build({
  stdin: { contents: `export * from ${JSON.stringify(resolve(src, 'features/chat/cards.ts'))}`, resolveDir: here, loader: 'ts' },
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
const read = (path) => readFileSync(resolve(src, path), 'utf8')
console.log('M41 消息内联交互卡片自测（前端）')

const pageSchema = {
  schemaVersion: 1,
  id: 'card-page',
  sessionId: 'main',
  title: '任务卡片',
  layout: { kind: 'rows', columns: 12, gap: 'md', areas: [{ block: 'act', colSpan: 12 }] },
  blocks: [
    {
      id: 'act',
      type: 'action',
      props: { label: '重试任务', variant: 'primary' },
      actions: [{ id: 'retry', action: 'task.retry', args: { taskId: '$session' }, confirm: 'risk' }],
    },
  ],
  equivalence: { chatPrompt: '帮我重试这个任务' },
}

check('卡片归一化：schema/版本/状态/fallback/route', () => {
  const card = mod.normalizeInlineCard({ id: 'card-1', version: 3, status: 'active', route: 'agent', fallbackText: '任务卡片', schema: pageSchema }, 'msg-1', 'main')
  assert.equal(card.id, 'card-1')
  assert.equal(card.version, 3)
  assert.equal(card.status, 'active')
  assert.equal(card.route, 'agent')
  assert.equal(card.fallbackText, '任务卡片')
  assert.ok(card.page)
  assert.equal(card.page.blocks[0].type, 'action')
  assert.equal(card.pageError, null)
  // 裸 blocks 数组也兼容
  const bare = mod.normalizeInlineCard({ id: 'card-2', blocks: pageSchema.blocks, fallbackText: '兜底' }, 'msg-1', 'main')
  assert.ok(bare.page)
  // schema 字符串
  const json = mod.normalizeInlineCard({ id: 'card-3', schema: JSON.stringify(pageSchema) }, 'msg-1', 'main')
  assert.ok(json.page)
})

check('无效 schema/未知块 → page=null，保留 fallbackText（不渲染 JSON）', () => {
  const unknown = mod.normalizeInlineCard({
    id: 'card-x',
    fallbackText: '这张卡片暂不可用',
    schema: { schemaVersion: 1, blocks: [{ id: 'x', type: 'future', props: {} }] },
  }, 'msg-1', 'main')
  assert.equal(unknown.page, null)
  assert.match(unknown.pageError, /降级/)
  assert.equal(unknown.fallbackText, '这张卡片暂不可用')
  assert.equal(mod.normalizeInlineCard({ fallbackText: '无 id' }, 'm', 'main'), null)
})

check('卡片列表去重 / WS card.updated 新版本替换', () => {
  const cards = mod.normalizeInlineCards([
    { id: 'a', version: 1, schema: pageSchema },
    { id: 'a', version: 2, schema: pageSchema },
    { id: 'b', version: 1, schema: pageSchema },
  ], 'msg-1', 'main')
  assert.equal(cards.length, 2)
  assert.equal(cards[0].version, 1)
  const updated = mod.parseCardUpdated({ card: { id: 'a', version: 2, status: 'submitted', schema: pageSchema } }, 'main')
  assert.equal(updated.id, 'a')
  assert.equal(updated.version, 2)
  assert.equal(updated.status, 'submitted')
  assert.equal(mod.parseCardUpdated({ foo: 1 }, 'main'), null)
})

check('交互 payload：$session/$row + baseVersion；状态可交互性', () => {
  const card = mod.normalizeInlineCard({ id: 'card-1', version: 5, schema: pageSchema }, 'msg-1', 'main')
  const binding = card.page.blocks[0].actions[0]
  const payload = mod.cardActionPayload(card, binding, card.page, { id: 't1', title: '任务' })
  assert.equal(payload.baseVersion, 5)
  assert.equal(payload.payload.taskId, 'main')
  assert.deepEqual(payload.payload.row, { id: 't1', title: '任务' })
  assert.equal(mod.isCardInteractive(card), true)
  assert.equal(mod.isCardInteractive({ ...card, status: 'submitted' }), false)
  assert.equal(mod.isCardInteractive({ ...card, status: 'disabled' }), false)
  assert.equal(mod.isCardInteractive({ ...card, status: 'expired' }), false)
  assert.equal(mod.isCardInteractive({ ...card, page: null }), false)
})

// ---- 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const inline = read('features/chat/InlineCard.tsx')
const cardsSource = read('features/chat/cards.ts')
const messageList = read('features/chat/MessageList.tsx')
const viewRenderer = read('features/views/ViewRenderer.tsx')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

check('消息流内联：MessageList 渲染 cards[]，复用 ViewPageRenderer，fallbackText', () => {
  assert.match(messageList, /InlineCards/)
  assert.match(messageList, /message\.cards/)
  assert.match(inline, /ViewPageRenderer/)
  assert.match(inline, /normalizeInlineCards/)
  assert.match(inline, /fallbackText/)
  assert.match(viewRenderer, /BLOCK_META/)
  for (const type of ['chat', 'form', 'ask', 'action', 'deliverable', 'text', 'markdown', 'table', 'image', 'progress', 'timeline', 'dag', 'kanban']) {
    assert.match(viewRenderer, new RegExp(`block\\.type === '${type}'`), `ViewRenderer 缺少 ${type}`)
  }
})

check('交互端点：POST /api/cards/{id}/actions/{actionId} + payload/baseVersion + 防重复', () => {
  assert.match(cardsSource, /\/api\/cards\/\$\{encodeURIComponent\(card\.id\)\}\/actions\/\$\{encodeURIComponent\(binding\.id\)\}/)
  assert.match(cardsSource, /payload, baseVersion/)
  assert.match(inline, /submitting/)
  assert.match(inline, /pointer-events-none/)
  assert.match(inline, /aria-busy/)
  assert.match(inline, /提交中，请稍候/)
})

check('两种路由：agent 等待 / action 结果错误 / 审批提示可读', () => {
  assert.match(cardsSource, /已发送给司墨，等待回复/)
  assert.match(inline, /已发送给司墨，等待回复/)
  assert.match(inline, /result\.message/)
  assert.match(inline, /result\.conflict/)
  assert.match(inline, /审核|审批|error|错误/)
  assert.equal(/JSON\.stringify\([^)]*card|JSON\.stringify\([^)]*result/.test(inline), false)
})

check('状态：submitted/disabled/expired 样式 + WS/版本/冲突刷新', () => {
  assert.match(inline, /status === 'submitted'/)
  assert.match(inline, /status === 'disabled'/)
  assert.match(inline, /status === 'expired'/)
  assert.match(inline, /version/)
  assert.match(inline, /card\.updated/)
  assert.match(inline, /fetchInlineCard/)
  assert.match(inline, /请刷新后重试/)
  assert.match(inline, /v\{card\.version\}/)
  assert.match(inline, /role=\{feedback\.tone === 'danger' \? 'alert' : 'status'\}/)
})

check('安全/样式：白底 1px 边框 8px 圆角/主题 token/移动端；无 HTML/内联样式', () => {
  assert.match(inline, /rounded-md border border-border bg-surface-solid/)
  assert.match(inline, /min-w-0/)
  assert.equal(/dangerouslySetInnerHTML/.test(inline + cardsSource), false)
  assert.equal(/style=\{\{/.test(inline), false)
  assert.match(inline, /aria-label=/)
  assert.match(inline, /aria-disabled/)
})

check('门禁链包含 check-m41；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m41\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

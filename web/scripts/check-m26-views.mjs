#!/usr/bin/env node
// scripts/check-m26-views.mjs —— M24/M26 视图 Schema 渲染器骨架自测
//
// 覆盖：
//   - schema 校验：schemaVersion、13 块白名单、未知块 fallback、layout 12 栅格、重复块、
//     未知顶层字段、危险键（html/script/style/on*）、image 仅 artifact/upload 引用、actions→equivalence；
//   - 数据绑定：只读动作目录判定、$session/$page/$row 注入、JSONPath 子集、失败降级；
//   - fallback 摘要 table/chatPrompt；动作统一 /api/actions；ui.get/set/delete_view 调用；
//   - 源码：13 块、12 栅格、fallback、无 dangerouslySetInnerHTML、设置/命令面板入口、门禁链。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const built = await build({
  stdin: { contents: `export * from ${JSON.stringify(resolve(src, 'features/views/schema.ts'))}`, resolveDir: here, loader: 'ts' },
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
console.log('M24/M26 视图 Schema 渲染器自测（前端）')

const blocks = [
  { id: 'c', type: 'chat', props: { showComposer: false } },
  { id: 'f', type: 'form', props: { fields: [{ name: 'q', type: 'text', label: '问题' }] } },
  { id: 'a', type: 'ask', props: { question: '继续吗？', options: ['是', '否'] } },
  { id: 'btn', type: 'action', props: { label: '重试', variant: 'primary' }, actions: [{ id: 'retry', action: 'task.retry', args: { taskId: '$session' }, confirm: 'always' }] },
  { id: 'd', type: 'deliverable', props: { kind: 'all', layout: 'list' } },
  { id: 't', type: 'text', props: { text: '说明' } },
  { id: 'm', type: 'markdown', props: { markdown: '# 标题\n正文' } },
  { id: 'tb', type: 'table', props: { columns: ['名称', '状态'] } },
  { id: 'img', type: 'image', props: { src: '/api/artifacts/a1/content', alt: '图' } },
  { id: 'p', type: 'progress', props: { title: '进度' } },
  { id: 'tl', type: 'timeline', props: { source: 'session' } },
  { id: 'dg', type: 'dag', props: { orientation: 'TB' } },
  { id: 'kb', type: 'kanban', props: { columns: ['queued', 'running', 'done'] } },
]

function page(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'view-main-demo',
    sessionId: 'main',
    title: '本周工作台',
    layout: {
      kind: 'grid',
      columns: 12,
      gap: 'md',
      areas: blocks.map((block) => ({ block: block.id, colSpan: block.id === 'kb' ? 8 : 4 })),
    },
    blocks,
    equivalence: { chatPrompt: '帮我打开本周的工作台，看任务和交付物。', actionSequence: [{ action: 'task.retry' }] },
    meta: { createdBy: 'agent', reason: '用户要工作台' },
    ...overrides,
  }
}

check('13 核心块白名单（M34 扩展 chart）+ 合法 schema 通过', () => {
  assert.ok(mod.BLOCK_TYPES.length >= 13)
  for (const type of ['chat', 'form', 'ask', 'action', 'deliverable', 'text', 'markdown', 'table', 'image', 'progress', 'timeline', 'dag', 'kanban']) {
    assert.ok(mod.BLOCK_TYPES.includes(type), `缺少核心块 ${type}`)
  }
  assert.ok(mod.BLOCK_TYPES.includes('chart'))
  const result = mod.validateViewPage(page())
  assert.equal(result.ok, true)
  assert.equal(result.page.blocks.length, 13)
  assert.equal(result.fallback, false)
  assert.equal(result.page.layout.columns, 12)
  assert.equal(result.page.layout.areas.length, 13)
})

check('版本/未知块/重复块/未知顶层字段/危险键', () => {
  assert.match(mod.validateViewPage(page({ schemaVersion: 2 })).errors.join(','), /VIEW_SCHEMA_VERSION_UNSUPPORTED/)
  const unknown = mod.validateViewPage({ ...page(), blocks: [...blocks, { id: 'x', type: 'future_block', props: {} }] })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.fallback, true)
  assert.deepEqual(unknown.unsupportedTypes, ['future_block'])
  assert.match(mod.validateViewPage(page({ blocks: [...blocks, blocks[0]] })).errors.join(','), /duplicate-block/)
  assert.match(mod.validateViewPage(page({ extra: { code: 'x' } })).errors.join(','), /VIEW_UNKNOWN_FIELD/)
  assert.match(mod.validateViewPage(page({ blocks: [{ id: 'h', type: 'text', props: { text: 'x' }, style: 'color:red' }] })).errors.join(','), /VIEW_FORBIDDEN_KEY/)
  assert.match(mod.validateViewPage(page({ blocks: [{ id: 'h', type: 'text', props: { text: '<script>alert(1)</script>' } }] })).errors.join(','), /unsafe-value/)
})

check('layout 12 栅格 clamp + image 限制 + equivalence 必需', () => {
  const wide = mod.validateViewPage(page({ layout: { kind: 'grid', columns: 20, gap: 'md', areas: [] } }))
  assert.equal(wide.page.layout.columns, 12)
  const external = mod.validateViewPage(page({ blocks: [{ id: 'img', type: 'image', props: { src: 'https://evil.example/x.png', alt: 'x' } }] }))
  assert.match(external.errors.join(','), /VIEW_IMAGE_SRC_DENIED/)
  const noEquiv = mod.validateViewPage(page({ equivalence: null }))
  assert.match(noEquiv.errors.join(','), /VIEW_EQUIVALENCE_MISSING/)
})

check('数据绑定：readonly 目录判定 + 参数注入 + JSONPath', () => {
  const catalog = mod.normalizeActionCatalog({ actions: [{ name: 'task.list', risk: 'R0', readOnly: true }, { name: 'task.retry', risk: 'R3' }] })
  assert.equal(catalog.length, 2)
  const binding = { action: 'task.list', args: {}, select: 'items[0].title', fields: [], refreshOn: [], maxEverySec: null }
  assert.equal(mod.isReadOnlyBinding(binding, catalog), true)
  assert.equal(mod.isReadOnlyBinding({ ...binding, action: 'task.retry' }, catalog), false)
  const args = mod.resolveBindingArgs({ sessionId: '$session', pageId: '$page', rowId: '$row.id', nested: ['$session'] }, { sessionId: 'main', pageId: 'view-1', row: { id: 't1' } })
  assert.deepEqual(args, { sessionId: 'main', pageId: 'view-1', rowId: 't1', nested: ['main'] })
  assert.equal(mod.selectData({ items: [{ title: '甲' }] }, 'items[0].title'), '甲')
  assert.equal(mod.selectData({ a: { b: 2 } }, 'a.b'), 2)
  assert.equal(mod.selectData(null, 'a'), undefined)
})

check('fallback 摘要 table/chatPrompt', () => {
  const summary = mod.fallbackSummary({ title: 'X', blocks: [{ id: 'a', type: 'future' }], equivalence: { chatPrompt: '用对话做' } })
  assert.equal(summary.title, 'X')
  assert.equal(summary.rows.length, 1)
  assert.equal(summary.rows[0].label, 'future')
  assert.equal(summary.chatPrompt, '用对话做')
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
const renderer = read(resolve(src, 'features/views/ViewRenderer.tsx'))
const preview = read(resolve(src, 'features/views/ViewPreview.tsx'))
const actions = read(resolve(src, 'features/views/actions.ts'))
const settings = read(resolve(src, 'features/workbench/SettingsPage.tsx'))
const palette = read(resolve(src, 'features/workbench/CommandPalette.tsx'))
const commandDefs = read(resolve(src, 'features/workbench/commands.ts'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('渲染器：13 块 + 12 栅格 + fallback + 安全（无 dangerouslySetInnerHTML）', () => {
  for (const type of ['chat', 'form', 'ask', 'action', 'deliverable', 'text', 'markdown', 'table', 'image', 'progress', 'timeline', 'dag', 'kanban']) {
    assert.match(renderer, new RegExp(`block\\.type === '${type}'`))
  }
  assert.match(renderer, /md:grid-cols-12/)
  assert.match(renderer, /fallbackNote/)
  assert.equal(/dangerouslySetInnerHTML/.test(renderer + preview), false)
  assert.match(renderer, /isSafeHttpUrl/)
  assert.match(renderer, /\/api\/artifacts\//)
})

check('动作/版本：/api/actions + ui.get/set/delete_view + 回滚提示', () => {
  assert.match(actions, /\/api\/actions\/\$\{encodeURIComponent\(name\)\}/)
  assert.match(actions, /ui\.get_view/)
  assert.match(actions, /ui\.set_view/)
  assert.match(actions, /ui\.delete_view/)
  assert.match(preview, /回滚/)
  assert.match(preview, /版本不可变|新版本/)
  assert.match(preview, /uiSetView|uiDeleteView/)
})

check('入口：设置 + 命令面板打开自定义视图（无编辑 schema 控件）', () => {
  assert.match(settings, /自定义视图/)
  assert.match(settings, /VIEW_OPEN/)
  assert.match(commandDefs, /打开自定义视图/)
  assert.match(palette, /VIEW_OPEN/)
  assert.match(preview, /当前会话还没有自定义视图/)
  assert.equal(/textarea|contentEditable|dangerouslySetInnerHTML/.test(preview), false)
})

check('门禁链包含 check-m26；无第三方；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m26-views\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

#!/usr/bin/env node
// scripts/check-m28.mjs —— M28 视图编辑 UI 打磨自测
//
// 覆盖：
//   - 受控 patch：白名单 ops / add_block/remove_block/set props/actions/set title；不提供任意 JSON Patch；
//   - 新块默认 props/唯一 id；后端 4xx 错误定位 blockId/field/path；
//   - 看板：状态→语义动作映射（cancel/retry/pause/resume…），无绑定则不直接改状态；键盘替代目标；
//   - 版本：列表归一化、版本 schema 提取、回滚确认文案；
//   - 源码：编辑/版本面板、table 行动作、kanban 拖拽+键盘、错误高亮、窄屏/空错态/a11y、动作统一 /api/actions；
//     门禁链/无第三方/无 Spec。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const built = await build({
  stdin: { contents: `export * from ${JSON.stringify(resolve(src, 'features/views/editor.ts'))}`, resolveDir: here, loader: 'ts' },
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
console.log('M28 视图编辑 UI 自测（前端）')

check('受控 patch：白名单 ops + 提交/删除/改属性/改动作/改标题', () => {
  assert.deepEqual([...mod.ALLOWED_PATCH_OPS], ['set_page_props', 'replace_blocks', 'set_block_props', 'set_block_actions', 'add_block', 'remove_block'])
  assert.equal(mod.validatePatchOps([]).length, 1)
  assert.equal(mod.validatePatchOps([{ op: 'remove_block', blockId: 'a' }]).length, 0)
  assert.match(mod.validatePatchOps([{ op: 'json_patch', patch: [] }]).join(','), /不允许的 op/)
  assert.deepEqual(mod.buildSetPageTitle(' 新标题 '), { op: 'set_page_props', title: '新标题' })
  assert.deepEqual(mod.buildRemoveBlock('b1'), { op: 'remove_block', blockId: 'b1' })
  assert.deepEqual(mod.buildSetBlockProps('b1', { text: 'x' }), { op: 'set_block_props', blockId: 'b1', props: { text: 'x' } })
  assert.deepEqual(mod.buildSetBlockActions('b1', []), { op: 'set_block_actions', blockId: 'b1', actions: [] })
  const add = mod.buildAddBlock({ id: 'b2', type: 'text', props: {}, data: null, actions: [] }, 'b1')
  assert.equal(add.op, 'add_block')
  assert.equal(add.op === 'add_block' ? add.after : null, 'b1')
})

check('新块：默认 props + 唯一 id', () => {
  const block = mod.newViewBlock('progress', ['block-1', 'block-2'])
  assert.equal(block.type, 'progress')
  assert.equal(block.id, 'block-3')
  assert.equal(block.props.title, '进度')
  const image = mod.newViewBlock('image', [])
  assert.equal(image.props.alt, '图片')
  assert.equal(image.data, null)
})

check('4xx 错误定位：details/blockId/field/path/message', () => {
  const location = mod.extractViewErrorLocation({
    ok: false,
    data: null,
    raw: null,
    error: { code: 'VIEW_SCHEMA_INVALID', message: '块 props 非法', details: { blockId: 'b2', field: 'text', path: 'blocks[1].props.text' } },
  })
  assert.equal(location.blockId, 'b2')
  assert.equal(location.field, 'text')
  assert.equal(location.path, 'blocks[1].props.text')
  assert.match(location.message, /非法/)
  const fromMessage = mod.extractViewErrorLocation({ ok: false, data: null, raw: null, error: { message: 'block "b9" props 不合法' } })
  assert.equal(fromMessage.blockId, 'b9')
  const fallback = mod.extractViewErrorLocation({ ok: false, data: null, raw: null, error: { message: '失败' } })
  assert.equal(fallback.blockId, null)
})

check('看板：状态→既有语义动作映射（无绑定返回 null，不直接改状态）', () => {
  const actions = [
    { id: 'cancel', action: 'task.cancel', args: {}, confirm: 'risk' },
    { id: 'retry', action: 'task.retry', args: {}, confirm: 'always' },
    { id: 'resume', action: 'workflow.resume', args: {}, confirm: 'risk' },
  ]
  assert.equal(mod.kanbanBindingForStatus('cancelled', actions)?.action, 'task.cancel')
  assert.equal(mod.kanbanBindingForStatus('failed', actions)?.action, 'task.retry')
  assert.equal(mod.kanbanBindingForStatus('paused', actions), null)
  assert.equal(mod.kanbanBindingForStatus('running', actions)?.action, 'workflow.resume')
  const targets = mod.kanbanTargets(['queued', 'running', 'cancelled'], actions)
  assert.equal(targets.length, 3)
  assert.equal(targets[0].binding, null)
  assert.equal(targets[1].binding?.action, 'workflow.resume')
  assert.equal(targets[2].binding?.action, 'task.cancel')
})

check('版本：列表归一化/排序 + schema 提取（JSON 字符串）', () => {
  const versions = mod.normalizeViewVersions({ versions: [{ version: 2, hash: 'h2', createdAt: 200, reason: 'edit' }, { version: 1, hash: 'h1', createdAt: 100 }] })
  assert.deepEqual(versions.map((version) => version.version), [2, 1])
  assert.equal(versions[0].reason, 'edit')
  assert.equal(versions[1].hash, 'h1')
  assert.equal(mod.normalizeViewVersions(null).length, 0)
  const schema = mod.extractVersionSchema({ schemaJson: JSON.stringify({ title: '旧版', blocks: [{ id: 'a', type: 'text' }] }) })
  assert.equal(schema.title, '旧版')
  assert.equal(mod.extractVersionSchema({ schema: { title: '直接对象' } }).title, '直接对象')
  assert.equal(mod.pageSummary({ title: 'T', blocks: [{}, {}] }), 'T · 2 块')
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
const editorUi = read(resolve(src, 'features/views/ViewEditor.tsx'))
const versionPanel = read(resolve(src, 'features/views/VersionPanel.tsx'))
const renderer = read(resolve(src, 'features/views/ViewRenderer.tsx'))
const preview = read(resolve(src, 'features/views/ViewPreview.tsx'))
const actions = read(resolve(src, 'features/views/actions.ts'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('编辑器：结构化控件（标题/块 props/actions/添加/删除），不写任意 JSON', () => {
  assert.match(editorUi, /受控 patch/)
  assert.match(editorUi, /set_page_props|buildSetPageTitle/)
  assert.match(editorUi, /add_block|buildAddBlock/)
  assert.match(editorUi, /remove_block|buildRemoveBlock/)
  assert.match(editorUi, /set_block_props|buildSetBlockProps/)
  assert.match(editorUi, /set_block_actions|buildSetBlockActions/)
  assert.match(editorUi, /onChange/)
  assert.match(editorUi, /uiSetView/)
  assert.match(editorUi, /baseVersion/)
  assert.equal(/JSON\.parse/.test(editorUi), false)
  assert.equal(/name="schema"|aria-label="schema/i.test(editorUi), false)
})

check('看板拖拽+键盘替代 + 表格行动作', () => {
  assert.match(renderer, /draggable/)
  assert.match(renderer, /onDrop/)
  assert.match(renderer, /键盘替代/)
  assert.match(renderer, /kanbanTargets/)
  assert.match(renderer, /onRunAction\(binding, row\)/)
  assert.match(renderer, /aria-label={\`行操作/)
})

check('版本面板 + 回滚确认 + 错误定位/高亮 + a11y', () => {
  assert.match(versionPanel, /\/versions/)
  assert.match(versionPanel, /回滚到 v/)
  assert.match(versionPanel, /生成新版本|历史版本不删除/)
  assert.match(editorUi, /aria-invalid/)
  assert.match(editorUi, /role="alert"/)
  assert.match(preview, /ViewEditor/)
  assert.match(preview, /VersionPanel/)
  assert.match(preview, /编辑/)
})

check('窄屏/空错态/只读动作统一 /api/actions；门禁链', () => {
  assert.match(preview, /sm:p-4|sm:px-4/)
  assert.match(preview, /EmptyPane|ErrorPane/)
  assert.match(actions, /\/api\/actions\//)
  assert.match(actions, /ui\.set_view/)
  assert.match(packageJson.scripts['check'] ?? '', /check-m28\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

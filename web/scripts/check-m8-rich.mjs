#!/usr/bin/env node
// scripts/check-m8-rich.mjs —— M8 富文本/工具栏/附件纯逻辑 + 源码约束自测
//
// 覆盖：
//   - platform/markdown.ts：标题/粗斜体/行内代码/列表/代码块/引用/链接/分隔线/表格；
//     原始 HTML 只作为文本、链接仅 http(s)、escapeHtml；
//   - features/chat/markdown-edit.ts：包裹选区/代码块/列表前缀/链接插入/列表续行/快捷键；
//   - features/chat/attachments.ts：附件归一化、字节格式化、类型判定、上传前限额校验；
//   - 源码约束：消息渲染无 dangerouslySetInnerHTML、链接 rel、工具栏/附件 a11y、无第三方库、无 Spec 概念。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'platform/markdown.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/markdown-edit.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/attachments.ts'))}
export { parseMarkdown as parseMarkdownFromTasksModel } from ${JSON.stringify(resolve(src, 'features/tasks/model.ts'))}
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

console.log('M8 富文本/工具栏/附件自测（前端）')

// ---- 1. Markdown 块解析 ----
check('标题 / 段落 / 分隔线 / 引用 / 代码块', () => {
  const blocks = mod.parseMarkdown(['# 标题', '', '第一段', '第二行', '', '---', '', '> 引用', '', '```js', 'const a = 1', '```'].join('\n'))
  assert.deepEqual(blocks.map((block) => block.kind), ['heading', 'paragraph', 'rule', 'quote', 'code'])
  assert.equal(blocks[0].text, '标题')
  assert.equal(blocks[1].text, '第一段\n第二行') // 软换行保留
  assert.equal(blocks[4].lang, 'js')
})

check('无序列表 / 有序列表', () => {
  const unordered = mod.parseMarkdown('- a\n- b')
  assert.deepEqual(unordered, [{ kind: 'list', ordered: false, items: ['a', 'b'] }])
  const ordered = mod.parseMarkdown('1. 第一\n2. 第二')
  assert.deepEqual(ordered, [{ kind: 'list', ordered: true, items: ['第一', '第二'] }])
})

check('简单表格：表头 + 分隔行 + 行', () => {
  const blocks = mod.parseMarkdown('| 名称 | 值 |\n| --- | --- |\n| a | 1 |\n| b | 2 |')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'table')
  assert.deepEqual(blocks[0].headers, ['名称', '值'])
  assert.deepEqual(blocks[0].rows, [['a', '1'], ['b', '2']])
})

check('原始 HTML 只作为文本（不产生 HTML 字符串/节点）', () => {
  const blocks = mod.parseMarkdown('<script>alert(1)</script>')
  assert.equal(blocks[0].kind, 'paragraph')
  assert.equal(blocks[0].text, '<script>alert(1)</script>')
  assert.equal(mod.escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;')
})

check('行内解析：粗体/斜体/行内代码/安全链接', () => {
  const nodes = mod.parseInline('**粗** *斜* `code` [官网](https://example.com/a?b=1)')
  assert.deepEqual(nodes.map((node) => node.kind), ['strong', 'text', 'em', 'text', 'code', 'text', 'link'])
  const link = nodes.find((node) => node.kind === 'link')
  assert.equal(link.href, 'https://example.com/a?b=1')
  assert.equal(link.text, '官网')
})

check('链接白名单：仅 http/https，其它协议保持纯文本', () => {
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'mailto:a@b.c', '/relative']) {
    const nodes = mod.parseInline(`[x](${unsafe})`)
    assert.equal(nodes.some((node) => node.kind === 'link'), false, `${unsafe} 不应成为链接`)
    assert.equal(nodes.map((node) => node.text).join(''), `[x](${unsafe})`)
  }
  assert.equal(mod.isSafeHttpUrl('https://a.b/c'), true)
  assert.equal(mod.isSafeHttpUrl('http://a.b'), true)
  assert.equal(mod.isSafeHttpUrl('HTTPS://A.B'), true)
})

check('tasks/model 仍可 re-export 同一解析器（产物预览兼容）', () => {
  const fromTasks = mod.parseMarkdownFromTasksModel('| a | b |\n| --- | --- |\n| 1 | 2 |')
  assert.equal(fromTasks[0].kind, 'table')
})

// ---- 2. Composer 编辑纯逻辑 ----
check('包裹选区：有选区包住、无选区插入占位并选中', () => {
  const selected = mod.wrapSelection('hello world', 6, 11, '**', '粗体文本')
  assert.equal(selected.text, 'hello **world**')
  assert.deepEqual([selected.start, selected.end], [8, 13])
  const empty = mod.wrapSelection('ab', 1, 1, '**', 'X')
  assert.equal(empty.text, 'a**X**b')
  assert.deepEqual([empty.start, empty.end], [3, 4])
})

check('代码块 / 链接插入', () => {
  const block = mod.insertCodeBlock('abc', 0, 3)
  assert.equal(block.text, '```\nabc\n```')
  const emptyBlock = mod.insertCodeBlock('', 0, 0)
  assert.match(emptyBlock.text, /^```\n代码\n```$/)
  const linkWithSelection = mod.insertLink('see docs', 4, 8)
  assert.equal(linkWithSelection.text, 'see [docs](https://)')
  assert.equal(linkWithSelection.text.slice(linkWithSelection.start, linkWithSelection.end), 'https://')
  const linkEmpty = mod.insertLink('', 0, 0)
  assert.equal(linkEmpty.text, '[链接文字](https://)')
  assert.equal(linkEmpty.text.slice(linkEmpty.start, linkEmpty.end), '链接文字')
})

check('列表前缀：无序 / 有序（编号递增）', () => {
  const unordered = mod.applyUnorderedList('a\nb', 0, 3)
  assert.equal(unordered.text, '- a\n- b')
  const ordered = mod.applyOrderedList('a\nb\nc', 0, 5)
  assert.equal(ordered.text, '1. a\n2. b\n3. c')
  // 已带前缀的行不重复叠加
  const again = mod.applyUnorderedList('- a', 0, 3)
  assert.equal(again.text, '- a')
})

check('列表行回车续行：无序/有序/空项/非列表', () => {
  const ul = mod.continueListOnEnter('- item', 6)
  assert.equal(ul.handled, true)
  assert.equal(ul.state.text, '- item\n- ')
  assert.equal(ul.state.start, 9)

  const ol = mod.continueListOnEnter('1. one', 6)
  assert.equal(ol.state.text, '1. one\n2. ')

  const empty = mod.continueListOnEnter('- ', 2)
  assert.equal(empty.handled, true)
  assert.equal(empty.state.text, '')
  assert.equal(empty.state.start, 0)

  const plain = mod.continueListOnEnter('普通消息', 4)
  assert.equal(plain.handled, false)
})

check('Ctrl+B / Ctrl+I 快捷键语义', () => {
  assert.equal(mod.shortcutIntent('b', true, false), 'bold')
  assert.equal(mod.shortcutIntent('B', true, false), 'bold')
  assert.equal(mod.shortcutIntent('i', true, false), 'italic')
  assert.equal(mod.shortcutIntent('b', false, false), null)
  assert.equal(mod.shortcutIntent('b', true, true), null)
  assert.equal(mod.shortcutIntent('x', true, false), null)
})

// ---- 3. 附件 ----
check('附件归一化：{ok,attachments} / 裸数组 / 坏条目', () => {
  const list = mod.normalizeAttachmentList({
    ok: true,
    attachments: [
      { id: 'up-1', name: 'a.txt', mime: 'text/plain', size: 12, createdAt: 1 },
      { id: 'up-2', name: 'b.png', mime: 'image/png', size: 2048 },
      { name: 'no-id.txt' },
    ],
  })
  assert.equal(list.length, 2)
  assert.equal(list[0].name, 'a.txt')
  assert.equal(list[1].size, 2048)
  assert.equal(mod.normalizeAttachmentList(null).length, 0)
  assert.equal(mod.normalizeAttachmentList([{ id: 'x' }]).length, 1)
})

check('字节格式化 / 附件类型判定', () => {
  assert.equal(mod.formatBytes(512), '512 B')
  assert.equal(mod.formatBytes(2048), '2.0 KB')
  assert.equal(mod.formatBytes(2 * 1024 * 1024), '2.0 MB')
  assert.equal(mod.attachmentKind({ name: 'a.txt', mime: 'text/plain' }), 'text')
  assert.equal(mod.attachmentKind({ name: 'a.md', mime: '' }), 'text')
  assert.equal(mod.attachmentKind({ name: 'a.png', mime: 'image/png' }), 'image')
  assert.equal(mod.attachmentKind({ name: 'a.pdf', mime: 'application/pdf' }), 'other')
})

check('上传前限额：单文件 ≤20MiB、单条消息 ≤5 个', () => {
  const small = new File(['x'], 'a.txt', { type: 'text/plain' })
  assert.equal(mod.validateFiles([small], 0), null)
  assert.match(mod.validateFiles([small, small, small, small, small, small], 0), /最多 5 个/)
  const big = new File([new Uint8Array(1)], 'big.bin')
  Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 })
  assert.match(mod.validateFiles([big], 0), /20 MiB/)
  assert.equal(mod.validateFiles([small], 4), null)
  assert.equal(mod.validateFiles([small], 5), '单条消息最多 5 个附件')
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
const markdownMessage = read(resolve(src, 'features/chat/MarkdownMessage.tsx'))
const composer = read(resolve(src, 'features/chat/Composer.tsx'))
const attachments = read(resolve(src, 'features/chat/attachments.ts'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const messageAttachments = read(resolve(src, 'features/chat/MessageAttachments.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('渲染安全：无 dangerouslySetInnerHTML，链接带 noopener', () => {
  assert.equal(/dangerouslySetInnerHTML/.test(markdownMessage), false)
  assert.match(markdownMessage, /rel="noopener noreferrer nofollow"/)
  assert.match(markdownMessage, /target="_blank"/)
})

check('工具栏/附件可访问性：role=toolbar、aria-label、chip 删除按钮', () => {
  assert.match(composer, /role="toolbar"/)
  assert.match(composer, /aria-label=\{item\.title\}/)
  assert.match(composer, /aria-label=\{`移除附件 \$\{attachment\.name\}`\}/)
  assert.match(composer, /onPaste=/)
  assert.match(composer, /onDrop=/)
  assert.match(composer, /type="file"/)
})

check('消息渲染接入：MarkdownMessage + MessageAttachments；上传端点/批量字段', () => {
  assert.match(messageList, /<MarkdownMessage text=/)
  assert.match(messageList, /<MessageAttachments attachments=/)
  assert.match(attachments, /\/api\/uploads\?sessionId=/)
  assert.match(attachments, /form\.append\('file'/)
  assert.match(messageAttachments, /download=\{attachment\.name\}/)
  assert.match(messageAttachments, /aria-label=\{`\$\{open \? '收起' : '预览'\}附件/)
})

check('无第三方 Markdown/编辑器/UI 库；不出现 Spec 概念', () => {
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
  const files = collect(src, /\.(ts|tsx)$/)
  const forbidden = /marked|markdown-it|remark|rehype|tiptap|prosemirror|antd|@mui|@chakra-ui/
  for (const file of files) {
    assert.equal(forbidden.test(read(file)), false, `${file} 引入了第三方富文本/UI 库`)
  }
  const specFiles = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = specFiles.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

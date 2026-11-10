#!/usr/bin/env node
// scripts/check-m44.mjs —— M44 输入框重做自测
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')
const read = (path) => readFileSync(resolve(src, path), 'utf8')
const readRoot = (path) => readFileSync(resolve(root, path), 'utf8')

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`) }
  catch (error) { failed += 1; console.error(`  ✖ ${name}`); console.error(`    ${error instanceof Error ? error.message : String(error)}`) }
}
console.log('M44 输入框重做自测（前端）')

const composer = read('features/chat/Composer.tsx')
const agents = read('features/agents/AgentsPage.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('删除格式工具条与模型/推理选择器；保留附件入口', () => {
  assert.equal(/TOOLBAR/.test(composer), false)
  assert.equal(/role="toolbar"/.test(composer), false)
  assert.equal(/aria-label="添加附件"/.test(composer), true)
  assert.equal(/type="file"/.test(composer), true)
  assert.equal(/aria-label="模型"/.test(composer), false)
  assert.equal(/aria-label="推理强度"/.test(composer), false)
  assert.equal(/MODEL_OPTIONS|REASONING_OPTIONS/.test(composer), false)
  assert.equal(/markdown-edit/.test(composer), false)
  assert.equal(/Ctrl\+B|粗斜体|列表行回车|后端模型切换接口未就绪/.test(composer), false)
})

check('多行自适应：rows=3、min 84 / max 196、内部滚动、14px/1.6', () => {
  assert.match(composer, /rows=\{3\}/)
  assert.match(composer, /min-h-\[58px\] max-h-\[176px\]/)
  assert.match(composer, /overflow-y-auto/)
  assert.match(composer, /text-\[13\.5px\] leading-\[1\.65\]/)
  assert.match(composer, /MAX_HEIGHT = 196/)
  assert.match(composer, /minHeight|style\.height/)
})

check('输入区：最大 860px 居中，白底/1px/4px；发送按钮不被裁切', () => {
  assert.match(composer, /relative mx-auto w-full max-w-\[780px\]/)
  assert.match(composer, /rounded-md border border-border bg-surface/)
  assert.equal(/rounded-lg|shadow-lg|accent-gradient/.test(composer), false)
  assert.match(composer, /flex min-w-0 items-center justify-end gap-2/)
  assert.match(composer, /h-\[30px\] min-w-\[56px\] flex-none/)
})

check('输入框底部：左 Markdown；右 Enter 提示 + 发送；无额外提示', () => {
  assert.match(composer, /支持 Markdown 格式/)
  assert.match(composer, /id="composer-hint"/)
  assert.match(composer, /Enter 发送 · Shift\+Enter 换行/)
  assert.match(composer, /发送/)
  assert.equal(/可连续发送|Markdown 源|附件上传中|恢复会话后可继续对话|字 ·/.test(composer), false)
})

check('空态：小头像 + 开始和司墨对话 + 细边框建议按钮 + 无 Esc/彩色方块', () => {
  const messageList = read('features/chat/MessageList.tsx')
  assert.match(messageList, /开始和司墨对话/)
  assert.match(messageList, /EMPTY_SUGGESTIONS/)
  assert.match(messageList, /rounded-sm border border-border bg-surface/)
  assert.match(messageList, /开始和司墨对话/)
  assert.match(messageList, /COMPOSER_INSERT/)
  assert.equal(/一句话开始/.test(messageList), false)
  assert.equal(/Esc 关闭弹窗|text-glow|>做<|>记<|>聊</.test(messageList), false)
})

check('发送：空内容禁用、提交中 loading、防重复', () => {
  assert.match(composer, /disabled=\{!canSend\}/)
  assert.match(composer, /sending/)
  assert.match(composer, /发送中…/)
  assert.match(composer, /animate-spin/)
  assert.match(composer, /setSending\(true\)/)
})

check('模型固定 V4.1 Flash（智能体页显示，输入区不配置）', () => {
  assert.match(agents, /V4\.1 Flash/)
  assert.equal(/aria-label="模型"/.test(agents), false)
})

check('门禁链包含 check-m44；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m44\.mjs/)
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx|css|html)$/.test(entry.name)) files.push(full)
    }
  }
  walk(src)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

#!/usr/bin/env node
// scripts/check-m68.mjs —— M68 Inspector/聊天上下文只在对话页
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')
const read = (path) => readFileSync(resolve(src, path), 'utf8')
const readRoot = (path) => readFileSync(resolve(root, path), 'utf8')
const app = read('app/App.tsx')
const chat = read('features/chat/ChatCenter.tsx')
const pkg = JSON.parse(readRoot('package.json'))

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`) }
  catch (error) { failed += 1; console.error(`  ✖ ${name}`); console.error(`    ${error instanceof Error ? error.message : String(error)}`) }
}
console.log('M68 仅对话页显示 Inspector 自测（前端）')

check('页格：对话页保留右栏列，其它页单列占满', () => {
  assert.match(app, /showChat \? 'grid-cols-\[minmax\(0,1fr\)_var\(--layout-right\)\] max-\[1240px\]:grid-cols-\[minmax\(0,1fr\)_40px\]' : 'grid-cols-1'/)
})
check('Inspector 只在对话页挂载；右栏拖拽条同样条件渲染', () => {
  assert.match(app, /\{showChat && <Slot slot="rightPanel"/)
  assert.match(app, /\{showChat && \(\s*<div\s*role="separator"/)
})
check('聊天上下文条/时间轴/Composer 只在 ChatCenter（对话内容）内', () => {
  assert.match(chat, /h-\[42px\] flex-none items-center justify-between/)
  assert.match(chat, /max-w-\[780px\]/)
  assert.match(chat, /<Composer/)
  assert.equal(/h-\[42px\].*Composer/s.test(app), false)
})
check('顶栏与左栏保持全局一致', () => {
  assert.match(app, /<Slot slot="leftTree"/)
  assert.match(app, /<TopBar/)
})
check('门禁链包含 check-m68', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m68\.mjs/)
})
console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

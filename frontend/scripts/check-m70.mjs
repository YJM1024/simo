#!/usr/bin/env node
// scripts/check-m70.mjs —— M70 本地单草稿 + 首条消息懒创建
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')
const read = (path) => readFileSync(resolve(src, path), 'utf8')
const readRoot = (path) => readFileSync(resolve(root, path), 'utf8')
const tree = read('features/sessions/SessionTreePanel.tsx')
const runtime = read('features/chat/useChatRuntime.ts')
const pkg = JSON.parse(readRoot('package.json'))

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`) }
  catch (error) { failed += 1; console.error(`  ✖ ${name}`); console.error(`    ${error instanceof Error ? error.message : String(error)}`) }
}
console.log('M70 单草稿会话自测（前端）')

check('新建会话只在本地创建一个草稿，不调用 POST', () => {
  assert.match(tree, /const DRAFT_ID = 'draft:new'/)
  assert.match(tree, /const startDraft = useCallback/)
  assert.match(tree, /publishDraft\(\)/)
  assert.equal(/const startDraft[\s\S]{0,300}createSession/.test(tree), false)
})

check('草稿唯一：state 只保存 boolean，重复点击复用同一条', () => {
  assert.match(tree, /const \[drafting, setDrafting\] = useState\(false\)/)
  assert.match(tree, /activeId === DRAFT_ID/)
  assert.match(tree, /drafting && !query\.trim\(\)/)
})

check('草稿空消息不加载 API；首条发送时才创建真实会话', () => {
  assert.match(runtime, /isDraftSessionId/)
  assert.match(runtime, /if \(isDraftSessionId\(sessionId\)\) \{[\s\S]*setMessages\(\[\]\)/)
  assert.match(runtime, /const created = await createSession\(null, '新会话'\)/)
  assert.match(runtime, /SESSION_DRAFT_ACCEPT/)
  assert.match(runtime, /writeSessionId\(realId\)/)
  assert.match(runtime, /connectWs\(realId\)/)
})

check('空会话不显示；切走草稿丢弃', () => {
  assert.match(tree, /pruneEmptySessions/)
  assert.match(tree, /node\.messageCount !== 0/)
  assert.match(tree, /setDrafting\(false\)/)
})

check('门禁链包含 check-m70', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m70\.mjs/)
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

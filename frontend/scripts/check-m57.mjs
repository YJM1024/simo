#!/usr/bin/env node
// scripts/check-m57.mjs —— M57 会话切换瞬时贴底自测
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
console.log('M57 会话切换瞬时贴底自测（前端）')

const messageList = read('features/chat/MessageList.tsx')
const chatCenter = read('features/chat/ChatCenter.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('消息滚动容器不再含 scroll-smooth（scroll-behavior:auto）', () => {
  assert.equal(/scroll-smooth/.test(messageList), false)
  assert.match(messageList, /overflow-y-auto/)
  assert.match(messageList, /flex w-full min-w-0 flex-1 flex-col gap-0 overflow-y-auto/)
})

check('切换会话/首次加载：直接 scrollTop = scrollHeight（瞬时）', () => {
  assert.match(chatCenter, /el\.scrollTop = el\.scrollHeight/)
  assert.match(chatCenter, /useLayoutEffect\(\(\) => \{\s*stickRef\.current = true/)
  assert.match(chatCenter, /useLayoutEffect\(\(\) => \{\s*if \(tab === 'chat' && stickRef\.current && !runtime\.messagesLoading\) scrollToBottom\(false\)/)
  assert.match(chatCenter, /visibleMessages = runtime\.messagesLoading\s*\? \[\]\s*:\s*runtime\.messages\.filter/)
})

check('仅「回到底部」点击使用平滑滚动；加载更多不触发平滑', () => {
  assert.match(chatCenter, /const jumpToBottom = useCallback\(\(\) => \{[\s\S]*scrollToBottom\(true\)/)
  assert.equal(/onLoadOlder[\s\S]{0,80}scrollToBottom\(true\)/.test(chatCenter), false)
  assert.equal(/scrollToBottom\(true\)/.test(chatCenter), true)
  assert.match(chatCenter, /behavior: 'smooth'/)
})

check('门禁链包含 check-m57；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m57\.mjs/)
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

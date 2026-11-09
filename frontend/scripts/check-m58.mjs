#!/usr/bin/env node
// scripts/check-m58.mjs —— M58 不显示系统消息/路由提示自测
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
console.log('M58 系统消息/路由提示隐藏自测（前端）')

const messageList = read('features/chat/MessageList.tsx')
const chatCenter = read('features/chat/ChatCenter.tsx')
const history = read('features/chat/history.ts')
const pkg = JSON.parse(readRoot('package.json'))

check('消息列表过滤非 user/agent；不渲染/不占位', () => {
  assert.match(messageList, /displayedMessages = messages\.filter\(\(message\) => message\.role === 'user' \|\| message\.role === 'agent'\)/)
  assert.match(messageList, /displayedMessages\.map/)
  assert.match(chatCenter, /runtime\.messages\.filter\(\(message\) => message\.role === 'user' \|\| message\.role === 'agent'\)/)
})

check('时间轴过滤 system/工具消息', () => {
  assert.match(history, /filter\(\(message\) => message\.role === 'user' \|\| message\.role === 'agent'\)/)
})

check('删除 system 头像/系统标签/路由文案', () => {
  assert.equal(/role === 'system'|ROLE_LABEL\[role\].*系统|<Icon name="info"/.test(messageList), false)
  assert.equal(/已路由|路由到/.test(read('features/chat/ChatCenter.tsx')), false)
})

check('只保留你/司墨两种消息头（user 不重复角色名）', () => {
  assert.match(messageList, /role !== 'user' && \(/)
  assert.match(messageList, /ROLE_LABEL: Record<string, string> = \{ user: '你', agent: '司墨' \}/)
})

check('门禁链包含 check-m58；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m58\.mjs/)
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

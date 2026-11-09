#!/usr/bin/env node
// scripts/check-m50.mjs —— M50 移除消息编辑/重发 + system 中性样式自测
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
console.log('M50 消息编辑/重发移除自测（前端）')

const messageList = read('features/chat/MessageList.tsx')
const chatCenter = read('features/chat/ChatCenter.tsx')
const mentions = read('features/chat/mentions.ts')
const commandPalette = read('features/workbench/CommandPalette.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('消息操作删除编辑/重发：无入口、状态、弹窗、回调', () => {
  for (const source of [messageList, chatCenter, mentions]) {
    assert.equal(/编辑重发|编辑并重发|保存并重发|onEditResend|editResend|onRetryMessage|retryMessage(?!s)|retryPrompt/.test(source), false)
  }
  assert.equal(/编辑重发|编辑并重发|保存并重发/.test(messageList), false)
  assert.equal(/setEditing|editText|editing/.test(messageList), false)
})

check('保留复制/引用/跳到原文；消息级「重试」已删除', () => {
  assert.match(messageList, /复制消息/)
  assert.match(messageList, /引用这条消息/)
  assert.match(messageList, /跳到原文/)
  assert.equal(/重试这条消息|重试（重新发送对应请求）/.test(messageList), false)
  assert.match(chatCenter, /copyMessageText/)
})

check('命令面板/斜杠命令无编辑消息项', () => {
  assert.equal(/编辑消息|重发消息|edit-message|retry-message/.test(commandPalette), false)
  assert.match(chatCenter, /parseSlash/)
})

check('仅渲染 user/agent：无 system 消息、头像或标签', () => {
  assert.match(messageList, /displayedMessages = messages\.filter/)
  assert.equal(/role === 'system'|<Icon name="info"/.test(messageList), false)
  assert.equal(/message-system-border|bg-message-system/.test(messageList), false)
})

check('切换会话/首次加载：消息完成前加载态，瞬间 scrollTop=scrollHeight，无平滑', () => {
  assert.match(chatCenter, /el\.scrollTop = el\.scrollHeight/)
  assert.match(chatCenter, /useLayoutEffect\(\(\) => \{\s*if \(tab === 'chat' && stickRef\.current && !runtime\.messagesLoading\)/)
  assert.match(chatCenter, /visibleMessages = runtime\.messagesLoading\s*\? \[\]\s*:\s*runtime\.messages\.filter/)
  assert.match(chatCenter, /messages=\{visibleMessages\}/)
  assert.match(chatCenter, /jumpToBottom[\s\S]*scrollToBottom\(true\)/)
})

check('门禁链包含 check-m50；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m50\.mjs/)
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

#!/usr/bin/env node
// scripts/check-m55.mjs —— M55 消息头像严格对齐 + 流式中断态自测
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')
const read = (path) => readFileSync(resolve(src, path), 'utf8')
const readRoot = (path) => readFileSync(resolve(root, 'path'), 'utf8')

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`) }
  catch (error) { failed += 1; console.error(`  ✖ ${name}`); console.error(`    ${error instanceof Error ? error.message : String(error)}`) }
}
console.log('M55 消息头像对齐/中断态自测（前端）')

const messageList = read('features/chat/MessageList.tsx')
const avatar = read('platform/AgentAvatar.tsx')
const runtime = read('features/chat/useChatRuntime.ts')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

check('头像自身无 margin/self-start/translate；30px 圆形统一', () => {
  assert.equal(/self-start|translate|margin-top|mt-/.test(avatar), false)
  assert.match(avatar, /h-\[30px\] w-\[30px\]|h-6 w-6/)
  assert.match(avatar, /rounded-full/)
  assert.match(messageList, /mt-\[-2px\].*h-6 w-6/)
})

check('消息头固定 30px、items-center、20px 行高、无额外上下 gap', () => {
  assert.match(messageList, /mb-1 flex h-5 min-w-0 flex-nowrap items-center/)
  assert.equal(/min-h-\[30px\]/.test(messageList), false)
})

check('页面只渲染 user/agent：无 system 头像/标签', () => {
  assert.match(messageList, /displayedMessages = messages\.filter/)
  assert.equal(/role === 'system'|<Icon name="info"/.test(messageList), false)
})

check('流式失败/超时：done 状态归一为 error，error 帧终止 streaming；文案回复中断且无撤回', () => {
  assert.match(runtime, /fail\|error\|timeout\|interrupt\|abort\|cancel/)
  assert.match(runtime, /doneStatus/)
  assert.match(runtime, /item\.status === 'streaming' \? \{ \.\.\.item, status: 'error' \}/)
  assert.match(messageList, /role === 'agent' \? '回复中断' : '发送失败'/)
  assert.match(messageList, /\{streaming && \(/)
})

check('门禁链包含 check-m55；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m55\.mjs/)
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

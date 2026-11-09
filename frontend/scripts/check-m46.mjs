#!/usr/bin/env node
// scripts/check-m46.mjs —— M46 四项截图缺陷修复自测
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
console.log('M46 截图缺陷修复自测（前端）')

const chatCenter = read('features/chat/ChatCenter.tsx')
const messageList = read('features/chat/MessageList.tsx')
const composer = read('features/chat/Composer.tsx')
const historyRail = read('features/chat/HistoryRail.tsx')
const styles = read('styles.css')
const pkg = JSON.parse(readRoot('package.json'))

check('消息头不重复角色名：user 只保留头像「你」，agent 只出现一次「司墨」', () => {
  assert.match(messageList, /role !== 'user' && \(/)
  assert.match(messageList, /role === 'agent' && handler \? handler\.name/)
  assert.match(messageList, /aria-label=\{\`回复这条消息/)
})

check('消息列/输入区共用 832px 列与 52px 左内边距；时间轴绝对挂列左', () => {
  assert.match(chatCenter, /relative flex min-h-0 w-full max-w-\[832px\]/)
  assert.match(chatCenter, /absolute inset-y-0 left-0 z-10/)
  assert.match(messageList, /pl-\[52px\]/)
  assert.match(composer, /max-w-\[832px\] pl-\[52px\]/)
  assert.equal(/mx-auto flex min-h-0 w-full max-w-\[800px\]/.test(messageList), false)
})

check('回到底部：28×28 小方角图标按钮，仅离底出现', () => {
  assert.match(chatCenter, /!atBottom && \(/)
  assert.match(chatCenter, /h-7 w-7/)
  assert.match(chatCenter, /rounded-xs border border-border bg-surface-solid/)
  assert.match(chatCenter, /<Icon name="chevron-down"/)
  assert.match(chatCenter, /aria-label="回到最底部"/)
  assert.equal(/回到底部 ↓/.test(chatCenter), false)
})

check('正文 15px/1.65；时间轴按发送方着色、hover 加宽', () => {
  assert.match(messageList, /text-\[15px\] leading-\[1\.65\]/)
  assert.match(styles, /--timeline-user: #3b82f6/)
  assert.match(styles, /--timeline-agent: #64748b/)
  assert.equal(/--timeline-system/.test(styles), false)
  assert.match(historyRail, /h-\[5px\] w-\[22px\]/)
  assert.match(historyRail, /group-hover:w-7/)
  assert.match(historyRail, /w-px -translate-x-1\/2 bg-timeline-track/)
})

check('门禁链包含 check-m46；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m46\.mjs/)
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

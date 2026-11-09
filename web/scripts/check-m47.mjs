#!/usr/bin/env node
// scripts/check-m47.mjs —— M47 消息头像与分段控件自测
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
console.log('M47 消息头像与分段控件自测（前端）')

const avatar = read('platform/AgentAvatar.tsx')
const messageList = read('features/chat/MessageList.tsx')
const chatCenter = read('features/chat/ChatCenter.tsx')
const topBar = read('app/TopBar.tsx')
const styles = read('styles.css')
const pkg = JSON.parse(readRoot('package.json'))

check('头像全站统一：圆形、30/24 两档、无彩色底/渐变', () => {
  assert.match(styles, /--avatar-agent-bg: #111827/)
  assert.match(styles, /--avatar-agent-ink: #ffffff/)
  assert.match(styles, /--avatar-bg: #f3f4f6/)
  assert.match(styles, /--avatar-ink: #374151/)
  assert.match(styles, /--avatar-border: #e5e7eb/)
  assert.match(avatar, /xs: 'h-6 w-6 text-\[11px\]'/)
  assert.match(avatar, /sm: 'h-\[30px\] w-\[30px\] text-xs'/)
  assert.match(avatar, /rounded-full/)
  assert.match(avatar, /bg-avatar-agent-bg text-avatar-agent-ink/)
  assert.equal(/accent-soft|ok-soft|warn-soft|danger-soft|gradient/.test(avatar), false)
  assert.equal(/h-10 w-10|h-14 w-14/.test(avatar), false)
})

check('助手 30px 深色「墨」/ 用户 30px 浅灰「你」+ 1px 边', () => {
  assert.match(messageList, /h-\[30px\] w-\[30px\].*rounded-full/)
  assert.match(messageList, /border-avatar-border bg-avatar-bg text-avatar-ink/)
  assert.match(messageList, /AgentAvatar agent=\{handler \?\? findAgent\(\[\], message\.agentId\)\} size="sm"/)
})

check('消息头：min-height 30 / items-center / meta 13px/20px / 与正文 6px', () => {
  assert.match(messageList, /mb-1\.5 flex h-\[30px\] flex-nowrap items-center/)
  assert.match(messageList, /text-\[13px\] font-medium leading-5/)
  assert.match(read('features/chat/MessageBadges.tsx'), /text-\[13px\] leading-5 text-ink-muted/)
  assert.match(messageList, /text-\[15px\] leading-\[1\.65\]/)
})

check('分段控件：13px、选中深色 + 2px 下划线、无胶囊/边框', () => {
  assert.match(chatCenter, /flex items-center gap-4 text-\[13px\]/)
  assert.match(chatCenter, /font-medium text-ink/)
  assert.match(chatCenter, /h-0\.5 bg-ink/)
  assert.match(chatCenter, /aria-pressed=\{!runtime\.includeChildren\}/)
})

check('「就绪」纯文字（会话头与顶栏）', () => {
  assert.match(chatCenter, /text-\[13px\] text-ink-muted/)
  assert.match(topBar, /text-\[13px\] text-ink-muted/)
  assert.equal(/rounded-pill border px-2 py-0\.5 font-mono text-2xs tracking-normal/.test(chatCenter), false)
})

check('全站头像使用档位：消息/团队 sm，列表/树 xs，智能体页 sm/lg→30', () => {
  assert.match(read('features/chat/MessageList.tsx'), /size="sm"/)
  assert.match(read('features/team/TeamPage.tsx'), /size="sm"/)
  assert.match(read('features/sessions/SessionTreePanel.tsx'), /size="xs"/)
  assert.match(read('features/workbench/UsagePage.tsx'), /size="xs"/)
  assert.match(read('features/agents/AgentsPage.tsx'), /size="lg"/)
})

check('门禁链包含 check-m47；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m47\.mjs/)
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

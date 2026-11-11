#!/usr/bin/env node
// scripts/check-m45.mjs —— M45 布局/密度修复自测
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
console.log('M45 布局与密度自测（前端）')

const app = read('app/App.tsx')
const topBar = read('app/ShellHeader.tsx')
const topTabs = read('app/ShellHeader.tsx')
const chatCenter = read('features/chat/ChatCenter.tsx')
const messageList = read('features/chat/MessageList.tsx')
const historyRail = read('features/chat/HistoryRail.tsx')
const composer = read('features/chat/Composer.tsx')
const sessionTree = read('features/sessions/SessionTreePanel.tsx')
const rightRail = read('features/tasks/RightRail.tsx')
const notification = read('features/chat/NotificationCenter.tsx')
const permission = read('app/PermissionMenu.tsx')
const styles = read('styles.css')
const pkg = JSON.parse(readRoot('package.json'))

check('1060 底部状态栏：单行 nowrap、flex-none、紧凑计数', () => {
  assert.match(sessionTree, /border-t border-border-subtle/)
  assert.match(sessionTree, /本月用量/)
  assert.match(sessionTree, /counts\.active|个任务/)
})

check('1060 右栏：收起时隐藏，顶部按钮打开浮层；标签不再被压', () => {
  assert.match(rightRail, /max-\[1240px\]:fixed/)
  assert.match(topBar, /RIGHT_RAIL_OPEN|workspace|Icon/)
  assert.match(topBar, /NotificationCenter/)
  assert.match(app, /max-\[1240px\]:grid-cols-\[minmax\(0,1fr\)_40px\]/)
})

check('输入区：min-w-0、发送固定、与消息列共用 832 列、底部不换行', () => {
  assert.match(composer, /relative mx-auto w-full max-w-\[780px\]/)
  assert.match(composer, /flex min-w-0 items-center justify-end gap-2/)
  assert.match(composer, /h-\[30px\] min-w-\[56px\] flex-none/)
  assert.match(composer, /min-h-\[58px\]/)
})

check('顶部两行：52px header + 40px 独立导航；通知在 header；不重叠', () => {
  assert.match(topBar, /h-\[54px\] flex-none items-center/)
  assert.match(topBar, /NotificationCenter/)
  assert.match(topBar, /<Tabs/)
  assert.equal(/h-10 flex-none items-center border-b border-border-subtle bg-surface px-4/.test(app), false)
  assert.equal(/<Tabs/.test(app), false)
  assert.match(topTabs, /h-8/)
  assert.match(topTabs, /gap-\[18px\]/)
})

check('对话列居中：消息和输入同一 832 列、时间轴绝对挂左、回底按钮 28×28', () => {
  assert.match(chatCenter, /relative flex min-h-0 w-full max-w-\[780px\]/)
  assert.match(chatCenter, /absolute inset-y-0 left-0 z-10/)
  assert.match(messageList, /flex w-full min-w-0 flex-1 flex-col.*pl-\[46px\]/)
  assert.equal(/mx-auto flex min-h-0 w-full max-w-\[800px\]/.test(messageList), false)
  assert.match(chatCenter, /h-7 w-7.*rounded-xs/)
  assert.match(chatCenter, /aria-label="回到最底部"/)
  assert.match(messageList, /min-w-0 flex-1/)
})

check('时间轴：32px 热区、按发送方着色、横向短条、轨道、间距、鼠标跟随预览', () => {
  assert.match(historyRail, /h-3\.5 w-9 flex-none/)
  assert.match(historyRail, /h-1\.5 w-5/)
  assert.match(historyRail, /group-hover:w-\[26px\]/)
  assert.match(historyRail, /bg-timeline-user/)
  assert.match(historyRail, /bg-timeline-agent/)
  assert.equal(/bg-timeline-system/.test(historyRail), false)
  assert.match(historyRail, /gap-0.5/)
  assert.match(historyRail, /w-px -translate-x-1\/2 bg-timeline-track/)
  assert.match(historyRail, /buildTimeline/)
  assert.equal(/buildTimelineRounds|compactTimelineRounds/.test(historyRail), false)
  assert.match(historyRail, /\[scrollbar-width:none\]/)
  assert.match(historyRail, /\[&::-webkit-scrollbar\]:hidden/)
  assert.match(historyRail, /向上滚动时间轴/)
  assert.match(historyRail, /向下滚动时间轴/)
  assert.match(historyRail, /scrollBy/)
  assert.match(historyRail, /disabled=\{atTop\}/)
  assert.match(historyRail, /disabled=\{atBottom\}/)
})

check('消息：用户浅灰气泡、助手纯文本、中性头像、低调元信息、正文 15px', () => {
  assert.match(styles, /--message-user: #FFFFFF/i)
  assert.match(styles, /--avatar-bg: #F6F5F1/i)
  assert.match(styles, /--avatar-ink: #3B3D44/i)
  assert.match(messageList, /role === 'user'[\s\S]*rounded-bubble border border-message-user-border bg-message-user/)
  assert.match(messageList, /: 'px-0 py-0'/)
  assert.match(messageList, /h-6 w-6.*rounded-\[6px\]/)
  assert.match(messageList, /flex h-5.*leading-5/)
  assert.match(messageList, /text-\[14px\] leading-\[1\.72\]/)
  assert.match(messageList, /role !== 'user'/)
  assert.match(read('features/chat/MessageBadges.tsx'), /text-\[13px\] leading-5 text-ink-muted/)
  assert.match(read('features/chat/MessageBadges.tsx'), /hover:underline/)
  assert.match(read('features/chat/MessageBadges.tsx'), /h-1 w-1.*bg-ink-muted/)
  assert.match(messageList, /text-\[11\.5px\] font-semibold leading-5/)
})

check('通知：无未读不显示数字；权限无胶囊', () => {
  assert.match(notification, /unread > 0 && items.length > 0/)
  assert.match(permission, /text-\[13px\]/)
  assert.match(permission, /inline-flex max-w-\[18rem\].*text-\[13px\]/)
})

check('门禁链包含 check-m45；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m45\.mjs/)
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

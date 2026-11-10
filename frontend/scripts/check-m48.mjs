#!/usr/bin/env node
// scripts/check-m48.mjs —— M48 浮层不透明背景 + 时间轴逐条消息着色自测
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
console.log('M48 浮层与时间轴自测（前端）')

const styles = read('styles.css')
const permission = read('app/PermissionMenu.tsx')
const composer = read('features/chat/Composer.tsx')
const historyRail = read('features/chat/HistoryRail.tsx')
const notification = read('features/chat/NotificationCenter.tsx')
const dialog = read('platform/ui/Dialog.tsx')
const tooltip = read('platform/ui/Tooltip.tsx')
const commandPalette = read('features/workbench/CommandPalette.tsx')
const taskDetail = read('features/tasks/TaskDetail.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('浮层统一：不透明白底 / 1px border / 8px 圆角 / 0 12 32 阴影 / z 50', () => {
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*background-color: #ffffff !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*border: 1px solid var\(--border\) !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*border-radius: 12px !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*box-shadow: 0 1px 2px rgba\(23, 24, 28, 0\.05\)/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*z-index: 60/)
  for (const source of [permission, composer, historyRail, notification, dialog, tooltip, commandPalette, taskDetail]) {
    assert.match(source, /popover-surface/)
  }
})

check('权限面板/Popover/Dialog/Tooltip 不再依赖半透明 bg-surface', () => {
  assert.match(permission, /popover-surface fixed/)
  assert.match(notification, /popover-surface flex max-h-\[80vh\]/)
  assert.equal(/bg-surface shadow-lg/.test(notification), false)
  assert.match(dialog, /popover-surface flex max-h-\[92vh\]/)
  assert.match(tooltip, /popover-surface pointer-events-none absolute/)
  assert.equal(/bg-ink px-2 py-1/.test(tooltip), false)
  assert.match(commandPalette, /popover-surface w-full max-w-xl/)
  assert.match(taskDetail, /popover-surface flex max-h-\[88vh\]/)
})

check('时间轴逐条消息：不聚合；22×5 微胶囊、透明度/加宽、按发送方着色、组间节奏', () => {
  assert.match(historyRail, /const ticks = buildTimeline\(messages\)/)
  assert.equal(/buildTimelineRounds|compactTimelineRounds|TimelineRound/.test(historyRail), false)
  assert.match(historyRail, /h-3.5 w-9 flex-none/)
  assert.match(historyRail, /h-1\.5 w-5/)
  assert.match(historyRail, /rounded-\[3px\]/)
  assert.match(historyRail, /opacity-65/)
  assert.match(historyRail, /group-hover:w-\[26px\]/)
  assert.match(historyRail, /gap-0.5/)
  assert.match(styles, /--timeline-user: #6E6CF7/)
  assert.match(styles, /--timeline-user-active: #4A4AF0/)
  assert.match(styles, /--timeline-agent: #8C8E96/)
  assert.equal(/--timeline-system/.test(styles), false)
  assert.match(styles, /--timeline-track: #E8E7E1/)
  assert.match(historyRail, /bg-timeline-user/)
  assert.match(historyRail, /bg-timeline-agent/)
  assert.equal(/bg-timeline-system/.test(historyRail), false)
  assert.match(historyRail, /bg-timeline-track/)
  assert.match(historyRail, /my-auto/)
})

check('时间轴：无折叠按钮、刻度组垂直居中、上下箭头保留', () => {
  assert.equal(/折叠消息时间轴|展开消息时间轴|chevron-left|chevron-right/.test(historyRail), false)
  assert.match(historyRail, /my-auto flex w-full flex-none flex-col items-center/)
  assert.match(historyRail, /向上滚动时间轴/)
  assert.match(historyRail, /向下滚动时间轴/)
  assert.match(historyRail, /h-3.5 w-9/)
})

check('时间轴交互保留：跟随鼠标预览、点击跳转、上下箭头、隐藏滚动条', () => {
  assert.match(historyRail, /trackPointer/)
  assert.match(historyRail, /event\.clientX \+ gap/)
  assert.match(historyRail, /event\.clientY \+ gap/)
  assert.match(historyRail, /style=\{\{ left: popupPos\.x, top: popupPos\.y \}\}/)
  assert.match(historyRail, /popover-surface fixed w-60/)
  assert.match(historyRail, /OPEN_DELAY = 150/)
  assert.match(historyRail, /CLOSE_GRACE = 200/)
  assert.match(historyRail, /向上滚动时间轴/)
  assert.match(historyRail, /向下滚动时间轴/)
  assert.match(historyRail, /\[scrollbar-width:none\]/)
  assert.match(historyRail, /jumpAndPin/)
})

check('门禁链包含 check-m48；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m48\.mjs/)
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

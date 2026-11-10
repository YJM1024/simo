#!/usr/bin/env node
// scripts/check-m40.mjs —— M40 视觉重构自测
//
// 覆盖：
//   - platform/ui 组件层 13 类 + variants/size/loading/disabled/focus；
//   - 字体/对比度/圆角/阴影/去渐变 token；
//   - 线性图标（16/20、1.5、无 emoji）；Tabs/Badge/Button/Toast/Dialog/Skeleton/EmptyState 使用；
//   - 顶部 tab 页内切换（mainView，不浮窗）；右栏细竖条固定最右；
//   - 概览：已完成/待办复选框列表、长字符串拆条、时间线轴+2 行截断；目标/约束/现状自然段；
//   - 时间轴弹窗：去原生 title、hover 延迟/关闭 grace、可交互、点击固定、Esc/点外关闭、键盘；
//   - 门禁链/无 Spec。

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
  try {
    fn()
    passed += 1
    console.log(`  ✔ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✖ ${name}`)
    console.error(`    ${error instanceof Error ? error.message : String(error)}`)
  }
}
console.log('M40 视觉重构自测（前端）')

const pkg = JSON.parse(readRoot('package.json'))
const styles = read('styles.css')
const app = read('app/App.tsx')
const topTabs = read('app/TopTabs.tsx')
const rightRail = read('features/tasks/RightRail.tsx')
const overview = read('features/tasks/OverviewPanel.tsx')
const historyRail = read('features/chat/HistoryRail.tsx')
const feedback = read('platform/FeedbackPane.tsx')
const notification = read('app/NotificationHost.tsx')
const firstRun = read('features/workbench/FirstRunGuide.tsx')
const topBar = read('app/TopBar.tsx')
const tabsUi = read('platform/ui/Tabs.tsx')

const uiFiles = ['Button', 'IconButton', 'Input', 'Select', 'Tabs', 'Table', 'Card', 'Badge', 'Tooltip', 'Dialog', 'Toast', 'Skeleton', 'EmptyState']
const uiSources = Object.fromEntries(uiFiles.map((name) => [name, read(`platform/ui/${name}.tsx`)]))

check('组件层 13 类齐全 + variants/size/loading/disabled/focus', () => {
  for (const name of uiFiles) assert.ok(uiSources[name].length > 100, `${name} 为空`)
  const button = uiSources.Button
  assert.match(button, /variant/)
  assert.match(button, /size/)
  assert.match(button, /loading/)
  assert.match(button, /disabled/)
  assert.match(button, /focus-visible:outline/)
  assert.match(button, /hover:/)
  assert.match(button, /active:/)
  assert.match(uiSources.IconButton, /aria-label/)
  assert.match(uiSources.Input, /aria-invalid/)
  assert.match(uiSources.Input, /focus-visible:outline/)
  assert.match(uiSources.Select, /appearance-none/)
  assert.match(uiSources.Table, /nth-child\(even\)/)
  assert.match(uiSources.Table, /tabular-nums/)
  assert.match(uiSources.Badge, /rounded-\[3px\]/)
  assert.match(uiSources.Tooltip, /role="tooltip"/)
  assert.match(uiSources.Dialog, /aria-modal="true"/)
  assert.match(uiSources.Toast, /role=/)
  assert.match(uiSources.EmptyState, /role="status"/)
})

check('排版/对比度/圆角/阴影 token：14px 基础、深灰文字、去渐变/重阴影', () => {
  assert.match(styles, /--fs-base: 14px/)
  assert.match(styles, /--fs-sm: 12px/)
  assert.match(styles, /--fs-xs: 11px/)
  assert.match(styles, /--fs-2xs: 10px/)
  assert.match(styles, /--section-title: #3B3D44/)
  assert.match(styles, /--ink: #17181C/)
  assert.match(styles, /--ink-secondary: #3B3D44/i)
  assert.match(styles, /--ink-muted: #6F727A/i)
  assert.match(styles, /font-variant-numeric: tabular-nums/)
  assert.match(styles, /--r-xs: 5px/)
  assert.match(styles, /--r-md: 10px/)
  assert.match(styles, /--sh-sm: 0 1px 0/)
  assert.match(styles, /--sh-md: 0 2px 4px/)
  assert.equal(/background-image:\s*radial-gradient/.test(styles), false)
  assert.match(styles, /prefers-reduced-motion/)
  assert.match(styles, /:focus-visible/)
})

check('线性图标：1.5px / 16·20 / currentColor / 无 emoji', () => {
  const icons = read('platform/ui/icons.tsx')
  assert.match(icons, /strokeWidth=\{1\.5\}/)
  assert.match(icons, /size = 16/)
  assert.match(icons, /currentColor/)
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
    }
  }
  walk(src)
  const offenders = files.filter((file) => /\p{Extended_Pictographic}/u.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

check('基础组件在关键页面使用：Tabs/TopBar/Badge/Toast/Dialog/Skeleton/EmptyState', () => {
  assert.match(topTabs, /Tabs/)
  assert.match(tabsUi, /role="tablist"/)
  assert.match(topBar, /PermissionMenu/)
  assert.match(topBar, /Icon/)
  assert.match(rightRail, /Badge/)
  assert.match(rightRail, /Icon/)
  assert.match(notification, /Toast/)
  assert.match(firstRun, /Dialog/)
  assert.match(feedback, /Skeleton/)
  assert.match(feedback, /EmptyState/)
  assert.match(feedback, /Button/)
})

check('顶部 tab 页内切换：mainView 槽位，无浮窗/遮罩', () => {
  assert.match(app, /slots\.mainView/)
  assert.match(app, /mainViewEntry/)
  assert.match(app, /activeView/)
  assert.match(app, /showChat \? 'flex' : 'hidden'/)
  for (const view of ['schedules', 'agents', 'team', 'memory', 'workbench']) {
    const mainView = read(`features/${view}/${view === 'schedules' ? 'Schedule' : view === 'agents' ? 'Agents' : view === 'team' ? 'Team' : view === 'memory' ? 'Memory' : 'Workbench'}MainView.tsx`)
    assert.match(mainView, /embedded/)
    assert.equal(/createPortal/.test(mainView), false)
  }
  const agentsPage = read('features/agents/AgentsPage.tsx')
  assert.match(agentsPage, /embedded \?/)
})

check('右栏细竖条固定最右：面板 order-1、标签条 order-2', () => {
  assert.match(rightRail, /order-1/)
  assert.match(rightRail, /order-2/)
  assert.match(rightRail, /Icon name="task"/)
  assert.match(rightRail, /Icon name="overview"/)
  assert.match(rightRail, /max-\[1240px\]:fixed/)
})

check('概览：已完成/待办复选列表 + 长字符串拆条/上限 + 时间线轴/2 行', () => {
  assert.match(overview, /splitListText/)
  assert.match(overview, /split\(\/\\r\?\\n\|\[;；\]/)
  assert.match(overview, /CheckList/)
  assert.match(overview, /name=\{checked \? 'check' : 'square'\}/)
  assert.match(overview, /MAX_COMPLETED = 6/)
  assert.match(overview, /MAX_TIMELINE = 6/)
  assert.match(overview, /COMPLETED_CHARS = 40/)
  assert.match(overview, /TIMELINE_CHARS = 50/)
  assert.match(overview, /clampText/)
  assert.match(overview, /completedOverflow/)
  assert.match(overview, /pendingOverflow/)
  assert.match(overview, /timelineOverflow/)
  assert.match(overview, /另有 \{overflow\} 项/)
  assert.match(overview, /text-base font-semibold text-section-title/)
  assert.match(overview, /border-l border-border/)
  assert.match(overview, /line-clamp-2/)
  assert.match(overview, /<Section title="目标"/)
  assert.match(overview, /<Section title="约束"/)
  assert.match(overview, /<Section title="现状"/)
})

check('时间轴：宽度/点击跳转、去原生 title、延迟/grace、固定/Esc、无多余按钮', () => {
  assert.equal(/title=\{/.test(historyRail), false)
  assert.match(historyRail, /w-8/)
  assert.match(historyRail, /OPEN_DELAY = 150/)
  assert.match(historyRail, /CLOSE_GRACE = 200/)
  assert.match(historyRail, /onMouseEnter=\{\(\) => openSoon/)
  assert.match(historyRail, /onMouseLeave=\{closeSoon\}/)
  assert.match(historyRail, /onMouseEnter=\{clearTimers\}/)
  assert.match(historyRail, /pinnedId/)
  assert.match(historyRail, /onPointerDown/)
  assert.match(historyRail, /event\.key === 'Escape'/)
  assert.match(historyRail, /onFocus/)
  assert.match(historyRail, /key === 'Enter'/)
  assert.match(historyRail, /jumpAndPin/)
  assert.equal(/跳到这条消息/.test(historyRail), false)
})

check('门禁链包含 check-m40；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m40\.mjs/)
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

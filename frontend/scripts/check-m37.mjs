#!/usr/bin/env node
// scripts/check-m37.mjs —— M37 顶部横向选项卡导航自测
//
// 源码约束：
//   - App 在 TopBar 下渲染 TopTabs；对话默认；
//   - 7 个 tab：对话/工作台/任务·定时任务/智能体/团队/记忆/文件；
//   - role=tablist/tab、aria-selected、←/→/Home/End、窄屏 overflow-x-auto 不换行；
//   - 点击切视图：非对话视图 NAV_OPEN；文件/对话走 CHAT_TAB_OPEN；NAV_CLOSED 回对话；
//   - 左下入口条移除（各 Entry 只做宿主，监听 NAV_OPEN，不再渲染 aside）；
//   - 命令面板可到全部视图；聊天中栏文件 tab 同步；门禁链/无 Spec。

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
console.log('M37 顶部横向选项卡自测（前端）')

const app = read('app/App.tsx')
const topBar = read('app/ShellHeader.tsx')
const topTabs = read('app/ShellHeader.tsx')
const events = read('platform/events.ts')
const schedulesEntry = read('features/schedules/ScheduleEntry.tsx')
const agentsEntry = read('features/agents/AgentEntry.tsx')
const teamEntry = read('features/team/TeamEntry.tsx')
const memoryEntry = read('features/memory/MemoryBrowserEntry.tsx')
const workbenchEntry = read('features/workbench/WorkbenchEntry.tsx')
const workbenchPage = read('features/workbench/WorkbenchPage.tsx')
const palette = read('features/workbench/CommandPalette.tsx')
const commands = read('features/workbench/commands.ts')
const chatCenter = read('features/chat/ChatCenter.tsx')
const tabsUi = read('platform/ui/Tabs.tsx')
const packageJson = JSON.parse(readRoot('package.json'))

check('M63 单行顶栏：导航在 header 内，App 不再单独渲染导航条', () => {
  assert.match(topBar, /import { Tabs }/)
  assert.match(topBar, /ariaLabel="视图"/)
  assert.match(app, /import ShellHeader from '\.\/ShellHeader\.tsx'/)
  assert.equal(/<ShellHeader/.test(app), true)
  assert.match(topTabs, /useState<NavId>\('chat'\)/)
  assert.match(topTabs, /对话/)
  assert.match(topTabs, /工作台/)
  assert.match(topTabs, /任务/)
  assert.match(topTabs, /智能体/)
  assert.match(topTabs, /团队/)
  assert.match(topTabs, /记忆/)
  assert.equal(/label: '文件'/.test(topTabs), false)
  assert.match(chatCenter, /label: '文件'/)
})

check('M40 统一 Tabs：aria-selected/roving tabindex/键盘/窄屏滚动', () => {
  assert.match(topTabs, /Tabs/)
  assert.match(topTabs, /ariaLabel="视图"/)
  assert.match(tabsUi, /role="tablist"/)
  assert.match(tabsUi, /role="tab"/)
  assert.match(tabsUi, /aria-selected=\{selected\}/)
  assert.match(tabsUi, /tabIndex=\{selected \? 0 : -1\}/)
  assert.match(tabsUi, /ArrowRight/)
  assert.match(tabsUi, /ArrowLeft/)
  assert.match(tabsUi, /Home/)
  assert.match(tabsUi, /End/)
  assert.match(tabsUi, /overflow-x-auto/)
  assert.match(tabsUi, /whitespace-nowrap/)
})

check('切换视图：NAV_OPEN / CHAT_TAB_OPEN / NAV_CLOSED 回对话', () => {
  assert.match(events, /NAV_OPEN: 'nav:open'/)
  assert.match(events, /NAV_CLOSED: 'nav:closed'/)
  assert.match(events, /NAV_RESET: 'nav:reset'/)
  assert.match(events, /CHAT_TAB_OPEN: 'chat:tab:open'/)
  assert.match(topTabs, /EVENTS\.NAV_OPEN/)
  assert.match(topTabs, /EVENTS\.NAV_CLOSED/)
  assert.match(topTabs, /EVENTS\.NAV_RESET/)
  assert.match(topTabs, /EVENTS\.CHAT_TAB_OPEN/)
  assert.match(topTabs, /CHAT_TAB_OPEN, \{ tab: 'chat' \}/)
  assert.match(chatCenter, /EVENTS\.CHAT_TAB_OPEN/)
  assert.match(chatCenter, /EVENTS\.CHAT_TAB_STATE/)
})

check('M40 顶部 tab 页内切换：App mainView 槽位，不弹浮窗', () => {
  assert.match(app, /slots\.mainView/)
  assert.match(app, /mainViewEntry/)
  assert.match(app, /activeView/)
  assert.match(app, /showChat \? 'flex' : 'hidden'/)
  for (const [name, source] of [
    ['schedules', schedulesEntry],
    ['agents', agentsEntry],
    ['team', teamEntry],
    ['memory', memoryEntry],
  ]) {
    assert.equal(/<aside/.test(source), false, `${name} 仍渲染左下入口 aside`)
  }
  assert.match(workbenchEntry, /WORKBENCH_OPEN/)
  assert.match(workbenchPage, /工作台/)
  assert.match(workbenchPage, /用量统计/)
  assert.match(workbenchPage, /设置/)
  assert.match(workbenchPage, /命令面板/)
})

check('命令面板可达全部视图', () => {
  for (const id of ['nav-chat', 'nav-workbench', 'nav-schedules', 'nav-agents', 'nav-team', 'nav-memory', 'nav-files']) {
    assert.match(commands, new RegExp(`id: '${id}'`), `缺少命令 ${id}`)
  }
  assert.match(palette, /command\.action\.startsWith\('nav-'\)/)
  assert.match(palette, /EVENTS\.NAV_OPEN/)
  assert.match(palette, /EVENTS\.CHAT_TAB_OPEN/)
})

check('门禁链包含 check-m37；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m37\.mjs/)
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

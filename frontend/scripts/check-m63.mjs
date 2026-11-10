#!/usr/bin/env node
// scripts/check-m63.mjs —— M63 按 prototype4 重构自测
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
console.log('M63 prototype4 重构自测（前端）')

const styles = read('styles.css')
const app = read('app/App.tsx')
const topBar = read('app/TopBar.tsx')
const chat = read('features/chat/ChatCenter.tsx')
const messageList = read('features/chat/MessageList.tsx')
const historyRail = read('features/chat/HistoryRail.tsx')
const rightRail = read('features/tasks/RightRail.tsx')
const taskPanel = read('features/tasks/TaskPanel.tsx')
const session = read('features/sessions/SessionTreePanel.tsx')
const composer = read('features/chat/Composer.tsx')
const settings = read('features/workbench/SettingsPage.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('原型纸感 tokens：暖白/墨色/靛蓝/青绿/圆角 5-7-10-14', () => {
  assert.match(styles, /--canvas: #FBFAF7/)
  assert.match(styles, /--ink: #17181C/)
  assert.match(styles, /--accent: #4A4AF0/)
  assert.match(styles, /--accent-3: #10A99A/)
  assert.match(styles, /--r-xs: 5px/)
  assert.match(styles, /--r-sm: 7px/)
  assert.match(styles, /--r-md: 10px/)
  assert.match(styles, /--r-lg: 14px/)
  assert.match(styles, /--ff-serif: Georgia/)
  assert.match(styles, /background-image: none/)
})

check('壳层：264 左栏 + 单行 54 顶栏（内嵌 TopTabs）+ 上下文 42 + 状态栏', () => {
  assert.match(app, /const LEFT_DEFAULT = 264/)
  assert.equal(/<TopTabs \/>/.test(app), false)
  assert.match(topBar, /h-\[54px\] flex-none items-center/)
  assert.match(topBar, /<TopTabs \/>/)
  assert.match(chat, /h-\[42px\] flex-none items-center justify-between/)
  assert.match(chat, /h-\[26px\] flex-none items-center justify-between/)
})

check('左栏：品牌/工作区/搜索/会话分组/状态/用户', () => {
  assert.match(session, /司墨/)
  assert.match(session, /主工作区/)
  assert.match(session, /搜索会话、消息/)
  assert.match(session, /本月用量/)
  assert.match(session, /本地用户/)
  assert.match(session, /border-l-accent bg-accent-soft/)
})

check('聊天：780 列；24px 方块 monogram + -2px 对齐；20px 元信息行；14/1.72 正文', () => {
  assert.match(chat, /max-w-\[780px\]/)
  assert.match(messageList, /mt-\[-2px\].*h-6 w-6.*rounded-\[6px\]/)
  assert.match(messageList, /mb-1 flex h-5 min-w-0 flex-nowrap items-center/)
  assert.match(messageList, /text-\[14px\] leading-\[1\.72\]/)
  assert.match(messageList, /rounded-bubble border border-message-user-border bg-message-user/)
  assert.match(messageList, /font-serif text-\[24px\]/)
})

check('时间轴：条 6×20 / 当前 8×26 / 热区 14×36 / 圆角 3 / gap 2', () => {
  assert.match(historyRail, /h-3\.5 w-9 flex-none/)
  assert.match(historyRail, /h-1\.5 w-5/)
  assert.match(historyRail, /h-2 w-\[26px\]/)
  assert.match(historyRail, /group-hover:w-\[26px\]/)
  assert.match(historyRail, /rounded-\[3px\]/)
  assert.match(historyRail, /gap-0\.5/)
  assert.match(historyRail, /\[scrollbar-width:none\]/)
})

check('Inspector：任务/概览、进度环、面板默认展开、可收起固定', () => {
  assert.match(rightRail, /window\.innerWidth > 1240/)
  assert.match(rightRail, /w-10 flex-none/)
  assert.match(taskPanel, /本周重点/)
  assert.match(taskPanel, /strokeDasharray="119\.4"/)
  assert.match(composer, /max-w-\[780px\]/)
  assert.match(composer, /h-\[30px\] min-w-\[56px\]/)
})

check('设置：原型弹窗标题/字段；M59 默认仅本会话、无系统消息', () => {
  assert.match(settings, /max-w-\[700px\]/)
  assert.match(settings, /font-serif text-\[18px\]/)
  assert.match(settings, /text-\[10\.5px\] font-semibold/)
  assert.match(messageList, /displayedMessages = messages\.filter/)
  assert.match(chat, /isRoot \? '主窗口 · 聚合视图'/)
})

check('门禁链包含 check-m63；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m63\.mjs/)
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

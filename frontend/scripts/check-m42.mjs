#!/usr/bin/env node
// scripts/check-m42.mjs —— M42 UI 修正自测（小圆角 / 工具栏对齐 / 字距 / 时间轴 / 工作台）
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
console.log('M42 UI 修正自测（前端）')

const styles = read('styles.css')
const topBar = read('app/TopBar.tsx')
const topTabs = read('app/TopTabs.tsx')
const permission = read('app/PermissionMenu.tsx')
const badges = read('features/chat/MessageBadges.tsx')
const messageList = read('features/chat/MessageList.tsx')
const historyRail = read('features/chat/HistoryRail.tsx')
const sessionTree = read('features/sessions/SessionTreePanel.tsx')
const workbench = read('features/workbench/WorkbenchPage.tsx')
const composer = read('features/chat/Composer.tsx')
const packageJson = JSON.parse(readRoot('package.json'))

check('品牌/头像：司墨无字距；圆形头像；消息头与头像同轴', () => {
  const brand = read('app/BrandMark.tsx')
  const avatar = read('platform/AgentAvatar.tsx')
  assert.equal(/linearGradient|feDropShadow|filter=/.test(brand), false)
  assert.match(brand, /rx="24"/)
  assert.match(topBar, /司墨/)
  assert.match(avatar, /round: 'rounded-full'/)
  assert.match(avatar, /bg-avatar-agent-bg text-avatar-agent-ink/)
  assert.equal(/self-start/.test(avatar), false)
})

check('圆角令牌收敛：控件 2–3、卡片/面板 4、气泡 6、徽标/胶囊 2', () => {
  assert.match(styles, /--r-xs: 5px/)
  assert.match(styles, /--r-sm: 7px/)
  assert.match(styles, /--r-md: 10px/)
  assert.match(styles, /--r-lg: 14px/)
  assert.match(styles, /--r-xl: 12px/)
  assert.match(styles, /--r-pill: 4px/)
  assert.match(styles, /--r-bubble: 9px/)
  assert.match(styles, /--radius-bubble/)
})

check('字距：全局 normal，无 tracking-widest/wide 残留', () => {
  assert.match(styles, /letter-spacing: 0/)
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
    }
  }
  walk(src)
  const offenders = files.filter((file) => /tracking-(?:widest|wider|wide)/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

check('rounded-full 仅保留头像/加载 spinner（非业务标签/按钮/卡片）', () => {
  const allowed = new Set(['platform/AgentAvatar.tsx', 'platform/ui/Button.tsx', 'platform/ui/IconButton.tsx', 'features/chat/Composer.tsx', 'features/chat/MessageList.tsx', 'features/chat/MessageBadges.tsx', 'features/schedules/ScheduleManager.tsx', 'features/team/TeamPage.tsx', 'app/TopBar.tsx', 'features/sessions/SessionTreePanel.tsx'])
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx$/.test(entry.name)) files.push(full)
    }
  }
  walk(src)
  const offenders = files.filter((file) => {
    const rel = file.replace(src + '\\', '').split('\\').join('/')
    return !allowed.has(rel) && /rounded-full/.test(readFileSync(file, 'utf8'))
  })
  assert.deepEqual(offenders, [])
})

check('顶栏：两行布局；header 左品牌右状态，导航独立', () => {
  assert.match(topBar, /<header className="relative z-10 flex h-\[54px\]/)
  assert.match(topBar, /NotificationCenter/)
  assert.equal(/<TopTabs \/>/.test(topBar), true)
  assert.match(topBar, /flex flex-none items-center gap-2 whitespace-nowrap/)
  assert.match(topBar, /司墨/)
  assert.match(permission, /text-\[13px\]/)
  assert.equal(/tracking-/.test(permission), false)
})

check('会话元信息：纯文本 + 分隔符，灰胶囊改为文字；气泡 6px', () => {
  assert.equal(/rounded-pill|border border-border-subtle bg-surface/.test(badges), false)
  assert.match(badges, /text-\[13px\] leading-5 text-ink-muted/)
  assert.match(badges, /›/)
  assert.match(messageList, /rounded-bubble/)
  assert.match(messageList, /已发送/)
})

check('时间轴：32px 点击区、横向 3px 短条、紧凑 gap、隐藏滚动条、上下箭头', () => {
  assert.match(historyRail, /w-9/)
  assert.match(historyRail, /h-3\.5 w-9/)
  assert.match(historyRail, /h-1\.5 w-5/)
  assert.match(historyRail, /group-hover:w-\[26px\]/)
  assert.match(historyRail, /gap-0.5/)
  assert.match(historyRail, /w-px -translate-x-1\/2 bg-timeline-track/)
  assert.match(historyRail, /\[scrollbar-width:none\]/)
  assert.match(historyRail, /\[&::-webkit-scrollbar\]:hidden/)
  assert.match(historyRail, /向上滚动时间轴/)
  assert.match(historyRail, /向下滚动时间轴/)
  assert.match(historyRail, /scrollBy/)
  assert.match(historyRail, /disabled=\{atTop\}/)
  assert.match(historyRail, /disabled=\{atBottom\}/)
})

check('会话树/输入区/工作台：选中 4px、运行中去胶囊、M44 输入区、工作台 960 紧凑', () => {
  assert.match(sessionTree, /rounded-sm border-0 border-l-2/)
  assert.equal(/rounded-pill[^`]*执行中/.test(sessionTree), false)
  assert.match(sessionTree, /会话状态/)
  assert.match(sessionTree, /个任务/)
  assert.match(composer, /min-h-\[58px\] max-h-\[176px\]/)
  assert.match(composer, /rounded-md border border-border bg-surface/)
  assert.equal(/TOOLBAR|role="toolbar"/.test(composer), false)
  assert.equal(/translate-y-px/.test(composer), false)
  assert.match(workbench, /max-w-\[1000px\]/)
  assert.match(workbench, /text-base font-semibold text-section-title/)
  assert.match(workbench, /rounded-md border border-border-subtle bg-surface-solid p-3/)
  assert.match(workbench, /chevron-right/)
})

check('门禁链包含 check-m42；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m42\.mjs/)
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

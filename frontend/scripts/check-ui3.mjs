#!/usr/bin/env node
// scripts/check-ui3.mjs —— UI 收口：响应式 / 键盘可达 / 空错态 / reduced-motion / 文案统一
//
// 纯源码约束自测：
//   - 窄屏：三栏折叠（≤820/1240）、命令面板、用量表横向滚动、轨迹筛选/列表、会话树/消息自适应；
//   - 键盘：全局 focus-visible、通知中心 focus trap/Esc、命令面板 Esc、筛选/计划/模型 aria；
//   - 空/错误态：共享 FeedbackPane 被新页面复用；
//   - reduced-motion：CSS 压制动画/过渡/平滑滚动；
//   - 文案：无「秘书/本地秘书/private」，品牌统一「司墨」；
//   - 门禁链/无第三方/无 Spec。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

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
const read = (path) => readFileSync(path, 'utf8')
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}

console.log('UI 收口自测（响应式/可访问性/文案）')
const app = read(resolve(src, 'app/App.tsx'))
const styles = read(resolve(src, 'styles.css'))
const chatCenter = read(resolve(src, 'features/chat/ChatCenter.tsx'))
const trajectory = read(resolve(src, 'features/chat/TrajectoryView.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const composer = read(resolve(src, 'features/chat/Composer.tsx'))
const notification = read(resolve(src, 'features/chat/NotificationCenter.tsx'))
const planPanel = read(resolve(src, 'features/chat/PlanPanel.tsx'))
const palette = read(resolve(src, 'features/workbench/CommandPalette.tsx'))
const usage = read(resolve(src, 'features/workbench/UsagePage.tsx'))
const feedback = read(resolve(src, 'platform/FeedbackPane.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('窄屏：三栏折叠 + 命令面板/轨迹/用量表响应式', () => {
  assert.match(app, /max-\[1240px\]:grid-cols-/)
  assert.match(app, /max-\[820px\]:hidden/)
  assert.match(chatCenter, /max-\[820px\]:block/)
  assert.match(palette, /p-2 pt-\[8vh\].*sm:p-4 sm:pt-\[12vh\]/)
  assert.match(usage, /overflow-auto/)
  assert.match(usage, /min-w-\[40rem\]/)
  assert.match(trajectory, /overflow-x-auto/)
  assert.match(messageList, /py-2 pl-\[46px\] pr-4/)
  assert.match(composer, /px-\[18px\] pt-1\.5 pb-2/)
})

check('键盘可达：focus-visible + 通知中心/命令面板 Esc + aria', () => {
  assert.match(styles, /:focus-visible/)
  assert.match(notification, /useFocusTrap/)
  assert.match(notification, /event\.key === 'Escape'/)
  assert.match(palette, /event\.key === 'Escape'/)
  assert.match(trajectory, /role="group" aria-label="轨迹筛选"/)
  assert.match(planPanel, /aria-pressed=\{checked\}/)
  assert.equal(/aria-label="模型"/.test(composer), false)
  assert.equal(/aria-label="推理强度"/.test(composer), false)
  assert.match(composer, /aria-describedby="composer-hint"/)
  assert.match(notification, /aria-label=\{`通知中心/)
})

check('空态/错误态统一：FeedbackPane 被新页面复用', () => {
  assert.match(feedback, /export function LoadingPane/)
  assert.match(feedback, /export function EmptyPane/)
  assert.match(feedback, /export function ErrorPane/)
  assert.match(feedback, /role="status"/)
  assert.match(feedback, /role="alert"/)
  assert.match(usage, /EmptyPane/)
  assert.match(trajectory, /EmptyPane/)
  assert.match(notification, /EmptyPane/)
  assert.match(planPanel, /EmptyPane/)
})

check('reduced-motion：压制动画/过渡/平滑滚动', () => {
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(styles, /animation-duration: 1ms/)
  assert.match(styles, /transition-duration: 1ms/)
  assert.match(styles, /scroll-behavior: auto/)
})

check('文案统一「司墨」，无 秘书/本地秘书/private', () => {
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = []
  for (const file of files) {
    const text = read(file)
    for (const banned of ['秘书', '本地秘书', 'private']) {
      if (text.includes(banned)) offenders.push(`${file}: ${banned}`)
    }
  }
  assert.deepEqual(offenders, [])
  assert.ok(files.map(read).join('\n').includes('司墨'))
})

check('门禁链包含 check-ui3；无第三方；无 Spec', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-ui3\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

#!/usr/bin/env node
// scripts/check-m38.mjs —— M38 右栏计划/概览 + 布局修复自测
//
// 覆盖：
//   - 主区域不再渲染 plan/todo/交付物/概览；中间保留文件 tab；
//   - 右栏细竖条默认收起：任务/概览纵向标签、运行中角标、概览圆点、展开/收起；
//   - 📌 固定、未固定切会话自动收起、Esc 收起；
//   - 任务 tab：计划/待办摘要 + 任务列表 + 当前会话交付物；只读/动作层；
//   - 概览仅在右栏；交付物条从主区域移除；
//   - 三栏拖拽分隔条、双击复位、localStorage、窄屏右栏浮层；
//   - min-w-0/truncate/break-words/垂直滚动/断点折叠；门禁链/无 Spec。

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
console.log('M38 右栏计划/概览与布局自测（前端）')

const app = read('app/App.tsx')
const rightRail = read('features/tasks/RightRail.tsx')
const taskPanel = read('features/tasks/TaskPanel.tsx')
const planSummary = read('features/tasks/PlanSummary.tsx')
const overviewPanel = read('features/tasks/OverviewPanel.tsx')
const chatCenter = read('features/chat/ChatCenter.tsx')
const tasksManifest = read('features/tasks/manifest.ts')
const memoryManifest = read('features/memory/manifest.ts')
const packageJson = JSON.parse(readRoot('package.json'))

check('主区域移除 plan/todo/交付物/概览，保留文件 tab', () => {
  assert.equal(/PlanPanel/.test(chatCenter), false)
  assert.equal(/DeliverablesBar/.test(chatCenter), false)
  assert.equal(/OverviewView/.test(chatCenter), false)
  assert.equal(/label: '概览'/.test(chatCenter), false)
  assert.match(chatCenter, /label: '文件'/)
  assert.match(chatCenter, /SessionFilesView/)
})

check('右栏默认收起：细竖条任务/概览 + 运行角标/概览圆点', () => {
  assert.match(rightRail, /useState<RailTab \| null>\(null\)/)
  assert.match(rightRail, /writing-mode:vertical-rl/)
  assert.match(rightRail, /任务/)
  assert.match(rightRail, /概览/)
  assert.match(rightRail, /TASKS_STATE/)
  assert.match(rightRail, /running > 0/)
  assert.match(rightRail, /overviewDot/)
  assert.match(rightRail, /WS_FRAME/)
  assert.match(rightRail, /toggleTab\('tasks'\)/)
  assert.match(rightRail, /toggleTab\('overview'\)/)
})

check('📌 固定 / 切会话自动收起 / Esc 收起 / layout:right', () => {
  assert.match(rightRail, /simo\.rightRail\.pinned/)
  assert.match(rightRail, /PIN_KEY/)
  assert.match(rightRail, /aria-pressed=\{pinned\}/)
  assert.match(rightRail, /SESSION_ACTIVE/)
  assert.match(rightRail, /if \(!pinned\) setActive\(null\)/)
  assert.match(rightRail, /Escape/)
  assert.match(rightRail, /LAYOUT_RIGHT/)
  assert.match(rightRail, /collapsed/)
})

check('任务 tab：计划摘要 + 任务列表 + 当前会话交付物', () => {
  assert.match(taskPanel, /PlanSummary/)
  assert.match(planSummary, /计划/)
  assert.match(planSummary, /todoStatusLabel/)
  assert.match(planSummary, /getPlan/)
  assert.match(planSummary, /\/todos\//)
  assert.match(planSummary, /任务列表只读投影|任务投影/)
  assert.match(taskPanel, /交付物（当前会话）/)
  assert.match(taskPanel, /currentArtifactGroups/)
  assert.match(taskPanel, /任务列表/)
  assert.match(overviewPanel, /概览/)
  assert.match(overviewPanel, /\/overview/)
})

check('右栏布局：竖条面板/窄屏浮层/min-w-0/truncate/break-words/垂直滚动', () => {
  assert.match(rightRail, /max-\[1180px\]:fixed/)
  assert.match(rightRail, /max-\[1180px\]:top-24/)
  assert.match(rightRail, /max-\[1180px\]:w-\[min\(90vw,360px\)\]/)
  assert.match(taskPanel, /min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto/)
  assert.match(taskPanel, /break-words/)
  assert.match(taskPanel, /truncate/)
  assert.match(overviewPanel, /min-w-0/)
  assert.match(overviewPanel, /overflow-x-hidden overflow-y-auto/)
  assert.match(overviewPanel, /break-words/)
})

check('三栏拖拽：左/右分隔条、双击复位、localStorage、窄屏隐藏', () => {
  assert.match(app, /role="separator"/)
  assert.match(app, /aria-orientation="vertical"/)
  assert.match(app, /onPointerDown=\{startDrag\('left'\)\}/)
  assert.match(app, /onPointerDown=\{startDrag\('right'\)\}/)
  assert.match(app, /onDoubleClick=\{\(\) => resetWidth\('left'\)\}/)
  assert.match(app, /simo\.layout\.leftWidth/)
  assert.match(app, /simo\.layout\.rightWidth/)
  assert.match(app, /max-\[1180px\]:hidden/)
  assert.match(app, /max-\[1180px\]:contents/)
  assert.match(app, /max-\[820px\]:grid-cols-1/)
})

check('右栏归属：tasks=RightRail；memory 不再占右栏；概览只在右栏', () => {
  assert.match(tasksManifest, /RightRail/)
  assert.equal(/rightPanel/.test(memoryManifest), false)
  assert.match(rightRail, /OverviewPanel/)
  assert.equal(/OverviewView/.test(chatCenter), false)
})

check('门禁链包含 check-m38；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m38\.mjs/)
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

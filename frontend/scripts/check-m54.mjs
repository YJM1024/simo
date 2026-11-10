#!/usr/bin/env node
// scripts/check-m54.mjs —— M54 设置中性选中 + 右栏间距自测
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
console.log('M54 设置中性选中与右栏间距自测（前端）')

const settingsPage = read('features/workbench/SettingsPage.tsx')
const planSummary = read('features/tasks/PlanSummary.tsx')
const taskPanel = read('features/tasks/TaskPanel.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('任务执行者选中态中性灰（与权限一致）', () => {
  assert.match(settingsPage, /executor === option\.id\s*\?\s*'border-border bg-avatar-bg text-ink'/)
  assert.equal(/executor === option\.id[\s\S]{0,80}border-accent-border bg-accent-soft/.test(settingsPage), false)
})

check('主题按钮选中态中性 secondary，无蓝描边/蓝字', () => {
  assert.match(settingsPage, /theme === name/)
  assert.equal(/theme === name[\s\S]{0,80}border-accent-border/.test(settingsPage), false)
})

check('设置内容可滚动且底部留白，分区标题/分隔线保持一致', () => {
  assert.match(settingsPage, /min-h-0 flex-1 overflow-y-auto px-\[18px\] py-1 pb-6/)
  assert.match(settingsPage, /text-\[10\.5px\] font-semibold/)
  assert.match(settingsPage, /border-b border-border-subtle py-\[13px\]/)
  assert.match(settingsPage, /id="settings-shortcuts" className="mb-0"/)
})

check('右栏计划与任务行间距 8px；完成行删线+text-muted', () => {
  assert.match(planSummary, /className="mb-2 min-w-0"/)
  assert.match(taskPanel, /checked \? 'text-muted line-through' : 'text-ink'/)
})

check('门禁链包含 check-m54；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m54\.mjs/)
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

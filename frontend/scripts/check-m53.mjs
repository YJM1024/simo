#!/usr/bin/env node
// scripts/check-m53.mjs —— M53 设置/右栏/工作台收尾自测
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
console.log('M53 设置/右栏/工作台自测（前端）')

const settingsPage = read('features/workbench/SettingsPage.tsx')
const settings = read('features/workbench/settings.ts')
const taskPanel = read('features/tasks/TaskPanel.tsx')
const artifact = read('features/tasks/ArtifactPreview.tsx')
const planSummary = read('features/tasks/PlanSummary.tsx')
const workbench = read('features/workbench/WorkbenchPage.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('设置模型：只读 V4.1 Flash，无下拉/调试文案', () => {
  assert.match(settingsPage, /模型：V4\.1 Flash（固定，在智能体页配置）/)
  assert.equal(/MODEL_OPTIONS|模型偏好|后端模型切换接口未就绪|saveModelPreference/.test(settingsPage), false)
})

check('设置权限/分区：中性选中、自动文案、14px 标题/24 间距/1px 分隔', () => {
  assert.match(settingsPage, /border-border bg-avatar-bg text-ink/)
  assert.match(settingsPage, /按风险自动批准\/拒绝/)
  assert.match(settingsPage, /text-\[10\.5px\] font-semibold/)
  assert.match(settingsPage, /border-b border-border-subtle py-\[13px\]/)
})

check('快捷键 3 列：kbd 20px、动作 13、作用域 12、行高 32', () => {
  assert.match(settingsPage, /w-\[130px\] whitespace-nowrap border-b/)
  assert.match(settingsPage, /<kbd/)
  assert.match(settingsPage, /text-\[11px\] text-ink-secondary/)
  assert.match(settingsPage, /text-\[10\.5px\] text-muted/)
  assert.match(settings, /scope: '全局'/)
  assert.equal(/Ctrl \/ ⌘ \+ K/.test(settings), false)
  assert.match(settingsPage, /border-border-subtle bg-surface-solid px-2\.5 py-1 text-sm text-ink-secondary/)
})

check('交付物：前 3 条单行 + hover 图标 + 查看全部文字链接', () => {
  assert.match(artifact, /compact = false/)
  assert.match(artifact, /h-8 min-w-0 items-center gap-2/)
  assert.match(artifact, /opacity-0.*group-hover:opacity-100/)
  assert.match(taskPanel, /flatArtifacts\.slice\(0, 3\)/)
  assert.match(taskPanel, /查看全部 \(\$\{flatArtifacts\.length\}\)/)
  assert.match(taskPanel, /<ArtifactPreview key=\{artifact\.id\} artifact=\{artifact\} compact \/>/)
})

check('空分组单行灰字；计划最多 5 条 + 展开/收起', () => {
  assert.match(planSummary, /COLLAPSED_TODO_LIMIT = 5/)
  assert.match(planSummary, /expanded \? '收起' : '展开'/)
})

check('工作台：最近活动 5 条、单行、时间 12px 灰、max 1000', () => {
  assert.match(workbench, /最近活动/)
  assert.match(workbench, /slice\(0, 5\)/)
  assert.match(workbench, /flex h-8 min-w-0 items-center gap-3/)
  assert.match(workbench, /text-\[10\.5px\] text-muted/)
  assert.match(workbench, /max-w-\[1000px\]/)
  assert.match(workbench, /apiGet\('\/api\/sessions\?limit=5'\)/)
})

check('门禁链包含 check-m53；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m53\.mjs/)
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

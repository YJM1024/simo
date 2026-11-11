#!/usr/bin/env node
// scripts/check-m71.mjs —— M71 壳层/组件入口/页面收尾
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')
const read = (path) => readFileSync(resolve(src, path), 'utf8')
const readRoot = (path) => readFileSync(resolve(root, path), 'utf8')
const app = read('app/App.tsx')
const header = read('app/ShellHeader.tsx')
const pkg = JSON.parse(readRoot('package.json'))

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`) }
  catch (error) { failed += 1; console.error(`  ✖ ${name}`); console.error(`    ${error instanceof Error ? error.message : String(error)}`) }
}
console.log('M71 壳层与统一组件入口自测（前端）')

check('旧 TopBar/TopTabs 已删除；新 ShellHeader 接管顶栏', () => {
  assert.equal(existsSync(resolve(src, 'app/TopBar.tsx')), false)
  assert.equal(existsSync(resolve(src, 'app/TopTabs.tsx')), false)
  assert.match(app, /import ShellHeader from '\.\/ShellHeader\.tsx'/)
  assert.match(app, /<ShellHeader/)
})

check('ShellHeader：面包屑 + 六页导航 + 权限/搜索/通知/设置/头像', () => {
  for (const label of ['对话', '工作台', '任务', '智能体', '团队', '记忆']) assert.match(header, new RegExp(label))
  assert.match(header, /PermissionMenu/)
  assert.match(header, /NotificationCenter/)
  assert.match(header, /target: 'palette'/)
  assert.match(header, /target: 'settings'/)
})

check('统一新组件入口 platform/ui/components.ts', () => {
  assert.ok(existsSync(resolve(src, 'platform/ui/components.ts')))
  const entry = read('platform/ui/components.ts')
  for (const name of ['Button', 'IconButton', 'Input', 'Select', 'Tabs', 'Card', 'Badge', 'Tooltip', 'Dialog', 'Toast', 'Skeleton', 'EmptyState', 'Icon']) {
    assert.match(entry, new RegExp(`\\b${name}\\b`))
  }
})

check('页面使用 prototype 页壳：1000 宽 + serif 标题 + 1px 线条', () => {
  for (const path of [
    'features/workbench/WorkbenchPage.tsx',
    'features/schedules/ScheduleManager.tsx',
    'features/agents/AgentsPage.tsx',
    'features/team/TeamPage.tsx',
    'features/memory/MemoryBrowserPage.tsx',
  ]) {
    const page = read(path)
    assert.match(page, /max-w-\[1000px\]/, `${path} 缺少 1000 页壳`)
    assert.match(page, /font-serif|text-\[18px\]/, `${path} 缺少新标题语言`)
    assert.match(page, /border-border/, `${path} 缺少 1px 线条 token`)
  }
})

check('画廊与功能映射文件存在；门禁链包含 check-m71', () => {
  assert.ok(existsSync(resolve(root, 'gallery')))
  assert.ok(existsSync(resolve(root, 'FEATURE-MAP.md')))
  assert.match(pkg.scripts['check'] ?? '', /check-m71\.mjs/)
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

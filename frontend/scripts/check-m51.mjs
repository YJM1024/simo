#!/usr/bin/env node
// scripts/check-m51.mjs —— M51 权限弹层实底/尺寸/换行自测
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
console.log('M51 权限弹层修复自测（前端）')

const styles = read('styles.css')
const permission = read('app/PermissionMenu.tsx')
const notification = read('features/chat/NotificationCenter.tsx')
const commandPalette = read('features/workbench/CommandPalette.tsx')
const tooltip = read('platform/ui/Tooltip.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('浮层根节点实底：白底/无背景图/opacity 1/无 backdrop-filter/filter', () => {
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*background-color: #ffffff !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*background-image: none !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*opacity: 1 !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*backdrop-filter: none !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*-webkit-backdrop-filter: none !important/)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*filter: none !important/)
})

check('权限面板 portal 到 body，固定定位，宽度/最大高度/内部滚动', () => {
  assert.match(permission, /createPortal/)
  assert.match(permission, /document\.body/)
  assert.match(permission, /popover-surface fixed p-3/)
  assert.match(permission, /Math\.min\(360, window\.innerWidth - 32\)/)
  assert.match(permission, /maxHeight: 'calc\(100vh - 80px\)'/)
  assert.match(permission, /overflowY: 'auto'/)
  assert.match(permission, /zIndex: 70/)
  assert.equal(/bg-surface(?!-solid)|bg-white\/|backdrop-blur/.test(permission), false)
})

check('选项行 min-w-0，描述 normal/anywhere，当前/危险 flex-none 不挤压', () => {
  assert.match(permission, /flex w-full min-w-0 cursor-pointer flex-col/)
  assert.match(permission, /whitespace-normal text-2xs leading-relaxed text-muted \[overflow-wrap:anywhere\]/)
  assert.match(permission, /ml-auto flex-none text-xs text-muted">当前/)
  assert.match(permission, /flex-none rounded-pill border border-danger-border bg-surface-solid/)
})

check('底部文案可换行不横向裁切；子面板不透明白底', () => {
  assert.match(permission, /mt-2 flex min-w-0 items-start justify-end gap-2/)
  assert.match(permission, /min-w-0 flex-1 whitespace-normal break-words/)
  assert.match(permission, /flex-none cursor-pointer whitespace-nowrap rounded-xs/)
  assert.match(permission, /border border-danger-border bg-surface-solid p-2\.5/)
  assert.equal(/bg-danger-soft/.test(permission), false)
})

check('其它 popover 统一使用 popover-surface', () => {
  for (const source of [notification, commandPalette, tooltip]) assert.match(source, /popover-surface/)
})

check('门禁链包含 check-m51；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m51\.mjs/)
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

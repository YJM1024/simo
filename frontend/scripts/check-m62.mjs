#!/usr/bin/env node
// scripts/check-m62.mjs —— M62 浅色科技风（M63 原型接管后的基础 token 回归）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')
const styles = readFileSync(resolve(src, 'styles.css'), 'utf8')
const button = readFileSync(resolve(src, 'platform/ui/Button.tsx'), 'utf8')
const prefs = readFileSync(resolve(root, 'package.json'), 'utf8')

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`) }
  catch (error) { failed += 1; console.error(`  ✖ ${name}`); console.error(`    ${error instanceof Error ? error.message : String(error)}`) }
}
console.log('M62 基础视觉 token 回归（M63 纸感原型）')

check('暖白纸感取色与靛蓝 accent', () => {
  assert.match(styles, /--canvas: #FBFAF7/)
  assert.match(styles, /--surface: #FFFFFF/)
  assert.match(styles, /--border: #E8E7E1/)
  assert.match(styles, /--ink: #17181C/)
  assert.match(styles, /--accent: #4A4AF0/)
  assert.match(styles, /--accent-soft: #EFEFFF/)
})

check('字体/圆角/阴影遵循原型', () => {
  assert.match(styles, /--ff-sans: "Segoe UI Variable Text"/)
  assert.match(styles, /--r-xs: 5px/)
  assert.match(styles, /--r-md: 10px/)
  assert.match(styles, /--sh-sm: 0 1px 0 rgba\(23, 24, 28, 0\.03\)/)
})

check('主按钮黑底白字；导航下划线为靛蓝', () => {
  assert.match(button, /primary: 'border-ink bg-ink text-ink-inverse/)
  assert.match(styles, /\.tab-underline::after[\s\S]*background: var\(--accent\)/)
})

check('门禁链完整', () => {
  assert.match(prefs, /check-m62\.mjs/)
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

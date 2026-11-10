#!/usr/bin/env node
// scripts/check-m62.mjs —— M62 浅色科技风视觉规范自测
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
console.log('M62 浅色科技风视觉规范自测（前端）')

const styles = read('styles.css')
const button = read('platform/ui/Button.tsx')
const tabs = read('platform/ui/Tabs.tsx')
const badge = read('platform/ui/Badge.tsx')
const card = read('platform/ui/Card.tsx')
const session = read('features/sessions/SessionTreePanel.tsx')
const composer = read('features/chat/Composer.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('基础取色：bg/surface/line/ink/accent/gradient 与参考一致', () => {
  assert.match(styles, /--canvas: #F7F8FA/)
  assert.match(styles, /--surface: #FFFFFF/)
  assert.match(styles, /--surface-sunken: #F1F3F6/)
  assert.match(styles, /--border: #E4E7EC/)
  assert.match(styles, /--ink: #0A0C10/)
  assert.match(styles, /--ink-secondary: #313A48/)
  assert.match(styles, /--ink-muted: #5C6675/)
  assert.match(styles, /--accent: #2F5BFF/)
  assert.match(styles, /--accent-2: #6E4BFF/)
  assert.match(styles, /--accent-3: #00B8D9/)
  assert.match(styles, /--accent-gradient: linear-gradient\(110deg, #2F5BFF, #6E4BFF 52%, #00B8D9\)/)
})

check('字体与字距：Segoe UI Variable / Consolas / -0.004em', () => {
  assert.match(styles, /--ff-sans: "Segoe UI Variable Text", "Segoe UI", system-ui/)
  assert.match(styles, /--ff-mono: Consolas/)
  assert.match(styles, /letter-spacing: -0\.004em/)
})

check('圆角/阴影：控件8、卡片12、弹层16；双层轻阴影；无重阴影', () => {
  assert.match(styles, /--r-xs: 8px/)
  assert.match(styles, /--r-md: 12px/)
  assert.match(styles, /--r-xl: 16px/)
  assert.match(styles, /--sh-sm: 0 1px 2px rgba\(10, 12, 16, 0\.05\), 0 4px 14px -6px rgba\(10, 12, 16, 0\.10\)/)
  assert.equal(/0 12px 32px/.test(styles), false)
  assert.match(styles, /\.popover-surface\s*\{[\s\S]*border-radius: 16px !important/)
})

check('背景：canvas + 顶部极淡三色径向渐变（≤6%）', () => {
  assert.match(styles, /--glow-primary: rgba\(47, 91, 255, 0\.06\)/)
  assert.match(styles, /--glow-secondary: rgba\(110, 75, 255, 0\.05\)/)
  assert.match(styles, /--glow-tertiary: rgba\(0, 184, 217, 0\.04\)/)
  assert.match(styles, /background-image:\s*radial-gradient\(900px 520px/)
})

check('按钮：主按钮黑色白字、次按钮白底 1px line', () => {
  assert.match(button, /primary: 'border-ink bg-ink text-ink-inverse shadow-sm/)
  assert.match(button, /secondary: 'border-border bg-surface-solid/)
  assert.match(composer, /border-ink bg-ink[\s\S]*text-ink-inverse/)
})

check('导航 active 渐变下划线；侧栏 active 淡 accent；徽标 tint', () => {
  assert.match(tabs, /tab-underline/)
  assert.match(tabs, /text-accent/)
  assert.match(styles, /\.tab-underline::after[\s\S]*background: var\(--accent-gradient\)/)
  assert.match(session, /border-accent-border bg-accent-soft/)
  assert.match(session, /text-accent/)
  assert.match(badge, /accent: 'border-accent-border bg-accent-soft text-accent'/)
  assert.match(card, /shadow-sm/)
})

check('门禁链包含 check-m62；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m62\.mjs/)
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

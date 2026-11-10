#!/usr/bin/env node
// scripts/check-m49.mjs —— M49 时间轴/权限面板微调自测
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
console.log('M49 时间轴/权限面板微调自测（前端）')

const historyRail = read('features/chat/HistoryRail.tsx')
const permission = read('app/PermissionMenu.tsx')
const styles = read('styles.css')
const pkg = JSON.parse(readRoot('package.json'))

check('时间轴尺寸：22×5 / 当前 28×6 / hover 28×5，圆角 2px', () => {
  assert.match(historyRail, /h-\[5px\] w-\[22px\]/)
  assert.match(historyRail, /h-1\.5 w-7 opacity-100/)
  assert.match(historyRail, /group-hover:w-7/)
  assert.match(historyRail, /rounded-\[2px\]/)
  assert.match(historyRail, /opacity-65/)
})

check('时间轴颜色：user #3B82F6 / agent #64748B，默认 0.65', () => {
  assert.match(styles, /--timeline-user: #3b82f6/)
  assert.match(styles, /--timeline-user-active: #2f5bff/)
  assert.match(styles, /--timeline-agent: #64748b/)
  assert.equal(/--timeline-system/.test(styles), false)
  assert.match(historyRail, /bg-timeline-user-active/)
  assert.match(historyRail, /bg-timeline-user/)
  assert.match(historyRail, /bg-timeline-agent/)
  assert.equal(/bg-timeline-system/.test(historyRail), false)
})

check('时间轴间距：同发送方 2px、不同发送方 4px；一条消息一根，不聚合', () => {
  assert.match(historyRail, /h-\[7px\] w-8/)
  assert.match(historyRail, /mt-0.5/)
  assert.match(historyRail, /const ticks = buildTimeline\(messages\)/)
  assert.equal(/buildTimelineRounds|compactTimelineRounds|TimelineRound/.test(historyRail), false)
  assert.match(historyRail, /my-auto/)
})

check('权限面板：选中行 #F3F4F6 浅灰、当前 12px 灰字、无蓝色选中，仍实底+阴影', () => {
  assert.match(permission, /active \? 'border-border-subtle bg-avatar-bg'/)
  assert.match(permission, /className="ml-auto flex-none text-xs text-muted">当前/)
  assert.equal(/border-accent-border bg-accent-soft/.test(permission), false)
  assert.match(permission, /popover-surface fixed/)
  assert.match(styles, /--avatar-bg: #f3f4f6/)
})

check('门禁链包含 check-m49；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m49\.mjs/)
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

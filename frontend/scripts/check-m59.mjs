#!/usr/bin/env node
// scripts/check-m59.mjs —— M59 会话范围默认仅本会话 + 记住选择
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
console.log('M59 会话范围默认仅本会话自测（前端）')

const runtime = read('features/chat/useChatRuntime.ts')
const prefs = read('platform/preferences.ts')
const center = read('features/chat/ChatCenter.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('默认 false：includeChildren 从偏好读取，不再按根/子会话自动切 true', () => {
  assert.match(runtime, /useState\(\(\) => loadIncludeChildrenPreference\(\)\)/)
  assert.match(runtime, /saveIncludeChildrenPreference\(value\)/)
  assert.equal(/payload\.depth <= 0/.test(runtime), false)
  assert.match(prefs, /INCLUDE_CHILDREN_KEY = 'simo\.includeChildren'/)
  assert.match(prefs, /readString\(INCLUDE_CHILDREN_KEY\) === '1'/)
})

check('用户切换后写 localStorage；下次加载沿用', () => {
  assert.match(prefs, /writeString\(INCLUDE_CHILDREN_KEY, value \? '1' : '0'\)/)
  assert.match(runtime, /setIncludeChildrenState\(value\)[\s\S]*saveIncludeChildrenPreference\(value\)/)
})

check('会话头按当前范围显示，不再固定「聚合视图」', () => {
  assert.match(center, /isRoot \? '主窗口'/)
  assert.match(center, /默认仅本会话/)
})

check('门禁链包含 check-m59；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m59\.mjs/)
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

#!/usr/bin/env node
/**
 * check-sdd.mjs — SDD 最低自动检查（零依赖，只读）
 *
 * 检查：
 *  1) specs/<id>/spec.md 必须含：状态、目标、需求（R 编号）、验收（A 编号）、非目标；
 *  2) 每个 A 编号必须在同目录 test-plan.md 或 evidence.md 中有映射；
 *  3) COMP-* spec 必须含验收与影响范围；
 *  4) frontend/src/components/manifest.json 存在，且每个组件有 name / variants / state(s)。
 *
 * 用法：
 *   node scripts/check-sdd.mjs
 *   node scripts/check-sdd.mjs --root <repo-root>
 *   node scripts/check-sdd.mjs --json        # 机器可读输出
 *
 * 退出码：0 全通过；1 存在失败项；2 运行前置失败（目录/文件不可读）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (name, fallback = '') => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const asJson = args.includes('--json')
const root = resolve(opt('--root', resolve(dirname(fileURLToPath(import.meta.url)), '..')))
const failures = []
const warnings = []
const stats = { specs: 0, comps: 0, aIds: 0, mapped: 0, components: 0 }

const fail = (file, message) => failures.push({ file, message })
const warn = (file, message) => warnings.push({ file, message })

function readText(path) {
  try { return readFileSync(path, 'utf8') } catch (e) { return null }
}

function parseHeadings(text) {
  const lines = text.split(/\r?\n/)
  const headings = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i])
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i })
  }
  return { lines, headings }
}

/** 取标题匹配的第一个 section（到下一个同级/更高级标题为止）；没有则 null。 */
function section(text, matcher) {
  const { lines, headings } = parseHeadings(text)
  const start = headings.find((h) => matcher.test(h.text))
  if (!start) return null
  let end = lines.length
  for (const h of headings) {
    if (h.line > start.line && h.level <= start.level) { end = h.line; break }
  }
  return lines.slice(start.line + 1, end).join('\n')
}

function ids(text, prefix) {
  if (!text) return []
  const re = new RegExp(`\\b${prefix}\\d+\\b`, 'g')
  return [...new Set(text.match(re) || [])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
}

function checkSpecDir(dir, name) {
  stats.specs++
  const specPath = join(dir, 'spec.md')
  const rel = `specs/${name}/spec.md`
  const text = readText(specPath)
  if (text === null) { fail(rel, '缺失 spec.md'); return }
  const isComp = /^COMP-/.test(name)
  if (isComp) stats.comps++

  // 1. 状态
  const statusMatch = /^\s*(?:[-*]\s*)?状态\s*[:：]\s*(.+)$/m.exec(text)
  if (!statusMatch || !statusMatch[1].replace(/[*_`\s]/g, '').trim()) {
    fail(rel, '缺少非空「状态：」行')
  }

  // 2. 目标（严格的「目标」标题；COMP 也按统一规则检查）
  const goal = section(text, /(^|[.\s])目标($|[（(：:\s])/)
  if (!goal || !goal.trim()) fail(rel, '缺少「目标」章节（标题或内容为空）')

  // 3. 需求 R 编号
  const req = section(text, /需求/)
  const rIds = ids(req, 'R')
  if (!req) fail(rel, '缺少「需求」章节')
  else if (rIds.length === 0) fail(rel, '「需求」章节没有 R 编号（如 R1）')

  // 4. 验收 A 编号
  const acc = section(text, /验收/)
  const aIds = ids(acc, 'A')
  if (!acc) fail(rel, '缺少「验收」章节')
  else if (aIds.length === 0) fail(rel, '「验收」章节没有 A 编号（如 A1）')
  stats.aIds += aIds.length

  // 5. 非目标
  if (!section(text, /非目标/)) fail(rel, '缺少「非目标」章节')

  // 6. A 编号映射到 test-plan.md / evidence.md
  if (aIds.length > 0) {
    const testPlan = readText(join(dir, 'test-plan.md'))
    const evidence = readText(join(dir, 'evidence.md'))
    const mappingText = [testPlan, evidence].filter((x) => x !== null).join('\n')
    if (!mappingText.trim()) {
      fail(rel, `没有 test-plan.md / evidence.md，A 编号无法映射（${aIds.join(',')}）`)
    } else {
      const missing = aIds.filter((id) => !new RegExp(`\\b${id}\\b`).test(mappingText))
      stats.mapped += aIds.length - missing.length
      if (missing.length) fail(rel, `A 编号未在 test-plan.md/evidence.md 映射：${missing.join(',')}`)
    }
  }

  // 7. COMP 额外：验收 + 影响范围
  if (isComp) {
    if (!acc) fail(rel, 'COMP spec 缺少验收章节')
    if (!section(text, /影响(范围|页面)/)) fail(rel, 'COMP spec 缺少「影响范围/影响页面」章节')
  }
}

function checkManifest() {
  const rel = 'frontend/src/components/manifest.json'
  const path = join(root, rel)
  let text
  try { text = readFileSync(path, 'utf8') } catch { fail(rel, '文件不存在（前端组件清单缺失）'); return }
  let data
  try { data = JSON.parse(text) } catch (e) { fail(rel, `JSON 解析失败：${e.message}`); return }
  if (!Array.isArray(data.components) || data.components.length === 0) {
    fail(rel, '缺少非空 components[] 数组'); return
  }
  stats.components = data.components.length
  const seen = new Set()
  data.components.forEach((c, i) => {
    const where = `${rel} components[${i}]`
    if (!c || typeof c !== 'object') { fail(where, '不是对象'); return }
    if (!c.name || typeof c.name !== 'string') fail(where, '缺少 name')
    else if (seen.has(c.name)) fail(where, `组件 name 重复：${c.name}`)
    else seen.add(c.name)
    if (!Array.isArray(c.variants)) fail(where, '缺少 variants[]')
    if (!Array.isArray(c.states) && !Array.isArray(c.state)) fail(where, '缺少 states[]/state[]')
    else if ((c.states || c.state).length === 0) warn(where, `组件 ${c.name || '?'} 的 states 为空`)
  })
}

function main() {
  const specsDir = join(root, 'specs')
  let entries
  try { entries = readdirSync(specsDir, { withFileTypes: true }) } catch {
    console.error(`✗ 无法读取 specs/：${specsDir}`); process.exit(2)
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const name of dirs) {
    const dir = join(specsDir, name)
    try { if (!statSync(join(dir, 'spec.md')).isFile()) continue } catch { continue }
    checkSpecDir(dir, name)
  }
  checkManifest()

  if (asJson) {
    console.log(JSON.stringify({ ok: failures.length === 0, root, stats, failures, warnings }, null, 2))
  } else {
    console.log(`SDD check — root: ${root}`)
    console.log(`specs: ${stats.specs}（COMP ${stats.comps}）；A 编号: ${stats.aIds}，已映射: ${stats.mapped}；manifest 组件: ${stats.components}`)
    for (const f of failures) console.log(`[FAIL] ${f.file} — ${f.message}`)
    for (const w of warnings) console.log(`[WARN] ${w.file} — ${w.message}`)
    console.log(`\nSUMMARY: ${failures.length === 0 ? 'PASS' : 'FAIL'}（失败 ${failures.length}，警告 ${warnings.length}）`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

main()

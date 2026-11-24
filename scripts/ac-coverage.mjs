#!/usr/bin/env node
/**
 * ac-coverage.mjs：AC 判据覆盖统计（零依赖，只读）
 *
 * AC 清单只取 specs/test 下各级 test-plan.md 的映射矩阵行，行内必须有一个状态单元格
 * 落在 pass、partial、missing、blocked 四值之内。脚本按测试域汇总三态：
 *   script：scripts/ac/ 下存在同名 .mjs 断言脚本。
 *   manual：test-plan.md 或对应 spec.md 的 AC 行写了 人工:<动作> 判据。
 *   missing：既没有脚本也没有人工判据。
 *
 * 用法：
 *   node scripts/ac-coverage.mjs
 *   node scripts/ac-coverage.mjs --root <repo-root>
 *   node scripts/ac-coverage.mjs --json
 *   node scripts/ac-coverage.mjs --self-test
 *
 * 文本输出先列各域计数，再列 missing 明细，末行给汇总。--json 输出 total、
 * counts、domains、items 与 missing。存在 missing 时退出码为 1，全部有判据时
 * 退出码为 0，参数或目录错误为 2。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const FIXTURE_DIR = join(DEFAULT_ROOT, '.tmp', 'ac-tooling', 'fixtures', 'coverage')
const AC_ID_GLOBAL = /AC-(?:[A-Z0-9]+-){2,}\d+/g
const STATUS_VALUES = new Set(['pass', 'partial', 'missing', 'blocked'])
const MANUAL_MARK = /人工\s*[:：]/
const HEADING = /^#{1,6}\s/

function walkFiles(dir, name, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, name, found)
    else if (entry.isFile() && entry.name === name) found.push(full)
  }
  return found
}

function extractIds(text) {
  return text.match(AC_ID_GLOBAL) ?? []
}

/** 从 specs/test/<域>/test-plan.md 的路径取出域名，嵌套目录保留整段相对路径。 */
function domainOf(root, planPath) {
  const dir = relative(root, dirname(planPath)).split('\\').join('/')
  const parts = dir.split('/')
  return parts.length > 2 ? parts.slice(2).join('/') : parts[parts.length - 1]
}

/**
 * 解析一张 test-plan。矩阵行提供 AC 与状态；人工判据可以写在同一行，也可以
 * 写在含该 AC 的标题小节内。正文里顺带提到的编号不进清单，避免把撤除项算成缺口。
 */
function parseTestPlan(root, planPath) {
  const display = relative(root, planPath).split('\\').join('/')
  const domain = domainOf(root, planPath)
  const lines = readFileSync(planPath, 'utf8').split(/\r?\n/)
  const entries = new Map()
  const manualIds = new Set()
  let sectionIds = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNo = index + 1

    if (HEADING.test(line)) {
      const headingIds = extractIds(line).filter((id) => entries.has(id))
      sectionIds = headingIds
    }

    if (/^\s*\|/.test(line)) {
      const cells = line.split('|').map((cell) => cell.trim().replace(/`/g, ''))
      const status = cells.find((cell) => STATUS_VALUES.has(cell))
      if (status) {
        for (const id of extractIds(line)) {
          if (entries.has(id)) continue
          entries.set(id, { ac: id, domain, specStatus: status, testPlan: display, line: lineNo })
        }
      }
    }

    if (MANUAL_MARK.test(line)) {
      const ids = extractIds(line)
      if (ids.length > 0) {
        for (const id of ids) if (entries.has(id)) manualIds.add(id)
      } else {
        for (const id of sectionIds) if (entries.has(id)) manualIds.add(id)
      }
    }
  }

  return { entries, manualIds }
}

/** spec 里的 AC 定义行也认 人工:，这是第 2.6 节迁移时写判定人的位置。 */
function collectSpecManualIds(root, knownIds) {
  const manual = new Set()
  const specsDir = join(root, 'specs')
  for (const file of walkFiles(specsDir, 'spec.md')) {
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of content.split(/\r?\n/)) {
      if (!MANUAL_MARK.test(line)) continue
      for (const id of extractIds(line)) if (knownIds.has(id)) manual.add(id)
    }
  }
  return manual
}

function collectScriptIds(root) {
  const scriptIds = new Set()
  const acDir = join(root, 'scripts', 'ac')
  let entries
  try {
    entries = readdirSync(acDir, { withFileTypes: true })
  } catch {
    return scriptIds
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.mjs')) {
      const id = entry.name.slice(0, -4)
      if (extractIds(id).length === 1) scriptIds.add(id)
    }
  }
  return scriptIds
}

/** 核心统计，返回可直接序列化的结果，供真实运行与自检共用。 */
function computeCoverage(root) {
  const planFiles = walkFiles(join(root, 'specs', 'test'), 'test-plan.md').sort()
  const entries = new Map()
  const manualFromPlan = new Set()

  for (const plan of planFiles) {
    const parsed = parseTestPlan(root, plan)
    for (const [id, entry] of parsed.entries) {
      if (!entries.has(id)) entries.set(id, entry)
    }
    for (const id of parsed.manualIds) manualFromPlan.add(id)
  }

  const knownIds = new Set(entries.keys())
  const manualFromSpec = collectSpecManualIds(root, knownIds)
  const scriptIds = collectScriptIds(root)

  const items = []
  for (const [id, entry] of entries) {
    let state = 'missing'
    if (scriptIds.has(id)) state = 'script'
    else if (manualFromPlan.has(id) || manualFromSpec.has(id)) state = 'manual'
    items.push({ ...entry, state })
  }
  items.sort((a, b) => (a.domain === b.domain ? a.ac.localeCompare(b.ac) : a.domain.localeCompare(b.domain)))

  const domains = new Map()
  for (const item of items) {
    if (!domains.has(item.domain)) {
      domains.set(item.domain, { domain: item.domain, total: 0, script: 0, manual: 0, missing: 0 })
    }
    const bucket = domains.get(item.domain)
    bucket.total += 1
    bucket[item.state] += 1
  }

  const counts = { script: 0, manual: 0, missing: 0 }
  for (const item of items) counts[item.state] += 1
  const missing = items.filter((item) => item.state === 'missing')

  return {
    total: items.length,
    counts,
    domains: [...domains.values()].sort((a, b) => a.domain.localeCompare(b.domain)),
    items,
    missing,
  }
}

function printText(result) {
  for (const domain of result.domains) {
    console.log(
      `${domain.domain}：共 ${domain.total} 条，script ${domain.script} / manual ${domain.manual} / missing ${domain.missing}`,
    )
  }
  if (result.missing.length > 0) {
    console.log('missing 明细：')
    for (const item of result.missing) {
      const status = item.specStatus ? `，test-plan 状态 ${item.specStatus}` : ''
      console.log(`  ${item.ac}  ${item.testPlan}:${item.line}${status}`)
    }
  }
  console.log(
    `汇总：共 ${result.total} 条，script ${result.counts.script} / manual ${result.counts.manual} / missing ${result.counts.missing}`,
  )
}

function writeSelfTestFixtures() {
  const root = FIXTURE_DIR
  const plan = join(root, 'specs', 'test', 'P1-TEST', 'test-plan.md')
  const script = join(root, 'scripts', 'ac', 'AC-TST-001-01.mjs')
  mkdirSync(dirname(plan), { recursive: true })
  mkdirSync(dirname(script), { recursive: true })
  writeFileSync(
    plan,
    [
      '# 自检样本：三态各一条',
      '',
      '| # | AC | TC | 类型 | 位置 | 状态 | 证据 |',
      '|---|---|---|---|---|---|---|',
      '| 1 | AC-TST-001-01 | TC-1 | unit | `scripts/ac/AC-TST-001-01.mjs` | pass | E |',
      '| 2 | AC-TST-001-02 | TC-2 | manual | 人工：目视面板 | pass | E |',
      '| 3 | AC-TST-001-03 | TC-3 | missing | 缺失 | missing | E |',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(script, '// 自检用的空脚本，覆盖统计只检查文件存在。\n', 'utf8')
}

function runSelfTest() {
  writeSelfTestFixtures()
  const result = computeCoverage(FIXTURE_DIR)
  const checks = [
    ['script', result.counts.script, 1],
    ['manual', result.counts.manual, 1],
    ['missing', result.counts.missing, 1],
    ['total', result.total, 3],
  ]
  let ok = true
  for (const [label, actual, expected] of checks) {
    const passed = actual === expected
    if (!passed) ok = false
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label} ${actual}，期望 ${expected}`)
  }
  const missingOk = result.missing.length === 1 && result.missing[0].ac === 'AC-TST-001-03'
  if (!missingOk) ok = false
  console.log(`${missingOk ? 'PASS' : 'FAIL'} missing 明细只含 AC-TST-001-03`)
  console.log(ok ? 'SELF-TEST PASS' : 'SELF-TEST FAILED')
  return ok ? 0 : 1
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, json: false, selfTest: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--self-test') options.selfTest = true
    else if (arg === '--root') {
      const value = argv[index + 1]
      if (!value) return { error: '--root 缺少目录参数' }
      options.root = resolve(value)
      index += 1
    } else {
      return { error: `未知参数 ${arg}` }
    }
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.error) {
    console.error(options.error)
    process.exit(2)
  }
  if (options.selfTest) process.exit(runSelfTest())

  if (!existsSync(options.root) || !statSync(options.root).isDirectory()) {
    console.error(`仓库根目录不可读：${options.root}`)
    process.exit(2)
  }

  const result = computeCoverage(options.root)
  if (options.json) {
    console.log(JSON.stringify(result, null, 0))
  } else {
    printText(result)
  }
  process.exit(result.missing.length > 0 ? 1 : 0)
}

main()

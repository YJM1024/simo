#!/usr/bin/env node
/**
 * check-fp-coverage.mjs：功能点覆盖门禁（MX-G-71，零依赖，只读）
 *
 * 门禁要解决的是 AC 与功能点之间没有映射：变更包可以把 18 条 AC 全部跑过，
 * 而同一域里三个功能点只有后端、没有前端入口，仍然签发通过。本脚本读功能树
 * 与变更包 spec 里的“功能点覆盖”表，核对四件事：
 *   1. 覆盖表声明的范围（`覆盖范围：` 行）内，每个功能点都有一行；
 *   2. 状态 in 的功能点至少写一个 AC，且该 AC 在 specs/product 或本包 spec 里登记；
 *   3. 状态 out 写不做理由，状态 partial 写剩余缺口（partial 本身按未完成计 error）；
 *   4. 表里出现的 AC 编号都能在 specs/product 或本包 spec 里查到，行不重复，
 *      功能点必须在树里，Implements 与 TREE.md CHANGE 列指向本包的功能点必须入表。
 *
 * 覆盖表的格式由 docs/framework/templates/fp-coverage.md 定义：
 *
 *   ## 14. 功能点覆盖
 *
 *   覆盖范围：`PRD-AAA-001`、`PRD-AAA-002`
 *
 *   | 功能点ID | 状态 | 覆盖它的 AC | 备注 |
 *   |---|---|---|---|
 *   | `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：… |
 *
 * 用法：
 *   node scripts/check-fp-coverage.mjs
 *       扫描 specs/changes/<CHG-ID>/spec.md，只检查含“功能点覆盖”节的包。
 *   node scripts/check-fp-coverage.mjs --change CHG-CONV-007
 *       只检查一个变更包；缺少覆盖节记 error。
 *   node scripts/check-fp-coverage.mjs --json
 *       输出 { gate, checks, warnings, errors, records }。
 *   node scripts/check-fp-coverage.mjs --self-test
 *       在 .tmp/fp-coverage-tooling 下生成夹具并断言，共 26 条。
 *
 * 每条问题输出一行：`[FP-COVER] <path>:<line> MX-G-71 <error|warning> <事实>；<修复动作>`。
 * 末行输出 `PASS (gate: fp-coverage, checks: <n>, warnings: <m>)` 或
 * `FAILED: <e> error(s), <w> warning(s)`。退出码 0 通过、1 有 error、2 参数或环境错误。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const FIXTURE_ROOT = join(DEFAULT_ROOT, '.tmp', 'fp-coverage-tooling')

const POINT_SOURCE = 'PRD-[A-Z0-9]+-\\d{3}'
const AC_SOURCE = 'AC-(?:[A-Z0-9]+-){2,}\\d+'
const POINT_ID = new RegExp(`^${POINT_SOURCE}$`)
const STATUS_VALUES = new Set(['in', 'partial', 'out'])
const TREE_FILES = ['docs/product/TREE.md', 'docs/product/TREE-FULL.md']
const TEMPLATE = 'docs/framework/templates/fp-coverage.md'

function readLines(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/)
}

function matchPoints(text) {
  return text.match(new RegExp(POINT_SOURCE, 'g')) ?? []
}

function matchAcs(text) {
  return text.match(new RegExp(AC_SOURCE, 'g')) ?? []
}

/** 表格行按 | 切开，去掉首尾空单元，还原转义的 \|。 */
function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

/** 去掉反引号与空白，用于比较功能点 ID 与状态值。 */
function plain(cell) {
  return (cell ?? '').replace(/`/g, '').trim()
}

/** 备注至少要写出内容；破折号、无、N/A 一律按没写处理。 */
function hasReason(note) {
  const text = plain(note).replace(/[*_]/g, '').trim()
  if (text.length < 4) return false
  return !/^(?:—+|-+|无|n\/?a|暂无|不适用)$/i.test(text)
}

/** 解析功能树，返回 id -> { path, line, change }。TREE.md 提供 CHANGE 列，TREE-FULL 提供兜底清单。 */
function parseTree(root) {
  const points = new Map()
  for (const rel of TREE_FILES) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const lines = readLines(abs)
    let header = null
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (!line.trim().startsWith('|')) {
        header = null
        continue
      }
      const cells = splitRow(line)
      if (cells.some((cell) => cell === '功能点') || cells.includes('PRD')) {
        header = cells.map((cell) => plain(cell))
        continue
      }
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue
      const idCell = cells.find((cell) => POINT_ID.test(plain(cell)))
      if (!idCell) continue
      const id = plain(idCell)
      const changeIndex = header ? header.findIndex((cell) => /^CHANGE$/i.test(cell)) : -1
      const change = changeIndex >= 0 ? plain(cells[changeIndex] ?? '') : ''
      if (!points.has(id)) points.set(id, { path: rel, line: i + 1, change })
    }
  }
  return points
}

/** 收集 specs/product 与本包内的全部 AC 编号，作为“已登记”的唯一依据。 */
function collectAcs(root, changeDir) {
  const registry = new Map()
  const dirs = [join(root, 'specs/product'), changeDir].filter((dir) => dir && existsSync(dir))
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) scan(full)
      else if (entry.isFile() && entry.name.endsWith('.md')) index(full)
    }
  }
  const index = (file) => {
    const lines = readLines(file)
    const display = relative(root, file).split('\\').join('/')
    let inCoverage = false
    lines.forEach((line, i) => {
      // 覆盖表自身不登记 AC，否则表里写错的编号会把自己变成“已登记”。
      if (findCoverageHeading([line]) === 0) {
        inCoverage = true
        return
      }
      if (inCoverage) {
        if (/^#{1,3}\s/.test(line)) inCoverage = false
        else return
      }
      for (const ac of matchAcs(line)) if (!registry.has(ac)) registry.set(ac, { path: display, line: i + 1 })
    })
  }
  for (const dir of dirs) scan(dir)
  return registry
}

function findCoverageHeading(lines) {
  return lines.findIndex((line) => /^#{2,3}\s+(?:\d+(?:\.\d+)?\.?\s*)?功能点覆盖\s*$/.test(line.trim()))
}

function sectionEnd(lines, start) {
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,3}\s/.test(lines[i])) return i
  }
  return lines.length
}

function findScope(lines, start, end) {
  for (let i = start + 1; i < end; i += 1) {
    const match = lines[i].match(/^\s*(?:\*\*)?覆盖范围(?:\*\*)?\s*[：:]\s*(.+?)\s*$/)
    if (match) return { line: i + 1, ids: matchPoints(match[1]) }
  }
  return null
}

function findTable(lines, start, end) {
  for (let i = start + 1; i < end; i += 1) {
    if (!/^\s*\|/.test(lines[i])) continue
    const header = splitRow(lines[i])
    const hasPoint = header.some((cell) => /^功能点/i.test(plain(cell)))
    const hasStatus = header.some((cell) => /^状态$/i.test(plain(cell)))
    if (hasPoint && hasStatus) return { line: i + 1, header }
  }
  return null
}

function makeRecord(path, line, message, hint) {
  return { path, line, severity: 'error', message, hint }
}

/** 检查一个变更包的覆盖节。返回 records、行数与包数。 */
function checkPackage(root, changeId) {
  const records = []
  const path = `specs/changes/${changeId}/spec.md`
  const abs = join(root, path)
  if (!existsSync(abs)) {
    records.push(makeRecord(path, 1, `变更包缺少 spec.md：${changeId}`, '补齐变更包后再跑门禁'))
    return { records, rows: 0, packages: 1 }
  }
  const lines = readLines(abs)
  const start = findCoverageHeading(lines)
  if (start < 0) {
    records.push(makeRecord(path, 1, `缺少“功能点覆盖”节：${changeId}`, `按 ${TEMPLATE} 追加一节，写明覆盖范围与四列表`))
    return { records, rows: 0, packages: 1 }
  }

  const end = sectionEnd(lines, start)
  const sectionLine = start + 1

  const scope = findScope(lines, start, end)
  if (!scope) {
    records.push(makeRecord(path, sectionLine, `“功能点覆盖”节缺少“覆盖范围”行：${changeId}`, '加一行“覆盖范围：”，列出本次声明受影响的功能点 ID'))
  } else if (scope.ids.length === 0) {
    records.push(makeRecord(path, scope.line, '“覆盖范围”行没有列出功能点 ID', '写至少一个树里的功能点 ID'))
  }

  const table = findTable(lines, start, end)
  if (!table) {
    records.push(makeRecord(path, sectionLine, '“功能点覆盖”节缺少四列表', '按模板补表头：功能点ID、状态、覆盖它的 AC、备注'))
    return { records, rows: 0, packages: 1 }
  }

  const header = table.header.map((cell) => plain(cell))
  const idCol = header.findIndex((cell) => /^功能点\s*ID$/i.test(cell))
  const statusCol = header.findIndex((cell) => /^状态$/i.test(cell))
  const acCol = header.findIndex((cell) => /^(?:覆盖它的\s*AC|AC)$/i.test(cell))
  const noteCol = header.findIndex((cell) => /^备注$/i.test(cell))
  if (idCol < 0 || statusCol < 0 || acCol < 0 || noteCol < 0) {
    records.push(makeRecord(path, table.line, '覆盖表缺列，四列必须是功能点ID、状态、覆盖它的 AC、备注', '按模板改表头'))
    return { records, rows: 0, packages: 1 }
  }
  if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[table.line] ?? '')) {
    records.push(makeRecord(path, table.line + 1, '表头后缺少分隔行', '在表头下行补 |---|---|---|---|'))
  }

  const tree = parseTree(root)
  const registry = collectAcs(root, join(root, 'specs/changes', changeId))
  const seen = new Map()
  const details = []
  let rows = 0

  for (let i = table.line + 1; i < end; i += 1) {
    if (!/^\s*\|/.test(lines[i])) continue
    if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) continue
    const cells = splitRow(lines[i])
    if (cells.length !== header.length) {
      records.push(makeRecord(path, i + 1, `列数与表头不符：期望 ${header.length} 列，实际 ${cells.length} 列`, '补齐或删去多余的 |，备注里不要出现未转义的竖线'))
      continue
    }
    rows += 1
    const id = plain(cells[idCol])
    const status = plain(cells[statusCol]).toLowerCase()
    const acCell = cells[acCol] ?? ''
    const note = cells[noteCol] ?? ''

    if (!POINT_ID.test(id)) {
      records.push(makeRecord(path, i + 1, `功能点ID 非法：${id || '空'}`, `功能点 ID 取树里的 ${POINT_SOURCE} 形式`))
      continue
    }
    if (seen.has(id)) {
      records.push(makeRecord(path, i + 1, `重复的功能点行：${id}`, '删去重复行，一个功能点只留一行'))
      continue
    }
    seen.set(id, { line: i + 1, status })

    if (!tree.has(id)) {
      records.push(makeRecord(path, i + 1, `功能点不在树里：${id}`, '改用 TREE.md 或 TREE-FULL.md 里存在的功能点 ID，或先补树'))
    }
    if (!STATUS_VALUES.has(status)) {
      records.push(makeRecord(path, i + 1, `状态非法：${status || '空'}（${id}）`, '状态只取 in、partial、out'))
      continue
    }

    const acs = matchAcs(acCell.replace(/`/g, ''))
    details.push({ id, status, acs, note: plain(note), line: i + 1 })
    for (const ac of acs) {
      if (!registry.has(ac)) {
        records.push(makeRecord(path, i + 1, `AC 编号未登记：${ac}（${id}）`, '改成 specs/product 或本包 spec 里存在的 AC 编号，或先登记该 AC'))
      }
    }

    if (status === 'in' && acs.length === 0) {
      records.push(makeRecord(path, i + 1, `状态 in 但没写覆盖它的 AC：${id}`, '至少写一个已登记的 AC 编号'))
    }
    if (status === 'out' && !hasReason(note)) {
      records.push(makeRecord(path, i + 1, `状态 out 但没写理由：${id}`, '在备注写不做理由，例如跨域归属、排期或明确不做'))
    }
    if (status === 'partial') {
      if (!hasReason(note)) {
        records.push(makeRecord(path, i + 1, `状态 partial 但没写剩余缺口：${id}`, '在备注写清还缺什么，例如缺前端入口、缺哪个页面'))
      } else {
        records.push(makeRecord(path, i + 1, `状态 partial，功能点未完成：${id}（${plain(note)}）`, '补齐缺口后改 in；确认不做则改为 out 并写理由'))
      }
    }
  }

  const headerText = lines.slice(0, start).join('\n')
  const implementsLine = headerText.match(/^Implements\s*[：:]\s*(.+)$/m)
  const implementsIds = implementsLine ? matchPoints(implementsLine[1]) : []
  const required = new Set(implementsIds)
  for (const id of scope?.ids ?? []) required.add(id)
  for (const [id, info] of tree) if (info.change.split(/[,、，\s]+/).includes(changeId)) required.add(id)

  for (const id of scope?.ids ?? []) {
    if (!tree.has(id)) {
      records.push(makeRecord(path, scope.line, `“覆盖范围”里的功能点不在树里：${id}`, '改用树里的功能点 ID'))
    }
  }
  for (const id of required) {
    if (!tree.has(id)) continue
    if (!seen.has(id)) {
      records.push(makeRecord(path, sectionLine, `功能点在树里存在却没出现在覆盖表中：${id}`, '在表里补一行，状态取 in、partial 或 out，并按状态写 AC 或理由'))
    }
  }
  for (const id of implementsIds) {
    if (seen.get(id)?.status === 'out') {
      records.push(makeRecord(path, seen.get(id).line, `Implements 的功能点不得标 out：${id}`, '把该行改为 in 或 partial，或在 spec 首部去掉这个 Implements'))
    }
  }

  return { records, rows, packages: 1, points: details }
}
function checkAll(root) {
  const base = join(root, 'specs/changes')
  if (!existsSync(base)) return { records: [makeRecord('specs/changes', 1, '找不到 specs/changes 目录', '确认 --root 指向仓库根')], rows: 0, packages: 0, points: [] }
  const records = []
  const points = []
  let rows = 0
  let packages = 0
  const ids = readdirSync(base)
    .filter((name) => {
      try {
        return statSync(join(base, name)).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
  for (const id of ids) {
    const spec = join(base, id, 'spec.md')
    if (!existsSync(spec)) continue
    if (findCoverageHeading(readLines(spec)) < 0) continue
    const result = checkPackage(root, id)
    records.push(...result.records)
    rows += result.rows
    packages += result.packages
    points.push(...result.points)
  }
  return { records, rows, packages, points }
}

function render(records, stats) {
  const errors = records.filter((record) => record.severity === 'error').length
  const warnings = records.filter((record) => record.severity === 'warning').length
  const lines = records.map((record) => `[FP-COVER] ${record.path}:${record.line} MX-G-71 ${record.severity} ${record.message}；${record.hint}`)
  lines.push(errors ? `FAILED: ${errors} error(s), ${warnings} warning(s)` : `PASS (gate: fp-coverage, checks: ${stats.rows}, warnings: ${warnings})`)
  return { text: lines.join('\n'), errors, warnings }
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, change: null, selfTest: false, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--json') options.json = true
    else if (arg === '--root') {
      const value = argv[i + 1]
      if (!value) return { error: '--root 需要一个目录' }
      options.root = resolve(value)
      i += 1
    } else if (arg === '--change') {
      const value = argv[i + 1]
      if (!value) return { error: '--change 需要一个变更包 ID' }
      options.change = value
      i += 1
    } else return { error: `未知参数：${arg}` }
  }
  return options
}

function writeFixture(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
  }
}

function treeFixture(change = 'CHG-GATE-001') {
  return [
    '# TREE',
    '',
    '| PRD | L3 功能点 | P | 状态 | 产品 spec | CHANGE | 开发 | COMP | TEST |',
    '|---|---|---|---|---|---|---|---|---|',
    `| \`PRD-AAA-001\` | 甲 | P0 | \`partial\` | product | \`${change}\` | | | |`,
    `| \`PRD-AAA-002\` | 乙 | P1 | \`partial\` | product | \`${change}\` | | | |`,
    '| `PRD-AAA-003` | 丙 | P2 | `unimplemented` | — | — | | | |',
  ].join('\n')
}

function coverageFixture(rows, scope = ['PRD-AAA-001', 'PRD-AAA-002'], extra = {}) {
  const scopeText = scope.map((id) => `\`${id}\``).join('、')
  const table = [
    '| 功能点ID | 状态 | 覆盖它的 AC | 备注 |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n')
  return [
    '# CHG-GATE-001 夹具',
    '',
    `Implements: \`${extra.implements ?? 'PRD-AAA-001'}\``,
    '',
    '## 14. 功能点覆盖',
    '',
    ...(extra.omitScope ? [] : [`覆盖范围：${scopeText}`, '']),
    table,
    '',
    '## 15. 其它',
    '',
    '正文。',
  ].join('\n')
}

function productSpecFixture(extraAcs = []) {
  return ['## 验收标准', '', '- `AC-AAA-001-01` 甲的主路径判据', '- `AC-AAA-002-01` 乙的主路径判据', ...extraAcs.map((ac) => `- \`${ac}\` 补充判据`)].join('\n')
}

const BASE_PASS_ROWS = [
  '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组；证据：AC-AAA-001-01 |',
  '| `PRD-AAA-002` | out | — | 跨域：归 P6 团队域，本次不做 |',
]

function buildCase(name, { change = coverageFixture(BASE_PASS_ROWS), product = productSpecFixture(), tree = treeFixture() } = {}) {
  const dir = join(FIXTURE_ROOT, name)
  writeFixture(dir, {
    'docs/product/TREE.md': tree,
    'specs/product/AAA/spec.md': product,
    'specs/changes/CHG-GATE-001/spec.md': change,
  })
  return dir
}

function errorsOf(result) {
  return result.records.filter((record) => record.severity === 'error')
}

function runSelfTest() {
  let passed = 0
  let failed = 0
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    if (ok) passed += 1
    else failed += 1
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label} actual ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`)
  }
  const checkTrue = (label, condition, detail = '') => {
    if (condition) passed += 1
    else failed += 1
    console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? `：${detail}` : ''}`)
  }
  const count = (result, re) => errorsOf(result).filter((record) => re.test(record.message)).length

  mkdirSync(FIXTURE_ROOT, { recursive: true })

  const passDir = buildCase('pass')
  const pass = checkPackage(passDir, 'CHG-GATE-001')
  check('合法样例 error 条数', errorsOf(pass).length, 0)
  check('合法样例行数', pass.rows, 2)
  const passAll = checkAll(passDir)
  check('默认扫描的包数', passAll.packages, 1)
  check('默认扫描 error 条数', errorsOf(passAll).length, 0)

  const changeAcDir = buildCase('pass-change-ac', {
    change: coverageFixture(
      [
        '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
        '| `PRD-AAA-002` | in | `AC-AAA-002-01` | 前端入口：任务详情；AC 只在包内 spec 登记 |',
      ],
      ['PRD-AAA-001', 'PRD-AAA-002'],
    ),
    product: productSpecFixture(),
  })
  writeFixture(changeAcDir, {
    'specs/changes/CHG-GATE-001/extra.md': '## 变更级判据\n\n- `AC-AAA-002-01` 只在本包登记\n',
  })
  check('in 引用只在包内登记的 AC 时 error 条数', errorsOf(checkPackage(changeAcDir, 'CHG-GATE-001')).length, 0)

  const partialDir = buildCase('fail-partial', {
    change: coverageFixture([
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | partial | `AC-AAA-002-01` | 缺前端入口：任务概览与进度尚未接入 |',
    ]),
  })
  const partial = checkPackage(partialDir, 'CHG-GATE-001')
  check('partial 记 error 条数', errorsOf(partial).length, 1)
  check('partial 报未完成', count(partial, /功能点未完成/), 1)

  const partialNoGapDir = buildCase('fail-partial-no-gap', {
    change: coverageFixture([
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | partial | `AC-AAA-002-01` | — |',
    ]),
  })
  check('partial 没写剩余缺口', count(checkPackage(partialNoGapDir, 'CHG-GATE-001'), /没写剩余缺口/), 1)

  const outNoReasonDir = buildCase('fail-out-no-reason', {
    change: coverageFixture([
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | out | — | — |',
    ]),
  })
  check('out 没写理由', count(checkPackage(outNoReasonDir, 'CHG-GATE-001'), /没写理由/), 1)

  const inNoAcDir = buildCase('fail-in-no-ac', {
    change: coverageFixture([
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | in | — | 前端入口：任务概览 |',
    ]),
  })
  check('in 没写 AC', count(checkPackage(inNoAcDir, 'CHG-GATE-001'), /没写覆盖它的 AC/), 1)

  const unknownAcDir = buildCase('fail-unknown-ac', {
    change: coverageFixture([
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | in | `AC-AAA-009-01` | 前端入口：任务概览 |',
    ]),
  })
  check('AC 未登记', count(checkPackage(unknownAcDir, 'CHG-GATE-001'), /AC 编号未登记/), 1)

  const badStatusDir = buildCase('fail-bad-status', {
    change: coverageFixture([
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | done | `AC-AAA-002-01` | 已实现 |',
    ]),
  })
  check('状态非法', count(checkPackage(badStatusDir, 'CHG-GATE-001'), /状态非法/), 1)

  const unknownPointDir = buildCase('fail-unknown-point', {
    change: coverageFixture(
      [
        '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
        '| `PRD-AAA-009` | out | — | 跨域：本次不做 |',
      ],
      ['PRD-AAA-001', 'PRD-AAA-009'],
    ),
  })
  check('功能点不在树里', count(checkPackage(unknownPointDir, 'CHG-GATE-001'), /^功能点不在树里：/), 1)

  const missingRowDir = buildCase('fail-missing-row', {
    change: coverageFixture(['| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |']),
  })
  check('声明范围内缺行', count(checkPackage(missingRowDir, 'CHG-GATE-001'), /没出现在覆盖表中/), 1)

  const treeLinkDir = buildCase('fail-tree-link', {
    change: coverageFixture(
      ['| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |'],
      ['PRD-AAA-001'],
    ),
  })
  check('TREE CHANGE 列指向本包却缺行', count(checkPackage(treeLinkDir, 'CHG-GATE-001'), /没出现在覆盖表中/), 1)

  const dupDir = buildCase('fail-dup', {
    change: coverageFixture([
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | out | — | 跨域：归 P6 团队域，本次不做 |',
      '| `PRD-AAA-002` | out | — | 跨域：归 P6 团队域，本次不做 |',
    ]),
  })
  check('重复行', count(checkPackage(dupDir, 'CHG-GATE-001'), /重复的功能点行/), 1)

  const scopeUnknownDir = buildCase('fail-scope-unknown', {
    change: coverageFixture(BASE_PASS_ROWS, ['PRD-AAA-001', 'PRD-AAA-002', 'PRD-ZZZ-001']),
  })
  check('覆盖范围含树外功能点', count(checkPackage(scopeUnknownDir, 'CHG-GATE-001'), /覆盖范围”里的功能点不在树里|覆盖范围里的功能点不在树里/), 1)

  const noScopeDir = buildCase('fail-no-scope', { change: coverageFixture(BASE_PASS_ROWS, [], { omitScope: true }) })
  check('缺覆盖范围行', count(checkPackage(noScopeDir, 'CHG-GATE-001'), /缺少“覆盖范围”行/), 1)

  const noSectionDir = buildCase('fail-no-section', {
    change: ['# CHG-GATE-001 夹具', '', 'Implements: `PRD-AAA-001`', '', '## 1. 背景', '', '正文。'].join('\n'),
  })
  check('缺覆盖节时单包检查记 error', count(checkPackage(noSectionDir, 'CHG-GATE-001'), /缺少“功能点覆盖”节/), 1)
  check('缺覆盖节时默认扫描不记 error', errorsOf(checkAll(noSectionDir)).length, 0)

  const implementsOutDir = buildCase('fail-implements-out', {
    change: coverageFixture(
      [
        '| `PRD-AAA-001` | out | — | 跨域：本次不做 |',
        '| `PRD-AAA-002` | out | — | 跨域：归 P6 团队域，本次不做 |',
      ],
      ['PRD-AAA-001', 'PRD-AAA-002'],
      { implements: 'PRD-AAA-001' },
    ),
  })
  check('Implements 点标 out', count(checkPackage(implementsOutDir, 'CHG-GATE-001'), /Implements 的功能点不得标 out/), 1)

  const badHeaderDir = buildCase('fail-bad-header', {
    change: [
      '# CHG-GATE-001 夹具',
      '',
      'Implements: `PRD-AAA-001`',
      '',
      '## 14. 功能点覆盖',
      '',
      '覆盖范围：`PRD-AAA-001`、`PRD-AAA-002`',
      '',
      '| 功能点 | 状态 | AC | 备注 |',
      '|---|---|---|---|',
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | out | — | 跨域：归 P6 团队域，本次不做 |',
    ].join('\n'),
  })
  check('表头缺功能点ID列', count(checkPackage(badHeaderDir, 'CHG-GATE-001'), /覆盖表缺列/), 1)

  const noSeparatorDir = buildCase('fail-no-separator', {
    change: [
      '# CHG-GATE-001 夹具',
      '',
      'Implements: `PRD-AAA-001`',
      '',
      '## 14. 功能点覆盖',
      '',
      '覆盖范围：`PRD-AAA-001`、`PRD-AAA-002`',
      '',
      '| 功能点ID | 状态 | 覆盖它的 AC | 备注 |',
      '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
      '| `PRD-AAA-002` | out | — | 跨域：归 P6 团队域，本次不做 |',
    ].join('\n'),
  })
  check('表头后缺分隔行', count(checkPackage(noSeparatorDir, 'CHG-GATE-001'), /表头后缺少分隔行/), 1)

  check('合法样例退出码', errorsOf(pass).length ? 1 : 0, 0)
  check('partial 样例退出码', errorsOf(partial).length ? 1 : 0, 1)
  checkTrue(
    '两次运行结果一致',
    JSON.stringify(checkPackage(partialDir, 'CHG-GATE-001').records) === JSON.stringify(checkPackage(partialDir, 'CHG-GATE-001').records),
    `${errorsOf(partial).length} 条记录`,
  )

  if (failed) {
    console.log(`SELF-TEST FAILED：${failed} 条断言未过，${passed} 条通过`)
    return 1
  }
  console.log(`SELF-TEST PASS：${passed} 条断言`)
  return 0
}

const options = parseArgs(process.argv.slice(2))
if (options.error) {
  console.error(`参数错误：${options.error}`)
  process.exit(2)
}
if (options.selfTest) process.exit(runSelfTest())

const root = resolve(options.root)
if (!existsSync(join(root, 'specs'))) {
  console.error(`环境错误：${root} 下没有 specs 目录`)
  process.exit(2)
}

const result = options.change ? checkPackage(root, options.change) : checkAll(root)
const output = render(result.records, result)
if (options.json) {
  console.log(JSON.stringify({ gate: 'fp-coverage', checks: result.rows, warnings: output.warnings, errors: output.errors, points: result.points ?? [], records: result.records }, null, 2))
} else {
  console.log(output.text)
}
process.exit(output.errors > 0 ? 1 : 0)

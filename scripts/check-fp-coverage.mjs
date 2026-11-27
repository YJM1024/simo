#!/usr/bin/env node
/**
 * check-fp-coverage.mjs：功能点覆盖门禁（MX-G-71，零依赖，只读）
 *
 * 框架正文是外部依赖：正文在 SIMO_FRAMEWORK_ROOT（默认同级目录 ../moxian-framework）下的 docs/framework；本脚本只在注释与提示文案里引用该路径，不读框架文件。
 *
 * 门禁要解决的是 AC 与功能点之间没有映射：变更包可以把 18 条 AC 全部跑过，
 * 而同一域里三个功能点只有后端、没有前端入口，仍然签发通过。本脚本读功能树
 * 与变更包 spec 里的“功能点覆盖”表，核对四件事：
 *   1. 覆盖表声明的范围（`覆盖范围：` 行）内，每个功能点都有一行；
 *   2. 状态 in 的功能点至少写一个 AC，且该 AC 在 specs/product 或本包 spec 里登记；
 *   3. 状态 out 写不做理由，状态 partial 写剩余缺口；partial 本身按未完成计：
 *      包首部状态为终态（已关闭、已完成、已验收、已归档、已签发）时记 warning 并写明
 *      “历史欠账”，未关闭的非草稿包记 error，避免历史包永久红灯、当前包带缺口放行；
 *   4. 表里出现的 AC 编号都能在 specs/product 或本包 spec 里查到，行不重复，
 *      功能点必须在树里，Implements 与 TREE.md CHANGE 列指向本包的功能点必须入表；
 *   5. 无功能点的包可写“覆盖范围：无功能点（<理由>）”，理由写在括号里即放过并记
 *      1 条 notice；没有理由仍记 error。
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
 * 默认扫描覆盖 specs/changes/ 下每个变更包：含“功能点覆盖”节的按表核对；缺节的
 * 按包首部状态行（spec.md 优先，proposal.md 兜底）判定，终态包与非 draft 记 error，
 * draft 且未开工记 warning，避免新包一建立就阻断、终态包靠状态逃掉必填。
 *
 * 用法：
 *   node scripts/check-fp-coverage.mjs
 *       扫描 specs/changes/<CHG-ID>/spec.md，含节包核对表，缺节包按状态记 error 或 warning。
 *   node scripts/check-fp-coverage.mjs --change CHG-CONV-007
 *       只检查一个变更包；缺少覆盖节同样按状态判定（非 draft 记 error、draft 记 warning）。
 *   node scripts/check-fp-coverage.mjs --json
 *       输出 { gate, checks, warnings, errors, records }。
 *   node scripts/check-fp-coverage.mjs --self-test
 *       在 .tmp/fp-coverage-tooling 下生成夹具并断言，共 45 条。
 *
 * 每条问题输出一行：`[FP-COVER] <path>:<line> MX-G-71 <error|warning|notice> <事实>；<修复动作>`。
 * 末行输出 `PASS (gate: fp-coverage, checks: <n>, warnings: <m>) notices: <k>` 或
 * `FAILED: <e> error(s), <w> warning(s), <k> notice(s)`。退出码 0 通过、1 有 error、2 参数或环境错误。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPass } from './lib/v2-rule-mode.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const FIXTURE_ROOT = join(DEFAULT_ROOT, '.tmp', 'fp-coverage-tooling')

const POINT_SOURCE = 'PRD-[A-Z0-9]+-\\d{3}'
const AC_SOURCE = 'AC-(?:[A-Z0-9]+-){2,}\\d+'
const POINT_ID = new RegExp(`^${POINT_SOURCE}$`)
const STATUS_VALUES = new Set(['in', 'partial', 'out'])
const TREE_FILES = ['docs/product/TREE.md', 'docs/product/TREE-FULL.md']
const TEMPLATE = 'docs/framework/templates/fp-coverage.md'
// 包首部状态为这些值时按“未开工”处理，缺覆盖表只记 warning；其余（含状态行缺失）按 error。
const DRAFT_STATUSES = new Set(['draft', '草稿', 'proposed', '新建', 'new'])
// 包首部状态为这些终态词时，`partial` 与 `Implements` 点标 out 的欠账降为 warning；
// 终态包缺覆盖节仍记 error（必填不因状态豁免）。按整值精确匹配，`已交付并签发`
// 这类未关闭的中间态不算终态，避免把仍在收口的包当成历史包放行。
const TERMINAL_STATUSES = new Set(['已关闭', '已完成', '已验收', '已归档', '已签发'])
const STATUS_SCAN_LINES = 60

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
    if (match) return { line: i + 1, ids: matchPoints(match[1]), text: match[1] }
  }
  return null
}

/**
 * “无功能点（<理由>）”形态：只认括号里写了真实理由的声明。
 * 返回 { declared, reason }；`无功能点` 后面没有括号或括号为空时 reason 为空串。
 */
function parseNoPointScope(text) {
  const match = (text ?? '').match(/^\s*无功能点\s*(?:[（(]\s*(.*?)\s*[）)])?\s*$/)
  if (!match) return null
  const reason = (match[1] ?? '').replace(/[*_`]/g, '').trim()
  return { declared: true, reason: reason.length >= 4 ? reason : '' }
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

function makeWarning(path, line, message, hint) {
  return { path, line, severity: 'warning', message, hint }
}

function makeNotice(path, line, message, hint) {
  return { path, line, severity: 'notice', message, hint }
}

/** 状态值归一化：去反引号、粗体，截掉括号说明与残余表格分隔符。 */
function normalizeStatusValue(raw) {
  return raw
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .split(/[（(|]/)[0]
    .replace(/[。；;，,、\s]+$/, '')
    .trim()
}

function isDraftStatus(value) {
  return DRAFT_STATUSES.has(value.replace(/\s+/g, '').toLowerCase())
}

/** 终态判定按归一化后的整值精确匹配，`已交付并签发` 之类未关闭状态不算终态。 */
function isTerminalStatus(value) {
  return TERMINAL_STATUSES.has(value.replace(/\s+/g, ''))
}

/**
 * 读一个文件首部的状态行，限定在首个 `##` 标题前或前 60 行内。
 * 支持 `状态：x`、`- 状态：x`、`**状态**：x` 与表格行 `| 状态 | x |`。
 */
function readStatusLine(path) {
  if (!existsSync(path)) return null
  const lines = readLines(path)
  const limit = Math.min(lines.length, STATUS_SCAN_LINES)
  for (let i = 0; i < limit; i += 1) {
    const line = lines[i]
    if (/^##\s/.test(line)) break
    const table = line.match(/^\s*\|\s*(?:\*\*)?状态(?:\*\*)?\s*\|(.+)\|\s*$/)
    const keyValue = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?状态(?:\*\*)?\s*[：:]\s*(.+?)\s*$/)
    const raw = table ? table[1] : keyValue ? keyValue[1] : null
    if (raw === null) continue
    const value = normalizeStatusValue(raw)
    if (!value) continue
    return { value, line: i + 1 }
  }
  return null
}

/** spec.md 的状态优先，没有再读 proposal.md；都没有时按非 draft 处理。 */
function readPackageStatus(root, changeId) {
  for (const rel of [`specs/changes/${changeId}/spec.md`, `specs/changes/${changeId}/proposal.md`]) {
    const hit = readStatusLine(join(root, rel))
    if (hit) return { ...hit, path: rel, draft: isDraftStatus(hit.value), terminal: isTerminalStatus(hit.value) }
  }
  return { value: '', line: 1, path: `specs/changes/${changeId}/spec.md`, draft: false, terminal: false, missing: true }
}

/** 缺“功能点覆盖”节：终态包与普通非 draft 包都记 error，仅 draft 包记 warning。 */
function missingSectionRecord(root, changeId, specPath) {
  const status = readPackageStatus(root, changeId)
  const line = status.path === specPath ? status.line : 1
  const hint = `在 ${specPath} 追加“## 功能点覆盖”节，写明覆盖范围与四列表，模板见 ${TEMPLATE}`
  if (status.draft) {
    return makeWarning(specPath, line, `缺少“功能点覆盖”节：${changeId}（状态：${status.value}，未开工记 warning）`, hint)
  }
  if (status.terminal) {
    return makeRecord(specPath, line, `缺少“功能点覆盖”节：${changeId}（状态：${status.value}，终态包同样必填）`, hint)
  }
  const state = status.missing ? '未读到状态行，按非 draft 处理' : `状态：${status.value}`
  return makeRecord(specPath, line, `缺少“功能点覆盖”节：${changeId}（${state}）`, hint)
}

/** 检查一个变更包的覆盖节。返回 records、行数与包数。 */
function checkPackage(root, changeId) {
  const records = []
  const path = `specs/changes/${changeId}/spec.md`
  const abs = join(root, path)
  if (!existsSync(abs)) {
    records.push(makeRecord(path, 1, `变更包缺少 spec.md：${changeId}`, '补齐变更包后再跑门禁'))
    return { records, rows: 0, declarations: 0, packages: 1, points: [] }
  }
  const lines = readLines(abs)
  const start = findCoverageHeading(lines)
  if (start < 0) {
    records.push(missingSectionRecord(root, changeId, path))
    return { records, rows: 0, declarations: 0, packages: 1, points: [] }
  }

  const end = sectionEnd(lines, start)
  const sectionLine = start + 1
  // 严重度按包首部状态分级：终态包的历史欠账记 warning，未关闭的非草稿包仍记 error。
  const pkgStatus = readPackageStatus(root, changeId)
  const terminal = pkgStatus.terminal
  const debtPrefix = terminal ? '历史欠账：' : ''
  const debtSuffix = terminal ? `（${pkgStatus.value}，已关闭包，记提示）` : ''

  const scope = findScope(lines, start, end)
  const noPoint = scope && scope.ids.length === 0 ? parseNoPointScope(scope.text) : null
  if (!scope) {
    records.push(makeRecord(path, sectionLine, `“功能点覆盖”节缺少“覆盖范围”行：${changeId}`, '加一行“覆盖范围：”，列出本次声明受影响的功能点 ID'))
  } else if (noPoint?.reason) {
    records.push(makeNotice(path, scope.line, `覆盖范围声明无功能点：${noPoint.reason}`, '无功能点的包保持该声明即可；若实际改动了功能点，改为列出树里的功能点 ID'))
  } else if (noPoint) {
    records.push(makeRecord(path, scope.line, '“覆盖范围”写无功能点但括号里没有理由', '写成“覆盖范围：无功能点（<理由>）”，理由写在括号里，例如流程与框架变更'))
  } else if (scope.ids.length === 0) {
    records.push(makeRecord(path, scope.line, '“覆盖范围”行没有列出功能点 ID', '写至少一个树里的功能点 ID'))
  }

  const table = findTable(lines, start, end)
  if (!table) {
    if (noPoint?.reason) {
      // 无功能点的包只写覆盖范围行即可，不强制一张空表；但仍要核对首部与树没有反悔声明。
      const tree = parseTree(root)
      const headerText = lines.slice(0, start).join('\n')
      const implementsLine = headerText.match(/^Implements\s*[：:]\s*(.+)$/m)
      const linked = implementsLine ? matchPoints(implementsLine[1]) : []
      for (const [id, info] of tree) if (info.change.split(/[,、，\s]+/).includes(changeId)) linked.push(id)
      if (linked.length) {
        records.push(makeRecord(path, scope.line, `“覆盖范围”声明无功能点，但本包声明或树里关联了功能点：${[...new Set(linked)].join('、')}`, '二者只能取一个：要么列出这些功能点，要么去掉 Implements 与 TREE 的 CHANGE 关联'))
      }
      return { records, rows: 0, declarations: 1, packages: 1, points: [] }
    }
    records.push(makeRecord(path, sectionLine, '“功能点覆盖”节缺少四列表', '按模板补表头：功能点ID、状态、覆盖它的 AC、备注'))
    return { records, rows: 0, declarations: 0, packages: 1, points: [] }
  }

  const header = table.header.map((cell) => plain(cell))
  const idCol = header.findIndex((cell) => /^功能点\s*ID$/i.test(cell))
  const statusCol = header.findIndex((cell) => /^状态$/i.test(cell))
  const acCol = header.findIndex((cell) => /^(?:覆盖它的\s*AC|AC)$/i.test(cell))
  const noteCol = header.findIndex((cell) => /^备注$/i.test(cell))
  if (idCol < 0 || statusCol < 0 || acCol < 0 || noteCol < 0) {
    records.push(makeRecord(path, table.line, '覆盖表缺列，四列必须是功能点ID、状态、覆盖它的 AC、备注', '按模板改表头'))
    return { records, rows: 0, declarations: 0, packages: 1, points: [] }
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
    seen.set(id, { line: i + 1, status, note: plain(note) })

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
      } else if (terminal) {
        records.push(makeWarning(path, i + 1, `${debtPrefix}状态 partial，功能点未完成：${id}（${plain(note)}）${debtSuffix}`, '历史包保留欠账记录；补齐缺口时改 in 并补 AC，确认不做则改 out 并写理由'))
      } else {
        records.push(makeRecord(path, i + 1, `状态 partial，功能点未完成：${id}（${plain(note)}）`, '补齐缺口后改 in；确认不做则改为 out 并写理由'))
      }
    }
  }

  if (noPoint?.reason && rows > 0) {
    records.push(makeRecord(path, scope.line, `“覆盖范围”声明无功能点，但覆盖表列了 ${rows} 行`, '二者只能取一个：无功能点的包留空表或只写覆盖范围行；列了行就把功能点写进覆盖范围'))
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
    const row = seen.get(id)
    if (row?.status !== 'out') continue
    if (terminal && hasReason(row.note)) {
      records.push(makeWarning(path, row.line, `${debtPrefix}Implements 的功能点标 out：${id}${debtSuffix}`, '历史包保留该记录；要把该点纳入时改 in 或 partial，或去掉首部 Implements 声明'))
    } else {
      records.push(makeRecord(path, row.line, `Implements 的功能点不得标 out：${id}`, '把该行改为 in 或 partial，或在 spec 首部去掉这个 Implements'))
    }
  }

  const declarations = noPoint?.reason && rows === 0 ? 1 : 0
  return { records, rows, declarations, packages: 1, points: details }
}
function checkAll(root) {
  const base = join(root, 'specs/changes')
  if (!existsSync(base)) return { records: [makeRecord('specs/changes', 1, '找不到 specs/changes 目录', '确认 --root 指向仓库根')], rows: 0, declarations: 0, packages: 0, points: [] }
  const records = []
  const points = []
  let rows = 0
  let declarations = 0
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
    const result = checkPackage(root, id)
    records.push(...result.records)
    rows += result.rows
    declarations += result.declarations ?? 0
    packages += result.packages
    points.push(...result.points)
  }
  return { records, rows, declarations, packages, points }
}

function render(records, stats) {
  const errors = records.filter((record) => record.severity === 'error').length
  const warnings = records.filter((record) => record.severity === 'warning').length
  const notices = records.filter((record) => record.severity === 'notice').length
  // 检查项 = 覆盖表行数 + 无功能点声明数；零检查不得判 PASS（无功能点的合法声明计 1 项）。
  const checks = (stats.rows ?? 0) + (stats.declarations ?? 0)
  const pass = isPass(records.filter((record) => record.severity === 'error'), checks)
  const lines = records.map((record) => `[FP-COVER] ${record.path}:${record.line} MX-G-71 ${record.severity} ${record.message}；${record.hint}`)
  const tail = `${errors} error(s), ${warnings} warning(s), ${notices} notice(s)`
  // PASS 行保留 `warnings: <m>)` 结尾，`check-gates.mjs` 的子门禁计数正则按此解析；
  // notice 数放在括号后，不破坏既有汇总。
  if (pass) {
    lines.push(`PASS (gate: fp-coverage, checks: ${checks}, warnings: ${warnings}) notices: ${notices}`)
  } else if (errors) {
    lines.push(`FAILED: ${tail}`)
  } else {
    lines.push(`FAILED: 零检查不得判 PASS (checks: ${checks}) ${tail}`)
  }
  return { text: lines.join('\n'), pass, checks, errors, warnings, notices }
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
  const scopeText = extra.scopeText ?? scope.map((id) => `\`${id}\``).join('、')
  const table = [
    '| 功能点ID | 状态 | 覆盖它的 AC | 备注 |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n')
  return [
    '# CHG-GATE-001 夹具',
    '',
    ...(extra.status ? [`- 状态：${extra.status}`, ''] : []),
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

function warningsOf(result) {
  return result.records.filter((record) => record.severity === 'warning')
}

function noticesOf(result) {
  return result.records.filter((record) => record.severity === 'notice')
}

function exitCodeOf(stats) {
  return render(stats.records ?? [], stats).pass ? 0 : 1
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

  // 缺覆盖节不再被默认扫描跳过：非 draft 记 error，draft 记 warning，状态行缺失按非 draft 处理。
  const missingSectionBody = (header = []) =>
    ['# CHG-GATE-001 夹具', '', ...header, '', 'Implements: `PRD-AAA-001`', '', '## 1. 背景', '', '正文。'].join('\n')

  const noSectionDir = buildCase('fail-no-section', { change: missingSectionBody(['- 状态：进行中（2026-11-21）']) })
  const noSection = checkPackage(noSectionDir, 'CHG-GATE-001')
  check('非 draft 缺覆盖节时单包检查记 error', count(noSection, /缺少“功能点覆盖”节/), 1)
  check('非 draft 缺覆盖节时默认扫描记 error', errorsOf(checkAll(noSectionDir)).length, 1)
  checkTrue(
    '缺节提示写到 spec.md 并指向模板',
    (noSection.records[0]?.hint ?? '').includes('specs/changes/CHG-GATE-001/spec.md') && (noSection.records[0]?.hint ?? '').includes(TEMPLATE),
    noSection.records[0]?.hint ?? '（无提示）',
  )

  const statuslessDir = buildCase('fail-no-section-no-status', { change: missingSectionBody() })
  check('未读到状态行时按非 draft 记 error', errorsOf(checkAll(statuslessDir)).length, 1)

  const draftDir = buildCase('warn-no-section-draft', { change: missingSectionBody(['- 状态：`草稿`（实现未开始）']) })
  const draftAll = checkAll(draftDir)
  check('draft 包缺覆盖节时默认扫描不记 error', errorsOf(draftAll).length, 0)
  check('draft 包缺覆盖节时默认扫描记 warning', warningsOf(draftAll).length, 1)
  check('draft 包缺覆盖节时单包检查记 warning', warningsOf(checkPackage(draftDir, 'CHG-GATE-001')).length, 1)

  const proposalDraftDir = buildCase('warn-no-section-proposal-draft', { change: missingSectionBody() })
  writeFixture(proposalDraftDir, {
    'specs/changes/CHG-GATE-001/proposal.md': ['# CHG-GATE-001 提案', '', '- 状态：`proposed`（实现未开始）', ''].join('\n'),
  })
  check('spec 无状态行时按 proposal 的 draft 记 warning', warningsOf(checkAll(proposalDraftDir)).length, 1)

  const tableDraftDir = buildCase('warn-no-section-table-draft', { change: missingSectionBody(['| 状态 | `草稿`（实现未开始） |']) })
  check('表格状态行也认 draft', warningsOf(checkAll(tableDraftDir)).length, 1)

  check('有覆盖节但状态非法时默认扫描仍记 error', count(checkAll(badStatusDir), /状态非法/), 1)

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

  // 严重度分级从第 35 条起：终态包的历史欠账记 warning，未关闭包同样内容仍记 error。
  const partialRows = [
    '| `PRD-AAA-001` | in | `AC-AAA-001-01` | 前端入口：右栏任务组 |',
    '| `PRD-AAA-002` | partial | `AC-AAA-002-01` | 缺前端入口：任务概览与进度尚未接入 |',
  ]
  const closedPartialDir = buildCase('warn-closed-partial', {
    change: coverageFixture(partialRows, undefined, { status: '已关闭（2026-11-20 归档）' }),
  })
  const closedPartial = checkPackage(closedPartialDir, 'CHG-GATE-001')
  check('终态包 partial 不记 error', errorsOf(closedPartial).length, 0)
  check('终态包 partial 记 1 条 warning', warningsOf(closedPartial).length, 1)
  checkTrue('终态包 partial 文案写明历史欠账', warningsOf(closedPartial).some((record) => /历史欠账/.test(record.message)))

  const openPartialDir = buildCase('fail-open-partial', {
    change: coverageFixture(partialRows, undefined, { status: '进行中（2026-11-21）' }),
  })
  check('未关闭包同样 partial 仍记 error', count(checkPackage(openPartialDir, 'CHG-GATE-001'), /功能点未完成/), 1)

  const closedImplementsOutDir = buildCase('warn-closed-implements-out', {
    change: coverageFixture(
      [
        '| `PRD-AAA-001` | out | — | 跨域：本次不做 |',
        '| `PRD-AAA-002` | out | — | 跨域：归 P6 团队域，本次不做 |',
      ],
      ['PRD-AAA-001', 'PRD-AAA-002'],
      { implements: 'PRD-AAA-001', status: '已关闭（2026-11-20 归档）' },
    ),
  })
  const closedImplementsOut = checkPackage(closedImplementsOutDir, 'CHG-GATE-001')
  check('终态包 Implements 点标 out 记 warning', warningsOf(closedImplementsOut).length, 1)
  check('终态包 Implements 点标 out 不记 error', errorsOf(closedImplementsOut).length, 0)

  const closedNoSectionDir = buildCase('fail-closed-no-section', {
    change: missingSectionBody(['- 状态：已关闭（2026-11-20 归档）']),
  })
  const closedNoSection = checkAll(closedNoSectionDir)
  check('终态包缺覆盖节仍记 error', errorsOf(closedNoSection).length, 1)
  check('终态包缺覆盖节不因状态降为 warning', warningsOf(closedNoSection).length, 0)

  // 无功能点的声明形态：括号里有理由放过并记 1 条 notice，没有理由记 error。
  const noPointTree = treeFixture('—')
  const noPointRows = []
  const noPointReasonDir = buildCase('pass-no-point-reason', {
    change: coverageFixture(noPointRows, [], { scopeText: '无功能点（流程与框架变更）', implements: 'N/A' }),
    tree: noPointTree,
  })
  const noPointReason = checkPackage(noPointReasonDir, 'CHG-GATE-001')
  check('无功能点带理由不记 error', errorsOf(noPointReason).length, 0)
  check('无功能点带理由记 1 条 notice', noticesOf(noPointReason).length, 1)

  const noPointNoReasonDir = buildCase('fail-no-point-no-reason', {
    change: coverageFixture(noPointRows, [], { scopeText: '无功能点', implements: 'N/A' }),
    tree: noPointTree,
  })
  check('无功能点没写理由记 error', count(checkPackage(noPointNoReasonDir, 'CHG-GATE-001'), /括号里没有理由/), 1)

  check('合法样例退出码', exitCodeOf(pass), 0)
  check('partial 样例退出码', exitCodeOf(partial), 1)

  // 零检查回归：没有任何覆盖表行、也没有无功能点声明时，旧实现会因 0 error 判 PASS；
  // 现在必须走 isPass 判红并给出“零检查不得判 PASS”。
  const zero = render([], { rows: 0, declarations: 0 })
  check('零检查退出码非 0', zero.pass ? 0 : 1, 1)
  checkTrue('零检查输出判红行', zero.text.includes('零检查不得判 PASS'), zero.text.split('\n').pop())
  const noPointZero = render([], { rows: 0, declarations: 1 })
  check('无功能点声明计 1 项检查', noPointZero.checks, 1)
  checkTrue('无功能点声明可判 PASS', noPointZero.pass, noPointZero.text.split('\n').pop())
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

// 本脚本覆盖的 v2 规则位（GATES.md 表 2-1 指派），供 check-rule-fields.mjs 双向核对。
const RULES = ['MXV2-7-22'];

// 既有脚本的 --rule 是整册口径：参数被接受并校验归属，检查仍跑全套（覆盖面大于单条）。
const __ruleIndex = process.argv.indexOf('--rule');
if (__ruleIndex >= 0) {
  const __ruleId = process.argv[__ruleIndex + 1];
  if (!__ruleId || !RULES.includes(__ruleId)) {
    console.error(`check-fp-coverage.mjs: 不覆盖规则 ${__ruleId ?? ''}；覆盖 ${RULES.join(', ')}`);
    process.exit(2);
  }
  process.argv.splice(__ruleIndex, 2);
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
  console.log(JSON.stringify({ gate: 'fp-coverage', checks: output.checks, rows: result.rows, declarations: result.declarations ?? 0, warnings: output.warnings, notices: output.notices, errors: output.errors, pass: output.pass, points: result.points ?? [], records: result.records }, null, 2))
} else {
  console.log(output.text)
}
process.exit(output.pass ? 0 : 1)



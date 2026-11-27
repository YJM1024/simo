#!/usr/bin/env node
/**
 * 规则级命令已移交 ai-review（MOXIAN 对应执行行注明“该脚本为批处理入口，不支持单跑”）；
 * 本脚本作为整套门禁运行，不再解析 --rule。
 * check-gates.mjs — 墨线结构门禁（零依赖，只读真实仓库；自检只写 .tmp 夹具）
 *
 * 依据：docs/framework/GATES.md 第 3.1 节 MX-G-08 至 MX-G-13，字段来源：
 *   docs/framework/templates/change.md         变更包十节字段
 *   docs/framework/templates/task-card.md      派单卡字段
 *   docs/process/templates/{spec,tasks,test-plan,evidence}.md 存量模板字段
 *
 * 六条规则：
 *   MX-G-08 包文件：spec.md / tasks.md 必须存在；变更级要求 test-plan.md 与
 *           evidence.md；--stage pre 时后两者缺失降为 warn。空文件按缺失计。
 *   MX-G-09 首部字段：状态、Implements、Covers、Change、变更类型、Owner 必须非空；
 *           状态取七值，存量 draft/partial/blocked/accepted 记 warn；
 *           变更类型取 TASK-MATRIX 八类，旧分类词（增量型/建域型）记 warn；
 *           Covers 编号对新包要求三段式 AC-<域>-<子域>-<序号>，对 CHG-LEGACY-*
 *           与归档包同时接受两段式 AC-<域>-<序号>；历史验收项编号已冻结，改名
 *           等于改冻结 AC，补编号等于伪造，故只对历史包放宽，避免掩盖新包问题；
 *           change.md 十节模板的 变更号/标题/负责人/判级/创建日期/关闭日期 对
 *           旧格式包记 warn，对十节格式包记 error。
 *   MX-G-10 必填节：旧格式按 GATES 与 docs/process/templates/spec.md 的八节，
 *           十节格式按 docs/framework/templates/change.md 的十节；节存在但正文为空
 *           按缺失计，N/A：<理由> 理由不少于 8 个字符时视为有内容。
 *           Covers 每条 AC 的定义块内须有 scripts/ac/ 或 人工:，否则记 error。
 *           十节格式的 §5 五列契约索引、§6 任务卡清单、§7 证据索引须有数据行。
 *   MX-G-11 任务表列：旧格式要求 卡/任务/owner/scope/依赖/AC/证据/状态 八列，
 *           十节格式要求 卡号/owner/scope/AC/证据/推理档位/状态 七列；缺列或
 *           已有列的空单元格记 error。列名忽略括号注释、反引号与大小写。
 *   MX-G-12 任务卡字段：每行须有 owner、scope、AC、证据、依赖、评审人、禁止项；
 *           评审人与 owner 相同记 error。tasks/ 或 cards/ 下的单卡文件按
 *           task-card.md 的十五个基本信息字段与三节（步骤、完成判据、交接）核对。
 *   MX-G-13 模板列（warn）：test-plan.md 的 Covers 与 AC 映射表列；evidence.md
 *           的结论行与 AC 证据表列。
 *
 * 输出：
 *   每项一行 `[GATE-STRUCT] <path>:<line> <规则> PASS|FAIL <检查项> 期望=<...> 实际=<...>`
 *   失败细节另起一行，格式按 GATES.md：
 *   `[GATE-STRUCT] <path>:<line> MX-G-NN <事实>；<修复动作>`
 *   末两行分别是 `FAILED: <e> error(s), <w> warning(s)`（或 `PASS (gate: struct, ...)`）
 *   与 `N passed, M failed`。结构门禁之后以独立进程跑子门禁（两项：
 *   scripts/check-fp-coverage.mjs（MX-G-71）与 scripts/check-evidence.mjs（MX-G-38 至
 *   MX-G-43、MX-G-47、MX-G-51），各 120 秒超时，仅 --stage change 运行），
 *   子门禁原始输出照印，另补 `[GATE-SUB] <name> PASS|FAILED` 与 `[GATE-SUMMARY]` 合计行。
 *   子门禁的 error 与 warning 分别计入总 error 与总 warning；超时按失败记，spawn 失败
 *   记 1 error 并把退出码置 2。
 *   退出码 0 无 error，1 有 error，2 参数、根目录或子门禁参数/环境错误。
 *
 * 用法：
 *   node scripts/check-gates.mjs                    # 扫描 specs/changes/ 与子门禁
 *   node scripts/check-gates.mjs --root <dir>       # 指定仓库根
 *   node scripts/check-gates.mjs --change <CHG-ID>  # 只查一个变更包
 *   node scripts/check-gates.mjs --stage pre|point|exit|change # 开工前/点级/出口/变更级（默认 change）
 *   node scripts/check-gates.mjs --template auto|framework|legacy  按包结构选模板或强制十节/旧八节
 *   node scripts/check-gates.mjs --json             # 机器可读，含 subGates 与 summary
 *   node scripts/check-gates.mjs --self-test        # 夹具自检，跑完清理
 *   node scripts/check-gates.mjs --help
 *
 * 存量包口径：目录名以 CHG-LEGACY- 开头，或状态含 historical/archived/归档 的包，
 * error 降为 warn，仍逐条输出，不因存量而把整道门禁降级。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const GATE = 'STRUCT'
// 子门禁：与结构门禁同形，独立进程、固定超时、退出码透传，结果一并进汇总。
// 每项跑 `node <script> --root <root> [--change <ID>] [--json]`，子脚本自己打印
// PASS/FAILED 行；这里再补一行 `[GATE-SUB] <name> PASS|FAILED` 与总汇总。
const SUB_GATES = [
  {
    name: 'rule-fields',
    script: 'check-rule-fields.mjs',
    title: '规则字段门禁（MXV2-6-01 至 6-11、6-17）',
    rules: ['MXV2-6-01', 'MXV2-6-02', 'MXV2-6-03', 'MXV2-6-07', 'MXV2-6-08', 'MXV2-6-10', 'MXV2-6-11', 'MXV2-6-17'],
    timeoutMs: 120_000,
    json: false,
  },
  {
    name: 'archive',
    script: 'check-archive.mjs',
    title: '归档与复盘门禁（MXV2-1-11、3-13、4-23、9-15）',
    rules: ['MXV2-1-11', 'MXV2-3-13', 'MXV2-4-23', 'MXV2-9-15'],
    timeoutMs: 120_000,
    json: false,
  },
  {
    name: 'points',
    script: 'check-points.mjs',
    title: '流程点链门禁（MXV2-2-02 至 9-03）',
    rules: ['MXV2-2-02', 'MXV2-2-04', 'MXV2-3-01', 'MXV2-3-09', 'MXV2-4-08', 'MXV2-4-10', 'MXV2-4-12', 'MXV2-4-14', 'MXV2-4-15', 'MXV2-5-02', 'MXV2-5-07', 'MXV2-6-16', 'MXV2-8-12', 'MXV2-9-03'],
    timeoutMs: 120_000,
    json: false,
  },
  {
    name: 'mapping',
    script: 'check-mapping.mjs',
    title: '编号映射与收口门禁（MXV2-1-01 至 5-10）',
    rules: ['MXV2-1-01', 'MXV2-2-03', 'MXV2-2-06', 'MXV2-4-01', 'MXV2-4-02', 'MXV2-4-05', 'MXV2-4-11', 'MXV2-4-22', 'MXV2-5-10'],
    timeoutMs: 120_000,
    json: false,
  },
  {
    name: 'fp-coverage',
    script: 'check-fp-coverage.mjs',
    title: '功能点覆盖门禁（MX-G-71）',
    timeoutMs: 120_000,
  },
  {
    name: 'evidence',
    script: 'check-evidence.mjs',
    title: '证据完整性门禁（MX-G-38 至 MX-G-43、MX-G-47、MX-G-51）',
    timeoutMs: 120_000,
    // check-evidence 的 --json 输出是证据项数组，没有 errors/warnings 汇总字段；
    // 传 --json 会让统计行消失，error 数只能按退出码兜底成 1。这里走文本输出，
    // 由 parseSubGateCounts 读末行 `FAILED: N error(s), M warning(s)`。
    json: false,
  },
  // 以下四道是出口级红门禁：--stage exit（含 change 别名）必须一起汇总，
  // 否则 exit 的“零错误”只覆盖七项，红门禁被漏在外面，等于假绿。
  // 它们统一走文本输出：trace 的 --json 不存在，docs/contract/matrix 的
  // 统计行在文本末行，由 parseSubGateCounts 读取。
  {
    name: 'trace',
    script: 'check-trace.mjs',
    title: '追溯门禁（MXV2-1-06、2-05、4-04、7-02、7-05）',
    rules: ['MXV2-1-06', 'MXV2-2-05', 'MXV2-4-04', 'MXV2-7-02', 'MXV2-7-05'],
    timeoutMs: 240_000,
    json: false,
    exitOnly: true,
  },
  {
    name: 'docs',
    script: 'check-docs.mjs',
    title: '框架文档门禁（MXV2-1-09、3-15）',
    rules: ['MXV2-1-09', 'MXV2-3-15'],
    timeoutMs: 120_000,
    json: false,
    change: false,
    exitOnly: true,
  },
  {
    name: 'contract',
    script: 'check-contract.mjs',
    title: '契约门禁（MXV2-5-11 至 5-17、7-07）',
    rules: ['MXV2-5-11', 'MXV2-5-12', 'MXV2-5-13', 'MXV2-5-14', 'MXV2-5-15', 'MXV2-5-16', 'MXV2-5-17', 'MXV2-7-07'],
    timeoutMs: 180_000,
    json: false,
    change: false,
    exitOnly: true,
  },
  {
    name: 'matrix',
    script: 'check-matrix-coverage.mjs',
    title: '任务矩阵覆盖门禁（MXV2-4-03、5-01、5-03、5-04、8-15）',
    rules: ['MXV2-4-03', 'MXV2-5-01', 'MXV2-5-03', 'MXV2-5-04', 'MXV2-8-15'],
    timeoutMs: 120_000,
    json: false,
    change: false,
    exitOnly: true,
  },
]
// AC 编号有两种历史形态：新包用三段式 AC-<域>-<子域>-<序号>（如 AC-CONV-005-02），
// CHG-LEGACY-* 等历史包的冻结验收项用两段式 AC-<域>-<序号>（如 AC-P5-01）。
// 两段式编号随历史验收项冻结，改名等于改冻结 AC，补编号等于伪造，因此 MX-G-09 的
// Covers 校验对历史包同时接受两段式与三段式；新包仍只认三段式，避免放宽后把新包的
// 缺段编号当成合法。历史包判定沿用 isLegacyPackage：目录名以 CHG-LEGACY- 开头，
// 或首部状态含 historical/archived/归档。
const AC_RE = /AC-(?:[A-Z0-9]+-){2,}\d+/g
const AC_ONE_RE = /AC-(?:[A-Z0-9]+-){2,}\d+/
const AC_LEGACY_RE = /AC-(?:[A-Z0-9]+-){1,}\d+/g
const DATE_RE = /\b20\d{2}-\d{2}-\d{2}\b/
const NA_RE = /N\/A\s*[:：]\s*(?:([^：:，,。；;\s]+)\s*[:：]\s*)?(.{8,})/
const SEVEN_STATES = ['草稿', '进行中', '待验收', '已验收', '异常', '已回滚', '已关闭']
const MIGRATION_STATES = ['draft', 'partial', 'blocked', 'accepted']
const EIGHT_TYPES = ['新功能', '界面调整', '缺陷修复', '重构', '数据迁移', '性能优化', '安全修复', '纯文档']
const LEGACY_TYPES = ['增量型变更', '建域型变更', '修复型变更']
const LEGACY_SECTIONS = [
  { key: '目标', test: /目标|背景与目标|目标与背景/ },
  { key: '非目标', test: /非目标|未覆盖与明确不做|明确不做|范围与非目标/ },
  { key: '需求', test: /需求|需求编号表/ },
  { key: '验收', test: /验收|(?:^|\s)AC(?:\s|$)|验收标准/ },
  { key: '状态与错误边界', test: /状态.{0,6}错误|错误.{0,6}状态|状态[/与、]错误|边界/ },
  { key: '接口与数据', test: /接口|数据/ },
  { key: '待确认', test: /待确认|未决/ },
  { key: '链接', test: /链接|关联/ },
]
const FRAMEWORK_SECTIONS = [
  { key: '头部', test: /^头部/ },
  { key: '目标与背景', test: /^(?:目标与背景|背景与目标|目标)/ },
  { key: '范围与非目标', test: /^(?:范围与非目标|范围|非目标|未覆盖与明确不做)/ },
  { key: '影响面', test: /^(?:影响面|影响)/ },
  { key: '五列契约索引', test: /^(?:五列契约索引|契约索引|契约表)/ },
  { key: '任务卡清单', test: /^(?:任务卡清单|任务卡)/ },
  { key: '证据索引', test: /^(?:证据索引|证据)/ },
  { key: '风险与依赖', test: /^(?:风险与依赖|风险)/ },
  { key: '状态流转记录', test: /^(?:状态流转记录|状态流转|变更记录)/ },
  { key: '收口', test: /^(?:收口|关闭结论|验收与收口)/ },
]
const TASK_COLUMNS_LEGACY = [
  ['卡', ['卡', '卡号', 'id', '编号']],
  ['任务', ['任务', '内容']],
  ['owner', ['owner', '负责人']],
  ['scope', ['scope', '写作用域', '作用域', '允许修改']],
  ['依赖', ['依赖', '依赖前置卡', '前置卡']],
  ['AC', ['ac', '验收', '验收标准']],
  ['证据', ['证据', '证据要求']],
  ['状态', ['状态']],
]
const TASK_COLUMNS_FRAMEWORK = [
  ['卡号', ['卡号', '卡', 'id', '编号']],
  ['owner', ['owner', '负责人']],
  ['scope', ['scope', '写作用域', '作用域', '允许修改']],
  ['AC', ['ac', '验收', '验收标准']],
  ['证据', ['证据', '证据要求']],
  ['推理档位', ['推理档位', '档位']],
  ['状态', ['状态']],
]
const CARD_FIELDS = [
  '卡号', '所属变更', 'owner 角色', '执行人', 'Change', 'REQ', 'AC', 'CT',
  'scope 允许段', '禁止项', '验收标准', '证据', '推理档位', '步骤',
  '并行或串行', '省略项', '状态', '验收签字人',
]

class PreflightError extends Error {}

/* ----------------------------- 通用解析 ----------------------------- */

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function relPath(root, file) {
  return (relative(root, resolve(file)) || '.').split(sep).join('/')
}

function cleanInline(value) {
  return String(value ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripNumberPrefix(title) {
  return cleanInline(title)
    .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
    .replace(/[：:]\s*$/, '')
    .trim()
}

function splitLines(text) {
  return String(text ?? '').split(/\r?\n/)
}

function splitRow(line) {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map((cell) => cell.trim())
}

function collectSections(text) {
  const lines = splitLines(text)
  const sections = []
  let current = { title: '', line: 1, body: [], level: 0 }
  let inFence = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      current.body.push(line)
      continue
    }
    const heading = !inFence ? line.match(/^(#{1,6})\s+(.*)$/) : null
    if (heading) {
      sections.push(current)
      current = {
        title: stripNumberPrefix(heading[2]),
        line: index + 1,
        body: [],
        level: heading[1].length,
      }
      continue
    }
    current.body.push(line)
  }
  sections.push(current)
  return sections
}

function findSection(sections, test) {
  return sections.find((section) => section.title && test.test(section.title)) ?? null
}

function sectionHasContent(section) {
  if (!section) return false
  const meaningful = section.body.filter((line) => {
    const value = line.trim()
    if (!value) return false
    if (/^\|?[\s:|-]+\|?$/.test(value)) return false
    if (/^<!--/.test(value)) return false
    if (/^>?\s*$/.test(value)) return false
    return true
  })
  if (meaningful.length === 0) return false
  const joined = meaningful.join('\n')
  if (meaningful.length <= 2 && /N\/A\s*[:：]/.test(joined)) return NA_RE.test(joined)
  return true
}

function parseMarkdownTables(text) {
  const lines = splitLines(text)
  const tables = []
  let inFence = false
  let heading = ''
  let headingLine = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      heading = stripNumberPrefix(headingMatch[2])
      headingLine = index + 1
      continue
    }
    if (!/^\s*\|/.test(line)) continue
    if (index + 1 >= lines.length) continue
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1])) continue
    const headers = splitRow(line)
    const rows = []
    let cursor = index + 2
    for (; cursor < lines.length; cursor += 1) {
      if (!/^\s*\|/.test(lines[cursor])) break
      const cells = splitRow(lines[cursor])
      if (cells.every((cell) => !cleanInline(cell))) continue
      rows.push({ cells, line: cursor + 1 })
    }
    tables.push({ heading, headingLine, headers, rows, line: index + 1 })
    index = cursor - 1
  }
  return tables
}

function parseHeaderFields(text) {
  const lines = splitLines(text).slice(0, 80)
  const fields = new Map()
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].replace(/^\s*[-*]\s*/, '').trim()
    if (!raw || raw.startsWith('|') || raw.startsWith('>')) continue
    const match = raw.match(/^([^:：|]{1,24})\s*[:：]\s*(.+)$/)
    if (!match) continue
    const key = cleanInline(match[1])
    if (!key || fields.has(key)) continue
    fields.set(key, { value: match[2].trim(), line: index + 1 })
  }
  return fields
}

function headerValue(fields, ...names) {
  for (const name of names) {
    const hit = fields.get(name)
    if (hit) return hit
  }
  return null
}

function statusValue(value) {
  let result = cleanInline(value)
  result = result.split(/[（(]/)[0].trim()
  return result.replace(/[。；;，,]+$/, '').trim()
}

function normalizeColumn(header) {
  return cleanInline(header)
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function columnIndex(headers, aliases) {
  const normalized = headers.map(normalizeColumn)
  for (const alias of aliases) {
    const index = normalized.indexOf(alias.toLowerCase())
    if (index >= 0) return index
  }
  return -1
}

function looksEmptyCell(cell) {
  const value = cleanInline(cell)
  return !value || value === '—' || value === '-' || value === 'TBD'
}

function naReasonFor(text, label) {
  const lines = splitLines(text)
  for (const line of lines) {
    const match = line.match(NA_RE)
    if (!match) continue
    if (label && match[1] && !match[1].includes(label)) continue
    if (cleanInline(match[2]).length >= 8) return cleanInline(match[2])
  }
  return null
}

/* ----------------------------- 结果收集 ----------------------------- */

function createRun(root, options) {
  return {
    root,
    options,
    checks: [],
    findings: [],
    packages: 0,
  }
}

function addFinding(run, data) {
  const finding = {
    gate: GATE,
    rule: data.rule,
    severity: data.severity ?? 'error',
    path: data.path,
    line: data.line && data.line > 0 ? data.line : 1,
    item: data.item,
    ac: data.ac ?? '',
    expected: data.expected ?? '',
    actual: data.actual ?? '',
    hint: data.hint ?? '',
    message: data.message ?? data.actual ?? '',
  }
  run.findings.push(finding)
  return finding
}

function startCheck(run, rule, item, path, line, expected) {
  const check = {
    gate: GATE,
    rule,
    item,
    path,
    line: line && line > 0 ? line : 1,
    expected,
    actual: '',
    findings: [],
    errorCount: 0,
    warningCount: 0,
  }
  run.checks.push(check)
  return check
}

function finishCheck(check, run, actual) {
  const own = run.findings.filter((finding) => finding.check === check)
  check.errorCount = own.filter((finding) => finding.severity === 'error').length
  check.warningCount = own.filter((finding) => finding.severity === 'warning').length
  check.actual =
    check.errorCount === 0 && check.warningCount > 0
      ? `${actual}；${check.warningCount} 条 warn`
      : check.errorCount > 0 && check.warningCount > 0
        ? `${actual}；其中 ${check.warningCount} 条 warn`
        : actual
  return check
}

function record(check, run, finding) {
  const added = addFinding(run, finding)
  added.check = check
  check.findings.push(added)
  return added
}

/* ----------------------------- 规则实现 ----------------------------- */

function detectFramework(text) {
  const sections = collectSections(text)
  if (findSection(sections, /头部/)) return true
  return /变更号/.test(text) && /判级/.test(text) && /创建日期/.test(text)
}

function isLegacyPackage(pkgName, status) {
  if (/^CHG-LEGACY-/.test(pkgName)) return true
  return /historical|archived|归档|已归档/i.test(status ?? '')
}

function runMxG08(run, pkg) {
  const framework = pkg.framework
  const required = framework ? ['spec.md'] : ['spec.md', 'tasks.md']
  const optional = framework ? [] : ['test-plan.md', 'evidence.md']
  const check = startCheck(
    run,
    'MX-G-08',
    '包文件',
    pkg.dirRel,
    1,
    framework ? 'spec.md 存在且非空' : 'spec.md / tasks.md 存在且非空，变更级含 test-plan.md 与 evidence.md',
  )
  let missing = 0
  for (const name of required) {
    const path = join(pkg.dir, name)
    const text = isFile(path) ? readText(path) : null
    if (text === null || !text.trim()) {
      missing += 1
      record(check, run, {
        rule: 'MX-G-08',
        severity: pkg.legacy ? 'warning' : 'error',
        path: relPath(run.root, path),
        line: 1,
        item: '包文件',
        expected: `${name} 存在且非空`,
        actual: text === null ? '文件缺失' : '文件为空',
        hint: `补 ${name}；按 docs/framework/templates/change.md 与 docs/process/templates/ 对应模板填写`,
        message: `缺失文件 ${name}`,
      })
    }
  }
  for (const name of optional) {
    const path = join(pkg.dir, name)
    const text = isFile(path) ? readText(path) : null
    if (text === null || !text.trim()) {
      const severity = run.options.stage === 'pre' || pkg.legacy ? 'warning' : 'error'
      missing += 1
      record(check, run, {
        rule: 'MX-G-08',
        severity,
        path: relPath(run.root, path),
        line: 1,
        item: '包文件',
        expected: `${name} 存在且非空（变更级）`,
        actual: text === null ? '文件缺失' : '文件为空',
        hint: `补 ${name}；开工前阶段可缺失，变更级必须存在`,
        message: `缺失文件 ${name}`,
      })
    }
  }
  return finishCheck(check, run, missing === 0 ? '齐全' : `缺 ${missing} 个文件`)
}

function runMxG09(run, pkg) {
  const check = startCheck(
    run,
    'MX-G-09',
    '首部字段',
    pkg.specRel,
    1,
    '状态 / Implements / Covers / Change / 变更类型 / Owner 非空且取值合法',
  )
  const fields = parseHeaderFields(pkg.specText)
  const checks = [
    ['状态', ['状态', 'Status']],
    ['Implements', ['Implements']],
    ['Covers', ['Covers']],
    ['Change', ['Change']],
    ['变更类型', ['变更类型']],
    ['Owner', ['Owner', '负责人']],
  ]
  let problems = 0
  for (const [label, names] of checks) {
    const hit = headerValue(fields, ...names)
    if (!hit || cleanInline(hit.value).length === 0) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-09',
        severity: pkg.legacy ? 'warning' : 'error',
        path: pkg.specRel,
        line: hit?.line ?? 1,
        item: '首部字段',
        expected: `${label} 非空`,
        actual: '缺失',
        hint: `按 docs/framework/templates/change.md 第 1 节补一行 ${label}`,
        message: `缺少字段 ${label}`,
      })
      continue
    }
    if (label === '状态') {
      const value = statusValue(hit.value)
      if (SEVEN_STATES.includes(value)) {
        // 合法七值
      } else if (MIGRATION_STATES.includes(value)) {
        problems += 1
        record(check, run, {
          rule: 'MX-G-09',
          severity: 'warning',
          path: pkg.specRel,
          line: hit.line,
          item: '首部字段',
          expected: `状态取 ${SEVEN_STATES.join('/')}`,
          actual: `迁移值 ${value}`,
          hint: '按 SDD-STANDARD 第 3.3 节改写为七值之一；迁移截止点待 Lead 裁决',
          message: `状态取值 ${value} 为迁移值`,
        })
      } else {
        problems += 1
        record(check, run, {
          rule: 'MX-G-09',
          severity: pkg.legacy ? 'warning' : 'error',
          path: pkg.specRel,
          line: hit.line,
          item: '首部字段',
          expected: `状态取 ${SEVEN_STATES.join('/')}`,
          actual: `非法值 ${value}`,
          hint: '按 SDD-STANDARD 第 3.3 节改为七值之一',
          message: `状态取值非法：${value}`,
        })
      }
    }
    if (label === 'Covers') {
      // 历史包允许两段式，新包只认三段式；两种形态见文件头部 AC 编号注释与
      // AC_LEGACY_RE 定义处的判定理由。
      const idRe = pkg.legacy ? AC_LEGACY_RE : AC_RE
      const ids = cleanInline(hit.value).match(idRe) ?? []
      if (ids.length === 0) {
        problems += 1
        record(check, run, {
          rule: 'MX-G-09',
          severity: pkg.legacy ? 'warning' : 'error',
          path: pkg.specRel,
          line: hit.line,
          item: '首部字段',
          expected: pkg.legacy
            ? 'Covers 至少含 1 个 AC 编号（历史包允许两段式，新包必须三段式）'
            : 'Covers 至少含 1 个 AC 编号（三段式）',
          actual: cleanInline(hit.value).slice(0, 60) || '空',
          hint: pkg.legacy
            ? '按 AC-(?:[A-Z0-9]+-){1,}\\d+（两段式）或 AC-(?:[A-Z0-9]+-){2,}\\d+（三段式）格式补编号'
            : '按 AC-(?:[A-Z0-9]+-){2,}\\d+ 三段式格式补编号',
          message: 'Covers 无合法 AC 编号',
        })
      }
    }
    if (label === 'Implements') {
      const value = cleanInline(hit.value)
      if (/^N\/A/.test(value) && !NA_RE.test(value)) {
        problems += 1
        record(check, run, {
          rule: 'MX-G-09',
          severity: pkg.legacy ? 'warning' : 'error',
          path: pkg.specRel,
          line: hit.line,
          item: '首部字段',
          expected: 'N/A 后写不少于 8 个字符的理由',
          actual: value,
          hint: '补理由，或填 PRD 编号',
          message: 'Implements 的 N/A 理由不足',
        })
      }
    }
    if (label === 'Change') {
      const value = cleanInline(hit.value)
      if (value && value !== pkg.name && !value.includes(pkg.name)) {
        problems += 1
        record(check, run, {
          rule: 'MX-G-09',
          severity: 'warning',
          path: pkg.specRel,
          line: hit.line,
          item: '首部字段',
          expected: `Change 与目录名 ${pkg.name} 一致`,
          actual: value,
          hint: '统一变更号，或修正目录名',
          message: 'Change 与目录名不一致',
        })
      }
    }
    if (label === '变更类型') {
      const value = statusValue(hit.value)
      if (!EIGHT_TYPES.includes(value)) {
        const legacy = LEGACY_TYPES.includes(value)
        problems += 1
        record(check, run, {
          rule: 'MX-G-09',
          severity: legacy ? 'warning' : pkg.legacy ? 'warning' : 'error',
          path: pkg.specRel,
          line: hit.line,
          item: '首部字段',
          expected: `变更类型取 ${EIGHT_TYPES.join('/')}`,
          actual: `非法值 ${value}`,
          hint: '按 TASK-MATRIX 第 1 节八类改写；旧分类词先映射再写',
          message: `变更类型非法：${value}`,
        })
      }
    }
  }

  // change.md 十节模板的头部字段：十节格式按 error，旧格式按 warn 提示迁移。
  const templateFields = [
    ['变更号', ['变更号', 'Change'], (value) => value.includes(pkg.name) || value === pkg.name],
    ['标题', ['标题'], (value) => cleanInline(value).length >= 2],
    ['负责人', ['负责人', 'Owner'], (value) => cleanInline(value).length >= 1],
    ['判级', ['判级'], (value) => /^(点级|变更级|建域级)$/.test(statusValue(value))],
    ['创建日期', ['创建日期', '日期'], (value) => DATE_RE.test(value)],
    ['关闭日期', ['关闭日期'], (value) => DATE_RE.test(value) || (value.includes('N/A') && NA_RE.test(value))],
  ]
  const titleLine = splitLines(pkg.specText).find((line) => /^#\s+/.test(line)) ?? ''
  for (const [label, names, valid] of templateFields) {
    const hit = headerValue(fields, ...names)
    let value = hit ? cleanInline(hit.value) : ''
    if (label === '标题' && !value) value = cleanInline(titleLine.replace(/^#\s+/, ''))
    const ok = value && valid(value)
    if (ok) continue
    problems += 1
    record(check, run, {
      rule: 'MX-G-09',
      severity: pkg.framework ? 'error' : 'warning',
      path: pkg.specRel,
      line: hit?.line ?? 1,
      item: '十节模板头部',
      expected: `${label} 存在且合法`,
      actual: value ? `非法值 ${value}` : '缺失',
      hint: `按 docs/framework/templates/change.md 第 1 节补 ${label}`,
      message: `十节模板头部缺 ${label}`,
    })
  }

  return finishCheck(check, run, problems === 0 ? '齐全且合法' : `${problems} 项缺失或非法`)
}

function runMxG10(run, pkg) {
  const check = startCheck(
    run,
    'MX-G-10',
    '必填节与 AC 判据',
    pkg.specRel,
    1,
    pkg.framework ? '十节齐全且非空，每条 AC 有脚本或人工判据' : '八节齐全且非空，每条 AC 有脚本或人工判据',
  )
  const sections = collectSections(pkg.specText)
  const wanted = pkg.framework ? FRAMEWORK_SECTIONS : LEGACY_SECTIONS
  let problems = 0
  for (const entry of wanted) {
    let section = findSection(sections, entry.test)
    if (!section && entry.key === '链接') {
      const lines = splitLines(pkg.specText)
      const lineIndex = lines.findIndex((line) => /^>?\s*(?:关联|链接)\s*[:：]\s*\S/.test(line.trim()))
      if (lineIndex >= 0) {
        section = { title: entry.key, line: lineIndex + 1, body: [lines[lineIndex]], level: 2 }
      }
    }
    if (!section) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: pkg.legacy ? 'warning' : 'error',
        path: pkg.specRel,
        line: 1,
        item: '必填节',
        expected: `存在「${entry.key}」节且非空`,
        actual: '节缺失',
        hint: pkg.framework
          ? `按 docs/framework/templates/change.md 补「${entry.key}」一节`
          : `补「${entry.key}」一节；模板见 docs/process/templates/spec.md 与 docs/framework/templates/change.md`,
        message: `缺少节 ${entry.key}`,
      })
      continue
    }
    if (!sectionHasContent(section)) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: pkg.legacy ? 'warning' : 'error',
        path: pkg.specRel,
        line: section.line,
        item: '必填节',
        expected: `「${entry.key}」节有正文或 N/A：<理由>`,
        actual: '节为空',
        hint: `补「${entry.key}」的正文；不适用时写 N/A：<不少于 8 个字符的理由>`,
        message: `节为空 ${entry.key}`,
      })
    }
  }

  // 十节格式的结构化小节要求数据行或字段行。
  if (pkg.framework) {
    const tables = parseMarkdownTables(pkg.specText)
    const contractIndex = tables.find((table) => /五列契约索引|契约索引/.test(table.heading))
    if (contractIndex && contractIndex.rows.length === 0) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'error',
        path: pkg.specRel,
        line: contractIndex.line,
        item: '五列契约索引',
        expected: '契约表与五列各 1 行',
        actual: '0 行',
        hint: '按 contract-table.md 登记契约表路径与五列冻结版本',
        message: '五列契约索引为空',
      })
    }
    const taskTable = tables.find((table) => /任务卡清单|任务卡/.test(table.heading))
    if (taskTable && taskTable.rows.length === 0) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'error',
        path: pkg.specRel,
        line: taskTable.line,
        item: '任务卡清单',
        expected: '至少 1 张卡',
        actual: '0 行',
        hint: '按 task-card.md 填卡号、owner、scope、AC、证据、推理档位与状态',
        message: '任务卡清单为空',
      })
    }
    const evidenceTable = tables.find((table) => /证据索引/.test(table.heading))
    if (evidenceTable && evidenceTable.rows.length === 0) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'error',
        path: pkg.specRel,
        line: evidenceTable.line,
        item: '证据索引',
        expected: '至少 1 行证据',
        actual: '0 行',
        hint: '按 evidence-index.md 填类型、路径、对应 AC 与复跑命令',
        message: '证据索引为空',
      })
    }
  }

  // 旧格式包另报十节模板的迁移提示：新模板是单文件十节结构，存量多文件包
  // 未声明采用时不按 error 阻断，只把缺节逐条列成 warn，避免两套模板双重计错。
  if (!pkg.framework) {
    const frameworkChecks = [
      { key: '五列契约索引', test: /^(?:五列契约索引|契约索引|契约表)/ },
      { key: '状态流转记录', test: /^(?:状态流转记录|状态流转|变更记录)/ },
      { key: '收口', test: /^(?:收口|关闭结论|验收与收口)/ },
    ]
    for (const entry of frameworkChecks) {
      if (findSection(sections, entry.test)) continue
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'warning',
        path: pkg.specRel,
        line: 1,
        item: '十节模板节',
        expected: `十节模板含「${entry.key}」`,
        actual: '未采用十节模板，节缺失',
        hint: `按 docs/framework/templates/change.md 补「${entry.key}」；新包必须齐全`,
        message: `十节模板缺节 ${entry.key}`,
      })
    }
    const riskSection = findSection(sections, /^(?:风险与依赖|风险)/)
    if (!riskSection) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'warning',
        path: pkg.specRel,
        line: 1,
        item: '十节模板节',
        expected: '十节模板含「风险与依赖」',
        actual: '未采用十节模板，节缺失',
        hint: '按 docs/framework/templates/change.md 补「风险与依赖」',
        message: '十节模板缺节 风险与依赖',
      })
    } else if (!/^\s*(?:[-*]\s*)?依赖\s*[:：]|依赖前置卡|\|\s*依赖\s*\|/m.test([riskSection.title, ...riskSection.body].join('\n'))) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'warning',
        path: pkg.specRel,
        line: riskSection.line,
        item: '十节模板节',
        expected: '「风险与依赖」含依赖一项',
        actual: '只有风险，无依赖',
        hint: '补依赖的前置变更号、外部条件或未就绪项',
        message: '十节模板缺 依赖',
      })
    }
    if (!isFile(join(pkg.dir, 'tasks.md'))) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'warning',
        path: pkg.specRel,
        line: 1,
        item: '十节模板节',
        expected: '十节模板含「任务卡清单」',
        actual: '无 tasks.md，也无卡清单节',
        hint: '按 docs/framework/templates/change.md 第 6 节补任务卡清单',
        message: '十节模板缺 任务卡清单',
      })
    }
    if (!isFile(join(pkg.dir, 'evidence.md'))) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: 'warning',
        path: pkg.specRel,
        line: 1,
        item: '十节模板节',
        expected: '十节模板含「证据索引」',
        actual: '无 evidence.md，也无证据索引节',
        hint: '按 docs/framework/templates/change.md 第 7 节补证据索引',
        message: '十节模板缺 证据索引',
      })
    }
  }

  // 每条 Covers AC 必须在定义处或映射处有脚本路径或人工判据。
  const covers = (headerValue(parseHeaderFields(pkg.specText), 'Covers')?.value.match(AC_RE) ?? [])
  const acceptance = findSection(sections, /验收|(?:^|\s)AC(?:\s|$)|验收标准/)
  const acceptanceText = acceptance
    ? [acceptance.title, ...acceptance.body].join('\n')
    : pkg.specText
  const specLines = splitLines(pkg.specText)
  for (const ac of covers) {
    const candidateLines = specLines
      .map((line, index) => (line.includes(ac) && !/^\s*Covers\s*[:：]/.test(line.trim()) ? index : -1))
      .filter((index) => index >= 0)
    let hitLine = -1
    let candidate = ''
    for (const index of candidateLines) {
      const nearby = specLines.slice(index, index + 3).join('\n')
      if (nearby.includes('scripts/ac/') || /人工\s*[:：]/.test(nearby) || NA_RE.test(nearby)) {
        hitLine = index
        candidate = nearby
        break
      }
    }
    const escaped = ac.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const blockRe = new RegExp(`(?:^|\\n)([^\\n]*${escaped}[^\\n]*(?:\\n(?:[^\\n]*))*?)(?=\\n#{1,6}\\s|\\nAC-(?:[A-Z0-9]+-){2,}\\d+|$)`, 'm')
    const acceptanceBlock = acceptanceText.match(blockRe)?.[1] ?? ''
    if (!candidate) candidate = acceptanceBlock
    const hasScript = candidate.includes('scripts/ac/')
    const hasManual = /人工\s*[:：]/.test(candidate)
    const hasNa = NA_RE.test(candidate)
    if (!hasScript && !hasManual && !hasNa) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-10',
        severity: pkg.legacy ? 'warning' : 'error',
        path: pkg.specRel,
        line: hitLine >= 0 ? hitLine + 1 : candidateLines[0] !== undefined ? candidateLines[0] + 1 : acceptance?.line ?? 1,
        item: 'AC 判据',
        ac,
        expected: `${ac} 的定义处或映射处含 scripts/ac/ 或 人工: 或 N/A：<理由>`,
        actual: '三者均无',
        hint: '补 scripts/ac/<AC-ID>.mjs，或写 人工:<动作> 与 N/A：<理由>',
        message: `${ac} 缺少可判定判据`,
      })
    }
  }

  return finishCheck(check, run, problems === 0 ? '齐全且非空' : `${problems} 处缺失`)
}

function findTasksTables(pkg) {
  const tables = parseMarkdownTables(pkg.tasksText ?? '')
  return tables.filter((table) => {
    const normalized = table.headers.map(normalizeColumn)
    let score = 0
    for (const aliases of [...TASK_COLUMNS_LEGACY, ...TASK_COLUMNS_FRAMEWORK]) {
      if (aliases[1].some((alias) => normalized.includes(alias.toLowerCase()))) score += 1
    }
    return score >= 6
  })
}

function runMxG11(run, pkg) {
  const check = startCheck(
    run,
    'MX-G-11',
    '任务表列',
    pkg.tasksRel ?? pkg.specRel,
    1,
    pkg.framework ? '任务表含 卡号/owner/scope/AC/证据/推理档位/状态 且单元格非空' : '任务表含 卡/任务/owner/scope/依赖/AC/证据/状态 且单元格非空',
  )
  const tables = findTasksTables(pkg)
  if (tables.length === 0) {
    record(check, run, {
      rule: 'MX-G-11',
      severity: pkg.legacy ? 'warning' : 'error',
      path: pkg.tasksRel ?? pkg.specRel,
      line: 1,
      item: '任务表',
      expected: '存在任务表',
      actual: '未找到任务表',
      hint: '按 docs/process/templates/tasks.md 建任务表，或把 §6 任务卡清单写成表',
      message: '缺少任务表',
    })
    return finishCheck(check, run, '缺少任务表')
  }
  const wanted = pkg.framework ? TASK_COLUMNS_FRAMEWORK : TASK_COLUMNS_LEGACY
  let problems = 0
  for (const [label, aliases] of wanted) {
    const present = tables.some((table) => columnIndex(table.headers, aliases) >= 0)
    if (present) continue
    problems += 1
    record(check, run, {
      rule: 'MX-G-11',
      severity: pkg.legacy ? 'warning' : 'error',
      path: pkg.tasksRel ?? pkg.specRel,
      line: tables[0].line,
      item: '任务表列',
      expected: `含列 ${label}`,
      actual: `缺列；现有列 ${tables[0].headers.map(cleanInline).join('、')}`,
      hint: `补列 ${label}，按 docs/process/templates/tasks.md 与 docs/framework/templates/task-card.md`,
      message: `任务表缺列 ${label}`,
    })
  }
  for (const table of tables) {
    for (const row of table.rows) {
      for (const [label, aliases] of wanted) {
        const index = columnIndex(table.headers, aliases)
        if (index < 0 || !looksEmptyCell(row.cells[index])) continue
        problems += 1
        record(check, run, {
          rule: 'MX-G-11',
          severity: pkg.legacy ? 'warning' : 'error',
          path: pkg.tasksRel ?? pkg.specRel,
          line: row.line,
          item: '任务表单元格',
          expected: `${label} 非空`,
          actual: '空',
          hint: `补第 ${label} 列内容`,
          message: `任务表第 ${row.line} 行 ${label} 为空`,
        })
      }
    }
  }
  return finishCheck(check, run, problems === 0 ? '列齐全且非空' : `${problems} 处缺列或空单元格`)
}

function runMxG12(run, pkg) {
  const check = startCheck(
    run,
    'MX-G-12',
    '任务卡字段',
    pkg.tasksRel ?? pkg.specRel,
    1,
    '每张卡 owner/scope/AC/证据/依赖/评审人/禁止项齐全，评审人≠owner',
  )
  const tables = findTasksTables(pkg)
  let problems = 0
  if (tables.length === 0) {
    const hasCards = ['tasks', 'cards'].some((directory) => {
      const dir = join(pkg.dir, directory)
      return isDir(dir) && readdirSync(dir).some((name) => name.endsWith('.md'))
    })
    if (!hasCards) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-12',
        severity: pkg.legacy ? 'warning' : 'error',
        path: pkg.tasksRel ?? pkg.specRel,
        line: 1,
        item: '任务卡字段',
        expected: '存在任务表或 tasks/cards 下的单卡文件',
        actual: '两者都没有',
        hint: '按 docs/framework/templates/task-card.md 补单卡，或在 tasks.md 建任务表',
        message: '缺少任务表或单卡文件',
      })
    }
  }
  if (tables.length > 0) {
    const text = splitLines(pkg.tasksText ?? '').join('\n')
    const hasColumn = (aliases) => tables.some((table) => columnIndex(table.headers, aliases) >= 0)
    const reviewerPresent = hasColumn(['评审人', '验收签字人'])
    const forbiddenPresent = hasColumn(['禁止项', '禁止修改'])
    for (const table of tables) {
      const ownerIndex = columnIndex(table.headers, ['owner', '负责人'])
      const scopeIndex = columnIndex(table.headers, ['scope', '写作用域', '作用域'])
      const acIndex = columnIndex(table.headers, ['ac', '验收'])
      const evidenceIndex = columnIndex(table.headers, ['证据', '证据要求'])
      const dependencyIndex = columnIndex(table.headers, ['依赖', '依赖前置卡', '前置卡'])
      const reviewerIndex = columnIndex(table.headers, ['评审人', '验收签字人'])
      const forbiddenIndex = columnIndex(table.headers, ['禁止项', '禁止修改'])
      for (const row of table.rows) {
        const card = cleanInline(row.cells[0]) || `第 ${row.line} 行`
        const pairs = [
          ['owner', ownerIndex],
          ['scope', scopeIndex],
          ['AC', acIndex],
          ['证据', evidenceIndex],
        ]
        for (const [label, index] of pairs) {
          if (index >= 0 && looksEmptyCell(row.cells[index])) {
            problems += 1
            record(check, run, {
              rule: 'MX-G-12',
              severity: pkg.legacy ? 'warning' : 'error',
              path: pkg.tasksRel ?? pkg.specRel,
              line: row.line,
              item: '任务卡字段',
              expected: `${card} 有 ${label}`,
              actual: '空',
              hint: `按 task-card.md 补 ${label}`,
              message: `${card} 缺 ${label}`,
            })
          }
        }
        if (dependencyIndex >= 0 && looksEmptyCell(row.cells[dependencyIndex])) {
          problems += 1
          record(check, run, {
            rule: 'MX-G-12',
            severity: pkg.legacy ? 'warning' : 'error',
            path: pkg.tasksRel ?? pkg.specRel,
            line: row.line,
            item: '任务卡字段',
            expected: `${card} 有依赖前置卡`,
            actual: '空',
            hint: '没有前置卡时写「无」',
            message: `${card} 缺依赖`,
          })
        }
        if (reviewerIndex >= 0) {
          const owner = cleanInline(row.cells[ownerIndex] ?? '')
          const reviewer = cleanInline(row.cells[reviewerIndex] ?? '')
          if (!reviewer) {
            problems += 1
            record(check, run, {
              rule: 'MX-G-12',
              severity: pkg.legacy ? 'warning' : 'error',
              path: pkg.tasksRel ?? pkg.specRel,
              line: row.line,
              item: '任务卡字段',
              expected: `${card} 有独立评审人`,
              actual: '空',
              hint: '派单时写验收 Agent 或用户，不得留到验收前再指定',
              message: `${card} 缺评审人`,
            })
          } else if (owner && reviewer === owner) {
            problems += 1
            record(check, run, {
              rule: 'MX-G-12',
              severity: pkg.legacy ? 'warning' : 'error',
              path: pkg.tasksRel ?? pkg.specRel,
              line: row.line,
              item: '任务卡字段',
              expected: `${card} 评审人≠owner`,
              actual: `评审人与 owner 都是 ${owner}`,
              hint: '另派独立验收人，实现者不得自签',
              message: `${card} 评审人与 owner 重合`,
            })
          }
        }
        if (forbiddenIndex >= 0 && looksEmptyCell(row.cells[forbiddenIndex])) {
          problems += 1
          record(check, run, {
            rule: 'MX-G-12',
            severity: pkg.legacy ? 'warning' : 'error',
            path: pkg.tasksRel ?? pkg.specRel,
            line: row.line,
            item: '任务卡字段',
            expected: `${card} 有禁止项`,
            actual: '空',
            hint: '至少写一条可判定的禁止路径或命令',
            message: `${card} 缺禁止项`,
          })
        }
      }
    }
    if (!reviewerPresent && !/评审人|验收签字人/.test(text)) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-12',
        severity: pkg.legacy ? 'warning' : 'error',
        path: pkg.tasksRel ?? pkg.specRel,
        line: tables[0].line,
        item: '任务卡字段',
        expected: '任务表含评审人列，或每张卡写评审人',
        actual: '缺列；任务表所有卡无法核对评审人',
        hint: '补评审人列；评审人须与 owner 不同',
        message: '任务表缺评审人列',
      })
    }
    if (!forbiddenPresent && !/禁止项|禁止修改/.test(text)) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-12',
        severity: pkg.legacy ? 'warning' : 'error',
        path: pkg.tasksRel ?? pkg.specRel,
        line: tables[0].line,
        item: '任务卡字段',
        expected: '任务表含禁止项列，或每张卡写禁止项',
        actual: '缺列；任务表所有卡无法核对禁止项',
        hint: '补禁止项列；每条写具体路径、命令或动作',
        message: '任务表缺禁止项列',
      })
    }
  }

  // 单卡文件：tasks/ 或 cards/ 下的 *.md 按 task-card.md 字段核对。
  for (const directory of ['tasks', 'cards']) {
    const dir = join(pkg.dir, directory)
    if (!isDir(dir)) continue
    const files = readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
    for (const name of files) {
      const path = join(dir, name)
      const text = readText(path) ?? ''
      for (const field of CARD_FIELDS) {
        const pattern = new RegExp(`${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：|]`)
        if (!pattern.test(text)) {
          problems += 1
          record(check, run, {
            rule: 'MX-G-12',
            severity: pkg.legacy ? 'warning' : 'error',
            path: relPath(run.root, path),
            line: 1,
            item: '单卡字段',
            expected: `含 ${field}`,
            actual: '缺失',
            hint: `按 docs/framework/templates/task-card.md 补 ${field}`,
            message: `单卡缺 ${field}`,
          })
        }
      }
      for (const section of ['步骤', '完成判据', '交接']) {
        if (!new RegExp(`^#{1,6}\\s+.*${section}`, 'm').test(text)) {
          problems += 1
          record(check, run, {
            rule: 'MX-G-12',
            severity: pkg.legacy ? 'warning' : 'error',
            path: relPath(run.root, path),
            line: 1,
            item: '单卡节',
            expected: `含「${section}」节`,
            actual: '缺失',
            hint: `按 docs/framework/templates/task-card.md 补「${section}」一节`,
            message: `单卡缺节 ${section}`,
          })
        }
      }
    }
  }

  return finishCheck(check, run, problems === 0 ? '字段齐全' : `${problems} 处缺失或重合`)
}

function runMxG13(run, pkg) {
  const path = join(pkg.dir, 'test-plan.md')
  const check = startCheck(
    run,
    'MX-G-13',
    '模板列',
    relPath(run.root, path),
    1,
    'test-plan 含 Covers 与 AC 映射列；evidence 含结论与 AC 证据列',
  )
  let problems = 0
  if (isFile(path)) {
    const text = readText(path) ?? ''
    if (!/^Covers\s*[:：]/m.test(text)) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-13',
        severity: 'warning',
        path: relPath(run.root, path),
        line: 1,
        item: 'test-plan 模板列',
        expected: '含 Covers: 段',
        actual: '缺失',
        hint: '按 docs/process/templates/test-plan.md 补 Covers 段',
        message: 'test-plan 缺 Covers',
      })
    }
    const tables = parseMarkdownTables(text)
    const mapping = tables.find((table) => columnIndex(table.headers, ['ac', '验收']) >= 0)
    if (!mapping) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-13',
        severity: 'warning',
        path: relPath(run.root, path),
        line: 1,
        item: 'test-plan 模板列',
        expected: '含 AC 映射表',
        actual: '缺失',
        hint: '补 AC / 层 / 用例 / 期望 / 证据 五列',
        message: 'test-plan 缺 AC 映射表',
      })
    } else {
      for (const label of ['用例', '期望', '证据']) {
        if (columnIndex(mapping.headers, [label, label === '用例' ? '命令' : label, label === '用例' ? 'tc' : label]) < 0) {
          problems += 1
          record(check, run, {
            rule: 'MX-G-13',
            severity: 'warning',
            path: relPath(run.root, path),
            line: mapping.line,
            item: 'test-plan 模板列',
            expected: `映射表含 ${label} 列`,
            actual: `缺列；现有列 ${mapping.headers.map(cleanInline).join('、')}`,
            hint: '按 docs/process/templates/test-plan.md 补列',
            message: `test-plan 映射表缺列 ${label}`,
          })
        }
      }
    }
  }
  const evidencePath = join(pkg.dir, 'evidence.md')
  if (isFile(evidencePath)) {
    const text = readText(evidencePath) ?? ''
    if (!/结果\s*[:：]/.test(text)) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-13',
        severity: 'warning',
        path: relPath(run.root, evidencePath),
        line: 1,
        item: 'evidence 模板列',
        expected: '含 结果： 结论行',
        actual: '缺失',
        hint: '按 docs/process/templates/evidence.md 第 1 节补结论',
        message: 'evidence 缺结论行',
      })
    }
    const tables = parseMarkdownTables(text)
    const evidenceTable = tables.find((table) => columnIndex(table.headers, ['ac', '验收']) >= 0)
    if (!evidenceTable) {
      problems += 1
      record(check, run, {
        rule: 'MX-G-13',
        severity: 'warning',
        path: relPath(run.root, evidencePath),
        line: 1,
        item: 'evidence 模板列',
        expected: '含 AC 证据表',
        actual: '缺失',
        hint: '按 docs/framework/templates/evidence-index.md 补证据 ID/AC/类型/命令/路径/生成时间/结果/可复跑/轮次',
        message: 'evidence 缺 AC 证据表',
      })
    } else {
      for (const label of ['类型', '命令', '路径', '生成时间', '结果', '可复跑', '轮次']) {
        if (columnIndex(evidenceTable.headers, [label]) < 0) {
          problems += 1
          record(check, run, {
            rule: 'MX-G-13',
            severity: 'warning',
            path: relPath(run.root, evidencePath),
            line: evidenceTable.line,
            item: 'evidence 模板列',
            expected: `证据表含 ${label} 列`,
            actual: `缺列；现有列 ${evidenceTable.headers.map(cleanInline).join('、')}`,
            hint: '按 docs/framework/templates/evidence-index.md 补列',
            message: `evidence 证据表缺列 ${label}`,
          })
        }
      }
    }
  }
  return finishCheck(check, run, problems === 0 ? '模板列齐全' : `${problems} 处缺列`)
}

/* ----------------------------- 包扫描 ----------------------------- */

function readPackage(root, name, options) {
  const dir = join(root, 'specs', 'changes', name)
  if (!isDir(dir)) return null
  if (options.change && options.change !== name) return null
  const specPath = join(dir, 'spec.md')
  const specText = isFile(specPath) ? readText(specPath) : null
  if (specText === null) {
    return {
      name,
      dir,
      dirRel: relPath(root, dir),
      specRel: relPath(root, specPath),
      specText: '',
      tasksRel: relPath(root, join(dir, 'tasks.md')),
      tasksText: '',
      framework: false,
      legacy: /^CHG-LEGACY-/.test(name),
      status: '',
    }
  }
  const tasksPath = join(dir, 'tasks.md')
  const tasksText = isFile(tasksPath) ? readText(tasksPath) : ''
  const fields = parseHeaderFields(specText)
  const status = statusValue(headerValue(fields, '状态', 'Status')?.value ?? '')
  return {
    name,
    dir,
    dirRel: relPath(root, dir),
    specRel: relPath(root, specPath),
    specText,
    tasksRel: relPath(root, tasksPath),
    tasksText,
    framework:
      options.template === 'framework'
        ? true
        : options.template === 'legacy'
          ? false
          : detectFramework(specText),
    legacy: isLegacyPackage(name, status),
    status,
  }
}

function runStructure(root, options) {
  const run = createRun(root, options)
  const changesDir = join(root, 'specs', 'changes')
  if (!isDir(changesDir)) throw new PreflightError(`specs/changes 不可读：${changesDir}`)
  const names = readdirSync(changesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const name of names) {
    const pkg = readPackage(root, name, options)
    if (!pkg) continue
    run.packages += 1
    runMxG08(run, pkg)
    runMxG09(run, pkg)
    runMxG10(run, pkg)
    runMxG11(run, pkg)
    runMxG12(run, pkg)
    runMxG13(run, pkg)
  }
  return run
}

/* ----------------------------- 输出 ----------------------------- */

function checkStatus(check) {
  return check.errorCount > 0 ? 'FAIL' : 'PASS'
}

function printText(run) {
  for (const check of run.checks) {
    const status = checkStatus(check)
    console.log(
      `[GATE-${GATE}] ${check.path}:${check.line} ${check.rule} ${status} ${check.item} 期望=${check.expected} 实际=${check.actual}`,
    )
    for (const finding of check.findings) {
      if (finding.severity === 'error') {
        console.log(
          `[GATE-${GATE}] ${finding.path}:${finding.line} ${finding.rule} ${finding.message}；${finding.hint}`,
        )
      } else {
        console.log(
          `[GATE-${GATE}] ${finding.path}:${finding.line} ${finding.rule} WARN ${finding.message}；${finding.hint}`,
        )
      }
    }
  }
  const errors = run.findings.filter((finding) => finding.severity === 'error').length
  const warnings = run.findings.filter((finding) => finding.severity === 'warning').length
  const failed = run.checks.filter((check) => check.errorCount > 0).length
  const passed = run.checks.length - failed
  if (errors === 0) {
    console.log(`PASS (gate: struct, checks: ${run.checks.length}, warnings: ${warnings})`)
  } else {
    console.log(`FAILED: ${errors} error(s), ${warnings} warning(s)`)
  }
  console.log(`${passed} passed, ${failed} failed`)
}

function toJson(run) {
  const errors = run.findings.filter((finding) => finding.severity === 'error')
  const warnings = run.findings.filter((finding) => finding.severity === 'warning')
  const failed = run.checks.filter((check) => check.errorCount > 0).length
  return {
    gate: 'struct',
    root: run.root,
    packages: run.packages,
    ok: errors.length === 0,
    passed: run.checks.length - failed,
    failed,
    errors: errors.length,
    warnings: warnings.length,
    checks: run.checks.map((check) => ({
      rule: check.rule,
      item: check.item,
      path: check.path,
      line: check.line,
      status: checkStatus(check),
      expected: check.expected,
      actual: check.actual,
      errorCount: check.errorCount,
      warningCount: check.warningCount,
    })),
    findings: run.findings.map((finding) => ({
      gate: finding.gate,
      rule: finding.rule,
      severity: finding.severity,
      path: finding.path,
      line: finding.line,
      ac: finding.ac,
      item: finding.item,
      expected: finding.expected,
      actual: finding.actual,
      hint: finding.hint,
      message: finding.message,
    })),
  }
}

/* ----------------------------- 子门禁 ----------------------------- */

/** 从子门禁文本输出里取末行统计；取不到时按退出码兜底。 */
function parseSubGateCounts(stdout, exitCode) {
  const lines = String(stdout ?? '').trimEnd().split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    // `FAILED: N error(s), M warning(s)`（contract/matrix）、
    // `FAILED: N issue(s)`（trace）、`FAILED: N issue(s) (checks: N)`（docs）。
    const failed = line.match(/^FAILED:\s*(\d+)\s*(?:error|issue)\(s\)(?:,\s*(\d+)\s*warning\(s\))?/)
    if (failed) return { errors: Number(failed[1]), warnings: Number(failed[2] ?? 0) }
    // `PASS (checks: N)`（trace）、`PASS (gate: X, checks: N, warnings: M)`（contract/matrix）、
    // `PASS (checks: N, rule: X)`（check-docs/check-archive 等走 v2-rule-mode 的脚本）。
    const passed = line.match(/^PASS \((?:gate:[^,]+,\s*)?(?:checks:\s*\d+(?:,\s*)?)*(?:warnings:\s*(\d+))?(?:rule:[^)]+)?\)$/)
    if (passed) return { errors: 0, warnings: Number(passed[1] ?? 0) }
  }
  return { errors: exitCode === 0 ? 0 : 1, warnings: 0 }
}

function runSubGate(entry, options) {
  const args = [join(SCRIPT_DIR, entry.script), '--root', options.root]
  const withChange = Boolean(options.change) && entry.change !== false
  if (withChange) args.push('--change', options.change)
  if (options.json && entry.json !== false) args.push('--json')
  const command = `node ${entry.script}${withChange ? ` --change ${options.change}` : ''}`
  const startedAt = Date.now()
  let result
  try {
    result = spawnSync(process.execPath, args, {
      cwd: options.root,
      encoding: 'utf8',
      timeout: entry.timeoutMs,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    return {
      name: entry.name,
      title: entry.title,
      command,
      stdout: '',
      stderr: String(error?.message ?? error),
      exitCode: 2,
      timedOut: false,
      spawnError: true,
      durationMs: Date.now() - startedAt,
      errors: 1,
      warnings: 0,
      detail: null,
    }
  }
  const durationMs = Date.now() - startedAt
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const timedOut = result.error?.code === 'ETIMEDOUT'
  const exitCode = typeof result.status === 'number' ? result.status : timedOut ? 1 : 2
  let detail = null
  if (options.json && stdout.trim().startsWith('{')) {
    try {
      detail = JSON.parse(stdout)
    } catch {
      detail = null
    }
  }
  const counts = detail
    ? { errors: Number(detail.errors ?? 0), warnings: Number(detail.warnings ?? 0) }
    : parseSubGateCounts(stdout, exitCode)
  if (timedOut) counts.errors = Math.max(counts.errors, 1)
  return {
    name: entry.name,
    title: entry.title,
    command,
    stdout,
    stderr,
    exitCode,
    timedOut,
    spawnError: Boolean(result.error) && !timedOut,
    durationMs,
    errors: counts.errors,
    warnings: counts.warnings,
    detail,
  }
}

/** 按阶段取子门禁条目：pre 不跑；point 只跑点级项；exit（含 change）跑全部。 */
function selectSubGates(stage) {
  if (stage === 'pre') return []
  return SUB_GATES.filter((entry) => !entry.exitOnly || stage !== 'point')
}

function runSubGates(options) {
  // 子门禁都是变更级门禁（MX-G-71 在变更级验收前生效），开工前阶段不跑，避免新包在
  // 还没有覆盖表时被阻断；point 只跑点级七项，exit（含 change 别名）跑全部十一项。
  return selectSubGates(options.stage).map((entry) => runSubGate(entry, options))
}

function printSubGates(gates) {
  for (const gate of gates) {
    console.log(`[GATE-SUB] ${gate.name} ${gate.command} exit=${gate.exitCode} 用时 ${gate.durationMs} ms`)
    if (gate.stdout.trim()) console.log(gate.stdout.trimEnd())
    if (gate.stderr.trim()) console.error(gate.stderr.trimEnd())
    if (gate.timedOut) console.log(`[GATE-SUB] ${gate.name} TIMEOUT：超过 ${SUB_GATES.find((entry) => entry.name === gate.name)?.timeoutMs ?? 0} ms，本条按失败计`)
    const state = gate.exitCode === 0 && gate.errors === 0 ? 'PASS' : 'FAILED'
    console.log(`[GATE-SUB] ${gate.name} ${state}: ${gate.errors} error(s), ${gate.warnings} warning(s)`)
  }
}

/** 结构门禁与子门禁的合计口径；退出码 2 只来自参数或环境错误。 */
function combineGates(run, gates) {
  const structErrors = run.findings.filter((finding) => finding.severity === 'error').length
  const structWarnings = run.findings.filter((finding) => finding.severity === 'warning').length
  const subErrors = gates.reduce((sum, gate) => sum + gate.errors, 0)
  const subWarnings = gates.reduce((sum, gate) => sum + gate.warnings, 0)
  const errors = structErrors + subErrors
  const warnings = structWarnings + subWarnings
  const hardFailure = gates.some((gate) => gate.exitCode === 2 || gate.spawnError)
  const exitCode = hardFailure ? 2 : errors > 0 ? 1 : 0
  const breakdown = [`struct ${structErrors}`, ...gates.map((gate) => `${gate.name} ${gate.errors}`)].join(' + ')
  return { structErrors, structWarnings, subErrors, subWarnings, errors, warnings, exitCode, breakdown }
}



function writeFixture(root, relativePath, content) {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function fixturePassSpec() {
  return `# CHG-GATE-101 · 结构门禁通过样例

状态：**进行中**（2026-11-24）
Implements: PRD-GATE-101
Covers: \`AC-GATE-101-01\`
Domains: \`GATE\`
Change: CHG-GATE-101
变更类型：**新功能**
Owner：测试
变更号：CHG-GATE-101
标题：结构门禁通过样例
负责人：测试
判级：变更级
创建日期：2026-11-24
关闭日期：N/A：自检样例当前不关闭

## 1 头部

| 字段 | 填什么 |
|---|---|
| 变更号 | CHG-GATE-101 |
| 状态 | 进行中 |
| 负责人 | 测试 |
| 判级 | 变更级 |
| 创建日期 | 2026-11-24 |
| 关闭日期 | N/A：自检样例当前不关闭 |

## 2 目标与背景

要解决什么问题：自检样例证明结构门禁可判定。
现状：仓库里没有该夹具。
预期结果：结构门禁对齐全包返回 0 error。

## 3 范围与非目标

包含什么：只写自检夹具。
明确不做什么：不写产品代码、不改真实 spec。

## 4 影响面

受影响的 REQ 点：REQ-9.9。
AC 编号：AC-GATE-101-01。
长期 spec 文件：specs/product/PX-GATE/spec.md。

## 5 五列契约索引

| 列 | 产出文件与冻结版本 |
|---|---|
| 契约表 | specs/contract/GATE/contract.md，v1.0 |
| 产品 | specs/product/PX-GATE/spec.md，v0.1 |
| 设计 | specs/design/PX-GATE/spec.md，v0.1 |
| 前端 | specs/frontend/PX-GATE/task-panel.md，v0.1 |
| 后端 | specs/backend/PX-GATE/task-api.md，v0.1 |
| 测试 | specs/test/PX-GATE/test-plan.md，v0.1 |

## 6 任务卡清单

| 卡号 | owner | scope | AC | 证据 | 推理档位 | 状态 |
|---|---|---|---|---|---|---|
| T-01 | 测试 | \`scripts/\` | \`AC-GATE-101-01\` | \`scripts/ac/AC-GATE-101-01.mjs\` | high | 进行中 |

## 7 证据索引

| 类型 | 路径 | 对应 AC | 复跑命令 |
|---|---|---|---|
| 脚本证据 | .tmp/ac/AC-GATE-101-01.json | AC-GATE-101-01 | node scripts/ac/AC-GATE-101-01.mjs |

## 8 风险与依赖

风险：R1 夹具与真实包格式漂移，按同一解析函数核对。
依赖：无前置变更。

## 9 状态流转记录

| 时间 | 从 | 到 | 推进人 | 依据 |
|---|---|---|---|---|
| 2026-11-24 | 无 | 草稿 | 测试 | 自检夹具 |

## 10 收口

漂移检查结论：六组一致。
AC 与证据对账：AC 1 条，pass 1 条，未验证 0 条，证据 1 条。
回写长期 spec 的补丁行数：0 行。
关闭结论：自检样例不关闭，两处签字为夹具。

## 验收标准

- \`AC-GATE-101-01\` 结构门禁对齐全包返回 0 error，脚本 \`scripts/ac/AC-GATE-101-01.mjs\` 判定。
`
}

function fixturePassTasks() {
  return `# CHG-GATE-101 · 任务卡

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 推理档位 | 评审人 | 禁止项 | 状态 |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | 结构门禁自检 | 测试 | \`scripts/check-gates.mjs\` | 无 | \`AC-GATE-101-01\` | \`scripts/ac/AC-GATE-101-01.mjs\` | high | 验收 Agent | 不改真实 spec | 进行中 |
`
}

function fixturePassTestPlan() {
  return `# TEST PLAN · CHG-GATE-101

Covers: \`AC-GATE-101-01\`

## AC → 测试映射

| AC | 层 | 用例 | 期望 | 证据 |
|---|---|---|---|---|
| AC-GATE-101-01 | 单元 | TC-GATE-101-01 | 退出码 0 | .tmp/ac/AC-GATE-101-01.json |
`
}

function fixturePassEvidence() {
  return `# EVIDENCE · CHG-GATE-101

## 1 结论

- 结果：pass
- 执行人/时间：测试，2026-11-24

## 3 测试

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| EV-GATE-101-01 | AC-GATE-101-01 | 断言脚本 | node scripts/ac/AC-GATE-101-01.mjs | .tmp/ac/AC-GATE-101-01.json | 2026-11-24 11:00 | pass | 是 | 1 |
`
}

function fixtureFailSpec() {
  return `# CHG-GATE-102 · 结构门禁失败样例

状态：**草稿**（2026-11-24）
Implements: PRD-GATE-102
Domains: \`GATE\`
Change: CHG-GATE-102
变更类型：**新功能**
Owner：测试

## 1 目标

证明失败样例命中 MX-G-09 与 MX-G-10。

## 2 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 结构门禁可判定 |

## 3 覆盖范围

只写自检夹具，不写产品代码。

## 4 验收标准

- \`AC-GATE-102-01\` 结构门禁返回 0 error，脚本 \`scripts/ac/AC-GATE-102-01.mjs\` 判定。

## 5 状态/错误/边界

正常：通过样例 0 error。
错误：失败样例命中固定规则。
边界：空目录返回 0 项检查。

## 6 接口/数据

请求：无。
响应：退出码。
错误码：无。

## 7 待确认

- [ ] 无待确认项。

## 8 链接

- 模板：docs/framework/templates/change.md
`
}

function fixtureFailSpecMissingFiles() {
  return `# CHG-GATE-103 · 结构门禁文件与任务表失败样例

状态：**草稿**（2026-11-24）
Implements: PRD-GATE-103
Covers: \`AC-GATE-103-01\`
Domains: \`GATE\`
Change: CHG-GATE-103
变更类型：**新功能**
Owner：测试

## 1 目标

证明缺文件、缺任务表、缺任务卡字段时门禁报 error。

## 2 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 缺文件可被定位 |

## 3 非目标

不做真实仓库改动。

## 4 验收标准

- \`AC-GATE-103-01\` 缺文件时报 error，脚本 \`scripts/ac/AC-GATE-103-01.mjs\` 判定。

## 5 状态/错误/边界

正常：齐全包 0 error。
错误：缺任务表记 MX-G-11。
边界：无单卡文件记 MX-G-12。

## 6 接口/数据

请求：无。
响应：退出码。

## 7 待确认

- [ ] 无待确认项。

## 8 链接

- 模板：docs/framework/templates/change.md
`
}

function fixtureFailTasks() {
  return `# CHG-GATE-102 · 任务卡

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 推理档位 | 评审人 | 禁止项 | 状态 |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | 结构门禁失败自检 | 测试 | \`scripts/check-gates.mjs\` | 无 | \`AC-GATE-102-01\` | \`scripts/ac/AC-GATE-102-01.mjs\` | high | 验收 Agent | 不改真实 spec | 进行中 |
`
}

function buildSelfTestFixtures(base) {
  const pass = join(base, 'pass')
  const fail = join(base, 'fail')
  writeFixture(pass, 'specs/changes/CHG-GATE-101/spec.md', fixturePassSpec())
  writeFixture(pass, 'specs/changes/CHG-GATE-101/tasks.md', fixturePassTasks())
  writeFixture(pass, 'specs/changes/CHG-GATE-101/test-plan.md', fixturePassTestPlan())
  writeFixture(pass, 'specs/changes/CHG-GATE-101/evidence.md', fixturePassEvidence())
  writeFixture(fail, 'specs/changes/CHG-GATE-102/spec.md', fixtureFailSpec())
  writeFixture(fail, 'specs/changes/CHG-GATE-102/tasks.md', fixtureFailTasks())
  writeFixture(fail, 'specs/changes/CHG-GATE-102/test-plan.md', fixturePassTestPlan().replaceAll('CHG-GATE-101', 'CHG-GATE-102').replaceAll('AC-GATE-101', 'AC-GATE-102'))
  writeFixture(fail, 'specs/changes/CHG-GATE-102/evidence.md', fixturePassEvidence().replaceAll('CHG-GATE-101', 'CHG-GATE-102').replaceAll('AC-GATE-101', 'AC-GATE-102'))
  writeFixture(fail, 'specs/changes/CHG-GATE-103/spec.md', fixtureFailSpecMissingFiles())

  // AC 编号形态夹具：同一个两段式编号在历史包与新包上必须得到相反判定，
  // 三段式在新包上仍判通过，覆盖 MX-G-09 Covers 校验的 legacy 分支。
  const acFormat = join(base, 'ac-format')
  const writeAcFormatPackage = (root, name, covers) => {
    const rewrite = (text) =>
      text.replaceAll('CHG-GATE-101', name).replaceAll('AC-GATE-101-01', covers)
    writeFixture(root, `specs/changes/${name}/spec.md`, rewrite(fixturePassSpec()))
    writeFixture(root, `specs/changes/${name}/tasks.md`, rewrite(fixturePassTasks()))
    writeFixture(root, `specs/changes/${name}/test-plan.md`, rewrite(fixturePassTestPlan()))
    writeFixture(root, `specs/changes/${name}/evidence.md`, rewrite(fixturePassEvidence()))
  }
  writeAcFormatPackage(acFormat, 'CHG-LEGACY-GATE-201', 'AC-P5-01')
  writeAcFormatPackage(acFormat, 'CHG-GATE-202', 'AC-P5-01')
}

function signature(run) {
  return run.findings
    .map((finding) => `${finding.rule}|${finding.path}|${finding.line}|${finding.severity}|${finding.message}`)
    .sort()
    .join('\n')
}

function runSelfTest(options = {}) {
  const base = join(DEFAULT_ROOT, '.tmp', 'gate-self-test', 'struct')
  const passRoot = join(base, 'pass')
  const failRoot = join(base, 'fail')
  const acFormatRoot = join(base, 'ac-format')
  const assertions = []
  const line = (passed, text) => {
    assertions.push({ passed, text })
    console.log(`${passed ? 'PASS' : 'FAIL'} ${text}`)
  }
  try {
    buildSelfTestFixtures(base)

    const passRun = runStructure(passRoot, { stage: 'change', change: null })
    const passErrors = passRun.findings.filter((finding) => finding.severity === 'error').length
    line(passErrors === 0, `通过样例 error 数 期望 0 实际 ${passErrors}`)
    line(passRun.packages === 1, `通过样例包数 期望 1 实际 ${passRun.packages}`)

    // 编号形态：两段式只在历史包通过，新包仍须三段式。
    const acFormatRun = runStructure(acFormatRoot, { stage: 'change', change: null })
    const coversProblemFor = (prefix) =>
      acFormatRun.findings.filter(
        (finding) =>
          finding.rule === 'MX-G-09' &&
          finding.message === 'Covers 无合法 AC 编号' &&
          finding.path.startsWith(prefix),
      )
    const legacyCovers = coversProblemFor('specs/changes/CHG-LEGACY-GATE-201/')
    line(
      legacyCovers.length === 0,
      `历史包两段式 Covers 判定 期望 通过 实际 ${legacyCovers.length} 条告警`,
    )
    const newCovers = coversProblemFor('specs/changes/CHG-GATE-202/')
    line(
      newCovers.length === 1 && newCovers[0].severity === 'error',
      `非历史包两段式 Covers 判定 期望 1 条 error 实际 ${newCovers.length} 条告警`,
    )
    const strictCovers = passRun.findings.filter(
      (finding) => finding.rule === 'MX-G-09' && finding.message === 'Covers 无合法 AC 编号',
    )
    line(
      strictCovers.length === 0,
      `新包三段式 Covers 判定 期望 通过 实际 ${strictCovers.length} 条告警`,
    )

    const failRun = runStructure(failRoot, { stage: 'change', change: null })
    const failErrors = failRun.findings.filter((finding) => finding.severity === 'error').length
    line(failErrors === 7, `失败样例 error 数 期望 7 实际 ${failErrors}`)
    const errorRulesFor = (prefix) =>
      new Set(
        failRun.findings
          .filter((finding) => finding.severity === 'error' && finding.path.startsWith(prefix))
          .map((finding) => finding.rule),
      )
    const rules102 = errorRulesFor('specs/changes/CHG-GATE-102/')
    line(
      [...rules102].sort().join(',') === 'MX-G-09,MX-G-10',
      `CHG-GATE-102 命中规则 期望 MX-G-09、MX-G-10 实际 ${[...rules102].sort().join('、')}`,
    )
    const rules103 = errorRulesFor('specs/changes/CHG-GATE-103/')
    line(
      [...rules103].sort().join(',') === 'MX-G-08,MX-G-11,MX-G-12',
      `CHG-GATE-103 命中规则 期望 MX-G-08、MX-G-11、MX-G-12 实际 ${[...rules103].sort().join('、')}`,
    )
    const failRules = new Set(failRun.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.rule))
    line(failRules.size === 5, `失败样例规则集合大小 期望 5 实际 ${failRules.size}`)

    const second = runStructure(failRoot, { stage: 'change', change: null })
    line(signature(failRun) === signature(second), '同一失败样例连续两次输出 期望 相同 实际 相同')
    const third = runStructure(failRoot, { stage: 'change', change: null })
    line(signature(failRun) === signature(third), '同一失败样例连续三次输出 期望 相同 实际 相同')

    const preRun = runStructure(failRoot, { stage: 'pre', change: 'CHG-GATE-102' })
    line(preRun.checks.length === 6, `--stage pre --change 检查项 期望 6 实际 ${preRun.checks.length}`)
    line(preRun.packages === 1, `--change 过滤包数 期望 1 实际 ${preRun.packages}`)
    const forced = runStructure(passRoot, { stage: 'change', change: null, template: 'framework' })
    const forcedErrors = forced.findings.filter((finding) => finding.severity === 'error').length
    line(forcedErrors === 0, `--template framework 通过样例 error 数 期望 0 实际 ${forcedErrors}`)

    const jsonRun = runStructure(passRoot, { stage: 'change', change: null })
    const json = toJson(jsonRun)
    line(json.gate === 'struct' && Array.isArray(json.findings), '--json 结构 期望 gate=struct 且 findings 为数组 实际 符合')

    // 出口汇总：四道红门禁必须进入 exit 阶段，任一门禁红则 exit 非 0。
    const exitEntries = selectSubGates('exit')
    const exitNames = exitEntries.map((entry) => entry.name)
    for (const name of ['trace', 'docs', 'contract', 'matrix']) {
      line(
        exitNames.includes(name),
        `exit 阶段包含 ${name} 门禁 期望 包含 实际 ${exitNames.includes(name) ? '包含' : '缺失'}`,
      )
    }
    const pointExitOnly = selectSubGates('point').filter((entry) => entry.exitOnly)
    line(
      pointExitOnly.length === 0,
      `point 阶段不跑出口专属门禁 期望 0 实际 ${pointExitOnly.length}`,
    )
    line(selectSubGates('pre').length === 0, `pre 阶段不跑子门禁 期望 0 实际 ${selectSubGates('pre').length}`)
    line(
      exitNames.length === SUB_GATES.length,
      `exit 阶段覆盖全部子门禁 期望 ${SUB_GATES.length} 实际 ${exitNames.length}`,
    )
    // 汇总口径逐门禁验证：任一真实门禁有 error 时，汇总退出码必须非 0。
    for (const entry of SUB_GATES) {
      const totals = combineGates({ findings: [] }, [
        { name: entry.name, errors: 1, warnings: 0, exitCode: 1 },
      ])
      line(
        totals.exitCode !== 0 && totals.errors === 1,
        `${entry.name} 红时 exit 非 0 期望 非 0 实际 ${totals.exitCode}`,
      )
    }
    // 端到端：真起一个红门禁子进程，经 runSubGate → combineGates 后 exit 非 0。
    const redScript = join(base, 'red-gate.mjs')
    writeFileSync(redScript, "console.log('FAILED: 1 issue(s)'); process.exit(1)\n", 'utf8')
    const redGate = runSubGate(
      { name: 'red-fixture', script: '../.tmp/gate-self-test/struct/red-gate.mjs', title: '红门禁夹具', timeoutMs: 30_000 },
      { root: passRoot, stage: 'exit', change: null, json: false },
    )
    line(redGate.errors === 1, `红门禁子进程解析 error 数 期望 1 实际 ${redGate.errors}`)
    const redTotals = combineGates({ findings: [] }, [redGate])
    line(redTotals.exitCode === 1, `红门禁端到端 exit 期望 1 实际 ${redTotals.exitCode}`)
    // 末行解析覆盖四种真实格式。
    const formats = [
      ['FAILED: 1 issue(s)', 1, 0],
      ['FAILED: 2 issue(s) (checks: 11)', 2, 0],
      ['FAILED: 1 error(s), 0 warning(s)', 1, 0],
      ['PASS (gate: matrix, checks: 66, warnings: 0)', 0, 0],
      ['PASS (checks: 12, rule: MXV2-7-22)', 0, 0],
    ]
    for (const [text, expectedErrors, expectedWarnings] of formats) {
      const parsed = parseSubGateCounts(text, expectedErrors === 0 ? 0 : 1)
      line(
        parsed.errors === expectedErrors && parsed.warnings === expectedWarnings,
        `末行解析 ${text} 期望 ${expectedErrors}/${expectedWarnings} 实际 ${parsed.errors}/${parsed.warnings}`,
      )
    }
  } finally {
    // 自检夹具是本进程在 .tmp/gate-self-test/struct 下新建的临时产物，按任务
    // 要求跑完清理；路径守卫保证只删这一棵自检目录，不触碰仓库文件。
    if (options.keepFixtures) {
      console.log(`INFO 自检夹具保留在 ${relPath(DEFAULT_ROOT, base)}`)
    } else if (existsSync(base)) {
      const resolved = resolve(base)
      const guard = resolve(DEFAULT_ROOT, '.tmp', 'gate-self-test', 'struct')
      if (resolved.startsWith(guard + sep) || resolved === guard) {
        rmSync(resolved, { recursive: true, force: true })
      }
    }
  }
  const failed = assertions.filter((entry) => !entry.passed)
  if (failed.length > 0) {
    console.log(`SELF-TEST FAILED (${failed.length}/${assertions.length} assertions failed)`)
    return 1
  }
  console.log(`SELF-TEST PASS (${assertions.length} assertions)`)
  return 0
}

/* ----------------------------- 入口 ----------------------------- */

function printHelp() {
  console.log(`check-gates.mjs — 墨线结构门禁（MX-G-08 至 MX-G-13）

用法：
  node scripts/check-gates.mjs                    扫描 specs/changes/ 下全部变更包
  node scripts/check-gates.mjs --root <dir>       指定仓库根
  node scripts/check-gates.mjs --change <CHG-ID>  只查一个变更包
  node scripts/check-gates.mjs --stage pre|point|exit|change  开工前/点级/出口/变更级（默认 change）
  node scripts/check-gates.mjs --template auto|framework|legacy  按包结构选模板或强制十节/旧八节
  node scripts/check-gates.mjs --json             机器可读输出
  node scripts/check-gates.mjs --self-test        生成 .tmp 夹具自检，跑完清理
  node scripts/check-gates.mjs --self-test --keep-fixtures  自检后保留夹具（调试用）
  node scripts/check-gates.mjs --help

检查项：
  MX-G-08 包文件存在且非空（spec.md、tasks.md；变更级加 test-plan.md、evidence.md）
  MX-G-09 首部字段 状态/Implements/Covers/Change/变更类型/Owner 及十节模板头部
  MX-G-10 必填节非空；每条 Covers AC 有 scripts/ac/、人工: 或 N/A 理由
  MX-G-11 任务表八列/七列齐全，已有列单元格非空
  MX-G-12 每张卡 owner/scope/AC/证据/依赖/评审人/禁止项齐全，评审人不等于 owner
  MX-G-13 test-plan 与 evidence 模板列（warn）

子门禁（结构门禁之后跑，独立进程、120 秒超时、退出码并入汇总；--stage pre 不跑）：
  fp-coverage  scripts/check-fp-coverage.mjs（MX-G-71）：每个变更包要有“功能点覆盖”节，
               非 draft 缺节记 error，draft 缺节记 warning；表内四列与 AC 登记逐点核对。
  evidence     scripts/check-evidence.mjs（MX-G-38 至 MX-G-43、MX-G-47、MX-G-51）：
               每条 AC 有证据行、路径可打开、十五字段与判定值合法、pass 证据有效、
               原因码与解除信息齐全、并集覆盖无缺行、生成器与产物绑定；error 与
               warning 分别计入总 error 与总 warning，超时按失败记。
  出口专属门禁（--stage exit 与 change 跑，--stage point 与 pre 不跑）：
  trace        scripts/check-trace.mjs（MXV2-1-06、2-05、4-04、7-02、7-05）：PRD 追溯
               结构、引用编号、变更包闭环；1 个失败即红。
  docs         scripts/check-docs.mjs（MXV2-1-09、3-15）：框架文档版本、门禁条数与
               规则位核对；条数不一致即红。
  contract     scripts/check-contract.mjs（MXV2-5-11 至 5-17、7-07）：契约表五列与冻结
               字段、变更单号、schema；缺字段即红。
  matrix       scripts/check-matrix-coverage.mjs（MXV2-4-03、5-01、5-03、5-04、8-15）：
               六十六格任务矩阵的字段、模板、门禁与规则位；缺格或引用无效即红。

口径：
  旧格式包按 GATES.md 与 docs/process/templates/ 的八节核对；含「头部」节或
  变更号/判级/创建日期三字段的包按 docs/framework/templates/change.md 十节核对。
  --template auto 是默认值，按包结构选择；--template framework 强制十节模板，
  --template legacy 强制旧八节模板。强制十节时旧八节缺失降为 warn。
  CHG-LEGACY-* 与 historical/archived 包的 error 降为 warn，仍逐条列出。
  N/A 理由少于 8 个字符按缺失计。行号无法定位时写 1。

输出：
  每项一行 PASS/FAIL 检查项 期望 实际；失败细节按 GATES.md 的
  \`[GATE-STRUCT] path:line MX-G-NN 事实；修复动作\` 输出；末两行为
  \`FAILED: <e> error(s), <w> warning(s)\` 与 \`<p> passed, <f> failed\`。
  子门禁原始输出之后补 \`[GATE-SUB] <name> PASS|FAILED\`，最后一行
  \`[GATE-SUMMARY]\` 给出结构与子门禁的合计。--json 时统计在 summary 里，
  逐项明细在 subGates 里。
  退出码 0 表示无 error，1 表示有 error 或子门禁超时，2 表示参数或根目录错误。
`)
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, json: false, selfTest: false, help: false, change: null, stage: 'change', template: 'auto', keepFixtures: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--self-test') options.selfTest = true
    else if (arg === '--keep-fixtures') options.keepFixtures = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--root') {
      const value = argv[index + 1]
      if (!value) return { error: '--root 缺少目录参数' }
      options.root = resolve(value)
      index += 1
    } else if (arg === '--change') {
      const value = argv[index + 1]
      if (!value) return { error: '--change 缺少变更号' }
      options.change = value
      index += 1
    } else if (arg === '--stage') {
      const value = argv[index + 1]
      // GATES.md 第 4 节定义 pre / point / exit 三档；change 是 exit 的历史别名。
      if (value !== 'pre' && value !== 'point' && value !== 'exit' && value !== 'change') {
        return { error: '--stage 只接受 pre、point、exit（change 等同 exit）' }
      }
      options.stage = value
      index += 1
    } else if (arg === '--template') {
      const value = argv[index + 1]
      if (!['auto', 'framework', 'legacy'].includes(value)) {
        return { error: '--template 只接受 auto、framework 或 legacy' }
      }
      options.template = value
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
  if (options.help) {
    printHelp()
    process.exit(0)
  }
  if (options.selfTest) process.exit(runSelfTest(options))
  if (!isDir(options.root)) {
    console.error(`根目录不可读：${options.root}`)
    process.exit(2)
  }
  try {
    const run = runStructure(options.root, options)
    const gates = runSubGates(options)
    const totals = combineGates(run, gates)
    if (options.json) {
      const json = toJson(run)
      json.subGates = gates.map((gate) => ({
        gate: gate.name,
        title: gate.title,
        rule: (SUB_GATES.find((entry) => entry.name === gate.name)?.rules ?? []).join(' '),
        command: gate.command,
        ok: gate.exitCode === 0 && gate.errors === 0,
        exitCode: gate.exitCode,
        timedOut: gate.timedOut,
        errors: gate.errors,
        warnings: gate.warnings,
        durationMs: gate.durationMs,
        result: gate.detail,
      }))
      json.summary = { ok: totals.errors === 0, errors: totals.errors, warnings: totals.warnings, exitCode: totals.exitCode }
      json.ok = totals.errors === 0
      console.log(JSON.stringify(json, null, 2))
    } else {
      printText(run)
      printSubGates(gates)
      const state = totals.errors > 0
        ? `FAILED: ${totals.errors} error(s), ${totals.warnings} warning(s)（error 来源：${totals.breakdown}）`
        : `PASS (gate: struct${gates.length ? `+${gates.map((gate) => gate.name).join('+')}` : ''}, warnings: ${totals.warnings})`
      console.log(`[GATE-SUMMARY] ${state}`)
    }
    process.exit(totals.exitCode)
  } catch (error) {
    if (error instanceof PreflightError) {
      console.error(error.message)
      process.exit(2)
    }
    throw error
  }
}

// 规则级命令已移交 ai-review；本脚本按整套门禁运行，不接受 --rule 参数。

main()



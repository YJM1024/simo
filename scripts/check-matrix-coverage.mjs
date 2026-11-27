#!/usr/bin/env node
/**
 * check-matrix-coverage.mjs — 矩阵覆盖率门禁（MX-G-59，零依赖，只读）
 *
 * 检查对象是 docs/framework/TASK-MATRIX.md：
 *   1. 第 3 节主矩阵 8 类任务乘 6 阶段，共 48 格；
 *   2. 第 8 节文档交付、设计交付、独立工具三张表，各 6 阶段，共 18 格。
 * 每格检查动作、模板、门禁三个字段非空，并检查三类引用：
 *   规则号：MX-<前缀>-<序号>，在 docs/framework/MOXIAN.md 或伴随规则册
 *           （GATES.md、ROLES.md、domains/*.md）中出现；矩阵实际引用
 *           MX-BE、MX-PD、MX-QA、MX-R、MX-G 等前缀，只查 MOXIAN.md
 *           会把有效引用误判为缺失，因此按主册加伴随册解析并分别计数；
 *   模板名：解析到 docs/framework/templates/ 或 docs/process/templates/
 *           下的真实文件；ADR、复现记录与组件 spec 均有独立模板文件
 *           （adr.md、repro.md、component-spec.md），名册内文件缺失或
 *           模板名不在名册内时记 error；
 *   门禁名：在 docs/framework/GATES.md 的节标题或矩阵第 2 节门禁名册中
 *           存在；人工（<条件>）只在不适用阶段按人工判据计，记 warning。
 *
 * 覆盖率口径：一格的动作、模板、门禁三字段齐全，且格内规则号、模板名、
 * 门禁名全部可解析，才算覆盖。主矩阵分母固定 48，附加类型分母固定 18，
 * 合计分母固定 66。表结构缺行时按缺失格计，分母不变。
 *
 * 用法：
 *   node scripts/check-matrix-coverage.mjs
 *   node scripts/check-matrix-coverage.mjs --json
 *   node scripts/check-matrix-coverage.mjs --root <repo-root>
 *   node scripts/check-matrix-coverage.mjs --self-test
 *   node scripts/check-matrix-coverage.mjs --help
 *
 * 文本输出先给三组覆盖率和字段与引用计数，再给缺失清单与 warning，
 * 末行是 PASS 或 FAILED。--json 输出单个对象，含 coverage、fields、
 * references、missing、warnings、structure、errors、exitCode。
 * 退出码：0 表示 66 格全覆盖；1 表示存在缺失格；2 表示参数错误或
 * 运行前置缺失（矩阵、总册、GATES 或模板目录不可读）。
 * --self-test 在 .tmp/matrix-coverage-self-test/ 下生成通过样例、失败样例与
 * 模板缺失样例，不读真实仓库内容，不清空目录，重复运行只覆盖已知文件；
 * 另用剔除 ADR 与 repro 的名册跑一次通过样例，确认旧名册报未知模板。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frameworkDir } from './lib/framework-root.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const GATE = 'matrix'
const RULE = 'MX-G-59'
const MATRIX_REL = 'docs/framework/TASK-MATRIX.md'
const MOXIAN_REL = 'docs/framework/MOXIAN.md'
const GATES_REL = 'docs/framework/GATES.md'
const ROLES_REL = 'docs/framework/ROLES.md'
const DOMAINS_REL = 'docs/framework/domains'
const TEMPLATE_DIRS = ['docs/framework/templates', 'docs/process/templates']

const MAIN_TYPES = [
  '新功能',
  '界面调整',
  '缺陷修复',
  '重构',
  '数据迁移',
  '性能优化',
  '安全修复',
  '纯文档',
]
const PHASES = ['受理与判级', '契约与设计', '拆分与派单', '执行', '测试与证据', '验收与收口']
const ADDITIONAL_TYPES = ['文档交付', '设计交付', '独立工具']
const EXPECTED_TOTAL = MAIN_TYPES.length * PHASES.length + ADDITIONAL_TYPES.length * PHASES.length

const RULE_ID_RE = /MX[A-Z0-9]{1,8}-\d+(?:-\d+)?/g

const TEMPLATE_FILES = new Map([
  ['proposal', 'docs/process/templates/proposal.md'],
  ['spec', 'docs/process/templates/spec.md'],
  ['design', 'docs/process/templates/design.md'],
  ['tasks', 'docs/process/templates/tasks.md'],
  ['task-card', 'docs/process/templates/task-card.md'],
  ['test-plan', 'docs/process/templates/test-plan.md'],
  ['evidence', 'docs/process/templates/evidence.md'],
  ['RETRO', 'docs/process/templates/RETRO.md'],
  ['defect-record', 'docs/framework/templates/defect-record.md'],
  ['migration-plan', 'docs/framework/templates/migration-plan.md'],
  ['token-change', 'docs/framework/templates/token-change.md'],
  ['cli-contract', 'docs/framework/templates/cli-contract.md'],
  ['change.md', 'docs/framework/templates/change.md'],
  ['组件 spec', 'docs/framework/templates/component-spec.md'],
  ['ADR', 'docs/framework/templates/adr.md'],
  ['repro', 'docs/framework/templates/repro.md'],
  ['accept', 'docs/framework/templates/accept.md'],
])

/**
 * 产物类型没有独立模板文件时，按定义条款与落点核对。
 * rule 必须在规则名册中存在，definitionPath 必须存在，canonicalFile 写了的
 * 必须存在；canonicalPath 只用于提示，不要求当前仓库已有实例。
 * ADR、复现记录与组件 spec 均已登记独立模板文件，走 TEMPLATE_FILES，不在此表。
 */
const ARTIFACT_TEMPLATES = new Map([])

const FALLBACK_GATES = [
  '判级门',
  '契约门',
  '根因确认门',
  '派单门',
  '自验门',
  '证据门',
  '收口门',
  '组件登记门',
  '可访问性门',
  '兼容门',
  '迁移演练门',
  '性能基线门',
  '安全评审门',
  '文档校验门',
]

const FIXTURE_GATES = [...FALLBACK_GATES]

const HINTS = {
  'action-missing': '补写该阶段动作',
  'template-missing': '补写模板字段',
  'template-unknown': '改为模板名册中的名称',
  'template-file-missing': '补模板文件或改引用',
  'template-definition-missing': '补产物定义条款或改引用',
  'gate-missing': '补写门禁字段',
  'gate-unknown': '改为 GATES.md 或矩阵门禁名册中的名称',
  'gate-manual-not-na': '改为有名称的门禁，或把阶段取值改为不适用',
  'rule-invalid': '改为规则名册中存在的编号',
  'row-missing': '补矩阵行',
  'cell-missing': '补该格内容',
  'table-missing': '补附加类型表',
  'main-table-missing': '补主矩阵表',
  'matrix-shape': '修正矩阵表结构后重跑',
}

class PreflightError extends Error {}
class UsageError extends Error {}

function usage() {
  return `check-matrix-coverage.mjs — 矩阵覆盖率门禁（${RULE}）

用法：
  node scripts/check-matrix-coverage.mjs [--json] [--root <repo-root>]
  node scripts/check-matrix-coverage.mjs --self-test
  node scripts/check-matrix-coverage.mjs --help

检查内容：
  1. 解析 docs/framework/TASK-MATRIX.md 第 3 节主矩阵的 8 类任务乘 6 阶段，
     共 48 格；解析第 8 节文档交付、设计交付、独立工具三张表的各 6 阶段，
     共 18 格。
  2. 每格检查动作、模板、门禁三个字段非空。
  3. 格内规则号在 MOXIAN.md 或伴随规则册中存在；模板名解析到模板文件，
     组件 spec 解析到 templates/component-spec.md；门禁名在 GATES.md
     或矩阵第 2 节门禁名册中存在。
  4. 输出主矩阵、附加类型与合计三组覆盖率，字段齐全数与缺失清单。

覆盖率口径：动作、模板、门禁三字段齐全，且格内三类引用全部可解析的格，
计为覆盖。主矩阵 48 格、附加类型 18 格、合计 66 格为固定分母。模板字段写
“无”按显式声明计，不要求模板文件。名册内的模板文件缺失或模板名不在名册内
时记 error，阻断覆盖率；人工（<条件>）只在不适用阶段按人工判据计，记 warning。

退出码：
  0  66 格全部三字段齐全且引用有效
  1  存在缺失格
  2  参数错误或运行前置缺失

--json 输出单个对象，字段为 gate、rule、status、coverage、fields、
references、missing、warnings、structure、errors、checks、exitCode。
--self-test 在 .tmp/matrix-coverage-self-test/ 下生成通过样例、失败样例与
模板缺失样例，通过样例断言 48/48、18/18、66/66 与退出码 0，失败样例断言
按字段和引用分类命中并退出码 1，模板缺失样例断言 ADR 模板文件缺失、旧名册
样例断言 ADR 与 repro 报未知模板，两者退出码均为 1。`
}

function parseArgs(argv) {
  const opts = { help: false, json: false, selfTest: false, root: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      opts.help = true
    } else if (arg === '--json') {
      opts.json = true
    } else if (arg === '--self-test') {
      opts.selfTest = true
    } else if (arg === '--root') {
      const value = argv[i + 1]
      if (!value || value.startsWith('-')) throw new UsageError('--root 需要一个目录参数')
      opts.root = resolve(value)
      i += 1
    } else if (arg.startsWith('--root=')) {
      const value = arg.slice('--root='.length)
      if (!value) throw new UsageError('--root 需要一个目录参数')
      opts.root = resolve(value)
    } else {
      throw new UsageError(`未知参数：${arg}`)
    }
  }
  return opts
}

function toPosix(path) {
  return path.split(sep).join('/')
}

// 框架正文是外部依赖：读 SIMO_FRAMEWORK_ROOT（默认同级目录 ../moxian-framework）下的 docs/framework。
function resolveInput(root, relativePath) {
  if (relativePath === 'docs/framework') return frameworkDir(root)
  if (!relativePath.startsWith('docs/framework/')) return join(root, relativePath)
  return join(frameworkDir(root), relativePath.slice('docs/framework/'.length))
}

function readRequired(root, relativePath) {
  const absolutePath = resolveInput(root, relativePath)
  if (!existsSync(absolutePath)) {
    throw new PreflightError(`缺少必需文件 ${relativePath}`)
  }
  try {
    return readFileSync(absolutePath, 'utf8')
  } catch (error) {
    throw new PreflightError(`无法读取 ${relativePath}：${error.message}`)
  }
}

function readOptional(root, relativePath) {
  const absolutePath = resolveInput(root, relativePath)
  if (!existsSync(absolutePath)) return null
  try {
    return readFileSync(absolutePath, 'utf8')
  } catch {
    return null
  }
}

function stripMarkdown(text) {
  return String(text ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasActionContent(raw) {
  let text = stripMarkdown(raw)
  text = text.replace(/^(必做|可省|不适用)[。；;，,\s]*/, '')
  return text.replace(/[。；;，,\s]/g, '').length > 0
}

function extractValuation(raw) {
  const match = String(raw ?? '').match(/\*\*(必做|可省|不适用)\*\*/)
  if (match) return match[1]
  const plain = String(raw ?? '').match(/(必做|可省|不适用)/)
  return plain ? plain[1] : ''
}

function splitTableRow(text) {
  let line = String(text ?? '').trim()
  if (line.startsWith('|')) line = line.slice(1)
  if (line.endsWith('|')) line = line.slice(0, -1)
  return line.split('|').map((cell) => cell.trim())
}

/**
 * 扫描 Markdown 表格。围栏代码块内的竖线不参与解析；表头下一行必须是
 * 分隔行（允许 :---: 写法），否则该块不当作表格。
 */
function scanTables(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const tables = []
  let inFence = false
  let block = []

  const flush = () => {
    if (block.length < 2) {
      block = []
      return
    }
    const rows = block.map((entry) => ({ line: entry.line, cells: splitTableRow(entry.text) }))
    const headers = rows[0].cells
    const separator = rows[1].cells
    const isSeparator =
      separator.length === headers.length &&
      separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    if (isSeparator) {
      tables.push({
        startLine: rows[0].line,
        headers,
        rows: rows.slice(2),
      })
    }
    block = []
  }

  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      flush()
      inFence = !inFence
      return
    }
    if (inFence) return
    if (/^\s*\|/.test(line)) {
      block.push({ line: index + 1, text: line })
    } else {
      flush()
    }
  })
  flush()
  return tables
}

function findMainTable(tables) {
  return tables.find((table) => {
    if (table.headers[0] !== '任务类型' && table.headers[0] !== '类型') return false
    return PHASES.every((phase, index) => table.headers[index + 1] === phase)
  })
}

function splitCellSegments(text) {
  const raw = String(text ?? '')
  if (/<br\s*\/?>/i.test(raw)) return raw.split(/<br\s*\/?>/i)
  return raw.split(/[；;]/)
}

function parseMainCellText(text) {
  const segments = splitCellSegments(text)
  const actionParts = []
  let templateRaw = ''
  let gateRaw = ''
  let ruleRaw = ''
  for (const segment of segments) {
    if (!segment.trim()) continue
    const templateMatch = segment.match(/^\s*模板\s*[:：]\s*([\s\S]*)$/)
    if (templateMatch) {
      templateRaw = templateMatch[1].trim()
      continue
    }
    const gateMatch = segment.match(/^\s*门禁\s*[:：]\s*([\s\S]*)$/)
    if (gateMatch) {
      gateRaw = gateMatch[1].trim()
      continue
    }
    const ruleMatch = segment.match(/^\s*规则位\s*[:：]?\s*([\s\S]*)$/)
    if (ruleMatch) {
      ruleRaw = ruleMatch[1].trim()
      continue
    }
    actionParts.push(segment.trim())
  }
  const actionRaw = actionParts.join(' ')
  return {
    actionRaw,
    templateRaw,
    gateRaw,
    ruleRaw,
    valuation: extractValuation(actionRaw),
  }
}

function cellLabel(cell) {
  const group = cell.group === 'main' ? '主矩阵' : '附加类型'
  return `${group}/${cell.type}/${cell.phase}`
}

function makeProblem(kind, detail, hint = null) {
  return {
    severity: 'error',
    kind,
    detail,
    hint: hint ?? HINTS[kind] ?? '修正该格后重跑',
  }
}

function placeholderCell(group, type, phase, line, kind, detail) {
  return {
    group,
    type,
    phase,
    line,
    present: false,
    actionRaw: '',
    templateRaw: '',
    gateRaw: '',
    ruleRaw: '',
    valuation: '',
    problems: [makeProblem(kind, detail)],
    warnings: [],
    templateRefs: [],
    gateRefs: [],
    ruleRefs: [],
  }
}

function parseMainCells(table, structureIssues) {
  const cells = []
  const rowsByType = new Map()

  for (const row of table.rows) {
    const type = row.cells[0] ?? ''
    if (!MAIN_TYPES.includes(type)) {
      structureIssues.push(
        makeProblem('matrix-shape', `主矩阵出现未知任务类型「${type}」`, '只保留八类主类型'),
      )
      structureIssues[structureIssues.length - 1].line = row.line
      continue
    }
    if (rowsByType.has(type)) {
      structureIssues.push(
        makeProblem('matrix-shape', `主矩阵重复出现任务类型「${type}」`, '每类只保留一行'),
      )
      structureIssues[structureIssues.length - 1].line = row.line
      continue
    }
    rowsByType.set(type, row)
  }

  for (const type of MAIN_TYPES) {
    const row = rowsByType.get(type)
    if (!row) {
      structureIssues.push(
        makeProblem('row-missing', `主矩阵缺少「${type}」行`, '补该行六格'),
      )
      structureIssues[structureIssues.length - 1].line = table.startLine
      for (const phase of PHASES) {
        cells.push(
          placeholderCell(
            'main',
            type,
            phase,
            table.startLine,
            'row-missing',
            `主矩阵缺少「${type}」行，${phase}格按缺失计`,
          ),
        )
      }
      continue
    }

    if (row.cells.length > table.headers.length) {
      structureIssues.push(
        makeProblem(
          'matrix-shape',
          `「${type}」行的列数 ${row.cells.length} 多于表头 ${table.headers.length}`,
          '删去多余列',
        ),
      )
      structureIssues[structureIssues.length - 1].line = row.line
    }

    for (let index = 0; index < PHASES.length; index += 1) {
      const phase = PHASES[index]
      if (!row.cells[index + 1]) {
        structureIssues.push(
          makeProblem('cell-missing', `「${type}/${phase}」格为空或列数不足`, '补该格内容'),
        )
        structureIssues[structureIssues.length - 1].line = row.line
        cells.push(
          placeholderCell(
            'main',
            type,
            phase,
            row.line,
            'cell-missing',
            `「${type}/${phase}」格为空或列数不足`,
          ),
        )
        continue
      }
      const parsed = parseMainCellText(row.cells[index + 1])
      cells.push({
        group: 'main',
        type,
        phase,
        line: row.line,
        present: true,
        ...parsed,
        problems: [],
        warnings: [],
        templateRefs: [],
        gateRefs: [],
        ruleRefs: [],
      })
    }
  }

  return cells
}

function detectAdditionalType(lines, startLine) {
  const from = Math.max(0, startLine - 9)
  for (let index = startLine - 2; index >= from; index -= 1) {
    const line = String(lines[index] ?? '')
    const match =
      line.match(/(文档交付|设计交付|独立工具)在六个阶段/) ??
      line.match(/^#{1,6}\s*.*(文档交付|设计交付|独立工具)\s*$/) ??
      line.match(/^表\s*6-\d+\s*(文档交付|设计交付|独立工具)\s*$/)
    if (match) return match[1]
  }
  return null
}

function parseAdditionalCells(tables, matrixText, structureIssues) {
  const lines = String(matrixText ?? '').split(/\r?\n/)
  const candidates = tables.filter((table) => {
    if (table.headers[0] !== '阶段') return false
    if (table.headers.length === 4) {
      return (
        table.headers[1] === '加做的必做项' &&
        table.headers[2] === '模板' &&
        table.headers[3] === '门禁'
      )
    }
    if (table.headers.length === 5) {
      return (
        (table.headers[1] === '取值与动作' || table.headers[1] === '加做的必做项') &&
        table.headers[2] === '模板' &&
        table.headers[3] === '门禁'
      )
    }
    return false
  })
  const cells = []
  const usedTypes = new Set()

  for (let index = 0; index < candidates.length; index += 1) {
    const table = candidates[index]
    let type = detectAdditionalType(lines, table.startLine)
    if (!type) {
      type = ADDITIONAL_TYPES.find((item) => !usedTypes.has(item)) ?? null
      if (type) {
        structureIssues.push({
          ...makeProblem(
            'matrix-shape',
            `附加类型表前没有类型说明，按顺序推断为「${type}」`,
            '在表前补「<类型>在六个阶段」一句',
          ),
          severity: 'warning',
          line: table.startLine,
        })
      }
    }
    if (!type) {
      structureIssues.push({
        ...makeProblem('matrix-shape', '附加类型表多于三张，无法确定类型', '删去多余的表'),
        line: table.startLine,
      })
      continue
    }
    if (usedTypes.has(type)) {
      structureIssues.push({
        ...makeProblem('matrix-shape', `附加类型「${type}」出现多张表`, '每种类型只保留一张表'),
        line: table.startLine,
      })
      continue
    }
    usedTypes.add(type)

    const rowsByPhase = new Map()
    for (const row of table.rows) {
      const phase = row.cells[0] ?? ''
      if (!PHASES.includes(phase)) {
        structureIssues.push({
          ...makeProblem('matrix-shape', `附加类型「${type}」出现未知阶段「${phase}」`, '按六阶段名称改写'),
          line: row.line,
        })
        continue
      }
      if (rowsByPhase.has(phase)) {
        structureIssues.push({
          ...makeProblem('matrix-shape', `附加类型「${type}」重复阶段「${phase}」`, '每阶段只保留一行'),
          severity: 'warning',
          line: row.line,
        })
        continue
      }
      rowsByPhase.set(phase, row)
    }

    for (const phase of PHASES) {
      const row = rowsByPhase.get(phase)
      if (!row) {
        structureIssues.push({
          ...makeProblem('row-missing', `附加类型「${type}」缺少「${phase}」行`, '补该行'),
          line: table.startLine,
        })
        cells.push(
          placeholderCell(
            'additional',
            type,
            phase,
            table.startLine,
            'row-missing',
            `附加类型「${type}」缺少「${phase}」行`,
          ),
        )
        continue
      }
      cells.push({
        group: 'additional',
        type,
        phase,
        line: row.line,
        present: true,
        actionRaw: row.cells[1] ?? '',
        templateRaw: row.cells[2] ?? '',
        gateRaw: row.cells[3] ?? '',
        ruleRaw: row.cells[4] ?? '',
        valuation: extractValuation(row.cells[1] ?? '') || '必做',
        problems: [],
        warnings: [],
        templateRefs: [],
        gateRefs: [],
        ruleRefs: [],
      })
    }
  }

  for (const type of ADDITIONAL_TYPES) {
    if (usedTypes.has(type)) continue
    structureIssues.push({
      ...makeProblem('table-missing', `缺少附加类型「${type}」表`, '补该类型六阶段表'),
      line: 0,
    })
    for (const phase of PHASES) {
      cells.push(
        placeholderCell(
          'additional',
          type,
          phase,
          0,
          'table-missing',
          `缺少附加类型「${type}」表，${phase}格按缺失计`,
        ),
      )
    }
  }

  return cells
}

function expandRuleRanges(text) {
  // 规则位允许区间简写：MXV2-4-01..4-09、5-01..5-10（后者沿用 MXV2 前缀）。
  const source = String(text ?? '').replace(
    /(?:MXV2-)?(\d+)-(\d{2})\s*\.\.\s*(?:(\d+)-)?(\d{2})/g,
    (match, chapter, from, chapter2, to) => {
      const start = Number(from)
      const end = Number(to)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return match
      const ids = []
      for (let n = start; n <= end; n += 1) {
        ids.push(`MXV2-${chapter2 ?? chapter}-${String(n).padStart(2, '0')}`)
      }
      return ids.join(' ')
    },
  )
  return [...new Set(source.match(RULE_ID_RE) ?? [])]
}

function addRuleIds(target, text, source) {
  for (const id of expandRuleRanges(text)) {
    if (!target.has(id)) target.set(id, source)
  }
}

function collectRules(root, moxianText, gatesText) {
  const rules = new Map()
  addRuleIds(rules, moxianText, MOXIAN_REL)
  addRuleIds(rules, gatesText, GATES_REL)
  const rolesText = readOptional(root, ROLES_REL)
  if (rolesText) addRuleIds(rules, rolesText, ROLES_REL)
  const domainsPath = resolveInput(root, DOMAINS_REL)
  if (existsSync(domainsPath)) {
    for (const file of readdirSync(domainsPath).filter((name) => name.endsWith('.md')).sort()) {
      const relativePath = toPosix(join(DOMAINS_REL, file))
      const text = readOptional(root, relativePath)
      if (text) addRuleIds(rules, text, relativePath)
    }
  }
  return rules
}

function collectGates(matrixText, gatesText) {
  const gates = new Set()
  for (const table of scanTables(matrixText)) {
    if (table.headers[0] === '门禁' && table.headers.length >= 5) {
      for (const row of table.rows) {
        const name = String(row.cells[0] ?? '').trim()
        if (name.endsWith('门')) gates.add(name)
      }
    }
  }
  for (const line of String(gatesText ?? '').split(/\r?\n/)) {
    const match = line.match(/^###\s+\d+(?:\.\d+)?\s+(.+?门禁?)\s*$/)
    if (match) gates.add(match[1].trim())
    const rowMatch = line.match(/^\|\s*C\d+\s*\|\s*([^|]+?门)\s*\|/)
    if (rowMatch) gates.add(rowMatch[1].trim())
  }
  return gates
}

function stripParenthetical(text) {
  return String(text ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .trim()
}

function normalizeTemplateToken(token) {
  return String(token ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/。$/, '')
}

function resolveTemplateFile(name, roster = TEMPLATE_FILES) {
  const aliases = [...roster.keys()].sort((left, right) => right.length - left.length)
  for (const alias of aliases) {
    if (name === alias || name.startsWith(`${alias} `)) return roster.get(alias)
  }
  return null
}

function matchGateNames(segment, gateNames) {
  const names = [...gateNames].sort((left, right) => right.length - left.length)
  let rest = segment
  const found = []
  for (const name of names) {
    if (!name) continue
    while (rest.includes(name)) {
      found.push(name)
      rest = rest.replace(name, ' ')
    }
  }
  return { found, rest }
}

function addProblem(cell, kind, detail, hint = null) {
  cell.problems.push(makeProblem(kind, detail, hint))
}

function createStats() {
  return {
    rules: { total: 0, invalid: 0, moxian: 0, companion: 0 },
    templates: { total: 0, invalid: 0, file: 0, artifact: 0, none: 0 },
    gates: { total: 0, invalid: 0, named: 0, manual: 0 },
  }
}

function validateTemplates(cell, context, stats) {
  const raw = String(cell.templateRaw ?? '').trim().replace(/。$/, '')
  if (!raw) {
    addProblem(cell, 'template-missing', '模板字段为空')
    return
  }
  const tokens = raw
    .split('、')
    .map((token) => token.trim())
    .filter(Boolean)
  if (tokens.length === 0) {
    addProblem(cell, 'template-missing', '模板字段没有可解析的名称')
    return
  }

  for (const token of tokens) {
    const name = normalizeTemplateToken(token)
    if (!name) {
      addProblem(cell, 'template-missing', `模板项「${token}」为空`)
      continue
    }
    if (name === '无') {
      stats.templates.none += 1
      cell.templateRefs.push({ token, kind: 'none' })
      continue
    }

    const file = resolveTemplateFile(name, context.templates)
    if (file) {
      stats.templates.total += 1
      if (!existsSync(resolveInput(context.root, file))) {
        stats.templates.invalid += 1
        addProblem(cell, 'template-file-missing', `模板「${name}」指向 ${file}，文件不存在`)
      } else {
        stats.templates.file += 1
        cell.templateRefs.push({ token, kind: 'file', path: file })
      }
      continue
    }

    const artifact = ARTIFACT_TEMPLATES.get(name)
    if (artifact) {
      stats.templates.total += 1
      const definitionExists = existsSync(resolveInput(context.root, artifact.definitionPath))
      const ruleExists = context.rules.has(artifact.rule)
      const canonicalExists =
        artifact.canonicalFile === null || existsSync(resolveInput(context.root, artifact.canonicalFile))
      if (!definitionExists || !ruleExists || !canonicalExists) {
        stats.templates.invalid += 1
        const missing = []
        if (!definitionExists) missing.push(`定义文件 ${artifact.definitionPath} 不存在`)
        if (!ruleExists) missing.push(`定义条款 ${artifact.rule} 不在规则名册内`)
        if (!canonicalExists) missing.push(`落点 ${artifact.canonicalFile} 不存在`)
        addProblem(
          cell,
          'template-definition-missing',
          `模板「${name}」按产物类型核对失败：${missing.join('，')}`,
        )
      } else {
        stats.templates.artifact += 1
        cell.templateRefs.push({
          token,
          kind: 'artifact',
          definition: `${artifact.definitionPath} ${artifact.rule}`,
          canonicalPath: artifact.canonicalPath,
        })
        cell.warnings.push({
          kind: 'template-artifact',
          detail: `模板「${name}」没有独立模板文件，按产物类型核对，定义见 ${artifact.definitionPath} ${artifact.rule}，落点 ${artifact.canonicalPath}`,
        })
      }
      continue
    }

    stats.templates.total += 1
    stats.templates.invalid += 1
    addProblem(cell, 'template-unknown', `模板「${name}」不在模板名册内`)
  }
}

function validateGates(cell, context, stats) {
  const raw = String(cell.gateRaw ?? '').trim().replace(/。$/, '')
  if (!raw) {
    addProblem(cell, 'gate-missing', '门禁字段为空')
    return
  }
  const segments = raw
    .split(/[、；;]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length === 0) {
    addProblem(cell, 'gate-missing', '门禁字段没有可解析的名称')
    return
  }

  for (const segment of segments) {
    const { found, rest } = matchGateNames(segment, context.gates)
    if (found.length === 0) {
      const base = stripParenthetical(segment)
      if (/^人工/.test(base)) {
        stats.gates.total += 1
        if (cell.valuation === '不适用') {
          stats.gates.manual += 1
          cell.gateRefs.push({ name: '人工', kind: 'manual', raw: segment })
          cell.warnings.push({
            kind: 'gate-manual',
            detail: `门禁「${segment}」按人工判据计，阶段取值为不适用`,
          })
        } else {
          stats.gates.invalid += 1
          addProblem(
            cell,
            'gate-manual-not-na',
            `人工门禁「${segment}」出现在取值为「${cell.valuation || '未写'}」的格`,
          )
        }
      } else {
        stats.gates.total += 1
        stats.gates.invalid += 1
        addProblem(cell, 'gate-unknown', `门禁「${segment}」不在 GATES.md 或矩阵门禁名册内`)
      }
      continue
    }

    for (const name of found) {
      stats.gates.total += 1
      stats.gates.named += 1
      cell.gateRefs.push({ name, kind: 'named', raw: segment })
    }

    const leftover = stripParenthetical(rest).replace(/[\s。、；;]/g, '')
    const leftoverGate = leftover.match(/[\u4e00-\u9fff]{1,10}门(?:禁)?/)
    if (leftoverGate) {
      stats.gates.invalid += 1
      addProblem(cell, 'gate-unknown', `门禁「${leftoverGate[0]}」不在 GATES.md 或矩阵门禁名册内`)
    }
  }
}

function validateRules(cell, context, stats) {
  const text = [cell.actionRaw, cell.templateRaw, cell.gateRaw, cell.ruleRaw].join(' ')
  const ids = expandRuleRanges(text)
  for (const id of ids) {
    stats.rules.total += 1
    const source = context.rules.get(id)
    if (!source) {
      stats.rules.invalid += 1
      addProblem(cell, 'rule-invalid', `规则号 ${id} 不在规则名册内`)
      continue
    }
    if (source === MOXIAN_REL) stats.rules.moxian += 1
    else stats.rules.companion += 1
    cell.ruleRefs.push({ id, source })
  }
}

function validateCells(cells, context) {
  const stats = createStats()
  for (const cell of cells) {
    if (!cell.present) continue
    if (!hasActionContent(cell.actionRaw)) {
      addProblem(cell, 'action-missing', '动作字段为空')
    }
    const optionalCell =
      cell.valuation === '可省' && /省/.test(cell.actionRaw) && /理由/.test(cell.actionRaw)
    const templateEmpty = !String(cell.templateRaw ?? '').trim()
    const gateEmpty = !String(cell.gateRaw ?? '').trim()
    if (optionalCell && (templateEmpty || gateEmpty)) {
      cell.warnings.push({
        kind: 'optional-omitted',
        detail: '可省格按表 2-3 省略模板或门禁并写明理由，对应字段允许为空',
      })
    }
    if (!(optionalCell && templateEmpty)) validateTemplates(cell, context, stats)
    if (!(optionalCell && gateEmpty)) validateGates(cell, context, stats)
    validateRules(cell, context, stats)
  }
  return stats
}

function countFields(cells, selector) {
  const covered = cells.filter((cell) => {
    if (!cell.present) return false
    if (selector === 'action') return hasActionContent(cell.actionRaw)
    return String(cell[selector] ?? '').trim().replace(/。$/, '').length > 0
  }).length
  return { covered, total: cells.length }
}

function summarizeGroup(cells) {
  const total = cells.length
  const covered = cells.filter(
    (cell) => cell.problems.every((problem) => problem.severity !== 'error'),
  ).length
  return { covered, total, ratio: total === 0 ? 0 : covered / total }
}

function formatRatio(ratio) {
  return `${(ratio * 100).toFixed(1)}%`
}

function normalizeStructureIssue(issue, fallbackLine = 0) {
  return {
    severity: issue.severity ?? 'error',
    kind: issue.kind ?? 'matrix-shape',
    detail: issue.detail ?? '',
    hint: issue.hint ?? HINTS[issue.kind] ?? '修正后重跑',
    line: issue.line ?? fallbackLine,
  }
}

function buildResult(cells, structureIssues, stats) {
  const mainCells = cells.filter((cell) => cell.group === 'main')
  const additionalCells = cells.filter((cell) => cell.group === 'additional')
  const coverage = {
    main: summarizeGroup(mainCells),
    additional: summarizeGroup(additionalCells),
    total: summarizeGroup(cells),
  }
  const fields = {
    action: countFields(cells, 'action'),
    template: countFields(cells, 'templateRaw'),
    gate: countFields(cells, 'gateRaw'),
  }
  const missing = cells
    .filter((cell) => cell.problems.some((problem) => problem.severity === 'error'))
    .map((cell) => ({
      group: cell.group,
      type: cell.type,
      phase: cell.phase,
      line: cell.line,
      label: cellLabel(cell),
      reasons: cell.problems
        .filter((problem) => problem.severity === 'error')
        .map((problem) => ({
          kind: problem.kind,
          detail: problem.detail,
          hint: problem.hint,
        })),
    }))
  const warnings = cells.flatMap((cell) =>
    cell.warnings.map((warning) => ({
      kind: warning.kind,
      detail: warning.detail,
      group: cell.group,
      type: cell.type,
      phase: cell.phase,
      line: cell.line,
      label: cellLabel(cell),
    })),
  )
  const structure = structureIssues.map((issue) => normalizeStructureIssue(issue))
  const cellErrors = cells.reduce(
    (sum, cell) => sum + cell.problems.filter((problem) => problem.severity === 'error').length,
    0,
  )
  const structureErrors = structure.filter((issue) => issue.severity === 'error').length
  const structureWarnings = structure.filter((issue) => issue.severity === 'warning').length
  const errors = cellErrors + structureErrors
  const warningCount = warnings.length + structureWarnings
  const references = {
    rules: { ...stats.rules },
    templates: { ...stats.templates },
    gates: { ...stats.gates },
  }
  return {
    gate: GATE,
    rule: RULE,
    status: errors > 0 ? 'FAILED' : 'PASS',
    coverage,
    fields,
    references,
    missing,
    warnings,
    structure,
    errors,
    warningCount,
    checks: cells.length,
    exitCode: errors > 0 ? 1 : 0,
  }
}

function run(root, overrides = null) {
  const matrixText = readRequired(root, MATRIX_REL)
  const moxianText = readRequired(root, MOXIAN_REL)
  const gatesText = readRequired(root, GATES_REL)

  const availableTemplateDirs = TEMPLATE_DIRS.filter((dir) => existsSync(resolveInput(root, dir)))
  if (availableTemplateDirs.length === 0) {
    throw new PreflightError(`模板目录不存在：${TEMPLATE_DIRS.join('、')}`)
  }

  const tables = scanTables(matrixText)
  const structureIssues = []
  const cells = []

  const mainTable = findMainTable(tables)
  if (!mainTable) {
    structureIssues.push({
      ...makeProblem('main-table-missing', '找不到第 3 节主矩阵表', '按八类乘六阶段补表'),
      line: 0,
    })
    for (const type of MAIN_TYPES) {
      for (const phase of PHASES) {
        cells.push(
          placeholderCell(
            'main',
            type,
            phase,
            0,
            'main-table-missing',
            '主矩阵表缺失，该格按缺失计',
          ),
        )
      }
    }
  } else {
    cells.push(...parseMainCells(mainTable, structureIssues))
  }

  cells.push(...parseAdditionalCells(tables, matrixText, structureIssues))

  if (cells.length !== EXPECTED_TOTAL) {
    structureIssues.push({
      ...makeProblem(
        'matrix-shape',
        `解析得到 ${cells.length} 格，期望 ${EXPECTED_TOTAL} 格`,
        '检查主矩阵与附加类型表的行列数',
      ),
      line: 0,
    })
  }

  const rules = collectRules(root, moxianText, gatesText)
  const gates = collectGates(matrixText, gatesText)
  if (gates.size === 0) {
    structureIssues.push({
      ...makeProblem('matrix-shape', '矩阵第 2 节门禁名册为空', '补门禁名册表'),
      severity: 'warning',
      line: 0,
    })
    for (const name of FALLBACK_GATES) gates.add(name)
  }

  const context = {
    root,
    rules,
    gates,
    templates: overrides?.templates ?? TEMPLATE_FILES,
  }
  const stats = validateCells(cells, context)
  return buildResult(cells, structureIssues, stats)
}

function printText(result) {
  const main = result.coverage.main
  const additional = result.coverage.additional
  const total = result.coverage.total
  console.log(`[GATE-MATRIX] 矩阵覆盖率门禁 ${RULE}`)
  console.log(
    `[GATE-MATRIX] 主矩阵 ${main.covered}/${main.total}（${formatRatio(main.ratio)}）`,
  )
  console.log(
    `[GATE-MATRIX] 附加类型 ${additional.covered}/${additional.total}（${formatRatio(additional.ratio)}）`,
  )
  console.log(
    `[GATE-MATRIX] 合计 ${total.covered}/${total.total}（${formatRatio(total.ratio)}）`,
  )
  console.log(
    `[GATE-MATRIX] 字段齐全 动作 ${result.fields.action.covered}/${result.fields.action.total}、模板 ${result.fields.template.covered}/${result.fields.template.total}、门禁 ${result.fields.gate.covered}/${result.fields.gate.total}`,
  )
  const rules = result.references.rules
  const templates = result.references.templates
  const gates = result.references.gates
  console.log(
    `[GATE-MATRIX] 引用有效 规则 ${rules.total - rules.invalid}/${rules.total}（总册命中 ${rules.moxian}、伴随册命中 ${rules.companion}）、模板 ${templates.total - templates.invalid}/${templates.total}（文件 ${templates.file}、产物 ${templates.artifact}、无 ${templates.none}）、门禁 ${gates.total - gates.invalid}/${gates.total}（名册 ${gates.named}、人工 ${gates.manual}）`,
  )

  if (result.missing.length === 0) {
    console.log('[GATE-MATRIX] 缺失清单：无')
  } else {
    console.log(`[GATE-MATRIX] 缺失清单：${result.missing.length} 格`)
    for (const item of result.missing) {
      const facts = item.reasons.map((reason) => reason.detail).join('；')
      const hints = [...new Set(item.reasons.map((reason) => reason.hint))].join('；')
      console.log(
        `[GATE-MATRIX] ${MATRIX_REL}:${item.line} ${RULE} ${item.label} ${facts}；${hints}`,
      )
    }
  }

  for (const issue of result.structure) {
    console.log(
      `[GATE-MATRIX] ${issue.severity === 'error' ? '' : 'warn '}${MATRIX_REL}:${issue.line} ${RULE} ${issue.detail}；${issue.hint}`,
    )
  }

  for (const warning of result.warnings) {
    console.log(
      `[GATE-MATRIX] warn ${MATRIX_REL}:${warning.line} ${RULE} ${warning.label} ${warning.detail}；登记定义或复核`,
    )
  }

  if (result.errors > 0) {
    console.log(`FAILED: ${result.errors} error(s), ${result.warningCount} warning(s)`)
  } else {
    console.log(`PASS (gate: matrix, checks: ${result.checks}, warnings: ${result.warningCount})`)
  }
}

function toJson(result) {
  return {
    gate: result.gate,
    rule: result.rule,
    status: result.status,
    coverage: result.coverage,
    fields: result.fields,
    references: result.references,
    missing: result.missing,
    warnings: result.warnings,
    structure: result.structure,
    errors: result.errors,
    warningCount: result.warningCount,
    checks: result.checks,
    exitCode: result.exitCode,
  }
}

function writeFixtureFile(root, relativePath, content) {
  const absolutePath = join(root, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

function gateForPhase(phase) {
  const map = {
    受理与判级: '判级门',
    契约与设计: '契约门',
    拆分与派单: '派单门',
    执行: '自验门',
    测试与证据: '证据门',
    验收与收口: '收口门',
  }
  return map[phase] ?? '收口门'
}

function renderMainCell({ valuation, action, template, gate }) {
  const parts = [`**${valuation}**。${action}`.trim()]
  if (template) parts.push(`模板：${template}。`)
  if (gate) parts.push(`门禁：${gate}。`)
  return parts.join('<br>')
}

function mainFixtureCell(type, phase, fail) {
  const key = `${type}/${phase}`
  let valuation = '必做'
  let action = `完成${type}${phase}动作，依据 MXV2-6-03。`
  let template = 'proposal'
  let gate = gateForPhase(phase)

  if (key === '新功能/契约与设计') template = 'spec、design、组件 spec'
  if (key === '重构/契约与设计') template = 'design、ADR'
  if (key === '安全修复/受理与判级') template = 'proposal、repro 记录、change.md 受控节'
  if (key === '纯文档/契约与设计') {
    valuation = '不适用'
    action = '纯文档不产生运行契约。'
    template = '无'
    gate = '人工（owner 确认提纲）'
  }
  if (key === '纯文档/执行') {
    template = '无'
    gate = '自验门（文稿自查）'
  }
  if (key === '新功能/拆分与派单') gate = '结构门禁'

  if (fail) {
    if (key === '新功能/受理与判级') template = ''
    if (key === '新功能/契约与设计') template = 'no-such-template'
    if (key === '新功能/拆分与派单') gate = ''
    if (key === '新功能/执行') gate = '质量门'
    if (key === '新功能/测试与证据') action = ''
    if (key === '新功能/验收与收口') action = `${action}另见 MXV2-99-99。`
  }

  return renderMainCell({ valuation, action, template, gate })
}

function additionalFixtureAction(type, phase) {
  const suffix = type === '独立工具' && phase === '执行' ? '，依据 MXV2-11-42' : ''
  return `完成${type}${phase}动作，依据 MXV2-6-03${suffix}。`
}

function additionalFixtureTemplate(type, phase, fail) {
  const map = {
    文档交付: ['proposal（轻量）', '无（提纲写入受理记录）', 'task-card', '无', 'evidence', 'evidence、RETRO'],
    设计交付: ['proposal', 'design、token-change', 'tasks、task-card', 'task-card（执行记录）', 'evidence', 'evidence、RETRO'],
    独立工具: ['proposal', 'spec、cli-contract', 'tasks、task-card', 'task-card（执行记录）', 'evidence', 'evidence、RETRO'],
  }
  let value = map[type][PHASES.indexOf(phase)]
  if (fail && type === '文档交付' && phase === '测试与证据') value = 'no-such-template'
  return value
}

function additionalFixtureGate(type, phase, fail) {
  const map = {
    文档交付: ['判级门', '契约门（人工确认提纲）', '派单门', '自验门（文稿自查）', '证据门、文档校验门', '收口门'],
    设计交付: ['判级门', '契约门', '派单门', '自验门', '证据门、可访问性门', '收口门'],
    独立工具: ['判级门', '契约门', '派单门', '结构门禁', '证据门', '收口门'],
  }
  let value = map[type][PHASES.indexOf(phase)]
  if (fail && type === '设计交付' && phase === '执行') value = '质量门'
  return value
}

function fixtureMatrix(fail) {
  const lines = []
  lines.push('# 测试矩阵', '', '## 2 阶段、门禁与取值', '')
  lines.push('| 门禁 | 适用阶段或类型 | 判定方式 | 通过条件 | 不通过后果 |')
  lines.push('|---|---|---|---|---|')
  for (const gate of FIXTURE_GATES) {
    lines.push(`| ${gate} | 全部 | 人工 | 字段齐全 | 阻断 |`)
  }
  lines.push('', '## 3 主矩阵', '')
  lines.push('| 任务类型 | 受理与判级 | 契约与设计 | 拆分与派单 | 执行 | 测试与证据 | 验收与收口 | 必做与可省标注 |')
  lines.push('|---|---|---|---|---|---|---|---|')
  for (const type of MAIN_TYPES) {
    const rendered = PHASES.map((phase) => mainFixtureCell(type, phase, fail))
    lines.push(`| ${type} | ${rendered.join(' | ')} | 6 必做 |`)
  }
  lines.push('', '## 8 附加类型', '')
  for (const type of ADDITIONAL_TYPES) {
    lines.push(`${type}在六个阶段加做的必做项、模板与门禁见下表。`, '')
    lines.push('| 阶段 | 加做的必做项 | 模板 | 门禁 |')
    lines.push('|---|---|---|---|')
    for (const phase of PHASES) {
      lines.push(
        `| ${phase} | ${additionalFixtureAction(type, phase)} | ${additionalFixtureTemplate(type, phase, fail)} | ${additionalFixtureGate(type, phase, fail)} |`,
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

function buildFixture(root, variant, skipTemplates = []) {
  const fail = variant === 'fail'
  writeFixtureFile(
    root,
    MOXIAN_REL,
    [
      '# 总册',
      '',
      '- MX-5-21 复现记录写 `.tmp/intake/<CHG-ID>/repro.md`，记录环境、版本、复现步骤、期望结果、实际结果与严重级别六项。',
      '- MXV2-6-03 组件 spec 保留组件名与编号、状态矩阵、截图档位、复用来源四项。',
      '- MX-4-17 缺陷严重级别取致命、严重、一般、轻微四值。',
      '- MX-2-14 复核不可得时由 Lead 指派代理。',
      '- MX-12-01 回滚按文件、提交与推送三种状态分别执行。',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    root,
    GATES_REL,
    [
      '# 门禁',
      '',
      '### 3.1 结构门禁',
      '',
      '### 3.2 追溯门禁',
      '',
      '### 3.3 语言门禁',
      '',
      '### 3.4 契约一致性门禁',
      '',
      '### 3.5 增量覆盖率门禁',
      '',
      '### 3.6 证据完整性门禁',
      '',
      '### 3.7 文档校验门',
      '',
      '### 3.8 矩阵覆盖率门禁',
      '',
      '- `MX-G-59`（error）矩阵覆盖率门禁。',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    root,
    ROLES_REL,
    [
      '- MX-R-30 文档作者由产品、设计或后端担任。',
      '- MX-R-31 令牌文件由前端应用。',
      '- MX-R-32 工具目录 scope 写工具目录与构建产物路径。',
      '- MX-R-34 设计评审人的可指派范围与代理规则。',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    root,
    'docs/framework/domains/backend.md',
    [
      '- MXV2-11-42 资源边界用例覆盖会话 ID、上传 ID、文件路径与工具参数。',
      '- MX-BE-74 命令行契约字段七项。',
      '- MX-BE-76 命令行自验写构建、测试与产物校验三条命令。',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    root,
    'docs/framework/domains/product-design.md',
    [
      '- **MX-PD-62** 影响设计契约、token 或组件边界的决定写决策记录，五节固定为标题、状态、背景、决策与后果。',
      '- **MX-PD-64** 设计契约类写令牌名、旧值、新值、作用域、替代关系与废弃时间六项。',
      '- **MX-PD-66** 令牌取值、作用域、替代关系与废弃时间由设计评审人签。',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    root,
    'docs/framework/domains/testing.md',
    [
      '- MX-QA-57 重构等价性证据分前后两组，写提交号与执行人。',
      '- MX-QA-59 重复消息判定对象取三项，去重键取后端消息 ID。',
      '- MX-QA-60 断线与重连用例用固定夹具注入。',
      '',
    ].join('\n'),
  )
  writeFixtureFile(root, 'docs/plan/DECISIONS.md', '# 决策记录\n')
  const skipped = new Set(skipTemplates)
  for (const [alias, relativePath] of TEMPLATE_FILES) {
    if (skipped.has(alias)) continue
    writeFixtureFile(root, relativePath, `# 测试模板 ${relativePath}\n`)
  }
  writeFixtureFile(root, MATRIX_REL, fixtureMatrix(fail))
}

function selfTest() {
  const root = join(DEFAULT_ROOT, '.tmp', 'matrix-coverage-self-test')
  const passRoot = join(root, 'pass')
  const failRoot = join(root, 'fail')
  const results = []
  const check = (ok, text) => {
    results.push({ ok, text })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`)
  }

  try {
    buildFixture(passRoot, 'pass')
    buildFixture(failRoot, 'fail')
    const pass1 = run(passRoot)
    const pass2 = run(passRoot)
    const fail1 = run(failRoot)
    const fail2 = run(failRoot)

    const missingRoot = join(root, 'missing-file')
    buildFixture(missingRoot, 'pass', ['ADR'])
    const missingRun = run(missingRoot)
    const legacyRoster = new Map(
      [...TEMPLATE_FILES].filter(([alias]) => alias !== 'ADR' && alias !== 'repro'),
    )
    const legacyRun = run(passRoot, { templates: legacyRoster })

    const missingComponentRoot = join(root, 'missing-component-template')
    buildFixture(missingComponentRoot, 'pass', ['组件 spec'])
    const missingComponentRun = run(missingComponentRoot)
    const componentLegacyRoster = new Map(
      [...TEMPLATE_FILES].filter(([alias]) => alias !== '组件 spec'),
    )
    const componentLegacyRun = run(passRoot, { templates: componentLegacyRoster })

    check(
      pass1.coverage.main.covered === 48 && pass1.coverage.main.total === 48,
      `通过样例主矩阵 48/48，实际 ${pass1.coverage.main.covered}/${pass1.coverage.main.total}`,
    )
    check(
      pass1.coverage.additional.covered === 18 && pass1.coverage.additional.total === 18,
      `通过样例附加类型 18/18，实际 ${pass1.coverage.additional.covered}/${pass1.coverage.additional.total}`,
    )
    check(
      pass1.coverage.total.covered === 66 && pass1.coverage.total.total === 66,
      `通过样例合计 66/66，实际 ${pass1.coverage.total.covered}/${pass1.coverage.total.total}`,
    )
    check(pass1.errors === 0 && pass1.exitCode === 0, `通过样例 error 0、退出码 0，实际 ${pass1.errors}/${pass1.exitCode}`)
    check(
      pass1.warnings.length === 1 && pass1.warnings[0]?.kind === 'gate-manual',
      `通过样例人工门禁 warning 1，实际 ${pass1.warnings.length}（${pass1.warnings.map((item) => item.kind).join('、') || '无'}）`,
    )
    check(
      TEMPLATE_FILES.get('ADR') === 'docs/framework/templates/adr.md',
      `模板名册 ADR 指向 docs/framework/templates/adr.md，实际 ${TEMPLATE_FILES.get('ADR') ?? '缺失'}`,
    )
    check(
      TEMPLATE_FILES.get('repro') === 'docs/framework/templates/repro.md',
      `模板名册 repro 指向 docs/framework/templates/repro.md，实际 ${TEMPLATE_FILES.get('repro') ?? '缺失'}`,
    )
    check(
      TEMPLATE_FILES.get('组件 spec') === 'docs/framework/templates/component-spec.md',
      `模板名册组件 spec 指向 docs/framework/templates/component-spec.md，实际 ${TEMPLATE_FILES.get('组件 spec') ?? '缺失'}`,
    )
    check(
      ARTIFACT_TEMPLATES.size === 0,
      `产物类型名册已清空，实际 ${ARTIFACT_TEMPLATES.size} 项`,
    )

    check(
      fail1.coverage.main.covered === 42 && fail1.coverage.main.total === 48,
      `失败样例主矩阵 42/48，实际 ${fail1.coverage.main.covered}/${fail1.coverage.main.total}`,
    )
    check(
      fail1.coverage.additional.covered === 16 && fail1.coverage.additional.total === 18,
      `失败样例附加类型 16/18，实际 ${fail1.coverage.additional.covered}/${fail1.coverage.additional.total}`,
    )
    check(
      fail1.coverage.total.covered === 58 && fail1.coverage.total.total === 66,
      `失败样例合计 58/66，实际 ${fail1.coverage.total.covered}/${fail1.coverage.total.total}`,
    )
    check(fail1.missing.length === 8, `失败样例缺失格 8，实际 ${fail1.missing.length}`)
    check(fail1.errors === 8 && fail1.exitCode === 1, `失败样例 error 8、退出码 1，实际 ${fail1.errors}/${fail1.exitCode}`)

    const kinds = new Set(
      fail1.missing.flatMap((item) => item.reasons.map((reason) => reason.kind)),
    )
    for (const kind of [
      'action-missing',
      'template-missing',
      'template-unknown',
      'gate-missing',
      'gate-unknown',
      'rule-invalid',
    ]) {
      check(kinds.has(kind), `失败样例命中 ${kind}`)
    }

    const missingKinds = new Set(
      missingRun.missing.flatMap((item) => item.reasons.map((reason) => reason.kind)),
    )
    check(
      missingKinds.has('template-file-missing') && missingRun.exitCode === 1,
      `模板文件缺失样例命中 template-file-missing、退出码 1，实际 ${[...missingKinds].join('、') || '无'}、${missingRun.exitCode}`,
    )

    const missingComponentKinds = new Set(
      missingComponentRun.missing.flatMap((item) => item.reasons.map((reason) => reason.kind)),
    )
    check(
      missingComponentKinds.has('template-file-missing') && missingComponentRun.exitCode === 1,
      `组件 spec 模板文件缺失样例命中 template-file-missing、退出码 1，实际 ${[...missingComponentKinds].join('、') || '无'}、${missingComponentRun.exitCode}`,
    )

    const legacyKinds = new Set(
      legacyRun.missing.flatMap((item) => item.reasons.map((reason) => reason.kind)),
    )
    check(
      legacyKinds.has('template-unknown') && legacyRun.errors === 2 && legacyRun.exitCode === 1,
      `旧名册样例命中 template-unknown 2 格、退出码 1，实际 ${legacyRun.errors}、${legacyRun.exitCode}`,
    )

    const componentLegacyKinds = new Set(
      componentLegacyRun.missing.flatMap((item) => item.reasons.map((reason) => reason.kind)),
    )
    check(
      componentLegacyKinds.has('template-unknown') && componentLegacyRun.errors === 1 && componentLegacyRun.exitCode === 1,
      `组件 spec 未登记名册样例命中 template-unknown 1 格、退出码 1，实际 ${componentLegacyRun.errors}、${componentLegacyRun.exitCode}`,
    )

    const stable = (left, right) =>
      JSON.stringify(left.coverage) === JSON.stringify(right.coverage) &&
      JSON.stringify(left.missing) === JSON.stringify(right.missing) &&
      JSON.stringify(left.warnings) === JSON.stringify(right.warnings)
    check(stable(pass1, pass2), '通过样例连续两次覆盖率与缺失清单一致')
    check(stable(fail1, fail2), '失败样例连续两次覆盖率与缺失清单一致')
  } catch (error) {
    check(false, `自检运行失败：${error.message}`)
  }

  const ok = results.every((result) => result.ok)
  console.log(ok ? 'SELF-TEST PASS' : 'SELF-TEST FAILED')
  process.exit(ok ? 0 : 1)
}

function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`参数错误：${error.message}`)
    console.error(usage())
    process.exit(2)
  }

  if (options.help) {
    console.log(usage())
    process.exit(0)
  }
  if (options.selfTest) {
    selfTest()
    return
  }

  try {
    const result = run(options.root ?? DEFAULT_ROOT)
    if (options.json) console.log(JSON.stringify(toJson(result), null, 2))
    else printText(result)
    process.exitCode = result.exitCode
    return
  } catch (error) {
    if (error instanceof PreflightError) {
      console.error(`运行前置失败：${error.message}`)
      process.exit(2)
    }
    throw error
  }
}

// 规则级命令已移交 ai-review；本脚本按整套门禁运行，不接受 --rule 参数。

main()



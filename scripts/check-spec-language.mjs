#!/usr/bin/env node
/**
 * check-spec-language.mjs：AC 语言门禁（零依赖，只读）
 *
 * 规则表以 docs/process/SPEC-STANDARD.md 第 2.5 节为准，脚本只读 specs 目录下
 * 名为 spec.md 的文件，不读 docs/process，也不修改任何文件。
 * 只有以列表项开头且用反引号包住 AC 编号的行才算 AC 定义行，正则与
 * scripts/check-sdd.mjs 保持同一口径（AC-(?:[A-Z0-9]+-){2,}\d+）。
 *
 * 七条规则：
 *   R1 禁用词：定义行命中第 2.2 节词表任一，error。
 *   R2 数字无比较符：数字前后既无比较符也无单位，warning。
 *   R3 无脚本且未写人工：行内既无 scripts/ac/ 也无 人工: 或 N/A：，error。
 *   R4 非法状态词：状态声明或判定词落在四值之外，error。
 *   R5 主语缺失：编号后的陈述以该、这个、上述、相关等指代词开头，warning。
 *   R6 超长：单行超过 240 字符，或定义跨超过 2 行，warning。
 *   R7 重复 AC ID：同一编号在本文或跨文件出现多次，error。
 *
 * 用法：
 *   node scripts/check-spec-language.mjs
 *   node scripts/check-spec-language.mjs --root <repo-root>
 *   node scripts/check-spec-language.mjs --json
 *   node scripts/check-spec-language.mjs --self-test
 *
 * 文本输出每行是 path:line R# hint，末行给出错误与警告总数。
 * --json 只输出 failures 与 warnings 两个数组，元素含 rule、severity、path、
 * line、hint。退出码 0 表示没有 error，1 表示有 error，2 表示参数或目录错误。
 * --self-test 在 .tmp/ac-tooling/fixtures/language 下生成固定样本，断言七条
 * 规则各命中一次、干净样本零命中，不读写真实仓库内容。
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const FIXTURE_DIR = join(DEFAULT_ROOT, '.tmp', 'ac-tooling', 'fixtures', 'language')

const AC_DEFINITION = /^\s*-\s+`AC-/
const AC_ID_GLOBAL = /AC-(?:[A-Z0-9]+-){2,}\d+/g
const AC_ID_ONE = /AC-(?:[A-Z0-9]+-){2,}\d+/

const BANNED_WORDS = [
  '尽量',
  '适当',
  '合理',
  '友好',
  '较快',
  '必要时',
  '应该',
  '建议',
  '可考虑',
  '较大',
  '差不多',
  '优化一下',
]

const LEGAL_STATUS = new Set(['pass', 'partial', 'missing', 'blocked', 'covered', 'conditional', 'gap'])
// 这些词只用于 AC 判定，出现在定义行即视为四值之外的判定词。
const ILLEGAL_STATUS_WORDS = ['基本通过', '待观察', '不通过', '未通过', '已通过']
// 状态声明冒号后只有落在判定词集合里才检查，避免把「六类状态：产品 spec」当成判定。
const JUDGEMENT_WORDS = new Set([
  ...LEGAL_STATUS,
  ...ILLEGAL_STATUS_WORDS,
  '通过',
  '失败',
  '待定',
  '未知',
  'TBD',
  'WIP',
  'OK',
  'ok',
  'PASS',
  'FAIL',
])
const STATUS_DECLARATION = /(?:状态|判定|结果|status)\s*[:：=]\s*`?([A-Za-z\u4e00-\u9fff]+)/g

const VAGUE_SUBJECT = /^(?:该|这个|上述|相关|上面|此)/
const SCRIPT_OR_MANUAL = /scripts\/ac\/[^\s`）)]*\.mjs|人工\s*[:：]|N\/A\s*[:：]/

const COMPARATOR_BEFORE =
  /(?:>=|<=|>|<|=|≥|≤|±|不少于|不超过|大于|小于|等于|至少|至多|最多|最少|高于|低于|超过|不足|达到|约)\s*$/
const UNIT_AFTER =
  /^\s*(?:%|ms|毫秒|秒|分钟|小时|天|px|pt|dp|em|rem|vh|vw|次|条|个|处|行|字|字节|点|帧|人|项|倍|档|位|层|组|页|元|轮|步|张|根|列|名|GB|MB|KB|kb|mb|gb|s(?![\w])|B(?![A-Za-z]))/
const RANGE_AFTER = /^[-–—~×]/
const IDENTIFIER_CHAR = /[A-Za-z0-9_.:/\-]/

const RULES = {
  R1: 'error',
  R2: 'warning',
  R3: 'error',
  R4: 'error',
  R5: 'warning',
  R6: 'warning',
  R7: 'error',
}

/** 一条定义文字里出现的 AC 编号，用于 R7 去重与 R5 取编号后的主语。 */
function extractIds(text) {
  return text.match(AC_ID_GLOBAL) ?? []
}

/** 去掉编号与文件路径后再找数字，避免把 AC-CONV-001-01 或 :132 当成量值。 */
function stripIdentifiers(text) {
  return text
    .replace(AC_ID_GLOBAL, ' ')
    .replace(/[A-Za-z0-9_./\\-]+\.(?:mjs|tsx?|jsx?|go|css|json|md|png|log|exe|ps1)\S*/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
}

/**
 * R2 的判定口径是「数字前后既没有比较符也没有单位」。
 * 编号、路径、日期、时间、端口这类标识符里的数字不参与判定，用相邻字符排除。
 */
function numbersWithoutComparator(text) {
  const value = stripIdentifiers(text)
  const hits = []
  const pattern = /\d+(?:\.\d+)?/g
  let match = pattern.exec(value)
  while (match !== null) {
    const start = match.index
    const end = start + match[0].length
    const before = value.slice(Math.max(0, start - 8), start)
    const after = value.slice(end, end + 8)
    const prev = start > 0 ? value[start - 1] : ''
    const next = end < value.length ? value[end] : ''
    if (IDENTIFIER_CHAR.test(prev) || (next && IDENTIFIER_CHAR.test(next) && !UNIT_AFTER.test(after))) {
      match = pattern.exec(value)
      continue
    }
    if (COMPARATOR_BEFORE.test(before) || UNIT_AFTER.test(after) || RANGE_AFTER.test(after)) {
      match = pattern.exec(value)
      continue
    }
    hits.push(match[0])
    match = pattern.exec(value)
  }
  return hits
}

/** 定义行可能续行，收集到空行、标题、下一条列表项或表格为止。 */
function collectEntryLines(lines, index) {
  const entry = [lines[index]]
  let cursor = index + 1
  while (cursor < lines.length) {
    const next = lines[cursor]
    if (
      /^\s*$/.test(next) ||
      /^#{1,6}\s/.test(next) ||
      /^\s*[-*+]\s+/.test(next) ||
      /^\s*\|/.test(next) ||
      /^\s*>/.test(next)
    ) {
      break
    }
    entry.push(next)
    cursor += 1
  }
  return entry
}

/** 递归收集 root 下所有 spec.md，路径排序保证输出稳定。 */
function findSpecFiles(dir) {
  const found = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...findSpecFiles(full))
    } else if (entry.isFile() && entry.name === 'spec.md') {
      found.push(full)
    }
  }
  found.sort()
  return found
}

function issue(rule, file, line, hint) {
  return {
    rule,
    severity: RULES[rule],
    path: file,
    line,
    hint,
  }
}

/**
 * 执行全部规则。返回的 failures 只装 error，warnings 只装 warning。
 * 每条定义行对同一规则最多记一次，避免状态声明与词表重复命中。
 */
function lintRoot(root) {
  const failures = []
  const warnings = []
  const occurrences = new Map()
  const specsDir = join(root, 'specs')

  for (const absolute of findSpecFiles(specsDir)) {
    const display = relative(root, absolute).split('\\').join('/')
    let content
    try {
      content = readFileSync(absolute, 'utf8')
    } catch {
      failures.push(issue('R7', display, 0, '文件不可读，无法完成重复编号检查'))
      continue
    }
    const lines = content.split(/\r?\n/)

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!AC_DEFINITION.test(line)) continue
      const ids = extractIds(line)
      const lineNo = index + 1
      const entry = collectEntryLines(lines, index)
      const ruleHits = new Set()

      if (BANNED_WORDS.some((word) => line.includes(word))) ruleHits.add('R1')
      if (numbersWithoutComparator(line).length > 0) ruleHits.add('R2')
      if (!SCRIPT_OR_MANUAL.test(line)) ruleHits.add('R3')

      STATUS_DECLARATION.lastIndex = 0
      let declaration = STATUS_DECLARATION.exec(line)
      while (declaration !== null) {
        if (JUDGEMENT_WORDS.has(declaration[1]) && !LEGAL_STATUS.has(declaration[1])) ruleHits.add('R4')
        declaration = STATUS_DECLARATION.exec(line)
      }
      if (ILLEGAL_STATUS_WORDS.some((word) => line.includes(word))) ruleHits.add('R4')

      if (ids.length === 0) {
        ruleHits.add('R5')
      } else {
        const afterId = line.slice(line.indexOf(ids[0]) + ids[0].length)
        const statement = afterId.replace(/^[\s`*_：:，,、。；;—–-]+/, '')
        if (VAGUE_SUBJECT.test(statement)) ruleHits.add('R5')
      }

      const characterCount = Array.from(line).length
      if (characterCount > 240 || entry.length > 2) ruleHits.add('R6')

      // 定义编号取行内第一个 AC，脚本路径 `scripts/ac/<AC-ID>.mjs` 里的编号是引用，不参与去重。
      const definitionId = ids[0]
      if (definitionId) {
        if (!occurrences.has(definitionId)) occurrences.set(definitionId, [])
        occurrences.get(definitionId).push({ path: display, line: lineNo })
      }

      for (const rule of ruleHits) {
        const target = RULES[rule] === 'error' ? failures : warnings
        target.push(issue(rule, display, lineNo, hintFor(rule)))
      }
    }
  }

  for (const [id, places] of occurrences) {
    if (places.length < 2) continue
    const first = places[0]
    for (const place of places.slice(1)) {
      failures.push(issue('R7', place.path, place.line, `重复编号 ${id}，首次出现于 ${first.path}:${first.line}，改用唯一编号`))
    }
  }

  failures.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)))
  warnings.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)))
  return { failures, warnings }
}

function hintFor(rule) {
  switch (rule) {
    case 'R1':
      return '删除禁用词，改写成带阈值、单位或可测属性的陈述'
    case 'R2':
      return '给数字补比较符与单位，例如 44px 或 ≤ 500ms'
    case 'R3':
      return '补 scripts/ac/<AC-ID>.mjs，或写 人工:<动作> 与 N/A：<理由>'
    case 'R4':
      return '状态只写 pass、partial、missing、blocked 四值'
    case 'R5':
      return '主语改用 AC 编号、选择器或端点路径，去掉指代词'
    case 'R6':
      return '拆成多条 AC，单条定义控制在 2 行与 240 字符以内'
    case 'R7':
      return '重复编号改用唯一编号，并回写引用处'
    default:
      return '按语言标准改写'
  }
}

function printText(result) {
  for (const item of [...result.failures, ...result.warnings]) {
    console.log(`${item.path}:${item.line} ${item.rule} ${item.hint}`)
  }
  if (result.failures.length === 0) {
    console.log(`PASS (errors: 0, warnings: ${result.warnings.length})`)
  } else {
    console.log(`FAILED: ${result.failures.length} error(s), ${result.warnings.length} warning(s)`)
  }
}

/** 自检样本固定写入 .tmp，不触碰真实 spec，重复运行时覆盖同一批文件。 */
function writeSelfTestFixtures() {
  const badSpec = join(FIXTURE_DIR, 'bad', 'specs', 'product', 'PX-TEST', 'spec.md')
  const dupSpec = join(FIXTURE_DIR, 'bad', 'specs', 'product', 'PX-DUP', 'spec.md')
  const cleanSpec = join(FIXTURE_DIR, 'clean', 'specs', 'product', 'PX-CLEAN', 'spec.md')
  mkdirSync(dirname(badSpec), { recursive: true })
  mkdirSync(dirname(dupSpec), { recursive: true })
  mkdirSync(dirname(cleanSpec), { recursive: true })

  const longText = '边界场景覆盖稳定选择器与固定取值。'.repeat(20)
  writeFileSync(
    badSpec,
    [
      '# 自检样本：七条规则各命中一次',
      '',
      '- `AC-TST-001-01` 尽量在 500ms 内响应，脚本 `scripts/ac/AC-TST-001-01.mjs`。',
      '- `AC-TST-001-02` 数字 42 没有比较符或单位，脚本 `scripts/ac/AC-TST-001-02.mjs`。',
      '- `AC-TST-001-03` 响应时间不超过 500ms 时展示结果。',
      '- `AC-TST-001-04` 状态：通过，脚本 `scripts/ac/AC-TST-001-04.mjs`。',
      '- `AC-TST-001-05` 该按钮高度为 44px，脚本 `scripts/ac/AC-TST-001-05.mjs`。',
      `- \`AC-TST-001-06\` ${longText}脚本 \`scripts/ac/AC-TST-001-06.mjs\`。`,
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    dupSpec,
    [
      '# 自检样本：重复编号',
      '',
      '- `AC-TST-001-07` 重复编号样本一，脚本 `scripts/ac/AC-TST-001-07.mjs`。',
      '- `AC-TST-001-07` 重复编号样本二，脚本 `scripts/ac/AC-TST-001-07.mjs`。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    cleanSpec,
    [
      '# 自检样本：干净定义',
      '',
      '- `AC-TST-900-01` `.panel` 的 `width` ≥ `44px`，采样点为面板元素，容差 `0px`；脚本 `scripts/ac/AC-TST-900-01.mjs`。',
      '- `AC-TST-900-02` 消息落库后 `500ms` 内出现未读点，脚本 `scripts/ac/AC-TST-900-02.mjs`。',
      '- `AC-TST-900-03` 底部汇总等于全部会话条数之和，脚本 `scripts/ac/AC-TST-900-03.mjs`。',
      '',
    ].join('\n'),
    'utf8',
  )
}

function runSelfTest() {
  writeSelfTestFixtures()
  const bad = lintRoot(join(FIXTURE_DIR, 'bad'))
  const clean = lintRoot(join(FIXTURE_DIR, 'clean'))
  const badAll = [...bad.failures, ...bad.warnings]
  const byRule = new Map()
  for (const item of badAll) byRule.set(item.rule, (byRule.get(item.rule) ?? 0) + 1)

  let ok = true
  for (const rule of Object.keys(RULES)) {
    const hits = byRule.get(rule) ?? 0
    const passed = hits === 1
    if (!passed) ok = false
    console.log(`${passed ? 'PASS' : 'FAIL'} ${rule} 命中 ${hits} 次，期望 1 次`)
  }
  const cleanCount = clean.failures.length + clean.warnings.length
  console.log(`${cleanCount === 0 ? 'PASS' : 'FAIL'} 干净样本命中 ${cleanCount} 次，期望 0 次`)
  if (cleanCount !== 0) ok = false
  const extra = badAll.length - Object.keys(RULES).length
  if (extra !== 0) {
    ok = false
    console.log(`FAIL 未归类命中 ${extra} 次，期望 0 次`)
  }
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

  let specsReadable = true
  try {
    readdirSync(join(options.root, 'specs'))
  } catch {
    specsReadable = false
  }
  if (!specsReadable) {
    console.error(`specs 目录不可读：${join(options.root, 'specs')}`)
    process.exit(2)
  }

  const result = lintRoot(options.root)
  if (options.json) {
    console.log(JSON.stringify({ failures: result.failures, warnings: result.warnings }, null, 0))
  } else {
    printText(result)
  }
  process.exit(result.failures.length > 0 ? 1 : 0)
}

main()

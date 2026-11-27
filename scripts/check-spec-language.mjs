#!/usr/bin/env node
/**
 * 规则级命令已移交 ai-review（MOXIAN 对应执行行注明“该脚本为批处理入口，不支持单跑”）；
 * 本脚本作为整套门禁运行，不再解析 --rule。
 * check-spec-language.mjs：AC 语言门禁（零依赖，只读）
 *
 * 规则表以 docs/process/SPEC-STANDARD.md 第 2.5 节为准，脚本只读 specs 目录下
 * 名为 spec.md 的文件，不读 docs/process，也不修改任何文件。
 * 只有以列表项开头且用反引号包住 AC 编号的行才算 AC 定义行，正则与
 * scripts/check-sdd.mjs 保持同一口径（AC-(?:[A-Z0-9]+-){2,}\d+）。
 *
 * 七条规则：
 *   R1 禁用词：定义行命中第 2.2 节词表任一，error。
 *   R2 数字无比较符：数字前后既无比较符也无单位，warning。HTTP 状态码
 *      （100–599 且上下文有 HTTP/返回/接口等标记）、纯计数（行数/条数/计数
 *      /数量/各/去重后）、N+、M×N、章节号 §N、二进制单位与容差属无量纲或
 *      标识符写法，不计入；耗时、进度等量值仍按缺单位报。
 *   R3 无脚本且未写人工：定义行（含续行）内既无 scripts/ac/ 也无 人工: 或
 *      N/A：，error。
 *   R4 非法状态词：状态声明或判定词落在四值之外，error。
 *   R5 主语缺失：编号后的陈述以该、这个、上述、相关等指代词开头，warning。
 *      简写编号 AC-NNN-NN 若同文件更早行或同域产品 spec 已定义对应完整编号
 *      （AC-<域>-NNN-NN），视为引用而非缺编号，不报。
 *   R6 超长：单行超过 240 字符，或定义跨超过 2 行，warning。
 *   R7 重复 AC ID：同一编号在本文或跨文件出现多次，error；判据映射节内
 *      不带判定/脚本声明的行，或形如 `- \`AC-…\` → 脚本` 的引用行，不算定义。
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
 * 规则各命中一次、干净样本零命中、判据映射行不计入重复、带声明的真实重复
 * 仍报 R7，以及 R2 误报族不报、R2 真缺单位仍报、R5 简写有定义放过与无定义
 * 仍报，共 17 条断言，不读写真实仓库内容。
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
// 判据映射行只引用既有 AC，不是定义：映射节内或以「→ 脚本」开头的行，
// 且不带「判定=」「脚本=」声明时不计入 R7；真定义都带声明，仍会被计数。
const MAPPING_HEADING = /判据映射|AC\s*映射|映射/
const MAPPING_ARROW_ROW = /^\s*-\s+`AC-[^`]+`\s*(?:→|->|=>)/
const DECLARED_JUDGEMENT = /判定\s*[:：=]/
const DECLARED_SCRIPT = /脚本\s*[:：=]/

const COMPARATOR_BEFORE =
  /(?:>=|<=|>|<|=|≥|≤|±|不少于|不超过|大于|小于|等于|至少|至多|最多|最少|高于|低于|超过|不足|达到|约)\s*$/
const COMPARATOR_AFTER = /^\s*\+(?!\d)/
const UNIT_AFTER =
  /^\s*(?:%|ms|毫秒|秒|分钟|小时|天|px|pt|dp|em|rem|vh|vw|次|条|个|处|行|字|字节|点|帧|人|项|倍|档|位|层|组|页|元|轮|步|张|根|列|名|类|种|值|结果|GB|MB|KB|MiB|GiB|KiB|TiB|kb|mb|gb|s(?![\w])|B(?![A-Za-z]))/
const RANGE_AFTER = /^[-–—~×]/
const RANGE_BEFORE = /[-–—~×]\s*$/
const TOLERANCE_BEFORE = /容差\s*[:：]?\s*$/
const HTTP_STATUS = /^\d{3}$/
const HTTP_MARKERS =
  /(?:HTTP|http|状态码|返回|响应|接口|端点|请求|发送|搜索|卡片|补取|置为|失败|错误|拒绝|命中|code|status|`?(?:GET|POST|PUT|PATCH|DELETE)\b)/
const TIME_MARKERS = /(?:耗时|时间|延迟|超时|时长|间隔|容量|大小|长度|宽度|高度|比例|进度|内存|磁盘|等待|字号|字体)/
const COUNT_BEFORE =
  /(?:行数|条数|计数|数量|个数|总数|卡片数|增量|差值|差|各|或|由|去重后)(?:\s*(?:为|是|=|：|:|均|都|仍|各|已))*\s*$/
const COUNT_CHANGE_BEFORE = /(?:由|从)\s*\d+(?:\.\d+)?\s*(?:变|到|至|变成|变为)\s*$/
const COUNT_NOUN = /(?:计数|行数|条数|数量|个数|次数|增量)/
const IDENTIFIER_CHAR = /[A-Za-z0-9_.:/\-]/
const AC_SHORT_GLOBAL = /AC-\d{3}-\d{2}/g

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
    .replace(AC_SHORT_GLOBAL, ' ')
    .replace(/§\s*\d+(?:\.\d+)*/g, ' ')
    .replace(/[A-Za-z0-9_./\\-]+\.(?:mjs|tsx?|jsx?|go|css|json|md|png|log|exe|ps1)\S*/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
}

/**
 * R2 的判定口径是「数字前后既没有比较符也没有单位」。
 * 编号、路径、日期、时间、端口这类标识符里的数字不参与判定，用相邻字符排除。
 * HTTP 状态码、纯计数、章节号、N+、M×N 与容差是无量纲写法，按上下文放过；
 * 耗时、进度、尺寸等真量值即使同一行出现「返回」也不放过，由时间词反向阻断。
 */
function numbersWithoutComparator(text) {
  const value = stripIdentifiers(text).replace(/`/g, ' ')
  const hits = []
  const pattern = /\d+(?:\.\d+)?/g
  let match = pattern.exec(value)
  while (match !== null) {
    const start = match.index
    const end = start + match[0].length
    const before = value.slice(Math.max(0, start - 16), start)
    const after = value.slice(end, end + 10)
    const prev = start > 0 ? value[start - 1] : ''
    const next = end < value.length ? value[end] : ''
    const nearby = value.slice(Math.max(0, start - 12), Math.min(value.length, end + 6))
    const timeQuantity = TIME_MARKERS.test(nearby)
    const statusCode =
      !timeQuantity &&
      HTTP_STATUS.test(match[0]) &&
      Number(match[0]) >= 100 &&
      Number(match[0]) <= 599 &&
      HTTP_MARKERS.test(value)
    const count =
      !timeQuantity &&
      (COUNT_BEFORE.test(before) ||
        (COUNT_NOUN.test(value) &&
          (COUNT_CHANGE_BEFORE.test(before) || /^\s*(?:变|到|至)/.test(after))))
    const exempt =
      COMPARATOR_BEFORE.test(before) ||
      COMPARATOR_AFTER.test(after) ||
      UNIT_AFTER.test(after) ||
      RANGE_AFTER.test(after) ||
      RANGE_BEFORE.test(before) ||
      TOLERANCE_BEFORE.test(before) ||
      statusCode ||
      count
    if (IDENTIFIER_CHAR.test(prev) || (next && IDENTIFIER_CHAR.test(next) && !UNIT_AFTER.test(after))) {
      match = pattern.exec(value)
      continue
    }
    if (exempt) {
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
  const productIdCache = new Map()
  const productIdsFor = (domain) => {
    if (!domain) return []
    if (productIdCache.has(domain)) return productIdCache.get(domain)
    let ids = []
    try {
      const productSpec = join(specsDir, 'product', domain, 'spec.md')
      ids = readFileSync(productSpec, 'utf8').match(AC_ID_GLOBAL) ?? []
    } catch {
      ids = []
    }
    productIdCache.set(domain, ids)
    return ids
  }

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
    let heading = ''
    const domainMatch = /^specs\/(?:product|backend|frontend|changes)\/([^/]+)\//.exec(display)
    const productIds = productIdsFor(domainMatch ? domainMatch[1] : '')
    const fileFullIds = new Set()

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const headingMatch = /^#{1,6}\s+(.*)$/.exec(line)
      if (headingMatch) heading = headingMatch[1]
      if (!AC_DEFINITION.test(line)) continue
      const declared = DECLARED_JUDGEMENT.test(line) || DECLARED_SCRIPT.test(line)
      if (!declared && (MAPPING_HEADING.test(heading) || MAPPING_ARROW_ROW.test(line))) continue
      const ids = extractIds(line)
      const shortIds = line.match(AC_SHORT_GLOBAL) ?? []
      for (const id of ids) fileFullIds.add(id)
      const resolvedShorthand =
        shortIds.length > 0 &&
        shortIds.every((shortId) => {
          const tail = `-${shortId.replace(/^AC-/, '')}`
          return (
            [...fileFullIds].some((fullId) => fullId.endsWith(tail)) ||
            productIds.some((fullId) => fullId.endsWith(tail))
          )
        })
      const lineNo = index + 1
      const entry = collectEntryLines(lines, index)
      const ruleHits = new Set()

      if (BANNED_WORDS.some((word) => line.includes(word))) ruleHits.add('R1')
      if (numbersWithoutComparator(line).length > 0) ruleHits.add('R2')
      if (!SCRIPT_OR_MANUAL.test(entry.join(' '))) ruleHits.add('R3')

      STATUS_DECLARATION.lastIndex = 0
      let declaration = STATUS_DECLARATION.exec(line)
      while (declaration !== null) {
        if (JUDGEMENT_WORDS.has(declaration[1]) && !LEGAL_STATUS.has(declaration[1])) ruleHits.add('R4')
        declaration = STATUS_DECLARATION.exec(line)
      }
      if (ILLEGAL_STATUS_WORDS.some((word) => line.includes(word))) ruleHits.add('R4')

      if (ids.length === 0 && shortIds.length === 0) {
        ruleHits.add('R5')
      } else if (ids.length === 0 && !resolvedShorthand) {
        ruleHits.add('R5')
      } else {
        const anchorId = ids[0] ?? shortIds[0]
        const afterId = line.slice(line.indexOf(anchorId) + anchorId.length)
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
  const mapProductSpec = join(FIXTURE_DIR, 'map', 'specs', 'product', 'PX-MAP', 'spec.md')
  const mapChangeSpec = join(FIXTURE_DIR, 'map', 'specs', 'changes', 'PX-MAP', 'spec.md')
  const dup2Spec = join(FIXTURE_DIR, 'dup', 'specs', 'product', 'PX-DUP2', 'spec.md')
  const r2CleanSpec = join(FIXTURE_DIR, 'r2-clean', 'specs', 'product', 'PX-R2C', 'spec.md')
  const r2TrueSpec = join(FIXTURE_DIR, 'r2-true', 'specs', 'product', 'PX-R2T', 'spec.md')
  const r5SameSpec = join(FIXTURE_DIR, 'r5-same', 'specs', 'backend', 'PX-R5S', 'spec.md')
  const r5ProductSpec = join(FIXTURE_DIR, 'r5-product', 'specs', 'product', 'PX-R5P', 'spec.md')
  const r5BackendSpec = join(FIXTURE_DIR, 'r5-product', 'specs', 'backend', 'PX-R5P', 'spec.md')
  const r5NoneSpec = join(FIXTURE_DIR, 'r5-none', 'specs', 'backend', 'PX-R5N', 'spec.md')
  const r5VagueProductSpec = join(FIXTURE_DIR, 'r5-vague', 'specs', 'product', 'PX-R5V', 'spec.md')
  const r5VagueBackendSpec = join(FIXTURE_DIR, 'r5-vague', 'specs', 'backend', 'PX-R5V', 'spec.md')
  mkdirSync(dirname(badSpec), { recursive: true })
  mkdirSync(dirname(dupSpec), { recursive: true })
  mkdirSync(dirname(cleanSpec), { recursive: true })
  mkdirSync(dirname(mapProductSpec), { recursive: true })
  mkdirSync(dirname(mapChangeSpec), { recursive: true })
  mkdirSync(dirname(dup2Spec), { recursive: true })
  for (const spec of [
    r2CleanSpec,
    r2TrueSpec,
    r5SameSpec,
    r5ProductSpec,
    r5BackendSpec,
    r5NoneSpec,
    r5VagueProductSpec,
    r5VagueBackendSpec,
  ]) {
    mkdirSync(dirname(spec), { recursive: true })
  }

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
  writeFileSync(
    mapProductSpec,
    [
      '# 自检样本：判据映射的定义',
      '',
      '- `AC-TST-002-01` 映射样本定义，判定=`自动`；脚本=scripts/ac/AC-TST-002-01.mjs。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    mapChangeSpec,
    [
      '# 自检样本：判据映射表',
      '',
      '### 4.1 判据映射',
      '',
      '- `AC-TST-002-01` → `scripts/ac/AC-TST-002-01.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    dup2Spec,
    [
      '# 自检样本：真实重复定义',
      '',
      '- `AC-TST-002-02` 重复一定义，判定=`自动`；脚本=scripts/ac/AC-TST-002-02.mjs。',
      '- `AC-TST-002-02` 重复二定义，判定=`自动`；脚本=scripts/ac/AC-TST-002-02.mjs。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r2CleanSpec,
    [
      '# 自检样本：R2 误报族不报',
      '',
      '- `AC-R2C-001-01` 接口返回 404。判定=`自动`；脚本=scripts/ac/AC-R2C-001-01.mjs。',
      '- `AC-R2C-001-02` 角标文本 = `9+`。判定=`自动`；脚本=scripts/ac/AC-R2C-001-02.mjs。',
      '- `AC-R2C-001-03` 键盘 4×2 映射。判定=`自动`；脚本=scripts/ac/AC-R2C-001-03.mjs。',
      '- `AC-R2C-001-04` 会话行各 1 条，任务行数为 0。判定=`自动`；脚本=scripts/ac/AC-R2C-001-04.mjs。',
      '- `AC-R2C-001-05` 单文件上限 20 MiB。判定=`自动`；脚本=scripts/ac/AC-R2C-001-05.mjs。',
      '- `AC-R2C-001-06` 自定义视图 13 类块。判定=`自动`；脚本=scripts/ac/AC-R2C-001-06.mjs。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r2TrueSpec,
    [
      '# 自检样本：R2 真缺单位仍报',
      '',
      '- `AC-R2T-001-01` 首屏耗时 500 后返回结果。判定=`自动`；脚本=scripts/ac/AC-R2T-001-01.mjs。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r5SameSpec,
    [
      '# 自检样本：同文件缩写定义',
      '',
      '- `AC-PX-R5S-001-01` 完整编号定义行。判定=`自动`；脚本=scripts/ac/AC-PX-R5S-001-01.mjs。',
      '- `AC-001-01` “同文件简写”：引用前一条完整编号。判定=`人工`；脚本=N/A：无脚本。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r5ProductSpec,
    [
      '# 自检样本：产品侧完整编号',
      '',
      '- `AC-PX-R5P-004-01` 产品侧完整定义行。判定=`自动`；脚本=scripts/ac/AC-PX-R5P-004-01.mjs。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r5BackendSpec,
    [
      '# 自检样本：同域产品缩写',
      '',
      '- `AC-004-01` “跨列简写”：引用产品侧定义。判定=`人工`；脚本=N/A：无脚本。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r5NoneSpec,
    [
      '# 自检样本：缩写无定义',
      '',
      '- `AC-006-07` “孤立简写”：从未定义。判定=`人工`；脚本=N/A：无脚本。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r5VagueProductSpec,
    [
      '# 自检样本：缩写有定义但主语指代',
      '',
      '- `AC-PX-R5V-007-01` 产品侧完整定义。判定=`自动`；脚本=scripts/ac/AC-PX-R5V-007-01.mjs。',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    r5VagueBackendSpec,
    [
      '# 自检样本：缩写已定义仍检查主语',
      '',
      '- `AC-007-01` 该接口返回 200。判定=`人工`；脚本=N/A：无脚本。',
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

  const assertions = []
  const assert = (name, ok, detail = '') => assertions.push({ name, ok: Boolean(ok), detail })
  for (const rule of Object.keys(RULES)) {
    const hits = byRule.get(rule) ?? 0
    assert(`${rule} 命中次数`, hits === 1, `期望 1 实际 ${hits}`)
  }
  const cleanCount = clean.failures.length + clean.warnings.length
  assert('干净样本命中次数', cleanCount === 0, `期望 0 实际 ${cleanCount}`)

  const map = lintRoot(join(FIXTURE_DIR, 'map'))
  const mapR7 = [...map.failures, ...map.warnings].filter((item) => item.rule === 'R7').length
  assert('映射行不计入重复编号', mapR7 === 0, `期望 0 实际 ${mapR7}`)
  const dup2 = lintRoot(join(FIXTURE_DIR, 'dup'))
  const dup2R7 = [...dup2.failures, ...dup2.warnings].filter((item) => item.rule === 'R7').length
  assert('真实重复定义仍报 R7', dup2R7 === 1, `期望 1 实际 ${dup2R7}`)

  const r2Clean = lintRoot(join(FIXTURE_DIR, 'r2-clean'))
  const r2CleanAll = [...r2Clean.failures, ...r2Clean.warnings]
  assert(
    'R2 误报族不报',
    r2CleanAll.filter((item) => item.rule === 'R2').length === 0,
    `期望 0 实际 ${r2CleanAll.filter((item) => item.rule === 'R2').length}`,
  )
  assert('R2 误报样本整体零命中', r2CleanAll.length === 0, `期望 0 实际 ${r2CleanAll.length}`)
  const r2True = lintRoot(join(FIXTURE_DIR, 'r2-true'))
  const r2TrueHits = [...r2True.failures, ...r2True.warnings].filter((item) => item.rule === 'R2')
  assert('R2 真缺单位仍报', r2TrueHits.length === 1, `期望 1 实际 ${r2TrueHits.length}`)

  const r5Same = lintRoot(join(FIXTURE_DIR, 'r5-same'))
  const r5SameHits = [...r5Same.failures, ...r5Same.warnings].filter((item) => item.rule === 'R5').length
  assert('缩写同文件已定义放过', r5SameHits === 0, `期望 0 实际 ${r5SameHits}`)
  const r5Product = lintRoot(join(FIXTURE_DIR, 'r5-product'))
  const r5ProductHits = [...r5Product.failures, ...r5Product.warnings].filter((item) => item.rule === 'R5').length
  assert('缩写同域产品已定义放过', r5ProductHits === 0, `期望 0 实际 ${r5ProductHits}`)
  const r5None = lintRoot(join(FIXTURE_DIR, 'r5-none'))
  const r5NoneHits = [...r5None.failures, ...r5None.warnings].filter((item) => item.rule === 'R5').length
  assert('缩写无定义仍报', r5NoneHits === 1, `期望 1 实际 ${r5NoneHits}`)
  const r5Vague = lintRoot(join(FIXTURE_DIR, 'r5-vague'))
  const r5VagueHits = [...r5Vague.failures, ...r5Vague.warnings].filter((item) => item.rule === 'R5').length
  assert('缩写有定义但主语指代仍报', r5VagueHits === 1, `期望 1 实际 ${r5VagueHits}`)

  // 未归类命中是覆盖性守卫，不计入断言数；命中时直接判失败并在末行注明。
  const extra = badAll.length - Object.keys(RULES).length
  const failed = assertions.filter((entry) => !entry.ok)
  for (const entry of assertions) {
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}（${entry.detail}）`)
  }
  if (extra !== 0) {
    console.log(`FAIL 未归类命中（期望 0 实际 ${extra}）`)
  }
  if (failed.length > 0 || extra !== 0) {
    const suffix = extra !== 0 ? `, ${extra} unclassified hits` : ''
    console.log(`SELF-TEST FAILED (${failed.length}/${assertions.length} assertions failed${suffix})`)
    return 1
  }
  console.log(`SELF-TEST PASS (${assertions.length} assertions)`)
  return 0
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

// 规则级命令已移交 ai-review；本脚本按整套门禁运行，不接受 --rule 参数。

main()



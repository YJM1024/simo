#!/usr/bin/env node
/**
 * check-format.mjs — 格式体检：把字段位置、节名、列名、编号顺序这类只关心表达形式的检查
 * 合成一条机械检查，一次跑出全部问题清单，允许批量修完。
 *
 * 口径：本脚本只作提交前的一次性体检，输出问题清单与 JSON，退出码恒为 0；格式问题不得作为
 * “验收不通过”的理由反复打回。判据内容是否正确、证据是否齐备仍由 check-gates、check-points、
 * check-mapping、check-rule-fields 与验收员判定。
 *
 * 用法：
 *   node scripts/check-format.mjs
 *   node scripts/check-format.mjs --json .out/evidence/format-health.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frameworkDir } from './lib/framework-root.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CHANGE = 'specs/changes/CHG-FW-002/proposal.md'
// 框架正文是外部依赖：读 SIMO_FRAMEWORK_ROOT（默认同级目录 ../moxian-framework）下的 docs/framework。
const BOOK = join(frameworkDir(ROOT), 'MOXIAN.md')
const BOOK_LABEL = 'docs/framework/MOXIAN.md'

const HEADER_FIELDS = ['状态', 'Implements', 'Covers', 'Change', '变更类型', 'Owner', '变更号', '标题', '负责人', '判级', '创建日期', '关闭日期']
const STATUS = ['草稿', '已冻结', '实现中', '通过']
const LEVELS = ['点级', '变更级', '建域级']
const SECTIONS = ['头部', '目标与背景', '范围与非目标', '影响面', '五列契约索引', '任务卡清单', '证据索引', '风险与依赖', '状态流转记录', '收口', '验收判据', '流程点登记', '待确认']
const TASK_COLUMNS = ['卡号', '任务', 'Owner', '写作用域', '依赖', 'AC', '证据', '档位', '禁止项', '评审人', '状态']
const AC_SECTION = '验收判据'

function read(rel) {
  const full = isAbsolute(rel) ? rel : join(ROOT, rel)
  return readFileSync(full, 'utf8').split(/\r?\n/)
}

function issuesForProposal() {
  const lines = read(CHANGE)
  const issues = []
  const header = new Map()
  for (let i = 0; i < Math.min(lines.length, 80); i += 1) {
    const match = /^([^：:]{1,10})[：:](.*)$/.exec(lines[i])
    if (match) header.set(match[1], { value: match[2].trim(), line: i + 1 })
  }
  for (const field of HEADER_FIELDS) {
    if (!header.has(field)) issues.push({ file: CHANGE, line: 1, kind: '字段缺失', message: `首部缺字段 ${field}` })
  }
  const order = [...header.keys()].filter((key) => HEADER_FIELDS.includes(key))
  const expectedOrder = HEADER_FIELDS.filter((field) => header.has(field))
  if (order.join('|') !== expectedOrder.join('|')) {
    issues.push({ file: CHANGE, line: 3, kind: '字段顺序', message: `首部字段顺序 ${order.join('/')} 与约定不一致` })
  }
  const status = header.get('状态')
  if (status && !STATUS.includes(status.value)) issues.push({ file: CHANGE, line: status.line, kind: '取值', message: `状态取值「${status.value}」不是四值之一` })
  const level = header.get('判级')
  if (level && !LEVELS.includes(level.value)) issues.push({ file: CHANGE, line: level.line, kind: '取值', message: `判级取值「${level.value}」不是三级之一` })

  const headingRows = lines.map((line, index) => ({ line: index + 1, match: /^##\s+(\d+)\s+(.+)$/.exec(line) })).filter((row) => row.match)
  const found = headingRows.map((row) => ({ num: Number(row.match[1]), title: row.match[2].trim(), line: row.line }))
  for (let index = 0; index < SECTIONS.length; index += 1) {
    const want = SECTIONS[index]
    const row = found[index]
    if (!row || row.title !== want) issues.push({ file: CHANGE, line: row ? row.line : 1, kind: '节名', message: `第 ${index + 1} 节应为「${want}」，实际「${row ? row.title : '缺'}」` })
    if (row && row.num !== index + 1) issues.push({ file: CHANGE, line: row.line, kind: '编号顺序', message: `节号 ${row.num} 应为 ${index + 1}` })
  }
  for (const row of found.slice(SECTIONS.length)) issues.push({ file: CHANGE, line: row.line, kind: '多余节', message: `第 ${row.num} 节「${row.title}」不在约定清单内` })

  const tableStart = lines.findIndex((line) => line.startsWith('| 卡号 |'))
  if (tableStart < 0) {
    issues.push({ file: CHANGE, line: 1, kind: '表格缺失', message: '任务卡清单缺表格' })
  } else {
    const columns = lines[tableStart].split('|').slice(1, -1).map((cell) => cell.trim())
    if (columns.join('|') !== TASK_COLUMNS.join('|')) issues.push({ file: CHANGE, line: tableStart + 1, kind: '列名/顺序', message: `任务表列 ${columns.join('/')} 与约定不一致` })
  }

  const acStart = found.find((row) => row.title === AC_SECTION)
  if (acStart) {
    const body = lines.slice(acStart.line, found[found.indexOf(acStart) + 1]?.line ? found[found.indexOf(acStart) + 1].line - 1 : lines.length)
    const ids = [...new Set(body.join('\n').match(/AC-CHG-FW-002-\d{2}/g) ?? [])]
    ids.forEach((id, index) => {
      const want = `AC-CHG-FW-002-${String(index + 1).padStart(2, '0')}`
      if (id !== want) issues.push({ file: CHANGE, line: acStart.line, kind: '编号顺序', message: `AC 编号 ${id} 应为 ${want}` })
    })
    if (ids.length !== 6) issues.push({ file: CHANGE, line: acStart.line, kind: '数量', message: `AC 数量 ${ids.length}，约定 6 条` })
  }
  return issues
}

function issuesForBook() {
  const lines = read(BOOK)
  const issues = []
  const blocks = []
  let cur = null
  lines.forEach((line, index) => {
    const match = /^###\s+(MXV2-(\d)-(\d{2}))\s+(.+)$/.exec(line)
    if (match) {
      cur = { id: match[1], chapter: Number(match[2]), num: Number(match[3]), line: index + 1, title: match[4], fields: [] }
      blocks.push(cur)
      return
    }
    if (/^#{1,3}\s/.test(line) && cur && !/^###\s+MXV2-/.test(line)) cur = null
    if (cur && /^-\s*(规则|判据|执行|依据|层级|适用)：/.test(line)) cur.fields.push({ line: index + 1, text: line })
  })
  if (blocks.length !== 158) issues.push({ file: BOOK_LABEL, line: 1, kind: '数量', message: `规则块 ${blocks.length} 个，约定 158 个` })
  for (const block of blocks) {
    const labels = block.fields.map((field) => /^-\s*([^：]+)：/.exec(field.text)[1])
    if (labels.join('|') !== '规则|判据|执行|依据') issues.push({ file: BOOK_LABEL, line: block.line, kind: '字段顺序', message: `${block.id} 字段为 ${labels.join('/') || '空'}，约定 规则/判据/执行/依据` })
    for (const field of block.fields.filter((item) => /^-\s*(层级|适用)：/.test(item.text))) {
      issues.push({ file: BOOK_LABEL, line: field.line, kind: '旧字段', message: `${block.id} 残留旧字段行 ${field.text.slice(0, 12)}` })
    }
  }
  const byChapter = new Map()
  for (const block of blocks) {
    if (!byChapter.has(block.chapter)) byChapter.set(block.chapter, [])
    byChapter.get(block.chapter).push(block)
  }
  for (const [chapter, list] of byChapter) {
    list.forEach((block, index) => {
      if (block.num !== index + 1) issues.push({ file: BOOK_LABEL, line: block.line, kind: '编号顺序', message: `第 ${chapter} 章第 ${index + 1} 条编号为 ${block.id}` })
    })
  }
  return issues
}

function main() {
  const issues = [...issuesForProposal(), ...issuesForBook()]
  const jsonIndex = process.argv.indexOf('--json')
  const outPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : join(ROOT, '.out/evidence/format-health.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify({ check: 'format-health', generatedAt: new Date().toISOString(), issues, counts: { issues: issues.length } }, null, 1)}\n`, 'utf8')
  for (const issue of issues) console.log(`${issue.file}:${issue.line} [${issue.kind}] ${issue.message}`)
  console.log(`格式体检：${issues.length} 项；JSON ${relative(ROOT, outPath).replace(/\\/g, '/')}`)
  console.log('口径：仅作提交前一次性体检，不作为验收不通过的理由。')
}

main()

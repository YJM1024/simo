#!/usr/bin/env node
/**
 * spec-slice.mjs — 只取 spec 里需要的那一段（零依赖，只读）
 *
 * 用法：
 *   node scripts/spec-slice.mjs <file> --list
 *   node scripts/spec-slice.mjs <file> --prd PRD-CONV-003
 *   node scripts/spec-slice.mjs <file> --section 4.1
 *   node scripts/spec-slice.mjs <file> --lines 120-260
 *   node scripts/spec-slice.mjs --self-test
 *
 * 输出每行带原始行号（`123| 原文`），末尾一行：
 *   [spec-slice] <文件名> <输出行数>/<总行数>
 *
 * --list 只列 1–4 级标题，输出尽量短；围栏代码块里的 `#` 不算标题。
 * --prd 取该 PRD 标题到下一同级或更高级标题；若该 PRD 的 AC 出现在本节之外，
 *       末尾追加「相关 AC（跨节）」段（按 AC-<PRD>-\d+ 匹配）。
 * --section 按标题开头编号匹配（4.1、§4.1、4 都行），取整节。
 * --lines 原样导出区间，行号为文件原始行号。
 *
 * 定位参数四选一，同时给多个直接报错；找不到时退出码 1 并打印候选标题；
 * 用法或读取错误退出码 2。
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const MAX_CANDIDATES = 40
const MAX_CROSS_AC = 40

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitLines(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (normalized === '') return []
  const lines = normalized.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function parseHeadings(lines) {
  const headings = []
  let fence = null
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const trimmed = raw.trimStart()
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence) continue
    const match = /^(#{1,6})[ \t]+(.*\S)[ \t]*$/.exec(raw)
    if (match) {
      headings.push({ line: i + 1, level: match[1].length, text: match[2].trim() })
    }
  }
  return headings
}

function sectionEnd(headings, startIndex, total) {
  const start = headings[startIndex]
  for (let i = startIndex + 1; i < headings.length; i += 1) {
    if (headings[i].level <= start.level) return headings[i].line - 1
  }
  return total
}

function trimTrailingBlank(lines) {
  const out = lines.slice()
  while (out.length > 0 && (out[out.length - 1].trim() === '' || /^-{3,}\s*$/.test(out[out.length - 1]))) {
    out.pop()
  }
  return out
}

function sectionNumberRegex(value) {
  const normalized = String(value).trim().replace(/^§\s*/, '').replace(/[.\s]+$/, '')
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null
  return new RegExp('^§?\\s*' + escapeRegExp(normalized) + '(?![0-9])(?!\\.\\d)')
}

function prdRegex(id) {
  return new RegExp('(^|[^A-Za-z0-9_-])' + escapeRegExp(id) + '(?![A-Za-z0-9_-])', 'i')
}

function crossAcRegex(prdId) {
  const suffix = String(prdId).replace(/^PRD-/i, '')
  return new RegExp('AC-' + escapeRegExp(suffix) + '-\\d+', 'i')
}

/**
 * 纯函数：输入全文，返回 { code, body, count, total, error, candidates, notes }。
 * main 只负责读写文件，自测直接调用它，不落盘。
 */
function sliceText(text, options) {
  const lines = splitLines(text)
  const total = lines.length
  const headings = parseHeadings(lines)
  const mode = options && options.mode
  const value = options && options.value !== undefined ? String(options.value) : ''

  if (mode === 'list') {
    const picked = headings.filter((heading) => heading.level <= 4)
    return {
      code: 0,
      body: picked.map((heading) => `${heading.line}| ${lines[heading.line - 1].replace(/[ \t]+$/, '')}`),
      count: picked.length,
      total,
      notes: [],
    }
  }

  if (mode === 'prd') {
    const id = value.trim()
    if (!id) {
      return { code: 2, body: [], count: 0, total, error: '--prd 缺少 PRD 编号', candidates: headings }
    }
    const matcher = prdRegex(id)
    const hits = headings.filter((heading) => matcher.test(heading.text))
    if (hits.length === 0) {
      return {
        code: 1,
        body: [],
        count: 0,
        total,
        error: `未找到 PRD：${id}`,
        candidates: headings,
      }
    }
    const startIndex = headings.indexOf(hits[0])
    const endLine = sectionEnd(headings, startIndex, total)
    const bodyLines = trimTrailingBlank(lines.slice(hits[0].line - 1, endLine))
    const body = bodyLines.map((line, index) => `${hits[0].line + index}| ${line}`)
    const lastLine = hits[0].line + bodyLines.length - 1

    const acMatcher = crossAcRegex(id)
    const seen = new Set()
    const crossAc = []
    for (let i = 0; i < lines.length; i += 1) {
      const lineNo = i + 1
      if (lineNo >= hits[0].line && lineNo <= lastLine) continue
      if (!acMatcher.test(lines[i])) continue
      if (seen.has(lineNo)) continue
      seen.add(lineNo)
      crossAc.push({ line: lineNo, text: lines[i].trim() })
    }

    const notes = []
    if (hits.length > 1) {
      notes.push(`标题中匹配到 ${hits.length} 处 PRD ${id}，已取第一处（第 ${hits[0].line} 行）`)
    }
    if (crossAc.length > 0) {
      body.push('相关 AC（跨节）')
      for (const item of crossAc.slice(0, MAX_CROSS_AC)) {
        body.push(`${item.line}| ${item.text}`)
      }
      if (crossAc.length > MAX_CROSS_AC) {
        notes.push(`跨节 AC 共 ${crossAc.length} 行，只列出前 ${MAX_CROSS_AC} 行`)
      }
    }
    return {
      code: 0,
      body,
      count: body.length,
      total,
      notes,
    }
  }

  if (mode === 'section') {
    const matcher = sectionNumberRegex(value)
    if (!matcher) {
      return { code: 2, body: [], count: 0, total, error: `--section 取值无法解析：${value}`, candidates: headings }
    }
    const hits = headings.filter((heading) => matcher.test(heading.text))
    if (hits.length === 0) {
      return {
        code: 1,
        body: [],
        count: 0,
        total,
        error: `未找到节：§${value}`,
        candidates: headings,
      }
    }
    const startIndex = headings.indexOf(hits[0])
    const endLine = sectionEnd(headings, startIndex, total)
    const bodyLines = trimTrailingBlank(lines.slice(hits[0].line - 1, endLine))
    const notes = []
    if (hits.length > 1) {
      notes.push(`标题中匹配到 ${hits.length} 处节 §${value}，已取第一处（第 ${hits[0].line} 行）`)
    }
    return {
      code: 0,
      body: bodyLines.map((line, index) => `${hits[0].line + index}| ${line}`),
      count: bodyLines.length,
      total,
      notes,
    }
  }

  if (mode === 'lines') {
    const match = /^(\d+)\s*-\s*(\d+)$/.exec(value.trim())
    if (!match) {
      return { code: 2, body: [], count: 0, total, error: `--lines 取值应为 a-b：${value}`, candidates: headings }
    }
    const from = Number(match[1])
    const to = Number(match[2])
    if (from < 1 || from > to) {
      return { code: 2, body: [], count: 0, total, error: `--lines 区间无效：${value}`, candidates: headings }
    }
    if (from > total) {
      return {
        code: 1,
        body: [],
        count: 0,
        total,
        error: `行区间超出文件范围：${value}（总行数 ${total}）`,
        candidates: [],
      }
    }
    const end = Math.min(to, total)
    const bodyLines = lines.slice(from - 1, end)
    const notes = to > total ? [`结束行 ${to} 超出总行数 ${total}，已截到文件末尾`] : []
    return {
      code: 0,
      body: bodyLines.map((line, index) => `${from + index}| ${line}`),
      count: bodyLines.length,
      total,
      notes,
    }
  }

  return { code: 2, body: [], count: 0, total, error: `未知模式：${mode}`, candidates: headings }
}

function formatTrailer(file, count, total) {
  return `[spec-slice] ${basename(file)} ${count}/${total}`
}

function parseArgs(argv) {
  const out = { file: '', mode: '', value: '', selfTest: false, help: false, error: '' }
  const modes = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--self-test') {
      out.selfTest = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      out.help = true
      continue
    }
    if (arg === '--list') {
      modes.push('list')
      continue
    }
    if (arg === '--prd' || arg === '--section' || arg === '--lines') {
      const next = argv[i + 1]
      if (next === undefined || next === '' || next.startsWith('--')) {
        out.error = `${arg} 缺少取值`
        return out
      }
      modes.push(arg.slice(2))
      out.value = next
      i += 1
      continue
    }
    if (arg.startsWith('-')) {
      out.error = `未知参数：${arg}`
      return out
    }
    if (out.file) {
      out.error = `只能指定一个文件（已有 ${out.file}，又收到 ${arg}）`
      return out
    }
    out.file = arg
  }
  if (modes.length > 1) {
    out.error = `定位参数冲突：${modes.map((mode) => '--' + mode).join(' ')} 只能选一个`
    return out
  }
  out.mode = modes[0] || ''
  return out
}

const USAGE = `用法：
  node scripts/spec-slice.mjs <file> --list
  node scripts/spec-slice.mjs <file> --prd PRD-CONV-003
  node scripts/spec-slice.mjs <file> --section 4.1
  node scripts/spec-slice.mjs <file> --lines 120-260
  node scripts/spec-slice.mjs --self-test

定位参数四选一。输出带原始行号，末尾打印 [spec-slice] 文件名 输出行数/总行数。`

function fail(message) {
  process.stderr.write(`[spec-slice] ${message}\n`)
}

function printCandidates(candidates) {
  if (!candidates || candidates.length === 0) {
    process.stderr.write('候选标题：文件中没有 Markdown 标题\n')
    return
  }
  process.stderr.write('候选标题：\n')
  for (const heading of candidates.slice(0, MAX_CANDIDATES)) {
    process.stderr.write(`  ${String(heading.line).padStart(4)}  ${'#'.repeat(heading.level)} ${heading.text}\n`)
  }
  if (candidates.length > MAX_CANDIDATES) {
    process.stderr.write(`  ... 另有 ${candidates.length - MAX_CANDIDATES} 个标题\n`)
  }
}

function runSelfTest() {
  let assertions = 0
  const failures = []
  const check = (condition, message) => {
    assertions += 1
    if (!condition) failures.push(message)
  }

  const fixture = [
    '# 文档标题',
    '',
    '## 1. 第一节',
    '正文一',
    '',
    '### 1.1 子节 A',
    '子节正文 A',
    '',
    '### 1.2 子节 B',
    '```sh',
    '# 这是代码注释，不是标题',
    '```',
    '',
    '## 2. `PRD-CONV-003` · 搜索',
    '搜索正文',
    '- `AC-CONV-003-01` 主路径',
    '- `AC-CONV-003-02` 边界',
    '',
    '## 3. 全局验收',
    '| `AC-CONV-003-03` | 跨节验收 |',
    '',
    '##### 五级标题不列出',
  ].join('\n')

  const headings = parseHeadings(splitLines(fixture))
  check(headings.length === 7, '标题解析：围栏内 # 不应算标题，正文标题共 7 个')
  check(!headings.some((heading) => heading.text.includes('代码注释')), '标题解析：代码注释行未被当作标题')

  const list = sliceText(fixture, { mode: 'list', value: '' })
  check(list.code === 0 && list.count === 6, '--list：只列 1–4 级标题')
  check(list.body[0] === '1| # 文档标题', '--list：首行含原始行号')
  check(list.body.every((line) => !line.includes('五级标题')), '--list：五级标题不列出')
  check(list.total === 22, '--list：总行数 22')

  const prd = sliceText(fixture, { mode: 'prd', value: 'PRD-CONV-003' })
  check(prd.code === 0, '--prd：找到 PRD')
  check(prd.body.some((line) => line.includes('搜索正文')), '--prd：包含本节正文')
  check(!prd.body.some((line) => line.includes('全局验收')), '--prd：不吞下一条同级标题')
  check(prd.body.includes('相关 AC（跨节）'), '--prd：末尾追加相关 AC 段')
  check(prd.body.some((line) => line.startsWith('20| ') && line.includes('AC-CONV-003-03')), '--prd：跨节 AC 带原始行号')
  check(prd.body.filter((line) => line.includes('AC-CONV-003-01')).length === 1, '--prd：本节内 AC 不重复列入跨节段')
  check(prd.count === 6, '--prd：输出行数=正文 4 行+跨节标题 1 行+跨节 AC 1 行')

  const lower = sliceText(fixture, { mode: 'prd', value: 'prd-conv-003' })
  check(lower.code === 0 && lower.body.length > 0, '--prd：编号大小写不敏感')

  const sub = sliceText(fixture, { mode: 'section', value: '1.1' })
  check(sub.code === 0 && sub.body.length === 2, '--section 1.1：取到子节')
  check(!sub.body.some((line) => line.includes('子节 B')), '--section 1.1：不越过同级标题')

  const sect = sliceText(fixture, { mode: 'section', value: '§1' })
  check(sect.code === 0, '--section：接受 § 前缀')
  check(sect.body[0].startsWith('3| ## 1. 第一节'), '--section 1：从本节标题开始')
  check(sect.body.some((line) => line.includes('子节 A')) && !sect.body.some((line) => line.includes('搜索正文')), '--section 1：包含下级子节且不越过下一条同级标题')

  const fenced = sliceText(fixture, { mode: 'section', value: '1.2' })
  check(fenced.body.some((line) => line.includes('代码注释')), '--section 1.2：代码块内容原样保留')

  const range = sliceText(fixture, { mode: 'lines', value: '6-8' })
  check(range.code === 0 && range.count === 3, '--lines 6-8：输出 3 行')
  check(range.body[0] === '6| ### 1.1 子节 A' && range.body[1] === '7| 子节正文 A' && range.body[2] === '8| ', '--lines：行号与原文逐行对应')

  const crlf = sliceText(fixture.replace(/\n/g, '\r\n'), { mode: 'lines', value: '1-2' })
  check(crlf.code === 0 && crlf.total === 22 && crlf.count === 2, 'CRLF：行数统计正确')

  const missingPrd = sliceText(fixture, { mode: 'prd', value: 'PRD-NONE-999' })
  check(missingPrd.code === 1, '--prd：找不到时退出码 1')
  check(missingPrd.candidates.length === 7 && missingPrd.candidates[0].line === 1, '--prd：找不到时给出候选标题')

  const missingSection = sliceText(fixture, { mode: 'section', value: '9.9' })
  check(missingSection.code === 1 && missingSection.candidates.length === 7, '--section：找不到时退出码 1 并给候选')

  const empty = sliceText('', { mode: 'list', value: '' })
  check(empty.code === 0 && empty.count === 0 && empty.total === 0, '空文件：--list 输出 0/0')
  check(sliceText('', { mode: 'prd', value: 'PRD-X' }).code === 1, '空文件：--prd 退出码 1')

  const noHeading = sliceText('hello\nworld', { mode: 'list', value: '' })
  check(noHeading.code === 0 && noHeading.count === 0 && noHeading.total === 2, '无标题文件：--list 输出 0/2')

  const oneLine = sliceText('# Only', { mode: 'list', value: '' })
  check(oneLine.count === 1 && oneLine.total === 1, '单行文件：--list 输出 1/1')

  const ten = sliceText('### 4.1 是\n### 4.10 不是', { mode: 'section', value: '4.1' })
  check(ten.code === 0 && ten.body.length === 1, '--section 4.1：不误匹配 4.10')
  const four = sliceText('## 4. 组\n### 4.1 子', { mode: 'section', value: '4' })
  check(four.code === 0 && four.body[0].startsWith('1| ## 4. 组'), '--section 4：起始匹配 4. 而不是 4.1')

  const outOfRange = sliceText('a\nb', { mode: 'lines', value: '9-10' })
  check(outOfRange.code === 1 && outOfRange.total === 2, '--lines：越界退出码 1 并报告总行数')

  const conflict = parseArgs(['a.md', '--prd', 'PRD-X', '--lines', '1-2'])
  check(Boolean(conflict.error), '参数：--prd 与 --lines 同时给出时报错')
  check(Boolean(parseArgs(['a.md', '--foo']).error), '参数：未知参数报错')
  check(Boolean(parseArgs(['a.md', '--prd']).error), '参数：--prd 缺少取值报错')
  check(Boolean(parseArgs(['a.md', 'b.md']).error), '参数：多个文件报错')
  const parsed = parseArgs(['a.md', '--section', '4.1'])
  check(parsed.mode === 'section' && parsed.value === '4.1' && parsed.file === 'a.md', '参数：正常解析')

  check(formatTrailer('spec.md', 5, 22) === '[spec-slice] spec.md 5/22', '尾部统计行格式')

  if (failures.length > 0) {
    process.stdout.write('SELF-TEST FAIL\n')
    for (const message of failures) process.stdout.write(`  - ${message}\n`)
    process.exit(1)
  }
  process.stdout.write(`SELF-TEST PASS (${assertions} assertions)\n`)
}

function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.selfTest) {
    runSelfTest()
    return
  }
  if (parsed.help) {
    process.stdout.write(USAGE + '\n')
    return
  }
  if (parsed.error) {
    fail(parsed.error)
    process.exit(2)
  }
  if (!parsed.file) {
    process.stdout.write(USAGE + '\n')
    process.exit(2)
  }
  if (!parsed.mode) {
    fail('必须指定 --list | --prd | --section | --lines 之一')
    process.exit(2)
  }

  let text
  try {
    text = readFileSync(parsed.file, 'utf8')
  } catch (error) {
    fail(`无法读取文件：${parsed.file}（${error.code || error.message}）`)
    process.exit(2)
  }

  const result = sliceText(text, { mode: parsed.mode, value: parsed.value })
  for (const note of result.notes || []) {
    process.stderr.write(`[spec-slice] 提示：${note}\n`)
  }
  if (result.code !== 0) {
    fail(result.error)
    printCandidates(result.candidates)
    process.exit(result.code)
  }

  for (const line of result.body) process.stdout.write(line + '\n')
  process.stdout.write(formatTrailer(parsed.file, result.count, result.total) + '\n')
}

main()

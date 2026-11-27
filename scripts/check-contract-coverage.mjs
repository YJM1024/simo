#!/usr/bin/env node
/**
 * check-contract-coverage.mjs — 契约承诺到断言的覆盖检查（补充检查，不占规则号）。
 *
 * 目的：补上“材料齐备却漏产品承诺”的空档。登记与映射只回答“功能点与场景有没有登记”，
 * 回答不了“契约里写了的错误码 / 状态迁移有没有人测”。本脚本把两者的对应关系做成一等检查：
 *   1. 从 specs/contract/<域>/contract.md 的错误码表取全部契约错误码；
 *   2. 从状态机表的“从状态 / 到状态”与备注里的 `from→to` 取全部状态迁移；
 *   3. 在断言语料里逐条查引用：specs/test/** 的用例、scripts/ac/** 的断言脚本、
 *      backend/**\/*_test.go、frontend/**\/*.test.{ts,tsx}；
 *   4. 缺引用的逐条列出，写 .out/evidence/contract-coverage.json，有缺失退出 1。
 *
 * 口径与限制：错误码要求断言语料里出现同名标识；状态迁移要求出现 `from→to` 标识、同一个断言
 * 文件里同时出现该行的「从状态」「到状态」中文名，或同时出现两个存储值的大驼峰形式（如
 * `StatusInterrupted` 与 `StatusQueued`）。本检查判“断言侧是否引用”，不判断言语义是否真的
 * 覆盖了触发条件；语义仍由验收员按 MXV2-5-12 与 MXV2-7-01 人工核对。
 *
 * 用法：
 *   node scripts/check-contract-coverage.mjs
 *   node scripts/check-contract-coverage.mjs --json .out/evidence/contract-coverage.json
 *   node scripts/check-contract-coverage.mjs --self-test
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const RULE = '契约覆盖补充检查'
const CODE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.out', '.tmp'])

function walk(dir, filter, out = []) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (stat.isDirectory()) walk(path, filter, out)
    else if (filter(path)) out.push(path)
  }
  return out
}

function splitRow(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

export function parseTables(text) {
  const lines = text.split(/\r?\n/)
  const tables = []
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^\s*\|/.test(lines[index])) continue
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1])) continue
    const header = splitRow(lines[index])
    const rows = []
    let cursor = index + 2
    for (; cursor < lines.length; cursor += 1) {
      if (!/^\s*\|/.test(lines[cursor])) break
      rows.push({ cells: splitRow(lines[cursor]), line: cursor + 1 })
    }
    tables.push({ header, rows, line: index + 1 })
    index = cursor - 1
  }
  return tables
}

export function extractPromises(text, source) {
  const codes = new Map()
  const transitions = new Map()
  for (const table of parseTables(text)) {
    const header = table.header
    const codeColumn = header.findIndex((cell) => /错误码/.test(cell))
    if (codeColumn >= 0) {
      for (const row of table.rows) {
        const cell = row.cells[codeColumn] ?? ''
        for (const match of cell.matchAll(/`([^`]+)`|([a-z][a-z0-9_]{2,})/g)) {
          const token = match[1] ?? match[2]
          if (!CODE_RE.test(token)) continue
          if (!codes.has(token)) codes.set(token, { code: token, source, line: row.line })
        }
      }
    }
    const fromColumn = header.indexOf('从状态')
    const toColumn = header.indexOf('到状态')
    if (fromColumn < 0 || toColumn < 0) continue
    for (const row of table.rows) {
      const from = row.cells[fromColumn] ?? ''
      const to = row.cells[toColumn] ?? ''
      const note = row.cells[row.cells.length - 1] ?? ''
      const arrow = note.match(/[a-z_]+(?:\s*→\s*)[a-z_]+/)
      const label = arrow ? arrow[0].replace(/\s+/g, '') : from && to && from !== '—' ? `${from}→${to}` : ''
      if (!label) continue
      if (!transitions.has(label)) transitions.set(label, { transition: label, fromName: from, toName: to, source, line: row.line })
    }
  }
  return { codes, transitions }
}

function loadAssertionCorpus(root) {
  const files = [
    ...walk(join(root, 'specs/test'), (path) => path.endsWith('.md')),
    ...walk(join(root, 'scripts/ac'), (path) => path.endsWith('.mjs')),
    ...walk(join(root, 'backend'), (path) => /_test\.go$/.test(path)),
    ...walk(join(root, 'frontend'), (path) => /\.test\.(ts|tsx)$/.test(path)),
  ]
  const entries = files.map((path) => ({
    rel: relative(root, path).replace(/\\/g, '/'),
    text: readFileSync(path, 'utf8'),
  }))
  return { files: entries.map((entry) => entry.rel), entries, text: entries.map((entry) => entry.text).join('\n') }
}

function pascal(token) {
  return token.split('_').filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('')
}

function isTransitionReferenced(item, entries) {
  const ascii = /^([a-z_]+)→([a-z_]+)$/.exec(item.transition)
  const fromPascal = ascii ? pascal(ascii[1]) : ''
  const toPascal = ascii ? pascal(ascii[2]) : ''
  for (const entry of entries) {
    if (entry.text.includes(item.transition)) return true
    if (fromPascal && entry.text.includes(fromPascal) && entry.text.includes(toPascal)) return true
    if (!item.fromName || !item.toName) continue
    if (item.fromName === '—' || item.toName === '—') continue
    if (entry.text.includes(item.fromName) && entry.text.includes(item.toName)) return true
  }
  return false
}

export function check(root) {
  const contractFiles = walk(join(root, 'specs/contract'), (path) => path.endsWith('.md') && /contract\.md$/.test(path))
  const promises = { codes: new Map(), transitions: new Map() }
  for (const path of contractFiles) {
    const rel = relative(root, path).replace(/\\/g, '/')
    const parsed = extractPromises(readFileSync(path, 'utf8'), rel)
    for (const [key, value] of parsed.codes) if (!promises.codes.has(key)) promises.codes.set(key, value)
    for (const [key, value] of parsed.transitions) if (!promises.transitions.has(key)) promises.transitions.set(key, value)
  }
  const corpus = loadAssertionCorpus(root)
  const missingCodes = [...promises.codes.values()].filter((item) => !corpus.text.includes(item.code))
  const missingTransitions = [...promises.transitions.values()].filter((item) => !isTransitionReferenced(item, corpus.entries))
  return {
    rule: RULE,
    contractFiles: contractFiles.map((path) => relative(root, path).replace(/\\/g, '/')),
    assertionFiles: corpus.files,
    codes: { total: promises.codes.size, covered: promises.codes.size - missingCodes.length, missing: missingCodes },
    transitions: {
      total: promises.transitions.size,
      covered: promises.transitions.size - missingTransitions.length,
      missing: missingTransitions,
    },
  }
}

function printReport(report) {
  const lines = []
  lines.push(`${RULE} 契约承诺到断言的覆盖检查`)
  lines.push(`契约文件 ${report.contractFiles.length} 份，断言文件 ${report.assertionFiles.length} 份`)
  lines.push(`错误码 ${report.codes.total} 条，已引用 ${report.codes.covered} 条，缺 ${report.codes.missing.length} 条`)
  for (const item of report.codes.missing) lines.push(`  MISS ${item.code}  ${item.source}:${item.line}`)
  lines.push(`状态迁移 ${report.transitions.total} 条，已引用 ${report.transitions.covered} 条，缺 ${report.transitions.missing.length} 条`)
  for (const item of report.transitions.missing) lines.push(`  MISS ${item.transition}  ${item.source}:${item.line}`)
  console.log(lines.join('\n'))
}

function selfTest() {
  const fixture = [
    '| 编号 | 错误码 | HTTP | 条件 |',
    '|---|---|---|---|',
    '| CT-1 | `task_state_conflict` | 409 | 状态冲突 |',
    '| CT-2 | `task_not_found` | 404 | 不存在 |',
    '',
    '| 编号 | 从状态 | 到状态 | 备注 |',
    '|---|---|---|---|',
    '| CT-3 | 排队 | 进行中 | queued→running |',
    '| CT-4 | 进行中 | 失败 | running→failed |',
  ].join('\n')
  const parsed = extractPromises(fixture, 'fixture.md')
  const asserts = [
    parsed.codes.size === 2,
    parsed.transitions.size === 2,
    parsed.codes.has('task_state_conflict'),
    parsed.transitions.has('queued→running'),
    !parsed.codes.has('409'),
  ]
  const failed = asserts.filter((value) => !value).length
  console.log(`SELF-TEST ${failed === 0 ? 'PASS' : `FAIL (${failed})`} (${asserts.length} assertions)`)
  process.exit(failed === 0 ? 0 : 1)
}

if (process.argv[1] && process.argv[1].endsWith('check-contract-coverage.mjs')) {
  if (process.argv.includes('--self-test')) selfTest()
  const report = check(ROOT)
  printReport(report)
  const jsonIndex = process.argv.indexOf('--json')
  const outPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : join(ROOT, '.out/evidence/contract-coverage.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(report, null, 1)}\n`, 'utf8')
  console.log(`JSON ${relative(ROOT, outPath).replace(/\\/g, '/')}`)
  const missing = report.codes.missing.length + report.transitions.missing.length
  console.log(missing === 0 ? 'PASS' : `FAILED: ${missing} 条契约承诺没有断言引用`)
  process.exit(missing === 0 ? 0 : 1)
}

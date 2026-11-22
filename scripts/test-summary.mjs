#!/usr/bin/env node
/**
 * test-summary.mjs — 把长测试日志压成可判读的摘要（零依赖，只读）
 *
 * 用法：
 *   node scripts/test-summary.mjs --kind go --log backend/.tmp/full-after.log
 *   node scripts/test-summary.mjs --kind vitest --log frontend/.tmp/vitest.log
 *   node scripts/test-summary.mjs --self-test
 *
 * go：统计 ok / FAIL / 无测试包数，列出失败用例的 file:line、panic 行与总耗时。
 * vitest：统计 Test Files / Tests 的 failed、passed 数量，列出失败用例与文件行、总耗时。
 * 默认最多输出 40 行（可用 --max-lines 调整），失败明细优先，超出截断并注明原日志。
 * 日志编码自动识别 UTF-8（含 BOM）、UTF-16LE/BE（含 BOM 或无 BOM）。
 * 识别不了格式时打印前 20 行原文并退出码 2。
 */

import { readFileSync } from 'node:fs'

const DEFAULT_MAX_LINES = 40

function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

function decodeLog(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), 'utf8')
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '')
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const even = buf.length % 2 === 0 ? buf : buf.subarray(0, buf.length - 1)
    const swapped = Buffer.from(even)
    swapped.swap16()
    return swapped.toString('utf16le').replace(/^\uFEFF/, '')
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8').slice(1)
  }
  const sample = Math.min(buf.length, 4096)
  let nul = 0
  for (let i = 0; i < sample; i += 1) {
    if (buf[i] === 0) nul += 1
  }
  if (sample > 0 && nul / sample > 0.1) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '')
  }
  return buf.toString('utf8')
}

function splitLines(text) {
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (normalized === '') return []
  const lines = normalized.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function parseGoDuration(token) {
  if (!token) return null
  if (/cached/i.test(token)) return { seconds: 0, cached: true }
  const parts = String(token).match(/(\d+(?:\.\d+)?)(ns|µs|us|ms|h|m|s)/g)
  if (!parts) return null
  const factors = { ns: 1e-9, 'µs': 1e-6, us: 1e-6, ms: 1e-3, s: 1, m: 60, h: 3600 }
  let seconds = 0
  for (const part of parts) {
    const match = /^(\d+(?:\.\d+)?)(ns|µs|us|ms|h|m|s)$/.exec(part)
    if (!match) continue
    seconds += Number(match[1]) * factors[match[2]]
  }
  return { seconds, cached: false }
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) return '未知'
  const rounded = Math.round(value * 1000) / 1000
  return `${rounded}s`
}

function truncate(text, max) {
  const value = String(text)
  return value.length > max ? value.slice(0, max) + '...' : value
}

function capLines(lines, limit, logPath) {
  const cap = Math.max(2, Number(limit) || DEFAULT_MAX_LINES)
  if (lines.length <= cap) return lines
  const kept = lines.slice(0, cap - 1)
  const dropped = lines.length - kept.length
  kept.push(`... 另有 ${dropped} 行见原日志: ${logPath}`)
  return kept
}

function looksGo(lines) {
  return (
    lines.some((line) => /^(?:ok|FAIL|\?)\s+\S+\s+(?:\(cached\)|\[[^\]]+\]|\d+(?:\.\d+)?(?:ns|µs|us|ms|s|m|h))\s*$/.test(line.trim())) ||
    lines.some((line) => /^--- (?:FAIL|PASS|SKIP):\s/.test(line)) ||
    lines.some((line) => /^(?:panic|fatal error):/.test(line))
  )
}

function summarizeGo(rawLines, logPath, maxLines = DEFAULT_MAX_LINES) {
  const lines = rawLines.map(stripAnsi)
  if (!looksGo(lines)) return null

  let ok = 0
  let failedPackages = 0
  let noTest = 0
  let other = 0
  let timedCount = 0
  let cachedCount = 0
  let totalSeconds = 0
  const failures = []
  const panics = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const pkg = /^(ok|FAIL|\?)[ \t]+(\S+)(?:[ \t]+(.+?))?[ \t]*$/.exec(line)
    if (pkg) {
      const status = pkg[1]
      const detail = (pkg[3] || '').trim()
      if (status === 'ok') {
        ok += 1
        const duration = parseGoDuration(detail.split(/\s+/).pop())
        if (duration) {
          if (duration.cached) cachedCount += 1
          else {
            timedCount += 1
            totalSeconds += duration.seconds
          }
        }
      } else if (status === 'FAIL') {
        failedPackages += 1
        const duration = parseGoDuration(detail.split(/\s+/).pop())
        if (duration && !duration.cached) {
          timedCount += 1
          totalSeconds += duration.seconds
        }
      } else if (status === '?') {
        noTest += 1
      } else {
        other += 1
      }
      continue
    }

    const fail = /^--- FAIL:\s+(.+?)\s+\(([^)]*)\)\s*$/.exec(line)
    if (fail) {
      let location = ''
      for (let j = i + 1; j < Math.min(lines.length, i + 41); j += 1) {
        if (/^(?:--- |=== |FAIL\b|ok\s|\?\s|PASS\b|panic:)/.test(lines[j])) break
        const loc = /^\s+(\S+?\.go):(\d+)(?::|\s|$)/.exec(lines[j])
        if (loc) {
          location = `${loc[1]}:${loc[2]}`
          break
        }
      }
      failures.push({ name: fail[1].trim(), location, duration: fail[2].trim() })
      continue
    }

    if (/^(?:panic|fatal error):/.test(line)) {
      panics.push(truncate(line.trim(), 240))
    }
  }

  const out = []
  const counts = [`ok ${ok}`, `FAIL ${failedPackages}`, `无测试 ${noTest}`]
  if (other > 0) counts.push(`其他 ${other}`)
  out.push(`[go] 包: ${counts.join(' / ')}；失败用例 ${failures.length}`)

  for (const failure of failures) {
    out.push(`  FAIL ${failure.name} (${failure.location || '未找到 file:line'})`)
  }
  for (const panic of panics) {
    out.push(`  ${panic}`)
  }

  if (timedCount > 0) {
    const cachedNote = cachedCount > 0 ? `；${cachedCount} 个 cached 未计时` : ''
    out.push(`[go] 总耗时 约 ${formatSeconds(totalSeconds)}（${timedCount} 个包耗时求和，并行执行会高估${cachedNote}）`)
  } else if (cachedCount > 0) {
    out.push(`[go] 总耗时 未知（${cachedCount} 个 cached 包，无实际计时行）`)
  } else {
    out.push('[go] 总耗时 未知（无包耗时行）')
  }

  return { kind: 'go', lines: capLines(out, maxLines, logPath), stats: { ok, failedPackages, noTest, failures: failures.length, panics: panics.length } }
}

function looksVitest(lines) {
  return (
    lines.some((line) => /^\s*Test Files\s{2,}/.test(line)) ||
    lines.some((line) => /^\s*Tests\s{2,}\d+/.test(line)) ||
    lines.some((line) => /^\s*RUN\s+v\d/.test(line))
  )
}

function parseCounts(text) {
  const read = (word) => {
    const match = new RegExp('(\\d+)\\s+' + word + '\\b').exec(text)
    return match ? Number(match[1]) : 0
  }
  return { failed: read('failed'), passed: read('passed'), skipped: read('skipped') }
}

function findVitestLine(lines, label) {
  const matcher = new RegExp('^\\s*' + label + '\\s{2,}(.+?)\\s*$')
  for (const line of lines) {
    const match = matcher.exec(line)
    if (match) return match[1].trim()
  }
  return ''
}

function collectVitestFailures(lines) {
  const failures = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const header = /^\s*FAIL\s+(.+)$/.exec(lines[i])
    if (!header) continue

    let text = header[1]
    let j = i + 1
    while (j < lines.length && j < i + 8) {
      const next = lines[j]
      if (!next.trim()) break
      if (/^\s*(?:FAIL|Test Files|Tests|Duration|Start at)\b/.test(next)) break
      if (/^\s*(?:[A-Za-z_.$]*Error|Exception)\b[^\n]*:/.test(next)) break
      if (/^\s*❯\b/.test(next)) break
      // vitest 按固定列宽硬折行：保留原行尾空格与原行首，直接拼接即可还原词间空格与断词。
      text += next
      j += 1
    }
    text = text.trim()

    const parsed = /^(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s*>\s*(.*)$/.exec(text)
    const file = parsed ? parsed[1] : ''
    const name = (parsed ? parsed[2] : text).trim()

    let location = ''
    for (let k = i + 1; k < Math.min(lines.length, i + 81); k += 1) {
      if (k > i + 1 && /^\s*FAIL\s+/.test(lines[k])) break
      if (/^\s*(?:Test Files|Tests|Duration)\s{2,}/.test(lines[k])) break
      const loc = /❯\s+(\S+?\.(?:test|spec)\.[cm]?[jt]sx?):(\d+):\d+/.exec(lines[k])
      if (loc) {
        location = `${loc[1]}:${loc[2]}`
        break
      }
    }

    const key = file + '\u0000' + name
    if (seen.has(key)) continue
    seen.add(key)
    failures.push({ file, name, location })
  }

  if (failures.length === 0) {
    for (const line of lines) {
      const mark = /^\s*[×✗]\s+(.+?)\s+\d+(?:\.\d+)?(?:ms|s)\s*$/.exec(line)
      if (!mark) continue
      const name = mark[1].trim()
      if (seen.has(name)) continue
      seen.add(name)
      failures.push({ file: '', name, location: '' })
    }
  }

  return failures
}

function summarizeVitest(rawLines, logPath, maxLines = DEFAULT_MAX_LINES) {
  const lines = rawLines.map(stripAnsi)
  if (!looksVitest(lines)) return null

  const testFiles = findVitestLine(lines, 'Test Files')
  const tests = findVitestLine(lines, 'Tests')
  const durationRaw = findVitestLine(lines, 'Duration')
  const durationMatch = /^([\d.]+\s*(?:ms|s|m))/.exec(durationRaw)
  const duration = durationMatch ? durationMatch[1].replace(/\s+/g, '') : ''
  const counts = parseCounts(tests)
  const failures = collectVitestFailures(lines)

  const out = []
  out.push(`[vitest] Test Files: ${testFiles || '未找到汇总行'}`)
  out.push(`[vitest] Tests: ${tests || '未找到汇总行'}`)
  if (counts.failed > 0 || failures.length > 0) {
    out.push(`[vitest] 失败用例 (${failures.length}):`)
    for (const failure of failures) {
      const label = truncate([failure.file, failure.name].filter(Boolean).join(' > '), 240)
      out.push(`  ${label}${failure.location ? ` @ ${failure.location}` : ''}`)
    }
  }
  out.push(duration ? `[vitest] 总耗时 ${duration}` : '[vitest] 总耗时 未知（无 Duration 行）')

  return { kind: 'vitest', lines: capLines(out, maxLines, logPath), stats: counts }
}

function parseArgs(argv) {
  const out = { kind: '', log: '', maxLines: DEFAULT_MAX_LINES, selfTest: false, help: false, error: '' }
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
    if (arg === '--kind' || arg === '--log' || arg === '--max-lines') {
      const value = argv[i + 1]
      if (value === undefined || value === '' || value.startsWith('--')) {
        out.error = `${arg} 缺少取值`
        return out
      }
      i += 1
      if (arg === '--kind') out.kind = value
      else if (arg === '--log') out.log = value
      else {
        const parsed = Number(value)
        if (!Number.isInteger(parsed) || parsed < 2) {
          out.error = `--max-lines 需要 >= 2 的整数：${value}`
          return out
        }
        out.maxLines = parsed
      }
      continue
    }
    if (arg.startsWith('-')) {
      out.error = `未知参数：${arg}`
      return out
    }
    out.error = `多余的位置参数：${arg}`
    return out
  }
  return out
}

const USAGE = `用法：
  node scripts/test-summary.mjs --kind go --log backend/.tmp/full-after.log
  node scripts/test-summary.mjs --kind vitest --log frontend/.tmp/vitest.log
  node scripts/test-summary.mjs --self-test

--kind 只支持 go / vitest；--max-lines 默认 40。`

function runSelfTest() {
  let assertions = 0
  const failures = []
  const check = (condition, message) => {
    assertions += 1
    if (!condition) failures.push(message)
  }

  const goFixture = [
    'ok  \tpkg/one\t0.100s',
    'ok  \tpkg/two\t(cached)',
    '?   \tpkg/three\t[no test files]',
    'FAIL\tpkg/four\t1.500s',
    '--- FAIL: TestAlpha (0.01s)',
    '    four_test.go:42: boom',
    '--- FAIL: TestBeta/sub (0.00s)',
    '    four_test.go:77: boom',
    'panic: runtime error: invalid memory address',
    'FAIL',
    'ok  \tpkg/five\t2.000s',
  ]
  const go = summarizeGo(goFixture, 'go.log')
  check(go !== null, 'go：识别日志格式')
  check(go.stats.ok === 3 && go.stats.failedPackages === 1 && go.stats.noTest === 1, 'go：ok/FAIL/无测试包数')
  check(go.stats.failures === 2, 'go：失败用例数')
  check(go.stats.panics === 1, 'go：panic 行数')
  check(go.lines.some((line) => line.includes('TestAlpha (four_test.go:42)')), 'go：失败用例带 file:line')
  check(go.lines.some((line) => line.includes('TestBeta/sub (four_test.go:77)')), 'go：子测试带 file:line')
  check(go.lines.some((line) => line.includes('panic: runtime error')), 'go：panic 行原文')
  check(go.lines.some((line) => line.includes('总耗时 约 3.6s')), 'go：总耗时为 ok+FAIL 包耗时求和')
  check(go.lines.some((line) => line.includes('1 个 cached 未计时')), 'go：cached 包不计入总耗时')

  const capFixture = ['ok  \tpkg/base\t0.001s']
  for (let i = 0; i < 60; i += 1) capFixture.push(`--- FAIL: Test${i} (0.00s)`)
  const capped = summarizeGo(capFixture, 'big-go.log', 40)
  check(capped.lines.length === 40, 'go：超过 40 行被截断')
  check(capped.lines[capped.lines.length - 1].includes('另有') && capped.lines[capped.lines.length - 1].includes('big-go.log'), 'go：截断行注明原日志与剩余行数')
  check(capped.lines.filter((line) => line.includes('FAIL Test')).length === 38, 'go：截断后失败明细优先保留')

  check(parseGoDuration('0.100s').seconds === 0.1, '时长：秒')
  check(parseGoDuration('250ms').seconds === 0.25, '时长：毫秒')
  check(parseGoDuration('1m2.5s').seconds === 62.5, '时长：复合')
  check(parseGoDuration('(cached)').cached === true, '时长：cached')
  check(parseGoDuration('bogus') === null, '时长：无法解析返回 null')

  const vitestPass = [
    ' RUN  v5.1.1 E:/x',
    '',
    ' ✓ src/a.test.ts (4 tests) 60ms',
    ' ✓ src/b.test.ts (8 tests) 742ms',
    '',
    ' Test Files  2 passed (2)',
    '      Tests  12 passed (12)',
    '   Duration  3.45s (tests 61%)',
  ]
  const pass = summarizeVitest(vitestPass, 'vitest.log')
  check(pass !== null, 'vitest：识别通过日志')
  check(pass.stats.failed === 0 && pass.stats.passed === 12, 'vitest：Tests 计数')
  check(pass.lines.some((line) => line.includes('Test Files: 2 passed (2)')), 'vitest：Test Files 原样汇总')
  check(pass.lines.some((line) => line.includes('总耗时 3.45s')), 'vitest：总耗时')
  check(!pass.lines.some((line) => line.includes('失败用例')), 'vitest：全通过时不列失败段')

  const vitestFail = [
    ' RUN  v5.1.1 E:/x',
    '',
    ' ❯ src/App.conversation.test.tsx (2 tests | 1 failed) 9000ms',
    '   × creates a session 414ms',
    '',
    ' FAIL  src/App.conversation.test.tsx > App lifecycle > creates a session and rende',
    'rs it',
    ' TestingLibraryElementError: boom',
    '',
    ' FAIL  src/B.test.tsx > suite > beta',
    ' AssertionError: nope',
    ' ❯ src/B.test.tsx:42:7',
    '',
    ' Test Files  1 failed | 2 passed (3)',
    '      Tests  9 failed | 35 passed (44)',
    '   Duration  12.18s (tests 61%)',
  ]
  const fail = summarizeVitest(vitestFail, 'vitest-fail.log')
  check(fail.stats.failed === 9 && fail.stats.passed === 35, 'vitest：失败/通过计数')
  check(fail.lines.some((line) => line.includes('Test Files: 1 failed | 2 passed (3)')), 'vitest：Test Files 含失败数')
  check(fail.lines.filter((line) => line.includes('  src/')).length === 2, 'vitest：失败用例去重后两条')
  check(fail.lines.some((line) => line.includes('creates a session and renders it')), 'vitest：折行用例名拼接')
  check(fail.lines.some((line) => line.includes('@ src/B.test.tsx:42')), 'vitest：失败用例带文件行')
  check(fail.lines.some((line) => line.includes('总耗时 12.18s')), 'vitest：失败日志总耗时')
  check(parseCounts('1 failed | 20 passed | 1 expected fail (22)').failed === 1, 'vitest：expected fail 不误计为 failed')

  const vitestCap = [' RUN  v5.1.1 E:/x', ' Test Files  1 failed (1)', '      Tests  60 failed (60)', '   Duration  1.00s']
  for (let i = 0; i < 60; i += 1) vitestCap.push(` FAIL  src/T.test.tsx > suite > case ${i}`)
  const vitestCapped = summarizeVitest(vitestCap, 'big-vitest.log', 40)
  check(vitestCapped.lines.length === 40, 'vitest：超过 40 行被截断')
  check(vitestCapped.lines[vitestCapped.lines.length - 1].includes('另有'), 'vitest：截断行注明剩余行数')

  const utf8Bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('中文日志', 'utf8')])
  check(decodeLog(utf8Bom) === '中文日志', '编码：UTF-8 BOM')
  const utf16 = Buffer.from('\uFEFFok\tpkg\t1.0s', 'utf16le')
  check(decodeLog(utf16) === 'ok\tpkg\t1.0s', '编码：UTF-16LE BOM')
  const utf16NoBom = Buffer.from('FAIL\tpkg\t1s', 'utf16le')
  check(decodeLog(utf16NoBom) === 'FAIL\tpkg\t1s', '编码：无 BOM UTF-16LE 按 NUL 比例识别')
  const be = Buffer.from(utf16)
  be.swap16()
  check(decodeLog(be) === 'ok\tpkg\t1.0s', '编码：UTF-16BE BOM')

  check(summarizeGo(['hello', 'world'], 'x.log') === null, 'go：无法识别返回 null')
  check(summarizeVitest(['hello', 'world'], 'x.log') === null, 'vitest：无法识别返回 null')
  check(summarizeGo([], 'x.log') === null && summarizeVitest([], 'x.log') === null, '空日志：两种格式都无法识别')
  check(stripAnsi('\u001b[31mFAIL\u001b[0m') === 'FAIL', 'ANSI：颜色码被剥掉')

  const args = parseArgs(['--kind', 'go', '--log', 'a.log', '--max-lines', '20'])
  check(args.kind === 'go' && args.log === 'a.log' && args.maxLines === 20, '参数：正常解析')
  check(Boolean(parseArgs(['--kind', 'jest', '--log', 'a']).error) === false, '参数：未知 kind 交给 main 判定')
  check(Boolean(parseArgs(['--kind']).error), '参数：--kind 缺少取值报错')
  check(Boolean(parseArgs(['--max-lines', '1']).error), '参数：--max-lines < 2 报错')
  check(Boolean(parseArgs(['extra']).error), '参数：多余位置参数报错')

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
    process.stderr.write(`[test-summary] ${parsed.error}\n`)
    process.exit(2)
  }
  if (!parsed.kind || !parsed.log) {
    process.stdout.write(USAGE + '\n')
    process.exit(2)
  }
  if (parsed.kind !== 'go' && parsed.kind !== 'vitest') {
    process.stderr.write(`[test-summary] --kind 只支持 go / vitest：${parsed.kind}\n`)
    process.exit(2)
  }

  let buffer
  try {
    buffer = readFileSync(parsed.log)
  } catch (error) {
    process.stderr.write(`[test-summary] 无法读取日志：${parsed.log}（${error.code || error.message}）\n`)
    process.exit(2)
  }

  const text = decodeLog(buffer)
  const lines = splitLines(text)
  const result = parsed.kind === 'go' ? summarizeGo(lines, parsed.log, parsed.maxLines) : summarizeVitest(lines, parsed.log, parsed.maxLines)

  if (!result) {
    process.stdout.write(`[test-summary] 无法识别日志格式（--kind ${parsed.kind}）：${parsed.log}\n`)
    process.stdout.write('--- 前 20 行原文 ---\n')
    for (const line of lines.slice(0, 20)) process.stdout.write(line + '\n')
    process.exit(2)
  }

  for (const line of result.lines) process.stdout.write(line + '\n')
}

main()

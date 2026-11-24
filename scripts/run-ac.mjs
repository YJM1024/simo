#!/usr/bin/env node
/**
 * run-ac.mjs：AC 断言汇总 runner（零依赖，只读仓库内容）
 *
 * scripts/ac 下每个 .mjs 是一个 AC 断言脚本，脚本把结果以一行 JSON 写到 stdout，
 * 退出码 0 表示通过、1 表示失败、2 表示参数或环境错误。runner 负责分组、并发、
 * 超时、证据落盘与汇总。
 *
 * 分组：文件名或伴随清单标了 cdp 的脚本串行执行，其余脚本并行，并发上限 4。
 * 伴随清单有两种写法，优先读 scripts/ac/manifest.json，其次读与脚本同名的 .json，
 * 形如 {"group":"cdp"}。文件名含 http 或 unit 的脚本归入对应组，未标记的默认 http。
 * 超时：单条脚本 120 秒，超时判 timeout 并终止子进程。
 * 证据：每条脚本写 .tmp/ac/<AC-ID>.json，含命令、参数、时间、耗时、退出码、
 * stdout 的 JSON 行与截断后的原始输出。
 *
 * 沙箱说明：本机受限会话禁止子进程使用管道，所以子进程的 stdout 与 stderr 重定向
 * 到 .tmp/ac-tooling/runner-io 下的临时文件，退出后读回。该做法在普通环境同样可用。
 *
 * 用法：
 *   node scripts/run-ac.mjs
 *   node scripts/run-ac.mjs --base-url http://127.0.0.1:8787
 *   node scripts/run-ac.mjs --only AC-CONV-001-01
 *   node scripts/run-ac.mjs --group cdp
 *   node scripts/run-ac.mjs --json
 *   node scripts/run-ac.mjs --self-test
 *
 * 汇总表列出 AC、结果、耗时、证据路径。--json 输出 counts 与 results。
 * 有 fail、timeout 或 error 时退出码为 1，全部通过为 0，参数错误为 2。
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const FIXTURE_DIR = join(DEFAULT_ROOT, '.tmp', 'ac-tooling', 'fixtures', 'runner')
const DEFAULT_TIMEOUT_MS = 120_000
const CONCURRENCY = 4
const IO_DIR = join('.tmp', 'ac-tooling', 'runner-io')
const GROUPS = new Set(['cdp', 'http', 'unit'])

/** 读取 scripts/ac 下的脚本与清单，返回带分组信息的条目。 */
function discoverScripts(root) {
  const acDir = join(root, 'scripts', 'ac')
  let names = []
  try {
    names = readdirSync(acDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }

  const central = readManifest(join(acDir, 'manifest.json'))
  return names.map((name, index) => {
    const ac = name.slice(0, -4)
    const file = join(acDir, name)
    const sidecar = readManifest(join(acDir, `${ac}.json`))
    const group = pickGroup(ac, central, sidecar)
    return { ac, file, group, index }
  })
}

function readManifest(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** 清单支持三种写法：AC 直接映射组名、scripts 映射对象、组名映射 AC 数组。 */
function pickGroup(ac, central, sidecar) {
  const candidates = [sidecar.group, central[ac], central.scripts?.[ac]?.group]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && GROUPS.has(candidate)) return candidate
  }
  for (const group of GROUPS) {
    const list = central[group]
    if (Array.isArray(list) && list.includes(ac)) return group
  }
  if (/cdp/i.test(ac)) return 'cdp'
  if (/http/i.test(ac)) return 'http'
  if (/unit/i.test(ac)) return 'unit'
  return 'http'
}

/** 跑一条脚本，返回结果对象；stdout 与 stderr 经临时文件回读，超时则终止进程。 */
function runOne(root, entry, options) {
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const ioDir = join(root, IO_DIR)
  mkdirSync(ioDir, { recursive: true })
  const safe = entry.ac.replace(/[^A-Za-z0-9_.-]/g, '_')
  const stdoutPath = join(ioDir, `${safe}.${process.pid}.${entry.index}.out`)
  const stderrPath = join(ioDir, `${safe}.${process.pid}.${entry.index}.err`)
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const args = [entry.file]
  if (options.baseUrl) args.push('--base-url', options.baseUrl)

  return new Promise((resolveResult) => {
    let settled = false
    let timedOut = false
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', stdoutFd, stderrFd],
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, options.timeoutMs)

    const finish = (code, signal, spawnError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      let stdout = ''
      let stderr = ''
      try {
        stdout = readFileSync(stdoutPath, 'utf8')
        stderr = readFileSync(stderrPath, 'utf8')
      } catch {
        stdout = ''
        stderr = ''
      }
      try {
        closeSync(stdoutFd)
        closeSync(stderrFd)
      } catch {
        // 文件描述符已关闭时忽略，结果照常返回。
      }

      const jsonLines = parseJsonLines(stdout)
      let result = 'pass'
      if (timedOut) result = 'timeout'
      else if (spawnError) result = 'error'
      else if (code !== 0) result = 'fail'

      const detail =
        jsonLines.find((item) => typeof item?.detail === 'string')?.detail ??
        (spawnError ? spawnError.message : '')
      const finishedAt = new Date().toISOString()
      const evidenceRelative = join('.tmp', 'ac', `${entry.ac}.json`).split('\\').join('/')
      const evidenceAbsolute = join(root, evidenceRelative)
      const record = {
        ac: entry.ac,
        group: entry.group,
        result,
        exitCode: code,
        signal: signal ?? null,
        durationMs: Date.now() - started,
        startedAt,
        finishedAt,
        baseUrl: options.baseUrl ?? null,
        script: relative(root, entry.file).split('\\').join('/'),
        command: process.execPath,
        args,
        detail,
        jsonLines,
      }
      writeEvidence(evidenceAbsolute, record, stdout, stderr)
      resolveResult({ ...record, evidence: evidenceRelative })
    }

    child.on('error', (error) => finish(null, null, error))
    child.on('close', (code, signal) => finish(code, signal))
  })
}

function parseJsonLines(stdout) {
  const parsed = []
  for (const line of stdout.split(/\r?\n/)) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    try {
      parsed.push(JSON.parse(text))
    } catch {
      // 非 JSON 行忽略，脚本允许在 JSON 之外写调试信息。
    }
  }
  return parsed
}

/** 证据控制在 8KB 以内，超出时截断原始输出并保留 JSON 行。 */
function writeEvidence(path, record, stdout, stderr) {
  const payload = {
    ...record,
    stdout: stdout.slice(0, 4000),
    stderr: stderr.slice(0, 2000),
    outputTruncated: stdout.length > 4000 || stderr.length > 2000,
  }
  let text = JSON.stringify(payload, null, 2)
  if (text.length > 8192) {
    payload.stdout = payload.stdout.slice(0, 1500)
    payload.stderr = payload.stderr.slice(0, 800)
    payload.outputTruncated = true
    text = JSON.stringify(payload, null, 2)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

/** cdp 组逐条执行，其余组用 4 个 worker 并行，结果按发现顺序回排。 */
async function runAll(root, entries, options) {
  const results = []
  const cdp = entries.filter((entry) => entry.group === 'cdp')
  const rest = entries.filter((entry) => entry.group !== 'cdp')

  for (const entry of cdp) {
    results.push(await runOne(root, entry, options))
  }

  const queue = [...rest]
  const workerCount = Math.min(CONCURRENCY, queue.length)
  const workers = []
  for (let worker = 0; worker < workerCount; worker += 1) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const entry = queue.shift()
          if (!entry) return
          results.push(await runOne(root, entry, options))
        }
      })(),
    )
  }
  await Promise.all(workers)
  results.sort((a, b) => {
    const left = entries.find((entry) => entry.ac === a.ac)?.index ?? 0
    const right = entries.find((entry) => entry.ac === b.ac)?.index ?? 0
    return left - right
  })
  return results
}

function summarize(results) {
  const counts = { pass: 0, fail: 0, timeout: 0, error: 0 }
  for (const item of results) counts[item.result] += 1
  return counts
}

function printTable(results, counts) {
  console.log('AC\t结果\t耗时\t证据')
  for (const item of results) {
    console.log(`${item.ac}\t${item.result}\t${item.durationMs}ms\t${item.evidence}`)
  }
  console.log(
    `汇总：${results.length} 条，pass ${counts.pass} / fail ${counts.fail} / timeout ${counts.timeout} / error ${counts.error}`,
  )
}

function writeSelfTestFixtures() {
  const acDir = join(FIXTURE_DIR, 'scripts', 'ac')
  mkdirSync(acDir, { recursive: true })
  writeFileSync(
    join(acDir, 'AC-TST-002-01.mjs'),
    [
      'const line = JSON.stringify({ ac: "AC-TST-002-01", pass: true, detail: "自检通过样本" })',
      'console.log(line)',
      'process.exit(0)',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-01.json'),
    '{"group":"cdp"}\n',
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-02.mjs'),
    [
      'const line = JSON.stringify({ ac: "AC-TST-002-02", pass: false, detail: "自检失败样本" })',
      'console.log(line)',
      'process.exit(1)',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-03.mjs'),
    [
      'const line = JSON.stringify({ ac: "AC-TST-002-03", pass: true, detail: "自检超时样本" })',
      'console.log(line)',
      'setTimeout(() => {}, 10000)',
      '',
    ].join('\n'),
    'utf8',
  )
}

async function runSelfTest() {
  writeSelfTestFixtures()
  const entries = discoverScripts(FIXTURE_DIR)
  const options = {
    baseUrl: 'http://127.0.0.1:1',
    timeoutMs: 1200,
  }
  const results = await runAll(FIXTURE_DIR, entries, options)
  const counts = summarize(results)
  let ok = true
  const cdpEntry = entries.find((entry) => entry.ac === 'AC-TST-002-01')
  const cdpOk = cdpEntry?.group === 'cdp'
  if (!cdpOk) ok = false
  console.log(`${cdpOk ? 'PASS' : 'FAIL'} 伴随清单把 AC-TST-002-01 标为 cdp 串行组`)
  const expectations = [
    ['pass', counts.pass, 1],
    ['fail', counts.fail, 1],
    ['timeout', counts.timeout, 1],
    ['总数', results.length, 3],
  ]
  for (const [label, actual, expected] of expectations) {
    const passed = actual === expected
    if (!passed) ok = false
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label} ${actual}，期望 ${expected}`)
  }
  const simulatedExit = counts.fail + counts.timeout + counts.error > 0 ? 1 : 0
  const exitOk = simulatedExit === 1
  if (!exitOk) ok = false
  console.log(`${exitOk ? 'PASS' : 'FAIL'} 汇总退出码 ${simulatedExit}，期望 1`)
  const evidenceOk = results.every((item) => existsSync(join(FIXTURE_DIR, item.evidence)))
  if (!evidenceOk) ok = false
  console.log(`${evidenceOk ? 'PASS' : 'FAIL'} 三条证据文件均已写入`)
  console.log(ok ? 'SELF-TEST PASS' : 'SELF-TEST FAILED')
  return ok ? 0 : 1
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    json: false,
    selfTest: false,
    baseUrl: undefined,
    only: [],
    group: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--self-test') options.selfTest = true
    else if (arg === '--base-url') {
      options.baseUrl = argv[index + 1]
      if (!options.baseUrl) return { error: '--base-url 缺少地址参数' }
      index += 1
    } else if (arg === '--only') {
      const value = argv[index + 1]
      if (!value) return { error: '--only 缺少 AC ID' }
      options.only.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      index += 1
    } else if (arg === '--group') {
      const value = argv[index + 1]
      if (!value || !GROUPS.has(value)) return { error: '--group 只接受 cdp、http、unit' }
      options.group = value
      index += 1
    } else if (arg === '--root') {
      const value = argv[index + 1]
      if (!value) return { error: '--root 缺少目录参数' }
      options.root = resolve(value)
      index += 1
    } else if (arg === '--timeout') {
      const value = Number(argv[index + 1])
      if (!Number.isFinite(value) || value <= 0) return { error: '--timeout 需要正毫秒数' }
      options.timeoutMs = value
      index += 1
    } else {
      return { error: `未知参数 ${arg}` }
    }
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.error) {
    console.error(options.error)
    return 2
  }
  if (options.selfTest) return runSelfTest()

  if (!existsSync(options.root) || !statSync(options.root).isDirectory()) {
    console.error(`仓库根目录不可读：${options.root}`)
    return 2
  }

  let entries = discoverScripts(options.root)
  if (options.group) entries = entries.filter((entry) => entry.group === options.group)
  if (options.only.length > 0) entries = entries.filter((entry) => options.only.includes(entry.ac))

  if (entries.length === 0) {
    console.log('没有匹配的 AC 断言脚本')
    return 0
  }

  const results = await runAll(options.root, entries, options)
  const counts = summarize(results)
  if (options.json) {
    console.log(JSON.stringify({ counts, total: results.length, results }, null, 0))
  } else {
    printTable(results, counts)
  }
  return counts.fail + counts.timeout + counts.error > 0 ? 1 : 0
}

main().then((code) => process.exit(code))

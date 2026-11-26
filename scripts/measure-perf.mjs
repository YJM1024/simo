#!/usr/bin/env node
/**
 * measure-perf.mjs — 性能层测量与阈值判定（零依赖，Node 原生 http/https）
 *
 * 依据 docs/framework/MOXIAN.md 的 MX-9-24 与表 9-1 的性能层：对目标 HTTP(S)
 * 端点施加固定请求数与并发数，逐次记录耗时，输出 JSON 与一行人类可读摘要，
 * 并按 --threshold 判定 p95 等指标是否超限。
 *
 * 用法：
 *   node scripts/measure-perf.mjs --base-url <url> --path <path> \
 *     [--method GET] [--requests 50] [--concurrency 1] \
 *     [--header k:v]... [--threshold p95=200ms]... [--out <file>]
 *   node scripts/measure-perf.mjs --self-test
 *   node scripts/measure-perf.mjs --help
 *
 * 行为：
 *   - 请求走 http 或 https 模块，不读环境代理配置，不跟随重定向；
 *   - samples 记录每个收到响应的请求耗时，含 4xx 与 5xx；网络错误与超时
 *     没有响应，不进入样本；
 *   - errors 为失败请求数，统计网络错误、超时与状态码大于等于 400 的响应；
 *   - 成功指状态码 2xx 或 3xx，rps 按成功请求数除以整批实际耗时计算；
 *   - 分位数按升序样本线性插值，rank = p / 100 × (n - 1)，与常见统计口径一致；
 *   - 默认把 JSON 打到标准输出、摘要打到标准错误；指定 --out 时 JSON 写文件、
 *     摘要打到标准输出。脚本自身不在工作区根写日志，也不在未给 --out 时落盘；
 *   - --threshold 可重复，指标取 p50、p95、p99、min、max 或 mean，单位取
 *     ms、s、us 或省略（省略按毫秒）；
 *   - 退出码：0 通过；1 存在请求错误；2 超阈值或参数错误。超阈值优先于错误。
 *
 * --self-test 在本机随机端口起临时 HTTP 服务，覆盖 200 正常、500 计入错误、
 * 并发大于 1、超阈值退码、网络错误、请求头与方法透传、--out 落盘与 JSON 字段
 * 齐全；全部断言通过时打印 `SELF-TEST PASS (N assertions)` 并退出 0。自检在
 * `.tmp/measure-perf-self-test/` 下写一个输出文件并覆盖，不删除任何文件。
 */

import http from 'node:http'
import https from 'node:https'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, '..')
const REQUEST_TIMEOUT_MS = 30000
const DEFAULT_REQUESTS = 50
const DEFAULT_CONCURRENCY = 1
const REQUIRED_FIELDS = [
  'samples',
  'p50',
  'p95',
  'p99',
  'min',
  'max',
  'mean',
  'rps',
  'errors',
  'statusCodes',
  'startedAt',
  'durationMs',
  'params',
]
const THRESHOLD_METRICS = ['p50', 'p95', 'p99', 'min', 'max', 'mean']
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'token',
  'x-auth-token',
])

class UsageError extends Error {}

function usage() {
  return `measure-perf.mjs — 性能层测量与阈值判定（MX-9-24）

用法：
  node scripts/measure-perf.mjs --base-url <url> --path <path> [选项]
  node scripts/measure-perf.mjs --self-test
  node scripts/measure-perf.mjs --help

选项：
  --base-url <url>      必填，目标站点，支持 http 与 https
  --path <path>         必填，请求路径，可含查询串
  --method <method>     请求方法，默认 GET
  --requests <n>        请求总数，默认 ${DEFAULT_REQUESTS}
  --concurrency <n>     并发数，默认 ${DEFAULT_CONCURRENCY}，实际取请求数与并发数的较小值
  --header <k:v>        附加请求头，可重复；敏感头的值在 params 中脱敏
  --threshold <m=v>     判定阈值，可重复，例如 p95=200ms、mean=0.3s
  --out <file>          JSON 输出文件；缺省时 JSON 打标准输出
  --self-test           运行自检，不访问外部网络
  --help, -h            打印本说明

输出 JSON 字段：
  samples、p50、p95、p99、min、max、mean、rps、errors、statusCodes、
  startedAt、durationMs、params。

退出码：
  0  正常完成且无请求错误、无阈值超限
  1  正常完成但存在请求错误
  2  任一阈值超限，或参数与运行前置错误
`
}

function parseCount(raw, flag) {
  const text = String(raw ?? '').trim()
  if (!/^\d+$/.test(text)) throw new UsageError(`${flag} 需要正整数，收到「${raw}」`)
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new UsageError(`${flag} 需要正整数，收到「${raw}」`)
  }
  return value
}

function parseMilliseconds(raw, flag = '--threshold') {
  const text = String(raw ?? '').trim().toLowerCase()
  const match = text.match(/^(\d+(?:\.\d+)?)(ms|s|us|µs)?$/)
  if (!match) throw new UsageError(`${flag} 需要形如 200ms 的数值，收到「${raw}」`)
  const value = Number(match[1])
  const unit = match[2] ?? 'ms'
  const factor = unit === 's' ? 1000 : unit === 'us' || unit === 'µs' ? 0.001 : 1
  const milliseconds = value * factor
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new UsageError(`${flag} 数值超出范围：「${raw}」`)
  }
  return milliseconds
}

function parseThreshold(raw) {
  const text = String(raw ?? '').trim()
  const index = text.indexOf('=')
  if (index <= 0 || index === text.length - 1) {
    throw new UsageError(`--threshold 需要形如 p95=200ms，收到「${raw}」`)
  }
  const metric = text.slice(0, index).trim().toLowerCase()
  if (!THRESHOLD_METRICS.includes(metric)) {
    throw new UsageError(
      `--threshold 的指标取 ${THRESHOLD_METRICS.join('、')}，收到「${metric}」`,
    )
  }
  const limitMs = parseMilliseconds(text.slice(index + 1))
  return { metric, limitMs, raw: text }
}

function parseHeader(raw) {
  const text = String(raw ?? '')
  const index = text.indexOf(':')
  if (index <= 0) throw new UsageError(`--header 需要形如 k:v，收到「${raw}」`)
  const name = text.slice(0, index).trim()
  const value = text.slice(index + 1).trim()
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new UsageError(`--header 的名称不合法：「${name}」`)
  }
  return { name, value }
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    path: null,
    method: 'GET',
    requests: DEFAULT_REQUESTS,
    concurrency: DEFAULT_CONCURRENCY,
    headers: [],
    thresholds: [],
    out: null,
    selfTest: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') {
      options.selfTest = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    let name = arg
    let inline = null
    const equals = arg.indexOf('=')
    if (arg.startsWith('--') && equals > 2) {
      name = arg.slice(0, equals)
      inline = arg.slice(equals + 1)
    }

    const take = () => {
      if (inline !== null) return inline
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${name} 需要一个参数`)
      }
      index += 1
      return value
    }

    switch (name) {
      case '--base-url':
        options.baseUrl = take()
        break
      case '--path':
        options.path = take()
        break
      case '--method': {
        const method = take().trim().toUpperCase()
        if (!/^[A-Z][A-Z0-9-]*$/.test(method)) {
          throw new UsageError(`--method 不是合法方法名：「${method}」`)
        }
        options.method = method
        break
      }
      case '--requests':
        options.requests = parseCount(take(), '--requests')
        break
      case '--concurrency':
        options.concurrency = parseCount(take(), '--concurrency')
        break
      case '--header':
        options.headers.push(parseHeader(take()))
        break
      case '--threshold':
        options.thresholds.push(parseThreshold(take()))
        break
      case '--out':
        options.out = take()
        break
      default:
        throw new UsageError(`未知参数：${arg}`)
    }
  }

  if (options.selfTest || options.help) return options
  if (!options.baseUrl) throw new UsageError('缺少 --base-url')
  if (!options.path) throw new UsageError('缺少 --path')
  return options
}

function buildTarget(baseUrl, path) {
  let base
  try {
    base = new URL(baseUrl)
  } catch {
    throw new UsageError(`--base-url 不是合法 URL：「${baseUrl}」`)
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new UsageError(`--base-url 只支持 http 与 https：「${baseUrl}」`)
  }
  let target
  try {
    target = new URL(path, base)
  } catch {
    throw new UsageError(`--path 不能拼成合法 URL：「${path}」`)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new UsageError(`--path 解析出的协议不受支持：「${target.protocol}」`)
  }
  return target
}

function toHeaderObject(headers) {
  const result = {}
  for (const { name, value } of headers) {
    const key = name.toLowerCase()
    if (result[key] === undefined) {
      result[key] = value
    } else if (Array.isArray(result[key])) {
      result[key].push(value)
    } else {
      result[key] = [result[key], value]
    }
  }
  return result
}

function displayHeaders(headers) {
  return headers.map(({ name, value }) => {
    const shown = SENSITIVE_HEADERS.has(name.toLowerCase()) ? '<redacted>' : value
    return `${name}: ${shown}`
  })
}

function round(value, digits) {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * 升序样本的线性插值分位数。样本为空时返回 null，样本仅一项时返回该项。
 */
function percentile(sortedValues, p) {
  const count = sortedValues.length
  if (count === 0) return null
  if (count === 1) return sortedValues[0]
  const rank = (p / 100) * (count - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  const weight = rank - lower
  const value =
    sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight
  return round(value, 3)
}

function sendOnce(client, target, method, headers, timeoutMs) {
  return new Promise((resolvePromise) => {
    const begin = process.hrtime.bigint()
    let settled = false

    const finish = (outcome) => {
      if (settled) return
      settled = true
      const elapsed = Number(process.hrtime.bigint() - begin) / 1e6
      resolvePromise({ ...outcome, ms: elapsed })
    }

    let request
    try {
      request = client.request(target, { method, headers }, (response) => {
        response.on('data', () => {})
        response.on('end', () => finish({ statusCode: response.statusCode }))
        response.on('error', (error) => {
          finish({ error: error.code ?? error.message })
        })
      })
    } catch (error) {
      finish({ error: error.code ?? error.message })
      return
    }

    request.setTimeout(timeoutMs, () => {
      const error = new Error(`timeout ${timeoutMs}ms`)
      error.code = 'ETIMEDOUT'
      request.destroy(error)
    })
    request.on('error', (error) => finish({ error: error.code ?? error.message }))
    request.end()
  })
}

async function measure(options) {
  const target = buildTarget(options.baseUrl, options.path)
  const headers = toHeaderObject(options.headers)
  const client = target.protocol === 'https:' ? https : http
  const startedAt = new Date().toISOString()
  const startedNs = process.hrtime.bigint()
  const samples = []
  const statusCodeCounts = new Map()
  const failures = []
  let success = 0
  let cursor = 0

  const worker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= options.requests) return

      const outcome = await sendOnce(
        client,
        target,
        options.method,
        headers,
        REQUEST_TIMEOUT_MS,
      )

      if (outcome.statusCode !== undefined && outcome.statusCode !== null) {
        samples.push(outcome.ms)
        statusCodeCounts.set(
          outcome.statusCode,
          (statusCodeCounts.get(outcome.statusCode) ?? 0) + 1,
        )
      }

      if (outcome.error) {
        failures.push(outcome.error)
      } else if (outcome.statusCode >= 200 && outcome.statusCode < 400) {
        success += 1
      } else {
        failures.push(`HTTP ${String(outcome.statusCode)}`)
      }
    }
  }

  const workerCount = Math.max(1, Math.min(options.concurrency, options.requests))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  const durationMs = Number(process.hrtime.bigint() - startedNs) / 1e6
  const sorted = [...samples].sort((left, right) => left - right)
  const mean =
    sorted.length === 0
      ? null
      : sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  const statusCodes = {}
  for (const code of [...statusCodeCounts.keys()].sort((left, right) => left - right)) {
    statusCodes[String(code)] = statusCodeCounts.get(code)
  }

  return {
    target: target.href,
    samples,
    metrics: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      min: sorted.length === 0 ? null : round(sorted[0], 3),
      max: sorted.length === 0 ? null : round(sorted[sorted.length - 1], 3),
      mean: round(mean, 3),
      rps: durationMs > 0 ? round(success / (durationMs / 1000), 2) : null,
    },
    errors: failures,
    statusCodes,
    startedAt,
    durationMs: round(durationMs, 3),
    success,
    params: {
      url: target.href,
      baseUrl: options.baseUrl,
      path: options.path,
      method: options.method,
      requests: options.requests,
      concurrency: options.concurrency,
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers: displayHeaders(options.headers),
      thresholds: options.thresholds.map((item) => `${item.metric}<=${item.limitMs}ms`),
    },
  }
}

function toPayload(run) {
  return {
    samples: run.samples.map((value) => round(value, 3)),
    p50: run.metrics.p50,
    p95: run.metrics.p95,
    p99: run.metrics.p99,
    min: run.metrics.min,
    max: run.metrics.max,
    mean: run.metrics.mean,
    rps: run.metrics.rps,
    errors: run.errors.length,
    statusCodes: run.statusCodes,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    params: run.params,
  }
}

function formatMetric(value) {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(3)}ms`
}

function formatStatusCodes(statusCodes) {
  const entries = Object.entries(statusCodes)
  if (entries.length === 0) return '无'
  return entries.map(([code, count]) => `${code}×${count}`).join(' ')
}

function evaluateThresholds(thresholds, run) {
  return thresholds.map((threshold) => {
    const actual = run.metrics[threshold.metric] ?? null
    return {
      ...threshold,
      actual,
      pass: actual !== null && actual <= threshold.limitMs,
    }
  })
}

function decideExit(run, thresholds) {
  if (evaluateThresholds(thresholds, run).some((item) => !item.pass)) return 2
  if (run.errors.length > 0) return 1
  return 0
}

function formatSummary(run, options) {
  const results = evaluateThresholds(options.thresholds, run)
  const thresholdText =
    results.length === 0
      ? ''
      : ` 阈值 ${results
          .map(
            (item) =>
              `${item.metric}<=${item.limitMs}ms 实际 ${formatMetric(item.actual)} ${
                item.pass ? '通过' : '超限'
              }`,
          )
          .join('；')}`
  const outText = options.out ? ` 输出 ${resolve(process.cwd(), options.out)}` : ''
  return `[measure-perf] ${run.params.method} ${run.target} 请求 ${options.requests} 成功 ${run.success} 错误 ${run.errors.length} 状态码 ${formatStatusCodes(run.statusCodes)} p50=${formatMetric(run.metrics.p50)} p95=${formatMetric(run.metrics.p95)} p99=${formatMetric(run.metrics.p99)} min=${formatMetric(run.metrics.min)} max=${formatMetric(run.metrics.max)} mean=${formatMetric(run.metrics.mean)} rps=${run.metrics.rps ?? 'n/a'} 用时=${run.durationMs.toFixed(3)}ms${thresholdText}${outText}`
}

function writePayloadFile(payload, outputPath) {
  const absolutePath = resolve(process.cwd(), outputPath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return absolutePath
}

function emit(run, options) {
  const payload = toPayload(run)
  const summary = formatSummary(run, options)
  if (options.out) {
    writePayloadFile(payload, options.out)
    console.log(summary)
  } else {
    console.log(JSON.stringify(payload, null, 2))
    console.error(summary)
  }
}

function listen(server) {
  return new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => rejectPromise(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onError)
      resolvePromise()
    })
  })
}

function close(server) {
  return new Promise((resolvePromise) => {
    if (!server.listening) {
      resolvePromise()
      return
    }
    server.close(() => resolvePromise())
  })
}

async function runSelfTest() {
  const assertions = []
  const check = (label, ok) => {
    assertions.push({ label, ok: Boolean(ok) })
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  }

  const stats = { active: 0, maxActive: 0, seen: [] }
  const server = http.createServer((request, response) => {
    stats.active += 1
    stats.maxActive = Math.max(stats.maxActive, stats.active)
    stats.seen.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
    })

    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const finish = (statusCode, body, waitMs) => {
      setTimeout(() => {
        response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' })
        response.end(body)
        stats.active -= 1
      }, waitMs)
    }

    if (url.pathname === '/ok') finish(200, 'ok', 0)
    else if (url.pathname === '/fail') finish(500, 'boom', 0)
    else if (url.pathname === '/slow') {
      const waitMs = Number(url.searchParams.get('ms') ?? 20)
      finish(200, 'slow', Number.isFinite(waitMs) ? waitMs : 20)
    } else finish(404, 'not found', 0)
  })

  try {
    await listen(server)
    const port = server.address().port
    const baseUrl = `http://127.0.0.1:${port}`

    const okRun = await measure({
      baseUrl,
      path: '/ok',
      method: 'GET',
      requests: 12,
      concurrency: 1,
      headers: [],
      thresholds: [],
    })
    const payload = toPayload(okRun)

    check(
      'JSON 含全部 13 个约定字段且无多余字段',
      REQUIRED_FIELDS.every((field) => Object.hasOwn(payload, field)) &&
        Object.keys(payload).length === REQUIRED_FIELDS.length,
    )
    check(
      'samples 为数组且数量等于请求数',
      Array.isArray(payload.samples) && payload.samples.length === 12,
    )
    check(
      'samples 每项为有限数字',
      payload.samples.every((value) => Number.isFinite(value)),
    )
    check(
      'p50、p95、p99、min、max、mean 为有限数字',
      ['p50', 'p95', 'p99', 'min', 'max', 'mean'].every((key) =>
        Number.isFinite(payload[key]),
      ),
    )
    check(
      '分位数与极值顺序合理',
      payload.p50 <= payload.p95 &&
        payload.p95 <= payload.p99 &&
        payload.min <= payload.mean &&
        payload.mean <= payload.max,
    )
    check('200 正常场景 errors 为 0', payload.errors === 0)
    check('statusCodes 记录 200 共 12 次', payload.statusCodes['200'] === 12)
    check('startedAt 可解析为时间', !Number.isNaN(Date.parse(payload.startedAt)))
    check(
      'params 回显请求参数',
      payload.params.requests === 12 &&
        payload.params.concurrency === 1 &&
        payload.params.method === 'GET',
    )
    check('durationMs 为非负数', Number.isFinite(payload.durationMs) && payload.durationMs >= 0)
    check('200 正常场景退出码为 0', decideExit(okRun, []) === 0)

    check('分位数插值 p50([10,20,30,40]) 等于 25', percentile([10, 20, 30, 40], 50) === 25)
    check('分位数下端点等于最小值', percentile([1, 2, 3, 4], 0) === 1)
    check('分位数上端点等于最大值', percentile([1, 2, 3, 4], 100) === 4)
    check('空样本的分位数为 null', percentile([], 95) === null)

    const failRun = await measure({
      baseUrl,
      path: '/fail',
      method: 'GET',
      requests: 3,
      concurrency: 1,
      headers: [],
      thresholds: [],
    })
    const failPayload = toPayload(failRun)
    check('500 响应计入 errors', failPayload.errors === 3)
    check('500 响应计入 statusCodes', failPayload.statusCodes['500'] === 3)
    check('500 响应仍记录 samples', failPayload.samples.length === 3)
    check('500 场景退出码为 1', decideExit(failRun, []) === 1)

    stats.maxActive = 0
    const concurrentRun = await measure({
      baseUrl,
      path: '/slow?ms=40',
      method: 'GET',
      requests: 6,
      concurrency: 3,
      headers: [],
      thresholds: [],
    })
    check('并发 3 时服务端观察到的峰值并发不小于 2', stats.maxActive >= 2)
    check('并发峰值不超过设定并发数 3', stats.maxActive <= 3)
    check(
      '并发运行得到 6 个样本且无错误',
      concurrentRun.samples.length === 6 && concurrentRun.errors.length === 0,
    )

    const slowRun = await measure({
      baseUrl,
      path: '/slow?ms=25',
      method: 'GET',
      requests: 8,
      concurrency: 1,
      headers: [],
      thresholds: [],
    })
    check(
      'p95 超阈值时退出码为 2',
      decideExit(slowRun, [parseThreshold('p95=1ms')]) === 2,
    )
    check(
      'p95 未超阈值时退出码为 0',
      decideExit(okRun, [parseThreshold('p95=5000ms')]) === 0,
    )
    check('阈值单位换算 0.2s 等于 200ms', parseThreshold('p95=0.2s').limitMs === 200)

    const deadServer = http.createServer()
    await listen(deadServer)
    const deadPort = deadServer.address().port
    await close(deadServer)
    const networkRun = await measure({
      baseUrl: `http://127.0.0.1:${deadPort}`,
      path: '/',
      method: 'GET',
      requests: 2,
      concurrency: 1,
      headers: [],
      thresholds: [],
    })
    const networkPayload = toPayload(networkRun)
    check('网络错误计入 errors', networkPayload.errors === 2)
    check('网络错误不产生 samples', networkPayload.samples.length === 0)
    check('无样本时分位数为 null', networkPayload.p50 === null && networkPayload.p95 === null)
    check('网络错误场景退出码为 1', decideExit(networkRun, []) === 1)

    stats.seen = []
    const echoRun = await measure({
      baseUrl,
      path: '/ok',
      method: 'POST',
      requests: 1,
      concurrency: 1,
      headers: [
        parseHeader('X-Measure-Test: 42'),
        parseHeader('Authorization: Bearer secret'),
      ],
      thresholds: [],
    })
    const seen = stats.seen.at(-1)
    check(
      '请求方法与自定义头透传到服务端',
      seen?.method === 'POST' && seen?.headers['x-measure-test'] === '42',
    )
    check(
      '敏感请求头在 params 中脱敏',
      toPayload(echoRun).params.headers.some(
        (item) => item.toLowerCase().startsWith('authorization:') && item.endsWith('<redacted>'),
      ),
    )

    const outPath = join(WORKSPACE_ROOT, '.tmp', 'measure-perf-self-test', 'out.json')
    const outRun = await measure({
      baseUrl,
      path: '/ok',
      method: 'GET',
      requests: 4,
      concurrency: 1,
      headers: [],
      thresholds: [],
    })
    const written = writePayloadFile(toPayload(outRun), outPath)
    const parsed = JSON.parse(readFileSync(written, 'utf8'))
    check(
      '--out 写入可解析的 JSON 且样本数一致',
      Array.isArray(parsed.samples) && parsed.samples.length === 4,
    )
    check(
      '--out 文件字段与标准输出一致',
      REQUIRED_FIELDS.every((field) => Object.hasOwn(parsed, field)),
    )

    const summary = formatSummary(okRun, { thresholds: [], out: null })
    check(
      '人类可读摘要含 p50、p95、p99 与状态码',
      summary.includes('p50=') &&
        summary.includes('p95=') &&
        summary.includes('p99=') &&
        summary.includes('状态码'),
    )
  } catch (error) {
    check(`自检过程未抛出异常（${error.message}）`, false)
  } finally {
    if (server.listening) {
      server.closeAllConnections?.()
    }
    await close(server)
    http.globalAgent.destroy()
    https.globalAgent.destroy()
  }

  const failed = assertions.filter((item) => !item.ok)
  if (failed.length === 0) {
    console.log(`SELF-TEST PASS (${assertions.length} assertions)`)
    return 0
  }
  console.log(`SELF-TEST FAILED (${failed.length}/${assertions.length} assertions failed)`)
  return 1
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`参数错误：${error.message}`)
    console.error(usage())
    return 2
  }

  if (options.help) {
    console.log(usage())
    return 0
  }

  if (options.selfTest) {
    return runSelfTest()
  }

  let run
  try {
    run = await measure(options)
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`参数错误：${error.message}`)
      return 2
    }
    console.error(`测量失败：${error.stack ?? error.message}`)
    return 2
  }

  emit(run, options)
  return decideExit(run, options.thresholds)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(`运行失败：${error.stack ?? error.message}`)
    process.exitCode = 2
  })

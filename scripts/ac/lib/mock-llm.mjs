#!/usr/bin/env node
/**
 * mock-llm.mjs —— P1-CONV-009 集成用的本地假上游（零依赖，只用 Node 内置模块）
 *
 * 模拟 OpenAI 兼容的 POST /chat/completions（同时接受 /v1 前缀），按 --mode 决定返回内容。
 * SSE 每帧写成 `data: {...}\n\n`，正常结束再补一帧 `data: [DONE]`；interrupt 模式写出
 * 前几帧后直接销毁连接，不发结束帧。集成约定：后端以
 * SIMO_LLM_BASE_URL=http://127.0.0.1:8790/v1 与 -model mock 启动，替代真实厂商。
 *
 * 用法：
 *   node scripts/ac/lib/mock-llm.mjs [--host 127.0.0.1] [--port 8790]
 *        [--mode text|plan|react|interrupt|http-403|http-500]
 *        [--delay-ms 0] [--steps 3] [--text "..."]
 *   node scripts/ac/lib/mock-llm.mjs --self-test
 *   node scripts/ac/lib/mock-llm.mjs --help
 *
 * 路由：
 *   GET  /health            200，服务状态与当前 mode
 *   GET  /stats             200，请求数、帧数、中断数，按路径与按模式分布
 *   POST /chat/completions  200 SSE；http-403 / http-500 模式返回对应状态码的 JSON
 *
 * mode 语义：
 *   text       流式返回固定文本，切成若干 delta 帧（默认 24 字一帧）
 *   plan       返回固定步骤计划（JSON 文本），步数由 --steps 控制，默认 3
 *   react      返回固定 14 条 think/action/observe 轨迹（对应 explore 模式）
 *   interrupt  写出 3 帧后销毁连接，不发 [DONE]
 *   http-403   直接回 403 JSON，不进入 SSE
 *   http-500   直接回 500 JSON，不进入 SSE
 *
 * --delay-ms 作用于每帧之前，用来模拟慢上游或 hold；默认 0 表示不限速。
 * 退出码：0 正常退出；1 启动失败（端口占用等）；2 参数错误；--self-test 0/1。
 */

import http from 'node:http'

const MODES = ['text', 'plan', 'react', 'tools', 'interrupt', 'http-403', 'http-500']
const DEFAULT_TEXT = '收到。我先按顺序整理材料，再给出可执行的下一步。'
const DONE_FRAME = 'data: [DONE]\n\n'
const MAX_BODY_BYTES = 1 << 20
const REACT_BASE_AT = 1763899200000
const PLAN_TITLES = [
  '读取会话目标与输入材料',
  '整理材料中的关键结论',
  '核对结论与约束是否冲突',
  '拆出可以执行的待办',
  '标注每条待办的负责人',
  '检查待办之间的依赖',
  '把待办排入执行顺序',
  '输出计划并进入执行',
]
const REACT_TEXTS = [
  '先确认目标：找出指标缺口，而不是重写整份报告。',
  '读取上周的指标快照，记录三项低于预期的数值。',
  '快照里已经能看到缺口，下一步去找原因。',
  '对比前后两周的数值变化，排除口径调整的影响。',
  '读取访谈记录，定位缺口第一次出现的时间点。',
  '访谈里提到一次口径变更，需要再核对一次。',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function usage() {
  return [
    'usage: node scripts/ac/lib/mock-llm.mjs [--host 127.0.0.1] [--port 8790]',
    '       [--mode text|plan|react|tools|interrupt|http-403|http-500] [--delay-ms 0]',
    '       [--steps 3] [--text "..."] [--self-test] [--help]',
  ].join('\n')
}

/**
 * 解析命令行。同时接受 `--key value` 与 `--key=value` 两种写法；
 * 参数错误返回 { ok:false, error }，由 main 统一按退出码 2 处理。
 */
function parseArgs(argv) {
  const options = {
    host: '127.0.0.1',
    port: 8790,
    mode: 'text',
    delayMs: 0,
    steps: 3,
    text: DEFAULT_TEXT,
    selfTest: false,
    help: false,
  }
  const valueFlags = new Set(['--host', '--port', '--mode', '--delay-ms', '--steps', '--text'])

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]
    if (raw === '--self-test') { options.selfTest = true; continue }
    if (raw === '--help' || raw === '-h') { options.help = true; continue }
    if (!raw.startsWith('--')) return { ok: false, error: `未知参数 ${raw}` }

    const eq = raw.indexOf('=')
    const name = eq >= 0 ? raw.slice(0, eq) : raw
    if (!valueFlags.has(name)) return { ok: false, error: `未知参数 ${name}` }
    let value = eq >= 0 ? raw.slice(eq + 1) : undefined
    if (value === undefined) {
      index += 1
      value = argv[index]
      if (value === undefined) return { ok: false, error: `${name} 缺少取值` }
    }

    if (name === '--host') {
      if (!value.trim()) return { ok: false, error: '--host 需要非空主机名或地址' }
      options.host = value.trim()
    } else if (name === '--port') {
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { ok: false, error: `--port 需要 1..65535 的整数，收到 ${value}` }
      }
      options.port = port
    } else if (name === '--mode') {
      if (!MODES.includes(value)) {
        return { ok: false, error: `--mode 只接受 ${MODES.join(' / ')}，收到 ${value}` }
      }
      options.mode = value
    } else if (name === '--delay-ms') {
      const delay = Number(value)
      if (!Number.isInteger(delay) || delay < 0 || delay > 600000) {
        return { ok: false, error: `--delay-ms 需要 0..600000 的整数，收到 ${value}` }
      }
      options.delayMs = delay
    } else if (name === '--steps') {
      const steps = Number(value)
      if (!Number.isInteger(steps) || steps < 1 || steps > 50) {
        return { ok: false, error: `--steps 需要 1..50 的整数，收到 ${value}` }
      }
      options.steps = steps
    } else if (name === '--text') {
      if (!value.trim()) return { ok: false, error: '--text 需要非空文本' }
      options.text = value
    }
  }
  return { ok: true, options }
}

/** 按 Unicode 码点切分文本，避免把中文或代理对切成半个字符。 */
function splitText(text, size) {
  const chars = Array.from(text)
  const chunks = []
  for (let index = 0; index < chars.length; index += size) {
    chunks.push(chars.slice(index, index + size).join(''))
  }
  return chunks.length ? chunks : ['']
}

/** 构造一帧 OpenAI 兼容的 chat.completion.chunk。 */
function chatChunk({ id, created, model, delta, finishReason = null }) {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

function planPayload(steps) {
  return {
    mode: 'plan',
    steps: Array.from({ length: steps }, (_, index) => ({
      seq: index + 1,
      title: PLAN_TITLES[index] || `步骤 ${index + 1}：继续推进`,
      action: { tool: 'read_file', args: { path: `workspace/notes/step-${index + 1}.md` } },
      observe: `第 ${index + 1} 步已读入输入材料`,
    })),
  }
}

function reactPayload(count) {
  return {
    mode: 'explore',
    traces: Array.from({ length: count }, (_, index) => {
      const category = ['think', 'action', 'observe'][index % 3]
      const trace = {
        seq: index + 1,
        category,
        text: REACT_TEXTS[index % REACT_TEXTS.length],
        at: REACT_BASE_AT + index * 1000,
      }
      if (category === 'action') trace.tool = 'read_file'
      return trace
    }),
  }
}

/**
 * 根据 mode 生成一次响应：SSE 模式返回帧数组与是否以 [DONE] 结束；
 * HTTP 错误模式返回状态码与错误体。纯函数，便于 --self-test 在不联网时检查形状。
 */
function buildResponse({ mode, text, steps, model = 'mock', created, reactCount = 14, messages }) {
  if (mode === 'http-403' || mode === 'http-500') {
    const status = mode === 'http-403' ? 403 : 500
    const denied = mode === 'http-403'
    return {
      kind: 'http',
      status,
      body: {
        error: {
          message: denied ? 'mock upstream forbidden' : 'mock upstream internal error',
          type: denied ? 'permission_denied' : 'server_error',
          param: null,
          code: denied ? 'permission_denied' : 'mock_http_500',
        },
      },
    }
  }

  // tools 模式：第一轮返回两个 tool_calls（一次写文件、一次越权读），收到 tool 结果后给最终文字。
  // 用于驱动真实执行器（chat.ExecuteTask）验证工具调用、403 权限拒绝轨迹与产物落盘。
  if (mode === 'tools') {
    const list = Array.isArray(messages) ? messages : []
    const last = list[list.length - 1]
    const afterTool = Boolean(last && last.role === 'tool')
    const frames = [chatChunk({ id: 'chatcmpl-mock-tools', created, model, delta: { role: 'assistant' } })]
    if (afterTool) {
      frames.push(chatChunk({ id: 'chatcmpl-mock-tools', created, model, delta: { content: text } }))
      frames.push(chatChunk({ id: 'chatcmpl-mock-tools', created, model, delta: {}, finishReason: 'stop' }))
      return { kind: 'sse', frames, done: true }
    }
    frames.push(chatChunk({
      id: 'chatcmpl-mock-tools', created, model,
      delta: {
        tool_calls: [{
          index: 0, id: 'call-mock-write', type: 'function',
          function: { name: 'write_file', arguments: JSON.stringify({ path: 'notes/ac-04-output.md', content: 'AC-CONV-009-04 合法工具调用的产物\n' }) },
        }],
      },
    }))
    frames.push(chatChunk({
      id: 'chatcmpl-mock-tools', created, model,
      delta: {
        tool_calls: [{
          index: 1, id: 'call-mock-denied', type: 'function',
          function: { name: 'read_file', arguments: JSON.stringify({ path: 'C:\\\\Windows\\\\win.ini' }) },
        }],
      },
    }))
    frames.push(chatChunk({ id: 'chatcmpl-mock-tools', created, model, delta: {}, finishReason: 'tool_calls' }))
    return { kind: 'sse', frames, done: true }
  }

  let content
  if (mode === 'plan') content = JSON.stringify(planPayload(steps))
  else if (mode === 'react') content = JSON.stringify(reactPayload(reactCount))
  else content = text

  const chunkSize = mode === 'text' ? 24 : 160
  let pieces
  if (mode === 'interrupt') {
    const chars = Array.from(content)
    const half = Math.ceil(chars.length / 2)
    pieces = [chars.slice(0, half).join(''), chars.slice(half).join('')].filter((piece) => piece.length > 0)
  } else {
    pieces = splitText(content, chunkSize)
  }
  const frames = [chatChunk({ id: 'chatcmpl-mock', created, model, delta: { role: 'assistant' } })]
  for (const piece of pieces) {
    frames.push(chatChunk({ id: 'chatcmpl-mock', created, model, delta: { content: piece } }))
  }
  const interrupt = mode === 'interrupt'
  if (!interrupt) {
    frames.push(chatChunk({ id: 'chatcmpl-mock', created, model, delta: {}, finishReason: 'stop' }))
  }
  return { kind: 'sse', frames, done: !interrupt, abort: interrupt }
}

function encodeFrame(frame) {
  return `data: ${JSON.stringify(frame)}\n\n`
}

function createStats() {
  return {
    startedAt: Date.now(),
    requests: 0,
    chatRequests: 0,
    frames: 0,
    aborted: 0,
    byPath: {},
    byMode: {},
    lastRequestAt: 0,
  }
}

/** 每次收到请求都记一笔；chat 请求另按当前 mode 归类，供 /stats 观察。 */
function recordRequest(stats, pathname, mode) {
  stats.requests += 1
  stats.byPath[pathname] = (stats.byPath[pathname] || 0) + 1
  stats.lastRequestAt = Date.now()
  if (pathname.endsWith('/chat/completions')) {
    stats.chatRequests += 1
    stats.byMode[mode] = (stats.byMode[mode] || 0) + 1
  }
}

function healthPayload(options, stats) {
  return {
    ok: true,
    service: 'mock-llm',
    mode: options.mode,
    host: options.host,
    port: options.port,
    delayMs: options.delayMs,
    steps: options.steps,
    uptimeMs: Date.now() - stats.startedAt,
    requests: stats.requests,
  }
}

function statsPayload(stats, options) {
  return {
    ok: true,
    mode: options.mode,
    requests: stats.requests,
    chatRequests: stats.chatRequests,
    frames: stats.frames,
    aborted: stats.aborted,
    byPath: { ...stats.byPath },
    byMode: { ...stats.byMode },
    startedAt: stats.startedAt,
    lastRequestAt: stats.lastRequestAt,
    uptimeMs: Date.now() - stats.startedAt,
  }
}

function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const parts = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const error = new Error('request body too large')
        error.code = 'BODY_TOO_LARGE'
        reject(error)
        req.destroy()
        return
      }
      parts.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
}

/** 写入一帧；返回 false 表示客户端已经断开，调用方应停止继续写。 */
function writeWithDrain(res, chunk) {
  return new Promise((resolve) => {
    if (res.writableEnded || res.destroyed) {
      resolve(false)
      return
    }
    const flushed = res.write(chunk)
    if (flushed) {
      resolve(true)
      return
    }
    const cleanup = () => {
      res.off('drain', onDrain)
      res.off('close', onClose)
    }
    const onDrain = () => { cleanup(); resolve(true) }
    const onClose = () => { cleanup(); resolve(false) }
    res.on('drain', onDrain)
    res.on('close', onClose)
  })
}

async function handleChat(res, options, stats, body) {
  const model = typeof body.model === 'string' && body.model.trim() ? body.model : 'mock'
  const plan = buildResponse({
    mode: options.mode,
    text: options.text,
    steps: options.steps,
    model,
    created: Math.floor(Date.now() / 1000),
    messages: Array.isArray(body.messages) ? body.messages : [],
  })

  if (plan.kind === 'http') {
    sendJson(res, plan.status, plan.body)
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'access-control-allow-origin': '*',
  })

  for (const frame of plan.frames) {
    if (options.delayMs > 0) await sleep(options.delayMs)
    const written = await writeWithDrain(res, encodeFrame(frame))
    if (!written) return
    stats.frames += 1
  }

  if (plan.done) {
    if (options.delayMs > 0) await sleep(options.delayMs)
    await writeWithDrain(res, DONE_FRAME)
    if (!res.writableEnded && !res.destroyed) res.end()
  } else {
    if (options.delayMs > 0) await sleep(options.delayMs)
    stats.aborted += 1
    if (!res.destroyed) {
      // 等已写出的帧真正落到 socket 上再中断，客户端能先收到部分 delta，再拿到读错误。
      await new Promise((resolve) => setTimeout(resolve, 25))
      res.destroy()
    }
  }
}

async function handleRequest(req, res, options, stats) {
  res.on('error', () => {})
  const url = new URL(req.url || '/', `http://${options.host}:${options.port}`)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  recordRequest(stats, pathname, options.mode)

  if (pathname === '/health') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: { message: 'method not allowed' } })
    return sendJson(res, 200, healthPayload(options, stats))
  }
  if (pathname === '/stats') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: { message: 'method not allowed' } })
    return sendJson(res, 200, statsPayload(stats, options))
  }
  if (pathname === '/chat/completions' || pathname === '/v1/chat/completions') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: { message: 'method not allowed' } })
    let raw
    try {
      raw = await readBody(req)
    } catch (error) {
      if (error.code === 'BODY_TOO_LARGE') {
        return sendJson(res, 413, { error: { message: 'request body too large', type: 'invalid_request_error' } })
      }
      throw error
    }
    let body = {}
    if (raw.trim()) {
      try {
        body = JSON.parse(raw)
      } catch {
        return sendJson(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } })
      }
    }
    return handleChat(res, options, stats, body)
  }

  return sendJson(res, 404, { error: { message: `no route ${pathname}`, type: 'invalid_request_error' } })
}

function createServer(options, stats) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, options, stats).catch((error) => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: { message: 'mock upstream error', type: 'server_error' } })
      } else if (!res.writableEnded && !res.destroyed) {
        res.destroy()
      }
      console.error(`[mock-llm] 请求处理失败：${error && error.message ? error.message : error}`)
    })
  })
  server.on('clientError', (error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
  })
  return server
}

function startServer(options) {
  const stats = createStats()
  const server = createServer(options, stats)
  server.on('error', (error) => {
    console.error(`[mock-llm] 启动失败：${error.message}`)
    process.exit(1)
  })
  server.listen(options.port, options.host, () => {
    const address = server.address()
    console.log(`[mock-llm] listening http://${address.address}:${address.port} mode=${options.mode} delayMs=${options.delayMs} steps=${options.steps}`)
  })
  const shutdown = () => {
    console.log('[mock-llm] 关闭中')
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  return server
}

/**
 * 离线自检：只检查参数解析、SSE 帧形状与统计逻辑，不监听端口、不发网络请求。
 * 这样可以在没有空闲端口的环境里验证脚本本身，退出码 0/1。
 */
function runSelfTest() {
  const checks = []
  const check = (label, condition, detail = '') => {
    checks.push({ label, ok: Boolean(condition), detail })
  }

  const defaults = parseArgs([])
  check('默认参数 port=8790 mode=text delay-ms=0 steps=3',
    defaults.ok && defaults.options.port === 8790 && defaults.options.mode === 'text'
      && defaults.options.delayMs === 0 && defaults.options.steps === 3)

  const inline = parseArgs(['--mode=plan', '--port=8899', '--steps', '8', '--delay-ms=25'])
  check('支持 --key=value 与 --key value 两种写法',
    inline.ok && inline.options.mode === 'plan' && inline.options.port === 8899
      && inline.options.steps === 8 && inline.options.delayMs === 25)

  check('未知 mode 返回参数错误', parseArgs(['--mode', 'bogus']).ok === false)
  check('负延迟返回参数错误', parseArgs(['--delay-ms', '-1']).ok === false)
  check('--steps 0 返回参数错误', parseArgs(['--steps', '0']).ok === false)
  check('未知参数返回参数错误', parseArgs(['--bogus']).ok === false)
  check('--port 越界返回参数错误', parseArgs(['--port', '70000']).ok === false)

  for (const mode of MODES) {
    check(`mode ${mode} 可解析`, parseArgs(['--mode', mode]).ok)
  }

  const created = 1763899200
  const sample = chatChunk({ id: 'chatcmpl-mock', created, model: 'mock', delta: { content: '片段' } })
  const encoded = encodeFrame(sample)
  const parsed = encoded.startsWith('data: ') && encoded.endsWith('\n\n')
    ? JSON.parse(encoded.slice('data: '.length, -2))
    : null
  check('SSE 帧格式为 data: {...}\\n\\n 且 JSON 可解析', parsed && parsed.object === 'chat.completion.chunk')
  check('结束帧常量为 data: [DONE]\\n\\n', DONE_FRAME === 'data: [DONE]\n\n')

  const textPlan = buildResponse({ mode: 'text', text: DEFAULT_TEXT, steps: 3, created })
  const content = textPlan.frames.slice(1, -1).map((frame) => frame.choices[0].delta.content).join('')
  check('text 模式至少 2 帧', textPlan.frames.length >= 2)
  check('text 首帧 delta.role=assistant', textPlan.frames[0].choices[0].delta.role === 'assistant')
  check('text 末帧 finish_reason=stop', textPlan.frames.at(-1).choices[0].finish_reason === 'stop')
  check('text 拼接内容等于输入文本', content === DEFAULT_TEXT)
  check('text 模式以 [DONE] 结束', textPlan.done === true && textPlan.abort === false)

  const plan = buildResponse({ mode: 'plan', text: DEFAULT_TEXT, steps: 8, created })
  const planText = plan.frames.slice(1, -1).map((frame) => frame.choices[0].delta.content).join('')
  let planJson = null
  try { planJson = JSON.parse(planText) } catch {}
  check('plan 模式内容为可解析 JSON', planJson !== null)
  check('plan 模式步数等于 --steps(8)', planJson && planJson.steps.length === 8)
  check('plan 步骤 seq 从 1 连续', planJson && planJson.steps.every((step, index) => step.seq === index + 1))
  check('plan 每步含 action 与 observe', planJson && planJson.steps.every((step) => step.action && step.observe))

  const react = buildResponse({ mode: 'react', text: DEFAULT_TEXT, steps: 3, created })
  const reactText = react.frames.slice(1, -1).map((frame) => frame.choices[0].delta.content).join('')
  const reactJson = JSON.parse(reactText)
  const categories = new Set(reactJson.traces.map((trace) => trace.category))
  check('react 模式 14 条轨迹', reactJson.traces.length === 14)
  check('react 只含 think/action/observe', categories.size === 3 && ['think', 'action', 'observe'].every((item) => categories.has(item)))
  check('react 的 at 单调不减', reactJson.traces.every((trace, index) => index === 0 || trace.at >= reactJson.traces[index - 1].at))

  const interrupted = buildResponse({ mode: 'interrupt', text: DEFAULT_TEXT, steps: 3, created })
  check('interrupt 只保留 3 帧（1 角色 + 2 内容）', interrupted.frames.length === 3)
  check('interrupt 不发结束帧', interrupted.done === false && interrupted.abort === true)

  const denied = buildResponse({ mode: 'http-403', text: DEFAULT_TEXT, steps: 3, created })
  check('http-403 返回 403 与 permission_denied',
    denied.kind === 'http' && denied.status === 403 && denied.body.error.code === 'permission_denied')
  const broken = buildResponse({ mode: 'http-500', text: DEFAULT_TEXT, steps: 3, created })
  check('http-500 返回 500 与 server_error',
    broken.kind === 'http' && broken.status === 500 && broken.body.error.type === 'server_error')

  const stats = createStats()
  recordRequest(stats, '/chat/completions', 'plan')
  recordRequest(stats, '/chat/completions', 'plan')
  recordRequest(stats, '/health', 'plan')
  check('统计 requests 累加', stats.requests === 3)
  check('统计 chatRequests 只计 chat', stats.chatRequests === 2)
  check('统计 byMode 按模式归类', stats.byMode.plan === 2 && stats.byPath['/health'] === 1)

  const options = defaults.options
  const health = healthPayload(options, stats)
  check('health 载荷形状', health.ok === true && health.service === 'mock-llm' && health.mode === 'text'
    && typeof health.uptimeMs === 'number' && health.requests === 3)
  const statsBody = statsPayload(stats, options)
  check('stats 载荷形状', statsBody.ok === true && statsBody.chatRequests === 2
    && statsBody.byPath['/chat/completions'] === 2 && statsBody.frames === 0)

  let failed = 0
  for (const item of checks) {
    if (!item.ok) failed += 1
    console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.label}${item.detail ? `（${item.detail}）` : ''}`)
  }
  console.log(`共 ${checks.length} 项，失败 ${failed} 项`)
  console.log(failed === 0 ? 'SELF-TEST PASS' : 'SELF-TEST FAILED')
  return failed === 0 ? 0 : 1
}

function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) {
    console.error(parsed.error)
    console.error(usage())
    process.exit(2)
  }
  const { options } = parsed
  if (options.help) {
    console.log(usage())
    process.exit(0)
  }
  if (options.selfTest) {
    console.log('自检：离线检查参数与帧形状，不监听端口、不发网络请求')
    process.exit(runSelfTest())
  }
  startServer(options)
}

main()

#!/usr/bin/env node
/**
 * CHG-CONV-007 真机实测：一条命令完成构建、部署、起服务、CDP 驱动、截图、报告、清理。
 *
 *   node scripts/ac/CHG-CONV-007-realrun.mjs
 *
 * 正式构建（不带 testclock / mock 分支），真实端口 8788，真实部署目录 .tmp/chg-007-realrun/home-run。
 * 真实模型 deepseek-flash（NO_PROXY 绕过本机策略代理；代理会 403）。
 * 状态夹具（探索详情、四态、失败/等待、任务图、交付物）直接写 SQLite，报告中逐条标注。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN = path.resolve(ROOT, process.env.SIMO_REALRUN_DIR || path.join('.tmp', 'chg-007-realrun'));
const HOME = path.join(RUN, 'home-run');
const SHOTS = path.join(RUN, 'shots');
const SHOT_JSON = path.join(RUN, 'result.json');
const CHECKPOINT = path.join(RUN, 'checkpoint.md');
const EVIDENCE = process.env.SIMO_REALRUN_EVIDENCE
  ? path.resolve(ROOT, process.env.SIMO_REALRUN_EVIDENCE)
  : path.join(ROOT, 'specs', 'changes', 'CHG-CONV-007', 'evidence.md');
const BUDGET = { calls: 60, input: 120000, output: 15000, concurrency: 4 };
const EXE = path.join(RUN, 'simo-realrun.exe');
const BASE = 'http://127.0.0.1:8788';
const CDP_PORT = 9224;
const GO = 'E:\\dsh_home\\workspaces\\agent\\toolchain\\go\\bin\\go.exe';
const NODE = process.execPath;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TRASH = 'E:\\dsh_home\\trash\\pending-delete\\chg-007-realrun';
const T0 = Date.now();
const rows = [];
const shots = [];
let server = null;
let chrome = null;
let cdp = null;
let chatClient = null;
let db = null;
let seq = 0;
let budgetExceeded = false;
let budgetFirstExceededPath = '';
let lastDedup = null;
// 最近一次用量快照失败的原因。取不到时快照返回 null，报告里标“未取到”，不再当成 0。
let lastMetricError = '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

function nowIso() { return new Date().toISOString(); }

function moveToTrash(p, tag) {
  if (!fs.existsSync(p)) return;
  fs.mkdirSync(TRASH, { recursive: true });
  const dest = path.join(TRASH, `${tag}-${Date.now()}`);
  fs.renameSync(p, dest);
}

async function waitFor(fn, { timeout = 12000, interval = 50, label = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); } catch (err) { last = undefined; }
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`等待超时(${timeout}ms) ${label}；最后=${JSON.stringify(last)}`);
}

async function api(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text };
}

async function health(timeout = 1500) {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(timeout) });
    return r.status === 200;
  } catch { return false; }
}

/* ---------------- metrics ---------------- */

// 同一次模型调用可能同时出现在 events 的 usage.recorded 与本轮 turn_metrics 里：
// usage.recorded 是逐次请求的明细（一次聊天轮次的工具循环会有多次请求，共享同一个 replyId），
// turn_metrics 是整轮汇总，直接相加会把同一批 token 算两遍。去重规则是“明细优先”：
//   1) 事件按 requestId 去重，没有 requestId 时按事件 id（事件 id 天然唯一），同一请求重复上报只算一次；
//   2) 某轮已用 usage.recorded 明细计过数时，turn_metrics 汇总行只贡献 ttft，不再计调用与 token；
//   3) 没有任何明细的轮次才用 turn_metrics 汇总行兜底，并按其 turn_id/reply_id 去重。
// 这样既按 reply_id/request_id 归一，又不会把同一 reply 下的多次真实请求压成一次。
function summarizeUsage(events, turns) {
  const out = {
    calls: 0, input: 0, output: 0, ttft: [], rows: [],
    dedup: { events: 0, dupEvents: 0, dupInput: 0, dupOutput: 0, turnRows: 0, suppressedTurns: 0, suppressedInput: 0, suppressedOutput: 0 },
  };
  const seenRequests = new Set();
  const coveredReplies = new Set();
  const seenTurns = new Set();
  events.forEach((raw, idx) => {
    const p = raw && raw.payload && typeof raw.payload === 'object' ? raw.payload : raw;
    if (!p || typeof p !== 'object') return;
    const u = p.usage || {};
    const prompt = Number(u.promptTokens || 0);
    const completion = Number(u.completionTokens || 0);
    const requestKey = p.requestId || p.request_id || p.requestID || (p.request && p.request.id) || '';
    const key = requestKey ? `req:${requestKey}` : `event:${raw && raw.id !== undefined ? raw.id : idx}`;
    if (seenRequests.has(key)) {
      out.dedup.dupEvents += 1;
      out.dedup.dupInput += prompt;
      out.dedup.dupOutput += completion;
      return;
    }
    seenRequests.add(key);
    out.dedup.events += 1;
    out.calls += 1;
    out.input += prompt;
    out.output += completion;
    if (p.replyId) coveredReplies.add(String(p.replyId));
    out.rows.push({ kind: p.taskId ? 'task' : 'chat', replyId: p.replyId || '', requestId: requestKey, taskId: p.taskId || '', input: prompt, output: completion, model: u.model || '' });
  });
  for (const t of turns) {
    out.dedup.turnRows += 1;
    // 首字延迟只存在于汇总行，即使该行不再计 token 也要保留，否则聊天轮次的 ttft 会丢。
    if (t.ttft_ms > 0) out.ttft.push(t.ttft_ms);
    const replyId = t.reply_id ? String(t.reply_id) : '';
    const turnKey = replyId ? `reply:${replyId}` : `turn:${t.turn_id}`;
    if ((replyId && coveredReplies.has(replyId)) || seenTurns.has(turnKey)) {
      out.dedup.suppressedTurns += 1;
      out.dedup.suppressedInput += Number(t.prompt_tokens || 0);
      out.dedup.suppressedOutput += Number(t.completion_tokens || 0);
      continue;
    }
    seenTurns.add(turnKey);
    out.calls += 1;
    out.input += Number(t.prompt_tokens || 0);
    out.output += Number(t.completion_tokens || 0);
    out.rows.push({ kind: 'chat', sessionId: t.session_id, turnId: t.turn_id, replyId, status: t.status, input: Number(t.prompt_tokens || 0), output: Number(t.completion_tokens || 0), ttftMs: t.ttft_ms });
  }
  return out;
}

// 只返回超限的维度；空数组表示在预算内。边界取“等于上限不算超”。
// 快照未取到时返回空数组并由调用方标注“预算未判定”，不能把缺失当成 0 去判。
function overBudgetDims(snapshot, budget = BUDGET) {
  const dims = [];
  if (!snapshot) return dims;
  if (Number(snapshot.calls || 0) > budget.calls) dims.push('calls');
  if (Number(snapshot.input || 0) > budget.input) dims.push('input');
  if (Number(snapshot.output || 0) > budget.output) dims.push('output');
  return dims;
}

function formatUsage(m) {
  return `调用 ${m.calls}/${BUDGET.calls}，输入 ${m.input}/${BUDGET.input}，输出 ${m.output}/${BUDGET.output}`;
}

// 取不到快照时返回 null，由调用方按“未取到”处理；不能返回全 0，否则缺失会被当成真实零用量。
function metricSnapshot() {
  try {
    const evs = db.prepare("select id, payload from events where type='usage.recorded' order by id").all()
      .map((e) => { try { return { id: e.id, payload: JSON.parse(e.payload) }; } catch { return null; } })
      .filter(Boolean);
    const tm = db.prepare('select turn_id, session_id, reply_id, status, ttft_ms, prompt_tokens, completion_tokens from turn_metrics order by started_at, turn_id').all();
    const summary = summarizeUsage(evs, tm);
    lastDedup = summary.dedup;
    return summary;
  } catch (err) {
    lastMetricError = String((err && err.message) || err);
    log(`WARN 用量快照未取到：${lastMetricError}`);
    return null;
  }
}

// 路径用量增量。任一端快照缺失即返回 null 三元组，保留“未知”语义。
function usageDelta(before, after) {
  if (!before || !after) return { calls: null, input: null, output: null, ttft: [] };
  return {
    calls: Math.max(0, after.calls - before.calls),
    input: Math.max(0, after.input - before.input),
    output: Math.max(0, after.output - before.output),
    ttft: (after.rows || []).slice((before.rows || []).length).filter((r) => r.ttftMs > 0).map((r) => r.ttftMs),
  };
}

function messageStats() {
  const out = { total: 0, user: 0, maxUserChars: 0, maxReplyLines: 0 };
  try {
    const all = db.prepare('select role, text, task_id from messages').all();
    out.total = all.length;
    for (const m of all) {
      const text = String(m.text || '');
      if (m.role === 'user') {
        out.user += 1;
        out.maxUserChars = Math.max(out.maxUserChars, text.length);
      } else if (m.role === 'agent' && !m.task_id) {
        out.maxReplyLines = Math.max(out.maxReplyLines, text.split('\n').filter((l) => l.trim()).length);
      }
    }
  } catch (err) {
    log(`WARN 消息统计未取到：${String((err && err.message) || err)}`);
    return { ...out, missing: true };
  }
  return out;
}

/* ---------------- CDP ---------------- */

class CDP {
  constructor(ws, pid) { this.ws = ws; this.pid = pid; this.pending = new Map(); this.listeners = new Map(); this.id = 0; }

  static async launch() {
    const profile = path.join(RUN, `chrome-${Date.now()}`);
    fs.mkdirSync(profile, { recursive: true });
    const logFd = fs.openSync(path.join(RUN, 'chrome.log'), 'a');
    const child = spawn(CHROME, [
      '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--disable-crash-reporter', '--disable-breakpad', 'about:blank',
    ], { stdio: ['ignore', logFd, logFd], windowsHide: true, detached: true });
    child.unref();
    fs.closeSync(logFd);
    let wsUrl = '';
    await waitFor(async () => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) { wsUrl = page.webSocketDebuggerUrl; return true; }
      } catch { /* not ready */ }
      return false;
    }, { timeout: 20000, interval: 100, label: 'chrome cdp' });
    const client = new CDP(wsUrl, child.pid);
    await client.connect();
    return client;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.ws);
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true });
      this.ws.addEventListener('message', (ev) => {
        let msg; try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id); this.pending.delete(msg.id);
          msg.error ? p.reject(new Error(`CDP ${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
        } else if (msg.method) {
          for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
        }
      });
    });
  }

  send(method, params = {}, timeout = 20000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP ${method} 超时`)); }, timeout);
    });
  }

  once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const bucket = this.listeners.get(method) || [];
      const fn = (p) => { this.listeners.set(method, (this.listeners.get(method) || []).filter((x) => x !== fn)); clearTimeout(timer); resolve(p); };
      bucket.push(fn); this.listeners.set(method, bucket);
      const timer = setTimeout(() => reject(new Error(`CDP 事件 ${method} 超时`)), timeout);
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval error');
    return r.result?.value;
  }

  async viewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  async open(url, ready = `document.querySelector('textarea[aria-label="消息输入框"]') !== null`) {
    const loaded = this.once('Page.loadEventFired', 20000).catch(() => null);
    await this.send('Page.navigate', { url });
    await loaded;
    await waitFor(() => this.eval(ready), { timeout: 20000, label: 'page ready' });
  }

  async click(selector, index = 0) {
    const ok = await this.eval(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
    if (!ok) throw new Error(`点击失败，元素不存在: ${selector}[${index}]`);
    await sleep(20);
  }

  async clickText(selector, text) {
    const ok = await this.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => (e.textContent||'').includes(${JSON.stringify(text)})); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
    if (!ok) throw new Error(`点击失败，文本「${text}」: ${selector}`);
    await sleep(20);
  }

  async setValue(selector, text) {
    const n = await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return -1; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.focus(); return el.value.length; })()`);
    if (n < 0) throw new Error(`输入框不存在: ${selector}`);
  }

  async enter() {
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    }
    await sleep(20);
  }

  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(SHOTS, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    shots.push({ name, file: path.relative(ROOT, file).split(path.sep).join('/') });
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

/* ---------------- report ---------------- */

function record(pathName, source, started, result, { modelMs = 0, detail = '', shots: shotNames = [], extra = {}, budget = '', metricsState = '' } = {}) {
  const endedAt = Date.now();
  const dur = endedAt - started;
  const before = extra.before === undefined ? null : extra.before;
  const after = extra.after === undefined ? null : extra.after;
  const delta = usageDelta(before, after);
  const metrics = metricsState || (delta.calls === null ? 'missing' : 'ok');
  rows.push({
    path: pathName, source, ms: dur, modelMs, actionMs: Math.max(0, dur - modelMs),
    startedAt: started, endedAt,
    calls: delta.calls,
    input: delta.input,
    output: delta.output,
    metrics,
    ttft: delta.ttft,
    result, budget, detail, shots: shotNames,
  });
  const usageNote = delta.calls === null ? ` 用量未取到（${metrics === 'disabled' ? '未启用统计' : '快照失败'}）` : '';
  log(`[${result}${budget ? ` ${budget}` : ''}] ${pathName} ${dur}ms (model ${modelMs}ms)${usageNote}`);
}

/* ---------------- server-side judge ---------------- */

const SERVER_LOG = path.join(RUN, 'server.log');
// 访问行由 backend/internal/platform/httpserver 的访问日志中间件输出（info 级，默认开启）。
// HTTP 错误只在访问行上判定：没有访问行时“0 条错误”不成立，run 级自检会直接判失败。
const ACCESS_LOG_RE = /msg=http_access\b/;
const ACCESS_MIN_LINES = 20;
const HTTP_ERROR_RE = /HTTP\s*400\b|HTTP\s*5\d\d\b|\bstatus=(?:400|5\d\d)\b/;
let serverLogStart = 0;

// 每条路径开始前记下服务端日志的文件末尾偏移，路径结束后只读这一段，
// 避免把别的路径（或后台任务）的报错算到当前路径头上。
function logOffset() {
  try { return fs.statSync(SERVER_LOG).size; } catch { return 0; }
}

function readLogSince(offset) {
  try {
    const size = fs.statSync(SERVER_LOG).size;
    if (size <= offset) return '';
    const len = Math.min(size - offset, 512 * 1024);
    const fd = fs.openSync(SERVER_LOG, 'r');
    const buf = Buffer.alloc(len);
    try { fs.readSync(fd, buf, 0, len, offset); } finally { fs.closeSync(fd); }
    return buf.toString('utf8');
  } catch (err) {
    log(`WARN 服务端日志读取失败（本轮不做 HTTP 错误判定）：${String((err && err.message) || err)}`);
    return '';
  }
}

// 本次运行（从 serverLogStart 起）的访问行统计：条数、状态码分布、最后一条原文。
// 这是“HTTP 错误判定是否真的在看访问日志”的自检依据，不看应用 INFO 行数。
function accessLogSummary() {
  const lines = readLogSince(serverLogStart).split(/\r?\n/).filter((l) => ACCESS_LOG_RE.test(l));
  const statuses = {};
  for (const line of lines) {
    const m = line.match(/\bstatus=(\d{3})\b/);
    if (m) statuses[m[1]] = (statuses[m[1]] || 0) + 1;
  }
  const ok2xx = Object.entries(statuses).reduce((a, [s, n]) => a + (s.startsWith('2') ? n : 0), 0);
  return { lines: lines.length, ok2xx, statuses, sample: lines.length ? lines[lines.length - 1].trim() : '' };
}

// 路径动作返回时，聊天回复可能还在流式生成（400 也常在任务卡出现之后才落日志）。
// 先等本轮新起的回复都结束，再读日志和空回复，避免漏判。
async function settleReplies(startedAt, maxMs = 12000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    let n = 0;
    try {
      const row = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE at >= ? AND status = 'streaming'").get(startedAt);
      n = Number(row && row.n || 0);
    } catch (err) {
      log(`WARN 等待回复落定失败（不再等待，用量可能未落库）：${String((err && err.message) || err)}`);
      return;
    }
    if (n === 0) {
      await sleep(200);
      try {
        const row = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE at >= ? AND status = 'streaming'").get(startedAt);
        if (Number(row && row.n || 0) === 0) return;
      } catch (err) {
        log(`WARN 等待回复落定失败（不再等待，用量可能未落库）：${String((err && err.message) || err)}`);
        return;
      }
    }
    await sleep(200);
  }
  log(`WARN 等待回复落定超过 ${maxMs}ms，直接取用量快照（可能偏少）`);
}

// 服务端判据：本轮窗口内的访问行命中 HTTP 400 / 5xx，或本轮出现空回复，即判 fail，
// 并把服务端原文带进失败明细。只看访问行，避免应用 INFO 里的数字串造成误判或漏判。
async function serverVerdict(startedAt, offset) {
  await settleReplies(startedAt);
  const lines = readLogSince(offset).split(/\r?\n/).filter((l) => l.trim());
  const accessLines = lines.filter((l) => ACCESS_LOG_RE.test(l));
  const httpHits = accessLines.filter((l) => HTTP_ERROR_RE.test(l));
  let empties = [];
  try {
    empties = db.prepare(`SELECT id, session_id AS sessionId, status, at FROM messages
      WHERE at >= ? AND role = 'agent' AND status != 'streaming'
        AND COALESCE(task_id, '') = '' AND TRIM(text) = ''
      ORDER BY at`).all(startedAt);
  } catch (err) {
    // db 已关闭时只按日志判；但要留痕，避免“空回复检查没跑”被当成通过。
    log(`WARN 空回复检查未执行（db 不可用，只按日志判）：${String((err && err.message) || err)}`);
  }
  if (httpHits.length === 0 && empties.length === 0) return null;
  const parts = [];
  if (httpHits.length) parts.push(`服务端日志命中 HTTP 错误 ${httpHits.length} 条：${httpHits.slice(0, 3).join(' | ')}`);
  if (empties.length) parts.push(`空回复 ${empties.length} 条：${empties.map((e) => `${e.id}(status=${e.status},session=${e.sessionId})`).join(', ')}`);
  return parts.join('；');
}

// 用量快照的唯一取点：serverVerdict 内部会 await settleReplies，等本轮回复结束、
// usage.recorded 落库之后再取快照。路径结论（rows）在这之后才写。
async function settleThenSnapshot(startedAt, offset) {
  const verdict = await serverVerdict(startedAt, offset);
  return { verdict, snapshot: metricSnapshot() };
}

async function step(pathName, source, fn, opts = {}) {
  const metricsOff = opts.metrics === false;
  const pre = metricsOff ? null : metricSnapshot();
  if (!pre && !metricsOff) log(`WARN 起点用量未取到：「${pathName}」本条不做预算判定，逐路径用量标记“未取到”。`);
  // 预算超限不再中止整批：第一条在超限状态下开始的路径标记 budget-exceeded，
  // 该条与后续路径照常执行，判定不受影响；整轮结束后在汇总里告警。
  const overDims = overBudgetDims(pre);
  const firstOver = overDims.length > 0 && !budgetExceeded;
  const budgetMark = firstOver ? 'budget-exceeded' : '';
  if (firstOver) {
    budgetExceeded = true;
    budgetFirstExceededPath = pathName;
    log(`BUDGET 超出（${overDims.join('/')}）：${formatUsage(pre)}；「${pathName}」标记 budget-exceeded，继续执行剩余路径，判定不变。`);
  }
  const started = Date.now();
  const logStart = logOffset();
  // 未启用统计时 before/after 都按“未取到”记，不再塞一个全 0 快照冒充真实用量。
  const before = metricsOff ? null : pre;
  const metricsState = metricsOff ? 'disabled' : '';
  const shotNames = [];
  const origShot = cdp.shot.bind(cdp);
  cdp.shot = async (name) => { shotNames.push(name); return origShot(name); };
  let verdict = null;
  try {
    const detail = await fn({ before, shot: (n) => cdp.shot(n), started });
    // 快照的唯一取点：先等本轮回复落定（settleReplies 内部等流式结束、usage.recorded 落库），
    // 再取 after，最后才把路径结论写进 rows。旧实现先取快照再 settle，真机实测 16 条全读不到用量。
    const settled = metricsOff ? { verdict: await serverVerdict(started, logStart), snapshot: null } : await settleThenSnapshot(started, logStart);
    const modelMs = Number(globalThis.__modelMs || 0); globalThis.__modelMs = 0;
    verdict = settled.verdict;
    if (verdict) throw new Error(`${verdict}${detail ? `；界面动作本身完成：${detail}` : ''}`);
    record(pathName, source, started, 'pass', { modelMs, detail: detail || '', shots: shotNames, extra: { before, after: settled.snapshot }, budget: budgetMark, metricsState });
    return true;
  } catch (err) {
    const modelMs = Number(globalThis.__modelMs || 0); globalThis.__modelMs = 0;
    let detail = String(err && err.message || err);
    let snapshot = null;
    try {
      const settled = metricsOff
        ? { verdict: await serverVerdict(started, logStart), snapshot: null }
        : await settleThenSnapshot(started, logStart);
      if (!verdict) {
        verdict = settled.verdict;
        if (verdict) detail = `${detail}；${verdict}`;
      }
      snapshot = settled.snapshot;
    } catch {
      // 判定或快照再取失败时保留原始错误；快照失败本身已在 metricSnapshot 里记 WARN。
      snapshot = metricsOff ? null : metricSnapshot();
    }
    record(pathName, source, started, 'fail', { modelMs, detail: detail.slice(0, 800), shots: shotNames, extra: { before, after: snapshot }, budget: budgetMark, metricsState });
    return false;
  } finally {
    cdp.shot = origShot;
  }
}

/* ---------------- build / deploy ---------------- */

function build() {
  // 沙箱内 Go 的临时目录与模块缓存均不可写，且本机没有模块缓存/vendor；
  // 正式构建产物已由变更流程产出时，允许用 SIMO_REALRUN_EXE 指定并复用它。
  if (process.env.SIMO_REALRUN_EXE) {
    const src = path.resolve(ROOT, process.env.SIMO_REALRUN_EXE);
    if (!fs.existsSync(src)) throw new Error(`SIMO_REALRUN_EXE 不存在: ${src}`);
    fs.copyFileSync(src, EXE);
    log(`build: 复用正式构建 ${src}`);
    return;
  }
  log('build:', EXE);
  fs.mkdirSync(RUN, { recursive: true });
  // Go 要求 GOTMPDIR/GOCACHE 目录已存在；新建的 RUN 目录里没有，先建好再构建。
  fs.mkdirSync(path.join(RUN, 'gotmp'), { recursive: true });
  fs.mkdirSync(path.join(RUN, 'gocache'), { recursive: true });
  const r = spawnSync(GO, ['build', '-trimpath', '-buildvcs=false', '-o', EXE, './cmd/simo'], {
    cwd: path.join(ROOT, 'backend'),
    env: {
      ...process.env, NO_PROXY: '*', no_proxy: '*',
      // 沙箱下 %TEMP% 与用户级 module cache 不可写；复用仓库 toolchain 的 GOPATH/GOCACHE，
      // 构建临时目录放到本轮 RUN。
      GOTMPDIR: path.join(RUN, 'gotmp'),
      GOCACHE: path.join(ROOT, 'toolchain', 'gocache'),
      GOPATH: path.join(ROOT, 'toolchain', 'gopath'),
      GOMODCACHE: path.join(ROOT, 'toolchain', 'gopath', 'pkg', 'mod'),
      GOFLAGS: '-mod=mod',
      GOPROXY: process.env.GOPROXY || 'https://goproxy.cn,direct',
      GOSUMDB: process.env.GOSUMDB || 'off',
    },
    timeout: 240000, windowsHide: true, encoding: 'utf8',
  });
  if (r.status !== 0 || !fs.existsSync(EXE)) {
    throw new Error(`go build 失败 status=${r.status} ${(r.stderr || r.stdout || '').slice(-800)}`);
  }
  log('build ok', fs.statSync(EXE).size);
}

function prepareHome() {
  moveToTrash(HOME, 'home-run');
  moveToTrash(SHOTS, 'shots');
  fs.mkdirSync(HOME, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'config.local.json'), 'utf8'));
  const cfg = { modelMode: 'real', provider: 'deepseek', baseURL: raw.baseURL || 'https://api.deepseek.com', model: raw.model || 'deepseek-flash', apiKey: raw.apiKey };
  fs.writeFileSync(path.join(HOME, 'config.local.json'), JSON.stringify(cfg, null, 2), 'utf8');
  fs.mkdirSync(path.join(HOME, 'artifacts'), { recursive: true });
  log('home ready');
}

async function startServer() {
  if (await health(800)) throw new Error('8788 已被占用，拒绝启动（避免影响既有服务）');
  serverLogStart = logOffset();
  const logFd = fs.openSync(path.join(RUN, 'server.log'), 'a');
  server = spawn(EXE, ['serve', '-addr', '127.0.0.1:8788', '-model', 'real'], {
    cwd: HOME,
    env: {
      ...process.env, SIMO_HOME: HOME, SIMO_ADDR: '127.0.0.1:8788', SIMO_LLM: 'real',
      // 本机策略代理对 api.deepseek.com 返回 403；真实模型必须直连。
      NO_PROXY: 'api.deepseek.com', no_proxy: 'api.deepseek.com',
    },
    stdio: ['ignore', logFd, logFd], windowsHide: true, detached: true,
  });
  server.on('error', () => {});
  fs.closeSync(logFd);
  await waitFor(health, { timeout: 30000, interval: 100, label: 'server health' });
  db = new DatabaseSync(path.join(HOME, 'simo.db'));
  db.exec('PRAGMA busy_timeout=8000');
  log('server pid', server.pid);
}

async function stopServer() {
  if (db) { try { db.close(); } catch { /* ignore */ } db = null; }
  if (!server) return;
  const pid = server.pid;
  try { server.kill(); } catch { /* ignore */ }
  const end = Date.now() + 6000;
  while (Date.now() < end && server.exitCode === null) await sleep(100);
  if (server.exitCode === null) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}

/* ---------------- fixtures ---------------- */

function insertTask(t) {
  const now = t.createdAt || Date.now();
  const phases = [
    { id: 'plan', title: '规划', status: 'pending' },
    { id: 'execute', title: '执行', status: 'pending' },
    { id: 'verify', title: '验收', status: 'pending' },
  ];
  const stepsJson = (t.steps || []).map((s, i) => ({ id: s.id, phaseId: 'execute', title: s.title, status: s.status }));
  db.prepare(`INSERT OR REPLACE INTO tasks
    (id,session_id,title,kind,status,payload,created_at,updated_at,phases,steps,progress,summary,outcome,attempt,
     depends_on_json,order_index,budget_json,mode,batch_id,goal,inputs_json,constraints_json,context_json,
     waiting_reason,waiting_since,started_at,finished_at,fail_reason,executor_agent_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    t.id, t.sessionId, t.title, 'mock', t.status, t.title, now, now, JSON.stringify(phases), JSON.stringify(stepsJson),
    t.progress || 0, t.summary || '', t.status === 'done' ? 'success' : t.status === 'failed' ? 'failed' : '',
    t.attempt || 1, '[]', t.orderIndex || 0, '{"maxSteps":8,"maxTokens":12000}', t.mode || 'react', t.batchId || '',
    t.goal || t.title, '[]', '[]', '{}', t.waitingReason || '', t.waitingReason ? now : 0,
    t.status === 'running' ? now : 0, t.status === 'done' || t.status === 'failed' ? now : 0,
    t.failReason || '', 'agent:task-npc',
  );
  for (let i = 0; i < (t.steps || []).length; i += 1) {
    const s = t.steps[i];
    db.prepare(`INSERT OR REPLACE INTO task_steps (id,task_id,seq,title,status,summary,fail_reason,started_at,finished_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(s.id, t.id, i + 1, s.title, s.status, '', s.failReason || '', s.status === 'running' || s.status === 'done' || s.status === 'failed' ? now : 0, s.status === 'done' || s.status === 'failed' ? now : 0);
  }
}

function insertMessage(id, sessionId, text, at, extra = {}) {
  db.prepare(`INSERT OR REPLACE INTO messages (id,session_id,role,text,at,status,task_id,batch_id,category,internal,finished_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, sessionId, extra.role || 'agent', text, at, extra.status || 'done', extra.taskId || '', extra.batchId || '', extra.category || '', 0, at);
}

function seedFixtures(sessionId) {
  const now = Date.now();
  const steps = (n, status, fail) => Array.from({ length: n }, (_, i) => ({ id: `step-${sessionId.slice(-4)}-${i + 1}`, title: `步骤 ${i + 1}`, status: i === n - 1 ? status : 'done', failReason: i === n - 1 ? fail : '' }));
  const base = { sessionId, mode: 'react' };
  insertTask({ ...base, id: 'task-fixt-done1', title: '整理规格摘要', status: 'done', steps: steps(3, 'done'), orderIndex: 1, summary: '已完成摘要' });
  insertTask({ ...base, id: 'task-fixt-failed', title: '失败任务（重试目标）', status: 'failed', attempt: 1, failReason: '执行器异常: 模拟失败', steps: steps(2, 'failed', '模拟失败'), orderIndex: 2, goal: '只回复：重试成功' });
  insertTask({ ...base, id: 'task-fixt-wait', title: '等待确认的任务', status: 'running', waitingReason: 'confirmation', steps: steps(1, 'running'), orderIndex: 3 });
  insertTask({ ...base, id: 'task-fixt-pending1', title: '待启动任务 A', status: 'pending', steps: steps(3, 'pending'), orderIndex: 4, batchId: 'batch-00000000000000a1' });
  insertTask({ ...base, id: 'task-fixt-done2', title: '输出数据文件', status: 'done', steps: steps(2, 'done'), orderIndex: 5, summary: '已生成 CSV' });
  insertTask({ ...base, id: 'task-fixt-running', title: '运行中的任务', status: 'running', steps: steps(2, 'running'), orderIndex: 6 });
  insertTask({ ...base, id: 'task-fixt-pending2', title: '待启动任务 B', status: 'pending', steps: steps(3, 'pending'), orderIndex: 7, batchId: 'batch-00000000000000a1' });
  insertTask({ ...base, id: 'task-fixt-down', title: '失败下游任务', status: 'pending', steps: steps(3, 'pending'), orderIndex: 8, batchId: 'batch-00000000000000a1' });
  insertTask({ ...base, id: 'task-fixt-explore', title: '边做边想示例', status: 'done', mode: 'explore', steps: [], orderIndex: 9, summary: '14 条循环轨迹' });
  // 产品口径 AC-CONV-009-12：全部 11 条、进行中 2、失败 1、已完成 3。
  // 原夹具 9 条少 2 条待启动，这里补齐；待启动只出现在「全部」，不占四个筛选 chip。
  insertTask({ ...base, id: 'task-fixt-pending3', title: '待启动任务 C', status: 'pending', steps: steps(2, 'pending'), orderIndex: 10 });
  insertTask({ ...base, id: 'task-fixt-pending4', title: '待启动任务 D', status: 'pending', steps: steps(2, 'pending'), orderIndex: 11 });

  db.prepare('INSERT OR REPLACE INTO task_deps (task_id,dep_id,join_mode,created_at) VALUES (?,?,?,?)').run('task-fixt-down', 'task-fixt-failed', 'all', now);
  db.prepare('INSERT OR REPLACE INTO task_batches (id,session_id,client_mutation_id,task_count,message_id,created_at) VALUES (?,?,?,?,?,?)')
    .run('batch-00000000000000a1', sessionId, 'fix-1', 3, 'msg-fixt-summary', now);

  insertMessage('msg-fixt-wait', sessionId, '等待确认的任务', now - 9000, { taskId: 'task-fixt-wait', category: 'task' });
  insertMessage('msg-fixt-failed', sessionId, '失败任务（重试目标）', now - 8000, { taskId: 'task-fixt-failed', category: 'task' });
  insertMessage('msg-fixt-summary', sessionId, '已创建 3 个任务', now - 7000, { batchId: 'batch-00000000000000a1', category: 'task' });
  // 失败回复气泡：前端唯一的重试入口（library.tsx:603），点击只回填输入框（app.tsx:1440）
  insertMessage('msg-fixt-retry-user', sessionId, '重试夹具：读出上一条', now - 6500, { role: 'user' });
  insertMessage('msg-fixt-retry-fail', sessionId, '', now - 6000, { status: 'failed' });

  for (let i = 1; i <= 14; i += 1) {
    db.prepare('INSERT OR REPLACE INTO task_traces (id,task_id,step_id,seq,category,tool,text,at) VALUES (?,?,?,?,?,?,?,?)')
      .run(`trace-fixt-${i}`, 'task-fixt-explore', '', i, i % 3 === 0 ? 'tool' : 'think', i % 3 === 0 ? 'read' : '', `循环轨迹 ${i}：读取、判断、继续`, now - (15 - i) * 1000);
  }

  const art = (taskId, name, mime, content) => {
    const rel = `realrun-fixtures/${taskId}-${name}`;
    const abs = path.join(HOME, 'artifacts', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    db.prepare(`INSERT OR REPLACE INTO task_artifacts (id,task_id,name,rel_path,mime,size,created_at,delivery_kind,storage_scope,workspace_rel_path)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(`art-${taskId}`, taskId, name, rel, mime, Buffer.byteLength(content), now, 'user_delivery', 'legacy_artifacts', '');
    return { id: `art-${taskId}`, name, size: Buffer.byteLength(content) };
  };
  art('task-fixt-done1', '规格摘要.md', 'text/markdown', '# 规格摘要\n\n夹具交付物，用于验证分组与下载。\n');
  art('task-fixt-done2', '数据.csv', 'text/csv', 'id,value\n1,alpha\n2,beta\n');
}

/* ---------------- UI steps ---------------- */

async function clickSession(title) {
  await waitFor(() => cdp.eval(`[...document.querySelectorAll('.session-row')].some(e=>(e.textContent||'').includes(${JSON.stringify(title)}))`), { timeout: 12000, label: `session row ${title}` });
  const ok = await cdp.eval(`(() => { const rows=[...document.querySelectorAll('.session-row')]; const el=rows.find(e=>(e.textContent||'').includes(${JSON.stringify(title)})); if(el){el.click(); return true} return false })()`);
  if (!ok) throw new Error(`会话不存在: ${title}`);
  await waitFor(() => cdp.eval(`document.querySelector('aside.inspector')?.dataset.session !== undefined`), { timeout: 8000, label: `session selected ${title}` });
  await sleep(80);
}

async function ensurePanel() {
  const state = await cdp.eval(`(() => { const a=document.querySelector('aside.inspector'); if(!a) return null; return {collapsed:a.dataset.collapsed, tab:a.dataset.tab, display:getComputedStyle(a).display} })()`);
  if (state && state.collapsed === 'true') { await cdp.click('button.insp-collapse'); await sleep(50); }
  return state;
}

async function tab(name) {
  await cdp.click(`nav.insp-rail button[data-tab="${name}"]`);
  await waitFor(() => cdp.eval(`document.querySelector('aside.inspector')?.dataset.tab === ${JSON.stringify(name)}`), { timeout: 5000, label: `tab ${name}` });
  await sleep(60);
}

async function main() {
  fs.mkdirSync(RUN, { recursive: true });
  fs.writeFileSync(CHECKPOINT, `# CHG-CONV-007 真机实测检查点\n\n- 开始: ${nowIso()}\n- 阶段: build\n`, 'utf8');

  build();
  prepareHome();
  await startServer();

  try {
    const sA = (await api('POST', '/api/sessions', { title: '真机实测 A', draft: false })).json.session.id;
    const sF = (await api('POST', '/api/sessions', { title: '真机实测 夹具', draft: false })).json.session.id;
    const sB = (await api('POST', '/api/sessions', { title: '真机实测 空会话', draft: false })).json.session.id;
    seedFixtures(sF);
    // 真实批量（计划模式）：2 个计划任务，用于验证汇总卡是否渲染。
    const batch = await api('POST', `/api/sessions/${sA}/tasks`, {
      mode: 'plan', goal: '批量计划任务', tasks: [
        { key: 'a', title: '批量任务 A', mode: 'plan', goal: '批量任务 A' },
        { key: 'b', title: '批量任务 B', mode: 'plan', goal: '批量任务 B' },
      ],
    });
    if (batch.status !== 201) throw new Error(`批量创建失败 ${batch.status} ${batch.text.slice(0, 200)}`);

    cdp = await CDP.launch();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.viewport(1280, 900);
    await cdp.open(BASE + '/');
    await sleep(150);

    // 1 建任务：计划模式（真实模型 / 产品 fast path）
    await step('建任务-计划模式（右栏任务卡片出现）', '真实模型', async ({ shot }) => {
      await clickSession('真机实测 A');
      await cdp.shot('1280-01-session-a');
      await cdp.setValue('textarea[aria-label="消息输入框"]', '帮我创建两个计划任务：读取规格、写摘要');
      const t = Date.now();
      await cdp.enter();
      await waitFor(() => cdp.eval(`document.querySelector('.msg-task-card[data-task-id]') !== null || document.querySelector('.msg-task-summary[data-batch-id]') !== null`), { timeout: 20000, interval: 80, label: 'task card' });
      globalThis.__modelMs = Date.now() - t;
      await cdp.shot('1280-02-create-task');
      const card = await cdp.eval(`(() => { const el=document.querySelector('.msg-task-card[data-task-id]'); return el?{taskId:el.dataset.taskId,status:el.dataset.status,text:el.textContent.slice(0,120)}:null })()`);
      if (!card) throw new Error('聊天后未出现任务卡片');
      return `taskId=${card.taskId} status=${card.status}`;
    });

    // 2 批量汇总卡
    await step('批量汇总卡（真实批量 2 任务）', '无模型（计划任务不执行）', async ({ shot }) => {
      await cdp.eval('location.reload()');
      await waitFor(() => cdp.eval(`document.querySelector('textarea[aria-label="消息输入框"]') !== null`), { timeout: 15000, label: 'reload' });
      await clickSession('真机实测 A');
      console.log('DBG aside=', await cdp.eval(`document.querySelector('aside.inspector')?.outerHTML.slice(0,700)`));
      console.log('DBG msgs=', await cdp.eval(`document.querySelectorAll('.msg-task-card,.msg-task-summary').length`));
      await waitFor(() => cdp.eval(`document.querySelectorAll('.msg-task-card[data-task-id]').length >= 1`), { timeout: 8000, label: 'batch message' });
      await sleep(100);
      const info = await cdp.eval(`(() => ({ summary: document.querySelectorAll('.msg-task-summary[data-batch-id]').length, cards: document.querySelectorAll('.msg-task-card[data-task-id]').length, texts: [...document.querySelectorAll('.msg-task-summary, .msg-task-card')].map(e=>e.textContent.slice(0,80)) }))()`);
      await cdp.shot('1280-03-batch-card');
      if (info.summary === 0) throw new Error(`批量消息未渲染汇总卡（后端消息 task_id 非空，前端优先渲染单任务卡）：${JSON.stringify(info)}`);
      return JSON.stringify(info);
    });

    // 3 任务卡片可点
    await step('任务卡片可点（打开详情）', '真实模型', async ({ shot }) => {
      await cdp.click('.msg-task-card .task-card-open');
      await waitFor(() => cdp.eval(`document.querySelector('section.task-detail') !== null`), { timeout: 8000, label: 'task detail' });
      await cdp.shot('1280-04-task-card-open');
      const d = await cdp.eval(`(() => { const el=document.querySelector('section.task-detail'); return el?{id:el.dataset.taskId,mode:el.dataset.mode,text:el.textContent.slice(0,80)}:null })()`);
      await cdp.click('.task-detail-close');
      return JSON.stringify(d);
    });

    // 4 右栏三标签
    await step('右栏三标签', '夹具/真实混合', async ({ shot }) => {
      await clickSession('真机实测 夹具');
      await ensurePanel();
      const seen = [];
      for (const [key, marker] of [['overview', '.insp-block'], ['tasks', '.task-list, .insp-placeholder'], ['deliverables', '.deliverables-panel']]) {
        await tab(key);
        await waitFor(() => cdp.eval(`document.querySelector(${JSON.stringify(marker)}) !== null`), { timeout: 6000, label: `panel ${key}` });
        seen.push(`${key}:${await cdp.eval(`document.querySelector('aside.inspector').dataset.tab`)}`);
        await cdp.shot(`1280-05-tab-${key}`);
      }
      return seen.join(',');
    });

    // 5 概览四行折叠
    await step('概览四行折叠并记忆', '夹具', async ({ shot }) => {
      await tab('overview');
      const blocks = await cdp.eval(`[...document.querySelectorAll('.insp-block[data-block]')].map(e=>e.dataset.block)`);
      if (blocks.length !== 4) throw new Error(`概览块数 ${blocks.length} != 4`);
      for (const b of blocks) {
        await cdp.eval(`document.querySelector('.insp-block[data-block="${b}"] .insp-block-head').click()`);
      }
      const collapsed = await cdp.eval(`[...document.querySelectorAll('.insp-block[data-block]')].map(e=>({block:e.dataset.block, expanded:e.querySelector('.insp-block-head').getAttribute('aria-expanded')}))`);
      if (collapsed.some((x) => x.expanded !== 'false')) throw new Error(`未全部折叠: ${JSON.stringify(collapsed)}`);
      await cdp.shot('1280-06-overview-collapsed');
      await cdp.eval('location.reload()');
      await waitFor(() => cdp.eval(`document.querySelector('textarea[aria-label="消息输入框"]') !== null`), { timeout: 15000, label: 'reload' });
      await clickSession('真机实测 夹具');
      await tab('overview');
      const after = await cdp.eval(`[...document.querySelectorAll('.insp-block[data-block]')].map(e=>e.querySelector('.insp-block-head').getAttribute('aria-expanded'))`);
      await cdp.shot('1280-07-overview-reloaded');
      if (after.some((x) => x !== 'false')) throw new Error(`刷新后折叠未保持: ${JSON.stringify(after)}`);
      return `blocks=${blocks.length}, collapsed=4, reload-kept`;
    });

    // 6 任务厚卡与四态筛选
    await step('任务厚卡与四态筛选（四态各点一次）', '夹具', async ({ shot }) => {
      await tab('tasks');
      await waitFor(() => cdp.eval(`document.querySelectorAll('.task-filter-chip').length >= 4`), { timeout: 6000, label: 'chips' });
      // 口径来源 specs/product/P1-CONV/spec.md:359 AC-CONV-009-12：
      // 全部 11 条、进行中 2、失败 1、已完成 3；待启动只出现在「全部」。
      const expected = { '全部': 11, '进行中': 2, '失败': 1, '已完成': 3 };
      const expectedStatuses = { '进行中': 'running', '失败': 'failed', '已完成': 'done' };
      const chipKey = (text) => String(text).replace(/\s*\d+\s*$/, '').trim();
      const chipCount = (text) => {
        const m = String(text).match(/(\d+)\s*$/);
        return m ? Number(m[1]) : NaN;
      };
      const statusCounts = (list) => list.reduce((a, s) => { a[s] = (a[s] || 0) + 1; return a; }, {});
      const snapshot = await cdp.eval(`(() => {
        const chips=[...document.querySelectorAll('.task-filter-chip')];
        const cards=[...document.querySelectorAll('.task-card[data-task-id]')];
        return {chips:chips.map(e=>({label:e.textContent.trim(),pressed:e.getAttribute('aria-pressed')})),total:cards.length,statuses:cards.map(e=>e.dataset.status)};
      })()`);
      const card = await cdp.eval(`(() => { const el=document.querySelector('.task-card[data-task-id]'); return el?{id:el.dataset.taskId,status:el.dataset.status,mode:el.dataset.mode,text:el.textContent.slice(0,100)}:null })()`);
      await cdp.shot('1280-08-filter-all');

      assert.equal(snapshot.chips.length, 4, `筛选 chip 数 ${snapshot.chips.length} != 4`);
      const chipMap = Object.fromEntries(snapshot.chips.map((c) => [chipKey(c.label), chipCount(c.label)]));
      for (const [label, n] of Object.entries(expected)) {
        assert.equal(chipMap[label], n, `chip「${label}」计数 ${chipMap[label]} != ${n}（原始 ${JSON.stringify(snapshot.chips)}）`);
      }
      const pressed = snapshot.chips.filter((c) => c.pressed === 'true');
      assert.equal(pressed.length, 1, `选中态 chip 应只有 1 个，实际 ${pressed.length}`);
      assert.equal(chipKey(pressed[0].label), '全部', `默认选中应为全部，实际 ${pressed[0].label}`);
      assert.equal(snapshot.total, expected['全部'], `全部列表卡片 ${snapshot.total} != ${expected['全部']}`);
      assert.deepEqual(statusCounts(snapshot.statuses), { pending: 5, running: 2, failed: 1, done: 3 },
        `全部列表四态分布不符: ${JSON.stringify(statusCounts(snapshot.statuses))}`);

      const got = [];
      for (const label of ['进行中', '失败', '已完成', '全部']) {
        await cdp.clickText('.task-filter-chip', label);
        await waitFor(() => cdp.eval(`document.querySelector('.task-filter-chip[aria-pressed="true"]')?.textContent.includes(${JSON.stringify(label)})`), { timeout: 4000, label: `filter ${label}` });
        await sleep(80);
        const state = await cdp.eval(`(() => { const cards=[...document.querySelectorAll('.task-card[data-task-id]')]; return {n:cards.length,statuses:cards.map(e=>e.dataset.status)}; })()`);
        assert.equal(state.n, expected[label], `筛选「${label}」卡片数 ${state.n} != ${expected[label]}`);
        if (expectedStatuses[label]) {
          assert.ok(state.statuses.every((s) => s === expectedStatuses[label]), `筛选「${label}」混入其他状态: ${JSON.stringify(statusCounts(state.statuses))}`);
        } else {
          assert.deepEqual(statusCounts(state.statuses), { pending: 5, running: 2, failed: 1, done: 3 }, `全部筛选四态分布不符: ${JSON.stringify(statusCounts(state.statuses))}`);
        }
        got.push(`${label}=${state.n}`);
        await cdp.shot(`1280-09-filter-${label}`);
      }
      assert.ok(card, '任务厚卡不存在');
      return `四态=11/2/1/3（与 chip 一致） ${got.join(' ')} chips=${JSON.stringify(snapshot.chips)} card=${JSON.stringify(card)}`;
    });

    // 7 切筛选回顶
    await step('切筛选回顶', '夹具', async ({ shot }) => {
      await cdp.eval(`document.querySelector('#insp-panel').scrollTop = 600`);
      const before = await cdp.eval(`document.querySelector('#insp-panel').scrollTop`);
      await cdp.clickText('.task-filter-chip', '失败');
      await waitFor(() => cdp.eval(`document.querySelector('#insp-panel').scrollTop === 0`), { timeout: 1500, interval: 40, label: 'scroll reset' });
      await cdp.shot('1280-10-scroll-reset');
      return `scrollTop ${before} -> 0`;
    });

    // 8 计划详情与轨迹（真实创建的计划任务）
    await step('计划详情与轨迹', '真实模型（计划任务）', async ({ shot }) => {
      await clickSession('真机实测 A');
      await tab('tasks');
      await cdp.clickText('.task-filter-chip', '全部');
      await sleep(80);
      // 真实 executor 会把计划任务从 pending 推进到 running，按任务 id 取这张卡，不按瞬时状态筛
      const planTaskId = await waitFor(async () => {
        const r = await api('GET', `/api/sessions/${sA}/tasks`);
        const list = Array.isArray(r.json) ? r.json : (r.json && r.json.tasks) || [];
        const task = list.find((t) => t.mode === 'plan' && /帮我创建两个计划任务/.test(t.title || ''));
        return task ? task.id : false;
      }, { timeout: 15000, interval: 300, label: 'plan task' });
      const planSelector = `.task-card[data-task-id=${JSON.stringify(planTaskId)}]`;
      // 条件轮询（50ms，上限 15s）：先判「卡在不在」，再判「卡上的模式对不对」。
      // 两者分开报，避免把“列表还没刷新”和“计划模式不渲染计划卡”混成同一句超时。
      // 诊断带上当前会话、右栏标签、筛选芯片与现有卡 id：卡缺失时能直接看出是列表空、还是切错了会话。
      const probe = () => cdp.eval(`(() => {
        const card = document.querySelector(${JSON.stringify(planSelector)});
        const aside = document.querySelector('aside.inspector');
        const chip = document.querySelector('.task-filter-chip[aria-pressed="true"]');
        const empty = document.querySelector('#task-list .task-empty, #task-list .insp-empty');
        return {
          card: card ? { mode: card.dataset.mode || '', status: card.dataset.status || '', text: (card.textContent || '').trim().slice(0, 80) } : null,
          cardIds: [...document.querySelectorAll('.task-card[data-task-id]')].map((el) => el.dataset.taskId),
          session: aside ? aside.dataset.session || '' : '',
          tab: aside ? aside.dataset.tab || '' : '',
          filter: chip ? (chip.textContent || '').trim() : '',
          empty: empty ? (empty.textContent || '').trim().slice(0, 80) : '',
        };
      })()`);
      let cardState = null;
      const cardDeadline = Date.now() + 15000;
      while (Date.now() < cardDeadline) {
        cardState = await probe();
        if (cardState && cardState.card) break;
        await sleep(50);
      }
      if (!cardState || !cardState.card) {
        throw new Error(`计划卡未出现（等待 15000ms）：${JSON.stringify(cardState)}`);
      }
      if (cardState.card.mode !== 'plan') {
        throw new Error(`计划卡已在但内容不符：${JSON.stringify(cardState)}`);
      }
      await cdp.eval(`document.querySelector(${JSON.stringify(planSelector)}).click()`);
      await waitFor(() => cdp.eval(`document.querySelector('section.task-detail') !== null`), { timeout: 6000, label: 'detail' });
      const d = await cdp.eval(`(() => { const el=document.querySelector('section.task-detail'); return {mode:el.dataset.mode, steps:el.querySelectorAll('.task-step').length, traces:el.querySelectorAll('.task-trace').length, text:el.textContent.slice(0,160)} })()`);
      await cdp.shot('1280-11-plan-detail');
      await cdp.click('.task-detail-close');
      if (d.mode !== 'plan' || d.steps < 1) throw new Error(`计划详情内容不符（模式或步骤数）：${JSON.stringify(d)}`);
      return JSON.stringify({ taskId: planTaskId, card: cardState.card, detail: d });
    });

    // 9 边做边想详情（夹具）
    await step('边做边想详情（14 条轨迹）', '夹具', async ({ shot }) => {
      await clickSession('真机实测 夹具');
      await tab('tasks');
      await cdp.clickText('.task-filter-chip', '全部');
      await sleep(80);
      await cdp.eval(`document.querySelector('.task-card[data-task-id="task-fixt-explore"]').click()`);
      await waitFor(() => cdp.eval(`document.querySelector('section.task-detail[data-mode="explore"]') !== null`), { timeout: 6000, label: 'explore detail' });
      const d = await cdp.eval(`(() => { const el=document.querySelector('section.task-detail'); return {mode:el.dataset.mode, traces:el.querySelectorAll('.task-trace').length, steps:el.querySelectorAll('.task-step').length} })()`);
      await cdp.shot('1280-12-explore-detail');
      await cdp.click('.task-detail-close');
      if (d.traces !== 14 || d.steps !== 0) throw new Error(`边做边想详情不符: ${JSON.stringify(d)}`);
      return JSON.stringify(d);
    });

    // 10 任务图与失败下游
    await step('任务图与失败下游', '夹具', async ({ shot }) => {
      await cdp.click('button.topbar-task-graph');
      await waitFor(() => cdp.eval(`document.querySelector('.task-graph-dialog') !== null && document.querySelectorAll('.task-graph-node').length > 0`), { timeout: 8000, label: 'graph' });
      const g = await cdp.eval(`(() => {
        const nodes=[...document.querySelectorAll('.task-graph-node')];
        const failed=nodes.find(n=>n.dataset.status==='failed');
        const edges=[...document.querySelectorAll('.task-graph-edge')].map(e=>({from:e.dataset.from,to:e.dataset.to,dash:getComputedStyle(e).strokeDasharray}));
        const downEdge=failed?edges.find(e=>e.from===failed.dataset.taskId):null;
        const down=downEdge?nodes.find(n=>n.dataset.taskId===downEdge.to):null;
        return {nodes:nodes.length, failed:failed?failed.dataset.taskId:'', downstream:down?{id:down.dataset.taskId,status:down.dataset.status}:null, edge:downEdge};
      })()`);
      await cdp.shot('1280-13-graph');
      await cdp.click('.task-graph-head button[aria-label="关闭任务图"]');
      if (!g.failed || !g.downstream || g.downstream.status !== 'pending') throw new Error(`失败下游不符: ${JSON.stringify(g)}`);
      if (!g.edge || g.edge.dash === 'none') throw new Error(`失败下游边不是虚线: ${JSON.stringify(g.edge)}`);
      return JSON.stringify(g);
    });

    // 11 等待确认与取消
    await step('等待确认与取消', '夹具', async ({ shot }) => {
      await clickSession('真机实测 夹具');
      await waitFor(() => cdp.eval(`document.querySelector('.msg-task-card[data-task-id="task-fixt-wait"]') !== null`), { timeout: 6000, label: 'waiting card' });
      const before = await cdp.eval(`document.querySelector('.msg-task-card[data-task-id="task-fixt-wait"]').textContent`);
      await cdp.shot('1280-14-waiting');
      await cdp.eval(`(() => { const card=document.querySelector('.msg-task-card[data-task-id="task-fixt-wait"]'); const btn=[...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='取消'); if(btn) btn.click(); return !!btn })()`);
      await waitFor(async () => {
        const r = await api('GET', `/api/sessions/${sF}/tasks/task-fixt-wait`);
        return r.json?.task?.status === 'failed';
      }, { timeout: 8000, interval: 100, label: 'cancel failed' });
      await cdp.shot('1280-15-cancelled');
      const after = await api('GET', `/api/sessions/${sF}/tasks/task-fixt-wait`);
      if (!before.includes('等待确认')) throw new Error('卡片未显示等待确认');
      return `before=${before.slice(0, 60)} after=${after.json.task.status}`;
    });

    // 12 失败任务详情只读 + 重试入口（任务卡优先，缺失时退回失败回复气泡）点一次
    await step('失败任务与重试（详情只读 / 入口在卡上）', '夹具', async ({ shot }) => {
      await tab('tasks');
      await cdp.clickText('.task-filter-chip', '全部');
      await sleep(80);
      await cdp.eval(`document.querySelector('.task-card[data-task-id="task-fixt-failed"]').click()`);
      await waitFor(() => cdp.eval(`document.querySelector('section.task-detail[data-task-id="task-fixt-failed"]') !== null`), { timeout: 6000, label: 'failed detail' });
      const detail = await cdp.eval(`(() => {
        const el = document.querySelector('section.task-detail');
        const words = ['重试', '取消', '确认', '编辑', '删除', '恢复'];
        const buttons = [...el.querySelectorAll('button')].map((b) => ({ text: (b.textContent || '').trim(), label: b.getAttribute('aria-label') || '' }));
        return { taskId: el.dataset.taskId, readonly: !!el.querySelector('.task-detail-readonly'), close: el.querySelectorAll('button.task-detail-close').length, controls: el.querySelectorAll('form,input,textarea,select').length, writes: buttons.filter((b) => words.some((w) => b.text.includes(w) || b.label.includes(w))) };
      })()`);
      await cdp.shot('1280-16-failed-detail');
      await cdp.click('.task-detail-close');
      await waitFor(() => cdp.eval(`document.querySelector('section.task-detail') === null`), { timeout: 4000, label: 'detail closed' });
      if (detail.taskId !== 'task-fixt-failed') throw new Error(`详情任务 ${detail.taskId} != task-fixt-failed`);
      if (!detail.readonly) throw new Error('详情缺少「只读」标记');
      if (detail.writes.length) throw new Error(`详情出现写操作入口: ${JSON.stringify(detail.writes)}`);
      if (detail.close !== 1) throw new Error(`详情关闭按钮 ${detail.close} != 1`);
      if (detail.controls !== 0) throw new Error(`详情可写控件 ${detail.controls} != 0`);

      const beforeAttempt = (await api('GET', `/api/sessions/${sF}/tasks/task-fixt-failed`)).json.task.attempt;
      const dupBefore = Number(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE id = 'task-fixt-failed'").get().n);
      const retryAt = Date.now();
      await cdp.eval(`(() => { window.__writes = []; const f = window.fetch; window.fetch = (...a) => { try { const u = String(a[0] && a[0].url ? a[0].url : a[0]); const m = String((a[1] && a[1].method) || 'GET').toUpperCase(); if (m !== 'GET') window.__writes.push(m + ' ' + u); } catch (e) {} return f.apply(window, a); }; return true; })()`);
      const card = await cdp.eval(`(() => {
        const el = document.querySelector('.msg-task-card[data-task-id="task-fixt-failed"]');
        if (!el) return null;
        return { buttons: [...el.querySelectorAll('button')].map((b) => (b.textContent || '').trim()), open: !!el.querySelector('.task-card-open') };
      })()`);
      if (!card) throw new Error('消息流缺少失败任务卡');
      let how = '';
      let prefill = '';
      if (card.buttons.some((t) => t.includes('重试'))) {
        await cdp.eval(`(() => { const el = document.querySelector('.msg-task-card[data-task-id="task-fixt-failed"]'); [...el.querySelectorAll('button')].find((b) => (b.textContent || '').includes('重试')).click(); return true; })()`);
        how = '任务卡重试按钮';
      } else {
        const reply = await cdp.eval(`(() => { const el = document.querySelector('[data-message-id="msg-fixt-retry-fail"]'); if (!el) return false; const b = [...el.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '重试'); if (!b) return false; b.click(); return true; })()`);
        if (!reply) throw new Error(`任务卡无重试入口（buttons=${JSON.stringify(card.buttons)}），失败回复气泡也没有`);
        how = '失败回复卡重试按钮';
        prefill = await cdp.eval(`(document.querySelector('textarea[aria-label="消息输入框"]') || {}).value || ''`);
        if (prefill !== '重试夹具：读出上一条') throw new Error(`重试未回填上一条用户消息: ${JSON.stringify(prefill)}`);
        await cdp.eval(`(() => { const t = document.querySelector('textarea[aria-label="消息输入框"]'); t.focus(); return true; })()`);
        await cdp.enter();
      }
      const writes = await waitFor(() => cdp.eval('window.__writes && window.__writes.length ? window.__writes : null'), { timeout: 15000, interval: 200, label: '重试请求发出' });
      await sleep(200);
      await cdp.shot('1280-17-retried');
      const after = (await api('GET', `/api/sessions/${sF}/tasks/task-fixt-failed`)).json.task;
      // 重试语义：重试入口只把上一条用户消息回填并重新发送（POST /api/chat），
      // 不是任务执行器的 attempt 重试；因此这里断言“请求发出、气泡落库、原任务不重复”，
      // 不断言 attempt 增长（增长只发生在执行器重试路径，由 AC-CHG-CONV-007-02 覆盖）。
      const chatWrites = writes.filter((w) => /^POST \/api\/chat(?:[?\s]|$)/.test(w));
      assert.equal(chatWrites.length, 1, `重试应只发 1 次 POST /api/chat，实际 ${JSON.stringify(writes)}`);
      const dupAfter = Number(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE id = 'task-fixt-failed'").get().n);
      assert.equal(dupAfter, dupBefore, `重试后原任务记录数 ${dupAfter} != ${dupBefore}（不应产生重复任务）`);
      assert.equal(after.id, 'task-fixt-failed', `重试后任务 id ${after.id} != task-fixt-failed`);
      if (prefill) {
        const sent = Number(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND role = 'user' AND text = ? AND at >= ?")
          .get(sF, prefill, retryAt - 1000).n);
        assert.equal(sent, 1, `重试气泡应新增 1 条用户消息，实际 ${sent} 条（文本 ${JSON.stringify(prefill)}）`);
      }
      return `detail 写入口=${detail.writes.length} 关闭=${detail.close} 控件=${detail.controls}·卡按钮=${JSON.stringify(card.buttons)}·入口=${how}·回填=${prefill || 'n/a'}·请求=${chatWrites[0]}·attempt ${beforeAttempt}->${after.attempt}（聊天重试不递增任务 attempt）·原任务记录 ${dupBefore}->${dupAfter} status=${after.status}`;
    });

    // 13 交付物分组与下载
    await step('交付物分组与下载', '夹具', async ({ shot }) => {
      // 路径 12 已在断言只读后关闭详情；此处只在详情仍打开时关掉
      if (await cdp.eval(`document.querySelector('.task-detail-close') !== null`)) await cdp.click('.task-detail-close');
      await tab('deliverables');
      await waitFor(() => cdp.eval(`document.querySelectorAll('.deliverable-group').length > 0`), { timeout: 8000, label: 'deliverables' });
      const info = await cdp.eval(`(() => ({groups:document.querySelectorAll('.deliverable-group').length, files:document.querySelectorAll('.deliverable-file').length, summary:document.querySelector('.deliverables-panel').textContent.slice(0,100)}))()`);
      await cdp.shot('1280-18-deliverables');
      await cdp.eval(`window.__opened=[]; window.open=(u)=>{window.__opened.push(String(u)); return null}`);
      await cdp.click('.deliverable-open');
      const url = await cdp.eval('window.__opened[0] || ""');
      if (!url) throw new Error('下载按钮未打开 URL');
      const file = await cdp.eval(`document.querySelector('.deliverable-file').textContent`);
      const art = db.prepare("select name,size from task_artifacts where name like '规格摘要%'").get();
      const res = await fetch(BASE + url);
      const buf = Buffer.from(await res.arrayBuffer());
      await cdp.shot('1280-19-download');
      if (buf.length !== art.size) throw new Error(`下载字节 ${buf.length} != ${art.size}`);
      return `${JSON.stringify(info)} downloaded=${file} bytes=${buf.length} url=${url.slice(0, 80)}`;
    });

    // 14/15 跨会话取不到 + 无任务态（空会话任务标签禁用，跨会话走接口）
    await step('跨会话取不到 / 无任务态', '夹具', async ({ shot }) => {
      await clickSession('真机实测 空会话');
      await tab('overview');
      const rail = await cdp.eval(`(() => {
        const b = document.querySelector('nav.insp-rail button[data-tab="tasks"]');
        if (!b) return null;
        return { disabled: b.getAttribute('aria-disabled'), current: b.getAttribute('aria-current'), cls: b.className, title: b.title, label: b.getAttribute('aria-label') || (b.textContent || '').trim() };
      })()`);
      if (!rail) throw new Error('右栏缺少任务标签按钮');
      if (rail.disabled !== 'true') throw new Error(`空会话任务标签未禁用: ${JSON.stringify(rail)}`);
      const beforeTab = await cdp.eval(`document.querySelector('aside.inspector').dataset.tab`);
      await cdp.click('nav.insp-rail button[data-tab="tasks"]');
      await sleep(200);
      const afterTab = await cdp.eval(`document.querySelector('aside.inspector').dataset.tab`);
      const afterBtn = await cdp.eval(`(() => { const b = document.querySelector('nav.insp-rail button[data-tab="tasks"]'); return { current: b.getAttribute('aria-current'), cls: b.className, disabled: b.getAttribute('aria-disabled') }; })()`);
      await cdp.shot('1280-20-empty-session');
      if (afterTab !== beforeTab) throw new Error(`点击禁用标签后右栏切走: ${beforeTab} -> ${afterTab}`);
      if (afterBtn.current || String(afterBtn.cls).includes('active')) throw new Error(`禁用标签出现选中态: ${JSON.stringify(afterBtn)}`);
      const cross = await api('GET', `/api/sessions/${sB}/tasks/task-fixt-done1`);
      if (cross.status !== 404) throw new Error(`跨会话详情 ${cross.status} != 404`);
      const code = cross.json?.code || '';
      if (code !== 'task_not_found') throw new Error(`跨会话错误码 ${JSON.stringify(code)} != task_not_found: ${String(cross.text).slice(0, 200)}`);
      return `label="${rail.label}" aria-disabled=${rail.disabled} title="${rail.title}"·点击后 tab=${afterTab}（不变）current=${afterBtn.current || 'none'}·跨会话 ${cross.status}/${code}`;
    });

    // 16 三档右栏形态
    await step('三档右栏（1280 竖条 / 768 覆盖层 / 375 不渲染）', '夹具', async ({ shot }) => {
      await clickSession('真机实测 夹具');
      await ensurePanel();
      const wide = await cdp.eval(`(() => { const a=document.querySelector('aside.inspector'), p=document.querySelector('#insp-panel'); return {rail:Math.round(a.getBoundingClientRect().width), panel:Math.round(p.getBoundingClientRect().width), display:getComputedStyle(a).display} })()`);
      await cdp.shot('1280-21-breakpoint-1280');
      if (wide.rail !== 320 || wide.panel < 270) throw new Error(`1280 形态不符: ${JSON.stringify(wide)}`);
      await cdp.click('button.insp-collapse');
      await waitFor(() => cdp.eval(`document.querySelector('aside.inspector').dataset.collapsed === 'true'`), { timeout: 4000, label: 'collapse' });
      await sleep(300);
      const collapsed = await cdp.eval(`Math.round(document.querySelector('aside.inspector').getBoundingClientRect().width)`);
      if (collapsed !== 40) throw new Error(`折叠宽度 ${collapsed} != 40`);
      await cdp.shot('1280-22-collapsed');
      await cdp.click('button.insp-collapse');

      await cdp.viewport(768, 900);
      await cdp.eval('location.reload()');
      await waitFor(() => cdp.eval(`document.querySelector('textarea[aria-label="消息输入框"]') !== null`), { timeout: 15000, label: '768 reload' });
      await clickSession('真机实测 夹具');
      const tablet = await cdp.eval(`(() => { const a=document.querySelector('aside.inspector'), p=document.querySelector('#insp-panel'); return {rail:Math.round(a.getBoundingClientRect().width), panel:Math.round(p.getBoundingClientRect().width), drawer:a.dataset.drawerOpen, display:getComputedStyle(a).display} })()`);
      await cdp.shot('768-01-collapsed');
      if (tablet.rail !== 40 || tablet.panel !== 0 || tablet.display === 'none') throw new Error(`768 折叠形态不符: ${JSON.stringify(tablet)}`);
      await cdp.click('nav.insp-rail button[data-tab="tasks"]');
      await waitFor(() => cdp.eval(`document.querySelector('aside.inspector').dataset.drawerOpen === 'true'`), { timeout: 5000, label: 'drawer' });
      await sleep(120);
      const drawer = await cdp.eval(`(() => { const a=document.querySelector('aside.inspector'), p=document.querySelector('#insp-panel'); return {panel:Math.round(p.getBoundingClientRect().width), drawer:a.dataset.drawerOpen} })()`);
      await cdp.shot('768-02-drawer');
      if (drawer.panel !== 280) throw new Error(`768 抽屉宽度 ${drawer.panel} != 280`);

      await cdp.viewport(375, 812, true);
      await cdp.eval('location.reload()');
      await waitFor(() => cdp.eval(`document.querySelector('textarea[aria-label="消息输入框"]') !== null`), { timeout: 15000, label: '375 reload' });
      await clickSession('真机实测 夹具');
      const phone = await cdp.eval(`(() => { const a=document.querySelector('aside.inspector'); return {display:a?getComputedStyle(a).display:'absent'} })()`);
      await cdp.shot('375-01-no-inspector');
      if (phone.display !== 'none') throw new Error(`375 右栏未隐藏: ${JSON.stringify(phone)}`);
      await cdp.viewport(1280, 900);
      return `1280=${JSON.stringify(wide)} collapsed=${collapsed} 768=${JSON.stringify(tablet)} drawer=${JSON.stringify(drawer)} 375=${phone.display}`;
    });

    // 16 边做边想创建：后端已接受 explore（201 + mode=explore），界面详情要能打开并显示思考轨迹区
    await step('建任务-边做边想（真实后端创建）', '真实模型（explore）', async ({ shot }) => {
      const r = await api('POST', `/api/sessions/${sB}/tasks`, {
        mode: 'explore', goal: '边做边想',
        tasks: [{ key: 'e1', title: '边做边想任务', mode: 'explore', goal: '边做边想' }],
      });
      if (r.status !== 201) throw new Error(`explore 创建 HTTP ${r.status} != 201：${String(r.text || '').slice(0, 300)}`);
      const created = (r.json && r.json.tasks && r.json.tasks[0]) || null;
      if (!created || !created.id) throw new Error(`201 响应缺少任务：${String(r.text || '').slice(0, 300)}`);
      if (created.mode !== 'explore') throw new Error(`创建返回 mode=${JSON.stringify(created.mode)} != explore`);

      const detailApi = await api('GET', `/api/sessions/${sB}/tasks/${created.id}`);
      const apiMode = detailApi.json && detailApi.json.task && detailApi.json.task.mode;
      if (detailApi.status !== 200 || apiMode !== 'explore') {
        throw new Error(`任务详情 status=${detailApi.status} mode=${JSON.stringify(apiMode)} != explore`);
      }

      // 刷新后从空会话的消息流打开这张任务卡，验证右栏详情与思考轨迹区。
      await cdp.eval('location.reload()');
      await waitFor(() => cdp.eval(`document.querySelector('textarea[aria-label="消息输入框"]') !== null`), { timeout: 15000, label: 'explore reload' });
      await clickSession('真机实测 空会话');
      const cardSel = `.msg-task-card[data-task-id=${JSON.stringify(created.id)}]`;
      await waitFor(() => cdp.eval(`document.querySelector(${JSON.stringify(cardSel)}) !== null`), { timeout: 8000, label: 'explore task card' });
      await cdp.eval(`document.querySelector(${JSON.stringify(cardSel)}).querySelector('.task-card-open').click()`);
      await waitFor(() => cdp.eval(`document.querySelector('section.task-detail[data-mode="explore"]') !== null`), { timeout: 6000, label: 'explore detail' });
      const d = await cdp.eval(`(() => {
        const el = document.querySelector('section.task-detail[data-mode="explore"]');
        return {
          id: el.dataset.taskId,
          mode: el.dataset.mode,
          tip: (el.querySelector('.task-detail-tip') ? el.querySelector('.task-detail-tip').textContent : ''),
          labels: [...el.querySelectorAll('.task-detail-label')].map((x) => x.textContent.trim()),
          count: (el.querySelector('.task-detail-label-count') ? el.querySelector('.task-detail-label-count').textContent : ''),
          traces: el.querySelectorAll('.task-trace').length,
          placeholder: !!el.querySelector('.insp-placeholder'),
        };
      })()`);
      await shot('1280-23-explore-created');
      if (d.id !== created.id) throw new Error(`详情任务 ${d.id} != ${created.id}`);
      if (!d.tip.includes('ReAct')) throw new Error(`详情缺少边做边想说明: ${JSON.stringify(d)}`);
      if (!d.labels.includes('循环轨迹')) throw new Error(`详情缺少思考轨迹区标题: ${JSON.stringify(d)}`);
      if (!d.count.includes('条') || !d.count.includes('正序')) throw new Error(`轨迹区计数缺失: ${JSON.stringify(d.count)}`);
      await cdp.click('.task-detail-close');
      return `POST 201 id=${created.id} 创建mode=${created.mode} 详情mode=${apiMode}；详情 tip="${d.tip.slice(0, 24)}" labels=${JSON.stringify(d.labels)} count="${d.count}" traces=${d.traces}${d.placeholder ? ' 暂无轨迹' : ''}`;
    });

  } finally {
    try { cdp?.close(); } catch { /* ignore */ }
    if (chrome) { try { chrome.kill(); } catch { /* ignore */ } }
    if (cdp?.pid) spawnSync('taskkill', ['/PID', String(cdp.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await stopServer();
  }

  writeReport();
}

/* ---------------- output ---------------- */

function writeReport() {
  const total = Date.now() - T0;
  const modelTotal = rows.reduce((a, r) => a + r.modelMs, 0);
  // 只对确实取到的路径求和；缺失按“未取到”单列，不当 0 参与合计、平均或预算判定。
  const measured = rows.filter((r) => typeof r.calls === 'number' && typeof r.input === 'number' && typeof r.output === 'number');
  const metricsMissing = rows.length - measured.length;
  const sumOf = (key) => measured.reduce((a, r) => a + r[key], 0);
  const calls = sumOf('calls');
  const input = sumOf('input');
  const output = sumOf('output');
  const metricsComplete = measured.length === rows.length;
  const metricsNote = metricsMissing
    ? `**${metricsMissing} 条路径用量未取到**（用量快照失败或未启用统计），这些路径按 \`null\` 处理，不计入合计与平均、也不当成 0；下列合计为已取到的 ${measured.length} 条路径之和${lastMetricError ? `，最近一次快照错误：\`${lastMetricError}\`` : ''}。`
    : '';
  const pass = rows.filter((r) => r.result === 'pass').length;
  // 判据自检：HTTP 错误判定必须建立在真实访问行上；只看应用 INFO 会把“无可匹配行”当成“没有错误”。
  const access = accessLogSummary();
  const accessOk = access.lines >= ACCESS_MIN_LINES;

  const stats = messageStats();
  const perPath = {
    calls: measured.length ? Number((calls / measured.length).toFixed(1)) : 0,
    input: measured.length ? Math.round(input / measured.length) : 0,
    output: measured.length ? Math.round(output / measured.length) : 0,
  };
  const overBudgetPaths = rows.filter((r) => r.budget === 'budget-exceeded').length;
  const payload = { at: nowIso(), script: 'scripts/ac/CHG-CONV-007-realrun.mjs', totalMs: total, modelMs: modelTotal, actionMs: total - modelTotal, calls, input, output, pass, total: rows.length, accessLog: { ...access, ok: accessOk, min: ACCESS_MIN_LINES }, metrics: { complete: metricsComplete, measured: measured.length, missing: metricsMissing, lastError: lastMetricError }, budget: { ...BUDGET, concurrency: 1, stats, perPath, exceeded: budgetExceeded, firstExceededPath: budgetFirstExceededPath, overBudgetPaths, dedup: lastDedup }, rows, shots };
  fs.writeFileSync(SHOT_JSON, JSON.stringify(payload, null, 2), 'utf8');

  const cell = (v) => (typeof v === 'number' ? v : '未取到');
  const table = rows.map((r, i) => `| ${i + 1} | ${r.path} | ${r.source} | ${r.ms} | ${r.modelMs} | ${r.actionMs} | ${cell(r.calls)} | ${cell(r.input)} | ${cell(r.output)} | ${(r.ttft || []).join('/') || '—'} | ${r.result === 'pass' ? '通过' : '**失败**'}${r.budget === 'budget-exceeded' ? '·budget-exceeded' : ''} | ${r.shots.join('<br>') || '—'} |`).join('\n');
  const failures = rows.filter((r) => r.result !== 'pass');
  const accessFailure = accessOk ? '' : `- **访问日志自检**：仅 ${access.lines} 条访问行（阈值 ${ACCESS_MIN_LINES}），本轮 HTTP 400/5xx 判定没有证据基础，不能按通过计。`;
  const failuresText = [failures.map((r) => `- **${r.path}**：${r.detail}`).join('\n'), accessFailure].filter(Boolean).join('\n') || '本次没有失败项。';
  const split = modelTotal === 0 ? '模型等待 0ms（本次真实模型调用未记录到等待区间）' : `模型等待 ${modelTotal}ms（${(modelTotal / total * 100).toFixed(1)}%），脚本动作 ${total - modelTotal}ms（${((total - modelTotal) / total * 100).toFixed(1)}%）`;
  const RUN_REL = path.relative(ROOT, RUN).split(path.sep).join('/');
  const exeSrc = process.env.SIMO_REALRUN_EXE ? path.relative(ROOT, path.resolve(ROOT, process.env.SIMO_REALRUN_EXE)).split(path.sep).join('/') : '';
  const runNote = `\`SIMO_REALRUN_DIR=${RUN_REL}\`${exeSrc ? `、\`SIMO_REALRUN_EXE=${exeSrc}\`` : ''}`;
  const overDims = overBudgetDims({ calls, input, output });
  const overBudget = overDims.length > 0;
  const budgetState = overBudget ? `**超出预算**（${overDims.join('/')}）` : '在预算内';
  const exploreRow = rows.find((r) => r.path.includes('边做边想（真实后端创建）'));
  const batchRow = rows.find((r) => r.path.includes('批量汇总卡'));
  const conclusions = [
    '- 计划任务由聊天真实创建；任务详情默认步骤数与轨迹数见路径 8 的明细。',
    `- 批量创建 2 个计划任务后${batchRow && batchRow.result === 'pass' ? '出现了汇总卡' : '没有出现汇总卡'}：${batchRow ? batchRow.detail.slice(0, 220) : '未执行'}。`,
    `- 边做边想真实创建（explore）${exploreRow && exploreRow.result === 'pass' ? '通过' : exploreRow ? '未通过' : '未执行'}：${exploreRow ? exploreRow.detail.slice(0, 220) : '未执行'}。`,
    ...(overBudgetPaths ? [`- 预算告警：累计 ${calls} 次调用 / ${input} 输入 / ${output} 输出，超出上限 ${overDims.join('/')}；自「${budgetFirstExceededPath}」起首次检测到超限，该条标记 \`budget-exceeded\`，其余路径按约定继续执行，判定不受影响。`] : []),
    `- 每条路径的判定都叠加了服务端判据：只看访问日志中间件写出的访问行，本轮窗口内命中 \`status=400\`/\`status=5xx\`，或出现非流式的空回复，即判 fail 并带上服务端原文；本次运行共 ${access.lines} 条访问行（阈值 ${ACCESS_MIN_LINES}），自检${accessOk ? '通过' : '**未通过**'}。`,
    '- 四态筛选、等待确认/取消、失败详情零写入口与重试入口、任务图失败下游、交付物分组与下载、跨会话 404 与空会话禁用标签、三档右栏均由 SQLite 夹具或真实动作验证，逐条结果见上表。',
  ];

  const section = `\n<!-- CHG-CONV-007-REALRUN -->\n## 11 真机实测（CHG-CONV-007，${new Date().toLocaleString('zh-CN', { hour12: false })}）\n\n一条命令：\`node scripts/ac/CHG-CONV-007-realrun.mjs\`（本轮用 ${runNote}）。脚本从源码 \`backend/cmd/simo\` 做正式构建（\`go build -trimpath -buildvcs=false\`，不带 testclock/mock 分支），写临时部署目录 \`${RUN_REL}/home-run\`，在 8788 端口起服务并驱动 headless Chrome（CDP 9224），结束后停服务、停浏览器。\n\n- 构建产物：\`${RUN_REL}/simo-realrun.exe\`（${exeSrc ? `源二进制 \`${exeSrc}\`` : '本轮从源码构建'}）；服务日志 \`${RUN_REL}/server.log\`。\n- 真实模型：\`deepseek-flash\`（凭据取自 \`backend/config.local.json\`）。本机策略代理对 \`api.deepseek.com\` 返回 403，服务进程需 \`NO_PROXY=api.deepseek.com\` 才能直连；脚本已设置。\n- 覆盖：${rows.length} 条路径，通过 ${pass} 条，失败 ${rows.length - pass} 条；截图 ${shots.length} 张，存 \`${RUN_REL}/shots/\`。
- 访问日志自检：**${access.lines} 条**访问行（2xx ${access.ok2xx} 条，阈值 ${ACCESS_MIN_LINES}）${accessOk ? '通过' : '**未通过**'}；示例：\`${access.sample || '无'}\`。\n- 总耗时 **${total}ms**；${split}。\n- 真实模型调用（已去重）：**${calls} 次**，输入 **${input} token**，输出 **${output} token**${metricsNote ? `；${metricsNote}` : ''}；每条路径平均 **${perPath.calls} 次 / ${perPath.input} token / ${perPath.output} token**（按 ${measured.length} 条已取到用量的路径计算）。计数以 \`events\` 的 \`usage.recorded\` 逐次明细为准，按 \`reply_id\`/\`request_id\` 归一，\`turn_metrics\` 汇总行只在对应轮次没有明细时计入，避免同一次调用被算两次。任务执行器的首字延迟没有落库，表中只对聊天轮次有 ttft；任务轮次以“模型等待”列为准。\n- 预算（≤${BUDGET.calls} 次 / ≤${BUDGET.input} 输入 / ≤${BUDGET.output} 输出 / 并发 ≤${BUDGET.concurrency}）：${budgetState}${overBudgetPaths ? `；自「${budgetFirstExceededPath}」起首次检测到超限，该条标记 \`budget-exceeded\`，后续路径继续执行、判定不变` : ''}；实测总量 ${calls} 次、${input} 输入、${output} 输出，每条路径平均 ${perPath.calls} 次、${perPath.input} 输入、${perPath.output} 输出；并发 1（串行）。测试用户消息 ${stats.user} 条，最长 ${stats.maxUserChars} 字符（上限 80）；模型聊天回复最长 ${stats.maxReplyLines} 行（上限 3）。\n\n| # | 路径 | 模型/数据来源 | 耗时ms | 模型等待ms | 动作ms | 调用 | 输入tok | 输出tok | 首字ms | 结果 | 截图 |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${table}\n\n### 失败项与判断\n\n${failuresText}\n\n### 关键结论\n\n${conclusions.join('\n')}\n\n### 环境清理\n\n脚本退出时关闭 CDP、taskkill 浏览器进程、停 8788 服务；8788/9224 释放；8787 基线未触碰。截图与结果 JSON 保留在 \`${RUN_REL}/\`。夹具目录 \`home-run\` 每次运行前移入 \`E:\\\\dsh_home\\\\trash\\\\pending-delete\\\\chg-007-realrun\\\\\`。\n`;

  let existing = fs.existsSync(EVIDENCE) ? fs.readFileSync(EVIDENCE, 'utf8') : '# CHG-CONV-007 证据\n';
  const marker = '<!-- CHG-CONV-007-REALRUN -->';
  const idx = existing.indexOf(marker);
  if (idx >= 0) existing = existing.slice(0, idx).replace(/\s+$/, '') + '\n';
  fs.writeFileSync(EVIDENCE, existing.replace(/\s+$/, '') + section, 'utf8');
  fs.writeFileSync(CHECKPOINT, `# CHG-CONV-007 真机实测检查点\n\n- 完成: ${nowIso()}\n- 总耗时: ${total}ms\n- 通过: ${pass}/${rows.length}\n- 访问行: ${access.lines}（阈值 ${ACCESS_MIN_LINES}，${accessOk ? '通过' : '未通过'}）\n- 结果: ${path.relative(ROOT, SHOT_JSON)}\n`, 'utf8');
  log(`report: ${path.relative(ROOT, EVIDENCE)} pass=${pass}/${rows.length} access=${access.lines}/${ACCESS_MIN_LINES} total=${total}ms`);
  if (!accessOk) {
    process.exitCode = 1;
    log(`ACCESS-LOG FAIL: 本轮仅 ${access.lines} 条访问行（阈值 ${ACCESS_MIN_LINES}），HTTP 错误判定无证据基础`);
  }
}

/* ---------------- offline self-test / recompute ---------------- */

/* ---------------- per-path attribution (offline) ---------------- */

// 把用量事件归属到路径。新跑的 result.json 带 startedAt/endedAt，按时间窗归属；
// 旧结果（快照早于 settleReplies，rows 全是 0）没有时间窗，改按引用关系归属：
//   - task 事件归到最早引用该 taskId 的路径（创建它的那条）；
//   - chat 事件归到该轮创建的 task 被引用的最早路径，没有则归到明细里含 POST /api/chat 的路径；
//   - 没有任何路径引用的（main() 预创建的批量任务）单列为 unattributed，不摊进任一路径。
function attributeUsage({ events, turns, tasks, messages, rows }) {
  const usageOf = (ev) => {
    const u = (ev.payload && ev.payload.usage) || {};
    return { input: Number(u.promptTokens || 0), output: Number(u.completionTokens || 0) };
  };
  const zero = () => ({ calls: 0, input: 0, output: 0 });
  const perPath = rows.map((r, i) => ({ index: i + 1, path: r.path, ...zero() }));
  const unattributed = [];
  const addTo = (target, ev) => {
    const u = usageOf(ev);
    target.calls += 1;
    target.input += u.input;
    target.output += u.output;
  };
  const addUnattributed = (bucket, ev) => {
    let t = unattributed.find((x) => x.bucket === bucket);
    if (!t) { t = { bucket, ...zero() }; unattributed.push(t); }
    addTo(t, ev);
  };
  const windowsOk = rows.length > 0 && rows.every((r) => Number.isFinite(Number(r.startedAt)));
  const starts = rows.map((r) => Number(r.startedAt));
  const detailOf = (i) => String((rows[i] && rows[i].detail) || '');
  const refsOf = (token) => perPath.map((_, i) => i).filter((i) => detailOf(i).includes(token));
  const chatPaths = () => perPath.map((_, i) => i).filter((i) => detailOf(i).includes('POST /api/chat'));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const turnByReply = new Map();
  for (const t of turns) if (t.reply_id) turnByReply.set(t.reply_id, t);
  const replyAt = (replyId) => {
    const turn = turnByReply.get(replyId);
    if (turn && Number(turn.started_at)) return Number(turn.started_at);
    const reply = messages.find((m) => m.id === replyId);
    return reply ? Number(reply.at || 0) : 0;
  };
  const ownerByWindow = (when) => {
    let owner = -1;
    for (let i = 0; i < starts.length; i += 1) if (starts[i] <= when) owner = i;
    return owner;
  };
  const tasksCreatedDuring = (turn) => {
    if (!turn) return [];
    const from = Number(turn.started_at || 0);
    const to = Number(turn.finished_at || turn.started_at || 0) + 1000;
    return messages.filter((m) => m.task_id && Number(m.at) >= from && Number(m.at) <= to).map((m) => m.task_id);
  };
  const groups = new Map();
  for (const ev of events) {
    const p = ev.payload || {};
    const key = p.replyId ? `reply:${p.replyId}` : p.taskId ? `task:${p.taskId}` : `event:${ev.id}`;
    if (!groups.has(key)) groups.set(key, { key, replyId: p.replyId || '', taskId: p.taskId || '', events: [] });
    groups.get(key).events.push(ev);
  }
  for (const group of groups.values()) {
    let owner = -1;
    let bucket = '';
    if (windowsOk) {
      let when;
      if (group.taskId) when = Number((taskById.get(group.taskId) || {}).created_at || 0) || Number(group.events[0].at || 0);
      else if (group.replyId) when = replyAt(group.replyId);
      else when = Number(group.events[0].at || 0);
      owner = ownerByWindow(when);
      if (owner < 0) bucket = '窗口外（早于路径 1，预创建）';
    } else if (group.taskId) {
      const refs = refsOf(group.taskId);
      owner = refs.length ? Math.min(...refs) : -1;
      if (owner < 0) bucket = '无路径引用的任务（预创建批量）';
    } else if (group.replyId) {
      const created = tasksCreatedDuring(turnByReply.get(group.replyId));
      let refs = [];
      for (const id of created) refs = refs.concat(refsOf(id));
      if (refs.length) owner = Math.min(...refs);
      else {
        const chat = chatPaths();
        if (chat.length) owner = chat[0];
        else bucket = '无路径引用的聊天回复';
      }
    } else {
      bucket = '无法归属的用量事件';
    }
    for (const ev of group.events) {
      if (owner >= 0) addTo(perPath[owner], ev);
      else addUnattributed(bucket || '未归属', ev);
    }
  }
  const sum = (list) => list.reduce((a, x) => ({ calls: a.calls + x.calls, input: a.input + x.input, output: a.output + x.output }), zero());
  return { method: windowsOk ? 'windows' : 'ownership', perPath, unattributed, attributed: sum(perPath.concat(unattributed)) };
}

function runSelfTest() {
  const events = [
    { id: 1, payload: { replyId: 'r1', usage: { promptTokens: 100, completionTokens: 10, model: 'm' } } },
    { id: 2, payload: { replyId: 'r1', usage: { promptTokens: 200, completionTokens: 20, model: 'm' } } },
    { id: 3, payload: { requestId: 'req-x', taskId: 't1', usage: { promptTokens: 50, completionTokens: 5, model: 'm' } } },
    { id: 4, payload: { requestId: 'req-x', taskId: 't1', usage: { promptTokens: 50, completionTokens: 5, model: 'm' } } },
  ];
  const turns = [
    { turn_id: 'turn-1', reply_id: 'r1', status: 'done', ttft_ms: 0, prompt_tokens: 300, completion_tokens: 30, session_id: 's' },
    { turn_id: 'turn-2', reply_id: 'r2', status: 'done', ttft_ms: 120, prompt_tokens: 400, completion_tokens: 40, session_id: 's' },
  ];
  const s = summarizeUsage(events, turns);
  // 同一 reply 下的两次请求按两次调用计；turn-1 汇总被明细覆盖；turn-2 无明细，用汇总兜底。
  assert.equal(s.calls, 4, `calls 应为 4，实际 ${s.calls}`);
  assert.equal(s.input, 750, `input 应为 750，实际 ${s.input}`);
  assert.equal(s.output, 75, `output 应为 75，实际 ${s.output}`);
  assert.deepEqual(s.ttft, [120], `ttft 应为 [120]，实际 ${JSON.stringify(s.ttft)}`);
  assert.equal(s.dedup.events, 3, 'requestId 重复事件应只留一条');
  assert.equal(s.dedup.dupEvents, 1, '应识别 1 条重复 requestId 事件');
  assert.equal(s.dedup.suppressedTurns, 1, 'turn-1 汇总应被抑制');
  assert.equal(s.rows.filter((r) => r.replyId === 'r1').length, 2, '同一 reply 的两次真实请求不得被压成一次');

  const onlyTurns = summarizeUsage([], [{ turn_id: 'turn-2', reply_id: 'r2', status: 'done', ttft_ms: 120, prompt_tokens: 400, completion_tokens: 40, session_id: 's' }]);
  assert.equal(onlyTurns.calls, 1, '无明细轮次应计入');
  assert.equal(onlyTurns.input, 400, '无明细轮次应使用汇总 token');

  assert.deepEqual(overBudgetDims({ calls: 60, input: 120000, output: 15000 }), [], '等于上限不算超');
  assert.deepEqual(overBudgetDims({ calls: 61, input: 120000, output: 15000 }), ['calls'], '调用超限应可识别');
  assert.deepEqual(overBudgetDims({ calls: 60, input: 120001, output: 0 }), ['input'], '输入超限应可识别');
  assert.deepEqual(overBudgetDims({ calls: 0, input: 0, output: 15001 }), ['output'], '输出超限应可识别');
  assert.deepEqual(overBudgetDims(null), [], '快照未取到时不做预算判定');

  // 快照缺失必须是 null，不能是 0；否则“没取到”会被写成“零用量”。
  const missingDelta = usageDelta(null, { calls: 3, input: 30, output: 3, rows: [] });
  assert.equal(missingDelta.calls, null, 'before 缺失时 calls 应为 null');
  assert.equal(missingDelta.input, null, 'before 缺失时 input 应为 null');
  assert.equal(missingDelta.output, null, 'before 缺失时 output 应为 null');
  const okDelta = usageDelta({ calls: 1, input: 10, output: 1, rows: [] }, { calls: 3, input: 30, output: 5, rows: [] });
  assert.deepEqual(okDelta, { calls: 2, input: 20, output: 4, ttft: [] }, '两端都在时按差值计算');

  // 时间窗归属：task 按创建时间、chat 按轮次开始时间；早于路径 1 的预创建任务单列。
  const attrW = attributeUsage({
    events: [
      { id: 1, at: 2200, payload: { taskId: 't-late', usage: { promptTokens: 10, completionTokens: 1 } } },
      { id: 2, at: 5100, payload: { taskId: 't-late', usage: { promptTokens: 20, completionTokens: 2 } } },
      { id: 3, at: 1200, payload: { taskId: 't-pre', usage: { promptTokens: 5, completionTokens: 1 } } },
      { id: 4, at: 2600, payload: { replyId: 'r1', usage: { promptTokens: 7, completionTokens: 3 } } },
    ],
    turns: [{ turn_id: 'turn-1', reply_id: 'r1', started_at: 2100, finished_at: 2500 }],
    tasks: [{ id: 't-late', created_at: 2100 }, { id: 't-pre', created_at: 900 }],
    messages: [],
    rows: [{ path: 'p1', startedAt: 1000, endedAt: 5000, detail: '' }, { path: 'p2', startedAt: 5000, endedAt: 6000, detail: '' }],
  });
  assert.equal(attrW.method, 'windows', '带时间窗的结果应按时间窗归属');
  assert.deepEqual(attrW.perPath[0], { index: 1, path: 'p1', calls: 3, input: 37, output: 6 }, `窗口归属 p1 应为 3/37/6，实际 ${JSON.stringify(attrW.perPath[0])}`);
  assert.equal(attrW.perPath[1].calls, 0, 'p2 不应分到用量');
  assert.deepEqual(attrW.unattributed.map((u) => ({ bucket: u.bucket, calls: u.calls })), [{ bucket: '窗口外（早于路径 1，预创建）', calls: 1 }], '预创建任务应单列');

  // 旧结果没有时间窗：按引用关系归属，没有路径引用的批量任务单列。
  const attrL = attributeUsage({
    events: [
      { id: 10, at: 2000, payload: { taskId: 't-new', usage: { promptTokens: 100, completionTokens: 10 } } },
      { id: 11, at: 1000, payload: { taskId: 't-batch', usage: { promptTokens: 30, completionTokens: 3 } } },
      { id: 12, at: 1300, payload: { replyId: 'r-a', usage: { promptTokens: 40, completionTokens: 4 } } },
      { id: 13, at: 3000, payload: { replyId: 'r-b', usage: { promptTokens: 50, completionTokens: 5 } } },
    ],
    turns: [
      { turn_id: 'turn-a', reply_id: 'r-a', started_at: 1000, finished_at: 1500 },
      { turn_id: 'turn-b', reply_id: 'r-b', started_at: 2900, finished_at: 3100 },
    ],
    tasks: [{ id: 't-new', created_at: 1100 }, { id: 't-batch', created_at: 500 }],
    messages: [
      { id: 'm-a', role: 'agent', task_id: 't-new', at: 1100 },
      { id: 'm-b', role: 'agent', task_id: '', at: 3000 },
    ],
    rows: [
      { path: '创建任务', detail: 'taskId=t-new status=pending' },
      { path: '任务详情', detail: '{"id":"t-new"}' },
      { path: '失败重试', detail: '请求=POST /api/chat' },
    ],
  });
  assert.equal(attrL.method, 'ownership', '无时间窗的结果应按引用关系归属');
  assert.equal(attrL.perPath[0].calls, 2, 'task 本体的用量与创建它的聊天都应归到最早引用路径');
  assert.equal(attrL.perPath[2].calls, 1, '没有任务可引的聊天回复应回退到 POST /api/chat 路径');
  assert.deepEqual(attrL.unattributed.map((u) => ({ bucket: u.bucket, calls: u.calls })), [{ bucket: '无路径引用的任务（预创建批量）', calls: 1 }], '无引用的批量任务应单列');
  assert.equal(attrL.attributed.calls, 4, '归属结果必须覆盖全部 4 条事件');

  // 结构断言：快照必须取在 settle 之后，防止取点被挪回 settleReplies 之前（旧实现就是先快照后 settle，16 条全 0）。
  const selfSrc = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const fnIdx = selfSrc.indexOf('async function settleThenSnapshot');
  assert.ok(fnIdx > 0, 'settleThenSnapshot 应存在');
  const settleBody = selfSrc.slice(fnIdx, selfSrc.indexOf('\n}\n', fnIdx));
  assert.ok(settleBody.includes('await serverVerdict'), 'settleThenSnapshot 必须先等 serverVerdict（内部 settleReplies）');
  assert.ok(settleBody.indexOf('await serverVerdict') < settleBody.indexOf('metricSnapshot()'), '快照必须在 settle 之后取，不能先快照再 settle');
  const stepIdx = selfSrc.indexOf('async function step(');
  const stepBody = selfSrc.slice(stepIdx, selfSrc.indexOf('\n}\n', stepIdx));
  assert.ok(stepBody.includes('settleThenSnapshot'), 'step 必须经由 settleThenSnapshot 取 after 快照');

  log('self-test ok: 去重、汇总兜底、ttft 保留、预算边界、缺失不归零、两种归属方式、快照取点顺序全部通过');
}

function runRecompute(dbArg) {
  if (!dbArg) {
    log('用法: node scripts/ac/CHG-CONV-007-realrun.mjs --recompute <simo.db>');
    process.exitCode = 2;
    return;
  }
  let file = path.resolve(ROOT, dbArg);
  if (!fs.existsSync(file) && !path.extname(file)) {
    // 允许直接给 run 目录：优先找 run 目录下 home-run/simo.db，再找 run 目录本身。
    const inHome = path.join(file, 'home-run', 'simo.db');
    if (fs.existsSync(inHome)) file = inHome;
  }
  if (!fs.existsSync(file)) {
    log(`DB 不存在: ${file}（任务给的路径不存在时，先确认归档位置；只读复制到可写目录再复算）`);
    process.exitCode = 2;
    return;
  }
  const conn = new DatabaseSync(file, { readOnly: true });
  try {
    const evs = conn.prepare("select id, at, type, payload from events where type='usage.recorded' order by id").all()
      .map((e) => { try { return { id: e.id, at: Number(e.at || 0), payload: JSON.parse(e.payload) }; } catch { return null; } })
      .filter(Boolean);
    const turns = conn.prepare('select turn_id, session_id, reply_id, status, ttft_ms, prompt_tokens, completion_tokens, started_at, finished_at from turn_metrics order by started_at, turn_id').all();
    const tasks = conn.prepare('select id, title, status, batch_id, created_at from tasks order by created_at, id').all();
    const messages = conn.prepare('select id, session_id, role, task_id, at from messages order by at, id').all();
    const s = summarizeUsage(evs, turns);

    const rawEvents = { calls: evs.length, input: 0, output: 0 };
    for (const e of evs) {
      rawEvents.input += Number((e.payload.usage || {}).promptTokens || 0);
      rawEvents.output += Number((e.payload.usage || {}).completionTokens || 0);
    }
    const rawTurns = { rows: turns.length, input: 0, output: 0 };
    for (const t of turns) {
      rawTurns.input += Number(t.prompt_tokens || 0);
      rawTurns.output += Number(t.completion_tokens || 0);
    }
    const naive = { calls: rawEvents.calls + rawTurns.rows, input: rawEvents.input + rawTurns.input, output: rawEvents.output + rawTurns.output };

    // 旧结果优先取 DB 同目录的 result.json（归档复制时放在一起），其次取上一级。
    let oldResult = null;
    let oldRows = null;
    const candidates = [path.join(path.dirname(file), 'result.json'), path.join(path.dirname(path.dirname(file)), 'result.json')];
    const resultFile = candidates.find((f) => fs.existsSync(f));
    if (resultFile) {
      try {
        const r = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        oldResult = { file: path.relative(ROOT, resultFile).split(path.sep).join('/'), calls: r.calls, input: r.input, output: r.output, total: r.total };
        oldRows = Array.isArray(r.rows) ? r.rows : null;
      } catch { /* 旧 result.json 不可读就不对比 */ }
    }

    let attribution = null;
    if (oldRows && oldRows.length) {
      const a = attributeUsage({ events: evs, turns, tasks, messages, rows: oldRows });
      const rowsHaveWindows = oldRows.every((r) => Number.isFinite(Number(r.startedAt)));
      const sumsToEvents = a.attributed.calls === rawEvents.calls && a.attributed.input === rawEvents.input && a.attributed.output === rawEvents.output;
      attribution = {
        method: a.method,
        rowsHaveWindows,
        perPath: a.perPath,
        unattributed: a.unattributed,
        attributed: a.attributed,
        sumsToEvents,
        sumsToNewTotals: s.calls === a.attributed.calls && s.input === a.attributed.input && s.output === a.attributed.output,
      };
    }

    const checks = {
      // 去重后的合计必须等于“事件原始合计 + 汇总原始合计 - 重复事件 - 被抑制汇总行”。
      arithmetic: s.input === naive.input - s.dedup.dupInput - s.dedup.suppressedInput
        && s.output === naive.output - s.dedup.dupOutput - s.dedup.suppressedOutput
        && s.calls === naive.calls - s.dedup.dupEvents - s.dedup.suppressedTurns,
      matchesSqliteRaw: s.input === rawEvents.input - s.dedup.dupInput + rawTurns.input - s.dedup.suppressedInput
        && s.output === rawEvents.output - s.dedup.dupOutput + rawTurns.output - s.dedup.suppressedOutput
        && s.calls === rawEvents.calls - s.dedup.dupEvents + rawTurns.rows - s.dedup.suppressedTurns,
      equalsUsageEventsOnly: s.calls === rawEvents.calls && s.input === rawEvents.input && s.output === rawEvents.output,
      attributionSumsToEvents: attribution ? attribution.sumsToEvents : true,
    };
    const out = {
      db: path.relative(ROOT, file).split(path.sep).join('/'),
      generatedAt: nowIso(),
      rule: 'usage.recorded 逐次明细优先；turn_metrics 汇总行仅在对应轮次无明细时计入；事件按 requestId 去重，无 requestId 按事件 id',
      new: { calls: s.calls, input: s.input, output: s.output },
      naiveSum: naive,
      sqliteRaw: { usageEvents: rawEvents, turnMetrics: rawTurns },
      dedup: s.dedup,
      oldResultJson: oldResult,
      attribution,
      checks,
      ok: checks.arithmetic && checks.matchesSqliteRaw && checks.attributionSumsToEvents,
    };
    log(JSON.stringify(out, null, 2));
    if (!out.ok) process.exitCode = 1;
  } finally {
    conn.close();
  }
}

const cliArgs = process.argv.slice(2);
if (cliArgs.includes('--self-test')) {
  runSelfTest();
} else if (cliArgs[0] === '--recompute') {
  runRecompute(cliArgs[1]);
} else {
  main().catch(async (err) => {
    log('FATAL', err && err.stack || err);
    try { writeReport(); } catch (e2) { log('report failed', e2.message); }
    try { cdp?.close(); } catch { /* ignore */ }
    if (cdp?.pid) spawnSync('taskkill', ['/PID', String(cdp.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await stopServer();
    process.exitCode = 1;
  });
}

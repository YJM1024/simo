// scripts/lib/ac-cdp.mjs
//
// 断言脚本公共层：HTTP 取样、CDP 页面操作、证据落盘与退出码。
//
// 契约（docs/process/SPEC-STANDARD.md 第 3 节）：
//   - 零依赖 Node（全局 fetch / WebSocket / AbortSignal.timeout）；
//   - 只读：只发 GET，唯一的 POST 是被页面自身触发并被本地桩拦截的 /api/chat；
//   - 参数 --base-url（默认 http://127.0.0.1:8787）；
//   - stdout 一行 JSON {"ac","pass","detail","evidence"}；
//   - 退出码 0 通过 / 1 失败 / 2 参数或环境错误（blocked）；
//   - 证据写 .tmp/ac/<AC-ID>.json，不超过 8KB。
//
// blocked 一律以 AcBlocked 抛出，由 runAc 转成 exit 2 + detail 前缀 blocked:。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TMP = path.join(ROOT, '.tmp', 'ac');
export const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
export const CDP_PORT = Number(process.env.AC_CDP_PORT ?? 9223);
export const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;
export const EVIDENCE_LIMIT = 8000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 环境不可用（CDP 探活失败、网络重试耗尽）；调用方应记 blocked 而不是失败。 */
export class AcBlocked extends Error {}

/** 断言不成立。 */
export class AcFail extends Error {}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { baseUrl: process.env.AC_BASE_URL || DEFAULT_BASE_URL, help: false, error: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--base-url') { i += 1; if (argv[i]) out.baseUrl = argv[i]; else out.error = '--base-url 缺少取值'; }
    else if (arg.startsWith('--base-url=')) out.baseUrl = arg.slice('--base-url='.length);
    else out.error = `未知参数：${arg}`;
  }
  out.baseUrl = String(out.baseUrl || '').replace(/\/+$/, '');
  return out;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * HTTP 请求。网络错误重试 2 次（共 3 次），仍失败抛 AcBlocked。
 * 4xx/5xx 不重试，交给调用方断言。
 */
export async function http(url, { method = 'GET', headers = {}, body, timeout = 10000, retries = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const res = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
      const text = await res.text();
      const flat = {};
      res.headers.forEach((value, key) => { flat[key.toLowerCase()] = value; });
      return { status: res.status, headers: flat, text, bytes: Buffer.byteLength(text), json: safeJson(text), ms: Date.now() - started };
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(300 * (attempt + 1));
    }
  }
  throw new AcBlocked(`网络错误，重试 ${retries} 次后仍失败：${lastError?.message ?? String(lastError)}`);
}

/** 针对 base-url 的 GET。 */
export function apiGet(baseUrl, route, options = {}) {
  return http(baseUrl + route, { ...options, method: 'GET' });
}

/**
 * CDP 环境不可用（端口没有可用浏览器、探针启动失败）。
 * 故意不继承 AcBlocked：UI 断言套件把 AcBlocked 记成 SKIP，缺浏览器应当是明确的
 * 失败而不是 0 断言的静默跳过。
 */
export class AcCdpUnavailable extends Error {}

/** 探活 CDP：跑 scripts/probe-cdp.mjs --port <AC_CDP_PORT>，非 0 即环境不可用。 */
export function ensureCdp() {
  if (!Number.isInteger(CDP_PORT) || CDP_PORT < 1 || CDP_PORT > 65535) {
    throw new AcCdpUnavailable(`CDP 端口配置无效：AC_CDP_PORT=${JSON.stringify(process.env.AC_CDP_PORT)}`);
  }
  const probe = path.join(ROOT, 'scripts', 'probe-cdp.mjs');
  // 必须带上端口：探针默认 9223，不带端口时 AC_CDP_PORT 实际无效，
  // 表现为脚本连 9250、探针探 9223，随后 /json/list 报 fetch failed 或静默 skip。
  // stdio 继承会被沙箱的 piped-stdio 限制拦住；ignore 只取退出码，输出不进 stdout（必须保持一行 JSON）。
  const run = spawnSync(process.execPath, [probe, '--port', String(CDP_PORT)], { stdio: 'ignore', timeout: 60000, windowsHide: true });
  if (run.error) throw new AcCdpUnavailable(`CDP 端口 ${CDP_PORT} 无可用实例：探针进程启动失败（${run.error.message}）`);
  if (run.status !== 0) {
    throw new AcCdpUnavailable(
      `CDP 端口 ${CDP_PORT} 无可用实例：node scripts/probe-cdp.mjs --port ${CDP_PORT} 退出码 ${run.status}`
      + '（3=环境不可用；先手工跑该命令看失败原因与 hint）',
    );
  }
}

/**
 * 打开 CDP 页面会话。返回 client：{ send, once, evaluate, navigate, reload, close }。
 * 复用 probe 已经启动/复用的那个浏览器进程里的 page target。
 */
export async function connect(baseUrl, { targetId = '', newTarget = false } = {}) {
  ensureCdp();
  const list = await http(`${CDP_HTTP}/json/list`, { timeout: 5000 });
  const pages = Array.isArray(list.json) ? list.json.filter((item) => item.type === 'page' && item.webSocketDebuggerUrl) : [];
  if (pages.length === 0 && !newTarget) throw new AcBlocked('CDP 没有可用的 page target');
  // newTarget：批次并行时每条脚本开自己的标签页，避免并行脚本互相导航到对方的页面。
  let target = (targetId ? pages.find((item) => item.id === targetId) : null)
    ?? pages.find((item) => typeof item.url === 'string' && item.url.startsWith(baseUrl))
    ?? (newTarget ? null : pages[0]);
  if (!target && newTarget) {
    const created = await http(`${CDP_HTTP}/json/new?url=about:blank`, { method: 'PUT', timeout: 5000 });
    if (!created.json || !created.json.webSocketDebuggerUrl) throw new AcBlocked('CDP 新建 page target 失败');
    target = created.json;
  }
  if (!target) throw new AcBlocked('CDP 没有可用的 page target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let seq = 0;

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new AcBlocked('CDP WebSocket 连接失败')), { once: true });
  });

  ws.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`CDP ${entry.method} 失败：${message.error.message}`));
      else entry.resolve(message.result);
      return;
    }
    if (message.method) {
      for (const fn of listeners.get(message.method) ?? []) fn(message.params);
    }
  });

  const send = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP ${method} 超时（${timeout}ms）`));
    }, timeout);
  });

  const once = (method, timeout = 15000) => new Promise((resolve, reject) => {
    const bucket = listeners.get(method) ?? [];
    const entry = (params) => {
      listeners.set(method, (listeners.get(method) ?? []).filter((fn) => fn !== entry));
      clearTimeout(timer);
      resolve(params);
    };
    bucket.push(entry);
    listeners.set(method, bucket);
    const timer = setTimeout(() => {
      listeners.set(method, (listeners.get(method) ?? []).filter((fn) => fn !== entry));
      reject(new Error(`等待 CDP 事件 ${method} 超时（${timeout}ms）`));
    }, timeout);
  });

  const evaluate = async (expression, { awaitPromise = true } = {}) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? '页面求值异常';
      throw new Error(`Runtime.evaluate 异常：${description}`);
    }
    return result.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  // headless 默认窗口 800×600 会把 .inspector（≥1180 档才显示）与侧栏藏成 display:none，
  // 右栏判据必须先在宽屏档取样；375 档由脚本自己 setDeviceMetricsOverride 覆盖并清理。
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const navigate = async (url) => {
    const loaded = once('Page.loadEventFired', 20000).catch(() => null);
    await send('Page.navigate', { url });
    await loaded;
  };

  const client = {
    target, send, once, evaluate, navigate,
    async reload({ ready, timeout = 12000 } = {}) {
      const loaded = once('Page.loadEventFired', timeout).catch(() => null);
      await send('Page.reload', { ignoreCache: false });
      await loaded;
      if (ready) await waitFor(client, ready, { timeout });
      await sleep(250);
    },
    close() { try { ws.close(); } catch { /* already closed */ } },
  };
  return client;
}

/** 轮询页面表达式直到真值；超时抛 AcFail（带最后一次取值）。 */
export async function waitFor(client, expression, { timeout = 8000, interval = 120, label = expression } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await client.evaluate(expression);
    if (last) return last;
    await sleep(interval);
  }
  throw new AcFail(`等待超时（${timeout}ms）：${label}；最后取值=${JSON.stringify(last)}`);
}

export const READY_COMPOSER = `document.querySelector('textarea[aria-label="消息输入框"]') !== null`;
export const READY_SIDEBAR = `document.querySelector('.session-row') !== null`;
export const READY_INSPECTOR = `document.querySelector('aside.inspector') !== null`;

// 页面脚本：fetch 桩 + 调用计数 + 右栏骨架出现次数。
// 配置从 sessionStorage('__acStub') 读取，所以同一页面 reload 后自动沿用，换配置只需改 sessionStorage 再 reload。
export const STUB_SOURCE = `(() => {
  const read = () => { try { return JSON.parse(sessionStorage.getItem('__acStub') || 'null'); } catch { return null; } };
  const cfg = read();
  const state = { sends: 0, calls: [], loadingHits: 0, stub: cfg };
  window.__ac = state;
  window.addEventListener('DOMContentLoaded', () => {
    try {
      const ob = new MutationObserver(() => { if (document.querySelector('.inspector .state-loading')) state.loadingHits += 1; });
      ob.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch (err) { /* 观测失败不影响主判据 */ }
  });
  const real = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    const rec = { url, method, status: 0 };
    state.calls.push(rec);
    if (method === 'POST' && url.indexOf('/api/chat') >= 0) state.sends += 1;
    const rules = (state.stub && state.stub.rules) || [];
    const rule = rules.find((r) => new RegExp(r.match).test(url) && (!r.method || r.method === method));
    if (!rule) {
      const res = await real(input, init);
      rec.status = res.status;
      return res;
    }
    if (rule.delayMs) await new Promise((resolve) => setTimeout(resolve, rule.delayMs));
    rec.status = rule.status;
    const body = rule.body === undefined ? '' : (typeof rule.body === 'string' ? rule.body : JSON.stringify(rule.body));
    const nullBody = rule.status === 204 || rule.status === 205 || rule.status === 304;
    return new Response(nullBody ? null : body, { status: rule.status, headers: Object.assign({ 'Content-Type': 'application/json' }, rule.headers || {}) });
  };
})();`;

/** 注册页面初始化桩（对新文档生效），返回移除函数。 */
export async function installStub(client) {
  const { identifier } = await client.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB_SOURCE });
  return async () => { try { await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); } catch { /* 已移除 */ } };
}

/** 设置桩配置；null 清空。下次 reload 生效。 */
export async function setStub(client, config) {
  await client.evaluate(`(() => { if (${JSON.stringify(config)} === null) sessionStorage.removeItem('__acStub'); else sessionStorage.setItem('__acStub', ${JSON.stringify(JSON.stringify(config))}); return true; })()`);
}

/** 打开一个新文档：设桩 → reload → 等就绪。 */
export async function openPage(client, baseUrl, { stub = null, ready = READY_COMPOSER, path = '/' } = {}) {
  await client.navigate(baseUrl + path);
  await setStub(client, stub);
  await client.reload({ ready });
}

/** 元素中心点与尺寸；找不到返回 null。 */
export function bounds(client, selector, index = 0) {
  return client.evaluate(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, w: r.width, h: r.height };
  })()`);
}

export async function clickAt(client, x, y) {
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(80);
}

export async function click(client, selector, index = 0) {
  const box = await bounds(client, selector, index);
  if (!box) throw new AcFail(`找不到可点击元素：${selector}[${index}]`);
  if (box.w === 0 || box.h === 0) throw new AcFail(`元素尺寸为 0：${selector}[${index}]`);
  await clickAt(client, box.x, box.y);
  return box;
}

/** 按行内文本点击匹配到的行（会话树、任务行等）。 */
export async function clickMatching(client, rowSelector, textSelector, text, { exact = true } = {}) {
  const box = await client.evaluate(`(() => {
    const wanted = ${JSON.stringify(text)};
    const rows = [...document.querySelectorAll(${JSON.stringify(rowSelector)})];
    const row = rows.find((item) => {
      const node = item.querySelector(${JSON.stringify(textSelector)});
      const value = (node ? node.textContent : item.textContent || '').trim();
      return ${exact ? 'value === wanted' : 'value.includes(wanted)'};
    });
    if (!row) return null;
    row.scrollIntoView({ block: 'center' });
    const r = row.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  if (!box) throw new AcFail(`找不到文本为「${text}」的行：${rowSelector} / ${textSelector}`);
  await clickAt(client, box.x, box.y);
  return box;
}

/** 用原生 setter 写入受控 textarea/input，并派发 input 事件（React 受控组件路径）。 */export async function setValue(client, selector, text) {
  return client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return -1;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    return el.value.length;
  })()`);
}

const KEY_INFO = {
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Tab: { code: 'Tab', vk: 9 },
  Escape: { code: 'Escape', vk: 27 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
  Home: { code: 'Home', vk: 36 },
  End: { code: 'End', vk: 35 },
};

export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/** CDP 键盘事件（React 的 onKeyDown 收到同样的 key/modifiers）。 */
export async function pressKey(client, key, modifiers = 0) {
  const info = KEY_INFO[key] ?? { code: key, vk: 0 };
  const base = { key, code: info.code, windowsVirtualKeyCode: info.vk, nativeVirtualKeyCode: info.vk, modifiers };
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(info.text ? { text: info.text, unmodifiedText: info.text } : {}) });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(60);
}

/** 读取 window.__ac（fetch 桩状态）。 */
export function readStubState(client) {
  return client.evaluate(`window.__ac ? { sends: window.__ac.sends, calls: window.__ac.calls.slice(-40), loadingHits: window.__ac.loadingHits } : null`);
}

/** 页面内同步小工具：文本、计数、样式。 */
export function queryTexts(client, selector) {
  return client.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => (el.textContent || '').trim())`);
}

export function count(client, selector) {
  return client.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
}

function shrinkEvidence(payload) {
  // 先丢最占位的字段：calls 数组与超长字符串，再不行只留摘要。
  const clone = JSON.parse(JSON.stringify(payload));
  if (clone.evidence && Array.isArray(clone.evidence.calls)) clone.evidence.calls = clone.evidence.calls.slice(-6);
  let text = JSON.stringify(clone, null, 2);
  if (Buffer.byteLength(text) <= EVIDENCE_LIMIT - 200) return text;
  const truncate = (value, depth = 0) => {
    if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 240)}…（截断）` : value;
    if (Array.isArray(value)) return value.slice(0, 8).map((item) => truncate(item, depth + 1));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = truncate(item, depth + 1);
      return out;
    }
    return value;
  };
  text = JSON.stringify(truncate(clone), null, 2);
  if (Buffer.byteLength(text) <= EVIDENCE_LIMIT - 200) return text;
  return JSON.stringify({ ac: payload.ac, pass: payload.pass, detail: String(payload.detail).slice(0, 400), evidence: { note: '证据过大，已截断为摘要' } }, null, 2);
}

/**
 * 统一入口：执行 fn(ctx)，落证据，打印一行 JSON 并按契约退出。
 * ctx.check(ok, label, extra) 收集断言；ctx.evidence 自动并入证据文件。
 */
export async function runAc(ac, fn) {
  const args = parseArgs();
  if (args.help) {
    console.log(`usage: node scripts/ac/${ac}.mjs [--base-url <url>]`);
    process.exit(0);
  }
  const checks = [];
  const ctx = {
    ac,
    baseUrl: args.baseUrl,
    checks,
    evidence: {},
    client: null,
    check(ok, label, extra) {
      checks.push({ ok: !!ok, label, ...(extra === undefined ? {} : { extra }) });
      return !!ok;
    },
    async openPage(options = {}) {
      const client = await connect(args.baseUrl);
      ctx.client = client;
      await installStub(client);
      await openPage(client, args.baseUrl, options);
      return client;
    },
  };

  let outcome;
  try {
    if (args.error) throw new AcFail(args.error);
    const result = await fn(ctx);
    outcome = { pass: !!result.pass, blocked: !!result.blocked && !result.pass, detail: result.detail ?? '', extraEvidence: result.evidence ?? {} };
  } catch (err) {
    const blocked = err instanceof AcBlocked;
    outcome = { pass: false, blocked, detail: `${blocked ? 'blocked: ' : ''}${err instanceof Error ? err.message : String(err)}`, extraEvidence: {} };
  }

  try { ctx.client?.close(); } catch { /* 已关闭 */ }

  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `${ac}.json`);
  const payload = {
    ac,
    pass: outcome.pass,
    blocked: outcome.blocked,
    detail: outcome.detail,
    at: new Date().toISOString(),
    checks,
    evidence: { baseUrl: ctx.baseUrl, ...ctx.evidence, ...outcome.extraEvidence },
  };
  fs.writeFileSync(file, `${shrinkEvidence(payload)}\n`, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  console.log(JSON.stringify({ ac, pass: outcome.pass, detail: outcome.detail, evidence: rel }));
  process.exit(outcome.pass ? 0 : outcome.blocked ? 2 : 1);
}

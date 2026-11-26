// scripts/ac/lib/harness.mjs - shared helpers for P1-CONV assertion scripts.
// Zero dependencies; read-only except for explicitly created temp sessions.
// Contract: one JSON line on stdout {ac,pass,detail,evidence}; exit 0/1/2.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
export const TMP = path.join(ROOT, '.tmp', 'ac')
export const CDP_PORT = Number(process.env.AC_CDP_PORT || 9223)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export class Blocked extends Error {}
export class Failed extends Error {}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { baseUrl: 'http://127.0.0.1:8787', sessionId: '' }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--base-url') args.baseUrl = argv[++i] || args.baseUrl
    else if (a.startsWith('--base-url=')) args.baseUrl = a.slice('--base-url='.length)
    else if (a === '--session-id') args.sessionId = argv[++i] || ''
    else if (a.startsWith('--session-id=')) args.sessionId = a.slice('--session-id='.length)
    else if (a === '--help' || a === '-h') { console.log('usage: node scripts/ac/<AC>.mjs [--base-url http://127.0.0.1:8787] [--session-id id]'); process.exit(0) }
    else { console.error(`unknown argument: ${a}`); process.exit(2) }
  }
  return args
}

export async function http(baseUrl, method, p, body) {
  let last
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(baseUrl.replace(/\/$/, '') + p, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      return { status: res.status, json, text }
    } catch (err) {
      last = err
      if (attempt < 2) await sleep(250 * (attempt + 1))
    }
  }
  throw new Blocked(`network error after 3 attempts on ${p}: ${last && last.message ? last.message : String(last)}`)
}

export async function probeCdp(port = CDP_PORT) {
  // 契约要求先跑 scripts/probe-cdp.mjs；本沙箱禁止带管道 spawn 子进程（EPERM），
  // 故改为等价的 HTTP 探测：GET /json/version，不通即 blocked（退出码 3 语义，不原地重试）。
  let last
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) { const body = await res.json(); return { ok: true, port, browser: body.Browser || 'unknown', probe: 'inline-json-version' } }
      last = `HTTP ${res.status}`
    } catch (err) { last = err && err.message ? err.message : String(err) }
    if (attempt === 0) await sleep(200)
  }
  throw new Blocked(`CDP 127.0.0.1:${port} 不可用（等价 probe-cdp 退出 3）: ${last}`)
}

export async function listTargets(port = CDP_PORT) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
  return (await res.json()).filter((t) => t.type === 'page')
}

export async function newTarget(url, port = CDP_PORT) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT', signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Blocked(`新建 CDP target 失败: HTTP ${res.status}`)
  return res.json()
}

export class Page {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.seq = 0; this.waiters = new Map() }

  async open() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Blocked('CDP WebSocket 打开超时')), 10000)
      this.ws.onopen = () => { clearTimeout(timer); resolve() }
      this.ws.onerror = (e) => { clearTimeout(timer); reject(new Blocked(`CDP WebSocket 错误: ${e && e.message ? e.message : 'unknown'}`)) }
    })
    this.ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      const waiter = msg.id ? this.waiters.get(msg.id) : null
      if (waiter) { this.waiters.delete(msg.id); msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result) }
    }
    await this.send('Runtime.enable')
    await this.send('Page.enable').catch(() => {})
    return this
  }

  send(method, params = {}, timeoutMs = 15000) {
    const id = ++this.seq
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(id); reject(new Blocked(`CDP ${method} 超时`)) }, timeoutMs)
      this.waiters.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
    })
  }

  async eval(expression, { timeoutMs = 10000 } = {}) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, timeoutMs)
    if (r.exceptionDetails) {
      const d = r.exceptionDetails.exception && (r.exceptionDetails.exception.description || r.exceptionDetails.exception.value)
      throw new Failed(`页面表达式抛错: ${String(d || r.exceptionDetails.text).slice(0, 400)}`)
    }
    return r.result ? r.result.value : undefined
  }

  async waitFor(expression, { timeoutMs = 10000, intervalMs = 100 } = {}) {
    const start = Date.now()
    let last
    while (Date.now() - start < timeoutMs) {
      try {
        const v = await this.eval(expression)
        if (v) return v
        last = v
      } catch (err) { last = err.message }
      await sleep(intervalMs)
    }
    throw new Failed(`waitFor 超时(${timeoutMs}ms): ${expression.slice(0, 120)} last=${String(last).slice(0, 200)}`)
  }

  async goto(url) {
    await this.send('Page.navigate', { url })
    await this.waitFor(`document.readyState === 'complete'`, { timeoutMs: 15000 })
    return this
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: false })
    await sleep(300)
    await this.waitFor(`document.readyState === 'complete'`, { timeoutMs: 15000 })
    return this
  }

  async addInitScript(source) { await this.send('Page.addScriptToEvaluateOnNewDocument', { source }) }

  async close() { try { this.ws.close() } catch {} }
}

export async function openPage({ baseUrl, reuse = true, url = baseUrl, port = CDP_PORT } = {}) {
  await probeCdp(port)
  let target = null
  if (reuse) {
    const pages = await listTargets(port)
    target = pages.find((p) => (p.url || '').startsWith(baseUrl.replace(/\/$/, ''))) || null
  }
  if (!target) target = await newTarget(url, port)
  const page = await new Page(target.webSocketDebuggerUrl).open()
  if (url !== target.url) await page.goto(baseUrl)
  await page.waitFor(`!!document.querySelector('.session-row')`, { timeoutMs: 12000 })
  return page
}

export async function openFaultPage({ baseUrl, initScript, port = CDP_PORT }) {
  await probeCdp(port)
  const target = await newTarget('about:blank', port)
  const page = await new Page(target.webSocketDebuggerUrl).open()
  if (initScript) await page.addInitScript(initScript)
  await page.goto(baseUrl)
  return page
}

// DOM helpers evaluated inside the page.
export const DOM = {
  rows: () => `Array.from(document.querySelectorAll('.session-row')).map(r => ({title:(r.querySelector('.session-title')||{}).textContent||'', active:r.classList.contains('is-active'), depth:Number(r.dataset.depth||0), count:(r.querySelector('.session-count')||{}).textContent||null, unread:!!r.querySelector('.session-unread[data-unread="true"]'), id:r.dataset.sessionId||null, ariaCurrent:r.getAttribute('aria-current')}))`,
  clickRowByTitle: (title) => `(() => { const rows=[...document.querySelectorAll('.session-row')]; const row=rows.find(r=>((r.querySelector('.session-title')||{}).textContent||'').trim()===${JSON.stringify(title)}); if(!row) return 'row-not-found'; row.click(); return 'clicked' })()`,
  openMenuByTitle: (title) => `(() => { const rows=[...document.querySelectorAll('.session-row')]; const row=rows.find(r=>((r.querySelector('.session-title')||{}).textContent||'').trim()===${JSON.stringify(title)}); if(!row) return {ok:false,reason:'row-not-found'}; const btn=row.querySelector('.session-more'); if(!btn) return {ok:false,reason:'no-menu-button'}; btn.click(); return {ok:true} })()`,
  menuItems: () => `Array.from(document.querySelectorAll('.session-menu button')).map(b=>b.textContent.trim())`,
  clickMenuText: (text) => `(() => { const b=[...document.querySelectorAll('.session-menu button')].find(x=>x.textContent.trim()===${JSON.stringify(text)}); if(!b) return 'menu-item-not-found'; b.click(); return 'clicked' })()`,
  msgIdsBySession: (sid) => `Array.from(document.querySelectorAll('.msg')).map(m=>m.getAttribute('data-session-id')).filter(v=>v===${JSON.stringify(sid)}).length`,
  composerDisabled: () => `document.querySelectorAll('.composer textarea:disabled').length`,
  toastCount: () => `document.querySelectorAll('.toast[role="alert"], [role="alert"]').length`,
  toastText: () => `(document.querySelector('.toast[role="alert"]')||{}).textContent||''`,
  quotaNote: () => `(document.querySelector('.quota-note')||{}).textContent||''`,
  setSearch: (q) => `(() => { const input=document.querySelector('input[aria-label="搜索会话"]'); if(!input) return 'no-input'; const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(input, ${JSON.stringify(q)}); input.dispatchEvent(new Event('input',{bubbles:true})); return 'typed' })()`,
  renameRow: (title, next) => `(() => { const rows=[...document.querySelectorAll('.session-row')]; const row=rows.find(r=>((r.querySelector('.session-title')||{}).textContent||'').trim()===${JSON.stringify(title)}); if(!row) return 'row-not-found'; const t=row.querySelector('.session-title'); const ev=new MouseEvent('dblclick',{bubbles:true}); row.dispatchEvent(ev); return new Promise((resolve)=>{ setTimeout(()=>{ const input=row.querySelector('.session-rename'); if(!input) return resolve('no-input'); const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(input, ${JSON.stringify(next)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); resolve('submitted') }, 120) }) })()`,
  pressEscapeRename: (title) => `(() => { const rows=[...document.querySelectorAll('.session-row')]; const row=rows.find(r=>((r.querySelector('.session-title')||{}).textContent||'').trim()===${JSON.stringify(title)}); if(!row) return 'row-not-found'; row.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return new Promise((resolve)=>{ setTimeout(()=>{ const input=row.querySelector('.session-rename'); if(!input) return resolve('no-input'); const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(input, 'ESC-SHOULD-NOT-SAVE'); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); resolve('escaped') }, 120) }) })()`,
}

// fetch instrumentation: install once, then read counters.
export const installFetchLog = `(() => {
  if (window.__acLog) return 'already';
  window.__acLog = { calls: [] };
  const orig = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    window.__acLog.calls.push({ url, method, at: Date.now() });
    return orig.apply(window, arguments);
  };
  return 'ok';
})()`

export async function fetchCalls(page, pattern) {
  const calls = await page.eval(`window.__acLog ? window.__acLog.calls : []`)
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern)
  return calls.filter((c) => re.test(c.url) && (!pattern.method || c.method === pattern.method))
}

export async function sessions(baseUrl, query = '') {
  const res = await http(baseUrl, 'GET', `/api/sessions${query}`)
  if (res.status !== 200) throw new Failed(`GET /api/sessions${query} -> ${res.status}`)
  return res.json.sessions || []
}

export function flattenTree(nodes, out = []) {
  for (const n of nodes || []) { out.push(n); flattenTree(n.children || [], out) }
  return out
}

export function readDb(rel, sql, params = []) {
  // read-only sqlite via node:sqlite (Node >= 22.5)
  const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel)
  if (!fs.existsSync(file)) return { ok: false, error: `db not found: ${rel}` }
  try {
    const db = new DatabaseSync(file, { readOnly: true })
    try { return { ok: true, rows: db.prepare(sql).all(...params) } } finally { db.close() }
  } catch (err) { return { ok: false, error: err.message } }
}

export async function saveEvidence(ac, payload) {
  fs.mkdirSync(TMP, { recursive: true })
  let text = JSON.stringify(payload, null, 2)
  if (Buffer.byteLength(text, 'utf8') > 8192) {
    // 截断必须保持 JSON 合法：按字段裁剪长字符串与长数组，不能对序列化文本做字符串切片。
    const shrink = (value) => {
      if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}…（截断）` : value
      if (Array.isArray(value)) return value.slice(0, 6).map((item) => shrink(item))
      if (value && typeof value === 'object') {
        const out = {}
        for (const [key, item] of Object.entries(value)) out[key] = shrink(item)
        return out
      }
      return value
    }
    let trimmed = { ...payload, truncated: true, note: 'evidence 超过 8KB，raw 已按字段截断', raw: shrink(payload.raw ?? {}) }
    text = JSON.stringify(trimmed, null, 2)
    if (Buffer.byteLength(text, 'utf8') > 8192) {
      trimmed = { ac, at: payload.at, truncated: true, note: '证据过大，已截断为摘要', checks: payload.checks, raw: { note: 'raw 已省略' } }
      text = JSON.stringify(trimmed, null, 2)
    }
  }
  const file = path.join(TMP, `${ac}.json`)
  fs.writeFileSync(file, text)
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

export async function report(ac, { pass, detail, checks = {}, raw = {} }) {
  const evidence = { ac, at: new Date().toISOString(), baseUrl: process.argv.join(' '), checks, raw }
  const file = await saveEvidence(ac, evidence)
  const line = JSON.stringify({ ac, pass: Boolean(pass), detail: String(detail).slice(0, 600), evidence: file })
  console.log(line)
  process.exit(pass ? 0 : 1)
}

export async function main(ac, fn) {
  try {
    const args = parseArgs()
    const result = await fn(args)
    await report(ac, result)
  } catch (err) {
    const blocked = err instanceof Blocked
    const detail = blocked ? `blocked: ${err.message}` : `fail: ${err && err.message ? err.message : String(err)}`
    await report(ac, { pass: false, detail, checks: { errorType: blocked ? 'blocked' : 'failed' } })
  }
}

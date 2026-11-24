#!/usr/bin/env node
// AC-SYNC-001-01 assertion script (zero-dependency Node, read-only except .tmp/ac evidence).
// Usage: node scripts/ac/AC-SYNC-001-01.mjs [--base-url http://127.0.0.1:8787] [--session-id main]
// Contract: one JSON line on stdout; exit 0 pass, 1 fail, 2 argument/environment error (blocked).
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const AC = 'AC-SYNC-001-01'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CDP_PORT = 9223
const STARTED_AT = new Date().toISOString()
let BASE_URL = 'http://127.0.0.1:8787'
let SESSION_ID = 'main'
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--base-url' && argv[i + 1]) { BASE_URL = argv[++i].replace(/\/+$/, ''); continue }
  if (arg.startsWith('--base-url=')) { BASE_URL = arg.slice(11).replace(/\/+$/, ''); continue }
  if (arg === '--session-id' && argv[i + 1]) { SESSION_ID = argv[++i]; continue }
  if (arg.startsWith('--session-id=')) { SESSION_ID = arg.slice(13); continue }
  if (arg === '-h' || arg === '--help') { console.log('usage: node scripts/ac/' + AC + '.mjs [--base-url URL] [--session-id ID]'); process.exit(0) }
  console.error('unknown argument: ' + arg)
  process.exit(2)
}
const EVIDENCE_REL = '.tmp/ac/' + AC + '.json'
const EVIDENCE_ABS = join(ROOT, EVIDENCE_REL)

function writeEvidence(payload) {
  let text = JSON.stringify(payload, null, 2)
  if (text.length > 8192) {
    payload.raw = String(payload.raw || '').slice(0, 1200)
    payload.truncated = true
    text = JSON.stringify(payload, null, 2)
  }
  mkdirSync(dirname(EVIDENCE_ABS), { recursive: true })
  writeFileSync(EVIDENCE_ABS, text, 'utf8')
}
function emit(pass, detail, extra = {}) {
  writeEvidence({ ac: AC, pass, detail, command: process.execPath, args: process.argv.slice(1), baseUrl: BASE_URL, sessionId: SESSION_ID, startedAt: STARTED_AT, finishedAt: new Date().toISOString(), ...extra })
  console.log(JSON.stringify({ ac: AC, pass, detail, evidence: EVIDENCE_REL }))
  process.exit(pass ? 0 : 1)
}
function blocked(detail, extra = {}) {
  writeEvidence({ ac: AC, pass: false, blocked: true, detail: 'blocked: ' + detail, baseUrl: BASE_URL, startedAt: STARTED_AT, finishedAt: new Date().toISOString(), ...extra })
  console.log(JSON.stringify({ ac: AC, pass: false, blocked: true, detail: 'blocked: ' + detail, evidence: EVIDENCE_REL }))
  process.exit(2)
}
function fail(detail, extra = {}) { emit(false, detail, extra) }
async function withRetry(fn, label) {
  let last
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fn() } catch (err) { last = err; if (attempt < 2) await sleep(150 * (attempt + 1)) }
  }
  throw new Error(label + ' 网络错误（重试 2 次后仍失败）：' + (last && last.message ? last.message : String(last)))
}
async function api(path, init) {
  return withRetry(async () => {
    const res = await fetch(BASE_URL + path, init)
    const text = await res.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
    if (!res.ok) { const err = new Error('HTTP ' + res.status + ' ' + path); err.status = res.status; err.body = body; throw err }
    return body
  }, path)
}
async function jsonPost(path, payload) {
  return api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
}
const probe = spawnSync(process.execPath, [join(ROOT, 'scripts', 'probe-cdp.mjs'), '--json'], { stdio: 'ignore', timeout: 30000 })
if (probe.status !== 0) blocked('CDP 不可用（scripts/probe-cdp.mjs 退出码 ' + probe.status + '）')

const INSTRUMENT = `(() => {
  const st = window.__acsync = { bc: [], bcRecv: [], wsIn: [], wsOut: [], ws: [], errors: [] };
  window.addEventListener('error', (e) => st.errors.push(String(e.message || e)));
  window.addEventListener('unhandledrejection', (e) => st.errors.push('rejection:' + String(e.reason)));
  const NativeBC = window.BroadcastChannel;
  if (NativeBC) {
    class WrappedBC extends NativeBC {
      constructor(name) { super(name); this.__name = String(name); super.addEventListener('message', (e) => st.bcRecv.push({ name: this.__name, data: e.data, t: Date.now() })); }
      postMessage(data) { st.bc.push({ name: this.__name, data, t: Date.now() }); return super.postMessage(data); }
    }
    window.BroadcastChannel = WrappedBC;
  }
  const NativeWS = window.WebSocket;
  class WrappedWS extends NativeWS {
    constructor(...args) { super(...args); st.ws.push(this); this.addEventListener('message', (e) => st.wsIn.push({ data: String(e.data), t: Date.now() })); }
    send(data) { st.wsOut.push({ data: String(data), t: Date.now() }); return super.send(data); }
  }
  window.WebSocket = WrappedWS;
})()`
const NO_BC = "Object.defineProperty(window,'BroadcastChannel',{value:undefined,configurable:true})"

async function cdp(path, method = 'GET') {
  const res = await fetch('http://127.0.0.1:' + CDP_PORT + path, { method })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { raw: text, status: res.status } }
}
class Conn {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = new Map() }
  async open() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolveOpen, rejectOpen) => {
      this.ws.onopen = resolveOpen
      this.ws.onerror = () => rejectOpen(new Error('CDP websocket error'))
    })
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.id !== undefined) {
        const pending = this.pending.get(msg.id)
        if (pending) { this.pending.delete(msg.id); msg.error ? pending.reject(new Error(JSON.stringify(msg.error))) : pending.resolve(msg.result) }
      } else {
        for (const fn of this.handlers.get(msg.method) || []) fn(msg.params)
      }
    }
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  on(method, fn) { const list = this.handlers.get(method) || []; list.push(fn); this.handlers.set(method, list) }
}

async function openPage(extraPreload) {
  let target = await cdp('/json/new?about:blank', 'PUT')
  if (!target.webSocketDebuggerUrl) target = await cdp('/json/new?about:blank')
  const conn = new Conn(target.webSocketDebuggerUrl)
  await conn.open()
  await conn.send('Page.enable')
  await conn.send('Runtime.enable')
  await conn.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
  if (extraPreload) await conn.send('Page.addScriptToEvaluateOnNewDocument', { source: extraPreload })
  await conn.send('Page.navigate', { url: BASE_URL + '/' })
  const page = { id: target.id, conn }
  await waitFor(async () => (await evaluate(page, '!!document.querySelector(".session-row")')), 12000, '页面加载')
  return page
}
async function closePage(page) {
  try { await cdp('/json/close/' + page.id) } catch { /* target may already be gone */ }
}
async function evaluate(page, expression) {
  const result = await page.conn.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error('页面执行异常: ' + JSON.stringify(result.exceptionDetails).slice(0, 400))
  return result.result.value
}
async function waitFor(fn, timeout = 8000, label = '条件') {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last } catch (err) { last = String(err) }
    await sleep(100)
  }
  throw new Error(label + ' 未在 ' + timeout + 'ms 内满足（最后值 ' + JSON.stringify(last).slice(0, 200) + '）')
}
async function reloadPage(page) {
  await page.conn.send('Page.reload', { ignoreCache: true })
  await sleep(300)
  await waitFor(async () => (await evaluate(page, '!!document.querySelector(".session-row")')), 12000, '刷新后页面加载')
}
async function statusText(page) { return evaluate(page, 'document.querySelector(".status")?.textContent || ""') }
async function connectionDotCount(page) { return evaluate(page, 'document.querySelectorAll(".connection-dot").length') }
async function activeTitle(page) { return evaluate(page, 'document.querySelector(".session-row.is-active .session-title")?.textContent || ""') }
async function clickSession(page, title) {
  return evaluate(page, '(() => { const rows = [...document.querySelectorAll(".session-row")]; const row = rows.find((r) => r.querySelector(".session-title")?.textContent === ' + JSON.stringify(title) + '); if (!row) return false; row.click(); return true })()')
}
async function unreadDots(page, title) {
  return evaluate(page, '(() => { const rows = [...document.querySelectorAll(".session-row")]; const row = rows.find((r) => r.querySelector(".session-title")?.textContent === ' + JSON.stringify(title) + '); return row ? row.querySelectorAll(\'[data-unread="true"]\').length : -1 })()')
}
async function totalUnreadDots(page) { return evaluate(page, 'document.querySelectorAll(\'[data-unread="true"]\').length') }
async function modeButton(page) {
  return evaluate(page, '(() => { const b = document.querySelector(".mode-toggle") || document.querySelector(".composer-hint-icon[aria-label*=\\"切换发送方式\\"]"); if (!b) return null; return { pressed: b.getAttribute("aria-pressed"), label: b.getAttribute("aria-label") } })()')
}
async function clickMode(page) {
  return evaluate(page, '(() => { const b = document.querySelector(".mode-toggle") || document.querySelector(".composer-hint-icon[aria-label*=\\"切换发送方式\\"]"); if (!b) return false; b.click(); return true })()')
}
async function storedMode(page) { return evaluate(page, 'window.localStorage.getItem("simo.composer.sendMode")') }
async function bcPosts(page, channel) {
  return evaluate(page, '(window.__acsync?.bc || []).filter((x) => x.name === ' + JSON.stringify(channel) + ').map((x) => x.data)')
}
async function bcRecv(page, channel) {
  return evaluate(page, '(window.__acsync?.bcRecv || []).filter((x) => x.name === ' + JSON.stringify(channel) + ').map((x) => x.data)')
}
async function wsIn(page) { return evaluate(page, '(window.__acsync?.wsIn || []).map((x) => ({ data: x.data, t: x.t }))') }
async function wsOut(page) { return evaluate(page, '(window.__acsync?.wsOut || []).map((x) => ({ data: x.data, t: x.t }))') }
async function pageErrors(page) { return evaluate(page, 'window.__acsync?.errors || []') }
function eventIds(frames) {
  const ids = []
  for (const frame of frames) {
    try { const parsed = JSON.parse(frame.data); if (typeof parsed.id === 'number') ids.push(parsed.id) } catch { /* hello/status frames */ }
  }
  return ids
}
function subscribeSince(frames) {
  const values = []
  for (const frame of frames) {
    try { const parsed = JSON.parse(frame.data); if (parsed.type === 'subscribe') values.push(parsed.data?.since ?? null) } catch { /* ignore */ }
  }
  return values
}
async function listSessions() { return (await api('/api/sessions')).sessions || [] }
async function createProbe(title) {
  const created = await jsonPost('/api/sessions', { title, draft: false })
  return created.session.id
}
async function sendProbeMessage(sessionId, text) {
  return jsonPost('/api/chat', { sessionId, text, clientMutationId: 'ac-' + Date.now() + '-' + Math.random().toString(36).slice(2) })
}
async function setTextarea(page, text) {
  await evaluate(page, '(() => { const ta = document.querySelector(\'textarea[aria-label="消息输入框"]\'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; setter.call(ta, ' + JSON.stringify(text) + '); ta.dispatchEvent(new Event("input", { bubbles: true })); return true })()')
  await sleep(80)
}
async function dispatchEnter(page) {
  return evaluate(page, '(() => { const ta = document.querySelector(\'textarea[aria-label="消息输入框"]\'); const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }); ta.dispatchEvent(ev); return { prevented: ev.defaultPrevented, value: ta.value } })()')
}
async function messagesIds(page) {
  return evaluate(page, '[].map.call(document.querySelectorAll("[data-message-id]"), (n) => n.getAttribute("data-message-id"))')
}
async function reloadStorage(page, key, value) {
  await evaluate(page, 'window.localStorage.setItem(' + JSON.stringify(key) + ', ' + JSON.stringify(value) + ')')
}


// AC-SYNC-001-01: connected state, ordered seq, since replay count, two-client fanout.
let a, b
try {
  a = await openPage()
  b = await openPage()
  await waitFor(async () => (await statusText(a)).includes('已连接') && (await statusText(b)).includes('已连接'), 8000, '两标签 WS 连接')
  const sid = await createProbe('AC-SYNC-001-01-' + Date.now())
  await sendProbeMessage(sid, 'ac-sync-001-01 e1')
  await waitFor(async () => eventIds(await wsIn(a)).length > 0 && eventIds(await wsIn(b)).length > 0, 10000, '首帧事件')
  await sleep(500)
  const idsA = eventIds(await wsIn(a))
  const idsB = eventIds(await wsIn(b))
  const startId = Math.max(idsA.at(-1) ?? 0, idsB.at(-1) ?? 0)
  const dotA = await connectionDotCount(a)
  const dotB = await connectionDotCount(b)
  await a.conn.send('Network.enable')
  await a.conn.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await evaluate(a, '(window.__acsync.ws.at(-1) || {}).close?.()')
  await waitFor(async () => (await statusText(a)).includes('重连中'), 4000, '重连中状态')
  const offlineAt = Date.now()
  await sendProbeMessage(sid, 'ac-sync-001-01 e2')
  await sleep(900)
  const offlineIds = eventIds((await wsIn(b)).filter((f) => f.t >= offlineAt))
  await a.conn.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  const reconnectStart = Date.now()
  await waitFor(async () => (await statusText(a)).includes('已连接'), 5000, '重连恢复')
  const reconnectMs = Date.now() - reconnectStart
  await sleep(700)
  const subs = subscribeSince(await wsOut(a))
  const since = [...subs].reverse().find((v) => typeof v === 'number')
  const afterA = await wsIn(a)
  const afterB = await wsIn(b)
  const maxOffline = offlineIds.length ? Math.max(...offlineIds) : -1
  const replayIds = eventIds(afterA.filter((f) => f.t >= reconnectStart)).filter((id) => typeof since === 'number' && id > since && id <= maxOffline)
  const idsAfterA = eventIds(afterA).filter((id) => id > startId)
  const idsAfterB = eventIds(afterB).filter((id) => id > startId)
  const seqA = eventIds(afterA)
  const strict = seqA.every((id, i) => i === 0 || id > seqA[i - 1])
  const duplicateCount = seqA.length - new Set(seqA).size
  const replayMatches = typeof since === 'number' && offlineIds.length > 0 && replayIds.length === offlineIds.length && replayIds.every((id, i) => id === offlineIds[i])
  const fanoutEqual = idsAfterA.length === idsAfterB.length && idsAfterA.every((id, i) => id === idsAfterB[i])
  const detail = 'since=' + (typeof since === 'number' ? since : 'none') + ' 重连=' + reconnectMs + 'ms 断开期帧=' + offlineIds.length + ' 补发帧=' + replayIds.length + ' A事件=' + idsAfterA.length + ' B事件=' + idsAfterB.length + ' 连接点=' + dotA + '/' + dotB + ' 递增=' + strict + ' 重复=' + duplicateCount + ' 两端集合相等=' + fanoutEqual
  const ok = dotA === 1 && dotB === 1 && strict && duplicateCount === 0 && replayMatches && fanoutEqual
  await closePage(a); await closePage(b)
  emit(ok, (ok ? 'pass: ' : 'fail: ') + detail, { since, reconnectMs, offlineIds, replayIds, idsAfterA, idsAfterB, dotA, dotB, strict, duplicateCount, replayMatches, fanoutEqual })
} catch (err) {
  try { if (a) await a.conn.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }) } catch { /* ignore */ }
  if (a) await closePage(a)
  if (b) await closePage(b)
  fail('执行失败：' + (err && err.message ? err.message : String(err)))
}

// 补充取证：B 刷新后未读与服务端一致（非 active 行）+ 1180 时间轴与正文是否压字 + 双向 active 跟随 + 恢复默认视图。
import { writeFileSync } from 'node:fs'

const OUT = 'E:/dsh_home/workspaces/agent/docs/testing'
const APP = 'http://127.0.0.1:8787/'
const DEBUG = 'http://127.0.0.1:9223'
const PROBE = 'verify-conv-rest-sync'
const OTHER = '新会话'
const MAIN = '主会话'
const PROBE_ID = 'sess-ed275c9234ff49a9'
const MARKER = 'conv-rest-marker-1795341899844'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stamp = () => new Date().toISOString().slice(11, 23)
const log = (...a) => console.log(`[${stamp()}]`, ...a)
const R = { sync: { m2: {} }, layout: {}, shots: [] }

async function newTab() {
  const res = await fetch(`${DEBUG}/json/new?about:blank`, { method: 'PUT' })
  const t = await res.json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((ok, bad) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', () => bad(new Error('ws')), { once: true }) })
  let seq = 0
  const pending = new Map()
  const frames = { in: [], out: [] }
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return }
    if (m.method === 'Network.webSocketFrameReceived') {
      try { const j = JSON.parse(m.params.response.payloadData); frames.in.push({ at: Date.now(), type: j.type ?? null, id: j.id ?? null, data: j.data ?? null }) } catch {}
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0])
    return r.result.value
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  return { ws, send, evaluate, frames, targetId: t.id, shot: async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${n}`, Buffer.from(r.data, 'base64')); R.shots.push(n) }, close: () => { try { ws.close() } catch {}; void fetch(`${DEBUG}/json/close/${t.id}`).catch(() => {}) } }
}

const READY = `(() => document.readyState === 'complete' && !!document.querySelector('.conversation-scroll') && document.querySelectorAll('.session-row').length >= 3)()`
async function waitFor(tab, expr, timeout = 4000, interval = 80) {
  const t0 = Date.now(); let last = null
  while (Date.now() - t0 < timeout) { try { last = await tab.evaluate(expr) } catch (e) { last = null } ; if (last) return { ok: true, ms: Date.now() - t0, value: last }; await sleep(interval) }
  return { ok: false, ms: Date.now() - t0, value: last }
}
const SNAP = `(() => { const rows = [...document.querySelectorAll('.session-row')].map(r => ({ title: (r.querySelector('.session-title')?.textContent ?? '').trim(), active: r.classList.contains('is-active'), unread: !!r.querySelector('[data-unread="true"]') })); const sc = document.querySelector('.conversation-scroll'); return { at: Date.now(), activeTitle: rows.find(r => r.active)?.title ?? null, rows, probe: rows.find(r => r.title === ${JSON.stringify(PROBE)}) ?? null, msgHasMarker: !!(sc && sc.innerText.includes(${JSON.stringify(MARKER)})), msgCount: sc ? sc.querySelectorAll('.msg').length : null } })()`

async function clickRow(tab, title) {
  await tab.evaluate(`(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(title)}); if (row) row.scrollIntoView({ block: 'center' }); return true })()`)
  await sleep(150)
  const pos = await tab.evaluate(`(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(title)}); if (!row) return null; const b = row.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } })()`)
  if (!pos) throw new Error(`row not found: ${title}`)
  const at = Date.now()
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  return { at, pos }
}
const ACTIVE_IS = (title) => `(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(title)}); return !!(row && row.classList.contains('is-active')) })()`

async function main() {
  const A = await newTab()
  await A.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await A.send('Page.navigate', { url: `${APP}?verify=tabA2` })
  await waitFor(A, READY, 15000, 200)
  await sleep(1000)
  const B = await newTab()
  await B.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await B.send('Page.navigate', { url: `${APP}?verify=tabB2` })
  await waitFor(B, READY, 15000, 200)
  await sleep(1500)

  R.sync.m2.initial = { A: await A.evaluate(SNAP), B: await B.evaluate(SNAP) }

  // A 切到"新会话"，B 跟随；此时两边都不在探针会话
  await clickRow(A, OTHER)
  R.sync.m2.followOther = await waitFor(B, ACTIVE_IS(OTHER), 4000, 60)

  // B 刷新：未读状态应与 A、与服务端都一致
  await B.send('Page.reload')
  await waitFor(B, READY, 15000, 200)
  await sleep(1500)
  const a = await A.evaluate(SNAP)
  const b = await B.evaluate(SNAP)
  const server = await B.evaluate(`(async () => { const r = await fetch('/api/sessions/tree', { cache: 'no-store' }); const j = await r.json(); const map = {}; const walk = (n, d) => { if (!n || d > 6) return; if (Array.isArray(n)) return n.forEach((x) => walk(x, d)); if (typeof n !== 'object') return; if (typeof n.id === 'string' && typeof n.title === 'string') map[n.id] = { title: n.title, unread: n.hasUnread ?? null, active: n.active ?? null }; for (const k of ['sessions', 'tree', 'children', 'items', 'roots']) if (n[k]) walk(n[k], d + 1) }; walk(j, 0); return { status: r.status, map } })()`)
  const cmp = []
  for (const row of a.rows) {
    const s = Object.values(server.map).filter((v) => v.title === row.title)
    if (s.length !== 1) { cmp.push({ title: row.title, server: 'title-ambiguous-or-missing', n: s.length }); continue }
    if (row.active) continue
    cmp.push({ title: row.title, A: row.unread, B: (b.rows.find((r) => r.title === row.title) || {}).unread ?? null, server: s[0].unread })
  }
  R.sync.m2.reload = {
    A: a, B: b, serverStatus: server.status,
    probeServer: Object.values(server.map).find((v) => v.title === PROBE) ?? null,
    compare: cmp,
    mismatch: cmp.filter((x) => typeof x.A === 'boolean' && (x.A !== x.B || x.A !== x.server)),
  }
  await B.shot('conv-rest-tabB-reload-consistent.png')
  log('M2 reload: A active=', a.activeTitle, 'B active=', b.activeTitle, 'probeA=', JSON.stringify(a.probe), 'probeB=', JSON.stringify(b.probe), 'serverProbe=', JSON.stringify(R.sync.m2.reload.probeServer), 'rows=', cmp.length, 'mismatch=', JSON.stringify(R.sync.m2.reload.mismatch))

  // B 点探针会话：A 跟随（B→A 方向）+ 刷新后消息仍在（服务端持久化，不是 WS 推送）
  const clickB = await clickRow(B, PROBE)
  const followA = await waitFor(A, ACTIVE_IS(PROBE), 4000, 60)
  await sleep(800)
  R.sync.m2.bToA = { clickB, followA: { ok: followA.ok, ms: followA.ms }, A: await A.evaluate(SNAP), B: await B.evaluate(SNAP), framesA: A.frames.in.filter((f) => f.at >= clickB.at && (f.type === 'session_read' || f.type === 'session_unread')) }
  log('M2 B->A follow=', followA.ok, followA.ms + 'ms', 'markerAfterReload=', R.sync.m2.bToA.B.msgHasMarker)

  // 1180 档：时间轴矩形与正文文本左边界、时间轴遮挡采样
  await A.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(700)
  R.layout.overlapCheck = await A.evaluate(`(() => {
    const tl = document.querySelector('.conversation-panel > .timeline')
    const sc = document.querySelector('.conversation-scroll')
    const r = (el) => el ? el.getBoundingClientRect() : null
    const tr = r(tl), sr = r(sc)
    const msgs = [...document.querySelectorAll('.conversation-scroll .msg')]
    const minContentLeft = msgs.reduce((min, m) => { const b = m.getBoundingClientRect(); return Math.min(min, b.left) }, Infinity)
    const inner = [...document.querySelectorAll('.conversation-scroll .msg p, .conversation-scroll .msg .bubble, .conversation-scroll .msg .body')].map((e) => e.getBoundingClientRect().left)
    const hitSamples = []
    if (tr) for (const fy of [0.15, 0.5, 0.85]) { const x = tr.right - 2, y = tr.top + tr.height * fy; const el = document.elementFromPoint(x, y); hitSamples.push({ fy, topTag: el ? el.tagName.toLowerCase() : null, topClass: el && typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : null, isTimeline: !!(el && (el === tl || tl.contains(el))) }) }
    return { timeline: tr ? { x: Math.round(tr.left), right: Math.round(tr.right), w: Math.round(tr.width) } : null, scroller: sr ? { x: Math.round(sr.left), w: Math.round(sr.width) } : null, msgBoxLeft: Number.isFinite(minContentLeft) ? Math.round(minContentLeft) : null, textLeft: inner.length ? Math.round(Math.min(...inner)) : null, textCount: inner.length, hitSamples, vw: innerWidth, docScrollWidth: document.documentElement.scrollWidth, sendHit: (() => { const b = document.querySelector('.composer .send').getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el ? el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '') : null })() } })()`)
  log('M2 1180 overlap:', JSON.stringify(R.layout.overlapCheck))

  // 恢复默认视图：回到主会话
  const back = await clickRow(A, MAIN)
  const followBack = await waitFor(B, ACTIVE_IS(MAIN), 4000, 60)
  await sleep(500)
  R.sync.m2.restore = { back: back.at, followBack: { ok: followBack.ok, ms: followBack.ms }, A: await A.evaluate(SNAP), B: await B.evaluate(SNAP) }
  await A.shot('conv-rest-restored.png')
  B.close(); A.close()
  writeFileSync(`${OUT}/.conv-rest-result2.json`, JSON.stringify(R, null, 2))
  log('M2 DONE')
}
main().then(() => process.exit(0)).catch((e) => { console.error('M2 FAILED', e && e.stack || e); try { writeFileSync(`${OUT}/.conv-rest-result2.json`, JSON.stringify({ ...R, error: String(e && e.stack || e) }, null, 2)) } catch {}; process.exit(1) })

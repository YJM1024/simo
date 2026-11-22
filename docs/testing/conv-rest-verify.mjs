// 会话域剩余两条未验证项的真浏览器取证：跨标签双 WS 同步 + 768 档布局。
// 复用已在 127.0.0.1:9223 运行的 Chrome 157，不自起浏览器。
import { writeFileSync } from 'node:fs'

const OUT = 'E:/dsh_home/workspaces/agent/docs/testing'
const APP = 'http://127.0.0.1:8787/'
const DEBUG = 'http://127.0.0.1:9223'
const PROBE = 'verify-conv-rest-sync'
const OTHER = '新会话'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stamp = () => new Date().toISOString().slice(11, 23)
const log = (...a) => console.log(`[${stamp()}]`, ...a)
const R = { layout: {}, sync: {}, frames: {}, shots: [], notes: [] }

async function newTab(tag) {
  const res = await fetch(`${DEBUG}/json/new?about:blank`, { method: 'PUT' })
  if (!res.ok) throw new Error(`json/new ${res.status}`)
  const t = await res.json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((ok, bad) => {
    ws.addEventListener('open', ok, { once: true })
    ws.addEventListener('error', () => bad(new Error('ws error')), { once: true })
  })
  let seq = 0
  const pending = new Map()
  const frames = { in: [], out: [] }
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id) {
      const p = pending.get(m.id)
      if (!p) return
      pending.delete(m.id)
      if (m.error) p.reject(new Error(`${m.method || 'cdp'} ${JSON.stringify(m.error)}`))
      else p.resolve(m.result)
      return
    }
    if (m.method === 'Network.webSocketFrameReceived' || m.method === 'Network.webSocketFrameSent') {
      const dir = m.method.endsWith('Received') ? 'in' : 'out'
      const raw = m.params?.response?.payloadData ?? ''
      let rec
      try {
        const j = JSON.parse(raw)
        rec = { at: Date.now(), type: j.type ?? null, id: j.id ?? null, data: j.data ?? null }
      } catch {
        rec = { at: Date.now(), raw: String(raw).slice(0, 120) }
      }
      frames[dir].push(rec)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (r.exceptionDetails) {
      const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text
      throw new Error(`eval: ${String(d).split('\n')[0]} :: ${expression.slice(0, 90)}`)
    }
    return r.result.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  const tab = {
    tag, ws, send, evaluate, frames, targetId: t.id,
    shot: async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(`${OUT}/${name}`, Buffer.from(r.data, 'base64'))
      R.shots.push(name)
      return name
    },
    close: () => {
      try { ws.close() } catch {}
      void fetch(`${DEBUG}/json/close/${t.id}`).catch(() => {})
    },
  }
  return tab
}

async function waitFor(tab, expr, timeout = 3000, interval = 100) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeout) {
    try { last = await tab.evaluate(expr) } catch (e) { last = { error: String(e).slice(0, 120) } }
    if (last) return { ok: true, ms: Date.now() - t0, value: last }
    await sleep(interval)
  }
  return { ok: false, ms: Date.now() - t0, value: last }
}

const READY = `(() => document.readyState === 'complete' && !!document.querySelector('.conversation-scroll') && document.querySelectorAll('.session-row').length >= 3 && !!document.querySelector('textarea[aria-label="消息输入框"]'))()`

const ROW_EXPR = (title) => `(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(title)}); if (!row) return null; const b = row.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) } })()`

async function clickRow(tab, title) {
  await tab.evaluate(`(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(title)}); if (row) row.scrollIntoView({ block: 'center' }); return true })()`)
  await sleep(150)
  const pos = await tab.evaluate(ROW_EXPR(title))
  if (!pos) throw new Error(`row not found: ${title}`)
  const at = Date.now()
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
  return { at, pos }
}

const SNAPSHOT = `(() => {
  const rows = [...document.querySelectorAll('.session-row')].map(r => ({
    title: (r.querySelector('.session-title')?.textContent ?? '').trim(),
    active: r.classList.contains('is-active'),
    unread: !!r.querySelector('[data-unread="true"]'),
    count: (r.querySelector('.session-count')?.textContent ?? '').trim() || null,
  }))
  const sc = document.querySelector('.conversation-scroll')
  const err = document.querySelector('.composer-error')
  return {
    at: Date.now(),
    activeTitle: rows.find(r => r.active)?.title ?? null,
    probe: rows.find(r => r.title === ${JSON.stringify(PROBE)}) ?? null,
    other: rows.find(r => r.title === ${JSON.stringify(OTHER)}) ?? null,
    rows: rows.length,
    msgText: sc ? sc.innerText.slice(0, 1200) : null,
    msgCount: sc ? sc.querySelectorAll('.msg').length : null,
    composerError: err ? err.textContent.trim() : null,
    bc: (window.__bcLog || []).slice(-6),
  }
})()`

const LAYOUT = `(() => {
  const q = (s) => document.querySelector(s)
  const box = (s) => {
    const el = q(s)
    if (!el) return { sel: s, present: false }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { sel: s, present: true, display: cs.display, visibility: cs.visibility, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }
  }
  const rectOf = (s) => q(s)?.getBoundingClientRect() ?? null
  const inter = (a, b) => {
    if (!a || !b) return null
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return { w: Math.round(Math.max(0, w)), h: Math.round(Math.max(0, h)), area: Math.round(Math.max(0, w) * Math.max(0, h)) }
  }
  const hit = (s) => {
    const el = q(s)
    if (!el) return { sel: s, present: false }
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return { sel: s, present: true, visible: false }
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const top = document.elementFromPoint(x, y)
    const inside = !!(top && (top === el || el.contains(top) || (top.closest && top.closest(s) === el)))
    const cls = top && typeof top.className === 'string' ? top.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''
    return { sel: s, present: true, visible: true, inside, top: top ? top.tagName.toLowerCase() + (cls ? '.' + cls : '') : null }
  }
  const sel = {
    app: '.app', sidebar: '.sidebar', panel: '.conversation-panel', scroller: '.conversation-scroll',
    timeline: '.conversation-panel > .timeline', groups: '.timeline-groups', inspector: 'aside.inspector',
    rail: '.insp-rail', composer: '.composer', send: '.composer .send', input: 'textarea[aria-label="消息输入框"]',
    topbar: '.topbar', badge: '.session-count',
  }
  const parts = {}
  for (const k of Object.keys(sel)) parts[k] = box(sel[k])
  const out = {
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    docScrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
    docScrollHeight: document.documentElement.scrollHeight,
    hasHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    mq: {
      max1024: matchMedia('(max-width:64em)').matches,
      notMin900: matchMedia('not all and (min-width:56.25em)').matches,
      max760: matchMedia('(max-width:47.5em)').matches,
      max1180: matchMedia('(max-width:73.75em)').matches,
    },
    parts,
    gridColumns: getComputedStyle(q('.app')).gridTemplateColumns,
    overlaps: {
      timeline_vs_scroller: inter(rectOf('.conversation-panel > .timeline'), rectOf('.conversation-scroll')),
      timeline_vs_composer: inter(rectOf('.conversation-panel > .timeline'), rectOf('.composer')),
      timeline_vs_input: inter(rectOf('.conversation-panel > .timeline'), rectOf('textarea[aria-label="消息输入框"]')),
      groups_vs_scroller: inter(rectOf('.timeline-groups'), rectOf('.conversation-scroll')),
      rail_vs_panel: inter(rectOf('.insp-rail'), rectOf('.conversation-panel')),
    },
    occlusion: { send: hit('.composer .send'), input: hit('textarea[aria-label="消息输入框"]'), timeline: hit('.conversation-panel > .timeline') },
    messages: document.querySelectorAll('.conversation-scroll .msg').length,
  }
  const over = []
  for (const k of Object.keys(parts)) {
    const p = parts[k]
    if (p.present && p.display !== 'none' && p.right > innerWidth + 1) over.push({ part: k, right: p.right })
  }
  out.partsBeyondViewport = over
  return out
})()`

async function setViewport(tab, width, height) {
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await sleep(500)
}

async function main() {
  const t0 = Date.now()
  const A = await newTab('A')
  R.notes.push(`tabA ${A.targetId}`)

  // ---------- Phase 1: 布局 ----------
  await setViewport(A, 1180, 900)
  await A.send('Page.navigate', { url: `${APP}?verify=layout` })
  await waitFor(A, READY, 15000, 200)
  await sleep(1200)
  R.layout.w1180 = await A.evaluate(LAYOUT)
  await A.shot('conv-rest-1180.png')
  log('1180', JSON.stringify({ vw: R.layout.w1180.vw, sw: R.layout.w1180.docScrollWidth, parts: Object.fromEntries(Object.entries(R.layout.w1180.parts).map(([k, v]) => [k, v.present ? v.display + ':' + v.w : 'absent'])), over: R.layout.w1180.partsBeyondViewport, ov: R.layout.w1180.overlaps }))

  await setViewport(A, 768, 1024)
  await sleep(700)
  R.layout.w768 = await A.evaluate(LAYOUT)
  await A.shot('conv-rest-768.png')
  log('768', JSON.stringify({ vw: R.layout.w768.vw, sw: R.layout.w768.docScrollWidth, parts: Object.fromEntries(Object.entries(R.layout.w768.parts).map(([k, v]) => [k, v.present ? v.display + ':' + v.w : 'absent'])), over: R.layout.w768.partsBeyondViewport, ov: R.layout.w768.overlaps }))

  // 768 下把会话区滚到底再看时间轴/输入区是否被挤/遮挡
  R.layout.w768.scrolled = await A.evaluate(`(() => { const sc = document.querySelector('.conversation-scroll'); if (!sc) return null; sc.scrollTop = sc.scrollHeight; return { scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight } })()`)
  await A.shot('conv-rest-768-bottom.png')

  // ---------- Phase 2: 跨标签 ----------
  await setViewport(A, 1280, 900)
  await A.send('Page.navigate', { url: `${APP}?verify=tabA` })
  await waitFor(A, READY, 15000, 200)
  await A.evaluate(`(() => { window.__bcLog = []; try { const ch = new BroadcastChannel('simo.tab-sync.v1'); ch.onmessage = (e) => window.__bcLog.push({ at: Date.now(), data: e.data }); window.__bc = ch } catch (err) { window.__bcLog = [{ err: String(err) }] } return true })()`)
  await sleep(1200)

  const B = await newTab('B')
  R.notes.push(`tabB ${B.targetId}`)
  await setViewport(B, 1280, 900)
  await B.send('Page.navigate', { url: `${APP}?verify=tabB` })
  await waitFor(B, READY, 15000, 200)
  await B.evaluate(`(() => { window.__bcLog = []; try { const ch = new BroadcastChannel('simo.tab-sync.v1'); ch.onmessage = (e) => window.__bcLog.push({ at: Date.now(), data: e.data }); window.__bc = ch } catch (err) { window.__bcLog = [{ err: String(err) }] } return true })()`)
  await sleep(1500)

  R.sync.initial = { A: await A.evaluate(SNAPSHOT), B: await B.evaluate(SNAPSHOT) }
  log('initial A active=', R.sync.initial.A.activeTitle, 'probe=', JSON.stringify(R.sync.initial.A.probe), '| B active=', R.sync.initial.B.activeTitle, 'probe=', JSON.stringify(R.sync.initial.B.probe))

  // S1: A 点测试会话 → B 侧栏 active 跟随 + 未读点消失
  const clickAt = await clickRow(A, PROBE)
  const follow = await waitFor(B, `(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(PROBE)}); if (!row) return null; return row.classList.contains('is-active') || null })()`, 4000, 60)
  const dotGone = await waitFor(B, `(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(PROBE)}); if (!row) return null; return row.querySelector('[data-unread="true"]') ? null : true })()`, 4000, 60)
  await sleep(400)
  R.sync.s1 = {
    clickAt,
    followB: { ok: follow.ok, ms: follow.ms },
    dotGoneB: { ok: dotGone.ok, ms: dotGone.ms },
    A: await A.evaluate(SNAPSHOT), B: await B.evaluate(SNAPSHOT),
    framesB: B.frames.in.filter((f) => f.at >= clickAt.at && (f.type === 'session_read' || f.type === 'session_unread' || String(f.type || '').includes('message'))),
    framesA: A.frames.in.filter((f) => f.at >= clickAt.at && f.type === 'session_read'),
    bcB: (await B.evaluate('(() => (window.__bcLog || []).filter(x => x.data && x.data.type === "active_session_changed").slice(-3))()')),
  }
  log('S1 follow=', follow.ok, follow.ms + 'ms', 'dotGone=', dotGone.ok, dotGone.ms + 'ms', 'framesB=', R.sync.s1.framesB.map((f) => f.type).join(','))
  await A.shot('conv-rest-tabA-probe.png')
  await B.shot('conv-rest-tabB-probe.png')

  // S2: A 发消息 → B 不刷新看到消息
  const marker = `conv-rest-marker-${Date.now()}`
  await A.evaluate(`(() => { const ta = document.querySelector('textarea[aria-label="消息输入框"]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ${JSON.stringify(marker)}); ta.dispatchEvent(new Event('input', { bubbles: true })); return ta.value })()`)
  await sleep(250)
  const sendState = await A.evaluate(`(() => { const b = document.querySelector('.composer .send'); if (!b) return null; const r = b.getBoundingClientRect(); return { disabled: b.disabled, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
  const sendAt = Date.now()
  await A.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sendState.x, y: sendState.y, button: 'left', clickCount: 1 })
  await A.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sendState.x, y: sendState.y, button: 'left', clickCount: 1 })
  const seen = await waitFor(B, `(() => { const sc = document.querySelector('.conversation-scroll'); return !!(sc && sc.innerText.includes(${JSON.stringify(marker)})) })()`, 3500, 50)
  const framesAfterSend = B.frames.in.filter((f) => f.at >= sendAt && (f.type === 'message.created' || f.type === 'message.updated' || f.type === 'session_unread' || f.type === 'reply.delta' || f.type === 'error' || f.type === 'reply.failed'))
  await sleep(2500)
  R.sync.s2 = {
    marker, sendEnabled: sendState && !sendState.disabled,
    seenB: { ok: seen.ok, ms: seen.ms },
    framesB: framesAfterSend, frameTypes: [...new Set(framesAfterSend.map((f) => f.type))],
    A: await A.evaluate(SNAPSHOT), B: await B.evaluate(SNAPSHOT),
  }
  log('S2 marker', marker, 'seenB=', seen.ok, seen.ms + 'ms', 'frames=', R.sync.s2.frameTypes.join(','), 'errA=', R.sync.s2.A.composerError, 'errB=', R.sync.s2.B.composerError)
  await A.shot('conv-rest-tabA-sent.png')
  await B.shot('conv-rest-tabB-received.png')

  // S3: B 刷新后未读与服务端一致
  await B.send('Page.reload', { ignoreCache: false })
  await waitFor(B, READY, 15000, 200)
  await sleep(1500)
  R.sync.s3 = {
    B: await B.evaluate(SNAPSHOT),
    server: await B.evaluate(`(async () => { const r = await fetch('/api/sessions/tree', { cache: 'no-store' }); const j = await r.json(); const hits = []; const walk = (n, depth) => { if (!n || depth > 6) return; if (Array.isArray(n)) return n.forEach((x) => walk(x, depth)); if (typeof n !== 'object') return; if (n.id === ${JSON.stringify('sess-ed275c9234ff49a9')}) hits.push({ id: n.id, hasUnread: n.hasUnread ?? null, title: n.title ?? null, messageCount: n.messageCount ?? null }); for (const k of ['children', 'sessions', 'items', 'roots', 'data']) if (n[k]) walk(n[k], depth + 1) }; walk(j, 0); return { status: r.status, hits, topKeys: Object.keys(j).slice(0, 6) } })()`),
    markerPersisted: await B.evaluate(`(() => { const sc = document.querySelector('.conversation-scroll'); return !!(sc && sc.innerText.includes(${JSON.stringify(marker)})) })()`),
  }
  log('S3 afterReload B active=', R.sync.s3.B.activeTitle, 'probe=', JSON.stringify(R.sync.s3.B.probe), 'server=', JSON.stringify(R.sync.s3.server), 'markerPersisted=', R.sync.s3.markerPersisted)
  await B.shot('conv-rest-tabB-reload.png')

  // S4: A 切到另一个会话 → B 跟随
  const clickAt2 = await clickRow(A, OTHER)
  const follow2 = await waitFor(B, `(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(OTHER)}); if (!row) return null; return row.classList.contains('is-active') || null })()`, 4000, 60)
  await sleep(400)
  R.sync.s4 = {
    clickAt: clickAt2,
    followB: { ok: follow2.ok, ms: follow2.ms },
    A: await A.evaluate(SNAPSHOT), B: await B.evaluate(SNAPSHOT),
    bcB: await B.evaluate(`(() => (window.__bcLog || []).filter(x => x.data && x.data.type === 'active_session_changed').slice(-3))()`),
    framesB: B.frames.in.filter((f) => f.at >= clickAt2.at && (f.type === 'session_read' || f.type === 'session_unread')),
  }
  log('S4 follow=', follow2.ok, follow2.ms + 'ms', 'B active=', R.sync.s4.B.activeTitle)
  await B.shot('conv-rest-tabB-switched.png')

  // S5: 探针会话未读点重新出现（A 发消息造成的 agent 回复）后再点它，验证已读跨标签
  await clickRow(A, PROBE)
  await sleep(800)
  const dotAgain = await waitFor(B, `(() => { const rows = [...document.querySelectorAll('.session-row')]; const row = rows.find(r => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(PROBE)}); if (!row) return null; return { unread: !!row.querySelector('[data-unread="true"]'), active: row.classList.contains('is-active') } })()`, 3000, 100)
  R.sync.s5 = { dotAfterReturn: dotAgain.value, framesB: B.frames.in.filter((f) => f.type === 'session_read' || f.type === 'session_unread').slice(-8) }

  // 收尾：回到 main，恢复默认视图
  await clickRow(A, 'main')
  await sleep(600)
  R.sync.final = { A: await A.evaluate(SNAPSHOT), B: await B.evaluate(SNAPSHOT) }
  R.elapsedMs = Date.now() - t0
  R.layout.final1280 = await A.evaluate(LAYOUT)
  await A.shot('conv-rest-final.png')

  B.close()
  A.close()
  writeFileSync(`${OUT}/.conv-rest-result.json`, JSON.stringify(R, null, 2))
  log('DONE', JSON.stringify({ elapsedMs: R.elapsedMs, shots: R.shots }))
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FAILED', e && e.stack || e)
  try { writeFileSync(`${OUT}/.conv-rest-result.json`, JSON.stringify({ ...R, error: String(e && e.stack || e) }, null, 2)) } catch {}
  process.exit(1)
})

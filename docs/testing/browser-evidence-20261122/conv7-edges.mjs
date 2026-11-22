// conv7 边缘补测：整列 44 宽与上下边界是否都归到最近刻度
import { readFileSync, writeFileSync } from 'node:fs'
const OUT = 'E:/dsh_home/workspaces/agent/docs/testing/browser-evidence-20261122'
const PORT = 9223, APP = 'http://127.0.0.1:8787/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString(), ...a)
const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(created.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let seq = 0; const pending = new Map()
ws.addEventListener('message', (e) => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result) } })
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval error'); return r.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${APP}?conv7d=${Date.now()}` })
for (let i = 0; i < 120; i++) { const s = await evaluate(`document.querySelectorAll('.tl-bar').length`); if (s > 1) break; await sleep(500) }
await sleep(500)
await evaluate(`(() => { window.__ac007sv = []; if (!window.__ac007svPatched) { const orig = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (...a) { try { const msgs = [...document.querySelectorAll('.conversation-scroll .msg[data-message-id]')]; window.__ac007sv.push({ index: msgs.indexOf(this), id: this.getAttribute('data-message-id') ?? null }); } catch (e) {} return orig.apply(this, a); }; window.__ac007svPatched = true } })()`)
const geom = await evaluate(`(() => { const tl = document.querySelector('.timeline').getBoundingClientRect(); const bars = [...document.querySelectorAll('.tl-bar')]; return { tl: { x: tl.x, y: tl.y, w: tl.width, h: tl.height, right: tl.right, bottom: tl.bottom }, centers: bars.map((b) => { const r = b.getBoundingClientRect(); return +(r.top + r.height / 2).toFixed(2) }) } })()`)
const settle = async () => { let last = -1, k = 0; for (let i = 0; i < 60; i++) { await sleep(80); const t = await evaluate(`document.querySelector('.conversation-scroll').scrollTop`); if (Math.abs(t - last) < 0.5) k++; else k = 0; last = t; if (k >= 3) break } }
const midY = geom.centers[37]
const points = [
  { x: geom.tl.x + 1, y: midY, note: 'left-edge+1' },
  { x: geom.tl.x + 0.5, y: midY, note: 'left-edge+0.5' },
  { x: geom.tl.right - 1, y: midY, note: 'right-edge-1' },
  { x: geom.tl.right + 1, y: midY, note: 'outside-right+1' },
  { x: geom.tl.x + geom.tl.w / 2, y: geom.tl.y + 4, note: 'top-edge+4' },
  { x: geom.tl.x + geom.tl.w / 2, y: geom.tl.bottom - 4, note: 'bottom-edge-4' },
]
const out = []
for (const p of points) {
  const nearest = await evaluate(`(() => { const bars = [...document.querySelectorAll('.tl-bar')]; let best = -1, bestD = 1e9; bars.forEach((b, i) => { const r = b.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - ${p.y}); if (d < bestD) { bestD = d; best = i } }); return { index: best, distance: +bestD.toFixed(2) } })()`)
  const hit = await evaluate(`(() => { const el = document.elementFromPoint(${p.x}, ${p.y}); return { tag: el?.tagName ?? null, cls: typeof el?.className === 'string' ? el.className : null, inTimeline: Boolean(el?.closest?.('.timeline')) } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await sleep(20)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(20)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(60)
  const sv = await evaluate(`(() => { const a = window.__ac007sv.splice(0); return a.map((x) => ({ index: x.index, id: x.id })) })()`)
  await settle()
  const after = await evaluate(`(() => { const sc = document.querySelector('.conversation-scroll'); const msgs = [...sc.querySelectorAll('.msg[data-message-id]')]; const sr = sc.getBoundingClientRect(); const hit = msgs.find((m) => m.getBoundingClientRect().bottom > sr.top + 2); return { scrollTop: +sc.scrollTop.toFixed(2), topIndex: hit ? msgs.indexOf(hit) : -1, active: [...document.querySelectorAll('.tl-bar')].findIndex((b) => b.classList.contains('is-current')) } })()`)
  const rec = { ...p, nearest, hit, sv, svIndex: sv[0]?.index ?? -1, topIndex: after.topIndex, active: after.active, scrollTop: after.scrollTop, attributionOK: (sv[0]?.index ?? -1) === nearest.index }
  out.push(rec)
  log('edge', JSON.stringify({ note: p.note, x: +p.x.toFixed(1), y: +p.y.toFixed(1), near: nearest.index, sv: rec.svIndex, top: rec.topIndex, act: rec.active, hit: hit.cls, inTl: hit.inTimeline, ok: rec.attributionOK }))
}
const metrics = JSON.parse(readFileSync(`${OUT}/metrics-conv7.json`, 'utf8'))
metrics.edgeChecks = { checkedAt: new Date().toISOString(), geom, points: out }
writeFileSync(`${OUT}/metrics-conv7.json`, JSON.stringify(metrics, null, 2), 'utf8')
log('merged edgeChecks')
ws.close()

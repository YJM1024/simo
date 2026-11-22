// conv7 底部钳制复核：重复点击 68/72/74，看 active 与顶部是否稳定
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
await send('Page.navigate', { url: `${APP}?conv7e=${Date.now()}` })
for (let i = 0; i < 120; i++) { const s = await evaluate(`document.querySelectorAll('.tl-bar').length`); if (s > 1) break; await sleep(500) }
await sleep(500)
await evaluate(`(() => { window.__ac007sv = []; if (!window.__ac007svPatched) { const orig = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (...a) { try { const msgs = [...document.querySelectorAll('.conversation-scroll .msg[data-message-id]')]; window.__ac007sv.push({ index: msgs.indexOf(this), id: this.getAttribute('data-message-id') ?? null, at: performance.now() }); } catch (e) {} return orig.apply(this, a); }; window.__ac007svPatched = true } })()`)
const geom = await evaluate(`(() => { const tl = document.querySelector('.timeline').getBoundingClientRect(); const bars = [...document.querySelectorAll('.tl-bar')]; return { x: tl.x + tl.width / 2, centers: bars.map((b) => { const r = b.getBoundingClientRect(); return +(r.top + r.height / 2).toFixed(2) }) } })()`)
const settle = async () => { let last = -1, k = 0; for (let i = 0; i < 60; i++) { await sleep(80); const t = await evaluate(`document.querySelector('.conversation-scroll').scrollTop`); if (Math.abs(t - last) < 0.5) k++; else k = 0; last = t; if (k >= 3) break } }
const read = () => evaluate(`(() => { const sc = document.querySelector('.conversation-scroll'); const msgs = [...sc.querySelectorAll('.msg[data-message-id]')]; const sr = sc.getBoundingClientRect(); const top = msgs.find((m) => m.getBoundingClientRect().bottom > sr.top + 2); return { scrollTop: +sc.scrollTop.toFixed(2), max: sc.scrollHeight - sc.clientHeight, active: [...document.querySelectorAll('.tl-bar')].findIndex((b) => b.classList.contains('is-current')), top: top ? msgs.indexOf(top) : -1 } })()`)
const clickAt = async (y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geom.x, y }); await sleep(20)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.x, y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(20)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.x, y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(60)
  const sv = await evaluate(`window.__ac007sv.splice(0)`).catch(() => [])
  await settle()
  return { sv, state: await read() }
}
await clickAt(geom.centers[68]); await sleep(300)
const out = []
for (const idx of [68, 72, 74, 72, 72, 74]) {
  const r = await clickAt(geom.centers[idx])
  out.push({ idx, y: geom.centers[idx], sv: r.sv.map((x) => x.index), state: r.state })
  log('bottom', JSON.stringify({ idx, sv: r.sv.map((x) => x.index), st: r.state }))
}
const metrics = JSON.parse(readFileSync(`${OUT}/metrics-conv7.json`, 'utf8'))
metrics.bottomProbe = { checkedAt: new Date().toISOString(), maxTopAlign: 68, runs: out }
writeFileSync(`${OUT}/metrics-conv7.json`, JSON.stringify(metrics, null, 2), 'utf8')
log('merged bottomProbe')
ws.close()

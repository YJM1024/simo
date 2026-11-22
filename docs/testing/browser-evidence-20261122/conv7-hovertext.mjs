// conv7 第四项补测：tooltip 摘要 vs 点击落点消息正文
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
await send('Page.navigate', { url: `${APP}?conv7c=${Date.now()}` })
for (let i = 0; i < 120; i++) { const s = await evaluate(`document.querySelectorAll('.tl-bar').length`); if (s > 1) break; await sleep(500) }
await sleep(600)
const geom = await evaluate(`(() => { const tl = document.querySelector('.timeline').getBoundingClientRect(); const bars = [...document.querySelectorAll('.tl-bar')]; return { tl: { x: tl.x, w: tl.width }, centers: bars.map((b) => { const r = b.getBoundingClientRect(); return +(r.top + r.height / 2).toFixed(2) }) } })()`)
const x = geom.tl.x + geom.tl.w / 2
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const settle = async () => { let last = -1, k = 0; for (let i = 0; i < 60; i++) { await sleep(80); const t = await evaluate(`document.querySelector('.conversation-scroll').scrollTop`); if (Math.abs(t - last) < 0.5) k++; else k = 0; last = t; if (k >= 3) break } }
const out = []
for (const idx of [2, 37, 65]) {
  const y = geom.centers[idx]
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await sleep(50)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(450)
  const tip = await evaluate(`(() => { const t = document.getElementById('timeline-tip'); return t ? { state: t.getAttribute('data-state'), meta: document.querySelector('.timeline-tip-meta')?.innerText ?? '', summary: document.querySelector('.timeline-tip-summary')?.innerText ?? '' } : null })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(25)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(60)
  await settle()
  const after = await evaluate(`(() => {
    const sc = document.querySelector('.conversation-scroll');
    const msgs = [...sc.querySelectorAll('.msg[data-message-id]')];
    const bars = [...document.querySelectorAll('.tl-bar')];
    const active = bars.findIndex((b) => b.classList.contains('is-current'));
    const sr = sc.getBoundingClientRect();
    const hit = msgs.find((m) => m.getBoundingClientRect().bottom > sr.top + 2) ?? null;
    const text = (i) => { const m = msgs[i]; return m ? { id: m.getAttribute('data-message-id'), text: (m.querySelector('.msg-text')?.innerText ?? m.innerText ?? '').replace(/\\s+/g, ' ').trim() } : null };
    return { scrollTop: +sc.scrollTop.toFixed(2), active, topIndex: hit ? msgs.indexOf(hit) : -1, activeMsg: text(active), topMsg: hit ? text(msgs.indexOf(hit)) : null };
  })()`)
  const msg = after.activeMsg
  const sum = norm(tip?.summary)
  const body = norm(msg?.text)
  const head = (s) => s.slice(0, 20)
  const rec = {
    tick: idx, y, tip, tipTime: (tip?.meta.match(/(\d{2}:\d{2})/) ?? [])[1] ?? null,
    active: after.active, scrollTop: after.scrollTop, topIndex: after.topIndex,
    activeMessage: msg, topMessage: after.topMsg,
    summaryHead20: head(sum), bodyHead20: head(body),
    summaryInBody: sum.length > 0 && body.includes(sum.slice(0, 20)),
    bodyInSummary: body.length > 0 && sum.includes(body.slice(0, 20)),
  }
  out.push(rec)
  log('hovertext', JSON.stringify({ tick: idx, tipTime: rec.tipTime, active: rec.active, sv: rec.active, state: tip?.state, sum20: rec.summaryHead20, body20: rec.bodyHead20, inBody: rec.summaryInBody, inSum: rec.bodyInSummary, top: rec.topIndex }))
}
const cdpHtml = await (await fetch(APP)).text()
const asset = /<script[^>]+src="([^"]+)"/.exec(cdpHtml)?.[1] ?? null
const metrics = JSON.parse(readFileSync(`${OUT}/metrics-conv7.json`, 'utf8'))
metrics.hoverText = { checkedAt: new Date().toISOString(), asset, items: out }
writeFileSync(`${OUT}/metrics-conv7.json`, JSON.stringify(metrics, null, 2), 'utf8')
log('asset', asset)
log('merged hoverText into metrics-conv7.json')
ws.close()

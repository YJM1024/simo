// AC-CONV-007-02 补充取证：44×44 名义命中区内的归属网格 + 视觉条中心点击对照
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'E:/dsh_home/workspaces/agent/docs/testing/browser-evidence-20261122'
const PORT = 9223
const APP = 'http://127.0.0.1:8787/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(created.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let seq = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data)
  if (data.id && pending.has(data.id)) { const { res, rej } = pending.get(data.id); pending.delete(data.id); data.error ? rej(new Error(JSON.stringify(data.error))) : res(data.result) }
})
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
  return r.result?.value
}
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${APP}?ac007b=${Date.now()}` })
for (let i = 0; i < 120; i++) {
  const s = await evaluate(`({ r: document.readyState, b: document.querySelectorAll('.tl-bar').length, m: document.querySelectorAll('.conversation-scroll .msg').length })`)
  if (s.r === 'complete' && s.b > 1 && s.m > 1) break
  await sleep(500)
}
const index = 37
const grid = await evaluate(`(() => {
  const bars = [...document.querySelectorAll('.tl-bar')];
  const bar = bars[${index}];
  const b = bar.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const rows = [];
  let self = 0, other = 0, none = 0;
  for (let dy = -21; dy <= 21; dy += 7) {
    const row = [];
    for (let dx = -21; dx <= 21; dx += 7) {
      const el = document.elementFromPoint(cx + dx, cy + dy);
      const owner = el && el.closest ? el.closest('.tl-bar') : null;
      const oi = owner ? bars.indexOf(owner) : -1;
      const state = owner === bar ? 'self' : owner ? 'bar' : 'none';
      if (state === 'self') self++; else if (state === 'bar') other++; else none++;
      row.push({ dx, dy, ownerIndex: oi, state, tag: el?.tagName ?? null });
    }
    rows.push(row);
  }
  return { barIndex: ${index}, label: bar.getAttribute('aria-label'), cx, cy, rows, counts: { self, other, none, total: self + other + none } };
})()`)

const px = grid.cx, py = grid.cy
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1 })
await sleep(40)
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: 1 })
let last = -1, stable = 0
for (let i = 0; i < 40; i++) {
  await sleep(100)
  const t = await evaluate(`document.querySelector('.conversation-scroll').scrollTop`)
  if (Math.abs(t - last) < 0.5) stable++; else stable = 0
  last = t
  if (stable >= 4) break
}
const centerClick = await evaluate(`(() => {
  const sc = document.querySelector('.conversation-scroll');
  const bars = [...document.querySelectorAll('.tl-bar')];
  const msgs = [...sc.querySelectorAll('.msg[data-message-id]')];
  const scRect = sc.getBoundingClientRect();
  const hit = msgs.find((m) => m.getBoundingClientRect().bottom > scRect.top + 2) ?? null;
  return {
    activeIndex: bars.findIndex((b) => b.classList.contains('is-current')),
    activeLabel: bars.find((b) => b.classList.contains('is-current'))?.getAttribute('aria-label') ?? null,
    scrollTop: sc.scrollTop,
    topMessage: hit ? { id: hit.getAttribute('data-message-id'), indexInDom: msgs.indexOf(hit), top: hit.getBoundingClientRect().top - scRect.top } : null,
  };
})()`)

const metricsFile = join(OUT, 'metrics.json')
const metrics = JSON.parse(readFileSync(metricsFile, 'utf8'))
metrics.supplement = {
  at: now(),
  note: '44×44 名义命中区（±21px 网格，步长 7px）内 elementFromPoint 归属统计；中心点真实点击对照',
  grid,
  centerClick,
  centerClickDeviation: centerClick.activeIndex - index,
  gridRenderedAt: `${version.Browser}`,
}
writeFileSync(metricsFile, JSON.stringify(metrics, null, 2), 'utf8')
console.log(JSON.stringify({ counts: grid.counts, centerClick, deviation: centerClick.activeIndex - index }, null, 2))
ws.close()

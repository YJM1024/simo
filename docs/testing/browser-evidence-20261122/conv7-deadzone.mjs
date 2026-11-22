// conv7 死区定位：逐 2px 看 (timeline 中心 x, y) 上的元素栈
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const OUT = 'E:/dsh_home/workspaces/agent/docs/testing/browser-evidence-20261122'
const PORT = 9223
const APP = 'http://127.0.0.1:8787/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(created.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => { const d = JSON.parse(e.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result) } })
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result?.value }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${APP}?conv7d=${Date.now()}` })
for (let i = 0; i < 120; i++) { const s = await evaluate(`({r:document.readyState,b:document.querySelectorAll('.tl-bar').length,m:document.querySelectorAll('.conversation-scroll .msg').length})`); if (s.r === 'complete' && s.b > 1 && s.m > 1) break; await sleep(500) }

const diag = await evaluate(`(() => {
  const bars = [...document.querySelectorAll('.tl-bar')];
  const tl = document.querySelector('.timeline');
  const tr = tl.getBoundingClientRect();
  const x = tr.left + tr.width / 2;
  const out = [];
  for (let y = 650; y <= 760; y += 2) {
    const stack = document.elementsFromPoint(x, y).slice(0, 4).map((el) => ({ tag: el.tagName, cls: typeof el.className === 'string' ? el.className : null, id: el.id || null, pe: getComputedStyle(el).pointerEvents, z: getComputedStyle(el).zIndex, pos: getComputedStyle(el).position }));
    const near = bars.map((b) => { const r = b.getBoundingClientRect(); return { i: bars.indexOf(b), cy: +(r.top + r.height / 2).toFixed(2), d: +(Math.abs(r.top + r.height / 2 - y)).toFixed(2) }; }).sort((a, b) => a.d - b.d).slice(0, 2);
    out.push({ y, stack, nearest: near });
  }
  const tlStyle = getComputedStyle(tl);
  const tip = document.getElementById('timeline-tip');
  return {
    x, timeline: { top: tr.top, bottom: tr.bottom, left: tr.left, right: tr.right, overflowY: tlStyle.overflowY, pointerEvents: tlStyle.pointerEvents, zIndex: tlStyle.zIndex, position: tlStyle.position },
    tip: tip ? { pe: getComputedStyle(tip).pointerEvents, rect: (() => { const r = tip.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })() } : null,
    out,
  };
})()`)
const metricsFile = join(OUT, 'metrics-conv7.json')
const metrics = JSON.parse(readFileSync(metricsFile, 'utf8'))
metrics.deadZoneDiag = { at: new Date().toISOString(), ...diag }
writeFileSync(metricsFile, JSON.stringify(metrics, null, 2), 'utf8')
for (const row of diag.out) {
  const top = row.stack[0]
  console.log(row.y, '|', row.stack.map((s) => `${s.tag}.${s.cls ?? s.id ?? ''}(pe=${s.pe},z=${s.z},pos=${s.pos})`).join(' > '), '| nearest', row.nearest.map((n) => `${n.i}@${n.d}`).join(','))
}
console.log('timeline', JSON.stringify(diag.timeline), 'tip', JSON.stringify(diag.tip))
ws.close()

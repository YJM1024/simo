// AC-CONV-007-02 遮挡机制确认：命中点上的元素栈、轨道/刻度盒、以及哪些 bar 的 ::after 几何上覆盖该点
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const OUT = 'E:/dsh_home/workspaces/agent/docs/testing/browser-evidence-20261122'
const PORT = 9223
const APP = 'http://127.0.0.1:8787/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
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
await send('Page.navigate', { url: `${APP}?ac007c=${Date.now()}` })
for (let i = 0; i < 120; i++) { const s = await evaluate(`({r:document.readyState,b:document.querySelectorAll('.tl-bar').length,m:document.querySelectorAll('.conversation-scroll .msg').length})`); if (s.r === 'complete' && s.b > 1 && s.m > 1) break; await sleep(500) }
const index = 37
const diag = await evaluate(`(() => {
  const bars = [...document.querySelectorAll('.tl-bar')];
  const bar = bars[${index}];
  const b = bar.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const geom = bars.map((other, i) => { const r = other.getBoundingClientRect(); return { i, top: r.top + r.height / 2 - 22, bottom: r.top + r.height / 2 + 22, left: r.left + r.width / 2 - 24, right: r.left + r.width / 2 + 24 }; });
  const at = (dx, dy) => {
    const x = cx + dx, y = cy + dy;
    const stack = document.elementsFromPoint(x, y).slice(0, 5).map((el) => ({ tag: el.tagName, cls: typeof el.className === 'string' ? el.className : null, id: el.id || null, ownerIndex: el.closest ? (() => { const o = el.closest('.tl-bar'); return o ? bars.indexOf(o) : -1 })() : -1 }));
    const covers = geom.filter((g) => x >= g.left && x <= g.right && y >= g.top && y <= g.bottom).map((g) => g.i);
    return { dx, dy, x, y, stack, covers, topOwner: stack[0]?.ownerIndex ?? -1 };
  };
  const track = document.querySelector('.tlg-track') ?? document.querySelector('.tl-track');
  const session = document.querySelector('.tlg-session');
  const trect = track.getBoundingClientRect(), srect = session?.getBoundingClientRect();
  const afterGeom = (() => { const a = document.querySelector('.timeline'); return { timeline: { left: a.getBoundingClientRect().left, right: a.getBoundingClientRect().right } } })();
  return {
    barIndex: ${index}, bar: { x: b.x, y: b.y, w: b.width, h: b.height, cx, cy },
    track: { x: trect.x, y: trect.y, w: trect.width, h: trect.height },
    session: srect ? { x: srect.x, y: srect.y, w: srect.width, h: srect.height } : null,
    timeline: afterGeom.timeline,
    probes: [at(0, -21), at(-14, -21), at(14, -21), at(0, -18), at(0, -6), at(-14, 0), at(14, 0), at(0, 18), at(20, 18), at(0, 21), at(14, 21)],
  };
})()`)
const metricsFile = join(OUT, 'metrics.json')
const metrics = JSON.parse(readFileSync(metricsFile, 'utf8'))
metrics.occlusion = { at: new Date().toISOString(), browser: version.Browser, ...diag }
writeFileSync(metricsFile, JSON.stringify(metrics, null, 2), 'utf8')
console.log(JSON.stringify(diag, null, 1).slice(0, 6000))
ws.close()

// AC-CONV-007-02 conv7 复测：整列命中（clientY 最近刻度）后的点击归属、无死区、tooltip 一致性
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'E:/dsh_home/workspaces/agent/docs/testing/browser-evidence-20261122'
const PORT = 9223
const APP = 'http://127.0.0.1:8787/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowIso = () => new Date().toISOString()
const log = (...a) => console.log(`[${nowIso()}]`, ...a)

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
const health = await (await fetch('http://127.0.0.1:8787/api/health')).json().catch((e) => ({ error: String(e) }))
let buildId = null
try {
  const html = await (await fetch(APP)).text()
  buildId = /buildId["'\s:=]+([\w.-]+)/.exec(html)?.[1] ?? null
} catch { /* ignore */ }

const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(created.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data)
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result) }
})
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
  return r.result?.value
}
const shot = async (name, clip, scale = 2) => {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale }, captureBeyondViewport: true })
  const file = join(OUT, name)
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  log('screenshot', file)
  return file
}
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${APP}?conv7=${Date.now()}` })
for (let i = 0; i < 120; i++) {
  const s = await evaluate(`({ r: document.readyState, b: document.querySelectorAll('.tl-bar').length, m: document.querySelectorAll('.conversation-scroll .msg').length })`)
  if (s.r === 'complete' && s.b > 1 && s.m > 1) break
  await sleep(500)
}

const state = await evaluate(`(() => {
  const bars = [...document.querySelectorAll('.tl-bar')];
  const sc = document.querySelector('.conversation-scroll');
  const tl = document.querySelector('.timeline');
  const tr = tl.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  const centers = bars.map((b) => { const r = b.getBoundingClientRect(); return { i: bars.indexOf(b), top: r.top, cy: r.top + r.height / 2, w: r.width, h: r.height, label: b.getAttribute('aria-label') } });
  const msgs = [...sc.querySelectorAll('.msg[data-message-id]')];
  const offsets = msgs.map((m) => ({ id: m.getAttribute('data-message-id'), offset: m.getBoundingClientRect().top - sr.top + sc.scrollTop }));
  const maxScroll = sc.scrollHeight - sc.clientHeight;
  let maxTopAlign = -1;
  for (let i = 0; i < offsets.length; i++) if (offsets[i].offset <= maxScroll - 1) maxTopAlign = i;
  return {
    bars: bars.length, msgs: msgs.length, groups: document.querySelectorAll('.tlg-session').length,
    pointer: { fine: matchMedia('(pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches },
    timeline: { x: tr.x, y: tr.y, w: tr.width, h: tr.height, top: tr.top, bottom: tr.bottom, left: tr.left, right: tr.right },
    scroller: { top: sr.top, bottom: sr.bottom, scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, maxScroll },
    centers, offsets, maxTopAlign,
    cursor: getComputedStyle(tl).cursor,
    barPointerEvents: getComputedStyle(bars[0]).pointerEvents,
    barState: { className: bars[0].className, ariaCurrent: bars[0].getAttribute('aria-current') },
  };
})()`)
log('state', JSON.stringify({ bars: state.bars, msgs: state.msgs, timeline: state.timeline, maxTopAlign: state.maxTopAlign, barPE: state.barPointerEvents }))

const metrics = {
  generatedAt: nowIso(),
  url: APP,
  buildId, health,
  browser: version.Browser,
  cdp: `127.0.0.1:${PORT}`,
  viewport: state.timeline && { w: 1600, h: 1000 },
  pointer: state.pointer,
  page: {
    bars: state.bars, msgs: state.msgs, groups: state.groups,
    timeline: state.timeline, scroller: state.scroller,
    cursor: state.cursor, barPointerEvents: state.barPointerEvents, barState: state.barState,
    maxTopAlignIndex: state.maxTopAlign,
  },
  centers: state.centers,
  clicks: [],
  scan: [],
  hoverChecks: [],
}

const READ = `(() => {
  const sc = document.querySelector('.conversation-scroll');
  const bars = [...document.querySelectorAll('.tl-bar')];
  const msgs = [...sc.querySelectorAll('.msg[data-message-id]')];
  const sr = sc.getBoundingClientRect();
  const hit = msgs.find((m) => m.getBoundingClientRect().bottom > sr.top + 2) ?? null;
  return {
    scrollTop: sc.scrollTop,
    activeIndex: bars.findIndex((b) => b.classList.contains('is-current')),
    activeLabel: bars.find((b) => b.classList.contains('is-current'))?.getAttribute('aria-label') ?? null,
    topMessage: hit ? { id: hit.getAttribute('data-message-id'), indexInDom: msgs.indexOf(hit), top: +(hit.getBoundingClientRect().top - sr.top).toFixed(2) } : null,
  };
})()`

const nearestAt = (y) => evaluate(`(() => {
  const bars = [...document.querySelectorAll('.tl-bar')];
  let best = -1, bestD = 1e9;
  bars.forEach((b, i) => { const r = b.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - ${y}); if (d < bestD) { bestD = d; best = i } });
  return { index: best, distance: bestD };
})()`)

const settle = async () => {
  let last = -1, stable = 0
  for (let i = 0; i < 60; i++) {
    await sleep(80)
    const t = await evaluate(`document.querySelector('.conversation-scroll').scrollTop`)
    if (Math.abs(t - last) < 0.5) stable++; else stable = 0
    last = t
    if (stable >= 3) break
  }
}

const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await sleep(30)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(30)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(80)
  await settle()
  return evaluate(READ)
}

const hitInfo = (x, y) => evaluate(`(() => {
  const el = document.elementFromPoint(${x}, ${y});
  const tl = el?.closest?.('.timeline');
  return { tag: el?.tagName ?? null, cls: typeof el?.className === 'string' ? el.className : null, inTimeline: Boolean(tl) };
})()`)

// 3 个位置：靠上 2、中间 37、靠下取可顶对齐的最大下标（末几条会被滚动边界钳制）
const topIndex = 2
const midIndex = 37
const bottomIndex = Math.max(60, state.maxTopAlign)
const picks = [topIndex, midIndex, bottomIndex].map((i) => ({ index: i, ...state.centers[i] }))
metrics.picks = picks
log('picks', JSON.stringify(picks.map((p) => ({ i: p.index, cy: p.cy, label: p.label }))))

const offsets = [[0, 0], [16, 0], [-16, 0], [0, 18], [0, -18], [20, 18]]
for (const pick of picks) {
  const cx = pick.left !== undefined ? pick.left : (state.timeline.x + state.timeline.w / 2)
  const x = state.timeline.x + state.timeline.w / 2
  for (const [dx, dy] of offsets) {
    const px = x + dx, py = pick.cy + dy
    const expected = await nearestAt(py)
    const hit = await hitInfo(px, py)
    const before = await evaluate(READ)
    const after = await click(px, py)
    const rec = {
      pick: pick.index, tickLabel: pick.label, tickCy: pick.cy, dx, dy, x: px, y: py,
      expectedIndex: expected.index, expectedDistance: expected.distance, hit,
      beforeScrollTop: before.scrollTop, scrollTop: after.scrollTop,
      activeIndex: after.activeIndex, activeLabel: after.activeLabel, topMessage: after.topMessage,
      activeDeviation: after.activeIndex - expected.index,
      topDeviation: after.topMessage ? after.topMessage.indexInDom - expected.index : null,
    }
    metrics.clicks.push(rec)
    log('click', JSON.stringify({ pick: pick.index, d: [dx, dy], exp: expected.index, act: after.activeIndex, top: after.topMessage?.indexInDom, st: [before.scrollTop, after.scrollTop] }))
  }
}

// 20 个 y 点扫描：首刻度上方、刻度中心、相邻中点、中点后 1px、末刻度下方
const c = state.centers
const yPoints = []
yPoints.push({ y: c[0].cy - 40, note: 'above-first-40' })
yPoints.push({ y: c[0].cy - 12, note: 'above-first-12' })
for (const i of [2, 10, 20, 30, 37, 50, 60, 66]) {
  yPoints.push({ y: (c[i].cy + c[i + 1].cy) / 2, note: `mid-${i}-${i + 1}` })
}
for (const i of [5, 25, 45, 60, 68, 72]) yPoints.push({ y: c[i].cy, note: `center-${i}` })
yPoints.push({ y: (c[37].cy + c[38].cy) / 2 + 0.6, note: 'mid-37-38+0.6' })
yPoints.push({ y: c[c.length - 1].cy + 12, note: 'below-last-12' })
yPoints.push({ y: Math.min(state.timeline.bottom - 3, c[c.length - 1].cy + 30), note: 'below-last-30' })
metrics.scanPlan = yPoints
const scanX = state.timeline.x + state.timeline.w / 2
for (const p of yPoints) {
  const expected = await nearestAt(p.y)
  const before = await evaluate(READ)
  const after = await click(scanX, p.y)
  const rec = {
    y: +p.y.toFixed(2), note: p.note, x: scanX, expectedIndex: expected.index, expectedDistance: +expected.distance.toFixed(2),
    neighborOfExpected: after.activeIndex === expected.index ? 0 : after.activeIndex - expected.index,
    beforeScrollTop: before.scrollTop, scrollTop: after.scrollTop,
    activeIndex: after.activeIndex, activeLabel: after.activeLabel, topMessage: after.topMessage,
    dead: after.activeIndex === before.activeIndex && Math.abs(after.scrollTop - before.scrollTop) < 1 && after.activeIndex !== expected.index,
  }
  metrics.scan.push(rec)
  log('scan', JSON.stringify({ y: rec.y, note: rec.note, exp: expected.index, act: after.activeIndex, dev: rec.neighborOfExpected, dead: rec.dead }))
}

// tooltip 一致性：hover 三个刻度 + 两个中点，再点同点，比较 tooltip 文本与 activeIndex 对应刻度
const hoverAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
  await sleep(60)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await sleep(420)
  return evaluate(`(() => {
    const t = document.getElementById('timeline-tip');
    const b = t ? t.getBoundingClientRect() : null;
    return { exists: Boolean(t), state: t?.getAttribute('data-state') ?? null, text: t?.textContent?.trim().replace(/\\s+/g, ' ') ?? null, rect: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null };
  })()`)
}
const hx = state.timeline.x + state.timeline.w / 2
const hoverPoints = [
  { y: c[topIndex].cy, note: 'top-center', expect: topIndex },
  { y: c[midIndex].cy, note: 'mid-center', expect: midIndex },
  { y: (c[midIndex].cy + c[midIndex + 1].cy) / 2, note: 'mid-37-38-tie', expect: midIndex },
  { y: (c[midIndex].cy + c[midIndex + 1].cy) / 2 + 0.6, note: 'mid-37-38+0.6', expect: midIndex + 1 },
  { y: c[bottomIndex].cy, note: 'bottom-center', expect: bottomIndex },
]
for (const h of hoverPoints) {
  const tip = await hoverAt(hx, h.y)
  const expectedBar = state.centers[Math.min(h.expect, state.centers.length - 1)]
  const timeMatch = tip.text ? (expectedBar.label.split('·').pop().trim()) : null
  const after = await click(hx, h.y)
  const rec = { ...h, expectedBar: expectedBar.label, expectedIndex: h.expect, tip, tipTime: tip.text?.match(/(\d{2}:\d{2})/)?.[1] ?? null, expectedTime: timeMatch, timeConsistent: tip.text ? tip.text.includes(timeMatch) : false, activeIndex: after.activeIndex, activeLabel: after.activeLabel, topMessage: after.topMessage, clickConsistent: after.activeIndex === h.expect }
  metrics.hoverChecks.push(rec)
  log('hover', JSON.stringify({ note: h.note, exp: h.expect, tipTime: rec.tipTime, expectedTime: rec.expectedTime, act: after.activeIndex, timeOK: rec.timeConsistent, clickOK: rec.clickConsistent }))
}

// 截图：hover 态 + 偏移点击后中栏
const midY = c[midIndex].cy
const tip = await hoverAt(hx, midY)
metrics.hoverShotTip = tip
{
  const tl = state.timeline
  const tr = tip.rect ?? { x: tl.right, y: tl.top, w: 0, h: 0 }
  const left = Math.max(0, Math.min(tl.left - 12, tr.x - 12))
  const right = Math.min(1600, Math.max(tl.right + 12, tr.x + tr.w + 12))
  const top = Math.max(0, Math.min(tl.top, tr.y) - 24)
  const bottom = Math.min(1000, Math.max(tl.bottom, tr.y + tr.h) + 24)
  metrics.screenshots = { hover: await shot('conv7-01-timeline-hover-1600.png', { x: left, y: top, width: right - left, height: bottom - top }, 2) }
}
await click(hx + 20, midY + 18)
{
  const panel = await evaluate(`(() => { const p = document.querySelector('.conversation-panel').getBoundingClientRect(); return { x: p.x, y: p.y, w: p.width, h: p.height } })()`)
  metrics.screenshots.afterClick = await shot('conv7-02-after-click-1600.png', { x: Math.max(0, panel.x), y: Math.max(0, panel.y), width: Math.min(1600 - panel.x, panel.w), height: Math.min(1000 - panel.y, panel.h) }, 1.5)
}
metrics.finishedAt = nowIso()
writeFileSync(join(OUT, 'metrics-conv7.json'), JSON.stringify(metrics, null, 2), 'utf8')
log('written', join(OUT, 'metrics-conv7.json'))
ws.close()

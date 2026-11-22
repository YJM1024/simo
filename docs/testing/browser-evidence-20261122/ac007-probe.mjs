// AC-CONV-007-02 真机取证：时间轴命中区测量 + 点击跳转核对
// 只读页面 + CDP，不改源码、不重启服务。
// 用法：node ac007-probe.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'E:/dsh_home/workspaces/agent/docs/testing/browser-evidence-20261122'
const PORT = 9223
const APP = 'http://127.0.0.1:8787/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()
const log = (...a) => console.log(`[${now()}]`, ...a)

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
log('browser', version.Browser)

const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(created.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let seq = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data)
  if (data.id && pending.has(data.id)) {
    const { res, rej } = pending.get(data.id)
    pending.delete(data.id)
    data.error ? rej(new Error(JSON.stringify(data.error))) : res(data.result)
  }
})
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq
  pending.set(id, { res, rej })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
  return r.result?.value
}
const shot = async (name, clip, scale = 2) => {
  const params = { format: 'png' }
  if (clip) params.clip = { ...clip, scale }
  if (clip) params.captureBeyondViewport = true
  const r = await send('Page.captureScreenshot', params)
  const file = join(OUT, name)
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  log('screenshot', file)
  return file
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${APP}?ac007=${Date.now()}` })

const ready = async () => evaluate(`(() => ({
  state: document.readyState,
  bars: document.querySelectorAll('.tl-bar').length,
  msgs: document.querySelectorAll('.conversation-scroll .msg[data-message-id]').length,
  title: document.querySelector('.chat-tabs')?.textContent?.trim().slice(0, 40) ?? '',
  loading: Boolean(document.querySelector('.conversation-panel .loading, .conversation-panel [class*=skeleton]')),
}))()`)
let state
for (let i = 0; i < 120; i++) {
  state = await ready()
  if (state.state === 'complete' && state.bars > 1 && state.msgs > 1) break
  await sleep(500)
}
log('ready', JSON.stringify(state))
const probe = {
  generatedAt: now(),
  url: APP,
  browser: version.Browser,
  cdp: `127.0.0.1:${PORT}`,
  ready: state,
  viewport: await evaluate(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight })`),
  pointer: await evaluate(`({ fine: matchMedia('(pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches, anyFine: matchMedia('(any-pointer: fine)').matches })`),
  page: await evaluate(`(() => {
    const tl = document.querySelector('.timeline');
    const sc = document.querySelector('.conversation-scroll');
    const r = (el) => el ? (() => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom } })() : null;
    const cs = tl ? getComputedStyle(tl) : null;
    return {
      timeline: r(tl), timelineCss: cs ? { width: cs.width, overflowX: cs.overflowX, overflowY: cs.overflowY, isolation: cs.isolation, position: cs.position, zIndex: cs.zIndex } : null,
      scroller: sc ? { ...r(sc), scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight } : null,
      barCount: document.querySelectorAll('.tl-bar').length,
      msgCount: document.querySelectorAll('.conversation-scroll .msg[data-message-id]').length,
      track: r(document.querySelector('.tl-track')),
      groups: document.querySelectorAll('.tlg-session').length,
    };
  })()`),
}

const probeBar = (index) => evaluate(`(() => {
  const bars = [...document.querySelectorAll('.tl-bar')];
  const bar = bars[${index}];
  const b = bar.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const cs = getComputedStyle(bar, '::after');
  const barsEls = bars;
  const hit = (x, y) => {
    const els = document.elementsFromPoint(x, y).slice(0, 6).map((el) => {
      const owner = el.closest ? el.closest('.tl-bar') : null;
      return { tag: el.tagName, cls: typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? null), ownerIndex: owner ? barsEls.indexOf(owner) : -1 };
    });
    const top = document.elementFromPoint(x, y);
    const owner = top && top.closest ? top.closest('.tl-bar') : null;
    return {
      x: +x.toFixed(2), y: +y.toFixed(2),
      tag: top ? top.tagName : null,
      cls: top ? (typeof top.className === 'string' ? top.className : null) : null,
      isSelf: top === bar,
      inSelf: Boolean(bar.contains(top)),
      ownerIndex: owner ? barsEls.indexOf(owner) : -1,
      ownerLabel: owner ? owner.getAttribute('aria-label') : null,
      stack: els,
    };
  };
  const corners = [[-24, -22], [24, -22], [-24, 22], [24, 22]].map(([dx, dy]) => ({ dx, dy, ...hit(cx + dx, cy + dy) }));
  const inner44 = [[-21, -21], [21, -21], [-21, 21], [21, 21]].map(([dx, dy]) => ({ dx, dy, ...hit(cx + dx, cy + dy) }));
  const center = hit(cx, cy);
  // 沿中心横/纵轴逐 0.5px 找“仍归属于本 bar”的连续区间
  const extent = (axis) => {
    const step = 0.5;
    let neg = 0, pos = 0;
    for (let d = step; d <= 80; d += step) {
      const px = axis === 'x' ? cx - d : cx, py = axis === 'x' ? cy : cy - d;
      const t = document.elementFromPoint(px, py);
      if (t === bar || bar.contains(t)) neg = d; else break;
    }
    for (let d = step; d <= 80; d += step) {
      const px = axis === 'x' ? cx + d : cx, py = axis === 'x' ? cy : cy + d;
      const t = document.elementFromPoint(px, py);
      if (t === bar || bar.contains(t)) pos = d; else break;
    }
    return { neg, pos, total: neg + pos };
  };
  const ex = extent('x'), ey = extent('y');
  return {
    index: ${index},
    label: bar.getAttribute('aria-label'),
    role: bar.className,
    rect: { x: b.x, y: b.y, w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom, cx, cy },
    after: { w: cs.width, h: cs.height, left: cs.left, top: cs.top, zIndex: cs.zIndex, content: cs.content },
    timeline: (() => { const t = bar.closest('.timeline').getBoundingClientRect(); return { x: t.x, w: t.width, left: t.left, right: t.right, top: t.top, bottom: t.bottom } })(),
    center,
    corners,
    inner44,
    selfExtent: { x: ex, y: ey },
  };
})()`)

probe.bars = []
for (const index of [1, Math.floor(probe.ready.bars / 2), probe.ready.bars - 2]) {
  const m = await probeBar(index)
  probe.bars.push(m)
  log('bar', index, JSON.stringify({ label: m.label, rect: m.rect, after: m.after, corners: m.corners.map((c) => `${c.dx},${c.dy}=>${c.ownerIndex}${c.isSelf ? '(self)' : ''}`), extent: m.selfExtent }))
}

// 悬停中间那条，等 tooltip 出现，截特写
const mid = probe.bars[1]
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 })
await sleep(80)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.rect.cx, y: mid.rect.cy })
await sleep(450)
probe.hover = await evaluate(`(() => {
  const tip = document.getElementById('timeline-tip');
  const b = tip ? tip.getBoundingClientRect() : null;
  return { exists: Boolean(tip), state: tip?.getAttribute('data-state') ?? null, rect: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null, text: tip?.textContent?.trim() ?? null };
})()`)
log('hover tip', JSON.stringify(probe.hover))
{
  const tl = probe.page.timeline
  const tipR = probe.hover.exists ? probe.hover.rect : { x: tl.right, y: tl.top, w: 0, h: 0 }
  const left = Math.max(0, Math.min(tl.left - 12, tipR.x - 12))
  const right = Math.min(1600, Math.max(tl.right + 12, tipR.x + tipR.w + 12))
  const top = Math.max(0, Math.min(tl.top, tipR.y) - 24)
  const bottom = Math.min(1000, Math.max(tl.bottom, tipR.y + tipR.h) + 24)
  probe.screenshots = {
    timelineHover: await shot('ac007-01-timeline-hover-1600.png', { x: left, y: top, width: right - left, height: bottom - top }, 2),
  }
}

// 点击中间条的右下偏移点（+20, +18）
const px = mid.rect.cx + 20, py = mid.rect.cy + 18
probe.click = { barIndex: mid.index, barLabel: mid.label, point: { x: px, y: py } }
probe.click.preHit = await evaluate(`(() => {
  const bars = [...document.querySelectorAll('.tl-bar')];
  const el = document.elementFromPoint(${px}, ${py});
  const owner = el?.closest('.tl-bar') ?? null;
  return { tag: el?.tagName ?? null, cls: typeof el?.className === 'string' ? el.className : null, ownerIndex: owner ? bars.indexOf(owner) : -1, ownerLabel: owner?.getAttribute('aria-label') ?? null };
})()`)
probe.click.before = await evaluate(`(() => {
  const sc = document.querySelector('.conversation-scroll');
  const bars = [...document.querySelectorAll('.tl-bar')];
  return { scrollTop: sc.scrollTop, activeIndex: bars.findIndex((b) => b.classList.contains('is-current')) };
})()`)
await evaluate(`(() => {
  window.__ac007 = [];
  const bars = [...document.querySelectorAll('.tl-bar')];
  document.addEventListener('pointerdown', (e) => {
    const owner = e.target instanceof Element ? e.target.closest('.tl-bar') : null;
    window.__ac007.push({ type: 'pointerdown', ownerIndex: owner ? bars.indexOf(owner) : -1, ownerLabel: owner?.getAttribute('aria-label') ?? null, tag: e.target?.tagName ?? null });
  }, true);
  document.addEventListener('click', (e) => {
    const owner = e.target instanceof Element ? e.target.closest('.tl-bar') : null;
    if (owner) window.__ac007.push({ type: 'click', ownerIndex: bars.indexOf(owner), ownerLabel: owner.getAttribute('aria-label'), tag: e.target.tagName });
  }, true);
})()`)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1 })
await sleep(40)
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: 1 })
// 等平滑滚动停稳
let last = -1, stable = 0
for (let i = 0; i < 40; i++) {
  await sleep(100)
  const top = await evaluate(`document.querySelector('.conversation-scroll').scrollTop`)
  if (Math.abs(top - last) < 0.5) stable++; else stable = 0
  last = top
  if (stable >= 4) break
}
probe.click.events = await evaluate(`window.__ac007`)
probe.click.after = await evaluate(`(() => {
  const sc = document.querySelector('.conversation-scroll');
  const bars = [...document.querySelectorAll('.tl-bar')];
  const msgs = [...sc.querySelectorAll('.msg[data-message-id]')];
  const scRect = sc.getBoundingClientRect();
  const hit = msgs.find((m) => m.getBoundingClientRect().bottom > scRect.top + 2) ?? null;
  return {
    scrollTop: sc.scrollTop,
    activeIndex: bars.findIndex((b) => b.classList.contains('is-current')),
    activeLabel: bars.find((b) => b.classList.contains('is-current'))?.getAttribute('aria-label') ?? null,
    topMessage: hit ? {
      id: hit.getAttribute('data-message-id'),
      indexInDom: msgs.indexOf(hit),
      text: (hit.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
      top: hit.getBoundingClientRect().top - scRect.top,
    } : null,
  };
})()`)
probe.click.midTooltip = probe.hover
probe.click.deviation = probe.click.after.activeIndex - mid.index
log('click', JSON.stringify({ preHit: probe.click.preHit, before: probe.click.before, events: probe.click.events, after: probe.click.after, deviation: probe.click.deviation }))

// 点击后中栏
{
  const panel = await evaluate(`(() => { const p = document.querySelector('.conversation-panel').getBoundingClientRect(); return { x: p.x, y: p.y, w: p.width, h: p.height } })()`)
  probe.screenshots.afterClick = await shot('ac007-02-after-click-1600.png', { x: Math.max(0, panel.x), y: Math.max(0, panel.y), width: Math.min(1600 - panel.x, panel.w), height: Math.min(1000 - panel.y, panel.h) }, 1.5)
}

// 全页 1280
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
await sleep(900)
probe.at1280 = await evaluate(`(() => {
  const tl = document.querySelector('.timeline'); const b = tl.getBoundingClientRect();
  const bars = [...document.querySelectorAll('.tl-bar')];
  const mid = bars[Math.floor(bars.length / 2)]; const r = mid.getBoundingClientRect();
  const cs = getComputedStyle(mid, '::after');
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = (x, y) => { const el = document.elementFromPoint(x, y); const o = el?.closest('.tl-bar'); return { tag: el?.tagName ?? null, ownerIndex: o ? bars.indexOf(o) : -1, isSelf: el === mid }; };
  return { viewport: { w: innerWidth, h: innerHeight }, timeline: { x: b.x, w: b.width }, bar: { w: r.width, h: r.height }, after: { w: cs.width, h: cs.height }, corners: [[-24, -22], [24, -22], [-24, 22], [24, 22]].map(([dx, dy]) => ({ dx, dy, ...hit(cx + dx, cy + dy) })) };
})()`)
probe.screenshots.fullpage1280 = await shot('ac007-03-fullpage-1280.png', { x: 0, y: 0, width: 1280, height: 1000 }, 1)
probe.finishedAt = now()
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(probe, null, 2), 'utf8')
log('metrics written', join(OUT, 'metrics.json'))
ws.close()

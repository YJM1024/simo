// CDP 截图 + 触控命中区实测（复用 frontend/scripts/capture-visual.mjs 的方式，不改仓库已有截图）
// 用法：node docs/testing/capture-snapshot.mjs <before|after> [url] [port]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const label = process.argv[2] ?? 'before'
const url = process.argv[3] ?? 'http://127.0.0.1:8898/'
const port = Number(process.argv[4] ?? 9335)
const out = join(repo, 'docs', 'testing')
const capturedAt = new Date()
const stamp = `${capturedAt.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}Z`
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!existsSync(chromePath)) { console.error('Chrome not found'); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let chrome = null
const reachable = async () => { try { await fetch(`http://127.0.0.1:${port}/json/version`); return true } catch { return false } }
if (!(await reachable())) {
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${join(here, '.chrome-capture')}`, 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 50; i++) { if (await reachable()) break; await sleep(200) }
}
if (!(await reachable())) { console.error(`CDP ${port} not reachable`); process.exit(3) }
try {
  // 新建独立标签页，避免占用用户已有标签
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const target = created
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res) => ws.addEventListener('open', res, { once: true }))
  let id = 0
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id
    const on = (event) => { const data = JSON.parse(event.data); if (data.id === mid) { ws.removeEventListener('message', on); res(data) } }
    ws.addEventListener('message', on)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
    return r.result?.result?.value
  }
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(out, `${stamp}-${label}-${name}.png`)
    writeFileSync(file, Buffer.from(r.result.data, 'base64'))
    console.log('shot', file)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })

  const metrics = {}
  for (const width of [1600, 1280]) {
    const height = 1000
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false })
    await send('Page.navigate', { url: `${url}?capture=${Date.now()}` })
    await sleep(2600)
    await shot(`app-${width}`)
    metrics[width] = await evaluate(`(() => {
      const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null }
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }
      return {
        bodyFontSize: cs('body', 'fontSize'),
        bodyBg: cs('body', 'backgroundColor'),
        chatBodyBg: cs('.chat-body', 'backgroundColor'),
        appTitle: document.title,
        counts: { msg: document.querySelectorAll('.msg').length, tlBar: document.querySelectorAll('.tl-bar').length, session: document.querySelectorAll('.session-row').length },
      }
    })()`)
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 2, mobile: false })
  const galleryUrl = `${url.replace(/#.*$/, '')}?capture=${Date.now()}#gallery`
  await send('Page.navigate', { url: galleryUrl })
  await sleep(1800)
  await shot('gallery-1280')

  // 触控命中区：touch 模拟下测量每个目标的可点击外接尺寸
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: `${url}?hit=${Date.now()}` })
  await sleep(2600)
  const selectors = ['.tl-bar', '.session-row', '.session-more', '.msg-copy', '.composer-hint-icon', '.send', '.exec-row', '.insp-rail button']
  const hit = await evaluate(`(() => {
    const sels = ${JSON.stringify(selectors)};
    const out = {};
    for (const sel of sels) {
      const el = [...document.querySelectorAll(sel)].find((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 });
      if (!el) { out[sel] = null; continue }
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const owns = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)) };
      if (!owns(cx, cy)) { out[sel] = { rect: { w: +b.width.toFixed(1), h: +b.height.toFixed(1) }, hit: null, note: 'center not hit-testable (pointer-events/overlay)' }; continue }
      let left = cx, right = cx, top = cy, bottom = cy;
      while (left > 0 && owns(left - 1, cy)) left--
      while (right < innerWidth - 1 && owns(right + 1, cy)) right++
      while (top > 0 && owns(cx, top - 1)) top--
      while (bottom < innerHeight - 1 && owns(cx, bottom + 1)) bottom++
      out[sel] = { rect: { w: +b.width.toFixed(1), h: +b.height.toFixed(1) }, hit: { w: +(right - left + 1).toFixed(1), h: +(bottom - top + 1).toFixed(1) } };
    }
    return { coarse: matchMedia('(pointer: coarse)').matches, touch: navigator.maxTouchPoints, targets: out };
  })()`)
  metrics.hit = hit
  metrics.stamp = stamp
metrics.capturedAt = capturedAt.toISOString()
metrics.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  writeFileSync(join(out, `${stamp}-${label}-metrics.json`), JSON.stringify(metrics, null, 2))
  console.log(JSON.stringify({ stamp, label, metrics }, null, 2))
  ws.close()
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {})
} finally {
  if (chrome) chrome.kill()
}

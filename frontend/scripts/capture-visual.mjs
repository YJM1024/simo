#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'review', 'regression', 'current')
const url = process.env.VISUAL_URL ?? 'http://127.0.0.1:8898/'
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!existsSync(chromePath)) { console.error('capture:visual: Chrome not found; set CHROME_PATH'); process.exit(2) }
mkdirSync(out, { recursive: true })
const port = Number(process.env.VISUAL_CDP_PORT ?? 9334)
const chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${port}`,`--user-data-dir=${join(root,'.tmp','visual-capture-chrome')}`,'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i=0;i<40;i++){ try { await fetch(`http://127.0.0.1:${port}/json/version`); break } catch { await sleep(200) } }
for (const [width, height] of [[1600,1000],[1280,1000],[1180,1000],[375,812]]) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
  let id = 0
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; const on = (event) => { const data = JSON.parse(event.data); if (data.id === mid) { ws.removeEventListener('message', on); resolve(data) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: mid, method, params })) })
  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: `${url}?visual=${Date.now()}` })
  await sleep(2200)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(out, `baseline-${width}.png`), Buffer.from(shot.result.data, 'base64'))
  console.log(`captured ${width}`)
  ws.close()
}
chrome.kill()

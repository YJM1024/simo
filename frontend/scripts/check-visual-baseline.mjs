#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselineDir = join(root, 'review', 'regression')
const argIndex = process.argv.indexOf('--current')
const currentDir = argIndex >= 0 ? process.argv[argIndex + 1] : join(baselineDir, 'current')
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!existsSync(chromePath)) { console.error('check:visual: Chrome not found; set CHROME_PATH'); process.exit(2) }
const port = Number(process.env.VISUAL_CDP_PORT ?? 9333)
const chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${port}`,`--user-data-dir=${join(root,'.tmp','visual-check-chrome')}`,'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
for (let i=0;i<40;i++){ try { await fetch(`http://127.0.0.1:${port}/json/version`); break } catch { await sleep(200) } }
const names = readdirSync(baselineDir).filter((name) => /^baseline-\d+\.png$/.test(name)).sort()
let failed = 0
for (const name of names) {
  const baseline = join(baselineDir, name)
  const current = join(currentDir, name)
  if (!existsSync(current)) { console.error(`${name}: missing current`); failed++; continue }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
  let id=0
  const send=(m,p={})=>new Promise((resolve)=>{const mid=++id;const on=(event)=>{const data=JSON.parse(event.data);if(data.id===mid){ws.removeEventListener('message',on);resolve(data)}};ws.addEventListener('message',on);ws.send(JSON.stringify({id:mid,method:m,params:p}))})
  await send('Runtime.enable')
  const a = readFileSync(baseline).toString('base64')
  const b = readFileSync(current).toString('base64')
  const result = await send('Runtime.evaluate', { expression: `(async()=>{const load=(data)=>new Promise((ok,no)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=no;img.src='data:image/png;base64,'+data});const [a,b]=await Promise.all([load(${JSON.stringify(a)}),load(${JSON.stringify(b)})]);if(a.width!==b.width||a.height!==b.height)return {error:'size mismatch'};const c=document.createElement('canvas');c.width=a.width;c.height=a.height;const ctx=c.getContext('2d');ctx.drawImage(a,0,0);const da=ctx.getImageData(0,0,a.width,a.height).data;ctx.clearRect(0,0,a.width,a.height);ctx.drawImage(b,0,0);const db=ctx.getImageData(0,0,a.width,a.height).data;let changed=0,max=0;for(let i=0;i<da.length;i+=4){const d=Math.max(Math.abs(da[i]-db[i]),Math.abs(da[i+1]-db[i+1]),Math.abs(da[i+2]-db[i+2]));if(d>8)changed++;if(d>max)max=d}return {ratio:changed/(a.width*a.height),max}})()`, awaitPromise: true, returnByValue: true })
  ws.close()
  const value = result.result?.result?.value ?? { ratio: 1, error: result.result?.exceptionDetails?.text }
  const ratio = Number(value.ratio ?? 1)
  const ok = !value.error && ratio === 0
  console.log(`${name}: diff=${(ratio*100).toFixed(3)}% max=${value.max ?? '-'} ${ok?'PASS':'FAIL'}${value.error?` (${value.error})`:''}`)
  if (!ok) failed++
}
chrome.kill()
console.log(`visual gate: ${names.length} baselines, ${failed} failures`)
process.exit(failed ? 1 : 0)

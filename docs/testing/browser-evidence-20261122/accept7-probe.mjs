// AC-CONV-008-04 真机 304 探针：确认右栏 DOM 结构与默认会话
import { writeFileSync } from 'node:fs'

const PORT = 9223
const APP = 'http://127.0.0.1:8787/'
const OUT = 'E:/dsh_home/workspaces/agent/docs/testing/browser-evidence-20261122'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: APP })
for (let i = 0; i < 60; i++) {
  const s = await evaluate(`({ r: document.readyState, n: document.querySelectorAll('.session-row').length, ins: !!document.querySelector('.inspector'), rows: document.querySelectorAll('.exec-group .exec-row').length })`)
  if (s.r === 'complete' && s.n > 0 && s.ins && s.rows > 0) { console.log('ready', JSON.stringify(s)); break }
  await sleep(250)
}
await sleep(800)
const snap = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.session-row')].map((r) => ({ title: r.getAttribute('title'), cls: r.className, text: (r.querySelector('.session-title')?.textContent ?? '').trim(), depth: r.getAttribute('data-depth') }))
  const ins = document.querySelector('.inspector')
  const body = document.querySelector('.insp-body')
  const groups = [...document.querySelectorAll('.exec-group')].map((g) => ({ name: g.querySelector('.exec-name')?.textContent, count: g.querySelector('.exec-count')?.textContent, rows: g.querySelectorAll('.exec-row').length, expanded: g.classList.contains('is-expanded') }))
  return {
    url: location.href,
    insp: ins ? { session: ins.getAttribute('data-session'), w: ins.getBoundingClientRect().width, h: ins.getBoundingClientRect().height, html: ins.outerHTML.slice(0, 1200) } : null,
    bodyText: body?.innerText.slice(0, 700),
    groups,
    taskRows: document.querySelectorAll('.exec-group .exec-row').length,
    allRows: document.querySelectorAll('.inspector .exec-row').length,
    blocks: document.querySelectorAll('.insp-body .insp-block').length,
    loading: document.querySelectorAll('.inspector .state-loading').length,
    empty: document.querySelectorAll('.inspector .overview-empty').length,
    rows,
  }
})()`)
writeFileSync(`${OUT}/accept7-probe.json`, JSON.stringify(snap, null, 2))
console.log(JSON.stringify({ insp: snap.insp && { session: snap.insp.session, w: snap.insp.w, h: snap.insp.h }, groups: snap.groups, taskRows: snap.taskRows, allRows: snap.allRows, blocks: snap.blocks, loading: snap.loading, empty: snap.empty }, null, 2))
console.log('sessions', JSON.stringify(snap.rows, null, 1))
console.log('bodyText', snap.bodyText)
await send('Page.close').catch(() => {})
ws.close()

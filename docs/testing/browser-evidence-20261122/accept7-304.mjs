// AC-CONV-008-04 真机证据：spec-projection 条件请求命中 304 时右栏不闪空
// 只读观测：不改源码、不改后端、不删除文件。CDP 9223 + 8787。
import { writeFileSync } from 'node:fs'

const PORT = 9223
const APP = 'http://127.0.0.1:8787/'
const TESTING = 'E:/dsh_home/workspaces/agent/docs/testing'
const OUT = `${TESTING}/browser-evidence-20261122`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowIso = () => new Date().toISOString()
const log = (...a) => console.log(`[${nowIso()}]`, ...a)

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
const health = await (await fetch('http://127.0.0.1:8787/api/health')).json().catch((e) => ({ error: String(e) }))
const html = await (await fetch(APP)).text()
const buildId = /<meta name="build-id" content="([^"]+)"/.exec(html)?.[1] ?? null

const created = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(created.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let seq = 0
const pending = new Map()
const netEntries = new Map()
const netLog = []
ws.addEventListener('message', (e) => {
  const d = JSON.parse(e.data)
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return }
  const p = d.params
  if (!p || !d.method) return
  if (d.method === 'Network.requestWillBeSent' && /spec-projection/.test(p.request?.url ?? '')) {
    const entry = { requestId: p.requestId, url: p.request.url, phase: 'sent', wallTime: p.wallTime, timestamp: p.timestamp, headers: { ...p.request.headers } }
    netEntries.set(p.requestId, entry); netLog.push(entry); log('NET sent', p.request.url, JSON.stringify(p.request.headers))
  }
  if (d.method === 'Network.requestWillBeSentExtraInfo') {
    const entry = netEntries.get(p.requestId)
    if (entry) { entry.headersWire = p.headers; log('NET sentExtra', JSON.stringify(p.headers)) }
  }
  if (d.method === 'Network.responseReceived') {
    const entry = netEntries.get(p.requestId)
    if (entry) {
      entry.status = p.response.status
      entry.responseHeaders = p.response.headers
      entry.mimeType = p.response.mimeType
      entry.fromDiskCache = p.response.fromDiskCache
      log('NET response', entry.url, p.response.status, JSON.stringify(p.response.headers))
    }
  }
  if (d.method === 'Network.loadingFinished' || d.method === 'Network.loadingFailed') {
    const entry = netEntries.get(p.requestId)
    if (entry) { entry.encodedDataLength = p.encodedDataLength; entry.loadingOk = d.method === 'Network.loadingFinished' }
  }
})
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
  return r.result?.value
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1600, height: 1000, scale: 1 }, captureBeyondViewport: false })
  const file = `${TESTING}/${name}`
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  log('screenshot', file)
  return file
}

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: APP })

const READY = `(() => {
  const ins = document.querySelector('.inspector');
  return {
    ready: document.readyState,
    sessions: document.querySelectorAll('.session-row').length,
    session: ins?.getAttribute('data-session') ?? null,
    rows: document.querySelectorAll('.exec-group .exec-row').length,
    blocks: document.querySelectorAll('.insp-body .insp-block').length,
    loading: document.querySelectorAll('.inspector .state-loading').length,
  };
})()`
let ready = null
for (let i = 0; i < 80; i++) {
  const s = await evaluate(READY)
  if (s.ready === 'complete' && s.sessions > 0 && s.session === 'main' && s.rows > 0 && s.blocks > 0 && s.loading === 0) { ready = s; break }
  await sleep(250)
}
if (!ready) throw new Error('右栏未在 20s 内加载完成')

const READ = `(() => {
  const ins = document.querySelector('.inspector');
  const body = document.querySelector('.insp-body');
  const groups = [...document.querySelectorAll('.exec-group')].map((g) => ({
    name: g.querySelector('.exec-name')?.textContent ?? '',
    count: g.querySelector('.exec-count')?.textContent ?? '',
    rows: g.querySelectorAll('.exec-row').length,
    expanded: g.classList.contains('is-expanded'),
  }));
  return {
    session: ins?.getAttribute('data-session') ?? null,
    taskRows: document.querySelectorAll('.exec-group .exec-row').length,
    allRows: document.querySelectorAll('.inspector .exec-row').length,
    blocks: document.querySelectorAll('.insp-body .insp-block').length,
    bodyChildren: body?.childElementCount ?? -1,
    loading: document.querySelectorAll('.inspector .state-loading').length,
    emptyRoot: document.querySelectorAll('.insp-body > .overview-empty, .insp-body > .insp-placeholder').length,
    hasSpecStatus: Boolean(document.querySelector('.insp-spec-status')),
    missingText: /暂无会话投影|未选择会话|右栏加载失败/.test(body?.innerText ?? ''),
    groups,
    statusText: ins?.querySelector('.insp-spec-status')?.innerText ?? '',
  };
})()`
const initial = await evaluate(READ)
log('initial', JSON.stringify(initial))
if (initial.session !== 'main' || initial.taskRows < 1) throw new Error('初始右栏快照不符合预期')
const beforeFile = await shot('accept7-before-304.png')

// 观测器：MutationObserver + 20ms 采样 + fetch 记录（只读包装）
const installed = await evaluate(`(() => {
  const ins = document.querySelector('.inspector');
  const body = document.querySelector('.insp-body');
  const read = () => {
    const groups = [...document.querySelectorAll('.exec-group')].map((g) => ({
      name: g.querySelector('.exec-name')?.textContent ?? '',
      count: g.querySelector('.exec-count')?.textContent ?? '',
      rows: g.querySelectorAll('.exec-row').length,
      expanded: g.classList.contains('is-expanded'),
    }));
    const insNow = document.querySelector('.inspector');
    const bodyNow = document.querySelector('.insp-body');
    return {
      session: insNow?.getAttribute('data-session') ?? null,
      taskRows: document.querySelectorAll('.exec-group .exec-row').length,
      allRows: document.querySelectorAll('.inspector .exec-row').length,
      blocks: document.querySelectorAll('.insp-body .insp-block').length,
      bodyChildren: bodyNow?.childElementCount ?? -1,
      loading: document.querySelectorAll('.inspector .state-loading').length,
      emptyRoot: document.querySelectorAll('.insp-body > .overview-empty, .insp-body > .insp-placeholder').length,
      hasSpecStatus: Boolean(document.querySelector('.insp-spec-status')),
      missingText: /暂无会话投影|未选择会话|右栏加载失败/.test(bodyNow?.innerText ?? ''),
      statusText: insNow?.querySelector('.insp-spec-status')?.innerText ?? '',
      groups,
    };
  };
  window.__a7 = { samples: [], mutations: [], fetches: [], startedAt: performance.now(), read };
  const sample = () => { const s = read(); s.t = performance.now(); window.__a7.samples.push(s); return s; };
  window.__a7.sample = sample;
  sample();
  window.__a7.timer = setInterval(sample, 20);
  window.__a7.mo = new MutationObserver((records) => {
    const after = sample();
    for (const rec of records) {
      window.__a7.mutations.push({
        t: performance.now(),
        type: rec.type,
        target: rec.target?.className || rec.target?.nodeName || '',
        removed: rec.removedNodes.length,
        added: rec.addedNodes.length,
        removedClasses: [...rec.removedNodes].filter((n) => n.nodeType === 1).map((n) => n.className).slice(0, 12),
        addedClasses: [...rec.addedNodes].filter((n) => n.nodeType === 1).map((n) => n.className).slice(0, 12),
        after,
      });
    }
  });
  window.__a7.mo.observe(ins, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-session'] });
  const orig = window.fetch;
  window.__a7.fetchRestore = () => { window.fetch = orig };
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const hdrs = Object.fromEntries(new Headers(init?.headers || {}).entries());
    const entry = { t: performance.now(), url, headers: hdrs };
    const watched = url.includes('/spec-projection');
    if (watched) window.__a7.fetches.push(entry);
    try {
      const res = await orig.apply(this, arguments);
      if (watched) {
        entry.status = res.status;
        entry.etag = res.headers.get('ETag');
        entry.endT = performance.now();
        if (res.status === 304) {
          entry.bodyLen = await res.clone().text().then((t) => t.length).catch(() => -1);
        }
      }
      return res;
    } catch (e) { entry.error = String(e); entry.failT = performance.now(); throw e; }
  };
  return read();
})()`)
log('installed', JSON.stringify(installed))

// 让 304 的等待可观测：350ms 延迟（仍是真实条件请求/真实 304）
await send('Network.emulateNetworkConditions', { offline: false, latency: 350, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' })

const clickRow = async (title) => {
  const ok = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.session-row')].find((r) => (r.querySelector('.session-title')?.textContent ?? '').trim() === ${JSON.stringify(title)});
    if (!row) return false;
    row.click();
    return true;
  })()`)
  if (!ok) throw new Error(`找不到会话行 ${title}`)
}
const waitSession = async (id, timeoutMs = 6000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const s = await evaluate(`({ session: document.querySelector('.inspector')?.getAttribute('data-session') ?? null, loading: document.querySelectorAll('.inspector .state-loading').length, rows: document.querySelectorAll('.exec-group .exec-row').length })`)
    if (s.session === id && s.loading === 0) return s
    await sleep(100)
  }
  return null
}

const AWAY = { title: '验收序B', id: 'sess-38497934b31bfc0a' }
const attempts = []
let target = null
for (let attempt = 1; attempt <= 3 && !target; attempt += 1) {
  log('attempt', attempt, 'switch away')
  await clickRow(AWAY.title)
  const awayState = await waitSession(AWAY.id)
  log('away state', JSON.stringify(awayState))
  await sleep(250)
  const clickT = Date.now()
  await clickRow('主会话')
  await sleep(90)
  await shot(attempt === 1 ? 'accept7-during-304.png' : `accept7-during-304-attempt${attempt}.png`)
  let entry = null
  const started = Date.now()
  while (Date.now() - started < 6000) {
    const fetches = await evaluate(`window.__a7.fetches.map((f) => ({ t: f.t, url: f.url, headers: f.headers, status: f.status, etag: f.etag, endT: f.endT, bodyLen: f.bodyLen }))`)
    entry = [...fetches].reverse().find((f) => f.url.includes('/sessions/main/spec-projection') && f.status !== undefined)
    if (entry) break
    await sleep(30)
  }
  const state = await evaluate(READ)
  log('after request', JSON.stringify({ entry, state: { session: state.session, taskRows: state.taskRows, loading: state.loading } }))
  attempts.push({ attempt, clickT, entry, state })
  if (entry?.status === 304) target = { attempt, entry, state }
}
if (!target) throw new Error('三次尝试均未命中 304')

const responseAt = await evaluate(`window.__a7.fetches.find((f) => f.url.includes('/sessions/main/spec-projection') && f.status === 304)?.endT ?? null`)
await sleep(350)
const afterFile = await shot('accept7-after-304.png')
const finalRead = await evaluate(READ)
const captured = await evaluate(`({ samples: window.__a7.samples, mutations: window.__a7.mutations, fetches: window.__a7.fetches.map((f) => ({ t: f.t, url: f.url, headers: f.headers, status: f.status, etag: f.etag, endT: f.endT, bodyLen: f.bodyLen, error: f.error })) })`)
await evaluate(`(() => { clearInterval(window.__a7.timer); window.__a7.mo.disconnect(); window.__a7.fetchRestore?.(); return true })()`)
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' }).catch(() => {})

const tReq = target.entry.t
const tResp = target.entry.endT
const winSamples = captured.samples.filter((s) => s.t >= tReq && s.t <= tResp + 300)
const winMuts = captured.mutations.filter((m) => m.t >= tReq && m.t <= tResp + 300)
const firstRows = initial.taskRows
const firstBlocks = initial.blocks
const minRows = winSamples.length ? Math.min(...winSamples.map((s) => s.taskRows)) : null
const minBlocks = winSamples.length ? Math.min(...winSamples.map((s) => s.blocks)) : null
const skeletonFrames = winSamples.filter((s) => s.loading > 0).length
const rootEmptyFrames = winSamples.filter((s) => s.emptyRoot > 0 || s.missingText).length
const rowDropFrames = winSamples.filter((s) => s.taskRows < firstRows)
const bodyEmptyFrames = winSamples.filter((s) => s.bodyChildren <= 0).length
const clearMuts = winMuts.filter((m) => m.after.blocks === 0 || m.after.bodyChildren <= 0 || m.after.taskRows === 0 || m.removedClasses.some((c) => /insp-body|insp-block|insp-spec-status/.test(c)))
const blockRemovals = winMuts.filter((m) => m.removedClasses.some((c) => /insp-block|insp-body|insp-spec-status/.test(c)))
const sessionMuts = winMuts.filter((m) => m.type === 'attributes' || m.after.session !== 'main')
const fetch200 = captured.fetches.filter((f) => f.url.includes('/sessions/main/spec-projection') && f.status === 200)
const respNet = [...netEntries.values()].filter((e) => e.url.includes('/sessions/main/spec-projection') && e.status !== undefined)
const lastRespNet = respNet[respNet.length - 1] ?? null
const ifNoneMatch = target.entry.headers['If-None-Match'] ?? target.entry.headers['if-none-match'] ?? null
const etagResp = target.entry.etag ?? lastRespNet?.responseHeaders?.etag ?? null

const metrics = {
  generatedAt: nowIso(),
  ac: 'AC-CONV-008-04',
  url: APP,
  buildId,
  health,
  browser: version.Browser,
  cdp: `127.0.0.1:${PORT}`,
  viewport: { w: 1600, h: 1000 },
  scenario: `主会话(main) 首次加载 → 切到 ${AWAY.title}(${AWAY.id}) → 切回主会话，触发右侧 spec-projection 条件请求`,
  initial: { session: initial.session, groups: initial.groups, taskRows: initial.taskRows, allRows: initial.allRows, blocks: initial.blocks, statusText: initial.statusText },
  attempts: attempts.map((a) => ({ attempt: a.attempt, status: a.entry?.status ?? null, ifNoneMatch: a.entry?.headers?.[ 'If-None-Match'] ?? a.entry?.headers?.['if-none-match'] ?? null, etag: a.entry?.etag ?? null, bodyLen: a.entry?.bodyLen ?? null })),
  four: {
    status304: target.entry.status === 304,
    requestHasIfNoneMatch: Boolean(ifNoneMatch),
    responseEtag: etagResp,
    ifNoneMatch,
    bodyLen: target.entry.bodyLen,
    minRows,
    firstRows,
    rowDropFrames: rowDropFrames.length,
    skeletonFrames,
    rootEmptyFrames,
    bodyEmptyFrames,
    minBlocks,
    firstBlocks,
    clearMutationCount: clearMuts.length,
    blockRemovalMutations: blockRemovals.length,
    sessionAttributeMutations: sessionMuts.length,
    fetch200Count: fetch200.length,
    sampleCount: winSamples.length,
    requestSpanMs: Math.round((tResp - tReq) * 10) / 10,
  },
  windowRange: { tReq, tResp, from: tReq, to: tResp + 300 },
  rowDropSamples: rowDropFrames.slice(0, 20),
  clearMutationDetail: clearMuts.slice(0, 20),
  winMutations: winMuts.slice(0, 60),
  fetches: captured.fetches,
  network: respNet,
  finalRead: { session: finalRead.session, taskRows: finalRead.taskRows, groups: finalRead.groups, loading: finalRead.loading },
  files: { before: beforeFile, during: `${TESTING}/accept7-during-304.png`, after: afterFile },
  samplesAll: captured.samples.length,
  mutationsAll: captured.mutations.length,
}
writeFileSync(`${OUT}/accept7-304-metrics.json`, JSON.stringify(metrics, null, 2))
log('METRICS', JSON.stringify({ four: metrics.four, attempts: metrics.attempts }))
console.log(JSON.stringify({ ok: true, metricsPath: `${OUT}/accept7-304-metrics.json`, files: metrics.files }, null, 2))
await send('Page.close').catch(() => {})
ws.close()
process.exit(0)

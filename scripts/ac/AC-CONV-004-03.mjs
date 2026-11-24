// AC-CONV-004-03 接口/WS/UI 三处 internal 计数 0、卡片保留、编辑端点禁用。
import { http, sessions, readDb, openPage, DOM, sleep, main } from './lib/harness.mjs'

main('AC-CONV-004-03', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const list = await sessions(baseUrl)
  const target = list.find((s) => s.id === 'main') || list[0]
  const dbInternal = readDb('data/simo.db', 'SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND internal = 1', [target.id])
  const dbPublic = readDb('data/simo.db', 'SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND internal = 0', [target.id])
  const api = await http(baseUrl, 'GET', `/api/messages?sessionId=${encodeURIComponent(target.id)}&limit=1000`)
  const msgs = (api.json && api.json.messages) || []
  raw.db = { internal: dbInternal.rows, public: dbPublic.rows }
  raw.apiCount = msgs.length
  checks.apiInternal0 = msgs.filter((m) => m.internal === true || m.category === 'internal' || m.kind === 'internal').length === 0
  checks.apiCountEqualsPublic = dbPublic.ok && msgs.length === dbPublic.rows[0].n
  // WS 帧纯度（1.5s 采样）
  const wsFrames = await new Promise((resolve) => {
    const frames = []
    let ws
    try { ws = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/api/ws') } catch { return resolve({ error: 'connect-failed', frames }) }
    const timer = setTimeout(() => { try { ws.close() } catch {} ; resolve({ frames }) }, 1800)
    ws.onmessage = (ev) => { frames.push(String(ev.data).slice(0, 500)) }
    ws.onerror = () => { clearTimeout(timer); resolve({ error: 'ws-error', frames }) }
  })
  raw.ws = { count: wsFrames.frames.length, sample: wsFrames.frames.slice(0, 2), error: wsFrames.error }
  checks.wsInternal0 = !wsFrames.frames.some((f) => /internal/i.test(f))
  // UI 纯度
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    await page.eval(DOM.clickRowByTitle(target.title))
    await sleep(800)
    const ui = await page.eval(`(() => ({ msgs: document.querySelectorAll('.msg').length, cards: document.querySelectorAll('.card-block').length, cardKind: Array.from(document.querySelectorAll('.card-block')).map(c=>c.getAttribute('data-kind')) }))()`)
    raw.ui = ui
    checks.uiCountMatchesApi = ui.msgs === msgs.length
    checks.uiInternal0 = !(await page.eval(`Array.from(document.querySelectorAll('.msg')).some(m => /internal/i.test(m.className + ' ' + m.textContent))`))
    checks.cardDataKind = ui.cards > 0 && ui.cardKind.every((k) => k === 'card')
    if (ui.cards === 0) raw.cardNote = '本次页面无 .card-block；卡片保留判据无 fixture'
  } finally { await page.close() }
  // 编辑端点禁用
  const mid = msgs[0] && msgs[0].id
  if (!mid) checks.editDisabled = false
  else {
    const edit = await http(baseUrl, 'POST', `/api/messages/${mid}/edit`, { text: 'x' })
    const patch = await http(baseUrl, 'PATCH', `/api/messages/${mid}`, { text: 'x' })
    raw.edit = { post: { status: edit.status, code: edit.json && edit.json.error && edit.json.error.code }, patch: { status: patch.status, code: patch.json && patch.json.error && patch.json.error.code } }
    checks.editDisabled = edit.status === 400 && raw.edit.post.code === 'edit_disabled' && patch.status === 400
  }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}${checks.cardDataKind ? '' : `（卡片节点 .card-block=${raw.ui ? raw.ui.cards : 0}，实际无 data-kind=card 属性）`}`, checks, raw }
  return { pass: true, detail: `接口 internal 0 且条数=${msgs.length}（库内 internal=${raw.db.internal[0].n}）、WS 采样 ${wsFrames.frames.length} 帧无 internal、UI 条数一致、卡片 data-kind=card、编辑端点 400 edit_disabled`, checks, raw }
})

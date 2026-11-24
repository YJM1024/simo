// AC-CONV-003-02 搜索失败态（列表 0 行 + 错误节点 1）+ 已读会话刷新后未读点 0。
import { http, sessions, openPage, openFaultPage, DOM, sleep, main } from './lib/harness.mjs'

const searchFault = `(() => { const orig=window.fetch; window.fetch=function(u,o){ const s=String(u); const m=((o&&o.method)||'GET').toUpperCase(); if(m==='GET' && /\\/api\\/sessions\\?/.test(s) && /[?&]q=/.test(s)) return Promise.resolve(new Response('{"ok":false,"error":"boom"}',{status:500,headers:{'content-type':'application/json'}})); return orig.apply(window,arguments) } })()`

main('AC-CONV-003-02', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  // 1) 搜索 500 → 0 行 + 错误节点 1
  const fp = await openFaultPage({ baseUrl, initScript: searchFault })
  try {
    await sleep(500)
    raw.type = await fp.eval(DOM.setSearch('zzz-no-such-session-zzz'))
    await sleep(900)
    const snap = await fp.eval(`(() => ({ rows: document.querySelectorAll('.session-row').length, err: document.querySelectorAll('.state-error, [role="alert"], .side-empty').length, text: (document.querySelector('.sidebar-scroll')||{}).innerText || '' }))()`)
    raw.searchFail = snap
    checks.failRows0 = snap.rows === 0
    checks.failError1 = snap.text.includes('搜索失败') && snap.err >= 1
  } finally { await fp.close() }
  // 2) 已读会话刷新后未读点 0：挑一个 hasUnread=false 的会话，刷新后该行无未读点
  const list = await sessions(baseUrl)
  const readSession = list.find((s) => s.hasUnread === false && !s.archived) || list.find((s) => s.hasUnread === false)
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    const rows = await page.eval(DOM.rows())
    raw.readSession = readSession && { id: readSession.id, title: readSession.title }
    raw.unreadRows = rows.filter((r) => r.unread).map((r) => r.title)
    const row = rows.find((r) => r.title === (readSession && readSession.title))
    checks.readRowNoUnread = Boolean(row) && row.unread === false
    checks.unreadIsDotOnly = await page.eval(`document.querySelectorAll('.session-unread').length === [...document.querySelectorAll('.session-unread')].filter(n=>n.getAttribute('data-unread')==='true' && !/\\d/.test(n.textContent)).length`)
  } finally { await page.close() }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: `搜索 500 → 0 行 + 错误态 1；已读会话「${readSession && readSession.title}」刷新后无未读点，未读点无数字`, checks, raw }
})

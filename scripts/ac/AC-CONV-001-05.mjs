// AC-CONV-001-05 行内 .session-count=该会话 messageCount；底部=全部会话之和；切换后行内变、底部不变。
import { sessions, http, openPage, DOM, readDb, sleep, main } from './lib/harness.mjs'

main('AC-CONV-001-05', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const list = await sessions(baseUrl)
  const flat = []
  const walk = (nodes) => (nodes || []).forEach((n) => { flat.push(n); walk(n.children) })
  walk(list)
  const expectedSum = flat.reduce((sum, s) => sum + (s.messageCount || 0), 0)
  const stats = (await http(baseUrl, 'GET', '/api/stats')).json
  raw.api = { count: flat.length, sum: expectedSum, statsTotals: stats.totals }
  const page = await openPage({ baseUrl })
  let countRows = 0
  let note = ''
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    const rows = await page.eval(DOM.rows())
    raw.rows = rows.slice(0, 6)
    const byTitle = new Map(flat.map((s) => [s.title, s]))
    const countRowsAll = rows.filter((r) => r.count !== null && byTitle.has(r.title))
    countRows = countRowsAll.length
    const mismatches = countRowsAll.filter((r) => String(byTitle.get(r.title).messageCount) !== String(r.count).trim())
    checks.rowCountsMatch = countRowsAll.length > 0 && mismatches.length === 0
    raw.mismatches = mismatches
    note = (await page.eval(DOM.quotaNote())).trim()
    raw.note = note
    checks.footerMessageSum = note.includes(`${expectedSum} 条消息`)
    checks.footerSessionCount = note.includes(`${flat.length} 个会话`)
    checks.footerArchived = note.includes(`归档 ${flat.filter((s) => s.archived).length}`)
    // 切换会话：行内变、底部不变
    const other = flat.find((s) => s.id !== 'main' && !s.archived && (s.messageCount || 0) > 0) || flat.find((s) => s.id !== 'main')
    if (other) {
      await page.eval(DOM.clickRowByTitle(other.title))
      await sleep(500)
      const note2 = (await page.eval(DOM.quotaNote())).trim()
      const rows2 = await page.eval(DOM.rows())
      raw.afterSwitch = { note: note2, active: rows2.find((r) => r.active) }
      checks.footerUnchangedAfterSwitch = note2 === note
      checks.activeRowCount = rows2.some((r) => r.active && r.count !== null && String(byTitle.get(r.title).messageCount) === String(r.count).trim())
    } else checks.activeRowCount = false
    // 统计失败：占位而非 0（通过故障页）
    const faultPage = await (await import('./lib/harness.mjs')).openFaultPage({ baseUrl, initScript: `(() => { const of=window.fetch; window.fetch=function(u,o){ const s=String(u), m=((o&&o.method)||'GET').toUpperCase(); if(m==='GET' && /\\/api\\/stats/.test(s)) return Promise.resolve(new Response('{"ok":false}',{status:500,headers:{'content-type':'application/json'}})); return of.apply(window,arguments) } })()` })
    try {
      await sleep(1200)
      const snap = await faultPage.eval(`(() => ({ note: (document.querySelector('.quota-note')||{}).textContent||'', usage: Array.from(document.querySelectorAll('.quota-row span')).map(s=>s.textContent).join('|') }))()`)
      raw.fault = snap
      checks.statsFailurePlaceholder = snap.note.includes('统计加载失败')
      checks.statsFailureNoZero = !/(^|[^\d])0([^\d]|$)/.test(snap.note) && /—|\d/.test(snap.usage)
    } finally { await faultPage.close() }
  } finally { await page.close() }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: `行内数=messageCount（${countRows} 行）、底部=${note}（与 API 和 ${expectedSum} 一致）、切换后底部不变、统计失败显示占位`, checks, raw }
})

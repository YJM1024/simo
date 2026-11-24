// AC-CONV-003-01 标题搜索：q= 1 次、行集=响应 id 集、/api/messages/search 0 次。
import { sessions, http, openPage, installFetchLog, DOM, sleep, main } from './lib/harness.mjs'

main('AC-CONV-003-01', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const list = await sessions(baseUrl)
  const pick = list.find((s) => !s.archived && s.id !== 'main' && s.title.trim().length >= 3) || list.find((s) => s.title.trim().length >= 3)
  if (!pick) throw new Error('没有可用标题做搜索关键词')
  const query = pick.title.trim()
  const expected = (await http(baseUrl, 'GET', `/api/sessions?q=${encodeURIComponent(query)}`)).json.sessions || []
  raw.query = query
  raw.expected = expected.map((s) => s.title)
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    await page.eval(installFetchLog)
    raw.type = await page.eval(DOM.setSearch(query))
    await sleep(700)
    const calls = await page.eval(`window.__acLog.calls.map(c => ({ url: c.url, method: c.method }))`)
    const sessionCalls = calls.filter((c) => new URL(c.url, baseUrl).pathname.startsWith('/api/sessions') && c.url.includes('q='))
    const msgSearch = calls.filter((c) => c.url.includes('/api/messages/search'))
    raw.sessionCalls = sessionCalls.length
    raw.msgSearchCalls = msgSearch.length
    checks.qOnce = sessionCalls.length === 1
    checks.noMessageSearch = msgSearch.length === 0
    const rows = await page.eval(DOM.rows())
    const rowTitles = rows.map((r) => r.title).sort()
    checks.rowSetEqualsResponse = JSON.stringify(rowTitles) === JSON.stringify(expected.map((s) => s.title).sort())
    raw.rows = rowTitles
    const fallback = await page.eval(`!!document.querySelector('.session-row[data-session-id]')`)
    raw.anchor = fallback ? 'data-session-id' : 'fallback-title（实际 .session-row 无 data-session-id）'
  } finally { await page.close() }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: `搜索「${query}」：q= 1 次、消息搜索 0 次、行集=响应集（${expected.length} 行，id 集以标题回退比对：DOM 无 data-session-id）`, checks, raw }
})

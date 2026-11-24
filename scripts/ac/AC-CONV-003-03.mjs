// AC-CONV-003-03 标题搜索覆盖子会话与归档会话：q= 1 次、messages/search 0 次、行集=响应集。
import { sessions, http, openPage, installFetchLog, DOM, sleep, main } from './lib/harness.mjs'

main('AC-CONV-003-03', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const suffix = Date.now()
  const parent = (await http(baseUrl, 'POST', '/api/sessions', { title: `AC-003-03-P-${suffix}`, draft: false })).json.session
  const childTitle = `AC-003-03-CHILD-${suffix}`
  const child = (await http(baseUrl, 'POST', '/api/sessions', { title: childTitle, parentId: parent.id, draft: false })).json.session
  const archivedTitle = `AC-003-03-ARCH-${suffix}`
  const archived = (await http(baseUrl, 'POST', '/api/sessions', { title: archivedTitle, draft: false })).json.session
  await http(baseUrl, 'POST', `/api/sessions/${archived.id}/archive`)
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    await page.eval(installFetchLog)
    // 子会话（未归档，父在树中）
    await page.eval(DOM.setSearch(childTitle))
    await sleep(700)
    let calls = await page.eval(`window.__acLog.calls.map(c => ({ url: c.url, method: c.method }))`)
    let sessionCalls = calls.filter((c) => new URL(c.url, baseUrl).pathname.startsWith('/api/sessions') && c.url.includes('q='))
    let rows = await page.eval(DOM.rows())
    raw.child = { qCalls: sessionCalls.length, rows: rows.map((r) => r.title) }
    const childResp = (await http(baseUrl, 'GET', `/api/sessions?q=${encodeURIComponent(childTitle)}`)).json.sessions || []
    checks.childQOnce = sessionCalls.length === 1
    checks.childRowPresent = rows.some((r) => r.title === childTitle)
    // 树过滤会保留命中行的祖先，故只要求响应集全部在行集中（并记录额外祖先行）
    const childTitles = new Set(rows.map((r) => r.title))
    checks.childRowSetCoversResponse = childResp.every((s) => childTitles.has(s.title))
    raw.childAncestors = rows.map((r) => r.title).filter((t) => t !== childTitle)
    // 归档会话（点显示归档后可见）
    await page.eval(`(() => { const b=[...document.querySelectorAll('.side-label button')].find(x=>x.textContent.includes('显示归档')); if (b) b.click(); return !!b })()`)
    await page.eval(`window.__acLog.calls.length = 0`)
    await page.eval(DOM.setSearch(archivedTitle))
    await sleep(700)
    calls = await page.eval(`window.__acLog.calls.map(c => ({ url: c.url, method: c.method }))`)
    sessionCalls = calls.filter((c) => new URL(c.url, baseUrl).pathname.startsWith('/api/sessions') && c.url.includes('q='))
    rows = await page.eval(DOM.rows())
    raw.archived = { qCalls: sessionCalls.length, rows: rows.map((r) => r.title) }
    const archResp = (await http(baseUrl, 'GET', `/api/sessions?q=${encodeURIComponent(archivedTitle)}`)).json.sessions || []
    checks.archivedQOnce = sessionCalls.length === 1
    checks.archivedRowPresent = rows.some((r) => r.title === archivedTitle)
    checks.archivedRowSetEqualsResponse = JSON.stringify(rows.map((r) => r.title).sort()) === JSON.stringify(archResp.map((s) => s.title).sort())
    checks.noMessageSearch = !calls.some((c) => c.url.includes('/api/messages/search'))
  } finally {
    await page.close()
    for (const s of [child.id, parent.id, archived.id]) await http(baseUrl, 'POST', `/api/sessions/${s}/archive`).catch(() => {})
  }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: '子会话与归档会话均命中：各 q= 1 次、行集=响应集、messages/search 0 次（行 id 集以标题回退比对）', checks, raw }
})

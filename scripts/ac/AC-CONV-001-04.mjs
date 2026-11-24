// AC-CONV-001-04 置顶：文案变"取消置顶"、pin 端点 1 次、该行成为同级第一条且其余同级保持相对顺序、跨层级不上浮、取消置顶恢复原序、持久化（实例库读回 pinned=1）。
// 判据对齐 specs/product/P1-CONV/spec.md:80（2026-11-23 裁决：不再要求"恰好上移一位"）。
import { http, readDb, openPage, installFetchLog, DOM, sleep, main } from './lib/harness.mjs'

main('AC-CONV-001-04', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const suffix = Date.now()
  const mk = async (t) => (await http(baseUrl, 'POST', '/api/sessions', { title: `AC-001-04-${t}-${suffix}`, draft: false })).json.session
  const a = await mk('A')
  const b = await mk('B')
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    await page.eval(installFetchLog)
    const rows0 = await page.eval(DOM.rows())
    raw.orderBefore = rows0.map((r) => r.title)
    const rowA0 = rows0.find((r) => r.title === a.title)
    const depthA = rowA0 ? rowA0.depth : -1
    raw.depthA = depthA
    const sameLevel = (rows) => rows.filter((r) => r.depth === depthA)
    const lvl0 = sameLevel(rows0).map((r) => r.title)
    raw.levelBefore = lvl0

    const open1 = await page.eval(DOM.openMenuByTitle(a.title))
    raw.menuOpen = open1
    raw.menuItemsBefore = await page.eval(DOM.menuItems())
    checks.menuVisible = open1.ok === true && raw.menuItemsBefore.includes('置顶')
    raw.clickPin = await page.eval(DOM.clickMenuText('置顶'))
    await sleep(500)
    const pins = await page.eval(`window.__acLog.calls.filter(c => /\\/pin$/.test(new URL(c.url, location.origin).pathname) && c.method === 'POST' && c.url.includes(${JSON.stringify(a.id)}))`)
    raw.pinCalls = pins
    checks.pinOnce = pins.length === 1
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    const apiA = (await http(baseUrl, 'GET', '/api/sessions')).json.sessions.find((s) => s.id === a.id)
    checks.pinnedStored = Boolean(apiA && apiA.pinned === true)

    // 持久化：读实例 home 下的库（AC_DB 由 runner 传入，隔离实例必须指向自己的 SIMO_HOME）
    const dbRel = process.env.AC_DB || 'data/simo.db'
    raw.dbPath = dbRel
    const db = readDb(dbRel, 'SELECT pinned, archived, title FROM sessions WHERE id = ?', [a.id])
    raw.db = db
    checks.persistedOnDisk = db.ok && db.rows.length === 1 && db.rows[0].pinned === 1

    const open2 = await page.eval(DOM.openMenuByTitle(a.title))
    raw.menuOpen2 = open2
    raw.menuItemsAfter = await page.eval(DOM.menuItems())
    checks.menuTextToggled = raw.menuItemsAfter.includes('取消置顶') && !raw.menuItemsAfter.includes('置顶')
    await page.eval(`document.body.click()`)
    await sleep(300)

    const rows1 = await page.eval(DOM.rows())
    raw.orderAfter = rows1.map((r) => r.title)
    const lvl1 = sameLevel(rows1).map((r) => r.title)
    raw.levelAfter = lvl1
    const rest0 = lvl0.filter((t) => t !== a.title)
    const rest1 = lvl1.filter((t) => t !== a.title)
    checks.topOfLevel = lvl1[0] === a.title && rest1.join('|') === rest0.join('|')
    const rowA1 = rows1.find((r) => r.title === a.title)
    const depthAfter = rowA1 ? rowA1.depth : -1
    const idxA = rows1.findIndex((r) => r.title === a.title)
    raw.depthAfter = depthAfter
    raw.idxAfter = idxA
    checks.noCrossLevel = depthAfter === depthA && rows1.slice(idxA + 1).every((r) => r.depth >= depthA)

    // 取消置顶恢复原序（重排后菜单需等 React 重渲染，重试三次）
    raw.unpin = { attempts: [] }
    for (let i = 0; i < 3; i += 1) {
      const opened = await page.eval(DOM.openMenuByTitle(a.title))
      await sleep(250)
      const items = await page.eval(DOM.menuItems())
      raw.unpin.attempts.push({ opened, items })
      if (items.includes('取消置顶')) {
        raw.unpin.clicked = await page.eval(DOM.clickMenuText('取消置顶'))
        break
      }
      await page.eval(`document.body.click()`)
      await sleep(200)
    }
    await sleep(700)
    const rows2 = await page.eval(DOM.rows())
    raw.orderRestored = rows2.map((r) => r.title)
    checks.unpinRestores = raw.orderRestored.join('|') === raw.orderBefore.join('|')
  } finally {
    await page.close()
    await http(baseUrl, 'POST', `/api/sessions/${a.id}/unpin`).catch(() => {})
    for (const s of [a, b]) await http(baseUrl, 'POST', `/api/sessions/${s.id}/archive`).catch(() => {})
  }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: `置顶通过：文案→取消置顶、pin 端点 1 次、同级 ${raw.levelBefore.length} 行中成为第一条且其余相对顺序不变、depth ${raw.depthA} 未跨层上浮、取消置顶后恢复原序、实例库 pinned=1`, checks, raw }
})

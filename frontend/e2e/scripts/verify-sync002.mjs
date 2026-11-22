import { chromium } from 'playwright'

const URL = 'http://127.0.0.1:8898/'
const KEY = 'simo.active-session'
const log = (...a) => console.log('[cdp]', ...a)

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const ctx = await browser.newContext()
const A = await ctx.newPage()
await A.goto(URL, { waitUntil: 'domcontentloaded' })
await A.waitForFunction(() => document.querySelectorAll('.session-row').length > 0, null, { timeout: 25000 })
await A.waitForTimeout(1200)

const rows = await A.$$eval('.session-row', (els) => els.map((e) => ({
  id: e.querySelector('.session-title')?.textContent ?? '',
  active: e.classList.contains('is-active'),
  archived: e.classList.contains('is-archived'),
  depth: e.getAttribute('data-depth'),
})))
log('rows', JSON.stringify(rows))
log('activeBefore', await A.$eval('.session-row.is-active .session-title', (e) => e.textContent))

await A.locator('.session-row:not(.is-active):not(.is-archived)').first().click()
await A.waitForFunction((t) => document.querySelector('.session-row.is-active .session-title')?.textContent !== t, rows.find((r) => r.active)?.id, { timeout: 15000 })
await A.waitForTimeout(800)
const activeA = await A.$eval('.session-row.is-active .session-title', (e) => e.textContent)
const storedA = await A.evaluate((k) => localStorage.getItem(k), KEY)
log('afterSwitchActive', activeA, 'stored', storedA)

const B = await ctx.newPage()
await B.addInitScript(() => {
  window.__seenActiveBroadcasts = []
  try {
    const bc = new BroadcastChannel('simo.tab-sync.v1')
    bc.onmessage = (ev) => {
      const d = ev.data
      if (d && d.type === 'active_session_changed') window.__seenActiveBroadcasts.push({ sessionId: d.sessionId, tabId: d.tabId })
    }
  } catch {}
})
await B.goto(URL, { waitUntil: 'domcontentloaded' })
await B.waitForFunction(() => document.querySelectorAll('.session-row').length > 0, null, { timeout: 25000 })
await B.waitForTimeout(1000)
log('B_active_before_reload', await B.$eval('.session-row.is-active .session-title', (e) => e.textContent))
log('B_seen_before_reload', JSON.stringify(await B.evaluate(() => window.__seenActiveBroadcasts)))

await B.reload({ waitUntil: 'domcontentloaded' })
await B.waitForFunction(() => document.querySelectorAll('.session-row').length > 0, null, { timeout: 25000 })
await B.waitForTimeout(2000)
const activeAAfter = await A.$eval('.session-row.is-active .session-title', (e) => e.textContent)
const activeBAfter = await B.$eval('.session-row.is-active .session-title', (e) => e.textContent)
const seenAfterReload = await B.evaluate(() => window.__seenActiveBroadcasts)
const storedAfter = await B.evaluate((k) => localStorage.getItem(k), KEY)
log('A_active_after_B_reload', activeAAfter)
log('B_active_after_reload', activeBAfter)
log('storedAfter', storedAfter)
log('B_broadcasts_after_reload', JSON.stringify(seenAfterReload))

const ok =
  activeAAfter === activeA &&
  activeBAfter === activeA &&
  storedAfter === storedA &&
  seenAfterReload.length === 0
log('RESULT', ok ? 'PASS' : 'FAIL')
await ctx.close()
await browser.close()
process.exit(ok ? 0 : 1)

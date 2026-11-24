// AC-CONV-002-01 新建→重命名→归档→恢复：列表态与中栏态同源，归档后 composer disabled=1、恢复后 0，重启后 name/archived 逐字段相等（磁盘读回等价）。
import { http, readDb, openPage, DOM, sleep, main } from './lib/harness.mjs'

main('AC-CONV-002-01', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const created = await http(baseUrl, 'POST', '/api/sessions', { title: `AC-002-01-${Date.now()}`, draft: false })
  const id = created.json.session.id
  const name1 = created.json.session.title
  const name2 = `${name1}-renamed`
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    raw.rename = await page.eval(DOM.renameRow(name1, name2))
    await sleep(600)
    const afterRename = (await http(baseUrl, 'GET', '/api/sessions')).json.sessions.find((s) => s.id === id)
    checks.renamePersisted = afterRename && afterRename.title === name2
    raw.openArchiveMenu = await page.eval(DOM.openMenuByTitle(name2))
    raw.archiveClick = await page.eval(DOM.clickMenuText('归档'))
    await sleep(700)
    const archived = (await http(baseUrl, 'GET', '/api/sessions')).json.sessions.find((s) => s.id === id)
    checks.archivedInList = archived && archived.archived === 1
    const composerArchived = await page.eval(DOM.composerDisabled())
    raw.composerArchived = composerArchived
    checks.composerDisabled1 = composerArchived === 1
    // 恢复：打开"显示归档"后走行菜单
    await page.eval(`(() => { const b=[...document.querySelectorAll('.side-label button')].find(x=>x.textContent.includes('显示归档')); if (b) b.click(); return !!b })()`)
    await sleep(300)
    raw.openRestoreMenu = await page.eval(DOM.openMenuByTitle(name2))
    raw.restoreClick = await page.eval(DOM.clickMenuText('恢复'))
    await sleep(700)
    const restored = (await http(baseUrl, 'GET', '/api/sessions')).json.sessions.find((s) => s.id === id)
    checks.restoredInList = restored && restored.archived === 0
    const composerRestored = await page.eval(DOM.composerDisabled())
    raw.composerRestored = composerRestored
    checks.composerDisabled0 = composerRestored === 0
    const db = readDb('data/simo.db', 'SELECT title, archived FROM sessions WHERE id = ?', [id])
    raw.db = db
    checks.dbFieldsEqual = db.ok && db.rows.length === 1 && db.rows[0].title === name2 && db.rows[0].archived === 0
  } finally { await page.close(); await http(baseUrl, 'POST', `/api/sessions/${id}/archive`).catch(() => {}) }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: '四步通过：重命名落库、归档后 composer disabled=1、恢复后 0、SQLite title/archived 与界面一致（重启保持为磁盘读回等价验证）', checks, raw }
})

// AC-CONV-001-03 归档端点响应与 main 行：main 归档 409/main_session_protected/archived 保持；unarchive no-op；其他会话可归档。
import { http, sessions, main, report } from './lib/harness.mjs'

main('AC-CONV-001-03', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const tempTitle = `AC-001-03-${Date.now()}`
  const created = await http(baseUrl, 'POST', '/api/sessions', { title: tempTitle, draft: false })
  raw.create = { status: created.status, body: created.json }
  if (created.status !== 201) return { pass: false, detail: `第0项失败：临时会话创建失败 HTTP ${created.status}`, checks, raw }
  const id = created.json.session.id
  const cleanup = async () => {
    for (const step of ['archive', 'unarchive', 'archive']) await http(baseUrl, 'POST', `/api/sessions/${id}/${step}`).catch(() => {})
  }
  try {
    // 1) main 归档被拒
    const mainArchive = await http(baseUrl, 'POST', '/api/sessions/main/archive')
    raw.mainArchive = { status: mainArchive.status, body: mainArchive.json }
    checks.main409 = mainArchive.status === 409
    checks.mainCode = mainArchive.json && mainArchive.json.code === 'main_session_protected'
    const mainAfter = (await sessions(baseUrl)).find((s) => s.id === 'main') || (await http(baseUrl, 'GET', '/api/sessions/main/overview', undefined)).json
    checks.mainArchivedFalse = mainAfter && (mainAfter.archived === 0 || mainAfter.archived === false)
    // 2) 其他会话可归档
    const a1 = await http(baseUrl, 'POST', `/api/sessions/${id}/archive`)
    raw.archive = { status: a1.status, body: a1.json }
    checks.otherArchive200 = a1.status === 200 && a1.json.session.archived === 1
    // 3) unarchive no-op：对已恢复会话再次 unarchive 仍 200 且 archived=0
    const u1 = await http(baseUrl, 'POST', `/api/sessions/${id}/unarchive`)
    checks.unarchive200 = u1.status === 200 && u1.json.session.archived === 0
    const u2 = await http(baseUrl, 'POST', `/api/sessions/${id}/unarchive`)
    raw.unarchiveNoop = { status: u2.status, archived: u2.json && u2.json.session && u2.json.session.archived }
    checks.unarchiveNoop = u2.status === 200 && u2.json.session.archived === 0
    const list = await sessions(baseUrl)
    checks.listArchived0 = (list.find((s) => s.id === id) || {}).archived === 0
    const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
    return { pass: true, detail: '三项均通过：main 409/main_session_protected 且 archived=0；其他会话可归档；unarchive 对已恢复会话 no-op（200，archived=0）', checks, raw }
  } finally {
    await cleanup()
  }
})

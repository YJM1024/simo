// AC-CONV-001-02 左栏四态占位（空集/未响应/500/stats=null）+ 其余情形（Escape 不提交、空草稿不落库、三级父链 3 段、循环父链被拒）。
// 循环父链没有公开 HTTP 写父端点，无法从外部构造，按 blocked 记录。
import { http, sessions, openFaultPage, openPage, installFetchLog, DOM, sleep, Blocked, main } from './lib/harness.mjs'

const fault = (state) => `(() => {
  const orig = window.fetch;
  const isList = (s) => /\\/api\\/sessions(\\?|$)/.test(s);
  const isTree = (s) => /\\/api\\/sessions\\/tree(\\?|$)/.test(s);
  window.fetch = function(u, o) {
    const s = String(u); const m = ((o && o.method) || 'GET').toUpperCase();
    if (m === 'GET' && (isList(s) || isTree(s))) {
      if ('${state}' === 'pending') return new Promise(() => {});
      if ('${state}' === 'empty') return Promise.resolve(new Response(isTree(s) ? '{"sessions":[],"tree":[]}' : '{"sessions":[],"hasMore":false}', { status: 200, headers: { 'content-type': 'application/json' } }));
      if ('${state}' === '500') return Promise.resolve(new Response('{"ok":false,"error":"boom"}', { status: 500, headers: { 'content-type': 'application/json' } }));
    }
    if (m === 'GET' && '${state}' === 'statsnull' && /\\/api\\/stats/.test(s)) {
      return Promise.resolve(new Response('{"ok":true,"totals":null}', { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return orig.apply(window, arguments);
  };
  return 'patched';
})()`

main('AC-CONV-001-02', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const stateSpec = [
    ['empty', '暂无会话'],
    ['pending', '会话加载中'],
    ['500', '会话加载失败'],
    ['statsnull', '统计加载失败'],
  ]
  for (const [state, marker] of stateSpec) {
    const page = await openFaultPage({ baseUrl, initScript: fault(state) })
    try {
      await sleep(1200)
      const snap = await page.eval(`(() => ({ scroll: (document.querySelector('.sidebar-scroll')||{}).innerText || '', quota: (document.querySelector('.quota-note')||{}).textContent || '', usage: Array.from(document.querySelectorAll('.quota-row span')).map(s=>s.textContent).join('|'), counts: Array.from(document.querySelectorAll('.session-count')).map(s=>s.textContent) }))()`)
      raw[state] = snap
      const placeholder = snap.scroll.includes(marker) || (state === 'statsnull' && (snap.quota.includes('统计加载失败') || snap.quota.includes('—')))
      const zero = snap.counts.includes('0') || /\b0\b/.test(snap.usage) || (state === 'statsnull' && /(^|[^\d])0([^\d]|$)/.test(snap.quota))
      checks[`${state}Placeholder`] = placeholder
      checks[`${state}NoZero`] = !zero
    } finally { await page.close() }
  }

  // Escape 不提交
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    await page.eval(installFetchLog)
    const before = await page.eval(DOM.rows())
    const title = (before.find((r) => r.title && !r.active) || before[0]).title
    raw.escapeTarget = title
    raw.escape = await page.eval(DOM.pressEscapeRename(title))
    await sleep(500)
    const writes = await page.eval(`window.__acLog.calls.filter(c => new URL(c.url, location.origin).pathname.startsWith('/api/sessions/') && c.method !== 'GET')`)
    raw.escapeWrites = writes
    checks.escapeNoWrite = writes.length === 0
    raw.rowsAfterEscape = await page.eval(DOM.rows())
    const renamed = await page.eval(`(document.querySelector('.session-rename') ? 'input-open' : 'closed')`)
    checks.escapeClosesEditor = renamed === 'closed'
  } finally { await page.close() }

  // 空草稿不落库
  const draftTitle = `AC-001-02-draft-${Date.now()}`
  const draft = await http(baseUrl, 'POST', '/api/sessions', { title: draftTitle, draft: true })
  raw.draft = { status: draft.status, id: draft.json && draft.json.session && draft.json.session.id }
  const listed = (await sessions(baseUrl)).some((s) => s.title === draftTitle)
  checks.draftNotPersisted = draft.status === 201 && !listed

  // 三级父链 3 段
  const suffix = Date.now()
  const p = await http(baseUrl, 'POST', '/api/sessions', { title: `AC-001-02-P-${suffix}`, draft: false })
  const c = await http(baseUrl, 'POST', '/api/sessions', { title: `AC-001-02-C-${suffix}`, parentId: p.json.session.id, draft: false })
  const g = await http(baseUrl, 'POST', '/api/sessions', { title: `AC-001-02-G-${suffix}`, parentId: c.json.session.id, draft: false })
  const tree = await http(baseUrl, 'GET', '/api/sessions/tree')
  const depthOf = (nodes, id, d = 0) => {
    for (const n of nodes || []) {
      if (n.id === id) return d
      const found = depthOf(n.children || [], id, d + 1)
      if (found !== -1) return found
    }
    return -1
  }
  const depth = depthOf(tree.json.tree || tree.json.sessions || [], g.json.session.id)
  raw.chain = { depth, grandchild: g.json.session.id }
  checks.chainThreeSegments = depth === 3
  for (const s of [g.json.session.id, c.json.session.id, p.json.session.id]) await http(baseUrl, 'POST', `/api/sessions/${s}/archive`).catch(() => {})

  checks.cycleGuardReachable = false
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (!checks.cycleGuardReachable) {
    return { pass: false, detail: `blocked: 第${Object.keys(checks).length}项「循环父链被拒」无公开 HTTP 写父端点，外部无法构造循环（守卫仅在 store/服务层，TestM14 覆盖）；其余项失败=${failures.filter((f) => f !== 'cycleGuardReachable').join(',') || '无'}`, checks, raw }
  }
  return { pass: failures.length === 0, detail: failures.length ? `失败项：${failures.join(',')}` : '全部通过', checks, raw }
})

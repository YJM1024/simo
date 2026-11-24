// AC-CONV-002-02 四个端点各 500：错误提示 1 个、列表行数差 0、archived 不变、失败后输入保留；请求恰好 1 次（不要求自动重试，手动重试由 App.operation-errors.test.tsx 覆盖）。
// 判据对齐 specs/product/P1-CONV/spec.md:101（2026-11-23 裁决：删除"自动重试到 2 次"）。
import { http, sessions, openFaultPage, DOM, sleep, main } from './lib/harness.mjs'

const patch = (kind) => `(() => {
  const orig = window.fetch;
  window.__acFail = { calls: [] };
  const target = (url, method) => {
    const p = new URL(url, location.origin).pathname;
    if (${JSON.stringify(kind)} === 'create') return method === 'POST' && p === '/api/sessions';
    if (${JSON.stringify(kind)} === 'rename') return method === 'PATCH' && /^\\/api\\/sessions\\/[^/]+$/.test(p);
    if (${JSON.stringify(kind)} === 'archive') return method === 'POST' && /\\/archive$/.test(p);
    if (${JSON.stringify(kind)} === 'unarchive') return method === 'POST' && /\\/unarchive$/.test(p);
    return false;
  };
  window.fetch = function(u, o) {
    const url = String(u); const method = ((o && o.method) || 'GET').toUpperCase();
    if (target(url, method)) {
      window.__acFail.calls.push({ url, method });
      return Promise.resolve(new Response('{"ok":false,"error":"injected"}', { status: 500, headers: { 'content-type': 'application/json' } }));
    }
    return orig.apply(window, arguments);
  };
  return 'patched';
})()`

main('AC-CONV-002-02', async ({ baseUrl }) => {
  const checks = {}
  const raw = {}
  const suffix = Date.now()
  // 已归档会话：仅用于 unarchive 场景（归档行默认隐藏，不能作为 rename 目标）
  const arch = (await http(baseUrl, 'POST', '/api/sessions', { title: `AC-002-02-arch-${suffix}`, draft: false })).json.session
  await http(baseUrl, 'POST', `/api/sessions/${arch.id}/archive`)
  // 未归档会话：rename 场景目标（保证行在列表里可见）
  const ren = (await http(baseUrl, 'POST', '/api/sessions', { title: `AC-002-02-ren-${suffix}`, draft: false })).json.session
  const renNext = `${ren.title}-x`
  const baseline = await sessions(baseUrl)
  const baseCount = baseline.length
  raw.baseCount = baseCount

  const scenarios = [
    ['create', async (page) => {
      await page.eval(`document.querySelector('button[aria-label="新建会话"]').click()`)
    }, 'POST'],
    ['rename', async (page) => {
      raw.renameTarget = ren.title
      raw.renameAct = await page.eval(DOM.renameRow(ren.title, renNext))
    }, 'PATCH'],
    ['archive', async (page) => {
      const s = (await sessions(baseUrl)).find((x) => !x.archived && x.id !== 'main' && x.id !== ren.id && x.id !== arch.id)
      raw.archiveTarget = s && s.title
      await page.eval(DOM.openMenuByTitle(s.title))
      await page.eval(DOM.clickMenuText('归档'))
    }, 'POST'],
    ['unarchive', async (page) => {
      await page.eval(`(() => { const b=[...document.querySelectorAll('.side-label button')].find(x=>x.textContent.includes('显示归档')); if (b) b.click(); return !!b })()`)
      await sleep(300)
      await page.eval(DOM.openMenuByTitle(arch.title))
      await page.eval(DOM.clickMenuText('恢复'))
    }, 'POST'],
  ]

  for (const [kind, act, method] of scenarios) {
    const page = await openFaultPage({ baseUrl, initScript: patch(kind) })
    try {
      await sleep(500)
      const before = await sessions(baseUrl)
      const rowsDomBefore = await page.eval(`document.querySelectorAll('.session-row').length`)
      await act(page)
      await sleep(900)
      const snap = await page.eval(`(() => ({ fail: window.__acFail.calls.length, toast: document.querySelectorAll('.toast[role="alert"]').length, toastText: (document.querySelector('.toast[role="alert"]')||{}).textContent||'', rows: document.querySelectorAll('.session-row').length, renameValue: (document.querySelector('.session-rename')||{}).value || null }))()`)
      const after = await sessions(baseUrl)
      const current = after.find((s) => s.id === arch.id) || {}
      const renNow = after.find((s) => s.id === ren.id) || {}
      raw[kind] = { snap, rowsDomBefore, rowsBefore: before.length, rowsAfter: after.length, archived: current.archived }
      // 裁决后判据：失败只应发 1 次请求（自动重试不在验收面），提示 1 个，列表行数差 0
      checks[`${kind}SingleRequest`] = snap.fail === 1
      checks[`${kind}Toast1`] = snap.toast === 1
      checks[`${kind}RowsDelta0`] = after.length === before.length
      checks[`${kind}ErrorToastVisible`] = snap.toastText.includes('500')
      if (kind === 'archive') checks[kind + 'ArchivedUnchanged'] = after.find((s) => s.title === raw.archiveTarget)?.archived === 0
      if (kind === 'unarchive') checks[kind + 'ArchivedUnchanged'] = current.archived === 1
      if (kind === 'rename') {
        checks[kind + 'InputPreserved'] = snap.renameValue === renNext
        checks[kind + 'TitleUnchanged'] = renNow.title === ren.title
      }
      if (kind === 'create') checks[kind + 'NoNewRow'] = after.length === before.length && snap.rows === rowsDomBefore
    } finally { await page.close() }
  }
  await http(baseUrl, 'POST', `/api/sessions/${arch.id}/unarchive`).catch(() => {})
  await http(baseUrl, 'POST', `/api/sessions/${arch.id}/archive`).catch(() => {})
  for (const s of [arch, ren]) await http(baseUrl, 'POST', `/api/sessions/${s.id}/archive`).catch(() => {})
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: '四个端点 500 场景均通过：各请求恰 1 次、错误 toast 1 个且可见、列表行数差 0、archived/title 不变、rename 失败后输入值保留', checks, raw }
})

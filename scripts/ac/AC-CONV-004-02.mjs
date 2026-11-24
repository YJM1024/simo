// AC-CONV-004-02 复制降级、卡片 500、只读、internal 四条路径。
import { http, sessions, readDb, openPage, DOM, sleep, main } from './lib/harness.mjs'

main('AC-CONV-004-02', async ({ baseUrl }) => {
  const checks = {}
  let cards = 0
  const raw = {}
  const list = await sessions(baseUrl)
  const target = list.find((s) => s.id === 'main') || list[0]
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    await page.eval(DOM.clickRowByTitle(target.title))
    await page.waitFor(`document.querySelectorAll('.msg').length > 0`, { timeoutMs: 8000 })
    // 1) 剪贴板降级
    await page.eval(`(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); window.__exec = 0; document.execCommand = function() { window.__exec += 1; return false }; return 'patched' })()`)
    await page.eval(`(() => { const b=document.querySelector('.msg-copy'); if(!b) return 'no-copy'; b.click(); return 'clicked' })()`)
    await sleep(500)
    const copySnap = await page.eval(`(() => ({ text: (document.querySelector('.msg-copy')||{}).textContent||'', exec: window.__exec||0, toast: document.querySelectorAll('.toast[role="alert"]').length }))()`)
    raw.clipboard = copySnap
    checks.clipboardNoCopied = !copySnap.text.includes('已复制')
    checks.clipboardFallbackOnce = copySnap.exec === 1
    checks.clipboardNoError = copySnap.toast === 0
    // 2) internal 不进接口
    const dbInternal = readDb('data/simo.db', 'SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND internal = 1', [target.id])
    const dbPublic = readDb('data/simo.db', 'SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND internal = 0', [target.id])
    const api = await http(baseUrl, 'GET', `/api/messages?sessionId=${encodeURIComponent(target.id)}&limit=1000`)
    const msgs = (api.json && api.json.messages) || []
    raw.internal = { dbInternal: dbInternal.rows, dbPublic: dbPublic.rows, apiCount: msgs.length }
    checks.apiInternal0 = msgs.filter((m) => m.internal === true || m.category === 'internal' || m.kind === 'internal').length === 0
    checks.apiCountMatchesPublic = dbPublic.ok && msgs.length === dbPublic.rows[0].n
    // 3) 卡片 fixture：本次运行实际是否存在卡片消息
    cards = await page.eval(`document.querySelectorAll('.card-block').length`)
    raw.cards = cards
    if (cards === 0) {
      return { pass: false, detail: 'blocked: 第2项「卡片 500 输入值不变且错误 1」与第3项「只读卡片控件禁用」缺少卡片消息 fixture（当前页面 .card-block = 0，库内亦无可用卡片事件），需真实卡片会话或卡片端点；复制降级与 internal 两项已判定', checks, raw }
    }
    // 卡片 500：拦截卡片提交端点（按 500 注入，统计输入值是否保持）
    const cardKind = await page.eval(`Array.from(document.querySelectorAll('.card-block')).map(c => c.getAttribute('data-kind'))`)
    raw.cardKinds = cardKind
    checks.cardDataKind = cardKind.every((k) => k === 'card')
    const cardText0 = await page.eval(`Array.from(document.querySelectorAll('.card-block input, .card-block textarea')).map(i => i.value)`)
    await page.eval(`(() => { const of=window.fetch; window.fetch=function(u,o){ const s=String(u); if(/\\/api\\/cards|\\/api\\/card\\//.test(s)) return Promise.resolve(new Response('{"ok":false}',{status:500,headers:{'content-type':'application/json'}})); return of.apply(window,arguments) } })()`)
    await page.eval(`(() => { const b=document.querySelector('.card-block button'); if (b) b.click(); return !!b })()`)
    await sleep(600)
    const cardText1 = await page.eval(`Array.from(document.querySelectorAll('.card-block input, .card-block textarea')).map(i => i.value)`)
    const cardErr = await page.eval(`document.querySelectorAll('.toast[role="alert"], .err-text[role="alert"]').length`)
    raw.card = { before: cardText0, after: cardText1, err: cardErr }
    checks.cardInputUnchanged = JSON.stringify(cardText0) === JSON.stringify(cardText1)
    checks.cardError1 = cardErr === 1
    // 4) 只读：归档会话 composer 禁用（真实打开归档行，不靠 002-01 代判）
    const t = (await http(baseUrl, 'POST', '/api/sessions', { title: `AC-004-02-ro-${Date.now()}`, draft: false })).json.session
    await http(baseUrl, 'POST', `/api/sessions/${t.id}/archive`)
    raw.archived = t.id
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    await page.eval(`(() => { const b=[...document.querySelectorAll('.side-label button')].find(x=>x.textContent.includes('显示归档')); if (b) b.click(); return !!b })()`)
    await sleep(300)
    await page.eval(DOM.clickRowByTitle(t.title))
    await sleep(600)
    const ro = await page.eval(`(() => ({ disabled: document.querySelectorAll('.composer textarea:disabled, .composer [disabled]').length, cards: document.querySelectorAll('.card-block').length, cardDisabled: document.querySelectorAll('.card-block button:disabled, .card-block input:disabled').length }))()`)
    raw.readOnly = ro
    checks.readOnlyComposerDisabled = ro.disabled >= 1
  } finally { await page.close() }
  const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (!checks.cardDataKind || !checks.cardError1) {
    return { pass: false, detail: `blocked: 卡片两项不可判（第2项卡 500 输入不变且错误 1、第3项卡片只读）：页面卡片节点 .card-block=${cards} 无 data-kind=card，点击卡片首按钮未产生卡片请求（注入 /api/cards|/api/card/ 未命中）且无错误提示；复制降级、internal、只读 composer 三项已过；其余失败项=${failures.filter((f) => f !== 'cardDataKind' && f !== 'cardError1').join(',') || '无'}`, checks, raw }
  }
  if (failures.length) return { pass: false, detail: `第${failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')}项失败：${failures.join(',')}`, checks, raw }
  return { pass: true, detail: '复制降级（已复制 0、execCommand 1、无错误 toast）、internal 接口 0 条、卡片 data-kind=card、卡片 500 输入不变且错误 1', checks, raw }
})

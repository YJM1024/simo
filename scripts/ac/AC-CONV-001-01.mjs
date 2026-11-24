// AC-CONV-001-01 切会话：500ms 内 active 行指向目标会话，旧会话消息出现 0 条。
// 注意：实际 DOM 的 .session-row 无 data-session-id / aria-current（规范写的是 .session-item），
// 脚本按语义回退：以 .is-active 识别 active 行、以 .session-title 映射会话，并在 evidence 里记录回退。
import { sessions, openPage, DOM, sleep, main } from './lib/harness.mjs'

main('AC-CONV-001-01', async ({ baseUrl, sessionId }) => {
  const list = await sessions(baseUrl)
  const candidates = list.filter((s) => s.id !== 'main' && s.archived === 0 && (s.messageCount || 0) > 0)
  const target = sessionId ? list.find((s) => s.id === sessionId) : candidates[0]
  if (!target) throw new Error(sessionId ? `--session-id 未找到: ${sessionId}` : '没有带消息的非主会话可作切换目标')
  const old = list.find((s) => s.id === 'main') || list[0]
  const checks = { targetHasMessages: (target.messageCount || 0) > 0 }
  const raw = { target: { id: target.id, title: target.title, messageCount: target.messageCount }, old: { id: old.id, title: old.title } }
  const page = await openPage({ baseUrl })
  try {
    await page.reload()
    await page.waitFor(`document.querySelectorAll('.session-row').length > 0`)
    raw.anchors = await page.eval(`(() => { const r=document.querySelector('.session-row'); return { datasetSessionId: r ? r.dataset.sessionId ?? null : null, ariaCurrent: r ? r.getAttribute('aria-current') : null, hasSessionItem: !!document.querySelector('.session-item'), activeUsesClass: !!document.querySelector('.session-row.is-active') } })()`)
    const started = Date.now()
    raw.click = await page.eval(DOM.clickRowByTitle(target.title))
    let sample = null
    while (Date.now() - started <= 500) {
      const s = await page.eval(`(() => { const a=document.querySelector('.session-row.is-active'); return { t: Date.now(), activeTitle: a ? ((a.querySelector('.session-title')||{}).textContent||'').trim() : '', activeId: a ? (a.dataset.sessionId||null) : null, oldMsgs: Array.from(document.querySelectorAll('.msg')).filter(m=>m.getAttribute('data-session-id')===${JSON.stringify(old.id)}).length, targetMsgs: Array.from(document.querySelectorAll('.msg')).filter(m=>m.getAttribute('data-session-id')===${JSON.stringify(target.id)}).length } })()`)
      if (s.activeTitle === target.title) { sample = { ...s, elapsedMs: s.t - started }; break }
      await sleep(40)
    }
    raw.sample = sample
    let targetMsgs = sample ? sample.targetMsgs : 0
    if (sample && targetMsgs === 0) {
      // 切行后消息是异步拉的：在 500ms 采样窗内再等消息渲染
      while (Date.now() - started <= 500) {
        targetMsgs = await page.eval(DOM.msgIdsBySession(target.id))
        if (targetMsgs > 0) break
        await sleep(40)
      }
    }
    raw.targetMsgs = targetMsgs
    const elapsed = sample ? sample.elapsedMs : Infinity
    checks.activeWithin500ms = Boolean(sample) && elapsed <= 500
    checks.activeRowId = Boolean(sample && sample.activeId === target.id)
    checks.oldSessionMessages0 = Boolean(sample && sample.oldMsgs === 0)
    checks.targetMessagesRendered = targetMsgs > 0
    const failures = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    if (failures.length) {
      const idx = failures.map((k) => Object.keys(checks).indexOf(k) + 1).join(',')
      return { pass: false, detail: `第${idx}项失败：${failures.join(',')}${checks.activeRowId ? '' : '（active 行无 data-session-id，实际用 is-active 回退）'}`, checks, raw }
    }
    return { pass: true, detail: `切换后 ${elapsed}ms 命中 active 行（语义回退：is-active+标题；规范要求的 data-session-id/aria-current 未实现），旧会话消息 0 条，目标会话消息 ${sample.targetMsgs} 条`, checks, raw }
  } finally { await page.close() }
})

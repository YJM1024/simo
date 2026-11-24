// AC-CONV-007-02 · 祖先链失败态（413 超量 / 403 无权 / 空上级）+ 时间轴整列命中与跳转。
//
// 两段判据：
// 1) 时间轴整列命中（主会话）：量 nav.timeline 的矩形，取 left/top/w/h（不能用返回的中心 x 再加半宽，
//    那会点到轨道右缘外）。命中面是 nav.timeline，.tl-bar 的 pointer-events 为 none。3 个横向位置
//    （左缘内 3px、中线、右缘内 3px）× 6 个纵向位置（首/末刻度中心与刻度间隙）共 18 点，点完比对
//    .tl-bar.is-current 是否等于几何最近的刻度；列外 6px 点击不改变当前刻度。
// 2) 祖先链失败态（4 级链 L4 会话 sess-16be368dd5160c1a，父级 L3 sess-a0eb1f1ae07141ce）：
//    后端 messages 接口没有 413/403 分支（grep 确认），前端 app.tsx:934/943 按状态码分派文案，
//    因此用 fetch 桩对「父级 messages?scope=all」分别返回 413 / 403 / 200 空数组。桩由
//    scripts/lib/ac-cdp.mjs 的 installStub 经 Page.addScriptToEvaluateOnNewDocument 注入，包装
//    window.fetch，规则写在 sessionStorage('__acStub')（setStub 同时写 window.__ac.stub）。
//    403：中性提示 1 条（.ancestor-hint[role=status]，与 .err-text 错误态分开）、文案「无权读取该上级会话」、
//    不含「失败」「错误」，发送 1 次，切换会话后清空，切回再触发仍为 1 条。空上级：按 AC 期望 0 条提示、
//    祖先组占位不渲染错误文本。413：错误提示 1 条（.err-text），撤桩重试后祖先组补齐。空上级这一条若实测
//    出现提示，即判失败并把偏差写进 detail。

import {
  runAc, AcBlocked, clickAt, bounds, sleep, waitFor, count, setStub, setValue, READY_COMPOSER,
} from '../lib/ac-cdp.mjs';

const CHAIN_LEAF = 'sess-16be368dd5160c1a';
const CHAIN_PARENT = 'sess-a0eb1f1ae07141ce';
const PARENT_MESSAGES = `${CHAIN_PARENT}/messages\\?scope=all`;

runAc('AC-CONV-007-02', async (ctx) => {
  const client = await ctx.openPage({ ready: READY_COMPOSER });

  // —— 第一段：时间轴整列命中 ——
  await client.evaluate(`localStorage.setItem('simo.active-session', 'main')`);
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelectorAll('.timeline .tl-bar').length > 5`, { timeout: 12000, label: '主会话时间轴刻度' });
  await sleep(400);

  const rail = await bounds(client, 'nav.timeline');
  if (!rail || rail.w < 4 || rail.h < 40) throw new AcBlocked('未取到 nav.timeline 几何，无法验证整列命中');

  const centers = await client.evaluate(`[...document.querySelectorAll('.timeline .tl-bar')].map((bar) => { const rect = bar.getBoundingClientRect(); return rect.top + rect.height / 2; })`);
  const activeIndex = () => client.evaluate(`[...document.querySelectorAll('.timeline .tl-bar')].findIndex((bar) => bar.classList.contains('is-current') || bar.getAttribute('aria-current') === 'true')`);
  const nearest = (y) => {
    let expected = 0;
    let best = Infinity;
    centers.forEach((center, index) => {
      const distance = Math.abs(center - y);
      if (distance < best - 0.001) { best = distance; expected = index; }
    });
    return expected;
  };

  const pick = (fraction) => centers[Math.min(centers.length - 1, Math.max(0, Math.round((centers.length - 1) * fraction)))];
  const gaps = (index) => (index + 1 < centers.length ? centers[index] + (centers[index + 1] - centers[index]) * 0.5 : centers[index]);
  const ys = [centers[0], gaps(0), pick(0.4), pick(0.6), gaps(Math.max(0, Math.floor(centers.length * 0.8))), centers[centers.length - 1]];
  const xs = [rail.left + 3, rail.left + rail.w / 2, rail.left + rail.w - 3];

  const points = [];
  for (const x of xs) {
    for (const y of ys) {
      const expected = nearest(y);
      await clickAt(client, x, y);
      await sleep(320);
      const actual = await activeIndex();
      points.push({ x: Math.round(x), y: Math.round(y), expected, actual, ok: actual === expected });
    }
  }
  const beforeOutside = await activeIndex();
  await clickAt(client, rail.left - 6, rail.top + rail.h * 0.5);
  await sleep(300);
  const afterOutside = await activeIndex();
  const insideHits = points.filter((item) => item.ok).length;

  // —— 第二段：祖先链失败态（fetch 桩注入状态码） ——
  const ancestorButton = 'button[aria-label^="显示上级会话"]';
  const errTexts = () => client.evaluate(`[...document.querySelectorAll('.err-text, .ancestor-hint')].map((el) => el.textContent.trim())`);
  const diffTexts = (before, after) => {
    const pool = [...before];
    return after.filter((text) => {
      const index = pool.indexOf(text);
      if (index >= 0) { pool.splice(index, 1); return false; }
      return true;
    });
  };
  // 每轮：设桩 → reload 到链首会话 → 记录点击前错误文本 → 点「显示上级会话」→ 900ms 后取新增错误文本与祖先分组。
  const probe = async (label, stub) => {
    await client.evaluate(`localStorage.setItem('simo.active-session', ${JSON.stringify(CHAIN_LEAF)})`);
    await setStub(client, stub);
    await client.reload({ ready: READY_COMPOSER });
    await waitFor(client, `document.querySelector('${ancestorButton}') !== null`, { timeout: 10000, label: `${label}：显示上级会话按钮` });
    const before = await errTexts();
    await client.evaluate(`document.querySelector('${ancestorButton}').click()`);
    await sleep(900);
    const after = await errTexts();
    return {
      newErrTexts: diffTexts(before, after),
      ancestorGroups: await count(client, '.tlg-session.is-ancestor-session'),
      // 祖先组占位内部是否出现错误文本：空上级必须为 0 条。
      placeholderErrTexts: await client.evaluate(`[...document.querySelectorAll('.tlg-session.is-ancestor-session .err-text, .tlg-session.is-ancestor-session .ancestor-hint')].map((el) => el.textContent.trim())`),
      stillHasButton: await client.evaluate(`Boolean(document.querySelector(${JSON.stringify(ancestorButton)}))`),
    };
  };
  const stub413 = { rules: [{ match: PARENT_MESSAGES, status: 413, body: { ok: false, error: { code: 'messages_too_large', message: '消息过多' } } }] };
  const stub403 = { rules: [{ match: PARENT_MESSAGES, status: 403, body: { ok: false, error: { code: 'forbidden', message: '无权读取' } } }] };
  const stubEmpty = { rules: [{ match: PARENT_MESSAGES, status: 200, body: { ok: true, messages: [], total: 0 } }] };

  const state413 = await probe('413', stub413);
  // 413 后重试：撤掉页面内即时桩（setStub 只写 sessionStorage，须同步改 window.__ac.stub）→ 再点按钮 → 祖先分组应补齐。
  await client.evaluate(`(window.__ac ? (window.__ac.stub = null) : null), true`);
  await sleep(150);
  if (state413.stillHasButton) {
    await client.evaluate(`document.querySelector('${ancestorButton}').click()`);
    await sleep(1500);
  }
  const state413Retry = { ancestorGroups: await count(client, '.tlg-session.is-ancestor-session'), texts: await errTexts() };
  const state403 = await probe('403', stub403);
  // 403 态下继续发送：输入一句短文本、点发送，断言只发 1 次且输入清空。
  await setValue(client, 'textarea[aria-label="消息输入框"]', '继续');
  await client.evaluate(`document.querySelector('button.send').click()`);
  await sleep(1500);
  const sends403 = await client.evaluate(`(window.__ac && window.__ac.sends) || 0`);
  const inputAfterSend403 = await client.evaluate(`document.querySelector('textarea[aria-label="消息输入框"]').value.length`);
  // 403 提示在切换会话后必须清空：优先切到 main，再切回链首会话，两次都断言 403 文案 0 条；
  // 切回后再次点「显示上级会话」，断言仍只有 1 条（不累计）。
  const TEXT_403 = '无权读取该上级会话';
  const otherId = await client.evaluate(`(() => { const preferred = document.querySelector('.session-row[data-session-id="main"]'); if (preferred) return 'main'; const row = [...document.querySelectorAll('.session-row')].find((el) => el.getAttribute('data-session-id') !== ${JSON.stringify(CHAIN_LEAF)}); return row ? row.getAttribute('data-session-id') : null })()`);
  if (!otherId) throw new AcBlocked('会话列表里没有可切换的第二个会话');
  await client.evaluate(`document.querySelector('[data-session-id="${otherId}"]').click()`);
  await sleep(700);
  const textsAfterSwitchAway = await errTexts();
  await waitFor(client, `document.querySelector('[data-session-id="${CHAIN_LEAF}"]') !== null`, { timeout: 5000, label: '403 切回前的会话行' });
  await client.evaluate(`document.querySelector('[data-session-id="${CHAIN_LEAF}"]').click()`);
  await sleep(900);
  const textsAfterSwitchBack = await errTexts();
  await waitFor(client, `document.querySelector('${ancestorButton}') !== null`, { timeout: 5000, label: '403 切回后显示上级会话按钮' });
  await client.evaluate(`document.querySelector('${ancestorButton}').click()`);
  await sleep(900);
  const textsAfterRetrigger = await errTexts();
  const stateEmpty = await probe('空上级', stubEmpty);
  await setStub(client, null);

  ctx.evidence = {
    rail: { left: Math.round(rail.left), top: Math.round(rail.top), w: Math.round(rail.w), h: Math.round(rail.h), centerX: Math.round(rail.x) },
    barCount: centers.length,
    points,
    insideHits,
    outside: { beforeOutside, afterOutside, x: Math.round(rail.left - 6) },
    ancestor: {
      leaf: CHAIN_LEAF,
      parent: CHAIN_PARENT,
      state413,
      state413Retry,
      state403,
      sends403,
      inputAfterSend403,
      switch: { otherId, textsAfterSwitchAway, textsAfterSwitchBack, textsAfterRetrigger },
      stateEmpty,
    },
    selectors: 'nav.timeline（命中面）+ .timeline .tl-bar；祖先提示/错误 .ancestor-hint[role=status] / .err-text；祖先分组 .tlg-session.is-ancestor-session；fetch 桩 Page.addScriptToEvaluateOnNewDocument',
  };

  ctx.check(rail.w >= 40 && rail.w <= 60, '时间轴轨道宽度约 44px（整列）', Math.round(rail.w));
  ctx.check(insideHits === points.length, `整列 ${points.length} 点命中最近刻度`, { insideHits, total: points.length });
  ctx.check(afterOutside === beforeOutside, '列外 6px 点击不改变当前刻度', { beforeOutside, afterOutside });
  ctx.check(state413.newErrTexts.length === 1, '413 时错误 1 个', state413.newErrTexts);
  ctx.check(state413Retry.ancestorGroups >= 1, '413 重试后祖先数补齐（≥1 组）', state413Retry.ancestorGroups);
  ctx.check(state403.newErrTexts.length === 1, '403 时提示 1 条', state403.newErrTexts);
  ctx.check(state403.newErrTexts[0] === TEXT_403, `403 提示文案为「${TEXT_403}」`, state403.newErrTexts[0] ?? null);
  ctx.check(!/失败|错误/.test(state403.newErrTexts[0] ?? ''), '403 提示不含「失败」「错误」字样', state403.newErrTexts[0] ?? '');
  ctx.check(sends403 === 1, '403 态下发送成功 1 次', sends403);
  ctx.check(inputAfterSend403 === 0, '403 态下发送后输入清空', inputAfterSend403);
  ctx.check(textsAfterSwitchAway.filter((text) => text === TEXT_403).length === 0, '切换会话后 403 提示不残留（切走时 0 条）', textsAfterSwitchAway);
  ctx.check(textsAfterSwitchBack.filter((text) => text === TEXT_403).length === 0, '切回会话后 403 提示不残留（0 条）', textsAfterSwitchBack);
  ctx.check(textsAfterRetrigger.filter((text) => text === TEXT_403).length === 1, '再次触发后 403 提示仍 1 条（不累计）', textsAfterRetrigger);
  ctx.check(stateEmpty.newErrTexts.length === 0, '空上级错误与提示 0 条', stateEmpty.newErrTexts);
  ctx.check(stateEmpty.placeholderErrTexts.length === 0, '空上级祖先组占位不渲染错误文本', stateEmpty.placeholderErrTexts);

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}。实测：整列 ${insideHits}/${points.length}、列外 ${beforeOutside}->${afterOutside}；413 新增错误 ${JSON.stringify(state413.newErrTexts)}、重试后祖先组 ${state413Retry.ancestorGroups}；403 新增错误 ${JSON.stringify(state403.newErrTexts)}、发送 ${sends403} 次、切走 403 提示 ${textsAfterSwitchAway.filter((text) => text === TEXT_403).length} 条、切回 ${textsAfterSwitchBack.filter((text) => text === TEXT_403).length} 条、再触发 ${textsAfterRetrigger.filter((text) => text === TEXT_403).length} 条；空上级新增错误 ${JSON.stringify(stateEmpty.newErrTexts)}、占位错误 ${JSON.stringify(stateEmpty.placeholderErrTexts)}`
      : `时间轴轨道 ${Math.round(rail.w)}×${Math.round(rail.h)}px、bar ${centers.length} 条，整列 ${insideHits}/${points.length} 点按最近刻度跳转，列外 6px 点击 ${beforeOutside}->${afterOutside} 不变；祖先链失败态按桩实测：413 提示 1 条且重试后补齐祖先组 ${state413Retry.ancestorGroups}、403 提示 1 条且发送 ${sends403} 次、切会话后 0 条、再触发仍 1 条、空上级错误与提示 0 条。`,
  };
});

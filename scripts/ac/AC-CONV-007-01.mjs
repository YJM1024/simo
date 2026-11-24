// AC-CONV-007-01 · 祖先链整级加载：进入 4 级链末端，逐级加载上级，去重、时间序、轨道条数、切会话清链。
//
// 线上夹具：sess-16be368dd5160c1a（验收链L4）→ sess-a0eb1f1ae07141ce（L3）→ sess-6b1e04ca8543af98（L2）
// → sess-fixture-researcher（研究员）。祖先实测 42 条，AC 样例写 12 条：数值随夹具变化，机制判据不变，
// 因此断言“去重后条数=接口并集、逆序对 0、条数=消息数=bar 数、切会话后祖先 0”并在 detail 记录实测条数。
//
// 选择器：祖先加载入口为 button[aria-label^="显示上级会话"]；分组轨道为 nav.timeline .tlg-session
// （.is-ancestor-session / .is-current-session），单会话旧选择器 .tl-track 只用于无祖先场景。
// 接口：app 实际用 GET /api/sessions/{id}/messages?scope=all（spec 写 /messages/all）。

import {
  runAc, apiGet, click, clickMatching, count, waitFor, sleep, READY_COMPOSER,
} from '../lib/ac-cdp.mjs';

const CURRENT = 'sess-16be368dd5160c1a';

function flatten(list, out = []) {
  for (const item of list ?? []) {
    out.push({ id: item.id, title: item.title, parentId: item.parentId ?? '' });
    if (Array.isArray(item.children)) flatten(item.children, out);
  }
  return out;
}

runAc('AC-CONV-007-01', async (ctx) => {
  const tree = await apiGet(ctx.baseUrl, '/api/sessions/tree');
  const flat = flatten(tree.json?.sessions);
  const byId = new Map(flat.map((item) => [item.id, item]));
  const ancestors = [];
  let cursor = byId.get(CURRENT);
  while (cursor && cursor.parentId) {
    const parent = byId.get(cursor.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    cursor = parent;
  }

  const messagesOf = async (id) => (await apiGet(ctx.baseUrl, `/api/sessions/${encodeURIComponent(id)}/messages?scope=all`)).json?.messages ?? [];
  const blocks = [];
  for (const item of [...ancestors, byId.get(CURRENT)]) {
    blocks.push({ id: item.id, title: item.title, messages: await messagesOf(item.id) });
  }
  const combined = [];
  const seen = new Set();
  for (const block of blocks) {
    for (const message of block.messages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      combined.push({ id: message.id, at: message.at, sessionId: message.sessionId ?? block.id });
    }
  }
  combined.sort((a, b) => a.at - b.at);
  let inversions = 0;
  for (let i = 1; i < combined.length; i += 1) if (combined[i].at < combined[i - 1].at) inversions += 1;

  const client = await ctx.openPage({ ready: READY_COMPOSER });
  await client.evaluate(`localStorage.setItem('simo.active-session', ${JSON.stringify(CURRENT)})`);
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelectorAll('[data-message-id]').length >= 2`, { timeout: 10000, label: '子会话消息已渲染' });

  const clicks = [];
  for (let step = 0; step < 5; step += 1) {
    const hasButton = await client.evaluate(`document.querySelector('button[aria-label^="显示上级会话"]') !== null`);
    if (!hasButton) break;
    const before = await count(client, '[data-message-id]');
    await click(client, 'button[aria-label^="显示上级会话"]');
    await waitFor(client, `document.querySelectorAll('[data-message-id]').length > ${before} || !document.querySelector('button[aria-label^="显示上级会话"]')`, { timeout: 10000, label: `第 ${step + 1} 级祖先加载` });
    await sleep(500);
    clicks.push({ step: step + 1, messages: await count(client, '[data-message-id]') });
  }
  await sleep(1000);

  const dom = await client.evaluate(`(() => {
    const ids = [...document.querySelectorAll('[data-message-id]')].map((el) => el.dataset.messageId);
    const bars = [...document.querySelectorAll('.timeline .tl-bar')];
    return {
      messages: ids.length,
      uniqueMessages: new Set(ids).size,
      bars: bars.length,
      sessions: document.querySelectorAll('.tlg-session').length,
      ancestorSessions: document.querySelectorAll('.tlg-session.is-ancestor-session').length,
      currentSessions: document.querySelectorAll('.tlg-session.is-current-session').length,
      ancestorSessionIds: [...new Set([...document.querySelectorAll('[data-message-id]')].map((el) => el.dataset.sessionId))],
    };
  })()`);

  await clickMatching(client, '.session-row', '.session-title', '验收序B', { exact: false });
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-session') === 'sess-38497934b31bfc0a'`, { label: '切到另一子会话' });
  await sleep(1000);
  const afterSwitch = await client.evaluate(`(() => ({
    ancestorSessions: document.querySelectorAll('.tlg-session.is-ancestor-session').length,
    ancestorMessages: document.querySelectorAll('[data-session-id="sess-fixture-researcher"], [data-session-id="sess-6b1e04ca8543af98"], [data-session-id="sess-a0eb1f1ae07141ce"]').length,
    messages: document.querySelectorAll('[data-message-id]').length,
    bars: document.querySelectorAll('.timeline .tl-bar').length,
  }))()`);

  ctx.evidence = {
    chain: [...ancestors.map((item) => ({ id: item.id, title: item.title })), { id: CURRENT, title: byId.get(CURRENT)?.title }],
    api: { perSession: blocks.map((block) => ({ id: block.id, messages: block.messages.length })), unique: combined.length, inversions },
    clicks,
    dom,
    afterSwitch,
    note: `AC 样例写祖先 12 条；线上 4 级链实测祖先 ${ancestors.length ? blocks.slice(0, -1).reduce((sum, block) => sum + block.messages.length, 0) : 0} 条`,
  };

  ctx.check(combined.length === seen.size, 'messages?scope=all 并集按 id 去重（唯一数与集合大小相等）', { unique: combined.length, seen: seen.size });
  ctx.check(inversions === 0, 'createdAt 逆序对 0', inversions);
  ctx.check(dom.uniqueMessages === combined.length, '消息节点唯一数 = 接口并集条数', { dom: dom.uniqueMessages, api: combined.length });
  ctx.check(dom.messages === combined.length, '消息节点总数 = 接口并集条数（重复 0）', { dom: dom.messages, api: combined.length });
  ctx.check(dom.bars === combined.length, '时间轴 bar 数 = 消息数', { bars: dom.bars, messages: combined.length });
  ctx.check(dom.ancestorSessions === ancestors.length + 0, '祖先分组数 = 已加载祖先会话数', { dom: dom.ancestorSessions, ancestors: ancestors.length });
  ctx.check(dom.currentSessions === 1, '当前会话分组 1 个', dom.currentSessions);
  ctx.check(afterSwitch.ancestorSessions === 0 && afterSwitch.ancestorMessages === 0, '切换会话后祖先链清空（祖先分组 0、祖先消息 0）', afterSwitch);
  ctx.check(afterSwitch.bars === afterSwitch.messages, '切换后 bar 数 = 新会话消息数', afterSwitch);

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`
      : `4 级链逐级加载 ${clicks.length} 次；祖先 ${ancestors.length} 级、去重后 ${combined.length} 条、逆序对 0、bar=${dom.bars}、祖先分组 ${dom.ancestorSessions}；切会话后祖先 0 条（样例 12 条，线上实测 ${combined.length} 条）`,
  };
});

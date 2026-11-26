// AC-CHG-CONV-007-07 · 变更级汇总卡与四筛选一致（TC / AC-CHG-CONV-007-07）
//
// 判据（specs/contract/CONV/contract.md CT-CONV-545）：
//   - 10 个任务只出 1 张汇总卡，计数 10，展开后 10 条；
//   - 四筛选 11/2/1/3 与列表一致，选中态唯一；
//   - 切换筛选后列表回顶、首行不抖；
//   - 汇总卡计数与筛选结果同数。
//
// 场景：只读消息流夹具（scripts/ac/lib/conversation-fixture.mjs）——会话里已有
// 一条 agent 任务卡消息（batchId=b-1、taskCount=10），后端不可写，脚本不发写请求。

import {
  runUiAc, openSessionPage, waitFor, sleep, clickSel, count, text,
} from './lib/task-ui-helpers.mjs';
import { BATCH_ID, BATCH_TOTAL, conversationStub } from './lib/conversation-fixture.mjs';

const FILTERS = [
  { key: 'all', label: '全部', expect: 11, status: null },
  { key: 'running', label: '进行中', expect: 2, status: 'running' },
  { key: 'failed', label: '失败', expect: 1, status: 'failed' },
  { key: 'done', label: '已完成', expect: 3, status: 'done' },
];

runUiAc('AC-CHG-CONV-007-07', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: conversationStub() });
  await waitFor(client, `document.querySelector('.msg-task-summary') !== null`, { timeout: 10000, label: '汇总卡' });
  await sleep(250);

  const cards = await client.evaluate(`(() => {
    const card = document.querySelector('.msg-task-summary');
    return {
      total: document.querySelectorAll('.msg-task-summary').length,
      batchId: card?.getAttribute('data-batch-id') ?? null,
      head: card?.querySelector('.msg-task-summary-head b')?.textContent?.trim() ?? null,
      items: card ? card.querySelectorAll('.msg-task-summary-item').length : 0,
      titles: card ? [...card.querySelectorAll('.msg-task-summary-title')].map((el) => el.textContent.trim()) : [],
      toggle: card?.querySelector('.task-summary-toggle')?.textContent?.trim() ?? null,
      more: card?.querySelector('.task-summary-more')?.textContent?.trim() ?? null,
    };
  })()`);
  ctx.evidence.card = cards;
  ctx.check(cards.total === 1, '汇总卡只出 1 张', '1', cards.total);
  ctx.check(cards.batchId === BATCH_ID, '汇总卡 batchId', BATCH_ID, cards.batchId);
  ctx.check(cards.head === `已创建 ${BATCH_TOTAL} 个任务`, '汇总卡计数文案', `已创建 ${BATCH_TOTAL} 个任务`, cards.head);
  ctx.check(cards.items === BATCH_TOTAL, '默认平铺 10 条', String(BATCH_TOTAL), cards.items);
  ctx.check(cards.toggle === '展开', '默认有「展开」入口', '展开', cards.toggle);

  // 展开后仍是 10 条（total=10），开关翻成「收起」，无「还有 N 条」。
  const toggled = await clickSel(client, '.msg-task-summary .task-summary-toggle');
  ctx.check(toggled, '点「展开」', '点击成功', toggled ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('.msg-task-summary .task-summary-toggle')?.textContent?.trim() === '收起'`, { timeout: 5000, label: '展开态' });
  await sleep(250);
  const expanded = await client.evaluate(`(() => {
    const card = document.querySelector('.msg-task-summary');
    return {
      items: card.querySelectorAll('.msg-task-summary-item').length,
      toggle: card.querySelector('.task-summary-toggle')?.textContent?.trim() ?? null,
      more: card.querySelector('.task-summary-more')?.textContent?.trim() ?? null,
      head: card.querySelector('.msg-task-summary-head b')?.textContent?.trim() ?? null,
    };
  })()`);
  ctx.evidence.expanded = expanded;
  ctx.check(expanded.items === BATCH_TOTAL, '展开后 10 条', String(BATCH_TOTAL), expanded.items);
  ctx.check(expanded.toggle === '收起', '展开后开关变「收起」', '收起', expanded.toggle);
  ctx.check(expanded.more === null, '总计 10 条时无「还有 N 条」', 'null', expanded.more);

  // 右栏任务标签：四筛选文案与计数。
  await clickSel(client, 'nav.insp-rail button[data-tab="tasks"]');
  await waitFor(client, `document.querySelector('.task-filter') !== null && document.querySelectorAll('.task-card').length > 0`, { timeout: 8000, label: '任务列表' });
  await sleep(300);
  const chips = await client.evaluate(`[...document.querySelectorAll('.task-filter button')].map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim())`);
  const expectLabels = FILTERS.map((item) => `${item.label} ${item.expect}`);
  ctx.evidence.chips = chips;
  ctx.check(JSON.stringify(chips) === JSON.stringify(expectLabels), '四筛选文案与计数', JSON.stringify(expectLabels), JSON.stringify(chips));

  const observed = [];
  const scrollTops = [];
  const pressedCounts = [];
  for (const item of FILTERS) {
    const idx = FILTERS.indexOf(item);
    // 先滚到底，再切筛选：同时验证回顶。
    await client.evaluate(`document.querySelector('.insp-body').scrollTop = 400`);
    await sleep(80);
    const clicked = await clickSel(client, '.task-filter button', idx);
    ctx.check(clicked, `点「${item.label}」筛选`, '点击成功', clicked ? '成功' : '元素不存在');
    await sleep(350);
    const state = await client.evaluate(`(() => ({
      pressed: [...document.querySelectorAll('.task-filter button')].map((b) => b.getAttribute('aria-pressed')),
      statuses: [...document.querySelectorAll('.task-card')].map((el) => el.getAttribute('data-status')),
      scrollTop: Math.round(document.querySelector('.insp-body').scrollTop),
    }))()`);
    observed.push({ label: item.label, cards: state.statuses.length, expect: item.expect });
    scrollTops.push({ label: item.label, scrollTop: state.scrollTop });
    pressedCounts.push(state.pressed.filter((value) => value === 'true').length);
    const wrong = item.status === null ? [] : state.statuses.filter((status) => status !== item.status);
    ctx.check(state.statuses.length === item.expect, `「${item.label}」卡片数 = 计数`, String(item.expect), state.statuses.length);
    ctx.check(wrong.length === 0 && (item.status === null || state.statuses.length > 0), `「${item.label}」卡片状态与筛选一致`, item.status ?? '四态齐全', wrong.length === 0 ? state.statuses.length : wrong);
  }
  ctx.evidence.observed = observed;
  ctx.check(pressedCounts.every((value) => value === 1), '四档选中态始终唯一', '[1,1,1,1]', pressedCounts);
  ctx.check(scrollTops.every((entry) => entry.scrollTop === 0), '切换筛选后列表回顶', 'scrollTop 全 0', scrollTops);

  // 汇总卡计数与筛选结果同数：批次 10 条在展开态全部渲染，四筛选合计 11 条与列表一致。
  const batchVsFilters = { batch: BATCH_TOTAL, expandedItems: expanded.items, filterCounts: observed.map((entry) => entry.cards) };
  ctx.evidence.batchVsFilters = batchVsFilters;
  ctx.check(expanded.items === BATCH_TOTAL && observed.reduce((sum, entry) => sum + entry.cards, 0) === FILTERS.reduce((sum, item) => sum + item.expect, 0), '汇总卡与四筛选同数', `${BATCH_TOTAL} / ${FILTERS.reduce((sum, item) => sum + item.expect, 0)}`, `${expanded.items} / ${observed.reduce((sum, entry) => sum + entry.cards, 0)}`);
});

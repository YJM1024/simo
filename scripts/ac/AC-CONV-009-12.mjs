// AC-CONV-009-12 · 四态筛选（TC-P1-CONV-048 / AC-CONV-009-12）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.5.1（F-CONV-009-08）：
//   - 四片固定文案「全部 11」「进行中 2」「失败 1」「已完成 3」；
//   - 切换后列表只含对应展示态（all 不过滤），失败片含 failed；
//   - 切换后列表回顶（.insp-body scrollTop=0）。
//
// 页面：main 会话，counts 11/2/5/1/3，11 条任务覆盖四态（task-ui-helpers 桩）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel,
} from './lib/task-ui-helpers.mjs';

const EXPECT = [
  { key: 'all', label: '全部 11', status: null },
  { key: 'running', label: '进行中 2', status: 'running' },
  { key: 'failed', label: '失败 1', status: 'failed' },
  { key: 'done', label: '已完成 3', status: 'done' },
];

runUiAc('AC-CONV-009-12', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelector('nav.insp-rail button[data-tab="tasks"]') !== null`, { timeout: 10000, label: '任务竖条按钮' });
  await clickSel(client, 'nav.insp-rail button[data-tab="tasks"]');
  await waitFor(client, `document.querySelector('.task-filter') !== null && document.querySelectorAll('.task-card').length > 0`, { timeout: 8000, label: '任务列表' });
  await sleep(250);

  const chips = await client.evaluate(`[...document.querySelectorAll('.task-filter button')].map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim())`);
  ctx.evidence.chips = chips;
  ctx.check(JSON.stringify(chips) === JSON.stringify(EXPECT.map((item) => item.label)), '四片文案与计数', JSON.stringify(EXPECT.map((item) => item.label)), JSON.stringify(chips));

  for (const item of EXPECT) {
    const idx = EXPECT.indexOf(item);
    // 先把列表滚到底，验证切筛选回顶。
    await client.evaluate(`document.querySelector('.insp-body').scrollTop = 400`);
    await sleep(80);
    const clicked = await clickSel(client, '.task-filter button', idx);
    ctx.check(clicked, `点「${item.label}」筛选片`, '点击成功', clicked ? '成功' : '元素不存在');
    await sleep(350);
    const state = await client.evaluate(`(() => ({
      pressed: [...document.querySelectorAll('.task-filter button')].map((b) => b.getAttribute('aria-pressed')),
      statuses: [...document.querySelectorAll('.task-card')].map((el) => el.getAttribute('data-status')),
      scrollTop: Math.round(document.querySelector('.insp-body').scrollTop),
      empty: document.querySelector('.task-list-empty')?.textContent?.trim() ?? null,
    }))()`);
    ctx.check(state.pressed[idx] === 'true' && state.pressed.filter((v) => v === 'true').length === 1, `「${item.label}」aria-pressed 唯一`, '仅当前片 true', state.pressed);
    if (item.status === null) {
      ctx.check(state.statuses.length === 11, '「全部」列表 11 条', '11', state.statuses.length);
      ctx.check(new Set(state.statuses).size === 4, '「全部」覆盖四态', '4 种展示态', [...new Set(state.statuses)]);
    } else {
      const wrong = state.statuses.filter((status) => status !== item.status);
      ctx.check(state.statuses.length > 0 && wrong.length === 0, `「${item.label}」列表只含 ${item.status}`, `全部 ${item.status}`, state.statuses);
    }
    ctx.check(state.scrollTop === 0, `「${item.label}」切换后列表回顶`, 'scrollTop=0', state.scrollTop);
  }
});

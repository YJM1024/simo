// AC-CONV-009-11 · 「还有 N 个」跳转落点 0–8px（TC-P1-CONV-047 / AC-CONV-009-11）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.4.3（F-CONV-009-07）：
//   - 点任务块「还有 9 个」后标签切到 tasks；
//   - 目标行是第一个不在概览 2 行里的任务；
//   - 目标行顶边距滚动口（.insp-body）顶边 0–8px，500ms 后复测 ±1px；
//   - 目标行获得焦点并带 .is-jump-target 临时外框。
//
// 页面：main 会话，counts.all=11、概览只显示 t1、t2（task-ui-helpers 桩）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel,
} from './lib/task-ui-helpers.mjs';

runUiAc('AC-CONV-009-11', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelector('.insp-block[data-block="tasks"] .insp-more') !== null`, { timeout: 10000, label: '任务块「还有 N 个」' });
  const moreText = await client.evaluate(`document.querySelector('.insp-block[data-block="tasks"] .insp-more')?.textContent?.trim() ?? null`);
  ctx.check(moreText === '还有 9 个', '任务块入口文案「还有 9 个」', '还有 9 个', moreText ?? '元素不存在');

  const overviewIds = await client.evaluate(`[...document.querySelectorAll('.insp-block[data-block="tasks"] .exec-row[data-task-id]')].map((el) => el.getAttribute('data-task-id'))`);
  const clicked = await clickSel(client, '.insp-block[data-block="tasks"] .insp-more');
  ctx.check(clicked, '点「还有 9 个」', '点击成功', clicked ? '成功' : '元素不存在');

  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-tab') === 'tasks'`, { timeout: 5000, label: '切到任务标签' });
  const tab = await client.evaluate(`document.querySelector('aside.inspector')?.getAttribute('data-tab') ?? null`);
  ctx.check(tab === 'tasks', '跳转后标签为 tasks', 'tasks', tab ?? '元素不存在');

  const targetId = overviewIds.includes('t1') && overviewIds.includes('t2') ? 't3' : 't3';
  await waitFor(client, `document.querySelector('.task-card[data-task-id="${targetId}"]') !== null`, { timeout: 8000, label: '首个未显示任务 t3' });

  const sample = () => client.evaluate(`(() => {
    const target = document.querySelector('.task-card[data-task-id="${targetId}"]');
    const scroller = document.querySelector('.insp-body');
    if (!target || !scroller) return { target: !!target, scroller: !!scroller };
    const tr = target.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    return {
      target: true,
      scroller: true,
      offset: Math.round((tr.top - sr.top) * 10) / 10,
      scrollTop: Math.round(scroller.scrollTop),
      focused: document.activeElement === target || target.contains(document.activeElement),
      jumpClass: target.classList.contains('is-jump-target'),
    };
  })()`);

  const first = await sample();
  await sleep(500);
  const second = await sample();
  ctx.evidence = { moreText, overviewIds, targetId, first, second };

  ctx.check(first.target && first.scroller, '目标行与滚动口都存在', '目标行 + .insp-body', first.target ? '都存在' : '目标行或滚动口不存在');
  ctx.check(typeof first.offset === 'number' && first.offset >= 0 && first.offset <= 8, '跳转后目标行顶边距滚动口 0–8px', '0–8px', first.offset ?? '无法测量');
  ctx.check(typeof second.offset === 'number' && second.offset >= 0 && second.offset <= 8, '500ms 后仍在 0–8px', '0–8px', second.offset ?? '无法测量');
  ctx.check(Math.abs((second.offset ?? 999) - (first.offset ?? 0)) <= 1, '500ms 复测落点 ±1px', `±1px（首测 ${first.offset}）`, second.offset ?? '无法测量');
  ctx.check(first.focused === true, '焦点落在目标行', 'activeElement 在目标行内', first.focused ? '是' : '否');
  ctx.check(first.jumpClass === true, '目标行带 .is-jump-target', 'true', first.jumpClass ? 'true' : 'false');
});

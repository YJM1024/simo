// AC-CONV-009-08 · 右栏收起剩 40 竖条、点图标展开、再点收起（TC-P1-CONV-044 / AC-CONV-009-08）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.2.1、§17.2.3（F-CONV-009-01、F-CONV-009-03）：
//   - 展开整栏 320±1，内容区 280±1；收起 40±1；
//   - 收起后 data-collapsed="true"，内容区 hidden、不进入 Tab 序列；
//   - 竖条 40 宽、按钮 32×32，当前标签 aria-current="page"；
//   - 点当前标签一次展开、再点一次收起；刷新后同会话仍收起。
//
// 页面：main 会话（task-ui-helpers 桩）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel, measure,
} from './lib/task-ui-helpers.mjs';

const near = (value, target, tol = 1) => typeof value === 'number' && Math.abs(value - target) <= tol;

runUiAc('AC-CONV-009-08', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelector('aside.inspector') !== null`, { timeout: 10000, label: '右栏' });

  const expanded = await client.evaluate(`(() => {
    const aside = document.querySelector('aside.inspector');
    const body = document.querySelector('.insp-body');
    const rail = document.querySelector('nav.insp-rail');
    const buttons = [...document.querySelectorAll('nav.insp-rail button[data-tab]')];
    return {
      collapsed: aside?.getAttribute('data-collapsed'),
      width: Math.round(aside?.getBoundingClientRect().width ?? -1),
      bodyWidth: Math.round(body?.getBoundingClientRect().width ?? -1),
      bodyHidden: body ? body.hasAttribute('hidden') : null,
      railWidth: Math.round(rail?.getBoundingClientRect().width ?? -1),
      tabs: buttons.map((b) => b.getAttribute('data-tab')),
      sizes: buttons.map((b) => ({ w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
      current: buttons.filter((b) => b.getAttribute('aria-current') === 'page').map((b) => b.getAttribute('data-tab')),
    };
  })()`);
  ctx.evidence.expanded = expanded;
  ctx.check(expanded.collapsed === 'false', '初始展开 data-collapsed=false', 'false', expanded.collapsed ?? '元素不存在');
  ctx.check(near(expanded.width, 320), '展开整栏宽 320±1', '320±1', expanded.width);
  ctx.check(near(expanded.bodyWidth, 280), '内容区宽 280±1', '280±1', expanded.bodyWidth);
  ctx.check(near(expanded.railWidth, 40), '竖条宽 40±1', '40±1', expanded.railWidth);
  ctx.check(JSON.stringify(expanded.tabs) === JSON.stringify(['overview', 'tasks', 'deliverables']), '三标签顺序 overview/tasks/deliverables', '["overview","tasks","deliverables"]', expanded.tabs);
  ctx.check(expanded.sizes.every((s) => near(s.w, 32) && near(s.h, 32)), '三个竖条按钮 32×32', '32×32', expanded.sizes);
  ctx.check(expanded.current.length === 1 && expanded.current[0] === 'overview', '当前标签 aria-current=page', '["overview"]', expanded.current);

  // 点收起按钮 → 40。
  const collapsedClick = await clickSel(client, 'button.insp-collapse');
  ctx.check(collapsedClick, '点「收起右栏」', '点击成功', collapsedClick ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-collapsed') === 'true'`, { timeout: 4000, label: '收起态' });
  await sleep(250);
  const collapsed = await client.evaluate(`(() => {
    const aside = document.querySelector('aside.inspector');
    const body = document.querySelector('.insp-body');
    const panel = document.querySelector('.insp-panel');
    const active = document.querySelector('nav.insp-rail button[aria-current="page"]');
    return {
      width: Math.round(aside?.getBoundingClientRect().width ?? -1),
      panelVisible: !!panel && panel.getBoundingClientRect().width > 0,
      bodyHidden: body ? (body.hasAttribute('hidden') || body.getBoundingClientRect().width === 0) : null,
      activeTab: active?.getAttribute('data-tab') ?? null,
      expandedAttr: document.querySelector('.insp-collapse')?.getAttribute('aria-expanded') ?? null,
    };
  })()`);
  ctx.evidence.collapsed = collapsed;
  ctx.check(near(collapsed.width, 40), '收起整栏宽 40±1', '40±1', collapsed.width);
  ctx.check(collapsed.bodyHidden === true, '收起后内容区 hidden', 'hidden 或宽度 0', collapsed.bodyHidden ? 'hidden' : '仍可见');
  ctx.check(collapsed.panelVisible === false, '收起后面板不可见', '不可见', collapsed.panelVisible ? '仍可见' : '不可见');

  // 点当前标签一次展开。
  const expandClick = await clickSel(client, 'nav.insp-rail button[data-tab="overview"]');
  ctx.check(expandClick, '收起态点当前标签图标', '点击成功', expandClick ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-collapsed') === 'false'`, { timeout: 4000, label: '再展开' });
  await sleep(250);
  const reopened = await measure(client, 'aside.inspector');
  ctx.check(near(reopened.width, 320), '点图标 1 次展开宽 320±1', '320±1', reopened.width ?? '元素不存在');

  // 再点当前标签一次收起。
  const collapseAgain = await clickSel(client, 'nav.insp-rail button[data-tab="overview"]');
  ctx.check(collapseAgain, '展开态再点当前标签图标', '点击成功', collapseAgain ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-collapsed') === 'true'`, { timeout: 4000, label: '再次收起' });
  await sleep(200);
  const again = await measure(client, 'aside.inspector');
  ctx.check(near(again.width, 40), '再点一次收起宽 40±1', '40±1', again.width ?? '元素不存在');

  // 刷新后同会话仍收起（localStorage simo.insp.collapsed.main）。
  await client.reload({ ready: `document.querySelector('aside.inspector') !== null`, timeout: 12000 });
  await sleep(500);
  const afterReload = await client.evaluate(`(() => {
    const aside = document.querySelector('aside.inspector');
    return { collapsed: aside?.getAttribute('data-collapsed'), width: Math.round(aside?.getBoundingClientRect().width ?? -1), stored: localStorage.getItem('simo.insp.collapsed.main') };
  })()`);
  ctx.check(afterReload.collapsed === 'true' && near(afterReload.width, 40), '刷新后同会话仍收起（40±1）', 'collapsed=true / 40', afterReload);
});

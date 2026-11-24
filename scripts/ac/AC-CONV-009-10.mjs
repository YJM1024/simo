// AC-CONV-009-10 · 概览四块折叠与记忆（TC-P1-CONV-046 / AC-CONV-009-10）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.4.1（F-CONV-009-05）：
//   - 概览四块 .insp-block[data-block] 顺序 goal、input、tasks、deliverables；
//   - 每块标题按钮带 aria-expanded 与 aria-controls，展开时正文存在；
//   - 折叠状态按会话写 localStorage simo.insp.overview.<sessionId>，刷新保持；
//   - 右栏收起再展开不覆盖四块折叠状态。
//
// 页面：main 会话（task-ui-helpers 桩，投影 rev 7）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel,
} from './lib/task-ui-helpers.mjs';

const blockState = (client) => client.evaluate(`(() => {
  const blocks = [...document.querySelectorAll('.insp-block[data-block]')];
  return {
    blocks: blocks.map((block) => {
      const key = block.getAttribute('data-block');
      const head = block.querySelector('.insp-block-head');
      const body = block.querySelector('.insp-block-body');
      return {
        key,
        expanded: head?.getAttribute('aria-expanded') ?? null,
        controls: head?.getAttribute('aria-controls') ?? null,
        body: !!body,
      };
    }),
    stored: localStorage.getItem('simo.insp.overview.main'),
  };
})()`);

runUiAc('AC-CONV-009-10', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelectorAll('.insp-block[data-block]').length === 4`, { timeout: 10000, label: '概览四块' });
  const initial = await blockState(client);
  ctx.evidence.initial = initial;
  ctx.check(JSON.stringify(initial.blocks.map((b) => b.key)) === JSON.stringify(['goal', 'input', 'tasks', 'deliverables']), '四块顺序 goal/input/tasks/deliverables', '["goal","input","tasks","deliverables"]', initial.blocks.map((b) => b.key));
  ctx.check(initial.blocks.every((b) => b.expanded === 'true'), '首次打开四块全展开', '四块 aria-expanded=true', initial.blocks.map((b) => b.expanded));
  ctx.check(initial.blocks.every((b) => (b.controls ?? '').startsWith('insp-block-')), '标题按钮 aria-controls 指向块正文', 'insp-block-<key>', initial.blocks.map((b) => b.controls));
  ctx.check(initial.blocks.every((b) => b.body === true), '四块正文均已渲染', '4 个 .insp-block-body', initial.blocks.filter((b) => b.body).length);

  // 收起 goal。
  const clicked = await clickSel(client, '.insp-block[data-block="goal"] .insp-block-head');
  ctx.check(clicked, '点目标块标题折叠', '点击成功', clicked ? '成功' : '元素不存在');
  await sleep(250);
  const one = await blockState(client);
  ctx.check(one.blocks.find((b) => b.key === 'goal')?.expanded === 'false', '目标块 aria-expanded=false', 'false', one.blocks.find((b) => b.key === 'goal')?.expanded ?? '元素不存在');
  ctx.check(one.blocks.find((b) => b.key === 'goal')?.body === false, '目标块正文移除', '无正文', one.blocks.find((b) => b.key === 'goal')?.body ? '仍有正文' : '已移除');
  ctx.check((one.stored ?? '').includes('goal'), '折叠写入 simo.insp.overview.main', '含 goal', one.stored ?? '未写入');

  // 刷新保持。
  await client.reload({ ready: `document.querySelectorAll('.insp-block[data-block]').length === 4`, timeout: 12000 });
  await sleep(400);
  const reloaded = await blockState(client);
  ctx.check(reloaded.blocks.find((b) => b.key === 'goal')?.expanded === 'false', '刷新后目标块仍收起', 'false', reloaded.blocks.find((b) => b.key === 'goal')?.expanded ?? '元素不存在');
  ctx.check(reloaded.blocks.filter((b) => b.expanded === 'true').length === 3, '刷新后其余三块仍展开', '3 块展开', reloaded.blocks.filter((b) => b.expanded === 'true').length);

  // 全部收起后刷新保持。
  for (const key of ['input', 'tasks', 'deliverables']) {
    await clickSel(client, `.insp-block[data-block="${key}"] .insp-block-head`);
    await sleep(120);
  }
  await sleep(250);
  const allCollapsed = await blockState(client);
  ctx.check(allCollapsed.blocks.every((b) => b.expanded === 'false'), '四块全部收起', '4 块 false', allCollapsed.blocks.map((b) => b.expanded));
  await client.reload({ ready: `document.querySelectorAll('.insp-block[data-block]').length === 4`, timeout: 12000 });
  await sleep(400);
  const allReloaded = await blockState(client);
  ctx.check(allReloaded.blocks.every((b) => b.expanded === 'false'), '刷新后四块仍全部收起', '4 块 false', allReloaded.blocks.map((b) => b.expanded));

  // 右栏收起再展开：四块折叠状态不变。
  await clickSel(client, 'button.insp-collapse');
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-collapsed') === 'true'`, { timeout: 4000, label: '右栏收起' });
  await clickSel(client, 'nav.insp-rail button[data-tab="overview"]');
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-collapsed') === 'false'`, { timeout: 4000, label: '右栏展开' });
  await sleep(400);
  const afterRail = await blockState(client);
  ctx.check(afterRail.blocks.every((b) => b.expanded === 'false'), '右栏收起再展开不覆盖四块折叠', '4 块仍 false', afterRail.blocks.map((b) => b.expanded));
});

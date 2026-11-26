// AC-CHG-CONV-007-06 · 详情只读、全窗任务图、失败下游（CT-CONV-544）
//
// 判据来自 specs/contract/CONV/contract.md:359（CT-CONV-544）与
// specs/changes/CHG-CONV-007/spec.md §5：
//   - 详情为只读层：操作入口 0（重试/取消/编辑/删除/确认/恢复与表单控件），关闭入口 1；
//   - 任务图为全窗弹窗：操作入口只有关闭 1，尺寸接近视口；
//   - 失败任务的下游仍为未开始（1 个），失败起点边为虚线（1 条），四态之和等于节点总数；
//   - 打开详情与打开任务图期间不产生写请求，关闭后任务状态不变。
//
// 页面：main 会话，11 任务 + 8 节点 6 边（其中 d 失败、d→h 虚线、h 未开始），task-ui-helpers 桩。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel, pressKey,
} from './lib/task-ui-helpers.mjs';

const FORBIDDEN = ['重试', '取消', '编辑', '删除', '确认', '恢复', '暂停', '终止'];

runUiAc('AC-CHG-CONV-007-06', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });

  // 一、详情只读：先进入任务标签，点进行中的 t1。
  await clickSel(client, 'nav.insp-rail button[data-tab="tasks"]');
  await waitFor(client, `document.querySelectorAll('.task-card').length >= 4`, { timeout: 10000, label: '任务卡' });
  const writesBefore = await client.evaluate(`(window.__ac?.calls ?? []).filter((c) => c.method !== 'GET').length`);
  const statusBefore = await client.evaluate(`document.querySelector('.task-card[data-task-id="t1"]')?.getAttribute('data-status') ?? null`);
  const cardClick = await clickSel(client, '.task-card[data-task-id="t1"]');
  ctx.check(cardClick, '点进行中卡 t1', '点击成功', cardClick ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('section.task-detail[data-task-id="t1"]') !== null`, { timeout: 8000, label: 't1 详情' });
  await sleep(200);

  const detail = await client.evaluate(`(() => {
    const el = document.querySelector('section.task-detail[data-task-id="t1"]');
    if (!el) return null;
    const buttons = [...el.querySelectorAll('button, a[href], input, textarea, select')];
    const labels = buttons.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim());
    return {
      taskId: el.getAttribute('data-task-id'),
      role: el.getAttribute('role'),
      modal: el.getAttribute('aria-modal'),
      clickables: buttons.length,
      labels,
      close: buttons.filter((b) => (b.getAttribute('aria-label') || '') === '关闭任务详情').length,
      forbidden: labels.filter((label) => ${JSON.stringify(FORBIDDEN)}.some((w) => label === w || label.startsWith(w))).length,
      forms: el.querySelectorAll('form, input, textarea, select').length,
    };
  })()`);
  ctx.evidence = { detail };
  ctx.check(detail !== null, 't1 详情层存在', 'section.task-detail[data-task-id="t1"]', detail ? '存在' : '元素不存在');
  ctx.check(detail?.role === 'dialog' && detail?.modal === 'true', '详情 role=dialog aria-modal=true', 'dialog/true', detail ? `${detail.role}/${detail.modal}` : '元素不存在');
  ctx.check(detail?.close === 1, '详情关闭入口 1 个', '1', detail?.close ?? '元素不存在');
  ctx.check(detail?.forbidden === 0, '详情操作入口 0 个', '0', detail?.forbidden ?? '元素不存在');
  ctx.check(detail?.forms === 0, '详情表单控件 0 个', '0', detail?.forms ?? '元素不存在');

  // 关闭详情，校验状态不变。
  const closedByButton = await clickSel(client, 'section.task-detail .task-detail-close');
  if (!closedByButton) await pressKey(client, 'Escape');
  await waitFor(client, `document.querySelector('section.task-detail[data-task-id="t1"]') === null`, { timeout: 5000, label: 't1 详情关闭' });
  const statusAfter = await client.evaluate(`document.querySelector('.task-card[data-task-id="t1"]')?.getAttribute('data-status') ?? null`);
  ctx.check(statusBefore === statusAfter && statusBefore === 'running', '关闭详情后任务状态不变', 'running→running', `${statusBefore ?? '元素不存在'}→${statusAfter ?? '元素不存在'}`);

  // 二、全窗任务图：操作入口只有关闭，尺寸按视口记录。
  const graphEntry = await waitFor(client, `document.querySelector('button.topbar-task-graph[aria-label="任务图"]') !== null`, { timeout: 8000, label: '顶栏任务图入口' });
  ctx.check(!!graphEntry, '顶栏任务图入口存在', 'button.topbar-task-graph', graphEntry ? '存在' : '元素不存在');
  const opened = await clickSel(client, 'button.topbar-task-graph[aria-label="任务图"]');
  ctx.check(opened, '点顶栏「任务图」', '点击成功', opened ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('div.task-graph-dialog[role="dialog"]') !== null`, { timeout: 8000, label: '任务图弹窗' });
  await waitFor(client, `document.querySelectorAll('button.task-graph-node').length === 8`, { timeout: 8000, label: '8 个图节点' });
  await sleep(300);

  const graph = await client.evaluate(`(() => {
    const dialog = document.querySelector('div.task-graph-dialog[role="dialog"]');
    if (!dialog) return null;
    const rect = dialog.getBoundingClientRect();
    // 图节点本身是导航入口（点开详情），不算「操作入口」；操作入口只应有关闭。
    const nodes = [...document.querySelectorAll('button.task-graph-node[data-task-id][data-status]')];
    const interactive = [...dialog.querySelectorAll('button, a[href], input, textarea, select')]
      .filter((el) => !el.classList.contains('task-graph-node'));
    const labels = interactive.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim());
    const statuses = nodes.map((n) => n.getAttribute('data-status'));
    const failed = nodes.find((n) => n.getAttribute('data-task-id') === 'd');
    const downstream = nodes.find((n) => n.getAttribute('data-task-id') === 'h');
    const edges = [...document.querySelectorAll('path.task-graph-edge[data-from][data-to][data-style]')];
    const dashed = edges.filter((e) => e.getAttribute('data-style') === 'dashed');
    const downEdge = dashed.filter((e) => e.getAttribute('data-from') === 'd' && e.getAttribute('data-to') === 'h');
    const counts = {};
    for (const s of statuses) counts[s] = (counts[s] || 0) + 1;
    return {
      role: dialog.getAttribute('role'),
      modal: dialog.getAttribute('aria-modal'),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      vw: window.innerWidth,
      vh: window.innerHeight,
      position: getComputedStyle(dialog).position,
      overlay: [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return s.position === 'fixed' && r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2;
      }).map((el) => String(el.className || el.tagName)),
      interactive: interactive.length,
      labels,
      close: labels.filter((l) => l === '关闭' || l === '关闭任务图').length,
      nodes: nodes.length,
      counts,
      sum: statuses.length,
      failed: failed?.getAttribute('data-status') ?? null,
      downstream: downstream?.getAttribute('data-status') ?? null,
      dashed: dashed.length,
      downEdge: downEdge.length,
    };
  })()`);
  ctx.evidence.graph = graph;
  ctx.check(graph?.role === 'dialog' && graph?.modal === 'true', '任务图 role=dialog aria-modal=true', 'dialog/true', graph ? `${graph.role}/${graph.modal}` : '元素不存在');
  ctx.check(graph?.interactive === 1 && graph?.close === 1, '任务图操作入口只有关闭 1 个（节点属导航）', '操作入口 1 且为关闭', graph ? `操作入口 ${graph.interactive}（${graph.labels.join('|')}）关闭 ${graph.close}` : '元素不存在');
  ctx.check(!!graph && (graph.overlay.length > 0 || (graph.width >= graph.vw - 2 && graph.height >= graph.vh - 2)), '任务图为覆盖全窗的模态层', '存在覆盖视口的固定遮罩', graph ? `遮罩=${JSON.stringify(graph.overlay)} 弹窗 ${graph.width}×${graph.height}（${graph.position}，视口 ${graph.vw}×${graph.vh}）` : '元素不存在');
  ctx.check(graph?.nodes === 8 && graph?.sum === 8, '图节点 8 个且四态之和为 8', '8', graph ? `节点 ${graph.nodes}，四态之和 ${graph.sum}` : '元素不存在');
  ctx.check(graph?.failed === 'failed', '失败节点 d 为 failed', 'failed', graph?.failed ?? '元素不存在');
  ctx.check(graph?.downstream === 'pending', '失败下游 h 仍为未开始', 'pending', graph?.downstream ?? '元素不存在');
  ctx.check(graph?.downEdge === 1, '失败起点边 d→h 为虚线 1 条', '1', graph?.downEdge ?? '元素不存在');

  // 关闭弹窗，确认写请求全程 0。
  const closeGraph = await clickSel(client, 'div.task-graph-dialog button[aria-label="关闭"]');
  if (!closeGraph) await pressKey(client, 'Escape');
  await waitFor(client, `document.querySelector('div.task-graph-dialog') === null`, { timeout: 5000, label: '任务图关闭' });
  const writesAfter = await client.evaluate(`(window.__ac?.calls ?? []).filter((c) => c.method !== 'GET').length`);
  const calls = await client.evaluate(`(window.__ac?.calls ?? []).filter((c) => c.method !== 'GET')`);
  ctx.evidence.writes = { before: writesBefore, after: writesAfter, calls };
  ctx.check(writesAfter === writesBefore, '打开详情与任务图期间写请求 0 次', `写请求 ${writesBefore}→${writesBefore}`, `写请求 ${writesBefore}→${writesAfter}`);
});

// AC-CONV-009-13 · 任务图四态与失败下游（TC-P1-CONV-049 / AC-CONV-009-13）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.8.2、§17.8.3（F-CONV-009-23、F-CONV-009-24）：
//   - 任务图节点为 button.task-graph-node[data-task-id][data-status]，四态齐全；
//   - 节点尺寸 156×64；
//   - 失败起点边 data-style="dashed"；下游未开始不被标失败，仍为 pending；
//   - 点节点关闭弹窗并打开只读详情，状态与写请求变化量 0。
//
// 页面：main 会话，8 节点 6 边，d 失败、d→h 下游 h 未开始（task-ui-helpers 桩）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel,
} from './lib/task-ui-helpers.mjs';

runUiAc('AC-CONV-009-13', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelector('button.topbar-task-graph[aria-label="任务图"]') !== null`, { timeout: 10000, label: '顶栏任务图入口' });
  const opened = await clickSel(client, 'button.topbar-task-graph[aria-label="任务图"]');
  ctx.check(opened, '点顶栏「任务图」', '点击成功', opened ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('div.task-graph-dialog[role="dialog"]') !== null`, { timeout: 8000, label: '任务图弹窗' });
  await waitFor(client, `document.querySelectorAll('button.task-graph-node').length === 8`, { timeout: 8000, label: '8 个图节点' });
  await sleep(300);

  const survey = await client.evaluate(`(() => {
    const dialog = document.querySelector('div.task-graph-dialog[role="dialog"]');
    const nodes = [...document.querySelectorAll('button.task-graph-node[data-task-id][data-status]')];
    const first = nodes[0];
    const fr = first?.getBoundingClientRect();
    const failed = nodes.find((n) => n.getAttribute('data-task-id') === 'd');
    const downstream = nodes.find((n) => n.getAttribute('data-task-id') === 'h');
    const edges = [...document.querySelectorAll('path.task-graph-edge[data-from][data-to][data-style]')];
    const edge = edges.find((e) => e.getAttribute('data-from') === 'd' && e.getAttribute('data-to') === 'h');
    return {
      dialog: !!dialog,
      modal: dialog?.getAttribute('aria-modal'),
      nodes: nodes.length,
      tags: [...new Set(nodes.map((n) => n.tagName))],
      statuses: nodes.map((n) => n.getAttribute('data-status')),
      nodeSize: fr ? { w: Math.round(fr.width), h: Math.round(fr.height) } : null,
      failed: failed ? { status: failed.getAttribute('data-status'), text: (failed.textContent || '').trim() } : null,
      downstream: downstream ? { status: downstream.getAttribute('data-status'), text: (downstream.textContent || '').trim(), label: (downstream.querySelector('.task-graph-node-status')?.textContent || '').trim(), failedClass: downstream.querySelectorAll('.task-status-failed').length, failReason: downstream.getAttribute('data-fail-reason') } : null,
      dashed: edge ? edge.getAttribute('data-style') : null,
      dashArray: edge ? getComputedStyle(edge).strokeDasharray : null,
      edgeCount: edges.length,
      writes: (window.__ac?.calls ?? []).filter((c) => c.method !== 'GET').length,
    };
  })()`);
  ctx.evidence = survey;

  ctx.check(survey.dialog, '任务图弹窗存在', 'div.task-graph-dialog[role="dialog"]', survey.dialog ? '存在' : '元素不存在');
  ctx.check(survey.modal === 'true', '任务图 aria-modal=true', 'true', survey.modal ?? '元素不存在');
  ctx.check(survey.nodes === 8, '图节点 8 个', '8', survey.nodes);
  ctx.check(survey.tags.length === 1 && survey.tags[0] === 'BUTTON', '节点全部是 button', 'BUTTON', survey.tags);
  ctx.check(['pending', 'running', 'failed', 'done'].every((s) => survey.statuses.includes(s)), '四态节点齐全', 'pending/running/failed/done', [...new Set(survey.statuses)]);
  ctx.check(survey.nodeSize?.w === 156 && survey.nodeSize?.h === 64, '节点尺寸 156×64', '156×64', survey.nodeSize ?? '无法测量');
  ctx.check(survey.failed?.status === 'failed', '节点 d 为 failed', 'failed', survey.failed?.status ?? '元素不存在');
  ctx.check(survey.dashed === 'dashed', '失败起点边 d→h 为虚线', 'data-style=dashed', survey.dashed ?? '边不存在');
  ctx.check((survey.dashArray ?? '').split(/[ ,]+/).filter(Boolean).length >= 2, '虚线边有 dasharray', '至少两个 dash 值', survey.dashArray ?? '边不存在');
  ctx.check(survey.downstream?.status === 'pending', '下游 h 仍为未开始', 'pending', survey.downstream?.status ?? '元素不存在');
  ctx.check((survey.downstream?.label ?? '') === '未开始' && survey.downstream?.failedClass === 0, '下游 h 未被标失败', '状态文案=未开始', survey.downstream ? `状态文案=${survey.downstream.label} 失败样式=${survey.downstream.failedClass}` : '元素不存在');

  // 点失败节点：关闭弹窗、打开只读详情，写请求 0。
  const writesBefore = survey.writes;
  const nodeClick = await clickSel(client, 'button.task-graph-node[data-task-id="d"]');
  ctx.check(nodeClick, '点失败节点 d', '点击成功', nodeClick ? '成功' : '元素不存在');
  let closed = true;
  try {
    await waitFor(client, `document.querySelector('div.task-graph-dialog') === null`, { timeout: 5000, label: '弹窗关闭' });
  } catch { closed = false; }
  ctx.check(closed, '点节点后任务图弹窗关闭', '弹窗 0 个', closed ? '已关闭' : '仍存在');
  let detailOpen = true;
  try {
    await waitFor(client, `document.querySelector('section.task-detail[data-task-id="d"]') !== null`, { timeout: 6000, label: 'd 详情' });
  } catch { detailOpen = false; }
  ctx.check(detailOpen, '点节点后打开 d 只读详情', 'section.task-detail[data-task-id="d"]', detailOpen ? '存在' : '元素不存在');
  const writesAfter = await client.evaluate(`(window.__ac?.calls ?? []).filter((c) => c.method !== 'GET').length`);
  ctx.check(writesAfter === writesBefore, '图节点跳转写请求 0 次', `写请求 ${writesBefore}→${writesBefore}`, `写请求 ${writesBefore}→${writesAfter}`);
});

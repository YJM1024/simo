// AC-CONV-009-07 · 详情只读、四态卡可点（TC-P1-CONV-043 / AC-CONV-009-07）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.7.1、§17.5.3（F-CONV-009-16、F-CONV-009-09）：
//   - 详情根 role=dialog aria-modal=true，仅关闭按钮 1 个；
//   - 重试/取消/编辑/删除/确认/恢复入口 0，表单控件 0；
//   - 进行中/失败/未开始/已完成四态厚卡都可点，点开详情 data-task-id 相同；
//   - 打开前后任务状态不变，写请求（POST/PUT/PATCH/DELETE）0 次。
//
// 页面：main 会话，t1 running / t6 pending / t9 done / t11 failed（task-ui-helpers）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel, pressKey,
} from './lib/task-ui-helpers.mjs';

const CASES = [
  { id: 't1', status: 'running', label: '进行中' },
  { id: 't6', status: 'pending', label: '未开始' },
  { id: 't9', status: 'done', label: '已完成' },
  { id: 't11', status: 'failed', label: '失败' },
];

runUiAc('AC-CONV-009-07', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelectorAll('.task-card').length >= 4`, { timeout: 10000, label: '四态任务卡' });
  const writesBefore = await client.evaluate(`(window.__ac?.calls ?? []).filter((c) => c.method !== 'GET').length`);

  for (const item of CASES) {
    await client.evaluate(`document.querySelectorAll('.task-card').forEach((el) => el.classList.remove('is-open'))`);
    const statusBefore = await client.evaluate(`document.querySelector('.task-card[data-task-id="${item.id}"]')?.getAttribute('data-status') ?? null`);
    const clicked = await clickSel(client, `.task-card[data-task-id="${item.id}"]`);
    ctx.check(clicked, `${item.label}卡可点（${item.id}）`, '点击成功', clicked ? '成功' : '元素不存在');
    let open = true;
    try {
      await waitFor(client, `document.querySelector('section.task-detail[data-task-id="${item.id}"]') !== null`, { timeout: 6000, label: `${item.id} 详情` });
    } catch { open = false; }
    await sleep(200);

    const detail = await client.evaluate(`(() => {
      const el = document.querySelector('section.task-detail[data-task-id="${item.id}"]');
      if (!el) return null;
      const buttons = [...el.querySelectorAll('button')];
      const labels = buttons.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim());
      const forbidden = ['重试', '取消', '编辑', '删除', '确认', '恢复'];
      return {
        taskId: el.getAttribute('data-task-id'),
        role: el.getAttribute('role'),
        modal: el.getAttribute('aria-modal'),
        buttons: labels,
        close: buttons.filter((b) => (b.getAttribute('aria-label') || '') === '关闭任务详情').length,
        readonlyHits: labels.filter((label) => forbidden.some((word) => label === word || label.startsWith(word))).length,
        forms: el.querySelectorAll('form, input, textarea, select').length,
      };
    })()`);
    ctx.check(open && detail !== null, `${item.label}卡点开后详情存在`, `data-task-id=${item.id}`, detail ? `data-task-id=${detail.taskId}` : '元素不存在');
    ctx.check(detail?.role === 'dialog' && detail?.modal === 'true', `${item.label}详情 role=dialog aria-modal=true`, 'dialog/true', detail ? `${detail.role}/${detail.modal}` : '元素不存在');
    ctx.check(detail?.taskId === item.id, `${item.label}详情 data-task-id 与卡片一致`, item.id, detail?.taskId ?? '元素不存在');
    ctx.check(detail?.close === 1, `${item.label}详情关闭按钮 1 个`, '1', detail?.close ?? '元素不存在');
    ctx.check(detail?.readonlyHits === 0, `${item.label}详情写入口 0 个`, '0', detail ? detail.readonlyHits : '元素不存在');
    ctx.check(detail?.forms === 0, `${item.label}详情表单控件 0 个`, '0', detail?.forms ?? '元素不存在');

    const statusAfter = await client.evaluate(`document.querySelector('.task-card[data-task-id="${item.id}"]')?.getAttribute('data-status') ?? null`);
    ctx.check(statusBefore === statusAfter && statusBefore === item.status, `${item.label}任务状态前后不变`, `${item.status}→${item.status}`, `${statusBefore ?? '元素不存在'}→${statusAfter ?? '元素不存在'}`);

    // 关闭只点详情右上关闭按钮；点击失败再退到 Esc，避免下一轮被模态层挡住。
    const closedByButton = await clickSel(client, 'section.task-detail .task-detail-close');
    if (!closedByButton) await pressKey(client, 'Escape');
    try {
      await waitFor(client, `document.querySelector('section.task-detail[data-task-id="${item.id}"]') === null`, { timeout: 3000, label: `${item.id} 详情关闭` });
    } catch { /* 下一轮点卡前会再校验详情 */ }
    await sleep(120);
  }

  const writesAfter = await client.evaluate(`(window.__ac?.calls ?? []).filter((c) => c.method !== 'GET').length`);
  const calls = await client.evaluate(`(window.__ac?.calls ?? []).slice(-12)`);
  ctx.evidence = { writesBefore, writesAfter, calls };
  ctx.check(writesAfter === writesBefore, '四态卡打开详情期间写请求 0 次', `写请求 ${writesBefore}→${writesBefore}`, `写请求 ${writesBefore}→${writesAfter}`);
});

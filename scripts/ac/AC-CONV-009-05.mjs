// AC-CONV-009-05 · 计划步骤与内联轨迹（TC-P1-CONV-041 / AC-CONV-009-05）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.7.2（F-CONV-009-19）：
//   - 8 步示例第 6 步为当前步，默认展开并显示 8 条轨迹；
//   - 第 5 步已完成，步骤头是 button[aria-expanded]，可点回看，展开后标题含「已归档」；
//   - 第 7 步未开始：无按钮、无箭头、无 tabindex，不响应 Enter/Space；
//   - 步骤行 li.task-step[data-step-id][data-status]，最小高 30。
//
// 页面：main 会话，t1 为 8 步进行中计划任务（由 task-ui-helpers 的 N2/N3 桩提供）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, text, count, measure, clickSel,
} from './lib/task-ui-helpers.mjs';

runUiAc('AC-CONV-009-05', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelector('.task-card[data-task-id="t1"]') !== null`, { timeout: 10000, label: '任务卡 t1' });
  const clicked = await clickSel(client, '.task-card[data-task-id="t1"]');
  ctx.check(clicked, '点开 t1 任务卡', '点击成功', clicked ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('section.task-detail[data-task-id="t1"]') !== null`, { timeout: 8000, label: 't1 详情层' });
  await sleep(250);

  const survey = await client.evaluate(`(() => {
    const detail = document.querySelector('section.task-detail[data-task-id="t1"]');
    if (!detail) return { detail: false };
    const step = (id) => {
      const row = detail.querySelector('li.task-step[data-step-id="' + id + '"]');
      if (!row) return null;
      const head = row.querySelector('.task-step-head');
      return {
        status: row.getAttribute('data-status'),
        head: !!head,
        tag: head ? head.tagName : null,
        role: head ? head.getAttribute('role') : null,
        tabindex: head ? head.getAttribute('tabindex') : (row.getAttribute('tabindex')),
        expanded: head ? head.getAttribute('aria-expanded') : null,
        title: (row.textContent || '').trim().slice(0, 40),
        height: Math.round(row.getBoundingClientRect().height),
      };
    };
    const current = detail.querySelector('li.task-step[data-step-id="s6"]');
    return {
      detail: true,
      mode: detail.getAttribute('data-mode'),
      steps: detail.querySelectorAll('li.task-step').length,
      stepHeads: detail.querySelectorAll('button.task-step-head').length,
      s5: step('s5'), s6: step('s6'), s7: step('s7'), s8: step('s8'),
      traceRows: current ? current.querySelectorAll('li.task-trace, .task-trace').length : 0,
      traceHeader: current ? (current.textContent || '').includes('轨迹 8 条') : false,
    };
  })()`);

  ctx.evidence.survey = survey;
  ctx.check(survey.detail, '详情层存在', 'section.task-detail[data-task-id="t1"]', survey.detail ? '存在' : '元素不存在');
  ctx.check(survey.mode === 'plan', '详情 data-mode=plan', 'plan', survey.mode ?? '元素不存在');
  ctx.check(survey.steps === 8, '步骤行 8 条', '8', survey.steps);
  ctx.check(survey.steps === 8 && survey.stepHeads >= 6, '已完成/进行中步骤头是 button', '≥6 个 button.task-step-head', survey.stepHeads);

  ctx.check(survey.s6?.status === 'running', '第 6 步状态 running', 'running', survey.s6?.status ?? '元素不存在');
  ctx.check(survey.s6?.expanded === 'true', '第 6 步默认展开', 'aria-expanded=true', survey.s6?.expanded ?? '元素不存在');
  ctx.check(survey.traceRows === 8, '第 6 步内联轨迹 8 条', '8', survey.traceRows);
  ctx.check(survey.traceHeader, '第 6 步标题含「轨迹 8 条」', '含「轨迹 8 条」', survey.traceHeader ? '含' : '不含');

  ctx.check(survey.s5?.head === true && survey.s5?.tag === 'BUTTON', '第 5 步已完成且步骤头是 button（可聚焦）', 'BUTTON', survey.s5 ? `${survey.s5.tag}` : '元素不存在');
  ctx.check(survey.s5?.expanded === 'false', '第 5 步默认收起', 'aria-expanded=false', survey.s5?.expanded ?? '元素不存在');

  const s5Clicked = await clickSel(client, 'section.task-detail[data-task-id="t1"] li.task-step[data-step-id="s5"] button.task-step-head');
  ctx.check(s5Clicked, '第 5 步可点回看', '点击成功', s5Clicked ? '成功' : '元素不存在');
  await sleep(300);
  const s5After = await client.evaluate(`(() => {
    const row = document.querySelector('section.task-detail[data-task-id="t1"] li.task-step[data-step-id="s5"]');
    if (!row) return null;
    return { expanded: row.querySelector('.task-step-head')?.getAttribute('aria-expanded') ?? null, title: (row.textContent || '').trim() };
  })()`);
  ctx.check(s5After?.expanded === 'true', '第 5 步点击后展开', 'aria-expanded=true', s5After?.expanded ?? '元素不存在');
  ctx.check((s5After?.title ?? '').includes('已归档'), '第 5 步展开标题含「已归档」', '含「已归档」', s5After?.title ?? '元素不存在');

  ctx.check(survey.s7?.head === false, '第 7 步未开始无展开入口', '无 button', survey.s7?.head ? '有 button' : (survey.s7 ? '无 button' : '元素不存在'));
  ctx.check(survey.s7?.tabindex === null, '第 7 步无 tabindex', 'null', survey.s7?.tabindex ?? '元素不存在');
  ctx.check(survey.s7?.role !== 'button', '第 7 步无 role=button', 'null/非 button', survey.s7?.role ?? 'null');
  ctx.check((survey.s7?.height ?? 0) >= 30, '第 7 步行高 ≥30', '≥30px', survey.s7?.height ?? '元素不存在');
});

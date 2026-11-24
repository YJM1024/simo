// AC-CONV-009-06 · 边做边想时间线（TC-P1-CONV-042 / AC-CONV-009-06）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.7.4（F-CONV-009-20）：
//   - data-mode="explore" 时详情内容区是 ol.task-timeline，每行 li.task-trace[data-trace-seq]；
//   - 14 行、按 at 升序、时间单调不减；
//   - 步骤节点 0、步骤分组 0、步骤展开入口 0；
//   - 最后一行 .is-current，打开时滚到底部。
//
// 页面：main 会话，t2 为边做边想任务，N3 返回 14 条轨迹（task-ui-helpers）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel, measure,
} from './lib/task-ui-helpers.mjs';

runUiAc('AC-CONV-009-06', async (ctx) => {
  const client = await openSessionPage(ctx, { stub: buildStub() });
  await waitFor(client, `document.querySelector('.task-card[data-task-id="t2"]') !== null`, { timeout: 10000, label: '任务卡 t2' });
  const clicked = await clickSel(client, '.task-card[data-task-id="t2"]');
  ctx.check(clicked, '点开 t2 任务卡', '点击成功', clicked ? '成功' : '元素不存在');
  await waitFor(client, `document.querySelector('section.task-detail[data-task-id="t2"]') !== null`, { timeout: 8000, label: 't2 详情层' });
  await sleep(300);

  const survey = await client.evaluate(`(() => {
    const detail = document.querySelector('section.task-detail[data-task-id="t2"]');
    if (!detail) return { detail: false };
    const timeline = detail.querySelector('ol.task-timeline');
    const rows = [...detail.querySelectorAll('li.task-trace[data-trace-seq]')];
    const times = rows.map((row) => {
      const time = row.querySelector('time');
      return time ? (time.getAttribute('datetime') || time.textContent || '').trim() : '';
    });
    const last = rows[rows.length - 1] ?? null;
    const scroller = detail.querySelector('.task-detail-body');
    const lastRect = last?.getBoundingClientRect();
    const scrollerRect = scroller?.getBoundingClientRect();
    return {
      detail: true,
      mode: detail.getAttribute('data-mode'),
      header: (detail.querySelector('.task-detail-head')?.textContent || '').trim(),
      timeline: !!timeline,
      rowSelectorSpec: rows.length,
      anyTraceRows: detail.querySelectorAll('li.task-trace').length,
      timelineRows: detail.querySelectorAll('.task-timeline-row').length,
      stepNodes: detail.querySelectorAll('li.task-step, .task-step').length,
      stepGroups: detail.querySelectorAll('.task-step-group, .task-steps').length,
      expandEntries: detail.querySelectorAll('.task-step-head, [aria-controls^="step-"]').length,
      current: last ? last.classList.contains('is-current') : null,
      lastVisible: !!(lastRect && scrollerRect && lastRect.bottom <= scrollerRect.bottom + 2),
      times,
    };
  })()`);

  ctx.evidence.survey = survey;
  ctx.check(survey.detail, '详情层存在', 'section.task-detail[data-task-id="t2"]', survey.detail ? '存在' : '元素不存在');
  ctx.check(survey.mode === 'explore', '详情 data-mode=explore', 'explore', survey.mode ?? '元素不存在');
  ctx.check((survey.header ?? '').includes('边做边想'), '详情头显示「边做边想」', '含「边做边想」', (survey.header ?? '').includes('边做边想') ? '含' : survey.header ?? '元素不存在');
  ctx.check(survey.timeline, '存在 ol.task-timeline', '存在', survey.timeline ? '存在' : '元素不存在');
  ctx.check(survey.rowSelectorSpec === 14, '时间线 14 行（li.task-trace[data-trace-seq]）', '14', survey.rowSelectorSpec);
  ctx.check(survey.stepNodes === 0, '步骤节点 0 个', '0', survey.stepNodes);
  ctx.check(survey.stepGroups === 0, '步骤分组 0 个', '0', survey.stepGroups);
  ctx.check(survey.expandEntries === 0, '步骤展开入口 0 个', '0', survey.expandEntries);
  ctx.check(survey.current === true, '最后一行加 .is-current', 'true', survey.current ?? '无最后一行');
  ctx.check(survey.lastVisible === true, '打开时滚到最后一行动作可见', '最后一行完整可见', survey.lastVisible ?? '无法测量');

  // 时间单调不减：比较 time[datetime] 或 HH:MM:SS 文本。
  const ordinal = (value) => {
    if (!value) return NaN;
    const iso = Date.parse(value);
    if (!Number.isNaN(iso)) return iso;
    const m = String(value).match(/(\d{2}):(\d{2}):(\d{2})/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
  };
  const nums = survey.times.map(ordinal);
  const monotonic = nums.every((n, i) => i === 0 || (!Number.isNaN(n) && !Number.isNaN(nums[i - 1]) && n >= nums[i - 1]));
  ctx.check(monotonic, '时间单调不减', '每行时间 ≥ 上一行', monotonic ? survey.times.slice(0, 3).join(' / ') + ' … ' + survey.times.at(-1) : survey.times);
});

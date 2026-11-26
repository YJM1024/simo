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
  // 右栏默认停在概览标签，任务卡只在任务标签下渲染。
  await clickSel(client, 'nav.insp-rail button[data-tab="tasks"]');
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

  ctx.check(survey.s7 !== null && survey.s7.tag !== 'BUTTON' && survey.s7.role !== 'button', '第 7 步未开始无展开入口（非按钮）', '非 BUTTON 且无 role=button', survey.s7 ? `tag=${survey.s7.tag} role=${survey.s7.role}` : '元素不存在');
  ctx.check(survey.s7?.tabindex === null, '第 7 步无 tabindex', 'null', survey.s7?.tabindex ?? '元素不存在');
  ctx.check(survey.s7?.role !== 'button', '第 7 步无 role=button', 'null/非 button', survey.s7?.role ?? 'null');
  ctx.check((survey.s7?.height ?? 0) >= 30, '第 7 步行高 ≥30', '≥30px', survey.s7?.height ?? '元素不存在');

  // ---- D2：轨迹截断上限（plan/explore 同一套）与错误态重试（新增，既有断言不动）----
  const closeTaskDetail = async () => {
    const exists = await client.evaluate(`document.querySelector('section.task-detail') !== null`);
    if (exists) await clickSel(client, 'section.task-detail .task-detail-close');
    await sleep(200);
  };
  await closeTaskDetail();
  const probeInstalled = await client.evaluate(`(async () => {
    const orig = window.fetch.bind(window);
    window.__acOrigFetch = orig;
    window.__acLog = [];
    window.__acFail = false;
    window.__acBig = null;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || (input && input.method) || 'GET';
      window.__acLog.push({ method, url });
      if (window.__acFail && url.includes('/tasks/t1')) {
        return new Response(JSON.stringify({ error: { code: 'internal', message: '详情失败' } }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
      if (window.__acBig) {
        const pick = url.includes('/tasks/t2') ? 'explore' : url.includes('/tasks/t1') ? 'plan' : null;
        if (pick) return new Response(JSON.stringify(window.__acBig[pick]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return orig(input, init);
    };
    const plan = await (await orig('/api/sessions/main/tasks/t1?traceLimit=200')).json();
    const explore = await (await orig('/api/sessions/main/tasks/t2?traceLimit=200')).json();
    const pad = (base, taskId) => {
      const stepId = taskId === 't1' ? base.steps[5].id : undefined;
      const traces = Array.from({ length: 520 }, (_, i) => ({
        id: 'big-' + taskId + '-' + (i + 1),
        stepId: taskId === 't1' ? stepId : undefined,
        traceSeq: i + 1,
        seq: i + 1,
        category: i % 2 ? 'action' : 'observation',
        text: '轨迹 ' + (i + 1),
        at: 1760000000000 + i * 1000,
      }));
      return { ...base, traces, tracesHasMore: true };
    };
    window.__acBig = { plan: pad(plan, 't1'), explore: pad(explore, 't2') };
    return true;
  })()`);
  ctx.check(probeInstalled === true, '安装轨迹上限与重试探针', 'true', String(probeInstalled));

  await clickSel(client, '.task-card[data-task-id="t1"]');
  await waitFor(client, `document.querySelectorAll('section.task-detail li.task-step .task-trace').length === 200`, { timeout: 10000, label: 'plan 首屏 200 条' });
  const plan200 = await client.evaluate(`document.querySelectorAll('section.task-detail li.task-step .task-trace').length`);
  ctx.check(plan200 === 200, 'plan 轨迹首屏 200 条', '200', plan200);
  await clickSel(client, 'section.task-detail .task-traces-more');
  await sleep(250);
  const plan400 = await client.evaluate(`document.querySelectorAll('section.task-detail li.task-step .task-trace').length`);
  ctx.check(plan400 === 400, 'plan 点一次加载更早后 400 条', '400', plan400);
  await clickSel(client, 'section.task-detail .task-traces-more');
  await sleep(250);
  const planCap = await client.evaluate(`(() => {
    const rows = document.querySelectorAll('section.task-detail li.task-step .task-trace').length;
    return { rows, more: document.querySelectorAll('section.task-detail .task-traces-more').length, hint: (document.querySelector('section.task-detail .task-traces-cap') || {}).textContent || '' };
  })()`);
  ctx.check(planCap.rows === 500, 'plan 到上限 500 条', '500', planCap.rows);
  ctx.check(planCap.more === 0, 'plan 到上限后加载更早入口消失', '0', planCap.more);
  ctx.check(planCap.hint.includes('达到上限'), 'plan 到上限显示已到上限文案', '含「达到上限」', planCap.hint || '空');

  await closeTaskDetail();
  await clickSel(client, '.task-card[data-task-id="t2"]');
  await waitFor(client, `document.querySelectorAll('section.task-detail .task-trace').length === 200`, { timeout: 10000, label: 'explore 首屏 200 条' });
  const ex200 = await client.evaluate(`document.querySelectorAll('section.task-detail .task-trace').length`);
  ctx.check(ex200 === 200, 'explore 轨迹首屏 200 条', '200', ex200);
  await clickSel(client, 'section.task-detail .task-traces-more');
  await sleep(250);
  const ex400 = await client.evaluate(`document.querySelectorAll('section.task-detail .task-trace').length`);
  ctx.check(ex400 === 400, 'explore 点一次加载更早后 400 条', '400', ex400);
  await clickSel(client, 'section.task-detail .task-traces-more');
  await sleep(250);
  const exCap = await client.evaluate(`(() => {
    const rows = document.querySelectorAll('section.task-detail .task-trace').length;
    return { rows, more: document.querySelectorAll('section.task-detail .task-traces-more').length, steps: document.querySelectorAll('section.task-detail li.task-step').length };
  })()`);
  ctx.check(exCap.rows === 500, 'explore 到上限 500 条', '500', exCap.rows);
  ctx.check(exCap.more === 0, 'explore 到上限后加载更早入口消失', '0', exCap.more);
  ctx.check(exCap.steps === 0, 'explore 仍无步骤节点', '0', exCap.steps);

  await closeTaskDetail();
  await client.evaluate(`(() => { window.__acFail = true; window.__acBig = null; window.__acLog = []; return true })()`);
  await clickSel(client, '.task-card[data-task-id="t1"]');
  await waitFor(client, `document.querySelector('section.task-detail .task-list-error') !== null`, { timeout: 10000, label: '详情错误态' });
  const errorState = await client.evaluate(`(() => {
    const rows = [...document.querySelectorAll('section.task-detail .task-list-error button')];
    return { retry: rows.filter((b) => (b.textContent || '').trim() === '重试').length, all: rows.length, text: (document.querySelector('section.task-detail .task-list-error') || {}).textContent || '' };
  })()`);
  ctx.check(errorState.retry === 1, '错误态恰好 1 个重试按钮', '1', errorState.retry);
  ctx.check(errorState.text.includes('任务详情加载失败'), '错误态显示加载失败文案', '含「任务详情加载失败」', errorState.text || '空');
  await client.evaluate(`(() => { window.__acLog = []; return true })()`);
  await clickSel(client, 'section.task-detail .task-list-error button');
  await sleep(400);
  const retryLog = await client.evaluate(`window.__acLog || []`);
  const retryGets = retryLog.filter((entry) => (entry.url || '').includes('/tasks/t1'));
  const retryWrites = retryLog.filter((entry) => (entry.method || 'GET').toUpperCase() !== 'GET');
  ctx.check(retryGets.length === 1 && retryGets[0].method === 'GET', '点重试只重拉一次详情 GET', '1 条 GET', retryGets.map((e) => e.method + ' ' + e.url).join(' | ') || '无请求');
  ctx.check(retryWrites.length === 0, '重试不产生写请求', '0 条非 GET', retryWrites.map((e) => e.method + ' ' + e.url).join(' | ') || '无');
  await client.evaluate(`(() => { window.__acFail = false; return true })()`);
  await closeTaskDetail();
});

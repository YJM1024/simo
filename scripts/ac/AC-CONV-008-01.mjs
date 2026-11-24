// AC-CONV-008-01 · 右栏三组（状态/rev、目标、输入）与无投影空态。
//
// 判据：.insp-spec-status 的 <b> 是状态中文、<span> 是“rev N”且与接口 revision 一致；待确认 em 只在
// pendingConfirmations.total>0 时出现（main 实测 total=0 → em 0 个）；目标段文本 = 接口 goal；
// 输入段文本 = constraints+inputs 以“ · ”连接；无投影时显示 .overview-empty「暂无会话投影」且状态行 0 个。

import {
  runAc, apiGet, sleep, waitFor, READY_COMPOSER, setStub,
} from '../lib/ac-cdp.mjs';

const STATUS = { completed: '已完成', active: '进行中', draft: '草稿', blocked: '阻塞', done: '已完成' };

runAc('AC-CONV-008-01', async (ctx) => {
  const api = (await apiGet(ctx.baseUrl, '/api/sessions/main/spec-projection?taskLimit=3')).json;
  const client = await ctx.openPage({ ready: READY_COMPOSER });
  await client.evaluate(`localStorage.setItem('simo.active-session', 'main')`);
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-session') === 'main' && document.querySelector('.insp-spec-status') !== null`, { timeout: 12000, label: '主会话右栏投影' });
  await sleep(300);

  const dom = await client.evaluate(`(() => {
    const status = document.querySelector('.insp-spec-status');
    const labels = [...document.querySelectorAll('.insp-body h3.insp-label')].map((el) => ({ title: el.textContent.trim(), text: el.parentElement.querySelector('.insp-text')?.textContent?.trim() ?? null }));
    return {
      statusText: status?.querySelector('b')?.textContent?.trim() ?? null,
      revText: status?.querySelector('span')?.textContent?.trim() ?? null,
      pendingEm: status?.querySelectorAll('em').length ?? 0,
      pendingText: status?.querySelector('em')?.textContent?.trim() ?? null,
      labels,
      placeholder: document.querySelector('.insp-placeholder')?.textContent?.trim() ?? null,
    };
  })()`);

  const target = dom.labels.find((item) => item.title === '目标');
  const input = dom.labels.find((item) => item.title === '输入');
  const expectedInput = api.constraints.length || api.inputs.length ? [...api.constraints, ...api.inputs].join(' · ') : '暂无输入约束。';
  const expectedGoal = api.goal || (api.status === 'draft' ? '目标待生成。' : '本会话未记录目标。');

  // 无投影：桩把投影请求改成 304（无缓存）→ projection=null → EmptyState。
  await setStub(client, { rules: [{ match: '/spec-projection', status: 304, body: null }] });
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector('.overview-empty') !== null || document.querySelector('.state-block') !== null`, { timeout: 12000, label: '无投影空态' });
  await sleep(400);
  const empty = await client.evaluate(`(() => ({
    emptyTitle: document.querySelector('.overview-empty b')?.textContent?.trim() ?? null,
    emptyDescription: document.querySelector('.overview-empty span:not(.overview-empty-mark)')?.textContent?.trim() ?? '',
    statusRows: document.querySelectorAll('.insp-spec-status').length,
    errorBlocks: document.querySelectorAll('.state-error').length,
  }))()`);

  ctx.evidence = { api: { status: api.status, revision: api.revision, goal: api.goal, constraints: api.constraints, inputs: api.inputs, pendingConfirmations: api.pendingConfirmations?.total }, dom, expectedGoal, expectedInput, empty };

  ctx.check(dom.statusText === (STATUS[api.status] ?? api.status), `状态中文=${STATUS[api.status] ?? api.status}`, dom.statusText);
  ctx.check(dom.revText === `rev ${api.revision}`, `状态行 rev 与接口一致（rev ${api.revision}）`, dom.revText);
  ctx.check(api.pendingConfirmations.total === 0 ? dom.pendingEm === 0 : (dom.pendingEm === 1 && dom.pendingText.includes(String(api.pendingConfirmations.total))), '待确认 em 只在 total>0 时出现', { api: api.pendingConfirmations.total, dom: dom.pendingEm });
  ctx.check(Boolean(target), '存在“目标”段', dom.labels);
  ctx.check(target?.text === expectedGoal, '目标段文本 = 接口 goal', { dom: target?.text, api: expectedGoal });
  ctx.check(Boolean(input), '存在“输入”段', dom.labels);
  ctx.check(input?.text === expectedInput, '输入段文本 = constraints+inputs 连接', { dom: input?.text, api: expectedInput });
  ctx.check(empty.emptyTitle === '暂无会话投影', '无投影时 .overview-empty 标题「暂无会话投影」', empty);
  ctx.check(empty.statusRows === 0, '无投影时状态行 0 个', empty.statusRows);

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`
      : `状态「${dom.statusText}」+ rev ${api.revision}（三组齐全：目标/输入/状态）；pendingConfirmations=0 时 em 0 个；304 无缓存 → 「暂无会话投影」且状态行 0 个`,
  };
});

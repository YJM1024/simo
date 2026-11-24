// AC-CONV-009-09 · 角标 = 进行中数、≥10 显 9+、0 不渲染（TC-P1-CONV-045 / AC-CONV-009-09）
//
// 判据来自 specs/frontend/P1-CONV/spec.md §17.5.2（F-CONV-009-04）：
//   - 角标数字等于 counts.running，1–9 显原数字，10 及以上显 9+，0 不渲染节点；
//   - 角标 span.insp-badge[aria-hidden=true]，最小 14×14，不是独立焦点；
//   - aria-label 为「任务，N 个进行中」/「任务，9 个以上进行中」；
//   - counts.all=0 时任务按钮 aria-disabled=true，点击不切标签，角标不渲染不占位。
//
// 页面：main 会话；三组 counts（2 / 10 / 0）各 reload 一次（task-ui-helpers 桩）。

import {
  runUiAc, buildStub, openSessionPage, waitFor, sleep, clickSel,
} from './lib/task-ui-helpers.mjs';

const badgeInfo = (client) => client.evaluate(`(() => {
  const btn = document.querySelector('nav.insp-rail button[data-tab="tasks"]');
  if (!btn) return { button: false };
  const badge = btn.querySelector('span.insp-badge');
  const r = badge?.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  return {
    button: true,
    badge: !!badge,
    text: badge ? (badge.textContent || '').trim() : null,
    ariaHidden: badge ? badge.getAttribute('aria-hidden') : null,
    width: r ? Math.round(r.width) : 0,
    height: r ? Math.round(r.height) : 0,
    buttonWidth: Math.round(br.width),
    buttonHeight: Math.round(br.height),
    label: btn.getAttribute('aria-label'),
    disabled: btn.getAttribute('aria-disabled'),
    tab: document.querySelector('aside.inspector')?.getAttribute('data-tab'),
  };
})()`);

runUiAc('AC-CONV-009-09', async (ctx) => {
  // 变体 1：进行中 2 → 显示 2。
  let client = await openSessionPage(ctx, { stub: buildStub({ counts: { all: 11, running: 2, pending: 5, failed: 1, done: 3 } }) });
  await waitFor(client, `document.querySelector('nav.insp-rail button[data-tab="tasks"]') !== null`, { timeout: 10000, label: '任务竖条按钮' });
  const two = await badgeInfo(client);
  ctx.evidence.two = two;
  ctx.check(two.button, '任务竖条按钮存在', 'button[data-tab="tasks"]', two.button ? '存在' : '元素不存在');
  ctx.check(two.badge, '进行中 2 时角标节点存在', 'span.insp-badge', two.badge ? '存在' : '元素不存在');
  ctx.check(two.text === '2', '角标显示 2', '2', two.text ?? '元素不存在');
  ctx.check(two.ariaHidden === 'true', '角标 aria-hidden=true', 'true', two.ariaHidden ?? '元素不存在');
  ctx.check((two.label ?? '').includes('2') && (two.label ?? '').includes('进行中'), 'aria-label 含进行中数 2', '任务，2 个进行中', two.label ?? '元素不存在');
  ctx.check(two.width >= 14 && two.height >= 14, '角标 ≥14×14', '≥14×14', `${two.width}×${two.height}`);
  ctx.check(two.buttonWidth === 32 && two.buttonHeight === 32, '角标不改变按钮 32×32', '32×32', `${two.buttonWidth}×${two.buttonHeight}`);

  // 变体 2：进行中 10 → 9+。
  client = await openSessionPage(ctx, { stub: buildStub({ counts: { all: 20, running: 10, pending: 0, failed: 0, done: 10 } }) });
  await waitFor(client, `document.querySelector('nav.insp-rail button[data-tab="tasks"]') !== null`, { timeout: 10000, label: '任务竖条按钮' });
  const ten = await badgeInfo(client);
  ctx.evidence.ten = ten;
  ctx.check(ten.text === '9+', '进行中 10 时角标显示 9+', '9+', ten.text ?? '元素不存在');
  ctx.check((ten.label ?? '').includes('9 个以上'), 'aria-label 为「9 个以上进行中」', '任务，9 个以上进行中', ten.label ?? '元素不存在');

  // 变体 3：all=0 / running=0 → 不渲染角标、按钮 aria-disabled、点击不切标签。
  client = await openSessionPage(ctx, { stub: buildStub({ tasks: [], counts: { all: 0, running: 0, pending: 0, failed: 0, done: 0 } }) });
  await waitFor(client, `document.querySelector('nav.insp-rail button[data-tab="tasks"]') !== null`, { timeout: 10000, label: '任务竖条按钮' });
  await sleep(300);
  const zero = await badgeInfo(client);
  ctx.evidence.zero = zero;
  ctx.check(zero.button, '任务竖条按钮存在', 'button[data-tab="tasks"]', zero.button ? '存在' : '元素不存在');
  ctx.check(zero.badge === false, '进行中 0 时不渲染角标节点', '无 span.insp-badge', zero.badge ? '仍渲染' : '无节点');
  ctx.check(zero.disabled === 'true', 'counts.all=0 时按钮 aria-disabled=true', 'true', zero.disabled ?? 'null');
  ctx.check(zero.buttonWidth === 32 && zero.buttonHeight === 32, '无角标时按钮仍 32×32、不占位', '32×32', `${zero.buttonWidth}×${zero.buttonHeight}`);

  const clickZero = await clickSel(client, 'nav.insp-rail button[data-tab="tasks"]');
  ctx.check(clickZero, '点 aria-disabled 任务按钮', '点击派发成功', clickZero ? '成功' : '元素不存在');
  await sleep(400);
  const afterZero = await client.evaluate(`(() => ({
    tab: document.querySelector('aside.inspector')?.getAttribute('data-tab'),
    expanded: document.querySelector('.insp-collapse')?.getAttribute('aria-expanded'),
  }))()`);
  ctx.check(afterZero.tab === 'overview', '点击后不切换标签（仍 overview）', 'overview', afterZero.tab ?? '元素不存在');
});

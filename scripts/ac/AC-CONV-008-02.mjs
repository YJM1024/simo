// AC-CONV-008-02 · 执行组展开（首屏 3 → 补取 50 后全量）、任务行定位到消息、右栏无提交入口、交付物下载链接。
//
// 线上夹具 main：完成组 6 条（首屏 3），任务 task-seed-done-1「汇总本周进展」messageId=msg-a1，
// 交付物 1 条带 downloadUrl。判据：展开后计数 6/6 且可见行 6；点任务行后 .msg.is-flash 的
// data-message-id=msg-a1；右栏内不含 提交/重试/取消/撤销 按钮；交付物有 a.download-link[download]。

import {
  runAc, sleep, waitFor, click, clickMatching, count, READY_COMPOSER,
} from '../lib/ac-cdp.mjs';

runAc('AC-CONV-008-02', async (ctx) => {
  const client = await ctx.openPage({ ready: READY_COMPOSER });
  await client.evaluate(`localStorage.setItem('simo.active-session', 'main')`);
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-session') === 'main' && document.querySelectorAll('.exec-group').length === 3`, { timeout: 12000, label: '主会话右栏三个执行组' });
  await sleep(300);

  const readGroups = () => client.evaluate(`[...document.querySelectorAll('.exec-group')].map((group) => ({
    name: group.querySelector('.exec-name')?.textContent?.trim() ?? '',
    count: group.querySelector('.exec-count')?.textContent?.trim() ?? '',
    expanded: group.classList.contains('is-expanded'),
    rows: group.querySelectorAll('.exec-row.task-row').length,
    headMeta: document.querySelector('.insp-block .insp-head span')?.textContent?.trim() ?? '',
  }))`);

  const initial = await readGroups();
  const doneIndex = initial.findIndex((group) => group.name === '已完成');
  await click(client, '.exec-group .exec-head', doneIndex);
  await waitFor(client, `[...document.querySelectorAll('.exec-group')].some((group) => group.classList.contains('is-expanded') && group.querySelector('.exec-count')?.textContent?.trim().split('/')[0] === group.querySelector('.exec-count')?.textContent?.trim().split('/')[1])`, { timeout: 8000, label: '展开后补取到全量（计数 n/n）' });
  await sleep(300);
  const expanded = await readGroups();

  await clickMatching(client, '.exec-group.is-expanded .task-row', '.exec-title', '汇总本周进展', { exact: false });
  await waitFor(client, `document.querySelector('.msg.is-flash') !== null`, { timeout: 5000, label: '定位后消息闪烁高亮' }).catch(() => null);
  const flash = await client.evaluate(`(() => {
    const el = document.querySelector('.msg.is-flash');
    return el ? { messageId: el.dataset.messageId ?? null, sessionId: el.dataset.sessionId ?? null, taskId: el.dataset.taskId ?? null } : null;
  })()`);

  const forbidden = await client.evaluate(`[...document.querySelectorAll('aside.inspector button')].map((button) => button.textContent.trim()).filter((text) => /提交|重试|取消|撤销/.test(text))`);
  const deliverables = await client.evaluate(`(() => {
    const links = [...document.querySelectorAll('aside.inspector a.download-link[download]')];
    return {
      lines: document.querySelectorAll('.deliverable-line').length,
      links: links.length,
      hrefs: links.map((link) => link.getAttribute('href')),
      downloadAttr: links.map((link) => link.getAttribute('download')),
      empty: document.querySelector('.insp-block .overview-empty b')?.textContent?.trim() ?? null,
    };
  })()`);

  ctx.evidence = { initial, expanded, flash, forbidden, deliverables };

  const before = initial.find((group) => group.name === '已完成');
  const after = expanded.find((group) => group.name === '已完成');
  ctx.check(before?.count === '3/6' && before?.rows === 3, '完成组首屏 3/6 且渲染 3 行', before);
  ctx.check(Boolean(after?.expanded), '点击组头后完成组进入展开态（.is-expanded）', after);
  ctx.check(after?.count === '6/6' && after?.rows === 6, '展开后补取到 6/6 且可见 6 行', { count: after?.count, rows: after?.rows });
  ctx.check(Boolean(flash), '任务行点击后出现 .msg.is-flash', flash);
  ctx.check(flash?.messageId === 'msg-a1', '闪烁消息 data-message-id=msg-a1', flash);
  ctx.check(forbidden.length === 0, '右栏内无 提交/重试/取消/撤销 按钮', forbidden);
  ctx.check(deliverables.lines === 1 && deliverables.links === 1, '交付物 1 行且有 1 个下载链接', deliverables);
  ctx.check((deliverables.hrefs[0] ?? '').includes('/content?download=1') && deliverables.downloadAttr[0] !== null, '下载链接指向 /content?download=1 且带 download 属性', deliverables);

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`
      : `完成组 3/6→6/6（可见 6 行）；点「汇总本周进展」后闪光消息 msg-a1（data-task-id 匹配）；右栏无提交类按钮 0 个；交付物 1 行 + 1 个 download 链接`,
  };
});

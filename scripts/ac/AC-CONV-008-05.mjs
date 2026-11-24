// AC-CONV-008-05 · 执行组头 {shown}/{total}：首屏 3/6 与 3/4，展开后 6/6 与 4/4；补取失败时组头与计数保持。
//
// 线上 main：done.total=6（首屏 items 3）、pending.total=4（首屏 items 3），补取 taskLimit=50 后两组全量。
// 失败注入只匹配 "taskLimit=50"，首屏 taskLimit=3 必须放行；桩用 window.__ac.stub 即时生效，不 reload
// （api.ts 的投影缓存是模块内 Map，reload 会清空已有状态）。补取是全投影一次取回，所以 50 只发一次；
// 在这一次上打 500，按 AC 断言组头 3/6 保留、错误只落该组、无整栏「右栏加载失败」；关桩点组内重试恢复 6/6。
// 经验：失败注入必须精确匹配查询参数，且不得 reload 后再断言已有状态。

import {
  runAc, sleep, waitFor, READY_COMPOSER,
} from '../lib/ac-cdp.mjs';

runAc('AC-CONV-008-05', async (ctx) => {
  const client = await ctx.openPage({ ready: READY_COMPOSER });
  await client.evaluate(`localStorage.setItem('simo.active-session', 'main')`);
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelectorAll('.exec-group').length === 3`, { timeout: 12000, label: '右栏三个执行组' });
  await sleep(300);

  const groups = () => client.evaluate(`[...document.querySelectorAll('.exec-group')].map((group) => ({
    name: group.querySelector('.exec-name')?.textContent?.trim() ?? '',
    count: group.querySelector('.exec-count')?.textContent?.trim() ?? '',
    rows: group.querySelectorAll('.exec-row.task-row').length,
    expanded: group.classList.contains('is-expanded'),
    errors: group.querySelectorAll('.state-error').length,
  }))`);
  const headerMeta = () => client.evaluate(`document.querySelector('.insp-block .insp-head span')?.textContent?.trim() ?? ''`);
  // 组内错误节点是 .exec-group-error（role=alert），整栏错误才是 .state-error；两者分开计数。
  const errorSurvey = () => client.evaluate(`(() => {
    const inspector = document.querySelector('.inspector');
    const inGroups = [...document.querySelectorAll('.exec-group .exec-group-error')].length;
    const panelErrors = [...document.querySelectorAll('.inspector .state-error')].filter((el) => !el.closest('.exec-group')).length;
    const text = inspector ? inspector.textContent : '';
    return {
      total: inGroups + panelErrors,
      inGroups,
      panelErrors,
      outsideGroups: panelErrors,
      panelFailText: text.includes('右栏加载失败'),
      retry: [...document.querySelectorAll('.exec-group button')].some((b) => (b.textContent || '').trim() === '重试'),
    };
  })()`);
  // 桩配置从 window.__ac.stub 即时生效（页面 fetch 每次请求都读它），不需要 reload。
  const liveStub = (config) => client.evaluate(`(() => { window.__ac.stub = ${JSON.stringify(config)}; return true; })()`);
  const clickHead = (index) => client.evaluate(`(() => {
    const head = document.querySelectorAll('.exec-group .exec-head')[${index}];
    if (!head) return false; head.click(); return true;
  })()`);
  const clickGroupRetry = () => client.evaluate(`(() => {
    const btn = [...document.querySelectorAll('.exec-group button')].find((b) => (b.textContent || '').trim() === '重试');
    if (!btn) return false; btn.click(); return true;
  })()`);

  const initial = await groups();
  const metaInitial = await headerMeta();
  const doneIndex = initial.findIndex((group) => group.name === '已完成');
  const pendingIndex = initial.findIndex((group) => group.name === '未开始');

  // 开桩：只打 taskLimit=50，首屏 taskLimit=3 已放行。
  await liveStub({ rules: [{ match: 'taskLimit=50', status: 500, body: { ok: false, error: { code: 'internal', message: '模拟补取 500' } } }] });
  await clickHead(doneIndex);
  const failedDeadline = Date.now() + 6000;
  let afterFail = null;
  while (Date.now() < failedDeadline) {
    await sleep(250);
    const survey = await errorSurvey();
    const nowGroups = await groups();
    afterFail = { groups: nowGroups, survey, meta: await headerMeta(), counts: nowGroups.map((group) => group.count) };
    if (survey.total > 0) break;
  }

  // 关桩，点组内重试，等补取成功。
  await liveStub(null);
  const retried = await clickGroupRetry();
  let afterRetry = null;
  const retryDeadline = Date.now() + 8000;
  while (Date.now() < retryDeadline) {
    await sleep(250);
    const nowGroups = await groups();
    afterRetry = { groups: nowGroups, survey: await errorSurvey(), meta: await headerMeta() };
    if (nowGroups.find((group) => group.name === '已完成')?.count === '6/6' && afterRetry.survey.total === 0) break;
  }

  // 补取成功后未开始组已全量在投影里，展开不再发请求，组头应 4/4。
  await clickHead(pendingIndex);
  await sleep(600);
  const afterPending = { groups: await groups(), meta: await headerMeta() };

  ctx.evidence = {
    initial, metaInitial, afterFail, retried, afterRetry, afterPending,
    stubMatch: 'taskLimit=50（首屏 taskLimit=3 放行）',
  };

  const metaNums = (text) => (text.match(/\d+/g) ?? []).map(Number);
  const done0 = initial.find((group) => group.name === '已完成');
  const pend0 = initial.find((group) => group.name === '未开始');
  const doneFail = afterFail?.groups.find((group) => group.name === '已完成');
  const pendFail = afterFail?.groups.find((group) => group.name === '未开始');
  const doneRetry = afterRetry?.groups.find((group) => group.name === '已完成');
  const pendAfter = afterPending.groups.find((group) => group.name === '未开始');
  const meta0 = metaNums(metaInitial);

  ctx.check(done0?.count === '3/6' && done0?.rows === 3, '首屏完成组 3/6 且 3 行', done0);
  ctx.check(pend0?.count === '3/4' && pend0?.rows === 3, '首屏未开始组 3/4 且 3 行', pend0);
  ctx.check(meta0[0] === 10 && meta0[1] === 6, '组头 meta「共 10 · 本次 6」与首屏一致', metaInitial);
  ctx.check(doneFail?.count === '3/6' && doneFail?.rows === 3, '补取 500 后完成组组头保持 3/6、3 行', doneFail);
  ctx.check(pendFail?.count === '3/4', '失败未波及未开始组（仍 3/4）', pendFail);
  ctx.check((afterFail?.survey.inGroups ?? 0) >= 1, '错误块落在失败的执行组内', afterFail?.survey);
  ctx.check((afterFail?.survey.outsideGroups ?? -1) === 0 && !afterFail?.survey.panelFailText, '未整栏切「右栏加载失败」', afterFail?.survey);
  ctx.check(afterFail?.survey.retry === true, '失败组内提供「重试」', afterFail?.survey);
  ctx.check(retried === true, '关桩后可点组内「重试」', retried);
  ctx.check(doneRetry?.count === '6/6' && doneRetry?.rows === 6, '重试成功后完成组 6/6 且 6 行', doneRetry);
  ctx.check((afterRetry?.survey.total ?? -1) === 0, '重试成功后组内错误块清除', afterRetry?.survey);
  ctx.check(metaNums(afterPending.meta)[1] === 10, '补取成功后组头「本次 10」= 三组 items 总和', afterPending.meta);
  ctx.check(pendAfter?.count === '4/4' && pendAfter?.rows === 4, '展开未开始组 4/4 且 4 行', pendAfter);

  const failed = ctx.checks.filter((item) => !item.ok);
  const failFacts = `失败时完成组 ${doneFail?.count ?? 'n/a'}/${doneFail?.rows ?? 'n/a'} 行、错误块 组内 ${afterFail?.survey?.inGroups} / 总 ${afterFail?.survey?.total} / 组外 ${afterFail?.survey?.outsideGroups}、整栏错误 ${afterFail?.survey?.panelFailText ? '是' : '否'}、组内重试 ${afterFail?.survey?.retry ? '有' : '无'}；重试后 ${doneRetry?.count ?? 'n/a'}/${doneRetry?.rows ?? 'n/a'} 行、错误 ${afterRetry?.survey?.total ?? 'n/a'}`;
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}。实测：${failFacts}；组计数 [${(afterFail?.counts || []).join(', ')}]`
      : `首屏 3/6 与 3/4；补取 500 只落完成组，组头保持 3/6 且组外无错误、有重试；关桩重试后 6/6（本次 10），未开始组展开 4/4`,
  };
});

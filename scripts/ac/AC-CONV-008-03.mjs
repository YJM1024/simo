// AC-CONV-008-03 · 右栏四态 + 375px 窄屏：加载中（骨架）、失败（可重试）、无投影（空态）、无会话（未选择会话）。
//
// 四态用页面内 fetch 桩按规则切换：加载中用 delayMs 1500，失败用 500，无投影用 304（无缓存），
// 无会话把 /api/sessions/tree 设为空。375 档用 Emulation.setDeviceMetricsOverride 设 375×812，
// 断言侧栏与右栏 display:none、0×0、页面横向不溢出、Composer 可见。

import {
  runAc, apiGet, sleep, waitFor, count, READY_COMPOSER, setStub,
} from '../lib/ac-cdp.mjs';

const projection = async (baseUrl) => (await apiGet(baseUrl, '/api/sessions/main/spec-projection?taskLimit=3')).json;

runAc('AC-CONV-008-03', async (ctx) => {
  const api = await projection(ctx.baseUrl);
  const client = await ctx.openPage({ ready: READY_COMPOSER });

  // 1) 加载中：delayMs 1500 让骨架可见。
  await setStub(client, { rules: [{ match: '/spec-projection', delayMs: 1500, status: 200, body: api }] });
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector('.inspector .state-loading') !== null`, { timeout: 6000, label: '右栏加载骨架' });
  const loading = await client.evaluate(`(() => ({
    text: document.querySelector('.inspector .state-loading p')?.textContent?.trim() ?? null,
    role: document.querySelector('.inspector .state-loading')?.getAttribute('role') ?? null,
    statusRows: document.querySelectorAll('.insp-spec-status').length,
  }))()`);
  await sleep(1600);

  // 2) 失败：500 → ErrorState + 重试按钮。
  await setStub(client, { rules: [{ match: '/spec-projection', status: 500, body: { ok: false, error: { code: 'internal', message: '模拟 500' } } }] });
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector('.inspector .state-error') !== null`, { timeout: 6000, label: '右栏错误态' });
  const error = await client.evaluate(`(() => ({
    title: document.querySelector('.inspector .state-error b')?.textContent?.trim() ?? null,
    role: document.querySelector('.inspector .state-error')?.getAttribute('role') ?? null,
    retry: [...document.querySelectorAll('.inspector .state-error button')].filter((button) => button.textContent.trim() === '重试').length,
  }))()`);

  // 3) 无投影：304 且无缓存 → EmptyState。
  await setStub(client, { rules: [{ match: '/spec-projection', status: 304, body: null }] });
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector('.inspector .overview-empty') !== null`, { timeout: 6000, label: '右栏无投影空态' });
  const none = await client.evaluate(`(() => ({
    title: document.querySelector('.inspector .overview-empty b')?.textContent?.trim() ?? null,
    statusRows: document.querySelectorAll('.insp-spec-status').length,
  }))()`);

  // 4) 375 窄屏：回到正常接口，设设备指标。
  await setStub(client, null);
  await client.reload({ ready: READY_COMPOSER });
  await client.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const narrow = await client.evaluate(`(() => {
    const inspector = document.querySelector('aside.inspector');
    const sidebar = document.querySelector('aside.sidebar, .sidebar');
    const rect = inspector?.getBoundingClientRect();
    const composer = document.querySelector('.composer');
    const composerRect = composer?.getBoundingClientRect();
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      inspectorDisplay: inspector ? getComputedStyle(inspector).display : null,
      inspectorBox: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      sidebarBox: sidebar ? (() => { const r = sidebar.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() : null,
      composerVisible: Boolean(composerRect && composerRect.width > 0 && composerRect.height > 0),
    };
  })()`);
  await client.send('Emulation.clearDeviceMetricsOverride', {});

  // 5) 无会话：会话树为空 → insp-placeholder「未选择会话」。
  await setStub(client, { rules: [{ match: '/api/sessions/tree', status: 200, body: { sessions: [] } }] });
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector('.insp-placeholder, .overview-empty') !== null`, { timeout: 6000, label: '无会话占位' });
  const noSession = await client.evaluate(`(() => ({
    placeholder: document.querySelector('.insp-placeholder')?.textContent?.trim() ?? null,
    dataSession: document.querySelector('aside.inspector')?.getAttribute('data-session') ?? null,
    emptyTitle: document.querySelector('.inspector .overview-empty b')?.textContent?.trim() ?? null,
    statusRows: document.querySelectorAll('.insp-spec-status').length,
  }))()`);

  ctx.evidence = { loading, error, none, narrow, noSession };
  ctx.check(loading.text === '右栏加载中…' && loading.role === 'status', '加载态：骨架「右栏加载中…」+ role=status', loading);
  ctx.check(loading.statusRows === 0, '加载态：状态行未提前渲染', loading.statusRows);
  ctx.check(error.title === '右栏加载失败' && error.role === 'alert', '错误态：「右栏加载失败」+ role=alert', error);
  ctx.check(error.retry === 1, '错误态提供 1 个重试按钮', error.retry);
  ctx.check(none.title === '暂无会话投影' && none.statusRows === 0, '无投影态：「暂无会话投影」且无状态行', none);
  ctx.check(noSession.placeholder === '未选择会话' && noSession.dataSession === null && noSession.statusRows === 0, '无会话态：「未选择会话」且不渲染 data-session', noSession);
  ctx.check(narrow.width === 375 && narrow.inspectorDisplay === 'none' && narrow.sidebarDisplay === 'none', '375 档侧栏与右栏 display:none', narrow);
  ctx.check(narrow.scrollWidth <= 375, '375 档无横向溢出（scrollWidth≤375）', narrow.scrollWidth);
  ctx.check(narrow.composerVisible === true, '375 档 Composer 可见', narrow.composerVisible);

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`
      : `四态齐全：加载「右栏加载中…」/失败「右栏加载失败」+重试/无投影「暂无会话投影」/无会话「未选择会话」；375 档侧栏与右栏 display:none、scrollWidth=${narrow.scrollWidth}、Composer 可见`,
  };
});

// AC-CONV-008-04 · 投影契约：taskLimit 越界 400、会话不存在 404、If-None-Match 304（体 0 字节、留 ETag）、前端 304 不闪空。
//
// 判据来源：specs/product/P1-CONV/spec.md::AC-CONV-008-04。
// 全部只读：HTTP 四类请求 + 页面切会话观察；唯一写操作是页面自己的 fetch 被本地桩接管。

import { runAc, apiGet, http, clickMatching, waitFor, sleep, readStubState, READY_INSPECTOR } from '../lib/ac-cdp.mjs';

runAc('AC-CONV-008-04', async (ctx) => {
  const base = ctx.baseUrl;

  const invalid = [];
  for (const limit of ['0', '51']) {
    const res = await apiGet(base, `/api/sessions/main/spec-projection?taskLimit=${limit}`);
    invalid.push({ limit, status: res.status, code: res.json?.error?.code ?? null, message: res.json?.error?.message ?? null });
  }
  const missing = await apiGet(base, '/api/sessions/sess-0123456789abcdef/spec-projection?taskLimit=3');
  const first = await apiGet(base, '/api/sessions/main/spec-projection?taskLimit=3');
  const etag = first.headers.etag ?? '';
  const notModified = await http(`${base}/api/sessions/main/spec-projection?taskLimit=3`, { headers: { 'If-None-Match': etag } });
  const staleTag = await http(`${base}/api/sessions/main/spec-projection?taskLimit=3`, { headers: { 'If-None-Match': '"spec-0000000000000000"' } });

  ctx.evidence.http = {
    invalid,
    missing: { status: missing.status, body: missing.text.slice(0, 160) },
    first: { status: first.status, etag, revision: first.json?.revision ?? null },
    notModified: { status: notModified.status, bytes: notModified.bytes, etag: notModified.headers.etag ?? null },
    staleTag: { status: staleTag.status },
  };

  ctx.check(invalid.every((row) => row.status === 400 && row.code === 'invalid_task_limit'), 'taskLimit 0/51 均 400 invalid_task_limit', invalid);
  ctx.check(missing.status === 404, '会话不存在 404', missing.status);
  ctx.check(first.status === 200 && /^"spec-[0-9a-f]{16}"$/.test(etag), '200 带 ETag（"spec-<16 hex>"）', etag);
  ctx.check(
    notModified.status === 304 && notModified.bytes === 0 && (notModified.headers.etag ?? '') === etag,
    'If-None-Match 命中 304、响应体 0 字节、ETag 原样保留',
    { status: notModified.status, bytes: notModified.bytes, etag: notModified.headers.etag ?? null },
  );
  ctx.check(staleTag.status === 200, 'ETag 不匹配回 200（304 不是无条件返回）', staleTag.status);

  // 前端：切走再切回主会话，同键（main+taskLimit=3）请求命中 304，右栏保留 rev、不亮骨架。
  const client = await ctx.openPage({ ready: READY_INSPECTOR });
  await waitFor(client, `document.querySelector('.insp-spec-status') !== null`, { label: '右栏投影首屏已渲染' });
  const revBefore = await client.evaluate(`document.querySelector('.insp-spec-status span')?.textContent ?? ''`);

  await clickMatching(client, '.session-row', '.session-title', '验收序B', { exact: false });
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-session') === 'sess-38497934b31bfc0a'`, { label: '已切到子会话 验收序B' });
  await sleep(900);
  // 切走时子会话无缓存，骨架必然出现一次；基线取在切回之前，只衡量“304 命中路径”是否再亮骨架。
  const hitsBefore = (await readStubState(client))?.loadingHits ?? 0;
  await clickMatching(client, '.session-row', '.session-title', '主会话');
  await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-session') === 'main'`, { label: '已切回主会话' });
  await sleep(900);

  const state = await readStubState(client);
  const revAfter = await client.evaluate(`document.querySelector('.insp-spec-status span')?.textContent ?? ''`);
  const specCalls = (state?.calls ?? []).filter((call) => call.url.includes('/spec-projection'));
  const got304 = specCalls.some((call) => call.status === 304);
  ctx.evidence.frontend = { revBefore, revAfter, hitsBefore, hitsAfter: state?.loadingHits ?? null, specCalls };

  ctx.check(got304, '前端切回主会话时同键请求实际收到 304', specCalls);
  ctx.check(revBefore === revAfter && revBefore !== '', '304 后 rev 文本不变（不闪空）', { revBefore, revAfter });
  ctx.check((state?.loadingHits ?? 0) === hitsBefore, '304 命中路径不亮右栏骨架（loadingHits 增量 0）', { hitsBefore, hitsAfter: state?.loadingHits ?? null });

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`
      : `taskLimit 0/51→400 invalid_task_limit、不存在会话→404、条件请求→304（0 字节、ETag 保留、脏 ETag 回 200）；前端切回同键 304 且 rev ${revAfter} 不变、骨架 0 次`,
  };
});

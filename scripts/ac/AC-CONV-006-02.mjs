// AC-CONV-006-02 · Composer：IME 组合中不发送、发送 500 后文本保留且错误 1 个、无 active 时禁用、长文本不截断。
//
// 判定：组合中 Enter 发送 0 次且事件 isComposing=true；失败后输入不变且 p.composer-error 1 个；
// 无会话时 textarea[disabled] 1 个；5000 字输入长度 5000、无截断。

import {
  runAc, setValue, pressKey, sleep, readStubState, waitFor, count, READY_COMPOSER, setStub,
} from '../lib/ac-cdp.mjs';

const TA = 'textarea[aria-label="消息输入框"]';
const FAIL_STUB = { rules: [{ match: '/api/chat', method: 'POST', status: 500, body: { ok: false, error: { code: 'upstream_error', message: '模拟上游 500' } } }] };
const EMPTY_TREE_STUB = { rules: [{ match: '/api/sessions/tree', status: 200, body: { sessions: [] } }] };

runAc('AC-CONV-006-02', async (ctx) => {
  const client = await ctx.openPage({ stub: FAIL_STUB, ready: READY_COMPOSER });
  await client.evaluate(`localStorage.clear()`);
  await client.reload({ ready: READY_COMPOSER });

  const sends = async () => (await readStubState(client))?.sends ?? 0;
  await client.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(TA)});
    window.__acKeys = [];
    el.addEventListener('keydown', (event) => window.__acKeys.push({ key: event.key, isComposing: event.isComposing, shift: event.shiftKey }), true);
    return true;
  })()`);

  // 1) IME 组合中：compositionstart 置 composingRef，Enter 不发送；再派发 isComposing=true 的键盘事件。
  await setValue(client, TA, '组合中的文字');
  await client.evaluate(`document.querySelector(${JSON.stringify(TA)}).dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))`);
  const beforeIme = await sends();
  await pressKey(client, 'Enter');
  await sleep(150);
  const imeComposingDelta = (await sends()) - beforeIme;
  const imeValue = await client.evaluate(`document.querySelector(${JSON.stringify(TA)}).value`);
  await client.evaluate(`document.querySelector(${JSON.stringify(TA)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }))`);
  await sleep(150);
  const imeNativeDelta = (await sends()) - beforeIme;
  const keys = await client.evaluate(`window.__acKeys`);
  await client.evaluate(`document.querySelector(${JSON.stringify(TA)}).dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))`);
  await sleep(160);

  // 2) 发送 500：文本保留、错误节点 1 个、发送计数 +1。
  await setValue(client, TA, '失败保留样本');
  const beforeFail = await sends();
  await pressKey(client, 'Enter');
  await waitFor(client, `document.querySelectorAll('p.composer-error').length === 1`, { timeout: 4000, label: '发送失败后出现 1 个错误节点' });
  await sleep(150);
  const fail = {
    sendsDelta: (await sends()) - beforeFail,
    value: await client.evaluate(`document.querySelector(${JSON.stringify(TA)}).value`),
    errors: await count(client, 'p.composer-error'),
    errorText: await client.evaluate(`document.querySelector('p.composer-error')?.textContent?.trim() ?? ''`),
  };

  // 3) 无 active 会话：会话树为空 → activeId='' → Composer 禁用。
  await setStub(client, EMPTY_TREE_STUB);
  await client.reload({ ready: READY_COMPOSER });
  await waitFor(client, `document.querySelector(${JSON.stringify(TA)}) !== null`, { timeout: 8000, label: '无会话时 Composer 仍渲染' });
  const disabled = {
    disabledTextareas: await client.evaluate(`document.querySelectorAll('textarea[aria-label="消息输入框"][disabled]').length`),
    sessionRows: await count(client, '.session-row'),
    modeButtons: await count(client, 'button.composer-hint-icon'),
  };

  // 4) 长文本：5000 字不截断。
  await setStub(client, null);
  await client.reload({ ready: READY_COMPOSER });
  const longText = '长'.repeat(5000);
  await setValue(client, TA, longText);
  await sleep(200);
  const long = await client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(TA)}); return { length: el.value.length, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, maxLength: el.maxLength }; })()`);

  ctx.evidence = { ime: { imeComposingDelta, imeNativeDelta, imeValue, keys }, fail, disabled, long };
  ctx.check(imeComposingDelta === 0, 'IME 组合中（composingRef）Enter 发送 0 次', imeComposingDelta);
  ctx.check(imeNativeDelta === 0, 'isComposing=true 的 Enter 发送 0 次', imeNativeDelta);
  ctx.check(keys.some((item) => item.key === 'Enter' && item.isComposing === true), '合成键盘事件 isComposing=true 可观测', keys);
  ctx.check(fail.sendsDelta === 1, '失败样本触发 1 次 POST /api/chat', fail.sendsDelta);
  ctx.check(fail.value === '失败保留样本', '发送 500 后输入文本保留', fail.value);
  ctx.check(fail.errors === 1, '发送失败后错误节点 1 个', { errors: fail.errors, text: fail.errorText });
  ctx.check(disabled.sessionRows === 0 && disabled.disabledTextareas === 1, '无 active 会话时 textarea[disabled] 1 个', disabled);
  ctx.check(long.length === 5000, '5000 字全部进入输入框（无截断）', { length: long.length, maxLength: long.maxLength });
  ctx.check(long.scrollHeight >= 40 && long.scrollHeight >= long.clientHeight, '输入框内容高度随长文本增长（scrollHeight≥clientHeight）', long);

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`
      : `IME 组合中 0 次发送（isComposing=true 可观测）；500 后文本保留且错误 1 个；无 active 时 disabled=1（会话行 0）；5000 字长度 5000、scrollHeight=${long.scrollHeight}`,
  };
});

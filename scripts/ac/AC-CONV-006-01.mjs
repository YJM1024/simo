// AC-CONV-006-01 · Composer 键位映射、模式按钮 aria、localStorage 持久化。
//
// 4 键 × 2 模式 = 8 个映射；期望（README/library.tsx:961-971）：
//   enter 模式       Enter 发送、Shift+Enter 换行、Ctrl+Enter 发送、⌘+Enter 发送
//   shift-enter 模式 Enter 换行、Shift+Enter 发送、Ctrl+Enter 发送、⌘+Enter 发送
//
// 发送数用页面内 fetch 桩统计 POST /api/chat（桩返回 202，不触发模型）；键位用 CDP Input.dispatchKeyEvent。
// 选择器偏差：spec 写 `.mode-toggle`，实际 DOM 是 button.composer-hint-icon（aria-pressed / aria-label）。

import {
  runAc, AcFail, click, setValue, pressKey, MOD as MODS, sleep, readStubState, READY_COMPOSER,
} from '../lib/ac-cdp.mjs';

const CHAT_STUB = { rules: [{ match: '/api/chat', method: 'POST', status: 202, body: { ok: true, messageId: 'ac-stub-006-01', sessionId: 'main' } }] };
const TA = 'textarea[aria-label="消息输入框"]';

const EXPECT = {
  enter: { Enter: 1, 'Shift+Enter': 0, 'Ctrl+Enter': 1, 'Meta+Enter': 1 },
  'shift-enter': { Enter: 0, 'Shift+Enter': 1, 'Ctrl+Enter': 1, 'Meta+Enter': 1 },
};
const KEYS = [
  { name: 'Enter', key: 'Enter', modifiers: 0 },
  { name: 'Shift+Enter', key: 'Enter', modifiers: MODS.shift },
  { name: 'Ctrl+Enter', key: 'Enter', modifiers: MODS.ctrl },
  { name: 'Meta+Enter', key: 'Enter', modifiers: MODS.meta },
];

runAc('AC-CONV-006-01', async (ctx) => {
  const client = await ctx.openPage({ stub: CHAT_STUB, ready: READY_COMPOSER });
  await client.evaluate(`localStorage.clear()`);
  await client.reload({ ready: READY_COMPOSER });

  async function sends() { return (await readStubState(client))?.sends ?? 0; }

  async function runMatrix(mode) {
    const rows = [];
    for (const item of KEYS) {
      await setValue(client, TA, 'ac-key');
      const before = await sends();
      await pressKey(client, item.key, item.modifiers);
      await sleep(160);
      const after = await sends();
      const valueLen = await client.evaluate(`document.querySelector(${JSON.stringify(TA)}).value.length`);
      rows.push({ mode, key: item.name, delta: after - before, valueLen });
      await setValue(client, TA, '');
      await sleep(40);
    }
    return rows;
  }

  const enterPressed = await client.evaluate(`document.querySelector('button.composer-hint-icon')?.getAttribute('aria-pressed')`);
  const enterHint = await client.evaluate(`document.querySelector('.composer-send-mode-hint')?.textContent ?? ''`);
  const enterMatrix = await runMatrix('enter');

  await click(client, 'button.composer-hint-icon');
  await sleep(200);
  const toggled = {
    pressed: await client.evaluate(`document.querySelector('button.composer-hint-icon')?.getAttribute('aria-pressed')`),
    hint: await client.evaluate(`document.querySelector('.composer-send-mode-hint')?.textContent ?? ''`),
    ariaLabel: await client.evaluate(`document.querySelector('button.composer-hint-icon')?.getAttribute('aria-label') ?? ''`),
    storage: await client.evaluate(`localStorage.getItem('simo.composer.sendMode')`),
  };
  const shiftMatrix = await runMatrix('shift-enter');

  await client.reload({ ready: READY_COMPOSER });
  const afterReload = {
    pressed: await client.evaluate(`document.querySelector('button.composer-hint-icon')?.getAttribute('aria-pressed')`),
    storage: await client.evaluate(`localStorage.getItem('simo.composer.sendMode')`),
    hint: await client.evaluate(`document.querySelector('.composer-send-mode-hint')?.textContent ?? ''`),
  };
  const reloadMatrix = await runMatrix('shift-enter');

  ctx.evidence = { selectors: { modeToggle: 'button.composer-hint-icon（spec 写 .mode-toggle）' }, enterPressed, enterHint, enterMatrix, toggled, shiftMatrix, afterReload, reloadMatrix };

  for (const row of [...enterMatrix, ...shiftMatrix, ...reloadMatrix]) {
    ctx.check(row.delta === EXPECT[row.mode][row.key], `${row.mode} · ${row.key} 发送数 ${EXPECT[row.mode][row.key]}（实测 ${row.delta}）`, row);
  }
  ctx.check(enterPressed === 'false', '初始 enter 模式 aria-pressed=false', enterPressed);
  ctx.check(enterHint.includes('Enter 发送'), 'enter 模式提示文案为“Enter 发送，Shift+Enter 换行”', enterHint);
  ctx.check(toggled.pressed === 'true', '点击后 aria-pressed=true', toggled);
  ctx.check(toggled.storage === 'shift-enter', 'localStorage simo.composer.sendMode=shift-enter', toggled.storage);
  ctx.check(toggled.hint.includes('Enter 换行'), '切换后提示文案反转', toggled.hint);
  ctx.check(afterReload.pressed === 'true' && afterReload.storage === 'shift-enter', '刷新后 aria-pressed 与 localStorage 不变', afterReload);

  if (enterMatrix.some((row) => row.valueLen !== 0 && EXPECT.enter[row.key] === 1)) {
    throw new AcFail('发送成功后输入框未清空（valueLen>0），键位映射不可信');
  }

  const failed = ctx.checks.filter((item) => !item.ok);
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}`
      : `8/8 键位映射一致（enter：Enter/Ctrl/Meta 发送；shift-enter：Shift+Enter 发送）；aria-pressed 与提示文案同步翻转；刷新后 localStorage=shift-enter 不变（选择器偏差：实际 button.composer-hint-icon，非 .mode-toggle）`,
  };
});

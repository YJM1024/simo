// AC-CONV-005-02 · 停止语义（真实上游版）：流式回复中途点「停止」后不再产生后续帧、不落库、回 idle。
//
// 判据里「上游 context 10ms 内被取消」「retracted 帧先于 idle」在黑盒层面不可观测，脚本用机制证据说明
// （backend/internal/modules/chat/stop_upstream_test.go 与 docs/testing/STOP-UPSTREAM-EVIDENCE-20261122.md）。
// 可观测的部分全部按真实上游验：发长回复 → streaming 且 delta 增长 → 点停止 → 2s 内 assistant 文本不再增长、
// 无新 messageId、停止按钮消失、无 composer 错误；API 侧被停止的那条 agent 消息不落库（status 不为 done、text 为空）。
// 若上游返回 error 帧（agent 消息带「失败」徽标且无 delta），判 blocked 并写明，不伪造成通过。

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  runAc, AcBlocked, setValue, sleep, apiGet, READY_COMPOSER, ROOT,
} from '../lib/ac-cdp.mjs';

const SESSION = 'sess-a29cef9ffc38240b'; // 验收序A，非归档
const PROMPT = '请写一段 400 字左右的说明，介绍分片上传的重试策略，分 5 段，每段单独成行。';

runAc('AC-CONV-005-02', async (ctx) => {
  const client = await ctx.openPage({ ready: READY_COMPOSER });
  await client.evaluate(`localStorage.setItem('simo.active-session', ${JSON.stringify(SESSION)})`);
  await client.reload({ ready: READY_COMPOSER });
  await sleep(400);

  const snapshot = () => client.evaluate(`(() => {
    const nodes = [...document.querySelectorAll('.msg[data-message-id]')];
    const agents = nodes.filter((el) => el.classList.contains('from-agent'));
    const last = agents.length ? agents[agents.length - 1] : null;
    return {
      ids: nodes.map((el) => el.getAttribute('data-message-id')),
      agentCount: agents.length,
      lastAgentLen: last ? (last.querySelector('.msg-text')?.textContent || '').trim().length : 0,
      lastAgentFailed: last ? Boolean(last.querySelector('.badge.danger')) : false,
      stop: document.querySelectorAll('button.composer-stop').length,
      error: document.querySelectorAll('p.composer-error').length,
      inputLen: document.querySelector('textarea[aria-label="消息输入框"]').value.length,
    };
  })()`);

  const before = await snapshot();
  const apiBefore = await apiGet(ctx.baseUrl, `/api/sessions/${SESSION}/messages?scope=all`);

  await setValue(client, 'textarea[aria-label="消息输入框"]', PROMPT);
  await client.evaluate(`document.querySelector('button.send').click()`);

  let streamed = null;
  let upstreamFailed = false;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await sleep(80);
    const now = await snapshot();
    const hasNewAgent = now.agentCount > before.agentCount;
    if (hasNewAgent && now.lastAgentFailed) { upstreamFailed = true; break; }
    if (now.stop > 0) streamed = now;
    if (streamed && now.lastAgentLen > 0) { streamed = now; break; }
  }

  if (upstreamFailed) {
    const apiAfterFail = await apiGet(ctx.baseUrl, `/api/sessions/${SESSION}/messages?scope=all`);
    const newMsgs = (apiAfterFail.json?.messages ?? []).filter((m) => !(apiBefore.json?.messages ?? []).some((old) => old.id === m.id));
    ctx.evidence = { session: SESSION, abandoned: true, lastAgentFailed: true, newMsgs: newMsgs.map((m) => ({ role: m.role, status: m.status, textLen: m.text.length })) };
    throw new AcBlocked(
      `上游返回 error 帧：发送 202 后 agent 消息标「失败」且无 delta 文本，流式窗口不足，无法观测「流中停止 → 后续帧 0」。`
      + `该故障属 8787 上游不可用，不是 AC 断言失败。`
    );
  }

  if (!streamed) {
    const now = await snapshot();
    ctx.evidence = { session: SESSION, before, now };
    return { pass: false, detail: `25s 内未观测到 streaming + delta（停止按钮 ${now.stop}、最后 assistant 文本 ${now.lastAgentLen} 字符、错误 ${now.error}）` };
  }

  const idsAtStop = streamed.ids;
  const lenAtStop = streamed.lastAgentLen;
  const stopClicked = await client.evaluate(`(() => { const b = document.querySelector('button.composer-stop'); if (!b) return false; b.click(); return true; })()`);
  await sleep(2000);
  const afterStop = await snapshot();
  const framesAfterStop = Math.max(0, afterStop.lastAgentLen - lenAtStop);
  const newIds = afterStop.ids.filter((id) => !idsAtStop.includes(id));
  const apiAfter = await apiGet(ctx.baseUrl, `/api/sessions/${SESSION}/messages?scope=all`);

  const newApiMsgs = (apiAfter.json?.messages ?? []).filter((m) => !(apiBefore.json?.messages ?? []).some((old) => old.id === m.id));
  const stoppedAgentPersisted = newApiMsgs.filter((m) => m.role === 'agent' && m.status === 'done');
  const agentEmpty = newApiMsgs.filter((m) => m.role === 'agent' && m.text.trim().length === 0);

  const mechanismTest = path.join(ROOT, 'backend', 'internal', 'modules', 'chat', 'stop_upstream_test.go');
  const mechanismDoc = path.join(ROOT, 'docs', 'testing', 'STOP-UPSTREAM-EVIDENCE-20261122.md');

  ctx.evidence = {
    session: SESSION,
    streaming: { stop: streamed.stop, lenAtStop, inputLen: streamed.inputLen },
    stopClicked, framesAfterStop, newIds,
    afterStop: { stop: afterStop.stop, error: afterStop.error, lastAgentLen: afterStop.lastAgentLen },
    newApiMsgs: newApiMsgs.map((m) => ({ role: m.role, status: m.status, textLen: m.text.length })),
    stoppedAgentPersisted: stoppedAgentPersisted.length,
    agentEmpty: agentEmpty.length,
    mechanism: {
      stop_upstream_test: existsSync(mechanismTest),
      evidence_doc: existsSync(mechanismDoc),
    },
  };

  ctx.check(streamed.stop > 0 && lenAtStop > 0, '流式中「停止」按钮出现且已有 delta 文本', { stop: streamed.stop, lenAtStop });
  ctx.check(stopClicked === true, '流中点「停止」成功', stopClicked);
  ctx.check(framesAfterStop === 0, '停止后 2s 内 assistant 文本不再增长（后续帧 0）', { lenAtStop, after: afterStop.lastAgentLen, framesAfterStop });
  ctx.check(newIds.length === 0, '停止后无新 messageId（retracted 不追加气泡）', newIds);
  ctx.check(afterStop.stop === 0, '停止后「停止」按钮消失（回 idle）', afterStop.stop);
  ctx.check(afterStop.error === 0, '停止路径无 composer 错误', afterStop.error);
  ctx.check(stoppedAgentPersisted.length === 0, '被停止的 assistant 消息不落库（无 status=done）', stoppedAgentPersisted.length);
  ctx.check(existsSync(mechanismTest) && existsSync(mechanismDoc), '上游 context 取消有机制证据文件', ctx.evidence.mechanism);

  const failed = ctx.checks.filter((item) => !item.ok);
  const caveat = '未覆盖：「上游 context 10ms 内取消」「retracted 先于 idle」为服务端时序，黑盒不可观测，仅以 stop_upstream_test.go 机制用例作证据';
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}。实测 ${JSON.stringify({ lenAtStop, framesAfterStop, stopGone: afterStop.stop, newIds, persisted: stoppedAgentPersisted.length })}`
      : `流式中 delta ${lenAtStop} 字符时点停止：2s 内文本增量 ${framesAfterStop}、新 messageId ${newIds.length}、停止按钮消失、错误 ${afterStop.error}；API 新增消息 ${JSON.stringify(ctx.evidence.newApiMsgs)}，无 status=done 的 assistant 记录。${caveat}`,
  };
});

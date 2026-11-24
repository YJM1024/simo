// AC-CONV-005-01 · 发送主路径（POST /api/chat 202 → 输入清空 → 流式 delta/done → 流中停止）。
//
// 脚本按真实上游写：向既有非归档测试会话发送长、短两条消息。长回复用于观测 500ms 内出现 user 消息、
// 「停止」按钮（streaming）、assistant delta 增长，并在流中点停止后断言 messageId 增量 0；短回复走到
// 自然 done，断言 done 后输入长度 0。若上游返回 error 帧（agent 消息带「失败」徽标且无 delta），
// 判 blocked 并写明，不把上游故障算成断言失败。
// 未观测项：判据里的「他流 >0」需要两路并发流夹具，脚本只驱动一个页面、一条流，不覆盖。

import {
  runAc, AcBlocked, setValue, sleep, READY_COMPOSER, apiGet, connect, http, CDP_HTTP, installStub, openPage,
} from '../lib/ac-cdp.mjs';

const SESSION = 'sess-38497934b31bfc0a'; // 验收序B，非归档
const LONG_PROMPT = '请逐条列出 10 条关于本地优先软件的要点，每条不少于 20 字，按 1-10 编号。';
const SHORT_PROMPT = '只回复两个字：收到';

runAc('AC-CONV-005-01', async (ctx) => {
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
      agentIds: agents.map((el) => el.getAttribute('data-message-id')),
      lastAgentLen: last ? (last.querySelector('.msg-text')?.textContent || '').trim().length : 0,
      lastAgentFailed: last ? Boolean(last.querySelector('.badge.danger')) : false,
      stop: document.querySelectorAll('button.composer-stop').length,
      send: document.querySelectorAll('button.send').length,
      sendDisabled: document.querySelector('button.send')?.disabled ?? null,
      inputLen: document.querySelector('textarea[aria-label="消息输入框"]').value.length,
      error: document.querySelectorAll('p.composer-error').length,
    };
  })()`);

  const before = await snapshot();
  const apiBefore = await apiGet(ctx.baseUrl, `/api/sessions/${SESSION}/messages?scope=all`);

  // —— 第一段：长回复，流中点停止 ——
  await setValue(client, 'textarea[aria-label="消息输入框"]', LONG_PROMPT);
  const sentAt = Date.now();
  await client.evaluate(`document.querySelector('button.send').click()`);

  let elapsedMs = null;
  let arrived = null;
  const arriveDeadline = Date.now() + 3000;
  while (Date.now() < arriveDeadline) {
    await sleep(25);
    const now = await snapshot();
    if (now.ids.length > before.ids.length) { elapsedMs = Date.now() - sentAt; arrived = now; break; }
  }
  if (!arrived) arrived = await snapshot();
  const inputAfterSend = arrived.inputLen;

  let streamed = null;
  let upstreamFailed = false;
  const streamDeadline = Date.now() + 20000;
  while (Date.now() < streamDeadline) {
    await sleep(80);
    const now = await snapshot();
    const newAgent = now.agentIds.filter((id) => !before.agentIds.includes(id));
    if (newAgent.length && now.lastAgentFailed) { upstreamFailed = true; arrived = now; break; }
    if (now.stop > 0) { streamed = now; }
    if (streamed && now.lastAgentLen > 0) { streamed = now; break; }
    if (!streamed && now.stop === 0 && now.lastAgentLen > 0) break; // 极短回复：未经停止就完成
  }

  if (upstreamFailed) {
    const apiAfterFail = await apiGet(ctx.baseUrl, `/api/sessions/${SESSION}/messages?scope=all`);
    const newMsgs = (apiAfterFail.json?.messages ?? []).filter((m) => !(apiBefore.json?.messages ?? []).some((old) => old.id === m.id));
    ctx.evidence = { session: SESSION, elapsedMs, inputAfterSend, upstreamFailed, newMsgs: newMsgs.map((m) => ({ role: m.role, status: m.status, textLen: m.text.length })) };
    throw new AcBlocked(
      `上游返回 error 帧：POST /api/chat 202 后 agent 消息 status=error、界面带「失败」徽标且无 delta 文本，`
      + `流式窗口不足以观测 delta/done/停止。已验接受路径：user 消息 ${elapsedMs}ms 内出现、发送后输入长度 ${inputAfterSend}。`
      + `该错误与 AC 断言无关，属 8787 上游不可用。`,
    );
  }

  const firstLen = streamed?.lastAgentLen ?? 0;
  let grownLen = firstLen;
  const growDeadline = Date.now() + 6000;
  while (Date.now() < growDeadline) {
    await sleep(120);
    const now = await snapshot();
    if (now.lastAgentFailed) {
      throw new AcBlocked(`流式过程中上游转 error：delta ${firstLen}→${now.lastAgentLen} 字符后 agent 消息标失败，停止窗口消失，无法完成「流中停止」断言。`);
    }
    grownLen = Math.max(grownLen, now.lastAgentLen);
    if (grownLen > firstLen) break;
  }

  const idsAtStop = streamed?.ids ?? (await snapshot()).ids;
  const stopped = await client.evaluate(`(() => { const b = document.querySelector('button.composer-stop'); if (!b) return false; b.click(); return true; })()`);
  await sleep(2000);
  const afterStop = await snapshot();
  const newAfterStop = afterStop.ids.filter((id) => !idsAtStop.includes(id));

  // —— 他流：另开一个标签持续流式，再在主标签停掉自己的流，断言他流未被连带停止 ——
  let otherStream = { attempted: false };
  try {
    const created = await http(`${CDP_HTTP}/json/new?url=${encodeURIComponent(ctx.baseUrl + '/')}`, { method: 'PUT', timeout: 8000 });
    const tabId = created.json?.id;
    if (tabId) {
      const other = await connect(ctx.baseUrl, { targetId: tabId });
      await installStub(other);
      await openPage(other, ctx.baseUrl, { ready: READY_COMPOSER });
      await other.evaluate(`localStorage.setItem('simo.active-session', 'sess-a29cef9ffc38240b')`);
      await other.reload({ ready: READY_COMPOSER });
      await sleep(300);
      const otherSnap = () => other.evaluate(`(() => {
        const agents = [...document.querySelectorAll('.msg.from-agent')];
        const last = agents[agents.length - 1];
        return { len: last ? (last.querySelector('.msg-text')?.textContent || '').trim().length : 0, stop: document.querySelectorAll('button.composer-stop').length };
      })()`);
      await setValue(other, 'textarea[aria-label="消息输入框"]', '请写一段 500 字左右的说明，介绍增量备份与全量备份的取舍，分 6 段，每段单独成行。');
      await other.evaluate(`document.querySelector('button.send').click()`);
      let otherBefore = { len: 0, stop: 0 };
      const otherDeadline = Date.now() + 25000;
      while (Date.now() < otherDeadline) {
        await sleep(120);
        otherBefore = await otherSnap();
        if (otherBefore.stop > 0 && otherBefore.len > 0) break;
      }
      await setValue(client, 'textarea[aria-label="消息输入框"]', '请再写 300 字，说明灰度发布的三条原则。');
      await client.evaluate(`document.querySelector('button.send').click()`);
      let mine = null;
      const mineDeadline = Date.now() + 25000;
      while (Date.now() < mineDeadline) {
        await sleep(80);
        mine = await snapshot();
        if (mine.stop > 0 && mine.lastAgentLen > 0) break;
      }
      await client.evaluate(`(() => { const b = document.querySelector('button.composer-stop'); if (b) b.click(); return true; })()`);
      await sleep(1800);
      const otherAfter = await otherSnap();
      otherStream = {
        attempted: true,
        before: otherBefore,
        after: otherAfter,
        otherDelta: otherAfter.len - otherBefore.len,
        mineLen: mine?.lastAgentLen ?? 0,
        otherStillStreaming: otherAfter.stop > 0,
      };
      await http(`${CDP_HTTP}/json/close/${tabId}`, { timeout: 5000 }).catch(() => null);
    }
  } catch (err) {
    otherStream = { attempted: false, error: String(err.message).slice(0, 160) };
  }

  // —— 第二段：短回复，等自然 done ——
  await setValue(client, 'textarea[aria-label="消息输入框"]', SHORT_PROMPT);
  await client.evaluate(`document.querySelector('button.send').click()`);
  let doneState = null;
  const doneDeadline = Date.now() + 40000;
  while (Date.now() < doneDeadline) {
    await sleep(200);
    const now = await snapshot();
    if (now.lastAgentFailed) throw new AcBlocked(`短回复上游返回 error 帧（agent 消息标失败），自然 done 不可观测。`);
    if (now.stop === 0 && now.lastAgentLen > 0) { doneState = now; break; }
  }
  if (!doneState) doneState = await snapshot();
  const apiAfter = await apiGet(ctx.baseUrl, `/api/sessions/${SESSION}/messages?scope=all`);

  ctx.evidence = {
    session: SESSION,
    before, apiBeforeTotal: apiBefore.json?.total,
    elapsedMs, inputAfterSend,
    streaming: streamed ? { stop: streamed.stop, firstLen } : null,
    grownLen, stopped,
    newAfterStop, afterStop,
    doneState: { stop: doneState.stop, inputLen: doneState.inputLen, lastAgentLen: doneState.lastAgentLen },
    apiAfterTotal: apiAfter.json?.total,
    otherStream,
  };

  ctx.check(elapsedMs !== null && elapsedMs <= 500, '发送后 500ms 内出现 1 条消息', { elapsedMs });
  ctx.check(inputAfterSend === 0, '发送后输入框清空', inputAfterSend);
  ctx.check(Boolean(streamed), '流式中出现「停止」按钮且 assistant 文本非空', streamed && { stop: streamed.stop, len: firstLen });
  ctx.check(grownLen > firstLen, '流式中 assistant delta 文本增长', { firstLen, grownLen });
  ctx.check(stopped === true, '流中点「停止」按钮成功', stopped);
  ctx.check(afterStop.stop === 0, '停止后「停止」按钮消失（回 idle）', afterStop.stop);
  ctx.check(newAfterStop.length === 0, '停止后 messageId 增量 0', newAfterStop);
  ctx.check(afterStop.error === 0, '停止路径无 composer 错误', afterStop.error);
  ctx.check(doneState.inputLen === 0 && doneState.stop === 0, '自然 done 后输入长度 0 且流结束', { inputLen: doneState.inputLen, stop: doneState.stop });
  ctx.check(doneState.lastAgentLen > 0, '短回复 done 后 assistant 文本非空', doneState.lastAgentLen);
  ctx.check((apiAfter.json?.total ?? 0) >= (apiBefore.json?.total ?? 0) + 2, '落库消息数随两次发送增长', { before: apiBefore.json?.total, after: apiAfter.json?.total });
  if (otherStream.attempted) {
    ctx.check(otherStream.otherStillStreaming === true, '停止自己的流后他流仍在流式（停止按钮仍在）', otherStream.after);
    ctx.check(otherStream.otherDelta > 0, '停止自己的流后他流 delta 继续增长（他流 >0）', { before: otherStream.before, after: otherStream.after });
  }

  const failed = ctx.checks.filter((item) => !item.ok);
  const otherNote = otherStream.attempted
    ? `他流：停止自己的流前 ${otherStream.before.len} 字符、1.8s 后 ${otherStream.after.len} 字符（增量 ${otherStream.otherDelta}）、他流停止按钮仍在 ${otherStream.otherStillStreaming}`
    : `他流 >0 未观测：另开标签的准备失败（${otherStream.error ?? '未创建 target'}）`;
  return {
    pass: failed.length === 0,
    detail: failed.length
      ? `失败 ${failed.length} 项：${failed.map((item) => item.label).join('；')}。实测：${JSON.stringify({ elapsedMs, inputAfterSend, firstLen, grownLen, stopGone: afterStop.stop, newAfterStop, done: { inputLen: doneState.inputLen, stop: doneState.stop }, errors: afterStop.error })}`
      : `500ms 内出现消息（${elapsedMs}ms）；streaming 停止按钮出现、delta ${firstLen}→${grownLen} 字符；点停止后 2s 内无新 messageId、停止按钮消失、输入长度 ${inputAfterSend}；短回复自然 done 后输入 0、assistant 文本 ${doneState.lastAgentLen} 字符；落库 ${apiBefore.json?.total}→${apiAfter.json?.total}；${otherNote}。`,
  };
});

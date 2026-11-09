/**
 * 冒烟测试：用 node:test 验证内核的 6 条关键不变量 + 关键模块行为。
 *
 * 对应关系：
 *  - D-07 store.mjs      —— 不变量 5（单写者锁）、不变量 6（重启恢复）
 *  - D-05 policy.mjs     —— 白名单 / bot / 噪音 / 明确请求 / 规则版本
 *  - D-03 tasks.mjs      —— Report 六态、结构化 waitingOn、无 clearance 不得进 person/review
 *  - D-08 scheduler.mjs  —— 不变量 4（人优先 slot + 抢占空出普通 slot）
 *  - D-06 context.mjs    —— Inline & Spill
 *  - D-09 acceptance.mjs —— 不变量 3（验收门）
 *  - D-15 runtime.mjs    —— 不变量 1（幂等）、2（observe 不建票）、3（端到端打回）、6（端到端恢复）
 *
 * 测试全部使用纯本地临时目录（skeleton/.test-tmp），不联网、无第三方依赖。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/kernel/bus.mjs';
import { createStore, StoreLockedError } from '../src/kernel/store.mjs';
import { createPolicy } from '../src/kernel/policy.mjs';
import { createScheduler } from '../src/kernel/scheduler.mjs';
import { assembleContext } from '../src/kernel/context.mjs';
import { createAcceptanceGate } from '../src/kernel/acceptance.mjs';
import {
  createTicket,
  addReport,
  enterReview,
} from '../src/kernel/tasks.mjs';
import { createKernel } from '../src/kernel/runtime.mjs';
import { createMockLLM } from '../src/llm/mock.mjs';
import { bugfixScenario } from '../src/scenarios/bugfix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP_BASE = join(HERE, '..', '.test-tmp');
mkdirSync(TMP_BASE, { recursive: true });

let tmpSeq = 0;
function makeRoot(label) {
  tmpSeq += 1;
  return mkdtempSync(join(TMP_BASE, `${label}-${tmpSeq}-`));
}
function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

const FULL_EVIDENCE = Object.freeze({
  reproTest: 'test/repro/login-500.test.mjs',
  testPass: true,
  diffScope: 'src/auth/login.mjs (+12/-3)',
  rollback: 'revert 单 commit',
});
const PARTIAL_EVIDENCE = Object.freeze({
  testPass: true,
  diffScope: 'src/auth/login.mjs (+8/-2)',
});

function makeLLM({ work } = {}) {
  return createMockLLM({
    scripts: {
      assess: ({ task }) => ({ kind: 'assessment', accept: true, reason: 'test accept', title: `修复：${task.text}` }),
      work: work ?? [{ kind: 'report', state: 'ready', summary: '一次完成', evidence: FULL_EVIDENCE }],
      review: () => ({ kind: 'review', approve: true, notes: 'ok' }),
    },
  });
}

function trigger(overrides = {}) {
  return {
    id: 'trg-test-1',
    source: 'slack',
    threadKey: 'slack:#test',
    author: { id: 'u-1', name: '测试用户' },
    text: '登录接口 500，麻烦修一下',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// D-05 Gate
// ---------------------------------------------------------------------------
test('D-05 Gate：白名单 / bot / 噪音被确定性拦截，明确请求与疑似缺陷分级输出', () => {
  const policy = createPolicy({ rules: bugfixScenario.admissionRules, acceptMode: 'auto' });

  assert.equal(policy.evaluate(trigger({ source: 'email' })).verdict, 'notAdmitted', '非白名单来源必须 notAdmitted');
  assert.equal(policy.evaluate(trigger({ author: { id: 'bot-1', name: 'ci-bot', isBot: true } })).verdict, 'notAdmitted', 'bot 发起者必须 notAdmitted');
  assert.equal(policy.evaluate(trigger({ text: '今天午饭吃什么？' })).verdict, 'notAdmitted', '闲聊必须 notAdmitted（从而不调模型）');
  assert.equal(policy.evaluate(trigger({ text: '登录接口 500，麻烦修一下' })).verdict, 'explicit', '明确请求关键词 → explicit');
  assert.equal(policy.evaluate(trigger({ text: '登录接口 500 报错' })).verdict, 'inferred', '有缺陷信号但无明确请求 → inferred');

  assert.match(policy.version, /^pv-[0-9a-f]{8}$/);
  const changed = createPolicy({ rules: { ...bugfixScenario.admissionRules, sourceWhitelist: ['slack'] }, acceptMode: 'auto' });
  assert.notEqual(changed.version, policy.version, '规则变了版本号必须变');

  const observe = createPolicy({ rules: bugfixScenario.admissionRules, acceptMode: 'observe' });
  assert.equal(observe.decide(trigger()).action, 'would-accept');
  assert.equal(observe.decide(trigger({ text: '今天午饭吃什么？' })).action, 'drop');
});

// ---------------------------------------------------------------------------
// 不变量 5：单写者
// ---------------------------------------------------------------------------
test('不变量 5 单写者：同一 state 目录第二个 Store 实例启动必须失败（lockfile）', () => {
  const root = makeRoot('store-lock');
  const first = createStore({ root });
  try {
    first.append('ticket', createTicket({ id: 'tk-lock', threadKey: 't', title: '锁测试', at: 1 }));
    assert.throws(
      () => createStore({ root }),
      (error) => error instanceof StoreLockedError || error?.name === 'StoreLockedError',
      '第二个 Store 必须因 lockfile 冲突而失败',
    );
  } finally {
    first.close();
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// 不变量 6：Store 级重启恢复
// ---------------------------------------------------------------------------
test('不变量 6 重启恢复：新 Store 从 state.jsonl 重建索引，Ticket 的 stage/status 不丢', () => {
  const root = makeRoot('store-restart');
  const writer = createStore({ root, clock: () => 1 });
  try {
    writer.append('ticket', createTicket({ id: 'tk-restart', threadKey: 't', title: '恢复测试', at: 1 }));
    writer.update('ticket', 'tk-restart', (draft) => {
      draft.stage = 'person/review';
      return draft;
    });
    const logLines = readFileSync(join(root, '.superagent', 'state.jsonl'), 'utf8').trim().split('\n');
    assert.equal(logLines.length, 2, 'append-only：append + update 各一条记录');
  } finally {
    writer.close();
  }

  const reader = createStore({ root, clock: () => 2 });
  try {
    const restored = reader.get('ticket', 'tk-restart');
    assert.ok(restored, '重启后必须能按 id 取回 Ticket');
    assert.equal(restored.stage, 'person/review');
    assert.equal(restored.status, 'open');
    assert.equal(restored.title, '恢复测试');
    assert.equal(reader.list('ticket').length, 1);
  } finally {
    reader.close();
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// 不变量 1：幂等
// ---------------------------------------------------------------------------
test('不变量 1 幂等：同一 Trigger 重复投递只产生一个 Ticket', async () => {
  const root = makeRoot('idem');
  const llm = makeLLM();
  const kernel = createKernel({ root, scenario: bugfixScenario, llm, acceptMode: 'auto', bus: createBus(), clock: () => 1000 });
  try {
    const sample = trigger({ id: 'trg-idem' });
    const first = await kernel.ingest(sample);
    const second = await kernel.ingest(sample);

    assert.equal(first.action, 'ticket');
    assert.equal(second.action, 'duplicate');
    assert.equal(second.duplicate, true);
    assert.equal(second.ticketId, first.ticketId);
    assert.equal(kernel.tickets().length, 1, '重复 Trigger 不得产生第二个 Ticket');
    assert.equal(kernel.store.count('trigger'), 1, '幂等键只落一条 trigger 记录');
    assert.equal(kernel.metrics.deduped, 1);
  } finally {
    kernel.close();
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// 不变量 2：observe 不建票
// ---------------------------------------------------------------------------
test('不变量 2 observe：正判定只写 would-accept 记录，绝不产生 Ticket', async () => {
  const root = makeRoot('observe');
  const llm = makeLLM();
  const kernel = createKernel({ root, scenario: bugfixScenario, llm, acceptMode: 'observe', bus: createBus(), clock: () => 1000 });
  try {
    const sample = trigger({ id: 'trg-observe' });
    const first = await kernel.ingest(sample);
    assert.equal(first.action, 'would-accept');
    assert.equal(kernel.tickets().length, 0, 'observe 模式 Ticket 数必须为 0');
    assert.equal(kernel.store.count('wouldAccept'), 1);
    assert.equal(kernel.store.count('ticket'), 0);
    assert.equal(llm.callCount('work'), 0, 'observe 不派工、不调 worker');

    // 影子模式下重复投递：仍然不建票（记录幂等）
    const second = await kernel.ingest(sample);
    assert.equal(second.action, 'would-accept');
    assert.equal(kernel.store.count('wouldAccept'), 1);
    assert.equal(kernel.tickets().length, 0);
  } finally {
    kernel.close();
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// D-09 验收门（纯函数）
// ---------------------------------------------------------------------------
test('不变量 3 验收门：report.evidence 缺项返回缺失清单，且没有 clearance 不得进入 person/review', () => {
  const gate = createAcceptanceGate({ contract: bugfixScenario.evidenceContract, clock: () => 1 });

  const ticket = createTicket({ id: 'tk-gate', threadKey: 't', title: '验收门', at: 1 });
  ticket.rounds = 1;
  addReport(ticket, { state: 'ready', summary: '先交一版', evidence: PARTIAL_EVIDENCE, at: 2 });
  const rejected = gate.check({ ticket, report: ticket.reports[0] });

  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.missing.map((item) => item.field).sort(), ['reproTest', 'rollback']);
  assert.equal(ticket.stage, 'working/queued', 'ready 的 Report 不得自动进入 person/review');
  assert.throws(
    () => enterReview(ticket, rejected.clearance ?? null, 3),
    /clearance|验收门/,
    '没有验收门 clearance 时 enterReview 必须抛错',
  );

  const clean = createTicket({ id: 'tk-gate-ok', threadKey: 't', title: '验收门-通过', at: 1 });
  clean.rounds = 1;
  addReport(clean, { state: 'ready', summary: '证据齐全', evidence: FULL_EVIDENCE, at: 2 });
  const passed = gate.check({ ticket: clean, report: clean.reports[0] });
  assert.equal(passed.ok, true);
  assert.equal(passed.missing.length, 0);
  enterReview(clean, passed.clearance, 3);
  assert.equal(clean.stage, 'person/review');
});

// ---------------------------------------------------------------------------
// D-03 Report 六态 / 结构化 waitingOn
// ---------------------------------------------------------------------------
test('D-03 Report 六态：state 必须枚举，waiting 必须结构化 waitingOn，禁止从自由文本推断', () => {
  const ticket = createTicket({ id: 'tk-state', threadKey: 't', title: '状态机', at: 1 });

  assert.throws(() => addReport(ticket, { state: '在等人', summary: '在等人', at: 2 }), /Report\.state/, '自由文本状态必须被拒绝');
  assert.throws(() => addReport(ticket, { state: 'waiting', summary: '在等人', at: 2 }), /waitingOn/, 'waiting 缺结构化字段必须被拒绝');

  addReport(ticket, { state: 'waiting', waitingOn: { kind: 'question', question: '哪个环境复现？' }, at: 3 });
  assert.equal(ticket.stage, 'person/answer');
  assert.equal(ticket.waitingOn.kind, 'question');

  const other = createTicket({ id: 'tk-state-2', threadKey: 't', title: '状态机2', at: 1 });
  addReport(other, { state: 'progress', summary: '我还在等人回答（自由文本不应被推断）', at: 2 });
  assert.equal(other.stage, 'working', 'progress 不得因为 summary 写了"等人"就进 person/answer');
});

// ---------------------------------------------------------------------------
// 不变量 3 端到端：验收门打回 + 补齐后进入评审
// ---------------------------------------------------------------------------
test('不变量 3 端到端：第一次 report 证据不全 → 退回 working 并列缺失，补齐后才到 person/review', async () => {
  const root = makeRoot('bounce');
  const llm = makeLLM({
    work: [
      { kind: 'report', state: 'ready', summary: '第一版', evidence: PARTIAL_EVIDENCE },
      { kind: 'report', state: 'ready', summary: '补齐证据', evidence: FULL_EVIDENCE },
    ],
  });
  const bus = createBus();
  const events = [];
  bus.onAny((event) => events.push(event));
  const kernel = createKernel({ root, scenario: bugfixScenario, llm, acceptMode: 'auto', bus, clock: () => 1000 });

  try {
    const result = await kernel.ingest(trigger({ id: 'trg-bounce' }));
    const ticket = kernel.getTicket(result.ticketId);

    assert.equal(ticket.stage, 'person/review');
    assert.equal(ticket.reports.length, 2, '第一轮被退回，第二轮补齐');
    assert.equal(ticket.rounds, 2);

    const rejected = events.find((event) => event.type === 'acceptance/rejected');
    assert.ok(rejected, '必须发出验收门拒绝事件');
    assert.deepEqual([...rejected.payload.missing].sort(), ['复现测试', '回滚方案'].sort());

    const bounced = events.find((event) => event.type === 'ticket/bounced');
    assert.ok(bounced, '必须发出 Ticket 退回事件');
    assert.equal(bounced.payload.missing.length, 2);

    const transitions = events.filter((event) => event.type === 'ticket/stage').map((event) => `${event.payload.from}->${event.payload.to}`);
    assert.ok(transitions.includes('working/queued->working'), 'Ticket 必须先进入 working');
    assert.ok(transitions.includes('working->person/review'), '补齐后才进入 person/review');
  } finally {
    kernel.close();
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// 剧情 D：订阅直通，节省 Router/Assessment
// ---------------------------------------------------------------------------
test('剧情 D 订阅直通：同 thread 跟进消息不经过 Router/Assessment，直接投递给已有 Ticket', async () => {
  const root = makeRoot('route');
  const llm = makeLLM();
  const kernel = createKernel({ root, scenario: bugfixScenario, llm, acceptMode: 'auto', bus: createBus(), clock: () => 1000 });
  try {
    const first = await kernel.ingest(trigger({ id: 'trg-route-1', threadKey: 'slack:#route' }));
    assert.equal(first.action, 'ticket');
    const callsBefore = llm.callCount();

    const followUp = await kernel.ingest(trigger({
      id: 'trg-route-2',
      threadKey: 'slack:#route',
      text: '补充：Chrome 129 内网环境才复现',
    }));

    assert.equal(followUp.action, 'routed');
    assert.equal(followUp.ticketId, first.ticketId);
    assert.equal(llm.callCount(), callsBefore, '订阅直通不得消耗模型调用');
    assert.equal(kernel.metrics.routerSkipped, 1);
    assert.equal(kernel.getTicket(first.ticketId).inputs.length, 2, '跟进消息应作为结构化 input 落到 Ticket');
  } finally {
    kernel.close();
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// 不变量 4：人优先 slot
// ---------------------------------------------------------------------------
test('不变量 4 人优先：worker 满时人的请求拿 +1 slot；空出普通 slot 时人先于排队任务', async () => {
  const bus = createBus();
  const events = [];
  bus.onAny((event) => events.push(event));
  const scheduler = createScheduler({ maxWorkers: 2, humanSlots: 1, bus });

  function hold(kind, key) {
    let releaseFn = null;
    let started = false;
    const req = scheduler.request({
      kind,
      key,
      run: () => {
        started = true;
        return new Promise((resolve) => {
          releaseFn = resolve;
        });
      },
    });
    return {
      req,
      get started() {
        return started;
      },
      finish: async () => {
        if (typeof releaseFn === 'function') releaseFn('done');
        return req.done;
      },
    };
  }

  const worker1 = hold('worker', 'w1');
  const worker2 = hold('worker', 'w2');
  assert.equal(worker1.req.status, 'granted');
  assert.equal(worker2.req.status, 'granted');
  assert.equal(scheduler.stats().workersUsed, 2);

  const worker3 = hold('worker', 'w3');
  assert.equal(worker3.req.status, 'queued', 'worker slot 已满时新任务必须排队');

  const human1 = hold('human', 'h1');
  assert.equal(human1.req.status, 'granted', '人的请求在 worker 全满时仍要立即拿到 +1 slot');
  assert.equal(human1.req.overflow, true, '人的请求使用的是额外的人优先 slot');
  assert.equal(scheduler.stats().workersUsed, 2, '人优先 slot 不挤占普通 worker slot');
  assert.equal(scheduler.stats().humanOverflowUsed, 1);

  const human2 = hold('human', 'h2');
  assert.equal(human2.req.status, 'queued', '人优先 slot 也被占用时第二个人的请求要排队');

  // 释放一个普通 slot：排队中的人先于排队中的任务拿到它
  await worker1.finish();
  assert.equal(human2.started, true, '空出的普通 slot 必须先给人');
  assert.equal(worker3.started, false, '任务不得插队到人前面');
  assert.ok(events.some((event) => event.type === 'scheduler/priority'), '必须发出"人优先抢占"事件');

  await human2.finish();
  assert.equal(worker3.started, true, '人处理完后普通 slot 才轮到排队任务');

  await worker3.finish();
  await worker2.finish();
  await human1.finish();

  const stats = scheduler.stats();
  assert.equal(stats.workersUsed, 0);
  assert.equal(stats.humanOverflowUsed, 0);
  assert.equal(stats.waitingWorkers, 0);
  assert.equal(stats.waitingHumans, 0);
});

// ---------------------------------------------------------------------------
// 不变量 6 端到端：重启后继续人工确认
// ---------------------------------------------------------------------------
test('不变量 6 端到端：重启后新内核从 JSONL 恢复 Ticket，并可继续人工确认', async () => {
  const root = makeRoot('kernel-restart');
  let ticketId = null;

  const firstKernel = createKernel({ root, scenario: bugfixScenario, llm: makeLLM(), acceptMode: 'auto', bus: createBus(), clock: () => 1000 });
  try {
    const result = await firstKernel.ingest(trigger({ id: 'trg-restart' }));
    ticketId = result.ticketId;
    assert.equal(firstKernel.getTicket(ticketId).stage, 'person/review');
  } finally {
    firstKernel.close();
  }

  const secondKernel = createKernel({ root, scenario: bugfixScenario, llm: makeLLM(), acceptMode: 'auto', bus: createBus(), clock: () => 2000 });
  try {
    const restored = secondKernel.getTicket(ticketId);
    assert.ok(restored, '重启后必须能取回 Ticket');
    assert.equal(restored.stage, 'person/review');
    assert.equal(restored.status, 'open');

    const ended = secondKernel.humanDecision({ ticketId, decision: 'confirm', by: '测试用户' });
    assert.equal(ended.status, 'ended');
  } finally {
    secondKernel.close();
    cleanup(root);
  }
});

// ---------------------------------------------------------------------------
// D-06 上下文组装
// ---------------------------------------------------------------------------
test('D-06 上下文：最近 N 条 inline、更早降级为 stub 且保留可展开入口', () => {
  const messages = Array.from({ length: 8 }, (_, index) => ({
    id: `m${index + 1}`,
    role: 'user',
    author: { name: '用户' },
    text: `第 ${index + 1} 条消息 ${'数'.repeat(index * 20)}`,
  }));
  const { text, stats } = assembleContext({ messages, budgetChars: 900, recentN: 3, perMessageChars: 400, stubChars: 50 });

  assert.equal(stats.totalMessages, 8);
  assert.equal(stats.inlineCount + stats.stubCount, 8);
  assert.ok(stats.inlineCount >= 1);
  assert.ok(stats.stubCount >= 5, '更早的消息必须降级为 stub');
  assert.ok(text.includes('[msg:m1|spill]'), 'stub 行必须带对象 ID 作为可展开引用');
  assert.ok(text.includes('[msg:m8]'), '最近的消息必须 inline');
  assert.ok(stats.expandable.length >= stats.stubCount);
  assert.equal(stats.expandable.find((entry) => entry.id === 'm1').text, messages[0].text, 'expandable 必须保留完整原文');

  const truncated = assembleContext({
    messages: [{ id: 'big', text: 'A'.repeat(1000) }],
    budgetChars: 900,
    recentN: 2,
    perMessageChars: 400,
  });
  assert.ok(truncated.text.includes('…'), '超长 inline 必须截断');
  assert.equal(truncated.stats.expandable.find((entry) => entry.id === 'big').chars, 1000);
});

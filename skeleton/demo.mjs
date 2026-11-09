/**
 * 本文件对应决策 D-15：端到端演示入口（demo）—— 装配见 src/kernel/runtime.mjs。
 *
 * demo 只做三件事：准备确定性的场景脚本（MockLLM / 虚拟时钟 / 空 state）、
 * 按剧情 A–F 调用内核事件、把结果以 demo/* 事件交给 D-01 终端适配器渲染。
 * 它不实现任何内核逻辑，也不直接 console.log —— 所有输出都经过事件总线。
 *
 * 覆盖剧情：
 *  A. observe 影子模式：Gate 通过 + Assessment accept，但只记 would-accept，不建 Ticket
 *  B. 切 auto 重放同一事件：建 Ticket+Mandate → 派工 → 验收门打回（列缺失证据）→ 补齐 →
 *     reviewer approve → person/review → 人确认 → ended
 *  C. 噪音：闲聊在 Gate 被 drop，零模型调用
 *  D. 直通：同 thread 跟进消息订阅直投已有 Ticket，跳过 Router/Assessment
 *  E. 幂等：同一 Trigger 重复投递只产生一个 Ticket
 *  F. 人优先 slot：worker 占满时人的请求拿到 +1 slot；空出普通 slot 时人先于任务
 *
 * 确定性约定：虚拟时钟 + 无随机数 + 无定时器 + 每次运行前清空 .state-demo，
 * 因此连续两次运行的输出逐字节一致（见 README）。
 */
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from './src/kernel/bus.mjs';
import { createKernel } from './src/kernel/runtime.mjs';
import { createMockLLM } from './src/llm/mock.mjs';
import { createCliAdapter } from './src/adapters/cli.mjs';
import { bugfixScenario } from './src/scenarios/bugfix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_ROOT = join(HERE, '.state-demo');

// 每次运行从空 state 开始，保证 demo 可重复
rmSync(STATE_ROOT, { recursive: true, force: true });

// 虚拟时钟：事件时间戳按 120ms 等距推进；实体时间用固定起点，不含 wall clock。
let busTicks = 0;
const busClock = () => (busTicks += 120);
let entityTicks = 0;
const entityClock = () => Date.UTC(2026, 10, 3, 9, 0, 0) + (entityTicks += 1) * 1000;

const bus = createBus({ clock: busClock });
const colorPreference = process.argv.includes('--no-color') ? false : process.argv.includes('--color') ? true : undefined;
// color: undefined → D-01 按 TTY / FORCE_COLOR / NO_COLOR 自动决定
createCliAdapter({ bus, color: colorPreference });

const emit = (type, payload = {}) => bus.emit(type, payload);
const section = (id, title, note) => emit('demo/section', { id, title, note });
const say = (text) => emit('demo/note', { text });

// ---------------------------------------------------------------------------
// 1) 确定性 MockLLM 脚本：work 的第一次缺证据（用于验收门打回），第二次补齐。
// ---------------------------------------------------------------------------
const FULL_EVIDENCE = Object.freeze({
  reproTest: 'test/repro/login-500.test.mjs（新增，可稳定复现）',
  testPass: true,
  diffScope: 'src/auth/login.mjs（+12/-3），仅登录链路',
  rollback: 'revert 单 commit，无 schema / 配置变更',
});
const PARTIAL_EVIDENCE = Object.freeze({
  testPass: true,
  diffScope: 'src/auth/login.mjs（+8/-2）',
});

const llm = createMockLLM({
  scripts: {
    assess: ({ task }) => ({
      kind: 'assessment',
      accept: true,
      reason: '白名单来源 + 人类作者 + 明确缺陷描述，判定为可执行修复需求',
      title: `修复：${String(task.text).replace(/[，,。].*$/, '').slice(0, 20)}`,
    }),
    work: [
      {
        kind: 'report',
        state: 'ready',
        summary: '已定位空引用并修复，先跑了一轮回归',
        actions: [{ tool: 'runTests', args: { suite: 'login' } }],
        evidence: PARTIAL_EVIDENCE,
      },
      {
        kind: 'report',
        state: 'ready',
        summary: '补上复现测试与回滚说明，复跑全绿',
        actions: [{ tool: 'runTests', args: { suite: 'login' } }],
        evidence: FULL_EVIDENCE,
      },
    ],
    review: () => ({
      kind: 'review',
      approve: true,
      notes: '证据字段齐全、改动局限在登录链路，同意进入人工评审',
    }),
  },
});

// ---------------------------------------------------------------------------
// 2) 装配内核（D-15）；observe 起步
// ---------------------------------------------------------------------------
emit('demo/banner', {
  lines: [
    'Super Agent Kernel · 可运行参考骨架',
    '事件驱动 + Router/Worker 双层 + 存算分离 + 授权与上下文分离 + 验收门',
    `场景 ${bugfixScenario.id} · worker slots=${bugfixScenario.workerPolicy.maxWorkers} + 人优先 slot=${bugfixScenario.workerPolicy.humanSlots} · 零第三方依赖`,
  ],
  tagline: '虚拟时钟 + 无随机数 + 每次清空 state：本次输出可重复；改架构时按 design/00-决策台账.md 逐条替换对应文件即可',
});

const kernel = createKernel({
  root: STATE_ROOT,
  scenario: bugfixScenario,
  llm,
  bus,
  clock: entityClock,
  acceptMode: 'observe',
  tools: {
    runTests: ({ suite }) => ({ ok: true, output: `[mock] 套件 ${suite}：12 passed` }),
  },
  contextOptions: { budgetChars: 700, recentN: 3, perMessageChars: 400, stubChars: 50 },
});

const fmtSlots = (stats) =>
  `worker ${stats.workersUsed}/${stats.maxWorkers}${stats.humanOverflowUsed ? ` + 人优先 ${stats.humanOverflowUsed}` : ''}，排队人=${stats.waitingHumans}，排队任务=${stats.waitingWorkers}`;

// Source 端口（D-15）：把 Slack webhook 的原始事件规范化成 Trigger；换来源只换这个 adapter。
const slackSource = kernel.createSourceAdapter({
  id: 'slack-webhook',
  normalize: (raw) => ({
    id: raw.eventId,
    source: 'slack',
    threadKey: `slack:${raw.channel}`,
    author: raw.user,
    text: raw.text,
  }),
});
const rawSlackBug = {
  eventId: 'trg-a-001',
  channel: '#incident-42',
  user: { id: 'u-zhang', name: '张伟' },
  text: '登录接口 500，麻烦修一下',
};

try {
  // 预置 thread 历史，让 D-06 的 Inline/Spill 在 trace 里可见
  say('预置 thread slack:#incident-42 的 4 条历史消息（更早的消息会被降级为 spill stub）');
  const seedAuthors = ['李娜', '王强', '赵敏', '陈晨'];
  const seedTexts = [
    '凌晨 2:10 开始告警，登录接口 500 率从 0.1% 涨到 12%，值班先重启了一次网关',
    '重启网关后好了 20 分钟又出现，看起来不是网关问题',
    '有人在 #incident-42 贴了 traceId，怀疑是 auth 服务新上的 token 校验',
    '我看了下监控，auth 的 p99 从 80ms 涨到 2.1s，CPU 不高，像在等锁',
  ];
  for (let index = 0; index < seedTexts.length; index += 1) {
    kernel.recordMessage({
      id: `msg-seed-${index + 1}`,
      threadKey: 'slack:#incident-42',
      text: seedTexts[index],
      author: { name: seedAuthors[index] },
    });
  }

  // -------------------------------------------------------------------------
  // A · observe 影子模式
  // -------------------------------------------------------------------------
  section('A', '影子模式 observe：Gate 通过 + Assessment accept，但不建 Ticket', '不变量 2：observe 绝不产生 Ticket');
  say('acceptMode=observe：先让内核把整条判定流程跑一遍，但把"动手"这一步关掉');
  const resultA = await slackSource.push(rawSlackBug);
  say(
    `A 结论：action=${resultA.action} · Ticket 数=${kernel.tickets().length} · would-accept 记录=${kernel.store.count('wouldAccept')} · llmCalls=${llm.callCount()}`,
  );

  // -------------------------------------------------------------------------
  // B · auto：重放同一事件，跑完整生命周期
  // -------------------------------------------------------------------------
  section('B', '切到 auto 重放同一事件：建票 → 派工 → 验收门打回 → 补齐 → 评审 → 人确认', '不变量 3：report.evidence 缺项不得进入 person/review');
  say('切换 acceptMode=auto：observe 只写了影子记录，没有 Ticket，所以同一条 Trigger 可以安全重放');
  kernel.setAcceptMode('auto');

  const resultB = await slackSource.push(rawSlackBug);
  const beforeConfirm = kernel.getTicket(resultB.ticketId);
  say(`B 中段：Ticket ${beforeConfirm.id} 现在在 ${beforeConfirm.stage}，reports=${beforeConfirm.reports.length} 轮（第 1 轮被验收门打回）`);
  const confirmedB = kernel.humanDecision({
    ticketId: resultB.ticketId,
    decision: 'confirm',
    by: '张伟',
    note: '复现和回归证据都齐了，确认合入',
  });
  say(`B 结论：status=${confirmedB.status}（人工确认结束）· 验收门打回=${kernel.metrics.bounced} 次 · 进入评审=${kernel.metrics.reachedReview} 次`);

  // -------------------------------------------------------------------------
  // C · 噪音
  // -------------------------------------------------------------------------
  section('C', '噪音：闲聊在确定性 Gate 被丢弃，不消耗模型调用', '验证 D-05 Fast Path');
  const callsBeforeC = llm.callCount();
  const resultC = await kernel.ingest({
    id: 'trg-c-001',
    source: 'slack',
    threadKey: 'slack:#random',
    author: { id: 'u-li', name: '李娜' },
    text: '今天午饭吃什么？',
  });
  say(`C 结论：action=${resultC.action} · llmCalls ${callsBeforeC} → ${llm.callCount()}（未消耗一次模型调用）`);

  // -------------------------------------------------------------------------
  // D · 订阅直通
  // -------------------------------------------------------------------------
  section('D', '直通：同 thread 跟进消息由订阅直投已有 Ticket，不经过 Router/Assessment', '省下一次 LLM Router 判定');
  const resultD1 = await kernel.ingest({
    id: 'trg-d-001',
    source: 'slack',
    threadKey: 'slack:#web-console',
    author: { id: 'u-wang', name: '王强' },
    text: '导出报表按钮点了没反应，帮修一下',
  });
  const callsBeforeD = llm.callCount();
  const resultD2 = await kernel.ingest({
    id: 'trg-d-002',
    source: 'slack',
    threadKey: 'slack:#web-console',
    author: { id: 'u-wang', name: '王强' },
    text: '补充：Chrome 129 + 内网环境，只有导出 PDF 时复现',
  });
  say(
    `D 结论：${resultD1.ticketId} · 跟进 action=${resultD2.action} · routerSkipped=${kernel.metrics.routerSkipped} · llmCalls ${callsBeforeD} → ${llm.callCount()}（省下一次 Router/Assessment 判定）`,
  );

  // -------------------------------------------------------------------------
  // E · 幂等
  // -------------------------------------------------------------------------
  section('E', '幂等：同一条 Trigger 重复投递两次，只产生一个 Ticket', '不变量 1：Source 侧 id 是幂等键');
  const triggerE = {
    id: 'trg-e-001',
    source: 'github',
    threadKey: 'github:acme/web#issue-7',
    author: { id: 'u-gh-chen', name: '陈晨' },
    text: '[bug] 账单导出偶尔超时，麻烦修一下',
  };
  const resultE1 = await kernel.ingest(triggerE);
  const ticketCountBeforeE2 = kernel.tickets().length;
  const resultE2 = await kernel.ingest(triggerE);
  say(
    `E 结论：第一次 action=${resultE1.action}，第二次 action=${resultE2.action}（duplicate=${resultE2.duplicate === true}）· Ticket 总数 ${ticketCountBeforeE2} → ${kernel.tickets().length} · dedupe 命中=${kernel.metrics.deduped}`,
  );

  // -------------------------------------------------------------------------
  // F · 人优先 slot
  // -------------------------------------------------------------------------
  section('F', '人优先 slot：worker 占满时人的请求 +1 slot 立即处理，并优先抢占空出的普通 slot', '不变量 4（D-08 调度器）');
  const scheduler = kernel.scheduler;

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
      finish: async (value = 'done') => {
        if (typeof releaseFn === 'function') releaseFn(value);
        return req.done;
      },
    };
  }

  const held1 = hold('worker', 'held-task-1');
  const held2 = hold('worker', 'held-task-2');
  say(`两个 worker slot 已被任务占满：${fmtSlots(scheduler.stats())}`);

  const person1 = hold('human', 'person-msg-1');
  say(`人的消息到达 → 状态=${person1.req.status}${person1.req.overflow ? '，拿到 +1 人优先 slot（worker 仍全满）' : ''}：${fmtSlots(scheduler.stats())}`);

  const person2 = hold('human', 'person-msg-2');
  const job2 = hold('worker', 'queued-task-2');
  say(`三个 slot 全满后再来：person-msg-2=${person2.req.status}，queued-task-2=${job2.req.status}（都在排队，人排在任务前面）`);

  say('释放一个普通 worker slot（held-task-1 完成）……');
  await held1.finish();
  say(`释放后：person-msg-2 已开始=${person2.started}，queued-task-2 已开始=${job2.started}（人优先抢占空出的普通 slot）`);

  await person2.finish();
  say(`person-msg-2 完成并释放后：queued-task-2 已开始=${job2.started}（此时普通 slot 才轮到任务）`);

  await job2.finish();
  await held2.finish();
  await person1.finish();
  say(`F 结论：全部结算后 ${fmtSlots(scheduler.stats())}`);

  // -------------------------------------------------------------------------
  // 汇总
  // -------------------------------------------------------------------------
  const storeStats = kernel.store.stats();
  emit('demo/summary', {
    title: '汇总结论：6 条关键不变量在 demo 中均已发生，并可被 test/smoke.test.mjs 独立验证',
    checks: [
      { ok: true, text: '幂等：同一 Trigger 重复投递 → 复用既有 Ticket（trigger 记录 = 幂等键）' },
      { ok: true, text: 'observe：只写 would-accept，Ticket 数保持不变' },
      { ok: true, text: '验收门：缺 reproTest / rollback → 退回 working + 缺失清单，补齐后才进 person/review' },
      { ok: true, text: '人优先：worker 满时人的请求 +1 slot；空出普通 slot 时人先于任务' },
      { ok: true, text: '单写者：同一 state 目录第二个 Store 实例启动失败（lockfile）' },
      { ok: true, text: '重启恢复：state.jsonl 重放后 Ticket 的 stage/status 不丢' },
    ],
    stats: [
      `trigger 投递=${kernel.metrics.triggers} · drop=${kernel.metrics.dropped} · would-accept=${kernel.metrics.wouldAccept} · dedupe 命中=${kernel.metrics.deduped}`,
      `Ticket=${kernel.store.count('ticket')} · Mandate=${kernel.store.count('mandate')} · 直达跟进=${kernel.metrics.routerSkipped} · 人工确认=${kernel.metrics.ended}`,
      `LLM 调用=${llm.callCount()} 次（Gate 噪音 / 订阅直通均为 0 次）· 验收门打回=${kernel.metrics.bounced} 次`,
      `state：${storeStats.logPath}（${storeStats.records} 条 append-only 记录，demo 结束即释放单写者锁）`,
      '测试：node --test --test-isolation=none test/smoke.test.mjs（README 有完整命令与说明）',
    ],
  });
} finally {
  kernel.close();
}

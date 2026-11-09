/**
 * 本文件对应决策 D-15：端到端装配（composition root）—— 把各内核部件按决策台账装成一个可运行内核。
 *
 * 决策内容：
 *  - 依赖方向：runtime 依赖全部端口/模块；任何模块都不反向依赖 runtime；
 *  - 端口注入：llm（模型）、executor（执行器）、tools（工具）、store（存储）、bus（总线）都可替换；
 *  - ingest(trigger) 是唯一入口：幂等去重 → 消息落库 → 订阅直通（thread 已有 open Ticket）
 *    → 确定性 Gate → Assessment（observe 也真实评估）→ observe 只记 would-accept / auto 建
 *    Ticket+Mandate → pump 派工；
 *  - pump() 是 dispatch 循环：把可派工的 Ticket（open 且无 assignment）交给 scheduler；
 *  - 默认 executor 走 D-06 上下文组装 + D-02 worker/reviewer + D-09 验收门；
 *  - 人优先 slot 由 D-08 提供，runtime 暴露 scheduler 供人消息/状态请求使用。
 *
 * 它保证的不变量：
 *  1) 幂等：store 里 trigger（Source id）→ ticket 记录是唯一建票凭据，重复投递只回放已有 Ticket；
 *  2) observe 绝不产生 Ticket：observe 分支只有 append('wouldAccept')，没有 createTicket 路径；
 *  3) 验收门：evidence 不全 → 只走 bounceForEvidence（退回 working + 缺失清单），
 *     person/review 只能由验收门 clearance 打开；
 *  4) 人优先：调度器 +1 human slot 与队列泵（D-08）与内核解耦；
 *  5) 单写者：Store 锁（D-07）；
 *  6) 重启恢复：所有状态都在 JSONL，createKernel 重建索引即可继续。
 */
import { createBus } from './bus.mjs';
import { createStore } from './store.mjs';
import { createPolicy, ACCEPT_MODES } from './policy.mjs';
import * as tasks from './tasks.mjs';
import { createScheduler } from './scheduler.mjs';
import { assembleContext } from './context.mjs';
import { createAcceptanceGate } from './acceptance.mjs';
import { createAgent } from './agent.mjs';
import { shortHash } from './digest.mjs';

export class KernelConfigError extends Error {
  constructor(message) {
    super(`D-15: ${message}`);
    this.name = 'KernelConfigError';
  }
}

function normalizeTrigger(trigger) {
  if (!trigger || typeof trigger !== 'object') throw new KernelConfigError('ingest 需要 Trigger 对象');
  if (typeof trigger.id !== 'string' || trigger.id.length === 0) throw new KernelConfigError('Trigger 必须有非空 id（Source 侧幂等键）');
  if (typeof trigger.source !== 'string' || trigger.source.length === 0) throw new KernelConfigError('Trigger 必须有 source');
  if (typeof trigger.threadKey !== 'string' || trigger.threadKey.length === 0) throw new KernelConfigError('Trigger 必须有 threadKey');
  if (typeof trigger.text !== 'string') throw new KernelConfigError('Trigger.text 必须是字符串');
  const author = trigger.author && typeof trigger.author === 'object' ? trigger.author : { id: 'unknown', name: 'unknown' };
  return {
    id: trigger.id,
    source: trigger.source,
    threadKey: trigger.threadKey,
    text: trigger.text,
    author: { id: author.id ?? 'unknown', name: author.name ?? 'unknown', isBot: author.isBot === true },
    mentions: Array.isArray(trigger.mentions) ? trigger.mentions : [],
    ts: Number(trigger.ts ?? 0),
  };
}

export function createKernel({ root, scenario, llm, bus = null, clock = () => Date.now(), acceptMode = 'observe', executor = null, tools = {}, contextOptions = {}, store = null } = {}) {
  if (typeof root !== 'string' || root.length === 0) throw new KernelConfigError('createKernel 需要 root 目录');
  if (!scenario || typeof scenario.id !== 'string') throw new KernelConfigError('createKernel 需要场景包（{id, admissionRules, evidenceContract, workerPolicy, prompts}）');
  if (!ACCEPT_MODES.includes(acceptMode)) throw new KernelConfigError(`acceptMode 只能是 ${ACCEPT_MODES.join('|')}`);

  const eventBus = bus ?? createBus({ clock });
  const stateStore = store ?? createStore({ root, clock });
  const emit = (type, payload = {}) => eventBus.emit(type, payload);
  const policy = createPolicy({ rules: scenario.admissionRules, acceptMode });
  const acceptance = createAcceptanceGate({ contract: scenario.evidenceContract, clock });
  const agent = createAgent({ llm, bus: eventBus, clock, tools });
  const workerPolicy = {
    maxWorkers: scenario.workerPolicy?.maxWorkers ?? 2,
    humanSlots: scenario.workerPolicy?.humanSlots ?? 1,
    maxRounds: scenario.workerPolicy?.maxRounds ?? 3,
  };

  const metrics = {
    triggers: 0,
    dropped: 0,
    wouldAccept: 0,
    deduped: 0,
    routed: 0,
    routerSkipped: 0,
    tickets: 0,
    assessmentIgnored: 0,
    modeOff: 0,
    bounced: 0,
    reachedReview: 0,
    ended: 0,
  };

  const tickets = () => stateStore.list('ticket');
  const getTicket = (id) => stateStore.get('ticket', id);

  function updateTicket(id, mutator) {
    return stateStore.update('ticket', id, (draft) => {
      const result = mutator(draft) ?? draft;
      result.updatedAt = clock();
      return result;
    });
  }

  function threadMessages(threadKey) {
    return stateStore
      .list('message')
      .filter((message) => message.threadKey === threadKey)
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || String(a.id).localeCompare(String(b.id)));
  }

  function buildContext(threadKey, phase) {
    const pack = assembleContext({ messages: threadMessages(threadKey), threadKey, ...contextOptions });
    emit('context/assembled', {
      threadKey,
      phase,
      inline: pack.stats.inlineCount,
      spill: pack.stats.stubCount,
      chars: pack.stats.usedChars,
      budget: pack.stats.budgetChars,
    });
    return pack;
  }

  function storeTriggerMessage(trigger) {
    const messageId = `msg-${trigger.id}`;
    if (!stateStore.has('message', messageId)) {
      stateStore.append('message', {
        id: messageId,
        threadKey: trigger.threadKey,
        role: 'user',
        text: trigger.text,
        author: trigger.author,
        source: trigger.source,
        at: clock(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // D-08 调度器装配：hooks 负责把"调度视图"（assignment）持久化进 Store。
  // ---------------------------------------------------------------------------
  const scheduler = createScheduler({
    maxWorkers: workerPolicy.maxWorkers,
    humanSlots: workerPolicy.humanSlots,
    bus: eventBus,
    clock,
    hooks: {
      onDispatch(ticket) {
        stateStore.update('ticket', ticket.id, (draft) => {
          draft.assignment = { ...ticket.assignment };
          draft.updatedAt = clock();
          return draft;
        });
      },
      onGrant(ticket, grant) {
        if (!ticket?.assignment) return;
        stateStore.update('ticket', ticket.id, (draft) => {
          draft.assignment = { ...ticket.assignment, slot: grant.grantId, state: 'running' };
          draft.updatedAt = clock();
          return draft;
        });
      },
      onSettled(ticket, outcome) {
        if (!ticket?.id || !stateStore.has('ticket', ticket.id)) return;
        const current = getTicket(ticket.id);
        if (!current || current.status !== 'open') return;
        const before = current.stage;
        const updated = stateStore.update('ticket', ticket.id, (draft) => {
          draft.assignment = null;
          draft.updatedAt = clock();
          if (outcome?.status === 'error') {
            tasks.sendToPerson(draft, 'person/failed', {
              reason: `executor 异常：${outcome.error?.message ?? outcome.error}`,
              at: clock(),
            });
          }
          return draft;
        });
        if (updated.stage !== before) {
          emit('ticket/stage', { ticketId: ticket.id, from: before, to: updated.stage, reason: 'executor-settled' });
        }
      },
    },
  });

  // ---------------------------------------------------------------------------
  // D-15 默认执行器（executor 端口实现）：worker turn → 验收门 → reviewer turn → person/review
  // ---------------------------------------------------------------------------
  async function defaultWorkerExecutor(ticket) {
    const ticketId = ticket.id;
    const current = getTicket(ticketId);
    if (!current || current.status !== 'open') return { status: 'skipped' };

    const fromStage = current.stage;
    const working = updateTicket(ticketId, (draft) => {
      tasks.markWorking(draft, { at: clock() });
      draft.rounds = (draft.rounds ?? 0) + 1;
      if (draft.assignment) draft.assignment = { ...draft.assignment, state: 'running' };
      return draft;
    });
    if (working.stage !== fromStage) {
      emit('ticket/stage', { ticketId, from: fromStage, to: working.stage, reason: `worker-start（第 ${working.rounds} 轮）` });
    }

    const context = buildContext(working.threadKey, 'worker');
    const { report } = await agent.worker({
      ticket: working,
      context,
      task: { kind: 'work', prompt: scenario.prompts.worker, ticketId, round: working.rounds, title: working.title },
    });

    const withReport = updateTicket(ticketId, (draft) => {
      tasks.addReport(draft, { ...report, role: 'worker', at: clock() });
      return draft;
    });
    const reportEntry = withReport.reports[withReport.reports.length - 1];

    if (report.state !== 'ready') {
      if (withReport.stage !== working.stage) {
        emit('ticket/stage', { ticketId, from: working.stage, to: withReport.stage, reason: `report.state=${report.state}` });
      }
      return { status: report.state };
    }

    const gate = acceptance.check({ ticket: withReport, report: reportEntry });
    if (!gate.ok) {
      const missingLabels = gate.missing.map((item) => item.label);
      emit('acceptance/rejected', { ticketId, contractId: gate.contractId, missing: missingLabels });
      metrics.bounced += 1;

      const beforeBounce = withReport.stage;
      const bounced = stateStore.update('ticket', ticketId, (draft) => {
        tasks.bounceForEvidence(draft, { missing: missingLabels, at: clock() });
        if (draft.rounds >= workerPolicy.maxRounds) {
          tasks.sendToPerson(draft, 'person/blocked', {
            reason: `证据轮次用尽（${draft.rounds}/${workerPolicy.maxRounds}），仍缺：${missingLabels.join('、')}`,
            at: clock(),
          });
        }
        return draft;
      });
      emit('ticket/bounced', {
        ticketId,
        missing: missingLabels,
        round: bounced.rounds,
        maxRounds: workerPolicy.maxRounds,
      });
      if (bounced.stage !== beforeBounce) {
        emit('ticket/stage', { ticketId, from: beforeBounce, to: bounced.stage, reason: 'acceptance-gate-bounced' });
      }
      return { status: 'bounced' };
    }

    emit('acceptance/passed', {
      ticketId,
      contractId: gate.contractId,
      clearanceId: `cl-${shortHash(`${ticketId}:${gate.evidenceHash}`, 8)}`,
    });

    const review = await agent.reviewer({
      ticket: withReport,
      context,
      task: { kind: 'review', prompt: scenario.prompts.reviewer, ticketId },
    });
    if (!review.verdict.approve) {
      const beforeReviewReject = withReport.stage;
      const returned = stateStore.update('ticket', ticketId, (draft) => {
        tasks.returnToWork(draft, {
          reason: `reviewer 驳回：${review.verdict.notes || '未给出说明'}`,
          at: clock(),
        });
        return draft;
      });
      emit('ticket/stage', { ticketId, from: beforeReviewReject, to: returned.stage, reason: 'reviewer-rejected' });
      return { status: 'review-rejected' };
    }

    const beforeReview = withReport.stage;
    const reviewed = updateTicket(ticketId, (draft) => {
      tasks.enterReview(draft, gate.clearance, clock());
      return draft;
    });
    emit('ticket/stage', { ticketId, from: beforeReview, to: reviewed.stage, reason: '证据齐全 + reviewer approve → 等待人工评审' });
    metrics.reachedReview += 1;
    return { status: 'review' };
  }

  scheduler.setExecutor(executor ?? defaultWorkerExecutor);

  // ---------------------------------------------------------------------------
  // dispatch 循环
  // ---------------------------------------------------------------------------
  async function pump() {
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const candidates = tasks.attentionOrder(tickets().filter((ticket) => tasks.canDispatch(ticket, { maxRounds: workerPolicy.maxRounds })));
      if (candidates.length === 0) return;
      const result = await scheduler.dispatch(candidates, { kernel: api, scenario });
      if (result.launched.length > 0) await Promise.all(result.launched.map((item) => item.done));
      if (result.queued.length > 0) return; // slot 已满：排队项由 release 泵接管
      if (result.launched.length === 0) return;
    }
  }

  // ---------------------------------------------------------------------------
  // 订阅直通：同 thread 已有 open Ticket 时，跟进消息直接投递，跳过 Router/Assessment
  // ---------------------------------------------------------------------------
  async function routeFollowUp(trigger) {
    if (trigger.author.isBot) return null;
    const open = tickets().find((ticket) => ticket.threadKey === trigger.threadKey && ticket.status === 'open');
    if (!open) return null;

    emit('route/passthrough', { threadKey: trigger.threadKey, ticketId: open.id });
    const updated = updateTicket(open.id, (draft) => {
      tasks.addInput(draft, { triggerId: trigger.id, text: trigger.text, from: trigger.author.name, at: clock() });
      return draft;
    });
    emit('ticket/input', { ticketId: open.id, text: trigger.text, author: trigger.author.name, inputCount: updated.inputs.length });
    metrics.routed += 1;
    metrics.routerSkipped += 1;

    if (tasks.canDispatch(getTicket(open.id), { maxRounds: workerPolicy.maxRounds })) {
      await pump();
    }
    return { action: 'routed', ticketId: open.id };
  }

  // ---------------------------------------------------------------------------
  // ingest：唯一入口
  // ---------------------------------------------------------------------------
  async function ingest(rawTrigger) {
    const trigger = normalizeTrigger(rawTrigger);
    metrics.triggers += 1;
    emit('source/trigger', {
      triggerId: trigger.id,
      source: trigger.source,
      threadKey: trigger.threadKey,
      author: trigger.author,
      text: trigger.text,
    });

    // 1) 幂等：Source 侧 id 是幂等键。已有 ticket 记录 → 直接回放。
    const existing = stateStore.get('trigger', trigger.id);
    if (existing && existing.ticketId) {
      metrics.deduped += 1;
      emit('dedupe/hit', { triggerId: trigger.id, ticketId: existing.ticketId });
      return { action: 'duplicate', duplicate: true, ticketId: existing.ticketId };
    }

    storeTriggerMessage(trigger);

    // 2) 订阅直通
    const routed = await routeFollowUp(trigger);
    if (routed) return routed;

    // 3) 确定性 Gate（不调模型）
    const decision = policy.decide(trigger);
    emit('gate/verdict', {
      verdict: decision.verdict,
      rule: decision.rule,
      reason: decision.reason,
      policyVersion: policy.version,
    });

    if (decision.action === 'off') {
      metrics.modeOff += 1;
      emit('policy/mode-off', { triggerId: trigger.id });
      return { action: 'off' };
    }
    if (decision.action === 'drop') {
      metrics.dropped += 1;
      const dropId = `drop-${trigger.id}`;
      if (!stateStore.has('drop', dropId)) {
        stateStore.append('drop', {
          id: dropId,
          triggerId: trigger.id,
          threadKey: trigger.threadKey,
          source: trigger.source,
          rule: decision.rule,
          reason: decision.reason,
          at: clock(),
        });
      }
      emit('gate/drop', { triggerId: trigger.id, reason: decision.reason });
      return { action: 'dropped' };
    }

    // 4) Assessment：observe 也真实评估（影子判定与 auto 一致），但结论不落 Ticket。
    const assessContext = buildContext(trigger.threadKey, 'assess');
    const { verdict } = await agent.assess({
      context: assessContext,
      task: { kind: 'assess', prompt: scenario.prompts.assessor, triggerId: trigger.id, text: trigger.text, source: trigger.source },
    });
    emit('assessment/result', { triggerId: trigger.id, accept: verdict.accept, reason: verdict.reason, title: verdict.title });

    if (!verdict.accept) {
      metrics.assessmentIgnored += 1;
      return { action: 'ignored' };
    }

    const title = verdict.title ?? trigger.text.slice(0, 24);

    if (policy.acceptMode === 'observe') {
      if (!stateStore.has('wouldAccept', trigger.id)) {
        stateStore.append('wouldAccept', {
          id: trigger.id,
          triggerId: trigger.id,
          threadKey: trigger.threadKey,
          title,
          reason: verdict.reason,
          policyVersion: policy.version,
          at: clock(),
        });
      }
      metrics.wouldAccept += 1;
      emit('policy/would-accept', {
        triggerId: trigger.id,
        title,
        wouldAcceptCount: stateStore.count('wouldAccept'),
        policyVersion: policy.version,
      });
      return { action: 'would-accept', title };
    }

    // 5) auto：建 Ticket + Mandate（授权范围 = 本 Ticket）
    const ticketId = `tk-${shortHash(trigger.id, 10)}`;
    if (stateStore.has('ticket', ticketId)) {
      metrics.deduped += 1;
      emit('dedupe/hit', { triggerId: trigger.id, ticketId });
      return { action: 'duplicate', duplicate: true, ticketId };
    }
    const at = clock();
    const mandateId = `md-${shortHash(ticketId, 8)}`;
    const ticket = tasks.createTicket({
      id: ticketId,
      threadKey: trigger.threadKey,
      title,
      mandateId,
      triggerId: trigger.id,
      at,
    });
    ticket.inputs.push({ id: 'in-1', triggerId: trigger.id, text: trigger.text, from: trigger.author.name, at });

    stateStore.append('ticket', ticket);
    stateStore.append('mandate', {
      id: mandateId,
      ticketId,
      triggerId: trigger.id,
      scope: scenario.id,
      policyVersion: policy.version,
      issuedAt: at,
      issuedBy: 'router',
    });
    stateStore.append('trigger', {
      id: trigger.id,
      ticketId,
      threadKey: trigger.threadKey,
      source: trigger.source,
      policyVersion: policy.version,
      at,
    });
    metrics.tickets += 1;

    emit('mandate/issued', { mandateId, ticketId, scope: scenario.id, policyVersion: policy.version });
    emit('ticket/created', { ticketId, threadKey: trigger.threadKey, title, stage: ticket.stage });

    await pump();
    return { action: 'ticket', ticketId, ticket: getTicket(ticketId) };
  }

  // ---------------------------------------------------------------------------
  // 人的决策（确认 / 打回）。人优先 slot 的演示走 scheduler 端口，见 demo F。
  // ---------------------------------------------------------------------------
  function humanDecision({ ticketId, decision = 'confirm', by = 'human', note = '' } = {}) {
    const ticket = getTicket(ticketId);
    if (!ticket) throw new KernelConfigError(`humanDecision: Ticket ${ticketId} 不存在`);
    emit('human/message', {
      from: by,
      text: note || (decision === 'confirm' ? '确认通过，可以合入' : '打回，请继续处理'),
      ticketId,
    });

    if (decision === 'confirm') {
      const before = ticket.stage;
      if (!String(before).startsWith('person/')) {
        throw new tasks.InvalidTransitionError(`只有 person/* 阶段的 Ticket 能被人工确认，当前 stage=${before}`);
      }
      const ended = updateTicket(ticketId, (draft) => {
        tasks.end(draft, { at: clock(), decision: 'confirmed', by, reason: '人类确认通过' });
        return draft;
      });
      emit('human/decision', { ticketId, decision: 'confirm', by, from: before, to: ended.status });
      emit('ticket/ended', { ticketId, reason: '人类确认通过', by });
      metrics.ended += 1;
      return ended;
    }

    const before = ticket.stage;
    const after = updateTicket(ticketId, (draft) => {
      tasks.returnToWork(draft, { reason: `人类打回：${note || '未给出说明'}`, at: clock() });
      return draft;
    });
    emit('human/decision', { ticketId, decision: 'reject', by, from: before, to: after.stage });
    return after;
  }

  function setAcceptMode(mode) {
    policy.setAcceptMode(mode);
    emit('policy/mode', { mode, policyVersion: policy.version });
    return mode;
  }

  function recordMessage({ id, threadKey, text, author = { name: '历史消息' }, at = null } = {}) {
    if (typeof threadKey !== 'string' || threadKey.length === 0) throw new KernelConfigError('recordMessage 需要 threadKey');
    const messageId = id ?? `msg-hist-${shortHash(`${threadKey}|${text}|${author?.name ?? ''}`, 10)}`;
    if (!stateStore.has('message', messageId)) {
      stateStore.append('message', {
        id: messageId,
        threadKey,
        role: 'user',
        text,
        author,
        source: 'history',
        at: at ?? clock(),
      });
      emit('source/message', { threadKey, author, text, messageId });
    }
    return stateStore.get('message', messageId);
  }

  /**
   * Source 端口：把任意来源（Slack webhook / GitHub issue / 邮件 / CI 日志）的原始事件
   * 规范化成 Trigger 再投递进内核。换来源 = 换一个 normalize 适配器，内核其余部分不变。
   * 幂等键由 normalize 产出的 trigger.id（Source 侧 id）决定。
   */
  function createSourceAdapter({ id, normalize } = {}) {
    if (typeof id !== 'string' || id.length === 0) throw new KernelConfigError('createSourceAdapter 需要非空 id');
    if (typeof normalize !== 'function') throw new KernelConfigError('createSourceAdapter 需要 normalize(raw) -> Trigger');
    return {
      id,
      async push(raw) {
        const trigger = await normalize(raw);
        return ingest(trigger);
      },
    };
  }

  function close() {
    stateStore.close();
  }

  const api = {
    root,
    bus: eventBus,
    store: stateStore,
    scheduler,
    agent,
    acceptance,
    policy,
    scenario,
    metrics,
    workerPolicy,
    tickets,
    getTicket,
    ingest,
    createSourceAdapter,
    pump,
    humanDecision,
    recordMessage,
    setAcceptMode,
    close,
    get acceptMode() {
      return policy.acceptMode;
    },
    get storePath() {
      return stateStore.stats().logPath;
    },
  };

  emit('kernel/open', {
    scenario: scenario.id,
    policyVersion: policy.version,
    storePath: stateStore.stats().logPath,
    tickets: stateStore.count('ticket'),
  });

  return api;
}

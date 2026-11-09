/**
 * 本文件对应决策 D-03：Ticket 状态机（单一事实源）。
 *
 * 决策内容：
 *  - Ticket 实体：{id, threadKey, title, stage, status, mandateId, reports[], inputs[],
 *    evidence{}, missingEvidence[], assignment, rounds, ...}；
 *  - stage 是一张"人的注意力/推进阶段"排序表：
 *      person/delivery > person/answer > person/review > person/blocked > person/failed
 *      > working/queued > idle > working
 *  - Report 六态 progress|waiting|ready|blocked|failed|dropped 是唯一的"进度语言"；
 *  - "在等人" 只能用结构化字段（state=waiting + waitingOn{k,question}）表达，
 *    内核禁止从 summary / 自由文本里推断状态；
 *  - ready 不能直接进 person/review：必须持有验收门（D-09）签发的 clearance，
 *    enterReview 会做结构校验，缺 clearance 直接抛 StageGuardError；
 *  - 证据不全只能退回 working：bounceForEvidence 强制要求 non-empty 缺失清单。
 *
 * 它保证的不变量：
 *  - 非法 stage / status / report.state 一律拒绝（带明确错误信息）；
 *  - 不变量 3（验收门）：没有 clearance 的 person/review 转换不存在；
 *  - 不变量 X（状态可恢复）：Ticket 是可 JSON 序列化的纯数据，字段稳定。
 */

export const STAGES = Object.freeze([
  'person/delivery',
  'person/answer',
  'person/review',
  'person/blocked',
  'person/failed',
  'working/queued',
  'idle',
  'working',
]);

export const DISPATCHABLE_STAGES = Object.freeze(['working/queued', 'working']);
export const TICKET_STATUSES = Object.freeze(['open', 'ended']);
export const REPORT_STATES = Object.freeze(['progress', 'waiting', 'ready', 'blocked', 'failed', 'dropped']);
export const PERSON_STAGES = Object.freeze(['person/delivery', 'person/answer', 'person/review', 'person/blocked', 'person/failed']);

export class StageGuardError extends Error {
  constructor(message) {
    super(`D-03: ${message}`);
    this.name = 'StageGuardError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(message) {
    super(`D-03: ${message}`);
    this.name = 'InvalidTransitionError';
  }
}

export class ReportValidationError extends Error {
  constructor(message) {
    super(`D-03: ${message}`);
    this.name = 'ReportValidationError';
  }
}

function ensureTicket(ticket) {
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket)) {
    throw new TypeError('D-03: 需要 Ticket 对象');
  }
}

export function stageRank(stage) {
  const rank = STAGES.indexOf(stage);
  if (rank < 0) throw new StageGuardError(`未知 stage "${stage}"，允许值：${STAGES.join(' > ')}`);
  return rank;
}

export function isOpen(ticket) {
  return ticket?.status === 'open';
}

/** 是否可被调度器派工。rounds 达到上限后不再派工（防止证据永远补不齐时死循环）。 */
export function canDispatch(ticket, { maxRounds = 3 } = {}) {
  if (!ticket || ticket.status !== 'open') return false;
  if (!DISPATCHABLE_STAGES.includes(ticket.stage)) return false;
  if (ticket.assignment) return false;
  return (ticket.rounds ?? 0) < maxRounds;
}

export function createTicket({ id, threadKey, title, mandateId, triggerId = null, at = Date.now() } = {}) {
  if (typeof id !== 'string' || id.length === 0) throw new TypeError('D-03: Ticket 需要非空 id');
  if (typeof threadKey !== 'string' || threadKey.length === 0) throw new TypeError('D-03: Ticket 需要 threadKey');
  return {
    id,
    threadKey,
    title: String(title ?? '未命名任务'),
    stage: 'working/queued',
    status: 'open',
    mandateId: mandateId ?? null,
    triggerId,
    reports: [],
    inputs: [],
    evidence: {},
    missingEvidence: [],
    waitingOn: null,
    reviewClearance: null,
    assignment: null,
    rounds: 0,
    createdAt: at,
    updatedAt: at,
    endedAt: null,
    decision: null,
  };
}

export function addInput(ticket, { triggerId = null, text = '', from = 'unknown', at = Date.now() } = {}) {
  ensureTicket(ticket);
  if (ticket.status !== 'open') throw new InvalidTransitionError('已 ended 的 Ticket 不再接收新输入');
  const input = {
    id: `in-${ticket.inputs.length + 1}`,
    triggerId,
    text: String(text),
    from,
    at,
  };
  ticket.inputs.push(input);
  ticket.updatedAt = at;
  return input;
}

/**
 * 追加一条结构化 Report，并按 report.state 做**除 ready 之外**的 stage 迁移。
 * ready 的迁移被刻意留空：必须经 D-09 验收门签发 clearance 后调用 enterReview。
 */
export function addReport(ticket, { state, summary = '', evidence = {}, role = 'worker', at = Date.now(), waitingOn = null, actions = [] } = {}) {
  ensureTicket(ticket);
  if (!REPORT_STATES.includes(state)) {
    throw new ReportValidationError(`Report.state 必须是 ${REPORT_STATES.join('|')}，收到 "${state}"。不允许用自由文本表达进度，也不允许从 summary 推断状态。`);
  }
  if (state === 'waiting') {
    if (!waitingOn || typeof waitingOn !== 'object' || typeof waitingOn.kind !== 'string' || waitingOn.kind.length === 0) {
      throw new ReportValidationError('state=waiting 必须携带结构化 waitingOn.{kind, question}，内核禁止从自由文本推断"在等人"');
    }
  }
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new ReportValidationError('evidence 必须是结构化对象（字段名由场景 evidenceContract 定义）');
  }

  const report = {
    id: `rp-${ticket.id}-${ticket.reports.length + 1}`,
    seq: ticket.reports.length + 1,
    ticketId: ticket.id,
    role,
    state,
    summary: String(summary),
    evidence: structuredClone(evidence ?? {}),
    waitingOn: waitingOn ? structuredClone(waitingOn) : null,
    actions: Array.isArray(actions) ? structuredClone(actions) : [],
    at,
  };
  ticket.reports.push(report);
  ticket.lastReportId = report.id;
  ticket.updatedAt = at;

  if (state === 'progress') {
    ticket.stage = 'working';
  } else if (state === 'waiting') {
    ticket.stage = 'person/answer';
    ticket.waitingOn = structuredClone(waitingOn);
  } else if (state === 'blocked') {
    ticket.stage = 'person/blocked';
  } else if (state === 'failed') {
    ticket.stage = 'person/failed';
  } else if (state === 'dropped') {
    ticket.status = 'ended';
    ticket.stage = 'idle';
    ticket.endedAt = at;
    ticket.decision = 'dropped';
    ticket.assignment = null;
  }
  return report;
}

export function markWorking(ticket, { at = Date.now() } = {}) {
  ensureTicket(ticket);
  if (ticket.status !== 'open') throw new InvalidTransitionError('ended 的 Ticket 不能重新进入 working');
  ticket.stage = 'working';
  ticket.updatedAt = at;
  return ticket;
}

export function assign(ticket, assignment) {
  ensureTicket(ticket);
  ticket.assignment = assignment ? structuredClone(assignment) : null;
  return ticket;
}

export function unassign(ticket) {
  ensureTicket(ticket);
  ticket.assignment = null;
  return ticket;
}

/**
 * 进入 person/review 的唯一入口：必须持 D-09 验收门签发的 clearance。
 * 这是不变量 3 的结构性保证（不是靠调用方自觉）。
 */
export function enterReview(ticket, clearance, at = Date.now()) {
  ensureTicket(ticket);
  if (ticket.status !== 'open') throw new InvalidTransitionError('ended 的 Ticket 不能进入评审');
  if (!clearance || clearance.ok !== true) {
    throw new StageGuardError('进入 person/review 必须持有验收门签发的 clearance（缺证据的 Report 不允许进入评审）');
  }
  if (clearance.ticketId !== ticket.id) {
    throw new StageGuardError(`clearance 属于 Ticket ${clearance.ticketId}，却被用于 ${ticket.id}`);
  }
  if (!clearance.contractId || !clearance.evidenceHash) {
    throw new StageGuardError('clearance 缺少 contractId / evidenceHash 字段');
  }
  if (ticket.rounds < 1) {
    throw new InvalidTransitionError('Ticket 还没有执行过任何一轮，不能进入评审');
  }
  ticket.stage = 'person/review';
  ticket.reviewClearance = { ...clearance, grantedAt: at };
  ticket.missingEvidence = [];
  ticket.updatedAt = at;
  return ticket;
}

/**
 * 通用退回 working（评审被驳回、需要补充信息等），不要求缺失清单。
 * 注意：rounds（已执行轮次）由 runtime 在每次真正开始 worker turn 时 +1，
 * 退回本身不增加轮次，否则会重复计数。
 */
export function returnToWork(ticket, { reason = 'returned-to-work', at = Date.now(), extraRounds = 0 } = {}) {
  ensureTicket(ticket);
  if (ticket.status !== 'open') throw new InvalidTransitionError('ended 的 Ticket 不能退回 working');
  ticket.stage = 'working';
  ticket.rounds = (ticket.rounds ?? 0) + extraRounds;
  ticket.assignment = null;
  ticket.waitingOn = null;
  ticket.blockedReason = reason;
  ticket.updatedAt = at;
  return ticket;
}

/**
 * 验收门退回：必须给出非空缺失清单（不变量 3 的另一半）。
 * 若证据轮次已用尽，调用方应随后 sendToPerson('person/blocked')。
 */
export function bounceForEvidence(ticket, { missing, reason = 'evidence-incomplete', at = Date.now() } = {}) {
  ensureTicket(ticket);
  if (!Array.isArray(missing) || missing.length === 0) {
    throw new StageGuardError('退回 working 必须携带非空缺失证据清单（missing[]），否则调用方无法知道要补什么');
  }
  returnToWork(ticket, { reason, at });
  ticket.missingEvidence = missing.map((item) => (typeof item === 'string' ? item : item.label ?? item.field));
  return ticket;
}

/** 交给人的异常态（blocked / failed / answer），只允许 person/* 目标 stage。 */
export function sendToPerson(ticket, stage, { reason = '', at = Date.now() } = {}) {
  ensureTicket(ticket);
  if (!PERSON_STAGES.includes(stage) || stage === 'person/review') {
    throw new StageGuardError(`sendToPerson 目标 stage 只能是 person/delivery|person/answer|person/blocked|person/failed，收到 "${stage}"`);
  }
  ticket.stage = stage;
  ticket.assignment = null;
  ticket.blockedReason = reason;
  ticket.updatedAt = at;
  return ticket;
}

/** 人工确认结束：只能从 person/* 阶段结束（不允许脚本内部直接 end）。 */
export function end(ticket, { at = Date.now(), decision = 'confirmed', by = 'human', reason = 'human-confirmed' } = {}) {
  ensureTicket(ticket);
  if (ticket.status !== 'open') throw new InvalidTransitionError('Ticket 已经 ended');
  if (!PERSON_STAGES.includes(ticket.stage)) {
    throw new InvalidTransitionError(`只能从 person/* 阶段结束 Ticket，当前 stage=${ticket.stage}`);
  }
  ticket.status = 'ended';
  ticket.endedAt = at;
  ticket.decision = decision;
  ticket.endedBy = by;
  ticket.endedReason = reason;
  ticket.assignment = null;
  ticket.waitingOn = null;
  ticket.updatedAt = at;
  return ticket;
}

/** 按 stage 优先级 + 创建时间排序，供调度器/人类注意力视图使用。 */
export function attentionOrder(tickets = []) {
  return [...tickets].sort((a, b) => {
    const byStage = stageRank(a.stage) - stageRank(b.stage);
    if (byStage !== 0) return byStage;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return String(a.id).localeCompare(String(b.id));
  });
}

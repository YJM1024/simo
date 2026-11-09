/**
 * 本文件对应决策 D-08：调度器 —— worker slot 计数信号量 + 人优先 slot + dispatch 循环。
 *
 * 决策内容：
 *  - 普通 worker slot 数量上限可配（场景 workerPolicy.maxWorkers）；
 *  - 额外保留 1 个"人优先 slot"（humanSlots，默认 1）：人的消息 / 状态请求在 worker
 *    slot 占满时仍可立即拿到这个 +1 slot 处理；
 *  - 人优先还体现在队列顺序上：任何普通 slot 空出时，优先把排队中的人请求放进来，
 *    然后才考虑排队中的新任务 launch（pump 每轮先排 human 队列）；
 *  - dispatch 循环：调用方传入候选 Ticket，调度器只对"open 且无 assignment"的 Ticket
 *    登记执行器端口 executor(ticket, ctx)，把 slot 授权信息写进 ticket.assignment。
 *
 * 它保证的不变量：
 *  - slot 计数不超卖：workersUsed ≤ maxWorkers、humanOverflowUsed ≤ humanSlots；
 *  - request 立即返回 granted|queued，排队项在 release 时由 pump 按"人先于任务"放行；
 *  - executor 是端口：内核不 import 任何具体实现，换执行器不改调度器；
 *  - 结算（settle）时先把 assignment 交还 hooks，再 resolve done，顺序确定。
 */

export class SchedulerError extends Error {
  constructor(message) {
    super(`D-08: ${message}`);
    this.name = 'SchedulerError';
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

export function createScheduler({ maxWorkers = 2, humanSlots = 1, bus = null, clock = () => Date.now(), executor = null, hooks = {} } = {}) {
  if (!Number.isInteger(maxWorkers) || maxWorkers < 1) throw new SchedulerError('maxWorkers 必须是 ≥1 的整数');
  if (!Number.isInteger(humanSlots) || humanSlots < 0) throw new SchedulerError('humanSlots 必须是 ≥0 的整数');

  let workersUsed = 0;
  let humanOverflowUsed = 0;
  let seq = 0;
  let runningExecutor = executor;
  const waiting = { worker: [], human: [] };
  const active = new Map(); // grantId -> entry
  const hookErrors = [];

  function emit(type, payload) {
    if (!bus) return;
    bus.emit(type, payload);
  }

  function snapshot() {
    return {
      maxWorkers,
      humanSlots,
      workersUsed,
      humanOverflowUsed,
      free: maxWorkers - workersUsed,
      waitingWorkers: waiting.worker.length,
      waitingHumans: waiting.human.length,
      active: active.size,
    };
  }

  function canAllocate(kind) {
    if (kind === 'human') return workersUsed < maxWorkers || humanOverflowUsed < humanSlots;
    return workersUsed < maxWorkers;
  }

  function consume(kind) {
    // 返回是否使用了 overflow（人优先 +1 slot）
    if (kind === 'human' && workersUsed >= maxWorkers) {
      humanOverflowUsed += 1;
      return true;
    }
    workersUsed += 1;
    return false;
  }

  function start(request) {
    if (!canAllocate(request.kind)) return null;
    const overflow = consume(request.kind);
    const grantId = `slot-${String(++seq).padStart(3, '0')}`;
    const entry = { grantId, kind: request.kind, key: request.key, overflow, request };
    active.set(grantId, entry);
    emit('scheduler/slot-grant', { kind: request.kind, key: request.key, grantId, overflow, ...snapshot() });

    let result;
    try {
      result = request.run({ grantId, overflow, slot: grantId });
    } catch (error) {
      result = Promise.reject(error);
    }
    Promise.resolve(result).then(
      (value) => settle(entry, { status: 'ok', value }),
      (error) => settle(entry, { status: 'error', error }),
    );
    return { grantId, overflow };
  }

  function settle(entry, outcome) {
    if (!active.has(entry.grantId)) return;
    active.delete(entry.grantId);
    if (entry.overflow) humanOverflowUsed -= 1;
    else workersUsed -= 1;
    emit('scheduler/slot-release', { kind: entry.kind, key: entry.key, grantId: entry.grantId, ...snapshot() });

    try {
      hooks.onSettled?.(entry.request.meta?.ticket ?? null, outcome, entry);
    } catch (error) {
      hookErrors.push(error);
    }

    entry.request.deferred.resolve(outcome);
    pump();
  }

  /** 队列泵：先人后任务，把空出的 slot 立即兑现给排队项。 */
  function pump() {
    for (;;) {
      if (waiting.human.length > 0 && canAllocate('human')) {
        const request = waiting.human.shift();
        if (waiting.worker.length > 0) {
          emit('scheduler/priority', {
            kind: 'human',
            key: request.key,
            waitingWorkers: waiting.worker.length,
            note: '空出的普通 slot 优先给排队中的人请求',
          });
        }
        start(request);
        continue;
      }
      if (waiting.worker.length > 0 && canAllocate('worker')) {
        start(waiting.worker.shift());
        continue;
      }
      break;
    }
  }

  function request({ kind = 'worker', key, run, meta = {} } = {}) {
    if (kind !== 'worker' && kind !== 'human') throw new SchedulerError(`未知 slot 类型 "${kind}"`);
    if (typeof run !== 'function') throw new SchedulerError('request 需要 run 函数（要执行的工作）');
    const requirement = { kind, key: key ?? `job-${seq + 1}`, run, meta, deferred: deferred() };
    const started = start(requirement);
    if (started) {
      return { status: 'granted', grantId: started.grantId, overflow: started.overflow, key: requirement.key, done: requirement.deferred.promise };
    }
    waiting[kind].push(requirement);
    emit('scheduler/queued', { kind, key: requirement.key, ...snapshot() });
    return { status: 'queued', grantId: null, overflow: null, key: requirement.key, done: requirement.deferred.promise };
  }

  /**
   * dispatch 循环：把候选 Ticket 交给执行器端口。
   * 调度器负责 slot 与 assignment 的调度视图；持久化通过 hooks（onDispatch/onGrant/onSettled）交给 runtime。
   */
  async function dispatch(candidates = [], ctx = {}) {
    if (typeof runningExecutor !== 'function') throw new SchedulerError('未登记执行器端口 executor(ticket, ctx)');
    const launched = [];
    const queued = [];
    const skipped = [];
    const dispatchable = [];

    for (const ticket of candidates) {
      if (!ticket || typeof ticket.id !== 'string') {
        skipped.push(ticket?.id ?? null);
        continue;
      }
      if (ticket.status !== 'open' || ticket.assignment) {
        skipped.push(ticket.id);
        continue;
      }
      dispatchable.push(ticket);
    }

    // 先宣告本轮 dispatch，再逐个占用 slot / 启动执行器（让 trace 顺序符合因果）。
    emit('scheduler/dispatch', { candidates: dispatchable.length, ticketIds: dispatchable.map((ticket) => ticket.id) });

    for (const ticket of dispatchable) {
      ticket.assignment = { kind: 'worker', slot: null, state: 'queued', since: clock() };
      try {
        hooks.onDispatch?.(ticket);
      } catch (error) {
        hookErrors.push(error);
        throw error;
      }
      const assignment = ticket.assignment;
      const result = request({
        kind: 'worker',
        key: ticket.id,
        meta: { ticket, ctx },
        run: (grant) => {
          ticket.assignment = { ...assignment, slot: grant.grantId, state: 'running' };
          try {
            hooks.onGrant?.(ticket, grant);
          } catch (error) {
            hookErrors.push(error);
            throw error;
          }
          return runningExecutor(ticket, ctx);
        },
      });
      if (result.status === 'granted') {
        launched.push({ ticketId: ticket.id, grantId: result.grantId, done: result.done });
      } else {
        queued.push(ticket.id);
      }
    }

    return { launched, queued, skipped };
  }

  function setExecutor(fn) {
    if (typeof fn !== 'function') throw new SchedulerError('executor 必须是函数');
    runningExecutor = fn;
    return fn;
  }

  return {
    request,
    dispatch,
    setExecutor,
    stats: snapshot,
    /** 释放全部仍被占用的 slot（仅用于测试/demo 收尾；正常路径靠 worker 自然结算）。 */
    async drain() {
      const dones = [...active.values()].map((entry) => entry.request.deferred.promise);
      return Promise.all(dones);
    },
    hookErrors: () => [...hookErrors],
    get maxWorkers() {
      return maxWorkers;
    },
  };
}

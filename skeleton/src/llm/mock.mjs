/**
 * 本文件对应决策 D-14：确定性 Mock LLM（D-02 llm 端口的参考实现）。
 *
 * 决策内容：
 *  - 按 task.kind 返回脚本化结果：
 *      assess -> {kind:'assessment', accept, reason, title}
 *      work   -> {kind:'report', state, summary, evidence, actions[]}
 *      review -> {kind:'review', approve, notes}
 *  - scripts 支持：对象（固定返回）/ 数组（第 n 次调用取第 min(n, len) 项，最后一项重复）/
 *    函数 (({n, role, task, context}) => result)；
 *  - failures 支持注入失败模式（供测试）：{on, times, action:'throw'|'stripEvidence', fields?}。
 *
 * 它保证的不变量：
 *  - 零随机数、零定时器、不读真实时间做决策：同样调用序列永远同样输出（demo 可复现）；
 *  - 每次 ask 恰好记一次 calls（内核据此统计"噪音是否消耗模型调用"）；
 *  - 返回结果做结构化克隆，调用方修改不会污染脚本。
 */

export class MockLLMError extends Error {
  constructor(message) {
    super(`D-14: ${message}`);
    this.name = 'MockLLMError';
  }
}

export const MOCK_MODEL = 'mock-llm/v0.1';

function defaultResult(kind, { role }) {
  switch (kind) {
    case 'assessment':
      return { kind: 'assessment', accept: true, reason: 'mock 默认判定 accept', title: null };
    case 'report':
      return { kind: 'report', state: 'ready', summary: 'mock 默认完成', evidence: {}, actions: [] };
    case 'review':
      return { kind: 'review', approve: true, notes: 'mock 默认 approve' };
    default:
      throw new MockLLMError(`未知 task.kind="${kind}"（role=${role}），scripts 未提供默认值`);
  }
}

function cloneResult(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === 'function') return value;
  return structuredClone(value);
}

export function createMockLLM({ scripts = {}, failures = [], clock = () => Date.now(), model = MOCK_MODEL } = {}) {
  const counts = new Map();
  const calls = [];
  const pendingFailures = failures.map((failure) => ({ ...failure, remaining: failure.times ?? Infinity }));

  function nextFailure(kind) {
    const found = pendingFailures.find((failure) => failure.on === kind && failure.remaining > 0);
    if (!found) return null;
    if (Number.isFinite(found.remaining)) found.remaining -= 1;
    return found;
  }

  function resolveScript(script, ctx) {
    if (script === undefined) return null;
    if (typeof script === 'function') return script(ctx);
    if (Array.isArray(script)) {
      if (script.length === 0) return null;
      return script[Math.min(ctx.n, script.length) - 1];
    }
    return script;
  }

  async function ask({ role, context = null, task = {} } = {}) {
    if (!task || typeof task !== 'object') throw new MockLLMError('task 必须是对象');
    const kind = task.kind ?? role;
    const n = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, n);
    calls.push({
      seq: calls.length + 1,
      role,
      kind,
      ticketId: task.ticketId ?? null,
      contextChars: context?.stats?.usedChars ?? context?.text?.length ?? 0,
      at: clock(),
    });

    const failure = nextFailure(kind);
    if (failure && failure.action === 'throw') {
      throw new MockLLMError(`注入失败：${kind} 第 ${n} 次调用 action=throw`);
    }

    let result = resolveScript(scripts[kind] ?? scripts[role], { n, role, task, context });
    result = cloneResult(result);
    if (result === null || result === undefined) result = defaultResult(kind, { role });
    if (typeof result !== 'object' || Array.isArray(result)) throw new MockLLMError(`${kind} 的脚本返回必须是对象`);

    if (failure && failure.action === 'stripEvidence') {
      const fields = failure.fields ?? Object.keys(result.evidence ?? {});
      if (result.evidence && typeof result.evidence === 'object') {
        for (const field of fields) delete result.evidence[field];
      }
    }
    return result;
  }

  return {
    model,
    ask,
    calls: () => [...calls],
    callCount: (kind) => (kind ? counts.get(kind) ?? 0 : calls.length),
    counts: () => Object.fromEntries(counts),
  };
}

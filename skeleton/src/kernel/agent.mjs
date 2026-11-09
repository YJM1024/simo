/**
 * 本文件对应决策 D-02：Agent 运行器 —— 把一次 turn 的输入 / 输出 / 工具调用结构化。
 *
 * 决策内容：
 *  - 内核只依赖 llm 端口：async ask({role, context, task}) -> {kind, ...}；
 *  - 支持 worker / reviewer 两种角色（外加 Router 使用的 assessor 角色）；
 *  - 每次 turn 产出稳定结构 {id, role, ticketId, at, input, output, toolCalls, usage}，
 *    落在内存 turns[] 并通过 D-04 总线发 `agent/turn` 事件；
 *  - 工具调用走 tools 端口（{tool: fn}）：未登记的工具会被记录为失败，而不是崩溃；
 *  - worker 的产出必须是一个合法 Report 结构（state 属于 D-03 六态），由 tasks.addReport 最终校验。
 *
 * 它保证的不变量：
 *  - 换真 LLM 只需替换 llm 端口实现，Agent 运行器与内核不需要改（端口依赖）；
 *  - 一次 turn 恰好消耗一次模型调用（usage.llmCalls=1），便于统计噪音是否被模型消耗；
 *  - 输出 role 与结果 kind 不匹配时抛 AgentContractError（防止 mock/真实模型串味）。
 */
import { REPORT_STATES } from './tasks.mjs';

export const AGENT_ROLES = Object.freeze(['worker', 'reviewer', 'assessor']);
const EXPECTED_KIND = Object.freeze({ worker: 'report', reviewer: 'review', assessor: 'assessment' });

export class AgentContractError extends Error {
  constructor(message) {
    super(`D-02: ${message}`);
    this.name = 'AgentContractError';
  }
}

export function createAgent({ llm, bus = null, clock = () => Date.now(), tools = {}, id = 'agent' } = {}) {
  if (!llm || typeof llm.ask !== 'function') {
    throw new AgentContractError('需要 llm 端口（实现 async ask({role, context, task})）');
  }
  let seq = 0;
  const turns = [];

  async function executeTools(actions = []) {
    const calls = [];
    for (const action of actions) {
      if (!action || typeof action.tool !== 'string' || action.tool.length === 0) {
        calls.push({ tool: String(action?.tool ?? 'unknown'), args: {}, ok: false, reason: '动作缺少 tool 名称' });
        continue;
      }
      const fn = tools[action.tool];
      if (typeof fn !== 'function') {
        calls.push({ tool: action.tool, args: action.args ?? {}, ok: false, reason: '工具未在该 Agent 的 tools 端口登记' });
        continue;
      }
      try {
        const value = await fn(action.args ?? {});
        calls.push({ tool: action.tool, args: action.args ?? {}, ok: true, result: value ?? null });
      } catch (error) {
        calls.push({ tool: action.tool, args: action.args ?? {}, ok: false, error: String(error?.message ?? error) });
      }
    }
    return calls;
  }

  async function runTurn({ role, ticketId = null, task = {}, context = null } = {}) {
    const expectedKind = EXPECTED_KIND[role];
    if (!expectedKind) throw new AgentContractError(`未知角色 "${role}"，支持 ${AGENT_ROLES.join('/')}`);
    const turnId = `turn-${String(++seq).padStart(3, '0')}`;
    const at = clock();

    const result = await llm.ask({ role, context, task });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new AgentContractError(`${role} 的 llm.ask 返回值必须是对象`);
    }
    if (result.kind !== expectedKind) {
      throw new AgentContractError(`${role} 角色期望 llm 返回 kind="${expectedKind}"，收到 "${result.kind}"`);
    }
    const toolCalls = await executeTools(result.actions ?? []);

    const verdict =
      result.kind === 'assessment'
        ? { accept: result.accept === true }
        : result.kind === 'review'
          ? { approve: result.approve === true }
          : null;

    const turn = {
      id: turnId,
      role,
      ticketId,
      at,
      input: {
        taskKind: task.kind ?? null,
        contextChars: context?.stats?.usedChars ?? context?.text?.length ?? 0,
        promptChars: typeof task.prompt === 'string' ? task.prompt.length : 0,
        round: task.round ?? null,
      },
      output: {
        kind: result.kind,
        state: result.state ?? null,
        verdict,
        summary: result.summary ?? result.notes ?? result.reason ?? null,
        toolCallCount: toolCalls.length,
      },
      toolCalls,
      usage: { llmCalls: 1, model: llm.model ?? 'llm-port' },
    };
    turns.push(turn);

    if (bus) {
      bus.emit('agent/turn', {
        role,
        ticketId,
        turnId,
        taskKind: task.kind ?? null,
        actions: toolCalls.length,
        state: result.state ?? null,
        verdict,
        usage: turn.usage,
      });
    }
    return { turn, result };
  }

  async function assess({ context, task = {} } = {}) {
    const { turn, result } = await runTurn({ role: 'assessor', ticketId: task.ticketId ?? null, task: { kind: 'assess', ...task }, context });
    return {
      turn,
      verdict: {
        accept: result.accept === true,
        reason: String(result.reason ?? ''),
        title: typeof result.title === 'string' && result.title.length > 0 ? result.title : null,
      },
    };
  }

  async function worker({ ticket, context, task = {} } = {}) {
    const { turn, result } = await runTurn({
      role: 'worker',
      ticketId: ticket?.id ?? null,
      task: { kind: 'work', ...task, ticketId: ticket?.id ?? null },
      context,
    });
    if (!REPORT_STATES.includes(result.state)) {
      throw new AgentContractError(`worker 返回的 report.state 非法："${result.state}"，允许值 ${REPORT_STATES.join('|')}`);
    }
    return {
      turn,
      report: {
        state: result.state,
        summary: String(result.summary ?? ''),
        evidence: result.evidence && typeof result.evidence === 'object' && !Array.isArray(result.evidence) ? result.evidence : {},
        actions: turn.toolCalls,
      },
    };
  }

  async function reviewer({ ticket, context, task = {} } = {}) {
    const { turn, result } = await runTurn({
      role: 'reviewer',
      ticketId: ticket?.id ?? null,
      task: { kind: 'review', ...task, ticketId: ticket?.id ?? null },
      context,
    });
    return {
      turn,
      verdict: {
        approve: result.approve === true,
        notes: String(result.notes ?? ''),
      },
    };
  }

  return {
    id,
    runTurn,
    assess,
    worker,
    reviewer,
    turns: () => [...turns],
  };
}

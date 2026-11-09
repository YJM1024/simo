/**
 * 本文件对应决策 D-05：准入策略 —— Fast Path 确定性 Gate + acceptMode + 规则版本。
 *
 * 决策内容：
 *  - Gate 是**确定性的、零模型调用**的准入判定：来源白名单、是否 bot、是否明确请求
 *    （关键词 / @）→ 输出 explicit；只有白名单人类作者 + 疑似缺陷信号才输出 inferred
 *    （交由 Assessment 做模型判定）；其余一律 notAdmitted（drop，不调模型）；
 *  - acceptMode:
 *      off      —— 准入关闭：通过 Gate 也不建票、不评估、不记录影子
 *      observe  —— 影子模式：正常评估，但只写 would-accept 记录，绝不产生 Ticket
 *      auto     —— 正常模式：评估通过后建 Ticket + Mandate
 *  - Policy 带版本号：对规则做 canonical JSON 哈希（pv-xxxxxxxx），便于审计/回放。
 *
 * 它保证的不变量：
 *  - Gate 不进行任何模型调用（纯函数），因此噪音消息永远不会消耗 LLM；
 *  - observe 模式的判定只能落在 would-accept 记录上（本文件只给出 action，不落库，
 *    落库由 D-15 runtime 执行；action 的取值域强制区分 observe/auto）；
 *  - 同一份规则永远得到同一个版本号；规则一变版本号就变。
 */
import { canonicalJson, shortHash } from './digest.mjs';

export const ACCEPT_MODES = Object.freeze(['off', 'observe', 'auto']);
export const GATE_VERDICTS = Object.freeze(['explicit', 'inferred', 'notAdmitted']);

const DEFAULT_RULES = Object.freeze({
  sourceWhitelist: Object.freeze([]),
  denyBots: true,
  explicitKeywords: Object.freeze([]),
  issueSignals: Object.freeze([]),
  agentMentions: Object.freeze(['@agent']),
});

export class PolicyConfigError extends Error {
  constructor(message) {
    super(`D-05: ${message}`);
    this.name = 'PolicyConfigError';
  }
}

function normalizeRules(input = {}) {
  const rules = { ...DEFAULT_RULES, ...(input ?? {}) };
  for (const key of ['sourceWhitelist', 'explicitKeywords', 'issueSignals', 'agentMentions']) {
    if (!Array.isArray(rules[key])) throw new PolicyConfigError(`${key} 必须是字符串数组`);
    rules[key] = rules[key].map((item) => {
      if (typeof item !== 'string' || item.length === 0) throw new PolicyConfigError(`${key} 只能包含非空字符串`);
      return item;
    });
  }
  if (typeof rules.denyBots !== 'boolean') throw new PolicyConfigError('denyBots 必须是布尔值');
  return Object.freeze(rules);
}

function extractMentions(text) {
  const matches = String(text).match(/@[A-Za-z0-9_\-\u4e00-\u9fa5]+/g);
  return matches ? matches.map((item) => item.toLowerCase()) : [];
}

export function createPolicy({ rules: rawRules, acceptMode = 'observe' } = {}) {
  if (!ACCEPT_MODES.includes(acceptMode)) {
    throw new PolicyConfigError(`acceptMode 只能是 ${ACCEPT_MODES.join('|')}，收到 ${acceptMode}`);
  }
  const rules = normalizeRules(rawRules);
  const version = `pv-${shortHash(canonicalJson(rules), 8)}`;
  let mode = acceptMode;

  function evaluate(trigger) {
    if (!trigger || typeof trigger.text !== 'string') {
      throw new PolicyConfigError('evaluate 需要一个带 text 的 Trigger');
    }
    const source = String(trigger.source ?? '');
    const author = trigger.author ?? {};

    if (!rules.sourceWhitelist.includes(source)) {
      return { verdict: 'notAdmitted', rule: 'source-not-whitelisted', reason: `来源 "${source}" 不在白名单 [${rules.sourceWhitelist.join(', ')}]`, policyVersion: version };
    }
    if (rules.denyBots && author.isBot === true) {
      return { verdict: 'notAdmitted', rule: 'author-is-bot', reason: `作者 "${author.name ?? author.id ?? '?'}" 是 bot，不接受其作为 Trigger 发起者`, policyVersion: version };
    }

    const text = trigger.text;
    const lower = text.toLowerCase();
    const mentions = [...(trigger.mentions ?? []).map((m) => String(m).toLowerCase()), ...extractMentions(text)];
    const mentionHit = rules.agentMentions.find((mention) => {
      const token = mention.toLowerCase();
      return lower.includes(token) || mentions.includes(token);
    });
    if (mentionHit) {
      return { verdict: 'explicit', rule: 'explicit-mention', reason: `命中 @提及 "${mentionHit}"，视为明确请求`, policyVersion: version };
    }
    const keywordHit = rules.explicitKeywords.find((keyword) => lower.includes(keyword.toLowerCase()));
    if (keywordHit) {
      return { verdict: 'explicit', rule: 'explicit-keyword', reason: `命中明确请求关键词 "${keywordHit}"`, policyVersion: version };
    }
    const signalHit = rules.issueSignals.find((signal) => lower.includes(signal.toLowerCase()));
    if (signalHit) {
      return { verdict: 'inferred', rule: 'inferred-issue-signal', reason: `命中缺陷信号 "${signalHit}"（是否处理交给 Assessment 判定）`, policyVersion: version };
    }
    return { verdict: 'notAdmitted', rule: 'no-request-signal', reason: '无明确请求关键词 / @ / 缺陷信号，判定为闲聊噪音', policyVersion: version };
  }

  /**
   * 组合 Gate + acceptMode，返回 action ∈ off|drop|would-accept|ticket。
   * observe 模式下的正判定只会是 would-accept —— 这是不变量 2 的策略侧保证。
   */
  function decide(trigger) {
    const verdict = evaluate(trigger);
    let action;
    if (verdict.verdict === 'notAdmitted') action = mode === 'off' ? 'off' : 'drop';
    else if (mode === 'off') action = 'off';
    else if (mode === 'observe') action = 'would-accept';
    else action = 'ticket';
    return { ...verdict, mode, action };
  }

  function setAcceptMode(next) {
    if (!ACCEPT_MODES.includes(next)) {
      throw new PolicyConfigError(`acceptMode 只能是 ${ACCEPT_MODES.join('|')}，收到 ${next}`);
    }
    mode = next;
    return mode;
  }

  return {
    evaluate,
    decide,
    setAcceptMode,
    get acceptMode() {
      return mode;
    },
    get version() {
      return version;
    },
    rules,
    describe: () => ({ version, mode, rules }),
  };
}

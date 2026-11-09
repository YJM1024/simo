/**
 * 本文件对应决策 D-06：Inline & Spill 上下文组装。
 *
 * 决策内容：
 *  - 输入 thread 的消息列表 + 字符预算，输出一段可直接塞进模型 prompt 的 text；
 *  - 最近 N 条（recentN）inline，每条最多 perMessageChars（默认 400）字；
 *  - 更早的消息降级为 stub：只留 stubChars（默认 50）字 + 对象 ID（msg:<id>），
 *    并在 stats.expandable 里保留完整文本，作为"可展开入口"（展开不重新落库）；
 *  - 总预算 budgetChars 控制 text 体积：预算不够时，较新的 recent 消息也会降级为 stub。
 *
 * 它保证的不变量：
 *  - 组装是纯函数，不读 store、不调模型、无时间/随机依赖；
 *  - 输出顺序始终按消息时间正序（旧的在前）；
 *  - 任何被截断/降级的消息都能通过 stats.expandable[].ref 找到原文。
 */

export const DEFAULT_CONTEXT_OPTIONS = Object.freeze({
  recentN: 6,
  perMessageChars: 400,
  stubChars: 50,
  budgetChars: 3000,
});

export function truncateText(text, limit) {
  const source = String(text ?? '');
  if (source.length <= limit) return { text: source, truncated: false, originalChars: source.length };
  const cut = Math.max(0, limit - 1);
  return { text: `${source.slice(0, cut)}…`, truncated: true, originalChars: source.length };
}

function normalizeMessage(message, index) {
  const author = message.author && typeof message.author === 'object' ? message.author.name ?? 'unknown' : message.author ?? message.role ?? 'unknown';
  return {
    id: String(message.id ?? `m${index + 1}`),
    role: String(message.role ?? 'user'),
    author: String(author),
    text: String(message.text ?? ''),
    at: Number(message.at ?? 0),
    index,
  };
}

export function assembleContext({ messages = [], threadKey = null, budgetChars = DEFAULT_CONTEXT_OPTIONS.budgetChars, recentN = DEFAULT_CONTEXT_OPTIONS.recentN, perMessageChars = DEFAULT_CONTEXT_OPTIONS.perMessageChars, stubChars = DEFAULT_CONTEXT_OPTIONS.stubChars, header = true } = {}) {
  if (!Array.isArray(messages)) throw new TypeError('D-06: messages 必须是数组');
  if (!Number.isInteger(recentN) || recentN < 0) throw new TypeError('D-06: recentN 必须是 ≥0 的整数');
  const list = messages.map(normalizeMessage);
  const total = list.length;
  const recentStart = Math.max(0, total - recentN);

  const lines = new Array(total);
  const expandable = [];
  let inlineCount = 0;
  let stubCount = 0;
  let truncatedCount = 0;

  function makeStub(message, reason) {
    const stub = truncateText(message.text, stubChars);
    stubCount += 1;
    expandable.push({
      ref: `msg:${message.id}`,
      id: message.id,
      reason,
      chars: message.text.length,
      text: message.text,
    });
    return `[msg:${message.id}|spill] ${message.author}: ${stub.text}`;
  }

  function makeInline(message) {
    const cut = truncateText(message.text, perMessageChars);
    if (cut.truncated) {
      truncatedCount += 1;
      expandable.push({
        ref: `msg:${message.id}`,
        id: message.id,
        reason: 'truncated',
        chars: message.text.length,
        text: message.text,
      });
    }
    inlineCount += 1;
    return `[msg:${message.id}] ${message.author}: ${cut.text}`;
  }

  // 1) 更早的消息固定为 stub，先占预算。
  let stubBudget = 0;
  for (let index = 0; index < recentStart; index += 1) {
    lines[index] = makeStub(list[index], 'older-than-recentN');
    stubBudget += lines[index].length + 1;
  }

  // 2) 从最新往回 inline，预算不够就把它也降级为 stub。
  let remaining = Math.max(0, budgetChars - stubBudget);
  for (let index = total - 1; index >= recentStart; index -= 1) {
    const candidate = makeInlineProbe(list[index], perMessageChars);
    if (candidate.length <= remaining) {
      lines[index] = makeInline(list[index]);
      remaining -= lines[index].length + 1;
    } else {
      lines[index] = makeStub(list[index], 'budget-exceeded');
    }
  }

  const headerLine = header
    ? `【上下文】thread=${threadKey ?? '-'} · 消息 ${total} 条 · inline ${inlineCount} / spill ${stubCount} · 预算 ${budgetChars} 字`
    : '';
  const text = (headerLine ? `${headerLine}\n` : '') + lines.join('\n');
  const stats = {
    threadKey,
    budgetChars,
    usedChars: text.length,
    totalMessages: total,
    inlineCount,
    stubCount,
    truncatedCount,
    expandable,
    refs: expandable.map((entry) => entry.ref),
  };
  return { text, stats };
}

/** 预算探测：只计算长度，不修改任何计数（真正生成时再走 makeInline / makeStub）。 */
function makeInlineProbe(message, perMessageChars) {
  const cut = truncateText(message.text, perMessageChars);
  return `[msg:${message.id}] ${message.author}: ${cut.text}`;
}

/** 按 ref 展开原文；找不到返回 null。 */
export function expandRef(stats, ref) {
  return stats?.expandable?.find((entry) => entry.ref === ref)?.text ?? null;
}

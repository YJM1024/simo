// grader: count —— 数目标文本里正则命中的次数（用于"≥3 条结果""至少 N 个 URL"这类断言）。
// spec: { type:'count', target, pattern, flags?, atLeast?, atMost?, exactly? }
import { resolvePath, brief } from '../lib/resolve.mjs';

export const type = 'count';

export function grade(ctx, spec) {
  if (!spec.pattern) return { pass: false, detail: 'count: 缺少 pattern' };
  const raw = resolvePath(ctx, spec.target);
  if (raw === undefined) return { pass: false, detail: `count: 目标 '${spec.target}' 不存在（步骤未产出该观察）` };
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  let re;
  try {
    re = new RegExp(spec.pattern, spec.flags ?? 's');
  } catch (e) {
    return { pass: false, detail: `count: 非法正则 /${spec.pattern}/: ${e.message}` };
  }

  const n = (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
  const atLeast = spec.atLeast ?? (spec.exactly !== undefined ? spec.exactly : spec.atMost !== undefined ? 0 : 1);
  const atMost = spec.atMost ?? spec.exactly ?? Infinity;
  const ok = n >= atLeast && n <= atMost;

  return {
    pass: ok,
    detail: `count: /${spec.pattern}/ 命中 ${n} 次，期望 ${atLeast}..${atMost === Infinity ? '∞' : atMost}${ok ? '' : `；样本: ${brief(text, 160)}`}`,
  };
}

// grader: sum_eq —— 断言"总和 = 各部分之和"（用于 stats 的 token 口径：total 含 reasoning）。
// spec: { type:'sum_eq', total:'path.to.total', parts:['path.prompt','path.completion','path.reasoning'] }
import { resolvePath, brief } from '../lib/resolve.mjs';

export const type = 'sum_eq';

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function grade(ctx, spec) {
  if (!spec.total || !Array.isArray(spec.parts) || spec.parts.length === 0) {
    return { pass: false, detail: 'sum_eq: 需要 total 与 parts[]' };
  }
  const total = toNumber(resolvePath(ctx, spec.total));
  if (total === null) return { pass: false, detail: `sum_eq: total '${spec.total}' 不存在或非数字` };

  const values = [];
  for (const p of spec.parts) {
    const v = toNumber(resolvePath(ctx, p));
    if (v === null) return { pass: false, detail: `sum_eq: parts 中的 '${p}' 不存在或非数字` };
    values.push(v);
  }
  const sum = values.reduce((a, b) => a + b, 0);
  const ok = total === sum;
  return {
    pass: ok,
    detail: `sum_eq: total(${spec.total})=${total} 期望 = ${values.join('+')}=${sum}${ok ? '' : `；样本: ${brief(ctx, 120)}`}`,
  };
}

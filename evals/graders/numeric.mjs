// grader: numeric —— 比较两个观察值的数值大小（用于"依赖串行 / 并行"这类**顺序证据**）。
// spec: { type:'numeric', left, op, right?, value?, tolerance? }
//   left/right : ctx 点路径（数值或数字字符串）
//   op         : gt | gte | lt | lte | eq | near(需 tolerance) | diffGt(需 value)
//   value      : 与常量比较时的目标值（如 diffGt + value:0）
//
// 典型用法（M10）：
//   finalize.updatedAt 必须 ≥ 其依赖任务 updatedAt（串行证据）
//   collect 与 draft 的 updatedAt 相差 < 3000ms（并行证据）
import { resolvePath, brief } from '../lib/resolve.mjs';

export const type = 'numeric';

function num(ctx, pathOrValue) {
  const raw = resolvePath(ctx, pathOrValue);
  if (raw === undefined) return { ok: false, why: `路径 '${pathOrValue}' 不存在` };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return { ok: false, why: `'${pathOrValue}' 不是数字（实际 ${brief(raw, 60)}）` };
  return { ok: true, n };
}

export function grade(ctx, spec) {
  const left = num(ctx, spec.left);
  if (!left.ok) return { pass: false, detail: `numeric: left ${left.why}` };

  const rightPath = spec.right;
  let right = null;
  if (rightPath !== undefined) {
    right = num(ctx, rightPath);
    if (!right.ok) return { pass: false, detail: `numeric: right ${right.why}` };
  } else if (spec.value === undefined) {
    return { pass: false, detail: `numeric: 缺少 right 或 value` };
  }

  const target = right ? right.n : Number(spec.value);
  const op = spec.op || 'gte';
  const cmp = left.n - target;
  const desc = `left(${spec.left})=${left.n}, right=${right ? `${spec.right}` : 'value'}=${target}, op=${op}`;

  switch (op) {
    case 'gt':
      return { pass: cmp > 0, detail: `numeric: ${desc}${cmp > 0 ? '' : '（未严格大于）'}` };
    case 'gte':
      return { pass: cmp >= 0, detail: `numeric: ${desc}${cmp >= 0 ? '' : '（小于）'}` };
    case 'lt':
      return { pass: cmp < 0, detail: `numeric: ${desc}${cmp < 0 ? '' : '（未严格小于）'}` };
    case 'lte':
      return { pass: cmp <= 0, detail: `numeric: ${desc}${cmp <= 0 ? '' : '（大于）'}` };
    case 'eq':
      return { pass: cmp === 0, detail: `numeric: ${desc}` };
    case 'near': {
      const tol = Number(spec.tolerance);
      if (!Number.isFinite(tol)) return { pass: false, detail: 'numeric: near 需要 tolerance' };
      const ok = Math.abs(cmp) <= tol;
      return { pass: ok, detail: `numeric: |Δ|=${Math.abs(cmp)} ≤ ${tol}? ${ok}` };
    }
    case 'diffGt': {
      const v = Number(spec.value);
      const ok = Math.abs(cmp) > v;
      return { pass: ok, detail: `numeric: |Δ|=${Math.abs(cmp)} > ${v}? ${ok}` };
    }
    default:
      return { pass: false, detail: `numeric: 未知 op '${op}'` };
  }
}

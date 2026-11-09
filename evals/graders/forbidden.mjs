// grader: forbidden —— 断言"不该发生的事没有发生"。
// 这是正向断言抓不到的一类回归：错误事件、降级标记、越权痕迹、噪声通知。
// 与 regex+negate 的区别：forbidden 支持多模式，并**逐条报告命中的模式**，定位更快。
//
// spec: { type:'forbidden', target, patterns:[string], flags? }
import { resolvePath, brief } from '../lib/resolve.mjs';

export const type = 'forbidden';

export function grade(ctx, spec) {
  const patterns = spec.patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { pass: false, detail: 'forbidden: 缺少 patterns[]' };
  }
  const raw = resolvePath(ctx, spec.target);
  if (raw === undefined) {
    return { pass: false, detail: `forbidden: 目标 '${spec.target}' 不存在（步骤未产出该观察）` };
  }
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  const hits = [];
  for (const p of patterns) {
    let re;
    try {
      re = new RegExp(p, spec.flags ?? 's');
    } catch (e) {
      return { pass: false, detail: `forbidden: 非法正则 /${p}/: ${e.message}` };
    }
    const m = re.exec(text);
    if (m) hits.push({ p, at: m.index, snip: text.slice(Math.max(0, m.index - 30), m.index + 70) });
  }

  if (hits.length === 0) {
    return { pass: true, detail: `forbidden: ${patterns.length} 个禁止模式均未命中` };
  }
  const first = hits[0];
  return {
    pass: false,
    detail: `forbidden: 命中 ${hits.length}/${patterns.length} 个禁止模式；首个 /${first.p}/ 附近: ${brief(first.snip, 120)}`,
  };
}

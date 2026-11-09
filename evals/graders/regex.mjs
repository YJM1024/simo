// grader: regex —— 在目标文本里做正则匹配（零成本、完全确定）。
// 用于：响应体字段、SSE 事件名序列、最终文本格式。
// spec: { type:'regex', target, pattern, flags?, negate? }
//   target: ctx 点路径（如 'health.body' / 'stream.trace'）
//   negate: true 表示"必须不匹配"
import { resolvePath, brief } from '../lib/resolve.mjs';

export const type = 'regex';

export function grade(ctx, spec) {
  if (!spec.pattern) return { pass: false, detail: 'regex: 缺少 pattern' };
  const raw = resolvePath(ctx, spec.target);
  if (raw === undefined) {
    return { pass: false, detail: `regex: 目标 '${spec.target}' 不存在（步骤未产出该观察）` };
  }
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  let re;
  try {
    re = new RegExp(spec.pattern, spec.flags ?? 's');
  } catch (e) {
    return { pass: false, detail: `regex: 非法正则 /${spec.pattern}/: ${e.message}` };
  }

  const hit = re.test(text);
  const want = spec.negate ? false : true;
  if (hit === want) {
    return {
      pass: true,
      detail: `regex ${spec.negate ? '未命中' : '命中'} /${spec.pattern}/`,
    };
  }
  return {
    pass: false,
    detail: `regex ${spec.negate ? '意外命中' : '未命中'} /${spec.pattern}/；实际: ${brief(text)}`,
  };
}

// grader: last_state —— 断言"某个集合里**最后一条**匹配项的字段终值"。
//
// 与 state_delta 的分工：
//   - state_delta：集合里**能查到**符合预期的条目（存在性 + 字段检查）；
//   - last_state ：只看**最后一条**匹配项（用于"状态机当前落在哪"）。
// 典型用例（M2 no-interrupt）：任务 A 经历 queued → running，最后仍在 running。
//
// spec: { type:'last_state', collection, where?, expect }
//   where 的 key 支持点路径（"data.id"），便于直接对 WS 帧数组过滤。
import { resolvePath, deepEqual, brief } from '../lib/resolve.mjs';

export const type = 'last_state';

export function grade(ctx, spec) {
  const arr = resolvePath(ctx, spec.collection);
  if (!Array.isArray(arr)) {
    return {
      pass: false,
      detail: `last_state: '${spec.collection}' 不是数组（实际 ${arr === undefined ? '未产出' : typeof arr}）`,
    };
  }
  const matched = arr.filter((item) => matches(item, spec.where || {}));
  if (matched.length === 0) {
    return {
      pass: false,
      detail: `last_state: '${spec.collection}' 中没有匹配 ${brief(spec.where, 100)} 的条目（共 ${arr.length} 条）`,
    };
  }
  const last = matched[matched.length - 1];
  const expect = spec.expect || {};
  for (const [k, v] of Object.entries(expect)) {
    const actual = resolvePath(last, k);
    if (!deepEqual(actual, v)) {
      return {
        pass: false,
        detail: `last_state: 最后一条 ${k}=${brief(actual, 60)}，期望 ${brief(v, 60)}（共 ${matched.length} 条匹配，末条 ${brief(last, 120)}）`,
      };
    }
  }
  return {
    pass: true,
    detail: `last_state: '${spec.collection}' 末条匹配项的 ${brief(expect, 80)} 符合（匹配 ${matched.length} 条）`,
  };
}

/** where 的 key 支持点路径；全部键都相等才算匹配。 */
function matches(item, where) {
  if (!item || typeof item !== 'object') return false;
  return Object.entries(where).every(([k, v]) => deepEqual(resolvePath(item, k), v));
}

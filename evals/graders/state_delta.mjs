// grader: state_delta —— 断言"某次操作之后，状态里能查到预期的那一条"。
// 这是 E0 里"POST 之后 GET 能查到"的判定形态：不是看返回值，而是看**状态终值**。
//
// spec: {
//   type:'state_delta',
//   collection,        // ctx 点路径，必须解析为数组（如 'after.json.messages'）
//   where?,            // 过滤条件：{field: expectedValue}，逐字段深比较
//   expect?,           // 命中项的期望字段：{role:'user', status:'done'}
//   exactly?, atLeast?, atMost?   // 命中数量约束（默认 atLeast:1）
// }
import { resolvePath, deepEqual, brief } from '../lib/resolve.mjs';

export const type = 'state_delta';

export function grade(ctx, spec) {
  const arr = resolvePath(ctx, spec.collection);
  if (!Array.isArray(arr)) {
    return {
      pass: false,
      detail: `state_delta: '${spec.collection}' 不是数组（实际 ${arr === undefined ? '未产出' : typeof arr}）`,
    };
  }

  const where = spec.where || {};
  // where 的 key 支持点路径（"data.id"），便于直接对 WS 帧数组过滤
  const matched = arr.filter((item) => item && typeof item === 'object' && matchesWhere(item, where));

  // 数量约束的默认值要一致：只给了 atMost 时，下限应为 0（"最多 N 条"是 legit 的断言）
  const atLeast = spec.atLeast ?? (spec.exactly !== undefined ? spec.exactly : spec.atMost !== undefined ? 0 : 1);
  const atMost = spec.atMost ?? spec.exactly ?? Number.POSITIVE_INFINITY;
  const countOk = matched.length >= atLeast && matched.length <= atMost;

  const whereText = Object.keys(where).length ? brief(where, 80) : '(无过滤)';
  if (!countOk) {
    const want =
      spec.exactly !== undefined ? `= ${spec.exactly}` : `${atLeast}..${atMost === Infinity ? '∞' : atMost}`;
    return {
      pass: false,
      detail: `state_delta: '${spec.collection}' 中匹配 ${whereText} 的条目数 ${matched.length}，期望 ${want}（集合共 ${arr.length} 条）`,
    };
  }

  // 数量对了，再校验命中项的字段终值
  const expect = spec.expect || {};
  for (const item of matched) {
    for (const [k, v] of Object.entries(expect)) {
      const actual = resolvePath(item, k);
      if (!deepEqual(actual, v)) {
        return {
          pass: false,
          detail: `state_delta: 命中项字段 ${k}=${brief(actual, 60)}，期望 ${brief(v, 60)}（条目 ${brief(item, 100)}）`,
        };
      }
    }
  }

  return {
    pass: true,
    detail: `state_delta: '${spec.collection}' 命中 ${matched.length} 条${
      Object.keys(expect).length ? `，字段 ${brief(expect, 80)} 符合` : ''
    }`,
  };
}

/** where 的 key 支持点路径；全部键都相等才算匹配。 */
function matchesWhere(item, where) {
  return Object.entries(where).every(([k, v]) => deepEqual(resolvePath(item, k), v));
}

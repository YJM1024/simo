// ctx 取值、模板替换、深比较：run.mjs 与 graders 共用的小工具。
// 刻意保持"简单到可以一眼看完"——E0 的可靠性来自确定性，不来自聪明。

/**
 * 按点路径取值：resolve(ctx, 'stream.events')。
 * 路径段若为数字则按数组下标处理（'messages.0.text'）。
 * @returns {any} 取不到时返回 undefined（由 grader 判定为失败，不抛异常）
 */
export function resolvePath(root, path) {
  if (path === undefined || path === null || path === '') return root;
  let cur = root;
  for (const seg of String(path).split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(seg)) {
      cur = cur[Number(seg)];
    } else {
      cur = cur[seg];
    }
  }
  return cur;
}

/**
 * 把 "{{varName}}" 替换成 vars[varName]；未知变量原样保留（由调用方校验）。
 * 只替换字符串叶子；数组/对象递归处理。
 *
 * 注意：**必须支持嵌套展开**——case 里常见 `vars.probe = "evals-{{runId}}"`，
 * 单趟 replace 会留下字面量 `evals-{{runId}}` 并悄悄进入请求体（曾经的 bug）。
 * 因此循环展开到稳定，最多 5 趟，超限视为循环引用原样保留。
 */
export function applyVars(value, vars) {
  if (typeof value === 'string') return expandString(value, vars);
  if (Array.isArray(value)) return value.map((v) => applyVars(v, vars));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = applyVars(v, vars);
    return out;
  }
  return value;
}

function expandString(input, vars) {
  let s = input;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    const next = s.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, name) => {
      if (!Object.prototype.hasOwnProperty.call(vars, name)) return m;
      changed = true;
      return String(vars[name]);
    });
    s = next;
    if (!changed) break;
  }
  return expandClockTemplates(s);
}

/**
 * 时间模板（M13 定时任务需要"未来时间戳"，而 case 是静态 JSON）：
 *   {{nowIso}}          当前时间 RFC3339（UTC Z）
 *   {{nowPlusIso:N}}    当前时间 + N 秒，RFC3339
 *   {{nowMs}}           当前毫秒时间戳
 *   {{nowPlusMs:N}}     当前毫秒 + N 秒
 * 在 case 装载期展开（与 {{var}} 同阶段），一次运行内不重复刷新。
 */
function expandClockTemplates(s) {
  const iso = (offsetSec) => new Date(Date.now() + offsetSec * 1000).toISOString();
  return s
    .replace(/\{\{\s*nowIso\s*\}\}/g, () => iso(0))
    .replace(/\{\{\s*nowPlusIso\s*:\s*(\d+)\s*\}\}/g, (_m, n) => iso(Number(n)))
    .replace(/\{\{\s*nowMs\s*\}\}/g, () => String(Date.now()))
    .replace(/\{\{\s*nowPlusMs\s*:\s*(\d+)\s*\}\}/g, (_m, n) => String(Date.now() + Number(n) * 1000));
}

/**
 * 运行时引用展开：把 "{{@sessions.json.sessions.0.id}}" 替换成 ctx 里的实际值。
 * 与 {{var}} 的区别：
 *   - {{var}}   在 case 装载期一次性替换（静态变量）；
 *   - {{@path}} 在**每个步骤执行前**替换（引用前序步骤产出的观察，如默认会话 id）。
 * 取不到值 → 抛错（fail-closed：宁可步骤失败，也不把 "undefined" 拼进 URL）。
 */
export function applyCtxRefs(value, ctx) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*@([^}]+?)\s*\}\}/g, (_m, p) => {
      const v = resolvePath(ctx, p.trim());
      if (v === undefined || v === null) {
        throw new Error(`运行时引用 {{@${p}}} 取不到值（前序步骤未产出该观察）`);
      }
      return typeof v === 'string' ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => applyCtxRefs(v, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = applyCtxRefs(v, ctx);
    return out;
  }
  return value;
}

/** 收集一个值里的全部模板变量名，用于"未定义变量 → 编译失败"式的校验。 */
export function collectVarNames(value, acc = new Set()) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) acc.add(m[1]);
  } else if (Array.isArray(value)) {
    for (const v of value) collectVarNames(v, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectVarNames(v, acc);
  }
  return acc;
}

/** 深比较（只比较 JSON 可表达的值；对象忽略 key 顺序）。 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** 把值渲染成便于放进报错信息的短字符串。 */
export function brief(value, max = 160) {
  let s;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s === undefined) return 'undefined';
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

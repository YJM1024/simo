/**
 * 本文件不新增决策：它是 D-05 / D-09 / D-15 共用的**确定性摘要工具**。
 *
 * 被谁使用：
 *  - D-05 policy.mjs   —— 规则哈希（Policy 版本号）
 *  - D-09 acceptance.mjs —— 证据指纹（clearance.evidenceHash）
 *  - D-15 runtime.mjs  —— 由 Source 侧 id 派生确定性的 Ticket / Mandate id
 *
 * 它保证的不变量：
 *  - canonicalJson：同一份数据无论键序如何，永远产出同一字符串；
 *  - shortHash：只依赖输入内容，不依赖时间 / 随机数 / 进程，因此 demo 输出可复现。
 */
import { createHash } from 'node:crypto';

/** 递归按键名排序后序列化，保证哈希稳定。 */
export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

/** 完整 sha256（hex）。 */
export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/** 取 sha256 前 length 位，用作确定性短 id。 */
export function shortHash(value, length = 10) {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  return sha256(text).slice(0, length);
}

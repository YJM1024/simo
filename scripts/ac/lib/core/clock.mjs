// scripts/ac/lib/core/clock.mjs
//
// 可注入时钟：时间类判据用 SIMO_TEST_CLOCK 加速，不真实等待。
// 确需真实等待时必须带显式批准标记（原因、批准人、上限），否则直接抛错。
import { ROOT } from './bootstrap.mjs'

export async function probeClock(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/runtime/status`, { signal: AbortSignal.timeout(3000) })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { status: res.status, at: Number(json?.at || 0), host: Date.now() }
  } catch (error) {
    return { status: 0, at: 0, host: Date.now(), error: error.message }
  }
}

/**
 * 真实等待：只允许在“无法用推进代替”时使用。
 * approval 必须写清 reason（为什么不能注入）、approvedBy（依据或批准人）、maxMs（上限）。
 */
export function realWait(ms, approval = {}) {
  const { reason, approvedBy, maxMs } = approval
  const missing = []
  if (!reason) missing.push('reason')
  if (!approvedBy) missing.push('approvedBy')
  if (!Number.isFinite(Number(maxMs))) missing.push('maxMs')
  if (missing.length > 0) {
    throw new Error(`真实等待缺少显式批准标记：${missing.join('、')}；时间类判据优先用 SIMO_TEST_CLOCK 推进`)
  }
  if (ms > Number(maxMs)) throw new Error(`真实等待 ${ms}ms 超过批准上限 ${maxMs}ms`)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 推进量：服务端时钟差与主机差，断言里直接写推进了多少毫秒。 */
export function advanceSummary(before, after) {
  return {
    serverDeltaMs: after.at - before.at,
    hostDeltaMs: after.host - before.host,
    rate: (after.at - before.at) / Math.max(after.host - before.host, 1),
  }
}

export function clockBinaryInfo(artifact) {
  return {
    path: artifact?.path ?? '',
    sha256: artifact?.sha256 ?? '',
    bytes: artifact?.bytes ?? 0,
    builtAt: artifact?.builtAt ?? '',
    source: `${ROOT}/build/manifest.json`,
  }
}

// features/chat/frames.ts —— WS 帧 → 业务载荷的解析（chat 领域私有）
//
// 契约：docs/m2-contract.md §5（M2 新增 reply.* / trace.reasoning / reply.retracted）。
// 兼容 M1 的 message.* 帧：M2 后端仍可能用 message.created 发用户消息。
// 未知类型由上层忽略，不会崩。

import type { ChatMessage } from '../../platform/types.ts'
import { isRecord, readString, toChatMessage } from '../../platform/types.ts'

export interface DeltaPayload {
  id: string
  delta: string
}

export interface DonePayload {
  id: string
  status: string
}

export interface RetractedPayload {
  id: string
  reason?: string
}

export interface ReasoningPayload {
  id: string
  delta: string
}

export interface StatusPayload {
  state: 'thinking' | 'idle'
}

export interface ErrorPayload {
  code: string
  message: string
}

/** reply.created 可能只带 {id, role, status}（无 text），缺省 text 为空串。 */
export function parseCreated(value: unknown, fallbackRole = 'agent'): ChatMessage | null {
  return toChatMessage(value, fallbackRole)
}

export function parseDelta(value: unknown): DeltaPayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  const delta = readString(value, 'delta')
  if (!id || delta === undefined) return null
  return { id, delta }
}

export function parseDone(value: unknown): DonePayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  return { id, status: readString(value, 'status') ?? 'done' }
}

/** reply.retracted：撤回只作用于流式未完成回复；前端只显示「已撤回」标记。 */
export function parseRetracted(value: unknown): RetractedPayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  const reason = readString(value, 'reason')
  return reason === undefined ? { id } : { id, reason }
}

/** trace.reasoning：只进折叠轨迹，不进正文。 */
export function parseReasoning(value: unknown): ReasoningPayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  const delta = readString(value, 'delta')
  if (!id || delta === undefined) return null
  return { id, delta }
}

export function parseStatus(value: unknown): StatusPayload | null {
  if (!isRecord(value)) return null
  const state = readString(value, 'state')
  if (state !== 'thinking' && state !== 'idle') return null
  return { state }
}

export function parseError(value: unknown): ErrorPayload | null {
  if (!isRecord(value)) return null
  const message = readString(value, 'message')
  if (!message) return null
  return { code: readString(value, 'code') ?? 'unknown', message }
}

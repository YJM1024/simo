import { useEffect, useRef } from 'react'
export const tabId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `tab-${Math.random().toString(36).slice(2)}`
const CHANNEL = 'simo.tab-sync.v1'
export type TabSyncMessage =
  | { type: 'active_session_changed'; tabId: string; opId: string; at: number; sessionId: string }
  | { type: 'ancestor_chain_changed'; tabId: string; opId: string; at: number; sessionId: string; chain: string[] }
  // tabId 是可选字段以兼容旧版本帧：发送端始终携带；旧帧没有 tabId 时由接收端按 at 单独处理。
  | { type: 'read_cursor_changed'; tabId?: string; opId: string; at: number; sessionId: string }
type Handler = (message: TabSyncMessage) => void
let channel: BroadcastChannel | null = null
const handlers = new Set<Handler>()
function ensure(): BroadcastChannel | null {
  if (channel) return channel
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.addEventListener('message', (event) => { for (const handler of handlers) handler(event.data as TabSyncMessage) })
  } catch {
    // 构造器存在也可能抛错（隐私模式、沙箱）：静默降级为无通道模式，与“不支持”同一条路径。
    channel = null
  }
  return channel
}
/**
 * 跨标签操作（active 会话切换与读游标）共用的一条 tiebreak：
 * `at` 大者胜；`at` 相等时 `tabId` 字典序大者胜。相等即重复帧，返回 false 以保证幂等。
 */
export function winsTabSyncTiebreak(incoming: { at: number; tabId: string }, applied: { at: number; tabId: string }): boolean {
  return incoming.at > applied.at || (incoming.at === applied.at && incoming.tabId > applied.tabId)
}
export function publishTabSync(message: TabSyncMessage): void {
  ensure()?.postMessage(message)
}
export function useTabSync(handler: Handler, deps: unknown[] = []): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const listener: Handler = (message) => ref.current(message)
    handlers.add(listener)
    ensure()
    return () => { handlers.delete(listener) }
  }, deps)
}

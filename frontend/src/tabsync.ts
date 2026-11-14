import { useEffect, useRef } from 'react'
export const tabId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `tab-${Math.random().toString(36).slice(2)}`
const CHANNEL = 'simo.tab-sync.v1'
export type TabSyncMessage =
  | { type: 'active_session_changed'; tabId: string; opId: string; at: number; sessionId: string }
  | { type: 'ancestor_chain_changed'; tabId: string; opId: string; at: number; sessionId: string; chain: string[] }
  | { type: 'read_cursor_changed'; tabId: string; opId: string; at: number; sessionId: string }
type Handler = (message: TabSyncMessage) => void
let channel: BroadcastChannel | null = null
const handlers = new Set<Handler>()
function ensure(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) { channel = new BroadcastChannel(CHANNEL); channel.addEventListener('message', (event) => { for (const handler of handlers) handler(event.data as TabSyncMessage) }) }
  return channel
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

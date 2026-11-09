// platform/ws-hub.ts —— 全应用唯一的 WebSocket 连接（契约：每标签页一条连接）
//
// M2 起 chat 与 tasks 都要收帧，因此连接上移到 platform：
//   - app/useConnection 在得知当前会话后调用 connectWs(sessionId)
//   - 收到的帧统一广播到事件总线 ws:frame；连接状态广播 ws:state
//   - 各 feature 只订阅事件总线，互相不 import（契约 §9.2）
//
// 发送也走这里：chat / correct 帧；连接未就绪返回 false，调用方自行兜底。

import { bus, EVENTS } from './events.ts'
import { createWsClient, type OutgoingFrame, type WsClient } from './ws.ts'
import type { WireFrame } from './types.ts'

let client: WsClient | null = null
let currentSessionId: string | null = null

/** 建立（或切换）连接；同一会话重复调用是幂等的。 */
export function connectWs(sessionId: string): void {
  if (currentSessionId === sessionId && client) return
  disconnectWs()
  currentSessionId = sessionId
  client = createWsClient({
    sessionId,
    onFrame: (frame: WireFrame) => bus.emit(EVENTS.WS_FRAME, { frame }),
    onState: (connection, meta) =>
      bus.emit(EVENTS.WS_STATE, { connection, reconnect: meta?.reconnect === true }),
  })
}

export function disconnectWs(): void {
  if (client) {
    client.close()
    client = null
  }
  currentSessionId = null
}

export function isWsOpen(): boolean {
  return client?.isOpen() ?? false
}

export function sendFrame(type: string, data?: unknown): boolean {
  if (!client) return false
  const frame: OutgoingFrame = { type }
  if (data !== undefined) frame.data = data
  return client.send(frame)
}

/** 普通消息（默认不打断后台工作，契约 §5）；M8 可带附件 id 列表；M15 可带回复目标。 */
export function sendChat(
  text: string,
  attachmentIds: readonly string[] = [],
  replyToMessageId?: string,
): boolean {
  if (!currentSessionId) return false
  const data: { sessionId: string; text: string; attachments?: string[]; replyToMessageId?: string } = {
    sessionId: currentSessionId,
    text,
  }
  if (attachmentIds.length > 0) data.attachments = [...attachmentIds]
  if (replyToMessageId) data.replyToMessageId = replyToMessageId
  return sendFrame('chat', data)
}

/** 显式修正/停止：只影响指定流式回复；后端据此回 reply.retracted。 */
export function sendCorrect(text: string, targetMessageId?: string): boolean {
  if (!currentSessionId) return false
  const data: { sessionId: string; targetMessageId?: string; text: string } = {
    sessionId: currentSessionId,
    text,
  }
  if (targetMessageId) data.targetMessageId = targetMessageId
  return sendFrame('correct', data)
}

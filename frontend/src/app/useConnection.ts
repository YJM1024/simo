// app/useConnection.ts —— 壳层负责「每标签页一条 WebSocket」的建立与切换
//
// 连接本身在 platform/ws-hub（纯逻辑，不依赖 React）；这里只做生命周期：
//   - 首帧：从 URL ?session= 兜底
//   - 之后：跟随 sessions feature 广播的 session:active
// 置放于壳层的原因：chat / tasks 都要收帧，但两个 feature 不能互相 import（契约 §9.2）。

import { useEffect } from 'react'
import { bus, EVENTS } from '../platform/events.ts'
import { readSessionId } from '../platform/router.ts'
import { connectWs, disconnectWs } from '../platform/ws-hub.ts'

export function useConnection(): void {
  useEffect(() => {
    const initialSessionId = readSessionId()
    if (initialSessionId) connectWs(initialSessionId)

    const off = bus.on(EVENTS.SESSION_ACTIVE, (payload) => {
      connectWs(payload.sessionId)
    })

    return () => {
      off()
      disconnectWs()
    }
  }, [])
}

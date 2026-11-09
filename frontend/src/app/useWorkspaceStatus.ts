// app/useWorkspaceStatus.ts —— 壳层订阅跨 feature 状态（只走事件总线，不 import feature）
//
// 顶栏需要的四类信息：
//   connection   ← ws:state（platform/ws-hub）
//   agentStatus  ← chat:status（chat feature）
//   runningTasks ← tasks:state（tasks feature）
//   sessionTitle ← session:active（sessions feature）

import { useEffect, useState } from 'react'
import { bus, EVENTS } from '../platform/events.ts'
import type { AgentState, ConnectionState } from '../platform/types.ts'

export interface WorkspaceStatus {
  connection: ConnectionState
  agentStatus: AgentState
  runningTasks: number
  totalTasks: number
  sessionTitle: string
}

const INITIAL_STATUS: WorkspaceStatus = {
  connection: 'connecting',
  agentStatus: 'idle',
  runningTasks: 0,
  totalTasks: 0,
  sessionTitle: '主会话',
}

export function useWorkspaceStatus(): WorkspaceStatus {
  const [status, setStatus] = useState<WorkspaceStatus>(INITIAL_STATUS)

  useEffect(
    () =>
      bus.on(EVENTS.SESSION_ACTIVE, (payload) => {
        setStatus((prev) => ({ ...prev, sessionTitle: payload.title || prev.sessionTitle }))
      }),
    [],
  )

  useEffect(
    () =>
      bus.on(EVENTS.WS_STATE, (payload) => {
        setStatus((prev) => ({ ...prev, connection: payload.connection }))
      }),
    [],
  )

  useEffect(
    () =>
      bus.on(EVENTS.CHAT_STATUS, (payload) => {
        setStatus((prev) => ({ ...prev, agentStatus: payload.agentStatus }))
      }),
    [],
  )

  useEffect(
    () =>
      bus.on(EVENTS.TASKS_STATE, (payload) => {
        setStatus((prev) => ({ ...prev, runningTasks: payload.running, totalTasks: payload.total }))
      }),
    [],
  )

  return status
}

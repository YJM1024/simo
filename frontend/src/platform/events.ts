// platform/events.ts —— 跨 feature 的最小事件总线
//
// 契约 §9.2 规定 features 之间禁止互相 import。跨模块协作一律走这里：
//   - sessions 广播当前会话（session:active）
//   - platform/ws-hub 广播连接状态与所有 WS 帧（ws:state / ws:frame）
//   - chat 广播思考状态（chat:status）
//   - tasks 广播并行任务计数（tasks:state）
// 事件名与负载集中定义，相当于平台级契约；负载必须是可序列化的普通数据。

import type { AgentState, ConnectionState, SessionMetaEntry, WireFrame } from './types.ts'

export interface SessionActivePayload {
  sessionId: string
  title: string
  /** 当前会话在树中的深度（根 = 0）；chat 用它决定 includeChildren 默认值 */
  depth: number
  /** M6：归档会话为只读（输入禁用，隐藏改名/新建子会话） */
  archived: boolean
  sessionMeta: SessionMetaEntry[]
}

export interface SessionSelectPayload {
  sessionId: string
}

/** 会话树刷新请求（对话可能自动建子会话，chat 通知 sessions 重新拉树）。 */
export interface SessionsRefreshPayload {
  reason?: string
}

export interface WsStatePayload {
  connection: ConnectionState
  /** 是否是断线后的重连（用于静默补齐断线窗口内的消息） */
  reconnect?: boolean
}

/** M7：通知只允许三类打扰（任务完成 / 需审批 / 错误） */
export interface NotifyPayload {
  kind: 'task-done' | 'approval' | 'error'
  title: string
  detail?: string
  id?: string
}

export interface WsFramePayload {
  frame: WireFrame
}

/** M10：请求打开任务详情（聊天里的汇报卡片 → 右栏任务面板） */
export interface TaskOpenPayload {
  taskId: string
  workflowId?: string
}

/** M10：工作流运行态（tasks → chat 的「停」按钮） */
export interface WorkflowsStatePayload {
  running: boolean
  paused: boolean
  activeWorkflowId: string | null
}

/** M24：打开当前会话的自定义视图预览 */
export interface ViewOpenPayload {
  sessionId?: string
}

/** M37：顶部横向导航事件 */
export interface NavOpenPayload {
  view: string
}

export interface NavClosedPayload {
  view: string
}

export interface ChatTabPayload {
  tab: 'chat' | 'trajectory' | 'files' | 'overview'
}

/** M38：右栏收起/展开状态（RightRail → App 调整栅格宽度） */
export interface LayoutRightPayload {
  collapsed: boolean
}

/** M40：顶部「工作台」内嵌页请求打开用量/设置/命令面板/自定义视图 */
export interface WorkbenchOpenPayload {
  target: 'usage' | 'settings' | 'palette' | 'view'
}

export interface ChatStatusPayload {
  agentStatus: AgentState
}

export interface TasksStatePayload {
  running: number
  total: number
}

export interface ComposerInsertPayload {
  text: string
}

export type BusPayloads = {
  'session:active': SessionActivePayload
  'session:select': SessionSelectPayload
  'sessions:refresh': SessionsRefreshPayload
  'notify': NotifyPayload
  'task:open': TaskOpenPayload
  'workflows:state': WorkflowsStatePayload
  'view:open': ViewOpenPayload
  'nav:open': NavOpenPayload
  'nav:closed': NavClosedPayload
  'nav:reset': Record<string, never>
  'chat:tab:open': ChatTabPayload
  'chat:tab:state': ChatTabPayload
  'composer:insert': ComposerInsertPayload
  'layout:right': LayoutRightPayload
  'right:rail:open': Record<string, never>
  'workbench:open': WorkbenchOpenPayload
  'ws:state': WsStatePayload
  'ws:frame': WsFramePayload
  'chat:status': ChatStatusPayload
  'tasks:state': TasksStatePayload
  'right:rail:tab': { tab: 'tasks' | 'overview' }
  'session:draft:accept': { draftId: string; sessionId: string; title: string }
}

export const EVENTS = {
  /** 会话树确定了当前会话 */
  SESSION_ACTIVE: 'session:active',
  /** 请求切换到某会话（标签跳转等；sessions feature 负责实际切换） */
  SESSION_SELECT: 'session:select',
  /** 请求重新拉取会话树（对话自动建子会话后） */
  SESSIONS_REFRESH: 'sessions:refresh',
  /** M7 通知（仅任务完成/需审批/错误三类；可关闭、不阻塞输入） */
  NOTIFY: 'notify',
  /** M10：打开任务详情（聊天汇报卡片 → 任务面板） */
  TASK_OPEN: 'task:open',
  /** M10：工作流运行态（任务面板 → 聊天「停」按钮） */
  WORKFLOWS_STATE: 'workflows:state',
  /** M24：打开当前会话的自定义视图预览（设置/命令面板 → views） */
  VIEW_OPEN: 'view:open',
  /** M37：顶部横向导航打开视图（entries 监听，portal 打开对应页） */
  NAV_OPEN: 'nav:open',
  /** M37：视图页关闭（顶部 tab 回到对话） */
  NAV_CLOSED: 'nav:closed',
  /** M37：切换视图前关闭所有已打开页 */
  NAV_RESET: 'nav:reset',
  /** M37：请求切换中栏会话标签（对话/文件等） */
  CHAT_TAB_OPEN: 'chat:tab:open',
  /** M37：中栏会话标签变化（同步顶部 tab 激活态） */
  CHAT_TAB_STATE: 'chat:tab:state',
  /** M44：空态建议按钮 → 填入输入框 */
  COMPOSER_INSERT: 'composer:insert',
  /** M38：右栏收起/展开状态（App 调整最右侧列宽） */
  LAYOUT_RIGHT: 'layout:right',
  /** M45：窄屏顶部按钮打开右栏浮层 */
  RIGHT_RAIL_OPEN: 'right:rail:open',
  /** M63：右栏任务/概览切换 */
  RIGHT_RAIL_TAB: 'right:rail:tab',
  /** M70：本地草稿会话已落库，树替换草稿 */
  SESSION_DRAFT_ACCEPT: 'session:draft:accept',
  /** M40：工作台内嵌页的二级入口（用量/设置/命令面板/视图） */
  WORKBENCH_OPEN: 'workbench:open',
  /** WebSocket 连接状态（壳层顶栏） */
  WS_STATE: 'ws:state',
  /** WebSocket 收到的原始帧（chat / tasks 各自消费自己关心的类型） */
  WS_FRAME: 'ws:frame',
  /** 对话思考状态（chat → 壳层） */
  CHAT_STATUS: 'chat:status',
  /** 并行任务计数（tasks → 壳层 / chat 状态行） */
  TASKS_STATE: 'tasks:state',
} as const satisfies Record<string, keyof BusPayloads>

export type EventName = keyof BusPayloads
type Handler<K extends EventName> = (payload: BusPayloads[K]) => void

export interface Bus {
  on<K extends EventName>(type: K, handler: Handler<K>): () => void
  emit<K extends EventName>(type: K, payload: BusPayloads[K]): void
}

export function createBus(): Bus {
  const listeners = new Map<EventName, Set<(payload: never) => void>>()

  function on<K extends EventName>(type: K, handler: Handler<K>): () => void {
    let set = listeners.get(type)
    if (!set) {
      set = new Set()
      listeners.set(type, set)
    }
    set.add(handler as (payload: never) => void)
    return () => {
      const current = listeners.get(type)
      if (!current) return
      current.delete(handler as (payload: never) => void)
      if (current.size === 0) listeners.delete(type)
    }
  }

  function emit<K extends EventName>(type: K, payload: BusPayloads[K]): void {
    const set = listeners.get(type)
    if (!set) return
    for (const handler of [...set]) {
      try {
        ;(handler as unknown as Handler<K>)(payload)
      } catch (error) {
        console.error(`[bus] handler failed: ${type}`, error)
      }
    }
  }

  return { on, emit }
}

/** 壳层与 features 共享的单例总线。 */
export const bus = createBus()

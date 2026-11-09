// app/TopBar.tsx —— 壳层顶栏（M40：48px 密度、面包屑、统一 Badge/Button）
//
// 只使用语义 token；全局状态/权限/连接在右，不放大段文案。

import type { AgentState, ConnectionState } from '../platform/types.ts'
import PermissionMenu from './PermissionMenu.tsx'
import BrandMark from './BrandMark.tsx'
import NotificationCenter from '../features/chat/NotificationCenter.tsx'
import { bus, EVENTS } from '../platform/events.ts'
import type { PermissionsApi } from './usePermissions.ts'
import { Badge } from '../platform/ui/Badge.tsx'
import { Button } from '../platform/ui/Button.tsx'

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: '连接中',
  open: '已连接',
  reconnecting: '重连中',
  closed: '已断开',
}

interface TopBarProps {
  connection: ConnectionState
  agentStatus: AgentState
  runningTasks: number
  totalTasks: number
  sessionTitle: string
  themeLabel: string
  permissions: Pick<PermissionsApi, 'permission' | 'loading' | 'saving' | 'error' | 'needsConfirm' | 'save'>
}

export default function TopBar({
  connection,
  agentStatus,
  sessionTitle,
  permissions,
}: TopBarProps) {
  const connected = connection === 'open'
  const title = sessionTitle || '主会话'

  return (
    <header className="relative z-10 flex h-[52px] flex-none items-center justify-between gap-4 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-2">
        <BrandMark className="h-6 w-6" />
        <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="flex-none font-semibold tracking-normal text-ink">司墨</span>
          <span className="flex-none text-muted" aria-hidden="true">/</span>
          <span className="min-w-0 truncate text-ink-secondary" title={title}>{title}</span>
        </nav>
      </div>

      <div className="flex flex-none flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
        <PermissionMenu {...permissions} />
        <Badge tone={connected ? 'ok' : 'warn'} dot title="WebSocket 连接状态">{CONNECTION_LABEL[connection]}</Badge>
        <span className="text-[13px] text-ink-muted" title="对话回路状态（输入框始终可用）">
          {agentStatus === 'thinking' ? '思考中' : '就绪'}
        </span>
        <div className="hidden flex-none max-[1180px]:flex">
          <Button size="sm" variant="ghost" icon="task" onClick={() => bus.emit(EVENTS.RIGHT_RAIL_OPEN, {})} title="任务与概览（浮层）">任务</Button>
        </div>
        <NotificationCenter />
        <Button size="sm" variant="ghost" icon="settings" className="flex-none" onClick={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'settings' })} title="打开设置">设置</Button>
      </div>
    </header>
  )
}

// app/TopBar.tsx —— M63 单行顶栏：面包屑 + 页面导航 + 权限/连接/搜索/通知/设置/用户
import type { AgentState, ConnectionState } from '../platform/types.ts'
import PermissionMenu from './PermissionMenu.tsx'
import TopTabs from './TopTabs.tsx'
import NotificationCenter from '../features/chat/NotificationCenter.tsx'
import { bus, EVENTS } from '../platform/events.ts'
import type { PermissionsApi } from './usePermissions.ts'
import { Icon } from '../platform/ui/icons.tsx'

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

export default function TopBar({ connection, sessionTitle, permissions }: TopBarProps) {
  const connected = connection === 'open'
  const title = sessionTitle || '主会话'

  return (
    <header className="relative z-10 flex h-[54px] flex-none items-center gap-3.5 border-b border-border bg-surface px-[18px]">
      <div className="flex min-w-0 flex-none items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="flex-none">司墨</span>
        <span className="flex-none text-border" aria-hidden="true">/</span>
        <b className="max-w-[18rem] truncate text-[12px] font-semibold text-ink" title={title}>{title}</b>
      </div>

      <div className="ml-[22px] flex min-w-0 flex-1 items-center">
        <TopTabs />
      </div>

      <div className="flex flex-none items-center gap-2 whitespace-nowrap">
        <PermissionMenu {...permissions} />
        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-muted" title="WebSocket 连接状态">
          <span className={`h-1 w-1 rounded-pill ${connected ? 'bg-ok' : 'bg-warn'}`} aria-hidden="true" />
          <span className="max-[1240px]:hidden">{CONNECTION_LABEL[connection]}</span>
        </span>
        <button
          type="button"
          onClick={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'palette' })}
          aria-label="搜索"
          title="命令面板"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <Icon name="search" size={16} />
        </button>
        <NotificationCenter />
        <button
          type="button"
          onClick={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'settings' })}
          aria-label="设置"
          title="打开设置"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <Icon name="settings" size={16} />
        </button>
        <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-ink text-[10px] font-semibold text-ink-inverse" aria-label="当前用户">
          Y
        </span>
      </div>
    </header>
  )
}

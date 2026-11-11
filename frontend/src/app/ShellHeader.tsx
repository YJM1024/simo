// app/ShellHeader.tsx —— M71 原型壳层顶栏：面包屑 + 六页导航 + 权限/连接/搜索/通知/设置/头像
import { useEffect, useState } from 'react'
import type { AgentState, ConnectionState } from '../platform/types.ts'
import PermissionMenu from './PermissionMenu.tsx'
import NotificationCenter from '../features/chat/NotificationCenter.tsx'
import { bus, EVENTS } from '../platform/events.ts'
import type { PermissionsApi } from './usePermissions.ts'
import { Icon } from '../platform/ui/icons.tsx'
import { Tabs } from '../platform/ui/Tabs.tsx'

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: '连接中',
  open: '已连接',
  reconnecting: '重连中',
  closed: '已断开',
}

type NavId = 'chat' | 'workbench' | 'schedules' | 'agents' | 'team' | 'memory'

const NAV: Array<{ id: NavId; label: string }> = [
  { id: 'chat', label: '对话' },
  { id: 'workbench', label: '工作台' },
  { id: 'schedules', label: '任务' },
  { id: 'agents', label: '智能体' },
  { id: 'team', label: '团队' },
  { id: 'memory', label: '记忆' },
]

const VIEW_OF: Partial<Record<NavId, string>> = {
  workbench: 'workbench',
  schedules: 'schedules',
  agents: 'agents',
  team: 'team',
  memory: 'memory',
}

interface ShellHeaderProps {
  connection: ConnectionState
  agentStatus: AgentState
  runningTasks: number
  totalTasks: number
  sessionTitle: string
  themeLabel: string
  permissions: Pick<PermissionsApi, 'permission' | 'loading' | 'saving' | 'error' | 'needsConfirm' | 'save'>
}

export default function ShellHeader({ connection, sessionTitle, permissions }: ShellHeaderProps) {
  const [active, setActive] = useState<NavId>('chat')
  const connected = connection === 'open'
  const title = sessionTitle || '主会话'

  const activate = (id: NavId): void => {
    bus.emit(EVENTS.NAV_RESET, {})
    setActive(id)
    if (id === 'chat') {
      bus.emit(EVENTS.CHAT_TAB_OPEN, { tab: 'chat' })
      return
    }
    const view = VIEW_OF[id]
    if (view) bus.emit(EVENTS.NAV_OPEN, { view })
  }

  useEffect(() => {
    const offClosed = bus.on(EVENTS.NAV_CLOSED, () => setActive('chat'))
    const offChatTab = bus.on(EVENTS.CHAT_TAB_STATE, () => setActive('chat'))
    const offOpen = bus.on(EVENTS.NAV_OPEN, ({ view }) => {
      const match = NAV.find((tab) => tab.id === view)
      if (match) setActive(match.id)
    })
    const offChatOpen = bus.on(EVENTS.CHAT_TAB_OPEN, () => setActive('chat'))
    return () => {
      offClosed()
      offChatTab()
      offOpen()
      offChatOpen()
    }
  }, [])

  return (
    <header className="relative z-10 flex h-[54px] flex-none items-center gap-3.5 border-b border-border bg-surface px-[18px]">
      <div className="flex min-w-0 flex-none items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="flex-none">司墨</span>
        <span className="flex-none text-border" aria-hidden="true">/</span>
        <b className="max-w-[18rem] truncate text-[12px] font-semibold text-ink" title={title}>{title}</b>
      </div>

      <nav className="ml-[22px] flex min-w-0 flex-1 items-center" aria-label="主导航">
        <Tabs ariaLabel="视图" active={active} onChange={(id) => activate(id as NavId)} items={NAV} size="sm" className="h-8" gapClass="gap-[18px]" />
      </nav>

      <div className="flex flex-none items-center gap-2 whitespace-nowrap">
        <PermissionMenu {...permissions} />
        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-muted" title="WebSocket 连接状态">
          <span className={`h-1 w-1 rounded-pill ${connected ? 'bg-ok' : 'bg-warn'}`} aria-hidden="true" />
          <span className="max-[1240px]:hidden">{CONNECTION_LABEL[connection]}</span>
        </span>
        <button type="button" onClick={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'palette' })} aria-label="搜索" title="命令面板" className="grid h-7 w-7 cursor-pointer place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken hover:text-ink">
          <Icon name="search" size={16} />
        </button>
        <NotificationCenter />
        <button type="button" onClick={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'settings' })} aria-label="设置" title="打开设置" className="grid h-7 w-7 cursor-pointer place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken hover:text-ink">
          <Icon name="settings" size={16} />
        </button>
        <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-ink text-[10px] font-semibold text-ink-inverse" aria-label="当前用户">Y</span>
      </div>
    </header>
  )
}

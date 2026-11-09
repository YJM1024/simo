// app/TopTabs.tsx —— M37/M40 顶部横向选项卡（统一 Tabs 组件）
//
// 对话默认；工作台/任务/智能体/团队/记忆通过总线打开页面；文件/对话同步中栏。
// 视图关闭回对话；底部激活态、键盘左右切换、窄屏横向滚动由 Tabs 组件统一实现。

import { useEffect, useState } from 'react'
import { bus, EVENTS } from '../platform/events.ts'
import { Tabs } from '../platform/ui/Tabs.tsx'

type NavId = 'chat' | 'workbench' | 'schedules' | 'agents' | 'team' | 'memory'

const TABS: Array<{ id: NavId; label: string }> = [
  { id: 'chat', label: '对话' },
  { id: 'workbench', label: '工作台' },
  { id: 'schedules', label: '任务/定时任务' },
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

export default function TopTabs() {
  const [active, setActive] = useState<NavId>('chat')

  const activate = (id: NavId): void => {
    bus.emit(EVENTS.NAV_RESET, {})
    if (id === 'chat') {
      setActive(id)
      bus.emit(EVENTS.CHAT_TAB_OPEN, { tab: 'chat' })
      return
    }
    setActive(id)
    const view = VIEW_OF[id]
    if (view) bus.emit(EVENTS.NAV_OPEN, { view })
  }

  useEffect(() => {
    const offClosed = bus.on(EVENTS.NAV_CLOSED, () => setActive('chat'))
    const offChatTab = bus.on(EVENTS.CHAT_TAB_STATE, () => setActive('chat'))
    const offOpen = bus.on(EVENTS.NAV_OPEN, ({ view }) => {
      const match = TABS.find((tab) => tab.id === view)
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
    <nav aria-label="主导航" className="relative z-10 flex h-full min-w-0 items-center bg-transparent">
      <Tabs ariaLabel="视图" active={active} onChange={(id) => activate(id as NavId)} items={TABS} size="sm" className="h-10" gapClass="gap-5" />
    </nav>
  )
}

// features/agents/AgentEntry.tsx —— M37：智能体页宿主（无左下入口，由顶部 tab 打开）
//
// 顶部「智能体」↑ 发 nav:open，本宿主 portal 打开智能体页；关闭发 nav:closed。

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { bus, EVENTS } from '../../platform/events.ts'
import AgentsPage from './AgentsPage.tsx'

export default function AgentEntry() {
  const [open, setOpen] = useState(false)

  useEffect(() => bus.on(EVENTS.NAV_OPEN, ({ view }: { view: string }) => { if (view === 'agents') setOpen(true) }), [])
  useEffect(() => bus.on(EVENTS.NAV_RESET, () => setOpen(false)), [])

  const close = useCallback(() => {
    setOpen(false)
    bus.emit(EVENTS.NAV_CLOSED, { view: 'agents' })
  }, [])

  if (!open) return null
  return createPortal(<AgentsPage onClose={close} />, document.body)
}

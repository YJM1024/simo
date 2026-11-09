// features/schedules/ScheduleEntry.tsx —— M37：定时任务页宿主（无左下入口，由顶部 tab 打开）
//
// 顶部「任务/定时任务」↑ 发 nav:open，本宿主 portal 打开管理页；关闭发 nav:closed 让顶部 tab 回到对话。
// 入口不再占用左栏；会话树/右栏不受影响。

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId } from '../../platform/router.ts'
import ScheduleManager from './ScheduleManager.tsx'

export default function ScheduleEntry() {
  const [open, setOpen] = useState(false)
  const sessionId = readSessionId() ?? ''

  useEffect(() => bus.on(EVENTS.NAV_OPEN, ({ view }: { view: string }) => { if (view === 'schedules') setOpen(true) }), [])
  useEffect(() => bus.on(EVENTS.NAV_RESET, () => setOpen(false)), [])

  const close = useCallback(() => {
    setOpen(false)
    bus.emit(EVENTS.NAV_CLOSED, { view: 'schedules' })
  }, [])

  if (!open) return null
  return createPortal(
    <ScheduleManager defaultSessionId={sessionId} onClose={close} onChanged={() => undefined} />,
    document.body,
  )
}

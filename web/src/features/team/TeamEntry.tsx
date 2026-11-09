// features/team/TeamEntry.tsx —— M37：团队页宿主（无左下入口，由顶部 tab 打开）

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { bus, EVENTS } from '../../platform/events.ts'
import TeamPage from './TeamPage.tsx'

export default function TeamEntry() {
  const [open, setOpen] = useState(false)

  useEffect(() => bus.on(EVENTS.NAV_OPEN, ({ view }: { view: string }) => { if (view === 'team') setOpen(true) }), [])
  useEffect(() => bus.on(EVENTS.NAV_RESET, () => setOpen(false)), [])

  const close = useCallback(() => {
    setOpen(false)
    bus.emit(EVENTS.NAV_CLOSED, { view: 'team' })
  }, [])

  if (!open) return null
  return createPortal(<TeamPage onClose={close} />, document.body)
}

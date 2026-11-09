// features/memory/MemoryBrowserEntry.tsx —— M37：记忆浏览器宿主（无左下入口，由顶部 tab 打开）

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { bus, EVENTS } from '../../platform/events.ts'
import MemoryBrowserPage from './MemoryBrowserPage.tsx'

export default function MemoryBrowserEntry() {
  const [open, setOpen] = useState(false)

  useEffect(() => bus.on(EVENTS.NAV_OPEN, ({ view }: { view: string }) => { if (view === 'memory') setOpen(true) }), [])
  useEffect(() => bus.on(EVENTS.NAV_RESET, () => setOpen(false)), [])

  const close = useCallback(() => {
    setOpen(false)
    bus.emit(EVENTS.NAV_CLOSED, { view: 'memory' })
  }, [])

  if (!open) return null
  return createPortal(<MemoryBrowserPage onClose={close} />, document.body)
}

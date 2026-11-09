// features/workbench/WorkbenchEntry.tsx —— M37：工作台页宿主（无左下入口，顶部 tab「工作台」打开）
//
// 仍承载命令面板（Ctrl/⌘+K 全局）/用量页/设置页/首启引导；nav:open(workbench) 打开工作台首页。
// 关闭工作台页发 nav:closed，顶部 tab 回到对话。

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { bus, EVENTS } from '../../platform/events.ts'
import { hasSeenFirstRun, markFirstRunSeen } from '../../platform/preferences.ts'
import CommandPalette from './CommandPalette.tsx'
import FirstRunGuide from './FirstRunGuide.tsx'
import SettingsPage from './SettingsPage.tsx'
import UsagePage from './UsagePage.tsx'
import WorkbenchPage from './WorkbenchPage.tsx'
import type { SettingsSectionId } from './settings.ts'

type PageState = { name: 'home' } | { name: 'usage' } | { name: 'settings'; section?: SettingsSectionId } | null

function hasSeenFirstRunLocal(): boolean {
  try {
    return hasSeenFirstRun()
  } catch {
    return true
  }
}

function markFirstRunSeenLocal(): void {
  try {
    markFirstRunSeen()
  } catch {
    // 忽略存储失败
  }
}

export default function WorkbenchEntry() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [page, setPage] = useState<PageState>(null)
  const [guideOpen, setGuideOpen] = useState(() => !hasSeenFirstRunLocal())
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current)
    },
    [],
  )

  // Ctrl/⌘+K 命令面板（全局；输入框内也生效）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(
    () =>
      bus.on(EVENTS.WORKBENCH_OPEN, ({ target }: { target: 'usage' | 'settings' | 'palette' | 'view' }) => {
        if (target === 'usage') openPage('usage')
        else if (target === 'settings') openPage('settings')
        else if (target === 'palette') setPaletteOpen(true)
        else bus.emit(EVENTS.VIEW_OPEN, {})
      }),
    [],
  )
  useEffect(() => bus.on(EVENTS.NAV_RESET, () => setPage(null)), [])

  const closeGuide = useCallback(() => {
    markFirstRunSeenLocal()
    setGuideOpen(false)
  }, [])

  const closePage = useCallback(() => {
    setPage(null)
    bus.emit(EVENTS.NAV_CLOSED, { view: 'workbench' })
  }, [])

  const openPage = useCallback((name: 'usage' | 'settings', section?: SettingsSectionId) => {
    setPage(name === 'settings' ? { name, ...(section ? { section } : {}) } : { name })
  }, [])

  return (
    <>
      {notice && (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-surface-solid px-3 py-1.5 text-sm text-ink-secondary shadow-md">
          {notice}
        </div>
      )}

      {paletteOpen &&
        createPortal(
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            onOpenPage={openPage}
            onNotice={showNotice}
          />,
          document.body,
        )}

      {page?.name === 'home' &&
        createPortal(
          <WorkbenchPage
            onClose={closePage}
            onOpenUsage={() => openPage('usage')}
            onOpenSettings={() => openPage('settings')}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenView={() => bus.emit(EVENTS.VIEW_OPEN, {})}
          />,
          document.body,
        )}

      {page?.name === 'usage' && createPortal(<UsagePage onClose={() => { setPage(null); bus.emit(EVENTS.NAV_CLOSED, { view: 'workbench' }) }} />, document.body)}
      {page?.name === 'settings' &&
        createPortal(<SettingsPage onClose={() => { setPage(null); bus.emit(EVENTS.NAV_CLOSED, { view: 'workbench' }) }} initialSection={page.section} />, document.body)}

      {guideOpen &&
        createPortal(
          <FirstRunGuide
            onClose={closeGuide}
            onOpenSettings={() => {
              closeGuide()
              openPage('settings')
            }}
          />,
          document.body,
        )}
    </>
  )
}

// app/App.tsx —— 壳：顶部导航 + 三栏骨架 + feature 组合（不 import 具体 feature，只走 features/registry.ts）
//
// M2 起壳层还负责「每标签页一条 WebSocket」的生命周期（见 useConnection）。
// M37：顶栏下方横向视图 tab；M38：右栏可收起/展开（细竖条），三栏分隔条可拖拽/双击复位，
//       宽度存 localStorage；窄屏右栏变浮层。

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ComponentType, PointerEvent as ReactPointerEvent } from 'react'
import NotificationHost from './NotificationHost.tsx'
import TopBar from './TopBar.tsx'
import { useConnection } from './useConnection.ts'
import { usePermissions } from './usePermissions.ts'
import { useWorkspaceStatus } from './useWorkspaceStatus.ts'
import { collectSlots, initFeatures } from '../features/registry.ts'
import type { SlotEntry } from '../features/registry.ts'
import type { SlotName } from '../platform/manifest.ts'
import { bus, EVENTS } from '../platform/events.ts'
import * as http from '../platform/http.ts'
import { getInitialTheme, setTheme, themeLabel } from '../platform/theme/theme.ts'

const LEFT_DEFAULT = 264
const LEFT_MIN = 220
const LEFT_MAX = 320
const RIGHT_DEFAULT = 364
const RIGHT_MIN = 300
const RIGHT_MAX = 460
const RIGHT_RAIL = 40
const LEFT_KEY = 'simo.layout.leftWidth'
const RIGHT_KEY = 'simo.layout.rightWidth'

function loadWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const value = Number(window.localStorage.getItem(key))
    if (Number.isFinite(value) && value >= min && value <= max) return value
  } catch {
    // 忽略存储失败
  }
  return fallback
}

function saveWidth(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // 忽略存储失败
  }
}

function Slot({ slot, entries, className = '' }: { slot: SlotName; entries: SlotEntry[]; className?: string }) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className}`} data-slot={slot}>
      {entries.length > 0 ? (
        entries.map(({ featureId, Component }: { featureId: string; Component: ComponentType }) => (
          <Component key={featureId} />
        ))
      ) : (
        <div className="flex h-full items-center justify-center border-border-subtle bg-surface-sunken p-4 text-center text-sm text-muted">
          {slot} 槽位为空
        </div>
      )}
    </div>
  )
}

type DragState = { side: 'left' | 'right'; startX: number; startWidth: number } | null
type MainViewId = 'chat' | 'workbench' | 'schedules' | 'agents' | 'team' | 'memory'

export default function App() {
  const theme = useMemo(() => getInitialTheme(), [])
  const status = useWorkspaceStatus()
  const permissions = usePermissions()
  const slots = useMemo(() => collectSlots(), [])
  useConnection()
  const [leftWidth, setLeftWidth] = useState(() => (typeof window === 'undefined' ? LEFT_DEFAULT : loadWidth(LEFT_KEY, LEFT_DEFAULT, LEFT_MIN, LEFT_MAX)))
  const [rightWidth, setRightWidth] = useState(() => (typeof window === 'undefined' ? RIGHT_DEFAULT : loadWidth(RIGHT_KEY, RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX)))
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [activeView, setActiveView] = useState<MainViewId>('chat')
  const mainViewEntry = useMemo(() => slots.mainView?.find((entry) => entry.featureId === activeView) ?? null, [slots.mainView, activeView])
  const showChat = activeView === 'chat'
  const [drag, setDrag] = useState<DragState>(null)
  const dragRef = useRef<DragState>(null)
  dragRef.current = drag

  useEffect(() => {
    initFeatures({ bus, http, theme: { get: getInitialTheme, set: setTheme } })
  }, [])

  useEffect(() => bus.on(EVENTS.LAYOUT_RIGHT, ({ collapsed }) => setRightCollapsed(collapsed)), [])

  useEffect(() => {
    const offOpen = bus.on(EVENTS.NAV_OPEN, ({ view }) => {
      if (view === 'workbench' || view === 'schedules' || view === 'agents' || view === 'team' || view === 'memory') setActiveView(view)
    })
    const offClosed = bus.on(EVENTS.NAV_CLOSED, () => setActiveView('chat'))
    const offChatOpen = bus.on(EVENTS.CHAT_TAB_OPEN, () => setActiveView('chat'))
    const offChatState = bus.on(EVENTS.CHAT_TAB_STATE, () => setActiveView('chat'))
    return () => {
      offOpen()
      offClosed()
      offChatOpen()
      offChatState()
    }
  }, [])

  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent): void => {
      const current = dragRef.current
      if (!current) return
      if (current.side === 'left') {
        const next = Math.max(LEFT_MIN, Math.min(LEFT_MAX, current.startWidth + event.clientX - current.startX))
        setLeftWidth(next)
        saveWidth(LEFT_KEY, next)
      } else {
        const delta = current.startX - event.clientX
        const next = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, current.startWidth + delta))
        setRightWidth(next)
        saveWidth(RIGHT_KEY, next)
      }
    }
    const onUp = (): void => setDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag])

  const startDrag = (side: 'left' | 'right') => (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDrag({ side, startX: event.clientX, startWidth: side === 'left' ? leftWidth : rightWidth })
  }

  const resetWidth = (side: 'left' | 'right'): void => {
    if (side === 'left') {
      setLeftWidth(LEFT_DEFAULT)
      saveWidth(LEFT_KEY, LEFT_DEFAULT)
    } else {
      setRightWidth(RIGHT_DEFAULT)
      saveWidth(RIGHT_KEY, RIGHT_DEFAULT)
    }
  }

  const nudgeWidth = (side: 'left' | 'right', delta: number): void => {
    if (side === 'left') {
      const next = Math.max(LEFT_MIN, Math.min(LEFT_MAX, leftWidth + delta))
      setLeftWidth(next)
      saveWidth(LEFT_KEY, next)
    } else {
      const next = Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, rightWidth + delta))
      setRightWidth(next)
      saveWidth(RIGHT_KEY, next)
    }
  }

  const layoutStyle = {
    '--layout-left': `${leftWidth}px`,
    '--layout-right': `${rightCollapsed ? RIGHT_RAIL : rightWidth}px`,
  } as CSSProperties

  return (
    <div
      className="relative grid h-full grid-cols-[var(--layout-left)_minmax(0,1fr)] max-[820px]:grid-cols-1"
      style={layoutStyle}
    >
      <a
        href="#composer"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-16 focus:z-40 focus:rounded-md focus:border focus:border-accent focus:bg-surface-solid focus:px-3 focus:py-1.5 focus:text-sm focus:text-ink"
      >
        跳到输入框
      </a>

      <Slot slot="leftTree" entries={slots.leftTree} className="max-[820px]:hidden" />

      <div className="flex min-h-0 min-w-0 flex-col">
        <TopBar
          connection={status.connection}
          agentStatus={status.agentStatus}
          runningTasks={status.runningTasks}
          totalTasks={status.totalTasks}
          sessionTitle={status.sessionTitle}
          themeLabel={themeLabel(theme)}
          permissions={permissions}
        />

        <div className={`relative grid min-h-0 flex-1 ${showChat ? 'grid-cols-[minmax(0,1fr)_var(--layout-right)] max-[1240px]:grid-cols-[minmax(0,1fr)_40px]' : 'grid-cols-1'}`}>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className={`min-h-0 min-w-0 flex-1 flex-col ${showChat ? 'flex' : 'hidden'}`}>
              <Slot slot="center" entries={slots.center} />
            </div>
            {mainViewEntry && (
              <div className={`min-h-0 min-w-0 flex-1 flex-col ${showChat ? 'hidden' : 'flex'}`}>
                <mainViewEntry.Component />
              </div>
            )}
          </div>
          {showChat && <Slot slot="rightPanel" entries={slots.rightPanel} className="max-[1240px]:contents" />}
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左栏宽度（双击复位，←/→ 微调）"
        tabIndex={0}
        onPointerDown={startDrag('left')}
        onDoubleClick={() => resetWidth('left')}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeWidth('left', -16) }
          else if (event.key === 'ArrowRight') { event.preventDefault(); nudgeWidth('left', 16) }
        }}
        className="absolute inset-y-0 z-20 hidden w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-accent-border md:block max-[1240px]:hidden"
        style={{ left: `${leftWidth}px` }}
      />
      {showChat && (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整右栏宽度（双击复位，←/→ 微调）"
        tabIndex={0}
        onPointerDown={startDrag('right')}
        onDoubleClick={() => resetWidth('right')}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeWidth('right', 16) }
          else if (event.key === 'ArrowRight') { event.preventDefault(); nudgeWidth('right', -16) }
        }}
        className="absolute inset-y-0 z-20 hidden w-1.5 translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-accent-border md:block max-[1240px]:hidden"
        style={{ right: `${rightCollapsed ? RIGHT_RAIL : rightWidth}px` }}
      />
      )}

      <NotificationHost />
    </div>
  )
}

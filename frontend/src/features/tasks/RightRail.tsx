// features/tasks/RightRail.tsx —— M38 右栏细竖条 + 任务/概览面板
//
// 默认收起为最右侧细竖条（纵向「任务」「概览」+ 运行中角标/概览更新圆点）。
// 点标签展开对应面板，再点收起；固定后不自动收起；未固定切会话自动收起；Esc 收起。
// 任务面板承载计划/待办摘要 + 任务列表 + 交付物；概览从中间移到只读右栏。
// 收起/展开通过 layout:right 事件让 App 调整栅格宽度；窄屏由 App 将右栏变浮层。

import { useCallback, useEffect, useState } from 'react'
import { bus, EVENTS } from '../../platform/events.ts'
import type { WireFrame } from '../../platform/types.ts'
import { Badge } from '../../platform/ui/Badge.tsx'
import { Icon } from '../../platform/ui/icons.tsx'
import { Tooltip } from '../../platform/ui/Tooltip.tsx'
import OverviewPanel from './OverviewPanel.tsx'
import TaskPanel from './TaskPanel.tsx'

type RailTab = 'tasks' | 'overview'

const PIN_KEY = 'simo.rightRail.pinned'

function readPinned(): boolean {
  try {
    const value = window.localStorage.getItem(PIN_KEY)
    return value === null ? true : value === '1'
  } catch {
    return true
  }
}

function writePinned(value: boolean): void {
  try {
    window.localStorage.setItem(PIN_KEY, value ? '1' : '0')
  } catch {
    // 忽略存储失败
  }
}

export default function RightRail() {
  const [active, setActive] = useState<RailTab | null>(() => (typeof window === 'undefined' || window.innerWidth > 1240 ? 'tasks' : null))
  const [pinned, setPinned] = useState(() => (typeof window === 'undefined' ? false : readPinned()))
  const [running, setRunning] = useState(0)
  const [overviewDot, setOverviewDot] = useState(false)

  const collapsed = active === null

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1240px)')
    const onChange = (): void => setActive((current) => (media.matches ? null : current ?? 'tasks'))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    bus.emit(EVENTS.LAYOUT_RIGHT, { collapsed })
  }, [collapsed])

  useEffect(() => bus.on(EVENTS.TASKS_STATE, ({ running: next }: { running: number }) => setRunning(next)), [])

  // M45：窄屏顶部按钮打开/关闭右栏浮层
  useEffect(
    () =>
      bus.on(EVENTS.RIGHT_RAIL_OPEN, () => {
        setActive((current) => (current === null ? 'tasks' : null))
      }),
    [],
  )

  useEffect(
    () => bus.on(EVENTS.RIGHT_RAIL_TAB, ({ tab }) => setActive(tab)),
    [],
  )

  useEffect(
    () =>
      bus.on(EVENTS.WS_FRAME, ({ frame }: { frame: WireFrame }) => {
        if (!/^(task|workflow|session)\./.test(frame.type)) return
        if (active !== 'overview') setOverviewDot(true)
      }),
    [active],
  )

  useEffect(
    () =>
      bus.on(EVENTS.SESSION_ACTIVE, () => {
        if (!pinned) setActive(null)
      }),
    [pinned],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && active !== null) setActive(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active])

  const toggleTab = useCallback((tab: RailTab): void => {
    setActive((current) => (current === tab ? null : tab))
    if (tab === 'overview') setOverviewDot(false)
  }, [])

  const togglePin = (): void => {
    setPinned((value) => {
      const next = !value
      writePinned(next)
      return next
    })
  }

  return (
    <aside
      className={`flex h-full min-h-0 min-w-0 bg-surface ${
        collapsed
          ? 'w-10 flex-none border-l border-border-subtle'
          : 'w-full flex-row border-l border-border-subtle max-[1240px]:fixed max-[1240px]:right-0 max-[1240px]:top-[96px] max-[1240px]:bottom-0 max-[1240px]:z-30 max-[1240px]:w-[min(90vw,360px)] max-[1240px]:shadow-lg'
      }`}
      aria-label="右侧面板"
    >
      <div className="order-1 flex w-10 flex-none flex-col items-center gap-1 border-r border-border-subtle bg-surface-sunken/30 py-2" role="tablist" aria-orientation="vertical" aria-label="右侧面板标签">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'tasks'}
          aria-controls="right-rail-tasks"
          onClick={() => toggleTab('tasks')}
          title="任务与计划（点击展开/收起）"
          className={`flex w-8 cursor-pointer flex-col items-center gap-1 rounded-sm border border-transparent px-0.5 py-1.5 text-2xs transition-colors duration-fast ${
            active === 'tasks' ? 'bg-accent-soft text-accent' : 'text-ink-faint hover:bg-surface hover:text-ink'
          }`}
        >
          <Icon name="task" size={16} />
          {running > 0 && <Badge tone="warn" count={running} size="sm" className="px-1" />}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'overview'}
          aria-controls="right-rail-overview"
          onClick={() => toggleTab('overview')}
          title="概览（点击展开/收起）"
          className={`relative flex w-8 cursor-pointer flex-col items-center gap-1 rounded-sm border border-transparent px-0.5 py-1.5 text-xs transition-colors duration-fast ${
            active === 'overview' ? 'bg-accent-soft text-accent' : 'text-ink-faint hover:bg-surface hover:text-ink'
          }`}
        >
          <Icon name="overview" size={16} />
          {overviewDot && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-pill bg-accent" aria-label="概览有更新" />}
        </button>
        <Tooltip label={pinned ? '已固定：切会话不自动收起' : '固定：切会话不自动收起'} side="top">
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={pinned ? '取消固定右侧面板' : '固定右侧面板'}
            className={`mt-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-xs border transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              pinned ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-muted hover:border-border hover:text-ink'
            }`}
          >
            <Icon name="pin" size={16} />
          </button>
        </Tooltip>
      </div>

      <div className={`order-2 min-h-0 min-w-0 flex-1 flex-col ${collapsed ? 'hidden' : 'flex'}`}>
        <div id="right-rail-tasks" role="tabpanel" aria-label="任务" className={`min-h-0 min-w-0 flex-1 ${active === 'tasks' ? 'flex flex-col' : 'hidden'}`}>
          <TaskPanel />
        </div>
        <div id="right-rail-overview" role="tabpanel" aria-label="概览" className={`min-h-0 min-w-0 flex-1 ${active === 'overview' ? 'flex flex-col' : 'hidden'}`}>
          <OverviewPanel />
        </div>
      </div>
    </aside>
  )
}

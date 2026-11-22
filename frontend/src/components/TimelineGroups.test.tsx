import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Timeline, TimelineGroups, nearestTickIndex, type TimelineGroupMessage } from '../components'
import type { Message } from '../types'

const messages: TimelineGroupMessage[] = [
  { id: 'b1', sessionId: 'parent', sessionTitle: '上级会话', sessionOrder: 0, isCurrentSession: false, role: 'user', category: 'clarification', at: 1_700_000_000_000, dateKey: '2026-11-01', summary: '上级第一条' },
  { id: 'b2', sessionId: 'parent', sessionTitle: '上级会话', sessionOrder: 0, isCurrentSession: false, role: 'agent', category: 'progress', at: 1_700_000_060_000, dateKey: '2026-11-01', summary: '上级第二条' },
  { id: 'a1', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 1, isCurrentSession: true, role: 'user', at: 1_700_000_120_000, dateKey: '2026-11-01', summary: '当前第一条' },
  { id: 'a2', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 1, isCurrentSession: true, role: 'agent', category: 'progress', at: 1_700_000_180_000, dateKey: '2026-11-01', summary: '当前第二条' },
]

// 真机的主会话是 6px 间距、20×4 刻度；测试也按这个几何来，断言才有意义。
const RAIL_TOP = 100
const SPACING = 6
const TICK_HEIGHT = 4
const center = (index: number): number => RAIL_TOP + index * SPACING + TICK_HEIGHT / 2

const dense: TimelineGroupMessage[] = Array.from({ length: 12 }, (_, index) => ({
  id: `m${index}`,
  sessionId: 'main',
  sessionTitle: '主会话',
  sessionOrder: 1,
  isCurrentSession: true,
  role: index % 2 === 0 ? 'user' : 'agent',
  at: 1_700_000_000_000 + index * 60_000,
  dateKey: '2026-11-01',
  summary: `第 ${index} 条`,
}))

function bars(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.tl-bar'))
}

function readCss(relative: string): string {
  const cwdRelative = resolve(process.cwd(), relative)
  const rootRelative = resolve(process.cwd(), 'frontend', relative)
  return readFileSync(existsSync(cwdRelative) ? cwdRelative : rootRelative, 'utf8')
}

/** jsdom 没有布局：给每根刻度造出真机那种 6px 间距的矩形，最近刻度映射才有可算的距离。 */
function stubBarRects(): void {
  for (const [index, bar] of bars().entries()) {
    const y = RAIL_TOP + index * SPACING
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      x: 12, y, top: y, left: 12, right: 32, width: 20, height: TICK_HEIGHT, bottom: y + TICK_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect)
  }
}

describe('TimelineGroups', () => {
  afterEach(() => vi.useRealTimers())

  it('renders one bar per message, grouped by session and sorted', () => {
    render(<TimelineGroups messages={[...messages].reverse()} currentSessionId="main" activeMessageId="a2" onJump={vi.fn()} />)
    expect(bars()).toHaveLength(4)
    const groups = document.querySelectorAll('.tlg-session')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveClass('is-ancestor-session')
    expect(groups[1]).toHaveClass('is-current-session')
    expect(bars().map((bar) => bar.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('上级会话'),
      expect.stringContaining('上级会话'),
      expect.stringContaining('主会话'),
      expect.stringContaining('主会话'),
    ])
    expect(document.querySelectorAll('.tl-bar.is-current')).toHaveLength(1)
    expect(document.querySelector('.tl-bar.is-current')).toHaveAttribute('aria-current', 'true')
  })

  it('renders no bars for empty input', () => {
    render(<TimelineGroups messages={[]} currentSessionId="main" onJump={vi.fn()} />)
    expect(bars()).toHaveLength(0)
    expect(screen.getByRole('navigation', { name: '消息时间轴' })).toBeInTheDocument()
  })

  it('jumps by activating a bar directly (keyboard and assistive path)', () => {
    const onJump = vi.fn()
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={onJump} />)
    fireEvent.click(bars()[2])
    expect(onJump).toHaveBeenCalledWith('a1')
  })

  it('maps eight pointer offsets inside the rail column to the nearest tick', () => {
    const onJump = vi.fn()
    render(<TimelineGroups messages={dense} currentSessionId="main" onJump={onJump} />)
    stubBarRects()
    const nav = screen.getByRole('navigation', { name: '消息时间轴' })
    // 中心、左右各 16px、上下各 18px、两个斜角、以及相邻刻度正中间。
    const points: Array<[number, number, string]> = [
      [0, 0, 'm5'],
      [16, 0, 'm5'],
      [-16, 0, 'm5'],
      [0, 18, 'm8'],
      [0, -18, 'm2'],
      [16, 18, 'm8'],
      [-16, -18, 'm2'],
      [0, 3, 'm5'],
    ]
    for (const [dx, dy, expected] of points) {
      onJump.mockClear()
      fireEvent.click(nav, { clientX: 22 + dx, clientY: center(5) + dy })
      expect(onJump, `${dx},${dy} 应命中 ${expected}`).toHaveBeenCalledTimes(1)
      expect(onJump, `${dx},${dy} 应命中 ${expected}`).toHaveBeenCalledWith(expected)
    }
  })

  it('resolves a tick midpoint to the upper tick every time and never skips a row', () => {
    const onJump = vi.fn()
    render(<TimelineGroups messages={dense} currentSessionId="main" onJump={onJump} />)
    stubBarRects()
    const nav = screen.getByRole('navigation', { name: '消息时间轴' })
    const midpoint = center(5) + SPACING / 2
    for (let round = 0; round < 5; round += 1) {
      onJump.mockClear()
      fireEvent.click(nav, { clientY: midpoint })
      expect(onJump).toHaveBeenCalledWith('m5')
    }
    // 整列逐像素扫描：归属只允许 0 或 1 的变化，且每个点都命中某一条（没有死区）。
    let previous = nearestTickIndex(bars(), RAIL_TOP - 20)
    for (let y = RAIL_TOP - 20; y <= center(11) + 20; y += 1) {
      const index = nearestTickIndex(bars(), y)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(Math.abs(index - previous)).toBeLessThanOrEqual(1)
      previous = index
    }
  })

  it('clamps out-of-range pointer positions to the first and last tick', () => {
    const onJump = vi.fn()
    render(<TimelineGroups messages={dense} currentSessionId="main" onJump={onJump} />)
    stubBarRects()
    const nav = screen.getByRole('navigation', { name: '消息时间轴' })
    fireEvent.click(nav, { clientY: RAIL_TOP - 500 })
    expect(onJump).toHaveBeenLastCalledWith('m0')
    fireEvent.click(nav, { clientY: center(11) + 500 })
    expect(onJump).toHaveBeenLastCalledWith('m11')
  })

  it('opens the tooltip for the tick mapped by pointermove and closes after the grace period', () => {
    vi.useFakeTimers()
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={vi.fn()} />)
    stubBarRects()
    const nav = screen.getByRole('navigation', { name: '消息时间轴' })
    fireEvent.pointerMove(nav, { pointerType: 'mouse', clientY: center(1) + 1 })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(bars()[1]).toHaveClass('is-hover')
    act(() => { vi.advanceTimersByTime(119) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('上级第二条')
    fireEvent.mouseLeave(nav)
    act(() => { vi.advanceTimersByTime(199) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('supports tooltip on focus, Escape and arrow/Home/End keyboard navigation', async () => {
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: '消息时间轴' })
    fireEvent.focus(bars()[0])
    expect(screen.getByRole('tooltip')).toHaveTextContent('上级第一条')
    act(() => { fireEvent.keyDown(bars()[0], { key: 'Escape' }) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    const press = async (key: string): Promise<void> => {
      await act(async () => {
        fireEvent.keyDown(nav, { key })
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
    await act(async () => { bars()[0].focus(); await new Promise((resolve) => setTimeout(resolve, 20)) })
    await press('ArrowDown')
    expect(document.activeElement).toBe(bars()[1])
    await press('ArrowUp')
    expect(document.activeElement).toBe(bars()[0])
    await press('ArrowRight')
    expect(document.activeElement).toBe(bars()[1])
    await press('End')
    expect(document.activeElement).toBe(bars()[3])
    await press('ArrowLeft')
    expect(document.activeElement).toBe(bars()[2])
    await press('Home')
    expect(document.activeElement).toBe(bars()[0])
  })

  it('jumps with Enter while a tick has keyboard focus', async () => {
    const user = userEvent.setup()
    const onJump = vi.fn()
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={onJump} />)
    await act(async () => { bars()[2].focus() })
    await user.keyboard('{Enter}')
    expect(onJump).toHaveBeenCalledWith('a1')
  })

  it('supports custom aria label and ignores keyboard events outside bars', () => {
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={vi.fn()} ariaLabel="会话线索" />)
    const nav = screen.getByRole('navigation', { name: '会话线索' })
    act(() => { fireEvent.keyDown(nav, { key: 'ArrowRight' }) })
    expect(document.activeElement).toBe(document.body)
  })

  it('maps the plain Timeline rail with the same nearest-tick contract', () => {
    const plain: Message[] = dense.slice(0, 4).map((message) => ({
      id: message.id, sessionId: message.sessionId, role: message.role, text: message.summary ?? '', at: message.at, status: 'done',
    }))
    const onJump = vi.fn()
    render(<Timeline messages={plain} active={0} onJump={onJump} />)
    stubBarRects()
    const rail = document.querySelector<HTMLElement>('.timeline')
    expect(rail).not.toBeNull()
    fireEvent.click(rail as HTMLElement, { clientY: center(2) + 2 })
    expect(onJump).toHaveBeenLastCalledWith(2)
    fireEvent.click(rail as HTMLElement, { clientY: center(3) + 999 })
    expect(onJump).toHaveBeenLastCalledWith(3)
  })

  it('has an ancestor opacity style and a mobile hide rule in the component CSS', () => {
    const css = readCss('src/components/components.css')
    expect(css).toMatch(/\.tlg-session\s*\{[^}]*gap:\s*2px/)
    expect(css).toMatch(/\.tlg-session \+ \.tlg-session\s*\{[^}]*margin-top:\s*6px/)
    expect(css).toMatch(/\.tlg-session\.is-ancestor-session\s*\{[^}]*opacity:\s*\.55/)
    // 窄档隐藏：`(max-width: 56.25em)` 与它的补集 `not all and (min-width: 56.25em)` 等价，
    // 后者把 900px 整点让给显示档，避免与宽档之间留缝；两种写法都接受。
    expect(css).toMatch(/@media (?:\(max-width: 56\.25em\)|not all and \(min-width: 56\.25em\)) \{ \.conversation-panel > \.timeline \{ display: none; \} \}/)
  })

  it('uses one 44px rail column with 20x4 pointer-transparent ticks in the CSS', () => {
    const css = readCss('src/components/components.css')
    const tokens = readCss('src/styles/tokens.css')
    expect(tokens).toMatch(/--gutter-timeline:\s*44px/)
    expect(css).toMatch(/\.timeline\s*\{[^}]*width:\s*var\(--gutter-timeline\)/)
    expect(css).toMatch(/\.tl-bar\s*\{[^}]*width:\s*var\(--size-20\)[^}]*height:\s*var\(--size-4\)/)
    expect(css).toMatch(/\.tl-bar\.is-user\.is-current[^{]*\{[^}]*width:\s*var\(--size-24\)/)
    // 刻度不吃指针事件：兄弟条不会互相遮挡，命中只由轨道的最近刻度映射决定。
    expect(css).toMatch(/\.timeline \.tl-bar\s*\{[^}]*pointer-events:\s*none/)
    // 旧的逐条命中块（48×44 + z-index:-1）必须消失，否则又回到谁在上面谁赢。
    expect(css).not.toMatch(/\.tl-bar::after/)
    // 粗指针下不再用 40px 间距去凑 44×44 热区。
    const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
    expect(coarse).not.toMatch(/\.timeline \.tl-track/)
    expect(coarse).not.toMatch(/\.tlg-session \+ \.tlg-session\s*\{[^}]*margin-top:\s*40px/)
  })
})

describe('nearestTickIndex', () => {
  it('returns -1 when no tick has a layout box', () => {
    expect(nearestTickIndex([], 0)).toBe(-1)
    expect(nearestTickIndex([null, null], 0)).toBe(-1)
  })

  it('maps every tick centre back to its own index', () => {
    render(<TimelineGroups messages={dense} currentSessionId="main" onJump={vi.fn()} />)
    stubBarRects()
    for (let index = 0; index < dense.length; index += 1) {
      expect(nearestTickIndex(bars(), center(index))).toBe(index)
    }
  })
})

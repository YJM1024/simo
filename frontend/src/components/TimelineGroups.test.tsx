import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineGroups, type TimelineGroupMessage } from '../components'

const messages: TimelineGroupMessage[] = [
  { id: 'b1', sessionId: 'parent', sessionTitle: '上级会话', sessionOrder: 0, isCurrentSession: false, role: 'user', category: 'clarification', at: 1_700_000_000_000, dateKey: '2026-11-01', summary: '上级第一条' },
  { id: 'b2', sessionId: 'parent', sessionTitle: '上级会话', sessionOrder: 0, isCurrentSession: false, role: 'agent', category: 'progress', at: 1_700_000_060_000, dateKey: '2026-11-01', summary: '上级第二条' },
  { id: 'a1', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 1, isCurrentSession: true, role: 'user', at: 1_700_000_120_000, dateKey: '2026-11-01', summary: '当前第一条' },
  { id: 'a2', sessionId: 'main', sessionTitle: '主会话', sessionOrder: 1, isCurrentSession: true, role: 'agent', category: 'progress', at: 1_700_000_180_000, dateKey: '2026-11-01', summary: '当前第二条' },
]

function bars(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.tl-bar'))
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

  it('jumps by click with the message id', () => {
    const onJump = vi.fn()
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={onJump} />)
    fireEvent.click(bars()[2])
    expect(onJump).toHaveBeenCalledWith('a1')
  })

  it('opens a tooltip on focus and closes on Escape', () => {
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={vi.fn()} />)
    fireEvent.focus(bars()[0])
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('上级第一条')
    expect(tip).toHaveTextContent('上级会话')
    act(() => { fireEvent.keyDown(bars()[0], { key: 'Escape' }) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens a tooltip after hover delay and keeps it during the close grace period', () => {
    vi.useFakeTimers()
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={vi.fn()} />)
    fireEvent.mouseEnter(bars()[1])
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(119) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('上级第二条')
    fireEvent.mouseLeave(screen.getByRole('navigation'))
    act(() => { vi.advanceTimersByTime(199) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('supports arrow, Home and End keyboard navigation', async () => {
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: '消息时间轴' })
    const press = async (key: string): Promise<void> => {
      await act(async () => {
        fireEvent.keyDown(nav, { key })
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
    await act(async () => { bars()[0].focus(); await new Promise((resolve) => setTimeout(resolve, 20)) })
    await press('ArrowRight')
    expect(document.activeElement).toBe(bars()[1])
    await press('End')
    expect(document.activeElement).toBe(bars()[3])
    await press('ArrowLeft')
    expect(document.activeElement).toBe(bars()[2])
    await press('Home')
    expect(document.activeElement).toBe(bars()[0])
  })

  it('supports custom aria label and ignores keyboard events outside bars', () => {
    render(<TimelineGroups messages={messages} currentSessionId="main" onJump={vi.fn()} ariaLabel="会话线索" />)
    const nav = screen.getByRole('navigation', { name: '会话线索' })
    act(() => { fireEvent.keyDown(nav, { key: 'ArrowRight' }) })
    expect(document.activeElement).toBe(document.body)
  })

  it('has an ancestor opacity style and a mobile hide rule in the component CSS', () => {
    const a = resolve(process.cwd(), 'src/components/components.css')
    const b = resolve(process.cwd(), 'frontend/src/components/components.css')
    const css = readFileSync(existsSync(a) ? a : b, 'utf8')
    expect(css).toMatch(/\.tlg-session\s*\{[^}]*gap:\s*2px/)
    expect(css).toMatch(/\.tlg-session \+ \.tlg-session\s*\{[^}]*margin-top:\s*6px/)
    expect(css).toMatch(/\.tlg-session\.is-ancestor-session\s*\{[^}]*opacity:\s*\.55/)
    expect(css).toMatch(/@media \(max-width: 56\.25em\) \{ \.conversation-panel > \.timeline \{ display: none; \} \}/)
  })
})

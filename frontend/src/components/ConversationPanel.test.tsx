import { describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConversationPanel, EmptyState, ErrorState, TimelineGroups } from '../components'

function timeline(): React.ReactNode {
  return <TimelineGroups messages={[]} currentSessionId="main" onJump={() => {}} />
}

describe('ConversationPanel (PRD-CONV-004 / A2 四态)', () => {
  it('renders the timeline, the scroll container and the messages in ready state', () => {
    const { container } = render(
      <ConversationPanel state="ready" timeline={timeline()}>
        <p>消息内容</p>
      </ConversationPanel>,
    )
    const section = screen.getByRole('region', { name: '当前会话消息' })
    expect(section).toHaveClass('conversation-panel', 'is-ready')
    expect(screen.getByRole('navigation', { name: '消息时间轴' })).toBeInTheDocument()
    const scroller = container.querySelector('.conversation-scroll') as HTMLElement
    expect(scroller).toBeInTheDocument()
    expect(scroller).toHaveTextContent('消息内容')
    expect(section.querySelector('.state-block')).not.toBeInTheDocument()
  })

  it('exposes the scroll container through scrollRef and forwards scroll events', () => {
    const scrollRef = createRef<HTMLDivElement>()
    const onScroll = vi.fn()
    render(
      <ConversationPanel state="ready" timeline={timeline()} scrollRef={scrollRef} onScroll={onScroll}>
        <p>消息内容</p>
      </ConversationPanel>,
    )
    expect(scrollRef.current).toBeInstanceOf(HTMLDivElement)
    expect(scrollRef.current).toHaveClass('conversation-scroll')
    fireEvent.scroll(scrollRef.current as HTMLDivElement)
    expect(onScroll).toHaveBeenCalledTimes(1)
  })

  it('shows the loading state without rendering messages', () => {
    render(
      <ConversationPanel state="loading" timeline={timeline()}>
        <p>不应出现</p>
      </ConversationPanel>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('消息加载中…')
    expect(screen.queryByText('不应出现')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '消息时间轴' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '当前会话消息' })).toHaveClass('is-loading')
  })

  it('shows the default empty state', () => {
    render(<ConversationPanel state="empty" timeline={timeline()}>{null}</ConversationPanel>)
    expect(screen.getByText('暂无消息')).toBeInTheDocument()
    expect(screen.getByText('发送第一条消息开始对话。')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '当前会话消息' })).toHaveClass('is-empty')
  })

  it('renders a caller-provided empty node', () => {
    const { container } = render(
      <ConversationPanel
        state="empty"
        timeline={timeline()}
        empty={<EmptyState title="开始和司墨对话" description="说需求。" action={<button type="button">发送第一条消息</button>} />}
      >
        {null}
      </ConversationPanel>,
    )
    expect(screen.getByText('开始和司墨对话')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送第一条消息' })).toBeInTheDocument()
    expect(container.querySelector('.conversation-state .overview-empty')).toBeInTheDocument()
  })

  it('shows the default error state and calls onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationPanel state="error" timeline={timeline()} onRetry={onRetry}>
        {null}
      </ConversationPanel>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('消息加载失败')
    expect(screen.getByRole('region', { name: '当前会话消息' })).toHaveClass('is-error')
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('prefers the caller-provided error node', () => {
    render(
      <ConversationPanel
        state="error"
        timeline={timeline()}
        error={<ErrorState title="消息加载失败" description="请求失败（500），请稍后重试" />}
      >
        {null}
      </ConversationPanel>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('请求失败（500），请稍后重试')
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })
})

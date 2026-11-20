import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '../components'
import { session } from '../test/fixtures'

function setup(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props = {
    sessions: [
      session({ id: 'main', title: '主会话', children: [session({ id: 'child', parentId: 'main', title: '子会话' })] }),
      session({ id: 'other', title: '另一个会话' }),
      session({ id: 'arch', title: '归档会话', archived: 1 }),
    ],
    activeId: 'main',
    onSelect: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onCreate: vi.fn(),
    onRefresh: vi.fn(),
    connection: 'open',
    usageTotal: 81210,
    quotaPct: 81,
    sessionCount: 3,
    messageCount: 31,
    statsError: '',
    loading: false,
    error: '',
    searchQuery: '',
    onSearch: vi.fn(),
    searching: false,
    searchIds: null,
    onArchive: vi.fn(),
    ...overrides,
  }
  render(<Sidebar {...props} />)
  return props
}

describe('Sidebar', () => {
  it('renders sessions, active state, connection and quota totals', () => {
    setup()
    expect(screen.getByText('主会话')).toBeInTheDocument()
    expect(screen.getByText('子会话')).toBeInTheDocument()
    expect(screen.queryByText('归档会话')).not.toBeInTheDocument()
    expect(screen.getByText('本地环境')).toBeInTheDocument()
    expect(screen.getByText('81.2k')).toBeInTheDocument()
    expect(screen.getByText('3 个会话 · 31 条消息')).toBeInTheDocument()
    expect(document.querySelector('.quota-bar .q81')).toBeInTheDocument()
  })

  it('selects with click and Enter', async () => {
    const user = userEvent.setup()
    const { onSelect } = setup()
    await user.click(screen.getByText('另一个会话'))
    expect(onSelect).toHaveBeenCalledWith('other')
    act(() => { fireEvent.keyDown(screen.getByText('子会话').closest('.session-row') as HTMLElement, { key: 'Enter' }) })
    expect(onSelect).toHaveBeenCalledWith('child')
  })

  it('renames a session by double click and Enter, with Escape cancel', async () => {
    const user = userEvent.setup()
    const { onRename } = setup()
    const row = screen.getByText('另一个会话').closest('.session-row') as HTMLElement
    await act(async () => { fireEvent.doubleClick(row); await Promise.resolve() })
    const input = screen.getByLabelText('重命名会话')
    await user.clear(input)
    await user.type(input, '新标题')
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); await Promise.resolve() })
    expect(onRename).toHaveBeenCalledWith('other', '新标题')

    await act(async () => { fireEvent.doubleClick(screen.getByText('主会话').closest('.session-row') as HTMLElement); await Promise.resolve() })
    const cancelInput = screen.getByLabelText('重命名会话')
    await act(async () => { fireEvent.keyDown(cancelInput, { key: 'Escape' }); await Promise.resolve() })
    expect(screen.queryByLabelText('重命名会话')).not.toBeInTheDocument()
  })

  it('shows and hides archived sessions and can archive/restore', async () => {
    const user = userEvent.setup()
    const { onArchive } = setup()
    await user.click(screen.getByRole('button', { name: '显示归档' }))
    expect(screen.getByText('归档会话')).toBeInTheDocument()
    const otherRow = screen.getByText('另一个会话').closest('.session-row') as HTMLElement
    await user.click(within(otherRow).getByLabelText('会话操作'))
    await user.click(within(otherRow).getByRole('button', { name: '归档' }))
    expect(onArchive).toHaveBeenCalledWith('other', true)
  })

  it('searches, filters by query and shows no-match state', async () => {
    const { onSearch } = setup({ searchQuery: '没有' })
    expect(screen.getByText('没有匹配的会话')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索会话'), { target: { value: '主' } })
    expect(onSearch).toHaveBeenCalledWith('主')
  })

  it('uses server search ids and shows searching state', () => {
    setup({ searchQuery: 'zz', searchIds: new Set(['other']), searching: true })
    expect(screen.getByText('另一个会话')).toBeInTheDocument()
    expect(screen.queryByText('主会话')).not.toBeInTheDocument()
  })

  it('shows empty, loading and error/retry states', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Sidebar {...setupProps({ sessions: [] })} />)
    expect(screen.getByText('暂无会话')).toBeInTheDocument()
    const props = setupProps({ sessions: [], loading: true })
    rerender(<Sidebar {...props} />)
    expect(screen.getByText('会话加载中…')).toBeInTheDocument()
    const { onRefresh } = setupProps({ error: '连接失败' })
    rerender(<Sidebar {...{ ...setupProps({ error: '连接失败' }), onRefresh }} />)
    expect(screen.getByText('会话加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('shows stats failure without inventing a zero', () => {
    setup({ statsError: '统计失败', usageTotal: null, messageCount: null })
    expect(screen.getByText('—', { selector: '.quota-row span:last-child' })).toBeInTheDocument()
    expect(screen.getByText('统计加载失败')).toBeInTheDocument()
  })

  it('triggers create, refresh and archive search interactions', async () => {
    const user = userEvent.setup()
    const { onCreate, onRefresh } = setup()
    const creates = screen.getAllByRole('button', { name: '新建会话' })
    await user.click(creates[0])
    expect(onCreate).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '刷新会话' }))
    expect(onRefresh).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '显示归档' })).toHaveAttribute('aria-pressed', 'false')
  })
})

function setupProps(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}): React.ComponentProps<typeof Sidebar> {
  return {
    sessions: [session({ id: 'main', title: '主会话' })],
    activeId: 'main', onSelect: vi.fn(), onRename: vi.fn().mockResolvedValue(undefined), onCreate: vi.fn(), onRefresh: vi.fn(),
    connection: 'open', usageTotal: 81210, quotaPct: 81, sessionCount: 1, messageCount: 3, statsError: '', loading: false, error: '',
    searchQuery: '', onSearch: vi.fn(), searching: false, searchIds: null, onArchive: vi.fn(), ...overrides,
  }
}

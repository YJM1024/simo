import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    sessionCount: 4,
    archivedCount: 1,
    messageCount: 31,
    statsError: '',
    loading: false,
    error: '',
    searchQuery: '',
    onSearch: vi.fn(),
    searching: false,
    searchError: '',
    onRetrySearch: vi.fn(),
    onArchive: vi.fn(),
    onPin: vi.fn(),
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
    expect(screen.getByText('4 个会话 · 归档 1 · 31 条消息')).toBeInTheDocument()
    expect(document.querySelector('.quota-bar .q81')).toBeInTheDocument()
  })

  it('exposes data-session-id on each row and keeps is-active on the active row (AC-CONV-001-01)', () => {
    setup()
    const activeRow = screen.getByTitle('主会话').closest('.session-row') as HTMLElement
    const childRow = screen.getByTitle('子会话').closest('.session-row') as HTMLElement
    expect(activeRow).toHaveAttribute('data-session-id', 'main')
    expect(activeRow).toHaveClass('is-active')
    expect(childRow).toHaveAttribute('data-session-id', 'child')
    expect(childRow).not.toHaveClass('is-active')
  })

  it('shows each session own message count in its row while the footer keeps the global total', () => {
    const props = setupProps({
      sessions: [
        session({ id: 'main', title: '主会话', messageCount: 75, children: [session({ id: 'child', parentId: 'main', title: '子会话', messageCount: 3 })] }),
        session({ id: 'other', title: '另一个会话', messageCount: 12 }),
      ],
      activeId: 'main',
      sessionCount: 3,
      archivedCount: 0,
      messageCount: 209,
    })
    const { rerender } = render(<Sidebar {...props} />)
    const row = (title: string): HTMLElement => screen.getByTitle(title).closest('.session-row') as HTMLElement
    // 行内 75/3/12 是各会话自身的 messageCount（主会话行不因含子会话而变大），底部 209 是全局统计：两个口径互不冒充。
    expect(within(row('主会话')).getByText('75')).toHaveClass('session-count')
    expect(within(row('子会话')).getByText('3')).toHaveClass('session-count')
    expect(within(row('另一个会话')).getByText('12')).toHaveClass('session-count')
    expect(screen.getByText('3 个会话 · 归档 0 · 209 条消息')).toBeInTheDocument()

    // 切换选中不改变任何一行的数字，底部汇总也不随选中切换变化。
    rerender(<Sidebar {...props} activeId="other" />)
    expect(within(row('主会话')).getByText('75')).toHaveClass('session-count')
    expect(within(row('另一个会话')).getByText('12')).toHaveClass('session-count')
    expect(screen.getByText('3 个会话 · 归档 0 · 209 条消息')).toBeInTheDocument()
  })

  it('omits the row count when the session object carries no messageCount', () => {
    setup({ sessions: [session({ id: 'main', title: '主会话' })] })
    // 旧服务端或本地草稿没有该字段：不显示行数字，也不显示假 0。
    expect(document.querySelector('.session-count')).toBeNull()
  })

  it('renders sessions at any depth, not just one level of children', () => {
    setup({
      sessions: [session({
        id: 'main', title: '主会话', children: [session({
          id: 'l2', parentId: 'main', title: '第二层', children: [session({
            id: 'l3', parentId: 'l2', title: '第三层', children: [session({ id: 'l4', parentId: 'l3', title: '第四层' })],
          })],
        })],
      })],
      sessionCount: 4,
      archivedCount: 0,
    })
    const rows: Array<[string, number]> = [['主会话', 0], ['第二层', 1], ['第三层', 2], ['第四层', 3]]
    for (const [title, depth] of rows) {
      expect(screen.getByText(title).closest('.session-row')).toHaveAttribute('data-depth', String(depth))
    }
    expect(document.querySelectorAll('.session-row')).toHaveLength(4)
  })

  it('collapses and expands a subtree, keeping the parent row clickable', async () => {
    const user = userEvent.setup()
    const { onSelect } = setup({
      sessions: [session({ id: 'main', title: '主会话', children: [session({ id: 'child', parentId: 'main', title: '子会话' })] })],
      sessionCount: 2,
      archivedCount: 0,
    })
    await user.click(screen.getByRole('button', { name: '折叠子会话：主会话' }))
    expect(screen.queryByText('子会话')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开子会话：主会话' })).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: '展开子会话：主会话' }))
    expect(screen.getByText('子会话')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('reports visible rows, total sessions and archived sessions as separate numbers', async () => {
    const user = userEvent.setup()
    setup({
      sessions: [
        session({ id: 'main', title: '主会话', children: [session({ id: 'child', parentId: 'main', title: '子会话', children: [session({ id: 'grand', parentId: 'child', title: '孙会话' })] })] }),
        session({ id: 'other', title: '另一个会话' }),
        session({ id: 'arch', title: '归档会话', archived: 1 }),
      ],
      sessionCount: 5,
      archivedCount: 1,
      messageCount: 7,
    })
    // 可见 = 主会话 + 子会话 + 孙会话 + 另一个会话 = 4；归档 1 默认隐藏。
    expect(screen.getByLabelText('当前可见 4 个会话')).toBeInTheDocument()
    expect(screen.getByText('5 个会话 · 归档 1 · 7 条消息')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '显示归档' }))
    expect(screen.getByLabelText('当前可见 5 个会话')).toBeInTheDocument()
    expect(screen.getByText('归档会话')).toBeInTheDocument()
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

  it('keeps the editor and typed title when rename rejects', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn().mockRejectedValue(new Error('重命名失败'))
    setup({ onRename })
    const row = screen.getByText('另一个会话').closest('.session-row') as HTMLElement
    await act(async () => { fireEvent.doubleClick(row); await Promise.resolve() })
    const input = screen.getByLabelText('重命名会话')
    await user.clear(input)
    await user.type(input, '失败标题')
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); await Promise.resolve() })
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('other', '失败标题'))
    expect(screen.getByLabelText('重命名会话')).toHaveValue('失败标题')
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

  it('shows the searching state while the title search is in flight', () => {
    setup({ searchQuery: 'zz', searching: true })
    expect(screen.getByText('搜索中…')).toBeInTheDocument()
  })

  it('shows a retryable search error instead of the no-match state', async () => {
    const user = userEvent.setup()
    const { onRetrySearch } = setup({ searchQuery: '主', searchError: '请求失败（500），请稍后重试' })
    expect(screen.getByText('搜索失败，请重试')).toBeInTheDocument()
    expect(screen.getByText('请求失败（500），请稍后重试')).toBeInTheDocument()
    expect(screen.queryByText('没有匹配的会话')).not.toBeInTheDocument()
    // 错误态不展示可能过期的结果行（本地过滤本可命中「主会话」）
    expect(screen.queryByText('主会话')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetrySearch).toHaveBeenCalledTimes(1)
  })

  it('renders a persisted unread dot (no number) only for unread sessions', () => {
    setup({
      sessions: [
        session({ id: 'main', title: '主会话', children: [session({ id: 'child', parentId: 'main', title: '子会话', hasUnread: true })] }),
        session({ id: 'other', title: '另一个会话' }),
      ],
    })
    const childRow = screen.getByText('子会话').closest('.session-row') as HTMLElement
    expect(within(childRow).getByLabelText('未读')).toHaveAttribute('data-unread', 'true')
    expect(childRow.querySelector('[data-unread="true"]')?.textContent).toBe('')
    const otherRow = screen.getByText('另一个会话').closest('.session-row') as HTMLElement
    expect(within(otherRow).queryByLabelText('未读')).not.toBeInTheDocument()
  })

  it('never offers archive for the main session and keeps it for others', async () => {
    const user = userEvent.setup()
    const { onArchive } = setup()
    const mainRow = screen.getByText('主会话').closest('.session-row') as HTMLElement
    expect(within(mainRow).queryByRole('button', { name: '会话操作' })).not.toBeInTheDocument()
    const otherRow = screen.getByText('另一个会话').closest('.session-row') as HTMLElement
    await user.click(within(otherRow).getByLabelText('会话操作'))
    await user.click(within(otherRow).getByRole('button', { name: '归档' }))
    expect(onArchive).toHaveBeenCalledWith('other', true)

    await user.click(screen.getByRole('button', { name: '显示归档' }))
    const archivedRow = screen.getByText('归档会话').closest('.session-row') as HTMLElement
    await user.click(within(archivedRow).getByLabelText('会话操作'))
    await user.click(within(archivedRow).getByRole('button', { name: '恢复' }))
    expect(onArchive).toHaveBeenCalledWith('arch', false)
  })

  it('offers pin/unpin in the menu only for non-main, non-draft sessions', async () => {
    const user = userEvent.setup()
    const { onPin } = setup({
      sessions: [
        session({ id: 'main', title: '主会话' }),
        session({ id: 'other', title: '另一个会话' }),
        session({ id: 'pinned', title: '已置顶会话', pinned: true }),
        session({ id: 'draft', title: '草稿会话', draft: true }),
      ],
    })
    const mainRow = screen.getByText('主会话').closest('.session-row') as HTMLElement
    const draftRow = screen.getByText('草稿会话').closest('.session-row') as HTMLElement
    expect(within(mainRow).queryByRole('button', { name: '会话操作' })).not.toBeInTheDocument()
    expect(within(draftRow).queryByRole('button', { name: '会话操作' })).not.toBeInTheDocument()

    const otherRow = screen.getByText('另一个会话').closest('.session-row') as HTMLElement
    await user.click(within(otherRow).getByLabelText('会话操作'))
    await user.click(within(otherRow).getByRole('button', { name: '置顶' }))
    expect(onPin).toHaveBeenCalledWith('other', true)

    const pinnedRow = screen.getByText('已置顶会话').closest('.session-row') as HTMLElement
    await user.click(within(pinnedRow).getByLabelText('会话操作'))
    await user.click(within(pinnedRow).getByRole('button', { name: '取消置顶' }))
    expect(onPin).toHaveBeenCalledWith('pinned', false)
  })

  it('offers no pin action for archived sessions, even when one is pinned', async () => {
    const user = userEvent.setup()
    const { onPin } = setup({
      sessions: [
        session({ id: 'main', title: '主会话' }),
        session({ id: 'other', title: '另一个会话' }),
        session({ id: 'arch', title: '归档会话', archived: 1, pinned: true }),
      ],
    })
    await user.click(screen.getByRole('button', { name: '显示归档' }))
    const archivedRow = screen.getByText('归档会话').closest('.session-row') as HTMLElement
    expect(archivedRow).toHaveClass('is-archived')
    await user.click(within(archivedRow).getByLabelText('会话操作'))

    // AC-CONV-001-04：仅未归档会话可置顶。归档行菜单只剩「恢复」，置顶与取消置顶都不渲染。
    const menu = archivedRow.querySelector('.session-menu') as HTMLElement
    expect(within(menu).queryByRole('button', { name: /置顶/ })).not.toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: '恢复' })).toBeInTheDocument()
    expect(onPin).not.toHaveBeenCalled()
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
    connection: 'open', usageTotal: 81210, quotaPct: 81, sessionCount: 1, archivedCount: 0, messageCount: 3, statsError: '', loading: false, error: '',
    searchQuery: '', onSearch: vi.fn(), searching: false, searchError: '', onRetrySearch: vi.fn(), onArchive: vi.fn(), onPin: vi.fn(), ...overrides,
  }
}

import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageItem } from '../components'
import { card, message } from '../test/fixtures'
import type { TaskView } from '../types'

describe('MessageItem', () => {
  it('renders a user message without a category tag', () => {
    render(<MessageItem message={message({ role: 'user', text: '我的消息' })} onCardAction={vi.fn()} />)
    expect(screen.getByText('我的消息')).toBeInTheDocument()
    expect(screen.queryByText('信息咨询')).not.toBeInTheDocument()
    expect(screen.getByText('你', { selector: '.msg-avatar' })).toBeInTheDocument()
  })

  it('renders an agent message with its category tag', () => {
    render(<MessageItem message={message({ role: 'agent', category: 'clarification', text: '请确认范围' })} onCardAction={vi.fn()} />)
    expect(screen.getByText('司墨', { selector: '.msg-meta b' })).toBeInTheDocument()
    expect(screen.getByText('需求澄清')).toBeInTheDocument()
    expect(screen.getByText('请确认范围')).toBeInTheDocument()
  })

  it.each([
    ['requirement', '需求提出'],
    ['clarification', '需求澄清'],
    ['progress', '进度汇报'],
    ['consultation', '信息咨询'],
    ['delivery', '进度汇报'],
    ['unknown', '信息咨询'],
    [undefined, '信息咨询'],
  ])('maps category %s to %s', (category, label) => {
    render(<MessageItem message={message({ category: category as string | undefined })} onCardAction={vi.fn()} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('copies message text and reports success', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(<MessageItem message={message({ text: 'copy me' })} onCardAction={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '复制消息' }))
    expect(writeText).toHaveBeenCalledWith('copy me')
    expect(await screen.findByRole('button', { name: '复制消息' })).toHaveTextContent('已复制')
  })

  it('falls back to execCommand and reports failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    vi.mocked(document.execCommand).mockReturnValueOnce(false)
    render(<MessageItem message={message({ text: 'copy fail' })} onCardAction={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '复制消息' }))
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(await screen.findByRole('button', { name: '复制消息' })).toHaveTextContent('复制失败')
  })

  it('falls back to execCommand success', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    vi.mocked(document.execCommand).mockReturnValueOnce(true)
    render(<MessageItem message={message({ text: 'copy fallback' })} onCardAction={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '复制消息' }))
    expect(await screen.findByRole('button', { name: '复制消息' })).toHaveTextContent('已复制')
  })

  it('renders fenced code, inline code and long text without truncation', () => {
    const long = '长内容'.repeat(1000)
    render(<MessageItem message={message({ text: `前文 \`inline\`\n\n\`\`\`ts\nconst a = 1\n\`\`\`\n\n${long}` })} onCardAction={vi.fn()} />)
    expect(screen.getByText('inline')).toBeInTheDocument()
    expect(screen.getByText('const a = 1')).toBeInTheDocument()
    expect(screen.getByText(long)).toBeInTheDocument()
  })

  it('renders a GFM table with header, body and per-column alignment', () => {
    const text = ['| 名称 | 状态 | 数量 |', '| :--- | :---: | ---: |', '| 甲 | 完成 | 12 |', '| 乙 | 进行中 | 3 |'].join('\n')
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    const region = screen.getByRole('region', { name: '表格' })
    expect(region).toHaveClass('msg-table-wrap')
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region.querySelector('.msg-table')).toBeInTheDocument()
    expect(region.querySelectorAll('thead tr')).toHaveLength(1)
    expect(region.querySelectorAll('thead th')).toHaveLength(3)
    expect(region.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(region.querySelectorAll('tbody td')).toHaveLength(6)
    expect(screen.getByRole('columnheader', { name: '名称' })).toHaveStyle({ textAlign: 'left' })
    expect(screen.getByRole('columnheader', { name: '状态' })).toHaveStyle({ textAlign: 'center' })
    expect(screen.getByRole('columnheader', { name: '数量' })).toHaveStyle({ textAlign: 'right' })
    expect(screen.getByRole('cell', { name: '12' })).toHaveStyle({ textAlign: 'right' })
    // 表格行不再作为段落整行输出
    expect(region.textContent).not.toContain('| 名称 |')
    expect(document.querySelectorAll('.msg-text p')).toHaveLength(0)
  })

  it('renders inline code inside a table cell', () => {
    const text = ['| 参数 | 说明 |', '| --- | --- |', '| `rps` | 每秒请求数 |'].join('\n')
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(screen.getByRole('cell', { name: 'rps' }).querySelector('code')).toHaveTextContent('rps')
  })

  it('keeps escaped pipes inside a table cell', () => {
    const text = ['| 表达式 | 含义 |', '| --- | --- |', '| a \\| b | 按位或 |'].join('\n')
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(screen.getByRole('cell', { name: 'a | b' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '按位或' })).toBeInTheDocument()
  })

  it('renders prose before a table in the same block as a paragraph', () => {
    const text = ['汇总如下', '| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n')
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(screen.getByRole('region', { name: '表格' })).toBeInTheDocument()
    expect(document.querySelector('.msg-text p')).toHaveTextContent('汇总如下')
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument()
  })

  it.each([
    ['参数形如 a | b，不要当成表格', '参数形如 a | b，不要当成表格'],
    ['| 只有表头 | 没有分隔行 |\n| 甲 | 乙 |', '| 只有表头 | 没有分隔行 |\n| 甲 | 乙 |'],
    ['| 名称 | 状态 |\n| --- |\n| 甲 | 完成 |', '| 名称 | 状态 |\n| --- |\n| 甲 | 完成 |'],
  ])('keeps pipe text that is not a valid table as paragraph text: %s', (text, expected) => {
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(screen.queryByRole('region', { name: '表格' })).not.toBeInTheDocument()
    expect(document.querySelector('.msg-text table')).not.toBeInTheDocument()
    // 原文按现有段落逻辑输出，一个字都不能丢
    expect(document.querySelector('.msg-text p')?.textContent).toBe(expected)
  })

  it('renders streaming caret and failed badge', () => {
    render(<MessageItem message={message({ text: '', status: 'streaming' })} onCardAction={vi.fn()} />)
    expect(document.querySelector('.stream-caret')).toBeInTheDocument()
    render(<MessageItem message={message({ id: 'm2', status: 'failed' })} onCardAction={vi.fn()} />)
    expect(screen.getByText('失败')).toBeInTheDocument()
  })

  it('treats a persisted error reply as failure and offers a retry entry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<MessageItem message={message({ status: 'error', text: '' })} onCardAction={vi.fn()} onRetry={onRetry} />)
    // 后端落库 status:"error" 且 text 为空：必须仍是失败徽标 + 可读说明，不能是空气泡。
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('回复生成失败，未返回内容。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0]).toMatchObject({ status: 'error' })

    // 只读（归档/跨会话）时重试入口不可用：Composer 本身是禁用的。
    rerender(<MessageItem message={message({ status: 'error', text: '' })} onCardAction={vi.fn()} onRetry={onRetry} readOnly />)
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('marks each message card node with data-kind=card and keeps its inner structure (AC-CONV-004-03)', () => {
    render(<MessageItem message={message({ cards: [card()] })} onCardAction={vi.fn()} />)
    const node = document.querySelector('.card-block')
    expect(node).toHaveAttribute('data-kind', 'card')
    expect(node?.querySelector('.card-head')).not.toBeNull()
    expect(node?.querySelector('.card-actions')).not.toBeNull()
  })

  it('submits card values and shows submitted state', async () => {
    const user = userEvent.setup()
    const onCardAction = vi.fn().mockResolvedValue(undefined)
    render(<MessageItem message={message({ cards: [card()] })} onCardAction={onCardAction} />)
    await user.selectOptions(screen.getByLabelText('数据来源'), 'B')
    await user.type(screen.getByLabelText('说明'), '一段说明')
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(onCardAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'submit', { source: 'B', note: '一段说明' })
    await waitFor(() => expect(screen.getByRole('button', { name: '确认' })).toBeEnabled())
  })

  it('keeps text on failed card and allows retry', async () => {
    const user = userEvent.setup()
    const onCardAction = vi.fn().mockRejectedValueOnce(new Error('网络失败')).mockResolvedValueOnce(undefined)
    render(<MessageItem message={message({ cards: [card()] })} onCardAction={onCardAction} />)
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('网络失败')
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(2))
  })

  it('disables active card controls when read-only or archived', () => {
    const { rerender } = render(<MessageItem message={message({ cards: [card()] })} onCardAction={vi.fn()} readOnly />)
    expect(screen.getByLabelText('数据来源')).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled()
    rerender(<MessageItem message={message({ cards: [card({ status: 'submitted' })] })} onCardAction={vi.fn()} />)
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled()
    expect(screen.getByText('submitted · v1')).toBeInTheDocument()
  })

  it('resets card inputs with cancel', async () => {
    const user = userEvent.setup()
    render(<MessageItem message={message({ cards: [card()] })} onCardAction={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('数据来源'), 'A')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByLabelText('数据来源')).toHaveValue('')
  })

  it('renders **bold** as strong', () => {
    render(<MessageItem message={message({ text: '前文 **加粗内容** 后文' })} onCardAction={vi.fn()} />)
    const strong = screen.getByText('加粗内容')
    expect(strong.tagName).toBe('STRONG')
    expect(document.querySelector('.msg-text p')).toHaveTextContent('前文 加粗内容 后文')
  })

  it('renders *italic* and _italic_ as em', () => {
    render(<MessageItem message={message({ text: '前文 *星号斜体* 与 _下划线斜体_ 后文' })} onCardAction={vi.fn()} />)
    expect(screen.getByText('星号斜体').tagName).toBe('EM')
    expect(screen.getByText('下划线斜体').tagName).toBe('EM')
    expect(document.querySelector('.msg-text p')).toHaveTextContent('前文 星号斜体 与 下划线斜体 后文')
  })

  it('renders ~~struck~~ as del', () => {
    render(<MessageItem message={message({ text: '前文 ~~删除内容~~ 后文' })} onCardAction={vi.fn()} />)
    const del = screen.getByText('删除内容')
    expect(del.tagName).toBe('DEL')
    expect(document.querySelector('.msg-text p')).toHaveTextContent('前文 删除内容 后文')
  })

  it('renders allowed links with safe target and rel, and keeps link text plain', () => {
    const text = '[官网](https://example.com/a) [文档](http://example.com/docs) [邮件](mailto:hi@example.com) [**强调**](https://example.com/bold)'
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    for (const [name, href] of [['官网', 'https://example.com/a'], ['文档', 'http://example.com/docs'], ['邮件', 'mailto:hi@example.com'], ['**强调**', 'https://example.com/bold']]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    // 链接文字不二次解析加粗：星号原样保留，链接内没有 strong。
    expect(screen.getByRole('link', { name: '**强调**' }).querySelector('strong')).toBeNull()
  })

  it('parses inline code inside bold without breaking the bold range', () => {
    const text = '**加粗里有 `const a = 1` 代码**'
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    const strong = document.querySelector('.msg-text strong')
    expect(strong).not.toBeNull()
    expect(strong?.querySelector('code')).toHaveTextContent('const a = 1')
    expect(strong).toHaveTextContent('加粗里有 const a = 1 代码')
  })

  it('does not parse markdown inside inline code', () => {
    const text = '行内 `**不是加粗** *不是斜体* ~~不是删除~~` 结束'
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(document.querySelector('.msg-text strong')).toBeNull()
    expect(document.querySelector('.msg-text em')).toBeNull()
    expect(document.querySelector('.msg-text del')).toBeNull()
    expect(document.querySelector('.msg-text code')).toHaveTextContent('**不是加粗** *不是斜体* ~~不是删除~~')
  })

  it('does not turn snake_case underscores into emphasis', () => {
    const text = '变量 snake_case_identifier 与 foo_bar_baz 保持原样'
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(document.querySelector('.msg-text em')).toBeNull()
    expect(document.querySelector('.msg-text p')).toHaveTextContent(text)
  })

  it('does not render javascript: links as anchors', () => {
    const text = '危险链接 [点我](javascript:alert(1)) 不生成锚点'
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(document.querySelector('.msg-text a')).toBeNull()
    // 非法协议按纯文本输出，原文一个字都不丢。
    expect(document.querySelector('.msg-text p')).toHaveTextContent(text)
  })

  it('keeps unclosed markers as literal text', () => {
    const text = '未闭合的 **加粗 与 *单星 _单下划线 以及 ~~删除'
    render(<MessageItem message={message({ text })} onCardAction={vi.fn()} />)
    expect(document.querySelector('.msg-text strong, .msg-text em, .msg-text del')).toBeNull()
    expect(document.querySelector('.msg-text p')).toHaveTextContent(text)
  })
})

// 批量消息同时带首个任务的 taskId 与 batchId、taskCount：判定顺序必须先看 batchId + taskCount>1，
// 否则真实后端消息会永远渲染成单任务卡（AC-CONV-009-02、§17.5）。
describe('MessageItem task messages', () => {
  const taskViews = (count: number): TaskView[] => Array.from({ length: count }, (_, index) => ({
    id: `t-${index}`,
    sessionId: 'main',
    title: `任务 ${index}`,
    mode: 'plan',
    status: 'done',
    displayStatus: 'done',
    createdAt: 1_700_000_100_000,
    updatedAt: 1_700_000_100_000,
  }))

  it('renders one summary card with ten rows for batchId + taskCount=10 even when taskId is present', () => {
    const tasks = taskViews(10)
    render(
      <MessageItem
        message={message({ category: 'task', taskId: 't-0', batchId: 'b-1', taskCount: 10 })}
        onCardAction={vi.fn()}
        taskInfo={{ tasks, total: 10 }}
      />,
    )
    expect(document.querySelectorAll('.msg-task-summary')).toHaveLength(1)
    expect(document.querySelector('.msg-task-card')).toBeNull()
    expect(screen.getByText('已创建 10 个任务')).toBeInTheDocument()
    expect(document.querySelectorAll('.msg-task-summary-item')).toHaveLength(10)
  })

  it('renders ten rows plus 还有 2 条 for taskCount=12 and no second fold', () => {
    const tasks = taskViews(12)
    render(
      <MessageItem
        message={message({ category: 'task', taskId: 't-0', batchId: 'b-2', taskCount: 12 })}
        onCardAction={vi.fn()}
        taskInfo={{ tasks, total: 12 }}
      />,
    )
    const rows = document.querySelectorAll('.msg-task-summary-item')
    expect(rows).toHaveLength(10)
    expect(rows[9]).toHaveTextContent('任务 9')
    expect(screen.getByRole('button', { name: '还有 2 条' })).toBeInTheDocument()
    expect(screen.queryByText('任务 10', { selector: '.msg-task-summary-title' })).not.toBeInTheDocument()
  })

  it('renders a single task card for taskCount=1 with batchId present', () => {
    const tasks = taskViews(1)
    render(
      <MessageItem
        message={message({ category: 'task', taskId: 't-0', batchId: 'b-3', taskCount: 1 })}
        onCardAction={vi.fn()}
        taskInfo={{ task: tasks[0], onOpen: vi.fn() }}
      />,
    )
    expect(document.querySelectorAll('.msg-task-card')).toHaveLength(1)
    expect(document.querySelector('.msg-task-summary')).toBeNull()
  })

  it('keeps the plain message fallback when neither batchId nor taskCount nor taskId exists', () => {
    render(<MessageItem message={message({ category: 'task', text: '任务消息回退' })} onCardAction={vi.fn()} />)
    expect(document.querySelector('.msg-text')).toHaveTextContent('任务消息回退')
    expect(document.querySelector('.msg-task-card')).toBeNull()
    expect(document.querySelector('.msg-task-summary')).toBeNull()
  })

  it('still renders a single task card when batchId is absent', () => {
    render(
      <MessageItem
        message={message({ category: 'task', taskId: 't-0', taskCount: 1 })}
        onCardAction={vi.fn()}
        taskInfo={{ onOpen: vi.fn() }}
      />,
    )
    expect(document.querySelectorAll('.msg-task-card')).toHaveLength(1)
    expect(document.querySelector('.msg-task-summary')).toBeNull()
  })

  it('opens the tasks tab from the whole summary card and a task detail from a row', async () => {
    const user = userEvent.setup()
    const onOpenSummary = vi.fn()
    const onOpenTask = vi.fn()
    const tasks = taskViews(2)
    render(
      <MessageItem
        message={message({ category: 'task', taskId: 't-0', batchId: 'b-4', taskCount: 2 })}
        onCardAction={vi.fn()}
        taskInfo={{ tasks, total: 2, onOpenSummary, onOpenTask }}
      />,
    )
    await user.click(screen.getByRole('button', { name: '查看任务：任务 0' }))
    expect(onOpenTask).toHaveBeenCalledWith(tasks[0])
    expect(onOpenSummary).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '已创建 2 个任务' }))
    expect(onOpenSummary).toHaveBeenCalledTimes(1)
    await user.click(document.querySelector('.msg-task-summary-preview') as HTMLElement)
    expect(onOpenSummary).toHaveBeenCalledTimes(2)
    expect(onOpenTask).toHaveBeenCalledTimes(1)
  })
})


import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageItem } from '../components'
import { card, message } from '../test/fixtures'

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

  it('renders streaming caret and failed badge', () => {
    render(<MessageItem message={message({ text: '', status: 'streaming' })} onCardAction={vi.fn()} />)
    expect(document.querySelector('.stream-caret')).toBeInTheDocument()
    render(<MessageItem message={message({ id: 'm2', status: 'failed' })} onCardAction={vi.fn()} />)
    expect(screen.getByText('失败')).toBeInTheDocument()
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
})


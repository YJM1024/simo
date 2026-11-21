import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer } from '../components'

function setup(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const props = {
    disabled: false,
    streaming: false,
    onSend: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn(),
    sendError: '',
    ...overrides,
  }
  render(<Composer {...props} />)
  return { ...props, input: screen.getByLabelText('消息输入框') as HTMLTextAreaElement }
}

describe('Composer', () => {
  it('renders placeholder, hint, disabled state and send error', () => {
    setup({ disabled: true, sendError: '网络错误' })
    expect(screen.getByPlaceholderText('给司墨发消息…')).toBeDisabled()
    expect(screen.getByText('Enter 发送，Shift+Enter 换行')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('网络错误')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })

  it('sends on Enter and clears the input', async () => {
    const user = userEvent.setup()
    const { onSend } = setup()
    await user.type(screen.getByLabelText('消息输入框'), '你好{Enter}')
    expect(onSend).toHaveBeenCalledWith('你好')
    expect(screen.getByLabelText('消息输入框')).toHaveValue('')
  })

  it('inserts a newline with Shift+Enter and does not send', async () => {
    const user = userEvent.setup()
    const { onSend } = setup()
    await user.type(screen.getByLabelText('消息输入框'), '第一行{Shift>}{Enter}{/Shift}第二行')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByLabelText('消息输入框')).toHaveValue('第一行\n第二行')
  })

  it('does not send while composing an IME input', () => {
    const { onSend, input } = setup()
    fireEvent.change(input, { target: { value: '拼音' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends with Ctrl+Enter or Meta+Enter', async () => {
    const user = userEvent.setup()
    const { onSend } = setup()
    const input = screen.getByLabelText('消息输入框')
    await user.type(input, '快捷发送')
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onSend).toHaveBeenCalledWith('快捷发送')
  })

  it('restores text and shows a readable error when sending fails, then retries', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockRejectedValueOnce(new Error('发送失败')).mockResolvedValueOnce(undefined)
    setup({ onSend })
    const input = screen.getByLabelText('消息输入框')
    await user.type(input, '重试内容{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('发送失败')
    expect(input).toHaveValue('重试内容')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(2))
    expect(input).toHaveValue('')
  })

  it('shows sending state and prevents duplicate submits', async () => {
    const user = userEvent.setup()
    let resolveSend: () => void = () => {}
    const onSend = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveSend = resolve }))
    setup({ onSend })
    await user.type(screen.getByLabelText('消息输入框'), '慢请求{Enter}')
    expect(screen.getByRole('button', { name: '发送中…' })).toBeDisabled()
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('消息输入框'), { key: 'Enter' }) })
    expect(onSend).toHaveBeenCalledTimes(1)
    await act(async () => { resolveSend(); await Promise.resolve() })
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument())
  })

  it('toggles send mode, persists it and changes keyboard behavior', async () => {
    const user = userEvent.setup()
    const { onSend } = setup()
    const toggle = screen.getByRole('button', { name: /切换发送方式/ })
    await user.click(toggle)
    expect(localStorage.getItem('simo.composer.sendMode')).toBe('shift-enter')
    expect(screen.getByText('Enter 换行，Shift+Enter 发送')).toBeInTheDocument()
    const input = screen.getByLabelText('消息输入框')
    await user.type(input, '普通回车')
    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSend).toHaveBeenCalledWith('普通回车')
  })

  it('shows stop while streaming and calls onStop', async () => {
    const user = userEvent.setup()
    const { onStop } = setup({ streaming: true })
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '停止' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('accepts long text without truncation', async () => {
    const user = userEvent.setup()
    const text = '长文本'.repeat(1000)
    const { onSend } = setup()
    await user.click(screen.getByLabelText('消息输入框'))
    await user.paste(text)
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(onSend).toHaveBeenCalledWith(text)
  })

  it('migrates the legacy send-mode localStorage key on mount', () => {
    localStorage.clear()
    localStorage.setItem('simo.composer.send-mode', 'enter-newline')
    setup()
    expect(screen.getByText('Enter 换行，Shift+Enter 发送')).toBeInTheDocument()
    expect(localStorage.getItem('simo.composer.sendMode')).toBe('shift-enter')
    expect(localStorage.getItem('simo.composer.send-mode')).toBeNull()
  })

  it('keeps the toggle aria-pressed and accessible name in sync with the mode', async () => {
    localStorage.clear()
    const user = userEvent.setup()
    setup()
    const toggle = screen.getByRole('button', { name: /切换发送方式/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAccessibleName(/当前 Enter 发送/)
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAccessibleName(/当前 Shift\+Enter 发送/)
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Enter 发送，Shift+Enter 换行')).toBeInTheDocument()
  })

  it('follows send-mode changes published by another tab through the storage event', () => {
    localStorage.clear()
    setup()
    expect(screen.getByText('Enter 发送，Shift+Enter 换行')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'simo.composer.sendMode', newValue: 'shift-enter' }))
    })
    expect(screen.getByText('Enter 换行，Shift+Enter 发送')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'simo.composer.sendMode', newValue: 'enter' }))
    })
    expect(screen.getByText('Enter 发送，Shift+Enter 换行')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'shift-enter' }))
    })
    expect(screen.getByText('Enter 发送，Shift+Enter 换行')).toBeInTheDocument()
  })

  it('never sends from a disabled composer, including Enter and Ctrl+Enter', () => {
    localStorage.clear()
    const { onSend, input } = setup({ disabled: true })
    fireEvent.change(input, { target: { value: '只读会话' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toBeDisabled()
  })

  it('ignores Enter within 50ms after an IME composition ends, then accepts it', async () => {
    localStorage.clear()
    const { onSend, input } = setup()
    fireEvent.change(input, { target: { value: '组合输入' } })
    fireEvent.compositionStart(input)
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('组合输入')
  })
})

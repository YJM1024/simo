import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented, formatDate } from '../components'

describe('library utilities', () => {
  it('renders page tabs, exposes the active one and switches on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Segmented value="chat" onChange={onChange} />)
    expect(screen.getByRole('button', { name: '对话' })).toHaveClass('is-active')
    await user.click(screen.getByRole('button', { name: '工作台' }))
    expect(onChange).toHaveBeenCalledWith('workbench')
  })

  it('formats dates as two-digit month and day', () => {
    expect(formatDate(new Date(2026, 0, 5).getTime())).toBe('01/05')
  })
})

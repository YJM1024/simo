import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBar } from '../components'

describe('StatusBar connection states', () => {
  it.each([
    ['open', '就绪'],
    ['reconnecting', '重连中'],
    ['closed', '连接已关闭'],
    ['connecting', '连接中'],
  ])('renders %s as %s', (connection, label) => {
    render(<StatusBar connection={connection} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

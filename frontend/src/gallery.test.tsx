import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComponentGallery from './gallery'

/**
 * A10：画廊必须登记 ConversationPanel 四态（ready/loading/empty/error）与 A13 基线标注。
 * 这里只验证登记项存在且状态类名正确；像素级基线由 CDP 在真实构建上量取。
 */
describe('组件画廊：会话面板四态与基线标注（A10 / §7）', () => {
  it('registers ready/loading/empty/error and the A13 baseline annotation', () => {
    const { container } = render(<ComponentGallery />)

    const labels = [...container.querySelectorAll('.insp-label')].map((el) => el.textContent ?? '')
    expect(labels).toContain('ConversationPanel')
    expect(labels).toContain('ConversationPanel loading')
    expect(labels).toContain('ConversationPanel empty')
    expect(labels).toContain('ConversationPanel error')
    expect(labels.some((label) => label.includes('基线标注'))).toBe(true)

    const panels = [...container.querySelectorAll('.conversation-panel')].map((el) => el.className)
    expect(panels).toContain('conversation-panel is-ready')
    expect(panels).toContain('conversation-panel is-loading')
    expect(panels).toContain('conversation-panel is-empty')
    expect(panels).toContain('conversation-panel is-error')

    expect(screen.getByText('消息加载中…')).toBeInTheDocument()
    expect(screen.getByText('暂无消息')).toBeInTheDocument()
    expect(screen.getByText('消息加载失败')).toBeInTheDocument()
  })

  it('states the four-width and A13 verdicts in the annotation', () => {
    const { container } = render(<ComponentGallery />)
    const text = [...container.querySelectorAll('.insp-label')]
      .find((el) => (el.textContent ?? '').includes('基线标注'))?.parentElement?.textContent ?? ''
    expect(text).toContain('1600/1920')
    expect(text).toContain('1180')
    expect(text).toContain('375')
    expect(text).toContain('差 0px')
  })
})

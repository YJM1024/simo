import { test, expect } from '@playwright/test'
import { createSession, unique } from '../support/api'
import { openSession, sendViaComposer } from '../support/ui'

interface WsFrame {
  type?: string
  data?: { id?: string; delta?: string }
}

test.describe('E2E-CHAT-001 发送消息与 mock 流式回复', () => {
  test('Enter 发送后收到 reply.delta / reply.done 并渲染 agent 消息', async ({ page }) => {
    const title = unique('E2E 流式会话')
    const text = unique('流式消息')
    const session = await createSession('main', title)

    const frames: WsFrame[] = []
    const consoleErrors: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framereceived', (event) => {
        try {
          frames.push(JSON.parse(String(event.payload)) as WsFrame)
        } catch {
          // 非 JSON 帧忽略
        }
      })
    })
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    await openSession(page, title)
    await sendViaComposer(page, text)

    await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible()
    await expect(page.locator('.msg.from-agent').filter({ hasText: 'Mock 模型' }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.composer-error')).toHaveCount(0)

    // WS 流式协议：至少一个增量帧，并以 reply.done 收尾。
    await expect.poll(() => frames.filter((frame) => frame.type === 'reply.delta').length, { timeout: 20_000 }).toBeGreaterThan(0)
    await expect.poll(() => frames.filter((frame) => frame.type === 'reply.done').length, { timeout: 20_000 }).toBeGreaterThan(0)

    // 本轮消息发送不应产生 console.error / 未捕获异常。
    expect(consoleErrors.filter((line) => !line.includes('favicon'))).toEqual([])
    // 会话 id 只用于让类型/种子明确，实际断言走 UI。
    expect(session.id.length).toBeGreaterThan(0)
  })
})
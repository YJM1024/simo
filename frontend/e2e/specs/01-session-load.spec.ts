import { test, expect } from '@playwright/test'
import { createSession, seedChat, unique } from '../support/api'
import { expectNoHorizontalOverflow, gotoHome, openSession } from '../support/ui'

test.describe('E2E-SHELL-001 / E2E-RESP-001 首屏与响应式', () => {
  test('加载会话后显示消息、时间轴与右栏', async ({ page }) => {
    const title = unique('E2E 加载会话')
    const text = unique('会话加载消息')
    const session = await createSession('main', title)
    await seedChat(session.id, text)

    // 时间轴列在 ≤1500px 自动隐藏；桌面首屏用 1600 宽验证完整三栏结构。
    await page.setViewportSize({ width: 1600, height: 1000 })
    await openSession(page, title)
    await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
    await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible()
    await expect(page.locator('.msg.from-agent').filter({ hasText: 'Mock 模型' }).first()).toBeVisible()
    // 时间轴与右栏都必须渲染（首屏结构，不只是消息列表）。
    await expect(page.locator('.timeline.timeline-groups')).toBeVisible()
    await expect(page.locator('.inspector[aria-label="会话概览"]')).toBeVisible()
  })

  test('375 宽度下消息卡与 Composer 不横向溢出，时间轴隐藏', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoHome(page)
    await expect(page.locator('.composer textarea')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const textareaBox = await page.locator('.composer textarea').boundingBox()
    expect(textareaBox?.width ?? 0).toBeGreaterThan(120)
    // ≤56.25em 时 conversation-panel 内时间轴被 display:none，避免挤压消息区。
    await expect(page.locator('.conversation-panel > .timeline')).toBeHidden()
    await expect(page.locator('.sidebar')).toBeHidden()
  })
})
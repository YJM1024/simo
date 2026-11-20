import { test, expect } from '@playwright/test'
import { createSession, seedChat, unique } from '../support/api'
import { openSession } from '../support/ui'

test.describe('E2E-COMPOSER-001 键盘发送与换行', () => {
  test('Enter 发送、Shift+Enter 换行；反转模式行为互换', async ({ page }) => {
    const title = unique('E2E 键盘会话')
    const session = await createSession('main', title)
    const firstLine = unique('第一行')
    await seedChat(session.id, unique('预热消息'))

    await openSession(page, title)
    const box = page.locator('textarea[aria-label="消息输入框"]')
    await box.click()

    // 默认模式：Shift+Enter 插入换行，Enter 发送。
    await box.fill(firstLine)
    await box.press('Shift+Enter')
    await page.keyboard.type('第二行')
    await expect(box).toHaveValue(new RegExp(`${firstLine}\\n第二行`))

    await box.press('Enter')
    await expect(box).toHaveValue('', { timeout: 15_000 })
    await expect(page.locator('.msg.from-user').filter({ hasText: firstLine })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.composer-error')).toHaveCount(0)

    // 反转模式：Enter 换行，Shift+Enter 发送。
    const modeButton = page.locator('.composer-hint-icon')
    await modeButton.click()
    await expect(modeButton).toHaveAttribute('aria-pressed', 'true')

    const thirdLine = unique('反转模式')
    await box.fill(thirdLine)
    await box.press('Enter')
    await expect(box).toHaveValue(new RegExp(`${thirdLine}\\n`))
    await expect(page.locator('.msg.from-user').filter({ hasText: thirdLine })).toHaveCount(0)

    await box.press('Shift+Enter')
    await expect(box).toHaveValue('', { timeout: 15_000 })
    await expect(page.locator('.msg.from-user').filter({ hasText: thirdLine })).toBeVisible({ timeout: 15_000 })
  })
})
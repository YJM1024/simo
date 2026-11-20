import { test, expect } from '@playwright/test'
import { createSession, seedChat, unique } from '../support/api'
import { gotoHome } from '../support/ui'

test.describe('E2E-ERROR-001 加载失败与重试', () => {
  test('消息接口首次 500 显示错误态，重试后恢复', async ({ page }) => {
    const title = unique('E2E 重试会话')
    const text = unique('重试消息')
    const session = await createSession('main', title)
    await seedChat(session.id, text)

    // 打开会话时前端可能不止发一次消息请求（切换 + effect）；在错误态出现前让目标请求始终失败，
    // 否则后一次请求成功会把错误态清掉，测试变成竞态。
    let failTarget = true
    await page.route(/\/api\/messages\?sessionId=/, async (route) => {
      const url = new URL(route.request().url())
      const isTarget = url.searchParams.get('sessionId') === session.id
      if (isTarget && failTarget) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'boom' }) })
        return
      }
      await route.continue()
    })

    await gotoHome(page)
    const row = page.locator('.session-row', { has: page.locator('.session-title', { hasText: title }) })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    await expect(page.locator('.context-title h1')).toHaveText(title)
    await expect(page.locator('.state-error[role="alert"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.state-error[role="alert"]')).toContainText('消息加载失败')

    failTarget = false
    await page.unroute(/\/api\/messages\?sessionId=/)
    await page.locator('.state-error[role="alert"] button', { hasText: '重试' }).click()
    await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.state-error[role="alert"]')).toHaveCount(0)
  })
})
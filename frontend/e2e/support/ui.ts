import { expect, type Page } from '@playwright/test'

export async function gotoHome(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
  await expect(page.locator('textarea[aria-label="消息输入框"]')).toBeVisible({ timeout: 15_000 })
}

export async function openSession(page: Page, title: string): Promise<void> {
  await gotoHome(page)
  const row = page.locator('.session-row', { has: page.locator('.session-title', { hasText: title }) })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.locator('.context-title h1')).toHaveText(title)
  await expect(page.locator('.conversation-panel')).toBeVisible()
}

export async function openSessionViaWorkbench(page: Page, title: string): Promise<void> {
  await gotoHome(page)
  await page.locator('.nav-chip', { hasText: '工作台' }).click()
  const workbench = page.locator('section[aria-label="工作台"]')
  await expect(workbench).toBeVisible()
  const row = page.locator('.list .row', { hasText: title }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.locator('.context-title h1')).toHaveText(title)
  await expect(page.locator('.conversation-panel')).toBeVisible()
}

export async function sendViaComposer(page: Page, text: string): Promise<void> {
  const box = page.locator('textarea[aria-label="消息输入框"]')
  await box.click()
  await box.fill(text)
  await box.press('Enter')
}

export async function switchToWorkbench(page: Page): Promise<void> {
  await page.locator('.nav-chip', { hasText: '工作台' }).click()
  await expect(page.locator('section[aria-label="工作台"]')).toBeVisible()
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  // body 可能因滚动条略宽 1px；留 1px 容差，超出即视为破版。
  expect(metrics.scrollWidth, `documentElement.scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`).toBeLessThanOrEqual(metrics.clientWidth + 1)
  expect(metrics.bodyScrollWidth, `body.scrollWidth=${metrics.bodyScrollWidth} > innerWidth=${metrics.innerWidth}`).toBeLessThanOrEqual(metrics.innerWidth + 1)
}

/** 消息相对滚动容器顶部的偏移，用于验证祖先加载后的滚动锚定。 */
export async function messageOffsetInScroller(page: Page, messageId: string): Promise<number | null> {
  return page.evaluate((id) => {
    const scroller = document.querySelector<HTMLElement>('.conversation-scroll')
    const node = document.querySelector<HTMLElement>(`.conversation-scroll .msg[data-message-id="${id}"]`)
    if (!scroller || !node) return null
    return node.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  }, messageId)
}

/** 不触发 Playwright 自动滚动，直接派发 click，避免干扰锚定测量。 */
export async function dispatchClick(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().dispatchEvent('click')
}
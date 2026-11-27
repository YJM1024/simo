import { test, expect } from '@playwright/test'
import { createSession, getMessages, seedChat, unique } from '../support/api'
import { dispatchClick, messageOffsetInScroller, openSessionViaWorkbench } from '../support/ui'

interface Chain {
  mainText: string
  parentTitle: string
  childTitle: string
  parentId: string
  childId: string
}

async function seedChain(options: { childMessages: number } ): Promise<Chain> {
  const suffix = unique('E2E 链路')
  const mainText = `${suffix} 根消息`
  const parentTitle = `${suffix} 上级`
  const childTitle = `${suffix} 当前`
  const parent = await createSession('main', parentTitle)
  const child = await createSession(parent.id, childTitle)
  // 先给 main 种子，供“逐级加载到根”与锚定测量使用。
  await seedChat('main', mainText)
  await seedChat(parent.id, `${suffix} 上级消息`)
  for (let index = 0; index < options.childMessages; index += 1) {
    await seedChat(child.id, `${suffix} 当前消息 ${String(index + 1).padStart(2, '0')}`)
  }
  return { mainText, parentTitle, childTitle, parentId: parent.id, childId: child.id }
}

test.describe('E2E-ANCESTOR-001 FE-007 加载上级会话', () => {
  test('逐级加载、时间轴增长、prepend 锚定、切会话清链', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 800 })
    // 子会话必须有足够消息产生真实滚动，否则 scrollTop 会被夹到 0，
    // 测到的是“贴底”状态，加载祖先自然会被 auto-scroll 到底部。
    const chain = await seedChain({ childMessages: 24 })

    await openSessionViaWorkbench(page, chain.childTitle)
    await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
    // 只显示当前会话：一个时间轴组，没有祖先组。
    await expect(page.locator('.tlg-session')).toHaveCount(1)
    await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
    // 多消息时首条可能已在视口外，这里只断言存在，不断言可见。
    await expect(page.locator('.msg.from-user').filter({ hasText: '当前消息 01' })).toHaveCount(1)

    // 等启动时的自动滚底 rAF 结束，再手动设置滚动位置。
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    // 滚动到中部，记录第一条可见消息相对滚动容器的偏移，验证 prepend 锚定。
    const scroller = page.locator('.conversation-scroll')
    await expect.poll(async () => scroller.evaluate((element) => element.scrollHeight - element.clientHeight), {
      message: '子会话消息不足以产生滚动，无法验证 prepend 锚定',
    }).toBeGreaterThan(0)
    await scroller.evaluate((element) => { element.scrollTop = 260 })
    const scrollState = await scroller.evaluate((element) => ({
      top: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }))
    expect(scrollState.scrollHeight, '子会话应可滚动').toBeGreaterThan(scrollState.clientHeight)
    expect(scrollState.top, 'scrollTop=260 应生效（未被夹到 0）').toBeGreaterThan(0)
    const anchor = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('.conversation-scroll')
      if (!box) return null
      const top = box.getBoundingClientRect().top
      const node = [...box.querySelectorAll<HTMLElement>('.msg')].find((item) => item.getBoundingClientRect().bottom > top + 1)
      if (!node?.dataset.messageId) return null
      return { id: node.dataset.messageId, offset: node.getBoundingClientRect().top - top }
    })
    expect(anchor, '滚动后应能定位到可见消息').not.toBeNull()

    // 用派发 click 避免 Playwright 自动滚动干扰锚定。
    await dispatchClick(page, '.message-top button')
    await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('.tlg-session')).toHaveCount(2)
    const opacity = await page.locator('.tlg-session.is-ancestor-session').first().evaluate((element) => Number(getComputedStyle(element).opacity))
    expect(Math.abs(opacity - 0.55)).toBeLessThan(0.06)
    await expect(page.locator('.message-top button')).toHaveAttribute('title', '主会话')

    // prepend 锚定由 App 的 useLayoutEffect + rAF 恢复。固定等两帧会在恢复回调之前测量，
    // 曾偶发读到校正前的 22.7px 偏移；改为轮询到稳定值，判据仍是 1px 内。
    const anchorId = anchor?.id ?? ''
    const anchorOffset = anchor?.offset ?? 0
    await expect
      .poll(
        async () => {
          const offset = await messageOffsetInScroller(page, anchorId)
          return offset === null ? Number.POSITIVE_INFINITY : Math.abs(offset - anchorOffset)
        },
        { timeout: 5_000, message: '加载上级后锚定消息应回到原偏移' },
      )
      .toBeLessThanOrEqual(1)
    const afterOffset = await messageOffsetInScroller(page, anchorId)
    expect(afterOffset, '加载上级后锚定消息仍应存在').not.toBeNull()

    // 再加载一级到根：时间轴组继续增长，按钮消失。
    await dispatchClick(page, '.message-top button')
    await expect(page.locator('.tlg-session')).toHaveCount(3, { timeout: 15_000 })
    await expect(page.locator('.message-top button')).toHaveCount(0)

    // 切换会话必须清空祖先链。
    await page.locator('.session-row', { has: page.locator('.session-title', { hasText: chain.parentTitle }) }).first().click()
    await expect(page.locator('.context-title h1')).toHaveText(chain.parentTitle)
    await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
  })

  test('413 时显示“消息过多，暂不能完整加载”且不插入祖先消息', async ({ page }) => {
    const chain = await seedChain({ childMessages: 1 })
    await page.route(/\/api\/sessions\/[^/]+\/messages\?scope=all/, (route) =>
      route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'messages_too_many' }) }),
    )

    await openSessionViaWorkbench(page, chain.childTitle)
    await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
    await expect(page.locator('.msg').first()).toBeVisible()
    const before = await page.locator('.msg').count()
    await page.locator('.message-top button').click()
    await expect(page.locator('.err-text[role="alert"]')).toHaveText('消息过多，暂不能完整加载', { timeout: 15_000 })
    expect(await page.locator('.msg').count()).toBe(before)
    await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
  })

  test('403 时显示一条中性提示“无权读取该上级会话”', async ({ page }) => {
    const chain = await seedChain({ childMessages: 1 })
    await page.route(/\/api\/sessions\/[^/]+\/messages\?scope=all/, (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'forbidden' }) }),
    )

    await openSessionViaWorkbench(page, chain.childTitle)
    await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
    await expect(page.locator('.msg').first()).toBeVisible()
    await page.locator('.message-top button').click()
    await expect(page.locator('.ancestor-hint[role="status"]')).toHaveText('无权读取该上级会话', { timeout: 15_000 })
    await expect(page.locator('.err-text')).toHaveCount(0)
    await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
  })

  test('空上级静默不提示并允许继续向上', async ({ page }) => {
    const suffix = unique('E2E 空上级')
    // 注意：createSession(null) 在后端等价于 parentId=main，所以“空上级”仍有 main 这一级。
    const parent = await createSession(null, `${suffix} 上级`)
    const childTitle = `${suffix} 当前`
    const child = await createSession(parent.id, childTitle)
    await seedChat(child.id, `${suffix} 当前消息`)

    await openSessionViaWorkbench(page, childTitle)
    await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
    await expect(page.locator('.msg').first()).toBeVisible()
    const before = await page.locator('.msg').count()
    await page.locator('.message-top button').click()
    // 空上级按无上级处理：提示与错误都是 0 条。
    await expect(page.locator('.message-top button')).toHaveAttribute('title', '主会话', { timeout: 15_000 })
    await expect(page.locator('.err-text')).toHaveCount(0)
    await expect(page.locator('.ancestor-hint')).toHaveCount(0)
    expect(await page.locator('.msg').count()).toBe(before)
    await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)

    // 再点一次加载到根，按钮消失、根会话组出现。
    await page.locator('.message-top button').click()
    await expect(page.locator('.message-top button')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(1)
    expect((await getMessages(child.id)).length).toBeGreaterThan(0)
  })
})
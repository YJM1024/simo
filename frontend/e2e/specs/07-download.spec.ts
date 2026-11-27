import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { createSession, seedDeliverable, unique } from '../support/api'
import { gotoHome, openSession, switchToWorkbench } from '../support/ui'

test.describe('E2E-DELIVERABLE-001 交付物下载', () => {
  test('右栏与工作台可见交付物，下载文件名为 mock-write.txt 且内容为 TODO', async ({ page }) => {
    const title = unique('E2E 下载会话')
    const session = await createSession('main', title)
    const deliverable = await seedDeliverable(session.id)
    expect(deliverable.downloadUrl, '交付物应带 downloadUrl').toBeTruthy()

    // 右栏（会话概览）也应展示该交付物。旧断言用的 .deliverable-line 是未挂载的旧组件标记，
    // 当前概览在 data-block="deliverables" 里用 button.exec-row + .exec-title 渲染投影交付物。
    await openSession(page, title)
    const inspectorLine = page.locator('.inspector [data-block="deliverables"] .exec-row', { hasText: 'mock-write.txt' }).first()
    await expect(inspectorLine).toBeVisible({ timeout: 20_000 })
    await expect(inspectorLine.locator('.exec-title')).toHaveText('mock-write.txt')

    await switchToWorkbench(page)
    const line = page.locator('.deliverable-line', { hasText: 'mock-write.txt' }).first()
    await expect(line).toBeVisible({ timeout: 20_000 })

    const downloadPromise = page.waitForEvent('download', { timeout: 20_000 })
    await line.locator('a.download-link').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('mock-write.txt')
    expect(await download.failure()).toBeNull()
    const path = await download.path()
    expect(path, '下载文件应落盘').toBeTruthy()
    expect(readFileSync(path!, 'utf8')).toBe('TODO\n')
  })
})

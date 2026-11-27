import { test, expect } from '@playwright/test'
import { createSession, postChat, waitForProjectionTask, waitForTaskDone, unique } from '../support/api'
import { openSession } from '../support/ui'

test.describe('E2E-OVERVIEW-001 任务定位', () => {
  test('右栏任务点击后定位并高亮对话消息', async ({ page }) => {
    const title = unique('E2E 任务定位')
    const session = await createSession('main', title)
    // 旧用例用单步「帮我整理一份周报」，当前契约里单步请求被判为 C0/C1 直接回答、
    // 不建任务（complexity.go 的 stepCount 判定），所以改用 mock 工作流种子造出真实任务。
    await postChat(session.id, 'mock:workflow-2')

    // 先确认后端确实完成任务、且 projection 已把任务放进右栏数据；避免 UI 里盲目等 60s。
    const task = await waitForTaskDone(session.id, '汇总产出')
    expect(task.status).toBe('done')
    const projection = await waitForProjectionTask(session.id, task.id)
    const projected = [...projection.tasks.done.items, ...projection.tasks.running.items, ...projection.tasks.pending.items].find(
      (item) => item.id === task.id,
    )
    expect(projected?.title).toBe(task.title)

    await openSession(page, title)
    await expect(page.locator('.inspector[aria-label="会话右栏"]')).toBeVisible()
    // 概览任务行自 CHG-CONV-007 起是 button.exec-row[data-task-id]，没有 task-row 类。
    const taskRow = page.locator(`.inspector [data-block="tasks"] .exec-row[data-task-id="${task.id}"]`).first()
    await expect(taskRow).toBeVisible({ timeout: 20_000 })

    await taskRow.click()
    const flash = page.locator('.msg.is-flash').first()
    await expect(flash).toBeVisible({ timeout: 10_000 })
    // 高亮消息应包含任务标题（文本回退命中），或带有任务 id 关联。
    const flashText = await flash.innerText()
    const flashTaskId = await flash.getAttribute('data-task-id')
    expect(flashText.includes(task.title) || flashTaskId === task.id).toBeTruthy()
  })
})

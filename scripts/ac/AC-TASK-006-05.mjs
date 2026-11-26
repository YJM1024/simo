#!/usr/bin/env node
/**
 * AC-TASK-006-05：重试保留已有交付物（产物行与 id 集合都不变）
 * 判据来源：specs/product/P2-TASK/spec.md 的 AC-TASK-006-05
 * 断言点：
 *   1) cancelled 任务带 2 条产物时重试返回 200；
 *   2) 重试前后 task_artifacts 的行数相同；
 *   3) 重试前后产物 id 集合完全相同（不重建、不换 id）。
 */
import { runAc, createSession, api, seedArtifact } from './lib/conv-backend.mjs'
import { seedTask, settle, setTask, artifactsOf } from './lib/task-006.mjs'

await runAc('AC-TASK-006-05', async (ctx) => {
  const sessionId = await createSession('AC-TASK-006-05 重试保留产物')
  const taskId = await seedTask(sessionId, { title: '带产物重试任务' })
  await settle(sessionId)

  seedArtifact(taskId, { name: 'report.md', mime: 'text/markdown', buffer: Buffer.from('# 报告\n') })
  seedArtifact(taskId, { name: 'data.csv', mime: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') })
  // 步数预算收成 0：重试后的那次尝试跑完首步即触顶，不会再写一份新报告，
  // 这样「产物 id 集合不变」只反映重试是否动了已有产物，不掺入新一轮的正常产出。
  setTask(taskId, { status: 'cancelled', progress: 30, attempt: 1, budgetJSON: JSON.stringify({ maxSteps: 0, maxTokens: 12000, usedSteps: 0, usedTokens: 0 }) })
  const before = artifactsOf(taskId)
  const names = before.map((a) => a.name)
  ctx.check(before.length >= 2, '夹具任务至少有 2 条产物', '>=2', String(before.length))
  ctx.check(names.includes('report.md') && names.includes('data.csv'), '两条夹具产物都已入库', 'report.md+data.csv', JSON.stringify(names))

  const res = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/retry?sessionId=${encodeURIComponent(sessionId)}`)
  ctx.eq(res.status, 200, '带产物任务重试返回 200')

  const after = artifactsOf(taskId)
  ctx.eq(after.length, before.length, '重试后产物行数不变')
  const idsBefore = before.map((a) => a.id).sort()
  const idsAfter = after.map((a) => a.id).sort()
  ctx.check(JSON.stringify(idsAfter) === JSON.stringify(idsBefore), '重试后产物 id 集合不变', JSON.stringify(idsBefore), JSON.stringify(idsAfter))

  ctx.raw = { sessionId, taskId, idsBefore, idsAfter }
})

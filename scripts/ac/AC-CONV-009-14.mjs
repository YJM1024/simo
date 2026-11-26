#!/usr/bin/env node
/**
 * AC-CONV-009-14（判据 CT-CONV-534 / TC-P1-CONV-050）
 * chain-3：all 在全部前置 done 后启动 1 次；any 在任一前置 done 后启动 1 次且不取消其余；
 * each 每个前置各触发 1 次（trigger_count=3、attempt 同步加一）。三组分别用独立会话隔离。
 */
import { runAc, createSession, createBatch, detail, waitTaskStatus } from './lib/conv-backend.mjs'

async function batch(sessionId, task, label) {
  const res = await createBatch(sessionId, {
    mode: 'plan', goal: `${label} 依赖触发口径。`, inputs: ['三条前置任务，一条汇聚任务。'],
    constraints: ['前置未完成时下游保持 pending。'],
    tasks: task, clientMutationId: `ac-14-${label}`,
  })
  return res
}

function checkJoin(ctx, res, prefix) {
  return { status: res.status, body: res.json, prefix }
}

await runAc('AC-CONV-009-14', async (ctx) => {
  // all
  const sAll = await createSession('AC-CONV-009-14 all')
  const all = await batch(sAll, [
    { key: 'a1', title: 'all 前置一', mode: 'plan', goal: '前置一。' },
    { key: 'a2', title: 'all 前置二', mode: 'plan', goal: '前置二。' },
    { key: 'd', title: 'all 汇聚', mode: 'plan', goal: '汇聚。', dependsOn: ['a1', 'a2'], joinMode: 'all' },
  ], 'all')
  ctx.eq(all.status, 201, 'all 批次创建 201')
  const allD = all.json.tasks.find((t) => t.title === 'all 汇聚')
  const allDone = await waitTaskStatus(sAll, allD.id, 'done', 40000)
  ctx.eq(allDone.task.triggerCount, 1, 'all 汇聚触发 1 次')
  ctx.eq(allDone.task.attempt, 1, 'all 汇聚 attempt=1（不重置）')
  const allDeps = await Promise.all(all.json.tasks.filter((t) => t.title !== 'all 汇聚').map((t) => detail(sAll, t.id)))
  ctx.check(allDeps.every((r) => r.json.task.status === 'done'), 'all 两条前置都已 done', 'done', allDeps.map((r) => r.json.task.status).join(','))

  // any
  const sAny = await createSession('AC-CONV-009-14 any')
  const any = await batch(sAny, [
    { key: 'b1', title: 'any 前置一', mode: 'plan', goal: '前置一。' },
    { key: 'b2', title: 'any 前置二', mode: 'plan', goal: '前置二。' },
    { key: 'd', title: 'any 汇聚', mode: 'plan', goal: '汇聚。', dependsOn: ['b1', 'b2'], joinMode: 'any' },
  ], 'any')
  ctx.eq(any.status, 201, 'any 批次创建 201')
  const anyD = any.json.tasks.find((t) => t.title === 'any 汇聚')
  const anyDone = await waitTaskStatus(sAny, anyD.id, 'done', 40000)
  ctx.eq(anyDone.task.triggerCount, 1, 'any 汇聚触发 1 次')
  ctx.eq(anyDone.task.attempt, 1, 'any 汇聚 attempt=1（其余前置完成不再触发）')

  // each
  const sEach = await createSession('AC-CONV-009-14 each')
  const each = await batch(sEach, [
    { key: 'c1', title: 'each 前置一', mode: 'plan', goal: '前置一。' },
    { key: 'c2', title: 'each 前置二', mode: 'plan', goal: '前置二。' },
    { key: 'c3', title: 'each 前置三', mode: 'plan', goal: '前置三。' },
    { key: 'd', title: 'each 汇聚', mode: 'plan', goal: '汇聚。', dependsOn: ['c1', 'c2', 'c3'], joinMode: 'each' },
  ], 'each')
  ctx.eq(each.status, 201, 'each 批次创建 201')
  const eachD = each.json.tasks.find((t) => t.title === 'each 汇聚')
  const eachDone = await waitTaskStatus(sEach, eachD.id, 'done', 60000)
  ctx.eq(eachDone.task.triggerCount, 3, 'each 汇聚触发 3 次（每个前置各一次）')
  ctx.eq(eachDone.task.attempt, 4, 'each 汇聚 attempt 与触发同步加一（初始 1 + 3）')
  const doneDeps = await Promise.all(each.json.tasks.filter((t) => t.title !== 'each 汇聚').map((t) => detail(sEach, t.id)))
  ctx.check(doneDeps.every((r) => r.json.task.status === 'done'), 'each 三条前置都已 done', 'done', doneDeps.map((r) => r.json.task.status).join(','))

  // 负例
  const selfDep = await createBatch(sEach, {
    mode: 'plan', tasks: [{ key: 's', title: '自依赖任务', mode: 'plan', dependsOn: ['s'], joinMode: 'all' }],
  })
  ctx.eq(selfDep.status, 400, '自依赖返回 400')
  ctx.eq(selfDep.json && selfDep.json.code, 'invalid_task_dependency', '自依赖失败码 invalid_task_dependency')
  const unknownDep = await createBatch(sEach, {
    mode: 'plan', tasks: [{ key: 'u', title: '依赖不存在任务', mode: 'plan', dependsOn: ['nope'], joinMode: 'all' }],
  })
  ctx.eq(unknownDep.status, 400, '依赖不在本批返回 400')
  ctx.eq(unknownDep.json && unknownDep.json.code, 'invalid_task_dependency', '依赖不在本批失败码 invalid_task_dependency')

  const cyclic = await createBatch(sEach, {
    mode: 'plan', tasks: [
      { key: 'p', title: '环 p', mode: 'plan', dependsOn: ['q'] },
      { key: 'q', title: '环 q', mode: 'plan', dependsOn: ['p'] },
    ],
  })
  ctx.eq(cyclic.status, 400, '环依赖返回 400')
  ctx.eq(cyclic.json && cyclic.json.code, 'invalid_task_dependency', '环依赖失败码 invalid_task_dependency')

  ctx.raw = {
    all: { sessionId: sAll, triggerCount: allDone.task.triggerCount, attempt: allDone.task.attempt },
    any: { sessionId: sAny, triggerCount: anyDone.task.triggerCount, attempt: anyDone.task.attempt },
    each: { sessionId: sEach, triggerCount: eachDone.task.triggerCount, attempt: eachDone.task.attempt },
  }
})

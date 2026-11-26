#!/usr/bin/env node
/**
 * AC-CHG-CONV-007-03（判据 CT-CONV-541 / TC-P1-CONV-057）
 * 覆盖四条判据：
 * 1. 取消上游 A 后 30 秒内下游 B 启动 0 次且保持未开始（逐秒采样 status/startedAt/triggerCount）。
 * 2. 取消确认 1 条（本批 category=task 消息 1 条）；图上 B 未开始，A→B 连线仍在且为虚线。
 * 3. 整链取消时未启动下游保持未开始；已启动下游被中断，不出现半完成状态。
 * 4. 取消只作用于目标链，同会话其它任务与另一条链不受影响。
 *
 * 判据口径（contract.md:350 CT-CONV-535 的传播段与 :363；backend spec :889、:895、:922-924）：
 * running→cancelled 时未完成步骤回 pending、已完成步骤保留，取消不产生 failed 步骤
 * （failed 只用于确认拒绝分支，:1036）；chain 只中断已启动下游：状态 interrupted、
 * 运行中步骤回 pending、attempt 不增、写 1 条 interrupt 轨迹，且不进入 cancelled[]。
 *
 * 「已启动下游」窗口说明：同一批次 all-join 只在上游终态后放行，标准 mock 时序构造不出
 * 「上游仍运行时下游已启动」；链二用隔离库夹具（execDb）把下游置 running，再走 HTTP
 * cancel?scope=chain 验证接口层的中断分支。夹具只改状态字段，不绕过被验证的判定代码。
 */
import { runAc, createSession, createBatch, detail, graph, api, waitFor, sleep, queryRows, execDb } from './lib/conv-backend.mjs'

await runAc('AC-CHG-CONV-007-03', async (ctx) => {
  const sessionId = await createSession('AC-CHG-CONV-007-03 取消链')
  const chain = await createBatch(sessionId, {
    mode: 'plan', goal: '取消上游不启动下游，只作用目标链。',
    tasks: [
      { key: 'a', title: '链一：上游 A', mode: 'plan', goal: '上游。' },
      { key: 'b', title: '链一：下游 B', mode: 'plan', goal: '下游。', dependsOn: ['a'], joinMode: 'all' },
      { key: 'x', title: '无关任务 X', mode: 'plan', goal: '不受影响。' },
    ],
    clientMutationId: 'ac-chg-03-chain1',
  })
  ctx.eq(chain.status, 201, '链一批次创建 201')
  const a = chain.json.tasks.find((t) => t.title === '链一：上游 A')
  const b = chain.json.tasks.find((t) => t.title === '链一：下游 B')
  const x = chain.json.tasks.find((t) => t.title === '无关任务 X')

  await waitFor(async () => {
    const res = await detail(sessionId, a.id)
    return res.json && res.json.task && res.json.task.status === 'running' ? res : null
  }, { timeoutMs: 20000, label: '上游 A running' })
  // 等至少 1 个步骤完成后再取消，让「已完成步骤保留」不是空断言。
  const aStepDone = await waitFor(async () => {
    const res = await detail(sessionId, a.id)
    const steps = (res.json && res.json.steps) || []
    return steps.some((s) => s.status === 'done') ? res : null
  }, { timeoutMs: 10000, label: '上游 A 完成第 1 步' })
  const aStepsBefore = aStepDone.json.steps || []
  ctx.check(aStepsBefore.some((s) => s.status === 'done'), '取消前上游已有已完成步骤（用于验证保留）', '>=1 done', JSON.stringify(aStepsBefore.map((s) => s.status)))

  const bad = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${a.id}/cancel?scope=bogus`, {})
  ctx.eq(bad.status, 400, 'scope=bogus → 400')
  ctx.eq(bad.json && bad.json.code, 'invalid_argument', '失败码 invalid_argument')

  const cross = await api('POST', '/api/sessions/sess-not-exist/tasks/' + a.id + '/cancel?scope=chain', {})
  ctx.eq(cross.status, 404, '跨会话取消 → 404')
  ctx.eq(cross.json && cross.json.code, 'task_not_found', '跨会话失败码 task_not_found')

  const cancel = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${a.id}/cancel?scope=chain`, {})
  ctx.eq(cancel.status, 200, '整链取消上游 200')
  ctx.eq(cancel.json.task.status, 'cancelled', '上游 A 状态 cancelled')
  ctx.check((cancel.json.cancelled || []).includes(a.id), 'cancelled 列表含上游', '含 A', JSON.stringify(cancel.json.cancelled))

  // 判据 1：30 秒窗口逐秒采样，确认下游 B 从未启动。
  const started = []
  for (let i = 0; i < 30; i += 1) {
    const res = await detail(sessionId, b.id)
    const task = res.json && res.json.task
    if (!task || task.status !== 'pending' || task.startedAt || task.triggerCount) {
      started.push(`${i}s:${task && task.status}:${task && task.startedAt}:${task && task.triggerCount}`)
    }
    await sleep(1000)
  }
  ctx.eq(started.length, 0, '30 秒窗口内下游启动 0 次')
  const bAfter = await detail(sessionId, b.id)
  ctx.eq(bAfter.json.task.status, 'pending', '下游 B 30 秒后仍 pending 未开始')
  ctx.check(!bAfter.json.task.startedAt, '下游 B startedAt 为空', '空', String(bAfter.json.task.startedAt || ''))
  ctx.check(!bAfter.json.task.triggerCount, '下游 B triggerCount 为 0', '0', String(bAfter.json.task.triggerCount || 0))
  ctx.eq(bAfter.json.task.waitingReason, 'dependency', '下游 B waitingReason=dependency')

  // 判据 3 的目标侧：取消后无半完成状态。契约规定未完成步骤回 pending、已完成步骤保留、不产生 failed。
  const aAfter = await detail(sessionId, a.id)
  ctx.eq(aAfter.json.task.status, 'cancelled', '取消确认后上游仍 cancelled')
  const aStepsAfter = aAfter.json.steps || []
  ctx.eq(aStepsAfter.length, aStepsBefore.length, '上游步骤数保留')
  ctx.check(aStepsAfter.every((s) => s.status !== 'running'), '取消后无 running 步骤（无半完成）', '无 running', JSON.stringify(aStepsAfter.map((s) => s.status)))
  ctx.check(aStepsAfter.every((s) => s.status === 'pending' || s.status === 'done'), '未完成步骤回 pending、已完成保留', 'pending|done', JSON.stringify(aStepsAfter.map((s) => s.status)))
  ctx.check(aStepsAfter.every((s) => s.status !== 'failed'), '取消不产生 failed 步骤', '无 failed', JSON.stringify(aStepsAfter.map((s) => s.status)))
  const doneBefore = aStepsBefore.filter((s) => s.status === 'done').map((s) => s.seq)
  ctx.check(doneBefore.every((seq) => (aStepsAfter.find((s) => s.seq === seq) || {}).status === 'done'), '取消前已完成的步骤保留 done', JSON.stringify(doneBefore), JSON.stringify(aStepsAfter.map((s) => `${s.seq}:${s.status}`)))

  // 判据 2：图上 B 未开始、连线仍在且为虚线。
  const g = await graph(sessionId)
  const nodeB = (g.json.nodes || []).find((n) => n.id === b.id)
  const edge = (g.json.edges || []).find((e) => e.from === a.id && e.to === b.id)
  ctx.check(Boolean(nodeB), '图上存在节点 B', '存在', String(Boolean(nodeB)))
  ctx.eq(nodeB && nodeB.status, 'pending', '图上 B 未开始（pending）')
  ctx.check(Boolean(edge), '图上 A→B 连线仍在', '存在', String(Boolean(edge)))
  ctx.eq(edge && edge.style, 'dashed', '前置已取消，连线虚线')

  // 判据 4：无关任务 X 不受目标链取消影响（跑完、未被取消）。
  const xAfter = await detail(sessionId, x.id)
  ctx.check(xAfter.json.task.status !== 'cancelled', '无关任务 X 未被连带取消', '非 cancelled', xAfter.json.task.status)
  ctx.eq(xAfter.json.task.status, 'done', '无关任务 X 正常跑完')

  const msgCount = queryRows("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND category = 'task'", [sessionId])[0].n
  ctx.eq(msgCount, 1, '确认条不受取消影响（链一批次 1 条 task 消息）')

  // ---- 链二：已启动下游被中断（夹具构造运行态，判定仍走 HTTP cancel） ----
  const chain2 = await createBatch(sessionId, {
    mode: 'plan', goal: '整链取消中断已启动下游，未启动下游保持 pending。',
    tasks: [
      { key: 'a2', title: '链二：上游 A2', mode: 'plan', goal: '上游。' },
      { key: 'b2', title: '链二：下游 B2', mode: 'plan', goal: '下游（夹具置运行）。', dependsOn: ['a2'], joinMode: 'all' },
      { key: 'c2', title: '链二：下游 C2', mode: 'plan', goal: '未启动下游。', dependsOn: ['b2'], joinMode: 'all' },
    ],
    clientMutationId: 'ac-chg-03-chain2',
  })
  ctx.eq(chain2.status, 201, '链二批次创建 201')
  const a2 = chain2.json.tasks.find((t) => t.title === '链二：上游 A2')
  const b2 = chain2.json.tasks.find((t) => t.title === '链二：下游 B2')
  const c2 = chain2.json.tasks.find((t) => t.title === '链二：下游 C2')

  await waitFor(async () => {
    const res = await detail(sessionId, a2.id)
    return res.json && res.json.task && res.json.task.status === 'running' ? res : null
  }, { timeoutMs: 20000, label: '链二上游 A2 running' })

  const b2Before = await detail(sessionId, b2.id)
  ctx.eq(b2Before.json.task.status, 'pending', '链二下游 B2 取消前仍 pending（依赖等待）')
  const attemptBefore = b2Before.json.task.attempt
  const b2StepsBefore = b2Before.json.steps || []
  ctx.check(b2StepsBefore.length >= 1, '链二下游 B2 有计划步骤', '>=1', String(b2StepsBefore.length))

  // 夹具：把 B2 置 running 且第 1 步 running，模拟「上游仍在跑、下游已启动」的时序。
  const now = Date.now()
  execDb("UPDATE tasks SET status = 'running', started_at = ?, waiting_reason = '', waiting_since = 0, trigger_count = 1 WHERE id = ?", [now, b2.id])
  execDb('UPDATE task_steps SET status = \'running\', started_at = ? WHERE task_id = ? AND seq = ?', [now, b2.id, b2StepsBefore[0].seq])
  const b2Fixture = await detail(sessionId, b2.id)
  ctx.eq(b2Fixture.json.task.status, 'running', '夹具：B2 置为 running')
  ctx.eq((b2Fixture.json.steps || []).filter((s) => s.status === 'running').length, 1, '夹具：B2 有 1 个 running 步骤')

  const cancel2 = await api('POST', `/api/sessions/${encodeURIComponent(sessionId)}/tasks/${a2.id}/cancel?scope=chain`, {})
  ctx.eq(cancel2.status, 200, '链二整链取消 200')
  ctx.eq(cancel2.json.changed, true, '链二取消 changed=true')
  ctx.eq(cancel2.json.task.status, 'cancelled', '链二上游 A2 状态 cancelled')
  ctx.check((cancel2.json.cancelled || []).includes(a2.id), '链二 cancelled 含上游 A2', '含 A2', JSON.stringify(cancel2.json.cancelled))
  ctx.check(!(cancel2.json.cancelled || []).includes(b2.id), '已启动下游 B2 不计入 cancelled[]（走中断）', '不含 B2', JSON.stringify(cancel2.json.cancelled))

  const b2After = await detail(sessionId, b2.id)
  ctx.eq(b2After.json.task.status, 'interrupted', '已启动下游 B2 被中断（interrupted）')
  ctx.check(b2After.json.task.status !== 'cancelled', '已启动下游不随上游转 cancelled', '非 cancelled', b2After.json.task.status)
  ctx.eq(b2After.json.task.attempt, attemptBefore, '中断不改 attempt')
  const b2StepsAfter = b2After.json.steps || []
  ctx.check(b2StepsAfter.every((s) => s.status !== 'running'), '中断后无 running 步骤（无半完成）', '无 running', JSON.stringify(b2StepsAfter.map((s) => s.status)))
  const forcedStep = b2StepsAfter.find((s) => s.seq === b2StepsBefore[0].seq)
  ctx.eq(forcedStep && forcedStep.status, 'pending', '运行中步骤回 pending')
  ctx.check(!(forcedStep && forcedStep.startedAt), '回 pending 的步骤 startedAt 清零', '空', String((forcedStep && forcedStep.startedAt) || ''))
  const interrupts = queryRows("SELECT COUNT(*) AS n FROM task_traces WHERE task_id = ? AND category = 'interrupt'", [b2.id])[0].n
  ctx.eq(interrupts, 1, '写 1 条中断轨迹')

  const c2After = await detail(sessionId, c2.id)
  ctx.eq(c2After.json.task.status, 'pending', '未启动下游 C2 仍 pending')
  ctx.eq(c2After.json.task.waitingReason, 'dependency', 'C2 waitingReason=dependency')
  ctx.check(!c2After.json.task.startedAt, 'C2 startedAt 为空', '空', String(c2After.json.task.startedAt || ''))
  ctx.check(!c2After.json.task.triggerCount, 'C2 triggerCount 为 0', '0', String(c2After.json.task.triggerCount || 0))

  const g2 = await graph(sessionId)
  const nodeB2 = (g2.json.nodes || []).find((n) => n.id === b2.id)
  const edge2 = (g2.json.edges || []).find((e) => e.from === a2.id && e.to === b2.id)
  ctx.eq(nodeB2 && nodeB2.status, 'interrupted', '图上 B2 为 interrupted')
  ctx.check(Boolean(edge2), '链二 A2→B2 连线仍在', '存在', String(Boolean(edge2)))
  ctx.eq(edge2 && edge2.style, 'dashed', '链二前置已取消，连线虚线')

  const bStill = await detail(sessionId, b.id)
  ctx.eq(bStill.json.task.status, 'pending', '链二取消不影响链一的下游 B')

  ctx.raw = {
    sessionId, aId: a.id, bId: b.id, a2Id: a2.id, b2Id: b2.id, c2Id: c2.id,
    cancelled1: cancel.json.cancelled, cancelled2: cancel2.json.cancelled,
    observationWindowSeconds: 30, startedObservations: started,
    aStepsBefore: aStepsBefore.map((s) => s.status), aStepsAfter: aStepsAfter.map((s) => s.status),
    b2StepsAfter: b2StepsAfter.map((s) => s.status), attemptBefore,
    note: '链二用 execDb 把 B2 置 running 构造「已启动下游」窗口，取消与中断判定仍走 HTTP 接口',
  }
})

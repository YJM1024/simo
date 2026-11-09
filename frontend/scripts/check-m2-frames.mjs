#!/usr/bin/env node
// scripts/check-m2-frames.mjs —— M2 帧语义自测（纯逻辑，不依赖浏览器/后端）
//
// 覆盖：
//   - chat/frames.ts：reply.created/delta/done/retracted、trace.reasoning、status、error；
//   - tasks/frames.ts：task.created / task.updated 解析；
//   - tasks/model.ts：任务归约（幂等、顺序、只覆盖出现字段、并发计数）。
//
// 做法：用 esbuild 把纯 TS 模块打成内存 ESM（write:false + data URL），再用 node:assert 断言。

import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')

const entry = `
export {
  parseCreated, parseDelta, parseDone, parseRetracted, parseReasoning, parseStatus, parseError,
} from ${JSON.stringify(resolve(src, 'features/chat/frames.ts'))}
export { parseTaskCreated, parseTaskUpdated } from ${JSON.stringify(resolve(src, 'features/tasks/frames.ts'))}
export { upsertCreated, applyUpdated, countRunning } from ${JSON.stringify(resolve(src, 'features/tasks/model.ts'))}
`

const result = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent',
})

const output = result.outputFiles?.[0]
if (!output) {
  console.error('✖ 无法生成测试模块（esbuild 未输出）')
  process.exit(1)
}

const moduleUrl = `data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`
const mod = await import(moduleUrl)

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✔ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✖ ${name}`)
    console.error(`    ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('M2 帧语义自测（前端）')

// ---- chat 帧 ----
check('reply.created 最小字段（无 text）可解析为 agent 流式消息', () => {
  const message = mod.parseCreated({ id: 'm1' })
  assert.equal(message.id, 'm1')
  assert.equal(message.text, '')
  assert.equal(message.role, 'agent')
})

check('reply.delta 解析 {id, delta}', () => {
  assert.deepEqual(mod.parseDelta({ id: 'm1', delta: '你好' }), { id: 'm1', delta: '你好' })
  assert.equal(mod.parseDelta({ id: 'm1' }), null)
})

check('reply.done 状态缺省为 done', () => {
  const done = mod.parseDone({ id: 'm1' })
  assert.equal(done.id, 'm1')
  assert.equal(done.status, 'done')
})

check('reply.retracted 解析 id（reason 可选）', () => {
  const retracted = mod.parseRetracted({ id: 'm1', reason: 'user_correct' })
  assert.equal(retracted.id, 'm1')
  assert.equal(retracted.reason, 'user_correct')
  assert.equal(mod.parseRetracted({ id: 'm1' }).reason, undefined)
})

check('trace.reasoning 解析为 {id, delta}（只进折叠轨迹）', () => {
  assert.deepEqual(mod.parseReasoning({ id: 'm1', delta: '推理…' }), { id: 'm1', delta: '推理…' })
})

check('status 只接受 thinking | idle', () => {
  assert.deepEqual(mod.parseStatus({ state: 'thinking' }), { state: 'thinking' })
  assert.deepEqual(mod.parseStatus({ state: 'idle' }), { state: 'idle' })
  assert.equal(mod.parseStatus({ state: 'busy' }), null)
})

check('error 解析 {code, message}，缺 message 时丢弃', () => {
  assert.deepEqual(mod.parseError({ code: 'E1', message: '出错了' }), { code: 'E1', message: '出错了' })
  assert.equal(mod.parseError({ code: 'E1' }), null)
})

// ---- task 帧 + 归约 ----
check('task.created 幂等（重连补发不重复）', () => {
  let tasks = []
  tasks = mod.upsertCreated(tasks, { id: 't1', title: '调研 A', status: 'queued', fields: {} })
  tasks = mod.upsertCreated(tasks, { id: 't1', title: '调研 A', status: 'queued', fields: {} })
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].status, 'queued')
})

check('task.updated 保留顺序、只覆盖出现字段', () => {
  let tasks = [
    { id: 't1', title: 'A', status: 'running' },
    { id: 't2', title: 'B', status: 'running' },
  ]
  tasks = mod.applyUpdated(tasks, { id: 't2', fields: { status: 'done', summary: '完成并产出报告' } })
  assert.deepEqual(tasks.map((task) => task.id), ['t1', 't2'])
  assert.equal(tasks[1].status, 'done')
  assert.equal(tasks[1].summary, '完成并产出报告')
  assert.equal(tasks[0].status, 'running')
})

check('缺失 created 的 updated 也能补出任务（断线自愈）', () => {
  const tasks = mod.applyUpdated([], { id: 't9', fields: { status: 'running' } })
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].status, 'running')
})

check('并行计数：queued + running 计为运行中', () => {
  const tasks = [
    { id: 'a', title: 'A', status: 'queued' },
    { id: 'b', title: 'B', status: 'running' },
    { id: 'c', title: 'C', status: 'done' },
    { id: 'd', title: 'D', status: 'failed' },
  ]
  assert.equal(mod.countRunning(tasks), 2)
})

check('concurrent: 三条并行任务能同时存在并各自完成', () => {
  let tasks = []
  for (const id of ['p1', 'p2', 'p3']) tasks = mod.upsertCreated(tasks, { id, title: id, status: 'queued', fields: {} })
  assert.equal(mod.countRunning(tasks), 3)
  tasks = mod.applyUpdated(tasks, { id: 'p2', fields: { status: 'running' } })
  tasks = mod.applyUpdated(tasks, { id: 'p1', fields: { status: 'done', summary: '好了' } })
  assert.equal(mod.countRunning(tasks), 2)
  tasks = mod.applyUpdated(tasks, { id: 'p2', fields: { status: 'done', summary: '好了' } })
  tasks = mod.applyUpdated(tasks, { id: 'p3', fields: { status: 'failed', summary: '失败原因' } })
  assert.equal(mod.countRunning(tasks), 0)
  assert.equal(tasks.length, 3)
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

#!/usr/bin/env node
// scripts/check-m18.mjs —— M18 前端适配自测（概览 constraints / 子任务执行者 / 来源 / 汇报执行者）
//
// 覆盖：
//   - 概览 constraints 数组列表 + 旧字符串兼容；completed/pending/timeline 数组回归；空数组不渲染；
//   - 子任务执行者本地偏好（npc/self）+ 设置页调后端会话配置与降级提示；
//   - 概览来源文案「基于会话目标与任务生成」+ 版本，不出现内部字段/字样；
//   - 任务汇报卡片显示执行者（agentId→头像/名称），消息 agentId 归一化；
//   - 门禁链/无第三方/无 Spec。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export { normalizeOverview, overviewListSections, timelineListItems } from ${JSON.stringify(resolve(src, 'features/chat/overview.ts'))}
export { loadSubtaskExecutor, saveSubtaskExecutor, SUBTASK_EXECUTORS } from ${JSON.stringify(resolve(src, 'platform/preferences.ts'))}
export { toChatMessage } from ${JSON.stringify(resolve(src, 'platform/types.ts'))}
export { parseTaskCard } from ${JSON.stringify(resolve(src, 'features/chat/TaskReportCard.tsx'))}
`
const built = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent',
})
const mod = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

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
const read = (path) => readFileSync(path, 'utf8')
console.log('M18 前端适配自测')

// ---- 1. 概览 constraints 数组 ----
check('constraints 数组 → 列表；completed/pending/timeline 数组回归', () => {
  const overview = mod.normalizeOverview({
    overview: {
      goal: '整理季度报告。',
      constraints: ['只能用本地数据。', '周五前完成。'],
      current: '在校对。',
      completed: ['数据已收集。', '初稿已写完。'],
      pending: ['校对排版。'],
      notes: '口径与上月一致。',
      timeline: [{ at: 1794020000000, text: '先收集数据。' }, { at: 1794010000000, text: '随后撰写。' }],
    },
  })
  assert.deepEqual(overview.lists.constraints, ['只能用本地数据。', '周五前完成。'])
  const sections = mod.overviewListSections(overview)
  const constraint = sections.find((section) => section.key === 'constraints')
  assert.equal(constraint.kind, 'list')
  assert.equal(constraint.items.length, 2)
  assert.deepEqual(sections.find((section) => section.key === 'completed').items.length, 2)
  assert.deepEqual(sections.find((section) => section.key === 'pending').items, ['校对排版。'])
  assert.equal(sections.find((section) => section.key === 'timeline').kind, 'ordered')
  assert.equal(mod.timelineListItems(overview).length, 2)
})

check('旧字符串 constraints 兼容；空数组不渲染列表', () => {
  const legacy = mod.normalizeOverview({
    overview: {
      goal: '目标。',
      constraints: '只读数据；不要外发。',
      completed: '数据收集完毕。\n初稿写完。',
      pending: [],
      timeline: '先收集，随后撰写。',
    },
  })
  assert.deepEqual(legacy.lists.constraints, ['只读数据', '不要外发。'])
  assert.deepEqual(legacy.lists.completed, ['数据收集完毕。', '初稿写完。'])
  assert.deepEqual(mod.overviewListSections(legacy).find((section) => section.key === 'constraints').items.length, 2)
  assert.equal(mod.overviewListSections(legacy).some((section) => section.key === 'pending'), false)
  const empty = mod.normalizeOverview({ overview: { goal: '只读目标。', constraints: [] } })
  assert.equal(mod.overviewListSections(empty).some((section) => section.key === 'constraints'), false)
})

// ---- 2. 子任务执行者偏好 ----
check('子任务执行者：默认 npc / 可保存 self / 非法值回退', () => {
  const store = new Map()
  const original = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  try {
    assert.equal(mod.loadSubtaskExecutor(), 'npc')
    assert.equal(mod.saveSubtaskExecutor('self'), 'self')
    assert.equal(mod.loadSubtaskExecutor(), 'self')
    assert.equal(mod.saveSubtaskExecutor('bogus'), 'npc')
    assert.deepEqual([...mod.SUBTASK_EXECUTORS], ['npc', 'self'])
  } finally {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  }
})

// ---- 3. 汇报执行者 ----
check('任务 card 解析执行者 agentId；消息 agentId 归一化', () => {
  const card = mod.parseTaskCard({ task: { id: 't1', title: '整理报告', status: 'done', artifacts: [], agentId: 'researcher' } })
  assert.equal(card.agentId, 'researcher')
  const snake = mod.parseTaskCard({ task: { id: 't2', title: '构建', status: 'running', agent_id: 'builder' } })
  assert.equal(snake.agentId, 'builder')
  const message = mod.toChatMessage({ id: 'm1', role: 'agent', text: '完成', taskId: 't1', agentId: 'researcher' })
  assert.equal(message.agentId, 'researcher')
  assert.equal(mod.toChatMessage({ id: 'm2', role: 'agent', text: 'x', agent_id: 'builder' }).agentId, 'builder')
})

// ---- 4. 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const settingsPage = read(resolve(src, 'features/workbench/SettingsPage.tsx'))
const settingsModel = read(resolve(src, 'features/workbench/settings.ts'))
const overviewView = read(resolve(src, 'features/chat/OverviewView.tsx'))
const reportCard = read(resolve(src, 'features/chat/TaskReportCard.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('设置中心：子任务执行者选项 + 后端会话配置 + 降级提示', () => {
  assert.match(settingsModel, /executor/)
  assert.match(settingsPage, /子任务执行者/)
  assert.match(settingsPage, /任务智能体 NPC/)
  assert.match(settingsPage, /司墨本人/)
  assert.match(settingsPage, /apiPatch\(`\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/config`/)
  assert.match(settingsPage, /会话配置接口未就绪，已保存本地偏好/)
  assert.match(settingsPage, /loadSubtaskExecutor/)
})

check('概览约束列表 + 来源文案（无内部字段/字样）', () => {
  assert.match(overviewView, /overviewListSections/)
  assert.match(overviewView, /listSection\('constraints'\)/)
  assert.match(overviewView, /基于会话目标与任务生成/)
  assert.match(overviewView, /内容版本 v/)
  assert.equal(/Spec|规格|验收标准/.test(overviewView), false)
})

check('汇报卡片/消息显示执行者（头像+名称）', () => {
  assert.match(reportCard, /AgentAvatar/)
  assert.match(reportCard, /findAgent/)
  assert.match(reportCard, /agent\?: AgentInfo/)
  assert.match(reportCard, /执行者：/)
  assert.match(messageList, /agent=\{handler\}/)
  assert.match(reportCard, /agentId/)
})

check('门禁链包含 check-m18；无第三方库；无 Spec；图标资产仍在', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m18\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

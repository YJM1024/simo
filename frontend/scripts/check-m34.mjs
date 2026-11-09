#!/usr/bin/env node
// scripts/check-m34.mjs —— M34 视图复杂交互 v2 自测
//
// 纯逻辑：
//   - 多步表单步骤/总校验/错误定位步骤；
//   - 表格多列排序（点击循环升/降/移除）；
//   - 图表几何（bar/line/pie）与数据归一化；
//   - 看板 WIP/泳道/排序持久化/上移下移；
//   - chart 块纳入 schema 白名单。
// 源码：
//   - 向导/行内编辑/行详情/批量动作/多列排序；
//   - WIP/泳道/排序持久化/拖拽映射动作；
//   - chart 纯 SVG；$row 联动；骨架；失败回滚；
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
export * from ${JSON.stringify(resolve(src, 'features/views/interactions.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/views/chart.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/views/kanban.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/views/schema.ts'))}
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
console.log('M34 视图复杂交互 v2 自测（前端）')

check('多步表单：步骤归一化/总校验/错误步骤定位', () => {
  const steps = mod.normalizeFormSteps({
    steps: [
      { title: '基础', fields: [{ name: 'name', label: '名称', required: true }] },
      { title: '详情', fields: [{ name: 'count', label: '数量', type: 'number', required: true }] },
    ],
  })
  assert.equal(steps.length, 2)
  assert.equal(steps[0].title, '基础')
  assert.equal(steps[1].fields[0].name, 'count')
  const errors = mod.validateFormSteps(steps, {})
  assert.equal(errors.name, '名称为必填项')
  assert.equal(errors.count, '数量为必填项')
  assert.equal(mod.stepIndexOfField(steps, 'count'), 1)
  assert.equal(mod.stepIndexOfField(steps, 'name'), 0)
  assert.deepEqual(mod.validateFormSteps(steps, { name: 'x', count: '2' }), {})
  const single = mod.normalizeFormSteps({ fields: [{ name: 'a' }] })
  assert.equal(single.length, 1)
})

check('多列排序：升/降/移除与多键稳定', () => {
  const rows = [
    { group: 'b', n: 2 },
    { group: 'a', n: 2 },
    { group: 'a', n: 1 },
  ]
  assert.deepEqual(mod.sortRowsMulti(rows, [{ key: 'group', dir: 'asc' }, { key: 'n', dir: 'asc' }]).map((row) => `${row.group}${row.n}`), ['a1', 'a2', 'b2'])
  let sorts = mod.toggleMultiSort([], 'group')
  assert.deepEqual(sorts, [{ key: 'group', dir: 'asc' }])
  sorts = mod.toggleMultiSort(sorts, 'n')
  assert.deepEqual(sorts, [{ key: 'group', dir: 'asc' }, { key: 'n', dir: 'asc' }])
  sorts = mod.toggleMultiSort(sorts, 'group')
  assert.deepEqual(sorts, [{ key: 'group', dir: 'desc' }, { key: 'n', dir: 'asc' }])
  sorts = mod.toggleMultiSort(sorts, 'group')
  assert.deepEqual(sorts, [{ key: 'n', dir: 'asc' }])
})

check('图表：bar/line/pie 几何 + 数据归一化', () => {
  assert.equal(mod.normalizeChartKind('line'), 'line')
  assert.equal(mod.normalizeChartKind('pie'), 'pie')
  assert.equal(mod.normalizeChartKind('scatter'), 'bar')
  const points = mod.normalizeChartPoints([{ label: 'A', value: 3 }, { name: 'B', y: 5 }, 2, { bad: true }])
  assert.deepEqual(points.map((point) => point.value), [3, 5, 2])
  const bars = mod.barGeometry(points, 100, 50)
  assert.equal(bars.length, 3)
  assert.ok(bars.every((bar) => bar.x >= 0 && bar.width > 0 && bar.y >= 0 && bar.y + bar.height <= 50))
  const line = mod.lineGeometry(points, 100, 50)
  assert.equal(line.length, 3)
  assert.ok(line[0].x >= 0 && line[2].x <= 100)
  const pie = mod.pieGeometry(points, 100)
  assert.equal(pie.length, 3)
  assert.ok(pie.every((slice) => slice.path.startsWith('M ') && slice.percent > 0))
  assert.match(mod.chartSummary(points), /3 项/)
  assert.equal(mod.chartSummary([]), '暂无图表数据')
})

check('看板 WIP/泳道/排序持久化/移动', () => {
  assert.equal(mod.wipLimitFor({ wipLimit: 3 }, 'running'), 3)
  assert.equal(mod.wipLimitFor({ wipLimits: { done: 2 } }, 'done'), 2)
  assert.equal(mod.wipLimitFor({}, 'x'), null)
  assert.equal(mod.overWip(2, 3), true)
  assert.equal(mod.overWip(null, 9), false)
  const cards = [{ id: 'a', status: 'running', owner: '司墨' }, { id: 'b', status: 'running', owner: '研究员' }, { id: 'c', status: 'done', owner: '司墨' }]
  const lanes = mod.groupCardsByLane(cards, 'owner', (card) => String(card.owner))
  assert.equal(lanes.length, 2)
  assert.ok(lanes.some((lane) => lane.key === '司墨' && lane.cards.length === 2))
  assert.deepEqual(mod.groupCardsByLane(cards, 'status', () => '').map((lane) => lane.key), ['all'])
  const sorted = mod.sortCardsByOrder(cards, ['c', 'a'], (card) => String(card.id))
  assert.deepEqual(sorted.map((card) => card.id), ['c', 'a', 'b'])
  assert.deepEqual(mod.moveCardInOrder(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c'])
  assert.deepEqual(mod.moveCardInOrder(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b'])
  assert.deepEqual(mod.moveCardInOrder(['a'], 'a', 'up'), ['a'])
  const map = new Map()
  const fakeStorage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }
  const key = mod.kanbanStorageKey('view-1', 'b1')
  mod.writeKanbanOrder(fakeStorage, key, { 'all:running': ['b', 'a'] })
  assert.deepEqual(mod.readKanbanOrder(fakeStorage, key), { 'all:running': ['b', 'a'] })
  assert.deepEqual(mod.readKanbanOrder(null, key), {})
})

check('schema：chart 纳入白名单，未知块仍 fallback', () => {
  assert.ok(mod.BLOCK_TYPES.includes('chart'))
  const page = {
    schemaVersion: 1,
    id: 'view-main-chart',
    sessionId: 'main',
    title: '图表',
    layout: { kind: 'grid', columns: 12, gap: 'md', areas: [{ block: 'c', colSpan: 12 }] },
    blocks: [{ id: 'c', type: 'chart', props: { kind: 'bar', title: 'T' }, data: { action: 'task.list', args: { sessionId: '$session' } } }],
    equivalence: { chatPrompt: '看图表' },
    meta: {},
  }
  const valid = mod.validateViewPage(page)
  assert.equal(valid.ok, true)
  assert.equal(valid.page.blocks[0].type, 'chart')
  const unknown = mod.validateViewPage({ ...page, blocks: [{ id: 'x', type: 'scatter', props: {} }] })
  assert.equal(unknown.fallback, true)
})

// ---- 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const renderer = read(resolve(src, 'features/views/ViewRenderer.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('多步表单向导 + 字段校验/失败回滚', () => {
  assert.match(renderer, /normalizeFormSteps/)
  assert.match(renderer, /下一步/)
  assert.match(renderer, /上一步/)
  assert.match(renderer, /第 \{currentStep \+ 1\}\/\{steps\.length\} 步/)
  assert.match(renderer, /提交中…/)
  assert.match(renderer, /提交失败或被取消/)
})

check('表格行内编辑/多列排序/行详情/批量动作', () => {
  assert.match(renderer, /sortRowsMulti/)
  assert.match(renderer, /toggleMultiSort/)
  assert.match(renderer, /行内编辑/)
  assert.match(renderer, /行详情/)
  assert.match(renderer, /批量动作/)
  assert.match(renderer, /已回滚为原值/)
  assert.match(renderer, /批量动作在第/)
})

check('看板 WIP/泳道/排序持久化/拖拽映射动作', () => {
  assert.match(renderer, /wipLimitFor/)
  assert.match(renderer, /overWip/)
  assert.match(renderer, /groupCardsByLane/)
  assert.match(renderer, /kanbanStorageKey/)
  assert.match(renderer, /writeKanbanOrder/)
  assert.match(renderer, /moveCardInOrder/)
  assert.match(renderer, /超 WIP/)
  assert.match(renderer, /泳道：/)
  assert.match(renderer, /onRunAction\(binding, card\)/)
})

check('图表纯 SVG + $row 联动 + 骨架 + 窄屏/a11y', () => {
  assert.match(renderer, /block\.type === 'chart'/)
  assert.match(renderer, /barGeometry/)
  assert.match(renderer, /lineGeometry/)
  assert.match(renderer, /pieGeometry/)
  assert.match(renderer, /<svg/)
  assert.match(renderer, /viewBox/)
  assert.match(renderer, /联动 \$row/)
  assert.match(renderer, /SkeletonLines/)
  assert.match(renderer, /motion-safe:animate-pulse/)
  assert.match(renderer, /aria-label=/)
})

check('门禁链包含 check-m34；无第三方；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m34\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

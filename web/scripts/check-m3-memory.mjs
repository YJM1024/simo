#!/usr/bin/env node
// scripts/check-m3-memory.mjs —— M3 记忆只读页的纯逻辑自测（不依赖浏览器/后端）
//
// 覆盖 features/memory/model.ts：
//   - m3-contract §2 字段归一化（id/kind/scope/content/source/authority/confidence/
//     status/version/createdAt/updatedAt/refs）；
//   - m3-contract §4 响应形态（{ok,items,total,query}、{scopes:[{scope,count}]}、
//     {conflicts:[{id,scope,kind,status,items}]}）；
//   - 内部 kind 默认不可见；时间/置信度/文案。
//
// 做法同 M2：esbuild 打包到内存 ESM（write:false + data URL），node:assert 断言。

import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')

const entry = `
export {
  normalizeItem, normalizeItems, normalizeScopes, normalizeConflicts, conflictsFromItems,
  normalizeConfidence, toTimestamp, formatTimestamp, formatConfidence,
  kindLabel, statusLabel, authorityLabel, isVisibleItem, scopesFromItems, countByStatus,
} from ${JSON.stringify(resolve(src, 'features/memory/model.ts'))}
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

console.log('M3 记忆页逻辑自测（前端）')

// ---- 1. 契约字段 ----
check('契约字段：id/kind/scope/content/source/authority/confidence/status/version/refs', () => {
  const item = mod.normalizeItem({
    id: 'mem-a1b2c3',
    kind: 'fact',
    scope: 'global',
    content: '我的项目代号是 Atlas',
    source: 'user',
    authority: 'user_confirmed',
    confidence: 0.95,
    status: 'active',
    version: 1,
    createdAt: 1793980000000,
    updatedAt: 1793980000000,
    refs: ['session:main'],
  })
  assert.equal(item.id, 'mem-a1b2c3')
  assert.equal(item.text, '我的项目代号是 Atlas')
  assert.equal(item.kind, 'fact')
  assert.equal(item.scope, 'global')
  assert.equal(item.source, 'user')
  assert.equal(item.authority, 'user_confirmed')
  assert.equal(item.confidence, 0.95)
  assert.equal(item.status, 'active')
  assert.equal(item.version, 1)
  assert.equal(item.createdAt, 1793980000000)
  assert.deepEqual(item.refs, ['session:main'])
})

check('refs 为 JSON 字符串时也能解析；缺 version 为 null', () => {
  const item = mod.normalizeItem({
    id: 'm1',
    kind: 'fact',
    content: 'x',
    refs: '["session:main","task:t1"]',
  })
  assert.deepEqual(item.refs, ['session:main', 'task:t1'])
  assert.equal(item.version, null)
})

check('design/12 全量 schema 兼容（provenance/recordedAt/conflictsWith 忽略）', () => {
  const item = mod.normalizeItem({
    id: 'mem-be-000042',
    kind: 'fact',
    scope: 'domain:后端',
    content: { text: '订单库已迁到 PostgreSQL 14' },
    provenance: { source: 'system_verified' },
    confidence: 0.97,
    recordedAt: '2026-11-03T10:13:00+08:00',
  })
  assert.equal(item.text, '订单库已迁到 PostgreSQL 14')
  assert.equal(item.authority, 'system_verified')
  assert.ok(item.createdAt > 0)
})

check('缺 id / 非对象丢弃', () => {
  assert.equal(mod.normalizeItem({ kind: 'fact' }), null)
  assert.equal(mod.normalizeItem('nope'), null)
})

// ---- 2. 列表 ----
const rawItems = [
  { id: 'a', kind: 'fact', scope: 'global', content: 'A' },
  { id: 'a', kind: 'fact', scope: 'global', content: 'A duplicate' },
  { id: 'b', kind: 'decision', scope: 'domain:后端', content: 'B' },
  { id: 'c', kind: 'spec', scope: 'task:t1', content: '内部 Spec 不可见' },
  { id: 'd', kind: 'decision', status: 'candidate', content: '未确认草稿不可见' },
  { id: 'e', kind: 'experience', scope: 'global', content: 'E' },
]

check('{ok,items,total,query} 包装 + 去重 + 过滤内部 kind', () => {
  const items = mod.normalizeItems({ ok: true, items: rawItems, total: rawItems.length, query: {} })
  assert.deepEqual(items.map((item) => item.id), ['a', 'b', 'e'])
})

check('裸数组 / {memories} / {results} 兼容', () => {
  assert.equal(mod.normalizeItems(rawItems.slice(0, 2)).length, 1)
  assert.equal(mod.normalizeItems({ memories: rawItems.slice(0, 2) }).length, 1)
  assert.equal(mod.normalizeItems({ results: rawItems.slice(0, 2) }).length, 1)
  assert.equal(mod.normalizeItems(null).length, 0)
})

check('isVisibleItem：spec / 候选决策不可见', () => {
  const spec = mod.normalizeItem({ id: 's1', kind: 'spec', content: 'x' })
  const draft = mod.normalizeItem({ id: 'd1', kind: 'decision', status: 'candidate', content: 'x' })
  const fact = mod.normalizeItem({ id: 'f1', kind: 'fact', content: 'x' })
  assert.equal(mod.isVisibleItem(spec), false)
  assert.equal(mod.isVisibleItem(draft), false)
  assert.equal(mod.isVisibleItem(fact), true)
})

// ---- 3. 作用域（{scope,count}）----
check('作用域：{scopes:[{scope,count}]} 归一化含计数', () => {
  assert.deepEqual(
    mod.normalizeScopes({
      ok: true,
      scopes: [
        { scope: 'global', count: 3 },
        { scope: 'domain:后端', count: 1 },
      ],
    }),
    [
      { scope: 'global', count: 3 },
      { scope: 'domain:后端', count: 1 },
    ],
  )
})

check('作用域兼容字符串数组并去重', () => {
  assert.deepEqual(mod.normalizeScopes(['global', 'domain:后端', 'global']), [
    { scope: 'global', count: null },
    { scope: 'domain:后端', count: null },
  ])
  assert.deepEqual(mod.normalizeScopes(null), [])
})

check('scopesFromItems 从条目推导（去重排序）', () => {
  const items = mod.normalizeItems([
    { id: '1', kind: 'fact', scope: 'global', content: 'x' },
    { id: '2', kind: 'fact', scope: 'domain:后端', content: 'x' },
    { id: '3', kind: 'fact', scope: 'global', content: 'x' },
  ])
  assert.deepEqual(mod.scopesFromItems(items), ['domain:后端', 'global'])
})

// ---- 4. 冲突（契约 group 结构）----
const conflictItems = [
  { id: 'x', kind: 'fact', scope: 'global', content: '接口用 REST', version: 1, authority: 'user_confirmed' },
  { id: 'y', kind: 'fact', scope: 'global', content: '接口用 GraphQL', version: 1, authority: 'user_confirmed' },
]

check('契约冲突结构：{conflicts:[{id,scope,kind,status,items:[{id,content,version,authority}]}]}', () => {
  const items = mod.normalizeItems({ items: conflictItems })
  const byId = new Map(items.map((item) => [item.id, item]))
  const groups = mod.normalizeConflicts(
    {
      ok: true,
      conflicts: [
        {
          id: 'conf-1',
          scope: 'global',
          kind: 'fact',
          status: 'disputed',
          items: [
            { id: 'x', content: '接口用 REST', version: 1, authority: 'user_confirmed' },
            { id: 'y', content: '接口用 GraphQL', version: 1, authority: 'user_confirmed' },
          ],
        },
      ],
    },
    byId,
  )
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, 'conf-1')
  assert.equal(groups[0].scope, 'global')
  assert.equal(groups[0].status, 'disputed')
  assert.deepEqual(
    groups[0].items.map((item) => item.id),
    ['x', 'y'],
  )
})

check('冲突组内条目内容来自 group.items（即使 byId 里没有）', () => {
  const groups = mod.normalizeConflicts(
    {
      conflicts: [
        {
          id: 'c2',
          scope: 'global',
          kind: 'fact',
          status: 'disputed',
          items: [
            { id: 'p', content: '方案 A' },
            { id: 'q', content: '方案 B' },
          ],
        },
      ],
    },
    new Map(),
  )
  assert.equal(groups[0].items[0].text, '方案 A')
  assert.equal(groups[0].items[1].text, '方案 B')
})

check('旧 pair 形态仍兼容：{conflicts:[{a,b}]} / [[a,b]]', () => {
  const items = mod.normalizeItems({ items: conflictItems })
  const byId = new Map(items.map((item) => [item.id, item]))
  assert.equal(mod.normalizeConflicts({ conflicts: [{ a: conflictItems[0], b: conflictItems[1] }] }, byId).length, 1)
  assert.equal(mod.normalizeConflicts([[conflictItems[0], conflictItems[1]]], byId).length, 1)
  assert.equal(mod.normalizeConflicts(null, byId).length, 0)
})

check('conflictsWith 双向兜底配对（后端无 conflicts 端点时）', () => {
  const raw = [
    { id: 'x', kind: 'fact', scope: 'global', content: 'REST', conflictsWith: ['y'] },
    { id: 'y', kind: 'fact', scope: 'global', content: 'GraphQL', conflictsWith: ['x'] },
  ]
  const items = mod.normalizeItems({ items: raw })
  const groups = mod.conflictsFromItems(items, raw)
  assert.equal(groups.length, 1)
  assert.deepEqual([groups[0].items[0].id, groups[0].items[1].id].sort(), ['x', 'y'])
})

// ---- 5. 数值 / 时间 / 文案 ----
check('置信度：0–1 / 0–100 / 非法值', () => {
  assert.equal(mod.normalizeConfidence(0.97), 0.97)
  assert.equal(mod.normalizeConfidence(97), 0.97)
  assert.equal(mod.normalizeConfidence(-1), 0)
  assert.equal(mod.normalizeConfidence('abc'), null)
  assert.equal(mod.formatConfidence(0.92), '92%')
  assert.equal(mod.formatConfidence(null), '—')
})

check('时间戳：毫秒 / 秒 / RFC3339 / 非法', () => {
  assert.equal(mod.toTimestamp(1793980000000), 1793980000000)
  assert.equal(mod.toTimestamp(1793980000), 1793980000000)
  assert.equal(mod.toTimestamp('2026-11-07T00:00:00+08:00'), Date.parse('2026-11-07T00:00:00+08:00'))
  assert.equal(mod.toTimestamp('not-a-date'), null)
  assert.match(mod.formatTimestamp(1793980000000), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.equal(mod.formatTimestamp(null), '—')
})

check('文案映射与未知值兜底', () => {
  assert.equal(mod.kindLabel('fact'), '事实')
  assert.equal(mod.kindLabel('unknown_kind'), 'unknown_kind')
  assert.equal(mod.statusLabel('disputed'), '冲突')
  assert.equal(mod.authorityLabel('user_confirmed'), '用户确认')
  assert.equal(mod.authorityLabel('whatever'), 'whatever')
})

check('countByStatus 计数', () => {
  const items = mod.normalizeItems([
    { id: '1', kind: 'fact', content: 'x', status: 'active' },
    { id: '2', kind: 'fact', content: 'y', status: 'disputed' },
    { id: '3', kind: 'fact', content: 'z', status: 'disputed' },
  ])
  assert.equal(mod.countByStatus(items, 'disputed'), 2)
  assert.equal(mod.countByStatus(items, 'active'), 1)
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

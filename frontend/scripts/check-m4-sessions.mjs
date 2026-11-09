#!/usr/bin/env node
// scripts/check-m4-sessions.mjs —— M4 会话树纯逻辑自测（不依赖浏览器/后端）
//
// 覆盖 features/sessions/model.ts：
//   - 嵌套树 / 扁平列表 / 旧格式三种 payload 归一化；
//   - 去重、排序（main 优先）、孤儿挂根、环安全、snake_case 兼容；
//   - flattenSessionMeta 深度、findPath/nodeDepth、countNodes；
//   - 状态点/摘要文案、includeChildren 默认值、新建会话 id 提取。
//
// 做法同 M2/M3：esbuild 打包到内存 ESM（write:false + data URL），node:assert 断言。

import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')

const entry = `
export {
  normalizeSessionTree, flattenSessionMeta, findNode, findPath, nodeDepth,
  countNodes, collectIds, statusLabel, statusTone, summaryLine,
  extractCreatedSessionId, shouldIncludeChildrenByDefault,
} from ${JSON.stringify(resolve(src, 'features/sessions/model.ts'))}
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

const mod = await import(`data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`)

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

console.log('M4 会话树逻辑自测（前端）')

// ---- 1. 归一化三种 payload ----
check('嵌套树 {ok,tree:[{children}]} 归一化', () => {
  const roots = mod.normalizeSessionTree({
    ok: true,
    tree: [
      {
        id: 'main',
        title: '主会话',
        createdAt: 1,
        children: [
          { id: 'sub1', title: '子会话 1', createdAt: 2, children: [{ id: 'sub2', title: '孙会话', createdAt: 3 }] },
        ],
      },
    ],
  })
  assert.equal(roots.length, 1)
  assert.equal(roots[0].id, 'main')
  assert.equal(roots[0].children.length, 1)
  assert.equal(roots[0].children[0].id, 'sub1')
  assert.equal(roots[0].children[0].children[0].id, 'sub2')
  assert.equal(roots[0].children[0].parentId, 'main')
  assert.equal(roots[0].children[0].children[0].parentId, 'sub1')
})

check('扁平 {sessions:[{parentId}]} 归一化成树', () => {
  const roots = mod.normalizeSessionTree({
    sessions: [
      { id: 'main', title: '主会话', createdAt: 1 },
      { id: 'sub', title: '子会话', parentId: 'main', createdAt: 2 },
    ],
  })
  assert.equal(roots.length, 1)
  assert.equal(roots[0].children[0].id, 'sub')
})

check('旧格式/裸数组：单根也能工作', () => {
  const roots = mod.normalizeSessionTree([{ id: 'main', title: '主会话' }])
  assert.equal(roots.length, 1)
  assert.equal(roots[0].title, '主会话')
  assert.equal(mod.normalizeSessionTree(null).length, 0)
})

check('snake_case parent_id / created_at 兼容', () => {
  const roots = mod.normalizeSessionTree([
    { id: 'main', title: 'M', created_at: 1 },
    { id: 'sub', title: 'S', parent_id: 'main', created_at: 2 },
  ])
  assert.equal(roots[0].children[0].id, 'sub')
  assert.equal(roots[0].children[0].createdAt, 2)
})

check('重复 id 去重、孤儿挂根', () => {
  const roots = mod.normalizeSessionTree([
    { id: 'main', createdAt: 1 },
    { id: 'main', createdAt: 1 },
    { id: 'orphan', parentId: 'ghost', createdAt: 2 },
  ])
  assert.equal(roots.length, 2)
  assert.deepEqual(
    roots.map((node) => node.id).sort(),
    ['main', 'orphan'],
  )
})

check('环安全：a↔b 不会死循环，二者挂根', () => {
  const roots = mod.normalizeSessionTree([
    { id: 'a', parentId: 'b' },
    { id: 'b', parentId: 'a' },
  ])
  assert.equal(roots.length, 2)
})

check('排序：createdAt 升序 + main 优先', () => {
  const roots = mod.normalizeSessionTree([
    { id: 'z', createdAt: 5 },
    { id: 'main', createdAt: 9 },
    { id: 'a', createdAt: 1 },
  ])
  assert.equal(roots[0].id, 'main')
  assert.deepEqual(
    roots.map((node) => node.id),
    ['main', 'a', 'z'],
  )
})

// ---- 2. 遍历 ----
const tree = mod.normalizeSessionTree({
  tree: [
    {
      id: 'main',
      title: '主会话',
      createdAt: 1,
      children: [
        { id: 'sub1', title: '子 1', createdAt: 2, children: [{ id: 'sub2', title: '孙', createdAt: 3 }] },
        { id: 'sub3', title: '子 3', createdAt: 4 },
      ],
    },
  ],
})

check('flattenSessionMeta：深度正确', () => {
  const meta = mod.flattenSessionMeta(tree)
  assert.deepEqual(
    meta.map((entry) => `${entry.id}:${entry.depth}`),
    ['main:0', 'sub1:1', 'sub2:2', 'sub3:1'],
  )
})

check('findNode / findPath / nodeDepth', () => {
  assert.equal(mod.findNode(tree, 'sub2')?.title, '孙')
  assert.equal(mod.findNode(tree, 'nope'), null)
  assert.deepEqual(
    mod.findPath(tree, 'sub2').map((node) => node.id),
    ['main', 'sub1', 'sub2'],
  )
  assert.deepEqual(mod.findPath(tree, 'nope'), [])
  assert.equal(mod.nodeDepth(tree, 'main'), 0)
  assert.equal(mod.nodeDepth(tree, 'sub2'), 2)
  assert.equal(mod.nodeDepth(tree, 'nope'), -1)
})

check('countNodes / collectIds', () => {
  assert.equal(mod.countNodes(tree), 4)
  assert.deepEqual([...mod.collectIds(tree)].sort(), ['main', 'sub1', 'sub2', 'sub3'])
})

// ---- 3. 展示文案 ----
check('状态点/状态文案/摘要', () => {
  assert.equal(mod.statusLabel('archived'), '已归档')
  assert.equal(mod.statusLabel('idle'), '空闲')
  assert.equal(mod.statusLabel('active'), '进行中')
  assert.equal(mod.statusTone('active'), 'bg-ok')
  assert.equal(mod.statusTone('archived'), 'bg-muted')

  const withSummary = mod.normalizeSessionTree([{ id: 'a', summary: '正在整理接口约定' }])[0]
  assert.equal(mod.summaryLine(withSummary), '正在整理接口约定')
  const withCount = mod.normalizeSessionTree([{ id: 'b', messageCount: 12 }])[0]
  assert.equal(mod.summaryLine(withCount), '12 条消息')
  const empty = mod.normalizeSessionTree([{ id: 'c' }])[0]
  assert.equal(mod.summaryLine(empty), '进行中')
  assert.equal(mod.statusLabel(empty.status), '进行中')
})

// ---- 4. includeChildren 默认 / 新建 id 提取 ----
check('M59 includeChildren 默认：始终仅本会话（不默认聚合）', () => {
  assert.equal(mod.shouldIncludeChildrenByDefault(0), false)
  assert.equal(mod.shouldIncludeChildrenByDefault(2), false)
})

check('新建会话返回 id 的多种包装', () => {
  assert.equal(mod.extractCreatedSessionId({ ok: true, id: 's1' }), 's1')
  assert.equal(mod.extractCreatedSessionId({ ok: true, session: { id: 's2' } }), 's2')
  assert.equal(mod.extractCreatedSessionId({ data: { sessionId: 's3' } }), 's3')
  assert.equal(mod.extractCreatedSessionId({ data: { session: { id: 's4' } } }), 's4')
  assert.equal(mod.extractCreatedSessionId(null), null)
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

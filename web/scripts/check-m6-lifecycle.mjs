#!/usr/bin/env node
// scripts/check-m6-lifecycle.mjs —— M6 归档/只读/跨会话产物 纯逻辑自测
//
// 覆盖：
//   - sessions/model.ts：archived 归一化（0/1/true）、只读判定、归档文案；
//   - tasks/model.ts：会话产物列表归一化（sessionId/sessionTitle）、按会话分组、跨会话判定；
//   - 前端可见概念扫描：src 中不得出现 Spec / 规格 / 验收标准（M6 范围 4）。
//
// 做法同 M2–M5：esbuild 内存打包 + node:assert；扫描用 fs（只读源码，不改文件）。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')

const entry = `
export {
  normalizeSessionTree, flattenSessionMeta, statusLabel, statusTone, isReadOnly, archivedBadge, summaryLine,
} from ${JSON.stringify(resolve(src, 'features/sessions/model.ts'))}
export {
  normalizeArtifactList, groupArtifactsBySession, isForeignArtifact, classifyArtifact,
  descendantSessionIds, tagArtifacts,
} from ${JSON.stringify(resolve(src, 'features/tasks/model.ts'))}
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

console.log('M6 归档/只读/跨会话产物逻辑自测（前端）')

// ---- 1. 归档状态 ----
check('archived 归一化：0/1/true/false + parentId 树', () => {
  const roots = mod.normalizeSessionTree({
    sessions: [
      { id: 'main', title: '主会话', createdAt: 1, archived: 0 },
      { id: 'sub', title: '子会话', parentId: 'main', createdAt: 2, archived: 1 },
      { id: 'done', title: '已归档子会话', parentId: 'main', createdAt: 3, archived: true },
    ],
  })
  assert.equal(roots[0].archived, false)
  assert.equal(roots[0].children[0].archived, true)
  assert.equal(roots[0].children[1].archived, true)
  assert.equal(roots[0].children[0].status, 'archived')
})

check('isReadOnly / 归档文案 / 状态点', () => {
  const node = mod.normalizeSessionTree([{ id: 'main', archived: 1 }])[0]
  assert.equal(mod.isReadOnly(node), true)
  assert.equal(mod.isReadOnly({ archived: false }), false)
  assert.equal(mod.isReadOnly(null), false)
  assert.equal(mod.archivedBadge(), '已归档 · 只读')
  assert.equal(mod.statusLabel('archived'), '已归档')
  assert.equal(mod.statusTone('archived'), 'bg-muted')
  const active = mod.normalizeSessionTree([{ id: 'main' }])[0]
  assert.equal(mod.summaryLine(active), '进行中')
})

// ---- 2. 跨会话产物 ----
const rawArtifacts = {
  ok: true,
  artifacts: [
    {
      id: 'art-1',
      taskId: 'task-1',
      name: 'report-attempt-1.md',
      mime: 'text/markdown',
      size: 182,
      sessionId: 'main',
      sessionTitle: '主会话',
    },
    {
      id: 'art-2',
      taskId: 'task-2',
      name: 'child-report.md',
      mime: 'text/markdown',
      size: 90,
      sessionId: 'sess-child',
      sessionTitle: '支付流程优化',
    },
    { id: 'art-3', name: 'chart.png', mime: 'image/png', session_id: 'sess-child', session_title: '支付流程优化' },
    { name: 'no-id.md' },
  ],
}

check('normalizeArtifactList：sessionId/sessionTitle + 分类 + 跳过坏条目', () => {
  const artifacts = mod.normalizeArtifactList(rawArtifacts)
  assert.deepEqual(
    artifacts.map((artifact) => artifact.id),
    ['art-1', 'art-2', 'art-3'],
  )
  assert.equal(artifacts[0].sessionId, 'main')
  assert.equal(artifacts[0].sessionTitle, '主会话')
  assert.equal(artifacts[1].sessionId, 'sess-child')
  assert.equal(artifacts[1].kind, 'markdown')
  assert.equal(artifacts[2].sessionId, 'sess-child') // snake_case 兼容
  assert.equal(artifacts[2].kind, 'image')
  assert.equal(mod.normalizeArtifactList(null).length, 0)
  assert.equal(mod.normalizeArtifactList({ items: rawArtifacts.artifacts }).length, 3)
})

check('groupArtifactsBySession：按来源会话分组且保序', () => {
  const artifacts = mod.normalizeArtifactList(rawArtifacts)
  const groups = mod.groupArtifactsBySession(artifacts)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].sessionTitle, '主会话')
  assert.deepEqual(groups[0].artifacts.map((artifact) => artifact.id), ['art-1'])
  assert.equal(groups[1].sessionTitle, '支付流程优化')
  assert.deepEqual(groups[1].artifacts.map((artifact) => artifact.id), ['art-2', 'art-3'])
})

check('isForeignArtifact：父会话看子会话产物 → 只读标注（不复制）', () => {
  const artifacts = mod.normalizeArtifactList(rawArtifacts)
  assert.equal(mod.isForeignArtifact(artifacts[1], 'main'), true)
  assert.equal(mod.isForeignArtifact(artifacts[0], 'main'), false)
  assert.equal(mod.isForeignArtifact(artifacts[1], null), false)
})

check('descendantSessionIds：从 sessionMeta 求子树（父→子会话聚合拉取）', () => {
  const meta = [
    { id: 'main', title: '主会话', depth: 0 },
    { id: 'sub1', title: '子 1', depth: 1, parentId: 'main' },
    { id: 'sub2', title: '孙', depth: 2, parentId: 'sub1' },
    { id: 'other', title: '另一个根', depth: 0 },
  ]
  assert.deepEqual(mod.descendantSessionIds(meta, 'main'), ['sub1', 'sub2'])
  assert.deepEqual(mod.descendantSessionIds(meta, 'sub1'), ['sub2'])
  assert.deepEqual(mod.descendantSessionIds(meta, 'sub2'), [])
  assert.deepEqual(mod.descendantSessionIds(meta, 'other'), [])
})

check('tagArtifacts：后端产物补来源会话（sessionId/sessionTitle）', () => {
  const untagged = mod.normalizeArtifactList({ artifacts: [{ id: 'art-x', name: 'x.md', mime: 'text/markdown' }] })
  const tagged = mod.tagArtifacts(untagged, 'sess-child', '子会话')
  assert.equal(tagged[0].sessionId, 'sess-child')
  assert.equal(tagged[0].sessionTitle, '子会话')
  // 已有来源的产物不覆盖
  const artifacts = mod.normalizeArtifactList(rawArtifacts)
  const kept = mod.tagArtifacts(artifacts, 'x', 'X')
  assert.equal(kept[1].sessionId, 'sess-child')
  assert.equal(kept[0].sessionId, 'main')
})

check('flattenSessionMeta：parentId 随 meta 传播（M6 聚合依赖）', () => {
  const roots = mod.normalizeSessionTree({
    sessions: [
      { id: 'main', title: '主会话', createdAt: 1 },
      { id: 'sub', title: '子', parentId: 'main', createdAt: 2 },
    ],
  })
  const meta = mod.flattenSessionMeta(roots)
  const sub = meta.find((item) => item.id === 'sub')
  assert.equal(sub?.parentId, 'main')
  assert.equal(meta.find((item) => item.id === 'main')?.parentId, undefined)
})

check('classifyArtifact 回归（markdown/image/text/other）', () => {
  assert.equal(mod.classifyArtifact('a.md', 'text/markdown'), 'markdown')
  assert.equal(mod.classifyArtifact('a.png', 'image/png'), 'image')
  assert.equal(mod.classifyArtifact('a.txt', 'text/plain'), 'text')
  assert.equal(mod.classifyArtifact('a.bin', ''), 'other')
})

// ---- 3. Spec / 规格 / 验收标准 前端不可见 ----
function collectSourceFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectSourceFiles(full, out)
    else if (/\.(ts|tsx|css|html)$/.test(entry.name)) out.push(full)
  }
  return out
}

check('前端源码不出现 Spec / 规格 / 验收标准 概念', () => {
  const files = collectSourceFiles(src, [])
  assert.ok(files.length > 20, `扫描文件数异常：${files.length}`)
  const forbidden = /Spec|规格|验收标准/g
  const offenders = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const matches = [...text.matchAll(forbidden)]
    if (matches.length > 0) {
      offenders.push(`${file.replace(`${src}\\`, '')} (${matches.length})`)
    }
  }
  assert.deepEqual(offenders, [])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

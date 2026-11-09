#!/usr/bin/env node
// scripts/check-m21-memory-browser.mjs —— 记忆浏览器（M21 / design/24 v0.3.1）自测
//
// 覆盖：
//   - 条目：五类型/子类型/实体引用/layer/归属/写域/双时态/旧 kind 回退；
//   - 实体：kind/别名/状态；关系归一化与标签；实体详情（关系/最近记忆/计数）；
//   - 冲突 disputed（双方来源/时间/状态/需裁决）；智能体通用记忆（来源会话）；
//   - 金字塔 L0–L4 节点（coverage/status/源数量）；实体 API 缺失时按条目实体引用降级；
//   - 源码：左栏入口、浏览/冲突/智能体/金字塔、搜索/类型过滤、只读无写、未就绪空态说明、无 Spec 字段。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'features/memory/browser.ts'))}
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
console.log('M21 记忆浏览器自测（前端）')

check('记忆条目：五类型 / 子类型 / 实体引用 / layer / 归属 / 旧 kind 回退', () => {
  const item = mod.normalizeBrowserItem({
    id: 'm1',
    content: '后端项目统一使用 Go。',
    type: 'norm',
    subType: 'constraint',
    status: 'active',
    source: 'user',
    authority: 'user_confirmed',
    confidence: 0.9,
    layer: 3,
    attributedTo: 'user:owner',
    ownerAgent: 'agent:simo',
    entityRefs: [{ id: 'ent-1', name: '后端', role: 'primary' }, 'ent-2'],
    validFrom: 1760000000000,
    refs: ['session:main'],
  })
  assert.equal(item.type, 'norm')
  assert.equal(item.subType, 'constraint')
  assert.equal(item.layer, 3)
  assert.equal(item.attributedTo, 'user:owner')
  assert.equal(item.ownerAgent, 'agent:simo')
  assert.equal(item.entityRefs.length, 2)
  assert.equal(item.entityRefs[0].name, '后端')
  assert.deepEqual(item.refs, ['session:main'])
  assert.equal(item.validFrom, 1760000000000)
  // 旧 kind 回退
  assert.equal(mod.normalizeMemoryType(undefined, 'fact'), 'semantic')
  assert.equal(mod.normalizeMemoryType(undefined, 'progress'), 'working')
  assert.equal(mod.normalizeMemoryType(undefined, 'unknown'), 'scene')
  assert.equal(mod.memoryTypeLabel('procedural'), '程序')
})

check('条目列表：包装/裸数组/去重 + 实体引用派生', () => {
  const items = mod.normalizeBrowserItems({ items: [{ id: 'a', content: 'A', entityRefs: [{ id: 'e1', name: '实体一' }] }, { id: 'a', content: '重复' }, { id: 'b', content: 'B' }] })
  assert.equal(items.length, 2)
  const entities = mod.entitiesFromItems(items)
  assert.equal(entities.length, 1)
  assert.equal(entities[0].id, 'e1')
  assert.equal(entities[0].name, '实体一')
})

check('实体/关系/详情：别名/状态/关系标签/计数', () => {
  const entity = mod.normalizeEntity({ id: 'ent-1', kind: 'domain', name: '后端', canonicalName: 'backend', aliases: ['服务端'], parent_id: 'ent-0', owner_agent: 'agent:simo', status: 'active', version: 3 })
  assert.equal(entity.kind, 'domain')
  assert.equal(entity.canonicalName, 'backend')
  assert.deepEqual(entity.aliases, ['服务端'])
  assert.equal(entity.parentId, 'ent-0')
  assert.equal(mod.entityKindLabel('project'), '项目')
  const relation = mod.normalizeRelation({ id: 'r1', from_entity: 'ent-1', to_entity: { id: 'ent-2', name: 'Go' }, rel_type: 'about', source: 'inferred', confidence: 0.8 })
  assert.equal(relation.toEntity, 'ent-2')
  assert.equal(relation.toName, 'Go')
  assert.equal(mod.relationLabel('belongs_to'), '归属')
  assert.deepEqual(mod.normalizeRelations({ relations: [relation] }).length, 1)
  const detail = mod.normalizeEntityDetail({ entity: { id: 'ent-1', name: '后端' }, relations: [{ from_entity: 'ent-1', to_entity: 'ent-2', rel_type: 'about' }], recent: [{ id: 'm1', content: 'x' }], memoryCounts: { norm: 3, semantic: 2 } }, entity)
  assert.equal(detail.entity.id, 'ent-1')
  assert.equal(detail.relations.length, 1)
  assert.equal(detail.recent.length, 1)
  assert.equal(detail.memoryCounts.norm, 3)
})

check('冲突：disputed 双方条目 + 需裁决来源字段', () => {
  const conflicts = mod.normalizeBrowserConflicts({
    conflicts: [
      {
        id: 'c1',
        status: 'disputed',
        askPolicy: 'ask_user',
        reason: '事实冲突',
        items: [
          { id: 'm1', content: '用 Go', source: 'user', authority: 'user_confirmed', status: 'disputed', updatedAt: 1760000000000 },
          { id: 'm2', content: '用 Java', source: 'conversation', authority: 'inferred', status: 'disputed' },
        ],
      },
    ],
  })
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].status, 'disputed')
  assert.equal(conflicts[0].askPolicy, 'ask_user')
  assert.equal(conflicts[0].items.length, 2)
  assert.equal(conflicts[0].items[0].source, 'user')
  assert.equal(conflicts[0].items[1].authority, 'inferred')
  assert.equal(mod.sourceLabel('conversation'), '对话')
})

check('智能体记忆 / 金字塔节点', () => {
  const agents = mod.normalizeAgentList({ agents: [{ id: 'agent:simo', name: '司墨', personaVersion: 'p1', memoryCount: 7 }] })
  assert.equal(agents[0].name, '司墨')
  assert.equal(agents[0].memoryCount, 7)
  const nodes = mod.normalizePyramid({
    nodes: [
      { id: 'py1', entityId: 'ent-1', level: 2, viewId: 'what_happened', kind: 'summary', text: '任务摘要', coverage: 0.9, status: 'active', sourceCount: 3 },
      { id: 'py2', entityId: 'ent-1', level: 9, text: '钳制' },
    ],
  })
  assert.equal(nodes.length, 2)
  assert.equal(nodes[0].level, 2)
  assert.equal(nodes[0].coverage, 0.9)
  assert.equal(nodes[0].sourceCount, 3)
  assert.equal(nodes[1].level, 4)
  assert.equal(mod.LAYER_META.length, 5)
  assert.deepEqual(mod.LAYER_META.map((layer) => layer.level), [0, 1, 2, 3, 4])
  assert.ok(mod.PYRAMID_VIEWS.some((view) => view.id === 'what_happened'))
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
const page = read(resolve(src, 'features/memory/MemoryBrowserPage.tsx'))
const entryFile = read(resolve(src, 'features/memory/MemoryMainView.tsx'))
const manifest = read(resolve(src, 'features/memory/manifest.ts'))
const rest = read(resolve(src, 'features/memory/browser-rest.ts'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('M40 顶部「记忆」内嵌视图 + 浏览/搜索/类型过滤/实体详情', () => {
  assert.match(manifest, /mainView/)
  assert.match(entryFile, /embedded/)
  assert.match(entryFile, /NAV_CLOSED/)
  assert.match(page, /搜索记忆/)
  assert.match(page, /TYPE_FILTERS/)
  assert.match(page, /场景/)
  assert.match(page, /语义/)
  assert.match(page, /规范/)
  assert.match(page, /程序/)
  assert.match(page, /工作/)
  assert.match(page, /实体（/)
  assert.match(page, /关系/)
  assert.match(page, /记忆条目/)
})

check('冲突/智能体/金字塔视图 + 只读/需裁决/来源会话', () => {
  assert.match(page, /需裁决/)
  assert.match(page, /disputed/)
  assert.match(page, /智能体通用记忆/)
  assert.match(page, /来源：/)
  assert.match(page, /L0–L4|LAYER_META/)
  assert.match(page, /aria-expanded/)
  assert.match(page, /只读/)
  assert.equal(/apiPost|apiPatch|apiDelete|contentEditable|textarea/.test(page), false)
})

check('未就绪降级说明（不伪造示例数据）+ 只读 API', () => {
  assert.match(page, /接口尚未就绪/)
  assert.match(page, /不展示示例数据/)
  assert.match(rest, /\/api\/memory\/entities/)
  assert.match(rest, /\/api\/memory\/items/)
  assert.match(rest, /\/api\/memory\/conflicts/)
  assert.match(rest, /\/api\/memory\/agents/)
  assert.match(rest, /\/api\/memory\/pyramid/)
  assert.equal(/apiPost|apiPatch|apiDelete/.test(rest), false)
})

check('门禁链包含 check-m21；无第三方；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m21-memory-browser\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

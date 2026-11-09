#!/usr/bin/env node
// scripts/check-m33.mjs —— M33/task-133 视图与团队交互打磨自测
//
// 覆盖纯逻辑：
//   - 表单校验（必填/number/date/select）；
//   - 表格排序/分页 clamp/空数据；
//   - 团队筛选（状态+关键词）；
// 源码约束：
//   - 表单提交中/错误高亮/成功刷新；表格排序分页/行操作 loading/空态；
//   - 看板拖拽失败保留原列/无绑定提示/键盘替代；
//   - 编辑器搜索/删除确认/保存状态/未保存离开提示；
//   - 团队状态动画/筛选/进入会话/空态/a11y；
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
export * from ${JSON.stringify(resolve(src, 'features/team/model.ts'))}
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
console.log('task-133 视图/团队交互打磨自测（前端）')

check('表单校验：必填 / number / date / select', () => {
  const fields = mod.normalizeFormFields([
    { name: 'title', label: '标题', type: 'text', required: true },
    { name: 'count', label: '数量', type: 'number' },
    { name: 'due', label: '日期', type: 'date' },
    { name: 'kind', label: '类型', type: 'select', options: ['a', 'b'] },
    { name: 'note', label: '备注', type: 'textarea' },
  ])
  assert.equal(fields.length, 5)
  const empty = mod.validateForm(fields, {})
  assert.equal(empty.title, '标题为必填项')
  const invalid = mod.validateForm(fields, { title: 'x', count: 'abc', due: 'not-date', kind: 'z' })
  assert.match(invalid.count, /数字/)
  assert.match(invalid.due, /日期/)
  assert.match(invalid.kind, /可选范围/)
  assert.deepEqual(mod.validateForm(fields, { title: 'x', count: '3', due: '2026-11-08', kind: 'a' }), {})
})

check('表格排序（数字/中文）与分页 clamp/空数据', () => {
  const rows = [{ n: 3, t: '丙' }, { n: 1, t: '甲' }, { n: 2, t: '乙' }]
  assert.deepEqual(mod.sortRows(rows, 'n', 'asc').map((row) => row.n), [1, 2, 3])
  assert.deepEqual(mod.sortRows(rows, 'n', 'desc').map((row) => row.n), [3, 2, 1])
  const paged = mod.paginateRows(rows, 2, 2)
  assert.equal(paged.page, 2)
  assert.equal(paged.totalPages, 2)
  assert.equal(paged.rows.length, 1)
  assert.equal(paged.from, 3)
  assert.equal(paged.to, 3)
  const clamped = mod.paginateRows(rows, 99, 2)
  assert.equal(clamped.page, 2)
  const empty = mod.paginateRows([], 1, 20)
  assert.equal(empty.total, 0)
  assert.equal(empty.totalPages, 1)
  assert.equal(empty.from, 0)
  assert.equal(mod.paginateRows(rows, 1, 500).totalPages, 1)
})

check('团队筛选：状态 + 关键词（名称/角色/任务）', () => {
  const members = [
    mod.normalizeTeamMember({ id: 'm1', name: '司墨', role: '主理人', status: 'running', current_task: '写报告' }, 0),
    mod.normalizeTeamMember({ id: 'm2', name: '研究员', role: '调研', status: 'queued', current_task: '查资料' }, 1),
    mod.normalizeTeamMember({ id: 'm3', name: '写手', role: '写作', status: 'done', current_task: '定稿' }, 2),
  ]
  assert.equal(mod.filterTeamMembers(members, 'all', '').length, 3)
  assert.equal(mod.filterTeamMembers(members, 'running', '').length, 1)
  assert.equal(mod.filterTeamMembers(members, 'all', '研究').length, 1)
  assert.equal(mod.filterTeamMembers(members, 'all', '报告').length, 1)
  assert.equal(mod.filterTeamMembers(members, 'queued', '研究').length, 1)
  assert.equal(mod.filterTeamMembers(members, 'done', '研究').length, 0)
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
const editor = read(resolve(src, 'features/views/ViewEditor.tsx'))
const preview = read(resolve(src, 'features/views/ViewPreview.tsx'))
const teamPage = read(resolve(src, 'features/team/TeamPage.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('表单：校验/提交中/错误高亮/成功刷新', () => {
  assert.match(renderer, /validateForm/)
  assert.match(renderer, /formSubmitting/)
  assert.match(renderer, /formErrors/)
  assert.match(renderer, /aria-invalid/)
  assert.match(renderer, /role="alert"/)
  assert.match(renderer, /formSuccess/)
  assert.match(renderer, /提交中…/)
  assert.match(renderer, /刚刷新|视图已刷新/)
})

check('表格：排序/分页/空态/行操作 loading', () => {
  assert.match(renderer, /sortRows/)
  assert.match(renderer, /paginateRows/)
  assert.match(renderer, /aria-sort/)
  assert.match(renderer, /rowBusy/)
  assert.match(renderer, /上一页/)
  assert.match(renderer, /下一页/)
  assert.match(renderer, /暂无数据/)
})

check('看板：失败保留原状态/无绑定提示/键盘替代', () => {
  assert.match(renderer, /movePending/)
  assert.match(renderer, /moveError/)
  assert.match(renderer, /已保留原状态|保留原列/)
  assert.match(renderer, /无绑定/)
  assert.match(renderer, /键盘替代/)
  assert.match(renderer, /aria-busy/)
})

check('编辑器：块搜索/删除确认/保存状态/未保存离开提示', () => {
  assert.match(editor, /blockQuery/)
  assert.match(editor, /搜索块/)
  assert.match(editor, /window\.confirm/)
  assert.match(editor, /saveState/)
  assert.match(editor, /onDirtyChange/)
  assert.match(editor, /本地编辑已保留/)
  assert.match(preview, /未保存的视图修改/)
  assert.match(preview, /guardLeave/)
})

check('团队页：状态动画/筛选/点击进会话/空态/a11y', () => {
  assert.match(teamPage, /motion-safe:animate-pulse/)
  assert.match(teamPage, /filterTeamMembers/)
  assert.match(teamPage, /aria-pressed/)
  assert.match(teamPage, /进入会话/)
  assert.match(teamPage, /SESSION_SELECT/)
  assert.match(teamPage, /没有匹配的成员/)
  assert.match(teamPage, /role="progressbar"/)
  assert.match(teamPage, /aria-valuenow/)
})

check('门禁链包含 check-m33；无第三方；无 Spec 内部字段', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m33\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

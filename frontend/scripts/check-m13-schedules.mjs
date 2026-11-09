#!/usr/bin/env node
// scripts/check-m13-schedules.mjs —— M13 定时任务 纯逻辑 + 源码约束自测
//
// 覆盖：
//   - schedules/model.ts：列表归一化（snake/camel/trigger 对象）、状态/触发描述、时间/相对时间、
//     时区转换、创建向导校验（一次/间隔/每天/每周/cron）、触发表达式与 POST body；
//   - 源码约束：左栏入口、列表字段、启用开关 role=switch、立即运行/编辑/删除、向导输入与错误提示、
//     接口未就绪降级、门禁链、无 Spec/第三方库。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'features/schedules/model.ts'))}
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

console.log('M13 定时任务自测（前端）')

// ---- 1. 归一化 ----
const snake = {
  id: 'sch-1',
  session_id: 'main',
  session_title: '主会话',
  title: '每天早上整理日报',
  trigger_type: 'daily',
  trigger_expr: '09:00',
  timezone: 'Asia/Shanghai',
  prompt: '整理今天的日程。',
  enabled: true,
  next_run_at: 1794020000000,
  last_run_at: 1794010000000,
  last_status: 'done',
  run_count: 3,
  created_at: 1794000000000,
  updated_at: 1794015000000,
}
const camel = {
  id: 'sch-2',
  sessionId: 'child',
  title: '间隔检查',
  trigger: { type: 'interval', expr: '300' },
  timezone: 'UTC',
  prompt: '检查构建。',
  enabled: false,
  nextRunAt: 1794025000000,
  lastStatus: 'running',
  runCount: 0,
}

check('列表归一化：snake/camel/trigger 对象 + 包装 + 坏条目', () => {
  const list = mod.normalizeScheduleList({ ok: true, schedules: [snake, camel, { title: 'no id' }] })
  assert.equal(list.length, 2)
  assert.equal(list[0].sessionId, 'main')
  assert.equal(list[0].sessionTitle, '主会话')
  assert.equal(list[0].triggerType, 'daily')
  assert.equal(list[0].triggerExpr, '09:00')
  assert.equal(list[0].nextRunAt, 1794020000000)
  assert.equal(list[0].lastStatus, 'done')
  assert.equal(list[0].runCount, 3)
  assert.equal(list[1].triggerType, 'interval')
  assert.equal(list[1].triggerExpr, '300')
  assert.equal(list[1].enabled, false)
  assert.equal(mod.normalizeScheduleList(null).length, 0)
  assert.equal(mod.normalizeScheduleList({ schedules: [] }).length, 0)
})

check('状态归一/文案/色调；触发描述；时间格式', () => {
  assert.equal(mod.normalizeStatus('SUCCESS'), 'done')
  assert.equal(mod.normalizeStatus('error'), 'failed')
  assert.equal(mod.statusLabel('done'), '成功')
  assert.equal(mod.statusLabel(null), '未运行')
  assert.equal(mod.statusTone('failed'), 'danger')
  const daily = mod.normalizeSchedule(snake)
  assert.equal(mod.triggerTypeLabel('once'), '一次')
  assert.equal(mod.describeTrigger(daily), '每天 09:00')
  assert.equal(mod.describeTrigger({ triggerType: 'interval', triggerExpr: '300' }), '每 5 分钟')
  assert.equal(mod.describeTrigger({ triggerType: 'interval', triggerExpr: '7200' }), '每 2 小时')
  assert.equal(mod.describeTrigger({ triggerType: 'weekly', triggerExpr: '1,3,5 09:00' }), '每周周一、周三、周五 09:00')
  assert.equal(mod.describeTrigger({ triggerType: 'cron', triggerExpr: '0 9 * * 1-5' }), 'cron · 0 9 * * 1-5')
  assert.match(mod.formatScheduleTime(1794020000000, 'Asia/Shanghai'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.equal(mod.formatScheduleTime(null), '—')
  assert.equal(mod.formatRelativeTime(1000 + 5 * 60_000, 1000), '5 分钟后')
  assert.equal(mod.formatRelativeTime(1000 - 2 * 3_600_000, 1000), '2 小时前')
  assert.equal(mod.formatRelativeTime(null), '—')
})

check('时区转换：UTC / Asia/Shanghai', () => {
  assert.equal(mod.zonedDateTimeToIso('2030-01-02T03:04', 'UTC'), '2030-01-02T03:04:00.000Z')
  assert.equal(mod.zonedDateTimeToIso('2030-01-02T09:00', 'Asia/Shanghai'), '2030-01-02T01:00:00.000Z')
  assert.equal(mod.zonedDateTimeToIso('bad', 'UTC'), null)
})

// ---- 2. 校验 ----
const now = Date.parse('2030-01-01T00:00:00Z')
const baseDraft = mod.defaultDraft('main', 'UTC')
const withDraft = (patch) => ({ ...baseDraft, title: '任务', prompt: '内容', ...patch })

check('必填校验：名称/会话/内容/时区', () => {
  const empty = mod.validateDraft(mod.defaultDraft('', ''), now)
  assert.equal(empty.ok, false)
  assert.ok(empty.errors.title)
  assert.ok(empty.errors.sessionId)
  assert.ok(empty.errors.prompt)
  assert.ok(empty.errors.timezone)
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'daily', dailyTime: '09:00' }), now).ok, true)
})

check('一次：未来有效 / 过去或格式错误无效', () => {
  const future = mod.validateDraft(withDraft({ triggerType: 'once', onceAt: '2030-06-01T12:00', timezone: 'UTC' }), now)
  assert.equal(future.ok, true)
  const past = mod.validateDraft(withDraft({ triggerType: 'once', onceAt: '2029-12-31T12:00', timezone: 'UTC' }), now)
  assert.equal(past.ok, false)
  assert.match(past.errors.trigger ?? '', /晚于现在/)
  const bad = mod.validateDraft(withDraft({ triggerType: 'once', onceAt: '' }), now)
  assert.equal(bad.ok, false)
})

check('间隔：正整数 + 最小 10 秒', () => {
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'interval', intervalValue: '5', intervalUnit: 'seconds' }), now).ok, false)
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'interval', intervalValue: '30', intervalUnit: 'minutes' }), now).ok, true)
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'interval', intervalValue: '0' }), now).ok, false)
})

check('每天/每周/cron 校验', () => {
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'daily', dailyTime: '25:00' }), now).ok, false)
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'weekly', weeklyDays: [], weeklyTime: '09:00' }), now).ok, false)
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'weekly', weeklyDays: [1, 3], weeklyTime: '09:00' }), now).ok, true)
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'cron', cronExpr: 'not a cron' }), now).ok, false)
  assert.equal(mod.validateDraft(withDraft({ triggerType: 'cron', cronExpr: '0 9 * * 1-5' }), now).ok, true)
  assert.equal(mod.validateCron('*/15 9-17 * * 1-5'), true)
  assert.equal(mod.validateCron('0 0 31 2 *'), true) // 语法合法（2 月 31 日无实际触发由后端处理）
  assert.equal(mod.validateCron('0 24 * * *'), false)
  assert.equal(mod.validateCron('0 9 * *'), false)
})

// ---- 3. 触发表达式 / POST body ----
check('buildTrigger：once(带时区)/interval/daily/weekly/cron', () => {
  const once = mod.buildTrigger(withDraft({ triggerType: 'once', onceAt: '2030-01-02T09:00', timezone: 'Asia/Shanghai' }))
  assert.deepEqual(once, { type: 'once', expr: '2030-01-02T01:00:00.000Z' })
  assert.deepEqual(
    mod.buildTrigger(withDraft({ triggerType: 'interval', intervalValue: '15', intervalUnit: 'minutes' })),
    { type: 'interval', expr: '900' },
  )
  assert.deepEqual(mod.buildTrigger(withDraft({ triggerType: 'daily', dailyTime: '08:30' })), { type: 'daily', expr: '08:30' })
  assert.deepEqual(
    mod.buildTrigger(withDraft({ triggerType: 'weekly', weeklyDays: [5, 1], weeklyTime: '07:00' })),
    { type: 'weekly', expr: '1,5 07:00' },
  )
  assert.deepEqual(mod.buildTrigger(withDraft({ triggerType: 'cron', cronExpr: ' 0 9 * * 1-5 ' })), {
    type: 'cron',
    expr: '0 9 * * 1-5',
  })
})

check('POST body：契约字段 + 扁平兼容字段', () => {
  const body = mod.buildCreateBody(
    withDraft({ triggerType: 'daily', dailyTime: '09:00', timezone: 'Asia/Shanghai', enabled: true }),
  )
  assert.equal(body.sessionId, 'main')
  assert.equal(body.title, '任务')
  assert.equal(body.prompt, '内容')
  assert.equal(body.enabled, true)
  assert.equal(body.timezone, 'Asia/Shanghai')
  assert.deepEqual(body.trigger, { type: 'daily', expr: '09:00' })
  assert.equal(body.triggerType, 'daily')
  assert.equal(body.triggerExpr, '09:00')
  assert.deepEqual(mod.buildToggleBody(false), { enabled: false })
})

check('编辑回填：draftFromSchedule（daily/weekly/interval）', () => {
  const daily = mod.draftFromSchedule(mod.normalizeSchedule(snake))
  assert.equal(daily.triggerType, 'daily')
  assert.equal(daily.dailyTime, '09:00')
  assert.equal(daily.title, '每天早上整理日报')
  const weekly = mod.draftFromSchedule(
    mod.normalizeSchedule({ id: 'w', session_id: 'main', title: '周报', trigger_type: 'weekly', trigger_expr: '1,5 09:00', timezone: 'UTC', prompt: 'x' }),
  )
  assert.deepEqual(weekly.weeklyDays, [1, 5])
  assert.equal(weekly.weeklyTime, '09:00')
  const interval = mod.draftFromSchedule(
    mod.normalizeSchedule({ id: 'i', session_id: 'main', title: '间隔', trigger_type: 'interval', trigger_expr: '900', timezone: 'UTC', prompt: 'x' }),
  )
  assert.equal(interval.intervalValue, '15')
  assert.equal(interval.intervalUnit, 'minutes')
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
const read = (path) => readFileSync(path, 'utf8')
const entryFile = read(resolve(src, 'features/schedules/ScheduleMainView.tsx'))
const manager = read(resolve(src, 'features/schedules/ScheduleManager.tsx'))
const manifest = read(resolve(src, 'features/schedules/manifest.ts'))
const registry = read(resolve(src, 'features/registry.ts'))
const sessionsPanel = read(resolve(src, 'features/sessions/SessionTreePanel.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('M40 顶部「任务/定时任务」内嵌视图 + 注册 + 会话树 flex-1', () => {
  assert.match(manifest, /mainView/)
  assert.match(registry, /schedulesFeature/)
  assert.match(entryFile, /embedded/)
  assert.match(entryFile, /NAV_CLOSED/)
  assert.match(sessionsPanel, /flex min-h-0 flex-1 flex-col/)
})

check('列表字段 + 启用开关 role=switch + 操作按钮', () => {
  assert.match(manager, /下次运行/)
  assert.match(manager, /上次结果/)
  assert.match(manager, /role="switch"/)
  assert.match(manager, /aria-checked={schedule\.enabled}/)
  assert.match(manager, /立即运行/)
  assert.match(manager, /编辑/)
  assert.match(manager, /确认删除/)
  assert.match(manager, /runScheduleNow/)
})

check('创建向导：五种触发 + 时区/会话/内容 + inline 错误', () => {
  assert.match(manager, /TRIGGER_TYPES/)
  assert.match(manager, /datetime-local/)
  assert.match(manager, /type="time"/)
  assert.match(manager, /cron（分 时 日 月 周）/)
  assert.match(manager, /schedule-timezone/)
  assert.match(manager, /目标会话/)
  assert.match(manager, /到点后投递的内容/)
  assert.match(manager, /role="alert"/)
  assert.match(manager, /validateDraft/)
})

check('接口未就绪降级；门禁链；无第三方库；无 Spec', () => {
  assert.match(manager, /尚未就绪/)
  assert.match(packageJson.scripts['check'] ?? '', /check-m13-schedules\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)

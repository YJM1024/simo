// features/schedules/model.ts —— 定时任务模型 / 校验 / 触发表达式（M13，纯逻辑可单测）
//
// 契约：docs/m13-contract.md §2/§4/§5。
//   schedules: id/session_id/title/trigger_type/trigger_expr/timezone/prompt/enabled/
//              next_run_at/last_run_at/last_status/run_count/created_at/updated_at
//   API：GET/POST /api/schedules、GET/PATCH/DELETE /api/schedules/{id}、POST .../run-now
// 列表展示与创建向导的全部纯逻辑放这里，组件只做渲染。

import { isRecord, readNumber, readString } from '../../platform/types.ts'

export const TRIGGER_TYPES = ['once', 'interval', 'daily', 'weekly', 'cron'] as const
export type TriggerType = (typeof TRIGGER_TYPES)[number]

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  once: '一次',
  interval: '间隔',
  daily: '每天',
  weekly: '每周',
  cron: 'cron',
}

export type ScheduleStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | string

export interface ScheduleRecord {
  id: string
  sessionId: string
  sessionTitle: string | null
  title: string
  triggerType: TriggerType
  triggerExpr: string
  timezone: string
  prompt: string
  enabled: boolean
  nextRunAt: number | null
  lastRunAt: number | null
  lastStatus: ScheduleStatus | null
  runCount: number
  createdAt: number | null
  updatedAt: number | null
}

const STATUS_SYNONYMS: Record<string, string> = {
  pending: 'pending',
  queued: 'pending',
  running: 'running',
  done: 'done',
  success: 'done',
  completed: 'done',
  failed: 'failed',
  error: 'failed',
  skipped: 'skipped',
  cancelled: 'skipped',
}

export function normalizeStatus(value: string | undefined): ScheduleStatus | null {
  if (!value) return null
  const normalized = STATUS_SYNONYMS[value.trim().toLowerCase()]
  return normalized ?? value.trim().toLowerCase()
}

export const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  done: '成功',
  failed: '失败',
  skipped: '已跳过',
}

export const STATUS_TONES: Record<string, 'ok' | 'danger' | 'warn' | 'muted' | 'accent'> = {
  pending: 'muted',
  running: 'accent',
  done: 'ok',
  failed: 'danger',
  skipped: 'warn',
}

export function statusLabel(status: ScheduleStatus | null): string {
  if (!status) return '未运行'
  return STATUS_LABELS[status] ?? status
}

export function statusTone(status: ScheduleStatus | null): 'ok' | 'danger' | 'warn' | 'muted' | 'accent' {
  if (!status) return 'muted'
  return STATUS_TONES[status] ?? 'muted'
}

function normalizeTriggerType(value: string | undefined): TriggerType {
  const normalized = (value ?? '').trim().toLowerCase()
  return (TRIGGER_TYPES as readonly string[]).includes(normalized) ? (normalized as TriggerType) : 'once'
}

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function normalizeSchedule(value: unknown): ScheduleRecord | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  const trigger = isRecord(value['trigger']) ? value['trigger'] : null
  const triggerType = normalizeTriggerType(
    readString(value, 'triggerType') ??
      readString(value, 'trigger_type') ??
      (trigger ? readString(trigger, 'type') : undefined),
  )
  const triggerExpr =
    readString(value, 'triggerExpr') ??
    readString(value, 'trigger_expr') ??
    (trigger ? readString(trigger, 'expr') : undefined) ??
    ''
  const sessionRaw = value['session']
  return {
    id,
    sessionId: readString(value, 'sessionId') ?? readString(value, 'session_id') ?? '',
    sessionTitle:
      readString(value, 'sessionTitle') ??
      readString(value, 'session_title') ??
      (isRecord(sessionRaw) ? readString(sessionRaw, 'title') : undefined) ??
      null,
    title: readString(value, 'title') ?? '未命名定时任务',
    triggerType,
    triggerExpr,
    timezone: readString(value, 'timezone') ?? 'UTC',
    prompt: readString(value, 'prompt') ?? '',
    enabled: value['enabled'] === undefined ? true : toBool(value['enabled']),
    nextRunAt: readNumber(value, 'nextRunAt') ?? readNumber(value, 'next_run_at') ?? null,
    lastRunAt: readNumber(value, 'lastRunAt') ?? readNumber(value, 'last_run_at') ?? null,
    lastStatus: normalizeStatus(readString(value, 'lastStatus') ?? readString(value, 'last_status')),
    runCount: readNumber(value, 'runCount') ?? readNumber(value, 'run_count') ?? 0,
    createdAt: readNumber(value, 'createdAt') ?? readNumber(value, 'created_at') ?? null,
    updatedAt: readNumber(value, 'updatedAt') ?? readNumber(value, 'updated_at') ?? null,
  }
}

export function normalizeScheduleList(payload: unknown): ScheduleRecord[] {
  if (!isRecord(payload)) return []
  const raw = Array.isArray(payload['schedules']) ? payload['schedules'] : Array.isArray(payload['items']) ? payload['items'] : []
  return raw.map((entry) => normalizeSchedule(entry)).filter((schedule): schedule is ScheduleRecord => schedule !== null)
}

// ---------------------------------------------------------------------------
// 展示
// ---------------------------------------------------------------------------

export function triggerTypeLabel(type: TriggerType): string {
  return TRIGGER_LABELS[type] ?? type
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 固定格式（本地/指定时区），用于下次运行/上次结果。 */
export function formatScheduleTime(ms: number | null, timezone?: string): string {
  if (ms === null) return '—'
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const map = new Map(parts.map((part) => [part.type, part.value]))
    return `${map.get('year')}-${map.get('month')}-${map.get('day')} ${map.get('hour')}:${map.get('minute')}`
  } catch {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
}

/** 相对时间：x 分钟后 / 已过期 / 现在。 */
export function formatRelativeTime(ms: number | null, now = Date.now()): string {
  if (ms === null) return '—'
  const diff = ms - now
  if (Math.abs(diff) < 60_000) return diff >= 0 ? '即将运行' : '刚过期'
  const minutes = Math.round(Math.abs(diff) / 60_000)
  if (minutes < 60) return diff > 0 ? `${minutes} 分钟后` : `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return diff > 0 ? `${hours} 小时后` : `${hours} 小时前`
  const days = Math.round(hours / 24)
  return diff > 0 ? `${days} 天后` : `${days} 天前`
}

function parseWeekly(expr: string): { days: number[]; time: string } | null {
  const match = /^\s*([\d,]+)\s+(\d{1,2}:\d{2})\s*$/.exec(expr)
  if (!match) return null
  const days = (match[1] ?? '')
    .split(',')
    .map((day) => Number.parseInt(day, 10))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  if (days.length === 0) return null
  return { days, time: match[2] ?? '' }
}

/** 列表里的触发描述（人类可读）。 */
export function describeTrigger(schedule: Pick<ScheduleRecord, 'triggerType' | 'triggerExpr'>): string {
  const { triggerType, triggerExpr } = schedule
  if (triggerType === 'once') return triggerExpr ? `一次 · ${triggerExpr}` : '一次'
  if (triggerType === 'interval') {
    const seconds = Number.parseInt(triggerExpr, 10)
    if (!Number.isFinite(seconds) || seconds <= 0) return `间隔 · ${triggerExpr || '未设置'}`
    if (seconds % 3600 === 0) return `每 ${seconds / 3600} 小时`
    if (seconds % 60 === 0) return `每 ${seconds / 60} 分钟`
    return `每 ${seconds} 秒`
  }
  if (triggerType === 'daily') return `每天 ${triggerExpr || '未设置'}`
  if (triggerType === 'weekly') {
    const parsed = parseWeekly(triggerExpr)
    if (!parsed) return `每周 · ${triggerExpr || '未设置'}`
    const names = ['一', '二', '三', '四', '五', '六', '日']
    return `每周${parsed.days.map((day) => `周${names[day - 1] ?? day}`).join('、')} ${parsed.time}`
  }
  return `cron · ${triggerExpr || '未设置'}`
}

// ---------------------------------------------------------------------------
// 时区 / 触发表达式
// ---------------------------------------------------------------------------

export const COMMON_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function timezoneOptions(): string[] {
  const local = localTimezone()
  return [...new Set([local, ...COMMON_TIMEZONES])]
}

function timezoneOffsetMinutes(timezone: string, utcMs: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(utcMs))
    const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
    const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name)
    if (!match) return 0
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number.parseInt(match[2] ?? '0', 10) * 60 + Number.parseInt(match[3] ?? '0', 10))
  } catch {
    return 0
  }
}

/** 把「本地墙上时间 + 时区」转换成本地时区的 ISO 字符串（毫秒精度到分钟）。 */
export function zonedDateTimeToIso(localDateTime: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localDateTime)
  if (!match) return null
  const [, y, m, d, hh, mm] = match
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm))
  const offset = timezoneOffsetMinutes(timezone, guess)
  const utc = guess - offset * 60_000
  const offset2 = timezoneOffsetMinutes(timezone, utc)
  return new Date(guess - offset2 * 60_000).toISOString()
}

// ---------------------------------------------------------------------------
// 创建/编辑草稿 + 校验
// ---------------------------------------------------------------------------

export interface ScheduleDraft {
  title: string
  sessionId: string
  prompt: string
  triggerType: TriggerType
  onceAt: string
  intervalValue: string
  intervalUnit: 'seconds' | 'minutes' | 'hours'
  dailyTime: string
  weeklyDays: number[]
  weeklyTime: string
  cronExpr: string
  timezone: string
  enabled: boolean
}

export function defaultDraft(sessionId = '', timezone = localTimezone()): ScheduleDraft {
  return {
    title: '',
    sessionId,
    prompt: '',
    triggerType: 'daily',
    onceAt: '',
    intervalValue: '30',
    intervalUnit: 'minutes',
    dailyTime: '09:00',
    weeklyDays: [1, 3, 5],
    weeklyTime: '09:00',
    cronExpr: '0 9 * * 1-5',
    timezone,
    enabled: true,
  }
}

export function draftFromSchedule(schedule: ScheduleRecord): ScheduleDraft {
  const base = defaultDraft(schedule.sessionId, schedule.timezone)
  const draft: ScheduleDraft = {
    ...base,
    title: schedule.title,
    prompt: schedule.prompt,
    triggerType: schedule.triggerType,
    enabled: schedule.enabled,
  }
  if (schedule.triggerType === 'once') {
    // ISO → datetime-local（按 schedule.timezone 展示）
    try {
      const date = new Date(schedule.triggerExpr)
      if (!Number.isNaN(date.getTime())) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: schedule.timezone || undefined,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(date)
        const map = new Map(parts.map((part) => [part.type, part.value]))
        draft.onceAt = `${map.get('year')}-${map.get('month')}-${map.get('day')}T${map.get('hour')}:${map.get('minute')}`
      }
    } catch {
      draft.onceAt = ''
    }
  } else if (schedule.triggerType === 'interval') {
    const seconds = Number.parseInt(schedule.triggerExpr, 10)
    if (Number.isFinite(seconds) && seconds > 0) {
      if (seconds % 3600 === 0) {
        draft.intervalValue = String(seconds / 3600)
        draft.intervalUnit = 'hours'
      } else if (seconds % 60 === 0) {
        draft.intervalValue = String(seconds / 60)
        draft.intervalUnit = 'minutes'
      } else {
        draft.intervalValue = String(seconds)
        draft.intervalUnit = 'seconds'
      }
    }
  } else if (schedule.triggerType === 'daily') {
    draft.dailyTime = schedule.triggerExpr || draft.dailyTime
  } else if (schedule.triggerType === 'weekly') {
    const parsed = parseWeekly(schedule.triggerExpr)
    if (parsed) {
      draft.weeklyDays = parsed.days
      draft.weeklyTime = parsed.time
    }
  } else if (schedule.triggerType === 'cron') {
    draft.cronExpr = schedule.triggerExpr || draft.cronExpr
  }
  return draft
}

export interface DraftErrors {
  title?: string
  sessionId?: string
  prompt?: string
  timezone?: string
  trigger?: string
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function validateCronField(field: string, min: number, max: number): boolean {
  if (field === '*') return true
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw === undefined ? null : Number.parseInt(stepRaw, 10)
    if (stepRaw !== undefined && (!Number.isInteger(step) || (step ?? 0) <= 0)) return false
    const [startRaw, endRaw] = (range ?? '').split('-')
    const start = startRaw === '*' ? min : Number.parseInt(startRaw ?? '', 10)
    const end = endRaw === undefined ? start : endRaw === '*' ? max : Number.parseInt(endRaw, 10)
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false
    if (start < min || end > max || start > end) return false
  }
  return true
}

export function validateCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  return (
    validateCronField(fields[0] ?? '', 0, 59) &&
    validateCronField(fields[1] ?? '', 0, 23) &&
    validateCronField(fields[2] ?? '', 1, 31) &&
    validateCronField(fields[3] ?? '', 1, 12) &&
    validateCronField(fields[4] ?? '', 0, 7)
  )
}

export function validateDraft(draft: ScheduleDraft, now = Date.now()): { errors: DraftErrors; ok: boolean } {
  const errors: DraftErrors = {}
  if (!draft.title.trim()) errors.title = '请填写名称'
  if (!draft.sessionId.trim()) errors.sessionId = '请选择目标会话'
  if (!draft.prompt.trim()) errors.prompt = '请填写到点后要执行的内容'
  if (!draft.timezone.trim()) errors.timezone = '请选择时区'

  if (draft.triggerType === 'once') {
    if (!draft.onceAt) {
      errors.trigger = '请选择运行时间'
    } else {
      const iso = zonedDateTimeToIso(draft.onceAt, draft.timezone || 'UTC')
      const at = iso ? Date.parse(iso) : NaN
      if (Number.isNaN(at)) errors.trigger = '时间格式不正确'
      else if (at <= now) errors.trigger = '运行时间必须晚于现在'
    }
  } else if (draft.triggerType === 'interval') {
    const value = Number(draft.intervalValue)
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      errors.trigger = '间隔必须是正整数'
    } else {
      const seconds = value * (draft.intervalUnit === 'hours' ? 3600 : draft.intervalUnit === 'minutes' ? 60 : 1)
      if (seconds < 10) errors.trigger = '间隔不能小于 10 秒'
    }
  } else if (draft.triggerType === 'daily') {
    if (!HHMM.test(draft.dailyTime)) errors.trigger = '每天时间格式应为 HH:MM'
  } else if (draft.triggerType === 'weekly') {
    if (draft.weeklyDays.length === 0) errors.trigger = '请至少选择一个星期'
    if (!HHMM.test(draft.weeklyTime)) errors.trigger = errors.trigger ?? '时间格式应为 HH:MM'
  } else if (draft.triggerType === 'cron') {
    if (!validateCron(draft.cronExpr)) errors.trigger = 'cron 需为 5 段合法表达式（分 时 日 月 周）'
  }

  return { errors, ok: Object.keys(errors).length === 0 }
}

/** 草稿 → 触发 {type,expr}（once 使用选定时间的 ISO）。 */
export function buildTrigger(draft: ScheduleDraft): { type: TriggerType; expr: string } {
  if (draft.triggerType === 'once') {
    return { type: 'once', expr: zonedDateTimeToIso(draft.onceAt, draft.timezone || 'UTC') ?? draft.onceAt }
  }
  if (draft.triggerType === 'interval') {
    const value = Number.parseInt(draft.intervalValue, 10) || 0
    const seconds = value * (draft.intervalUnit === 'hours' ? 3600 : draft.intervalUnit === 'minutes' ? 60 : 1)
    return { type: 'interval', expr: String(seconds) }
  }
  if (draft.triggerType === 'daily') return { type: 'daily', expr: draft.dailyTime.trim() }
  if (draft.triggerType === 'weekly') {
    return { type: 'weekly', expr: `${[...draft.weeklyDays].sort((a, b) => a - b).join(',')} ${draft.weeklyTime.trim()}` }
  }
  return { type: 'cron', expr: draft.cronExpr.trim() }
}

/** POST body：契约字段 + 扁平兼容字段（后端字段命名不同也能识别）。 */
export function buildCreateBody(draft: ScheduleDraft): Record<string, unknown> {
  const trigger = buildTrigger(draft)
  return {
    sessionId: draft.sessionId.trim(),
    title: draft.title.trim(),
    prompt: draft.prompt.trim(),
    enabled: draft.enabled,
    timezone: draft.timezone.trim(),
    trigger,
    triggerType: trigger.type,
    triggerExpr: trigger.expr,
  }
}

/** PATCH body：编辑全量字段或仅启停。 */
export function buildUpdateBody(draft: ScheduleDraft): Record<string, unknown> {
  return buildCreateBody(draft)
}

export function buildToggleBody(enabled: boolean): Record<string, unknown> {
  return { enabled }
}

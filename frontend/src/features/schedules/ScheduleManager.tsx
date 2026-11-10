// features/schedules/ScheduleManager.tsx —— 定时任务管理（M13 / M67 视觉）
//
// 列表：名称/目标会话/下次运行/上次结果/启用开关；操作：启停、立即运行、删除；
// 创建/编辑向导：触发方式（一次/间隔/每天/每周/cron）+ 时间/时区/目标会话/内容，
// 非法输入 inline 提示；接口未就绪时优雅降级（后端 M13 实现中）。
//
// M67：暖白纸面 + 1000px 内容列 + 1px 分隔线；列表为轻边框行，表单改为 12px 圆角浮层。
// 数据请求、状态流转与所有动作处理保持不变。

import { useCallback, useEffect, useRef, useState } from 'react'
import { HttpError, getSessions, toSessions } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import type { SessionSummary } from '../../platform/types.ts'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import {
  TRIGGER_TYPES,
  buildCreateBody,
  buildToggleBody,
  buildUpdateBody,
  defaultDraft,
  describeTrigger,
  draftFromSchedule,
  formatRelativeTime,
  formatScheduleTime,
  localTimezone,
  normalizeScheduleList,
  statusLabel,
  statusTone,
  timezoneOptions,
  triggerTypeLabel,
  validateDraft,
  type DraftErrors,
  type ScheduleDraft,
  type ScheduleRecord,
  type TriggerType,
} from './model.ts'
import {
  createSchedule,
  deleteSchedule,
  getSchedules,
  runScheduleNow,
  updateSchedule,
} from './rest.ts'

interface ScheduleManagerProps {
  defaultSessionId: string
  onClose: () => void
  onChanged?: () => void
}

interface WizardState {
  mode: 'create' | 'edit'
  id: string | null
  draft: ScheduleDraft
}

const STATUS_TONE_CLASS: Record<'ok' | 'danger' | 'warn' | 'muted' | 'accent', string> = {
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  accent: 'border-accent-border bg-accent-soft text-accent-hover',
  muted: 'border-border-subtle bg-surface-sunken text-muted',
}

const TRIGGER_TONE = 'border-border-subtle bg-surface-sunken text-muted'

// 页面级按钮：黑色主按钮 / 白底 1px 描边次按钮（原型控件的 5~7px 圆角）
const BTN_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border text-[11.5px] transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50'
const BTN_PRIMARY = `${BTN_BASE} border-ink bg-ink text-ink-inverse hover:bg-ink-secondary`
const BTN_SECONDARY = `${BTN_BASE} border-border bg-surface-solid text-ink-secondary hover:bg-surface-sunken`
// 行内动作：更小的一档
const ROW_BTN =
  'inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-xs border border-border bg-surface-solid px-2 text-[11px] text-ink-secondary transition-colors duration-fast hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'
const ROW_BTN_DANGER =
  'inline-flex h-[26px] cursor-pointer items-center rounded-xs border border-transparent px-2 text-[11px] text-danger-ink transition-colors duration-fast hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50'

const FIELD_LABEL = 'mb-1.5 block text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary'
const INPUT_CLASS =
  'h-[31px] w-full rounded-sm border border-border bg-surface-solid px-2.5 text-[12px] text-ink outline-none transition-colors duration-fast placeholder:text-muted focus:border-accent focus:shadow-focus'
const TEXTAREA_CLASS =
  'min-h-[76px] w-full resize-y rounded-sm border border-border bg-surface-solid px-2.5 py-2 text-[12px] leading-relaxed text-ink outline-none transition-colors duration-fast placeholder:text-muted focus:border-accent focus:shadow-focus'

function nextRunText(schedule: ScheduleRecord): string {
  if (schedule.nextRunAt === null || schedule.nextRunAt <= 0) {
    return schedule.triggerType === 'once' ? '已结束' : '无下次运行'
  }
  const expired = schedule.nextRunAt < Date.now()
  if (expired) return schedule.triggerType === 'once' ? '已结束' : `已过期（${formatRelativeTime(schedule.nextRunAt)}）`
  return `${formatScheduleTime(schedule.nextRunAt)}（${formatRelativeTime(schedule.nextRunAt)}）`
}

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请稍后重试'
    if (error.status === 404 || error.status === 405) return '定时任务接口尚未就绪（后端 M13 实现中）'
    return error.message || '请求失败'
  }
  return error instanceof Error && error.message ? error.message : '请求失败'
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="m-0 mt-1 text-[10.5px] text-danger-ink">
      {message}
    </p>
  )
}

export default function ScheduleManager({ defaultSessionId, onClose, onChanged, embedded = false }: ScheduleManagerProps & { embedded?: boolean }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, !embedded, onClose)

  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [wizard, setWizard] = useState<WizardState | null>(null)
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({})
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      setUnavailable(false)
      try {
        const payload = await getSchedules()
        if (signal?.aborted) return
        setSchedules(normalizeScheduleList(payload))
      } catch (cause) {
        if (signal?.aborted) return
        const message = errorText(cause)
        if (message.includes('尚未就绪')) {
          setUnavailable(true)
          setSchedules([])
        } else {
          setError(message)
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    void getSessions()
      .then((payload) => setSessions(toSessions(payload)))
      .catch(() => setSessions([]))
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const finish = useCallback(
    (message: string) => {
      setNotice(message)
      void load()
      onChanged?.()
    },
    [load, onChanged],
  )

  const openCreate = useCallback(() => {
    setWizard({ mode: 'create', id: null, draft: defaultDraft(defaultSessionId, localTimezone()) })
    setDraftErrors({})
    setNotice(null)
  }, [defaultSessionId])

  const openEdit = useCallback((schedule: ScheduleRecord) => {
    setWizard({ mode: 'edit', id: schedule.id, draft: draftFromSchedule(schedule) })
    setDraftErrors({})
    setNotice(null)
  }, [])

  const updateDraft = useCallback((patch: Partial<ScheduleDraft>) => {
    setWizard((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current))
  }, [])

  const save = useCallback(async () => {
    if (!wizard) return
    const validation = validateDraft(wizard.draft)
    setDraftErrors(validation.errors)
    if (!validation.ok) return
    setSaving(true)
    setNotice(null)
    try {
      if (wizard.mode === 'create') {
        await createSchedule(buildCreateBody(wizard.draft))
      } else if (wizard.id) {
        await updateSchedule(wizard.id, buildUpdateBody(wizard.draft))
      }
      setWizard(null)
      finish(wizard.mode === 'create' ? '定时任务已创建' : '定时任务已更新')
    } catch (cause) {
      const message = errorText(cause)
      setNotice(message)
      bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '保存定时任务失败', detail: message })
    } finally {
      setSaving(false)
    }
  }, [wizard, finish])

  const toggle = useCallback(
    async (schedule: ScheduleRecord) => {
      setBusyId(schedule.id)
      setNotice(null)
      try {
        await updateSchedule(schedule.id, buildToggleBody(!schedule.enabled))
        finish(schedule.enabled ? '已暂停定时任务' : '已启用定时任务')
      } catch (cause) {
        const message = errorText(cause)
        setNotice(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '切换定时任务失败', detail: message })
      } finally {
        setBusyId(null)
      }
    },
    [finish],
  )

  const runNow = useCallback(
    async (schedule: ScheduleRecord) => {
      setBusyId(schedule.id)
      setNotice(null)
      try {
        await runScheduleNow(schedule.id)
        finish('已触发一次，结果会按普通汇报消息回到目标会话')
      } catch (cause) {
        const message = errorText(cause)
        setNotice(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '立即运行失败', detail: message })
      } finally {
        setBusyId(null)
      }
    },
    [finish],
  )

  const remove = useCallback(
    async (schedule: ScheduleRecord) => {
      setBusyId(schedule.id)
      setNotice(null)
      try {
        await deleteSchedule(schedule.id)
        setConfirmDeleteId(null)
        finish('定时任务已删除')
      } catch (cause) {
        const message = errorText(cause)
        setNotice(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '删除定时任务失败', detail: message })
      } finally {
        setBusyId(null)
      }
    },
    [finish],
  )

  const draft = wizard?.draft ?? null
  const errors = draftErrors

  return (
    <div
      className={embedded ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col bg-canvas' : 'fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-4'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="定时任务管理"
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={embedded ? 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-canvas' : 'popover-surface flex max-h-[88vh] w-full max-w-[1000px] flex-col overflow-hidden'}
      >
        <header className="flex-none border-b border-border">
          <div className="mx-auto flex w-full max-w-[1000px] flex-wrap items-start justify-between gap-3 px-6 py-4">
            <div className="min-w-0">
              <h2 className="m-0 font-serif text-[18px] font-medium tracking-[-0.01em] text-ink">定时任务</h2>
              <p className="m-0 mt-1 text-[11px] leading-relaxed text-muted">
                到点向目标会话投递内容；执行结果按普通汇报消息回到该会话。启用/停用、立即运行、删除都在这里。
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <button type="button" onClick={openCreate} className={`${BTN_PRIMARY} h-[30px] px-3`}>
                新建定时任务
              </button>
              <button type="button" onClick={onClose} className={`${BTN_SECONDARY} h-[30px] px-3`}>
                关闭 ×
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1000px] px-6 py-4">
            {notice && !wizard && (
              <p
                role="status"
                className="m-0 mb-3 rounded-sm border border-border-subtle bg-surface-sunken px-2.5 py-1.5 text-[11px] text-ink-secondary"
              >
                {notice}
              </p>
            )}

            {loading && <p className="m-0 py-10 text-center text-[11px] text-muted">加载定时任务…</p>}

            {!loading && unavailable && (
              <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
                <p className="m-0 text-[11px] leading-relaxed text-muted">定时任务接口尚未就绪（后端 M13 实现中）。</p>
                <button type="button" onClick={() => void load()} className={`${BTN_SECONDARY} mt-3 h-[30px] px-3`}>
                  重试
                </button>
              </div>
            )}

            {!loading && !unavailable && error && (
              <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
                <p className="m-0 text-[11px] leading-relaxed text-danger-ink">{error}</p>
                <button type="button" onClick={() => void load()} className={`${BTN_SECONDARY} mt-3 h-[30px] px-3`}>
                  重试
                </button>
              </div>
            )}

            {!loading && !unavailable && !error && schedules.length === 0 && (
              <div className="flex min-h-[52vh] flex-col items-center justify-center text-center">
                <p className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em] text-ink">还没有定时任务</p>
                <p className="m-0 mt-1.5 max-w-[360px] text-[11px] leading-relaxed text-muted">
                  创建后到点会向目标会话投递内容，执行结果按普通汇报消息回来。
                </p>
                <button type="button" onClick={openCreate} className={`${BTN_PRIMARY} mt-4 h-[30px] px-3`}>
                  新建定时任务
                </button>
              </div>
            )}

            {!loading && schedules.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="定时任务列表">
                {schedules.map((schedule) => {
                  const tone = statusTone(schedule.lastStatus)
                  const busy = busyId === schedule.id
                  const deleted = confirmDeleteId === schedule.id
                  return (
                    <li
                      key={schedule.id}
                      className={`rounded-md border border-border px-3 py-2.5 transition-colors duration-fast ${
                        schedule.enabled ? 'bg-surface-solid' : 'bg-surface-sunken'
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span
                              className={`min-w-0 max-w-[18rem] truncate text-[12px] font-medium ${schedule.enabled ? 'text-ink' : 'text-muted'}`}
                              title={schedule.title}
                            >
                              {schedule.title}
                            </span>
                            <span className={`rounded-xs border px-1.5 py-px text-[10px] ${TRIGGER_TONE}`}>
                              {triggerTypeLabel(schedule.triggerType)}
                            </span>
                          </div>
                          <p className="m-0 mt-1 text-[10.5px] text-muted">
                            目标会话 {schedule.sessionTitle ?? schedule.sessionId} · {describeTrigger(schedule)}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={schedule.enabled}
                          aria-label={`${schedule.enabled ? '停用' : '启用'}定时任务 ${schedule.title}`}
                          onClick={() => void toggle(schedule)}
                          disabled={busy}
                          className="flex flex-none cursor-pointer items-center gap-2 text-[11px] text-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span
                            aria-hidden="true"
                            className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-fast ${
                              schedule.enabled ? 'border-ink bg-ink' : 'border-border bg-surface-sunken'
                            }`}
                          >
                            <span
                              className={`absolute h-4 w-4 rounded-full bg-surface-solid shadow-sm transition-transform duration-fast ${
                                schedule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                              }`}
                            />
                          </span>
                          {schedule.enabled ? '已启用' : '已停用'}
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-muted">
                        <span>下次运行 {nextRunText(schedule)}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          上次结果
                          <span className={`rounded-xs border px-1.5 py-px text-[10px] ${STATUS_TONE_CLASS[tone]}`}>
                            {statusLabel(schedule.lastStatus)}
                          </span>
                          {schedule.lastRunAt !== null && <span>{formatScheduleTime(schedule.lastRunAt)}</span>}
                          {schedule.runCount > 0 && <span>已运行 {schedule.runCount} 次</span>}
                        </span>
                      </div>

                      {schedule.prompt && (
                        <p
                          className="m-0 mt-1.5 line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-secondary"
                          title={schedule.prompt}
                        >
                          {schedule.prompt}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void runNow(schedule)}
                          disabled={busy}
                          className={ROW_BTN}
                          title="立即触发一次（结果回到目标会话）"
                        >
                          立即运行
                        </button>
                        <button type="button" onClick={() => openEdit(schedule)} disabled={busy} className={ROW_BTN}>
                          编辑
                        </button>
                        {deleted ? (
                          <span className="flex flex-wrap items-center gap-1.5 rounded-xs border border-danger-border bg-danger-soft px-1.5 py-0.5 text-[12px] text-danger-ink">
                            确认删除？
                            <button
                              type="button"
                              onClick={() => void remove(schedule)}
                              disabled={busy}
                              className="cursor-pointer text-[11px] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              删除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="cursor-pointer text-[11px] underline underline-offset-2"
                            >
                              取消
                            </button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirmDeleteId(schedule.id)} disabled={busy} className={ROW_BTN_DANGER}>
                            删除
                          </button>
                        )}
                        {busy && <span className="font-mono text-[10.5px] text-muted">处理中…</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex-none border-t border-border">
          <div className="mx-auto flex w-full max-w-[1000px] items-center gap-3 px-6 py-2 text-[10px] text-muted">
            <span>时间按所选时区计算；列表按本地时间显示；执行结果以普通汇报消息出现在目标会话。</span>
          </div>
        </footer>

        {wizard && draft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-scrim-strong p-4"
            role="dialog"
            aria-modal="true"
            aria-label={wizard.mode === 'create' ? '新建定时任务' : '编辑定时任务'}
          >
            <form
              className="popover-surface flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
              noValidate
            >
              <header className="flex flex-none items-start justify-between gap-3 border-b border-border px-[18px] py-4">
                <div className="min-w-0">
                  <h2 className="m-0 font-serif text-[18px] font-medium text-ink">
                    {wizard.mode === 'create' ? '新建定时任务' : '编辑定时任务'}
                  </h2>
                  <p className="m-0 mt-1 text-[10.5px] text-muted">到点向目标会话投递内容；执行结果按普通汇报消息回到该会话。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWizard(null)}
                  aria-label="关闭表单"
                  className="grid h-6 w-6 flex-none cursor-pointer place-items-center rounded-sm text-[14px] text-muted hover:bg-surface-sunken hover:text-ink"
                >
                  ×
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-1 pb-5">
                {notice && (
                  <p
                    role="status"
                    className="m-0 mb-3 rounded-sm border border-border-subtle bg-surface-sunken px-2.5 py-1.5 text-[11px] text-ink-secondary"
                  >
                    {notice}
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-title" className={FIELD_LABEL}>
                      名称
                    </label>
                    <input
                      id="schedule-title"
                      value={draft.title}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                      className={INPUT_CLASS}
                      placeholder="例如：每天早上整理日报"
                      aria-invalid={Boolean(errors.title)}
                      aria-describedby={errors.title ? 'schedule-title-error' : undefined}
                    />
                    <FieldError id="schedule-title-error" message={errors.title} />
                  </div>

                  <div>
                    <label htmlFor="schedule-session" className={FIELD_LABEL}>
                      目标会话
                    </label>
                    {sessions.length > 0 ? (
                      <select
                        id="schedule-session"
                        value={draft.sessionId}
                        onChange={(event) => updateDraft({ sessionId: event.target.value })}
                        className={INPUT_CLASS}
                        aria-invalid={Boolean(errors.sessionId)}
                      >
                        <option value="">选择会话…</option>
                        {sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.title || session.id}
                          </option>
                        ))}
                        {draft.sessionId && !sessions.some((session) => session.id === draft.sessionId) && (
                          <option value={draft.sessionId}>{draft.sessionId}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        id="schedule-session"
                        value={draft.sessionId}
                        onChange={(event) => updateDraft({ sessionId: event.target.value })}
                        className={INPUT_CLASS}
                        placeholder="会话 id（如 main）"
                        aria-invalid={Boolean(errors.sessionId)}
                      />
                    )}
                    <FieldError id="schedule-session-error" message={errors.sessionId} />
                  </div>
                </div>

                <fieldset className="m-0 border-x-0 border-t-0 border-b border-border-subtle p-0 pb-3.5 pt-1">
                  <legend className={`${FIELD_LABEL} p-0`}>触发方式</legend>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="触发方式">
                    {TRIGGER_TYPES.map((type: TriggerType) => {
                      const active = draft.triggerType === type
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateDraft({ triggerType: type })}
                          aria-pressed={active}
                          className={`h-[26px] cursor-pointer rounded-xs border px-2.5 text-[11px] transition-colors duration-fast ${
                            active
                              ? 'border-border bg-surface-sunken font-medium text-ink'
                              : 'border-border-subtle bg-surface-solid text-muted hover:border-border hover:text-ink'
                          }`}
                        >
                          {triggerTypeLabel(type)}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-2.5">
                    {draft.triggerType === 'once' && (
                      <div>
                        <label htmlFor="schedule-once" className={FIELD_LABEL}>
                          运行时间
                        </label>
                        <input
                          id="schedule-once"
                          type="datetime-local"
                          value={draft.onceAt}
                          onChange={(event) => updateDraft({ onceAt: event.target.value })}
                          className={INPUT_CLASS}
                          aria-invalid={Boolean(errors.trigger)}
                        />
                      </div>
                    )}
                    {draft.triggerType === 'interval' && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label htmlFor="schedule-interval" className={FIELD_LABEL}>
                            每隔
                          </label>
                          <input
                            id="schedule-interval"
                            type="number"
                            min={1}
                            value={draft.intervalValue}
                            onChange={(event) => updateDraft({ intervalValue: event.target.value })}
                            className={`${INPUT_CLASS} w-24`}
                            aria-invalid={Boolean(errors.trigger)}
                          />
                        </div>
                        <select
                          aria-label="间隔单位"
                          value={draft.intervalUnit}
                          onChange={(event) =>
                            updateDraft({ intervalUnit: event.target.value as ScheduleDraft['intervalUnit'] })
                          }
                          className={`${INPUT_CLASS} w-24`}
                        >
                          <option value="seconds">秒</option>
                          <option value="minutes">分钟</option>
                          <option value="hours">小时</option>
                        </select>
                      </div>
                    )}
                    {draft.triggerType === 'daily' && (
                      <div>
                        <label htmlFor="schedule-daily" className={FIELD_LABEL}>
                          每天时间
                        </label>
                        <input
                          id="schedule-daily"
                          type="time"
                          value={draft.dailyTime}
                          onChange={(event) => updateDraft({ dailyTime: event.target.value })}
                          className={`${INPUT_CLASS} w-32`}
                          aria-invalid={Boolean(errors.trigger)}
                        />
                      </div>
                    )}
                    {draft.triggerType === 'weekly' && (
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <span className={FIELD_LABEL}>星期</span>
                          <div className="flex gap-1" role="group" aria-label="星期">
                            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                              const names = ['一', '二', '三', '四', '五', '六', '日']
                              const active = draft.weeklyDays.includes(day)
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() =>
                                    updateDraft({
                                      weeklyDays: active
                                        ? draft.weeklyDays.filter((item) => item !== day)
                                        : [...draft.weeklyDays, day],
                                    })
                                  }
                                  aria-pressed={active}
                                  aria-label={`周${names[day - 1]}`}
                                  className={`h-[26px] w-7 cursor-pointer rounded-xs border text-[11px] transition-colors duration-fast ${
                                    active
                                      ? 'border-border bg-surface-sunken font-medium text-ink'
                                      : 'border-border-subtle bg-surface-solid text-muted hover:border-border hover:text-ink'
                                  }`}
                                >
                                  {names[day - 1]}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <label htmlFor="schedule-weekly-time" className={FIELD_LABEL}>
                            时间
                          </label>
                          <input
                            id="schedule-weekly-time"
                            type="time"
                            value={draft.weeklyTime}
                            onChange={(event) => updateDraft({ weeklyTime: event.target.value })}
                            className={`${INPUT_CLASS} w-32`}
                            aria-invalid={Boolean(errors.trigger)}
                          />
                        </div>
                      </div>
                    )}
                    {draft.triggerType === 'cron' && (
                      <div>
                        <label htmlFor="schedule-cron" className={FIELD_LABEL}>
                          cron（分 时 日 月 周）
                        </label>
                        <input
                          id="schedule-cron"
                          value={draft.cronExpr}
                          onChange={(event) => updateDraft({ cronExpr: event.target.value })}
                          className={`${INPUT_CLASS} font-mono`}
                          placeholder="0 9 * * 1-5"
                          aria-invalid={Boolean(errors.trigger)}
                        />
                      </div>
                    )}
                    <FieldError id="schedule-trigger-error" message={errors.trigger} />
                  </div>
                </fieldset>

                <div className="grid grid-cols-1 gap-3 border-b border-border-subtle py-3.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="schedule-timezone" className={FIELD_LABEL}>
                      时区
                    </label>
                    <select
                      id="schedule-timezone"
                      value={draft.timezone}
                      onChange={(event) => updateDraft({ timezone: event.target.value })}
                      className={INPUT_CLASS}
                      aria-invalid={Boolean(errors.timezone)}
                    >
                      {!timezoneOptions().includes(draft.timezone) && (
                        <option value={draft.timezone}>{draft.timezone}</option>
                      )}
                      {timezoneOptions().map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                    <FieldError id="schedule-timezone-error" message={errors.timezone} />
                  </div>
                  <div>
                    <span className={FIELD_LABEL}>状态</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.enabled}
                      onClick={() => updateDraft({ enabled: !draft.enabled })}
                      className="flex h-[31px] w-full cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-solid px-2.5 text-[11px] text-ink-secondary"
                    >
                      <span
                        aria-hidden="true"
                        className={`relative inline-flex h-4 w-7 flex-none items-center rounded-full transition-colors duration-fast ${
                          draft.enabled ? 'bg-ink' : 'bg-surface-sunken'
                        }`}
                      >
                        <span
                          className={`absolute h-3 w-3 rounded-full bg-surface-solid shadow-sm transition-transform duration-fast ${
                            draft.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                      创建后立即启用
                    </button>
                  </div>
                </div>

                <div className="pt-3.5">
                  <label htmlFor="schedule-prompt" className={FIELD_LABEL}>
                    到点后投递的内容
                  </label>
                  <textarea
                    id="schedule-prompt"
                    value={draft.prompt}
                    onChange={(event) => updateDraft({ prompt: event.target.value })}
                    rows={3}
                    className={TEXTAREA_CLASS}
                    placeholder="例如：整理今天的日程并汇报需要我确认的事项。"
                    aria-invalid={Boolean(errors.prompt)}
                    aria-describedby={errors.prompt ? 'schedule-prompt-error' : undefined}
                  />
                  <FieldError id="schedule-prompt-error" message={errors.prompt} />
                </div>
              </div>

              <footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-border px-[18px] py-3">
                <span className="text-[10px] text-muted">时间按所选时区计算；到点后回到目标会话。</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setWizard(null)} className={`${BTN_SECONDARY} h-[31px] px-3.5`}>
                    取消
                  </button>
                  <button type="submit" disabled={saving} className={`${BTN_PRIMARY} h-[31px] px-3.5`}>
                    {saving ? '保存中…' : wizard.mode === 'create' ? '创建定时任务' : '保存修改'}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

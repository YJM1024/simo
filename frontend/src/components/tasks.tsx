import { useEffect, useMemo, useRef, useState } from 'react'
import type { DeliverableGroup, Message, TaskCounts, TaskDetailPayload, TaskFile, TaskGraphPayload, TaskStep, TaskView, TraceItem } from '../types'
import { badgeText, currentStepId } from '../taskEvents'

/** P1-CONV §17 任务域视图组件。样式全部走 components.css 的 `task-*` / `insp-*` 选择器。 */

const STATUS_LABEL: Record<string, string> = { pending: '未开始', queued: '排队中', blocked: '已阻塞', running: '进行中', failed: '失败', cancelled: '已取消', interrupted: '已中断', done: '已完成' }
const WAITING_LABEL: Record<string, string> = { dependency: '等待前置', depends: '等待前置', confirmation: '等待确认', resource: '等待资源' }
const MODE_LABEL: Record<string, string> = { plan: '计划', explore: '边做边想' }
const TRACE_LABEL: Record<string, string> = { think: '思考', action: '动作', observe: '观察', tool: '工具', text: '文本' }
const FILTER_LABEL: Record<TaskFilter, string> = { all: '全部', running: '进行中', failed: '失败', done: '已完成' }
// 轨迹分页：首屏 200 条，每次补 200 条，上限 500 条（前端 §17.7.3，plan 与 explore 同一套）。
const TRACE_PAGE_SIZE = 200
const TRACE_CAP = 500

export type TaskFilter = 'all' | 'running' | 'failed' | 'done'
export const TASK_FILTERS: TaskFilter[] = ['all', 'running', 'failed', 'done']

export function statusLabel(status: string | undefined): string {
  return (status && STATUS_LABEL[status]) || status || '未开始'
}

export function waitingLabel(reason: string | undefined): string | null {
  if (!reason) return null
  return WAITING_LABEL[reason] ?? reason
}

export function modeLabel(mode: string | undefined): string {
  return (mode && MODE_LABEL[mode]) || '计划'
}

export function traceLabel(category: string | undefined): string {
  // 未知类别原样显示，不回退成「思考」（前端 §17.7.3）。
  return (category && TRACE_LABEL[category]) || category || '动作'
}

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

/** 卡脚与交付物里的钟点：HH:MM（前端 §17.4.3）。 */
export function formatClock(ms: number | undefined): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** 轨迹时间 HH:MM:SS（前端 §17.5.3）。 */
export function formatClockSec(ms: number | undefined): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/**
 * 把任务列表的行对齐到滚动口顶：目标行顶 − 滚动口顶 − 4（前端 §17.4.1 的 0–8px 落点）。
 * 返回落点值，供 500ms 复测断言使用（F-CONV-009-07 要求复测 ±1px）。
 */
export function alignTaskListJump(scroller: HTMLElement, target: HTMLElement): number {
  const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 4
  scroller.scrollTop += offset
  return target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
}

/** 步骤刻度：总段数不超过 12，超过时相邻步骤合并（前端 §17.4.3）。 */
export function stepTicks(steps: Array<{ status: string }>): Array<'done' | 'running' | 'failed' | 'idle'> {
  if (steps.length === 0) return []
  const size = steps.length <= 12 ? 1 : Math.ceil(steps.length / 12)
  const ticks: Array<'done' | 'running' | 'failed' | 'idle'> = []
  for (let index = 0; index < steps.length; index += size) {
    const group = steps.slice(index, index + size)
    if (group.some((step) => step.status === 'failed')) ticks.push('failed')
    else if (group.some((step) => step.status === 'running')) ticks.push('running')
    else if (group.every((step) => step.status === 'done' || step.status === 'skipped')) ticks.push('done')
    else ticks.push('idle')
  }
  return ticks
}

/** 右栏任务按钮上的进行中角标：0 不渲染，1–9 数字，≥10 显示 9+。 */
export function TaskBadge({ count, className = '' }: { count: number; className?: string }): React.ReactNode {
  const text = badgeText(count)
  if (text === null) return null
  return <span className={`insp-badge${className ? ` ${className}` : ''}`} aria-hidden="true">{text}</span>
}

export function TaskFilterBar({ filter, counts, onChange }: { filter: TaskFilter; counts: TaskCounts; onChange: (filter: TaskFilter) => void }): React.ReactNode {
  const countOf = (key: TaskFilter): number => (key === 'all' ? counts.all : counts[key])
  return (
    <div className="task-filter" role="group" aria-label="任务筛选">
      {TASK_FILTERS.map((key) => (
        <button key={key} type="button" className={filter === key ? 'task-filter-chip is-active' : 'task-filter-chip'} aria-pressed={filter === key} aria-controls="task-list" onClick={() => onChange(key)}>
          {FILTER_LABEL[key]} <span className="task-filter-count">{countOf(key)}</span>
        </button>
      ))}
    </div>
  )
}

const EMPTY_COUNTS: TaskCounts = { all: 0, pending: 0, running: 0, failed: 0, done: 0 }

export function TasksTab({ tasks, counts = EMPTY_COUNTS, filter, loading, error = '', hasMore = false, jumpTaskId, onFilterChange, onOpenTask, onLoadMore, onRetry }: {
  tasks: TaskView[]
  counts?: TaskCounts
  filter: TaskFilter
  loading: boolean
  error?: string
  hasMore?: boolean
  jumpTaskId?: string | null
  onFilterChange: (filter: TaskFilter) => void
  onOpenTask: (task: TaskView) => void
  onLoadMore?: () => void
  onRetry?: () => void
}): React.ReactNode {
  // 跳转落点的代次：切筛选或开始新一次跳转都会 +1，旧定时器据此作废。
  const jumpEpoch = useRef(0)
  // 概览「还有 N 个」跳过来时把目标卡对齐到滚动口顶：落点 0–8px，500ms 后复测一次（§17.4.1 / F-CONV-009-07）。
  // 目标卡常晚于跳转信号一帧出现（列表还在加载），所以找不到时按 50ms 重试；布局稳定后再对齐并在 120/500ms 复测。
  useEffect(() => {
    if (!jumpTaskId) return
    const epoch = ++jumpEpoch.current
    let cancelled = false
    const timers: number[] = []
    // 每次都重新查节点：列表加载会替换卡片节点，面板展开会改变滚动口尺寸；拿旧引用对齐会落空。
    const settle = (): void => {
      if (cancelled || jumpEpoch.current !== epoch) return
      const host = document.getElementById('task-list')
      const target = host?.querySelector<HTMLElement>(`[data-task-id="${jumpTaskId}"]`)
      const scroller = document.getElementById('insp-panel') ?? host?.closest<HTMLElement>('.insp-body') ?? null
      if (!target || !scroller) return
      target.focus?.({ preventScroll: true })
      alignTaskListJump(scroller, target)
    }
    const place = (attempt: number): void => {
      if (cancelled) return
      const host = document.getElementById('task-list')
      const found = host?.querySelector<HTMLElement>(`[data-task-id="${jumpTaskId}"]`)
      if (!found && attempt < 40) { timers.push(window.setTimeout(() => place(attempt + 1), 50)); return }
      settle()
    }
    place(0)
    for (const delay of [120, 300, 520, 800]) timers.push(window.setTimeout(settle, delay))
    return () => { cancelled = true; for (const timer of timers) window.clearTimeout(timer) }
  }, [jumpTaskId])
  // 切换筛选后列表回顶（§17.5.1）；列表在拉取完成后才换成新数据，所以补两次复位。
  // 同时作废尚未落点的跳转：切筛选用的是「回顶」而不是「对齐到某张卡」。挂载时不动，避免掐掉同一次提交里刚排好的跳转。
  const prevFilter = useRef(filter)
  useEffect(() => {
    if (prevFilter.current === filter) return
    prevFilter.current = filter
    jumpEpoch.current += 1
    const reset = (): void => {
      const scroller = document.getElementById('insp-panel')
      if (scroller) scroller.scrollTop = 0
    }
    reset()
    const timers = [window.setTimeout(reset, 60), window.setTimeout(reset, 260)]
    return () => { for (const timer of timers) window.clearTimeout(timer) }
  }, [filter])
  return (
    <div className="task-panel" data-filter={filter}>
      <TaskFilterBar filter={filter} counts={counts} onChange={(next) => {
        // 点当前片也要回顶（AC-CONV-009-12）：筛选值不变时 React 不会重跑上面的 effect。
        // 用户主动选筛选项时，尚未落点的跳转一律作废。
        jumpEpoch.current += 1
        const scroller = document.getElementById('insp-panel')
        if (scroller) scroller.scrollTop = 0
        onFilterChange(next)
      }} />
      {error ? (
        <div className="task-list-error" role="alert">
          <p>任务加载失败</p>
          <button type="button" className="btn sm" onClick={onRetry}>重试</button>
        </div>
      ) : loading && tasks.length === 0 ? (
        <div className="task-skeleton" aria-label="任务加载中">
          {[0, 1, 2].map((n) => <div className="task-card-skeleton" key={n} />)}
        </div>
      ) : tasks.length === 0 ? (
        <p className="insp-placeholder">{filter === 'all' ? '本会话还没有任务' : '没有符合条件的任务'}</p>
      ) : (
        <>
          <div className="task-list" id="task-list" role="list">
            {tasks.map((task) => <TaskCard key={task.id} task={task} isJumpTarget={task.id === jumpTaskId} onOpen={() => onOpenTask(task)} />)}
          </div>
          {hasMore && (
            <div className="task-list-sentinel">
              <button type="button" className="btn sm" disabled={loading} onClick={onLoadMore}>{loading ? '加载中…' : '加载更多'}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 厚卡：四态都可点开只读详情；计划卡画步骤刻度，边做边想卡画最近一条轨迹（§17.4.2）。 */
export function TaskCard({ task, isJumpTarget = false, onOpen }: { task: TaskView; isJumpTarget?: boolean; onOpen: () => void }): React.ReactNode {
  const waiting = waitingLabel(task.waitingReason)
  const percent = typeof task.progress === 'number' ? Math.max(0, Math.min(100, task.progress)) : null
  const steps = task.steps ?? []
  const doneCount = steps.filter((step) => step.status === 'done').length
  const ticks = stepTicks(steps)
  const currentIndex = steps.findIndex((step) => step.status === 'running')
  const failStep = steps.findIndex((step) => step.status === 'failed')
  const artifacts = task.artifacts?.length ?? 0
  const right = task.displayStatus === 'running'
    ? `第 ${(currentIndex >= 0 ? currentIndex : doneCount) + 1} 步 · 进行中`
    : task.displayStatus === 'done'
      ? (task.finishedAt ? `完成于 ${formatClock(task.finishedAt)}` : '已完成')
      : task.displayStatus === 'failed'
        ? (task.finishedAt ? `失败于 ${formatClock(task.finishedAt)}` : '已失败')
        : '等待前置'
  const rightClass = task.displayStatus === 'running' ? 'task-card-state is-running' : task.displayStatus === 'failed' ? 'task-card-state is-failed' : 'task-card-state'
  return (
    <button
      type="button"
      className={`task-card${isJumpTarget ? ' is-jump-target' : ''}`}
      data-task-id={task.id}
      data-status={task.displayStatus}
      data-mode={task.mode}
      onClick={onOpen}
    >
      <span className="task-card-top">
        <b className="task-card-title">{task.title}</b>
        <span className={`task-status task-status-${task.displayStatus}`} data-status={task.status}>{statusLabel(task.status || task.displayStatus)}</span>
      </span>
      <span className="task-card-meta">
        <span className="task-card-mode" data-mode={task.mode}>{modeLabel(task.mode)}</span>
        {artifacts > 0 ? <span className="task-card-artifacts">产出 {artifacts} 个</span> : null}
        {typeof task.attempt === 'number' ? <span className="task-card-attempt">尝试 {task.attempt}</span> : null}
        {waiting && <span className="task-waiting">{waiting}</span>}
      </span>
      {ticks.length > 0 ? (
        <span className="task-ticks" aria-hidden="true">
          {ticks.map((tick, index) => <i key={index} className="task-tick" data-state={tick} />)}
        </span>
      ) : null}
      {percent !== null ? (
        // 有真实步骤时也要显示百分比条：进度按执行器写入的 progress 推进，不因步骤刻度存在而隐藏。
        <span className="task-progress-row">
          <span className="task-progress" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
          <span className="task-progress-text" data-task-progress={percent}>{percent}%</span>
        </span>
      ) : null}
      {(steps.length > 0 || task.failReason) && (
        <span className="task-card-foot">
          {steps.length > 0 && <span className="task-card-steps">已完成 {doneCount}/{steps.length} 步</span>}
          {failStep >= 0 && task.displayStatus !== 'running' ? null : <span className={rightClass}>{right}</span>}
        </span>
      )}
      {task.failReason && <span className="task-card-fail">{task.failReason}</span>}
    </button>
  )
}

/** 消息流里的单任务卡：唯一打开入口「查看任务」+ 等待确认/资源的内联动作。 */
export function TaskMessageCard({ message, task, onOpen, onConfirm, onCancel, onResume, busy = false, error = '', readOnly = false }: {
  message: Message
  task?: TaskView
  onOpen: () => void
  onConfirm?: () => void
  onCancel?: () => void
  onResume?: () => void
  busy?: boolean
  error?: string
  readOnly?: boolean
}): React.ReactNode {
  const status = task?.displayStatus ?? 'pending'
  const title = task?.title ?? message.text.split('\n')[0] ?? '任务'
  const waiting = waitingLabel(task?.waitingReason)
  return (
    <article className="msg-task-card" data-task-id={message.taskId ?? task?.id} data-status={status}>
      <div className="msg-task-head">
        <span className="msg-task-kind">任务</span>
        <b>{title}</b>
        <span className={`task-status task-status-${status}`}>{statusLabel(status)}</span>
      </div>
      {task?.failReason && <p className="msg-task-fail">失败：{task.failReason}</p>}
      {waiting && <p className="msg-task-waiting">{waiting}</p>}
      <div className="msg-task-meta">
        {modeLabel(task?.mode)}
        {task?.waitingReason === 'dependency' ? ' · 等待前置' : ''}
      </div>
      {error && <p className="msg-task-error task-card-error" role="alert">{error}</p>}
      <div className="msg-task-actions">
        <button
          type="button"
          className="btn sm task-card-open"
          aria-label={`查看任务：${title}`}
          aria-haspopup="dialog"
          onClick={onOpen}
        >
          查看任务
          <span className="task-card-open-arrow" aria-hidden="true">→</span>
        </button>
        {!readOnly && task?.waitingReason === 'confirmation' && onConfirm && onCancel && (
          <>
            <button type="button" className="btn sm" disabled={busy} onClick={onConfirm}>{busy ? '处理中…' : '确认'}</button>
            <button type="button" className="btn sm" disabled={busy} onClick={onCancel}>取消</button>
          </>
        )}
        {!readOnly && task?.waitingReason === 'resource' && onResume && (
          <button type="button" className="btn sm" disabled={busy} onClick={onResume}>{busy ? '处理中…' : '恢复'}</button>
        )}
      </div>
    </article>
  )
}

/**
 * 汇总卡：卡片头「已创建 N 个任务」，默认平铺 10 条，超出部分收进「还有 N 条」；
 * 展开后显示全部（上限 100），可「收起」回到 10 条加入口。
 * 传 onOpen 时整卡进入任务标签，传 onOpenTask 时每条任务行进入该任务详情（只读）；
 * 两个回调都不传（如纯展示场景）时卡片保持静态，行不可点也不可聚焦。
 */
export function TaskSummaryCard({ message, tasks, total, expanded = false, error = '', onToggle, onRetry, onOpen, onOpenTask }: {
  message: Message
  tasks: TaskView[]
  total: number
  expanded?: boolean
  error?: string
  onToggle?: () => void
  onRetry?: () => void
  onOpen?: () => void
  onOpenTask?: (task: TaskView) => void
}): React.ReactNode {
  const shown = expanded ? tasks.slice(0, 100) : tasks.slice(0, 10)
  const rest = Math.max(0, total - shown.length)
  const preview = tasks.slice(0, 3).map((task) => task.title).join('、')
  return (
    <article
      className={`msg-task-summary${onOpen ? ' is-clickable' : ''}`}
      data-batch-id={message.batchId}
      onClick={onOpen ? () => onOpen() : undefined}
    >
      <div className="msg-task-summary-head">
        {onOpen ? (
          <button type="button" className="msg-task-summary-open" onClick={(event) => { event.stopPropagation(); onOpen() }}>
            <b>已创建 {total} 个任务</b>
          </button>
        ) : (
          <b>已创建 {total} 个任务</b>
        )}
        {onToggle && <button type="button" className="task-summary-toggle" onClick={(event) => { event.stopPropagation(); onToggle() }}>{expanded ? '收起' : '展开'}</button>}
      </div>
      {total > 0 && <p className="msg-task-summary-preview">{preview}{total > 3 ? ` 等 ${total} 个` : ''}</p>}
      {error && (
        <div className="task-summary-error" role="alert">
          <span>任务加载失败</span>
          {onRetry && <button type="button" className="btn sm" onClick={(event) => { event.stopPropagation(); onRetry() }}>重试</button>}
        </div>
      )}
      <ul className="msg-task-summary-list">
        {shown.map((task) => (
          <li key={task.id} className="msg-task-summary-item" data-task-id={task.id} data-status={task.displayStatus}>
            {onOpenTask ? (
              <button
                type="button"
                className="msg-task-summary-item-btn"
                aria-label={`查看任务：${task.title}`}
                onClick={(event) => { event.stopPropagation(); onOpenTask(task) }}
              >
                <span className="task-status-dot" data-status={task.displayStatus} aria-hidden="true" />
                <span className="msg-task-summary-title">{task.title}</span>
                <span className="msg-task-summary-mode">{modeLabel(task.mode)}</span>
              </button>
            ) : (
              <>
                <span className="task-status-dot" data-status={task.displayStatus} aria-hidden="true" />
                <span className="msg-task-summary-title">{task.title}</span>
                <span className="msg-task-summary-mode">{modeLabel(task.mode)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {!expanded && rest > 0 && (
        <button type="button" className="task-summary-more" onClick={(event) => { event.stopPropagation(); onToggle?.() }}>还有 {rest} 条</button>
      )}
    </article>
  )
}

export function DeliverablesTab({ groups, loading, error = '', total = 0, fileCount = 0, hasMore = false, onOpenTask, onOpenFile, onLoadMore, onRetry }: {
  groups: DeliverableGroup[]
  loading: boolean
  error?: string
  total?: number
  fileCount?: number
  hasMore?: boolean
  onOpenTask?: (taskId: string) => void
  onOpenFile?: (file: TaskFile) => void
  onLoadMore?: () => void
  onRetry?: () => void
}): React.ReactNode {
  if (error) {
    return (
      <div className="task-list-error" role="alert">
        <p>交付物加载失败</p>
        <button type="button" className="btn sm" onClick={onRetry}>重试</button>
      </div>
    )
  }
  if (loading && groups.length === 0) return <div className="task-skeleton" aria-label="交付物加载中">{[0, 1].map((n) => <div className="task-card-skeleton" key={n} />)}</div>
  if (groups.length === 0) return <p className="insp-placeholder">本会话还没有交付物</p>
  return (
    <div className="deliverables-panel">
      <p className="deliverables-summary">共 {total} 个任务 · {fileCount} 个文件</p>
      {groups.map((group) => (
        <section className="deliverable-group" key={group.taskId} data-task-id={group.taskId} data-status={group.taskStatus}>
          <div className="deliverable-group-head">
            <span className="task-status-dot" data-status={group.taskStatus} aria-hidden="true" />
            <button type="button" className="deliverable-group-title" onClick={() => onOpenTask?.(group.taskId)}>{group.taskTitle}</button>
            <span className={`task-status task-status-${group.taskStatus}`}>{statusLabel(group.taskStatus)}</span>
            <span className="deliverable-group-count">{group.files.length} 个</span>
          </div>
          {group.files.length === 0 ? (
            <p className="deliverable-empty">
              {group.taskStatus === 'failed'
                ? '没有生成文件。任务在第 5 步写入初稿时失败，临时文件不计入交付物'
                : '还没有生成文件'}
            </p>
          ) : (
            <ul className="deliverable-files">
              {group.files.map((file) => (
                <li className="deliverable-file" key={file.id}>
                  <span className="deliverable-badge" data-type={file.typeBadge ?? 'doc'}>{file.typeBadge ?? 'doc'}</span>
                  <span className="deliverable-name" title={file.name}>{file.name}</span>
                  <span className="deliverable-meta">
                    {formatClock(file.createdAt)}
                    {' · '}
                    {file.size > 0 ? formatBytes(file.size) : '更新中'}
                  </span>
                  {onOpenFile && <button type="button" className="btn sm deliverable-open" aria-label={`下载 ${file.name}`} onClick={() => onOpenFile(file)}>打开</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {hasMore && <div className="task-list-sentinel"><button type="button" className="btn sm" disabled={loading} onClick={onLoadMore}>{loading ? '加载中…' : '加载更多'}</button></div>}
    </div>
  )
}

function initialExpandedStep(detail: TaskDetailPayload | null): string | null {
  if (!detail) return null
  const failed = detail.steps.find((step) => step.status === 'failed')
  if (failed) return failed.id
  const current = detail.currentStepId ?? currentStepId(detail.steps)
  if (current) return current
  const allTerminal = detail.steps.length > 0 && detail.steps.every((step) => step.status === 'done' || step.status === 'failed' || step.status === 'skipped')
  return allTerminal ? detail.steps[detail.steps.length - 1].id : null
}

/** 详情打开后的落点：有 stepId 用它，否则按状态取当前步/失败步/末步/第一步；explore 取末行（§17.7.5）。 */
function detailJumpSelector(detail: TaskDetailPayload, stepId: string | null | undefined): string | null {
  if (detail.task.mode === 'explore') return '.task-trace:last-child'
  const steps = detail.steps
  if (stepId && steps.some((step) => step.id === stepId)) return `[data-step-id="${stepId}"]`
  const status = detail.task.displayStatus
  const byStatus = status === 'running'
    ? steps.find((step) => step.status === 'running') ?? steps.find((step) => step.id === currentStepId(steps))
    : status === 'failed'
      ? steps.find((step) => step.status === 'failed')
      : status === 'done'
        ? [...steps].reverse().find((step) => step.status === 'done')
        : steps[0]
  return byStatus ? `[data-step-id="${byStatus.id}"]` : null
}

/** 详情接口未就绪时的外壳：用列表里的 TaskView 立即渲染标题、状态与步骤，模式与几何先成立（§17.7.1）。 */
function fallbackDetail(task: TaskView): TaskDetailPayload {
  const steps = (task.steps ?? []).map((step, index) => ({ id: step.id, seq: index + 1, title: step.title, status: step.status })) as TaskDetailPayload['steps']
  return { task, steps, traces: [], tracesHasMore: false, deliverables: [] }
}

export function TaskDetailLayer({ open, detail: loadedDetail, fallbackTask = null, loading, error = '', mode = 'overlay', collapsed = false, jumpStepId = null, onClose, onRetry, onOpenFile, onResume, resumeBusy = false, resumeNotice = '', sourceSessionTitle = '' }: {
  open: boolean
  detail: TaskDetailPayload | null
  fallbackTask?: TaskView | null
  loading: boolean
  error?: string
  mode?: string
  collapsed?: boolean
  jumpStepId?: string | null
  onClose: () => void
  onRetry?: () => void
  onOpenFile?: (file: TaskFile) => void
  /** 资源等待时的恢复入口；只有 waitingReason=resource 才渲染按钮。 */
  onResume?: () => void
  resumeBusy?: boolean
  /** 恢复成功后的落点提示，例如「已从第 3 步「整理资料」继续」。 */
  resumeNotice?: string
  /** PRD-TASK-005：任务来自子会话时，详情标明来源；空串表示会话本身就是任务的归属会话。 */
  sourceSessionTitle?: string
}): React.ReactNode {
  const detail = loadedDetail ?? (fallbackTask ? fallbackDetail(fallbackTask) : null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [traceLimit, setTraceLimit] = useState(200)
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set())
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setExpanded(initialExpandedStep(detail))
    setTraceLimit(200)
    setExpandedTraces(new Set())
  }, [detail?.task.id, loadedDetail])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // 打开时焦点进关闭按钮；关闭后把焦点还给来源卡；body 滚动锁定，中栏与侧栏加 inert（§17.7.1/§17.7.6）。
  useEffect(() => {
    if (!open) return
    const source = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const inertNodes = Array.from(document.querySelectorAll<HTMLElement>('.conversation-panel, .sidebar'))
    for (const node of inertNodes) node.setAttribute('inert', '')
    return () => {
      document.body.style.overflow = previousOverflow
      for (const node of inertNodes) node.removeAttribute('inert')
      if (source && document.contains(source)) source.focus({ preventScroll: true })
    }
  }, [open, detail?.task.id])

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return
    const root = event.currentTarget
    const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
      .filter((node) => node.offsetParent !== null || node === document.activeElement)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  // 数据到达后按 stepId/状态把目标行对齐到详情滚动口顶，落点 0–8px，并标 1.2s 高亮（§17.7.5）。
  useEffect(() => {
    if (!open || !detail) return
    const body = bodyRef.current
    if (!body) return
    const selector = detailJumpSelector(detail, jumpStepId)
    if (!selector) return
    const row = body.querySelector<HTMLElement>(selector)
    if (!row) return
    const place = (): void => {
      const offset = row.getBoundingClientRect().top - body.getBoundingClientRect().top - 4
      body.scrollTop += offset
    }
    place()
    const frame = window.requestAnimationFrame(place)
    if (detail.task.mode === 'explore') body.scrollTop = body.scrollHeight
    row.setAttribute('tabindex', '-1')
    row.focus({ preventScroll: true })
    row.classList.add('is-jump-target')
    const timer = window.setTimeout(() => row.classList.remove('is-jump-target'), 1200)
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); row.classList.remove('is-jump-target') }
  }, [open, detail, jumpStepId])

  const detailTraces = detail?.traces ?? []
  // 两种详情共用同一个可见窗口：按时间与序号升序排好后，只渲染最后 visibleCount 条。
  const orderedTraces = useMemo(
    () => [...detailTraces].sort((a, b) => a.at - b.at || a.seq - b.seq),
    [detailTraces],
  )
  const visibleCount = Math.min(traceLimit, TRACE_CAP, orderedTraces.length)
  const visibleTraces = orderedTraces.slice(orderedTraces.length - visibleCount)
  const visibleTraceSet = useMemo(() => new Set(visibleTraces), [orderedTraces, visibleCount])
  const tracesRemain = orderedTraces.length > visibleCount || Boolean(detail?.tracesHasMore)
  const tracesAtCap = tracesRemain && visibleCount >= TRACE_CAP
  const tracesByStep = useMemo(() => {
    const map = new Map<string, TraceItem[]>()
    for (const trace of detailTraces) {
      if (!trace.stepId) continue
      const list = map.get(trace.stepId)
      if (list) list.push(trace); else map.set(trace.stepId, [trace])
    }
    return map
  }, [detailTraces])

  if (!open) return null
  const task = detail?.task
  const taskMode = task?.mode === 'explore' ? 'explore' : 'plan'
  const steps = detail?.steps ?? []
  const doneSteps = steps.filter((step) => step.status === 'done').length
  const budget = detail?.budget
  // 预算触顶时暂停的是某一条具体步骤：恢复要从这一步继续，界面上要指出是第几步。
  const pausedStep = task?.waitingReason === 'resource'
    ? steps.find((step) => step.status === 'running') ?? steps.find((step) => step.status === 'pending') ?? null
    : null
  const context = detail?.context
  const deliverables = detail?.deliverables ?? []
  const totalTraces = detailTraces.length
  const tracePager = (
    <>
      {tracesRemain && !tracesAtCap && (
        <button type="button" className="btn sm task-traces-more" aria-label="加载更早轨迹" onClick={() => setTraceLimit((limit) => Math.min(TRACE_CAP, limit + TRACE_PAGE_SIZE))}>加载更早</button>
      )}
      {tracesAtCap && <p className="insp-placeholder task-traces-cap" role="status">已显示最近 {TRACE_CAP} 条，达到上限</p>}
      {visibleCount > TRACE_PAGE_SIZE && !tracesAtCap && <p className="insp-placeholder">仅显示最近 {visibleCount} 条</p>}
    </>
  )

  return (
    <section
      className="task-detail"
      role="dialog"
      aria-modal="true"
      aria-label="任务详情"
      data-task-id={task?.id}
      data-mode={taskMode}
      data-layout={mode}
      data-collapsed={collapsed ? 'true' : 'false'}
      onKeyDown={onDialogKeyDown}
    >
      <div className="task-detail-head">
        <span className="task-detail-kicker">任务详情 · {taskMode === 'explore' ? '边做边想' : '计划'}</span>
        <span className="task-detail-readonly">只读</span>
        <button ref={closeRef} type="button" className="icon-btn task-detail-close" aria-label="关闭任务详情" onClick={onClose}>×</button>
      </div>
      <div className="task-detail-body" ref={bodyRef}>
        {loading && <p className="insp-placeholder">任务详情加载中…</p>}
        {!loading && error && (
          <div className="task-list-error" role="alert">
            <p>任务详情加载失败</p>
            <p className="task-detail-error-reason">{error}</p>
            <button type="button" className="btn sm" onClick={onRetry}>重试</button>
          </div>
        )}
        {!loading && !error && !detail && <p className="insp-placeholder">暂无任务详情</p>}
        {detail && <>
          <div className="task-detail-title-row">
            <h2 className="task-detail-title">{task?.title ?? '任务详情'}</h2>
            {task && <span className={`task-status task-status-${task.displayStatus}`} data-status={task.status}>{statusLabel(task.status || task.displayStatus)}</span>}
          </div>
          <p className="task-detail-meta">
            {task ? `${taskMode === 'explore' ? `循环轨迹 ${totalTraces} 条` : `${steps.length} 步 · 已完成 ${doneSteps}`} · 产出 ${deliverables.length} 个` : ''}
            {task && typeof task.progress === 'number' ? ` · 进度 ${Math.max(0, Math.min(100, task.progress))}%` : ''}
            {task && typeof task.attempt === 'number' && task.attempt > 0 ? ` · 尝试 ${task.attempt} 次` : ''}
          </p>
          {sourceSessionTitle && (
            <p className="task-detail-source" data-source-session={sourceSessionTitle}>来源子会话：{sourceSessionTitle}</p>
          )}
          {(task?.failReason || task?.waitingReason) && (
            <p className="task-detail-note">
              {task?.failReason ? `失败：${task.failReason}` : waitingLabel(task?.waitingReason)}
            </p>
          )}
          {task?.waitingReason === 'resource' && (
            <div className="task-resume" data-task-resume="resource">
              <p className="task-resume-text">
                额度已用尽，任务停在当前步骤。
                {pausedStep
                  ? `恢复后从第 ${pausedStep.seq} 步「${pausedStep.title}」继续，已完成步骤不会重跑。`
                  : '恢复后从当前暂停步骤继续，已完成步骤不会重跑。'}
              </p>
              {onResume && (
                <button type="button" className="btn sm task-resume-btn" disabled={resumeBusy} onClick={onResume}>
                  {resumeBusy ? '恢复中…' : '恢复任务'}
                </button>
              )}
            </div>
          )}
          {resumeNotice && <p className="task-resume-notice" role="status">{resumeNotice}</p>}
          {taskMode === 'explore' ? (
            <>
              <p className="task-detail-tip">这一任务按 ReAct 循环推进，轨迹只有先后顺序，不划分步骤。</p>
              <div className="task-detail-section">
                <span className="task-detail-label">循环轨迹</span>
                <span className="task-detail-label-count">{totalTraces} 条 · 正序</span>
              </div>
              {detailTraces.length === 0 ? <p className="insp-placeholder">暂无轨迹</p> : <TimelineTraces traces={visibleTraces} />}
              {tracePager}
            </>
          ) : (
            <>
              <div className="task-detail-section">
                <span className="task-detail-label">步骤</span>
              </div>
              {steps.length === 0 ? <p className="insp-placeholder">暂无步骤</p> : (
                <ol className="task-steps">
                  {steps.map((step) => (
                    <StepItem
                      key={step.id}
                      step={step}
                      traces={tracesByStep.get(step.id) ?? []}
                      expanded={expanded === step.id}
                      visibleTraceSet={visibleTraceSet}
                      expandedTraces={expandedTraces}
                      onToggle={() => setExpanded((current) => (current === step.id ? null : step.id))}
                      onExpandTrace={(id) => setExpandedTraces((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })}
                    />
                  ))}
                </ol>
              )}
              {tracePager}
            </>
          )}
          <div className="task-detail-section"><span className="task-detail-label">启动上下文</span></div>
          <dl className="task-context">
            <div><dt>目标</dt><dd>{context?.goal || '未记录'}</dd></div>
            <div><dt>约束</dt><dd>{context?.constraints?.length ? context.constraints.join(' · ') : '无'}</dd></div>
            <div><dt>输入</dt><dd>{context?.inputs?.length ? context.inputs.join(' · ') : '无'}</dd></div>
            <div><dt>历史消息</dt><dd>{context?.historyCount ?? 0} 条</dd></div>
          </dl>
          <p className="task-budget">已用 {budget?.usedTokens ?? 0}/{budget?.maxTokens ?? 0} tokens · {budget?.usedSteps ?? 0}/{budget?.maxSteps ?? 0} 步</p>
          <div className="task-detail-section"><span className="task-detail-label">产出文件</span></div>
          {deliverables.length === 0 ? <p className="task-detail-empty-files">这一任务还没有产出文件</p> : (
            <ul className="task-files">
              {deliverables.map((file) => (
                <li className="task-file" key={file.id}>
                  <span className="deliverable-name" title={file.name}>{file.name}</span>
                  <span className="deliverable-meta">{formatClock(file.createdAt)} · {formatBytes(file.size)}</span>
                  {onOpenFile && <button type="button" className="btn sm" aria-label={`打开 ${file.name}`} onClick={() => onOpenFile(file)}>打开</button>}
                </li>
              ))}
            </ul>
          )}
        </>}
      </div>
    </section>
  )
}

function StepItem({ step, traces, expanded, visibleTraceSet, expandedTraces, onToggle, onExpandTrace }: {
  step: TaskStep
  traces: TraceItem[]
  expanded: boolean
  visibleTraceSet: Set<TraceItem>
  expandedTraces: Set<string>
  onToggle: () => void
  onExpandTrace: (id: string) => void
}): React.ReactNode {
  const interactive = traces.length > 0 || step.status !== 'pending'
  const head = (
    <>
      <span className="task-step-marker" data-status={step.status} aria-hidden="true">
        {step.status === 'done' ? '✓' : step.status === 'failed' ? '!' : step.seq}
      </span>
      <span className="task-step-title">{step.title}</span>
      <span className="task-step-summary-inline">
        {step.status === 'running' ? `轨迹 ${step.traceCount} 条 · 进行中` : step.status === 'failed' ? '失败' : step.status === 'done' ? `轨迹 ${step.traceCount} 条` : ''}
      </span>
      {step.status !== 'pending' && <span className="task-step-arrow" aria-hidden="true">{expanded ? '▾' : '▸'}</span>}
    </>
  )
  // 只渲染落在全局可见窗口内的轨迹；被窗口裁掉的条目不进 DOM。
  const visibleTraces = traces.filter((trace) => visibleTraceSet.has(trace))
  return (
    <li className="task-step" data-step-id={step.id} data-status={step.status}>
      {interactive ? (
        <button type="button" className="task-step-head" aria-expanded={expanded} aria-controls={`traces-${step.id}`} onClick={onToggle}>{head}</button>
      ) : (
        <div className="task-step-head" aria-disabled="true">{head}</div>
      )}
      {expanded && step.status === 'done' && step.summary && <p className="task-step-summary">{step.summary}</p>}
      {step.failReason && <p className="task-step-fail">失败：{step.failReason}</p>}
      {expanded && visibleTraces.length > 0 && (
        <ul className="task-traces" id={`traces-${step.id}`}>
          {visibleTraces.map((trace) => {
            const id = trace.id ?? `${step.id}-${trace.seq}`
            const long = trace.text.length > 120
            return (
              <li className="task-trace" key={id} data-trace-id={id} data-trace-seq={trace.seq}>
                <span className="task-trace-cat" data-cat={trace.category}>{traceLabel(trace.category)}</span>
                <span className="task-trace-main">
                  {trace.category === 'action' && trace.tool ? <code className="task-trace-tool">{trace.tool}</code> : null}
                  <span className={expandedTraces.has(id) ? 'task-trace-text is-expanded' : 'task-trace-text'}>{trace.text}</span>
                  {long && <button type="button" className="task-trace-toggle" aria-expanded={expandedTraces.has(id)} onClick={() => onExpandTrace(id)}>{expandedTraces.has(id) ? '收起' : '展开'}</button>}
                </span>
                <time className="task-trace-time" dateTime={new Date(trace.at).toISOString()}>{formatClockSec(trace.at)}</time>
              </li>
            )
          })}
        </ul>
      )}
      {expanded && traces.length > visibleTraces.length && <p className="task-traces-hint">本步仅显示最近 {visibleTraces.length} 条</p>}
    </li>
  )
}

function TimelineTraces({ traces }: { traces: TraceItem[] }): React.ReactNode {
  const ordered = useMemo(() => [...traces].sort((a, b) => a.at - b.at || a.seq - b.seq), [traces])
  const lastKey = ordered.length > 0 ? ordered[ordered.length - 1].id ?? String(ordered[ordered.length - 1].seq) : null
  return (
    <ol className="task-timeline">
      {ordered.map((trace) => {
        const key = trace.id ?? String(trace.seq)
        return (
          <li className={key === lastKey ? 'task-trace is-current' : 'task-trace'} key={key} data-trace-seq={trace.seq} data-cat={trace.category}>
            <span className="task-trace-cat" data-cat={trace.category}>{traceLabel(trace.category)}</span>
            <span className="task-trace-main">
              {trace.category === 'action' && trace.tool ? <code className="task-trace-tool">{trace.tool}</code> : null}
              <span className="task-trace-text is-expanded">{trace.text}</span>
            </span>
            <time className="task-trace-time" dateTime={new Date(trace.at).toISOString()}>{formatClockSec(trace.at)}</time>
          </li>
        )
      })}
    </ol>
  )
}

interface GraphPlacement { x: number; y: number; w: number; h: number }

const GRAPH_NODE_W = 156
const GRAPH_NODE_H = 64
const GRAPH_GAP_X = 24
const GRAPH_GAP_Y = 24
const GRAPH_PAD = 24
const GRAPH_COLS = 4

/** 任务图布局：≤20 节点固定 4 列；>20 按 layers 每层一行，单层超过 4 个每 4 个换行。 */
export function layoutTaskGraph(graph: TaskGraphPayload): Record<string, GraphPlacement> {
  const result: Record<string, GraphPlacement> = {}
  const total = graph.nodes.length
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  if (total <= 20 || graph.layers.length === 0) {
    graph.nodes.forEach((node, index) => {
      const row = Math.floor(index / GRAPH_COLS)
      const col = index % GRAPH_COLS
      result[node.id] = { x: GRAPH_PAD + col * (GRAPH_NODE_W + GRAPH_GAP_X), y: GRAPH_PAD + row * (GRAPH_NODE_H + GRAPH_GAP_Y), w: GRAPH_NODE_W, h: GRAPH_NODE_H }
    })
    return result
  }
  let cursorY = GRAPH_PAD
  for (const layer of [...graph.layers].sort((a, b) => a.index - b.index)) {
    const ids = layer.nodeIds.filter((id) => byId.has(id))
    if (ids.length === 0) continue
    const maxPerRow = Math.min(GRAPH_COLS, ids.length)
    const rowWidth = maxPerRow * GRAPH_NODE_W + (maxPerRow - 1) * GRAPH_GAP_X
    ids.forEach((id, index) => {
      const col = index % GRAPH_COLS
      const row = Math.floor(index / GRAPH_COLS)
      result[id] = { x: GRAPH_PAD + col * (GRAPH_NODE_W + GRAPH_GAP_X) + Math.max(0, (GRAPH_COLS * GRAPH_NODE_W + (GRAPH_COLS - 1) * GRAPH_GAP_X - rowWidth) / 2), y: cursorY + row * (GRAPH_NODE_H + GRAPH_GAP_Y), w: GRAPH_NODE_W, h: GRAPH_NODE_H }
    })
    cursorY += Math.ceil(ids.length / GRAPH_COLS) * (GRAPH_NODE_H + GRAPH_GAP_Y)
  }
  return result
}

export function TaskGraphDialog({ open, graph, loading, error = '', onClose, onRetry, onOpenTask }: {
  open: boolean
  graph: TaskGraphPayload | null
  loading: boolean
  error?: string
  onClose: () => void
  onRetry?: () => void
  onOpenTask: (taskId: string) => void
}): React.ReactNode {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])
  if (!open) return null
  const placement = graph ? layoutTaskGraph(graph) : {}
  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]))
  const width = graph ? Math.max(920, GRAPH_PAD * 2 + GRAPH_COLS * GRAPH_NODE_W + (GRAPH_COLS - 1) * GRAPH_GAP_X) : 920
  const height = Object.values(placement).reduce((max, box) => Math.max(max, box.y + box.h), 0) + GRAPH_PAD
  return (
    <div className="task-graph-backdrop">
      <div className="task-graph-dialog" role="dialog" aria-modal="true" aria-label="任务图">
        <div className="task-graph-head">
          <b>任务图</b>
          <span>{graph?.total ?? 0} 个任务</span>
          <button type="button" className="icon-btn" aria-label="关闭任务图" onClick={onClose}>×</button>
        </div>
        <div className="task-graph-legend" aria-label="图例">
          <span className="task-graph-legend-item"><i className="task-status-dot" data-status="pending" aria-hidden="true" />未开始</span>
          <span className="task-graph-legend-item"><i className="task-status-dot" data-status="running" aria-hidden="true" />进行中</span>
          <span className="task-graph-legend-item"><i className="task-status-dot" data-status="failed" aria-hidden="true" />失败</span>
          <span className="task-graph-legend-item"><i className="task-status-dot" data-status="done" aria-hidden="true" />已完成</span>
          <span className="task-graph-legend-item"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--danger)" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.55" /></svg>失败下游</span>
        </div>
        <div className="task-graph-body">
          {loading && <p className="insp-placeholder">任务图加载中…</p>}
          {!loading && error && (
            <div className="task-list-error" role="alert">
              <p>任务图加载失败</p>
              <button type="button" className="btn sm" onClick={onRetry}>重试</button>
            </div>
          )}
          {!loading && !error && graph && graph.nodes.length === 0 && <p className="insp-placeholder">本会话还没有任务</p>}
          {!loading && !error && graph && graph.nodes.length > 0 && (
            <div className="task-graph-canvas" style={{ width, height }}>
              <svg className="task-graph-edges" width={width} height={height} aria-hidden="true">
                <defs>
                  <marker id="task-graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--line)" />
                  </marker>
                  <marker id="task-graph-arrow-failed" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--danger)" opacity="0.55" />
                  </marker>
                </defs>
                {graph.edges.map((edge) => {
                  const from = placement[edge.from]
                  const to = placement[edge.to]
                  if (!from || !to) return null
                  const x1 = from.x + from.w
                  const y1 = from.y + from.h / 2
                  const x2 = to.x
                  const y2 = to.y + to.h / 2
                  const mid = x1 + (x2 - x1) / 2
                  const style = edge.style ?? (nodeById.get(edge.from)?.displayStatus === 'failed' ? 'dashed' : 'solid')
                  const dashed = style === 'dashed'
                  return <path key={`${edge.from}-${edge.to}`} className="task-graph-edge" data-from={edge.from} data-to={edge.to} data-style={style} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none" stroke={dashed ? 'var(--danger)' : 'var(--line)'} strokeDasharray={dashed ? '4 3' : undefined} strokeWidth="1.4" opacity={dashed ? 0.55 : 1} markerEnd={dashed ? 'url(#task-graph-arrow-failed)' : 'url(#task-graph-arrow)'} />
                })}
              </svg>
              {graph.nodes.map((node) => {
                const box = placement[node.id]
                if (!box) return null
                return (
                  <button
                    key={node.id}
                    type="button"
                    className="task-graph-node"
                    data-task-id={node.id}
                    data-status={node.displayStatus}
                    style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                    onClick={() => { onClose(); onOpenTask(node.id) }}
                  >
                    <span className="task-graph-node-mode">{modeLabel(node.mode)}</span>
                    <span className="task-graph-node-title">{node.title}</span>
                    <span className="task-graph-node-status">{statusLabel(node.displayStatus)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

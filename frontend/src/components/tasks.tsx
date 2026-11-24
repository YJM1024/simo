import { useEffect, useMemo, useState } from 'react'
import type { DeliverableGroup, Message, TaskCounts, TaskDetailPayload, TaskFile, TaskGraphPayload, TaskStep, TaskView, TraceItem } from '../types'
import { badgeText, currentStepId } from '../taskEvents'

/** P1-CONV §17 任务域视图组件。样式全部走 components.css 的 `task-*` / `insp-*` 选择器。 */

const STATUS_LABEL: Record<string, string> = { pending: '未开始', running: '进行中', failed: '失败', done: '已完成' }
const WAITING_LABEL: Record<string, string> = { depends: '等待前置', confirmation: '等待确认', resource: '等待资源' }
const TRACE_LABEL: Record<string, string> = { thought: '思考', action: '动作', observation: '观察' }
const FILTER_LABEL: Record<TaskFilter, string> = { all: '全部', running: '进行中', failed: '失败', done: '已完成' }

export type TaskFilter = 'all' | 'running' | 'failed' | 'done'
export const TASK_FILTERS: TaskFilter[] = ['all', 'running', 'failed', 'done']

export function statusLabel(status: string | undefined): string {
  return (status && STATUS_LABEL[status]) || status || '未开始'
}

export function waitingLabel(reason: string | undefined): string | null {
  if (!reason) return null
  return WAITING_LABEL[reason] ?? reason
}

export function traceLabel(category: string | undefined): string {
  return (category && TRACE_LABEL[category]) || '动作'
}

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
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
  // 概览「还有 N 个」跳过来时把目标卡对齐到滚动口顶（scroll-margin-top 留 8px 余量）。
  useEffect(() => {
    if (!jumpTaskId) return
    const host = document.getElementById('task-list')
    const target = host?.querySelector<HTMLElement>(`[data-task-id="${jumpTaskId}"]`)
    target?.scrollIntoView?.({ block: 'start' })
  }, [jumpTaskId])
  return (
    <div className="task-panel" data-filter={filter}>
      <TaskFilterBar filter={filter} counts={counts} onChange={onFilterChange} />
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

/** 厚卡：四态都可点开只读详情。 */
export function TaskCard({ task, isJumpTarget = false, onOpen }: { task: TaskView; isJumpTarget?: boolean; onOpen: () => void }): React.ReactNode {
  const waiting = waitingLabel(task.waitingReason)
  const percent = task.stepCount ? Math.round(((task.doneStepCount ?? 0) / task.stepCount) * 100) : null
  return (
    <button
      type="button"
      className={`task-card${isJumpTarget ? ' is-jump-target' : ''}`}
      data-task-id={task.id}
      data-status={task.displayStatus}
      onClick={onOpen}
    >
      <span className="task-card-top">
        <b className="task-card-title">{task.title}</b>
        <span className={`task-status task-status-${task.displayStatus}`}>{statusLabel(task.displayStatus)}</span>
      </span>
      <span className="task-card-meta">
        {task.stepCount ? <span className="task-card-steps">步骤 {task.doneStepCount ?? 0}/{task.stepCount}</span> : null}
        <span className="task-card-outputs">产出 {task.outputCount ?? 0} 个</span>
        {waiting && <span className="task-waiting">{waiting}</span>}
      </span>
      {percent !== null && <span className="task-progress" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>}
    </button>
  )
}

/** 消息流里的单任务卡：查看任务 + 等待确认/资源的内联动作。 */
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
        <b>{title}</b>
        <span className={`task-status task-status-${status}`}>{statusLabel(status)}</span>
      </div>
      {task?.failReason && <p className="msg-task-fail">失败：{task.failReason}</p>}
      {waiting && <p className="msg-task-waiting">{waiting}</p>}
      <div className="msg-task-meta">
        {task?.stepCount ? `步骤 ${task.doneStepCount ?? 0}/${task.stepCount}` : null}
        {task?.stepCount ? ' · ' : null}
        产出 {task?.outputCount ?? 0} 个
      </div>
      {error && <p className="msg-task-error" role="alert">{error}</p>}
      <div className="msg-task-actions">
        <button type="button" className="btn sm task-card-open" onClick={onOpen}>查看任务：{title}</button>
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

/** 汇总卡：默认 10 条 + 「还有 N 条」，展开后展示全部（上限 100）。 */
export function TaskSummaryCard({ message, tasks, total, expanded = false, onToggle, onOpenTask }: {
  message: Message
  tasks: TaskView[]
  total: number
  expanded?: boolean
  onToggle?: () => void
  onOpenTask: (task: TaskView) => void
}): React.ReactNode {
  const shown = expanded ? tasks.slice(0, 100) : tasks.slice(0, 10)
  const rest = Math.max(0, total - shown.length)
  return (
    <article className="msg-task-summary" data-batch-id={message.batchId}>
      <div className="msg-task-summary-head"><b>{message.text || `本批共 ${total} 个任务`}</b><span>{total} 个任务</span></div>
      <ul className="msg-task-summary-list">
        {shown.map((task) => (
          <li key={task.id}>
            <button type="button" className="msg-task-summary-item" data-task-id={task.id} data-status={task.displayStatus} onClick={() => onOpenTask(task)}>
              <span className="task-status-dot" data-status={task.displayStatus} aria-hidden="true" />
              <span className="msg-task-summary-title">{task.title}</span>
              <span className="msg-task-summary-state">{statusLabel(task.displayStatus)}</span>
            </button>
          </li>
        ))}
      </ul>
      {!expanded && rest > 0 && (
        <button type="button" className="task-summary-more" onClick={onToggle}>还有 {rest} 条</button>
      )}
      {expanded && onToggle && <button type="button" className="task-summary-more" onClick={onToggle}>收起</button>}
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
        <section className="deliverable-group" key={group.taskId} data-task-id={group.taskId}>
          <div className="deliverable-group-head">
            <button type="button" className="deliverable-group-title" onClick={() => onOpenTask?.(group.taskId)}>{group.taskTitle}</button>
            <span className={`task-status task-status-${group.taskStatus}`}>{statusLabel(group.taskStatus)}</span>
          </div>
          <ul className="deliverable-files">
            {group.files.map((file) => (
              <li className="deliverable-file" key={file.id}>
                <span className="deliverable-badge">{file.typeBadge ?? 'doc'}</span>
                <span className="deliverable-name" title={file.name}>{file.name}</span>
                <span className="deliverable-size">{formatBytes(file.size)}</span>
                {onOpenFile && <button type="button" className="btn sm" aria-label={`下载 ${file.name}`} onClick={() => onOpenFile(file)}>打开</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasMore && <div className="task-list-sentinel"><button type="button" className="btn sm" disabled={loading} onClick={onLoadMore}>{loading ? '加载中…' : '加载更多'}</button></div>}
    </div>
  )
}

function initialExpandedStep(detail: TaskDetailPayload | null): string | null {
  if (!detail) return null
  return detail.currentStepId ?? currentStepId(detail.steps)
}

export function TaskDetailLayer({ open, detail, loading, error = '', mode = 'overlay', onClose, onRetry, onOpenFile }: {
  open: boolean
  detail: TaskDetailPayload | null
  loading: boolean
  error?: string
  mode?: string
  onClose: () => void
  onRetry?: () => void
  onOpenFile?: (file: TaskFile) => void
}): React.ReactNode {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [traceLimit, setTraceLimit] = useState(200)
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set())

  useEffect(() => {
    setExpanded(initialExpandedStep(detail))
    setTraceLimit(200)
    setExpandedTraces(new Set())
  }, [detail?.task.id])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  const task = detail?.task
  const steps = detail?.steps ?? []
  const budget = detail?.budget
  const context = detail?.context

  return (
    <section className="task-detail" role="dialog" aria-modal="true" aria-label="任务详情" data-task-id={task?.id} data-mode={mode}>
      <div className="task-detail-head">
        <b>{task?.title ?? '任务详情'}</b>
        {task && <span className={`task-status task-status-${task.displayStatus}`}>{statusLabel(task.displayStatus)}</span>}
        <button type="button" className="icon-btn task-detail-close" aria-label="关闭任务详情" onClick={onClose}>×</button>
      </div>
      <div className="task-detail-body">
        {loading && <p className="insp-placeholder">任务详情加载中…</p>}
        {!loading && error && (
          <div className="task-list-error" role="alert">
            <p>任务详情加载失败</p>
            <button type="button" className="btn sm" onClick={onRetry}>重试</button>
          </div>
        )}
        {!loading && !error && !detail && <p className="insp-placeholder">暂无任务详情</p>}
        {detail && <>
          {task?.failReason && <p className="task-detail-fail">失败：{task.failReason}</p>}
          {task?.waitingReason && <p className="task-detail-waiting">{waitingLabel(task.waitingReason)}</p>}
          {task && (
            <dl className="task-detail-meta">
              <div><dt>步骤</dt><dd>{task.doneStepCount ?? 0}/{task.stepCount ?? steps.length}</dd></div>
              <div><dt>尝试</dt><dd>{task.attempt ?? 1}</dd></div>
              <div><dt>产出</dt><dd>{task.outputCount ?? detail.deliverables.length} 个</dd></div>
            </dl>
          )}
          <h4 className="task-detail-label">计划步骤</h4>
          {steps.length === 0 ? <p className="insp-placeholder">暂无步骤</p> : (
            <ol className="task-steps">
              {steps.map((step) => (
                <StepItem
                  key={step.id}
                  step={step}
                  expanded={expanded === step.id}
                  traceLimit={traceLimit}
                  expandedTraces={expandedTraces}
                  onToggle={() => setExpanded((current) => (current === step.id ? null : step.id))}
                  onExpandTrace={(id) => setExpandedTraces((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })}
                />
              ))}
            </ol>
          )}
          {detail.traces.length > 0 && detail.task.mode === 'loop' && <TimelineTraces traces={detail.traces} />}
          {detail.tracesHasMore && (
            <button type="button" className="btn sm task-traces-more" aria-label="加载更早轨迹" onClick={() => setTraceLimit((limit) => limit + 200)}>加载更早</button>
          )}
          {traceLimit > 200 && <p className="insp-placeholder">仅显示最近 {Math.min(500, traceLimit)} 条</p>}
          <h4 className="task-detail-label">启动上下文</h4>
          <dl className="task-context">
            <div><dt>目标</dt><dd>{context?.goal || '未记录'}</dd></div>
            <div><dt>约束</dt><dd>{context?.constraints?.length ? context.constraints.join(' · ') : '无'}</dd></div>
            <div><dt>输入</dt><dd>{context?.inputs?.length ? context.inputs.join(' · ') : '无'}</dd></div>
            <div><dt>历史消息</dt><dd>{context?.historyCount ?? 0} 条</dd></div>
          </dl>
          <p className="task-budget">已用 {budget?.usedTokens ?? 0}/{budget?.maxTokens ?? 0} tokens · {budget?.usedSteps ?? 0}/{budget?.maxSteps ?? 0} 步</p>
          <h4 className="task-detail-label">产出文件</h4>
          {detail.deliverables.length === 0 ? <p className="insp-placeholder">暂无产出文件</p> : (
            <ul className="task-files">
              {detail.deliverables.map((file) => (
                <li className="task-file" key={file.id}>
                  <span className="deliverable-name" title={file.name}>{file.name}</span>
                  <span className="deliverable-size">{formatBytes(file.size)}</span>
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

function StepItem({ step, expanded, traceLimit, expandedTraces, onToggle, onExpandTrace }: {
  step: TaskStep
  expanded: boolean
  traceLimit: number
  expandedTraces: Set<string>
  onToggle: () => void
  onExpandTrace: (id: string) => void
}): React.ReactNode {
  const interactive = step.traces !== undefined || step.status !== 'pending'
  const head = (
    <>
      <span className="task-step-index">{step.seq}</span>
      <span className="task-step-title">{step.title}</span>
      <span className={`task-status task-status-${step.status}`}>{statusLabel(step.status)}</span>
      {step.status !== 'pending' && <span className="task-step-count">{step.traceCount} 条</span>}
    </>
  )
  const traces = (step.traces ?? []).slice(-Math.min(traceLimit, 500))
  return (
    <li className="task-step" data-step-id={step.id} data-status={step.status}>
      {interactive ? (
        <button type="button" className="task-step-head" aria-expanded={expanded} onClick={onToggle}>{head}</button>
      ) : (
        <div className="task-step-head">{head}</div>
      )}
      {step.summary && <p className="task-step-summary">{step.summary}</p>}
      {step.failReason && <p className="task-step-fail">失败：{step.failReason}</p>}
      {expanded && traces.length > 0 && (
        <ul className="task-traces">
          {traces.map((trace) => {
            const id = trace.id ?? `${step.id}-${trace.traceSeq}`
            const long = trace.text.length > 120
            return (
              <li className="task-trace" key={id} data-trace-id={id} data-trace-seq={trace.traceSeq}>
                <span className="task-trace-cat" data-cat={trace.category}>{traceLabel(trace.category)}</span>
                <span className={expandedTraces.has(id) ? 'task-trace-text is-expanded' : 'task-trace-text'}>{trace.text}</span>
                {long && <button type="button" className="task-trace-toggle" aria-expanded={expandedTraces.has(id)} onClick={() => onExpandTrace(id)}>{expandedTraces.has(id) ? '收起' : '展开'}</button>}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function TimelineTraces({ traces }: { traces: TraceItem[] }): React.ReactNode {
  const ordered = useMemo(() => [...traces].sort((a, b) => a.at - b.at || a.traceSeq - b.traceSeq), [traces])
  return (
    <ol className="task-timeline">
      {ordered.map((trace) => (
        <li className="task-timeline-row" key={trace.id ?? trace.traceSeq} data-step-seq="0" data-trace-seq={trace.traceSeq}>
          <time className="task-timeline-time">{new Date(trace.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
          <span className="task-trace-cat" data-cat={trace.category}>{traceLabel(trace.category)}</span>
          <span className="task-timeline-text">{trace.text}</span>
        </li>
      ))}
    </ol>
  )
}

interface GraphPlacement { x: number; y: number; w: number; h: number }

const GRAPH_NODE_W = 156
const GRAPH_NODE_H = 64
const GRAPH_GAP_X = 32
const GRAPH_GAP_Y = 40
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
                  return <path key={`${edge.from}-${edge.to}`} className="task-graph-edge" data-from={edge.from} data-to={edge.to} data-style={style} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none" stroke={style === 'dashed' ? 'var(--danger)' : 'var(--line)'} strokeDasharray={style === 'dashed' ? '4 4' : undefined} strokeWidth="1.5" />
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
                    onClick={() => onOpenTask(node.id)}
                  >
                    <span className="task-graph-node-title">{node.title}</span>
                    <span className="task-graph-node-meta">
                      <span className={`task-status task-status-${node.displayStatus}`}>{statusLabel(node.displayStatus)}</span>
                      {node.mode === 'loop' ? <span className="task-graph-mode">循环</span> : null}
                    </span>
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

import type { TaskEvent, TaskStep, TaskView, TraceItem } from './types'

/**
 * P1-CONV §17.3.4：任务事件的去重与乱序判定。
 *
 * 三条独立规则：
 * 1. 事件信封序号（`eventId`）用最近 500 个 id 的 LRU 去重，序号小于等于已应用游标的帧直接丢弃；
 * 2. `task.trace` 按 `(taskId, traceSeq)` 去重；
 * 3. `task.step` 按 `(taskId, stepId, stepSeq)` 去重。
 *
 * 序列号出现空洞时不猜测缺失内容，返回 `gap: true` 交给上层 300ms 内重拉详情。
 */

export const EVENT_CACHE_LIMIT = 500

export interface EventVerdict {
  /** 该帧是否应被应用（重复帧为 false）。 */
  applied: boolean
  /** 是否为重复帧（已应用过的 eventId，或已见过的轨迹/步骤序号）。 */
  duplicate: boolean
  /** 轨迹或步骤序号出现空洞，上层应重拉详情。 */
  gap: boolean
}

export class TaskEventLog {
  private readonly seenEvents = new Set<number>()
  private readonly seenOrder: number[] = []
  private readonly seenTraces = new Set<string>()
  private readonly seenSteps = new Set<string>()
  private readonly maxTraceSeq = new Map<string, number>()
  private readonly maxStepSeq = new Map<string, number>()
  /** 已应用的最大信封序号；小于等于它的帧视为过期。 */
  cursor: number | null = null

  /** 只看信封序号是否重复，不改变任何状态。 */
  hasSeen(eventId: number | undefined): boolean {
    return typeof eventId === 'number' && this.seenEvents.has(eventId)
  }

  /**
   * 判定并记录一条事件。`applied` 为 false 时调用方不应改动任何 UI 状态。
   * `gap` 只在帧被接受时可能为 true。
   */
  accept(event: Pick<TaskEvent, 'type' | 'id' | 'eventId' | 'stepId' | 'stepSeq' | 'traceSeq'>): EventVerdict {
    const eventId = typeof event.eventId === 'number' && Number.isInteger(event.eventId) ? event.eventId : undefined
    if (eventId !== undefined) {
      if (this.seenEvents.has(eventId)) return { applied: false, duplicate: true, gap: false }
      if (this.cursor !== null && eventId <= this.cursor) return { applied: false, duplicate: false, gap: false }
    }

    let duplicate = false
    let gap = false

    if (event.type === 'task.trace' && typeof event.traceSeq === 'number' && event.id) {
      const key = `${event.id}|${event.traceSeq}`
      if (this.seenTraces.has(key)) duplicate = true
      else {
        this.seenTraces.add(key)
        const max = this.maxTraceSeq.get(event.id)
        if (max !== undefined && event.traceSeq > max + 1) gap = true
        if (max === undefined || event.traceSeq > max) this.maxTraceSeq.set(event.id, event.traceSeq)
      }
    }

    if (event.type === 'task.step' && event.id && typeof event.stepSeq === 'number') {
      const key = `${event.id}|${event.stepId ?? ''}|${event.stepSeq}`
      if (this.seenSteps.has(key)) duplicate = true
      else {
        this.seenSteps.add(key)
        const max = this.maxStepSeq.get(event.id)
        if (max !== undefined && event.stepSeq > max + 1) gap = true
        if (max === undefined || event.stepSeq > max) this.maxStepSeq.set(event.id, event.stepSeq)
      }
    }

    if (duplicate) return { applied: false, duplicate: true, gap: false }
    // 同一信封只记一次；轨迹/步骤的重复判定先于记录，避免重复帧推进游标。
    if (eventId !== undefined) {
      this.seenEvents.add(eventId)
      this.seenOrder.push(eventId)
      if (this.seenOrder.length > EVENT_CACHE_LIMIT) {
        const oldest = this.seenOrder.shift()
        if (oldest !== undefined) this.seenEvents.delete(oldest)
      }
      if (this.cursor === null || eventId > this.cursor) this.cursor = eventId
    }
    return { applied: true, duplicate: false, gap }
  }

  reset(): void {
    this.seenEvents.clear()
    this.seenOrder.length = 0
    this.seenTraces.clear()
    this.seenSteps.clear()
    this.maxTraceSeq.clear()
    this.maxStepSeq.clear()
    this.cursor = null
  }
}

/** `task.created` / `task.updated` / `task.report` 的可合并字段。 */
export function mergeTaskView(task: TaskView, event: TaskEvent): TaskView {
  const next: TaskView = { ...task }
  for (const key of ['status', 'displayStatus', 'waitingReason', 'progress', 'attempt', 'triggerCount', 'failReason', 'renderType'] as const) {
    const value = event[key as keyof TaskEvent]
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value
  }
  if (typeof event.title === 'string') next.title = event.title
  if (typeof event.updatedAt === 'number') next.updatedAt = event.updatedAt
  if (event.type === 'task.reminder' && typeof event.overdueMinutes === 'number') next.overdueMinutes = event.overdueMinutes
  return next
}

/** `task.step` 合并到步骤：只改 status / traceCount / 失败原因，不重建步骤。 */
export function mergeTaskStep(step: TaskStep, event: TaskEvent): TaskStep {
  const next: TaskStep = { ...step }
  if (typeof event.status === 'string') next.status = event.status
  if (typeof event.traceCount === 'number') next.traceCount = event.traceCount
  if (typeof event.failReason === 'string') next.failReason = event.failReason
  return next
}

/** 第一个 running，否则第一个 pending，全终态时为空。 */
export function currentStepId(steps: ReadonlyArray<Pick<TaskStep, 'id' | 'status'>>): string | null {
  const running = steps.find((step) => step.status === 'running')
  if (running) return running.id
  const pending = steps.find((step) => step.status === 'pending')
  return pending ? pending.id : null
}

/** 轨迹按 traceSeq 追加；已存在同一 (taskId, traceSeq) 时返回原数组，保证 DOM 不重建。 */
export function appendTrace(list: ReadonlyArray<TraceItem>, trace: TraceItem, taskId?: string): TraceItem[] {
  const id = taskId ?? trace.taskId ?? ''
  if (list.some((item) => item.traceSeq === trace.traceSeq && (item.taskId ?? id) === id)) return list as TraceItem[]
  return [...list, trace].sort((a, b) => a.traceSeq - b.traceSeq)
}

/** 角标/筛选计数：1–9 原样，10 及以上 `9+`，0 返回 null（不渲染节点）。 */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count >= 10 ? '9+' : String(Math.floor(count))
}

/** 任务按钮的可访问名称。 */
export function badgeLabel(count: number): string {
  if (count >= 10) return '任务，9 个以上进行中'
  return `任务，${Math.max(0, Math.floor(count))} 个进行中`
}

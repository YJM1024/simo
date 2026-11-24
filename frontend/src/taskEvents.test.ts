import { describe, expect, it } from 'vitest'
import {
  appendTrace,
  badgeLabel,
  badgeText,
  currentStepId,
  EVENT_CACHE_LIMIT,
  mergeTaskStep,
  mergeTaskView,
  TaskEventLog,
} from './taskEvents'
import type { TaskEvent, TaskStep, TaskView, TraceItem } from './types'

function ev(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return { type: 'task.updated', id: 't1', eventId: 1, ...overrides } as TaskEvent
}

describe('TaskEventLog 信封去重', () => {
  it('同一 eventId 第二次出现判为重复且不再应用', () => {
    const log = new TaskEventLog()
    expect(log.accept(ev({ eventId: 5 })).applied).toBe(true)
    const second = log.accept(ev({ eventId: 5 }))
    expect(second).toEqual({ applied: false, duplicate: true, gap: false })
    expect(log.hasSeen(5)).toBe(true)
  })

  it('小于等于游标的乱序帧直接丢弃，不记为重复', () => {
    const log = new TaskEventLog()
    log.accept(ev({ eventId: 10 }))
    expect(log.accept(ev({ eventId: 9 }))).toEqual({ applied: false, duplicate: false, gap: false })
    expect(log.cursor).toBe(10)
  })

  it('LRU 只保留最近 500 个 id，最早的可再次被接受', () => {
    const log = new TaskEventLog()
    log.accept(ev({ eventId: 1 }))
    expect(log.hasSeen(1)).toBe(true)
    for (let id = 2; id <= EVENT_CACHE_LIMIT + 1; id += 1) log.accept(ev({ eventId: id }))
    expect(log.hasSeen(1)).toBe(false)
    expect(log.hasSeen(EVENT_CACHE_LIMIT + 1)).toBe(true)
  })

  it('reset 清空游标与三类记录', () => {
    const log = new TaskEventLog()
    log.accept(ev({ eventId: 3, type: 'task.trace', traceSeq: 1 }))
    log.reset()
    expect(log.cursor).toBeNull()
    expect(log.hasSeen(3)).toBe(false)
    expect(log.accept(ev({ eventId: 1, type: 'task.trace', traceSeq: 1 })).applied).toBe(true)
  })
})

describe('TaskEventLog 轨迹与步骤去重', () => {
  it('同一 (taskId, traceSeq) 重复判重，不同任务同序号不算重', () => {
    const log = new TaskEventLog()
    expect(log.accept(ev({ type: 'task.trace', traceSeq: 3, eventId: 1 })).applied).toBe(true)
    expect(log.accept(ev({ type: 'task.trace', traceSeq: 3, eventId: 2 })).duplicate).toBe(true)
    expect(log.accept(ev({ type: 'task.trace', id: 't2', traceSeq: 3, eventId: 3 })).applied).toBe(true)
  })

  it('同一 (taskId, stepId, stepSeq) 重复判重', () => {
    const log = new TaskEventLog()
    expect(log.accept(ev({ type: 'task.step', stepId: 's1', stepSeq: 1, eventId: 1 })).applied).toBe(true)
    expect(log.accept(ev({ type: 'task.step', stepId: 's1', stepSeq: 1, eventId: 2 })).duplicate).toBe(true)
    expect(log.accept(ev({ type: 'task.step', stepId: 's2', stepSeq: 1, eventId: 3 })).applied).toBe(true)
  })

  it('轨迹序号出现空洞时返回 gap，连续序号不返回', () => {
    const log = new TaskEventLog()
    expect(log.accept(ev({ type: 'task.trace', traceSeq: 1, eventId: 1 })).gap).toBe(false)
    expect(log.accept(ev({ type: 'task.trace', traceSeq: 2, eventId: 2 })).gap).toBe(false)
    expect(log.accept(ev({ type: 'task.trace', traceSeq: 5, eventId: 3 })).gap).toBe(true)
  })

  it('步骤序号出现空洞时返回 gap', () => {
    const log = new TaskEventLog()
    log.accept(ev({ type: 'task.step', stepId: 's1', stepSeq: 1, eventId: 1 }))
    expect(log.accept(ev({ type: 'task.step', stepId: 's2', stepSeq: 3, eventId: 2 })).gap).toBe(true)
  })

  it('重复帧不推进游标', () => {
    const log = new TaskEventLog()
    log.accept(ev({ type: 'task.trace', traceSeq: 1, eventId: 4 }))
    log.accept(ev({ type: 'task.trace', traceSeq: 1, eventId: 6 }))
    expect(log.cursor).toBe(4)
  })
})

describe('合并与派生工具', () => {
  const task: TaskView = {
    id: 't1',
    sessionId: 'main',
    title: '整理数据',
    mode: 'plan',
    status: 'running',
    displayStatus: 'running',
    createdAt: 1,
    updatedAt: 1,
    progress: 0,
  }

  it('mergeTaskView 只覆盖事件里出现的字段', () => {
    const next = mergeTaskView(task, ev({ status: 'failed', failReason: '超时', updatedAt: 9 }))
    expect(next.status).toBe('failed')
    expect(next.failReason).toBe('超时')
    expect(next.updatedAt).toBe(9)
    expect(next.title).toBe('整理数据')
    expect(task.status).toBe('running')
  })

  it('task.reminder 写入超时分钟', () => {
    const next = mergeTaskView(task, ev({ type: 'task.reminder', overdueMinutes: 3 }))
    expect(next.overdueMinutes).toBe(3)
  })

  it('mergeTaskStep 不改变步骤 id 与标题', () => {
    const step: TaskStep = { id: 's1', title: '收集', status: 'pending', seq: 1, traceCount: 0 }
    const next = mergeTaskStep(step, ev({ type: 'task.step', status: 'running', traceCount: 2 }))
    expect(next).toEqual({ ...step, status: 'running', traceCount: 2 })
  })

  it('currentStepId 优先 running，其次 pending', () => {
    const steps: TaskStep[] = [
      { id: 's1', title: 'a', status: 'done', seq: 1, traceCount: 1 },
      { id: 's2', title: 'b', status: 'pending', seq: 2, traceCount: 0 },
      { id: 's3', title: 'c', status: 'running', seq: 3, traceCount: 2 },
    ]
    expect(currentStepId(steps)).toBe('s3')
    expect(currentStepId(steps.map((s) => ({ ...s, status: s.id === 's3' ? 'done' : s.status })))).toBe('s2')
    expect(currentStepId([{ id: 's1', status: 'done' }])).toBeNull()
  })

  it('appendTrace 按序号排序，重复项返回原数组引用', () => {
    const a: TraceItem = { id: 'x1', traceSeq: 2, category: 'action', text: 'b', at: 2 }
    const b: TraceItem = { id: 'x0', traceSeq: 1, category: 'thought', text: 'a', at: 1 }
    const once = appendTrace([], a, 't1')
    const twice = appendTrace(once, b, 't1')
    expect(twice.map((t) => t.traceSeq)).toEqual([1, 2])
    expect(appendTrace(twice, a, 't1')).toBe(twice)
  })

  it('badgeText 与 badgeLabel 覆盖 0/9/10', () => {
    expect(badgeText(0)).toBeNull()
    expect(badgeText(9)).toBe('9')
    expect(badgeText(10)).toBe('9+')
    expect(badgeLabel(3)).toBe('任务，3 个进行中')
    expect(badgeLabel(12)).toBe('任务，9 个以上进行中')
  })
})

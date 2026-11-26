import { describe, expect, it } from 'vitest'
import { normalizeTaskDetail, normalizeTaskGraph, normalizeTaskView, normalizeTrace } from './taskData'
import type { TaskDetailPayload } from './types'

describe('taskData 归一化', () => {
  it('补齐缺 deliverables / currentStepId / traces 的详情，组件不再抛 TypeError', () => {
    const raw = { task: { id: 't-1', title: '旧任务', mode: 'loop', status: 'running' } } as unknown as Partial<TaskDetailPayload>
    const detail = normalizeTaskDetail(raw, 'main')
    expect(detail.task.sessionId).toBe('main')
    expect(detail.task.mode).toBe('explore')
    expect(detail.task.displayStatus).toBe('running')
    expect(detail.steps).toEqual([])
    expect(detail.currentStepId).toBeNull()
    expect(detail.traces).toEqual([])
    expect(detail.tracesHasMore).toBe(false)
    expect(detail.deliverables).toEqual([])
    expect(detail.task.title).toBe('旧任务')
  })

  it('归一化空响应与未知模式', () => {
    const detail = normalizeTaskDetail(undefined)
    expect(detail.task.id).toBe('')
    expect(detail.task.mode).toBe('plan')
    expect(detail.task.status).toBe('queued')
    expect(detail.task.displayStatus).toBe('pending')
    expect(detail.task.title).toBe('任务')
  })

  it('接受旧 traceSeq 与旧类目并归到契约五值', () => {
    const trace = normalizeTrace({ traceSeq: 7, category: 'thought', text: '想一想', at: 10 } as never)
    expect(trace.seq).toBe(7)
    expect(trace.category).toBe('think')
    expect(trace.text).toBe('想一想')
    expect(normalizeTrace({ traceSeq: 3, category: 'unknown' } as never).category).toBe('action')
    expect(normalizeTrace(undefined).seq).toBe(0)
  })

  it('任务视图把 loop 映射为 explore 并补齐展示状态', () => {
    const view = normalizeTaskView({ id: 't-2', status: 'failed', mode: 'loop' } as never, 'main')
    expect(view.mode).toBe('explore')
    expect(view.sessionId).toBe('main')
    expect(view.displayStatus).toBe('failed')
    expect(view.createdAt).toBe(0)
    expect(view.updatedAt).toBe(0)
  })

  it('图响应缺字段时给空数组与 total 兜底', () => {
    const graph = normalizeTaskGraph({ nodes: [{ id: 'n-1', title: '节点', mode: 'loop', status: 'done' }] } as never)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].mode).toBe('explore')
    expect(graph.nodes[0].displayStatus).toBe('done')
    expect(graph.edges).toEqual([])
    expect(graph.layers).toEqual([])
    expect(graph.total).toBe(1)
    expect(normalizeTaskGraph(undefined).total).toBe(0)
  })
})

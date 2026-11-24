import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { ApiError, decideTaskConfirmation, getSessionDeliverables, getTaskDetail, getTaskGraph, listSessionTasks, resumeTask } from './api'
import type { DeliverablesPayload, TaskDetailPayload, TaskGraphPayload, TaskListPayload } from './types'

interface Seen { method: string; path: string; search: Record<string, string>; body: unknown }
const seen: Seen[] = []
let failTaskList = false

const taskList: TaskListPayload = {
  tasks: [{ id: 'task-1', sessionId: 'main', title: '任务一', mode: 'plan', status: 'running', displayStatus: 'running', createdAt: 1, updatedAt: 2 }],
  counts: { all: 1, pending: 0, running: 1, failed: 0, done: 0 },
  total: 1,
  hasMore: false,
}

const taskDetail: TaskDetailPayload = { task: taskList.tasks[0], steps: [], traces: [], tracesHasMore: false, deliverables: [] }
const taskGraph: TaskGraphPayload = { nodes: [], edges: [], layers: [], total: 0 }
const deliverables: DeliverablesPayload = { groups: [], total: 0, fileCount: 0, hasMore: false }

function capture(request: Request): void {
  const url = new URL(request.url)
  seen.push({ method: request.method, path: url.pathname, search: Object.fromEntries(url.searchParams), body: undefined })
}

async function captureBody(request: Request): Promise<void> {
  const url = new URL(request.url)
  seen.push({ method: request.method, path: url.pathname, search: Object.fromEntries(url.searchParams), body: await request.json() })
}

const server = setupServer(
  http.get('/api/sessions/:id/tasks', ({ request }) => {
    capture(request)
    if (failTaskList) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
    return HttpResponse.json(taskList)
  }),
  http.get('/api/tasks/:id', ({ request }) => {
    capture(request)
    return HttpResponse.json(taskDetail)
  }),
  http.get('/api/sessions/:id/task-graph', ({ request }) => {
    capture(request)
    return HttpResponse.json(taskGraph)
  }),
  http.get('/api/sessions/:id/deliverables', ({ request }) => {
    capture(request)
    return HttpResponse.json(deliverables)
  }),
  http.post('/api/tasks/:id/confirmation', async ({ request }) => {
    await captureBody(request)
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/tasks/:id/resume', async ({ request }) => {
    await captureBody(request)
    return HttpResponse.json({ ok: true })
  }),
)

beforeAll(() => server.listen())
afterEach(() => { seen.length = 0; failTaskList = false })
afterAll(() => server.close())

describe('任务接口', () => {
  it('lists session tasks with limit=50 and no empty filters by default', async () => {
    const payload = await listSessionTasks('main')
    expect(payload).toEqual(taskList)
    expect(seen).toHaveLength(1)
    expect(seen[0].method).toBe('GET')
    expect(seen[0].path).toBe('/api/sessions/main/tasks')
    expect(seen[0].search).toEqual({ limit: '50' })
  })

  it('encodes every provided query filter and keeps before for pagination', async () => {
    await listSessionTasks('会话 1', { status: 'failed', mode: 'loop', batchId: 'b-1', limit: 20, before: 'cursor 2' })
    expect(seen[0].path).toBe('/api/sessions/%E4%BC%9A%E8%AF%9D%201/tasks')
    expect(seen[0].search).toEqual({ status: 'failed', mode: 'loop', batchId: 'b-1', limit: '20', before: 'cursor 2' })
  })

  it('gets task detail with trace pagination defaults', async () => {
    const payload = await getTaskDetail('task-1')
    expect(payload).toEqual(taskDetail)
    expect(seen[0].path).toBe('/api/tasks/task-1')
    expect(seen[0].search).toEqual({ traceLimit: '200' })
  })

  it('passes traceLimit and traceBefore through on detail requests', async () => {
    await getTaskDetail('task 1', { traceLimit: 500, traceBefore: 'tr 9' })
    expect(seen[0].path).toBe('/api/tasks/task%201')
    expect(seen[0].search).toEqual({ traceLimit: '500', traceBefore: 'tr 9' })
  })

  it('gets the session task graph', async () => {
    expect(await getTaskGraph('main')).toEqual(taskGraph)
    expect(seen[0].path).toBe('/api/sessions/main/task-graph')
  })

  it('lists session deliverables with a default limit and optional task filter', async () => {
    await getSessionDeliverables('main')
    expect(seen[0].path).toBe('/api/sessions/main/deliverables')
    expect(seen[0].search).toEqual({ limit: '50' })
    await getSessionDeliverables('main', { taskId: 'task-1', before: 'p-2' })
    expect(seen[1].search).toEqual({ taskId: 'task-1', limit: '50', before: 'p-2' })
  })

  it('posts the confirmation decision as JSON', async () => {
    await decideTaskConfirmation('task-1', 'cancel')
    expect(seen[0].method).toBe('POST')
    expect(seen[0].path).toBe('/api/tasks/task-1/confirmation')
    expect(seen[0].body).toEqual({ decision: 'cancel' })
  })

  it('posts the resume reason as JSON', async () => {
    await resumeTask('task-1', '额度恢复')
    expect(seen[0].method).toBe('POST')
    expect(seen[0].path).toBe('/api/tasks/task-1/resume')
    expect(seen[0].body).toEqual({ reason: '额度恢复' })
  })

  it('surfaces the backend code and status in ApiError', async () => {
    failTaskList = true
    await expect(listSessionTasks('main')).rejects.toMatchObject({ name: 'Error', status: 500, code: 'INTERNAL', message: '请求失败（500），请稍后重试' })
    await expect(listSessionTasks('main')).rejects.toBeInstanceOf(ApiError)
  })
})

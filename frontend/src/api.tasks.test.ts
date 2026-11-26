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
  // 图必须先于 :taskId 注册，否则 /tasks/graph 会被详情路由吃掉。
  http.get('/api/sessions/:id/tasks/graph', ({ request }) => {
    capture(request)
    return HttpResponse.json(taskGraph)
  }),
  http.get('/api/sessions/:id/tasks/:taskId', ({ request }) => {
    capture(request)
    return HttpResponse.json(taskDetail)
  }),
  http.get('/api/sessions/:id/deliverables', ({ request }) => {
    capture(request)
    return HttpResponse.json(deliverables)
  }),
  http.post('/api/sessions/:id/tasks/:taskId/confirmation', async ({ request }) => {
    await captureBody(request)
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/sessions/:id/tasks/:taskId/resume', async ({ request }) => {
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
    await listSessionTasks('会话 1', { status: 'failed', mode: 'explore', batchId: 'b-1', limit: 20, before: 'cursor 2' })
    expect(seen[0].path).toBe('/api/sessions/%E4%BC%9A%E8%AF%9D%201/tasks')
    expect(seen[0].search).toEqual({ status: 'failed', mode: 'explore', batchId: 'b-1', limit: '20', before: 'cursor 2' })
  })

  it('gets task detail inside the session with trace pagination defaults', async () => {
    const payload = await getTaskDetail('main', 'task-1')
    expect(payload).toEqual(taskDetail)
    expect(seen[0].path).toBe('/api/sessions/main/tasks/task-1')
    expect(seen[0].search).toEqual({ traceLimit: '200' })
  })

  it('encodes both ids and passes traceLimit/traceBefore through', async () => {
    await getTaskDetail('会话 1', 'task 1', { traceLimit: 500, traceBefore: 'tr 9' })
    expect(seen[0].path).toBe('/api/sessions/%E4%BC%9A%E8%AF%9D%201/tasks/task%201')
    expect(seen[0].search).toEqual({ traceLimit: '500', traceBefore: 'tr 9' })
  })

  it('gets the session task graph and optional batchId', async () => {
    expect(await getTaskGraph('main')).toEqual(taskGraph)
    expect(seen[0].path).toBe('/api/sessions/main/tasks/graph')
    expect(seen[0].search).toEqual({})
    await getTaskGraph('main', { batchId: 'b-1' })
    expect(seen[1].search).toEqual({ batchId: 'b-1' })
  })

  it('lists session deliverables with a default limit and optional task filter', async () => {
    await getSessionDeliverables('main')
    expect(seen[0].path).toBe('/api/sessions/main/deliverables')
    expect(seen[0].search).toEqual({ limit: '50' })
    await getSessionDeliverables('main', { taskId: 'task-1', before: 'p-2' })
    expect(seen[1].search).toEqual({ taskId: 'task-1', limit: '50', before: 'p-2' })
  })

  it('posts the confirmation decision as JSON inside the session', async () => {
    await decideTaskConfirmation('main', 'task-1', 'cancel')
    expect(seen[0].method).toBe('POST')
    expect(seen[0].path).toBe('/api/sessions/main/tasks/task-1/confirmation')
    expect(seen[0].body).toEqual({ decision: 'cancel' })
  })

  it('posts the resume reason as JSON inside the session', async () => {
    await resumeTask('main', 'task-1', '额度恢复')
    expect(seen[0].method).toBe('POST')
    expect(seen[0].path).toBe('/api/sessions/main/tasks/task-1/resume')
    expect(seen[0].body).toEqual({ reason: '额度恢复' })
  })

  it('maps 404 to a task_not_found message without leaking another session task', async () => {
    server.use(http.get('/api/sessions/:id/tasks/:taskId', () => HttpResponse.json({ ok: false, error: '任务不存在', code: 'task_not_found' }, { status: 404 })))
    await expect(getTaskDetail('main', 'task-x')).rejects.toMatchObject({
      status: 404, code: 'task_not_found', message: '任务不存在或不属于当前会话',
    })
  })

  it('maps 403 to a permission message', async () => {
    server.use(http.get('/api/sessions/:id/tasks/:taskId', () => HttpResponse.json({ ok: false, error: '无权访问', code: 'permission_denied' }, { status: 403 })))
    await expect(getTaskDetail('main', 'task-x')).rejects.toMatchObject({ status: 403, code: 'permission_denied', message: '没有权限执行该任务操作' })
  })

  it('maps 409 task_state_conflict and keeps currentStatus for the caller', async () => {
    server.use(http.post('/api/sessions/:id/tasks/:taskId/confirmation', () => HttpResponse.json({ ok: false, error: '状态已变化', code: 'task_state_conflict', currentStatus: 'done' }, { status: 409 })))
    const error = await decideTaskConfirmation('main', 'task-1', 'confirm').catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'task_state_conflict', currentStatus: 'done' })
    expect((error as ApiError).message).toBe('任务状态已变化（当前已完成），请刷新后重试')
  })

  it('maps 409 mutation_in_progress to a retry-later message', async () => {
    server.use(http.post('/api/sessions/:id/tasks/:taskId/resume', () => HttpResponse.json({ ok: false, error: '处理中', code: 'mutation_in_progress' }, { status: 409 })))
    await expect(resumeTask('main', 'task-1', '重试')).rejects.toMatchObject({ status: 409, code: 'mutation_in_progress', message: '同一操作正在处理中，请稍后重试' })
  })

  it('maps a transport failure to a network ApiError with status 0', async () => {
    server.use(http.get('/api/sessions/:id/tasks/:taskId', () => HttpResponse.error()))
    await expect(getTaskDetail('main', 'task-1')).rejects.toMatchObject({ status: 0, message: '网络请求失败，请检查连接后重试' })
  })

  it('maps graph failures through the same task error mapping', async () => {
    server.use(http.get('/api/sessions/:id/tasks/graph', () => HttpResponse.json({ ok: false, error: '不存在', code: 'task_not_found' }, { status: 404 })))
    await expect(getTaskGraph('main')).rejects.toMatchObject({ status: 404, code: 'task_not_found', message: '任务不存在或不属于当前会话' })
  })

  it('surfaces the backend code and status in ApiError for list failures', async () => {
    failTaskList = true
    await expect(listSessionTasks('main')).rejects.toMatchObject({ status: 500, code: 'INTERNAL', message: '请求失败（500），请稍后重试' })
    await expect(listSessionTasks('main')).rejects.toBeInstanceOf(ApiError)
  })
})

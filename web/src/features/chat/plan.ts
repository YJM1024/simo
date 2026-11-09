// features/chat/plan.ts —— UI-2 计划与待办纯逻辑
//
// 主数据 GET /api/sessions/{id}/plan；后端未就绪时用任务列表降级为只读计划投影。
// Todo 打勾必须经动作层 POST /api/sessions/{id}/todos/{id}/toggle；UI 不直接改状态，
// 失败时提示「需要后端动作层支持」，不以本地状态冒充成功。

import { isRecord, readString } from '../../platform/types.ts'
import type { TaskInfo } from '../../platform/types.ts'

export type TodoStatus = 'todo' | 'doing' | 'done' | 'blocked'

export interface PlanTodo {
  id: string
  title: string
  status: TodoStatus
  checkable: boolean
  dependsOn: string[]
  sourceSessionId: string | null
  sourceSessionTitle: string | null
  taskId: string | null
}

export interface PlanInfo {
  id: string
  title: string
  summary: string
  steps: string[]
  todos: PlanTodo[]
  status: string
  source: 'api' | 'tasks'
}

function normalizeTodoStatus(value: string | undefined): TodoStatus {
  if (value === 'doing' || value === 'done' || value === 'blocked') return value
  if (value === 'completed') return 'done'
  if (value === 'running' || value === 'in_progress') return 'doing'
  return 'todo'
}

function toTodo(value: unknown, index: number): PlanTodo | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? `todo-${index}`
  const title = readString(value, 'title') ?? readString(value, 'text') ?? ''
  if (!title) return null
  const dependsRaw = value['dependsOn'] ?? value['depends_on']
  return {
    id,
    title,
    status: normalizeTodoStatus(readString(value, 'status')),
    checkable: value['checkable'] !== false,
    dependsOn: Array.isArray(dependsRaw) ? dependsRaw.filter((item): item is string => typeof item === 'string') : [],
    sourceSessionId: readString(value, 'sourceSessionId') ?? readString(value, 'source_session_id') ?? null,
    sourceSessionTitle: readString(value, 'sourceSessionTitle') ?? readString(value, 'source_session_title') ?? null,
    taskId: readString(value, 'taskId') ?? readString(value, 'task_id') ?? null,
  }
}

function unwrapPlan(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null
  for (const key of ['plan', 'data', 'item']) {
    if (isRecord(payload[key])) return payload[key] as Record<string, unknown>
  }
  return payload
}

export function normalizePlan(payload: unknown): PlanInfo | null {
  const source = unwrapPlan(payload)
  if (!source) return null
  const rawTodos = Array.isArray(source['todos'])
    ? source['todos']
    : Array.isArray(source['items'])
      ? source['items']
      : Array.isArray(source['tasks'])
        ? source['tasks']
        : []
  const rawSteps = Array.isArray(source['steps']) ? source['steps'] : []
  const steps = rawSteps
    .map((step) => (typeof step === 'string' ? step : isRecord(step) ? readString(step, 'title') ?? readString(step, 'text') ?? '' : ''))
    .filter((step) => step.length > 0)
  const todos = rawTodos.map((todo, index) => toTodo(todo, index)).filter((todo): todo is PlanTodo => todo !== null)
  const title = readString(source, 'title') ?? '执行计划'
  const summary = readString(source, 'summary') ?? readString(source, 'goal') ?? ''
  if (!title && steps.length === 0 && todos.length === 0) return null
  return {
    id: readString(source, 'id') ?? 'plan',
    title,
    summary,
    steps,
    todos,
    status: readString(source, 'status') ?? 'proposed',
    source: 'api',
  }
}

/** 任务列表 → 计划投影（降级；只读，打勾仍走动作层）。 */
export function planFromTasks(tasks: readonly TaskInfo[]): PlanInfo | null {
  if (tasks.length === 0) return null
  return {
    id: 'tasks',
    title: '当前任务计划（来自任务列表）',
    summary: '后端计划接口未就绪，这里用现有任务列表做只读投影；状态以任务为准。',
    steps: tasks.map((task) => `${task.title}（${task.status}）`),
    todos: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: normalizeTodoStatus(task.status),
      checkable: false,
      dependsOn: [],
      sourceSessionId: task.sessionId ?? null,
      sourceSessionTitle: null,
      taskId: task.id,
    })),
    status: 'projection',
    source: 'tasks',
  }
}

export function todoStatusLabel(status: TodoStatus): string {
  if (status === 'doing') return '进行中'
  if (status === 'done') return '已完成'
  if (status === 'blocked') return '受阻'
  return '待办'
}

export function todoStatusTone(status: TodoStatus): string {
  if (status === 'done') return 'border-ok-border bg-ok-soft text-ok-ink'
  if (status === 'doing') return 'border-accent-border bg-accent-soft text-accent-hover'
  if (status === 'blocked') return 'border-danger-border bg-danger-soft text-danger-ink'
  return 'border-border-subtle bg-surface-sunken text-muted'
}

/** 打勾请求体（动作层；服务端校验任务状态）。 */
export function toggleTodoBody(todo: PlanTodo, checked: boolean): Record<string, unknown> {
  return { todoId: todo.id, checked, ...(todo.taskId ? { taskId: todo.taskId } : {}) }
}

// features/tasks/workflows.ts —— 工作流模型 + 任务分组（M10，纯逻辑可单测）
//
// 契约：docs/m10-contract.md §1/§6/§7。
//   GET /api/workflows?sessionId= → {workflows:[{id,title,status,progress?,tasks?}]}
//   GET /api/workflows/{id}       → {workflow:{...tasks:[...]}}
// 任务面板按状态分组（执行中/待开始/已完成/失败），并可按工作流分组展示。

import { isRecord, readNumber, readString } from '../../platform/types.ts'
import { normalizeTask, type TaskRecord } from './model.ts'

export const WORKFLOW_STATUSES = ['draft', 'running', 'paused', 'done', 'failed', 'cancelled'] as const
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

export const TASK_STATUS_GROUPS = ['running', 'pending', 'done', 'failed'] as const
export type TaskStatusGroup = (typeof TASK_STATUS_GROUPS)[number]

const WORKFLOW_SYNONYMS: Record<string, WorkflowStatus> = {
  draft: 'draft',
  planning: 'draft',
  running: 'running',
  active: 'running',
  in_progress: 'running',
  paused: 'paused',
  pause: 'paused',
  done: 'done',
  completed: 'done',
  success: 'done',
  failed: 'failed',
  error: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  interrupted: 'failed',
}

export function normalizeWorkflowStatus(raw: string | undefined): WorkflowStatus {
  const value = (raw ?? '').trim().toLowerCase()
  return WORKFLOW_SYNONYMS[value] ?? 'running'
}

export interface WorkflowRecord {
  id: string
  sessionId: string | null
  title: string
  status: WorkflowStatus
  progress: number | null
  createdAt: number | null
  updatedAt: number | null
  tasks: TaskRecord[]
}

function normalizeProgress(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric)) return null
  const normalized = numeric > 1 ? numeric / 100 : numeric
  return Math.min(1, Math.max(0, normalized))
}

export function normalizeWorkflow(value: unknown): WorkflowRecord | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'workflowId')
  if (!id) return null
  const tasksRaw = Array.isArray(value['tasks']) ? value['tasks'] : []
  const seen = new Set<string>()
  const tasks: TaskRecord[] = []
  for (const entry of tasksRaw) {
    const task = normalizeTask(entry)
    if (!task || seen.has(task.id)) continue
    seen.add(task.id)
    tasks.push(task)
  }
  const status = normalizeWorkflowStatus(readString(value, 'status'))
  const progress = normalizeProgress(value['progress']) ?? workflowProgressFromTasks(tasks, status)
  return {
    id,
    sessionId: readString(value, 'sessionId') ?? readString(value, 'session_id') ?? null,
    title: readString(value, 'title') ?? '未命名工作流',
    status,
    progress,
    createdAt: readNumber(value, 'createdAt') ?? readNumber(value, 'created_at') ?? null,
    updatedAt: readNumber(value, 'updatedAt') ?? readNumber(value, 'updated_at') ?? null,
    tasks,
  }
}

export function normalizeWorkflowList(payload: unknown): WorkflowRecord[] {
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeWorkflow(entry)).filter((wf): wf is WorkflowRecord => wf !== null)
  }
  if (!isRecord(payload)) return []
  for (const key of ['workflows', 'items', 'data']) {
    const value = payload[key]
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeWorkflow(entry)).filter((wf): wf is WorkflowRecord => wf !== null)
    }
    if (isRecord(value) && Array.isArray(value['workflows'])) {
      return value['workflows']
        .map((entry: unknown) => normalizeWorkflow(entry))
        .filter((wf: WorkflowRecord | null): wf is WorkflowRecord => wf !== null)
    }
  }
  return []
}

/** 详情响应：兼容 {workflow:{...}} / {data:{...}} / 对象本身。 */
export function normalizeWorkflowDetail(payload: unknown): WorkflowRecord | null {
  const direct = normalizeWorkflow(payload)
  if (direct) return direct
  if (!isRecord(payload)) return null
  for (const key of ['workflow', 'data', 'item']) {
    const value = payload[key]
    if (isRecord(value)) {
      const nested = normalizeWorkflowDetail(value)
      if (nested) return nested
    }
  }
  return null
}

/** 任务状态 → 面板分组（blocked 计入执行中，cancelled 计入失败）。 */
export function taskStatusGroup(status: string): TaskStatusGroup {
  const value = status.trim().toLowerCase()
  if (value === 'running' || value === 'blocked') return 'running'
  if (value === 'done') return 'done'
  if (value === 'failed' || value === 'cancelled' || value === 'canceled' || value === 'interrupted') return 'failed'
  return 'pending'
}

export function taskStatusGroupLabel(group: TaskStatusGroup): string {
  if (group === 'running') return '执行中'
  if (group === 'pending') return '待开始'
  if (group === 'done') return '已完成'
  return '失败'
}

export function groupTasksByStatus(tasks: readonly TaskRecord[]): Record<TaskStatusGroup, TaskRecord[]> {
  const groups: Record<TaskStatusGroup, TaskRecord[]> = { running: [], pending: [], done: [], failed: [] }
  for (const task of tasks) groups[taskStatusGroup(task.status)].push(task)
  return groups
}

export interface WorkflowTaskGroup {
  workflow: WorkflowRecord | null
  tasks: TaskRecord[]
}

/** 按工作流分组（未归属工作流的任务放最后一组）；组内按 orderIndex/createdAt 排序。 */
export function groupTasksByWorkflow(
  tasks: readonly TaskRecord[],
  workflows: readonly WorkflowRecord[],
): WorkflowTaskGroup[] {
  const byWorkflow = new Map<string, TaskRecord[]>()
  const orphans: TaskRecord[] = []
  for (const task of tasks) {
    if (task.workflowId) {
      const bucket = byWorkflow.get(task.workflowId)
      if (bucket) bucket.push(task)
      else byWorkflow.set(task.workflowId, [task])
    } else {
      orphans.push(task)
    }
  }
  const sortTasks = (list: TaskRecord[]): TaskRecord[] =>
    [...list].sort((a, b) => (a.orderIndex ?? 9999) - (b.orderIndex ?? 9999) || (a.createdAt ?? 0) - (b.createdAt ?? 0))

  const groups: WorkflowTaskGroup[] = []
  for (const workflow of workflows) {
    const bucket = byWorkflow.get(workflow.id)
    if (bucket && bucket.length > 0) {
      groups.push({ workflow, tasks: sortTasks(bucket) })
      byWorkflow.delete(workflow.id)
    }
  }
  // 任务里出现但工作流列表还没有的 workflowId：用占位工作流展示
  for (const [workflowId, bucket] of byWorkflow) {
    groups.push({
      workflow: { id: workflowId, sessionId: null, title: '工作流', status: 'running', progress: null, createdAt: null, updatedAt: null, tasks: bucket },
      tasks: sortTasks(bucket),
    })
  }
  if (orphans.length > 0) groups.push({ workflow: null, tasks: sortTasks(orphans) })
  return groups
}

/** 工作流进度（0–100）：优先后端 progress，否则按任务完成比例。 */
export function workflowProgressPercent(workflow: WorkflowRecord): number {
  if (workflow.status === 'done') return 100
  if (workflow.progress !== null) return Math.round(workflow.progress * 100)
  const total = workflow.tasks.length
  if (total === 0) return 0
  const done = workflow.tasks.filter((task) => task.status === 'done').length
  return Math.round((done / total) * 100)
}

function workflowProgressFromTasks(tasks: readonly TaskRecord[], status: WorkflowStatus): number | null {
  if (status === 'done') return 1
  if (tasks.length === 0) return null
  return tasks.filter((task) => task.status === 'done').length / tasks.length
}

export function workflowStatusLabel(status: WorkflowStatus): string {
  if (status === 'draft') return '草稿'
  if (status === 'running') return '进行中'
  if (status === 'paused') return '已暂停'
  if (status === 'done') return '已完成'
  if (status === 'failed') return '失败'
  return '已取消'
}

export function workflowStatusTone(status: WorkflowStatus): 'accent' | 'warn' | 'ok' | 'danger' | 'muted' {
  if (status === 'running') return 'accent'
  if (status === 'paused' || status === 'draft') return 'warn'
  if (status === 'done') return 'ok'
  if (status === 'failed') return 'danger'
  return 'muted'
}

export function workflowCounts(workflow: WorkflowRecord): Record<TaskStatusGroup, number> {
  const groups = groupTasksByStatus(workflow.tasks)
  return {
    running: groups.running.length,
    pending: groups.pending.length,
    done: groups.done.length,
    failed: groups.failed.length,
  }
}

/** 依赖引用 → 可读标题（按 id/key 解析；解析不到保留原值）。 */
export function dependencyLabels(task: TaskRecord, allTasks: readonly TaskRecord[]): string[] {
  const index = new Map<string, string>()
  for (const entry of allTasks) {
    if (entry.id) index.set(entry.id, entry.title)
    if (entry.key) index.set(entry.key, entry.title)
  }
  return task.dependsOn.map((ref) => index.get(ref) ?? ref)
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m${seconds > 0 ? `${seconds}s` : ''}`
}

/** 工作流控制可用的动作（draft/running/paused 可暂停/取消；paused 可恢复）。 */
export function workflowActions(workflow: WorkflowRecord | null): Array<'pause' | 'resume' | 'cancel'> {
  if (!workflow) return []
  if (workflow.status === 'running') return ['pause', 'cancel']
  if (workflow.status === 'paused') return ['resume', 'cancel']
  if (workflow.status === 'draft') return ['cancel']
  return []
}

// features/tasks/frames.ts —— task.* / approval.* 帧解析（tasks 领域私有）
//
// 契约 m2 §5 + M5 增量：
//   task.created {id, title, status:"queued", ...(phases/progress/artifacts 可选)}
//   task.updated {id, status?, summary?, progress?, phases?, artifacts?, approvals?}
//   approval.requested {id, taskId?, title/action?, summary?/reason?, kind?}
//   approval.resolved  {id, status}
// 帧里除 id 外的字段原样作为 patch 交给 model 归一化（容错优先）。

import { isRecord, readString } from '../../platform/types.ts'

export interface TaskCreatedPayload {
  id: string
  title: string
  status: string
  fields: Record<string, unknown>
}

export interface TaskPatch {
  id: string
  fields: Record<string, unknown>
}

function withoutId(data: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'id') fields[key] = value
  }
  return fields
}

export function parseTaskCreated(value: unknown): TaskCreatedPayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  return {
    id,
    title: readString(value, 'title') ?? '未命名任务',
    status: readString(value, 'status') ?? 'queued',
    fields: withoutId(value),
  }
}

export function parseTaskUpdated(value: unknown): TaskPatch | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  return { id, fields: withoutId(value) }
}

export interface ApprovalRequestedPayload {
  id: string
  taskId: string | null
  title: string
  summary?: string
  kind: string
}

export function parseApprovalRequested(value: unknown): ApprovalRequestedPayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'approvalId')
  if (!id) return null
  const summary = readString(value, 'summary') ?? readString(value, 'reason') ?? readString(value, 'detail')
  return {
    id,
    taskId: readString(value, 'taskId') ?? readString(value, 'task_id') ?? null,
    title: readString(value, 'title') ?? readString(value, 'action') ?? '等待确认的操作',
    ...(summary === undefined ? {} : { summary }),
    kind: readString(value, 'kind') ?? readString(value, 'tool') ?? 'tool',
  }
}

export interface ApprovalResolvedPayload {
  id: string
  status: string
  /** M9：拒绝原因 / 决策（policy / never / deny…） */
  decision?: string
  reason?: string
  tool?: string
  /** M9：是否被审批策略直接拒绝（fail-closed） */
  policyDenied: boolean
}

export function parseApprovalResolved(value: unknown): ApprovalResolvedPayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'approvalId')
  if (!id) return null
  const status = readString(value, 'status') ?? 'resolved'
  const decision = readString(value, 'decision')
  const reason = readString(value, 'reason') ?? readString(value, 'detail')
  const tool = readString(value, 'tool') ?? readString(value, 'title')
  const haystack = `${decision ?? ''} ${reason ?? ''} ${readString(value, 'error') ?? ''}`.toLowerCase()
  const policyDenied =
    value['policyDenied'] === true ||
    value['deniedByPolicy'] === true ||
    (status === 'denied' &&
      (haystack.includes('policy') || haystack.includes('never') || haystack.includes('fail-closed') || haystack.includes('fail_closed')))
  return {
    id,
    status,
    ...(decision === undefined ? {} : { decision }),
    ...(reason === undefined ? {} : { reason }),
    ...(tool === undefined ? {} : { tool }),
    policyDenied,
  }
}

// ---------------------------------------------------------------------------
// M10：工作流 / 逐任务汇报
// ---------------------------------------------------------------------------

export interface WorkflowFramePayload {
  id: string
  status?: string
  fields: Record<string, unknown>
}

export function parseWorkflowFrame(value: unknown): WorkflowFramePayload | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'workflowId')
  if (!id) return null
  const status = readString(value, 'status')
  return {
    id,
    ...(status === undefined ? {} : { status }),
    fields: withoutId(value),
  }
}

export interface TaskReportPayload {
  taskId: string
  workflowId: string | null
  messageId: string | null
}

export function parseTaskReport(value: unknown): TaskReportPayload | null {
  if (!isRecord(value)) return null
  const nested = isRecord(value['message']) ? value['message'] : value
  const taskId = readString(nested, 'taskId') ?? readString(nested, 'task_id') ?? readString(value, 'taskId')
  if (!taskId) return null
  return {
    taskId,
    workflowId: readString(nested, 'workflowId') ?? readString(nested, 'workflow_id') ?? null,
    messageId: readString(nested, 'messageId') ?? readString(nested, 'id') ?? null,
  }
}

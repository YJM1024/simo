// features/tasks/rest.ts —— 任务详情 / 取消重试 / 产物内容 / 审批（本 feature 私有）
//
// 端点（M5）：
//   GET  /api/tasks/{id}                任务详情（phases/steps/artifacts/approvals）
//   POST /api/tasks/{id}/cancel         取消（保留中断点；不是撤回）
//   POST /api/tasks/{id}/retry          重试
//   GET  /api/artifacts/{id}/content    产物内容（文本/Markdown/图片/下载）
//   POST /api/approvals/{id}            权限确认（允许/拒绝；必须由人点击，不自动执行）
//
// 审批体同时带 decision/approved/action 三个字段，兼容后端字段差异；
// 若 400 则用 {decision:"allow"|"deny"} 再试一次。

import { HttpError, apiGet, apiPost, fetchBinary } from '../../platform/http.ts'
import { approvalActionBody, type ApprovalDecision } from './model.ts'

export function fetchTaskDetail(taskId: string, signal?: AbortSignal): Promise<unknown> {
  return apiGet(`/api/tasks/${encodeURIComponent(taskId)}`, signal ? { signal } : {})
}

export function cancelTask(taskId: string): Promise<unknown> {
  return apiPost(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {})
}

export function retryTask(taskId: string): Promise<unknown> {
  return apiPost(`/api/tasks/${encodeURIComponent(taskId)}/retry`, {})
}

/**
 * M9：提交审批决策（允许一次 / 本会话允许 / 拒绝）。
 * 主请求用 M9 的 decision 值；若后端仍是 M5 语义（400），回退到 allow/deny。
 */
export async function submitApproval(approvalId: string, decision: ApprovalDecision): Promise<unknown> {
  const path = `/api/approvals/${encodeURIComponent(approvalId)}`
  try {
    return await apiPost(path, approvalActionBody(decision))
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) {
      const legacy = decision === 'deny' ? 'deny' : 'allow'
      // 旧后端只认 allow/deny：带 scope 作为向前兼容（新后端可据 scope 区分一次/本会话）
      return apiPost(path, {
        decision: legacy,
        approved: legacy === 'allow',
        action: legacy,
        scope: decision === 'allow_session' ? 'session' : 'once',
      })
    }
    throw error
  }
}

export function artifactContentUrl(artifactId: string): string {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/content`
}

// ---------------------------------------------------------------------------
// M10：工作流
// ---------------------------------------------------------------------------

export type WorkflowAction = 'pause' | 'resume' | 'cancel'

export function fetchWorkflows(sessionId: string, signal?: AbortSignal): Promise<unknown> {
  return apiGet(`/api/workflows?sessionId=${encodeURIComponent(sessionId)}`, signal ? { signal } : {})
}

export function fetchWorkflowDetail(workflowId: string, signal?: AbortSignal): Promise<unknown> {
  return apiGet(`/api/workflows/${encodeURIComponent(workflowId)}`, signal ? { signal } : {})
}

export function workflowAction(workflowId: string, action: WorkflowAction): Promise<unknown> {
  return apiPost(`/api/workflows/${encodeURIComponent(workflowId)}/${action}`, {})
}

const TEXT_PREVIEW_LIMIT = 200_000

export interface ArtifactText {
  text: string
  truncated: boolean
  contentType: string
}

export async function fetchArtifactText(artifactId: string, signal?: AbortSignal): Promise<ArtifactText> {
  const response = await fetchBinary(artifactContentUrl(artifactId), signal ? { signal } : {})
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  return {
    text: text.slice(0, TEXT_PREVIEW_LIMIT),
    truncated: text.length > TEXT_PREVIEW_LIMIT,
    contentType,
  }
}

export async function fetchArtifactBlob(artifactId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetchBinary(artifactContentUrl(artifactId), signal ? { signal } : {})
  return response.blob()
}

/** 审批列表（GET /api/approvals；前端过滤 pending）。 */
export function fetchApprovals(signal?: AbortSignal): Promise<unknown> {
  return apiGet('/api/approvals', signal ? { signal } : {})
}

/**
 * M6：会话产物列表（父会话/聚合视图可看子会话产物，不复制文件）。
 * 后端端点：GET /api/sessions/{id}/artifacts；子会话聚合由前端按 sessionMeta 逐会话读取。
 */
export function fetchSessionArtifacts(sessionId: string, signal?: AbortSignal): Promise<unknown> {
  return apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/artifacts`, signal ? { signal } : {})
}

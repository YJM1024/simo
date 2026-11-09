// features/memory/browser-rest.ts —— 记忆浏览器只读 API（v0.3 / M21）
//
// 全部只读 GET；写端点不存在（契约 §6.1 明确 404）。后端未就绪时由页面降级为空态说明。

import { apiGet } from '../../platform/http.ts'

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function fetchBrowserItems(
  query: { q?: string; type?: string; entityId?: string; layer?: number; status?: string; limit?: number },
  signal?: AbortSignal,
): Promise<unknown> {
  return apiGet(`/api/memory/items${qs({ q: query.q, type: query.type, entityId: query.entityId, layer: query.layer, status: query.status, limit: query.limit })}`, signal ? { signal } : {})
}

export function fetchBrowserEntities(
  query: { q?: string; kind?: string; ownerAgent?: string; limit?: number },
  signal?: AbortSignal,
): Promise<unknown> {
  return apiGet(`/api/memory/entities${qs({ q: query.q, kind: query.kind, ownerAgent: query.ownerAgent, limit: query.limit })}`, signal ? { signal } : {})
}

export function fetchBrowserEntityDetail(entityId: string, signal?: AbortSignal): Promise<unknown> {
  return apiGet(`/api/memory/entities/${encodeURIComponent(entityId)}`, signal ? { signal } : {})
}

export function fetchBrowserConflicts(signal?: AbortSignal): Promise<unknown> {
  return apiGet('/api/memory/conflicts', signal ? { signal } : {})
}

export function fetchBrowserAgents(signal?: AbortSignal): Promise<unknown> {
  return apiGet('/api/memory/agents', signal ? { signal } : {})
}

export function fetchBrowserAgentMemory(
  agentId: string,
  query: { type?: string; q?: string; limit?: number },
  signal?: AbortSignal,
): Promise<unknown> {
  return apiGet(`/api/memory/agents/${encodeURIComponent(agentId)}/memory${qs({ type: query.type, q: query.q, limit: query.limit })}`, signal ? { signal } : {})
}

export function fetchBrowserPyramid(
  query: { entityId?: string; level?: number; view?: string },
  signal?: AbortSignal,
): Promise<unknown> {
  return apiGet(`/api/memory/pyramid${qs({ entityId: query.entityId, level: query.level, view: query.view })}`, signal ? { signal } : {})
}

// features/memory/rest.ts —— 记忆只读 API（本 feature 私有端点封装）
//
// 契约：docs/m3-contract.md §4
//   GET /api/memory/items?scope=&q=&status=&limit=  → {ok, items, total, query}
//   GET /api/memory/scopes                          → {ok, scopes:[{scope,count}]}
//   GET /api/memory/conflicts                       → {ok, conflicts:[group]}
// 没有写接口（契约 §4：POST/PUT/PATCH/DELETE /api/memory* → 404）。

import { apiGet } from '../../platform/http.ts'

export interface MemoryQuery {
  q?: string
  scope?: string
  status?: string
  limit?: number
}

function queryString({ q, scope, status, limit }: MemoryQuery): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (scope) params.set('scope', scope)
  if (status) params.set('status', status)
  if (limit) params.set('limit', String(limit))
  const suffix = params.toString()
  return suffix ? `?${suffix}` : ''
}

/** 只读列表/检索（同一端点：q 为空=按时间倒序，非空=检索；排序由后端决定，前端不依赖分值）。 */
export function fetchMemoryItems(query: MemoryQuery, signal: AbortSignal): Promise<unknown> {
  return apiGet(`/api/memory/items${queryString(query)}`, { signal })
}

export function fetchMemoryScopes(signal: AbortSignal): Promise<unknown> {
  return apiGet('/api/memory/scopes', { signal })
}

export function fetchMemoryConflicts(signal: AbortSignal): Promise<unknown> {
  return apiGet('/api/memory/conflicts', { signal })
}

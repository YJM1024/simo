// features/team/rest.ts —— 团队页只读 API（V1/V2）
//
// 契约 docs/team-contract.md §7.1：GET /api/sessions/{id}/team（当前会话团队摘要，V2 数据源）；
// 兼容 GET /api/team（Lead 指定的降级端点）。团队页不编辑：创建/暂停/换负责人走对话动作层。

import { HttpError, apiGet } from '../../platform/http.ts'

function isNotFound(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 404 || error.status === 405)
}

/** 团队摘要：优先当前会话团队端点，缺失时回退 GET /api/team；两者都不可用则抛错（页面显示空态）。 */
export async function fetchTeam(sessionId: string | null, signal?: AbortSignal): Promise<unknown> {
  if (sessionId) {
    try {
      return await apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/team`, signal ? { signal } : {})
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return apiGet('/api/team', signal ? { signal } : {})
}

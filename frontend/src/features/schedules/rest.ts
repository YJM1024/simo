// features/schedules/rest.ts —— 定时任务 API（M13）
//
// 契约 docs/m13-contract.md §4：
//   GET /api/schedules
//   POST /api/schedules
//   GET /api/schedules/{id}
//   PATCH /api/schedules/{id}
//   DELETE /api/schedules/{id}
//   POST /api/schedules/{id}/run-now

import { apiDelete, apiGet, apiPatch, apiPost } from '../../platform/http.ts'

export function getSchedules(): Promise<unknown> {
  return apiGet('/api/schedules')
}

export function createSchedule(body: Record<string, unknown>): Promise<unknown> {
  return apiPost('/api/schedules', body)
}

export function updateSchedule(id: string, body: Record<string, unknown>): Promise<unknown> {
  return apiPatch(`/api/schedules/${encodeURIComponent(id)}`, body)
}

export function deleteSchedule(id: string): Promise<unknown> {
  return apiDelete(`/api/schedules/${encodeURIComponent(id)}`)
}

export function runScheduleNow(id: string): Promise<unknown> {
  return apiPost(`/api/schedules/${encodeURIComponent(id)}/run-now`, {})
}

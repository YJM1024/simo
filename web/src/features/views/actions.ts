// features/views/actions.ts —— 视图动作调用（M20 唯一入口）
//
// 所有视图交互（数据绑定只读动作 / 动作绑定 / ui.get_view / ui.set_view / ui.delete_view）
// 统一 POST /api/actions/{name}，body 为参数对象；不新增业务 API。
// R3+ 审批由后端动作层承担；前端只展示错误/审批提示，不乐观改状态。

import { apiGet, apiPost } from '../../platform/http.ts'
import { isRecord, readNumber, readString } from '../../platform/types.ts'

export interface ActionResult {
  ok: boolean
  data: unknown
  error: { code?: string; message?: string; recovery?: string; details?: Record<string, unknown> } | null
  raw: unknown
}

/** 执行动作；body 直接传 args（M20 端点形状）。 */
export async function callAction(name: string, args: Record<string, unknown> = {}): Promise<ActionResult> {
  try {
    const raw = await apiPost(`/api/actions/${encodeURIComponent(name)}`, args)
    const envelope = isRecord(raw) ? raw : {}
    const ok = envelope['ok'] !== false
    const error = isRecord(envelope['error'])
      ? {
          code: readString(envelope['error'], 'code'),
          message: readString(envelope['error'], 'message'),
          recovery: readString(envelope['error'], 'recovery'),
          ...(isRecord(envelope['error']['details']) ? { details: envelope['error']['details'] as Record<string, unknown> } : {}),
        }
      : null
    return { ok, data: envelope['data'] ?? envelope, error, raw }
  } catch (error) {
    const status = (error as { status?: number }).status
    const body = (error as { body?: unknown }).body
    const envelope = isRecord(body) && isRecord(body['error']) ? (body['error'] as Record<string, unknown>) : {}
    const message =
      readString(envelope, 'message') ??
      (error instanceof Error && error.message ? error.message : '动作调用失败')
    return {
      ok: false,
      data: null,
      error: {
        code: readString(envelope, 'code') ?? (status ? `HTTP_${status}` : 'ACTION_FAILED'),
        message,
        ...(readString(envelope, 'recovery') ? { recovery: readString(envelope, 'recovery') } : {}),
        ...(isRecord(envelope['details']) ? { details: envelope['details'] as Record<string, unknown> } : {}),
      },
      raw: null,
    }
  }
}

/** 动作目录（GET /api/actions）：用于校验数据绑定只能引用只读动作。 */
export async function fetchActionCatalog(): Promise<unknown> {
  return apiGet('/api/actions')
}

export function uiGetView(sessionId: string, pageId?: string): Promise<ActionResult> {
  return callAction('ui.get_view', { sessionId, ...(pageId ? { pageId } : {}) })
}

export function uiSetView(params: {
  sessionId: string
  pageId?: string
  mode: 'create' | 'replace' | 'patch' | 'rollback'
  schema?: unknown
  patch?: unknown
  baseVersion?: number
  targetVersion?: number
  reason: string
}): Promise<ActionResult> {
  return callAction('ui.set_view', { ...params })
}

export function uiDeleteView(params: { sessionId: string; pageId: string; reason?: string }): Promise<ActionResult> {
  return callAction('ui.delete_view', { ...params })
}

export interface LoadedView {
  page: unknown
  pageId: string | null
  version: number | null
  previousVersion: number | null
  raw: unknown
}

function unpackPage(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

/** 从 ui.get_view 动作结果解出 page/version/pageId。 */
export function extractLoadedView(result: ActionResult): LoadedView | null {
  if (!result.ok) return null
  const root = result.data
  if (!isRecord(root)) return null
  const nested = isRecord(root['view']) ? root['view'] : isRecord(root['page']) ? root['page'] : root
  const pageRaw = unpackPage(nested['schema'] ?? nested['page'] ?? nested['schemaJson'] ?? nested['schema_json'] ?? nested)
  const pageId = readString(nested, 'pageId') ?? readString(nested, 'page_id') ?? readString(pageRaw, 'id') ?? null
  const version = readNumber(nested, 'version') ?? readNumber(root, 'version') ?? null
  return {
    page: pageRaw,
    pageId,
    version,
    previousVersion: readNumber(nested, 'previousVersion') ?? readNumber(nested, 'previous_version') ?? null,
    raw: result.data,
  }
}

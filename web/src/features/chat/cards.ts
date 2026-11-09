// features/chat/cards.ts —— M41 消息内联交互卡片纯逻辑
//
// 消息里的 cards[] 复用视图 schema 渲染；交互统一 POST /api/cards/{id}/actions/{actionId}
// （payload + baseVersion）；route=agent 等待司墨回复，route=action 展示结果/错误；
// WS card.updated 替换新版本；baseVersion 过期提示刷新。不展示裸 JSON、不渲染 HTML。

import { HttpError, apiGet, apiPost } from '../../platform/http.ts'
import { isRecord, readNumber, readString } from '../../platform/types.ts'
import {
  resolveBindingArgs,
  validateViewPage,
  type ViewActionBinding,
  type ViewPage,
} from '../views/schema.ts'

export type CardStatus = 'active' | 'submitted' | 'disabled' | 'expired' | string

export interface InlineCard {
  id: string
  messageId: string
  sessionId: string
  version: number
  status: CardStatus
  fallbackText: string
  route: 'agent' | 'action'
  page: ViewPage | null
  pageError: string | null
}

export function normalizeCardStatus(value: unknown): CardStatus {
  const text = typeof value === 'string' ? value.toLowerCase() : ''
  return text || 'active'
}

function parseSchema(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

function cardPage(raw: Record<string, unknown>, id: string, sessionId: string, fallbackText: string): ViewPage | null {
  const safe = id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'card'
  const pageId = `view-${safe}`
  const schemaRaw = parseSchema(raw['schema'] ?? raw['page'] ?? raw['card'])
  const candidate = isRecord(schemaRaw)
    ? schemaRaw
    : Array.isArray(schemaRaw)
      ? { blocks: schemaRaw }
      : Array.isArray(raw['blocks'])
        ? { blocks: raw['blocks'] }
        : null
  if (!candidate) return null
  const page = isRecord(candidate) && readNumber(candidate, 'schemaVersion') === 1
    ? candidate
    : {
        schemaVersion: 1,
        id: pageId,
        sessionId,
        title: '交互卡片',
        layout: { kind: 'rows', columns: 12, gap: 'md', areas: [] },
        blocks: Array.isArray(candidate['blocks']) ? candidate['blocks'] : Array.isArray(candidate) ? candidate : [],
        equivalence: { chatPrompt: fallbackText || '通过对话完成这个卡片' },
      }
  if (!isRecord(page)) return null
  const validation = validateViewPage({
    ...page,
    schemaVersion: 1,
    id: pageId,
    sessionId,
    title: readString(page, 'title') ?? '交互卡片',
    layout: isRecord(page['layout']) ? page['layout'] : { kind: 'rows', columns: 12, gap: 'md', areas: [] },
  })
  return validation.ok && !validation.fallback ? validation.page : null
}

/** 消息卡片归一化；schema 无效/未知块时 page=null，由 fallbackText 兜底。 */
export function normalizeInlineCard(raw: unknown, messageId: string, sessionId: string): InlineCard | null {
  if (!isRecord(raw)) return null
  const id = readString(raw, 'id') ?? readString(raw, 'cardId') ?? readString(raw, 'card_id')
  if (!id) return null
  const fallbackText = readString(raw, 'fallbackText') ?? readString(raw, 'fallback_text') ?? ''
  const routeRaw = readString(raw, 'route') ?? readString(raw, 'sendMode')
  const page = cardPage(raw, id, sessionId, fallbackText)
  return {
    id,
    messageId: readString(raw, 'messageId') ?? readString(raw, 'message_id') ?? messageId,
    sessionId: readString(raw, 'sessionId') ?? readString(raw, 'session_id') ?? sessionId,
    version: readNumber(raw, 'version') ?? 0,
    status: normalizeCardStatus(readString(raw, 'status')),
    fallbackText,
    route: routeRaw === 'action' ? 'action' : 'agent',
    page,
    pageError: page ? null : '卡片内容无效或包含不支持的块，已降级为文本说明。',
  }
}

export function normalizeInlineCards(value: unknown, messageId: string, sessionId: string): InlineCard[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const cards: InlineCard[] = []
  for (const entry of value) {
    const card = normalizeInlineCard(entry, messageId, sessionId)
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    cards.push(card)
  }
  return cards
}

/** 卡片动作 payload：只发送声明式 args + 行/表单上下文，不拼 HTML/脚本。 */
export function cardActionPayload(
  card: InlineCard,
  binding: ViewActionBinding,
  page: ViewPage,
  row?: Record<string, unknown>,
): { payload: Record<string, unknown>; baseVersion: number } {
  const payload = resolveBindingArgs(binding.args, { sessionId: card.sessionId, pageId: page.id, ...(row ? { row } : {}) })
  return { payload: { ...payload, ...(row ? { row } : {}) }, baseVersion: card.version }
}

export interface CardActionResult {
  ok: boolean
  route: 'agent' | 'action'
  status: CardStatus
  version: number | null
  card: InlineCard | null
  message: string
  conflict: boolean
}

function extractEnvelope(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  return isRecord(value['data']) ? (value['data'] as Record<string, unknown>) : value
}

function readableResult(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (isRecord(value)) {
    for (const key of ['message', 'text', 'summary', 'title', 'result']) {
      const candidate = value[key]
      if (typeof candidate === 'string' && candidate) return candidate
    }
  }
  return '动作已完成'
}

/** 调用卡片动作；baseVersion 冲突返回 conflict；不把原始 JSON 当文案。 */
export async function submitCardAction(
  card: InlineCard,
  binding: ViewActionBinding,
  page: ViewPage,
  row?: Record<string, unknown>,
): Promise<CardActionResult> {
  const { payload, baseVersion } = cardActionPayload(card, binding, page, row)
  try {
    const raw = await apiPost(`/api/cards/${encodeURIComponent(card.id)}/actions/${encodeURIComponent(binding.id)}`, { payload, baseVersion })
    const data = extractEnvelope(raw)
    const route = readString(data, 'route') === 'action' ? 'action' : readString(data, 'route') === 'agent' ? 'agent' : card.route
    const cardRaw = isRecord(data['card']) ? data['card'] : isRecord(data['newCard']) ? data['newCard'] : null
    const nextCard = cardRaw ? normalizeInlineCard(cardRaw, card.messageId, card.sessionId) : null
    const status = normalizeCardStatus(readString(data, 'status') ?? nextCard?.status ?? (route === 'agent' ? 'submitted' : card.status))
    return {
      ok: true,
      route,
      status,
      version: readNumber(data, 'version') ?? nextCard?.version ?? null,
      card: nextCard,
      message: route === 'agent' ? '已发送给司墨，等待回复' : readableResult(data['result'] ?? data),
      conflict: false,
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 0
    const body = error instanceof HttpError ? (error as HttpError & { body?: unknown }).body : null
    const errorEnvelope = isRecord(body) && isRecord(body['error']) ? (body['error'] as Record<string, unknown>) : {}
    const code = readString(errorEnvelope, 'code') ?? ''
    const conflict = status === 409 || /BASE_CONFLICT|STALE|VERSION/i.test(code)
    const message = readString(errorEnvelope, 'message') ?? (error instanceof Error && error.message ? error.message : '卡片动作失败')
    return { ok: false, route: card.route, status: card.status, version: null, card: null, message, conflict }
  }
}

export async function fetchInlineCard(id: string, messageId: string, sessionId: string): Promise<InlineCard | null> {
  try {
    const payload = await apiGet(`/api/cards/${encodeURIComponent(id)}`)
    const data = extractEnvelope(payload)
    const raw = isRecord(data['card']) ? data['card'] : data
    return normalizeInlineCard(raw, messageId, sessionId)
  } catch {
    return null
  }
}

export interface CardUpdatedFrame {
  card: InlineCard | null
}

/** 解析 WS card.updated 帧；兼容 {card} / {data:{card}}。 */
export function parseCardUpdated(frameData: unknown, sessionId: string): InlineCard | null {
  const data = isRecord(frameData) ? frameData : {}
  const raw = isRecord(data['card']) ? data['card'] : data
  const messageId = readString(raw, 'messageId') ?? readString(raw, 'message_id') ?? ''
  return normalizeInlineCard(raw, messageId, sessionId)
}

export function isCardInteractive(card: InlineCard): boolean {
  return card.page !== null && card.status !== 'disabled' && card.status !== 'expired' && card.status !== 'submitted'
}

// features/chat/InlineCard.tsx —— M41 消息内联交互卡片（复用 views/ViewRenderer，完整 13 块）
//
// 渲染：message.cards[] → normalizeInlineCards；schema 无效/未知块 → fallbackText（纯文本，不显示 JSON）。
// 交互：只走 POST /api/cards/{id}/actions/{actionId}（payload + baseVersion）；提交中防重复。
// route=agent → “已发送给司墨，等待回复”；route=action → 结果/错误/审批提示（服务端 message）。
// 状态 submitted/disabled/expired 有明确样式并禁用交互；WS card.updated 替换新版本；
// baseVersion 409 → 提示刷新（可拉取最新卡片）。卡片白底/1px 边框/8px 圆角/主题 token。

import { useEffect, useState } from 'react'
import { bus, EVENTS } from '../../platform/events.ts'
import type { WireFrame } from '../../platform/types.ts'
import { Badge } from '../../platform/ui/Badge.tsx'
import { Button } from '../../platform/ui/Button.tsx'
import { Icon } from '../../platform/ui/icons.tsx'
import { fetchActionCatalog } from '../views/actions.ts'
import { normalizeActionCatalog, type ActionCatalogEntry, type ViewActionBinding, type ViewPage } from '../views/schema.ts'
import { ViewPageRenderer } from '../views/ViewRenderer.tsx'
import {
  fetchInlineCard,
  isCardInteractive,
  normalizeInlineCards,
  parseCardUpdated,
  submitCardAction,
  type InlineCard,
} from './cards.ts'

interface Feedback {
  tone: 'ok' | 'warn' | 'danger' | 'muted'
  text: string
}

const FEEDBACK_TONE: Record<Feedback['tone'], string> = {
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  muted: 'border-border-subtle bg-surface-sunken text-ink-secondary',
}

function statusLabel(card: InlineCard): string {
  if (card.status === 'submitted') return '已提交'
  if (card.status === 'disabled') return '已停用'
  if (card.status === 'expired') return '已过期'
  return '进行中'
}

function statusTone(card: InlineCard): 'accent' | 'muted' | 'warn' | 'danger' {
  if (card.status === 'submitted') return 'warn'
  if (card.status === 'disabled') return 'muted'
  if (card.status === 'expired') return 'danger'
  return 'accent'
}

function InlineCardView({ card: initial, catalog, onCardChange }: { card: InlineCard; catalog: readonly ActionCatalogEntry[]; onCardChange: (card: InlineCard) => void }) {
  const [card, setCard] = useState(initial)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setCard(initial)
  }, [initial])

  const applyCard = (next: InlineCard): void => {
    setCard(next)
    onCardChange(next)
  }

  const runAction = async (page: ViewPage, binding: ViewActionBinding, row?: Record<string, unknown>): Promise<boolean> => {
    if (submitting !== null) return false
    if (!isCardInteractive(card)) {
      setFeedback({ tone: 'warn', text: `卡片当前为${statusLabel(card)}状态，不能再操作；请刷新卡片。` })
      return false
    }
    setSubmitting(binding.id)
    setFeedback(null)
    const result = await submitCardAction(card, binding, page, row)
    setSubmitting(null)
    if (result.conflict) {
      setFeedback({ tone: 'warn', text: '卡片已更新（版本冲突），请刷新后重试。' })
      return false
    }
    if (!result.ok) {
      const needsApproval = /approval|审批|批准/i.test(result.message)
      setFeedback({ tone: result.route === 'agent' ? 'warn' : 'danger', text: needsApproval ? `需要审批：${result.message}` : result.message })
      return false
    }
    const nextCard: InlineCard = result.card
      ? { ...result.card, status: result.status }
      : { ...card, status: result.status, version: result.version ?? card.version }
    applyCard(nextCard)
    setFeedback({ tone: result.route === 'agent' ? 'muted' : 'ok', text: result.message })
    return true
  }

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    const latest = await fetchInlineCard(card.id, card.messageId, card.sessionId)
    setRefreshing(false)
    if (!latest) {
      setFeedback({ tone: 'warn', text: '刷新失败：卡片接口未就绪或已不存在。' })
      return
    }
    applyCard(latest)
    setFeedback({ tone: 'muted', text: '已刷新到最新版本' })
  }

  const blocked = !isCardInteractive(card) || card.status === 'submitted' || card.status === 'disabled' || card.status === 'expired'
  const locked = blocked || submitting !== null
  const title = card.page?.title ?? '交互卡片'

  return (
    <section className="min-w-0 rounded-md border border-border bg-surface-solid p-3" aria-label={`交互卡片：${title}`}>
      <header className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5 border-b border-border-subtle pb-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-ink">
          <Icon name="overview" size={16} className="text-muted" />
          <span className="truncate">{title}</span>
        </span>
        <Badge tone={statusTone(card)} dot>{statusLabel(card)}</Badge>
        <span className="text-xs tabular-nums text-muted">v{card.version}</span>
        <Button size="sm" variant="ghost" icon="refresh" loading={refreshing} onClick={() => void refresh()} aria-label="刷新卡片">刷新</Button>
      </header>

      {feedback && (
        <p role={feedback.tone === 'danger' ? 'alert' : 'status'} className={`m-0 mb-2 rounded-xs border px-2 py-1 text-sm ${FEEDBACK_TONE[feedback.tone]}`}>
          {feedback.text}
        </p>
      )}

      {card.status === 'submitted' && (
        <p role="status" className="m-0 mb-2 rounded-xs border border-warn-border bg-warn-soft px-2 py-1 text-sm text-warn-ink">
          已发送给司墨，等待回复…
        </p>
      )}
      {card.status === 'expired' && (
        <p role="status" className="m-0 mb-2 rounded-xs border border-danger-border bg-danger-soft px-2 py-1 text-sm text-danger-ink">
          卡片已过期，请刷新或继续通过对话完成。
        </p>
      )}
      {card.status === 'disabled' && (
        <p role="status" className="m-0 mb-2 rounded-xs border border-border-subtle bg-surface-sunken px-2 py-1 text-sm text-ink-secondary">
          卡片已停用，仅供查看。
        </p>
      )}

      {card.page ? (
        <div className={locked ? 'pointer-events-none opacity-70' : ''} aria-disabled={locked || undefined} aria-busy={submitting !== null || undefined}>
          <ViewPageRenderer page={card.page} catalog={catalog} onRunAction={(page, binding, row) => runAction(page, binding, row)} onNotice={(message) => setFeedback({ tone: 'warn', text: message })} />
        </div>
      ) : (
        <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{card.fallbackText || '这张卡片暂不可用，请继续通过对话完成。'}</p>
      )}

      {submitting !== null && <p role="status" className="m-0 mt-2 text-xs text-muted">提交中，请稍候…</p>}
    </section>
  )
}

export default function InlineCards({ cards, messageId, sessionId }: { cards: unknown[]; messageId: string; sessionId: string }) {
  const [items, setItems] = useState<InlineCard[]>(() => normalizeInlineCards(cards, messageId, sessionId))
  const [catalog, setCatalog] = useState<ActionCatalogEntry[]>([])

  useEffect(() => {
    setItems(normalizeInlineCards(cards, messageId, sessionId))
  }, [cards, messageId, sessionId])

  useEffect(() => {
    let cancelled = false
    void fetchActionCatalog()
      .then((payload) => { if (!cancelled) setCatalog(normalizeActionCatalog(payload)) })
      .catch(() => { if (!cancelled) setCatalog([]) })
    return () => { cancelled = true }
  }, [])

  useEffect(
    () =>
      bus.on(EVENTS.WS_FRAME, ({ frame }: { frame: WireFrame }) => {
        if (frame.type !== 'card.updated' && frame.type !== 'card.updated.v1') return
        const next = parseCardUpdated(frame.data, sessionId)
        if (!next) return
        setItems((prev) => prev.map((card) => (card.id === next.id ? next : card)))
      }),
    [sessionId],
  )

  if (items.length === 0) return null
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-2" aria-label="交互卡片列表">
      {items.map((card) => (
        <InlineCardView
          key={card.id}
          card={card}
          catalog={catalog}
          onCardChange={(next) => setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)))}
        />
      ))}
    </div>
  )
}

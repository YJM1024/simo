// features/chat/Composer.tsx —— 输入区（M44：多行自适应、无格式工具条、无模型选择器）
//
// ChatGPT/Claude 风格：textarea 默认 3 行、随内容增长（最多约 8 行后内部滚动）；
// 左下角仅「支持 Markdown 格式」，右下角发送（空内容禁用/提交中 loading）；
// 下方只保留极简键盘提示；附件保留按钮/拖拽/粘贴，模型在智能体页配置。

import { useEffect, useRef, useState } from 'react'
import { apiGet, getSessions } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import type { ChatAttachment, ChatMessage } from '../../platform/types.ts'
import {
  detectMentionTrigger,
  filterMentions,
  insertMention,
  normalizeMentionFiles,
  normalizeMentionSessions,
  type MentionItem,
  type MentionTrigger,
} from './mentions.ts'
import { slashSuggestions } from './slash.ts'
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  attachmentErrorText,
  formatBytes,
  uploadFiles,
  validateFiles,
} from './attachments.ts'

const MAX_HEIGHT = 196

interface ComposerProps {
  disabled: boolean
  /** 禁用原因（例如「已归档，只读」）；提供时覆盖默认占位文案 */
  disabledReason?: string
  /** 上传附件需要会话（GET/POST /api/uploads?sessionId=） */
  sessionId: string | null
  /** M15：正在回复的消息（显示引用条；发送/取消后清空） */
  replyTo?: ChatMessage | null
  onCancelReply?: () => void
  /** UI-1：斜杠命令（由 ChatCenter 执行；返回 true 表示已处理、不再发送） */
  onSlashCommand?: (text: string) => Promise<boolean> | boolean
  onSend: (text: string, attachments?: ChatAttachment[]) => Promise<boolean>
}

export default function Composer({ disabled, disabledReason, sessionId, replyTo, onCancelReply, onSlashCommand, onSend }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null)
  const [mentionPool, setMentionPool] = useState<MentionItem[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionLoading, setMentionLoading] = useState(false)
  const mentionSourcesRef = useRef<string>('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const canSend = !disabled && !uploading && !sending && (draft.trim().length > 0 || attachments.length > 0)
  const mentionItems = mentionTrigger ? filterMentions(mentionPool, mentionTrigger.query) : []
  const slashHints = slashSuggestions(draft)

  // 自适应高度：默认约 3 行，最多约 8 行后内部滚动
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  // M44：空态建议按钮填入输入框（不自动发送）
  useEffect(
    () =>
      bus.on(EVENTS.COMPOSER_INSERT, ({ text }: { text: string }) => {
        setDraft((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text))
        requestAnimationFrame(() => {
          const target = textareaRef.current
          if (!target) return
          target.focus()
          target.setSelectionRange(target.value.length, target.value.length)
        })
      }),
    [],
  )

  const notifyError = (detail: string): void => {
    bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '附件上传失败', detail })
  }

  const addFiles = async (files: File[]): Promise<void> => {
    if (disabled || files.length === 0) return
    if (!sessionId) {
      notifyError('会话尚未就绪，暂时无法上传')
      return
    }
    const validationError = validateFiles(files, attachments.length)
    if (validationError) {
      notifyError(validationError)
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadFiles(sessionId, files)
      setAttachments((prev) => {
        const known = new Set(prev.map((item) => item.id))
        return [...prev, ...uploaded.filter((item) => !known.has(item.id))].slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
      })
    } catch (error) {
      notifyError(attachmentErrorText(error))
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (id: string): void => {
    setAttachments((prev) => prev.filter((item) => item.id !== id))
    textareaRef.current?.focus()
  }

  // ---- UI-1：@ 引用候选（会话 + 当前会话文件；失败则空列表，不影响输入） ----
  async function openMentionSources(): Promise<void> {
    mentionSourcesRef.current = sessionId ?? ''
    setMentionLoading(true)
    try {
      const [sessionsPayload, filesPayload] = await Promise.all([
        getSessions().catch(() => null),
        sessionId ? apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/files`).catch(() => null) : Promise.resolve(null),
      ])
      setMentionPool([...normalizeMentionSessions(sessionsPayload), ...normalizeMentionFiles(filesPayload)])
    } finally {
      setMentionLoading(false)
    }
  }

  function handleDraftChange(text: string, caret: number): void {
    setDraft(text)
    const trigger = detectMentionTrigger(text, caret)
    setMentionTrigger(trigger)
    setMentionIndex(0)
    if (trigger && mentionSourcesRef.current !== (sessionId ?? '')) void openMentionSources()
  }

  function selectMention(item: MentionItem): void {
    if (!mentionTrigger) return
    const next = insertMention(draft, mentionTrigger, item.label)
    setDraft(next.text)
    setMentionTrigger(null)
    requestAnimationFrame(() => {
      const target = textareaRef.current
      if (!target) return
      target.focus()
      target.setSelectionRange(next.caret, next.caret)
    })
  }

  async function submit(): Promise<void> {
    if (!canSend) return
    const text = draft
    const pendingAttachments = attachments
    // UI-1：斜杠命令不发送消息，交给 ChatCenter 执行
    if (text.trim().startsWith('/') && onSlashCommand) {
      setDraft('')
      setMentionTrigger(null)
      const handled = await onSlashCommand(text)
      if (!handled) setDraft(text)
      textareaRef.current?.focus()
      return
    }
    // 先清空再等待结果：连发场景下不阻塞下一次输入/发送
    setDraft('')
    setAttachments([])
    setMentionTrigger(null)
    setSending(true)
    const sent = await onSend(text, pendingAttachments)
    setSending(false)
    if (!sent) {
      // 发送失败时把内容还回去，避免丢话
      setDraft((current) => (current.length > 0 ? current : text))
      setAttachments((current) => (current.length > 0 ? current : pendingAttachments))
    }
    textareaRef.current?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (mentionTrigger) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionIndex((value) => Math.min(value + 1, Math.max(0, mentionItems.length - 1)))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex((value) => Math.max(0, value - 1))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionTrigger(null)
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && mentionItems[mentionIndex]) {
        event.preventDefault()
        selectMention(mentionItems[mentionIndex] as MentionItem)
        return
      }
    }
    if (event.key === 'Escape' && replyTo && onCancelReply) {
      event.preventDefault()
      onCancelReply()
      return
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submit()
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...(event.clipboardData?.files ?? [])]
    if (files.length === 0) return
    event.preventDefault()
    void addFiles(files)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    const files = [...(event.dataTransfer?.files ?? [])]
    void addFiles(files)
  }

  return (
    <footer
      className={`flex-none px-[18px] pt-1.5 pb-2 ${dragging ? 'bg-accent-soft/40' : 'bg-transparent'}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      aria-label="消息输入区"
    >
      <div className="mx-auto w-full max-w-[832px] pl-[52px] pr-3 sm:pr-5">
      {replyTo && (
        <div
          role="group"
          aria-label="正在回复的消息"
          className="mb-1.5 flex items-start gap-2 rounded-md border border-accent-border bg-accent-soft/50 px-2 py-1"
        >
          <span className="mt-0.5 flex-none rounded-pill border border-accent-border bg-surface-solid px-1.5 font-mono text-2xs text-accent-hover">
            回复 {replyTo.role === 'user' ? '你' : replyTo.role === 'agent' ? '司墨' : '系统'}
          </span>
          <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary" title={replyTo.text}>
            {replyTo.text || '（无文字内容）'}
          </span>
          {replyTo.sessionTitle && (
            <span className="hidden flex-none truncate font-mono text-2xs text-muted sm:inline" title={replyTo.sessionTitle}>
              {replyTo.sessionTitle}
            </span>
          )}
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="取消引用"
            title="取消引用（Esc）"
            className="flex-none cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 text-2xs text-muted transition-colors duration-fast hover:border-danger-border hover:text-danger-ink"
          >
            ×
          </button>
        </div>
      )}

      {mentionTrigger && (
        <div className="popover-surface mb-1.5 p-1" role="listbox" aria-label="@ 引用候选">
          {mentionLoading && <p className="m-0 px-2 py-1 text-2xs text-muted">加载候选…</p>}
          {!mentionLoading && mentionItems.length === 0 && (
            <p className="m-0 px-2 py-1 text-2xs text-muted">没有匹配的会话或文件（可直接输入 @名称）。</p>
          )}
          {mentionItems.map((item, index) => (
            <button
              key={`${item.kind}:${item.id}`}
              type="button"
              role="option"
              aria-selected={index === mentionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMention(item)}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xs px-2 py-1 text-left ${
                index === mentionIndex ? 'bg-accent-soft text-accent-hover' : 'text-ink-secondary hover:bg-surface-sunken'
              }`}
            >
              <span className="min-w-0 truncate text-sm">{item.label}</span>
              <span className="flex-none font-mono text-2xs text-muted">{item.subtitle}</span>
            </button>
          ))}
        </div>
      )}

      {slashHints.length > 0 && (
        <p className="m-0 mb-1.5 rounded-md border border-border-subtle bg-surface-sunken px-2 py-1 font-mono text-2xs text-muted">
          斜杠命令：{slashHints.map((hint) => `${hint.usage}（${hint.description}）`).join(' · ')}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="mb-1.5 flex list-none flex-wrap gap-1.5 p-0" aria-label="待发送附件">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-1 rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5">
              <span className="max-w-[12rem] truncate text-xs text-ink-secondary" title={attachment.name}>{attachment.name}</span>
              {attachment.size !== null && <span className="text-xs tabular-nums text-muted">{formatBytes(attachment.size)}</span>}
              <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`移除附件 ${attachment.name}`} title="移除附件" className="cursor-pointer rounded-xs border-0 bg-transparent px-1 text-xs text-muted hover:text-danger-ink">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative mx-auto w-full max-w-[780px]">
        <textarea
          ref={textareaRef}
          id="composer"
          rows={3}
          value={draft}
          disabled={disabled}
          placeholder={disabledReason ?? (disabled ? '正在连接…' : '给司墨发消息…')}
          title={disabledReason}
          aria-label="消息输入框（支持 Markdown）"
          aria-describedby="composer-hint"
          onChange={(event) => handleDraftChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="min-h-[58px] max-h-[176px] w-full resize-none overflow-y-auto rounded-md border border-border bg-surface px-3 pb-10 pt-2.5 text-[13.5px] leading-[1.65] text-ink shadow-md outline-none transition-colors duration-fast placeholder:text-ink-faint focus:border-accent focus:shadow-focus disabled:opacity-55"
        />
        <div className="absolute inset-x-0 bottom-0 flex min-w-0 items-center justify-between gap-2 px-2 pb-1.5">
          <span className="pointer-events-none shrink-0 text-[10.5px] text-ink-faint">支持 Markdown 格式</span>
          <div className="flex min-w-0 items-center justify-end gap-2">
            {uploading && <span role="status" aria-live="polite" className="text-[10.5px] text-ink-faint">上传中…</span>}
            <span id="composer-hint" className="hidden whitespace-nowrap text-[10.5px] text-ink-faint sm:inline">
              {disabledReason ? `只读：${disabledReason}` : 'Enter 发送 · Shift+Enter 换行'}
            </span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              title={canSend ? '发送（Enter）' : '输入内容后可发送'}
              className="inline-flex h-[30px] min-w-[56px] flex-none items-center justify-center gap-1.5 rounded-xs border border-ink bg-ink px-2.5 text-[11.5px] font-medium text-ink-inverse transition-colors duration-fast hover:bg-ink-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
              {sending ? '发送中…' : '发送'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </footer>
  )
}

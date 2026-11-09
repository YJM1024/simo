// features/chat/Composer.tsx —— 输入区（M8：Markdown 源 + 工具栏 + 附件上传）
//
// 契约：docs/m8-contract.md §2/§3.2：
//   - 保持 textarea（Markdown 源），工具栏：粗体/斜体/无序/有序/行内代码/代码块/链接；
//   - Ctrl+B / Ctrl+I；Enter 发送、Shift+Enter 换行；列表行回车自动续 `- ` / `n. `；
//   - 工具栏包裹选区（无选区插入占位并选中）；
//   - 附件：按钮/拖拽/粘贴 → POST /api/uploads?sessionId=，chips（名称/大小/删除），
//     发送时把附件元数据交给 onSend（ws/rest 帧里只带 id 列表）；
//   - M2 输入永不锁；M6 归档只读禁用；M7 错误走通知。

import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, getSessions } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId } from '../../platform/router.ts'
import { Icon, type IconName } from '../../platform/ui/icons.tsx'
import {
  MODEL_OPTIONS,
  REASONING_OPTIONS,
  loadModelPreference,
  loadReasoningPreference,
  saveModelPreference,
  saveReasoningPreference,
} from '../../platform/preferences.ts'
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
import {
  applyOrderedList,
  applyUnorderedList,
  continueListOnEnter,
  insertCodeBlock,
  insertLink,
  shortcutIntent,
  wrapSelection,
  type EditState,
} from './markdown-edit.ts'

const MAX_HEIGHT = 180

type ToolbarAction = 'bold' | 'italic' | 'ul' | 'ol' | 'code' | 'codeblock' | 'link'

const TOOLBAR: ReadonlyArray<{ action: ToolbarAction; icon: IconName; label: string; title: string }> = [
  { action: 'bold', icon: 'bold', label: '粗体', title: '粗体（Ctrl+B）' },
  { action: 'italic', icon: 'italic', label: '斜体', title: '斜体（Ctrl+I）' },
  { action: 'ul', icon: 'list', label: '无序列表', title: '无序列表' },
  { action: 'ol', icon: 'ordered-list', label: '有序列表', title: '有序列表' },
  { action: 'code', icon: 'code', label: '行内代码', title: '行内代码' },
  { action: 'codeblock', icon: 'code', label: '代码块', title: '代码块' },
  { action: 'link', icon: 'link', label: '链接', title: '链接（http/https）' },
]

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

function editByAction(state: EditState, action: ToolbarAction): EditState {
  if (action === 'bold') return wrapSelection(state.text, state.start, state.end, '**', '粗体文本')
  if (action === 'italic') return wrapSelection(state.text, state.start, state.end, '*', '斜体文本')
  if (action === 'code') return wrapSelection(state.text, state.start, state.end, '`', '代码')
  if (action === 'codeblock') return insertCodeBlock(state.text, state.start, state.end)
  if (action === 'ul') return applyUnorderedList(state.text, state.start, state.end)
  if (action === 'ol') return applyOrderedList(state.text, state.start, state.end)
  return insertLink(state.text, state.start, state.end)
}

export default function Composer({ disabled, disabledReason, sessionId, replyTo, onCancelReply, onSlashCommand, onSend }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null)
  const [mentionPool, setMentionPool] = useState<MentionItem[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionLoading, setMentionLoading] = useState(false)
  const [model, setModel] = useState(() => loadModelPreference())
  const [reasoning, setReasoning] = useState(() => loadReasoningPreference())
  const [modelHint, setModelHint] = useState<string | null>(null)
  const mentionSourcesRef = useRef<string>('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canSend = !disabled && !uploading && (draft.trim().length > 0 || attachments.length > 0)
  const mentionItems = mentionTrigger ? filterMentions(mentionPool, mentionTrigger.query) : []
  const slashHints = slashSuggestions(draft)

  // 自适应高度：最多 180px，之后内部滚动
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  const notifyError = (detail: string): void => {
    bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '附件上传失败', detail })
  }

  const applyEdit = (action: ToolbarAction): void => {
    const el = textareaRef.current
    if (!el || disabled) return
    const from = el.selectionStart ?? draft.length
    const to = el.selectionEnd ?? draft.length
    const next = editByAction({ text: draft, start: from, end: to }, action)
    setDraft(next.text)
    requestAnimationFrame(() => {
      const target = textareaRef.current
      if (!target) return
      target.focus()
      target.setSelectionRange(next.start, next.end)
    })
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

  // ---- UI-2：模型/推理选择（本地偏好 + 后端会话配置；未就绪明确提示）----
  async function applyModel(nextModel: string, nextReasoning: string): Promise<void> {
    const savedModel = saveModelPreference(nextModel)
    const savedReasoning = saveReasoningPreference(nextReasoning)
    setModel(savedModel)
    setReasoning(savedReasoning)
    const targetSession = sessionId ?? readSessionId()
    if (!targetSession) {
      setModelHint('已记录本地偏好（当前无会话）')
      return
    }
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(targetSession)}/model`, { model: savedModel, reasoning: savedReasoning })
      setModelHint('模型偏好已提交（本会话生效，以后端支持为准）')
    } catch {
      setModelHint('后端模型切换接口未就绪，已记录本地偏好；不会假装切换成功。')
    }
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
    const sent = await onSend(text, pendingAttachments)
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
    const shortcut = shortcutIntent(event.key, event.ctrlKey || event.metaKey, event.shiftKey)
    if (shortcut) {
      event.preventDefault()
      applyEdit(shortcut)
      return
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

    // 列表行回车自动续行（不发送）；普通行回车发送
    const el = event.currentTarget
    const caret = el.selectionStart ?? draft.length
    const continuation = continueListOnEnter(draft, caret)
    if (continuation.handled) {
      event.preventDefault()
      setDraft(continuation.state.text)
      requestAnimationFrame(() => {
        const target = textareaRef.current
        if (!target) return
        target.setSelectionRange(continuation.state.start, continuation.state.end)
      })
      return
    }
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
      className={`border-t bg-surface px-3 pt-2.5 pb-3.5 backdrop-blur-glass sm:px-5 ${
        dragging ? 'border-accent bg-accent-soft/40' : 'border-border-subtle'
      }`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      aria-label="消息输入区"
    >
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
        <div className="mb-1.5 rounded-md border border-accent-border bg-surface-solid p-1 shadow-sm" role="listbox" aria-label="@ 引用候选">
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

      <div className="mb-1.5 flex flex-wrap items-center gap-1" role="toolbar" aria-label="Markdown 格式工具栏">
        {TOOLBAR.map((item) => (
          <button
            key={item.action}
            type="button"
            onClick={() => applyEdit(item.action)}
            disabled={disabled}
            aria-label={item.title}
            title={item.title}
            className="min-w-7 cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 font-mono text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {<Icon name={item.icon} size={16} />}
            <span className="sr-only">{item.label}</span>
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          aria-label="添加附件"
          title="添加附件（≤20 MiB，单条消息最多 5 个；也支持拖拽/粘贴）"
          className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="file" size={16} /> 附件
        </button>
        {uploading && (
          <span role="status" aria-live="polite" className="text-2xs text-accent-hover">
            上传中…
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="选择附件文件"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void addFiles(files)
          }}
        />
        <span className="ml-auto flex items-center gap-1" aria-label="模型与推理强度">
          <select
            aria-label="模型"
            title="模型（本地偏好；后端接口未就绪时仅记录本地）"
            value={model}
            disabled={disabled}
            onChange={(event) => void applyModel(event.target.value, reasoning)}
            className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 py-0.5 font-mono text-2xs text-ink-secondary disabled:opacity-50"
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            aria-label="推理强度"
            title="推理强度（本会话偏好）"
            value={reasoning}
            disabled={disabled}
            onChange={(event) => void applyModel(model, event.target.value)}
            className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 py-0.5 font-mono text-2xs text-muted disabled:opacity-50"
          >
            {REASONING_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </span>
      </div>

      {modelHint && (
        <p role="status" className="m-0 mb-1.5 rounded-md border border-warn-border bg-warn-soft px-2 py-0.5 text-2xs text-warn-ink">
          {modelHint}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="mb-1.5 flex list-none flex-wrap gap-1.5 p-0" aria-label="待发送附件">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-1 rounded-md border border-border-subtle bg-surface-solid px-1.5 py-0.5"
            >
              <span className="max-w-[12rem] truncate text-2xs text-ink-secondary" title={attachment.name}>
                {attachment.name}
              </span>
              {attachment.size !== null && <span className="font-mono text-2xs text-muted">{formatBytes(attachment.size)}</span>}
              <button
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                aria-label={`移除附件 ${attachment.name}`}
                title="移除附件"
                className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 text-2xs text-muted transition-colors duration-fast hover:border-danger-border hover:text-danger-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2.5">
        <textarea
          ref={textareaRef}
          id="composer"
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder={disabledReason ?? (disabled ? '正在连接…' : '说点什么…（Markdown；Enter 发送；@ 引用会话/文件；/ 查看命令）')}
          title={disabledReason}
          aria-label="消息输入框（支持 Markdown）"
          aria-describedby="composer-hint"
          onChange={(event) => handleDraftChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="min-h-11 max-h-[var(--composer-max-h)] flex-1 resize-none rounded-lg border border-border bg-surface-solid px-3 py-2.5 font-[inherit] leading-normal text-ink shadow-sm outline-none transition-shadow duration-fast placeholder:text-muted focus:border-accent focus:shadow-focus disabled:opacity-55"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          title={draft.trim() || attachments.length > 0 ? '发送（Enter）' : '空消息不会发送'}
          className="whitespace-nowrap rounded-xs border border-accent-border accent-gradient px-4 py-2.5 text-accent-ink transition-colors duration-fast enabled:hover:bg-accent-hover enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
        >
          发送
        </button>
      </div>
      <div id="composer-hint" className="mt-1.5 flex flex-wrap justify-between gap-x-3 font-mono text-2xs tracking-normal text-muted">
        <span>
          {disabledReason
            ? `只读：${disabledReason}`
            : 'Enter 发送 · Shift+Enter 换行 · Ctrl+B/I 粗斜体 · 列表行回车续行'}
        </span>
        <span>
          {uploading
            ? '附件上传中…'
            : attachments.length > 0
              ? `${attachments.length} 个附件 · 单条最多 ${MAX_ATTACHMENTS_PER_MESSAGE} 个`
              : draft.trim().length > 0
                ? `${draft.trim().length} 字 · 可连续发送`
                : disabledReason
                  ? '恢复会话后可继续对话'
                  : 'Markdown 源 · 附件 ≤20 MiB'}
        </span>
      </div>
    </footer>
  )
}

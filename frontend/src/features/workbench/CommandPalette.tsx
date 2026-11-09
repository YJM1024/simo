// features/workbench/CommandPalette.tsx —— 命令面板（UI-1，Ctrl/⌘+K）
//
// 切会话 / 新建会话 / 改权限 / 打开设置 / 打开用量 / 暂停任务 / 切换主题；
// 输入过滤 + ↑↓/Enter/Esc；会话列表来自 GET /api/sessions（失败时只显示基础命令）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSessions, toSessions, createSession } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId } from '../../platform/router.ts'
import { sendChat } from '../../platform/ws-hub.ts'
import { getInitialTheme, listThemes, setTheme, themeLabel } from '../../platform/theme/theme.ts'
import type { SessionSummary } from '../../platform/types.ts'
import {
  BASE_COMMANDS,
  filterPalette,
  mergePaletteCommands,
  type PaletteCommand,
} from './commands.ts'
import type { SettingsSectionId } from './settings.ts'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenPage: (page: 'usage' | 'settings', section?: SettingsSectionId) => void
  onNotice: (message: string) => void
}

function extractSessionId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  for (const key of ['id', 'sessionId', 'session_id']) {
    if (typeof record[key] === 'string') return record[key] as string
  }
  for (const key of ['session', 'data', 'result']) {
    const nested = extractSessionId(record[key])
    if (nested) return nested
  }
  return null
}

export default function CommandPalette({ open, onClose, onOpenPage, onNotice }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(0)
    void getSessions()
      .then((payload) => setSessions(toSessions(payload)))
      .catch(() => setSessions([]))
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const commands = useMemo(() => mergePaletteCommands(BASE_COMMANDS, sessions), [sessions])
  const filtered = useMemo(() => filterPalette(commands, query), [commands, query])

  useEffect(() => {
    setSelected((value) => Math.min(value, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const execute = useCallback(
    async (command: PaletteCommand): Promise<void> => {
      if (command.action === 'switch-session' && command.sessionId) {
        bus.emit(EVENTS.SESSION_SELECT, { sessionId: command.sessionId })
        onClose()
        return
      }
      if (command.action === 'new-session') {
        try {
          const payload = await createSession(readSessionId(), '新会话')
          const id = extractSessionId(payload)
          bus.emit(EVENTS.SESSIONS_REFRESH, { reason: 'command.new-session' })
          if (id) bus.emit(EVENTS.SESSION_SELECT, { sessionId: id })
          onNotice('已新建会话')
        } catch {
          onNotice('新建会话失败：请检查后端连接')
        }
        onClose()
        return
      }
      if (command.action.startsWith('nav-')) {
        bus.emit(EVENTS.NAV_RESET, {})
        if (command.action === 'nav-chat') bus.emit(EVENTS.CHAT_TAB_OPEN, { tab: 'chat' })
        else if (command.action === 'nav-files') bus.emit(EVENTS.CHAT_TAB_OPEN, { tab: 'files' })
        else {
          const view = command.action.slice(4)
          bus.emit(EVENTS.NAV_OPEN, { view })
        }
        onClose()
        return
      }
      if (command.action === 'permissions') {
        onOpenPage('settings', 'permissions')
        onClose()
        return
      }
      if (command.action === 'open-settings') {
        onOpenPage('settings')
        onClose()
        return
      }
      if (command.action === 'open-usage') {
        onOpenPage('usage')
        onClose()
        return
      }
      if (command.action === 'open-view') {
        bus.emit(EVENTS.VIEW_OPEN, {})
        onClose()
        return
      }
      if (command.action === 'pause') {
        onNotice(sendChat('停') ? '已发送暂停指令（运行中任务跑完即停）' : '连接未就绪，暂停未发送')
        onClose()
        return
      }
      if (command.action === 'toggle-theme') {
        const themes = listThemes()
        const current = getInitialTheme()
        const next = themes[(themes.indexOf(current) + 1) % Math.max(1, themes.length)] ?? current
        setTheme(next)
        onNotice(`主题已切换为 ${themeLabel(next)}`)
        onClose()
      }
    },
    [onClose, onNotice, onOpenPage],
  )

  if (!open) return null

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((value) => Math.min(value + 1, Math.max(0, filtered.length - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((value) => Math.max(0, value - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = filtered[selected]
      if (command) void execute(command)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim-strong/80 p-2 pt-[8vh] backdrop-blur-sm sm:p-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div className="popover-surface w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <span className="font-mono text-2xs text-muted">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令或会话名…（↑↓ 选择，Enter 执行，Esc 关闭）"
            aria-label="搜索命令或会话"
            className="min-w-0 flex-1 bg-transparent px-1 py-1 text-md text-ink outline-none placeholder:text-muted"
          />
          <button type="button" onClick={onClose} aria-label="关闭命令面板" className="cursor-pointer px-1 text-muted">
            ×
          </button>
        </div>
        <ul className="m-0 max-h-[50vh] list-none overflow-y-auto p-1" role="listbox" aria-label="命令列表">
          {filtered.length === 0 && <li className="px-2 py-3 text-sm text-muted">没有匹配的命令。</li>}
          {filtered.slice(0, 40).map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === selected}>
              <button
                type="button"
                onMouseEnter={() => setSelected(index)}
                onClick={() => void execute(command)}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left ${
                  index === selected ? 'bg-accent-soft text-accent-hover' : 'text-ink-secondary hover:bg-surface-sunken'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{command.label}</span>
                  <span className="block truncate text-2xs text-muted">{command.detail}</span>
                </span>
                <span className="flex-none font-mono text-2xs text-muted">{command.action === 'switch-session' ? '会话' : '命令'}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border-subtle px-3 py-1.5 font-mono text-2xs text-muted">
          Ctrl/⌘+K 打开 · 会话/命令混合搜索
        </div>
      </div>
    </div>
  )
}

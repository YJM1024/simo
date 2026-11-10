// features/workbench/WorkbenchPage.tsx —— M37 工作台首页（顶部 tab「工作台」）
// 只读入口页：用量统计 / 设置 / 命令面板 / 自定义视图预览；无业务写操作。

import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../../platform/http.ts'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import { Icon, type IconName } from '../../platform/ui/icons.tsx'

interface RecentItem {
  id: string
  label: string
  kind: string
  at: number
}

function recordsOf(payload: unknown, key: string): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  if (payload && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[key]
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  }
  return []
}

function textOf(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function timeOf(item: Record<string, unknown>): number {
  for (const key of ['updatedAt', 'updated_at', 'createdAt', 'created_at', 'at']) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function recentTime(at: number): string {
  if (!at) return ''
  return new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface WorkbenchPageProps {
  onClose: () => void
  onOpenUsage: () => void
  onOpenSettings: () => void
  onOpenPalette: () => void
  onOpenView: () => void
}

interface Entry {
  label: string
  detail: string
  icon: IconName
  onClick: () => void
}

export default function WorkbenchPage({ onClose, onOpenUsage, onOpenSettings, onOpenPalette, onOpenView, embedded = false }: WorkbenchPageProps & { embedded?: boolean }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, !embedded, onClose)
  const [recent, setRecent] = useState<RecentItem[]>([])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      apiGet('/api/sessions?limit=5').catch(() => null),
      apiGet('/api/tasks?limit=5').catch(() => null),
      apiGet('/api/artifacts?limit=5').catch(() => null),
    ]).then(([sessionsPayload, tasksPayload, artifactsPayload]) => {
      if (cancelled) return
      const items: RecentItem[] = []
      for (const item of recordsOf(sessionsPayload, 'sessions').slice(0, 5)) {
        items.push({ id: `session-${textOf(item, ['id']) || items.length}`, label: textOf(item, ['title', 'name', 'sessionTitle']) || '未命名会话', kind: '会话', at: timeOf(item) })
      }
      for (const item of recordsOf(tasksPayload, 'tasks').slice(0, 5)) {
        items.push({ id: `task-${textOf(item, ['id']) || items.length}`, label: textOf(item, ['title', 'name']) || '未命名任务', kind: '任务', at: timeOf(item) })
      }
      for (const item of recordsOf(artifactsPayload, 'artifacts').slice(0, 5)) {
        items.push({ id: `artifact-${textOf(item, ['id']) || items.length}`, label: textOf(item, ['name', 'title']) || '未命名交付物', kind: '交付物', at: timeOf(item) })
      }
      setRecent(items.sort((a, b) => b.at - a.at).slice(0, 5))
    })
    return () => { cancelled = true }
  }, [])

  const entries: Entry[] = [
    { icon: 'overview', label: '用量统计', detail: '会话树 × 消息/token 时间序列', onClick: onOpenUsage },
    { icon: 'settings', label: '设置', detail: '模型 / 权限 / 主题 / 数据目录 / 自定义视图', onClick: onOpenSettings },
    { icon: 'search', label: '命令面板', detail: 'Ctrl/⌘+K：会话与全部视图', onClick: onOpenPalette },
    { icon: 'panel', label: '自定义视图', detail: '当前会话的 schema 预览', onClick: onOpenView },
  ]

  return (
    <div
      className={embedded ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col bg-canvas' : 'fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-2 sm:p-4'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="工作台"
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={embedded ? 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-canvas' : 'flex max-h-[92vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg'}
      >
        <header className="flex-none border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-[1000px] items-center justify-between gap-3 px-[18px] py-[13px]">
            <div className="flex min-w-0 items-center gap-2.5">
              {embedded && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="返回对话"
                  className="grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-sm text-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
                >
                  <Icon name="chevron-left" size={16} />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="m-0 font-serif text-[20px] font-medium leading-[1.3] tracking-[-0.01em] text-ink">工作台</h2>
                <p className="m-0 mt-[2px] truncate text-[11px] text-muted">用量、设置与工具入口；不阻塞对话。</p>
              </div>
            </div>
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-[29px] flex-none cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-surface-solid px-2.5 text-[11.5px] text-ink-secondary transition-colors duration-fast hover:bg-surface-sunken"
              >
                <Icon name="close" size={16} />
                关闭
              </button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1000px] px-[18px] py-5">
            <div className="mb-3">
              <h3 className="m-0 text-[12px] font-semibold tracking-[-0.005em] text-ink-secondary">工具与设置</h3>
              <p className="m-0 mt-[3px] text-[11px] leading-[1.5] text-muted">按需进入；所有写操作仍通过对话/动作层与审批。</p>
            </div>

            <ul className="m-0 grid list-none grid-cols-1 items-stretch gap-3 p-0 sm:grid-cols-2">
              {entries.map((entry) => (
                <li key={entry.label} className="flex">
                  <button
                    type="button"
                    onClick={entry.onClick}
                    className="group flex h-full min-h-[96px] w-full cursor-pointer items-start justify-between gap-3 rounded-md border border-border bg-surface-solid p-4 text-left shadow-none transition-all duration-fast hover:-translate-y-px hover:shadow-sm"
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <span className="grid h-7 w-7 flex-none place-items-center rounded-sm border border-border-subtle bg-surface-sunken text-muted transition-colors duration-fast group-hover:border-border group-hover:text-ink-secondary">
                        <Icon name={entry.icon} size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-[1.4] text-ink">{entry.label}</span>
                        <span className="mt-[3px] block break-words text-[11px] leading-[1.5] text-muted">{entry.detail}</span>
                      </span>
                    </span>
                    <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-sm text-muted transition-colors duration-fast group-hover:bg-surface-sunken group-hover:text-ink">
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <section className="mt-6" aria-label="最近活动">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">最近活动</h3>
                <span className="flex-none font-mono text-[10px] text-muted">{recent.length} 条</span>
              </div>
              {recent.length === 0 ? (
                <p className="m-0 text-[11px] text-muted">暂无最近活动。</p>
              ) : (
                <ul className="m-0 list-none border-t border-border-subtle p-0">
                  {recent.map((item) => (
                    <li key={item.id} className="flex h-8 min-w-0 items-center gap-3 border-b border-border-subtle">
                      <span className="w-[38px] flex-none text-[10.5px] text-muted">{item.kind}</span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-secondary" title={item.label}>{item.label}</span>
                      <time className="flex-none font-mono text-xs text-muted" dateTime={item.at ? new Date(item.at).toISOString() : undefined}>{recentTime(item.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <footer className="flex flex-none items-center justify-between gap-3 border-t border-border bg-surface px-[18px] py-2 font-mono text-[10px] text-muted">
          <span className="min-w-0 truncate">工作台入口只读；所有修改仍通过对话/动作层。</span>
          <span className="flex-none">只读</span>
        </footer>
      </div>
    </div>
  )
}

// features/workbench/SettingsPage.tsx —— 设置中心（UI-1）
//
// 模型只读展示；权限 / 主题 / 数据目录 / 快捷键；权限走 /api/permissions（缺失时优雅降级）。
// 权限走 /api/permissions（缺失时优雅降级）；主题复用 platform theme；数据目录只读说明。
// 只读展示为主，无危险自动操作；切换 full 沙盒需确认。

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPatch, getPermissions, updatePermissions } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { isRecord, readString } from '../../platform/types.ts'
import { getInitialTheme, listThemes, setTheme, themeLabel, type ThemeName } from '../../platform/theme/theme.ts'
import {
  loadSubtaskExecutor,
  saveSubtaskExecutor,
  type SubtaskExecutor,
} from '../../platform/preferences.ts'
import { readSessionId } from '../../platform/router.ts'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import { Icon } from '../../platform/ui/icons.tsx'
import {
  SHORTCUTS,
  dataDirectoryHint,
  type SettingsSectionId,
} from './settings.ts'

const SANDBOX_OPTIONS = [
  { id: 'read-only', label: '只读', hint: '不能写文件，pwsh 受限' },
  { id: 'workspace-write', label: '工作区可写', hint: '默认；写入需审批（按策略）' },
  { id: 'danger-full-access', label: '完全访问', hint: '危险：需要确认，仅临时使用' },
] as const
const APPROVAL_OPTIONS = [
  { id: 'ask', label: '每次询问', hint: '危险操作需人工确认' },
  { id: 'auto', label: '按风险自动批准/拒绝', hint: '低风险自动通过，高风险拒绝' },
  { id: 'never', label: '从不放行', hint: 'fail-closed，最严格' },
] as const

interface PermState {
  sandbox: string
  approval: string
}

function normalizePermissions(payload: unknown): PermState {
  if (!isRecord(payload)) return { sandbox: 'workspace-write', approval: 'auto' }
  const nested = isRecord(payload['permission']) ? payload['permission'] : payload
  return {
    sandbox: readString(nested, 'sandbox') ?? readString(nested, 'sandboxMode') ?? 'workspace-write',
    approval: readString(nested, 'approval') ?? readString(nested, 'approvalPolicy') ?? 'auto',
  }
}

export default function SettingsPage({
  onClose,
  initialSection,
}: {
  onClose: () => void
  initialSection?: SettingsSectionId
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, true, onClose)

  const [theme, setThemeState] = useState<ThemeName>(() => getInitialTheme())
  const [permissions, setPermissions] = useState<PermState>({ sandbox: 'workspace-write', approval: 'auto' })
  const [permLoading, setPermLoading] = useState(true)
  const [permSaving, setPermSaving] = useState(false)
  const [executor, setExecutor] = useState<SubtaskExecutor>(() => loadSubtaskExecutor())
  const [executorBusy, setExecutorBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [permError, setPermError] = useState<string | null>(null)

  const loadPermissions = useCallback(async (): Promise<void> => {
    setPermLoading(true)
    setPermError(null)
    try {
      setPermissions(normalizePermissions(await getPermissions()))
    } catch {
      setPermError('权限接口暂不可用；可在顶栏权限菜单重试，当前展示默认值。')
    } finally {
      setPermLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPermissions()
  }, [loadPermissions])

  // M18：尝试读取后端会话配置（子任务执行者）；接口缺失时用本地偏好
  useEffect(() => {
    const sessionId = readSessionId()
    if (!sessionId) return
    let cancelled = false
    void apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/config`)
      .then((payload) => {
        if (cancelled || !isRecord(payload)) return
        const nested = isRecord(payload['config']) ? payload['config'] : payload
        const value = readString(nested, 'subtaskExecutor') ?? readString(nested, 'subtask_executor') ?? readString(nested, 'executor')
        if (value === 'npc' || value === 'self') setExecutor(value)
      })
      .catch(() => {
        // 接口未就绪：保持本地偏好
      })
    return () => {
      cancelled = true
    }
  }, [])

  const chooseExecutor = useCallback(
    async (next: SubtaskExecutor): Promise<void> => {
      setExecutorBusy(true)
      setExecutor(saveSubtaskExecutor(next))
      const sessionId = readSessionId()
      if (sessionId) {
        try {
          await apiPatch(`/api/sessions/${encodeURIComponent(sessionId)}/config`, { subtaskExecutor: next })
          setNotice('子任务执行者已更新')
        } catch {
          setNotice('后端会话配置接口未就绪，已保存本地偏好')
        }
      } else {
        setNotice('已保存本地偏好（当前无会话）')
      }
      setExecutorBusy(false)
    },
    [],
  )

  useEffect(() => {
    if (!initialSection) return
    const target = document.getElementById(`settings-${initialSection}`)
    target?.scrollIntoView({ block: 'start' })
  }, [initialSection])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const applyPermissions = async (next: PermState): Promise<void> => {
    setPermSaving(true)
    setPermError(null)
    try {
      const body: Record<string, unknown> = { sandbox: next.sandbox, approval: next.approval }
      if (next.sandbox === 'danger-full-access') body['confirm'] = true
      await updatePermissions(body)
      setPermissions(next)
      setNotice('权限已更新')
    } catch (error) {
      const message = error instanceof Error ? error.message : '权限更新失败'
      setPermError(message)
      setNotice('权限更新失败，请到顶栏权限菜单检查')
    } finally {
      setPermSaving(false)
    }
  }

  const applyTheme = (name: ThemeName): void => {
    setThemeState(setTheme(name))
    setNotice(`主题已切换为 ${themeLabel(name)}`)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-3 sm:p-[18px]"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className="popover-surface flex max-h-[90vh] w-full max-w-[700px] flex-col overflow-hidden">
        <header className="flex flex-none items-start justify-between gap-3.5 border-b border-border px-[18px] pb-[11px] pt-4">
          <div className="min-w-0">
            <h2 className="m-0 font-serif text-[18px] font-medium text-ink">设置</h2>
            <p className="m-0 mt-[3px] truncate font-mono text-[10.5px] text-muted">模型、权限、主题、目录与快捷键</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-sm text-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-1 pb-6">
          {notice && (
            <p role="status" className="m-0 mb-2 rounded-sm border border-ok-border bg-ok-soft px-2.5 py-1.5 text-[10.5px] text-ok-ink">
              {notice}
            </p>
          )}

          <section id="settings-model" className="border-b border-border-subtle py-[13px] last:border-0">
            <h3 className="m-0 mb-[7px] text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary">模型</h3>
            <p className="m-0 rounded-sm border border-border-subtle bg-surface-sunken px-2.5 py-2 text-[12px] text-ink-secondary">模型：V4.1 Flash（固定，在智能体页配置）</p>
          </section>

          <section id="settings-permissions" className="border-b border-border-subtle py-[13px] last:border-0">
            <h3 className="m-0 mb-[7px] text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary">权限</h3>
            {permError && <p className="m-0 mb-2 text-[10.5px] text-warn-ink">{permError}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <p className="m-0 mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">沙盒</p>
                <div className="flex flex-col gap-[5px]">
                  {SANDBOX_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={permLoading || permSaving}
                      aria-pressed={permissions.sandbox === option.id}
                      onClick={() => void applyPermissions({ ...permissions, sandbox: option.id })}
                      className={`cursor-pointer rounded-sm border px-2.5 py-2 text-left transition-colors duration-fast disabled:opacity-50 ${
                        permissions.sandbox === option.id
                          ? 'border-border bg-avatar-bg text-ink'
                          : 'border-border-subtle bg-surface-solid text-ink-secondary hover:bg-surface-sunken'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-medium leading-[1.4]">{option.label}</span>
                        {permissions.sandbox === option.id && <em className="flex-none text-[9.5px] not-italic text-muted">当前</em>}
                      </span>
                      <span className="mt-[2px] block text-[10.5px] leading-[1.5] text-muted">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="m-0 mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">审批策略</p>
                <div className="flex flex-col gap-[5px]">
                  {APPROVAL_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={permLoading || permSaving}
                      aria-pressed={permissions.approval === option.id}
                      onClick={() => void applyPermissions({ ...permissions, approval: option.id })}
                      className={`cursor-pointer rounded-sm border px-2.5 py-2 text-left transition-colors duration-fast disabled:opacity-50 ${
                        permissions.approval === option.id
                          ? 'border-border bg-avatar-bg text-ink'
                          : 'border-border-subtle bg-surface-solid text-ink-secondary hover:bg-surface-sunken'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-medium leading-[1.4]">{option.label}</span>
                        {permissions.approval === option.id && <em className="flex-none text-[9.5px] not-italic text-muted">当前</em>}
                      </span>
                      <span className="mt-[2px] block text-[10.5px] leading-[1.5] text-muted">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="settings-executor" className="border-b border-border-subtle py-[13px] last:border-0">
            <h3 className="m-0 mb-[7px] text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary">子任务执行者</h3>
            <p className="m-0 mb-2 text-[11px] leading-[1.5] text-muted">
              决定新子任务由任务智能体（NPC）执行，还是由司墨本人直接执行。
            </p>
            <div className="flex flex-col gap-[5px] sm:flex-row">
              {(
                [
                  { id: 'npc', label: '任务智能体 NPC', hint: '按任务拆分给 NPC 执行，结果按汇报回流' },
                  { id: 'self', label: '司墨本人', hint: '由主理人直接执行，上下文更连续' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={executorBusy}
                  aria-pressed={executor === option.id}
                  onClick={() => void chooseExecutor(option.id)}
                  className={`relative flex-1 cursor-pointer rounded-sm border px-2.5 py-2 text-left transition-colors duration-fast disabled:opacity-50 ${
                    executor === option.id
                      ? 'border-border bg-avatar-bg text-ink'
                      : 'border-border-subtle bg-surface-solid text-ink-secondary hover:bg-surface-sunken'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] font-medium leading-[1.4]">{option.label}</span>
                    {executor === option.id && <em className="flex-none text-[9.5px] not-italic text-muted">当前</em>}
                  </span>
                  <span className="mt-[2px] block text-[10.5px] leading-[1.5] text-muted">{option.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section id="settings-theme" className="border-b border-border-subtle py-[13px] last:border-0">
            <h3 className="m-0 mb-[7px] text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary">主题</h3>
            <div className="flex flex-wrap gap-[7px]">
              {listThemes().map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={theme === name}
                  onClick={() => applyTheme(name)}
                  className={`cursor-pointer rounded-[6px] border px-[9px] py-[5px] text-[11.5px] transition-colors duration-fast ${
                    theme === name
                      ? 'border-border bg-avatar-bg text-ink'
                      : 'border-border bg-surface-solid text-ink-secondary hover:bg-surface-sunken'
                  }`}
                >
                  {themeLabel(name)}
                </button>
              ))}
            </div>
          </section>

          <section id="settings-view" className="border-b border-border-subtle py-[13px] last:border-0">
            <h3 className="m-0 mb-[7px] text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary">自定义视图</h3>
            <p className="m-0 mb-2 text-[11px] leading-[1.5] text-muted">
              打开当前会话的自定义视图（只读 schema 渲染，13 类块）；生成/修改/回滚通过对话。
            </p>
            <button
              type="button"
              onClick={() => {
                bus.emit(EVENTS.VIEW_OPEN, {})
                onClose()
              }}
              className="cursor-pointer rounded-sm border border-border-subtle bg-surface-solid px-2.5 py-1 text-sm text-ink-secondary hover:bg-surface-sunken hover:text-ink"
            >
              打开自定义视图预览
            </button>
          </section>

          <section id="settings-data" className="border-b border-border-subtle py-[13px] last:border-0">
            <h3 className="m-0 mb-[7px] text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary">数据目录</h3>
            <p className="m-0 rounded-sm border border-border-subtle bg-surface-sunken px-2.5 py-2 font-mono text-[11px] leading-[1.5] text-ink-secondary">
              {dataDirectoryHint()}
            </p>
          </section>

          <section id="settings-shortcuts" className="mb-0">
            <h3 className="m-0 mb-[7px] text-[10.5px] font-semibold tracking-[0.02em] text-ink-secondary">快捷键</h3>
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                {SHORTCUTS.map((shortcut) => (
                  <tr key={shortcut.keys}>
                    <td className="w-[130px] whitespace-nowrap border-b border-border-subtle py-[6px] pr-2 align-middle">
                      <span className="inline-flex items-center gap-1">
                        {shortcut.keys.split(' ').map((key, index) => (
                          <kbd
                            key={`${shortcut.keys}-${index}`}
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border border-b-2 bg-surface-solid px-[5px] font-mono text-[10px] font-medium leading-none text-muted"
                          >
                            {key}
                          </kbd>
                        ))}
                      </span>
                    </td>
                    <td className="border-b border-border-subtle py-[6px] text-[11px] text-ink-secondary">{shortcut.label}</td>
                    <td className="w-[70px] border-b border-border-subtle py-[6px] text-right text-[10.5px] text-muted">{shortcut.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <footer className="flex flex-none items-center justify-between gap-2.5 border-t border-border px-[18px] py-[11px] text-[10px] text-muted">
          <span className="min-w-0 flex-1 truncate font-mono">设置只读展示 + 本地偏好；权限/主题即时生效，其余由后端与对话控制。</span>
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] min-w-[56px] flex-none cursor-pointer rounded-[6px] bg-ink px-3 text-[11.5px] font-medium text-ink-inverse transition-opacity duration-fast hover:opacity-90"
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  )
}

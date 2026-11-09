// features/workbench/SettingsPage.tsx —— 设置中心（UI-1）
//
// 模型 / 权限 / 主题 / 数据目录 / 快捷键；模型偏好仅本地（后端切换接口未就绪时提示）；
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
import {
  MODEL_OPTIONS,
  SHORTCUTS,
  dataDirectoryHint,
  loadModelPreference,
  saveModelPreference,
  type SettingsSectionId,
} from './settings.ts'

const SANDBOX_OPTIONS = [
  { id: 'read-only', label: '只读', hint: '不能写文件，pwsh 受限' },
  { id: 'workspace-write', label: '工作区可写', hint: '默认；写入需审批（按策略）' },
  { id: 'danger-full-access', label: '完全访问', hint: '危险：需要确认，仅临时使用' },
] as const
const APPROVAL_OPTIONS = [
  { id: 'ask', label: '每次询问', hint: '危险操作需人工确认' },
  { id: 'auto', label: '自动判断', hint: '按风险自动批准/拒绝' },
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

  const [model, setModel] = useState(() => loadModelPreference())
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
        <header className="flex flex-none items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div>
            <h2 className="m-0 text-lg font-semibold tracking-tight">设置</h2>
            <p className="m-0 mt-0.5 text-sm text-ink-secondary">模型、权限、主题、数据目录与快捷键；修改通过对话或后端配置完成。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-muted hover:text-ink"
          >
            关闭 ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {notice && (
            <p role="status" className="m-0 mb-2 rounded-md border border-ok-border bg-ok-soft px-2 py-1 text-2xs text-ok-ink">
              {notice}
            </p>
          )}

          <section id="settings-model" className="mb-4">
            <h3 className="m-0 mb-1 text-md font-semibold">模型</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="模型偏好"
                value={model}
                onChange={(event) => {
                  const next = saveModelPreference(event.target.value)
                  setModel(next)
                  setNotice('模型偏好已记录到本地；实际模型由后端决定')
                }}
                className="rounded-md border border-border-subtle bg-surface-solid px-2 py-1.5 text-sm text-ink"
              >
                {MODEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="text-2xs text-muted">后端模型切换接口未就绪时只保存本地偏好。</span>
            </div>
          </section>

          <section id="settings-permissions" className="mb-4">
            <h3 className="m-0 mb-1 text-md font-semibold">权限</h3>
            {permError && <p className="m-0 mb-1 text-2xs text-warn-ink">{permError}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <p className="m-0 mb-1 font-mono text-2xs text-muted">沙盒</p>
                <div className="flex flex-col gap-1">
                  {SANDBOX_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={permLoading || permSaving}
                      aria-pressed={permissions.sandbox === option.id}
                      onClick={() => void applyPermissions({ ...permissions, sandbox: option.id })}
                      className={`cursor-pointer rounded-md border px-2 py-1 text-left text-sm disabled:opacity-50 ${
                        permissions.sandbox === option.id
                          ? 'border-accent-border bg-accent-soft text-accent-hover'
                          : 'border-border-subtle bg-surface-solid text-ink-secondary'
                      }`}
                    >
                      {option.label}
                      <span className="block text-2xs text-muted">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="m-0 mb-1 font-mono text-2xs text-muted">审批策略</p>
                <div className="flex flex-col gap-1">
                  {APPROVAL_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={permLoading || permSaving}
                      aria-pressed={permissions.approval === option.id}
                      onClick={() => void applyPermissions({ ...permissions, approval: option.id })}
                      className={`cursor-pointer rounded-md border px-2 py-1 text-left text-sm disabled:opacity-50 ${
                        permissions.approval === option.id
                          ? 'border-accent-border bg-accent-soft text-accent-hover'
                          : 'border-border-subtle bg-surface-solid text-ink-secondary'
                      }`}
                    >
                      {option.label}
                      <span className="block text-2xs text-muted">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="settings-executor" className="mb-4">
            <h3 className="m-0 mb-1 text-md font-semibold">子任务执行者</h3>
            <p className="m-0 mb-1 text-2xs text-muted">
              决定新子任务由任务智能体（NPC）执行，还是由司墨本人直接执行；接口未就绪时保存本地偏好。
            </p>
            <div className="flex flex-col gap-1 sm:flex-row">
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
                  className={`flex-1 cursor-pointer rounded-md border px-2 py-1 text-left text-sm disabled:opacity-50 ${
                    executor === option.id
                      ? 'border-accent-border bg-accent-soft text-accent-hover'
                      : 'border-border-subtle bg-surface-solid text-ink-secondary'
                  }`}
                >
                  {option.label}
                  <span className="block text-2xs text-muted">{option.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section id="settings-theme" className="mb-4">
            <h3 className="m-0 mb-1 text-md font-semibold">主题</h3>
            <div className="flex flex-wrap gap-1.5">
              {listThemes().map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={theme === name}
                  onClick={() => applyTheme(name)}
                  className={`cursor-pointer rounded-md border px-2 py-1 text-sm ${
                    theme === name ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-ink-secondary'
                  }`}
                >
                  {themeLabel(name)}
                </button>
              ))}
            </div>
          </section>

          <section id="settings-view" className="mb-4">
            <h3 className="m-0 mb-1 text-md font-semibold">自定义视图</h3>
            <p className="m-0 mb-1 text-2xs text-muted">
              打开当前会话的自定义视图（只读 schema 渲染，13 类块）；生成/修改/回滚通过对话，视图不存在时显示空态。
            </p>
            <button
              type="button"
              onClick={() => {
                bus.emit(EVENTS.VIEW_OPEN, {})
                onClose()
              }}
              className="cursor-pointer rounded-md border border-accent-border bg-accent-soft px-2.5 py-1 text-sm text-accent-hover"
            >
              打开自定义视图预览 →
            </button>
          </section>

          <section id="settings-data" className="mb-4">
            <h3 className="m-0 mb-1 text-md font-semibold">数据目录</h3>
            <p className="m-0 rounded-md border border-border-subtle bg-surface-sunken px-2 py-1.5 font-mono text-2xs text-ink-secondary">
              {dataDirectoryHint()}
            </p>
          </section>

          <section id="settings-shortcuts" className="mb-2">
            <h3 className="m-0 mb-1 text-md font-semibold">快捷键</h3>
            <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between gap-2 border-b border-border-subtle/50 py-0.5">
                  <dt className="font-mono text-2xs text-muted">{shortcut.keys}</dt>
                  <dd className="m-0 text-ink-secondary">{shortcut.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <footer className="flex-none border-t border-border-subtle px-4 py-2 font-mono text-2xs text-muted">
          设置只读展示 + 本地偏好；权限/主题即时生效，其余由后端与对话控制。
        </footer>
      </div>
    </div>
  )
}

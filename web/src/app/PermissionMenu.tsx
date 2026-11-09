// app/PermissionMenu.tsx —— 顶栏权限 pill + 切换面板（M9）
//
// 契约：docs/m9-contract.md §1/§4。显示「沙盒模式 + 审批策略」；面板内 3×3 组合切换；
// 切 danger-full-access 必须二次确认；变更即时反馈（未保存/失败走错误通知）。

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  APPROVAL_POLICIES,
  SANDBOX_MODES,
  approvalDescription,
  approvalLabel,
  permissionSummary,
  sandboxDescription,
  sandboxLabel,
  samePermission,
  type ApprovalPolicy,
  type PermissionState,
  type SandboxMode,
} from '../platform/permissions.ts'

interface PermissionMenuProps {
  permission: PermissionState | null
  loading: boolean
  saving: boolean
  error: string | null
  needsConfirm: (next: PermissionState) => boolean
  save: (next: PermissionState, options?: { confirmedFullAccess?: boolean }) => Promise<boolean>
}

export default function PermissionMenu({ permission, loading, saving, error, needsConfirm, save }: PermissionMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<PermissionState | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [panelPos, setPanelPos] = useState({ left: 16, top: 64, width: 360 })

  const close = useCallback(() => {
    setOpen(false)
    setConfirming(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(360, window.innerWidth - 32)
      const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))
      const top = Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 80))
      setPanelPos({ left, top, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (confirming) setConfirming(null)
        else close()
      }
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, confirming, close])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(timer)
  }, [flash])

  const fromFull = permission?.sandbox === 'danger-full-access'
  const tone = !permission
    ? 'text-muted'
    : fromFull
      ? 'text-danger-ink'
      : permission.sandbox === 'read-only'
        ? 'text-muted'
        : 'text-ink-secondary'

  const apply = async (next: PermissionState, confirmedFullAccess = false): Promise<void> => {
    const ok = await save(next, { confirmedFullAccess })
    if (ok) {
      setConfirming(null)
      setFlash('已生效')
    }
  }

  const choose = (next: PermissionState): void => {
    if (samePermission(permission, next)) return
    if (needsConfirm(next)) {
      setConfirming(next)
      return
    }
    void apply(next)
  }

  const chooseSandbox = (sandbox: SandboxMode): void => {
    if (!permission) return
    choose({ sandbox, approval: permission.approval })
  }

  const choosePolicy = (approval: ApprovalPolicy): void => {
    if (!permission) return
    choose({ sandbox: permission.sandbox, approval })
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`权限模式：${permission ? permissionSummary(permission) : '加载中'}（点击切换）`}
        title="权限：沙盒模式 + 审批策略（M9）"
        className={`inline-flex max-w-[18rem] cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] transition-colors duration-fast ${tone}`}
      >
        <span className="h-1.5 w-1.5 flex-none rounded-xs bg-current opacity-70" aria-hidden="true" />
        <span className="max-[1180px]:hidden">权限 · </span>
        <span className="truncate">{permission ? permissionSummary(permission) : loading ? '加载中…' : '未知'}</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="权限模式切换"
            className="popover-surface fixed p-3 text-left"
            style={{ left: panelPos.left, top: panelPos.top, width: panelPos.width, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', zIndex: 70 }}
          >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-semibold text-ink">权限模式</h3>
            <span className="font-mono text-2xs text-muted">切换立即生效</span>
          </div>

          <section aria-label="沙盒模式" className="mb-2.5">
            <p className="m-0 mb-1 text-sm text-ink-secondary">沙盒模式（能碰哪里）</p>
            <div className="flex flex-col gap-1">
              {SANDBOX_MODES.map((mode) => {
                const active = permission?.sandbox === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => chooseSandbox(mode)}
                    disabled={saving}
                    aria-pressed={active}
                    className={`flex w-full min-w-0 cursor-pointer flex-col rounded-md border p-1.5 text-left transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? 'border-border-subtle bg-avatar-bg'
                        : 'border-border-subtle bg-surface-solid hover:border-accent-border'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
                      <span className="min-w-0 break-words">{sandboxLabel(mode)}</span>
                      {mode === 'danger-full-access' && (
                        <span className="flex-none rounded-pill border border-danger-border bg-surface-solid px-1 font-mono text-2xs text-danger-ink">危险</span>
                      )}
                      {active && <span className="ml-auto flex-none text-xs text-muted">当前</span>}
                    </span>
                    <span className="mt-0.5 block whitespace-normal text-2xs leading-relaxed text-muted [overflow-wrap:anywhere]">{sandboxDescription(mode)}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section aria-label="审批策略" className="mb-2">
            <p className="m-0 mb-1 text-sm text-ink-secondary">审批策略（动作前问不问）</p>
            <div className="flex flex-col gap-1">
              {APPROVAL_POLICIES.map((policy) => {
                const active = permission?.approval === policy
                return (
                  <button
                    key={policy}
                    type="button"
                    onClick={() => choosePolicy(policy)}
                    disabled={saving}
                    aria-pressed={active}
                    className={`flex w-full min-w-0 cursor-pointer flex-col rounded-md border p-1.5 text-left transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60 ${
                      active ? 'border-border-subtle bg-avatar-bg' : 'border-border-subtle bg-surface-solid hover:border-accent-border'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
                      <span className="min-w-0 break-words">{approvalLabel(policy)}</span>
                      {active && <span className="ml-auto flex-none text-xs text-muted">当前</span>}
                    </span>
                    <span className="mt-0.5 block whitespace-normal text-2xs leading-relaxed text-muted [overflow-wrap:anywhere]">{approvalDescription(policy)}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {confirming && (
            <div role="alertdialog" aria-label="确认切换到完全访问" className="mt-2 rounded-md border border-danger-border bg-surface-solid p-2.5">
              <p className="m-0 text-sm font-medium text-danger-ink">确认切换到「完全访问」？</p>
              <p className="m-0 mt-1 text-2xs leading-relaxed text-ink-secondary">
                任意路径读写、任意命令、允许网络；仅在信任当前任务时使用。切回「工作区可写」可随时恢复。
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={saving}
                  className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1 text-2xs text-ink-secondary disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void apply(confirming, true)}
                  disabled={saving}
                  className="cursor-pointer rounded-md border border-danger-border bg-danger px-2.5 py-1 text-2xs text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? '切换中…' : '确认切换'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-2 flex min-w-0 items-start justify-end gap-2 border-t border-border-subtle pt-1.5 text-sm text-muted">
            <span className="min-w-0 flex-1 whitespace-normal break-words">{saving ? '切换中…' : flash ?? '只读自动通过 · 写/执行/网络按策略'}</span>
            <button type="button" onClick={close} className="flex-none cursor-pointer whitespace-nowrap rounded-xs border border-border-subtle bg-surface-solid px-2 py-0.5 text-sm text-muted">
              关闭
            </button>
          </div>
          {error && oneLine(error)}
          </div>,
          document.body,
        )}
    </div>
  )
}

function oneLine(text: string): React.ReactNode {
  return <p className="m-0 mt-1 text-2xs text-danger-ink">{text}</p>
}

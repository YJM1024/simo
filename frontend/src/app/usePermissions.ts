// app/usePermissions.ts —— 权限状态（M9）：读取 / 切换 / WS 变更即时同步
//
// 契约：docs/m9-contract.md §1/§4。切换 full 需确认；后端字段命名差异在 platform/permissions.ts 归一化。

import { useCallback, useEffect, useRef, useState } from 'react'
import { HttpError, getPermissions, updatePermissions } from '../platform/http.ts'
import { bus, EVENTS } from '../platform/events.ts'
import {
  isDangerousMode,
  needsFullAccessConfirmation,
  normalizePermission,
  permissionUpdateBody,
  readPermissionPair,
  type PermissionState,
} from '../platform/permissions.ts'

export interface PermissionsApi {
  permission: PermissionState | null
  loading: boolean
  saving: boolean
  error: string | null
  needsConfirm: (next: PermissionState) => boolean
  save: (next: PermissionState, options?: { confirmedFullAccess?: boolean }) => Promise<boolean>
  refresh: () => void
}

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请稍后重试'
    return error.message || '权限切换失败'
  }
  if (error instanceof Error && error.message) return error.message
  return '权限切换失败'
}

export function usePermissions(): PermissionsApi {
  const [permission, setPermission] = useState<PermissionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const permissionRef = useRef<PermissionState | null>(null)
  permissionRef.current = permission

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    void getPermissions()
      .then((payload) => setPermission(normalizePermission(payload)))
      .catch(() => {
        // 端点未就绪时保持默认展示（不阻塞 UI）
        setPermission((current) => current ?? { sandbox: 'workspace-write', approval: 'auto' })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 权限变更即时反馈：WS 帧 + 连接重连后刷新
  useEffect(() => {
    const offFrame = bus.on(EVENTS.WS_FRAME, ({ frame }) => {
      if (
        frame.type !== 'permissions.changed' &&
        frame.type !== 'permission.changed' &&
        frame.type !== 'permissions.updated' &&
        frame.type !== 'permission.updated'
      ) {
        return
      }
      const pair = readPermissionPair(frame.data)
      if (pair) setPermission(pair)
    })
    const offState = bus.on(EVENTS.WS_STATE, (payload) => {
      if (payload.connection === 'open') refresh()
    })
    return () => {
      offFrame()
      offState()
    }
  }, [refresh])

  const needsConfirm = useCallback(
    (next: PermissionState) => needsFullAccessConfirmation(permissionRef.current, next),
    [],
  )

  const save = useCallback(
    async (next: PermissionState, options: { confirmedFullAccess?: boolean } = {}): Promise<boolean> => {
      if (isDangerousMode(next.sandbox) && options.confirmedFullAccess !== true) {
        setError('切换到完全访问需要二次确认')
        return false
      }
      setSaving(true)
      setError(null)
      const bodies = [permissionUpdateBody(next, { confirmedFullAccess: options.confirmedFullAccess === true })]
      if (isDangerousMode(next.sandbox)) {
        // 后端确认字段命名可能不同：依次兜底重试（仅 400 时）
        bodies.push({ sandbox: next.sandbox, approval: next.approval, confirm: true })
        bodies.push({ sandbox: next.sandbox, approval: next.approval, confirmDangerFullAccess: true })
      }
      try {
        let lastError: unknown = null
        for (const body of bodies) {
          try {
            const payload = await updatePermissions(body)
            setPermission(normalizePermission(payload))
            return true
          } catch (err) {
            lastError = err
            if (!(err instanceof HttpError) || err.status !== 400) throw err
          }
        }
        throw lastError
      } catch (err) {
        const message = errorText(err)
        setError(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '权限切换失败', detail: message })
        return false
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  return { permission, loading, saving, error, needsConfirm, save, refresh }
}

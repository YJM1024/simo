// platform/permissions.ts —— 权限模型（沙盒模式 × 审批策略）纯逻辑（M9）
//
// 契约：docs/m9-contract.md §1/§4。
//   GET /api/permissions  → 当前模式/策略（容错多种包装）
//   POST /api/permissions → 切换；切 danger-full-access 需「确认标记」
// 纯函数（归一化/文案/请求体），供顶栏切换面板与 check-m9 复用。

import { isRecord, readString } from './types.ts'

export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const
export type SandboxMode = (typeof SANDBOX_MODES)[number]

export const APPROVAL_POLICIES = ['ask', 'auto', 'never'] as const
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number]

export interface PermissionState {
  sandbox: SandboxMode
  approval: ApprovalPolicy
}

export const DEFAULT_PERMISSION: PermissionState = { sandbox: 'workspace-write', approval: 'auto' }

const SANDBOX_ALIASES: Record<string, SandboxMode> = {
  'read-only': 'read-only',
  readonly: 'read-only',
  read_only: 'read-only',
  'workspace-write': 'workspace-write',
  workspace_write: 'workspace-write',
  workspacewrite: 'workspace-write',
  'danger-full-access': 'danger-full-access',
  danger_full_access: 'danger-full-access',
  full: 'danger-full-access',
  danger: 'danger-full-access',
}

const POLICY_ALIASES: Record<string, ApprovalPolicy> = {
  ask: 'ask',
  auto: 'auto',
  never: 'never',
}

function normalizeSandbox(value: unknown): SandboxMode | null {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return SANDBOX_ALIASES[raw] ?? null
}

function normalizePolicy(value: unknown): ApprovalPolicy | null {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return POLICY_ALIASES[raw] ?? null
}

function unwrap(payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  for (const key of ['permissions', 'permission', 'data', 'state']) {
    const value = payload[key]
    if (isRecord(value)) return value
  }
  return payload
}

/** 归一化 GET /api/permissions 的返回；缺字段按默认值补（默认 workspace-write + auto）。 */
export function normalizePermission(payload: unknown): PermissionState {
  const source = unwrap(payload)
  if (!isRecord(source)) return { ...DEFAULT_PERMISSION }
  const sandbox =
    normalizeSandbox(source['sandbox']) ??
    normalizeSandbox(source['sandboxMode']) ??
    normalizeSandbox(source['sandbox_mode']) ??
    normalizeSandbox(source['mode']) ??
    DEFAULT_PERMISSION.sandbox
  const approval =
    normalizePolicy(source['approval']) ??
    normalizePolicy(source['approvalPolicy']) ??
    normalizePolicy(source['approval_policy']) ??
    normalizePolicy(source['policy']) ??
    DEFAULT_PERMISSION.approval
  return { sandbox, approval }
}

export function sandboxLabel(mode: SandboxMode): string {
  if (mode === 'read-only') return '只读'
  if (mode === 'workspace-write') return '工作区可写'
  return '完全访问'
}

export function approvalLabel(policy: ApprovalPolicy): string {
  if (policy === 'ask') return '每次询问'
  if (policy === 'auto') return '自动通过只读'
  return '不询问（拒绝高风险）'
}

export function sandboxDescription(mode: SandboxMode): string {
  if (mode === 'read-only') return '只能读取 workspace 与只读路径；禁止执行与网络。'
  if (mode === 'workspace-write') return '读写限 workspace/；pwsh 仅限 workspace；网络单独授权。'
  return '任意路径读写、任意命令、允许网络。风险最高，需二次确认。'
}

export function approvalDescription(policy: ApprovalPolicy): string {
  if (policy === 'ask') return '写/执行/网络每次都要你确认。'
  if (policy === 'auto') return '只读自动通过；写/执行/网络需要确认。'
  return '不弹审批；需审批的动作直接拒绝（fail-closed），不会偷偷执行。'
}

export function isDangerousMode(mode: SandboxMode): boolean {
  return mode === 'danger-full-access'
}

export function permissionSummary(state: PermissionState): string {
  return `${sandboxLabel(state.sandbox)} · ${approvalLabel(state.approval)}`
}

/** POST /api/permissions 请求体；full 模式携带多个确认字段以兼容后端命名差异。 */
export function permissionUpdateBody(
  next: PermissionState,
  options: { confirmedFullAccess: boolean },
): Record<string, unknown> {
  const body: Record<string, unknown> = { sandbox: next.sandbox, approval: next.approval }
  if (isDangerousMode(next.sandbox)) {
    body['confirm'] = options.confirmedFullAccess
    body['confirmDangerFullAccess'] = options.confirmedFullAccess
    body['acknowledgeDanger'] = options.confirmedFullAccess
  }
  return body
}

/** 切换 full 需要确认（当前不是 full 且目标为 full）。 */
export function needsFullAccessConfirmation(current: PermissionState | null, next: PermissionState): boolean {
  if (!isDangerousMode(next.sandbox)) return false
  return current?.sandbox !== 'danger-full-access'
}

export function samePermission(a: PermissionState | null, b: PermissionState | null): boolean {
  if (!a || !b) return false
  return a.sandbox === b.sandbox && a.approval === b.approval
}

/** 兼容 WS `permissions.changed`/`permission.updated` 帧里的字段命名。 */
export function readPermissionPair(value: unknown): PermissionState | null {
  if (!isRecord(value)) return null
  const sandbox = normalizeSandbox(value['sandbox']) ?? normalizeSandbox(value['mode'])
  const approval = normalizePolicy(value['approval']) ?? normalizePolicy(value['approvalPolicy'])
  if (!sandbox || !approval) return null
  return { sandbox, approval }
}

export function readPermissionTitle(value: unknown): string | null {
  return isRecord(value) ? (readString(value, 'title') ?? readString(value, 'message') ?? null) : null
}

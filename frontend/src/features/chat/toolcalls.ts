// features/chat/toolcalls.ts —— 工具调用轨迹归一化（M9，纯逻辑可单测）
//
// 契约：docs/m9-contract.md §4：审计事件 `tool.call`（tool/args 摘要/结果/耗时/是否提权）。
// 前端只在消息流下方折叠显示「最近工具调用」（名称/状态/耗时），不刷屏。
// 兼容多种帧名（tool.call/tool.called/tool_call/tool.result）与字段命名。

import { isRecord, readNumber, readString } from '../../platform/types.ts'

export interface ToolCallInfo {
  id: string
  tool: string
  status: string
  durationMs: number | null
  risk: string
  at: number
  policyDenied: boolean
  escalated: boolean
  argsSummary: string
}

const TOOL_ALIASES: Record<string, string> = {
  read_file: 'read',
  list_dir: 'glob',
  search_text: 'grep',
  write_file: 'write',
}

function normalizeToolName(name: string): string {
  const trimmed = name.trim()
  return TOOL_ALIASES[trimmed] ?? trimmed
}

function policyDeniedOf(status: string, reason: string): boolean {
  const haystack = `${status} ${reason}`.toLowerCase()
  return (
    haystack.includes('policy') ||
    haystack.includes('fail-closed') ||
    haystack.includes('fail_closed') ||
    haystack.includes('denied_by_policy') ||
    haystack.includes('never')
  )
}

function argsSummaryOf(value: unknown): string {
  if (typeof value === 'string') return value.trim().slice(0, 200)
  if (isRecord(value)) {
    const command = readString(value, 'command') ?? readString(value, 'cmd')
    if (command) return command.trim().slice(0, 200)
    const path = readString(value, 'file_path') ?? readString(value, 'path') ?? readString(value, 'pattern')
    if (path) return path
    try {
      return JSON.stringify(value).slice(0, 200)
    } catch {
      return ''
    }
  }
  return ''
}

/** 归一化单个工具调用帧（失败返回 null）。 */
export function normalizeToolCall(payload: unknown, fallbackAt: number = Date.now()): ToolCallInfo | null {
  if (!isRecord(payload)) return null
  const nested = isRecord(payload['tool_call'])
    ? payload['tool_call']
    : isRecord(payload['call'])
      ? payload['call']
      : payload

  const toolRaw =
    readString(nested, 'tool') ??
    readString(nested, 'name') ??
    readString(nested, 'toolName') ??
    readString(payload, 'tool')
  if (!toolRaw) return null
  const tool = normalizeToolName(toolRaw)

  const statusRaw =
    readString(nested, 'status') ??
    readString(nested, 'state') ??
    readString(nested, 'resultStatus') ??
    'done'
  const status = statusRaw.trim().toLowerCase()
  const reason = readString(nested, 'reason') ?? readString(nested, 'error') ?? readString(nested, 'errorCode') ?? ''
  const policyDenied = policyDeniedOf(`${status} ${reason}`, reason)
  const id =
    readString(nested, 'id') ??
    readString(nested, 'callId') ??
    readString(nested, 'toolCallId') ??
    `${tool}:${readNumber(nested, 'at') ?? fallbackAt}`

  return {
    id,
    tool,
    status,
    durationMs:
      readNumber(nested, 'durationMs') ??
      readNumber(nested, 'duration_ms') ??
      readNumber(nested, 'elapsedMs') ??
      readNumber(nested, 'ms') ??
      null,
    risk: (readString(nested, 'risk') ?? '').toLowerCase(),
    at: fallbackAt,
    policyDenied,
    escalated: Boolean(readString(nested, 'sandbox_permissions') ?? readString(nested, 'sandboxPermissions')) ||
      nested['escalated'] === true,
    argsSummary: argsSummaryOf(nested['args'] ?? nested['arguments'] ?? nested['input'] ?? payload['command']),
  }
}

/** 按 id 更新/插入；保留最近 max 条（新→旧）。 */
export function upsertToolCall(
  list: readonly ToolCallInfo[],
  call: ToolCallInfo,
  max = 8,
): ToolCallInfo[] {
  const index = list.findIndex((item) => item.id === call.id)
  const next = list.slice()
  if (index === -1) next.unshift(call)
  else {
    const existing = next[index]
    if (existing) {
      next[index] = {
        ...existing,
        ...call,
        // 帧里缺省字段时保留旧值
        argsSummary: call.argsSummary || existing.argsSummary,
        durationMs: call.durationMs ?? existing.durationMs,
      }
    }
  }
  return next.slice(0, Math.max(1, max))
}

export function toolStatusLabel(call: Pick<ToolCallInfo, 'status' | 'policyDenied'>): string {
  if (call.policyDenied) return '已按策略拒绝'
  if (call.status === 'running' || call.status === 'started') return '进行中'
  if (call.status === 'failed' || call.status === 'error') return '失败'
  if (call.status === 'denied' || call.status === 'deny') return '已拒绝'
  if (call.status === 'cancelled' || call.status === 'canceled') return '已取消'
  return '成功'
}

export function toolStatusTone(call: Pick<ToolCallInfo, 'status' | 'policyDenied'>): 'ok' | 'warn' | 'danger' | 'muted' {
  if (call.policyDenied) return 'danger'
  if (call.status === 'running' || call.status === 'started') return 'warn'
  if (call.status === 'failed' || call.status === 'error' || call.status === 'denied') return 'danger'
  if (call.status === 'cancelled' || call.status === 'canceled') return 'muted'
  return 'ok'
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

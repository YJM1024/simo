// features/chat/TaskReportCard.tsx —— 会话内任务汇报卡片（M10）
//
// 契约：docs/m10-contract.md §3/§7：任务完成/失败/阻塞时司墨发普通 agent 消息（可带任务卡片）。
// 卡片显示任务名/状态/产物，点击通过总线 task:open 让任务面板打开详情（feature 间零 import）。
// 数据通过 platform apiGet 读取 GET /api/tasks/{id}（不 import tasks feature）。

import { useEffect, useState } from 'react'
import { apiGet } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { isRecord, readString, type ChatMessage } from '../../platform/types.ts'
import AgentAvatar from '../../platform/AgentAvatar.tsx'
import { findAgent, type AgentInfo } from '../../platform/agents.ts'

const STATUS_LABEL: Record<string, string> = {
  pending: '待开始',
  queued: '待开始',
  running: '执行中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
  blocked: '受阻',
}

const STATUS_TONE: Record<string, string> = {
  done: 'border-ok-border bg-ok-soft text-ok-ink',
  failed: 'border-danger-border bg-danger-soft text-danger-ink',
  cancelled: 'border-border-subtle bg-surface-sunken text-muted',
  blocked: 'border-warn-border bg-warn-soft text-warn-ink',
  running: 'border-accent-border bg-accent-soft text-accent-hover',
}

export interface TaskCardInfo {
  title: string
  status: string
  artifacts: string[]
  /** M18：任务执行者 id（也可来自消息 handler） */
  agentId: string | null
}

function unwrapTask(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null
  for (const key of ['task', 'data', 'item']) {
    const value = payload[key]
    if (isRecord(value)) {
      const nested = unwrapTask(value)
      if (nested) return nested
    }
  }
  return payload
}

/** 纯函数（可单测）：从 GET /api/tasks/{id} 的返回提取卡片信息。 */
export function parseTaskCard(payload: unknown): TaskCardInfo | null {
  const task = unwrapTask(payload)
  if (!task) return null
  const title = readString(task, 'title')
  if (!title) return null
  const status = (readString(task, 'status') ?? 'running').toLowerCase()
  const rawArtifacts = Array.isArray(task['artifacts']) ? task['artifacts'] : []
  const artifacts = rawArtifacts
    .map((entry) => (typeof entry === 'string' ? entry : isRecord(entry) ? readString(entry, 'name') : undefined))
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
  return { title, status, artifacts, agentId: readString(task, 'agentId') ?? readString(task, 'agent_id') ?? null }
}

/** 是否是任务汇报消息（agent 消息且带 taskId）。 */
export function isTaskReportMessage(message: Pick<ChatMessage, 'role' | 'taskId'>): boolean {
  return message.role === 'agent' && Boolean(message.taskId)
}

export default function TaskReportCard({
  taskId,
  workflowId,
  agent,
}: {
  taskId: string
  workflowId?: string
  /** M18：处理者（消息 agentId 优先，缺省用任务详情里的 agentId） */
  agent?: AgentInfo | null
}) {
  const [info, setInfo] = useState<TaskCardInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void apiGet(`/api/tasks/${encodeURIComponent(taskId)}`)
      .then((payload) => {
        if (!cancelled) {
          const card = parseTaskCard(payload)
          if (card) setInfo(card)
          else setFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  const open = (): void => {
    bus.emit(EVENTS.TASK_OPEN, { taskId, ...(workflowId ? { workflowId } : {}) })
  }

  const status = info?.status ?? 'running'
  const label = STATUS_LABEL[status] ?? status
  const tone = STATUS_TONE[status] ?? 'border-border-subtle bg-surface-sunken text-muted'
  const handler = agent ?? findAgent([], info?.agentId)
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`打开任务详情：${info?.title ?? taskId}`}
      title="打开任务详情（阶段 / 产物 / 工作流）"
      className="mt-2 w-full cursor-pointer rounded-md border border-accent-border bg-accent-soft/40 p-2 text-left transition-colors duration-fast hover:border-accent"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-pill border border-accent-border bg-surface-solid px-1.5 font-mono text-2xs text-accent-hover">
          任务汇报
        </span>
        <span className="inline-flex items-center gap-1" title={`执行者：${handler.name} · ${handler.role}`}>
          <AgentAvatar agent={handler} size="xs" />
          <span className="font-mono text-2xs text-muted">{handler.name}</span>
        </span>
        <span className={`rounded-pill border px-1.5 font-mono text-2xs ${tone}`}>{label}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{info?.title ?? (failed ? '任务（详情暂不可用）' : '加载任务…')}</span>
        {info && info.artifacts.length > 0 && (
          <span className="font-mono text-2xs text-muted">产物 {info.artifacts.length}</span>
        )}
        <span className="font-mono text-2xs text-accent-hover">查看详情 →</span>
      </span>
      {info && info.artifacts.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1">
          {info.artifacts.slice(0, 3).map((name) => (
            <span key={name} className="max-w-[10rem] truncate rounded-xs border border-border-subtle bg-surface-solid px-1 font-mono text-2xs text-ink-secondary" title={name}>
              {name}
            </span>
          ))}
          {info.artifacts.length > 3 && <span className="font-mono text-2xs text-muted">+{info.artifacts.length - 3}</span>}
        </span>
      )}
    </button>
  )
}

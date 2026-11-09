// features/tasks/PlanSummary.tsx —— M38 右栏计划/待办摘要（主区域不再渲染计划面板）
//
// 数据：GET /api/sessions/{id}/plan；失败用任务列表只读投影（source=tasks）。
// 计划只读；待办打勾仍走动作层 POST /api/sessions/{id}/todos/{id}/toggle，失败不本地改状态。
// 紧凑：默认只显示摘要/进度 + 前 6 条待办，展开显示步骤和全部待办；可折叠。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiPost, getPlan } from '../../platform/http.ts'
import { IconButton } from '../../platform/ui/IconButton.tsx'
import {
  normalizePlan,
  planFromTasks,
  todoStatusLabel,
  todoStatusTone,
  toggleTodoBody,
  type PlanInfo,
  type PlanTodo,
} from '../../platform/plan.ts'
import type { TaskInfo } from '../../platform/types.ts'

const COLLAPSED_TODO_LIMIT = 6

export default function PlanSummary({ sessionId, tasks }: { sessionId: string | null; tasks: readonly TaskInfo[] }) {
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [busyTodo, setBusyTodo] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fallback = useMemo(() => planFromTasks(tasks), [tasks])

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setPlan(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await getPlan(sessionId)
      const normalized = normalizePlan(payload)
      setPlan(normalized ?? planFromTasks(tasks))
    } catch {
      setPlan(planFromTasks(tasks))
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [sessionId, tasks])

  useEffect(() => {
    void load()
  }, [load])

  const toggleTodo = async (todo: PlanTodo): Promise<void> => {
    if (!sessionId) return
    if (!todo.checkable) {
      setNotice('该待办关联任务，需通过任务动作层确认完成/撤回；当前未本地改状态。')
      return
    }
    setBusyTodo(todo.id)
    setNotice(null)
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(sessionId)}/todos/${encodeURIComponent(todo.id)}/toggle`, toggleTodoBody(todo, todo.status !== 'done'))
      await load()
      setNotice('待办打勾已提交（状态以任务/计划为准）')
    } catch {
      setNotice('打勾需要后端动作层支持（接口未就绪）；未在本地修改状态。')
    } finally {
      setBusyTodo(null)
    }
  }

  if (!sessionId) return null

  if (loading && !plan) {
    return (
      <section aria-label="计划与待办" className="mb-2 rounded-md border border-border-subtle bg-surface-solid p-2">
        <div className="flex items-center gap-2 text-2xs text-muted" role="status" aria-busy="true">
          <span className="h-3 w-20 rounded bg-surface-sunken motion-safe:animate-pulse" />
          <span className="h-3 w-12 rounded bg-surface-sunken motion-safe:animate-pulse" />
        </div>
      </section>
    )
  }

  const active = plan ?? fallback
  if (!active) {
    return (
      <section aria-label="计划与待办" className="mb-2 rounded-md border border-dashed border-border-subtle bg-surface-sunken/40 px-2 py-1.5 text-2xs text-muted">
        暂无计划/待办；任务拆解后会在这里显示只读摘要。
      </section>
    )
  }

  const done = active.todos.filter((todo) => todo.status === 'done').length
  const visibleTodos = expanded ? active.todos : active.todos.slice(0, COLLAPSED_TODO_LIMIT)

  return (
    <section aria-label="计划与待办" className="mb-2 min-w-0 rounded-md border border-border-subtle bg-surface-solid p-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="rounded-pill border border-accent-border bg-accent-soft px-1.5 font-mono text-2xs text-accent-hover">计划</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={active.title}>{active.title}</span>
        <span className={`rounded-pill border px-1.5 font-mono text-2xs ${active.source === 'api' ? 'border-ok-border bg-ok-soft text-ok-ink' : 'border-warn-border bg-warn-soft text-warn-ink'}`}>
          {active.source === 'api' ? '后端计划' : '任务投影'}
        </span>
        <span className="font-mono text-2xs text-muted">{done}/{active.todos.length}</span>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted">
          {expanded ? '收起' : '展开'}
        </button>
        <IconButton icon="refresh" label="刷新计划" size="sm" tone="ghost" disabled={loading} onClick={() => void load()} />
      </div>

      {active.summary && <p className="m-0 mt-1 line-clamp-2 break-words text-2xs leading-relaxed text-ink-secondary" title={active.summary}>{active.summary}</p>}

      {expanded && active.steps.length > 0 && (
        <ol className="m-0 mt-1 flex flex-col gap-0.5 pl-4 text-2xs text-ink-secondary">
          {active.steps.map((step, index) => <li key={`${index}-${step}`} className="break-words">{index + 1}. {step}</li>)}
        </ol>
      )}

      {visibleTodos.length > 0 && (
        <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0" aria-label="待办列表">
          {visibleTodos.map((todo) => {
            const checked = todo.status === 'done'
            return (
              <li key={todo.id} className="flex min-w-0 items-start gap-1.5 text-2xs">
                <button
                  type="button"
                  onClick={() => void toggleTodo(todo)}
                  disabled={busyTodo === todo.id}
                  aria-label={`${checked ? '取消完成' : '完成'}待办：${todo.title}`}
                  aria-pressed={checked}
                  className={`mt-0.5 h-3.5 w-3.5 flex-none cursor-pointer rounded-xs border text-2xs ${checked ? 'border-ok-border bg-ok-soft text-ok-ink' : 'border-border-subtle bg-surface text-muted'} disabled:opacity-50`}
                >
                  {checked ? '✓' : ''}
                </button>
                <span className={`min-w-0 flex-1 break-words ${checked ? 'text-muted line-through' : 'text-ink'}`}>{todo.title}</span>
                <span className={`flex-none rounded-pill border px-1 font-mono text-2xs ${todoStatusTone(todo.status)}`}>{todoStatusLabel(todo.status)}</span>
              </li>
            )
          })}
        </ul>
      )}
      {!expanded && active.todos.length > visibleTodos.length && (
        <p className="m-0 mt-0.5 text-2xs text-muted">还有 {active.todos.length - visibleTodos.length} 项待办；展开查看。</p>
      )}
      {active.source === 'tasks' && <p className="m-0 mt-1 text-2xs text-warn-ink">计划接口未就绪：当前为任务列表只读投影；打勾/确认需动作层。</p>}
      {notice && <p role="status" className="m-0 mt-1 rounded border border-warn-border bg-warn-soft px-1.5 py-0.5 text-2xs text-warn-ink">{notice}</p>}
      {error && <p role="alert" className="m-0 mt-1 rounded border border-danger-border bg-danger-soft px-1.5 py-0.5 text-2xs text-danger-ink">{error}</p>}
    </section>
  )
}

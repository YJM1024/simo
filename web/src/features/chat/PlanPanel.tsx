// features/chat/PlanPanel.tsx —— UI-2 计划与待办面板（中栏顶部卡片，可折叠）
//
// GET /api/sessions/{id}/plan → 失败时用任务列表降级（只读投影）。
// 确认/拒绝/打勾均调动作层；接口未就绪时明确提示，不本地改状态。

import { useCallback, useEffect, useState } from 'react'
import { apiPost, getPlan, getTasks, toTasks } from '../../platform/http.ts'
import { EmptyPane } from '../../platform/FeedbackPane.tsx'
import {
  normalizePlan,
  planFromTasks,
  todoStatusLabel,
  todoStatusTone,
  toggleTodoBody,
  type PlanInfo,
} from './plan.ts'

export default function PlanPanel({
  sessionId,
  onNotice,
}: {
  sessionId: string | null
  onNotice: (message: string) => void
}) {
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [busyTodo, setBusyTodo] = useState<string | null>(null)
  const [busyPlan, setBusyPlan] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setPlan(null)
      return
    }
    setLoading(true)
    try {
      const payload = await getPlan(sessionId)
      const normalized = normalizePlan(payload)
      if (normalized) {
        setPlan(normalized)
      } else {
        setPlan(planFromTasks(toTasks(await getTasks(sessionId).catch(() => null))))
      }
    } catch {
      try {
        setPlan(planFromTasks(toTasks(await getTasks(sessionId))))
      } catch {
        setPlan(null)
      }
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleTodo = async (todo: PlanInfo['todos'][number]): Promise<void> => {
    if (!sessionId) return
    if (!todo.checkable) {
      onNotice('该待办关联任务，需通过任务动作层确认完成/撤回；当前接口未就绪，不能在这里改状态。')
      return
    }
    setBusyTodo(todo.id)
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(sessionId)}/todos/${encodeURIComponent(todo.id)}/toggle`, toggleTodoBody(todo, todo.status !== 'done'))
      await load()
      onNotice('待办打勾已提交（以任务/计划状态为准）')
    } catch {
      onNotice('打勾需要后端动作层支持（接口未就绪）；未在本地修改状态。')
    } finally {
      setBusyTodo(null)
    }
  }

  const decidePlan = async (action: 'confirm' | 'reject'): Promise<void> => {
    if (!sessionId || !plan) return
    setBusyPlan(true)
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(sessionId)}/plan/${action}`, { planId: plan.id })
      await load()
      onNotice(action === 'confirm' ? '计划已确认，开始执行' : '计划已拒绝')
    } catch {
      onNotice('计划确认/拒绝需要后端动作层支持（接口未就绪）；未在本地修改。')
    } finally {
      setBusyPlan(false)
    }
  }

  if (!plan) {
    return (
      <section className="flex-none border-b border-border-subtle bg-surface-sunken/60 px-2 py-1.5 sm:px-4" aria-label="计划与待办">
        <EmptyPane compact title="暂无计划" description="后端计划接口未就绪时会用任务列表降级；当前没有任务或计划。" />
      </section>
    )
  }

  return (
    <section className="flex-none border-b border-border-subtle bg-surface-sunken/60 px-4 py-1.5" aria-label="计划与待办">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-pill border border-accent-border bg-accent-soft px-1.5 font-mono text-2xs text-accent-hover">计划</span>
        <span className="min-w-0 truncate text-sm font-medium text-ink" title={plan.title}>
          {plan.title}
        </span>
        <span className={`rounded-pill border px-1.5 font-mono text-2xs ${
          plan.source === 'api' ? 'border-ok-border bg-ok-soft text-ok-ink' : 'border-warn-border bg-warn-soft text-warn-ink'
        }`}>
          {plan.source === 'api' ? '后端计划' : '任务降级'}
        </span>
        <span className="font-mono text-2xs text-muted">
          {plan.todos.filter((todo) => todo.status === 'done').length}/{plan.todos.length} 完成
        </span>
        <span className="ml-auto flex items-center gap-1">
          {plan.source === 'api' && plan.status !== 'done' && (
            <>
              <button type="button" onClick={() => void decidePlan('reject')} disabled={busyPlan} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted disabled:opacity-50">
                拒绝
              </button>
              <button type="button" onClick={() => void decidePlan('confirm')} disabled={busyPlan} className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50">
                确认执行
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted"
          >
            {collapsed ? '展开' : '收起'}
          </button>
          <button type="button" onClick={() => void load()} disabled={loading} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted disabled:opacity-50">
            {loading ? '…' : '刷新'}
          </button>
        </span>
      </div>

      {!collapsed && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {plan.summary && <p className="m-0 text-2xs leading-relaxed text-ink-secondary">{plan.summary}</p>}
          {plan.steps.length > 0 && (
            <ol className="m-0 flex flex-wrap list-none gap-1 p-0">
              {plan.steps.map((step, index) => (
                <li key={index} className="rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 font-mono text-2xs text-ink-secondary">
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          )}
          {plan.todos.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="待办列表">
              {plan.todos.map((todo) => {
                const checked = todo.status === 'done'
                return (
                  <li key={todo.id} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <button
                      type="button"
                      onClick={() => void toggleTodo(todo)}
                      disabled={busyTodo === todo.id}
                      aria-label={`${checked ? '取消完成' : '完成'}待办：${todo.title}`}
                      aria-pressed={checked}
                      className={`h-4 w-4 flex-none cursor-pointer rounded-xs border text-2xs ${checked ? 'border-ok-border bg-ok-soft text-ok-ink' : 'border-border-subtle bg-surface-solid text-muted'} disabled:opacity-50`}
                    >
                      {checked ? '✓' : ''}
                    </button>
                    <span className={`min-w-0 flex-1 truncate ${checked ? 'text-muted line-through' : 'text-ink'}`} title={todo.title}>
                      {todo.title}
                    </span>
                    <span className={`rounded-pill border px-1.5 font-mono text-2xs ${todoStatusTone(todo.status)}`}>{todoStatusLabel(todo.status)}</span>
                    {todo.sourceSessionTitle && (
                      <span className="flex-none font-mono text-2xs text-muted" title={todo.sourceSessionTitle}>
                        {todo.sourceSessionTitle}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {plan.source === 'tasks' && (
            <p className="m-0 text-2xs text-warn-ink">计划接口未就绪：当前为任务列表只读投影，打勾/确认需后端动作层。</p>
          )}
        </div>
      )}
    </section>
  )
}

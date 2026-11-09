// features/tasks/PlanSummary.tsx —— M52 右栏计划/待办紧凑摘要
//
// 只展示：12px 灰色分区标题 + 完成计数 + 单行待办（复选框 + 截断标题 + 状态徽标）。
// 不展示数据来源/接口未就绪等内部调试文案；勾选仍走动作层，失败只提示可读结果。

import { useCallback, useEffect, useState } from 'react'
import { apiPost, getPlan } from '../../platform/http.ts'
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

const COLLAPSED_TODO_LIMIT = 5

export default function PlanSummary({ sessionId, tasks }: { sessionId: string | null; tasks: readonly TaskInfo[] }) {
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [busyTodo, setBusyTodo] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setPlan(null)
      return
    }
    try {
      setPlan(normalizePlan(await getPlan(sessionId)) ?? planFromTasks(tasks))
    } catch {
      setPlan(planFromTasks(tasks))
    }
  }, [sessionId, tasks])

  useEffect(() => {
    void load()
  }, [load])

  const toggleTodo = async (todo: PlanTodo): Promise<void> => {
    if (!sessionId) return
    if (!todo.checkable) {
      setNotice('该待办关联任务，请在任务中确认完成。')
      return
    }
    setBusyTodo(todo.id)
    setNotice(null)
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(sessionId)}/todos/${encodeURIComponent(todo.id)}/toggle`, toggleTodoBody(todo, todo.status !== 'done'))
      await load()
    } catch {
      setNotice('勾选失败，请稍后重试。')
    } finally {
      setBusyTodo(null)
    }
  }

  if (!sessionId) return null
  const active = plan ?? planFromTasks(tasks)
  if (!active || active.todos.length === 0) return null
  const done = active.todos.filter((todo) => todo.status === 'done').length
  const visible = expanded ? active.todos : active.todos.slice(0, COLLAPSED_TODO_LIMIT)

  return (
    <section aria-label="计划与待办" className="mb-2 min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xs font-medium text-muted">计划</span>
        <span className="font-mono text-xs tabular-nums text-muted">{done}/{active.todos.length}</span>
        {active.todos.length > COLLAPSED_TODO_LIMIT && (
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-xs text-muted hover:text-ink">
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>
      <ul className="m-0 mt-1 flex list-none flex-col p-0" aria-label="待办列表">
        {visible.map((todo) => {
          const checked = todo.status === 'done'
          return (
            <li key={todo.id} className="flex min-h-9 min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleTodo(todo)}
                disabled={busyTodo === todo.id}
                aria-label={`${checked ? '取消完成' : '完成'}待办：${todo.title}`}
                aria-pressed={checked}
                className={`grid h-4 w-4 flex-none cursor-pointer place-items-center rounded-xs border ${checked ? 'border-ok-border bg-ok-soft text-ok-ink' : 'border-border-subtle bg-surface-solid text-transparent'} disabled:opacity-50`}
              >
                <span className="h-1.5 w-1.5 rounded-xs bg-current" aria-hidden="true" />
              </button>
              <span className={`min-w-0 flex-1 truncate text-sm ${checked ? 'text-muted line-through' : 'text-ink'}`} title={todo.title}>{todo.title}</span>
              <span className={`flex-none rounded-xs border px-1.5 py-0.5 text-[11px] ${todoStatusTone(todo.status)}`}>{todoStatusLabel(todo.status)}</span>
            </li>
          )
        })}
      </ul>
      {notice && <p role="status" className="m-0 mt-1 text-[11px] text-muted">{notice}</p>}
    </section>
  )
}

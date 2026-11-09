// features/agents/AgentsPage.tsx —— 智能体页面（M17，只读）
//
// 列表：名称 / 角色 / 人格摘要 / 工具 / 模型 / 头像图标；数据来自 GET /api/agents，
// 后端未就绪时展示内置示例（source=fallback）并提示，不阻塞使用。无编辑控件。

import { useCallback, useRef, useState } from 'react'
import AgentAvatar from '../../platform/AgentAvatar.tsx'
import { DEFAULT_AGENT_ID, loadAgents, useAgentCatalog, type AgentInfo } from '../../platform/agents.ts'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'

function AgentCard({ agent }: { agent: AgentInfo }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-solid p-3">
      <div className="flex items-start gap-2.5">
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="m-0 truncate text-md font-semibold text-ink">{agent.name}</h3>
            {agent.id === DEFAULT_AGENT_ID && (
              <span className="rounded-xs border border-border-subtle bg-surface-sunken px-1.5 text-xs text-muted">
                默认负责人
              </span>
            )}
            {agent.builtin && (
              <span className="rounded-xs border border-border-subtle bg-surface-sunken px-1.5 text-xs text-muted">
                示例
              </span>
            )}
          </div>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {agent.role} · V4.1 Flash
          </p>
          <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-secondary">
            {agent.persona || '暂无介绍。'}
          </p>
        </div>
      </div>
      {agent.tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" aria-label={`${agent.name} 的工具`}>
          {agent.tools.map((tool) => (
            <span
              key={tool}
              className="rounded-xs border border-border-subtle bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink-secondary"
            >
              {tool}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}

export default function AgentsPage({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const catalog = useAgentCatalog()
  const [refreshing, setRefreshing] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, !embedded, onClose)

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await loadAgents(true)
    } finally {
      setRefreshing(false)
    }
  }, [])

  return (
    <div
      className={embedded ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface' : 'fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="智能体"
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={embedded ? 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-surface' : 'popover-surface flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden'}
      >
        <header className="flex flex-none flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 className="m-0 text-base font-semibold text-ink">智能体</h2>
            <p className="m-0 mt-0.5 text-sm text-ink-secondary">
              默认模型 V4.1 Flash；每个智能体是一种人格/场景身份，会话树显示负责人，消息头像显示实际处理者。
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span
              className={`rounded-pill border px-2 py-0.5 font-mono text-2xs ${
                catalog.source === 'api'
                  ? 'border-ok-border bg-ok-soft text-ok-ink'
                  : 'border-warn-border bg-warn-soft text-warn-ink'
              }`}
              title={catalog.source === 'api' ? '来自后端 /api/agents' : '后端未就绪，展示内置示例'}
            >
              {catalog.source === 'api' ? '来自后端' : '内置示例'}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="刷新智能体列表"
              className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-muted disabled:opacity-50"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-muted transition-colors duration-fast hover:border-border hover:text-ink"
            >
              关闭 ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {catalog.error && (
            <p role="status" className="m-0 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
              {catalog.error}
            </p>
          )}
          {catalog.loading && catalog.agents.length === 0 ? (
            <div className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span key={index} className="h-24 animate-skeleton-shimmer rounded-lg bg-linear-to-r from-skeleton via-skeleton-sheen to-skeleton bg-[length:400%_100%]" />
              ))}
            </div>
          ) : catalog.agents.length === 0 ? (
            <div className="mx-auto mt-6 max-w-md rounded-lg border border-dashed border-border bg-scrim p-6 text-center">
              <div className="text-xl text-accent" aria-hidden="true">
                ◉
              </div>
              <p className="m-0 mt-2 mb-1 text-md font-medium text-ink">暂无可用智能体</p>
              <p className="m-0 text-sm text-ink-secondary">后端可用后这里会列出智能体；现在可以先跟司墨对话。</p>
            </div>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 md:grid-cols-2" aria-label="智能体列表">
              {catalog.agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex-none border-t border-border-subtle px-4 py-2 font-mono text-2xs text-muted">
          只读：智能体是身份定义，修改人格/工具需通过对话与后端配置。
        </footer>
      </div>
    </div>
  )
}

// features/agents/AgentsPage.tsx —— 智能体页面（M17，只读）
//
// 列表：名称 / 角色 / 人格摘要 / 工具 / 模型 / 头像图标；数据来自 GET /api/agents，
// 后端未就绪时展示内置示例（source=fallback）并提示，不阻塞使用。无编辑控件。

import { useCallback, useRef, useState } from 'react'
import AgentAvatar from '../../platform/AgentAvatar.tsx'
import { DEFAULT_AGENT_ID, loadAgents, useAgentCatalog, type AgentInfo } from '../../platform/agents.ts'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'

const BADGE_CLASS =
  'inline-flex h-[17px] flex-none items-center rounded-[3px] border border-border bg-surface-sunken px-1.5 text-[10px] text-ink-muted'

function AgentMonogram({ agent }: { agent: AgentInfo }) {
  // 原型头像为 26px 方形 monogram；用父级选择器把 AgentAvatar 的圆形尺寸收口。
  return (
    <span className="inline-flex flex-none [&>span]:h-[26px] [&>span]:w-[26px] [&>span]:rounded-[7px] [&>span]:text-[10px]">
      <AgentAvatar agent={agent} size="sm" />
    </span>
  )
}

function AgentCard({ agent }: { agent: AgentInfo }) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <AgentMonogram agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="m-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">{agent.name}</h3>
            {agent.id === DEFAULT_AGENT_ID && <span className={BADGE_CLASS}>默认负责人</span>}
            {agent.builtin && <span className={BADGE_CLASS}>示例</span>}
          </div>
          <p className="m-0 mt-0.5 text-[10.5px] text-ink-muted">
            {agent.role} · V4.1 Flash
          </p>
          <p className="m-0 mt-1.5 whitespace-pre-wrap break-words text-[12px] leading-[1.65] text-ink-secondary">
            {agent.persona || '暂无介绍。'}
          </p>
        </div>
      </div>
      {agent.tools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-t border-border-subtle pt-2.5" aria-label={`${agent.name} 的工具`}>
          {agent.tools.map((tool) => (
            <span
              key={tool}
              className="inline-flex h-[18px] items-center rounded-[3px] border border-border-subtle bg-surface-sunken px-1.5 font-mono text-[10px] text-ink-secondary"
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
      className={embedded ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col bg-canvas' : 'fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="智能体"
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={embedded ? 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-canvas' : 'popover-surface flex max-h-[88vh] w-full max-w-[1000px] flex-col overflow-hidden'}
      >
        <header className="flex-none border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-[1000px] flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 font-serif text-[18px] font-medium tracking-[-0.01em] text-ink">智能体</h2>
                <span
                  className={BADGE_CLASS}
                  title={catalog.source === 'api' ? '来自后端 /api/agents' : '后端未就绪，展示内置示例'}
                >
                  <span
                    aria-hidden="true"
                    className={`mr-1 h-1 w-1 rounded-full ${catalog.source === 'api' ? 'bg-ok' : 'bg-warn'}`}
                  />
                  {catalog.source === 'api' ? '来自后端' : '内置示例'}
                </span>
              </div>
              <p className="m-0 mt-1 text-[10.5px] text-ink-muted">
                默认模型 V4.1 Flash；每个智能体是一种人格/场景身份，会话树显示负责人，消息头像显示实际处理者。
              </p>
            </div>
            <div className="flex flex-none items-center gap-1.5">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-label="刷新智能体列表"
                className="inline-flex h-7 cursor-pointer items-center justify-center rounded-sm border border-border bg-surface px-2.5 text-[11.5px] text-ink-secondary transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? '刷新中…' : '刷新'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 cursor-pointer items-center justify-center rounded-sm border border-border bg-surface px-2.5 text-[11.5px] text-ink-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-ink"
              >
                关闭 ×
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1000px] px-5 py-4">
            {catalog.error && (
              <p role="status" className="m-0 mb-3 rounded-sm border border-warn-border bg-warn-soft px-3 py-2 text-[11px] text-warn-ink">
                {catalog.error}
              </p>
            )}
            {catalog.loading && catalog.agents.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <span key={index} className="h-[132px] animate-pulse rounded-md border border-border-subtle bg-surface-sunken" />
                ))}
              </div>
            ) : catalog.agents.length === 0 ? (
              <div className="mx-auto mt-8 max-w-[420px] rounded-md border border-dashed border-border px-6 py-10 text-center">
                <span className="mx-auto grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-ink text-[15px] text-ink-inverse" aria-hidden="true">
                  ◉
                </span>
                <p className="m-0 mt-4 font-serif text-[18px] font-medium text-ink">暂无可用智能体</p>
                <p className="m-0 mt-1 text-[11px] leading-relaxed text-ink-muted">
                  后端可用后这里会列出智能体；现在可以先跟司墨对话。
                </p>
              </div>
            ) : (
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2" aria-label="智能体列表">
                {catalog.agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex-none border-t border-border bg-surface">
          <div className="mx-auto w-full max-w-[1000px] px-5 py-2 text-[10.5px] text-ink-faint">
            只读：智能体是身份定义，修改人格/工具需通过对话与后端配置。
          </div>
        </footer>
      </div>
    </div>
  )
}

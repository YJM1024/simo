// platform/AgentAvatar.tsx —— 智能体头像（M17，共享 UI；sessions / chat / agents 复用）
//
// 按智能体区分颜色与形状；仅使用主题 token，无硬编码颜色；title/aria-label 带名称与角色。

import { BUILTIN_AGENTS, findAgent, type AgentInfo } from './agents.ts'

const SIZE_CLASS: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'h-[22px] w-[22px] text-xs',
  sm: 'h-[30px] w-[30px] text-sm',
  md: 'h-10 w-10 text-md',
  lg: 'h-14 w-14 text-xl',
}

const TONE_CLASS: Record<AgentInfo['tone'], string> = {
  accent: 'border-accent-border bg-accent-soft text-accent-hover',
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  muted: 'border-border-subtle bg-surface-sunken text-muted',
}

const SHAPE_CLASS: Record<AgentInfo['shape'], string> = {
  round: 'rounded-xs',
  soft: 'rounded-xs',
  square: 'rounded-xs',
}

interface AgentAvatarProps {
  agent?: AgentInfo | null
  /** 只给 id 时按目录/内置示例查找 */
  agentId?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

export default function AgentAvatar({ agent, agentId, size = 'sm', className = '' }: AgentAvatarProps) {
  const info = agent ?? findAgent(BUILTIN_AGENTS, agentId)
  return (
    <span
      role="img"
      aria-label={`${info.name}（${info.role}）`}
      title={`${info.name} · ${info.role}`}
      className={`inline-grid flex-none self-start place-items-center border font-semibold ${SIZE_CLASS[size]} ${TONE_CLASS[info.tone]} ${SHAPE_CLASS[info.shape]} ${className}`}
    >
      {info.icon}
    </span>
  )
}

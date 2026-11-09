// platform/AgentAvatar.tsx —— 智能体头像（M17，共享 UI；sessions / chat / agents 复用）
//
// 按智能体区分颜色与形状；仅使用主题 token，无硬编码颜色；title/aria-label 带名称与角色。

import { BUILTIN_AGENTS, findAgent, type AgentInfo } from './agents.ts'

const SIZE_CLASS: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'h-6 w-6 text-[11px]',
  sm: 'h-[30px] w-[30px] text-xs',
  md: 'h-[30px] w-[30px] text-xs',
  lg: 'h-[30px] w-[30px] text-xs',
}

const TONE_CLASS: Record<AgentInfo['tone'], string> = {
  accent: 'border-avatar-agent-bg bg-avatar-agent-bg text-avatar-agent-ink',
  ok: 'border-avatar-agent-bg bg-avatar-agent-bg text-avatar-agent-ink',
  warn: 'border-avatar-agent-bg bg-avatar-agent-bg text-avatar-agent-ink',
  danger: 'border-avatar-agent-bg bg-avatar-agent-bg text-avatar-agent-ink',
  muted: 'border-avatar-agent-bg bg-avatar-agent-bg text-avatar-agent-ink',
}

const SHAPE_CLASS: Record<AgentInfo['shape'], string> = {
  round: 'rounded-full',
  soft: 'rounded-full',
  square: 'rounded-full',
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
      className={`inline-grid flex-none self-start place-items-center overflow-hidden rounded-full border font-semibold ${SIZE_CLASS[size]} ${TONE_CLASS[info.tone]} ${SHAPE_CLASS[info.shape]} ${className}`}
    >
      {info.icon}
    </span>
  )
}

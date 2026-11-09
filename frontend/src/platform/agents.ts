// platform/agents.ts —— 智能体目录（M17：共享数据层，供 sessions / chat / agents 复用）
//
// 契约（前端先行）：GET /api/agents 返回 {agents:[{id,name,role,persona,tools[],model,icon,tone?,shape?}]}；
// 后端未就绪/空时展示内置示例（优雅降级），并标记 source='fallback'。
// 这里只做数据归一化/缓存/订阅；features 之间仍禁止互相 import。
//
// 设计语义：智能体是司墨的人格/场景化身份；会话树显示负责人头像，消息头像显示处理者。

import { useEffect, useState } from 'react'
import { HttpError, apiGet } from './http.ts'
import { isRecord, readString } from './types.ts'

export type AgentTone = 'accent' | 'ok' | 'warn' | 'danger' | 'muted'
export type AgentShape = 'round' | 'soft' | 'square'

export interface AgentInfo {
  id: string
  name: string
  role: string
  persona: string
  tools: string[]
  model: string
  icon: string
  tone: AgentTone
  shape: AgentShape
  /** 内置示例（后端未提供时） */
  builtin?: boolean
}

export const DEFAULT_AGENT_ID = 'simo'

const TONE_ORDER: AgentTone[] = ['accent', 'ok', 'warn', 'muted', 'danger']
const SHAPE_ORDER: AgentShape[] = ['round', 'soft', 'square']

/** 内置示例：与产品设计语义一致（默认负责人是司墨；其他人格为不同场景身份）。 */
export const BUILTIN_AGENTS: readonly AgentInfo[] = [
  {
    id: 'simo',
    name: '司墨',
    role: '主理人 / 统筹',
    persona: '负责理解你的需求、拆解任务并把结果汇报回来；默认会话负责人，会记住上下文并协调其他人格。',
    tools: ['对话', '任务编排', '记忆'],
    model: 'DeepSeek V3',
    icon: '墨',
    tone: 'accent',
    shape: 'round',
    builtin: true,
  },
  {
    id: 'researcher',
    name: '研究员',
    role: '调研分析',
    persona: '擅长检索、交叉验证与整理资料，输出带来源的结论；遇到不确定会先说明证据边界。',
    tools: ['web_search', 'web_fetch', '记忆'],
    model: 'DeepSeek V3',
    icon: '研',
    tone: 'ok',
    shape: 'soft',
    builtin: true,
  },
  {
    id: 'builder',
    name: '工程师',
    role: '实现与构建',
    persona: '负责读写文件、运行命令与构建修复；动手前先确认权限和影响范围，不做未授权改动。',
    tools: ['read', 'grep', 'write', 'pwsh'],
    model: 'DeepSeek V3',
    icon: '工',
    tone: 'warn',
    shape: 'square',
    builtin: true,
  },
  {
    id: 'reviewer',
    name: '审校',
    role: '核对与验收',
    persona: '检查结果与来源是否一致，指出遗漏与风险；只读核对，不直接修改文件。',
    tools: ['read', 'grep', 'web_fetch'],
    model: 'DeepSeek V3',
    icon: '校',
    tone: 'muted',
    shape: 'round',
    builtin: true,
  },
]

function toTone(value: string | undefined, fallback: AgentTone): AgentTone {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'accent' || normalized === 'ok' || normalized === 'warn' || normalized === 'danger' || normalized === 'muted') {
    return normalized
  }
  return fallback
}

function toShape(value: string | undefined, fallback: AgentShape): AgentShape {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'round' || normalized === 'soft' || normalized === 'square') return normalized
  return fallback
}

function toTools(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tools: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) tools.push(entry.trim())
    else if (isRecord(entry)) {
      const name = readString(entry, 'name') ?? readString(entry, 'id') ?? readString(entry, 'title')
      if (name) tools.push(name)
    }
  }
  return [...new Set(tools)]
}

/** 归一化单个智能体；字段不足/无 id 返回 null。 */
export function normalizeAgent(value: unknown, index = 0): AgentInfo | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'agentId') ?? readString(value, 'agent_id')
  if (!id) return null
  const name = readString(value, 'name') ?? readString(value, 'title') ?? id
  const persona =
    readString(value, 'persona') ??
    readString(value, 'summary') ??
    readString(value, 'description') ??
    readString(value, 'intro') ??
    ''
  const icon = readString(value, 'icon') ?? readString(value, 'emoji') ?? readString(value, 'glyph') ?? name.slice(0, 1)
  return {
    id,
    name,
    role: readString(value, 'role') ?? readString(value, 'title') ?? '智能体',
    persona,
    tools: toTools(value['tools'] ?? value['capabilities']),
    model: readString(value, 'model') ?? '—',
    icon,
    tone: toTone(readString(value, 'tone') ?? readString(value, 'color'), TONE_ORDER[index % TONE_ORDER.length] ?? 'muted'),
    shape: toShape(readString(value, 'shape'), SHAPE_ORDER[index % SHAPE_ORDER.length] ?? 'round'),
    ...(value['builtin'] === true ? { builtin: true } : {}),
  }
}

function agentArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  for (const key of ['agents', 'items', 'data']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (isRecord(value) && Array.isArray(value['agents'])) return value['agents']
  }
  return []
}

export function normalizeAgents(payload: unknown): AgentInfo[] {
  const seen = new Set<string>()
  const agents: AgentInfo[] = []
  agentArray(payload).forEach((entry, index) => {
    const agent = normalizeAgent(entry, index)
    if (!agent || seen.has(agent.id)) return
    seen.add(agent.id)
    agents.push(agent)
  })
  return agents
}

export function findAgent(agents: readonly AgentInfo[], id?: string | null): AgentInfo {
  if (id) {
    const found = agents.find((agent) => agent.id === id)
    if (found) return found
    const builtin = BUILTIN_AGENTS.find((agent) => agent.id === id)
    if (builtin) return builtin
  }
  const simo = agents.find((agent) => agent.id === DEFAULT_AGENT_ID)
  if (simo) return simo
  if (!id && agents[0]) return agents[0]
  return BUILTIN_AGENTS[0]!
}

function hashSessionId(sessionId: string): number {
  let hash = 0
  for (let index = 0; index < sessionId.length; index += 1) {
    hash = (hash * 31 + sessionId.charCodeAt(index)) >>> 0
  }
  return hash
}

/** 后端未返回会话负责人时的确定性兜底：主会话/根默认司墨，其余按 id 散列到其他人格。 */
export function fallbackOwnerForSession(sessionId: string): string {
  if (!sessionId || sessionId === 'main' || sessionId === 'root') return DEFAULT_AGENT_ID
  const candidates = BUILTIN_AGENTS.filter((agent) => agent.id !== DEFAULT_AGENT_ID)
  const index = hashSessionId(sessionId) % Math.max(1, candidates.length)
  return candidates[index]?.id ?? DEFAULT_AGENT_ID
}

export type AgentSource = 'api' | 'fallback' | 'loading'

export interface AgentCatalog {
  agents: AgentInfo[]
  source: AgentSource
  error: string | null
  loading: boolean
}

const FALLBACK_CATALOG: AgentCatalog = {
  agents: [...BUILTIN_AGENTS],
  source: 'fallback',
  error: null,
  loading: false,
}

let cached: AgentCatalog | null = null
let inflight: Promise<AgentCatalog> | null = null
const listeners = new Set<(catalog: AgentCatalog) => void>()

function publish(catalog: AgentCatalog): AgentCatalog {
  cached = catalog
  for (const listener of listeners) listener(catalog)
  return catalog
}

function fallbackCatalog(reason: string): AgentCatalog {
  return { ...FALLBACK_CATALOG, error: reason }
}

/** 拉取智能体目录（带缓存；失败/404 时降级为内置示例）。 */
export function loadAgents(force = false): Promise<AgentCatalog> {
  if (!force && cached) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const payload = await apiGet('/api/agents')
      const agents = normalizeAgents(payload)
      if (agents.length > 0) {
        return publish({ agents, source: 'api', error: null, loading: false })
      }
      return publish(fallbackCatalog('后端暂未提供智能体，先展示内置示例。'))
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 405)) {
        return publish(fallbackCatalog('智能体接口尚未就绪，先展示内置示例。'))
      }
      const detail =
        error instanceof HttpError && error.offline
          ? '无法连接后端，先展示内置示例。'
          : error instanceof Error && error.message
            ? error.message
            : '智能体加载失败，先展示内置示例。'
      return publish(fallbackCatalog(detail))
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function getCachedAgentCatalog(): AgentCatalog | null {
  return cached
}

/** 组件订阅：缓存命中即时渲染，否则后台加载并更新。 */
export function useAgentCatalog(): AgentCatalog {
  const [catalog, setCatalog] = useState<AgentCatalog>(() => cached ?? { ...FALLBACK_CATALOG, source: 'loading', loading: true })
  useEffect(() => {
    listeners.add(setCatalog)
    void loadAgents().then(setCatalog)
    return () => {
      listeners.delete(setCatalog)
    }
  }, [])
  return catalog
}

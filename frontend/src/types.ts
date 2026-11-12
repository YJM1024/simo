export interface Session {
  id: string
  parentId: string
  title: string
  createdAt: number
  archived: number | boolean
  pinned: boolean
  ownerAgentId?: string
  children?: Session[]
}

export interface SessionPath {
  id: string
  title: string
}

export interface Message {
  id: string
  sessionId: string
  sessionTitle?: string
  role: 'user' | 'agent'
  text: string
  at: number
  status: string
  agentId?: string
  category?: string
  cards?: Card[]
  attachments?: Array<{ id: string; name?: string; mime?: string }>
  sessionPath?: SessionPath[]
}

export interface Card {
  id: string
  sessionId: string
  messageId: string
  version: number
  status: string
  title?: string
  schema: CardSchema
}

export interface CardSchema {
  title?: string
  blocks?: CardBlock[]
  equivalence?: { chatPrompt?: string }
}

export interface CardBlock {
  id: string
  type: string
  props?: Record<string, unknown>
  actions?: CardAction[]
}

export interface CardAction {
  id: string
  label: string
  action?: string
  route?: string
}

export interface SessionOverview {
  goal?: string
  constraints?: string[]
  current?: string
  completed?: string[]
  pending?: string[]
  notes?: string
  timeline?: Array<{ at: number; text: string }>
  version?: number
  updatedAt?: number
}

export interface Task {
  id: string
  sessionId: string
  title: string
  status: string
  summary?: string
  progress?: number
  createdAt: number
  updatedAt: number
}

export interface Artifact {
  id: string
  taskId?: string
  name: string
  mime: string
  size: number
  createdAt: number
}

export interface PermissionState {
  approval: string
  mode: string
  sandbox: string
  policy: string
}

export interface Usage {
  total: { promptTokens?: number; completionTokens?: number; totalTokens: number; estimated?: boolean }
  calls?: number
  byRole?: Record<string, { totalTokens?: number }>
}

export interface StatsTotals {
  tokens: number
  messages: number
  tasks: number
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
}

export interface StatsBucket {
  label: string
  messages: number
  tokens: number
  tasks: number
  start: number
}

export interface SpecTaskItem { id: string; title: string; state: string; updatedAt: number }
export interface SpecTaskGroup { total: number; items: SpecTaskItem[]; hasMore: boolean }
export interface SpecDeliverable { id: string; name: string; createdAt?: number; kind?: string; previewUrl?: string; downloadUrl?: string }
export interface SessionSpecProjection {
  sessionId: string
  status: string
  revision: number
  updatedAt: number
  goal: string | null
  constraints: string[]
  inputs: string[]
  tasks: { done: SpecTaskGroup; running: SpecTaskGroup; pending: SpecTaskGroup }
  deliverables: { total: number; items: SpecDeliverable[]; hasMore: boolean }
  pendingConfirmations: { total: number }
}

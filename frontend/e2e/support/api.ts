import { readStack } from './stack'

export interface Session {
  id: string
  parentId: string
  title: string
  archived: number | boolean
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'agent'
  text: string
  at: number
  status: string
  taskId?: string
}

export interface Task {
  id: string
  sessionId: string
  title: string
  status: string
  messageId?: string
}

export interface Approval {
  id: string
  tool: string
  args: string
  status: string
  createdAt: number
}

export interface Deliverable {
  id: string
  name: string
  downloadUrl?: string
  sessionId?: string
}

let cachedBase = ''

function apiBase(): string {
  if (!cachedBase) cachedBase = readStack().apiBase
  return cachedBase
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`E2E seed API 失败：${init?.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 300)}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export async function waitFor<T>(label: string, probe: () => Promise<T | null>, timeoutMs = 30_000, intervalMs = 250): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const value = await probe()
      if (value !== null && value !== undefined) return value
    } catch (error) {
      lastError = (error as Error).message
    }
    await sleep(intervalMs)
  }
  throw new Error(`等待超时（${timeoutMs}ms）：${label}${lastError ? `；最后错误：${lastError}` : ''}`)
}

export async function createSession(parentId: string | null, title: string): Promise<Session> {
  const body: Record<string, unknown> = { title, draft: false }
  if (parentId) body.parentId = parentId
  const data = await request<{ session: Session }>('/api/sessions', { method: 'POST', body: JSON.stringify(body) })
  if (!data.session?.id) throw new Error(`创建会话响应缺少 session.id：${JSON.stringify(data).slice(0, 200)}`)
  return data.session
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const data = await request<{ messages?: Message[] }>(`/api/messages?sessionId=${encodeURIComponent(sessionId)}&limit=100`)
  return data.messages ?? []
}

export async function postChat(sessionId: string, text: string): Promise<string> {
  const data = await request<{ ok: boolean; messageId?: string }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId, text }),
  })
  return data.messageId ?? ''
}

/** 发一条消息并等待用户消息与 mock 回复都落库（种子数据用）。 */
export async function seedChat(sessionId: string, text: string): Promise<void> {
  await postChat(sessionId, text)
  await waitFor(`用户消息落库：${text.slice(0, 30)}`, async () => {
    const messages = await getMessages(sessionId)
    return messages.some((message) => message.role === 'user' && message.text.includes(text)) ? true : null
  })
  await waitFor(`mock 回复落库：${text.slice(0, 30)}`, async () => {
    const messages = await getMessages(sessionId)
    return messages.some((message) => message.role === 'agent' && message.text.includes('Mock 模型')) ? true : null
  }, 45_000)
}

export async function getAllSessionMessages(sessionId: string): Promise<{ messages: Message[]; pagination: boolean }> {
  const data = await request<{ messages?: Message[]; pagination?: boolean }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages?scope=all`,
  )
  return { messages: data.messages ?? [], pagination: data.pagination !== false }
}

export async function getTasks(sessionId: string): Promise<Task[]> {
  const data = await request<{ tasks?: Task[] }>(`/api/tasks?sessionId=${encodeURIComponent(sessionId)}`)
  return data.tasks ?? []
}

export interface ProjectionTask {
  id: string
  title: string
  state: string
  messageId?: string
}

export interface SpecProjection {
  sessionId: string
  tasks: {
    done: { total: number; items: ProjectionTask[] }
    running: { total: number; items: ProjectionTask[] }
    pending: { total: number; items: ProjectionTask[] }
  }
}

export async function getProjection(sessionId: string, taskLimit = 3): Promise<SpecProjection> {
  return request<SpecProjection>(`/api/sessions/${encodeURIComponent(sessionId)}/spec-projection?taskLimit=${taskLimit}`)
}

export async function waitForTaskDone(sessionId: string, titleIncludes: string): Promise<Task> {
  return waitFor(`任务完成：${titleIncludes}`, async () => {
    const tasks = await getTasks(sessionId)
    return tasks.find((task) => task.title.includes(titleIncludes) && task.status === 'done') ?? null
  }, 30_000)
}

/** 等待任务出现在右栏 spec projection（任务定位用例的前置条件），以便区分“数据没到”与“UI 没渲染”。 */
export async function waitForProjectionTask(sessionId: string, taskId: string): Promise<SpecProjection> {
  return waitFor(`任务进入 spec projection：${taskId}`, async () => {
    const projection = await getProjection(sessionId)
    const all = [...projection.tasks.done.items, ...projection.tasks.running.items, ...projection.tasks.pending.items]
    return all.some((item) => item.id === taskId) ? projection : null
  }, 15_000)
}

export async function listApprovals(): Promise<Approval[]> {
  const data = await request<{ approvals?: Approval[] }>('/api/approvals')
  return data.approvals ?? []
}

export async function waitForPendingApproval(argsInclude: string): Promise<Approval> {
  return waitFor(`待审批：${argsInclude}`, async () => {
    const approvals = await listApprovals()
    return approvals.find((approval) => approval.status === 'pending' && approval.args.includes(argsInclude)) ?? null
  }, 45_000)
}

export async function decideApproval(id: string, decision: 'allow' | 'deny' = 'allow'): Promise<void> {
  await request(`/api/approvals/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  })
}

export async function listDeliverables(): Promise<Deliverable[]> {
  const data = await request<{ deliverables?: Deliverable[] }>('/api/deliverables')
  return data.deliverables ?? []
}

export async function waitForDeliverable(name: string): Promise<Deliverable> {
  return waitFor(`交付物出现：${name}`, async () => {
    const deliverables = await listDeliverables()
    return deliverables.find((item) => item.name === name) ?? null
  }, 45_000)
}

/** 生成一个可下载的用户交付物：mock:write → 审批 allow → user_delivery artifact。 */
export async function seedDeliverable(sessionId: string): Promise<Deliverable> {
  await postChat(sessionId, 'mock:write')
  const approval = await waitForPendingApproval('mock-write.txt')
  await decideApproval(approval.id, 'allow')
  return waitForDeliverable('mock-write.txt')
}

export async function markDownloaded(deliverable: Deliverable): Promise<void> {
  // 交付物 API 已由 waitForDeliverable 校验；这里仅作为显式可读断言点。
  if (!deliverable.downloadUrl) throw new Error(`交付物 ${deliverable.name} 缺少 downloadUrl`)
}
// platform/preferences.ts —— 本地偏好（UI-1 共享：模型偏好 / 首启 / 置顶 / 未读计数）
//
// 只存浏览器 localStorage；后端不可用时用于优雅降级；内部键名保持不变。
// features 通过 platform 复用，不跨 feature import。

export const MODEL_STORAGE_KEY = 'simo.model'
export const FIRST_RUN_KEY = 'simo.firstRun.seen'
export const PINNED_SESSIONS_KEY = 'simo.pinnedSessions'
export const READ_COUNTS_KEY = 'simo.readCounts'
export const SUBTASK_EXECUTOR_KEY = 'simo.subtaskExecutor'
export const REASONING_STORAGE_KEY = 'simo.reasoning'

export const MODEL_OPTIONS = ['DeepSeek V3', 'DeepSeek R1', '自动（由后端决定）'] as const
export type ModelOption = (typeof MODEL_OPTIONS)[number]

export const REASONING_OPTIONS = ['low', 'medium', 'high', 'max'] as const
export type ReasoningOption = (typeof REASONING_OPTIONS)[number]

export function loadReasoningPreference(): ReasoningOption {
  const value = readString(REASONING_STORAGE_KEY)
  return (REASONING_OPTIONS as readonly string[]).includes(value ?? '') ? (value as ReasoningOption) : 'medium'
}

export function saveReasoningPreference(value: string): ReasoningOption {
  const resolved: ReasoningOption = (REASONING_OPTIONS as readonly string[]).includes(value) ? (value as ReasoningOption) : 'medium'
  writeString(REASONING_STORAGE_KEY, resolved)
  return resolved
}

export const SUBTASK_EXECUTORS = ['npc', 'self'] as const
export type SubtaskExecutor = (typeof SUBTASK_EXECUTORS)[number]

export function loadSubtaskExecutor(): SubtaskExecutor {
  const value = readString(SUBTASK_EXECUTOR_KEY)
  return value === 'self' ? 'self' : 'npc'
}

export function saveSubtaskExecutor(executor: string): SubtaskExecutor {
  const resolved: SubtaskExecutor = executor === 'self' ? 'self' : 'npc'
  writeString(SUBTASK_EXECUTOR_KEY, resolved)
  return resolved
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 隐私模式/测试环境忽略
  }
}

export function loadModelPreference(): ModelOption {
  const value = readString(MODEL_STORAGE_KEY)
  if (value && (MODEL_OPTIONS as readonly string[]).includes(value)) return value as ModelOption
  return MODEL_OPTIONS[0]
}

export function saveModelPreference(model: string): ModelOption {
  const resolved = (MODEL_OPTIONS as readonly string[]).includes(model) ? (model as ModelOption) : MODEL_OPTIONS[0]
  writeString(MODEL_STORAGE_KEY, resolved)
  return resolved
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 忽略
  }
}

export function loadPinnedSessions(): string[] {
  const values = readJson<unknown>(PINNED_SESSIONS_KEY, [])
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []
}

export function savePinnedSessions(ids: readonly string[]): void {
  writeJson(PINNED_SESSIONS_KEY, [...new Set(ids)])
}

export function togglePinnedSession(id: string): string[] {
  const current = loadPinnedSessions()
  const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  savePinnedSessions(next)
  return next
}

export function loadReadCounts(): Record<string, number> {
  const values = readJson<unknown>(READ_COUNTS_KEY, {})
  if (!values || typeof values !== 'object') return {}
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value
  }
  return counts
}

export function markSessionRead(id: string, count: number): Record<string, number> {
  const current = loadReadCounts()
  const next = { ...current, [id]: Math.max(current[id] ?? 0, count) }
  writeJson(READ_COUNTS_KEY, next)
  return next
}

export function hasSeenFirstRun(): boolean {
  return readString(FIRST_RUN_KEY) === '1'
}

export function markFirstRunSeen(): void {
  writeString(FIRST_RUN_KEY, '1')
}

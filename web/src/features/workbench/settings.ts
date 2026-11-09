// features/workbench/settings.ts —— 设置中心纯逻辑（UI-1）
//
// 模型偏好/首启/置顶/未读键统一放在 platform/preferences（共享）；此文件保留 UI 选项与快捷键。

export {
  MODEL_OPTIONS,
  MODEL_STORAGE_KEY,
  FIRST_RUN_KEY,
  PINNED_SESSIONS_KEY,
  READ_COUNTS_KEY,
  SUBTASK_EXECUTOR_KEY,
  SUBTASK_EXECUTORS,
  REASONING_STORAGE_KEY,
  REASONING_OPTIONS,
  loadModelPreference,
  saveModelPreference,
  loadReasoningPreference,
  saveReasoningPreference,
  loadPinnedSessions,
  savePinnedSessions,
  togglePinnedSession,
  loadReadCounts,
  markSessionRead,
  loadSubtaskExecutor,
  saveSubtaskExecutor,
  hasSeenFirstRun,
  markFirstRunSeen,
} from '../../platform/preferences.ts'

export interface ShortcutRow {
  keys: string
  label: string
}

export const SHORTCUTS: readonly ShortcutRow[] = [
  { keys: 'Ctrl / ⌘ + K', label: '打开命令面板' },
  { keys: 'Enter', label: '发送消息' },
  { keys: 'Shift + Enter', label: '在输入框换行' },
  { keys: 'Esc', label: '关闭面板 / 取消引用 / 关闭 @ 候选' },
  { keys: '/archive · /rename · /pause · /model', label: '斜杠命令（输入框）' },
  { keys: '@', label: '在输入框引用会话或文件' },
  { keys: 'Tab', label: '在控件间移动焦点' },
]

export const SETTINGS_SECTIONS = [
  { id: 'model', title: '模型' },
  { id: 'permissions', title: '权限' },
  { id: 'executor', title: '子任务执行者' },
  { id: 'theme', title: '主题' },
  { id: 'view', title: '自定义视图' },
  { id: 'data', title: '数据目录' },
  { id: 'shortcuts', title: '快捷键' },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

export function dataDirectoryHint(): string {
  return '数据目录由后端 AGENTD_HOME 决定；当前没有可用的设置接口，前端只读展示。'
}

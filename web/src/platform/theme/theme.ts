// platform/theme/theme.ts —— 主题接口（M1 只有 light-tech；P1 支持 256 套）
//
// 切换主题只做两件事：
//   1) <html data-theme="<name>"> —— CSS 侧 [data-theme='x'] 覆盖语义 token；
//   2) 记住选择（localStorage）。
// 新增主题：src/styles.css 加一个 [data-theme='x'] 覆盖块 + 这里 THEME_META 登记一行，
// 组件零改动。

import { readStorage, writeStorage } from '../storage.ts'

export interface ThemeMeta {
  label: string
  colorScheme: 'light' | 'dark'
}

export const DEFAULT_THEME = 'light-tech'

export const THEME_META = {
  'light-tech': { label: '浅色科技', colorScheme: 'light' },
} as const satisfies Record<string, ThemeMeta>

export type ThemeName = keyof typeof THEME_META

const STORAGE_KEY = 'agentd.theme'

export function listThemes(): ThemeName[] {
  return Object.keys(THEME_META) as ThemeName[]
}

export function resolveTheme(name: string | null | undefined): ThemeName {
  return name && Object.hasOwn(THEME_META, name) ? (name as ThemeName) : DEFAULT_THEME
}

export function getInitialTheme(): ThemeName {
  return resolveTheme(readStorage(STORAGE_KEY))
}

/** 应用主题（幂等）；返回实际生效的主题名。 */
export function applyTheme(name: string | null | undefined): ThemeName {
  const theme = resolveTheme(name)
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  const meta: ThemeMeta = THEME_META[theme]
  root.style.colorScheme = meta.colorScheme
  writeStorage(STORAGE_KEY, theme)
  return theme
}

/** P1 主题切换入口（M1 没有切换 UI，接口先就位）。 */
export function setTheme(name: string): ThemeName {
  return applyTheme(name)
}

export function themeLabel(name: string | null | undefined): string {
  return THEME_META[resolveTheme(name)].label
}

export function initTheme(): ThemeName {
  return applyTheme(getInitialTheme())
}

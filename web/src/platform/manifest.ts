// platform/manifest.ts —— feature 契约类型（前端模块化的「接口层」）
//
// features 只依赖 platform；app 只依赖 features/registry.ts。这样加/删功能不需要
// 动壳层代码，也不会让 features 互相 import（scripts/check-modularity.mjs 强制）。

import type { ComponentType } from 'react'
import type { Bus } from './events.ts'
import type { ThemeName } from './theme/theme.ts'

/** 允许的插槽（契约 §9.2）。 */
export const SLOT_NAMES = ['leftTree', 'center', 'rightPanel', 'mainView'] as const
export type SlotName = (typeof SLOT_NAMES)[number]

/** 注册时注入给 feature 的平台服务（init 可选使用）。 */
export interface FeatureServices {
  bus: Bus
  http: typeof import('./http.ts')
  theme: {
    get: () => ThemeName
    set: (name: string) => ThemeName
  }
}

export interface FeatureManifest {
  /** 唯一 id；同时作为 slot 渲染的 key */
  id: string
  /** 挂到哪些插槽；一个 feature 可同时挂多个 slot（如顶栏 + 中栏） */
  slots: Partial<Record<SlotName, ComponentType>>
  /** 可选启动钩子：预取数据、注册快捷键等（M1 未使用） */
  init?: (services: FeatureServices) => void
}

/** 给 manifest 加类型约束的小工具（保持各 feature 写法一致）。 */
export function defineFeature(manifest: FeatureManifest): FeatureManifest {
  return manifest
}

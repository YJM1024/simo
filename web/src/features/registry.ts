// features/registry.ts —— 功能组合中心（契约 §9.2）
//
// 唯一的「功能清单」：加/删功能 = 增删一个 features/<id>/ 目录 + 这里加/删一行。
// 壳层只认识 slot，不认识具体功能；features 之间禁止互相 import。

import type { ComponentType } from 'react'
import {
  SLOT_NAMES,
  type FeatureManifest,
  type FeatureServices,
  type SlotName,
} from '../platform/manifest.ts'
import { manifest as sessionsFeature } from './sessions/manifest.ts'
import { manifest as chatFeature } from './chat/manifest.ts'
import { manifest as memoryFeature } from './memory/manifest.ts'
import { manifest as tasksFeature } from './tasks/manifest.ts'
import { manifest as schedulesFeature } from './schedules/manifest.ts'
import { manifest as agentsFeature } from './agents/manifest.ts'
import { manifest as workbenchFeature } from './workbench/manifest.ts'
import { manifest as teamFeature } from './team/manifest.ts'
import { manifest as viewsFeature } from './views/manifest.ts'

/**
 * 功能列表（顺序 = 同一 slot 内的渲染顺序）。
 * 删除功能：删掉对应目录 + 删除这一行即可。
 * 左栏：sessions 会话树（flex-1）在前，schedules/agents/workbench/memory/team 入口条（flex-none）在后。
 * 右栏：memory 入口条在前（flex-none），tasks 列表在后（flex-1）。
 */
export const FEATURES: readonly FeatureManifest[] = [
  sessionsFeature,
  schedulesFeature,
  agentsFeature,
  workbenchFeature,
  teamFeature,
  viewsFeature,
  chatFeature,
  memoryFeature,
  tasksFeature,
]

export interface SlotEntry {
  featureId: string
  Component: ComponentType
}

export function getFeatures(): readonly FeatureManifest[] {
  return FEATURES
}

/**
 * 把 features 的 slots 摊平成 slot -> [{ featureId, Component }]。
 * 同一个 slot 可以挂多个功能（M2 起右栏可能出现多个面板）。
 */
export function collectSlots(features: readonly FeatureManifest[] = FEATURES): Record<SlotName, SlotEntry[]> {
  const slots = Object.fromEntries(SLOT_NAMES.map((name) => [name, [] as SlotEntry[]])) as Record<
    SlotName,
    SlotEntry[]
  >

  for (const feature of features) {
    for (const [slot, Component] of Object.entries(feature.slots)) {
      if (!SLOT_NAMES.includes(slot as SlotName)) {
        console.warn(`[registry] feature "${feature.id}" 声明了未知 slot "${slot}"`)
        continue
      }
      if (typeof Component !== 'function') {
        console.warn(`[registry] feature "${feature.id}" 的 slot "${slot}" 不是组件`)
        continue
      }
      slots[slot as SlotName].push({ featureId: feature.id, Component })
    }
  }
  return slots
}

/** 启动钩子：M1 没有功能需要 init；接口先就位，M2 用来预取/注册快捷键等。 */
export function initFeatures(services: FeatureServices): void {
  for (const feature of FEATURES) {
    if (typeof feature.init !== 'function') continue
    try {
      feature.init(services)
    } catch (error) {
      console.error(`[registry] feature "${feature.id}" init 失败`, error)
    }
  }
}

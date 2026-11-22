import { describe, expect, it } from 'vitest'
import { winsTabSyncTiebreak } from './tabsync'

/**
 * PRD-SYNC-002 要求保留既有的收敛口径：at 大者胜；at 相等时 tabId 字典序大者胜；
 * 完全相同的帧视为重复，不再应用。
 */
describe('winsTabSyncTiebreak', () => {
  it('lets the larger at win regardless of tabId', () => {
    expect(winsTabSyncTiebreak({ at: 2, tabId: 'a' }, { at: 1, tabId: 'z' })).toBe(true)
    expect(winsTabSyncTiebreak({ at: 1, tabId: 'z' }, { at: 2, tabId: 'a' })).toBe(false)
  })

  it('breaks an equal at by the lexicographically larger tabId', () => {
    expect(winsTabSyncTiebreak({ at: 1, tabId: 'tab-b' }, { at: 1, tabId: 'tab-a' })).toBe(true)
    expect(winsTabSyncTiebreak({ at: 1, tabId: 'tab-a' }, { at: 1, tabId: 'tab-b' })).toBe(false)
  })

  it('treats an identical frame as a duplicate', () => {
    expect(winsTabSyncTiebreak({ at: 1, tabId: 'tab-a' }, { at: 1, tabId: 'tab-a' })).toBe(false)
  })
})

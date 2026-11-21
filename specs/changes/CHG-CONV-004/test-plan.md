# CHG-CONV-004 · 测试计划（本包执行细节）

状态：**partial**（后端有证据，前端同步路径全缺）
Change: CHG-CONV-004
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003
Covers: `AC-SYNC-001-01/02`、`AC-SYNC-002-01/02`、`AC-SYNC-003-01/02`

> 域级用例：TC-P1-008（SYNC-001）、TC-P1-009（SYNC-002）、TC-P1-010（SYNC-003）。

## 1. 用例 → AC → 证据

| 用例 | AC | 落点 | 层级 | 结果 |
|---|---|---|---|---|
| C4-01 WS 事件顺序 | `AC-SYNC-001-01` | `cmd/simo/server_test.go::TestWebSocketEventOrder` | API | pass |
| C4-02 `since` 补发 | `AC-SYNC-001-01` | `::TestWebSocketSinceContinuation` | API | pass |
| C4-03 双客户端 fanout | `AC-SYNC-001-01` | `m88::TestM88WebSocketFanoutTwoClients` | API | pass |
| C4-04 前端 delta 去重 | `AC-SYNC-001-01` | `App.integration.test.tsx::applies WebSocket deltas once and ignores duplicate sequence numbers` | integration | pass |
| C4-05 前端重连退避 | `AC-SYNC-001-02` | 无 | — | **missing** |
| C4-06 重连不丢不重 | `AC-SYNC-001-02` | 无 | — | **missing** |
| C4-07 停止帧后端 | `AC-SYNC-001-02` | 无 | — | **missing** |
| C4-08 多标签 active 同步 | `AC-SYNC-002-01` | 无 | E2E 双 target | **missing** |
| C4-09 多标签祖先链合并 | `AC-SYNC-002-01` | 无 | E2E 双 target | **missing** |
| C4-10 多标签未读清零 | `AC-SYNC-002-01` | 无 | E2E 双 target | **missing** |
| C4-11 同 at tiebreak / 回声抑制 | `AC-SYNC-002-02` | 无 | unit（tabsync） | **missing** |
| C4-12 chain key 去重 / 空 chain | `AC-SYNC-002-02` | 无 | unit | **missing** |
| C4-13 sendMode 持久化/快捷键 | `AC-SYNC-003-01` | `Composer.test.tsx::toggles send mode, persists it and changes keyboard behavior` | component | pass |
| C4-14 跨标签 sendMode | `AC-SYNC-003-01` | 无 | unit/E2E | **missing** |
| C4-15 storage 事件回退 | `AC-SYNC-003-02` | 无 | unit | **missing** |

## 2. 数据与 mock

- API：`newM2App` + 临时 SIMO_HOME + mock provider。
- 前端：App.integration 用假 WS（可注入 `seq`）；tabsync 可在同进程构造两个 `BroadcastChannel` 实例（Node/jsdom 支持有限，需 polyfill 或用 `worker_threads` 模拟）。
- E2E：CDP 双 target 需扩展 runner（当前仅单页 11 场景）。

## 3. 层级与接线

API 层已跑；integration 仅覆盖 delta 去重；unit 层 tabsync 无测试；E2E 无多标签。CI 未接线。

## 4. 未覆盖声明

C4-05/06/07/08/09/10/11/12/14/15 全部未执行（10 条）。不得以"后端 fanout 已测"替代"多标签 UI 同步已测"。

# CHG-CONV-003 · 测试计划（本包执行细节）

状态：**partial**（映射已建立；未重跑）
Change: CHG-CONV-003
Implements: PRD-CONV-005、PRD-CONV-006
Covers: `AC-CONV-005-01/02`、`AC-CONV-006-01/02`

> 域级用例：TC-P1-006（CONV-005）、TC-P1-007（CONV-006），见 [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)。

## 1. 用例 → AC → 证据

| 用例 | AC | 落点 | 层级 | 期望 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| C3-01 空输入/disabled/发送错误 | `AC-CONV-006-02` | `Composer.test.tsx::renders placeholder, hint, disabled state and send error` | component | 全部断言通过，无 fail 与 skip | pass | frontend/review/TEST-REPORT.md |
| C3-02 Enter 发送并清空 | `AC-CONV-006-01`、`AC-CONV-005-01` | `::sends on Enter and clears the input` | component | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-03 Shift+Enter 换行 | `AC-CONV-006-01` | `::inserts a newline with Shift+Enter and does not send` | component | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-04 IME 不发送 | `AC-CONV-006-01` | `::does not send while composing an IME input` | component（模拟） | 全部断言通过，无 fail 与 skip | pass（仅 jsdom） | missing |
| C3-05 Ctrl/Meta+Enter | `AC-CONV-006-01` | `::sends with Ctrl+Enter or Meta+Enter` | component | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-06 发送失败恢复/重试 | `AC-CONV-005-02` | `::restores text and shows a readable error when sending fails, then retries` | component | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-07 重复提交防护 | `AC-CONV-005-02` | `::shows sending state and prevents duplicate submits` | component | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-08 发送模式切换/持久化 | `AC-CONV-006-02` | `::toggles send mode, persists it and changes keyboard behavior` | component | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-09 流式中停止 | `AC-CONV-005-02` | `::shows stop while streaming and calls onStop` | component | 全部断言通过，无 fail 与 skip | pass（仅回调） | missing |
| C3-10 长文本 | `AC-CONV-006-01` | `::accepts long text without truncation` | component | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-11 后端 202 + 流式落库 | `AC-CONV-005-01` | `m2::TestM2MockStreamRecordsUsageAndDecision`、`server_test.go::TestChatPersistsAndFiltersBySession` | API | 全部断言通过，无 fail 与 skip | pass | docs/testing/BACKEND-EVIDENCE-20261120.md |
| C3-12 WS 顺序/补发/fanout | `AC-CONV-005-01` | `server_test.go::TestWebSocketEventOrder`、`::TestWebSocketSinceContinuation`、`m88::TestM88WebSocketFanoutTwoClients` | API | 全部断言通过，无 fail 与 skip | pass | docs/testing/BACKEND-EVIDENCE-20261120.md |
| C3-13 断线重连 | `AC-CONV-005-02` | 无 | — | 全部断言通过，无 fail 与 skip | **missing** | missing |
| C3-14 发送幂等 | `AC-CONV-005-02` | 无（后端无 clientMutationId） | — | 全部断言通过，无 fail 与 skip | **missing** | missing |
| C3-15 停止真实中断 | `AC-CONV-005-02` | 无（只断言回调） | — | 全部断言通过，无 fail 与 skip | **missing** | missing |
| C3-16 跨标签 sendMode | `AC-SYNC-003-01` | 无 | — | 全部断言通过，无 fail 与 skip | **missing** | missing |
| C3-17 E2E 发送主路径 | `AC-CONV-005-01` | CDP 02/05 | E2E | 全部断言通过，无 fail 与 skip | pass | missing |
| C3-18 E2E 快捷键 | `AC-CONV-006-01` | CDP 03 | E2E | 全部断言通过，无 fail 与 skip | pass | missing |

## 2. 数据与 mock

- 组件：mock `onSend`/`onStop`，jsdom 模拟 composition 事件与键盘。
- 后端：mock provider（`newM2App`），临时 SIMO_HOME，无真实 LLM 调用。

## 3. 层级与接线

component → API → E2E 三层已跑；真实浏览器 IME 与真实断网不在自动化内；CI 未接线。

## 4. 未覆盖声明

C3-13/14/15/16 未执行，不得记通过。C3-04 只是 jsdom 模拟，不等于真实输入法验证。

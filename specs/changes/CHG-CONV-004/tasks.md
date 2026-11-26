# CHG-CONV-004 · 任务卡

状态：**partial**（未派发）
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| TASK-CHG-CONV-004-01 | 重连用例 | 前端 + 测试 | `frontend/src/api.ts` 测试（mock WebSocket） | 无 | `AC-SYNC-001-02` | 用例：close → reconnecting → open（退避断言）→ 订阅带 since → 不重复渲染；`npm test` | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不启用 Playwright；不删文件 |
| TASK-CHG-CONV-004-02 | 多标签双页用例 | 测试 | `frontend/e2e/`（CDP 双 target） | 无 | `AC-SYNC-002-01` | 双标签：切会话/祖先链/未读清零 三项断言 + 报告 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不启用 Playwright；不删文件 |
| TASK-CHG-CONV-004-03 | 多标签边界用例 | 测试 | 同上 | TASK-CHG-CONV-004-01 | `AC-SYNC-002-02` | 同 at 冲突 tiebreak、chain key 去重、回声抑制各一条断言 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不启用 Playwright；不删文件 |
| TASK-CHG-CONV-004-04 | 跨标签 sendMode | 前端 + 测试 | `Composer.test.tsx`、`tabsync` | 无 | `AC-SYNC-003-01` | 两个 BroadcastChannel 实例断言模式收敛；`storage` 事件回退各一条 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不启用 Playwright；不删文件 |
| TASK-CHG-CONV-004-05 | `correct` 帧后端语义 | 后端 + 测试 | `ws.go`、`chat` | TASK-CHG-CONV-004-02 | `AC-SYNC-001-02` | 断言 correct 后不再产生 delta、消息状态 stopped | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不启用 Playwright；不删文件 |
| TASK-CHG-CONV-004-06 | 回放截断契约 | 产品 + 后端 | 产品 spec §4.4、ws 契约 | TASK-CHG-CONV-004-02 | `AC-SYNC-001-02` | 定义日志保留窗口 + 超窗兜底（全量刷新）；测试断言 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不启用 Playwright；不删文件 |

## 依赖

- 02/03 依赖可用的 CDP 双 target 基础设施（当前 runner 单页）。
- 06 需产品先定口径，否则 05 无法断言"重连不丢"。
- 04 与 TASK-CHG-CONV-003-04 为同一件事，只允许一张卡执行（去重，避免双写）。

## 回滚

均为测试/文档；按提交 revert。无数据迁移。

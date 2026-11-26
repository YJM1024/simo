# CHG-CONV-003 · 任务卡

状态：**partial**（未派发）
Implements: PRD-CONV-005、PRD-CONV-006

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| TASK-CHG-CONV-003-01 | 断线重连用例 | 测试 + 前端 | `frontend/src/api` 测试 / E2E | 无 | `AC-CONV-005-02` | 集成用例：close→退避→open→`since` 回放→不重复；断言状态变化与消息数 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-003-02 | 发送幂等口径与实现 | 产品 + 后端 | 产品 spec §4.3、`chat/module.go` | 无 | `AC-CONV-005-02` | 产品定"是否去重"；若去重则加 `clientMutationId` 表与测试；否则前端删传参 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-003-03 | COMP-composer-send-mode 状态回写 | 设计 + 验收 Agent | `specs/COMP-composer-send-mode/spec.md` | 无 | 六类产物"组件 spec" | 状态由 `spec ready` 更新为与实现一致；独立签字 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-003-04 | 跨标签发送模式测试 | 前端 + 测试 | `Composer.test.tsx` / tabsync | 无 | `AC-SYNC-003-01` | 双 BroadcastChannel 断言两标签模式一致；`npm test` | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-003-05 | 停止语义验证 | 测试 + 后端 | `backend/cmd/simo`、E2E | TASK-CHG-CONV-003-01 | `AC-CONV-005-02` | 断言 correct 帧后不再产生 delta、消息状态为 stopped | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-003-06 | 真实 IME 手测 | 测试 | 手工 | 无 | `AC-CONV-006-01` | 中文输入法 Enter 不误发；记录浏览器/输入法版本 + 截图 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |

## 依赖

- 02 决定 01/04 的断言范围（若做服务端幂等，01 需加重复发送场景）。
- 03 必须由非实现者签字（不得自签）。
- 06 依赖可用桌面浏览器环境，本轮未做。

## 回滚

01/04/05/06 为测试与手工记录；02 若改后端需单独变更包并带迁移回滚；03 为文档状态回写。

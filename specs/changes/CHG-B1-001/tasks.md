# CHG-B1-001 · 任务卡

状态：`proposed`（未派发、未开工）。本包当前只完成产品层，下面的任务卡是 B1 开工时的拆分建议，不是已派发的工单。

## 任务卡总览

| 卡 | 任务 | owner | scope | 依赖 | 推理档位 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|---|
| `B1-T1` | 任务执行组前端契约：会话内任务执行组列出、状态、进度、取消、重试 | 待指派（开工时 Lead 定） | `specs/dev/P2-TASK/frontend.md`、`frontend/src/**` | 无 | high | `AC-TASK-001-01`–`06`、`AC-TASK-002-01`–`04`、`AC-TASK-006-01`–`04` | 组件测试 + 8787 截图 | todo | 验收 Agent | 不改 `backend/`；不改产品 AC 文本；不跑 git；不删文件 |
| `B1-T2` | 任务异步消息与状态机：单任务开始/结束消息、重启恢复、状态封闭 | 待指派（开工时 Lead 定） | `specs/dev/P2-TASK/backend.md`、`backend/internal/modules/tasks/**`、`backend/internal/modules/chat/task_executor.go` | `B1-T1` 的接口形状 | high | `AC-TASK-003-01`–`05`、`AC-TASK-006-06`、`AC-CHG-B1-001-06` | 脚本 JSON + 日志行 | todo | 验收 Agent | 不改 `frontend/`；不改 `scripts/`；不跑 git；不删文件 |
| `B1-T3` | 预算与取消/重试语义：预算接真实用量、retry 守卫、取消幂等 | 待指派（开工时 Lead 定） | `backend/internal/modules/tasks/service.go`、`backend/internal/modules/chat/runtime.go` | `B1-T2` | high | `AC-TASK-006-02`–`05` | 脚本 JSON | todo | 验收 Agent | 不改产品 spec；不改表结构；不跑 git；不删文件 |
| `B1-T4` | 文件页与列表：文件页入口、会话内列表、分页与排序 | 待指派（开工时 Lead 定） | `specs/dev/P4-FILE/frontend.md`、`frontend/src/**` | `AC-CHG-B1-001-01` 的主链路证据 | high | `AC-FILE-001-01`–`06` | 组件测试 + 截图 | todo | 验收 Agent | 不做工作台内独立文件页；不改 `backend/`；不删文件 |
| `B1-T5` | 预览与下载：分类型预览、下载文件名安全 | 待指派（开工时 Lead 定） | `frontend/src/**`、`backend/internal/modules/tasks/http.go` | `B1-T4` | high | `AC-FILE-004-01`–`06`、`AC-FILE-003-03` | 脚本 JSON + 截图 | todo | 验收 Agent | 不做内嵌 PDF 查看器；不改 `scripts/`；不删文件 |
| `B1-T6` | 越界拒绝：四条负用例全部拒绝 | 待指派（开工时 Lead 定） | `backend/internal/modules/tasks/**`、`backend/internal/modules/chat/files.go` | `B1-T4` | high | `AC-FILE-005-01`–`05`、`AC-CHG-B1-001-04` | 脚本 JSON | todo | 验收 Agent | 不改产品 AC 判据；不放宽拒绝码；不删文件 |
| `B1-T7` | 工作台三态走查：loading/empty/error 三态截图 | 待指派（开工时 Lead 定） | `frontend/src/app.tsx`、`docs/evidence/**` | `B1-T4` | low | `AC-CHG-B1-001-05` | 3 张 8787 截图 | todo | 验收 Agent | 不改 AC 文本；不伪造截图；不跑 git |

## 派单约束

- 每张卡必须写清 owner / scope / AC / 证据四要素，缺一不派。
- 实现者不得自签：视觉与功能由验收 Agent 独立签字。
- 30 分钟硬超时：到点回报"已交付"或"卡在哪"，不续跑。
- 不得改本包以外的状态列与 TRACEABILITY 覆盖列。

## 裁决对任务边界的影响（2026-11-22）

- `B1-T1` 进度刷新按 `P2 Q-04` 改为订阅 WS `task.progress` 并保留 5 秒兜底轮询，卡内不再只做轮询；验收仍只看「5 秒内可见」。
- `B1-T2` 开始消息按 `P2 Q-01` 固定 `role=agent`、`category=progress` 并带 `task_id`，卡的范围不含历史 `messages` 迁移。
- `B1-T4` 文件页按 `P4 Q-04` 固定在会话右栏「文件」标签，不做工作台内的独立文件页；B1 阶段不放开，需要独立页时另开变更包。
- `B1-T5` 按 `P4 Q-02` 不做内嵌 PDF 查看器，PDF 点击后开新标签页，并始终提供下载入口；`P4 Q-01` 的空文件拒绝与 `P4 Q-03` 的 `-2`/`-3` 命名不在本包现有任务卡内，留给上传与生成相关卡。

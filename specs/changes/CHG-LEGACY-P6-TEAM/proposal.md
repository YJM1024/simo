# PROPOSAL · CHG-LEGACY-P6-TEAM

- 变更 ID：CHG-LEGACY-P6-TEAM
- 类型：历史能力归档（docs-only）
- Owner：backend
- 日期：2026-11-20
- 关联产品域：`specs/product/P6-TEAM/spec.md`
- 状态：archived / partial（不表示 P6 已完整交付）

## 1. 背景

P6 团队能力已在聊天模块中实现了一部分：`/api/team*` 只读视图、内部团队消息、模板/角色、触发器、子会话成员和 owner 设置，并有 M23/M24/M25/M31 集成测试。但产品 spec 中的只读团队投影、会话创建、并行子 agent 与团队看板仍没有完整能力，现有测试计划也没有可执行证据。

## 2. 目标

1. 固化 P6 已有后端接口、表结构、内部消息隔离机制、模板/触发器行为及测试证据。
2. 明确 TEAM-004、TEAM-006 仍未实现，避免把“内部实现存在”误判为“产品能力完成”。
3. 给出 owner/scope/AC/证据，供验收 Agent 独立判断。

成功标准：每个 PRD 都有“已实现/部分/未实现”的结论，并指向真实测试或明确 `missing`。

## 3. 范围

### In scope

- `backend/internal/modules/chat/team.go`、`actions.go`、`migrations.go` 中 team 相关实现。
- `backend/cmd/simo/m23_test.go`、`m24_test.go`、`m25_test.go`、`m31_test.go`；`backend/internal/core/eventlog` 团队事件测试。
- 2026-11-20 全量测试执行结果。

### Out of scope

- 不新增团队创建/管理 HTTP API，不实现团队看板或并行子 agent 调度。
- 不修改前端；P6 没有团队 UI。
- 不修改产品 spec/TRACE/TREE/验收记录。
- 不写正式数据、不启动 8787。

## 4. 影响面

| 层 | 影响 |
|---|---|
| 前端 | 无（N/A） |
| 后端 API | 仅归档既有 `/api/sessions/{id}/team`、`/api/teams/{id}*` 和内部 action |
| 数据 | 归档 chat 迁移 v13（team v1）与 v14（template/role） |
| 测试 | 引用既有 M23/M24/M25/M31 和 eventlog 测试 |
| 文档 | 新增本包 7 个文件 |

## 5. 方案比较

| 方案 | 结论 |
|---|---|
| A. 把“有 `/api/team` 视图”当作 TEAM-004 完成 | 拒绝：产品要求只读投影 + 会话创建，当前缺完整产品路径/验收 |
| B. 只列代码不列测试 | 拒绝：无法证明内部消息隔离和触发器幂等 |
| C. 按 PRD 归档真实能力 + 缺口（采用） | 与现状一致，可供后续实现拆任务 |

## 6. 风险、依赖与假设

- 风险：团队内部消息不进入主窗口是安全/体验关键，当前只有 `TestM24TeamV1InternalRouting` 一条主路径测试，缺少多成员、失败投递、越权读取矩阵。
- 风险：触发器通过 action 调用，未暴露普通用户入口；不能当作用户可用功能。
- 依赖：会话/任务/事件日志模块；mock LLM 测试环境。
- 假设：P6 没有独立前端页面；用户入口由会话/任务间接承载。
- 待确认：TEAM-004 的“会话创建”是否要求独立 API；TEAM-006 的团队看板是否仍为 P2。

## 7. 决策请求

请产品/验收 owner 确认：

1. P6 继续记为 partial；TEAM-004/TEAM-006 保持 unimplemented。
2. 接受内部 action（`team.create` 等）不算用户可用入口。
3. 后续实现型变更另开 CHG，不在本包扩 scope。

## 8. 链接

- [spec.md](spec.md) · [backend.md](backend.md) · [frontend.md](frontend.md) · [tasks.md](tasks.md) · [test-plan.md](test-plan.md) · [evidence.md](evidence.md)
- 产品 spec：[`specs/product/P6-TEAM/spec.md`](../../product/P6-TEAM/spec.md)

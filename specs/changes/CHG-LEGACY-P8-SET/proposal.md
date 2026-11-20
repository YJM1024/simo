# PROPOSAL · CHG-LEGACY-P8-SET

- 变更 ID：CHG-LEGACY-P8-SET
- 类型：历史能力归档（docs-only）
- Owner：backend
- 日期：2026-11-20
- 关联产品域：`specs/product/P8-SET/spec.md`
- 状态：archived / partial（不表示 P8 已完整交付）

## 1. 背景

P8 的设置/系统能力分散在启动配置（`platform/config`）、权限策略（`platform/permission`）、会话权限 API（`chat/permissions.go`）、健康检查（`platform/httpserver`）、数据目录/旧数据迁移和审计事件中。没有统一的 `/api/settings`，也没有设置页面；产品 SET-003/SET-005/SET-006 明确未实现。当前测试计划仍是全 `missing` 骨架，需要把真实能力与缺口归档。

## 2. 目标

1. 归档 P8 真实存在的配置、权限、健康/运行时、数据目录/迁移、审计能力。
2. 明确“启动配置”不等于“用户设置页”，无 UI 的 AC 不得判通过。
3. 把 SET-003/005/006 和缺失的备份/恢复/通知/安装测试记为 `missing/unimplemented`。

成功标准：12 个 PRD 都有状态、测试或明确缺口；不把配置文件能力写成产品设置功能完成。

## 3. 范围

### In scope

- `backend/internal/platform/config/**`（配置加载、目录、旧数据迁移）。
- `backend/internal/platform/httpserver/**`（健康检查、错误封装、请求限制）。
- `backend/internal/modules/chat/permissions.go`、`backend/internal/platform/permission/**`。
- `backend/internal/platform/sqlite/**`、`backend/internal/core/eventlog/**`。
- 测试：config（共 9 个）：`TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory`；migrate（共 3 个）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`；httpserver（共 3 个）：`TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`；sqlite（共 3 个）：`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart`；permission（共 3 个）：`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`；workspace-migrate（共 3 个）：`TestMigrationToolPlanApplyVerifyRollback`、`TestMigrationVerifyDetectsHashMismatch`、`TestMigrationRejectsUnsafePath`；`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`；`TestM7HealthReadiness`、`TestM7LargeRequestBodyRejectedWithCode`、`TestM7UniformErrorEnvelope`；`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`。
- 2026-11-20 全量测试结果。

### Out of scope

- 不实现设置页、主题/语言、快捷键、关于页、能力管理、MCP/CLI/Skills 管理。
- 不新增备份/恢复/安装器 API。
- 不修改前端/产品 spec/TREE/TRACE/验收记录。
- 不写正式数据，不启动 8787。

## 4. 影响面

| 层 | 影响 |
|---|---|
| 前端 | 无（N/A） |
| 后端 API | 归档 `/api/health`、`/api/runtime/status`、`/api/permissions`；确认无 `/api/settings` |
| 数据 | 归档 `SIMO_HOME` 目录、旧数据 copy-forward、SQLite 锁/版本检查 |
| 测试 | 引用既有 config/httpserver/sqlite/permission/m5/m7/m9 测试 |
| 文档 | 新增本包 7 个文件 |

## 5. 方案比较

| 方案 | 结论 |
|---|---|
| A. 以“有 config.go + 权限 API”判定 P8 完成 | 拒绝：无设置页，SET-003/005/006 未实现，备份/恢复/安装未验收 |
| B. 只列配置项 | 不足：无法证明权限 fail-closed 与健康/错误契约 |
| C. 按 SET/SYS PRD 归档真实能力 + 缺口（采用） | 边界清楚，可供验收与后续实现 |

## 6. 风险、依赖与假设

- 风险：权限设置为内存态，重启丢失；用户可能误以为已持久化。
- 风险：默认仅监听 `127.0.0.1`，但没有身份认证/多用户隔离；SYS-001 只是本机单用户假设，不是安全认证。
- 风险：旧数据迁移只复制不删除；没有回滚/恢复演练。
- 风险：审计事件存在但没有查询/保留/导出 API。
- 依赖：SQLite、文件系统、会话模块、approval 流程。
- 假设：P8 没有设置 UI；用户通过配置文件/环境变量/API 操作。
- 待确认：SET-006 能力管理与 SET-003/005 的优先级；备份/恢复是否属于 P8 或独立运维域。

## 7. 决策请求

请产品/验收 owner 确认：

1. P8 保持 partial；SET-003/005/006 记为 unimplemented。
2. 接受“无设置页、无统一 `/api/settings`”现状，不把 config 能力当作用户设置完成。
3. 备份/恢复、安装/升级、审计查询另开实现型 CHG。

## 8. 链接

- [spec.md](spec.md) · [backend.md](backend.md) · [frontend.md](frontend.md) · [tasks.md](tasks.md) · [test-plan.md](test-plan.md) · [evidence.md](evidence.md)
- 产品 spec：[`specs/product/P8-SET/spec.md`](../../product/P8-SET/spec.md)

# TASKS · CHG-LEGACY-P8-SET

本包为 docs-only 历史归档，不包含新的设置/系统功能实现。

## T1 配置/目录盘点

- Owner：backend
- Scope：只读 `platform/config/**`
- AC：记录优先级、默认值、环境变量、`SIMO_HOME` 目录和旧数据迁移；明确无设置 API/UI。
- Evidence：`backend.md` 第 3–4 节；config（共 9 个）：`TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory`；migrate（共 3 个）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`。
- 状态：done

## T2 权限/审批/沙箱核验

- Owner：backend
- Scope：`chat/permissions.go`、`platform/permission/**`、`m5/m9` 测试
- AC：记录默认值、full access 确认、fail-closed 六步、内存态限制；不把 action 当用户设置页。
- Evidence：`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。
- 状态：done

## T3 健康/错误/数据安全核验

- Owner：backend
- Scope：`httpserver`、`sqlite`、`config/migrate`
- AC：健康 200/503、错误 envelope、SQLite 锁/版本、旧数据 copy-forward 均有测试或缺口。
- Evidence：httpserver（共 3 个）：`TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`；sqlite（共 3 个）：`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart`；migrate（共 3 个）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`；`TestM7HealthReadiness`、`TestM7LargeRequestBodyRejectedWithCode`、`TestM7UniformErrorEnvelope`。
- 状态：done

## T4 SET-003/005/006 与备份/安装缺口登记

- Owner：backend
- Scope：`spec.md`、`evidence.md`
- AC：明确无实现、无测试；不得写成 covered。
- Evidence：`spec.md` R3/R5/R6/R10/R12。
- 状态：done

## T5 全量测试与证据

- Owner：backend
- Scope：`backend/` 全量 `go test ./... -count=1 -json`，环境变量指向 `../.tmp`
- AC：包数/测试数/失败/耗时完整；失败不得 PASS。
- Evidence：`docs/testing/BACKEND-EVIDENCE-20261120.md`。
- 状态：done（26 包 / 223 / 0 fail / 283.33s）

## T6 验收交接

- Owner：backend → 验收 Agent
- Scope：本包文档与证据
- AC：独立复核状态与测试名；实现者不自签。
- Evidence：交接消息 + 文件清单。
- 状态：pending

## 任务表

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| T1 | 配置/目录盘点 | backend | 只读 `platform/config/**` | 无 | 记录优先级、默认值、环境变量、`SIMO_HOME` 目录和旧数据迁移；明确无设置 API/UI。 | `backend.md` 第 3–4 节；config（共 9 个）：`TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory`；migrate（共 3 个）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T2 | 权限/审批/沙箱核验 | backend | `chat/permissions.go`、`platform/permission/**`、`m5/m9` 测试 | 无 | 记录默认值、full access 确认、fail-closed 六步、内存态限制；不把 action 当用户设置页。 | `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T3 | 健康/错误/数据安全核验 | backend | `httpserver`、`sqlite`、`config/migrate` | 无 | 健康 200/503、错误 envelope、SQLite 锁/版本、旧数据 copy-forward 均有测试或缺口。 | httpserver（共 3 个）：`TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`；sqlite（共 3 个）：`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart`；migrate（共 3 个）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`；`TestM7HealthReadiness`、`TestM7LargeRequestBodyRejectedWithCode`、`TestM7UniformErrorEnvelope`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T4 | SET-003/005/006 与备份/安装缺口登记 | backend | `spec.md`、`evidence.md` | 无 | 明确无实现、无测试；不得写成 covered。 | `spec.md` R3/R5/R6/R10/R12。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T5 | 全量测试与证据 | backend | `backend/` 全量 `go test ./... -count=1 -json`，环境变量指向 `../.tmp` | 无 | 包数/测试数/失败/耗时完整；失败不得 PASS。 | `docs/testing/BACKEND-EVIDENCE-20261120.md`。 | done（26 包 / 223 / 0 fail / 283.33s） | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T6 | 验收交接 | backend → 验收 Agent | 本包文档与证据 | 无 | 独立复核状态与测试名；实现者不自签。 | 交接消息 + 文件清单。 | pending | 验收 Agent | 不改实现、不删文件、不编造证据 |

> 本表由既有 T1–T6 任务卡转录，字段与卡片正文一致；原卡片保留在上文，供逐条核对。

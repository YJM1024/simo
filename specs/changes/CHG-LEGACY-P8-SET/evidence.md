# EVIDENCE · CHG-LEGACY-P8-SET

- 日期：2026-11-20
- 执行者：backend（kernel-builder）
- 结论：**PASS WITH NOTES**（相关平台与集成测试通过；SET-003/005/006、备份/恢复/安装未实现，P8 仍为 partial）
- 变更性质：docs-only；未改代码/数据，未启动 8787

## 1. 执行命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

结果：exit 0；DURATION_SEC=283.33；日志 `backend/../.tmp/backend-fulltest-20261120.jsonl`。

## 2. 全量计数

| 指标 | 值 |
|---|---|
| packages | 26 |
| 有测试且通过 | 16 |
| 无测试文件 | 10 |
| run/pass | 223 |
| fail | 0 |
| skip | 0 |

## 3. P8 相关测试（全部 PASS）

- config（共 9 个，精确名如下）：`TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory`。
- migrate（共 3 个，精确名如下）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`。
- httpserver（共 3 个，精确名如下）：`TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`。
- sqlite（共 3 个，精确名如下）：`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart`。
- permission（共 3 个，精确名如下）：`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。
- eventlog（共 4 个，精确名如下）：`TestAppendReplayAndSubscribe`、`TestUnknownTypeRejected`、`TestReplayPayloadValidJSON`、`TestTeamInternalEventTypesRegistered`。
- `cmd/simo`：`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestM7HealthReadiness`、`TestM7LargeRequestBodyRejectedWithCode`、`TestM7UniformErrorEnvelope`、`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestHealthAndSessions`、`TestAPINotFoundIsJSON`。
- workspace-migrate（共 3 个，精确名如下）：`TestMigrationToolPlanApplyVerifyRollback`、`TestMigrationVerifyDetectsHashMismatch`、`TestMigrationRejectsUnsafePath`（workspace 数据迁移，非数据库备份）。

## 4. 覆盖结论

| PRD | 测试 | 产品状态 | 备注 |
|---|---|---|---|
| SET-001 | config（精确名见 §3） | partial | 启动配置有；无运行时设置 API/UI |
| SET-002 | permission/M9（精确名见 §3） | partial | 权限 API/策略有；内存态、无设置页 |
| SET-003 | 无 | unimplemented | 无外观/语言 |
| SET-004 | config/migrate/sqlite（精确名见 §3） | partial | 目录/copy-forward 有；无备份/恢复 |
| SET-005 | 无 | unimplemented | 无快捷键/关于/版本 |
| SET-006 | 无 | unimplemented | 无能力管理 |
| SYS-001 | 无认证测试 | partial | 默认 loopback，无登录/多用户 |
| SYS-002 | permission/M9（精确名见 §3） | partial | fail-closed 有；无完整越权矩阵 |
| SYS-003 | httpserver/M7/server（精确名见 §3） | implemented（域内） | 健康/错误契约可验证 |
| SYS-004 | migrate/sqlite/workspace-migrate（精确名见 §3） | partial | 迁移/锁有；无正式备份/恢复/回滚 |
| SYS-005 | eventlog（精确名见 §3）+ 行为测试 | partial | 审计写入有；无查询/保留/导出 |
| SYS-006 | config 路径测试 | partial | 无安装/升级/便携包验收 |

## 5. 未验证项 / 限制

1. 无设置 UI，无法做用户验收。
2. 无认证/多用户/远程访问安全测试，不能把 loopback 当完整认证。
3. 权限设置不持久化，重启丢失；文档已注明。
4. 无备份/恢复/回滚演练，无审计查询/保留/导出。
5. 无安装器/升级/便携包、端口冲突、目录权限不足测试。
6. 全量通过仅代表既有测试通过，不代表 P8 全部 AC 完成。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-P8-01-01 | AC-P8-01 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P8-08-01 | AC-P8-08 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P8-02-01 | AC-P8-02 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P8-03-01 | AC-P8-03 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P8-04-01 | AC-P8-04 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P8-05-01 | AC-P8-05 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P8-06-01 | AC-P8-06 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P8-07-01 | AC-P8-07 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

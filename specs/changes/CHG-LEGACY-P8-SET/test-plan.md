# TEST PLAN · CHG-LEGACY-P8-SET

Covers: AC-P8-01…AC-P8-08（共 8 条，逐条见下表）

## 1. 范围与策略

- 验证 P8 后端：配置优先级/默认/校验、权限 fail-closed、权限 API、健康/错误、SQLite 锁/版本、旧数据迁移、workspace 迁移工具。
- 层级：平台单测（config/httpserver/permission/sqlite/workspace-migrate）+ `cmd/simo` 进程内集成（m5/m7/m9）。
- 外部依赖：无；不访问真实 LLM，不需要 API key。
- 隔离：临时 `SIMO_HOME`/SQLite/目录；不接触 8787/正式数据。
- 不测试：设置页、主题/语言、快捷键/关于、能力管理、备份/恢复/安装器（未实现）。

## 2. 环境与命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

2026-11-20：exit 0；26 包中 16 个测试包通过、10 个无测试文件；223 run/pass，0 fail；283.33s。

## 3. AC → 测试矩阵

| AC | 用例 | 测试 | 层级 | 实际 | 期望 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-P8-01 配置优先级/默认/校验 | `TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory` | `TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory` | 单测 | PASS | 优先级、real 缺 key 失败、mock 可用、非法地址/目录失败 | missing |
| AC-P8-02 权限 API 默认/确认 | `TestM9PermissionsDefaultAndFullConfirmation` | `TestM9PermissionsDefaultAndFullConfirmation` | 集成 | PASS | 默认 workspace-write/auto；full 需 confirm | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P8-03 fail-closed | `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` | `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` | 单测 | PASS | deny/ask/默认拒绝 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P8-04 健康/错误 | `TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`、`TestM7HealthReadiness`、`TestM7UniformErrorEnvelope`、`TestHealthAndSessions`、`TestAPINotFoundIsJSON` | `TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`、`TestM7HealthReadiness`、`TestM7UniformErrorEnvelope`、`TestHealthAndSessions`、`TestAPINotFoundIsJSON` | 单测+集成 | PASS | 200/503、code | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P8-05 旧数据迁移 | `TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting` | `TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting` | 单测 | PASS | 复制 WAL、不覆盖、不删旧 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P8-06 SQLite 锁/版本 | `TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart` | `TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart` | 单测 | PASS | stale lock、future schema、单写重启 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P8-07 SET-003/005/006/备份/安装 | 无 | 无 | — | MISSING/unimplemented | 不可判定 | missing |
| AC-P8-08 设置 UI | 无 | 无 | — | N/A | 不可判定 | missing |

## 4. 关键边界已有/缺失

已有：

- config flag/env/file 优先级与无效值。
- permission deny/ask/no-match。
- health 503、body 上限、错误 envelope。
- SQLite future schema 拒绝、stale lock。
- 旧 DB 有 WAL/SHM、目标已存在时不覆盖。

缺失：

- 设置 API/持久化、主题/语言、快捷键、关于/版本。
- 认证/多用户/远程访问/CSRF。
- 备份/恢复/回滚、在线一致性、保留策略。
- 审计查询/导出/保留、日志轮转。
- 安装/升级/便携包、端口冲突/权限不足。
- 权限 API 并发、非法字段组合、跨 session 隔离。

## 5. 未覆盖/不适用

- 无前端，所有 UI/视觉/交互 N/A。
- 无真实 LLM/API key 场景；只验证配置校验。
- 无性能/长稳/故障注入。

## 6. 退出标准

- 全量测试 exit 0 且 0 fail；
- 12 个 PRD 有状态与证据/缺口；
- 不把 config/权限 API 写成设置页完成；
- 不虚构认证/备份/安装测试。

## 7. 证据

- [`evidence.md`](evidence.md)
- [`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- 原始日志：`backend/../.tmp/backend-fulltest-20261120.jsonl`

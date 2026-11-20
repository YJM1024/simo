# BACKEND · CHG-LEGACY-P8-SET

- Scope：`platform/config`、`platform/httpserver`、`platform/permission`、`platform/sqlite`、`chat/permissions.go`、`core/eventlog`
- 状态：历史归档，无新增实现

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/platform/config/config.go` | 配置优先级、默认值、模型/地址/目录校验 |
| `backend/internal/platform/config/migrate.go` | 旧 home/DB copy-forward，不删除旧数据 |
| `backend/internal/platform/httpserver/server.go` | `/api/health`、body 上限、超时、错误 envelope、SPA fallback |
| `backend/internal/modules/chat/permissions.go` | `GET/POST /api/permissions`，session 内存态 |
| `backend/internal/platform/permission/permission.go` | 六步权限策略，fail-closed |
| `backend/internal/platform/sqlite/sqlite.go` | 单写锁、stale lock、schema 版本检查 |
| `backend/internal/core/eventlog` | 审计/事件写入与类型注册 |
| `backend/internal/modules/chat/runtime.go` | 启动恢复、approval 过期审计 |

## 2. API（实际注册）

| 方法/路径 | 行为 | 测试 |
|---|---|---|
| `GET /api/health` | 200 ready，503 未 ready；`{ok,ready,time,...}` | `TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestM7HealthReadiness` |
| `GET /api/runtime/status` | 运行时总览 | 无专用断言（间接） |
| `GET /api/permissions` | 当前 session 权限设置 | `TestM9PermissionsDefaultAndFullConfirmation` |
| `POST /api/permissions` | 修改 sandbox/approval；full access 需 confirm | 同上 |
| `/api/*` 未注册 | JSON 404 error envelope | `TestUnifiedErrorEnvelopeHasCode`、`TestAPINotFoundIsJSON` |

**不存在**：`/api/settings`、`/api/backup`、`/api/restore`、`/api/audit`、`/api/appearance`、`/api/shortcuts`、`/api/capabilities`。

## 3. 配置

优先级：命令行 flag > 环境变量 > 配置文件（`SIMO_CONFIG`、`SIMO_HOME/config.local.json`、cwd、exe dir）> 默认值。

默认：addr `127.0.0.1:8787`，model mode `real`，provider `deepseek`，baseURL `https://api.deepseek.com`，LLM model `deepseek-flash`，max output 1024，reasoning high；`SIMO_HOME` 默认 `%USERPROFILE%/.simo`。

环境变量：`SIMO_ADDR`、`SIMO_MODEL`、`SIMO_LLM_MODEL`、`SIMO_LLM`、`SIMO_DEBUG`、`SIMO_PROVIDER`、`SIMO_BASE_URL`、`SIMO_API_KEY`/`DEEPSEEK_API_KEY`、`SIMO_MAX_OUTPUT_TOKENS`、`SIMO_CHROME`、`SIMO_PYTHON`、`SIMO_SCRIPTS`、`SIMO_REASONING_DEFAULT`、`SIMO_MODULES`、`SIMO_DISABLE_MODULES`。

`real` 模式必须有 API key；`mock` 可用且不需要 key；非法 model/addr/不可写 home 启动失败。

## 4. 数据目录与迁移

启动准备：`SIMO_HOME/simo.db`、`artifacts/`、`workspace/`、`logs/`、`tmp/`。

旧数据迁移：

- 旧 home 不存在新 home 时，copyTree 到新 home；旧目录保留。
- 旧 DB 名为历史常量（`migrate.go` 中 `legacyDBName`），仅当目标 `simo.db` 不存在时复制；WAL/SHM 一并复制；不覆盖新库。
- 没有正式备份、恢复、回滚命令；`tools/workspace-migrate` 是 workspace 数据迁移工具，不等同于 DB 备份。
- SQLite：单写锁；stale lock 可回收；未来 schema version 拒绝；重启可继续。

## 5. 权限策略（fail-closed）

`platform/permission` 六步：

1. hooks；
2. deny 规则（`delete_*`、`rm_*`、`shell*`、`exec*` 等）；
3. ask 规则（`write_file`、`write_*`、`edit_*`、`patch_*`）；
4. mode（`plan/read-only` 仅读；bypass 仍受 deny）；
5. allow 规则（`read_file`、`list_dir`、`search_text`）；
6. `canUseTool` 回调。

无匹配且无回调 = 拒绝；auto-approved 跳过 `canUseTool`；`never` 审批模式拒绝。会话权限 API 默认 sandbox `workspace-write`、approval `auto`；切换 `danger-full-access` 需要 `confirm`/`ack`；非法值 400；变更写审计事件 `permission.changed`，但设置不持久化。

## 6. 审计与日志

- `auditEvent` 写入 eventlog：`permission.changed`、`approval.resolved`、`approval.expired`、`tool.call`、`action.executed`、`card.action` 等。
- eventlog 支持 append/replay/subscribe 和类型注册。
- 没有审计查询/保留/导出/脱敏 API；日志目录存在，但没有集中日志管理。

## 7. 测试映射

| 测试 | 文件 | 覆盖 |
|---|---|---|
| config（共 9 个，精确名如下）：`TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory` | `backend/internal/platform/config/config_test.go` | 配置/默认/校验 |
| migrate（共 3 个，精确名如下）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting` | `backend/internal/platform/config/migrate_test.go` | 旧数据 copy-forward |
| httpserver（共 3 个，精确名如下）：`TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode` | `backend/internal/platform/httpserver/server_test.go` | 健康/错误 |
| sqlite（共 3 个，精确名如下）：`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart` | `backend/internal/platform/sqlite/sqlite_test.go` | 锁/版本 |
| permission（共 3 个，精确名如下）：`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` | `backend/internal/platform/permission/permission_test.go` | fail-closed |
| `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill` | `backend/cmd/simo/m9_test.go` | 权限 API/审批/沙箱 |
| `TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes` | `backend/cmd/simo/m5_test.go` | ask 审批写入 |
| `TestM7HealthReadiness`、`TestM7LargeRequestBodyRejectedWithCode`、`TestM7UniformErrorEnvelope` | `backend/cmd/simo/m7_test.go` | 健康/请求限制/错误 |
| `TestHealthAndSessions`、`TestAPINotFoundIsJSON` | `backend/cmd/simo/server_test.go` | 健康/404 |
| workspace-migrate（共 3 个，精确名如下）：`TestMigrationToolPlanApplyVerifyRollback`、`TestMigrationVerifyDetectsHashMismatch`、`TestMigrationRejectsUnsafePath` | `backend/tools/workspace-migrate/main_test.go` | workspace 迁移，非 DB 备份 |

## 8. 未验证 / 风险

- 无设置 UI、无统一设置 API；SET-003/005/006 未实现。
- 权限设置内存态，重启丢失。
- 无认证/多用户/CSRF/远程访问测试；仅默认 loopback。
- 无备份/恢复/回滚演练；旧数据迁移只覆盖 happy path。
- 无审计查询/保留/导出测试；无日志轮转。
- 无安装/升级/便携包测试。

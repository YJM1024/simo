# SPEC · CHG-LEGACY-P8-SET

Covers: AC-P8-01、AC-P8-02、AC-P8-03、AC-P8-04、AC-P8-05、AC-P8-06、AC-P8-07、AC-P8-08（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-SET-001, PRD-SET-002, PRD-SET-003, PRD-SET-004, PRD-SET-005, PRD-SET-006, PRD-SYS-001, PRD-SYS-002, PRD-SYS-003, PRD-SYS-004, PRD-SYS-005, PRD-SYS-006

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：backend
- 日期：2026-11-20
- 产品依据：`specs/product/P8-SET/spec.md`
Change：CHG-LEGACY-P8-SET
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

归档 P8 设置/系统域的真实后端能力：启动配置、权限策略、健康/运行时、数据目录迁移、审计；明确无统一设置页和缺失产品能力。

## 2. 需求与状态

| ID | 需求 | 后端事实 | 状态 | 主要证据 |
|---|---|---|---|---|
| R1 | SET-001 模型/provider | 启动时通过 flag/env/config 文件选择 provider/model/baseURL/API key；无运行时设置 API/UI | partial | config（共 9 个，精确名如下）：`TestParseFromSimoHome`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestConfigFileEnvFlagPrecedence`、`TestInvalidModelRejected`、`TestLLMEnvForcesMockAndDebug`、`TestRealModeRequiresAPIKey`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory` |
| R2 | SET-002 权限/sandbox/approval | `GET/POST /api/permissions`；默认 workspace-write+auto；full access 需 confirm；session 内存态 | partial | `TestM9PermissionsDefaultAndFullConfirmation`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` |
| R3 | SET-003 外观/主题/语言 | 无设置页、无语言/主题持久化；仅 action `ui.theme.set` 的调试入口 | unimplemented | 无专用测试 |
| R4 | SET-004 数据目录/备份/恢复 | `SIMO_HOME` + simo.db/artifacts/workspace/logs/tmp；旧数据 copy-forward；无备份/恢复 API/UI | partial | migrate（共 3 个）：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`；sqlite（共 3 个）：`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart`；workspace-migrate（共 3 个）：`TestMigrationToolPlanApplyVerifyRollback`、`TestMigrationVerifyDetectsHashMismatch`、`TestMigrationRejectsUnsafePath` |
| R5 | SET-005 快捷键/关于/版本 | 无实现 | unimplemented | 无测试 |
| R6 | SET-006 能力管理（MCP/CLI/Skills） | 无实现；无 MCP/Skills 代码、无能力目录 | unimplemented | 无测试 |
| R7 | SYS-001 本地单用户/认证边界 | 默认只绑 `127.0.0.1:8787`，无登录/多用户/鉴权 | partial | config 默认地址测试；无认证测试 |
| R8 | SYS-002 权限 fail-closed | 六步策略：deny → ask → mode → allow → callback；无匹配/无回调即拒 | partial | `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`；`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill` |
| R9 | SYS-003 健康/运行时 | `GET /api/health` 200/503、`{ok,ready,time,...}`；`GET /api/runtime/status` | implemented（本域内） | `TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`；`TestM7HealthReadiness`、`TestM7LargeRequestBodyRejectedWithCode`、`TestM7UniformErrorEnvelope`；`TestHealthAndSessions` |
| R10 | SYS-004 备份/迁移/回滚 | 旧 home/旧 DB copy-forward（不删旧数据）；SQLite 单写/锁/future schema 拒绝；无正式备份/恢复/回滚命令 | partial | `TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`；`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart`；`TestMigrationToolPlanApplyVerifyRollback`、`TestMigrationVerifyDetectsHashMismatch`、`TestMigrationRejectsUnsafePath` |
| R11 | SYS-005 日志/审计 | 事件日志记录 `permission.changed`、`approval.resolved/expired`、`tool.call` 等；无查询/保留/导出 API | partial | `TestAppendReplayAndSubscribe`、`TestUnknownTypeRejected`、`TestReplayPayloadValidJSON`、`TestTeamInternalEventTypesRegistered`；`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill` |
| R12 | SYS-006 安装/升级/便携 | 配置可执行路径/`SIMO_HOME`，无安装器/升级/迁移编排 | partial | config 路径测试；无安装测试 |

## 3. 验收标准（本包）

- **AC-P8-01**：config 优先级 flag > env > config 文件 > 默认；`real` 默认缺 key 明确失败；mock 可用；地址非法/目录不可写报错。证据：`TestConfigFileEnvFlagPrecedence`、`TestRealIsDefaultAndMissingKeyFailsClearly`、`TestExplicitMockStillWorks`、`TestInvalidAddrRejectedWithClearMessage`、`TestSimoHomeMustBeWritableDirectory`。
- **AC-P8-02**：`/api/permissions` 默认 workspace-write+auto；full access 无 confirm 400、有 confirm 200；read-only+never 200。证据：`TestM9PermissionsDefaultAndFullConfirmation`。
- **AC-P8-03**：权限策略无匹配/无回调拒绝；hook deny/ask 生效；auto-approved 不走 canUseTool。证据：`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。
- **AC-P8-04**：`/api/health` 正常 200，未 ready 503；错误 envelope 有 code。证据：`TestHealthReadinessPayload`、`TestHealthNotReadyReturns503`、`TestUnifiedErrorEnvelopeHasCode`、`TestM7HealthReadiness`、`TestM7UniformErrorEnvelope`。
- **AC-P8-05**：旧 home/旧 DB 迁移只复制、不覆盖新库、WAL/SHM 带过去。证据：`TestMigrateLegacyDBKeepsOldAndCopiesWAL`、`TestMigrateLegacyDBDoesNotOverwriteNewDB`、`TestMigrateLegacyHomeCopiesWithoutDeleting`。
- **AC-P8-06**：SQLite stale lock 可回收、future schema 拒绝、单写锁重启可用。证据：`TestStaleLockReclaimed`、`TestFutureSchemaVersionRejected`、`TestSingleWriterLockAndRestart`。
- **AC-P8-07**：SET-003/005/006、备份/恢复/安装/审计查询无实现，记 `unimplemented/missing`；不得判 PASS。
- **AC-P8-08**：无设置 UI，所有用户可见设置 AC 不判定通过。

## 4. 状态、错误与边界

- 配置模型：flag > env > `config.local.json`（`SIMO_HOME`/cwd/exe dir/`SIMO_CONFIG`）> 默认。
- 默认 `addr=127.0.0.1:8787`、`model=real`、provider `deepseek`、baseURL `https://api.deepseek.com`、`deepseek-flash`、max output 1024、reasoning high。
- `real` 模式必须 API key（`DEEPSEEK_API_KEY`/`SIMO_API_KEY`），否则启动失败；`mock` 不需要。
- `SIMO_HOME` 默认 `%USERPROFILE%/.simo`；启动准备 `simo.db/artifacts/workspace/logs/tmp`，不可写则失败。
- 旧 home/DB 迁移：若新 home/DB 已存在则跳过；复制不删除；旧 DB WAL/SHM 一并复制。
- `/api/permissions` 为内存态，重启回到默认；不是持久化设置。
- 无 `/api/settings`；无主题/语言/快捷键/关于/能力管理。
- 健康检查只表示进程/依赖 ready，不表示业务数据完整。
- 审计事件只写 eventlog，没有 HTTP 查询/保留策略。

## 5. 接口与数据（归档）

路由：`GET /api/health`、`GET /api/runtime/status`、`GET/POST /api/permissions`。不存在 `/api/settings`、`/api/backup`、`/api/audit`。

关键数据/目录：`SIMO_HOME`、`simo.db`（SQLite，`schema_migrations`）、`artifacts/`、`workspace/`、`logs/`、`tmp/`。迁移表由各模块 `schema_migrations(module,version)` 管理。

## 6. 待确认

- SET-003/005/006 是否仍在 P8 范围，还是移出到前端/能力域？
- 备份/恢复是否要求在线一致性、增量、保留策略和回滚演练？
- 本地单用户是否接受“无认证、仅 loopback”作为安全边界？
- 审计是否需要查询 API、保留期、导出和脱敏？

## 7. 链接

- [proposal.md](proposal.md) · [backend.md](backend.md) · [frontend.md](frontend.md) · [tasks.md](tasks.md) · [test-plan.md](test-plan.md) · [evidence.md](evidence.md)
- 全量证据：[`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)

## 非目标

本包是历史归档，只登记既有事实：不新增能力、不改实现与数据、不把未验证项写成已完成；未覆盖的断言保持 `missing`，后续承接见对应的 `CHG-CONV-*` 收口包。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-20：建立本包并首次登记状态。
- 2026-11-20：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

已归档：本包是历史归档包，不再接受变更；产品能力仍按域 spec 的 `covered/partial/gap` 统计，归档不表示完成。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。

## 8. 功能点覆盖

覆盖范围：`PRD-SET-001`、`PRD-SET-002`、`PRD-SET-003`、`PRD-SET-004`、`PRD-SET-005`、`PRD-SET-006`、`PRD-SYS-001`、`PRD-SYS-002`、`PRD-SYS-003`、`PRD-SYS-004`、`PRD-SYS-005`、`PRD-SYS-006`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-SET-001` | partial | `AC-SET-001-01` | 设置页与偏好读写已有，默认值、范围与持久化 AC 未全过 |
| `PRD-SET-002` | partial | `AC-SET-002-01` | 模型与供应商配置已有，密钥、校验与回退 AC 未验收 |
| `PRD-SET-003` | out | — | 未实现：没有通知渠道配置、测试发送与开关 |
| `PRD-SET-004` | partial | `AC-SET-004-01` | 外观与语言设置已有，主题变量与实时生效 AC 未全过 |
| `PRD-SET-005` | out | — | 未实现：没有快捷键配置与冲突检测 |
| `PRD-SET-006` | out | — | 未实现：没有数据导入导出与重置入口 |
| `PRD-SYS-001` | partial | `AC-SYS-001-01` | 运行时配置读写与热更新已有，校验与回滚 AC 未全过 |
| `PRD-SYS-002` | partial | `AC-SYS-002-01` | 日志与诊断接口已有，级别切换与下载 AC 未验收 |
| `PRD-SYS-003` | in | `AC-SYS-003-01`、`AC-SYS-003-02` | 健康检查与运行时状态；入口为设置页状态卡 |
| `PRD-SYS-004` | partial | `AC-SYS-004-01` | 版本与更新检查接口已有，下载与安装引导 AC 未验收 |
| `PRD-SYS-005` | partial | `AC-SYS-005-01` | 备份与恢复脚本存在，路径校验与回滚 AC 未验收 |
| `PRD-SYS-006` | partial | `AC-SYS-006-01` | 数据目录与迁移提示已有，跨盘与权限边界 AC 未验收 |

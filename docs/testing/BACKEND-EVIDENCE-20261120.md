# 后端测试证据 · 2026-11-20

- 范围：Simo backend（module `simo`）全量 `go test ./...`，以及 P5–P9 历史能力归档的测试映射。
- 执行者：backend（kernel-builder）
- 结论：**全量测试 PASS；P5–P9 为历史 partial 归档，不等于产品域完成。**
- 性质：docs-only 记录；未改代码、未写正式数据、未启动 8787、未部署、未提交。

## 1. 环境与命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

| 项 | 值 |
|---|---|
| Go | `E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe` |
| 工作目录 | `E:\dsh_home\workspaces\agent\backend` |
| 临时目录 | `E:\dsh_home\workspaces\agent\.tmp\{gocache,gopath,tmp}` |
| 日志 | `E:\dsh_home\workspaces\agent\.tmp\backend-fulltest-20261120.jsonl` |
| 退出码 | `0` |
| 耗时 | `283.33s` |
| 命令 | `go test ./... -count=1 -json` |

> 注意：必须在 `backend/` 下执行；在 workspace 根执行会报 `pattern ./...: directory prefix . does not contain main module or its selected dependencies`（已实际遇到，不是测试失败）。

## 2. 结果摘要

| 指标 | 数值 |
|---|---|
| 被检查 package | 26 |
| 有测试且 PASS | 16 |
| 无测试文件（package 级 skip） | 10 |
| 测试 run 事件 | 223 |
| 测试 PASS | 223 |
| 测试 FAIL | 0 |
| 测试 SKIP | 0 |

223 = 220 个顶层 `func Test` + `TestM71ExplicitTasksStillCreateTasks` 下的 3 个子测试 run。`go test` 的 JSON 流按 run/pass 事件统计，不是按 grep 的 `func Test` 行数。

### 2.1 包级明细

| Package | run/pass | 说明 |
|---|---:|---|
| `simo/cmd/simo` | 149 | M2–M91、server/WS/health/persistence 集成 |
| `simo/internal/core/eventlog` | 4 | eventlog append/replay/team event 类型 |
| `simo/internal/core/module` | 5 | module registry/层级 |
| `simo/internal/modules/chat` | 7 | prompt/runtime contract/migration/system prompt |
| `simo/internal/modules/memory` | 8 | V3 fact/conflict/search/scope/consolidation |
| `simo/internal/modules/sessions` | 8 | session 服务/投影 |
| `simo/internal/modules/tasks` | 4 | task/artifact/deliverable |
| `simo/internal/platform/config` | 12 | config 解析/默认值/迁移 |
| `simo/internal/platform/httpserver` | 3 | health/error envelope |
| `simo/internal/platform/llm` | 5 | provider/usage/decision |
| `simo/internal/platform/neutralize` | 2 | 输入中和 |
| `simo/internal/platform/permission` | 3 | 六步策略 fail-closed |
| `simo/internal/platform/sqlite` | 3 | SQLite 基础 |
| `simo/internal/platform/tokenmeter` | 2 | token 计量 |
| `simo/internal/platform/workspace` | 5 | layout/path traversal |
| `simo/tools/workspace-migrate` | 3 | 迁移 plan/apply/verify/rollback |
| 其余 10 个 | 0 | `core/action`、`core/agent`、`core/memory`、`core/session`、`core/spec`、`core/store`、`core/task`、`platform/log`、`webui`、`tools/resetconv`（无 `_test.go`） |

## 3. P5–P9 PRD → 测试映射

> 状态口径：`partial` = 有真实代码/测试但未满足 PRD 全 AC；`unimplemented` = backend 无实现或无测试证据。产品 spec 的状态与 backend 归档状态不一致时，以本表“backend 状态”为准并注明。

### 3.1 P5-MEM（6 PRD；backend 0 implemented / 5 partial / 1 unimplemented）

| PRD | 需求 | backend 状态 | 实际测试/证据 |
|---|---|---|---|
| MEM-001 | 条目·作用域·搜索 | partial | `TestM3RememberVisibilityAndFTS`、`TestM3ConflictVisibleAndItemsShape`、`TestM3MemoryInjectionIntoChat`、`TestM3RestartPersistence`、`TestSearchChineseTrigramAndShortLike`、`TestScopeIsolationAndTaskDoneCandidate`；memory module 8 tests |
| MEM-002 | 实体·关系·金字塔 | partial | `TestM21MemoryV3Pipeline`；`GET /api/memory/entities*`、`/graph`、`/pyramid` 代码路径 |
| MEM-003 | 冲突与争议保留 | partial | `TestMemoryV3FactConflictAndCanonical`、`TestPreferenceUpdatesActiveAndOnlyContradictionDisputes`、`TestSubmitMergeConflictRetract` |
| MEM-004 | 召回 R1/R2 | partial | `TestM22RecallR1`、`TestM27RecallR2DefaultOn`、`TestM27RecallR2SwitchAndVectorDegrade`、`TestM27RecallR2TwoHopAndAgentic` |
| MEM-005 | 向量召回与巩固 | partial | `TestM30ConsolidationCandidatesMergeAndIdempotency`、`TestM30ConsolidationDefaultEnabled`、`TestM30FactKeyExtraction`、`TestM32LocalVectorRecallAndFusion`、`TestM32VectorDefaultOff`、`TestM31RecallEntityBindingNoSelfLock` |
| MEM-006 | 迁移与索引 | unimplemented | 无对应测试；仅有历史 v1–v6 migration 代码，不满足该 PRD 的独立索引/迁移 AC |

### 3.2 P6-TEAM（6 PRD；0 implemented / 4 partial / 2 unimplemented）

| PRD | 需求 | backend 状态 | 实际测试/证据 |
|---|---|---|---|
| TEAM-001 | roster/model | partial | `TestM23TeamV0View` |
| TEAM-002 | 成员=子会话+owner | partial | `TestM24TeamV1InternalRouting` |
| TEAM-003 | 模板/角色/触发器 | partial | `TestM25TeamV2TemplateAndTrigger` |
| TEAM-004 | 只读投影/会话创建 | unimplemented | 无产品级团队创建/更新 HTTP API；无对应测试 |
| TEAM-005 | 内部消息隔离 | partial | `TestM24TeamV1InternalRouting`（主窗口无内部文本）、`TestM31TeamEventsBroadcastOnWS`、`TestTeamInternalEventTypesRegistered` |
| TEAM-006 | 子 agent 并行/团队看板 | unimplemented | 无对应测试 |

### 3.3 P7-SCHED（5 PRD；0 implemented / 4 partial / 1 unimplemented）

| PRD | 需求 | backend 状态 | 实际测试/证据 |
|---|---|---|---|
| SCHED-001 | CRUD | partial | `TestM13OnceScheduleFires`、`TestM13PauseAndRunNow` |
| SCHED-002 | 列表/next-run | partial | `TestM13InvalidCronAndNextRun` |
| SCHED-003 | run-now/幂等 | partial | `TestM13PauseAndRunNow`；`schedule_fires(schedule_id,due_at)` 代码路径 |
| SCHED-004 | 重复/时区 | partial | `TestM13InvalidCronAndNextRun`；类型 once/interval/daily/weekly/cron 代码路径 |
| SCHED-005 | 失败/重试/通知 | unimplemented | 无通知产品能力；仅 startTurn 重试与暂停逻辑，无对应测试 |

### 3.4 P8-SET/SYS（12 PRD；1 implemented / 8 partial / 3 unimplemented）

| PRD | 需求 | backend 状态 | 实际测试/证据 |
|---|---|---|---|
| SET-001 | 模型/provider | partial | `platform/config` 12 tests；只有配置解析，无运行时设置 API/UI |
| SET-002 | 权限/沙箱/审批 | partial | `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill` |
| SET-003 | 外观/主题/语言 | unimplemented | 无 `/api/settings`，无对应测试 |
| SET-004 | 数据目录/备份/恢复 | partial | `platform/config` 迁移相关测试、`tools/workspace-migrate` 3 tests；备份/恢复产品面未实现 |
| SET-005 | 快捷键/关于/版本 | unimplemented | 无对应后端 API/测试 |
| SET-006 | 能力管理 MCP/CLI/Skills | unimplemented | 无对应测试 |
| SYS-001 | 本地单用户/鉴权边界 | partial | `TestHealthAndSessions`、`TestAPINotFoundIsJSON`；无多用户/鉴权实现 |
| SYS-002 | 权限 fail-closed | partial | `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`、`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill` |
| SYS-003 | 健康/运行时 | implemented | `TestM7HealthReadiness`、`TestHealthAndSessions`、`TestM7UniformErrorEnvelope` |
| SYS-004 | 备份/迁移/回滚 | partial | `tools/workspace-migrate` 3 tests、config 迁移测试；正式数据迁移未演练 |
| SYS-005 | 日志/审计 | partial | `TestM7UniformErrorEnvelope` 等；无审计查询产品面 |
| SYS-006 | 安装/升级/便携 | partial | config 路径/默认值测试；无安装器/升级/便携包测试 |

### 3.5 P9-TOOL（7 PRD；backend 按实现计 0 implemented / 4 partial / 3 unimplemented）

| PRD | 需求 | backend 状态 | 实际测试/证据 |
|---|---|---|---|
| TOOL-001 | 工具注册/执行/审计 | partial | `TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider`；M17/M12 执行测试 |
| TOOL-002 | 权限/审批/沙箱 | partial | `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` |
| TOOL-003 | Skills 发现/加载 | unimplemented（backend） | 无 skills 代码/测试；产品状态 partial 缺 backend 证据 |
| TOOL-004 | MCP 集成 | unimplemented | 无 MCP client/server/配置/测试 |
| TOOL-005 | CLI 白名单 | partial | `TestM9PwshApprovalAndExitCode`、`TestM9PwshEnvTimeoutAndSpill`；只有危险命令 blocklist，不是白名单 |
| TOOL-006 | web search/fetch | partial | `TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied`；真实网络未测 |
| TOOL-007 | 能力目录 L0–L3 | unimplemented | 无能力目录实现；action registry 不等价 |

### 3.6 汇总

| 域 | PRD 数 | implemented | partial | unimplemented |
|---|---:|---:|---:|---:|
| P5-MEM | 6 | 0 | 5 | 1 |
| P6-TEAM | 6 | 0 | 4 | 2 |
| P7-SCHED | 5 | 0 | 4 | 1 |
| P8-SET/SYS | 12 | 1 | 8 | 3 |
| P9-TOOL | 7 | 0 | 4 | 3 |
| 合计 | 36 | 1 | 25 | 10 |

> P9 与产品 spec 的差异：产品 spec 把 TOOL-003 标为 partial，但 backend 未找到 Skills 实现/测试，本证据将其记为 `unimplemented（backend）`，避免虚高覆盖率。

## 4. P5–P9 变更包文件清单

每个目录均含 7 个文件：`proposal.md`、`spec.md`、`backend.md`、`frontend.md`、`tasks.md`、`test-plan.md`、`evidence.md`。

| 变更包 | 文件 |
|---|---|
| `specs/changes/CHG-LEGACY-P5-MEM/` | proposal.md · spec.md · backend.md · frontend.md · tasks.md · test-plan.md · evidence.md |
| `specs/changes/CHG-LEGACY-P6-TEAM/` | proposal.md · spec.md · backend.md · frontend.md · tasks.md · test-plan.md · evidence.md |
| `specs/changes/CHG-LEGACY-P7-SCHED/` | proposal.md · spec.md · backend.md · frontend.md · tasks.md · test-plan.md · evidence.md |
| `specs/changes/CHG-LEGACY-P8-SET/` | proposal.md · spec.md · backend.md · frontend.md · tasks.md · test-plan.md · evidence.md |
| `specs/changes/CHG-LEGACY-P9-TOOL/` | proposal.md · spec.md · backend.md · frontend.md · tasks.md · test-plan.md · evidence.md |

共 35 个文档；无代码、前端、TREE/TRACE/acceptance 改动。

## 5. 未覆盖与缺口

### P5

- MEM-006 独立迁移/索引未实现。
- 实体/关系/金字塔、冲突、R2/agentic recall、向量召回、巩固均为 partial；无完整 UI。
- 无真实大规模数据/性能/召回质量基准。

### P6

- TEAM-004 只读投影/产品级会话创建未实现；TEAM-006 并行/看板未实现。
- 无用户可操作的团队创建/编辑 API；无团队 UI。
- 内部消息隔离只在既有案例验证，缺并发/跨团队/越权矩阵。

### P7

- SCHED-005 通知/失败重试产品能力未实现；启动只补偿最近一次 missed run。
- 无调度 UI；无长稳/并发/时区边界矩阵。

### P8

- 无 `/api/settings`、外观/主题/语言、快捷键/关于/版本、能力管理。
- 权限为内存态，重启丢失；无持久化设置。
- 备份/恢复/回滚只有工具与迁移测试，未做正式数据演练；无审计查询面。
- 无安装/升级/便携包测试。

### P9

- MCP、Skills、能力目录未实现；CLI 无白名单（blocklist 不是白名单）。
- 无工具管理/审批 UI；无工具启用/禁用配置。
- 审批并发/过期/跨 session 隔离、真实 web 网络/反 SSRF 绕过/大响应、工具输出注入全链路未测。

## 6. 限制与声明

1. 本证据只证明 2026-11-20 该工作区、该命令下 223 个测试通过；不证明 P5–P9 产品 AC 全部满足。
2. 未运行前端构建/浏览器验收；未启动 8787；未接触正式数据。
3. 无性能、压力、长稳、真实外部网络、真实 MCP/Skills 测试。
4. `specs/test/P5-MEM` … `P9-TOOL/test-plan.md` 已于 2026-11-20 回写本证据的部分用例；PRD 整体仍 partial/unimplemented，未升级 covered。
5. 完整逐测试结果以 `.tmp/backend-fulltest-20261120.jsonl` 为准；本文件只做通过计数与 PRD 映射。

## 7. 复现判定

- 若 `go test ./...` exit 0、0 fail，且上表测试名仍存在，则可复现“全量 PASS”。
- 若 package/测试数变化，应更新本文件计数，不应沿用 223。
- 若 P9 状态改变，必须先补 MCP/Skills/能力目录/CLI 白名单的真实代码与测试，再改状态；禁止只改文档。

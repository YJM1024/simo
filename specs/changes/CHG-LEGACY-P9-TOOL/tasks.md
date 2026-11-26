# TASKS · CHG-LEGACY-P9-TOOL

本包为 docs-only 历史归档，不包含新的工具/MCP/Skills 实现。

## T1 工具面/执行器盘点

- Owner：backend
- Scope：只读 `chat/tools.go`、`approval.go`、`actions.go`
- AC：列出 16 个工具、审批/沙箱/风险规则、执行限制；明确工具无公开 HTTP 执行入口。
- Evidence：`backend.md` 第 2–4 节；`TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider`。
- 状态：done

## T2 权限/审批/沙箱核验

- Owner：backend
- Scope：`platform/permission` 及 M5/M9 精确测试
- AC：记录默认值、ask/auto/never、提权、read-only、会话授权；不把 blocklist 当白名单。
- Evidence：`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。
- 状态：done

## T3 生成/Web 工具核验

- Owner：backend
- Scope：`m12_test.go`、`m17_test.go`
- AC：记录 PDF/DOCX/XLSX/图片、web mock、SSRF、python 路径/超时/环境。
- Evidence：`TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied`；`TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing`。
- 状态：done

## T4 MCP/Skills/能力目录/CLI 白名单缺口登记

- Owner：backend
- Scope：`spec.md`、`evidence.md`
- AC：明确 backend 无实现/无测试；不得写成 covered。
- Evidence：`spec.md` R3/R4/R5/R7。
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
- AC：独立复核测试名/状态/缺口；实现者不自签。
- Evidence：交接消息 + 文件清单。
- 状态：pending

## 任务表

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| T1 | 工具面/执行器盘点 | backend | 只读 `chat/tools.go`、`approval.go`、`actions.go` | 无 | 列出 16 个工具、审批/沙箱/风险规则、执行限制；明确工具无公开 HTTP 执行入口。 | `backend.md` 第 2–4 节；`TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T2 | 权限/审批/沙箱核验 | backend | `platform/permission` 及 M5/M9 精确测试 | 无 | 记录默认值、ask/auto/never、提权、read-only、会话授权；不把 blocklist 当白名单。 | `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T3 | 生成/Web 工具核验 | backend | `m12_test.go`、`m17_test.go` | 无 | 记录 PDF/DOCX/XLSX/图片、web mock、SSRF、python 路径/超时/环境。 | `TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied`；`TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T4 | MCP/Skills/能力目录/CLI 白名单缺口登记 | backend | `spec.md`、`evidence.md` | 无 | 明确 backend 无实现/无测试；不得写成 covered。 | `spec.md` R3/R4/R5/R7。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T5 | 全量测试与证据 | backend | `backend/` 全量 `go test ./... -count=1 -json`，环境变量指向 `../.tmp` | 无 | 包数/测试数/失败/耗时完整；失败不得 PASS。 | `docs/testing/BACKEND-EVIDENCE-20261120.md`。 | done（26 包 / 223 / 0 fail / 283.33s） | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T6 | 验收交接 | backend → 验收 Agent | 本包文档与证据 | 无 | 独立复核测试名/状态/缺口；实现者不自签。 | 交接消息 + 文件清单。 | pending | 验收 Agent | 不改实现、不删文件、不编造证据 |

> 本表由既有 T1–T6 任务卡转录，字段与卡片正文一致；原卡片保留在上文，供逐条核对。

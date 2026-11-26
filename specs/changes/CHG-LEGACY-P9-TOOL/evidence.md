# EVIDENCE · CHG-LEGACY-P9-TOOL

- 日期：2026-11-20
- 执行者：backend（kernel-builder）
- 结论：**PASS WITH NOTES**（工具/审批/沙箱/web 相关测试通过；MCP/Skills/能力目录/CLI 白名单未实现，P9 仍为 partial）
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

## 3. P9 相关测试（全部 PASS）

- `TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider`。
- `TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`。
- `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`。
- `TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing`。
- `TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied`。
- permission（共 3 个，精确名如下）：`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。

## 4. 覆盖结论

| PRD | 测试 | 产品状态 | 备注 |
|---|---|---|---|
| TOOL-001 | `TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider`、`TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing`、`TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied` | partial | 工具注册/执行有；审计无查询面 |
| TOOL-002 | `TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`；`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`；`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` | partial | 审批/沙箱有；无并发/跨 session 矩阵 |
| TOOL-003 | 无 | unimplemented（backend） | 无 skills 代码/测试；产品 partial 缺后端依据 |
| TOOL-004 | 无 | unimplemented | 无 MCP client/server |
| TOOL-005 | `TestM9PwshApprovalAndExitCode`、`TestM9PwshEnvTimeoutAndSpill` | partial | 只有危险命令 blocklist，不是白名单 |
| TOOL-006 | `TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied` | partial | mock/SSRF 有；真实网络未测 |
| TOOL-007 | 无 | unimplemented | action registry 不是能力目录 |

## 5. 未验证项 / 限制

1. 无工具管理/审批 UI，无法做用户验收。
2. MCP/Skills/能力目录未实现；不能凭产品状态 partial 判定。
3. CLI 无白名单，blocklist 绕过风险未评估。
4. 审批并发、过期、跨 session 隔离无测试。
5. web 真实网络、反 SSRF 绕过、超大响应无测试。
6. 全量通过仅代表既有测试通过，不代表 P9 全部 AC 完成。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-P9-01-01 | AC-P9-01 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P9-07-01 | AC-P9-07 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P9-02-01 | AC-P9-02 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P9-03-01 | AC-P9-03 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P9-04-01 | AC-P9-04 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P9-05-01 | AC-P9-05 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P9-06-01 | AC-P9-06 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

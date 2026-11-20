# TEST PLAN · CHG-LEGACY-P9-TOOL

## 1. 范围与策略

- 验证 P9 后端：工具注册/执行、权限/审批/沙箱、写入确认、pwsh/python、文档/图片生成、web mock/SSRF、action registry。
- 层级：平台单测（permission/neutralize/eventlog）+ `cmd/simo` 进程内集成（m5/m9/m12/m17/m20）。
- 外部依赖：无；web 使用 mock，LLM 使用 mock，不需要 API key。
- 隔离：临时 `SIMO_HOME`/SQLite/文件目录；不接触 8787/正式数据。
- 不测试：MCP、Skills、能力目录、CLI 白名单（未实现）。

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

| AC | 测试 | 层级 | 预期 | 实际 |
|---|---|---|---|---|
| AC-P9-01 工具/action 注册 | `TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider` | 集成 | action ≥50、名称合法、native 工具 | PASS |
| AC-P9-02 审批/沙箱 | `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9EscalationWritesOutsideAndNeverRejects`；`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` | 集成+单测 | 默认/full 确认、提权、never 拒绝 | PASS |
| AC-P9-03 写入审批 | `TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes` | 集成 | 批准前不存在、批准后写入；delete deny | PASS |
| AC-P9-04 命令/输出限制 | `TestM9PwshApprovalAndExitCode`、`TestM9PwshEnvTimeoutAndSpill`；`TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing` | 集成 | exit code、超时、截断、env 剥离、路径拒绝 | PASS |
| AC-P9-05 生成/web | `TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied` | 集成 | 审批、预览、mock、SSRF 拒绝 | PASS |
| AC-P9-06 MCP/Skills/目录/白名单 | 无 | — | 不可判定 | MISSING/unimplemented |
| AC-P9-07 工具管理 UI | 无 | — | 不可判定 | N/A |

## 4. 关键边界已有/缺失

已有：

- action registry、工具名合法、native action。
- 写入审批、delete deny、会话授权。
- 提权 + justification、never 拒绝。
- pwsh 退出码、超时、敏感 env 剥离、70k 输出截断。
- python 路径越界/缺失/超时。
- PDF/DOCX/XLSX 生成；web mock；SSRF 拒绝。

缺失：

- MCP、Skills 发现/加载、能力目录 L0–L3。
- CLI 白名单（只有 blocklist）。
- 审批并发、过期、跨 session 隔离。
- 工具启用/禁用配置、工具列表 UI。
- 真实 web 网络、反 SSRF 绕过、超大响应。
- 工具输出注入全链路测试。

## 5. 未覆盖/不适用

- 无前端，工具/审批 UI N/A。
- 无真实 MCP/Skills 服务。
- 无性能/压力/长稳测试。

## 6. 退出标准

- 全量测试 exit 0 且 0 fail；
- 7 个 PRD 有状态/证据或明确 unimplemented；
- 不把 blocklist 写成白名单；
- 不虚构 MCP/Skills/目录测试。

## 7. 证据

- [`evidence.md`](evidence.md)
- [`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- 原始日志：`backend/../.tmp/backend-fulltest-20261120.jsonl`

# BACKEND · CHG-LEGACY-P9-TOOL

- Scope：`backend/internal/modules/chat/{tools.go,approval.go,actions.go,permissions.go}`、`platform/permission`、`platform/neutralize`
- 状态：历史归档，无新增实现

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/chat/tools.go` | 16 个工具定义、授权、执行、输出限制、危险命令判断、审计 |
| `backend/internal/modules/chat/approval.go` | 审批行、ask/auto/never、会话授权、执行 |
| `backend/internal/modules/chat/actions.go` | action registry/describe/execute，团队等 action |
| `backend/internal/modules/chat/permissions.go` | session 权限设置 API |
| `backend/internal/platform/permission/permission.go` | 六步策略 fail-closed |
| `backend/internal/platform/neutralize` | 输入/输出中和（防注入） |

## 2. 工具面（实际定义 16 个）

| 工具 | 用途 | 风险/审批 |
|---|---|---|
| `read` | 读文件 | 只读，allow |
| `glob` | 文件查找 | 只读 |
| `grep` | 文本搜索 | 只读 |
| `write` | 写文件 | ask/审批；越界需提权 |
| `edit` | 字面替换 | ask/审批 |
| `pwsh` | 一次性 PowerShell | 审批；危险命令 R4 |
| `run_python` | Python 代码/脚本 | 审批；路径限制 |
| `make_pdf` | Markdown/HTML → PDF | 审批 |
| `make_docx` | Markdown → DOCX | 审批 |
| `make_xlsx` | sheets → XLSX | 审批 |
| `make_pptx` | slides → PPTX | 审批 |
| `make_image` | 文本占位/png 处理 | 审批 |
| `web_search` | DuckDuckGo/Bing 搜索 | 审批 |
| `web_fetch` | 抓取公开网页 | 审批 + SSRF 防护 |
| `actions_describe` | 按需看 action schema | 只读 |
| `actions_invoke` | 调 action | 受 action 风险级别约束 |

工具执行由模型 tool call 进入 `executeTool`，不是公开 HTTP 端点。

## 3. 授权/审批/沙箱

- `toolAuthorization`：allowed、sandbox、risk、needsApproval、reason/code。
- 规则：read/glob/grep 允许；write/edit/pwsh/python/生成/web 需审批；`delete_*` 直接 deny（`denied_tool`）；read-only 拒绝写入/命令/生成。
- 审批模式：`ask`（每次问）、`auto`（按策略自动）、`never`（拒绝）；会话授权 `allow_session` 可复用。
- 提权：`sandbox_permissions` 只能宽一档，必须 `justification`；危险命令强制 R4。
- 授权后执行再次校验 sandbox/path；越界/只读拒绝返回 `path_denied`/`sandbox_denied`。
- 审批行状态 pending/approved/denied；`/api/approvals*` 仅 loopback。
- 会话权限默认 `workspace-write` + `auto`；full access 需 confirm；内存态。

## 4. 执行限制

- pwsh/python `timeout_ms` 1–120000，默认 120000；超时杀进程树；非零退出返回 `[exit code: N]`。
- 输出上限 64KiB；超出写 spill 文件，结果给摘要和文件位置。
- `sandboxEnvironment` 去掉 `DEEPSEEK_*`/`OPENAI_*` 等敏感环境变量；保留 `SIMO_HOME`。
- `dangerousCommand` blocklist：`rm -rf`、`rm -r`、`del /`、`rd /s`、`rmdir /s`、`format `、`format-volume`、`clear-disk`、`shutdown`、`stop-computer`、`restart-computer`、`reg add`、`reg delete`、`set-itemproperty`、`mkfs`、`diskpart`、`remove-item -recurse`、`remove-item -force`、`drop database`。
- **没有 CLI 白名单**；blocklist 不是白名单，容易被绕过，故 TOOL-005 只 partial。
- web_fetch：http/https、≤2MB、15s、SSRF 校验；web_search 解析 HTML，失败回退。
- 审计：`auditToolCall` 写 eventlog `tool.call`，包含 tool/session/args/auth/result/duration；action 执行写 `action.executed`。

## 5. 数据与 API

- `approvals`（chat 迁移 v3，v5 扩展 sandbox/risk）、`approval_grants`（v6）。
- 路由：`GET /api/actions`、`GET /api/actions/{name}`、`POST /api/actions/{name}`；`GET /api/approvals`、`GET /api/approvals/{id}`、`POST /api/approvals/{id}`；`GET/POST /api/permissions`。
- 无 MCP/Skills/能力目录相关表或路由。

## 6. 测试映射

| 测试 | 文件 | 覆盖 |
|---|---|---|
| `TestM20ActionRegistryAndExecute` | `backend/cmd/simo/m20_test.go` | action registry ≥50、describe/execute、R4 403 |
| `TestM20NativeActionTools` | 同上 | native action 工具注册 |
| `TestM20ToolNamesValidForProvider` | 同上 | 工具名 provider 合法 |
| `TestM9PermissionsDefaultAndFullConfirmation` | `backend/cmd/simo/m9_test.go` | 权限默认/full 确认 |
| `TestM9PwshApprovalAndExitCode` | 同上 | pwsh 审批、退出码 |
| `TestM9EscalationWritesOutsideAndNeverRejects` | 同上 | 提权/never 拒绝 |
| `TestM9AllowSessionGrant` | 同上 | 会话授权 |
| `TestM9ApprovalResultReportMessage` | 同上 | 审批结果消息 |
| `TestM9PwshEnvTimeoutAndSpill` | 同上 | 环境剥离/超时/输出截断 |
| `TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes` | `backend/cmd/simo/m5_test.go` | ask 写入、delete deny |
| `TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing` | `backend/cmd/simo/m17_test.go` | python 执行/路径/超时/缺失 |
| `TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied` | `backend/cmd/simo/m12_test.go` | 生成、web mock、SSRF |
| permission（共 3 个，精确名如下）：`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` | `backend/internal/platform/permission/permission_test.go` | fail-closed 策略 |

## 7. 未验证 / 风险

- MCP、Skills、能力目录未实现，无测试。
- CLI 无白名单；blocklist 无独立测试。
- 无工具管理 UI；无工具启用/禁用配置。
- 无审批并发/过期竞态测试，无跨 session 审批隔离测试。
- web 真实网络、反 SSRF 绕过、超时/大响应只做了部分测试。
- 无输出注入/敏感信息泄漏的系统性测试（neutralize 有单测但未与工具输出全链路覆盖）。

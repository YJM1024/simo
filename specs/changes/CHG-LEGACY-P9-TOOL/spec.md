# SPEC · CHG-LEGACY-P9-TOOL

Covers: AC-P9-01、AC-P9-02、AC-P9-03、AC-P9-04、AC-P9-05、AC-P9-06、AC-P9-07（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-TOOL-001, PRD-TOOL-002, PRD-TOOL-003, PRD-TOOL-004, PRD-TOOL-005, PRD-TOOL-006, PRD-TOOL-007

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：backend
- 日期：2026-11-20
- 产品依据：`specs/product/P9-TOOL/spec.md`
Change：CHG-LEGACY-P9-TOOL
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

归档 P9 工具注册/执行/审计、权限/审批/沙箱、CLI 命令限制、web 工具与缺口；明确 MCP/Skills/能力目录未实现。

## 2. 需求与状态

| ID | 需求 | 后端事实 | 状态 | 主要证据 |
|---|---|---|---|---|
| R1 | TOOL-001 工具注册/执行/审计 | 16 个模型工具定义；执行器统一错误文本；`auditToolCall` 写 `tool.call`；输出 64KiB 截断/落盘 | partial | `TestM20ToolNamesValidForProvider`、`TestM20NativeActionTools`；`TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing`；`TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied` |
| R2 | TOOL-002 权限/审批/沙箱 | 审批模式 ask/auto/never；ask 规则；路径/沙箱检查；提权仅宽一档；read-only 禁止写入/命令；approval 会话授权 | partial | `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule` |
| R3 | TOOL-003 Skills 发现/加载 | backend 未发现 skills 目录/加载代码/测试 | unimplemented（backend） | 无测试；产品 partial 缺后端依据 |
| R4 | TOOL-004 MCP 集成 | backend 未发现 MCP client/server/配置 | unimplemented | 无测试 |
| R5 | TOOL-005 CLI 白名单 | pwsh 工具存在；使用危险命令 blocklist + 审批，不是白名单；无独立白名单测试 | partial | `TestM9PwshApprovalAndExitCode`、`TestM9PwshEnvTimeoutAndSpill` |
| R6 | TOOL-006 web search/fetch | `web_search`/`web_fetch` 工具；mock 测试；SSRF 防护；需审批 | partial | `TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied` |
| R7 | TOOL-007 能力目录 L0–L3 | 无能力目录/描述/分级实现；action registry 不是产品能力目录 | unimplemented | 无测试；`TestM20ActionRegistryAndExecute` 只覆盖 action |

## 3. 验收标准（本包）

- **AC-P9-01**：工具名符合 provider 约束 `^[a-zA-Z0-9_-]+$`；action 可注册/执行；native action 工具存在。证据：`TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider`。
- **AC-P9-02**：写/命令/生成/web 需要审批；read-only 禁止；`never` 拒绝；提权仅宽一档且需 justification。证据：`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9EscalationWritesOutsideAndNeverRejects`；`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`。
- **AC-P9-03**：approved write 前文件不存在、approved 后写入；delete 被 deny。证据：`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`。
- **AC-P9-04**：pwsh 非零退出返回 `[exit code: N]`；超时/输出截断/环境变量剥离；python 路径越界拒绝。证据：`TestM9PwshApprovalAndExitCode`、`TestM9PwshEnvTimeoutAndSpill`、`TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing`。
- **AC-P9-05**：文档/图片生成需审批并可预览；web mock 可用；SSRF 拒绝。证据：`TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied`。
- **AC-P9-06**：MCP/Skills/能力目录未实现；CLI 白名单未实现；记 `unimplemented/missing`，不得判 PASS。
- **AC-P9-07**：无工具管理 UI，用户可见配置 AC 不判定通过。

## 4. 状态、错误与边界

- 工具面（16）：`read`、`glob`、`grep`、`write`、`edit`、`pwsh`、`run_python`、`make_pdf`、`make_docx`、`make_xlsx`、`make_pptx`、`make_image`、`web_search`、`web_fetch`、`actions_describe`、`actions_invoke`。
- 工具执行不是公开 HTTP API；由模型 tool call 进入执行器；HTTP 只有 actions/approvals/permissions 管理面。
- 审批模式：`ask`/`auto`/`never`；默认 `auto`；写/命令/生成/web 仍按规则处置；`never` 拒绝。
- 提权 `sandbox_permissions` 仅允许宽一档，且必须 `justification`；`danger-full-access` 需显式审批。
- 路径：workspace/artifacts 受限；越界默认拒绝；read-only 禁止写入/命令/生成。
- pwsh/python 超时 1–120000ms，杀进程树；输出上限 64KiB，超出落盘并给摘要。
- `dangerousCommand` 为模式 blocklist（`rm -rf`、`format`、`shutdown`、`reg delete`、`remove-item -recurse` 等），不是 CLI 白名单。
- `web_fetch` 有 SSRF 防护，限制 http/https、大小/超时；真实外部网络质量未测。
- 无 MCP、Skills、能力目录。

## 5. 接口与数据（归档）

管理路由：`GET /api/actions`、`GET /api/actions/{name}`、`POST /api/actions/{name}`；`GET /api/approvals`、`GET /api/approvals/{id}`、`POST /api/approvals/{id}`（loopback-only）；`GET/POST /api/permissions`。

数据：chat 迁移 v3 `approvals`，v5 扩展 sandbox/risk，v6 `approval_grants`；eventlog 记录 `tool.call`、`approval.*`、`action.executed`。工具本身无独立表。

## 6. 待确认

- TOOL-003/004/007 是否仍为 P2；MCP/Skills 的配置与安全边界？
- CLI 是否必须白名单（而非 blocklist）？允许哪些命令族？
- 工具管理是否需要用户 UI，还是仅模型内部能力？
- 审批默认 `auto` 是否适合写入/命令类高风险工具？

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

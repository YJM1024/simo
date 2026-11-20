# PROPOSAL · CHG-LEGACY-P9-TOOL

- 变更 ID：CHG-LEGACY-P9-TOOL
- 类型：历史能力归档（docs-only）
- Owner：backend
- 日期：2026-11-20
- 关联产品域：`specs/product/P9-TOOL/spec.md`
- 状态：archived / partial（不表示 P9 已完整交付）

## 1. 背景

P9 工具/权限能力已在聊天执行器中形成一套真实实现：16 个模型工具、审批/审批会话授权、路径与沙箱检查、pwsh/python 执行、文档/图片生成、web_search/web_fetch、action 注册与执行、工具调用审计。但 MCP、Skills、能力目录 L0–L3 没有实现；CLI 只有危险命令 blocklist 与审批，没有产品要求的白名单。`specs/test/P9-TOOL/test-plan.md` 仍是全 `missing` 骨架。

## 2. 目标

1. 归档 P9 真实工具面、审批/沙箱边界、执行限制和测试证据。
2. 明确 TOOL-003（Skills）、TOOL-004（MCP）、TOOL-007（能力目录）在 backend **无实现**，不能因产品状态 partial 就写成 covered。
3. 给出 TOOL-001/002/005/006 的已覆盖/未覆盖点。

成功标准：7 个 PRD 都有真实代码/测试或明确 `unimplemented`；不把 action registry 当能力目录，不把 blocklist 当白名单。

## 3. 范围

### In scope

- `backend/internal/modules/chat/tools.go`、`approval.go`、`actions.go`、`permissions.go`。
- `backend/internal/platform/permission/**`、`platform/neutralize/**`。
- 测试：`TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider`；`TestM17RunPythonEchoAndFile`、`TestM17RunPythonPathAndOutside`、`TestM17RunPythonTimeoutSpillEnv`、`TestM17RunPythonMissing`；`TestM12PDFGenerationApprovalAndPreview`、`TestM12DocxAndXlsxHelpers`、`TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied`；`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`；`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`；`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`；`TestAppendReplayAndSubscribe`、`TestUnknownTypeRejected`、`TestReplayPayloadValidJSON`、`TestTeamInternalEventTypesRegistered`。
- 2026-11-20 全量测试结果。

### Out of scope

- 不实现 MCP、Skills 加载、能力目录、CLI 白名单。
- 不新增工具、不改变审批策略。
- 不修改前端/产品 spec/TREE/TRACE/验收记录。
- 不写正式数据，不启动 8787。

## 4. 影响面

| 层 | 影响 |
|---|---|
| 前端 | 无（N/A） |
| 后端 API | 归档 `/api/actions*`、`/api/approvals*`、`/api/permissions`；工具执行走模型 loop，不是公开 HTTP |
| 数据 | 归档 `approvals`、`approval_grants`、eventlog `tool.call` |
| 测试 | 引用 M5/M9/M12/M17/M20、permission、eventlog 测试 |
| 文档 | 新增本包 7 个文件 |

## 5. 方案比较

| 方案 | 结论 |
|---|---|
| A. 以“工具有 16 个、审批能跑”判定 P9 完成 | 拒绝：MCP/Skills/能力目录未实现，CLI 无白名单 |
| B. 只列工具 schema | 不足：无法证明权限 fail-closed、沙箱、输出截断、SSRF |
| C. 按 PRD 归档工具面 + 审批/沙箱证据 + 缺口（采用） | 真实、可复核，便于后续补齐 |

## 6. 风险、依赖与假设

- 风险：工具执行是高风险面；当前审批默认 `auto`，用户可能未感知写入/命令执行。
- 风险：CLI 使用危险命令 blocklist，绕过方式多，不等于白名单。
- 风险：web_fetch 有 SSRF 防护测试，但真实网络行为未全面验证。
- 风险：MCP/Skills 无代码，产品 partial 状态缺后端依据。
- 依赖：会话 turn loop、SQLite approvals、eventlog、文件系统沙箱。
- 假设：P9 没有独立工具管理 UI；工具由模型在会话中调用。
- 待确认：TOOL-003 的 partial 是否来自前端/文档而非 backend；CLI 白名单是否仍为 P1。

## 7. 决策请求

请产品/验收 owner 确认：

1. P9 保持 partial；TOOL-003/004/007 记为 unimplemented（backend）。
2. 接受“危险命令 blocklist + 审批”不是 CLI 白名单；TOOL-005 仍 partial。
3. MCP/Skills/能力目录另开实现型 CHG，不在本包扩 scope。

## 8. 链接

- [spec.md](spec.md) · [backend.md](backend.md) · [frontend.md](frontend.md) · [tasks.md](tasks.md) · [test-plan.md](test-plan.md) · [evidence.md](evidence.md)
- 产品 spec：[`specs/product/P9-TOOL/spec.md`](../../product/P9-TOOL/spec.md)

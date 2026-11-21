# CHG-CONV-002 · 后端开发 spec

状态：**partial**
Change: CHG-CONV-002
Implements: PRD-CONV-004、PRD-CONV-007
Scope：`backend/internal/modules/chat/`（`module.go` 消息路由、`all_messages.go`、`cards.go`）、SQLite `messages`/`cards` 表
N/A：不适用。

## 1. API 契约

| 方法/路径 | 行为 | 代码 | 测试 |
|---|---|---|---|
| `GET /api/messages` | 公告板/列表（含过滤） | `chat/module.go:173` | `TestChatPersistsAndFiltersBySession` |
| `GET /api/sessions/{id}/messages` | 当前会话消息，支持分页参数 | `chat/module.go:174` | `TestM11MessagePagination` |
| `GET /api/sessions/{id}/messages/all` | 祖先链整级消息（有序、只读、不含 internal） | `chat/all_messages.go` | `TestM81AllSessionMessages`、`TestM81AllSessionMessagesOrderAndShape`、`TestM89AllMessagesLimitsAndErrors` |
| `GET /api/messages/search?q=` | 消息全文搜索（默认 main，`includeChildren` 可选，LIMIT 50） | `handleMessageSearch` | 无直接测试 |
| `POST /api/messages/{id}/edit|correct`、`PATCH /api/messages/{id}` | 统一返回"编辑已禁用" | `module.go:179-181` | `TestM50MessageEditingDisabled`、`TestM50WebSocketEditRejected` |
| `GET /api/cards/{id}`、`/versions`、`PATCH`、`POST /actions/{actionId}` | 卡片读取/版本/更新/动作 | `cards.go` | `TestM41CardsSendGetPatchAndActions` 等 5 个 |
| WS `message.created` / `reply.delta` / `reply.done` | 实时帧；按 `seq` 可回放 | `platform/httpserver/ws.go` | `TestWebSocketEventOrder`、`TestWebSocketSinceContinuation` |

## 2. 消息纯度契约

- 查询层过滤 `internal = 0`；系统/内部卡片消息不进用户流（`TestM78InternalCardDoesNotPolluteMessageStream`），手工注入内部文本被拒（`TestM78ManualInternalTextRejected`），历史遗留内部消息对 API 隐藏（`TestM79LegacyInternalMessagesHiddenFromAPI`）。
- 消息不可编辑：三条编辑路由全部返回禁用错误（`TestM50*`），WS 编辑帧同样拒绝。

## 3. all-messages 契约

- 入参：`sessionId` 路径参数 + 可选 `limit`；返回 `{messages:[...]}`，字段含 `id, sessionId, role, text, at, status, taskId, workflowId, tool, approvalId, category, replyToId`。
- 顺序：按 `rowid` 升序（稳定）；形状与单会话消息一致（`TestM81AllSessionMessagesOrderAndShape`）。
- 边界：非法/超限参数返回统一错误信封（`TestM89AllMessagesLimitsAndErrors`）；祖先链深度上限 16（`DescendantIDs`）。
- 未定义：跨会话分页游标（产品 AC 未写），前端一次性拉取。

## 4. 错误契约

- 统一信封：`{ok:false, error:{code,message}}`（`TestM7UniformErrorEnvelope`、`TestAPINotFoundIsJSON`）。
- 413（请求体过大）与 403（越权/不可访问）在前端被映射；后端产生点分别在 `m7`/权限层，**无专门 all-messages 413/403 测试**。

## 5. 缺口

| 项 | 状态 | 影响 |
|---|---|---|
| 消息搜索无测试 | **missing** | CONV-003 引用同一 handler |
| all-messages 真实 413/403 | **missing** | CONV-007 边界只在前端 mock 验证 |
| 祖先链分页/游标 | 未定义 | 长链（>16 层或大消息量）表现未知 |
| 卡片动作幂等并发 | 有测试（`TestM76*`） | — |

## 6. 验收（后端部分）

- A：每条路由至少一条已执行测试或显式 `missing`。
- A：纯度（internal=0、编辑禁用）有独立断言，不依赖前端。
- A：all-messages 的有序性/形状/上限写清，前端不得假设无限量。

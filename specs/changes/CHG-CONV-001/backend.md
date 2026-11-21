# CHG-CONV-001 · 后端开发 spec

状态：**partial**（契约描述现状；未读/已读游标无后端实现）
Change: CHG-CONV-001
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003
Scope：`backend/internal/modules/sessions/`、`backend/internal/modules/chat/`（消息搜索、会话内消息）、SQLite `sessions`/`messages` 表
N/A：N/A 不适用——本包涉及 API 与数据持久化契约。

## 1. API 契约（实查基线 2026-11-21）

| 方法/路径 | 行为 | 代码 | 测试 |
|---|---|---|---|
| `GET /api/sessions` | 列表；支持 `q`（标题 LIKE）与 `pinned=true/false` 过滤 | `backend/internal/modules/sessions/http.go:16-29` | `TestUI1SessionSearchAndPin` |
| `GET /api/sessions/tree` | 会话树（含子会话） | 同上 | `TestM4SessionTreeAndRenamePersistAcrossRestart` |
| `POST /api/sessions` | 创建（草稿/物化） | 同上 | `TestM70DraftNotPersistedThenMaterialized`、`TestM70RestartCleansEmptySessions` |
| `PATCH /api/sessions/{id}` | 重命名/属性 | 同上 | `TestM4AutoRouteTreeAggregateRename` |
| `POST /api/sessions/{id}/archive` / `unarchive` | 归档/恢复；归档后只读 | 同上 | `TestM6ArchiveReadonlyAndUnarchive`、`TestArchiveReadonlyAndCanArchiveGate` |
| `DELETE /api/sessions/{id}` | 删除（前端无入口） | 同上 | `TestHealthAndSessions` 覆盖列表，不覆盖删除回滚 |
| `POST /api/sessions/{id}/pin` / `unpin` | 置顶（**前端未使用**） | 同上 | `TestUI1SessionSearchAndPin` |
| `GET/PUT /api/sessions/{id}/owner` | 归属 | 同上 | `TestUI1AgentsAndSessionOwner` |
| `GET /api/messages/search?q=` | 消息全文搜索；默认 `sessionId=main`、`includeChildren=false`、`LIKE %q%`、`LIMIT 50`、`internal=0` | `backend/internal/modules/chat/` `handleMessageSearch` | 无直接测试 |
| `GET /api/sessions/{id}/messages` | 当前会话消息（分页/全量） | `chat/module.go:173-176` | `TestM11MessagePagination` |

## 2. 数据与约束

- 会话：`id`、`parent_id`（根为 `main`）、`title`、`created_at`、`archived`、`pinned`；归档后写入被只读门禁拒绝。
- 树深度：`DescendantIDs(ctx, root, 16)` 有上限 16 层；`TestM14SessionPathMultiLevel` / `TestM14SessionPathCycleGuard` 覆盖多层与环。
- 搜索：会话标题搜索与消息搜索是**两条不同路径**；消息搜索默认限定 main，跨子会话需 `includeChildren=true`（前端未传）。
- **无**未读表、无 `read_cursor` 字段、无通知表（`grep unread|read_cursor|lastRead|last_read|notification` 在 `backend/internal` 零匹配）。

## 3. 错误契约

- 统一错误信封（`TestM7UniformErrorEnvelope`、`TestAPINotFoundIsJSON`）；归档会话聊天走 WS 返回 error 帧而非回复（`TestM6ArchivedChatWSReturnsErrorNotReply`）。
- 409/423 类冲突由服务层生成，前端 `rename`/`toggleArchive` 未消费（见 `frontend.md` §4）。

## 4. 未实现/未验证

| 项 | 状态 | 影响 |
|---|---|---|
| 未读计数/已读游标持久化 | **不存在** | CONV-003/SYNC-004 无后端依据 |
| 通知中心 | **不存在** | SYNC-005 gap |
| 会话删除的级联/软删语义 | 路由存在，语义与回滚未测 | 不可宣称生命周期完整 |
| 会话标题搜索前端接线 | 后端已测，前端未调 | 产品"会话搜索"语义未对齐 |

## 5. 验收（后端部分）

- A：上表每个 API 至少一条已执行测试或标 `missing`。
- A：搜索口径（sessionId/includeChildren/limit/内部消息过滤）写入契约，防止前端误用。
- A：未读/通知明确写"不存在"，不得由接口缺失反推"已实现"。

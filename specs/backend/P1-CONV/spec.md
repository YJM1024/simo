# P1-CONV 会话域 · 后端长期 Spec

| 项 | 值 |
|---|---|
| 域 | P1-CONV（会话域） |
| 产物类型 | 后端开发 Spec（长期 Spec，随域常驻） |
| 状态 | implemented（12 个 PRD 中 7 个已实现、1 个部分实现、4 个后端 N/A；行为变更 3 项未实现，见 §13）；`PRD-CONV-009` 见 §17，已实现（2026-11-25 落地，2026-11-26 复核） |
| 版本 | v1.4 |
| 最后更新 | 2026-11-26 |
| owner | 后端角色（TASK-CHG-CONV-006-10） |
| 产品输入 | `specs/product/P1-CONV/spec.md`（PRD-CONV-001..008、PRD-CONV-009 见 §17 + PRD-SYNC-001..004；SYNC-005 已于 2026-11-22 移除） |
| 变更输入 | `specs/changes/CHG-CONV-006/product.md`、`specs/changes/CHG-CONV-006/tasks.md`、`specs/changes/CHG-CONV-007/spec.md` |
| 运行时基线 | `127.0.0.1:8787`，单用户、无鉴权中间件；SQLite 单进程单写者；时间戳均为 Unix 毫秒（除特别注明） |
| 代码基线 | `backend/internal/modules/{sessions,chat,tasks}`、`backend/internal/core/{session,eventlog,task}`、`backend/cmd/simo/*_test.go` |
| 本文范围 | 只描述**已落地或明确标注未实现**的后端契约；不写重构建议，不修改任何代码/产品/变更文档 |

**阅读方式**：§0 索引 → 按 PRD 分节查 HTTP/WS/数据/不变量/证据 → §13 冲突清单（需 Lead 裁决项）→ §14 错误码总表 → §15 技术债 → §16 变更记录。文中 `路径:行号` 均为本轮实读位置；行号以当前工作区文件为准。

---

## 0 目录与索引

长期 Spec 按域一个文件，文件内按功能点 ID 分节（依据 `docs/plan/MASTER-PLAN.md` §1.7）。本节只做索引与通用约定，不含新契约。

| 节 | PRD-ID | 覆盖状态 | 后端承载面 | 证据锚点（测试文件:行号） |
|---|---|---|---|---|
| §1 | PRD-CONV-001 会话树与主会话 | implemented（AC-001-04 置顶已实现，归档置顶未守卫） | `GET /api/sessions`、`GET /api/sessions/tree`、`POST /api/sessions`、`PATCH /{id}`、`POST /{id}/pin|unpin` | `p1_conv_sessions_http_test.go:210/282/454`、`m4_test.go:134`、`m14_test.go:147` |
| §2 | PRD-CONV-002 生命周期 | implemented（归档/恢复/失败反馈已实现；删除为产品显式非目标，`DELETE` 固定 403 保护性占位） | `POST /{id}/archive|unarchive`、`DELETE /{id}`（保护性 403）、归档只读拒绝 | `m6_test.go:66/100/139`、`p1_conv_sessions_http_test.go:355/377/557` |
| §3 | PRD-CONV-003 搜索与未读 | implemented（标题搜索）；未读持久化游标待新增 | `GET /api/sessions?q=`、`GET /api/messages/search` | `ui1_test.go:97`、`management_test.go:45`、`m79_internal_history_test.go:11` |
| §4 | PRD-CONV-004 消息流与渲染 | implemented | `GET /api/messages`、`/api/sessions/{id}/messages(/all)`、编辑接口拒绝 | `m11_test.go:73`、`p1_conv_messages_http_test.go:91`、`m50_test.go:14`、`m78_internal_message_test.go:23` |
| §5 | PRD-CONV-005 发送·流式·重连 | implemented（幂等本轮新增；停止有后端语义但前端未接线，见 §13 C-06） | `POST /api/chat`、WS `chat`/`correct` | `p1_conv_chat_idempotency_test.go:58/93/140/190/232/267`、`p1_conv_ws_test.go:234` |
| §6 | PRD-CONV-006 Composer | N/A：纯浏览器输入行为 | 无接口/无字段（唯一边界见 §6） | 前端 `Composer.test.tsx`（非后端证据） |
| §7 | PRD-CONV-007 祖先消息整级加载 | implemented | `GET /api/sessions/{id}/messages/all`、`?scope=all` | `m81_all_messages_test.go:30/44`、`m89_all_messages_errors_test.go:11` |
| §8 | PRD-CONV-008 右栏会话投影 | implemented（交付物条数与产品差 8 vs 3，见 §13 C-04；ETag 为内容摘要，304 已测） | `GET /api/sessions/{id}/spec-projection`（`ETag` + `If-None-Match`） | `m75_spec_projection_test.go:23/71`、`m87_task_message_mapping_test.go:11`、`spec_projection_etag_test.go` |
| §9 | PRD-SYNC-001 WS 连接重连 | implemented | `GET /api/ws`、`subscribe`/`chat`/`correct`/`ping`、事件回放 | `server_test.go:243/301`、`p1_conv_ws_test.go:234/328/386/495`、`m88_ws_fanout_test.go:23` |
| §10 | PRD-SYNC-002 多标签 active/祖先/已读 | N/A：浏览器 BroadcastChannel 状态 | 无接口/无字段 | 前端测试，后端无证据 |
| §11 | PRD-SYNC-003 发送模式跨标签 | N/A：localStorage/BroadcastChannel | 无接口/无字段 | 前端测试，后端无证据 |
| §12 | PRD-SYNC-004 未读 | 待新增（产品裁决：会话级持久化读游标；当前后端无表/接口） | 需新增读游标表、进入即写已读、刷新/重启读回、多标签共享；不新增全站数字 | 无（产品 AC-SYNC-004-03 记 `missing`） |
| §17 | PRD-CONV-009 会话内任务与编排 | implemented（2026-11-25 落地，2026-11-26 复核） | 9 个新增会话内接口、5 个改造接口、`task.*` 6 个 WS 事件；tasks 模块 v8/v9、chat 模块 v23 | `scripts/ac/AC-CONV-009-01.mjs` 至 `-18.mjs`、`scripts/ac/AC-CHG-CONV-007-01.mjs` 至 `-08.mjs` 均已建成并通过；26 条 AC 证据见 `specs/changes/CHG-CONV-007/evidence.md` §1（pass 26 条、断言 560 条） |

**通用约定**

- 成功响应统一 `{"ok":true,...}`；失败有两种形状：`httpserver.WriteError/WriteErrorCode` 产出 `{"ok":false,"error":"<消息>","code":"<code>"}`（`backend/internal/platform/httpserver/server.go:118-157`）；个别端点自拼 `{"ok":false,"error":{"code":...,"message":...}}`（如删除 403、`archive_blocked` 的 `error` 为字符串另带 `blockers`），见 §14。
- 错误码以 `code` 字符串为准，不以前端文案判断。
- 会话 ID：`main` 为主会话；新会话 `sess-<16 hex>`（`backend/internal/modules/sessions/service.go` `newSessionID`）。
- 归档会话默认拒绝一切写操作（发消息、改名、新建子会话、改负责人），只读消息仍可读取（产品 AC 默认拒绝，A6）。
- 幂等键 `clientMutationId` 只对“创建用户消息”生效（`POST /api/chat` 与 WS `chat`），其它 mutation 无幂等。

---

## 1 PRD-CONV-001 会话树与主会话

**状态**：implemented；`AC-001-04` 置顶接口已实现，但“归档会话不可置顶”未守卫（§13 C-02）。

### 1.1 HTTP 契约

| 方法 | 路径 | 入参 | 成功 | 错误 |
|---|---|---|---|---|
| GET | `/api/sessions` | query `q`（可选，标题片段）、`pinned`（可选 `true/false`） | 200 `{"sessions":[Session]}`（含已归档项，`archived` 字段区分；每项带 `messageCount`，语义见下；排序 `pinned DESC, created_at DESC, id DESC`） | 400 `bad_request`“pinned 需为 true/false”；500 `internal`“读取会话失败” |
| GET | `/api/sessions/tree` | 无 | 200 `{"sessions":[Session]（前序扁平）, "tree":[Session（带 children）]}`；两处的每个节点都带 `messageCount` | 500 `internal`“读取会话树失败” |
| POST | `/api/sessions` | body `{parentId?:string, title?:string, draft?:bool}`；缺省 `draft=true` | 201 `{"ok":true,"session":Session,"draft":bool}`；草稿不落库，`session.messageCount=0` | 400 `bad_request`“请求体不是合法 JSON”；404 `not_found`（父不存在）；409 `conflict`（父已归档）；413 `body_too_large` |
| PATCH | `/api/sessions/{id}` | `{title:string}`（TrimSpace 后非空） | 200 `{"ok":true,"session":Session}` | 400 `bad_request`（空标题/非法 JSON）；404 `not_found`；409 `conflict`（已归档）；413 `body_too_large` |
| POST | `/api/sessions/{id}/pin` | 无 | 200 `{"ok":true,"session":Session}`（`pinned=true`） | 404 `not_found` |
| POST | `/api/sessions/{id}/unpin` | 无 | 200 `{"ok":true,"session":Session}`（`pinned=false`） | 404 `not_found` |

`Session` 投影（`backend/internal/core/session/session.go:7-16`）：`id, parentId, title, createdAt, archived(number), pinned(bool), ownerAgentId?, children?[]`。`GET /api/sessions`（含 `?q=` 搜索）与 `GET /api/sessions/tree` 的响应项在此基础上另带 `messageCount`(int)，由 sessions 模块在 HTTP 投影里补齐（`backend/internal/modules/sessions/view.go`）；创建、改名、置顶/取消置顶、归档/取消归档等返回 `Session` 的写接口同样带该字段。语义：`messageCount` 等于该会话**自身**的消息数（`messages.session_id = session.id`），不含子会话、不含其他会话；只计 `internal = 0` 的可见消息，与 `/api/messages` 的返回范围一致；归档会话照常返回真实条数；草稿还没有消息，返回 `0`。列表路径用一条 `GROUP BY session_id` 聚合查询取全部会话的计数（`backend/internal/modules/sessions/counts.go`），不做 N+1 查询；`messages` 表缺失时按 0 输出。`messageCount` 参与列表响应 ETag 摘要，消息增减会让旧 `If-None-Match` 失效。树接口的 `children` 只在 `tree` 里出现，子节点同样带 `messageCount`；`sessions` 为同一批节点前序展开，与 `tree` 内数值一致（`backend/internal/modules/sessions/http.go:152-171`）。

路由注册：`backend/internal/modules/sessions/http.go:15-37`；处理函数 `handleList`（39-84）、`handleTree`（152-171）、`handleCreate`（173-202）、`handleRename`（204-223）、`handlePin/Unpin`（90-113）；错误映射 `writeSessionError`（351-371）。

### 1.2 WS 契约

N/A：会话树、草稿、置顶均为 HTTP 拉取式；WS 不投递 session 级 CRUD 事件（`isWSEventType` 白名单不含 session.*，`backend/internal/modules/chat/http.go:472-487`）。前端在写操作成功后重新 `GET /api/sessions/tree` 或 `GET /api/sessions`。

### 1.3 数据模型

- 表 `sessions`：v1 建表（`id TEXT PRIMARY KEY, title, created_at, archived`，并 seed `main`），v2 增 `parent_id TEXT NOT NULL DEFAULT ''` + `idx_sessions_parent(parent_id, created_at)`，v5 增 `pinned INTEGER DEFAULT 0`、`owner_agent_id TEXT DEFAULT 'simo'`（`backend/internal/modules/sessions/migrations.go`，模块内版本 1–6，最大 v6）。
- 表 `specs`：每个会话一条（v3 建表、v6 扩列；`session_id TEXT UNIQUE` + `idx_specs_session`），由 `insertSpecTx` 在创建会话的同一事务写入。
- 草稿只存内存：`m.drafts`（`backend/internal/modules/sessions/draft.go:20-65`），不写库；首条消息触发 `MaterializeDraft`（67-99）在**单事务**内 `INSERT sessions + insertSpecTx`，事务后 `writeSpecMirror`。
- 读路径：`Tree(ctx)` 读全表 → 内存建树（`service.go`，visited 防环、根=无父或父缺失、全环兜底 main、限深 32）；`listSessions` 排序 `pinned DESC, created_at DESC, id DESC`。列表/树/搜索的 `messageCount` 另用一条 `SELECT session_id, COUNT(*) FROM messages WHERE internal = 0 GROUP BY session_id` 聚合（`counts.go:16`），把结果填进 HTTP 投影，避免逐行查询；`messages` 表缺失时（单模块测试、未迁移旧库）返回空映射、计数按 0 输出。
- 写路径：`Create` → 单事务 INSERT sessions + spec；`Rename` → `UPDATE sessions SET title`；`SetPinned` → 先 `Get` 再 `UPDATE pinned`（`backend/internal/modules/sessions/management.go:47-59`）。

### 1.4 不变量与并发

1. 树单根：`main` 恒存在（v1 seed），`Create` 的 parent 缺省为 `main`，父不存在返回 `ErrNotFound`，父归档返回 `ErrArchived`。
2. 防环：`Tree` 用 visited 集合；`DescendantIDs` 用 BFS 防环，深度默认 16、上限 32；`sessionPath` 投影长度上限 16（`m14_test.go:147` 断言 `0 < len(path) <= 16`）。
3. 草稿唯一：同一会话树最多一个空草稿，复用同一 id 并更新标题（`CreateDraft` 以 `treeRoot` 为键）；草稿不出现在树/列表/owner 探针；重启后内存草稿消失（`m70_test.go:125`）。
4. 草稿物化：并发已落库视为成功（`MaterializeDraft` 内冲突分支），避免重试重复建会话。
5. 置顶排序：所有列表/搜索结果按 `pinned DESC, created_at DESC, id DESC`，不按 `updated_at`。
6. 单写者：树/草稿逻辑假定单进程持有 SQLite（内存草稿表、`m.drafts`）；多实例部署不成立。

### 1.5 可复现证据

- `backend/cmd/simo/p1_conv_sessions_http_test.go:210` `TestP1ConvSessionsCreateContract`：非法 JSON 400、7000 字 title 413、父缺失 404、默认 create 返回 draft=true 且树不可见、`draft:false` 立即出现在树、空标题回退“子会话”、归档父下 create 409。
- `backend/cmd/simo/p1_conv_sessions_http_test.go:282` `TestP1ConvSessionsRenamePinContract`：rename 404/400/413、成功 200 且树同步、`pinned=maybe` 400、pin 后 `pinned=true` 只含置顶且全量首位、unpin 后清零、未知 id 404。
- `backend/cmd/simo/p1_conv_sessions_http_test.go:454` `TestP1ConvDraftScopedPerTree`：同树草稿复用 id、不同树互不影响、草稿不进树、首条消息物化后 parentId 保留且 2 条消息、可再开新草稿。
- `backend/cmd/simo/m4_test.go:134` `TestM4SessionTreeAndRenamePersistAcrossRestart`：重启后标题与子会话持久。
- `backend/cmd/simo/m14_test.go:147` `TestM14SessionPathCycleGuard`：人为制造 parent 环后 `sessionPath` 防环且限深。
- `backend/cmd/simo/m70_test.go:24` `TestM70DraftNotPersistedThenMaterialized`、`:67` `TestM70RestartCleansEmptySessions`、`:125` `TestM70RestartDraftDisappears`。
- `backend/internal/modules/sessions/service_test.go:50` `TestTreeCreateRenameAndDescendants`、`backend/internal/modules/sessions/management_test.go:45` `TestSearchSessionsQueryAndPinnedOrder`、`:141` `TestSetPinnedAndSetOwnerValidation`、`:216` `TestRenameInvalidAndDescendantDepthClamp`。
- `backend/internal/modules/sessions/message_count_test.go:96` `TestSessionMessageCountOwnOnlyAcrossListSearchAndTree`：列表/搜索/树三处计数一致，子会话 3 条、主会话 2 条，`internal=1` 不计入，归档后仍为 3。
- `backend/internal/modules/sessions/message_count_test.go:168` `TestSessionMessageCountDraftIsZero`：草稿响应显式带 `messageCount=0`；`:196` `TestSessionMessageCountWithoutMessagesTable`：无 `messages` 表时列表 200 且计数为 0；`:211` `TestSessionListETagTracksMessageCount`：新增消息后旧 ETag 失效回 200，计数稳定后回 304。

### 1.6 涉及文件

`backend/internal/modules/sessions/http.go`（路由与处理函数）、`service.go`（`ErrNotFound/ErrInvalid/ErrArchived`、`Tree`、`Create`、`Rename`、`DescendantIDs`、`listSessions`）、`draft.go:20-99`、`management.go:47-59`、`migrations.go`（v1–v6）、`counts.go`（`messageCounts/messageCountFor`）、`view.go`（`sessionView` 与树/列表转换）、`backend/internal/core/session/session.go:7-16`。

### 1.7 未实现/出口预期

- `AC-001-04` “归档不可置顶”：现状 `SetPinned` 无 archived 守卫，`POST /api/sessions/{archived}/pin` 会 200 并置顶；产品要求拒绝（具体码未定，见 §13 C-02）。出口：在 `SetPinned` 内 `Get` 后判 `Archived!=0` 返回 `ErrArchived`（409），并补测试。判定=人工；脚本=N/A：守卫未实现，见 §13 C-02。
- 主会话不可归档已实现，见 §2.1/§2.4；错误码为 `main_session_protected`，与产品写的 `main_session_immutable` 不一致（§13 C-01）。

---

## 2 PRD-CONV-002 生命周期（新建/重命名/归档/恢复；删除为非目标）

**状态**：implemented。归档、只读、恢复、canArchive 阻断、失败反馈已实现；删除会话为产品**显式非目标 / backlog**（`REQ-CONV-002-03`），不实现，`DELETE` 固定 403 为保护性占位。

### 2.1 HTTP 契约

| 方法 | 路径 | 入参 | 成功 | 错误 |
|---|---|---|---|---|
| POST | `/api/sessions/{id}/archive` | 无 body | 200 `{"ok":true,"session":Session}`（`archived=1`）；重复归档 200 幂等 | 404 `not_found`；409 `archive_blocked` + `blockers:[string]`（有 queued/running 任务或验收键缺证据）；409 `main_session_protected`（`id=="main"`，`archived` 不变）；500 `internal` |
| POST | `/api/sessions/{id}/unarchive` | 无 body | 200 `{"ok":true,"session":Session}`（`archived=0`，spec 状态回 `confirmed`）；`main` 未归档时 200 no-op | 404 `not_found`；500 `internal` |
| DELETE | `/api/sessions/{id}` | 无（产品未开放；非目标） | 不提供；固定 403 保护性占位 | 恒 403 `{"ok":false,"error":{"code":"R4_CONFIRM_REQUIRED","message":"删除会话需人工确认"}}`；不解析 body、不校验 id |
| POST | `/api/chat`（归档会话） | `{sessionId,...}` | — | 409 `session_archived`“会话已归档（只读），请先 unarchive” |
| PATCH | `/api/sessions/{id}`（归档会话） | `{title}` | — | 409 `conflict`（`ErrArchived`） |
| POST | `/api/sessions`（归档父下） | `{parentId}` | — | 409 `conflict`（`ErrArchived`） |

`archive_blocked` 的响应是自拼形状：`{"ok":false,"error":"无法归档","code":"archive_blocked","blockers":[...]}`（`backend/internal/modules/sessions/http.go:208-222`）；`main_session_protected` 由 `writeSessionError` 输出 `{"ok":false,"error":"主会话不可归档","code":"main_session_protected"}`（344-345）。

### 2.2 WS 契约

- 帧 `chat` 到归档会话：服务端只回 `error` 帧，不产生 `message.created/reply.*`；`error.data = {code:"session_archived", message:"会话已归档（只读），请先 unarchive", text:<原始文本>}`（`backend/internal/modules/chat/http.go:344-363`；`backend/cmd/simo/m6_test.go:100` 断言无 reply.done/message.done、code=session_archived、text 原样回传）。
- 其它帧不受归档影响；`subscribe` 可继续订阅该会话的历史/增量事件（只读）。
- 归档/恢复本身不推送 WS 事件，前端写成功后重新拉树与消息。

### 2.3 数据模型

- `sessions.archived INTEGER`（v1）：读 `Get/List/Tree`，写 `Archive` 的事务 `UPDATE sessions SET archived=1`（`backend/internal/modules/sessions/spec.go:292-332`）。
- `specs.status`：归档后置 `archived`，恢复置 `confirmed`；`updateSpec` 每次都 `Version++`、`updated_at=now`、UPSERT，事务后写 mirror（`spec.go:143-186`）。
- `CanArchive`（`spec.go:97-141`）：读 `tasks`（该会话 queued/running）+ `specs.evidence/acceptance_keys`，返回 `ArchiveCheck{Allowed,Blockers}`；不写库。
- 删除：**产品显式非目标，后端不实现**。`DELETE /api/sessions/{id}` 保留固定 403 `R4_CONFIRM_REQUIRED` 作为保护性占位；`session.delete` 动作同样 403（`backend/internal/modules/chat/actions.go`，`m20_test.go:47-50`）。下述级联顺序仅作为 backlog 设计，不属本轮：先删子会话（`DescendantIDs` 的逆序），再删 `sessions`，以及 `specs/spec_transitions/spec_evidence/session_overviews/client_mutations/messages/...`。

### 2.4 不变量与并发

1. 主会话不可归档：`Archive` 在 `getSession` 后立即判 `id=="main"` → `ErrSessionProtected`（`spec.go:297-301`），在 `CanArchive` 之前；因此 main 永远 `archived=0`，且不进入 blockers 逻辑。`unarchive main` 由于 `archived=0` 直接返回原 session（200），不改 spec。
2. 归档幂等：已归档再 archive 返回 200 原 session，不重复写 spec。
3. 归档只读：`startTurnExplicit` 在创建 turn 前判 `session.Archived != 0` → `session_archived`（`loop.go:167-171`）；`Rename` 判 `ErrArchived`；`Create` 判父归档。前端隐藏按钮不是唯一防线（产品 A6 默认拒绝）。
4. canArchive 阻断：只有 `task.status ∈ {queued, running}` 与“验收键缺证据”两类 blocker；`done` 任务视为满足，`failed/cancelled/interrupted` 不阻断。
5. 事务边界：归档是**两个事务**——先 `UPDATE sessions SET archived=1`，再 `updateSpec(status=archived)`；两步之间崩溃会留下 `archived=1 + spec 未归档` 的不一致（见 §15 T-04）。`unarchive` 同样先 sessions 后 spec。
6. 删除（显式非目标）：不做级联、不做确认令牌、不做乐观移除；`DELETE` 与 `session.delete` 都固定 403，任何 id 都不得删除数据。

### 2.5 可复现证据

- `backend/cmd/simo/m6_test.go:66` `TestM6ArchiveReadonlyAndUnarchive`：归档后 chat 409、rename 409、历史可读、unarchive 200、恢复后可发。
- `backend/cmd/simo/m6_test.go:100` `TestM6ArchivedChatWSReturnsErrorNotReply`：WS 发聊天只回 `session_archived` 错误帧，无回复帧。
- `backend/cmd/simo/m6_test.go:139` `TestM6CanArchiveGateBlocksRunningTask`：运行中任务归档 409 且 body 含 `blockers`；任务 done 后归档 200。
- `backend/cmd/simo/m6_test.go:157` `TestM6ArchiveReadonlyMemory`：归档会话的 chat 被拒且不写记忆，恢复后可写。
- `backend/cmd/simo/p1_conv_sessions_http_test.go:377` `TestP1ConvSessionArchiveLifecycleReadonly`：archive 未知 404、重复 200 幂等、归档父下 create 409、失败写入不落脏消息、unarchive 后改名/发消息恢复。
- `backend/cmd/simo/p1_conv_sessions_http_test.go:557` `TestMainSessionArchiveRejected`：main archive 409 `main_session_protected`（561、582 行），main 消息 `archived=false`，main 仍可 chat，重复 archive 仍 409，main unarchive 200 no-op（585-588）。
- `backend/cmd/simo/p1_conv_sessions_http_test.go:355` `TestP1ConvSessionDeleteRequiresConfirmation`：DELETE main 与子会话都 403 `R4_CONFIRM_REQUIRED`，树/列表不变；**保留并强化为保护性占位断言**（任何 id 都 403）。
- `backend/cmd/simo/m20_test.go:47`：动作层 `POST /api/actions/session.delete {id:"main"}` 403（注意：这不是 `DELETE /api/sessions/{id}` 的证据，见 §13 C-08）。
- `backend/internal/modules/sessions/service_test.go:155` `TestArchiveReadonlyAndCanArchiveGate`：服务层归档门禁与只读。

### 2.6 涉及文件

`backend/internal/modules/sessions/http.go:68-70、208-231、334-349`、`spec.go:97-186、292-353`、`service.go`（`ErrArchived/ErrArchiveBlocked/ErrSessionProtected`）、`backend/internal/modules/chat/loop.go:167-171`、`backend/internal/modules/chat/http.go:251-252`。

### 2.7 非目标与待办（删除）

- `DELETE /api/sessions/{id}`：产品**未开放（显式非目标）**，后端不实现确认令牌/204/级联；现状固定 403（`http.go:68-70`）是**保护性占位**，不得被误读为“待补功能”。
- **待办（后端 owner）**：补一条断言钉住“任何 id 的 DELETE 都 403 `R4_CONFIRM_REQUIRED`、树/列表不变”，防止后续有人误开删除；`TestP1ConvSessionDeleteRequiresConfirmation` 保留并强化，不新增级联用例。
- 删除后的 WS 行为不再定义（因为不删除）；后续若产品推翻非目标，须新开 CHG 并在此补确认令牌、主会话拒绝、级联事务、回滚与 WS 语义。

---

## 3 PRD-CONV-003 搜索与未读（标题搜索）

**状态**：implemented（标题搜索）；消息正文搜索为 P2 保留接口；未读持久化游标待新增（§12）。

### 3.1 HTTP 契约

| 方法 | 路径 | 入参 | 成功 | 错误 |
|---|---|---|---|---|
| GET | `/api/sessions` | query `q`（可选） | 200 `{"sessions":[Session]}`；`q` 非空时 `title LIKE '%q%'`，跨全部会话（含子会话与已归档），结果同样 `pinned DESC, created_at DESC, id DESC`，每项带 `messageCount`（语义同 §1.1）；`q` 空且无 `pinned` 返回全部 | 400 `bad_request`（`pinned` 非 true/false）；500 `internal` |
| GET | `/api/messages/search` | query `sessionId`（默认 main）、`q`、`includeChildren?` | 200 `{"ok":true,"messages":[...],"total":N}`；`internal=0 AND text LIKE '%q%'`，`LIMIT 50`，无分页游标 | 500 `internal`“搜索消息失败” |
| GET | `/api/sessions?q=`（未命中） | — | 200 `{"sessions":[]}`（空数组，非 404） | — |

`q` 在 SQL 层用 `%q%` 绑定参数（无注入）；首尾空白由 HTTP 层 TrimSpace（`SearchSessions` 亦 TrimSpace，`management_test.go:100-107` 断言）。搜索没有分页、没有 `archived` 开关：是否展示归档项由前端过滤（列表项带 `archived`）。

### 3.2 WS 契约

N/A：搜索为一次性 HTTP 查询，不产生 WS 帧，也不写入事件日志。

### 3.3 数据模型

- 表 `sessions.title`（v1）；搜索 `SELECT ... WHERE title LIKE ? [AND pinned=?] ORDER BY pinned DESC, created_at DESC, id DESC`（`backend/internal/modules/sessions/management.go:12-45`）。无标题索引，`%q%` 为全表扫描（见 §15 T-05）。搜索结果与列表共用 `counts.go` 的会话级消息数聚合，不按搜索结果逐行计数。
- `messages` 搜索：`WHERE internal=0 AND text LIKE ? [AND session_id IN (...)] LIMIT 50`（`backend/internal/modules/chat/http.go:150-197`）；`internal` 列 v19 引入，历史内部控制文本在迁移中被置 1。
- 未读：无表、无列（§12）。

### 3.4 不变量与并发

1. 标题搜索不区分大小写以外语义（SQLite `LIKE` 对 ASCII 不区分大小写，对中文按字节匹配）；不支持分词/拼音/正文。
2. 搜索命中集包含归档会话与子会话，不递归限制层级。
3. 空 `q` 等价于“全部会话”（与 `pinned` 可组合）；`pinned` 非法时 400，不降级。
4. 消息搜索永远过滤 `internal=1`，与 `/api/messages` 的消息纯度一致（`m79_internal_history_test.go:11`）。
5. 只读路径，无事务；并发写（rename）期间可能读到旧标题（无快照隔离要求）。

### 3.5 可复现证据

- `backend/cmd/simo/ui1_test.go:97` `TestUI1SessionSearchAndPin`：`GET /api/sessions?q=搜索目标` 200 命中标题；pin 后 `pinned=true` 含该项；unpin；`pinned=false&q=` 仍命中。
- `backend/internal/modules/sessions/management_test.go:45` `TestSearchSessionsQueryAndPinnedOrder`：无条件返回全部、`需求` 命中 3 个且不命中 main、`Alpha` 精确 1 个、未命中空列表、首尾空白裁剪、pinned 过滤与置顶排序。
- `backend/cmd/simo/m79_internal_history_test.go:11` `TestM79LegacyInternalMessagesHiddenFromAPI`：`/api/messages/search?q=[卡片操作]` 不返回 `internal=1` 的历史消息。

### 3.6 涉及文件

`backend/internal/modules/sessions/http.go:39-66`、`management.go:12-45`、`backend/internal/modules/chat/http.go:150-197`、`backend/internal/modules/chat/migrations.go`（v19 `internal`）。

### 3.7 未实现/出口预期

- 消息正文搜索降 P2：接口保留但前端不再作为标题搜索入口；无未读字段（§12）。
- `AC-003-02` “搜索失败回退空结果 + 提示”是前端行为；后端失败为 500 `internal`，前端需 try/catch 后展示提示并把列表置空（不伪造 0 结果）。判定=人工；脚本=N/A：该 AC 是前端行为，前端验收见 test-plan。

---

## 4 PRD-CONV-004 消息流与渲染（后端投影）

**状态**：implemented。渲染（Markdown/代码块/复制/流式光标）为前端；后端保证消息投影、分页、纯度与编辑禁用。

### 4.1 HTTP 契约

| 方法 | 路径 | 入参 | 成功 | 错误 |
|---|---|---|---|---|
| GET | `/api/messages` | query `sessionId`（默认 `main`）、`includeChildren=true/false`、`limit`、`before` | 200：分页（`limit>0` 或 `before!=""`）`{"messages":[...],"hasMore":bool,"nextBefore":string}`；非分页 `{"messages":[...]}` | 500 `internal`“读取消息失败” |
| GET | `/api/sessions/{id}/messages` | path id | 200 全量（无分页，等同 `/messages/all`） | 400 `invalid_session`；400 `invalid_scope`；404 `session_not_found`；413 `messages_too_many`；500 |
| GET | `/api/sessions/{id}/messages/all` | 同上 | 同上 `{ok,sessionId,scope:"all",archived,messages,total,pagination:false}` | 同上 |
| POST | `/api/messages/{id}/edit` | — | — | 400 `edit_disabled`“消息编辑/修改已禁用，历史消息不会被修改” |
| POST | `/api/messages/{id}/correct` | — | — | 400 `edit_disabled` |
| PATCH | `/api/messages/{id}` | — | — | 400 `edit_disabled` |

`Message` 投影字段（`backend/internal/modules/chat/model.go:10-33`）：`id, sessionId, sessionTitle?, role, text, at, finishedAt?, status, attachments[], taskId, workflowId?, tool?, approvalId?, category, sessionPath[], replyToId?, replyTo?, agentId?, routedFrom?, routedTo?, internal?, cards?[]`。`role ∈ {user, agent}`；`status ∈ {streaming, done, error, retracted, failed}`；`sessionPath` 根→当前、上限 16 级；`attachments` 来自 `uploads/message_attachments`。

分页规则（`backend/internal/modules/chat/http.go:81-143`）：`paged := limit>0 || before!=""`；`pageLimit` 缺省 30、上限 200；返回按时间倒序取 `before` 之前的一页，`nextBefore` 为页内最后一条 id；非分页返回全部（无 `hasMore/nextBefore`）。

`includeChildren=true`：先用 `sessions.DescendantIDs(sessionID, 16)` 取自身+后代 id，再按 id 集合查询；会话不存在时返回 200 空列表（不 500，`p1_conv_messages_http_test.go:91` 末段断言）。

### 4.2 WS 契约

消息增量只通过 SYNC-001 的事件帧投递，本节只约定载荷：

| 帧 type | data | 说明 |
|---|---|---|
| `message.created` | 完整 `Message`（用户消息/agent 占位回复） | `internal=1` 或内部控制文本会被 `suppressWSEvent` 抑制，不投递（`http.go:493-506`） |
| `message.delta` | `{"id":string,"delta":string}` | 追加到对应消息；`delta` 为空不投递（`server_test.go:243` 断言） |
| `message.done` | `{"id":string,"status":"done"|"error"|"failed"|"retracted","reason?":string}` | 收尾；`status=retracted` 时正文已被撤回 |
| `message.status` | `{"state":"thinking"|"idle"}` | 会话级流式状态 |
| `reply.created/delta/done/retracted` | 分别为完整 `Message` / `{id,delta}` / `{id,status,reason?}` / `{id,reason}` | 与 `message.*` 并行；测试以两者交叉断言顺序 |

### 4.3 数据模型

- 表 `messages`：v1 `id TEXT PRIMARY KEY, session_id, role, text, at, status` + `idx_messages_session_at(session_id, at)`；v7 `task_id, workflow_id`；v8 `tool, approval_id`；v10 `category`（回填 agent 为 `consultation`）；v11 `reply_to_id`；v18 `finished_at`；v19 `internal`（回填历史控制文本为 1）。模块版本最大 v22。
- 表 `uploads`/`message_attachments`：v4；一条消息最多 5 个附件（`backend/internal/modules/chat/attachments.go:23`）。
- 表 `message_cards`/`card_versions`/`card_action_receipts`：v16；卡片随消息投影 `cards[]` 下发（只读渲染）。
- 读路径：`listMessagesForSessions`（非分页，`internal=0`）/`listMessagesPage`（分页）；读后附加 `sessionTitles/sessionPaths/replySnapshots/agentIDs/cards/routeFields/finishedAt`（`http.go:112-121`）。
- 写路径：`startTurnExplicit` 单事务写 user 消息 + `turns` + 占位 agent 回复（`loop.go:136-269`）；流式过程中更新回复正文；`finish` 写 `status=done, finished_at`。
- 编辑接口：路由直接挂 `handleEditDisabled`（`module.go:177-179`），不读 body、不查库。

### 4.4 不变量与并发

1. 消息纯度：任何对外消息列表/搜索/WS 都不含 `internal=1`；卡片动作产生的内部文本仍能生成 agent 回复，但不产生 user 消息（`m78_internal_message_test.go:23`）。
2. 不可编辑：所有编辑/修正 HTTP 路由 400 `edit_disabled`；WS `correct` 带 `targetMessageId` 返回 `edit_disabled` 错误帧；历史消息正文永不改写（`m50_test.go:14、75`）。
3. 时间序：查询按 `at ASC`（同毫秒按 `rowid ASC`）返回；分页页内同样正序，`before` 游标为消息 id（非时间戳），不重不漏。
4. 全量接口保护：`COUNT(*) WHERE internal=0 > 50000` 直接 413 `messages_too_many`，不做流式截断（`all_messages.go:45-52`）。
5. 并发写：同一消息的 delta 由单 turn goroutine 顺序追加；客户端收到的事件 id 单调递增（§9）。

### 4.5 可复现证据

- `backend/cmd/simo/m11_test.go:73` `TestM11MessagePagination`：`limit=10` 首页 10 条 + `hasMore/nextBefore`，续页不重复，缺省仍全量。
- `backend/cmd/simo/p1_conv_messages_http_test.go:91` `TestP1ConvMessagePaginationClampAndCursor`：`limit=500` 截 200、两页覆盖 210 条不重、`before` 不存在返回空页、缺省全量无分页字段、未知会话 + includeChildren 返回 200 空列表。
- `backend/cmd/simo/p1_conv_messages_http_test.go:190` `TestP1ConvMessageAggregateAncestorChain`：includeChildren 聚合 6 条、`sessionTitle/sessionPath` 投影、祖先链时间升序、分页不重不漏。
- `backend/cmd/simo/m50_test.go:14` `TestM50MessageEditingDisabled`、`:75` `TestM50WebSocketEditRejected`：HTTP 三路编辑 400 `edit_disabled`，动作目录不暴露 `chat.correct`，历史不变；WS `correct` 带 target → 错误帧。
- `backend/cmd/simo/m78_internal_message_test.go:23/75`、`backend/cmd/simo/m79_internal_history_test.go:11`：内部消息不污染用户消息流/历史/搜索；手工发送内部控制文本 400。
- `backend/cmd/simo/m41_test.go:31` `TestM41CardsSendGetPatchAndActions`：卡片随消息投影与动作闭环（只读展示面）。

### 4.6 涉及文件

`backend/internal/modules/chat/http.go:81-148`、`backend/internal/modules/chat/model.go:10-33`、`backend/internal/modules/chat/all_messages.go`、`backend/internal/modules/chat/migrations.go`（v1/v7/v8/v10/v11/v16/v18/v19）、`backend/internal/modules/chat/attachments.go`、`backend/internal/modules/chat/cards.go`。

### 4.7 未实现/出口预期

- 产品 `AC-004` 写“消息分页默认 100 条”，实现是“缺省全量 / 显式分页缺省 30 / 上限 200”（§13 C-05）。前端当前按自己的页大小请求；后端未提供默认 100 的兜底。
- `/api/sessions/{id}/messages` 是全量别名（无分页），大会话只能靠 413 上限保护；建议前端改用 `/api/messages?limit/before`（属前端取舍，见 §15 T-07）。

---

## 5 PRD-CONV-005 发送·流式·重连（含幂等）

**状态**：implemented（`clientMutationId` 幂等为本轮新增；停止的后端语义存在，但前端未接线，见 §13 C-06）。

### 5.1 HTTP 契约

`POST /api/chat`（`backend/internal/modules/chat/http.go:208-242`）

请求体（`Content-Type: application/json`，最大 64 KiB）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sessionId` | string | 否 | 缺省 `main`；显式传参时关闭意图路由的“新需求建子会话”兼容分支 |
| `text` | string | 条件必填 | TrimSpace 后非空，或至少 1 个附件；UTF-8 字符数 ≤ 4000（`loop.go:23、137-150`） |
| `attachments` | string[] | 否 | 最多 5 个 upload id，必须属于该会话 |
| `replyToMessageId` | string | 否 | 引用消息；不存在/跨会话非法时 400 且不落脏 |
| `clientMutationId` | string | 否 | 幂等键；缺省则不去重 |

成功：**202** `{"ok":true,"messageId":"<user msg id>","id":"<同值>"}`；若为重复提交，追加 `"idempotent":true` 且 `messageId` 为**首条**用户消息 id（同一次提交的重试返回同一 id）。响应不等待模型/任务，流式结果走 WS 事件。

错误（`writeRequestError`，244-272）：

| HTTP | code | 触发 |
|---|---|---|
| 400 | `bad_request` | 空文本、文本 > 4000 字、非法 JSON、内部控制文本（`[卡片操作]/[系统]/[内部]/[tool]` 等） |
| 400 | `invalid_attachment` / `too_many_attachments` | 附件不存在/不属于该会话/超过 5 个 |
| 400 | `invalid_path` | 附件路径非法 |
| 404 | `session_not_found` | 草稿物化后仍找不到会话（竞态兜底） |
| 409 | `session_archived` | 会话已归档（只读） |
| 409 | `mutation_in_progress` | 同一 `clientMutationId` 的首次请求仍在处理（占位 `message_id=''`），等待 5s 超时 |
| 413 | `body_too_large` / `file_too_large` | 请求体 > 64 KiB / 单附件 > 20 MiB |
| 500 | `internal` | 其它（“发送消息失败”） |

### 5.2 WS 契约

- `chat` 帧：`data = {sessionId?, text, attachments?, replyToMessageId?, clientMutationId?}`；服务端收到后先 `startSubscription(0,false)`（避免丢自身事件），再 `startTurnIdempotent`；成功**不回 ack**，客户端以 `message.created`（用户消息）与后续 `reply.*/message.*` 为成功信号；失败回 `error` 帧 `{code,message,text}`（text 原样回传，便于前端保留输入）。
- 重复 `clientMutationId`：不产生新事件、不回 ack（幂等结果只在 HTTP 响应里可见）；客户端应把“无新 `message.created`”与已存在的同文本消息视为已发送（§13 C-06 说明前端缺口）。
- 停止：`correct` 帧且 `targetMessageId` 为空、`text` 为空 → 取消该会话最近一个 active turn，流式回复被 **撤回**（`status=retracted`，事件 `reply.retracted`，turn 状态 `retracted`），不再追加 delta；`correct` 带 `text` 则取消后以 `ClassCorrect` 重新起一轮；`correct` 带 `targetMessageId` → `edit_disabled` 错误帧（`http.go:364-380`、`loop.go:1106-1134`、`loop.go:494-515`）。
- `ping` 帧 no-op（服务端自身 30s 控制 ping 已足够）。
- 同一会话并发：后端**不**串行化不同 `clientMutationId` 的 turn；多个 turn 可同时在途，`m.active` 按 replyId 存多条。前端“同一时刻一个在途”由 `sendingRef` 保证（`frontend/src/app.tsx:430-433`），不是后端不变量。

### 5.3 数据模型

- 表 `client_mutations`（迁移 Version 22，“chat client mutation idempotency”，`backend/internal/modules/chat/migrations.go:593-609`）：

  | 列 | 类型 | 约束 |
  |---|---|---|
  | `id` | TEXT | PRIMARY KEY（即 `clientMutationId`） |
  | `session_id` | TEXT | NOT NULL |
  | `message_id` | TEXT | NOT NULL DEFAULT ''（'' = 占位/进行中） |
  | `created_at` | INTEGER | NOT NULL（毫秒） |
  | `updated_at` | INTEGER | NOT NULL |

  索引 `idx_client_mutations_created(created_at)`。
- 表 `messages`/`turns`：user 消息与占位回复在同一 turn 创建（§4.3）；`turns` v2（`id, session_id, status, started_at, ended_at`）。
- 写路径（`backend/internal/modules/chat/idempotency.go`）：
  1. `startTurnIdempotent`（40-66）：`clientMutationId` 空白 → 直接 `startTurnExplicit`，返回 `(msgID,false)`；
  2. `beginClientMutation`（70-127）：最多 3 次尝试；事务内先 `DELETE FROM client_mutations WHERE created_at < now-7d`，再 `INSERT (id, session_id, '', now, now)`；
  3. 唯一键冲突 → `readClientMutation`：不存在（刚被释放）重试；`message_id != ''` → 视为重复，返回首条 id；`message_id == ''` → 每 20ms 轮询至 5s，超时返回 `mutation_in_progress`；
  4. 成功起 turn 后 `finishClientMutation`（143-153）：用**脱离请求上下文**的 2s 超时 `UPDATE message_id`；失败只 Warn（不阻断发送）；
  5. `startTurnExplicit` 失败 → `releaseClientMutation`（155-164）`DELETE ... WHERE id=? AND message_id=''`，失败不记忆，允许客户端换/同 id 重试。
- 读路径：仅 `readClientMutation`（按主键 `SELECT`）；无列表接口、无清理任务。

### 5.4 不变量与并发

1. 唯一键 claim：`client_mutations.id` 主键即分布式锁；同一 id 的并发 N 个请求只有一个能 INSERT 成功，其余走“读占位/轮询/重复返回”。
2. 失败不记忆：turn 创建失败时删除占位；因此“失败重试”会创建新消息（幂等只防“成功后的重试”，不防失败重试）。
3. 完成写脱钩：`finishClientMutation` 在响应返回后仍可能执行，失败会导致占位长期为 ''，直到 7 天 TTL 被下一次写入清理（见 §15 T-01）。
4. 主键仅 `id`：不校验 `session_id` 一致；同一 id 跨会话复用时第二个会话会拿到第一个会话的 `messageId`（§15 T-02）。契约要求客户端生成全局唯一 id。
5. TTL：7 天（`clientMutationTTL`），**只在写路径被顺带清理**，没有后台清理 goroutine；占位残留最长可超过 7 天（无写入则永不清理）。
6. 断电/崩溃：占位与 `message_id` 落 SQLite；进程崩溃后重启，占位仍在，重复提交会 409 直到 TTL 清理（测试只覆盖优雅重启，见 §15 T-03）。

### 5.5 可复现证据

- `backend/cmd/simo/p1_conv_chat_idempotency_test.go:58` `TestP1ConvChatClientMutationIdDedupesRetry`：首提 202 无 `idempotent`；同 id 重试 202 同 `messageId` + `idempotent:true`；仅 1 条 user、共 2 条。
- `:93` `TestP1ConvChatClientMutationIdDistinctCreatesTwo`：不同 id 产生两条 user。
- `:114` `TestP1ConvChatClientMutationIdOptionalLegacyBehavior`：缺省 id 不去重、响应无 `idempotent`。
- `:140` `TestP1ConvChatClientMutationIdConcurrentRetries`：5 并发同 id 全 202、同 `messageId`、只 1 条 user。
- `:190` `TestP1ConvChatClientMutationIdWebSocket`：WS 同 id 两帧只落 1 条 user。
- `:232` `TestP1ConvChatClientMutationIdInProgressConflict`：手工占位后重试 409 `mutation_in_progress`、0 条消息。
- `:267` `TestP1ConvChatClientMutationIdPersistsAcrossRestart`：重启后同 id 仍返回首条 + `idempotent:true`、仅 1 条。
- `backend/cmd/simo/p1_conv_messages_http_test.go:325` `TestP1ConvChatRequestValidation`：空文本 400、4001 字 400、70KB body 413、非法 JSON 400、未知 replyToMessageId 4xx 且不落脏。
- `backend/cmd/simo/p1_conv_ws_test.go:234` `TestP1ConvWSReplyLifecycleOrderAndDeltas`：user.created < reply.created < agent.created < status(thinking) < delta… < reply.done < message.done < status(idle)，所有 delta 拼接等于落库正文。
- `backend/cmd/simo/m2_test.go:49` `TestM2MockStreamRecordsUsageAndDecision`、`:181` `TestM2Retraction`：流式 usage/决策落库与撤回语义。
- `backend/cmd/simo/m55_test.go:17/57`：启动修复残留 streaming 为 failed（“服务重启”）、看门狗空闲超时置 failed（“回复超时”）。

### 5.6 涉及文件

`backend/internal/modules/chat/http.go:208-272、344-363、364-380`、`backend/internal/modules/chat/idempotency.go:29-164`、`backend/internal/modules/chat/loop.go:23-24、136-269、494-515、1076-1134`、`backend/internal/modules/chat/migrations.go:593-609`、`backend/internal/modules/chat/attachments.go:23-32`。

### 5.7 未实现/出口预期

- 前端 `stopStreaming` 只做本地忽略 + `eventsRef.current?.stop()`（`frontend/src/app.tsx:423-428`），**未发送** `correct{targetMessageId:"",text:""}`；因此服务端 turn 继续跑，停止语义未端到端成立（§13 C-06）。后端契约已具备，前端接线属前端 scope。
- WS 重复提交无 ack：前端无法在不重拉消息的情况下确认“已发送”；当前靠 HTTP 发送（前端确实走 `sendChat`，`app.tsx:437-438`），WS chat 幂等主要对旧客户端/直连测试生效。
- 后端不拒绝并发 turn；产品“同一时刻一个在途”目前只是前端约束（§13 C-07）。

---

## 6 PRD-CONV-006 Composer（Enter/Shift+Enter、IME）

**状态**：N/A：纯浏览器输入行为，后端无状态。

- **HTTP 契约**：N/A：Composer 不新增接口，统一走 `POST /api/chat`（§5.1）。
- **WS 契约**：N/A：不新增帧类型；发送仍用 `chat` 帧（§5.2）。
- **数据模型**：N/A：发送模式存 `localStorage["simo.composer.sendMode"]`，不落库、不上传、无后端字段。
- **不变量与并发**：N/A：IME 组合中 Enter 不发送、Ctrl/⌘+Enter 恒发送均为前端键盘事件处理；后端唯一相关约束是 `text` 经 `TrimSpace` 且 ≤4000 字（§5.1），与输入法无关。
- **可复现证据**：后端无证据；前端证据为 `frontend/src/components/Composer.test.tsx`（AC-006-01/02）。真实中文 IME 未手测（产品已记录）。
- **涉及文件**：无后端文件；边界仅 `backend/internal/modules/chat/loop.go:137-150`（文本裁剪/长度校验）。
- **出口预期**：无后端工作项；若将来要求“发送模式随账号同步”，才需要新增用户偏好接口（当前产品未要求）。

理由（≥8 字）：Enter/Shift+Enter、Ctrl/⌘+Enter、IME composition、localStorage 均为浏览器端行为，服务端不感知也不持久化。

---

## 7 PRD-CONV-007 祖先消息整级加载

**状态**：implemented。后端只提供“单会话全量消息”；逐级聚合、去重、弱化、时间轴跳转在前端。

### 7.1 HTTP 契约

| 方法 | 路径 | 入参 | 成功 | 错误 |
|---|---|---|---|---|
| GET | `/api/sessions/{id}/messages/all` | path id；query `scope`（可空或 `all`） | 200 `{"ok":true,"sessionId":id,"scope":"all","archived":bool,"messages":[Message],"total":N,"pagination":false}`，按 `at ASC, rowid ASC` | 400 `invalid_session`“sessionId 不能为空”；400 `invalid_scope`“scope 只支持 all”；404 `session_not_found`“会话不存在”；413 `messages_too_many`；500 `internal`“读取消息失败” |
| GET | `/api/sessions/{id}/messages` | 同上 | 同 `/messages/all`（同一 handler） | 同上 |

- `total` 为本次返回的消息条数（非全库计数）；响应不带 `hasMore/nextBefore`（`m81_all_messages_test.go:63` 断言不得出现分页字段）。
- `archived` 反映该会话当前是否归档（归档仍允许读取历史；`main` 恒 false）。
- 全量上限 50000（`maxAllSessionMessages`，`backend/internal/modules/chat/all_messages.go:45-52`）：统计只算 `internal=0`；超限整个请求 413，不返回部分数据。

### 7.2 WS 契约

N/A：历史全量由 HTTP 读取；WS 只投递增量消息事件（§9），不提供“历史分页”帧，也不回放 50000 条以外的数据（回放受 events 保留影响，见 §15 T-06）。

### 7.3 数据模型

- 表 `messages`（列见 §4.3）；查询 `WHERE session_id=? AND internal=0 ORDER BY at ASC, rowid ASC`；计数同条件。
- 祖先链由前端对每个祖先会话各发一次 `/messages/all` 再合并；后端不做跨会话聚合（`/api/messages?includeChildren=true` 是另一条聚合路径，按 id 集合查询）。
- 无新增表/迁移；纯读路径，无事务写。

### 7.4 不变量与并发

1. 单会话边界：本接口只返回 path id 对应会话的消息，不含父/子；前端逐级调用。
2. 排序稳定：`at ASC, rowid ASC`；同毫秒按插入顺序，保证重复加载不颠倒。
3. 去重：后端不返回重复 id（单表查询）；跨会话合并去重由前端按 `id` 做（产品 AC-007-01）。
4. 413 不降级：超 50000 直接失败，不截断、不伪造 total；前端需提示并可重试（产品 AC-007-02）。
5. 403：本接口**不返回 403**（单用户后端无鉴权中间件）；`m89_all_messages_errors_test.go:11` 在测试内显式记录“403 N/A”。产品“403 视为无上级继续”只能在前端 mock 层验证（§13 C-09）。
6. 归档只读不阻断读取：`archived=true` 时仍 200。

### 7.5 可复现证据

- `backend/cmd/simo/m81_all_messages_test.go:30` `TestM81AllSessionMessages`：空 main 200 total=0、messages 空数组、pagination=false；未知会话 404；`scope=bad` 400。
- `backend/cmd/simo/m81_all_messages_test.go:44` `TestM81AllSessionMessagesOrderAndShape`：3 轮后 total=len(messages)≥6、无 hasMore/nextBefore、按 at 正序、每条有 category、user 文本顺序正确、main archive 409、main all archived=false、子会话归档后 200 + archived=true + total=2。
- `backend/cmd/simo/m89_all_messages_errors_test.go:11` `TestM89AllMessagesLimitsAndErrors`：未知会话 404；403 明确 N/A；插入 50001 条后 413 且 body code=`messages_too_many`。
- `backend/cmd/simo/m81_all_messages_test.go:85`：主会话归档请求 409（产品 spec 引用该行时描述为“把归档 main 当成功”已过时，见 §13 C-10）。

### 7.6 涉及文件

`backend/internal/modules/chat/all_messages.go:13-76`、`backend/internal/modules/chat/module.go:174-175`、`backend/internal/modules/chat/http.go:81-143`（聚合路径 `includeChildren`）。

### 7.7 未实现/出口预期

- 前端 413 重试与 403 容错为前端行为；后端不提供分页式历史接口（如需 >50000，需新增游标接口，属后续变更）。
- 逐级加载没有服务端合并接口：前端 N 个祖先发 N 次请求；产品接受该方案（AC 未要求批量接口）。

---

## 8 PRD-CONV-008 右栏会话投影

**状态**：implemented（交付物条数与产品 8 条不一致，见 §13 C-04）。

### 8.1 HTTP 契约

`GET /api/sessions/{id}/spec-projection?taskLimit=<1..50>`（`backend/internal/modules/sessions/spec_projection.go:99-162`）

| 项 | 值 |
|---|---|
| 入参 | path id 必填；query `taskLimit` 可选，整数，缺省 3，合法区间 1–50 |
| 成功 | 200 `specProjection` JSON（见下）；带 `ETag: "spec-<16 位十六进制>"` 与 `Cache-Control: no-cache`。摘要取响应的规范化 JSON 与本次生效的 `taskLimit` 做 SHA-256（前 8 字节），覆盖 `status`、`revision`、`updatedAt`、`goal`、`constraints`、`inputs`、三组 `tasks` 的 `total/items/hasMore`、`deliverables`、`pendingConfirmations` 与 `links` |
| 条件请求 | `If-None-Match` 按 `etagMatches` 命中当前摘要（精确标签、`W/` 弱标签、逗号分隔多值、`*` 均算命中）→ **304**，空 body，同样带 `ETag` 与 `Cache-Control: no-cache`。前端收到 304 必须保留现有投影数据，不得当错误显示 |
| 条件未命中 | 投影内容变化（任务状态/新增任务、交付物、待确认项、消息映射、spec 字段或 `taskLimit`）会让摘要变化，即使带旧 `If-None-Match` 也回 200 与新 `ETag` |
| 400 | 空 id；`taskLimit` 非整数 / `<1` / `>50` → `{"ok":false,"error":{"code":"invalid_task_limit","message":"taskLimit 范围 1-50"}}` |
| 404 | 会话不存在 → `{"ok":false,"error":"会话不存在"}`（经 `WriteError`，code `not_found`） |
| 500 | 构建失败“读取会话规格失败” |

响应字段（`spec_projection.go:75-93`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `sessionId` | string | 会话 id |
| `status` | string | `draft|active|completed|archived`；spec `verified→completed`，`draft→draft`，`archived→archived`，其余→`active`；`sessions.archived!=0` 强制 `archived`（301-312） |
| `revision` | number | `specs.version`（每次 `updateSpec` 自增） |
| `updatedAt` | number | spec `updated_at`（毫秒） |
| `goal` | object\|null | `{text, achieved}`；无 goal 为 null |
| `constraints` | array | `[{id,text,source,createdAt}]` |
| `inputs` | array | 当前恒 `[]`（占位，未实现输入收集） |
| `tasks` | object | `{done:{total,items,hasMore}, running:{...}, pending:{...}}`；每类最多 `taskLimit` 条；`done←done`、`running←running`、其余（queued/failed/cancelled）→`pending`（314-323）；item 带 `messageId`（该任务首条 `internal=0` 消息，可能为 `""`） |
| `deliverables` | object | `{total,items,hasMore}`；来自 `tasks.ListArtifactsForSession(non-recursive)`，**固定最多 3 条**（`deliverableLimit=3`），只含用户交付物（`delivery_kind=user_delivery`），不含内部 attempt 报告 |
| `pendingConfirmations` | object | `{total,items,hasMore}`；approvals `status=pending` + `message_cards status=active` 合并，各最多 3 条 |
| `links` | object | `{fullSpec:"/sessions/<id>/spec", self:"/api/sessions/<id>/spec-projection?taskLimit=<N>"}` |

### 8.2 WS 契约

N/A：投影是 HTTP 拉取（可按 ETag 304 复用）；后端不推送投影帧。前端在收到 `task.updated`/`card.updated` 等事件后自行重拉并带 `If-None-Match`（304 处理为前端义务，产品 AC-008-03 的前端 304 断言仍缺）。

### 8.3 数据模型

- 表 `specs`（v3/v6）：读 `status/version/goal/constraints/acceptance_keys/evidence/updated_at`；`revision` 即 `version`。
- 表 `tasks`（tasks 模块 v1，`backend/internal/modules/tasks/migrations.go:16`）：按 `session_id` 取 done/running/其他状态。
- 表 `task_artifacts`（tasks 模块 v1，`:43`）：`ListArtifactsForSession`（`backend/internal/modules/tasks/service.go:819`）只读用户交付物。
- 表 `approvals`（chat v3/v5/v12）与 `message_cards`（v16）：待确认项。
- `taskMessageIDs`（`spec_projection.go:164-183`）：`SELECT task_id,id FROM messages WHERE session_id=? AND task_id<>'' AND internal=0 ORDER BY at ASC,rowid ASC`，每 task 取首条 → `item.messageId`；无映射时为 `""`（`m87_task_message_mapping_test.go:84-119`）。
- 写路径：无。本接口纯读；`revision` 变化只由其它写路径（spec 更新、任务事件）驱动。

### 8.4 不变量与并发

1. 只读：不产生任何写事务；`taskLimit` 不影响 `deliverables/pendingConfirmations` 的固定上限 3。
2. ETag 由响应内容决定：摘要取投影规范化 JSON 与生效 `taskLimit`，不再只看 `specs.version`。tasks/artifacts/approvals/messageId/links 任一变化都会改变摘要，不会出现“内容变了但 ETag 未变”的 304 误判（原 T-08 已关闭）；同一状态的重复请求、不同实例之间得到同一摘要。
3. 状态优先级：`sessions.archived=1` 覆盖 spec.status；即使 spec 是 `verified`，归档后投影为 `archived`。
4. 任务分组：`failed/cancelled/queued/interrupted` 全部归 `pending`，不新增第四组。
5. 消息映射：`internal=1` 不参与 `messageId`；同一 task 多条消息取最早一条。
6. 并发：读快照无锁；`taskLimit` 越界在进入查询前拒绝，不做钳制。

### 8.5 可复现证据

- `backend/cmd/simo/m75_spec_projection_test.go:23` `TestM75SpecProjectionEmptyDraft`：main 200 status=draft、revision 数字、goal=null、constraints/inputs 空数组、tasks 三组 total=0、deliverables/pendingConfirmations total=0、links、未知会话 404、`taskLimit=0/51` 400。
- `backend/cmd/simo/m75_spec_projection_test.go:71` `TestM75SpecProjectionWithData`：verified/version=7 → completed/revision=7/goal；`taskLimit=1` 时 done items=1 + hasMore=true；running/pending 计数；deliverables 只含 `artifact:d1`，不泄漏 `report-attempt-1.md`；pendingConfirmations；`archived=1` → status=archived。
- `backend/cmd/simo/m87_task_message_mapping_test.go:11` `TestM87TaskMessageMapping`：任务消息 `taskId` 在 `/api/messages` 与 `/api/sessions/main/messages?scope=all` 都存在；投影 item.messageId 映射到该消息；无映射任务 `messageId=""`。
- `backend/internal/modules/sessions/spec_projection_etag_test.go`（5 个用例，`go test ./internal/modules/sessions -run TestSpecProjectionETag -v` 全过）：`TestSpecProjectionETagStable` 同状态两次 ETag 相同且形如 `"spec-<16 hex>"`、200 带 `Cache-Control: no-cache`；`TestSpecProjectionETagNotModified` 命中回 304、空 body、保留 ETag 与 Cache-Control，`W/` 弱标签、逗号多值、`*` 同样命中，陈旧标签回 200；`TestSpecProjectionETagTracksTaskChange` 任务状态变化与新增任务都让旧 ETag 失效回 200；`TestSpecProjectionETagTracksDeliverables` 交付物变化同样换 ETag；`TestSpecProjectionETagDistinguishesTaskLimit` `taskLimit=1/5` 的 ETag 互不命中（跨 limit 条件请求回 200）。

### 8.6 涉及文件

`backend/internal/modules/sessions/spec_projection.go:18-22、75-93、99-162、184-327、330-356`（`projectionETag` 在 `:144-162`）、`backend/internal/modules/sessions/spec_projection_etag_test.go`、`backend/internal/modules/sessions/http.go:15-36`（路由）、`backend/internal/modules/tasks/service.go:819`、`backend/internal/modules/tasks/migrations.go:16、43`、`backend/internal/modules/chat/migrations.go`（v16 卡片、v3/v12 approvals）。

### 8.7 未实现/出口预期

- 交付物条数：产品 `AC-CONV-008` 写“前 8 条 + 下载”，实现固定 3 条（`deliverableLimit=3`），且不随 `taskLimit` 变化；需 Lead 裁决以哪个为准（§13 C-04）。
- `inputs` 恒 `[]`：产品要求“输入”组；后端尚无输入收集模型，投影保留空数组（未实现，出口：定义输入表后填充）。
- 304 语义已落地并有自动化证据（见 §8.5）；前端收到 304 必须保留现有投影数据、不得当错误显示，与 375px 右栏不渲染（遮挡判定不适用）同属前端 scope（产品 AC-008-03/04）。

---

## 9 PRD-SYNC-001 WS 连接重连

**状态**：implemented。后端提供帧协议、事件回放、心跳、fanout、归档拒绝与流式恢复；前端三态/退避为前端 scope。

### 9.1 HTTP 契约

| 方法 | 路径 | 入参 | 成功 | 错误 |
|---|---|---|---|---|
| GET | `/api/ws` | query `sessionId`（默认 main）、`since`（可选 int64） | 101 Upgrade；升级成功后立即发送 `hello` 帧；带合法 `since` 时立即开始回放订阅 | 升级失败：`AcceptWS` 失败仅记日志、HTTP 层返回 4xx/5xx（由 `httpserver.AcceptWS` 决定）；无鉴权 |

`since` 解析（`parseSince`，`backend/internal/modules/chat/http.go:525-535`）：空/非法/负数 → 视为“未提供”。负数显式归 0 仅在 `subscribe` 帧内（`http.go:335-337`）。

### 9.2 WS 契约

**连接**：`GET /api/ws` 升级后，服务端首帧 `{"type":"hello","data":{"at":<ms>}}`（`http.go:289`）；随后进入读循环，写由单独 goroutine 负责。

**客户端帧**（`inboundFrame{type,data}`，`data` 为原始 JSON）：

| type | data | 语义 |
|---|---|---|
| `subscribe` | `{sessionId?:string, since?:int64}` | 建立一次订阅；`sessionId` 空则用 query 默认；`since` 缺省（null）→ 只订阅之后的实时事件；`since` 提供（含 0）→ 先 `Replay(since)` 再实时；**重复 subscribe 被忽略**（`subscribed` 标志，`http.go:301-307`） |
| `chat` | `{sessionId?, text, attachments?, replyToMessageId?, clientMutationId?}` | 见 §5.2；先起订阅再起 turn；失败回 `error` |
| `correct` | `{sessionId?, targetMessageId?, text?}` | 有 target → `edit_disabled` 错误帧；无 target 空 text → 停止当前流式回复（§5.2）；无 target 有 text → 取消后重答 |
| `ping` | 无 | no-op（服务端 30s 控制 ping 已覆盖保活） |
| 其它 | — | `error{code:"bad_request",message:"未知帧类型: <type>"}` |

**服务端帧**：`wsEnvelope{type string, data json.RawMessage, id int64(omitempty)}`（`http.go` 类型定义）。`type` 白名单（`isWSEventType`，472-487）：`message.created/delta/done/status`、`reply.created/delta/done/retracted`、`task.created/updated/report`、`trace.reasoning`、`workflow.created/updated/done`、`view.updated/render/binding_failed/renderer_error`、`team.created/archived/template_applied/member_added/member_status/owner_changed/message_queued/delivered/failed/trigger_fired/failed/deliverable_ready`、`card.updated/card.action`。`id` 来自事件日志自增主键，严格递增、同一事件对多客户端同 id。

**顺序与去重**：`wsPump` 先 `events.Subscribe` 再按需 `Replay(since)`（避免 replay/live 缝隙），跳过 `ev.ID <= last`；随后按事件 channel 顺序转发（`http.go:419-469`）。正常连接内事件 id 单调、不重（`server_test.go:243`、`m88_ws_fanout_test.go:23`、`p1_conv_ws_test.go` 的 monotonic 断言）。

**背压**：每连接 `out := make(chan wsEnvelope, 512)`（`wsSendBuffer`）；满时 `wsSend` 阻塞直到 writer 排空或 ctx 结束（`http.go:286、419-469`）。慢客户端会拖慢该连接的 pump，但不阻塞事件 broker 的其它订阅者（每连接独立 pump）。

**心跳**：writer 每 30s（`heartbeatPeriod`）发 control Ping；写失败 → `CloseGoingAway` 并 cancel 连接（`http.go:390-415`）。

**重连**：客户端断开后重新 `GET /api/ws`；回放窗口由 `since` 决定：
- `?since=0`：回放 `events` 全表（含历史 user/reply 事件）；
- `?since=<maxId>`：仅回放 id > maxId 的事件；
- 不带 since / `subscribe` 不带 since：不回放，只收实时；
- `subscribe{since:<n>}`：同 query；重复 subscribe 不生效（需重连才能换 since）。

**归档**：归档会话的 `chat` 帧只回错误帧（§2.2）；订阅本身不受限。

**启动恢复**：`recoverStaleStreaming`（`backend/internal/modules/chat/watchdog.go:39-93`）把遗留 `status=streaming` 的消息置 `failed` + `finished_at` + reason `instance_restarted_streaming_recovered`，落库审计（`m55_test.go:17` 断言“服务重启”）。**看门狗**（`watchdog.go:104-163`）：总时长超 `defaultTurnTotalTimeout` 或空闲超 `SIMO_STREAM_IDLE_TIMEOUT_MS` 时置 failed + “回复超时”（`watchdog.go:113-117、135-139`、`m55_test.go:57`）；turn 的运行 ctx 另有 12 分钟超时（`loop.go:24、386`）。

### 9.3 数据模型

- 表 `events`（core/eventlog v1，`backend/internal/core/eventlog/eventlog.go:152-167`）：`id INTEGER PRIMARY KEY AUTOINCREMENT, at, type, payload TEXT`；`Append` 在事务内 INSERT → `store.Flush` → broker.Publish，返回带自增 id 的事件（186-220）；`Replay(afterID)` 取 `id > afterID ORDER BY id ASC`（222-244）；`Subscribe` 返回 channel + cancel（246-249）。
- 无“回放窗口”表/配置：events 行**永不清理**（见 §15 T-06），因此 since 可无限向前回放；库增长由其它模块（usage 等）共同承担。
- `turns`/`messages`：状态机落库，WS 事件只做通知；客户端可用 HTTP 全量接口重建状态（§4/§7）。

### 9.4 不变量与并发

1. 单连接单订阅：一个 WS 连接最多一个 active subscription；重复 `subscribe` 被忽略（不报错）。
2. 顺序：同一连接内事件 id 严格递增；replay 与 live 之间无缝隙（先订阅后 replay + `last` 去重）。
3. 幂等/去重：服务端不按 `opId` 去重（`opId` 不进入协议）；客户端重连必须用 `since`，不能依赖服务端“记住已发送帧”。
4. 多客户端 fanout：broker 向所有订阅者广播同一事件；帧 type/id 一一对应（`m88_ws_fanout_test.go:23`、`p1_conv_ws_test.go:328`）。
5. 背压有界：单连接缓冲 512 帧；超慢客户端连接会被阻塞直至超时/断开，不影响其它连接。
6. 单写者：broker 与 `m.active` 均在进程内；多实例部署时 WS/停止/流式状态不共享。
7. 归档只读：错误帧是唯一响应，不产生 message/reply 事件（`m6_test.go:100`）。

### 9.5 可复现证据

- `backend/cmd/simo/server_test.go:243` `TestWebSocketEventOrder`：首帧 hello；`?since=0`；事件顺序 created<status<delta<done；delta 非空。
- `backend/cmd/simo/server_test.go:301` `TestWebSocketSinceContinuation`：断开后 `since=lastID` 重连，所有帧 id > lastID（不重发旧事件），仍收到新 `message.created`。
- `backend/cmd/simo/p1_conv_ws_test.go:234` `TestP1ConvWSReplyLifecycleOrderAndDeltas`：完整生命周期顺序、delta 拼接等于落库、hello 带 at、reply.created 字段。
- `backend/cmd/simo/p1_conv_ws_test.go:328` `TestP1ConvWSMultiClientSameSessionConsistency`：两个客户端同会话帧 type/id 一一对应。
- `backend/cmd/simo/p1_conv_ws_test.go:386` `TestP1ConvWSSubscribeReplayAndSinceContinuation`：不带 since 不回放、`since=0` 回放、重连 `since=replayMax` 只收新事件。
- `backend/cmd/simo/p1_conv_ws_test.go:495` `TestP1ConvWSFrameErrorsAndKeepalive`：非法 JSON/未知类型/空文本 chat 均 error 帧，ping 无帧，错误后仍可完成 turn。
- `backend/cmd/simo/m88_ws_fanout_test.go:23` `TestM88WebSocketFanoutTwoClients`：双客户端 fanout 帧一致、无重复 id、重连 `since=0` 回放与实时一致。
- `backend/cmd/simo/m6_test.go:100`、`m50_test.go:75`、`m55_test.go:17/57`：归档错误帧、correct 编辑拒绝、启动恢复、看门狗超时。

### 9.6 涉及文件

`backend/internal/modules/chat/http.go:275-535`（handleWS/wsWriter/wsPump/isWSEventType/suppressWSEvent）、`backend/internal/core/eventlog/eventlog.go:152-249`、`backend/internal/modules/chat/watchdog.go:39-163`、`backend/internal/modules/chat/module.go:218-235`（Start 恢复/看门狗）。

### 9.7 未实现/出口预期

- `since` 保留窗口未定义：无清理、无上限；若未来清理 events，必须同时定义“最老可回放 id”并让服务端对过老 since 返回明确错误/降级全量（§13 C-11 登记差异，§15 T-06）。
- 前端“三态（connected/reconnecting/closed）+ 800ms×1.8 上限 5000ms 退避 + 保留 since”为前端 scope；后端无对应配置。
- 多标签 `active/ancestor/read cursor` 广播是纯前端（§10），后端无参与。

---

## 10 PRD-SYNC-002 多标签 active / 祖先链 / 已读游标

**状态**：N/A：纯浏览器内 BroadcastChannel 状态，后端无接口、无字段、无事件。

- **HTTP 契约**：N/A：多标签广播不经过后端；会话数据仍由 `GET /api/sessions(/tree)` 提供，后端不感知哪个标签 active。
- **WS 契约**：N/A：`active_session_changed`/`ancestor_chain_changed`/`read_cursor_changed` 只在同源标签间广播，后端不接收也不转发。
- **数据模型**：N/A：`active`/祖先链不落库；`read cursor` 已由产品改为**会话级持久化读游标**，落库与接口见 §12；多标签广播仍只在前端。
- **不变量与并发**：N/A：同 `at` 按 tabId 字典序 tiebreak、忽略自身 tab、`remoteActiveRef` 抑制回声均为浏览器端；`opId` 去重在客户端，后端无 opId 概念。
- **可复现证据**：无后端证据；产品 AC-SYNC-002-01/02 当前无自动化测试（产品记为缺口）。
- **涉及文件**：无后端文件。
- **出口预期**：无后端工作项；若未来要跨设备同步 active/已读，需新增用户态接口（当前产品未要求）。

理由（≥8 字）：多标签 active、祖先链合并与已读游标是浏览器内 BroadcastChannel 协调，服务端不持有该状态。

---

## 11 PRD-SYNC-003 发送模式跨标签

**状态**：N/A：localStorage + BroadcastChannel 双通道，后端无接口、无字段。

- **HTTP 契约**：N/A：发送模式不随请求上传；`POST /api/chat` 只收文本/附件（§5.1）。
- **WS 契约**：N/A：无发送模式帧。
- **数据模型**：N/A：`localStorage["simo.composer.sendMode"]`；不落库。
- **不变量与并发**：N/A：`simo.composer.sendMode.v1` 广播或 storage 事件由前端处理；无后端一致性要求。
- **可复现证据**：无后端证据；AC-SYNC-003-01 有前端单标签测试，AC-SYNC-003-02 无测试（产品记录）。
- **涉及文件**：无后端文件。
- **出口预期**：无后端工作项。

理由（≥8 字）：发送模式是本地偏好，跨标签同步走 localStorage/BroadcastChannel，服务端不参与。

---

## 12 PRD-SYNC-004 未读

**状态**：待新增。产品裁决为**会话级持久化读游标**（进入即已读、刷新/重启保留、多标签共享、不做全站数字）；当前后端无表/接口，AC-SYNC-004-03 记 `missing`。

- **HTTP 契约**：待后端 owner 定稿；至少需提供“写已读”入口（如 `PUT /api/sessions/{id}/read`）与“读回未读标记”能力；`GET /api/sessions` 是否返回布尔 `unread` 由契约决定，不返回条数、不做全站汇总。当前无实现。
- **WS 契约**：无强制新增；`read_cursor_changed` 仍可由前端 BroadcastChannel 广播，服务端不转发。
- **数据模型**：需新增会话级读游标（表或列，例如 `session_read_cursors(session_id, last_read_at, updated_at)`）；迁移、索引、并发写去重待设计；当前无表。
- **不变量与并发**：会话级有/无；进入会话写已读；刷新/重启读回；任一标签已读即全标签已读；不做全站未读数字/条数。
- **可复现证据**：无后端证据；AC-SYNC-004-01/02/03 当前 `missing`（产品记录）。
- **涉及文件**：无（待新增 migration、sessions 接口与测试）。
- **出口预期**：新增读游标表/接口/迁移 + 持久化/多标签共享测试；属本阶段**新增能力**，不是收口。

---

## 13 冲突清单（不自行裁决，交 Lead）

| 编号 | 冲突点 | 产品要求（来源） | 后端现状 | 影响 AC |
|---|---|---|---|---|
| C-01 | 主会话不可归档的错误码名 | `main_session_immutable`（产品 AC-001-03、CHG tasks W4-11） | `main_session_protected`（`sessions/http.go:344-345`；测试 `p1_conv_sessions_http_test.go:561/582`） | AC-001-03；任务卡要求可 grep 的错误码名对不上 |
| C-02 | 归档会话不可置顶 | AC-001-04 要求“归档不可置顶” | `SetPinned` 无 archived 守卫（`sessions/management.go:47-59`），`POST /{id}/pin` 对归档会话 200 | AC-001-04（部分） |
| C-03 | 删除接口 | 产品**显式非目标 / backlog**（`REQ-CONV-002-03`）；不提供删除 UI/确认令牌/级联，不计入验收 | 恒 403 `R4_CONFIRM_REQUIRED`，不读 body、不校验 id、无级联、无 204（`sessions/http.go:68-70`）；**保护性占位** | 非目标；`TASK-CHG-CONV-006-12` `parked`；补断言钉住 403，不实现删除 |
| C-04 | 右栏交付物条数 | AC-CONV-008：“前 8 条 + 下载”（产品 §行 270） | `deliverableLimit=3` 固定截断（`spec_projection.go:20`），不随 taskLimit 变化 | AC-008-02（数量与 hasMore 语义） |
| C-05 | 消息分页默认值 | AC-CONV-004：“消息分页加载（默认 100 条）”（产品 §行 125） | `/api/messages` 无 limit/before 时返回全量；显式分页缺省 30、上限 200；`/api/sessions/{id}/messages` 永远全量（`chat/http.go:81-143`） | AC-004-01/02 的“默认 100”无法由后端保证 |
| C-06 | 停止生成 | AC-005-01：“停止后不再追加” | 后端有 `correct{target:"",text:""}` 取消并撤回（`loop.go:1106-1134`），但前端 `stopStreaming` 只本地忽略 + `events.stop()`，不发 correct（`frontend/src/app.tsx:423-428`） | AC-005-01 端到端不成立（前端 scope，需接线或明确“本地停止”口径） |
| C-07 | 单在途 | AC-CONV-005：“同一时刻一个在途” | 后端不拒绝并发 turn（不同 `clientMutationId` 可并行），仅前端 `sendingRef` 拦截（`app.tsx:430-433`） | AC-005（并发语义） |
| C-08 | 删除证据引用 | 历史文档/任务卡曾引用 `m20_test.go:47-50` 作为 DELETE 403 证据 | 该行是 `POST /api/actions/session.delete` 的 403；`DELETE /api/sessions/{id}` 证据在 `p1_conv_sessions_http_test.go:355`；当前删除已改非目标 | 文档引用偏差；不影响实现 |
| C-09 | 403 语义 | AC-007-02：“403 视为无上级继续” | 全量消息接口不返回 403（无鉴权中间件）；`m89_all_messages_errors_test.go:18-19` 明确 N/A；前端只能 mock | AC-007-02（后端无法提供真实 403） |
| C-10 | 主会话归档测试描述 | 产品 AC-001-03 已更正为：`m81_all_messages_test.go:85` 已断言 409，`App.conversation.test.tsx:107-120` 仍按旧行为断言 | `TestMainSessionArchiveRejected` 覆盖 `main_session_protected`；`m81:85` 是 `status != 409` 的拒绝断言 | AC-001-03 的前端旧测试需改；后端证据已存在 |
| C-11 | since 保留窗口 | AC-SYNC-001 记录“`since` 保留窗口未定义” | `events` 永不清理，`Replay` 可无限回放；无上限/无“过老 since”错误 | AC-SYNC-001 的窗口语义缺失（当前行为比“有窗口”更宽松） |
| C-12 | 错误信封形状 | 产品未定义统一信封；前端需按 code 解析 | 通用 `WriteError` 为 `{ok:false,error:"...",code:"..."}`；`archive_blocked` 为 `{ok:false,error:"无法归档",code:"archive_blocked",blockers:[...]}`；删除 403 为 `{ok:false,error:{code,message}}` | 影响所有错误分支的前端解析；需统一口径 |

---

## 14 错误码总表

`HTTP` 列为该 code 实际返回的状态；带 `WS` 标记的 code 也用于 `error` 帧（`code` 字段）。

| code | HTTP | 触发条件 | 客户端应做什么 |
|---|---|---|---|
| `bad_request` | 400 | 通用参数错误：非法 JSON、空文本、文本 >4000 字、`pinned` 非法、未知 WS 帧、帧非 JSON、内部控制文本 | 提示可读原因；保留输入；修正后重试 |
| `forbidden` | 403 | 通用禁止：debug 端点非本机、动作层 R4（`session.delete` 等） | 不重试；提示需人工确认/无权限 |
| `not_found` | 404 | 通用资源不存在（debug spec、部分会话操作） | 刷新列表；不要乐观删除 |
| `conflict` | 409 | 通用冲突：已归档改名/新建子会话、归档父下新建 | 提示“已归档（只读）”；引导恢复 |
| `body_too_large` | 413 | 请求体 >16 KiB（sessions 写接口）或 >64 KiB（`/api/chat`）或上传体超限 | 截断/拆分请求；不原样重试 |
| `internal` | 500 | 未分类服务端错误（读会话/读消息/发送失败） | 展示错误；可重试；不要伪造成功 |
| `unsupported_media_type` | 415 | `WriteError` 通用映射保留 | 检查 Content-Type |
| `unavailable` | 503 | 通用映射保留 | 退避重试 |
| `archive_blocked` | 409 | 有 queued/running 任务，或验收键缺证据 | 展示 `blockers[]`；解除后重试归档 |
| `main_session_protected` | 409 | `id=="main"` 的 archive | 不提供归档入口；提示“主会话不可归档” |
| `R4_CONFIRM_REQUIRED` | 403 | 删除会话（当前唯一实现：恒拒绝）；动作层破坏性操作 | 需人工确认；当前无确认令牌可用，视为未实现 |
| `session_archived` | 409（HTTP）/ WS `error` | 向归档会话发消息 | 切只读态；先 unarchive |
| `session_not_found` | 404 | 全量消息接口 id 不存在；草稿物化竞态 | 刷新树；切回 main |
| `invalid_session` | 400 | `/messages/all` path id 为空 | 修正请求 |
| `invalid_scope` | 400 | `/messages/all?scope=` 非 `all`/空 | 只用 `scope=all` 或省略 |
| `messages_too_many` | 413 | 会话 `internal=0` 消息 >50000 | 提示按会话拆分/改用分页接口 |
| `edit_disabled` | 400（HTTP）/ WS `error` | 任意消息编辑/修正（HTTP 三路、WS correct 带 target） | 隐藏编辑入口；只读展示 |
| `mutation_in_progress` | 409 | 同一 `clientMutationId` 首请求未完成（占位 >5s） | 稍后重试；不要换 id 重发同一条 |
| `invalid_task_limit` | 400 | `taskLimit` 非整数或不在 1–50 | 钳制/修正后重试 |
| `invalid_attachment` | 400 | 附件不存在/不属于该会话 | 重新上传或移除附件 |
| `too_many_attachments` | 400 | 附件 >5 个（发送或上传） | 删减到 ≤5 |
| `file_too_large` | 413 | 单附件 >20 MiB | 压缩/拆分 |
| `invalid_path` | 400 | 附件路径非法 | 重新上传 |
| `upload_not_found` | 404 | 附件 id/文件不存在 | 重新上传 |
| `invalid_multipart` | 400 | 上传不是合法 `multipart/form-data` | 修正上传请求 |
| `missing_file` | 400 | 上传缺少 `file` 字段 | 补齐字段 |
| `invalid_argument` | 400 | 卡片接口 body 非合法 JSON | 修正请求 |
| `team_not_found` | 404 | 团队 id 不存在 | 刷新团队列表 |
| `invalid_sandbox` / `invalid_approval` | 400 | 权限设置取值非法 | 回到合法枚举 |
| `confirmation_required` | 400 | 切 `danger-full-access` 未带 confirm/ack | 补确认参数 |
| `bad_decision` | 400 | approval decision 非法 | 用 `allow_once/allow_session/deny` |

说明：`invalid_range`/`invalid_timezone`（metrics）属 M90/P10 域，不在本域验收面；列出仅为避免前端把 400 误判为会话错误。

---

## 15 已知技术债

| 编号 | 债 | 影响 | 现状证据/出口 |
|---|---|---|---|
| T-01 | 幂等占位残留需 TTL：`finishClientMutation` 失败只 Warn，不重试；占位 `message_id=''` 只能等下一次写路径顺带 `DELETE created_at < now-7d` | 同一 id 在 7 天内重试会 409 `mutation_in_progress`（若占位未清） | `idempotency.go:143-164`；无后台清理 goroutine；出口：启动/定时清理 + 失败重试或落错误标记 |
| T-02 | `client_mutations` 主键仅 `id`，不校验 `session_id` | 跨会话复用同一 id 会返回别的会话的 `messageId` | `migrations.go:597-603`；契约要求客户端全局唯一（当前前端 `${tabId}:${Date.now()}`，同毫秒有碰撞可能） |
| T-03 | **断电未实测**：只测了优雅重启（`TestP1ConvChatClientMutationIdPersistsAcrossRestart`）；进程崩溃/断电时 SQLite 与 `client_mutations`/`messages` 的一致性未验证 | 最坏情况：占位残留 + 用户消息已落库但无回复，需 TTL 兜底 | `p1_conv_chat_idempotency_test.go:267`；无 kill -9/断电用例；出口：故障注入测试 |
| T-04 | 归档跨两个事务：`UPDATE sessions.archived` 与 `updateSpec(status)` 分开提交 | 崩溃窗口内 sessions 已归档、spec 仍 confirmed，投影/门禁不一致 | `spec.go:292-332`、`updateSpec:143-186`；出口：合并事务或补偿 |
| T-05 | 标题搜索 `%q%` 无索引，全表扫描 | 会话多时慢；不影响正确性 | `management.go:12-45`；无 `title` 索引 |
| T-06 | `events` 无保留窗口/清理；`Replay` 可无限回放 | 库无限增长；`since=0` 在长生命周期库上会回放大段历史（内存/带宽） | `eventlog.go:222-244`；出口：定义窗口 + 过老 since 的显式错误 |
| T-07 | `/api/sessions/{id}/messages` 与 `/all` 是全量别名，仅 50000 上限保护 | 大会话一次拉全量，内存压力；分页只在 `/api/messages` | `all_messages.go:45-52`、`module.go:174-175` |
| T-08 | **已关闭（2026-11-22）**：投影 ETag 改为响应规范化 JSON + 生效 `taskLimit` 的 SHA-256 前 8 字节，不再只看 `specs.version` | 原“内容变了但 ETag 未变”的 304 误判已消除 | `spec_projection.go:144-162`；`spec_projection_etag_test.go` 五个用例 |
| T-09 | **已关闭（2026-11-22）**：304 分支已有自动化测试（命中/空 body/ETag 与 Cache-Control 保留/弱标签与多值/陈旧标签回 200） | 回归风险由用例覆盖 | `spec_projection_etag_test.go:TestSpecProjectionETagNotModified` |
| T-10 | 后端不串行化同会话 turn；`m.active` 多 active 时 `correct` 只选最近一个 | 并发发消息时“停止”只停最新一条；旧 turn 继续 | `loop.go:1136-1152`；出口：按会话串行或显式多 turn 停止 |
| T-11 | 删除为产品显式非目标；`session.delete` 动作与 `DELETE` 路由都固定 403 | 用户不能删除会话（符合裁决）；403 是保护性占位，不得被误开 | `http.go:68-70`、`actions.go`、`m20_test.go:47`；待办：补断言钉住任何 id 都 403（见 §2.7），不实现删除 |
| T-12 | 单实例单写者假设：`m.drafts`、`m.active`、WS broker、`m.subscribed` 均在进程内 | 多实例/多进程部署会丢草稿、停止失效、事件不 fanout | `draft.go`、`loop.go`、`http.go`；出口：多实例前需外置状态 |
| T-13 | 内部消息迁移只按文本前缀回填（`[卡片操作]` 等） | 新形态内部文本若未置 `internal=1` 可能泄漏；发送入口已拒绝（`m78:75`） | `migrations.go:476-480`、`loop.go:148-150` |
| T-14 | 错误信封三种形状（字符串 error、对象 error、内联 code+blockers） | 前端解析分叉，易漏判 | §14、C-12；出口：统一 envelope（破坏性变更需版本化） |

---

## 16 变更记录

| 日期 | 版本 | 变更 | 依据 |
|---|---|---|---|
| 2026-11-21 | v1.0 | 新建 `specs/backend/P1-CONV/spec.md`：12 个 PRD 分节（CONV-001..008、SYNC-001..004）+ 索引；写入本轮落地的幂等契约（`clientMutationId`、`client_mutations` v22、7 天 TTL、409 `mutation_in_progress`）与主会话保护（`main_session_protected`、archive 409、unarchive 200 no-op）；登记 12 条冲突、30+ 错误码、14 条技术债 | CHG-CONV-006 / TASK-CHG-CONV-006-10；产品 `specs/product/P1-CONV/spec.md`；`backend/internal/modules/sessions/*`、`backend/internal/modules/chat/*`、`backend/cmd/simo/*_test.go` |
| 2026-11-21 | v1.0 | 明确 `main_session_immutable`（产品）与 `main_session_protected`（实现）不一致，列入 C-01，不自行裁决 | 产品 AC-001-03 vs `sessions/http.go:344-345` |
| 2026-11-21 | v1.1 | 删除会话改标为**产品显式非目标 / backlog**（`REQ-CONV-002-03`）：`DELETE` 固定 403 `R4_CONFIRM_REQUIRED` 为保护性占位，不实现确认令牌/204/级联；§2 状态改 `implemented`，§2.7 改“非目标与待办”，要求补断言钉住 403 | 产品 `specs/product/P1-CONV/spec.md` §2.1 + `REQ-CONV-002-03`；`sessions/http.go:68-70`、`p1_conv_sessions_http_test.go:355` |
| 2026-11-22 | v1.2 | §8 投影 ETag 从 `"spec-<id>-<revision>"` 改为响应内容摘要（规范化 JSON + 生效 `taskLimit` 的 SHA-256 前 8 字节），条件请求改走 `etagMatches`，200/304 都带 `Cache-Control: no-cache`；补 304 语义（空 body、前端保留现有数据）与 5 个自动化用例；T-08/T-09 关闭 | `backend/internal/modules/sessions/spec_projection.go:99-162`、`spec_projection_etag_test.go`；`go test ./internal/modules/sessions -run TestSpecProjectionETag -v`、`go test ./... -count=1`（16 包 ok / 0 FAIL） |
| 2026-11-23 | v1.3 | 新增 §17「会话内任务与编排」（`PRD-CONV-009`）：任务、步骤、轨迹、批次、依赖五组数据的字段与迁移（tasks 模块 v8/v9、chat 模块 v23）；8 个存储状态、4 个展示态、3 类等待与迁移触发者；9 个新增接口与 5 个改造接口；`task.*` 6 个 WS 事件与任务卡片消息落库规则；隔离与审批、禁网禁子进程、上下文与额度、幂等与并发、10 个新增错误码；登记与现有实现（`blocked` 级联、steps JSON、全局 `/api/tasks`）的差异与 8 项未决。§0 索引补 §17 一行，头部版本与最后更新同步 | `specs/product/P1-CONV/spec.md` §4.6 与 `AC-CONV-009-01..18`；`specs/design/P1-CONV/spec.md` §17；`specs/changes/CHG-CONV-007/spec.md`；`docs/plan/DECISIONS.md` DEC-26 至 DEC-29；`backend/internal/modules/tasks/`、`backend/internal/modules/chat/category.go`、`backend/internal/modules/chat/loop.go` |
| 2026-11-26 | v1.4 | §17 状态从 planned 改为 implemented：头部状态表、§0 索引行、§17 正文三处同步为实现已完成（2026-11-25 落地、2026-11-26 复核），证据指向 §17.12 与 `evidence.md` §1；契约正文、接口、错误码未变 | `specs/changes/CHG-CONV-007/evidence.md` §1（pass 26 条、断言 560 条）；`specs/test/P1-CONV/test-plan.md` §18.2 |

---

## 17 PRD-CONV-009 会话内任务与编排

**状态**：实现已完成（2026-11-25 落地，2026-11-26 复核），证据见 §17.12 与 `specs/changes/CHG-CONV-007/evidence.md` §1。本节只写目标契约与可断言口径，不改动 §1 至 §12 已实现的会话、消息、投影与 WS 行为；18 条 AC 中由后端承担的判据见 §17.12，视觉与交互判据见 `specs/design/P1-CONV/spec.md` §17。

**与既有实现的关系**：右栏概览继续使用 `GET /api/sessions/{id}/spec-projection`（§8），四态、ETag 与 304 语义保持不变；任务与交付物两个标签改用本节新增的会话内接口。任务执行器与生命周期引擎归 `P2-TASK`，本轮由 `backend/internal/modules/tasks/` 的记录与编排代码承接；交付物落盘、类型识别与原文件读取归 `P4-FILE`，本节只约束记录、编排、归属、呈现数据与下载入口。

**模块开关**：任务接口随 `cfg.Modules["tasks"]` 注册。开关关闭时 `/api/sessions/{id}/tasks` 等路径不注册，`http.ServeMux` 返回 404，响应体不是本节的错误信封；前端按“本会话没有任务”降级，不显示错误态。开关打开时本节全部契约生效。

### 17.1 通用约定

| 项 | 约定 |
|---|---|
| 路径 | 会话内接口以 `/api/sessions/{id}/tasks` 为前缀，`{id}` 为会话 id；不带会话段的 `/api/tasks*` 保留给内部调试与既有动作层 |
| 会话归属 | 任务、步骤、轨迹、交付物只属于 `tasks.session_id` 指向的会话；路径会话与资源会话不一致时返回 404，不返回 403 |
| 时间 | 全部为 Unix 毫秒；`0` 表示未发生 |
| 状态枚举 | 存储与接口统一使用小写英文，取值见 §17.3；展示文案由前端映射，后端不返回中文状态 |
| 分页 | `limit` 缺省 50、合法区间 1–100，越界返回 400 `invalid_task_limit`；游标是上一页最后一条的 `id`，放在 `before` |
| 计数 | 列表响应的 `counts` 按整个会话统计，不受 `limit`、筛选与游标影响 |
| 幂等 | 创建接口接受 `clientMutationId`；同一会话内同一 id 的重试返回首次结果，不新建任务 |
| 批量上限 | 一次创建 1 至 12 个任务；超过 12 个返回 400 `task_batch_too_large` |

### 17.2 数据模型

既有 `tasks` 表与 `task_artifacts` 表保持列名不变，只做增量加列与新表；`task_steps`、`task_traces`、`task_batches`、`task_deps` 为本轮新增。

**17.2.1 `tasks` 表新增列（tasks 模块迁移 v8）**

| 列 | 类型 | 默认 | 语义与断言口径 |
|---|---|---|---|
| `mode` | TEXT | `'plan'` | 执行模式，仅 `plan` 或 `explore`；`plan` 有步骤行，`explore` 的步骤为空、轨迹扁平 |
| `batch_id` | TEXT | `''` | 创建批次；单任务创建也写批次 id，汇总卡与取消链按它聚合 |
| `goal` | TEXT | `''` | 启动上下文里的目标文本，≤2000 字 |
| `inputs_json` | TEXT | `'[]'` | 输入项 JSON 数组，字符串数组，≤20 条 |
| `constraints_json` | TEXT | `'[]'` | 约束 JSON 数组，字符串数组，≤20 条 |
| `context_json` | TEXT | `'{}'` | 启动时上下文快照，键固定为 `goal`、`inputs`、`constraints`、`historyCount`、`sessionId`；`historyCount` 恒为 0 |
| `waiting_reason` | TEXT | `''` | 等待原因，仅 `''`、`dependency`、`confirmation`、`resource` |
| `waiting_since` | INTEGER | `0` | 进入当前等待的毫秒时间戳，退出等待清 0 |
| `started_at` | INTEGER | `0` | 首次进入 `running` 的时间，重试不重置 |
| `finished_at` | INTEGER | `0` | 首次进入 `done`/`failed`/`cancelled` 的时间，重试清 0 |
| `fail_reason` | TEXT | `''` | 最近一次失败原因，≤500 字；重试成功后清空 |
| `deadline_at` | INTEGER | `0` | 用户时限，0 表示未设；只提醒不取消 |
| `deadline_reminded_at` | INTEGER | `0` | 时限提醒已发送的时间，保证提醒只发一次 |
| `trigger_count` | INTEGER | `0` | 该任务被依赖触发启动的累计次数，`each` 语义下等于已完成前置数 |

既有列沿用并固定语义：`status`（§17.3）、`progress`（0–100 整数）、`attempt`（从 1 起，每次重试加 1）、`depends_on_json`（依赖 id 数组的兼容镜像，写入顺序与创建顺序一致）、`order_index`（批内创建顺序，从 0 起）、`report_message_id`（终态汇报消息 id）、`budget_json`（见 §17.7）、`executor_agent_id`、`state_reason`。

**17.2.2 `task_steps` 表（v9 新建）**

| 列 | 类型 | 约束 | 语义 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | 形如 `step-<16 hex>` |
| `task_id` | TEXT | NOT NULL | 所属任务 |
| `seq` | INTEGER | NOT NULL | 执行顺序，同一任务内从 1 连续递增，唯一 |
| `title` | TEXT | NOT NULL | 步骤名，≤200 字 |
| `status` | TEXT | NOT NULL | `pending`/`running`/`done`/`failed`/`skipped` |
| `summary` | TEXT | DEFAULT `''` | 步骤摘要，≤200 字 |
| `fail_reason` | TEXT | DEFAULT `''` | 该步失败原因；用户取消时写「用户取消」 |
| `started_at` | INTEGER | DEFAULT 0 | 进入 `running` 的时间 |
| `finished_at` | INTEGER | DEFAULT 0 | 进入终态的时间 |

索引 `idx_task_steps_task(task_id, seq)` 与唯一索引 `uq_task_steps_seq(task_id, seq)`。`explore` 模式不写该表，详情接口返回空数组。

**17.2.3 `task_traces` 表（v9 新建）**

| 列 | 类型 | 约束 | 语义 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | 形如 `tr-<16 hex>` |
| `task_id` | TEXT | NOT NULL | 所属任务 |
| `step_id` | TEXT | DEFAULT `''` | 所属步骤；`explore` 模式与步骤外的动作留空 |
| `seq` | INTEGER | NOT NULL | 同一任务内严格递增，从 1 起，不因重试回退 |
| `category` | TEXT | NOT NULL | 仅 `think`、`action`、`observe` |
| `tool` | TEXT | DEFAULT `''` | `action` 与 `observe` 的工具名，其它类别为空 |
| `text` | TEXT | NOT NULL | 正文，≤4000 字 |
| `at` | INTEGER | NOT NULL | 发生时间 |

索引 `idx_task_traces_task(task_id, seq)`。轨迹只追加、不更新、不删除；重试产生新轨迹，旧轨迹保留。

**17.2.4 `task_batches` 表（v9 新建）**

| 列 | 类型 | 约束 | 语义 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | 形如 `batch-<16 hex>` |
| `session_id` | TEXT | NOT NULL | 发起会话 |
| `client_mutation_id` | TEXT | DEFAULT `''` | 幂等键，空表示不去重 |
| `task_count` | INTEGER | NOT NULL | 批内任务数，1–12 |
| `message_id` | TEXT | DEFAULT `''` | 汇总卡消息 id；单任务批次指向该任务的卡片消息 |
| `created_at` | INTEGER | NOT NULL | 创建时间 |

唯一索引 `uq_task_batches_mutation(session_id, client_mutation_id) WHERE client_mutation_id <> ''`。幂等键按会话隔离，跨会话复用同一 id 不互相命中。

**17.2.5 `task_deps` 表（v9 新建）**

| 列 | 类型 | 约束 | 语义 |
|---|---|---|---|
| `task_id` | TEXT | 联合主键 | 等待方任务 |
| `dep_id` | TEXT | 联合主键 | 前置任务，必须同会话、同批次 |
| `join_mode` | TEXT | NOT NULL | `all`、`any`、`each`，缺省 `all` |
| `created_at` | INTEGER | NOT NULL | 创建时间 |

索引 `idx_task_deps_dep(dep_id)`。同一等待方的全部入边必须使用同一 `join_mode`，混合返回 400 `invalid_task_dependency`；`depends_on_json` 与 `task_deps` 在创建事务内同时写入，读取以 `task_deps` 为准。

**17.2.6 `task_artifacts` 复用**

沿用 v2 的 `id`、`task_id`、`name`、`rel_path`、`mime`、`size`、`created_at`，v6 的 `delivery_kind`，v7 的 `storage_scope`、`workspace_rel_path`。本轮不新增列；交付物列表只取 `delivery_kind = 'user_delivery'` 的行，类型徽标由 `mime` 与扩展名派生，取值 `doc`、`sheet`、`image`：`text/*`、`application/pdf`、`docx`、`doc`、`markdown` 归 `doc`，`csv`、`xlsx`、`xls` 归 `sheet`，`image/*` 归 `image`，其余归 `doc`。

### 17.3 状态机

**17.3.1 状态集合**

存储状态共 8 个，展示态 4 个。展示映射由后端在 `displayStatus` 字段给出，保证任务图四态节点数之和等于节点总数。

| 存储 `status` | `displayStatus` | 含义 | 说明 |
|---|---|---|---|
| `pending` | `pending` | 未开始 | 依赖未满足或尚未取得调度槽；`waiting_reason` 可为 `dependency` |
| `queued` | `pending` | 未开始（排队） | 依赖已满足、已占槽，等待执行器领取 |
| `running` | `running` | 进行中 | 执行器持有；`waiting_reason` 为 `confirmation` 或 `resource` 时仍计进行中 |
| `done` | `done` | 已完成 | 终态，`finished_at` 非 0 |
| `failed` | `failed` | 失败 | 终态，`fail_reason` 非空 |
| `cancelled` | `failed` | 失败（已取消） | 终态，`fail_reason` 固定写「已取消」；筛选「失败」包含该状态 |
| `interrupted` | `failed` | 失败（已中断） | 服务重启时由 `recoverInterrupted` 置入；可重试 |
| `blocked` | `pending` | 未开始（历史） | 仅为旧库兼容保留，新写入禁止；读取时按 `pending` 加 `dependency` 等待处理 |

**17.3.2 合法迁移**

触发者三列固定为「智能体」「用户」「系统」；未列入下表或条件不满足的迁移一律拒绝，错误码见 §17.10。

| 从 | 到 | 触发者 | 条件与副作用 |
|---|---|---|---|
| `pending` | `queued` | 系统 | 全部入边满足该边的 `join_mode` 且取得并发槽；写 `started_at` 前置不改，`waiting_reason` 清空 |
| `pending` | `cancelled` | 用户 | 用户对目标任务显式取消；整链取消只中断已启动的下游，未开始的下游不迁移；`fail_reason` 写「已取消」，`trigger_count` 不变 |
| `queued` | `running` | 系统 | 执行器领取；`started_at` 若为 0 则写入；进度保持 |
| `queued` | `cancelled` | 用户/系统 | 同 `pending` 到 `cancelled`；不产生步骤启动 |
| `running` | `running` | 系统 | 只改 `waiting_reason`：进入 `confirmation` 或 `resource`；不改 `status`、不改进度 |
| `running` | `done` | 智能体 | 全部步骤 `done`；`progress=100`、`finished_at` 写入、`fail_reason` 清空 |
| `running` | `failed` | 智能体/系统 | 执行器报错或步骤失败；`fail_reason` 写最近一条原因，`finished_at` 写入 |
| `running` | `cancelled` | 用户/系统 | 取消确认在 5 秒内生效；未完成步骤回 `pending`，已完成步骤保留 |
| `failed` | `queued` | 用户 | 显式重试；`attempt` 加 1，步骤重置为 `pending`，`fail_reason` 清空，轨迹保留 |
| `cancelled` | `queued` | 用户 | 显式重试；规则同上 |
| `interrupted` | `queued` | 用户 | 显式重试；规则同上 |

终态对终态的取消不构成错误：对 `done`、`failed`、`cancelled`、`interrupted` 调用取消接口返回 200，`changed=false`，任务字段不变，避免前端把幂等请求显示成失败。重试不适用于 `pending`、`queued`、`running`、`done`，返回 409 `task_state_conflict`。

**17.3.3 三类等待**

| `waiting_reason` | 存储状态 | 进入条件 | 退出条件 | 断言口径 |
|---|---|---|---|---|
| `dependency` | `pending` | 入边未满足；前置失败、取消或中断时保持该值 | 入边按 `join_mode` 满足后转 `queued` 并清空 | 等待期间步骤启动 0 次、`trigger_count` 不变、失败计数不变 |
| `confirmation` | `running` | 工具调用需人工审批，或计划要求用户确认 | 确认接口 `decision=confirm` 清空并继续；`decision=cancel` 使当前步 `failed`、任务 `failed`、`fail_reason` 写「用户取消」 | 当前步保持 `running`、后续步骤启动 0 次、确认与取消入口各 1 个 |
| `resource` | `running` | token 预算或步骤预算耗尽 | 恢复接口清空并从暂停步继续，已完成步骤不重跑 | 等待期间进度增量 0、恢复后 `progress` 从暂停值继续 |

等待依赖时任务图节点文案为「未开始 · 等待前置」，节点仍计入 `pending`；等待确认与等待资源计入 `running`。三类等待都没有系统超时：等待 30 分钟不自动失败、不自动取消，只有前置完成、用户确认或取消、资源恢复三种途径改变等待状态。进入等待与退出等待都写 `waiting_since`，退出时清 0。

**17.3.4 依赖连接语义**

| `join_mode` | 启动规则 | 触发次数（三个前置均完成时） | 其余前置 |
|---|---|---|---|
| `all` | 全部前置 `done` 后启动 | 1 | 无需处理 |
| `any` | 任一前置 `done` 后启动 | 1 | 继续执行，不取消 |
| `each` | 每个前置 `done` 各触发一次，串行执行，同一任务同一时刻最多一个执行中实例 | 3 | 各自完成，互不影响 |

`each` 语义下每次触发都把 `attempt` 加 1、`trigger_count` 加 1，并新建一次执行；若前一次仍在运行，后一次进入 `queued` 等待，不并发执行同一任务。前置失败、取消或中断时，等待方保持 `pending` 与 `dependency`，`trigger_count` 不变、失败计数不变、不自动重试、不级联标失败；任务图中该边为虚线。

**17.3.5 取消的级联规则**

取消接口的 `scope` 取 `self` 或 `chain`，缺省 `self`。`self` 只改目标任务；`chain` 只对目标链上已启动的下游生效，把它们走中断流程，未启动的下游保持 `pending` 与 `waiting_reason=dependency`，步骤启动 0 次、`trigger_count` 与失败计数不变，图中连线保留且为虚线，已完成的下游结果不动，链外任务不受影响。未启动的下游不因取消转 `cancelled`：`cancelled` 在展示态里映射为「失败」，级联取消等于把下游标成失败，与 §17.3.3 的 `dependency` 退出条件冲突；等待方没有系统清理，上游 `cancelled` 可以经重试转 `queued`，重跑完成后按 `join_mode` 放行下游，作废下游由用户显式取消该任务。取消整链时不得出现半完成状态：正在运行的步骤被中断后回 `pending`，已完成步骤与产出保留，`attempt` 不增加。对终态任务再次取消返回 200 与 `changed=false`，任务字段不变。

### 17.4 HTTP 契约

**17.4.1 新增接口**

| 序号 | 方法 | 路径 | 用途 | 成功 | 主要错误 |
|---|---|---|---|---|---|
| N1 | POST | `/api/sessions/{id}/tasks` | 创建单个或批量任务并生成卡片消息 | 201 | 400、404、409、413 |
| N2 | GET | `/api/sessions/{id}/tasks` | 按会话列任务，支持状态、模式、批次筛选与计数 | 200 | 400、404 |
| N3 | GET | `/api/sessions/{id}/tasks/{taskId}` | 任务详情，含步骤、轨迹、交付物与上下文摘要 | 200 | 400、404 |
| N4 | POST | `/api/sessions/{id}/tasks/{taskId}/cancel` | 取消单任务或整链 | 200 | 400、404、409 |
| N5 | POST | `/api/sessions/{id}/tasks/{taskId}/retry` | 失败、取消或中断任务重试 | 200 | 404、409 |
| N6 | POST | `/api/sessions/{id}/tasks/{taskId}/confirmation` | 等待确认时确认或取消 | 200 | 400、404、409 |
| N7 | POST | `/api/sessions/{id}/tasks/{taskId}/resume` | 等待资源或额度时恢复 | 200 | 404、409 |
| N8 | GET | `/api/sessions/{id}/tasks/graph` | 任务图节点、边与依赖层 | 200 | 400、404 |
| N9 | GET | `/api/sessions/{id}/deliverables` | 交付物按任务分组 | 200 | 400、404 |

**N1 创建任务**

请求体字段：

| 字段 | 类型 | 必填 | 约束与语义 |
|---|---|---|---|
| `mode` | string | 否 | `plan` 或 `explore`，缺省 `plan`；非法值 400 `invalid_task_mode` |
| `goal` | string | 否 | 批次默认目标，≤2000 字 |
| `inputs` | string[] | 否 | 批次默认输入，≤20 条、每条 ≤500 字 |
| `constraints` | string[] | 否 | 批次默认约束，≤20 条、每条 ≤500 字 |
| `tasks` | object[] | 是 | 1–12 项；空数组或超过 12 项分别返回 400 `invalid_argument`、400 `task_batch_too_large` |
| `tasks[].key` | string | 否 | 批内唯一，缺省按 `t1`、`t2` 依次生成；重复返回 400 `invalid_argument` |
| `tasks[].title` | string | 是 | 1–120 字，去空白后为空返回 400 `invalid_argument` |
| `tasks[].mode` | string | 否 | 覆盖批次 `mode`，取值同上 |
| `tasks[].goal` | string | 否 | 覆盖批次目标；缺省用批次 `goal`，再缺省用 `title` |
| `tasks[].inputs` | string[] | 否 | 覆盖批次输入 |
| `tasks[].constraints` | string[] | 否 | 覆盖批次约束 |
| `tasks[].steps` | string[] | 否 | 仅 `plan` 模式接受，≤50 步、每步 ≤200 字；`explore` 模式携带返回 400 `invalid_task_mode` |
| `tasks[].dependsOn` | string[] | 否 | 批内其它任务的 `key`，自依赖、环、跨批次引用返回 400 `invalid_task_dependency` |
| `tasks[].joinMode` | string | 否 | `all`、`any`、`each`，缺省 `all`；同一任务的全部入边必须一致 |
| `tasks[].deadlineAt` | number | 否 | 用户时限毫秒时间戳，必须大于当前时间；只提醒不取消 |
| `clientMutationId` | string | 否 | 幂等键，≤64 字，同一会话内唯一 |

成功响应 201：

| 字段 | 类型 | 语义 |
|---|---|---|
| `ok` | bool | 恒为 `true` |
| `batchId` | string | `batch-<16 hex>` |
| `tasks` | object[] | 新建任务投影，顺序与请求 `tasks` 一致，含 §17.3 的 `displayStatus`、`waitingReason`、`dependsOn`、`orderIndex` |
| `messageId` | string | 汇总卡消息 id；单任务批次即该任务的卡片消息 id |
| `counts` | object | 会话任务计数，字段同 N2 |
| `idempotent` | bool | 首次创建为 `false`，命中幂等键重放为 `true` |
| `total` | number | 本批任务数，等于 `tasks` 的长度 |

创建在一个事务内完成批次行、任务行、依赖行与步骤行写入，任一任务校验失败则全部回滚，不产生任务卡片。提交成功后按 §17.5 的顺序发事件，再返回响应。

**N2 任务列表**

| 查询参数 | 类型 | 缺省 | 语义 |
|---|---|---|---|
| `status` | string | 空 | 逗号分隔；接受展示态 `pending`、`running`、`failed`、`done` 与存储态 `queued`、`cancelled`、`interrupted`；未知值 400 `invalid_task_status`；`failed` 同时匹配 `failed`、`cancelled`、`interrupted` |
| `mode` | string | 空 | `plan` 或 `explore`，非法值 400 `invalid_task_mode` |
| `batchId` | string | 空 | 按批次筛选；格式不是 `batch-<16 hex>` 返回 400 `invalid_argument` |
| `limit` | number | 50 | 1–100，越界 400 `invalid_task_limit` |
| `before` | string | 空 | 不透明游标，形如 `<updatedAtMs>:<taskId>`，由上一页 `nextBefore` 原样回传；游标失效返回空页而非 404 |

响应 200 字段：

| 字段 | 类型 | 语义 |
|---|---|---|
| `ok` | bool | 恒为 `true` |
| `tasks` | object[] | 按 `updated_at DESC, id DESC` 排序；`failed` 组内也按该序 |
| `counts` | object | `all`、`pending`、`running`、`failed`、`done` 五个整数，按整个会话统计，`pending` 含 `queued` 与历史 `blocked`，`failed` 含 `cancelled` 与 `interrupted` |
| `total` | number | 当前筛选下的总数 |
| `hasMore` | bool | 是否还有下一页 |
| `nextBefore` | string | 下一页游标；`hasMore` 为 `false` 时为空串 |

**N3 任务详情**

查询参数 `traceLimit`（缺省 200、区间 1–500）与 `traceBefore`（轨迹 id）。成功响应 200 包含以下字段：

| 字段 | 类型 | 语义 |
|---|---|---|
| `task` | object | 单任务投影，字段为 `id`、`sessionId`、`batchId`、`title`、`mode`、`status`、`displayStatus`、`waitingReason`、`progress`、`attempt`、`triggerCount`、`goal`、`inputs`、`constraints`、`dependsOn`、`orderIndex`、`failReason`、`startedAt`、`finishedAt`、`createdAt`、`updatedAt`、`deadlineAt`、`executorAgentId` |
| `steps` | object[] | 每项 `id`、`seq`、`title`、`status`、`summary`、`failReason`、`startedAt`、`finishedAt`、`traceCount`；`explore` 模式为空数组 |
| `currentStepId` | string | 第一个 `running` 步骤，没有则取第一个 `pending`，全部终态为空串 |
| `traces` | object[] | 每项 `id`、`stepId`、`seq`、`category`、`tool`、`text`、`at`；按 `seq` 升序 |
| `tracesHasMore` | bool | 轨迹是否被截断 |
| `deliverables` | object[] | 该任务的用户交付物，字段同 N9 的 `files` |
| `context` | object | `goal`、`inputs`、`constraints`、`historyCount`，其中 `historyCount` 恒为 0 |
| `budget` | object | `maxTokens`、`maxSteps`、`usedTokens`、`usedSteps` |

跨会话请求返回 404 `task_not_found`，响应体不含任务标题、目标、步骤与轨迹；不得返回 403，也不得在错误文案里带任务名。

**N4 取消**

查询参数 `scope` 取 `self` 或 `chain`，缺省 `self`；其它值 400 `invalid_argument`。响应 200：

| 字段 | 类型 | 语义 |
|---|---|---|
| `ok` | bool | 恒为 `true` |
| `task` | object | 目标任务的最新投影 |
| `cancelled` | string[] | 本次实际置为 `cancelled` 的任务 id，按批次 `orderIndex` 升序 |
| `changed` | bool | 本次是否有任务状态变化；对终态调用为 `false` |

取消在 5 秒内返回；执行器未在 5 秒内响应时仍返回 200，任务保持 `running` 并在下一次事件中落为 `cancelled`，响应里的 `changed` 为 `false`，避免前端无限等待。

**N5 重试**

无请求体要求，可选 `clientMutationId`。响应 200 字段 `ok`、`task`、`attempt`、`resetStepCount`。`attempt` 等于新值，`resetStepCount` 是被重置为 `pending` 的步骤数。状态不在 `failed`、`cancelled`、`interrupted` 时返回 409 `task_state_conflict`，响应体带 `currentStatus`。

**N6 确认**

请求体 `{"decision":"confirm"|"cancel","note":"..."}`，`decision` 必填，其它取值 400 `invalid_argument`，`note` ≤500 字。响应 200 字段 `ok`、`task`、`stepId`（当前步骤 id，无步骤时为空串）、`decision`。`waitingReason` 不是 `confirmation` 时返回 409 `task_state_conflict`。`decision=cancel` 把当前步置 `failed`、`failReason` 写「用户取消」，任务置 `failed`，下游保持 `pending`。

**N7 恢复**

请求体可选 `{"reason":"..."}`，≤200 字。响应 200 字段 `ok`、`task`、`resumedStepId`。`waitingReason` 不是 `resource` 时返回 409 `task_state_conflict`。恢复后 `progress` 从暂停值继续，已完成步骤的 `status`、`startedAt`、`finishedAt` 不变。

**N8 任务图**

响应 200 字段：

| 字段 | 类型 | 语义 |
|---|---|---|
| `ok` | bool | 恒为 `true` |
| `nodes` | object[] | 每项 `id`、`title`、`mode`、`status`、`displayStatus`、`waitingReason`、`progress`、`failReason`、`dependsOn` |
| `edges` | object[] | 每项 `from`（前置 id）、`to`（等待方 id）、`joinMode`、`style`；`style` 取 `solid` 或 `dashed`，前置为 `failed`、`cancelled`、`interrupted` 时为 `dashed` |
| `layers` | object[] | 每项 `index`（从 0 起）与 `nodeIds`；按最长路径分层，同层内保持 `orderIndex` 升序 |
| `total` | number | 节点总数，等于四态节点数之和 |

节点只读：接口不提供任何修改位置或状态的参数，节点坐标与缩放由前端按设计 §17 计算，后端不下发坐标。

**N9 交付物列表**

查询参数 `taskId`（可选，按任务过滤）、`limit`（缺省 50、1–100）；不接受游标 `before`，`hasMore` 只表示分组被 `limit` 截断。响应 200：

| 字段 | 类型 | 语义 |
|---|---|---|
| `ok` | bool | 恒为 `true` |
| `groups` | object[] | 每项 `taskId`、`taskTitle`、`taskStatus`、`files`；按任务最近交付时间倒序 |
| `files[]` | object[] | 每项 `id`、`name`、`mime`、`size`、`typeBadge`（`doc`、`sheet`、`image`）、`createdAt`、`downloadUrl`、`previewUrl` |
| `total` | number | 组数 |
| `fileCount` | number | 文件总数 |
| `hasMore` | bool | 是否还有更多文件 |

`downloadUrl` 为 `/api/artifacts/{artifactId}/content?download=1`，`previewUrl` 为 `/api/artifacts/{artifactId}/content`；接口只返回 `delivery_kind='user_delivery'` 的文件，内部产物不出现在这里。

**17.4.2 改造接口**

| 方法 | 路径 | 改造点 | 兼容性 |
|---|---|---|---|
| GET | `/api/tasks` | 新增 `sessionId`、`batchId` 查询参数，返回 `counts` 与 `displayStatus`；缺省仍返回全部任务 | 旧字段保留，新增字段向前兼容 |
| GET | `/api/tasks/{id}` | 响应增加 `steps`、`currentStepId`、`traces`、`context`、`budget`、`mode`、`waitingReason`、`failReason`、`displayStatus` | 旧字段保留；`steps` 与旧 `phases` 并存 |
| POST | `/api/tasks/{id}/cancel` | 接受 `scope` 查询参数，语义同 N4；终态返回 200 且 `changed=false` | 旧调用不传 `scope` 时行为等于 `self` |
| POST | `/api/tasks/{id}/retry` | 限定状态为 `failed`、`cancelled`、`interrupted`，其它状态 409 `task_state_conflict` | 旧调用对 `done` 重试会从 200 变为 409，属契约收紧，须在实现时同步前端 |
| GET | `/api/sessions/{id}/artifacts` | 响应元素增加 `typeBadge`、`taskTitle`；保留原有扁平分页 | 旧字段与 `ETag` 语义不变 |

### 17.5 消息与事件

**17.5.1 任务卡片落库**

任务卡片是一条普通 `messages` 行，不新增表，只在 `messages` 上加 `batch_id` 列（chat 模块迁移 v24；v23 已被 `session_read_cursors` 占用，见 `backend/internal/modules/chat/migrations.go:612`，加列在 `:630-642`）。卡片字段固定为：

| 字段 | 值 | 断言口径 |
|---|---|---|
| `role` | `agent` | 与消息流其它智能体消息一致，不新增角色 |
| `category` | `task` | 现存 `category.go` 只允许 `requirement`、`clarification`、`progress`、`consultation`，实现须把 `task` 加入允许集合，且只允许服务端写入 |
| `task_id` | 单个任务创建时写该任务 id；批量创建时写 `tasks[0].id` | DEC-26 要求非空；批量时以首个任务满足非空约束 |
| `batch_id` | 批次 id；单任务也为该批次 id | 汇总卡子条目的唯一查询依据 |
| `text` | 单任务为卡片标题；批量为一句话「已创建 N 个任务」 | 作为不支持卡片渲染的客户端的降级文本 |
| `status` | `done` | 卡片不进入流式状态 |
| `internal` | `0` | 用户可见 |

任务终态汇报继续使用既有 `category=progress` 与 `report_message_id`，不复用 `category=task`；历史 `progress` 开始消息不迁移、不改写。

**17.5.2 汇总卡规则**

单任务创建写 1 条 `category=task` 消息，不生成汇总卡。批量创建（N ≥ 2）只写 1 条汇总卡，`task_count=N`；卡片展开时前端用 `GET /api/sessions/{id}/tasks?batchId=<batchId>&limit=10` 取前 10 条，平铺条数上限 10（DEC-28）。第 11 条起不返回、不渲染，折算为「还有 N−10 条」；用户点开后前端以 `limit=100` 全量拉取，入口消失；收起再展开回到 10 条。后端只保证 `task_count` 与分页总数一致，概览文案由前端计算。

`task_count` 与列表 `total` 不一致（例如任务被删除，本轮不提供删除，不会发生）时以列表为准，卡片显示实际条数。批量创建的 `messageId` 在响应中返回，`task.created` 事件不携带该 id，前端以 `message.created` 事件或重连后的消息拉取补齐。

**17.5.3 WS 事件**

事件名与 payload 固定如下，全部纳入 `isWSEventType` 白名单：

| 事件 | 触发时机 | payload 关键字段 |
|---|---|---|
| `task.created` | 批内每个任务创建后各发 1 条 | `id`、`sessionId`、`batchId`、`mode`、`status`、`displayStatus`、`title`、`dependsOn`、`orderIndex`、`createdAt` |
| `task.updated` | 状态、等待原因、进度、尝试次数变化 | `id`、`sessionId`、`batchId`、`status`、`displayStatus`、`waitingReason`、`progress`、`attempt`、`triggerCount`、`failReason`、`changed`（字符串数组，元素取 `status`、`waitingReason`、`progress`、`attempt`） |
| `task.step` | 步骤进入 `running` 或终态 | `id`、`stepId`、`stepSeq`、`status`、`traceCount`、`progress`、`at` |
| `task.trace` | 追加一条轨迹 | `id`、`stepId`、`traceSeq`、`category`、`tool`、`text`（前 200 字）、`at` |
| `task.report` | 任务进入终态并需要汇报 | 既有字段不变，增加 `displayStatus` 与 `failReason` |
| `task.reminder` | 用户时限到点 | `id`、`deadlineAt`、`at`；每个任务最多 1 条 |

**17.5.4 顺序与增量**

事件日志 id 单调递增，是全局顺序的唯一依据。同一任务的 `stepSeq` 与 `traceSeq` 各自从 1 严格递增，重试不回退；客户端按 `(id, stepId, stepSeq)` 与 `(id, traceSeq)` 去重，收到小于等于已应用值的序号时丢弃。批量创建的顺序固定为：全部 `task.created`（按 `orderIndex` 升序）写完后写 `message.created`，最后才返回 HTTP 响应，因此客户端先拿到任务、再拿到卡片，不会出现卡片指向不存在任务。

**17.5.5 断线重连补偿**

客户端重连带 `since=<最后事件 id>`，服务端按 `since` 回放；事件不做清理，不出现空洞（技术债 T-06 描述的增长问题不改变正确性）。重连后客户端必须再做一次对账：拉 `GET /api/sessions/{id}/tasks` 与所有非终态任务的详情，拉最近一页消息补齐卡片；对账以 HTTP 结果覆盖本地快照，事件只用于增量。若 `since` 过旧导致回放量过大，客户端可放弃回放，直接走上述对账，`tasks` 与 `messages` 的 HTTP 结果是权威来源。

### 17.6 隔离与权限

| 场景 | 判据 | 后端行为 |
|---|---|---|
| 跨会话读任务 | 路径会话 id 与 `tasks.session_id` 不一致 | 404 `task_not_found`，响应不含任务正文；不得返回 403 |
| 跨会话取消或重试 | 同上 | 404 `task_not_found`，不做任何写入 |
| 跨会话交付物 | 交付物所属任务不在路径会话内 | 404 `task_not_found`；若交付物无归属任务，返回 404 `artifact_not_found` |
| 路径越出工作区 | 解析后的绝对路径不在 `workspace` 或 `artifacts` 根内 | 403 `permission_denied`，轨迹写一条 `observe` 记录，`text` 以 `403 ` 开头 |
| 工具不在会话白名单 | 工具名不在当前会话可用的工具集 | 403 `permission_denied`，不创建审批 |
| 需要审批的工具 | 风险级为 R3 或写入类 | 409 `APPROVAL_REQUIRED`（与 `chat/actions.go` 的动作端点同码，带 `approvalId`），任务进入 `confirmation` 等待 |
| 默认禁网 | 会话未授予网络权限 | 工具调用直接 403 `permission_denied`，不发起连接 |
| 默认禁子进程 | 会话未授予子进程权限 | 同上，不创建进程 |

任务只属于发起会话，不存在跨会话共享、移交或跨会话任务图。任务执行器调用工具时构造的审批记录写入既有 `approvals` 表，`session_id` 取任务所属会话，审批决策与聊天回合共用同一套 R0–R4 规则和 `approval` 设置，不新增审批类型。

越权判据按顺序判定：先判会话归属，再判路径范围，再判工具白名单，最后判网络与子进程权限；任一不通过即终止本次工具调用并把原因写入轨迹，任务本身不因此失败，等待用户处理或继续下一步。

### 17.7 上下文与额度

**17.7.1 启动上下文**

任务启动只注入三类内容：`goal`（目标）、`inputs`（输入）、`constraints`（约束），不继承会话历史。`context_json` 在创建时一次写定，`historyCount` 恒为 0，任务执行器构造请求时只读该字段，不读 `messages` 表。缺省值按 `tasks[].约束 > 批次约束 > 会话 spec 的约束` 与 `tasks[].goal > 批次 goal > title` 的优先级取，不会回退到聊天历史。

详情接口的 `context` 字段直接返回这三类内容与 `historyCount`，供 AC-03 断言。任务重试不重新收集上下文，沿用首次创建的 `context_json`。

**17.7.2 预算与额度**

`budget_json` 字段固定为 `{"maxTokens":N,"maxSteps":N,"usedTokens":N,"usedSteps":N}`，缺省 `maxTokens=0`（不限额）、`maxSteps=50`。每次步骤结束累加 `usedSteps`，每次模型调用累加 `usedTokens`。达到任一上限时任务进入 `running` 加 `waitingReason=resource`，`progress` 保持当前值，已完成步骤与产出保留，不写失败原因，不自动重试。

恢复接口清空 `waitingReason` 并从暂停步骤继续；恢复不重置计数，预算仍按累计值判断，因此恢复后若仍未提高上限会再次进入等待。提高上限通过会话级配置或后续的预算编辑入口完成，本轮不提供任务级预算编辑接口。

**17.7.3 时限与超时**

任务的执行时限只来自用户设置的 `deadlineAt`，系统不设默认执行超时，不因运行时间长而失败或取消。到点后系统发 1 条 `task.reminder` 并写 `deadline_reminded_at`，同一任务不重复提醒；任务状态不变，任务卡脚注由前端显示「已超出预计 N 分钟」。等待依赖、等待确认、等待资源三类状态同样不受时限影响，等待 30 分钟也不会自动失败。

实现须保证任务执行器不继承聊天回合的墙钟上限：既有聊天回合按 12 分钟上下文取消，`tasks` 模块调用执行器时使用任务自己的取消上下文，只有取消接口、服务关闭与显式中断能取消它。

### 17.8 并发与幂等

| 场景 | 处理规则 | 断言口径 |
|---|---|---|
| 同批创建 | 批次、任务、依赖、步骤在 1 个事务内写入；任一失败全部回滚，不留任务行、不留卡片 | 失败响应后按 `sessionId` 查任务数不变 |
| 批量并发 | 同一会话的两个创建请求串行提交（SQLite 单写者）；后提交的批次 `order_index` 从 0 重新计数，不跨批次续号 | 两个批次各自 `orderIndex` 从 0 起，互不影响 |
| 重复提交 | 同一 `session_id` 与 `clientMutationId` 的重放返回首次结果，`idempotent=true`；占位未完成时返回 409 `mutation_in_progress` | 重放后任务数不变、`batchId` 与 `messageId` 与首次一致 |
| 幂等键规则 | 键按会话隔离，长度 ≤64，保留 7 天；空键不去重；同一键不同请求体视为冲突，返回 409 `mutation_in_progress` 且不覆盖首次结果 | 同键不同体两次请求，第二次 409，首次数据不变 |
| 取消并发 | 用条件更新 `UPDATE tasks SET status='cancelled' WHERE id=? AND status IN ('pending','queued','running')`；受影响行数为 0 时读当前状态，终态返回 200 且 `changed=false`，不覆盖已完成结果 | 两个并发取消只有一个写入成功，两次响应最终状态一致 |
| 重试并发 | 条件更新带上 `attempt=旧值`，受影响行数为 0 时返回 409 `task_state_conflict`；重试后旧执行上下文的写事件按 `attempt` 丢弃 | 同一任务并发重试只产生 1 个新 attempt |
| 步骤事件乱序 | 步骤更新带 `stepSeq`，写入用 `seq` 做条件；事件按 `stepSeq` 与事件 id 双序发送；客户端丢弃小于等于已应用序号的步骤事件 | 乱序到达后最终步骤状态与详情一致 |
| 轨迹乱序 | `traceSeq` 由任务级计数器在同一事务内分配，追加写不更新已有行 | 详情中 `seq` 连续、无重复、无回退 |
| 触发计数 | `each` 触发时 `trigger_count` 与 `attempt` 在同一事务内自增，条件为当前 `status` 不是终态 | 三个前置触发 3 次，`triggerCount=3` |
| 服务重启 | 恢复时把 `running` 与 `queued` 置 `interrupted`，`fail_reason` 写「服务重启，任务已中断」，不自动重试；下游保持 `pending` | 重启后不存在 `running` 行，任务数不变 |

创建请求的幂等占位与既有 `client_mutations` 表分离，任务侧只使用 `task_batches.client_mutation_id`，避免与聊天消息幂等互相污染。占位清理沿用 7 天 TTL 口径，实现时补一条启动清理，清掉 `client_mutation_id` 非空且无对应任务行的批次行。

### 17.9 持久化与迁移

| 模块 | 迁移 | 内容 | 旧库升级路径 |
|---|---|---|---|
| tasks | v8 | `tasks` 表加 14 列，全部带默认值；加 `idx_tasks_session_updated(session_id, updated_at)` 与 `idx_tasks_batch(batch_id)` | 加列后旧行按默认值读，`mode` 为 `plan`、`waiting_reason` 为空、时间字段为 0；旧行 `blocked` 只在读取时映射，不批量改写 |
| tasks | v9 | 新建 `task_steps`、`task_traces`、`task_batches`、`task_deps` 与各自索引 | 迁移末尾逐行读 `tasks.steps` 的 JSON，写入 `task_steps`；解析失败的行跳过并记日志，旧列保留只读，不回删 |
| chat | v24 | `messages` 加 `batch_id TEXT NOT NULL DEFAULT ''`，加 `idx_messages_batch(batch_id)`：v23 已被 `session_read_cursors` 占用，本迁移顺延到 v24 | 旧消息 `batch_id` 为空，卡片查询按空值跳过；历史 `category=progress` 不变 |

迁移版本按模块独立记录，库级版本取各模块最大版本，当前 tasks 为 v9、chat 为 v24、核心 eventlog 与 sessions 不变。升级顺序固定为先 tasks v8、再 tasks v9、最后 chat v24，三步都在启动时由 `db.Migrate` 串行执行，失败即启动失败，不进入半迁移状态。回滚采用“保留数据、停写新列”的方式：回滚到旧版本时新列与新表原样保留，旧代码不读它们；不删除表、不清空列、不改写历史 `blocked` 行。`task_steps` 与 `tasks.steps` 并存期间以 `task_steps` 为准，下一轮变更再评估删除旧列。

### 17.10 本轮新增错误码

| 错误码 | HTTP | 何时返回 | 文案要点与客户端动作 |
|---|---|---|---|
| `task_not_found` | 404 | 任务 id 不存在，或任务与会话不匹配 | 「任务不存在」；前端退出详情并刷新列表，不提示“无权限” |
| `task_state_conflict` | 409 | 重试、确认、恢复的状态前提不满足 | 「当前状态不支持该操作」，带 `currentStatus`；前端刷新该任务后隐藏不适用入口 |
| `invalid_task_mode` | 400 | `mode` 不是 `plan`/`explore`，或 `explore` 携带步骤 | 「执行模式不合法」；前端回退到 `plan` |
| `invalid_task_status` | 400 | 列表筛选 `status` 含未知值 | 「筛选状态不合法」；前端重置为全部 |
| `invalid_task_limit` | 400 | `limit` 越界 | 「每页条数需在 1 到 100 之间」；前端改用 50 |
| `task_batch_too_large` | 400 | 一次创建超过 12 个任务 | 「单次最多创建 12 个任务」；前端拆批 |
| `invalid_task_dependency` | 400 | 依赖不存在、跨批次、自依赖、成环、同一任务入边 `joinMode` 混合 | 「任务依赖不合法」；前端提示并阻止提交 |
| `task_context_too_large` | 413 | 目标、输入或约束合计超过上限（目标 2000 字、输入与约束各 20 条） | 「任务上下文过大」；前端要求删减 |
| `permission_denied` | 403 | 路径越出工作区、工具不在白名单、未授权网络或子进程 | 「操作超出会话权限」；前端展示为工具调用失败，不重试 |
| `task_executor_unavailable` | 503 | 任务模块已启用但执行器未装配（缺少真实执行器或模型配置） | 「任务执行器不可用」；前端禁用发起入口并提示稍后重试 |

错误信封沿用 §14 的 `{"ok":false,"error":"...","code":"..."}`；`task_state_conflict` 额外带 `currentStatus`，`permission_denied` 额外带 `path` 或 `tool`，其余不追加字段。错误码不进入既有 §14 总表的同名冲突项，实现时按本节追加进 §14。

### 17.11 与现有实现的差异

| 项 | 现有实现 | 本节契约 | 处理方式 |
|---|---|---|---|
| 失败级联 | `onWorkflowTaskFinished` 把下游置 `blocked` 并写「前置任务失败/取消」 | 下游保持 `pending` 加 `dependency`，不写 `blocked`、失败计数不变 | 改为等待语义，历史 `blocked` 行只读映射 |
| 步骤存储 | `tasks.steps` 存 JSON，步骤没有独立行与时间戳 | `task_steps` 行级存储，含 `seq`、起止时间、失败原因 | v9 迁移回填，旧列保留只读 |
| 创建入口 | 只有 `chat/loop.go` 的 `delegate` 在明确任务意图时创建单个任务，无批次、无模式、无上下文快照 | 会话内接口支持 1–12 个任务、两种模式、上下文快照与幂等键 | 新增 N1，`delegate` 改为调用同一服务方法 |
| 任务卡片 | 创建任务后不写 `messages`；`category` 白名单只有 4 个值 | 写 `role=agent`、`category=task`、`task_id`、`batch_id` 的卡片与汇总卡 | 扩白名单，卡片写入放进创建事务后的同一次提交 |
| 列表 | 全局 `GET /api/tasks` 返回全部任务，无筛选无计数 | 会话内列表，四态筛选、批次筛选、计数与游标 | 新增 N2，全局接口保留 |
| 取消 | 只取消单个任务，等待执行器 5 秒，无级联、无条件更新 | 支持 `scope=chain`，条件更新，终态 200 幂等 | 改造既有取消，补级联 |
| 重试 | 任意状态都能重试，包括 `done` | 只允许 `failed`、`cancelled`、`interrupted` | 收紧为 409，需同步前端 |
| WS | 只有 `task.created`、`task.updated`、`task.report`，payload 无 `displayStatus`、`waitingReason`、`triggerCount` | 6 个 `task.*` 事件，payload 含展示态、等待原因、触发计数 | 扩白名单与 payload，保持旧字段 |
| 执行器上下文 | 沿用聊天回合上下文，受 12 分钟墙钟取消 | 任务独立取消上下文，无系统执行超时 | 执行器入口改为接收任务级 `context.Context` |
| 交付物 | 全局 `GET /api/deliverables` 扁平分页，无类型徽标与任务名 | 会话内按任务分组，`typeBadge`、`taskTitle`、下载地址 | 新增 N9，全局接口保留 |
| 任务数上限 | 工作流上限 12、并发 3，由 `maxWorkflowTasks`、`maxWorkflowConcurrency` 控制 | 批量上限 12 沿用；并发默认 3，可用 `SIMO_WORKFLOW_CONCURRENCY` 覆盖 | 沿用现有常量与配置项 |

### 17.12 证据与 AC 承载

后端实现已完成，证据见 `specs/changes/CHG-CONV-007/evidence.md` §1；本节列后端承载的判据与断言脚本，脚本路径统一为 `scripts/ac/AC-CONV-009-*.mjs`。

| AC | 后端判据 | 证据形式 |
|---|---|---|
| `AC-CONV-009-01` | 创建 1 个任务后返回 1 个任务与 1 个 `messageId`，消息行 `category=task`、`role=agent`、`task_id` 非空 | 脚本断言响应与 `messages` 行 |
| `AC-CONV-009-02` | 一次创建 10 个任务返回 `batchId`、10 个任务、1 个 `messageId`；列表按 `batchId` 过滤 `total=10` | 脚本断言计数与汇总卡唯一性 |
| `AC-CONV-009-03` | 详情 `context.historyCount=0`、`goal` 非空、`constraints` 条数 ≥1 | 脚本断言 `context` 字段 |
| `AC-CONV-009-04` | 允许工具调用返回成功并落轨迹；越权路径返回 403 `permission_denied` 且在轨迹里留 `403` 记录 | 脚本断言状态码与轨迹 |
| `AC-CONV-009-05` | 8 步任务详情 `steps` 按 `seq` 1 到 8 返回，第 6 步为 `currentStepId`，已完成步骤有起止时间 | 脚本断言顺序与 `currentStepId` |
| `AC-CONV-009-06` | `explore` 任务 `steps` 为空、`traces` 14 条、`seq` 单调递增 | 脚本断言条数与序号 |
| `AC-CONV-009-08` | 右栏宽度由前端渲染；`GET /api/sessions/{id}/tasks` 返回当前会话任务与 `counts`，收起面板不改变后端状态 | 脚本 `scripts/ac/AC-CONV-009-08.mjs` 断言三档宽度与三标签，接口只作数据源 |
| `AC-CONV-009-09` | 进行中 2 个时 `counts.running=2`，11 个时 `counts.running=11` | 脚本断言计数；角标文案由前端断言 |
| `AC-CONV-009-10` | 折叠态由前端按会话记在 `localStorage`，后端不落库；接口在切会话后返回目标会话的四块计数 | 脚本 `scripts/ac/AC-CONV-009-10.mjs` 断言刷新与换会话后的折叠态 |
| `AC-CONV-009-11` | 接口返回任务 `total` 与游标，供「还有 N 个」计算；跳转与滚动定位由前端实现 | 脚本 `scripts/ac/AC-CONV-009-11.mjs` 断言目标首行距滚动口 0–8px |
| `AC-CONV-009-12` | 四态筛选分别返回 11、2、1、3 条，`counts` 与筛选无关 | 脚本断言四个 `total` |
| `AC-CONV-009-13` | 任务图 8 个节点、四态之和为 8、失败节点下游边 `style=dashed`、`layers` 覆盖全部节点 | 脚本断言图数据 |
| `AC-CONV-009-14` | 三个前置依次完成时，`all` 启动 1 次、`any` 启动 1 次、`each` 启动 3 次且 `triggerCount=3` | 脚本断言 `attempt` 与 `triggerCount` |
| `AC-CONV-009-15` | 取消 A 后 B 的 `status=pending`、`waitingReason=dependency`、步骤启动 0 次、失败计数不变 | 脚本断言 B 状态与计数 |
| `AC-CONV-009-16` | 交付物分组返回类型徽标、任务名、下载地址；下载字节数与 `size` 一致 | 脚本断言分组与下载响应长度 |
| `AC-CONV-009-17` | 会话 B 请求会话 A 的任务返回 404 `task_not_found`，响应体不含任务标题 | 脚本断言状态码与响应体 |
| `AC-CONV-009-18` | 无时限任务运行 30 分钟不产生取消；有时限任务到点只发 1 条 `task.reminder`，状态不变 | 脚本断言 `task.reminder` 条数与状态 |

纯前端判据的 AC 为 `AC-CONV-009-07`（详情入口与只读）、`08`（右栏宽度）、`10`（折叠记忆）、`11`（跳转定位）中的视觉部分，后端只提供数据与计数，不承担视觉断言；`08`、`10`、`11` 的接口侧承载列在上表，`07` 由前端断言详情入口、后端提供详情数据。

### 17.13 涉及文件

| 文件 | 本轮改动 |
|---|---|
| `backend/internal/modules/tasks/migrations.go` | 新增 v8、v9 迁移 |
| `backend/internal/modules/tasks/service.go` | 创建、取消、重试、事件 payload 按本节扩展 |
| `backend/internal/modules/tasks/workflow.go` | 依赖等待、`joinMode`、`triggerCount`、失败级联改为等待 |
| `backend/internal/modules/tasks/http.go` | 新增 N1–N9 路由与参数校验 |
| `backend/internal/modules/tasks/deliverables.go` | 分组查询与类型徽标派生 |
| `backend/internal/modules/tasks/concurrency.go` | 并发槽与批次串行 |
| `backend/internal/core/task/task.go` | 增加 `Mode`、`WaitingReason`、`BatchID`、`TriggerCount` 等字段 |
| `backend/internal/modules/chat/category.go` | `category` 白名单加入 `task`，仅服务端可写 |
| `backend/internal/modules/chat/cards.go` | 卡片与汇总卡写入 `batch_id` |
| `backend/internal/modules/chat/loop.go` | `delegate` 改调会话内创建服务，执行器使用任务级上下文 |
| `backend/internal/core/eventlog/eventlog.go` | 白名单加入 `task.step`、`task.trace`、`task.reminder` |
| `scripts/ac/AC-CONV-009-*.mjs` | 18 个断言脚本已建，证据见 `specs/changes/CHG-CONV-007/evidence.md` §1 |

### 17.14 未实现项与未决问题

未实现项（0 条）：N1–N9 全部接口、`task_steps`/`task_traces`/`task_batches`/`task_deps` 四张表、tasks v8/v9 与 chat v23 迁移、6 个 `task.*` 事件的发送与白名单、卡片与汇总卡写入、按任务分组的交付物查询、任务级取消上下文均已实现，证据见 `specs/changes/CHG-CONV-007/evidence.md` §1；本节只按断言脚本的实际结果记录实现状态，不写“已验证”。

未决问题：

1. 汇总卡的 `task_id` 取批内首个任务以同时满足 DEC-26 的非空约束与汇总卡形态，产品侧尚未确认这个折中；若改为允许卡片 `task_id` 为空，需要改 DEC-26。
2. `each` 语义下同一任务串行重跑时，步骤与轨迹是复用同一组步骤行还是每次触发新建一组，设计稿未规定；当前契约按复用并递增 `attempt` 处理。
3. 等待确认时审批记录与任务等待的一一对应关系未定：一次确认是否可放行同一任务的后续同类工具调用，还是每次都需重新确认，沿用会话级授权时两种解释都成立。
4. 时限提醒的展示位置：本节只发 `task.reminder` 事件，是否同时写一条消息（会改变消息流条数）需前端与产品确认。
5. 交付物类型徽标对未知 `mime` 归 `doc` 是兜底口径，产品未给出未知类型的展示约定。
6. 预算上限提高的入口本轮不提供，只能改会话级配置；是否需要任务级编辑接口待 P2-TASK 定。
7. 取消整链时已完成任务是否保留在汇总卡计数里，产品只规定下游不启动，未规定汇总卡文案如何变化。
8. `tasks` 模块关闭时不注册路由返回 404，与“跨会话 404”共用状态码但语义不同；前端无法区分，是否需要专门的降级探测接口待定。

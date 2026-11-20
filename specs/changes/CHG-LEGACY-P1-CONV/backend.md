# BACKEND · CHG-LEGACY-P1-CONV

- Scope：backend/internal/modules/sessions/**、backend/internal/modules/chat/**、WS 注册
- 状态：历史归档；无新增实现、无迁移
- 后端入口：`backend/cmd/simo` 模块注册

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/sessions/module.go` | sessions 模块注册与依赖装配 |
| `backend/internal/modules/sessions/http.go` | 会话 CRUD/tree/archive/pin 路由 |
| `backend/internal/modules/sessions/service.go` | 生命周期与归属服务 |
| `backend/internal/modules/sessions/overview.go` | 会话概览投影 |
| `backend/internal/modules/sessions/spec_projection.go` | Spec 投影接口 |
| `backend/internal/modules/chat/http.go` | 消息、Chat、卡片动作路由 |
| `backend/internal/modules/chat/reply.go、loop.go` | 回复与事件循环 |
| `backend/internal/modules/chat/all_messages.go` | 祖先/跨会话消息聚合 |
| `backend/internal/modules/chat/cards.go、attachments.go` | 卡片动作与附件 |

## 2. API（实际注册）

| 方法/路径 | 行为 |
|---|---|
| `GET/POST /api/sessions` | 会话列表/创建 |
| `GET /api/sessions/tree` | 会话树 |
| `PATCH /api/sessions/{id}` | 重命名/更新 |
| `POST /api/sessions/{id}/archive|unarchive|pin|unpin` | 生命周期与置顶 |
| `GET /api/sessions/{id}/overview|spec-projection` | 概览/Spec 投影 |
| `GET /api/messages` | 消息列表 |
| `GET /api/sessions/{id}/messages?scope=all` | 祖先/整级加载 |
| `GET /api/messages/search` | 消息搜索 |
| `POST /api/chat` | 发送消息 |
| `GET /api/ws?sessionId=` | 事件流/重连 |
| `POST /api/cards/{id}/actions/{actionId}` | 卡片动作 |

## 3. 数据与迁移

会话、消息、卡片与附件存储由 sessions/chat 模块的 SQLite 迁移维护；本包只归档实际路由与模块边界，不新增表。

## 4. 错误与边界

- 只记录已有路由；未逐端点验证参数错误、权限、冲突、超时与重试矩阵。
- 全量后端测试使用临时 `SIMO_HOME`/SQLite，不接触正式数据。
- 本包不把 223/223 全量通过写成该域每个 PRD 的 AC 通过。

## 5. 测试映射

后端全量 `go test ./... -count=1 -json` 为 223/223 PASS（26 包，0 fail/skip），但本轮未把具体 Go 测试逐一映射到 P1 PRD；不得用全量通过替代前端 AC。

| 证据 | 结果 | 边界 |
|---|---|---|
| `cd backend && go test ./... -count=1 -json` | 223/223 PASS（26 包，0 fail/skip） | 全量套件通过；未按本域 PRD 逐一命名 |
| 前端/ E2E 交叉证据 | 见 `frontend.md` 与 `evidence.md` | 仅覆盖展示/主路径，不替代后端 AC |

## 6. 未验证 / 风险

- 多标签 SYNC-002 无执行证据
- 未读/已读 SYNC-004 无统一口径
- 远程访问/通知中心 SYNC-005 未实现
- WS 重连/回放/去重无域级测试
- 未执行逐路由 HTTP 契约矩阵（400/403/404/409/500）。
- 未做并发、迁移回滚、崩溃恢复与长时间运行测试。

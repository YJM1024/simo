# CHG-CONV-004 · 后端开发 spec

状态：**partial**（后端只承担 SYNC-001 的 WS 契约；SYNC-002/003 明确 N/A）
Change: CHG-CONV-004
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003
Scope：`backend/platform/httpserver/ws.go`、`backend/internal/modules/chat/`（广播）
N/A：**SYNC-002 / SYNC-003 为纯浏览器标签间同步，后端不参与**；理由：`tabsync.ts` 使用 BroadcastChannel，服务器无多标签会话概念、无设备注册、无推送通道。若未来做跨设备同步需另开变更包（SYNC-005 相关）。

## 1. WS 契约

| 项 | 契约 | 代码 | 测试 |
|---|---|---|---|
| 连接 | `GET /api/ws?sessionId=` 升级 WebSocket | `platform/httpserver/ws.go` | `TestWebSocketEventOrder` |
| 订阅 | `{type:'subscribe', data:{sessionId, since?}}` | ws.go | `TestWebSocketSinceContinuation` |
| 帧类型 | `reply.delta`（增量）、`message.created`、`reply.done`、`message.done` | ws.go / chat | `TestWebSocketEventOrder` |
| `seq` | 每事件递增，客户端据此去重/补发 | ws.go | `TestWebSocketSinceContinuation` |
| fanout | 同会话多客户端同时收到 | ws.go | `TestM88WebSocketFanoutTwoClients` |
| 归档会话 | WS 返回 error 帧，不产生回复 | chat/m6 | `TestM6ArchivedChatWSReturnsErrorNotReply` |
| 停止帧 | `{type:'correct', data:{sessionId}}` | ws.go | **无测试** |

## 2. 回放语义

- `since` 为客户端最后 `seq`；服务端补发其后事件。截断/上限/持久化窗口**未定义**（实现为事件日志回放，具体边界未测）。
- 协议未声明"重连后必须全量刷新"的兜底；长断线（超出日志保留）行为未知。

## 3. 多会话与并发

- 订阅按 `sessionId` 隔离（前端每次 active 会话重连）；后端是否允许单连接多订阅未定义。
- 广播为进程内 fanout；单实例桌面应用，无多副本一致性问题。

## 4. 缺口

| 项 | 状态 | 影响 |
|---|---|---|
| `correct` 帧语义（是否真的中止生成） | 无测试 | 停止体验不可断言 |
| `since` 截断/日志保留窗口 | 未定义 | 长断线可能丢事件 |
| 重连风控（多客户端反复重连） | 未实现 | 桌面单用户风险低 |

## 5. 验收（后端部分）

- A：WS 帧类型/`seq`/`since`/fanout 各有已执行测试。
- A：明确 SYNC-002/003 后端 N/A 及理由，避免"后端没做"被误读为缺口。
- A：`correct` 与回放截断必须标 `missing` 或补测试。

# CHG-CONV-003 · 后端开发 spec

状态：**partial**
Change: CHG-CONV-003
Implements: PRD-CONV-005、PRD-CONV-006
Scope：`backend/internal/modules/chat/`（`POST /api/chat`、WS 帧）、`backend/platform/httpserver/ws.go`
N/A：不适用（本包涉及 API 与流式契约）。

## 1. 发送与流式契约

| 方法/帧 | 行为 | 代码 | 测试 |
|---|---|---|---|
| `POST /api/chat` | 入参 `{sessionId,text,clientMutationId?}`；返回 202 Accepted，异步生成 | `chat/module.go`（路由 173–213 段） | `TestM2MockStreamRecordsUsageAndDecision`、`TestChatPersistsAndFiltersBySession` |
| WS `/api/ws?sessionId=` | 订阅；`subscribe {sessionId,since}` | `platform/httpserver/ws.go` | `TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients` |
| `reply.delta` | 增量文本，前端按 `id` 追加 | ws.go | 同上 |
| `message.created` / `reply.done` / `message.done` | 触发前端刷新；带 `seq` 用于去重与补发 | ws.go | `TestWebSocketEventOrder` |
| `correct` 帧 | 停止当前回复 | ws.go | 无直接测试（前端 `stop()` 发送） |

## 2. 幂等与 `clientMutationId`

- 后端 `chat` 模块对 `clientMutationId` **零处理**（grep 0 匹配）：既不校验也不去重。
- 因此"重复发送去重"目前只有前端 `sendingRef` 互斥，**不是服务端幂等**；网络重试/多标签同时发送可能产生重复回复。
- 结论：`AC-CONV-005-02` 的幂等部分 **不成立**，需产品定口径后补实现与测试（TASK-02）。

## 3. 流式恢复

| 场景 | 机制 | 测试 |
|---|---|---|
| 服务重启时遗留 exploring | 启动恢复为失败/停止态 | `TestM55StartupRecoversStaleStreaming` |
| 流式超时 | 看门狗超时结束 | `TestM55StreamingWatchdogTimeout` |
| 归档会话发送 | WS 返回 error 帧，不产生回复 | `TestM6ArchivedChatWSReturnsErrorNotReply` |
| 断线后补发 | `since` + `seq` 回放 | `TestWebSocketSinceContinuation`（后端侧） |

## 4. 错误契约

- 统一错误信封；非 JSON 路径返回 JSON 404（`TestAPINotFoundIsJSON`）。
- 归档/只读会话写入被拒；内部消息不进入流（见 CHG-CONV-002）。
- 请求体上限：大请求返回带 code 的错误（`TestM7LargeRequestBodyRejectedWithCode`），前端映射 413。

## 5. 缺口

| 项 | 状态 | 影响 |
|---|---|---|
| `clientMutationId` 幂等 | **未实现** | 重试/多标签可能重复 |
| `correct` 帧的服务端语义 | 无测试 | 停止是否真正中止生成未验证 |
| 多会话订阅隔离 | 仅 `TestM88` 双客户端 fanout | 多会话并发订阅未测 |
| 断线期间消息补偿边界 | `since` 回放已测，溢出/截断未测 | 长时间断线可能丢帧 |

## 6. 验收（后端部分）

- A：发送/流式/停止/恢复四条路径各有测试或 `missing`。
- A：幂等必须明确实现状态，不得默认"前端防抖=服务端幂等"。
- A：`since`/`seq` 回放的截断与上限写入契约。

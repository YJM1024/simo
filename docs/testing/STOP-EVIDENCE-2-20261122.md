# 停止按消息定向证据（AC-CONV-005-01/02，2026-11-22）

结论：前端停止已从“只忽略本地 delta”改为对每条流式消息逐条发 `correct` 帧并携带 `messageId`，后端按 `findActive(sessionID, messageID)` 只取消命中那条流；同会话并发两条流时停第一条，第一条零 delta 且 `status=retracted`，第二条继续 delta 并 `done`。本文更正 `docs/testing/STOP-EVIDENCE-20261122.md` 第 25 行“前端不发 correct 帧”的旧结论。

## 链路

```text
UI「停止」点击（app.tsx:710）
  -> 对每条 streaming 消息：ignoredReplyIds.add(id) + events.stop(id)（app.tsx:715-718）
  -> correct 帧 {sessionId, messageId}（api.ts:251-258）
  -> 后端 correctPayload.MessageID（http.go:67）经 http.go:384 透传
  -> loop.go:1120 findActive(sessionID, messageID)；找不到只记 Warn，不扩大到其它流（loop.go:1121-1129）
  -> loop.go:1140 active.cancel()
  -> 撤回后零 delta、消息 status=retracted（stop_interrupt_test.go:566-595）
  -> turn 落回 idle，active 清空（stop_interrupt_test.go:32 用例断言）
```

## 代码位置

- 前端帧构造：`frontend/src/api.ts:251-258`，`data.messageId` 仅在非空时写入；逐条发送与本地忽略：`frontend/src/app.tsx:710-721`。
- 后端字段与透传：`backend/internal/modules/chat/http.go:67`（`MessageID` 字段，`json:"messageId"`）、`http.go:384`（传入 `m.correct`）。
- 后端定向取消：`backend/internal/modules/chat/loop.go:1109-1151`（`messageID` 非空走 `findActive`，为空保留“停最新一条”）；`findActive` 按 `SessionID` 与 `ReplyID` 过滤，见 `loop.go:1153-1169`。

## 用例与实测（2026-11-22 14:0x）

- `TestStopFrameByMessageIDStopsOnlyTargetStream`（`backend/internal/modules/chat/stop_interrupt_test.go:402`）：同会话同 WS 两条并发流，不存在的 messageId 不取消任何一条；停第一条后其上游 context 5 秒内取消、零 delta、`status=retracted`，第二条继续 delta 并 `reply.done`，`sseRequests==2`；PASS 2.07s。
- `TestStopFrameCancelsUpstreamAndStopsDeltas`（同文件 `:32`）：单流停止取消上游、停止后 delta 为 0、idle 且已产出内容保留。
- 前端 `App.conversation.test.tsx:455`：并发两条流时点停止恰发 2 个 `correct` 帧，`messageId` 集合为 `['stream-1','stream-2']`，后续两条 delta 均不渲染。
- 整包与全量：后端 chat 包 `ok simo/internal/modules/chat 3.139s`；前端 23 文件 / 243 用例通过（26.45s，0 skip）；`tsc` 与 `go vet` EXIT=0。

## 未验证

- 真实厂商连接级中断：本机 `api.deepseek.com` 仍 403，取消由可控假上游的 `r.Context().Done()` 证明。
- 跨标签双 WS：并发用例跑的是同一条 WS 上的两条流，两个标签各持一条 WS 的场景未跑。

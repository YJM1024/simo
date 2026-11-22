# 停止中断证据（AC-CONV-005-02）

> **更正（2026-11-22）**：原文第 25 行（现第 27 行）“前端不发 `correct` 帧”已过时。前端现在 `app.tsx:710-721` 对每条流式消息逐条发帧，`api.ts:251-258` 带 `messageId`，以后端按消息定向取消为准；详见 [`STOP-EVIDENCE-2-20261122.md`](STOP-EVIDENCE-2-20261122.md)。

结论：新增用例 `TestStopFrameCancelsUpstreamAndStopsDeltas` 真跑通过。用例通过真实 WS `correct` 帧驱动后端停止路径，用可控假上游证明停止会取消上游 HTTP 请求的 context，取消后不再追加 delta，turn 落回 idle。真实 `api.deepseek.com` 本机仍 403，本证据覆盖可控上游链路，不覆盖真实厂商链路。

## 用例与断言

- 测试文件 `backend/internal/modules/chat/stop_interrupt_test.go:32`，用例名 `TestStopFrameCancelsUpstreamAndStopsDeltas`。
- 假上游 `backend/internal/modules/chat/stop_interrupt_test.go:39`：`httptest` SSE 服务，首帧 `@@CATEGORY: consultation\n\n`，之后每 15ms 写一帧 `第%03d段流式内容；`；`<-r.Context().Done()` 关闭时 `close(upstreamCanceled)`（`:78`–`:82`）。
- 被测路径为真实的“WS 帧 → `correct` → `active.cancel()` → provider HTTP 请求”：WS 帧 `{"type":"correct","data":{"sessionId":"sess-stop"}}`（`:158`）经 `backend/internal/modules/chat/http.go:367` 分发到 `func (m *Module) correct`（`backend/internal/modules/chat/loop.go:1107`），provider 是真实 `llm.NewDeepSeek`，只把 BaseURL 指向假上游（`:88`）。
- 断言一，上游 context 被取消：停止前先断言尚未取消（`:154`），停止后 5 秒内必须收到 `upstreamCanceled`（`:171`）；假上游恰好收到 1 次 `/chat/completions`（`:226`），排除重试或旁路。
- 断言二，停止后不再推送 delta：`reply.retracted` 之后 `reply.delta` 与 `message.delta` 计数为 0（`:202`）；停止前事件日志里已产出的 delta 拼接文本仍是停止后全量的前缀（`:205`，拼接见 `replyDeltaText` `:376`）。
- 断言三，落回 idle 且已产出内容保留：`status{state:"idle"}` 出现在 `reply.retracted` 之后（`waitForIdleAfter` `:353`）；`len(mod.active)==0`（`:221`）；消息行 `status=retracted` 且正文清空（`:213`）。正文清空是后端 spec §5.2 的撤回语义，已产出内容保留在 `reply.delta` 事件日志，由断言二的前缀比较证明。

## 真跑数字（2026-11-22）

1. `..\toolchain\go.ps1 test ./internal/modules/chat/ -run 'Stop|Cancel' -count=1 -v`：`--- PASS: TestStopFrameCancelsUpstreamAndStopsDeltas (0.12s)`、`--- PASS: TestUnreadHubUnregisterStopsDelivery (0.00s)`、`ok simo/internal/modules/chat 0.446s`；2 RUN / 2 PASS / 0 FAIL。
2. `..\toolchain\go.ps1 test ./internal/modules/chat/ -count=1 -v`：19 PASS / 0 FAIL / 1 SKIP（`TestResolveToolPathCanonicalizesWorkspaceRoot`，既有 skip，与本用例无关），`ok simo/internal/modules/chat 0.963s`。
3. 稳定性 `-count=3` 同一用例：`ok simo/internal/modules/chat 0.651s`，连续 3 次通过。

日志留在 `.tmp/stop-targeted.log`、`.tmp/stop-full-v.log`、`.tmp/stop-stability.log`。`node` 不在本机 PATH，`scripts/test-summary.mjs` 未能运行，以上数字由同格式日志直接统计。

## 未覆盖

- 真实模型链路未复验：本机 `api.deepseek.com` 仍返回 403，“上游请求被中断”由可控 HTTP 上游的 `r.Context().Done()` 证明。
- 前端 `stopStreaming`（`frontend/src/app.tsx:710`）仍只在本地 `events.stop()`，不发 `correct` 帧，前端接线缺口 C-06 不变。
- 未直接断言 WS 客户端“停止后无新帧”：`wsPump` 在 `correct` 处理期间读取 `LatestID` 存在竞态，改用事件日志断言等价语义。

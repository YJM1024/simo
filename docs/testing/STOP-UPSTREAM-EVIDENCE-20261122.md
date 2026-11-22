# 停止中断上游证据（AC-CONV-005-01/02，2026-11-22）

假上游 `httptest` SSE 每 50ms 一帧 delta、共 100 帧；simo 走真实 chat 流式链路，WS 以 `since=0` 连接（回放历史帧），断言按帧序而非事件表。新增 `backend/internal/modules/chat/stop_upstream_test.go`。

正向用例 `TestStopUpstreamCanceledByMessageID`（真实流 2 帧后发带 messageId 的 `correct`）实测输出：
- 断言1 `断言1 PASS：上游 context 在停止帧后 10ms 关闭，取消时已吐 2/100 帧`；假上游在 `select` 中观测 `r.Context().Done()` 关闭并记录 `canceledAt=contentSent`。
- 断言2 `断言2 PASS：reply.retracted（帧序 8）之后 reply.delta=0、message.delta=0；停止前 WS 已有 2 个 reply.delta`
- 断言3 `断言3 PASS：status(idle) 帧序 9（在 retracted 之后）、active=0、消息 status=retracted`；另断言 `sseRequests=1`。

负路径 `TestStopUpstreamUnknownMessageIDKeepsStream`（messageId=`msg-not-streaming`）实测：
- `负路径 PASS：未知 messageId 未取消上游（发未知停止帧时上游已吐 2 帧，全流未取消）；停止帧后 300ms 内 delta 从 2 增至 8；最终 reply.delta=100、status=done、idle 帧序 206`

命令与耗时（在 `backend` 下，`..\toolchain\go.ps1` 自动设 Go 环境）：
- `test ./internal/modules/chat/... -run 'Stop|Upstream' -count=1 -v` → 5 PASS / 0 FAIL，`ok simo/internal/modules/chat 8.059s`，墙钟 11.1s，exit 0。
- 全量 `test ./internal/modules/chat/ -count=1 -v` → 40 PASS / 0 FAIL / 1 SKIP（`TestResolveToolPathCanonicalizesWorkspaceRoot`，与停止无关），`ok 8.375s`，墙钟 10.0s，exit 0。

限制：真实厂商 `api.deepseek.com` 今日 403（key 失效），context 取消改由可控假上游观测，价值在于可复现；三条断言都是直接观测（上游 Done 通道、WS 帧、status 事件），未使用替代证据。

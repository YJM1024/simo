# 会话域剩余两条"环境限制未验证"取证（真浏览器，2026-11-22）

环境：Chrome 157 复用 127.0.0.1:9223（CDP 建标签），应用 http://127.0.0.1:8787，健康检查 200，服务 `simo-8787-exit` PID 41564。数值取自 `Runtime.evaluate` 与 `Network.webSocketFrameReceived`，截图在 `docs/testing/`。

## 结论
跨标签双 WS：**pass**。active 跟随 9ms（反向 57ms）、未读点消失 73ms、消息 1511ms 内到 B，均小于 3 秒，且 B 由 WS 帧取得消息而非刷新。
768 档布局：**pass**（按 A4 口径）。768×1024 下 `scrollWidth=768` 无横向溢出、发送与输入命中自身无遮挡；右栏与时间轴整块 `display:none`。

## 跨标签（AC-SYNC-001/002）
| AC | 动作 | 观察值 | 判定 |
|---|---|---|---|
| AC-SYNC-002-01 active | A 点会话 `verify-conv-rest-sync` | B 的 `.session-row.is-active` 9ms 内切到该会话；B 收到 `BroadcastChannel('simo.tab-sync.v1')` 的 `active_session_changed{tabId:"fbc80768…",opId:"…:1795341822439",at:1795341822439,sessionId:"sess-ed275c9234ff49a9"}` | pass |
| AC-SYNC-002-01 未读 | 同一次点击（A 的 `POST /read` 推进游标） | B 未读点 73ms 消失；B 收 WS 帧 `session_read{id:9241,sessionId:"sess-ed275c9234ff49a9"}`，A 收 0 帧（来源连接被排除） | pass |
| 双 WS 推送 | A 发送 `conv-rest-marker-1795341899844` | B DOM 1511ms 出现该文本；B 收 `message.created{id:9242,message.id:"msg-ba6e273e7ec2f68e",role:"user"}` 与 `session_unread`；两端 `.msg` 均 4 条 | pass |
| 反向跟随 | B 点同一会话 | A 的 active 57ms 内跟随，通道双向可用 | pass |
| 刷新后一致 | B 刷新（其自身回落"主会话"） | 15 行会话逐行比对，A、B、`GET /api/sessions/tree` 的未读 0 处不一致；探针会话 `hasUnread=false`；刷新后 4 条消息与 marker 仍在 | pass |

归因：B 跟随后自身也会 `POST /read`，但该次游标已由 A 推进、为 no-op；`session_read` 只在非来源连接出现（A 0 帧、B 1 帧），故该帧可归因于 A 的读取。

## 768 档布局（A4 判；产品 spec 无 AC-CONV-007-03）
| 检查 | 768×1024 | 1180×900 | 判定 |
|---|---|---|---|
| 三栏可见性 | sidebar 220 / 面板 516 / 时间轴 none / inspector none / insp-rail 宽 0 | sidebar 228 / 面板 568 / 时间轴 44 / inspector 280 / rail 40 | 768 档为两栏 |
| 横向溢出 | `documentElement.scrollWidth=768`（=innerWidth），滚到底仍 768，越界元素 0 个 | 1180（=innerWidth） | pass |
| 主操作遮挡 | `elementFromPoint` 在发送键命中 `button.send`、输入框命中自身 | 同左 | pass |
| 时间轴压字 | 时间轴不可见 | 时间轴矩形 248–292，滚动区 280 起，重叠 12px；正文文本左界 351、消息块 300，未压字 | 非缺陷（gutter 悬挑） |

两档差异：1180 为三栏加时间轴与 40px 图标条；768 只剩侧栏与主栏，右栏整块消失、时间轴消失；主栏可用宽度 568 降到 516，无横向滚动。

## 新发现
1）刷新任一标签会把它重置到"主会话"并广播 `active_session_changed`，其它标签被一起拉走：本轮 A 已切到"新会话"，B 刷新后 A 的 active 变回"主会话"（`app.tsx:114` 初始 `useState('main')`，`app.tsx:388-392` 挂载即广播，无持久化）。影响是后台标签刷新会打断前台标签的当前会话，判缺陷。
2）切会话时消息尚未加载，`scrollToBottom` 以空 `messages` 算游标，广播 `read_cursor_changed{at:0}`（`app.tsx:320-332`）；消费端要求 `at>=本地游标`，是无效帧噪声，行为无害。
3）768 档右栏不是"缩成 40px 图标条"而是整块消失（`.insp-rail` 计算宽度 0px），与设计 `specs/design/P1-CONV/spec.md:548` 的 `V-CONV-008-6` 不符；A4 不要求右栏存在，不判 fail。

## 未覆盖
真实模型流式回复（403，已知环境限制，未再试）；B 的未读清除同时受其自身 no-op read 影响，已用帧归属隔离；375/1280 档本轮未复测；三标签以上、WS 断线重连、同 `at` 冲突未测。

## 证据
截图（`docs/testing/`）：`conv-rest-1180.png`、`conv-rest-768.png`、`conv-rest-768-bottom.png`、`conv-rest-tabA-probe.png`、`conv-rest-tabB-probe.png`、`conv-rest-tabA-sent.png`、`conv-rest-tabB-received.png`、`conv-rest-tabB-reload-consistent.png`、`conv-rest-tabB-switched.png`、`conv-rest-restored.png`。脚本与原始值：`conv-rest-verify.mjs`、`conv-rest-verify2.mjs`、`.conv-rest-result.json`、`.conv-rest-result2.json`、`.conv-rest-run.log`、`.conv-rest-run2.log`。造数：新增会话 `sess-ed275c9234ff49a9`（`verify-conv-rest-sync`，4 条消息）保留；其余会话内容未动（"新会话""主会话"因进入而被标已读）。

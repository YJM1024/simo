# P1-CONV 第八轮最终合并验收（ACCEPT-CONV-8）

| 项目 | 值 |
|---|---|
| 验收时间 | 2026-11-22 13:51–14:20（Asia/Shanghai） |
| 工作树 | `E:\dsh_home\workspaces\agent`（无 git CLI，未 commit） |
| 运行实例 | 8787 `backend/simo-8787-conv8.exe`，health 200，未重启 |
| 浏览器 | Chrome 157.0.8103.80，CDP `127.0.0.1:9223` |
| 范围 | 任务 A（375 截图）、任务 B（conversation-panel 复签）、任务 C（AC-CONV-005 链路）、任务 D（test-plan 矩阵） |
| 可写范围 | `docs/testing/`、`.tmp/accept8/`、`specs/test/P1-CONV/test-plan.md`；未改源码 |

## 结论

任务 A 通过：375×812 四态实测中 Composer、输入框、发送按钮的可见比例均为 1，与 sidebar、inspector 的矩形均不相交，页面 `scrollWidth` 等于 375，`sendHit` 命中发送按钮，console 错误 0；四张截图已落 `docs/testing/`，metrics 在 `.tmp/accept8/375-metrics.json`。

任务 A 的“抽屉打开态”未取到：当前构建在 375 把 sidebar 与 inspector 都设为 `display:none`，DOM 内 toggle 数量为 0，没有可打开入口；按产品 AC-CONV-008-03 的“右栏不遮挡”判据通过，抽屉本身记为未实现或不适用。

任务 B 通过：A3 的表格子句由 `frontend/src/components/MessageTableLayout.test.tsx` 在 1180 与 375 真机复测，2/2 PASS，`.msg-table-wrap` 的 `scrollWidth` 大于 `clientWidth`，页面与 `.conversation-scroll` 均无横溢；A5 已由 `frontend/src/components/components.css:901-908` 去掉卡内第二层白底。

任务 B 的其余判据沿用 `docs/testing/COMP-SIGN-2-20261122.md` 与 `docs/testing/COMP-SIGN-3-20261122.md` 的真机实测，A1、A2、A4、A6、A8、A9、A11、A12、A13 通过，A7 的 error 态高度与 ready 一致，A10 画廊四态齐全；本轮补测 375 容器圆角计算值为 0，未发现新的未达标项。

任务 B 的文档事实是：spec §8 只有 A1–A13（第 244–256 行），没有 A14/A15；文件头第 3 行与 §5.1 第 192–200 行仍写 A5 双层白底、A7 未验证、A10 缺态、A13 的 37px/51px，这些是 2026-11-21 的旧状态，已被后续实测与当前 CSS 推翻。

任务 C 判 partial：UI 点击、`correct` 帧、后端 cancel、零 delta、idle 的链路在单流下已经闭合，三处证据行号见正文；断点是帧只带 `sessionId`（`frontend/src/api.ts:250-253`），后端 `findActive` 只取 `StartedAt` 最大的一条（`backend/internal/modules/chat/loop.go:1136-1152`）。

任务 C 的第二处缺口是真实厂商上游仍 403 未覆盖，STOP-EVIDENCE 的可控假上游不能替代厂商链路；该文档第 25 行“前端不发 correct 帧”是过时陈述，本轮以代码与单测更正为历史记录。

任务 D 完成：`specs/test/P1-CONV/test-plan.md` 头部改为 30 pass、3 partial、0 missing、2 blocked，基线写前端 242（实测）、后端 285+新增；矩阵第 144/145 行改 partial，第 161/162 行补本轮证据，自查脚本输出 `rows=35`、`effective=33`、`pass=30`、`partial=3`、`blocked=2`。

本轮前端全量真跑 23 个文件 242 条全过、0 skip（`.tmp/accept8/frontend-all.log`）；后端全量 13:56 启动后 11 分钟日志仍为 0 字节，已停止并记未取到，定向 `TestStopFrameCancelsUpstreamAndStopsDeltas` 重跑 PASS 0.14s（`.tmp/accept8/stop-targeted.log`）。

33 条生效 AC 的判定是 30 pass、3 partial（005-01、005-02、006-02）、0 证据不足，与旧口径 29/1/3 的差异来自 008-03 与 008-04 补齐、005-01/02 降级。

12 个 PRD 的结论是 10 covered、2 conditional（CONV-005、CONV-006）、0 not covered；CONV-008 由 not covered 转 covered，CONV-005 由 not covered 转 conditional，CONV-004 维持 covered 并补上表格真机滚动证据。

签字结论是不可签，剩余阻断为 AC-CONV-005-01/02 与 AC-CONV-006-02；前者缺 `messageId` 定向停止与并发双流实测，后者缺真实中文输入法的人工验证。

## 1. 四条任务

### 任务 A：375 像素截图与几何（AC-CONV-008-03）

`docs/testing/final-375-initial.png`、`final-375-scrolled.png`、`final-375-composer-focus.png`、`final-375-typed.png` 四张截图覆盖初始、滚动、聚焦、输入四态。原始 metrics 在 `.tmp/accept8/375-metrics.json`，运行日志 `.tmp/accept8/375-run.log`，脚本 `.tmp/accept8/375.cjs`。

四态一致的关键数值：Composer 矩形 `x=8, w=359`，输入框与 Composer 的 `visibleRatio=1`，发送按钮 `x=302, y=707, 54×44`、`visibleRatio=1`，`elementFromPoint` 命中 `BUTTON.send`；输入文字后 `sendDisabled=false`，`textareaHit` 为 `TEXTAREA`。`inspector` 与 `sidebar` 均为 `display:none`、宽高 0，与 Composer、发送按钮、conversation 的相交检查全部为 false；`document.documentElement.scrollWidth=375` 与视口相等，console 错误 0。

抽屉探测结果是 `sidebarDisplay="none"`、`inspectorDisplay="none"`、`toggleButtons=0`。产品 spec `specs/product/P1-CONV/spec.md:281` 只要求 375 宽右栏不遮挡 Composer 与发送按钮，没有要求抽屉可打开，因此本任务判通过，抽屉子项记“未实现/不适用”，未取到其打开态证据。

判据核对：可见比例大于 0.99 成立（实测 1），矩形不相交成立（六个组合全 false），无横向溢出成立（`document.documentElement.scrollWidth` 与 `body.scrollWidth` 均为 375，等于视口宽，脚本 `horizontalOverflow=false`）。没有出现一块压另一块的情况。

`final-375-scrolled.png` 与 `final-375-initial.png` 的 sha256 相同（`92d52d77…`），原因是主会话只有两条失败消息、内容不足一屏，脚本滚动后位置未变；滚动态因此等价于初始态，不构成额外覆盖，遮挡与横溢结论由 initial、focused、typed 三态共同支撑。

### 任务 B：组件 conversation-panel 复签

A3 的真机证据是本轮新增：在 CDP 9223 上运行 `frontend/src/components/MessageTableLayout.test.tsx`，1180 档 586ms、375 档 335ms，`Tests 2 passed`，27.11s，exit 0，日志 `.tmp/accept8/table-cdp.log`。用例断言 10 列宽表的 `tableWidth` 大于包裹层 `clientWidth`、`.msg-table-wrap` 的 `scrollWidth` 大于 `clientWidth`、3 列短表不滚动、`.conversation-scroll` 与 `documentElement` 均无横溢；当前渲染器已产出包裹层（`frontend/src/components/library.tsx:437-443`），样式 `frontend/src/components/components.css:159` 的 `.msg-table-wrap{max-width:100%;overflow-x:auto}` 生效，不再是 COMP-SIGN-3 当时的“无表格渲染路径”。

A5 的现状由 CSS 直接可证：`frontend/src/components/components.css:901-908` 把 `.conversation-panel .card-block` 的 `background` 设为 `transparent`，只保留 1px `--line` 与圆角，注释写明“消息卡内不再叠第二层白底”；COMP-SIGN-2 也实测过“卡内第二层白底与第二道边已消失”。spec §5.1 第 192–200 行仍把它登记为阻断缺陷，属于文档未随修复同步。

A1、A2、A4、A6、A8、A9 在 `docs/testing/COMP-SIGN-2-20261122.md` 第 35–46 行有 1600/1180 实测：灰底 `rgb(250,249,246)`、面板 720 居中、消息卡 1px/r10/无阴影、卡间距 9、Composer 与消息卡同宽同中心、仅 `.conversation-scroll` 纵向滚动、页面无本组件 inline style。A11、A12、A13 在 `docs/testing/COMP-SIGN-3-20261122.md:55-60` 有 1600/1180/1920/375 四档数据，中心差、Composer 左/宽/右差均为 0，标签基线差 1px、右栏首块差 0，满足 ≤1px；A7 的四态列尺寸一致见同文件第 92–97 行；A10 的画廊四态见第 101–110 行，`tsc` exit 0、Vitest 全过。

A10 的残余限制是 `node build.mjs` 本体在验收沙箱被 EPERM 拒绝（COMP-SIGN-3 第 114 行），当时用 esbuild 与 tailwind 两阶段产物的 sha256 与线上资源逐一比对一致作为等价证据。A13 的“右栏宽度连续变化”没有单做展开/收起时序测试，四档宽度已覆盖；A10 的画廊也没有 compact 与自定义 `ariaLabel` 实例，API 虽已补齐（`frontend/src/components/library.tsx:1070-1083`），这两个非默认路径未实例化。

结论：组件 `conversation-panel` 由 conditional 转 accepted，A1–A13 无未达标项，剩余两项是环境与覆盖说明，不构成拒绝。spec 文件头的旧结论与 §5.1 的缺陷登记未改，按“只报事实、不改 spec”的要求保留。

### 任务 C：AC-CONV-005-01/02 证据装配

链路逐段核对如下。前端点击“停止”进入 `frontend/src/app.tsx:710-715` 的 `stopStreaming`，把该消息加入 `ignoredReplyIds`、调用 `eventsRef.current?.stop()`、本地置 `status:'stopped'`；`frontend/src/api.ts:250-253` 的 `stop()` 在 socket OPEN 时发送 `JSON.stringify({ type: 'correct', data: { sessionId } })`，序列化后只有 `type` 与 `data.sessionId`；后端 `backend/internal/modules/chat/http.go:367-384` 解析 `correctPayload`，`TargetMessageID` 非空回 `edit_disabled`，`SessionID` 为空则用连接会话，随后调用 `m.correct`；`backend/internal/modules/chat/loop.go:1107-1134` 对非空 targetReplyID 拒绝编辑，`findActive(sessionID, targetReplyID)` 取到 active 后 `active.cancel()`，等 `active.done` 最多 5 秒，text 为空即返回，不重答。

停止效果的实测证据来自 `backend/internal/modules/chat/stop_interrupt_test.go:32` 的 `TestStopFrameCancelsUpstreamAndStopsDeltas`：假上游 httptest 在 `:39`，每 15ms 一帧并在 `:78-82` 检测 `r.Context().Done()`；断言 cancel 在 `:171`、停止后 delta 计数为 0 在 `:202`、idle 且内容前缀保留在 `:205` 与 `:353`、active 清空在 `:221`、消息 `status=retracted` 在 `:213`。`docs/testing/STOP-EVIDENCE-20261122.md` 记录定向 2 PASS、0.12s，整包 19 PASS、0 FAIL、1 条既有 SKIP；本轮独立重跑仍在 0.14s 通过。前端单测 `frontend/src/App.conversation.test.tsx:436-453` 断言点击“停止”后 socket 收到含 `"correct"` 的帧且后续 delta 不追加。

断点一在目标识别。`correct` 帧没有 `messageId`，后端只能按 `findActive` 取 `StartedAt` 最大的一条；`m.active` 以 `reply.ID` 为键（`backend/internal/modules/chat/loop.go:411`），代码层允许多个并发 active，没有按会话的单飞守卫。跨标签并发发消息时，任一标签点“停止”会取消最新的那条，可能不是用户看到的那条，也可能留下另一条继续产出。这一条是代码路径推断，本轮没有写并发测试，因此不能声称已复现，只能判“未证明安全”。

断点二在真实厂商链路。STOP-EVIDENCE 用可控假上游证明业务层能取消与停 stream，厂商上游仍 403，无法证明真实模型连接被中断。STOP-EVIDENCE 第 25 行“前端 stopStreaming 仍只 events.stop()，不发 correct 帧”是旧陈述，与当前 `api.ts:250-253` 和 `App.conversation.test.tsx:436-453` 不符，本轮以代码与单测为准更正。

结论：AC-CONV-005-01 与 AC-CONV-005-02 判 partial。单流主路径的证据链完整，缺的是消息级定向与并发场景的实测，以及真实厂商上游的中断证据；这两条不满足 pass 的“链路无断点”要求。

### 任务 D：测试 Spec 矩阵对齐

只改了 `specs/test/P1-CONV/test-plan.md`。文件头第 10 行改为 `pass 30 / partial 3 / missing 0 / blocked 2`，有效 33 条为 30 pass 加 3 partial（005-01、005-02、006-02）；第 11 行写基线“前端 242（实测，23 文件全通过、0 skip）、后端 285+新增”，并注明后端全量本轮未取到、定向 stop 用例 PASS。

§0.2 第 43 行前端判据改为 `Test Files 23 passed (23)`、`Tests 242 passed (242)`、0 skip，证据 `.tmp/accept8/frontend-all.log`；第 45 行后端行注明本轮 13:56 启动、14:07 仍 0 字节、已停止、不据此判失败。§0.5 增补本轮六条运行记录：前端 242、A3 表格 CDP 2/2、375 四态、真机 304、定向 stop PASS、后端全量未取到。

矩阵第 144 行 `AC-CONV-005-01` 由 pass 改 partial，写明帧缺 `messageId` 与 `findActive` 只取最新；第 145 行 `AC-CONV-005-02` 同样改 partial，补 STOP-EVIDENCE 的 `:171/:202/:205/:213/:221/:353` 行号；第 161 行 `AC-CONV-008-03` 的“无截图”改为四张 375 截图与 metrics；第 162 行 `AC-CONV-008-04` 补真机 200 到 304 的 ETag 与字节数。第 139 行 `AC-CONV-004-01` 的“真机表格滚动未取”改为本轮 CDP 2/2 通过。

自查脚本 `.tmp/selfcheck-matrix2.mjs` 输出 `rows=35`、`effective=33`、`uniqueACs=35`、`uniqueTCs=35`、`pass=30`、`partial=3`、`missing=0`、`blocked=2`、`sum=35`，无空单元格、无重复 AC/TC、无非法状态；`badDetail` 列出的 27 条是 §2–§14 明细缺前置/证据的既有问题，不在本轮改动范围内。文末第 881 行新增 v10 修订记录。

## 2. AC 判定（35 条登记，33 条生效）

| # | AC | 判定 | 本轮证据与变化 |
|---|---|---|---|
| 1 | AC-CONV-001-01 | pass | 沿用 `Sidebar.test.tsx:50`、`App.conversation.test.tsx:418`、`m4_test.go:134`、CDP runner `:361/:792` |
| 2 | AC-CONV-001-02 | pass | 沿用 `Sidebar.test.tsx:114/:128`、`m70_test.go:67`、`m14_test.go:147` |
| 3 | AC-CONV-001-03 | pass | 沿用 ACCEPT-CONV-2 §7：409 阻止主会话归档、子会话归档/恢复、`library.tsx:121` 守卫 |
| 4 | AC-CONV-001-04 | pass | 沿用置顶真机证据与 `tree_order_test.go` 五条、`pin_guard_test.go` 三条 |
| 5 | AC-CONV-002-01 | pass | 沿用 `Sidebar.test.tsx:90`、`m6_test.go:66`、CDP `:649/:690/:739` |
| 6 | AC-CONV-002-02 | pass | 沿用 `App.operation-errors.test.tsx:49/:75/:96/:115` 与四种失败截图 |
| 7 | AC-CONV-003-01 | pass | 沿用标题搜索命中、正文词 0、无 `messages/search` |
| 8 | AC-CONV-003-02 | pass | 沿用搜索错误态与就地重试 |
| 9 | AC-CONV-003-03 | pass | 沿用 `api.ts:34` 只走 `/api/sessions?q=` |
| 10 | AC-CONV-004-01 | pass | 表格真机滚动本轮由 `MessageTableLayout.test.tsx` 2/2 关闭；链接 computed 样式仍为 jsdom |
| 11 | AC-CONV-004-02 | pass | 沿用 `MessageItem.test.tsx:44/:54/:89/:100`、`m78`、`m79` |
| 12 | AC-CONV-004-03 | pass | 沿用 `m78`、`m79`、`m50`、`MessageItem.test.tsx:100` |
| 13 | AC-CONV-007-01 | pass | 沿用 `TimelineGroups.test.tsx` 与 `m81_all_messages_test.go` |
| 14 | AC-CONV-007-02 | pass | 沿用 ACCEPT-CONV-6 真机：命中 27/27、末尾 3/3、任意 y 10/10 |
| 15 | AC-CONV-005-01 | **partial** | 正常流通过；本轮改判，缺 messageId 定向与并发实测 |
| 16 | AC-CONV-005-02 | **partial** | 停止链路闭合；本轮改判，同上，另缺真实厂商上游 |
| 17 | AC-CONV-006-01 | pass | 沿用 `Composer.test.tsx:28/:36/:52/:87/:129` 与 CDP `:416` |
| 18 | AC-CONV-006-02 | partial | 维持；IME 组字用例有单测，真实中文输入法无环境 |
| 19 | AC-SYNC-001-01 | pass | 沿用 `server_test.go:243/:301`、`m88_ws_fanout_test.go:23` |
| 20 | AC-SYNC-001-02 | pass | 沿用 `m6_test.go:100`、`m55_test.go:17/:57` |
| 21 | AC-SYNC-002-01 | pass | 沿用 `App.tabsync.test.tsx` 与 channel 用例；真实双标签仍归 M-03 |
| 22 | AC-SYNC-002-02 | pass | 沿用 tiebreak、到达序收敛、降级用例 |
| 23 | AC-SYNC-003-01 | pass | 沿用 `Composer.test.tsx:87/:129` 与 CDP 13 |
| 24 | AC-SYNC-003-02 | pass | 沿用 storage、真 BroadcastChannel 双实例、无通道降级 |
| 25 | AC-SYNC-004-01 | pass | 沿用未读点与进入清除、`session_unread` 合并 |
| 26 | AC-SYNC-004-02 | pass | 沿用读失败保留红点与重启保持 |
| 27 | AC-SYNC-004-03 | pass | 沿用 `session_read` 跨标签清点与帧合并 |
| 28 | AC-SYNC-005-01 | blocked | 产品明确未实现，不计入有效 33 |
| 29 | AC-SYNC-005-02 | blocked | 产品明确未实现，不计入有效 33 |
| 30 | AC-CONV-008-01 | pass | 沿用 `RightPanel.test.tsx:8/:75/:110` |
| 31 | AC-CONV-008-02 | pass | 沿用展开/收起、`messageId` 透传、触控高度；下载链接未实际点击（G16） |
| 32 | AC-CONV-008-03 | pass | 本轮补 375 四态截图与 metrics；右栏 375 不渲染，无遮挡 |
| 33 | AC-CONV-008-04 | pass | 本轮补真机 200 到 304：ETag `"spec-c5a2d772dd1d5d88"`、304 空体、`taskLimit=50` 另一 ETag |
| 34 | AC-CONV-001-05 | pass | 沿用 `Sidebar.test.tsx:53/:306`、`App.integration.test.tsx:222/:244`、HTTP 75/209 |
| 35 | AC-CONV-008-05 | pass | 沿用 `RightPanel.test.tsx:59`、`App.integration.test.tsx:262/:289/:315`；G18 负路径仍缺 |

合计 33 条有效：`pass 30`、`partial 3`、`missing 0`；另有 SYNC-005 两条 `blocked` 只登记。

## 3. 12 个 PRD 覆盖

| PRD | 决定性 AC | 本轮结论 | 变化与说明 |
|---|---|---|---|
| PRD-CONV-001 会话树与主会话 | 001-01、001-02、001-05 | covered | 001-03/04 亦 pass；无变化 |
| PRD-CONV-002 会话生命周期 | 002-01、002-02 | covered | 无变化 |
| PRD-CONV-003 搜索与未读 | 003-01、003-02、003-03 | covered | 无变化 |
| PRD-CONV-004 消息流与渲染 | 004-01、004-02、004-03 | covered | 004-01 的表格真机滚动本轮关闭；维持 covered |
| PRD-CONV-005 发送与流式 | 005-01、005-02 | conditional | 两条由 pass 降 partial、链路单流闭合；由 not covered 转 conditional |
| PRD-CONV-006 Composer 与快捷键 | 006-01、006-02 | conditional | 006-02 无真实 IME 环境，维持 |
| PRD-CONV-007 祖先消息与时间轴 | 007-01、007-02 | covered | 沿用第七轮真机 |
| PRD-CONV-008 右栏会话投影 | 008-03、008-04 | covered | 375 截图与真机 304 本轮补齐；由 not covered 转 covered |
| PRD-SYNC-001 WS 连接与续传 | SYNC-001-01、001-02 | covered | 无变化 |
| PRD-SYNC-002 跨标签 active/祖先 | SYNC-002-01、002-02 | covered | 真实双标签时序仍归手工 M-03 |
| PRD-SYNC-003 发送模式跨标签 | SYNC-003-01、003-02 | covered | 同上 |
| PRD-SYNC-004 未读与已读游标 | SYNC-004-01、SYNC-004-02、SYNC-004-03 | covered | 无变化 |

汇总为 10 covered、2 conditional、0 not covered。conditional 的两项都对应 partial AC，不是没有实现，而是证据不足以判全通过。

## 4. 签字

不可签。还差 `AC-CONV-005-01`、`AC-CONV-005-02`、`AC-CONV-006-02` 三条。

`AC-CONV-005-01/02` 缺两样证据：其一，`correct` 帧带目标消息 id、后端按 id 取消的定向停止实现与测试，并覆盖两个标签同时有 active 流时只停目标流；其二，真实厂商上游（非假 httptest）被 cancel 后停止出帧的连接级证据，当前厂商 403 未覆盖。现状的 `api.ts:250-253` 与 `loop.go:1136-1152` 只能保证单流，跨标签并发会停最新一条而不是目标条。

`AC-CONV-006-02` 缺真实中文输入法的人工验证证据：候选词选择、全角回车、上屏后 50ms 内 Enter 不发送，需要 Windows Chrome 下的截图或录屏；组件单测只能证明事件处理逻辑。

`AC-SYNC-005-01/02` 是产品明确未实现的两条，保持 blocked，不计入有效 33 条，也不作为本轮签字阻断之外的返工项。

## 附录：证据索引

| 证据 | 路径与行号 |
|---|---|
| 375 截图（初始/滚动/聚焦/输入） | `docs/testing/final-375-initial.png`、`final-375-scrolled.png`、`final-375-composer-focus.png`、`final-375-typed.png` |
| 375 metrics 与日志 | `.tmp/accept8/375-metrics.json`、`.tmp/accept8/375-run.log`、脚本 `.tmp/accept8/375.cjs` |
| 375 容器圆角补测 | `.tmp/accept8/radius.json`（panel 与 scroll 均为 `0px`，1180/375 两档） |
| 表格内部滚动真机 | `.tmp/accept8/table-cdp.log`；用例 `frontend/src/components/MessageTableLayout.test.tsx:50`；渲染 `library.tsx:437-443`；CSS `components.css:159` |
| 组件 A5 修复 | `frontend/src/components/components.css:901-908` |
| 组件 A1–A13 历史实测 | `docs/testing/COMP-SIGN-2-20261122.md:35-46`、`docs/testing/COMP-SIGN-3-20261122.md:20-60`、`:92-97`、`:101-114` |
| 停止测试 | `backend/internal/modules/chat/stop_interrupt_test.go:32`、`:39`、`:78-82`、`:171`、`:202`、`:205`、`:213`、`:221`、`:353` |
| 停止证据文档 | `docs/testing/STOP-EVIDENCE-20261122.md`；第 25 行的旧陈述本轮更正 |
| 停止链路代码 | `frontend/src/api.ts:250-253`、`frontend/src/app.tsx:710-715`、`backend/internal/modules/chat/http.go:367-384`、`backend/internal/modules/chat/loop.go:1107-1134`、`:1136-1152`、`:411` |
| 停止前端单测 | `frontend/src/App.conversation.test.tsx:436-453` |
| 真机 304 | `.tmp/accept8/304-live.json`、`.tmp/accept8/304-live.log`、脚本 `.tmp/accept8/304-live.cjs` |
| 前端全量 | `.tmp/accept8/frontend-all.log`（23/23 文件、242/242 用例、0 skip、exit 0） |
| 后端定向重跑 | `.tmp/accept8/stop-targeted.log`（PASS 0.14s，`ok simo/internal/modules/chat 0.523s`） |
| 后端全量未取到 | `.tmp/accept8/backend-all.log`（0 字节）；沿用 `.tmp/be-conv7v-20261122-122018.log` 的 285 PASS |
| 测试计划改动 | `specs/test/P1-CONV/test-plan.md:10`、`:11`、`:43`、`:45`、`:139`、`:144`、`:145`、`:161`、`:162`、§0.5 六条（`:111-116`）、文末 v10（`:881`） |
| 矩阵自查 | `.tmp/selfcheck-matrix2.mjs` 输出 `rows=35 effective=33 pass=30 partial=3 blocked=2` |

# P1-CONV 会话与消息 · 测试计划

状态：**active**（2026-11-21 第 2 次证据回写：用例 **4 pass / 9 partial / 2 missing**；PRD 覆盖 **0 covered / 11 partial / 1 gap**，与 `docs/product/TRACEABILITY.md` 一致）
Domain: `CONV` + `SYNC`（P1）
Covers: PRD-CONV-001..007、PRD-SYNC-001..005
Owner：测试（证据与用例）/ 产品（AC 口径）；本次回写：`conv-spec`（spec owner，只把回传测试结果写入文档，不重跑测试）

> 证据基线（2026-11-21）：
> - 前端：`frontend/src/**/*.test.tsx` **115/115 PASS**，0 expected fail；`tsc` typecheck exit 0；覆盖率 `library.tsx` 82.83/83.64/84.14/85.88（lines/branches/functions/statements，阈值 80）。来源：conv-frontend 回传（Lead 转达）。
> - 后端：`go test ./... -count=1` exit 0，16 包 ok，0 fail，无 skip；顶层测试 **246**。来源：conv-backend 回传（Lead 转达）。
> - E2E：`pnpm test:e2e:cdp` **19/19 PASS，连续两次**；CDP + 隔离 mock 后端（19230），**非 8787 真实模型、非 Playwright Test**。可复现产物：`frontend/e2e/report/cdp/audit-P1-CONV.md`、`frontend/e2e/report/cdp/results.json`、`frontend/e2e/report/cdp/run-20261121-131332.log`。
> - 2026-11-20 基线（历史）：前端 69/69、CDP 11/11×5、后端 223/223 —— `docs/testing/EVIDENCE-20261120.md`、`docs/testing/BACKEND-EVIDENCE-20261120.md`。
> - **`docs/testing/` 尚未落 2026-11-21 的原始报告**（前端/后端报告为 Lead 转达的回传结果）；本计划据此回写状态，但**不据此升级任何 PRD 为 covered**。
> 变更包：[`CHG-CONV-001`](../../changes/CHG-CONV-001/spec.md)、[`CHG-CONV-002`](../../changes/CHG-CONV-002/spec.md)、[`CHG-CONV-003`](../../changes/CHG-CONV-003/spec.md)、[`CHG-CONV-004`](../../changes/CHG-CONV-004/spec.md)、[`CHG-CONV-005`](../../changes/CHG-CONV-005/spec.md)（blocked）。
> 缺口总账：[`docs/product/CONV-CLOSURE.md`](../../../docs/product/CONV-CLOSURE.md)。

## 1. 范围与证据口径

### 1.1 用例状态判定（沿用 2026-11-21 收紧标准）

- **pass**：该用例"断言"列中的每一条都有直接、已执行、可复现的测试落点，且无已知实现缺陷。
- **partial**：主路径已执行，但至少一条断言缺测试落点，或存在已定位的实现缺陷。
- **missing**：无测试落点（或功能未实现）。
- 域级 AC（A1–A8）不重复计入单个用例；"空/加载/错误/权限"若由 E1–E3 承接，则在 §4 单独说明其 partial 状态。
- **不升级 covered**：只有六类产物 + 全 AC 可复现证据同时齐才可写 covered；本轮新增测试只能提升"用例证据"，不足以宣告 PRD 覆盖。

**本轮（2026-11-21 第 2 次）状态变化**：

1. `TC-P1-009`（SYNC-002）missing → **partial**：新增 `App.tabsync.test.tsx`（4 条）与 `App.tabsync.channel.test.tsx`（2 条）覆盖 BroadcastChannel 三通道与去重；但仍无双 target/真实浏览器矩阵、无 read cursor 断言。
2. `TC-P1-E1`（空/加载/错误恢复）partial → **pass**：新增 `ConversationPanel.test.tsx`（7 条）补齐消息区 loading/empty/error/retry，`App.conversation.test.tsx` 补齐空会话与列表/消息重试，`conversation-responsive.test.tsx` 补齐 375 收窄。
3. 其余用例维持判定；`TC-P1-002`、`TC-P1-006`、`TC-P1-007` 仍为 partial（理由见各节"仍缺"）。

### 1.2 证据来源与可复现性

| 层 | 命令 | 结果（2026-11-21） | 备注 |
|---|---|---|---|
| 前端组件/集成 | `cd frontend && npm test` | **115/115 PASS**（0 expected fail） | Vitest + jsdom；新增 App.conversation(22)/App.tabsync(4)/App.tabsync.channel(2)/ConversationPanel(7)/conversation-responsive(6)，Composer +5 |
| 类型检查 | `cd frontend && npx tsc --noEmit` | exit 0 | 新增 `App.test-utils.tsx` |
| E2E | `pnpm test:e2e:cdp` | **19/19 PASS**，连续两次 | CDP runner（非 Playwright）；mock 后端隔离端口 19230；07 交付物场景 OOS 默认 skip |
| 后端 | `go test ./... -count=1` | exit 0，16 包 ok，**顶层 246** | 新增 19 个顶层测试、5 个文件 |
| 覆盖率 | — | `library.tsx` 82.83/83.64/84.14/85.88 | 仍只有单文件覆盖，不足以支撑域级"覆盖"结论 |
| CI | — | **未接线** | 以上均为本地执行记录 |

## 2. 用例

<a id="tc-p1-001"></a>
### TC-P1-001 · PRD-CONV-001 会话树与主会话

- 对应 PRD：`PRD-CONV-001`（P0，implemented）
- 前置：本地后端可用，存在 `main` 与至少一个子会话
- 步骤：① 首屏观察左栏会话树/主会话；② 点击与 Enter 切换会话；③ 重命名后 Escape 取消、Enter 提交；④ 模拟空/加载/错误并重试
- 断言：
  1. 会话列表与树渲染、active 高亮、连接与配额统计可见；
  2. 点击/Enter 均可切换；重命名 Enter 生效、Escape 不落库；
  3. 空/加载/错误/重试可见；统计失败显示占位而非假 0；
  4. 后端树/重命名重启后保持。
- 自动化层级：component（Sidebar 9/9）+ integration（App.conversation 创建/重命名/切换）+ API（M4/M14/service）+ E2E 01a/11
- 当前证据：`Sidebar.test.tsx` 用例 1/2/3/7/8；`App.conversation.test.tsx::creates a session from the empty state`、`renames a session through the PATCH contract`、`renders an empty conversation`；`TestM4SessionTreeAndRenamePersistAcrossRestart`、`TestTreeCreateRenameAndDescendants`、`TestM14SessionPathMultiLevel`、`TestM14SessionPathCycleGuard`、`TestP1ConvSessionsCreateContract`（`backend/cmd/simo/p1_conv_sessions_http_test.go`）；CDP 01a（首屏结构）、CDP 11（切换后仅当前会话 `.tlg-session`、aria-label 跟随）
- 实现状态：pass
- 仍缺：主会话不可归档无独立断言；pin 后端已实现（`TestUI1SessionSearchAndPin`）但前端未接线，未纳入本用例断言

<a id="tc-p1-002"></a>
### TC-P1-002 · PRD-CONV-002 会话生命周期

- 对应 PRD：`PRD-CONV-002`（P0，implemented）
- 前置：同 TC-001；准备一个可归档会话
- 步骤：① 新建会话；② 重命名；③ 归档 → 观察只读与列表；④ 恢复；⑤ 制造重命名/归档失败
- 断言：
  1. 创建后出现并选中；草稿不落库、重启清理空会话；
  2. 重命名持久；归档后只读（聊天被拒）、可恢复；
  3. 生命周期**失败路径**有可见反馈且不产生重复/脏数据。
- 自动化层级：component + integration + API（M4/M6/M70）+ E2E 08/09/10
- 当前证据：
  - 创建/草稿：`TestP1ConvDraftScopedPerTree`、`TestP1ConvSessionsCreateContract`（draft:false 不落库、非法 JSON/413）、`TestM70*` 3 条；CDP 08（懒草稿：会话树 API 数不变、首条消息后 +1）；`App.conversation.test.tsx::creates a session from the empty state`
  - 重命名：`TestM4SessionTreeAndRenamePersistAcrossRestart`、`TestP1ConvSessionsRenamePinContract`；CDP 09（Enter/Escape/空值/blur）；`App.conversation.test.tsx::renames a session through the PATCH contract`
  - 归档/恢复：`TestM6ArchiveReadonlyAndUnarchive`、`TestM6ArchivedChatWSReturnsErrorNotReply`、`TestM6CanArchiveGateBlocksRunningTask`、`TestP1ConvSessionArchiveLifecycleReadonly`；CDP 10（只读+显示归档+恢复）；`App.conversation.test.tsx::archives a session, hides it from the active list and makes the composer read-only`、`restores an archived session`
  - 删除契约：`TestP1ConvSessionDeleteRequiresConfirmation`（后端有，前端无入口）
  - 失败路径：仅 `App.conversation.test.tsx::keeps the previous session when create fails` 覆盖"创建失败"；重命名/归档失败仍无用例
- 实现状态：**partial**
- 仍缺：断言 3：`rename`（`frontend/src/app.tsx:530`）与 `toggleArchive`（`frontend/src/app.tsx:450`）无 `try/catch` → 失败无可见反馈；前端无删除入口（`DELETE /api/sessions/{id}` 存在）

<a id="tc-p1-003"></a>
### TC-P1-003 · PRD-CONV-003 会话搜索与未读

- 对应 PRD：`PRD-CONV-003`（P1，partial）
- 前置：多会话 + 多消息；至少一条消息含唯一关键词
- 步骤：① 输入关键词观察过滤；② 无匹配；③ 观察 searching 态；④（计划）切换会话比较未读
- 断言：
  1. 搜索按输入过滤、无匹配有提示、搜索中有状态；
  2. 命中用服务端 id 集合，不前端伪造；
  3. 未读计数与已读时机符合产品口径。
- 自动化层级：component + integration + API + E2E 14/15
- 当前证据：`Sidebar.test.tsx` 用例 5/6；`App.conversation.test.tsx::searches sessions and messages and shows a no-match state`；CDP 14（标题/正文/无匹配）、CDP 15（列表 500 → 重试恢复）；`TestUI1SessionSearchAndPin`（标题搜索 + pin，**前端未接线**）
- 实现状态：**partial**
- 仍缺：断言 3 未读无任何证据（`app.tsx:96/214/656` 仅内存态，`Sidebar` 无徽标、无持久化）；搜索语义未定：UI 为"当前会话消息搜索"（`api.ts:136` 只传 q → 后端默认 `main`、不含子会话），产品口径为标题搜索，待产品二选一；跨会话正文搜索为真实产品缺口（E2E 未覆盖）

<a id="tc-p1-004"></a>
### TC-P1-004 · PRD-CONV-004 消息流与渲染

- 对应 PRD：`PRD-CONV-004`（P0，implemented）
- 前置：含用户/司墨消息、分类标签、代码块、卡片、失败消息各一条
- 步骤：① 观察渲染与分类标签；② 复制；③ 卡片提交/取消/失败重试；④ 流式与失败态；⑤ 归档只读
- 断言：
  1. 角色区分、分类标签仅在有 category 时出现；
  2. 复制成功与降级（execCommand）均可见；
  3. 代码块/长文不溢出；流式光标、失败徽标正确；卡片提交/重试/只读禁用正确；
  4. 消息流不含 system/internal 噪音，消息不可编辑。
- 自动化层级：component（MessageItem 18/18）+ integration（delta 去重）+ API（M41/M78/M79/M50/M11/category）+ E2E 01a/02
- 当前证据：`MessageItem.test.tsx` 18 条；`App.integration.test.tsx` delta 去重；`TestM41Cards*`、`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`、`TestM50MessageEditingDisabled`、`TestM11MessagePagination`；新增 `TestP1ConvChatRequestValidation`、`TestP1ConvMessagePersistenceShapeAcrossRestart`、`TestParseCategoryMarkerTable`/`TestCategoryFromFirstLineStripsHeader`（`category_test.go`，14 主例 + 5 子例）；CDP 01a/02
- 实现状态：pass
- 仍缺：消息纯度无独立产品 AC（见 CONV-CLOSURE §4.1-11）；`COMP-message-colors` 未按实现签收

<a id="tc-p1-005"></a>
### TC-P1-005 · PRD-CONV-007 祖先消息整级加载

- 对应 PRD：`PRD-CONV-007`（P1，implemented）
- 前置：存在父子会话链（≥2 级）
- 步骤：① 进入子会话观察祖先消息；② 时间轴点击/键盘跳转；③ 制造 413/403；④ 切会话
- 断言：
  1. 祖先消息整级加载、按时间排序、按 id 去重；
  2. 时间轴一条消息一根 bar、点击/键盘跳转、tooltip 正常；
  3. 413 可重试并成功、403 视为空祖先且不阻塞对话、切会话清链。
- 自动化层级：integration（7/7 中 4 条 + 新增 5 条祖先用例）+ API（M81/M89/aggregate）+ E2E 04a–04d
- 当前证据：`App.integration.test.tsx` 用例 1/2/3/4；`App.conversation.test.tsx::loads ancestor messages on demand`、`shows an empty ancestor state without error`、`keeps the scroll anchor while prepending ancestors`、`maps 413 to a readable message`、`maps 403 to a readable message`；`TestM81AllSessionMessages`、`TestM81AllSessionMessagesOrderAndShape`、`TestM89AllMessagesLimitsAndErrors`、`TestP1ConvMessageAggregateAncestorChain`；CDP 04a（逐级加载 + prepend 锚定偏移 ≤1px）、04b（413「消息过多，暂不能完整加载」）、04c（403「无权读取该上级会话」）、04d（空上级「上级没有消息」）
- 实现状态：pass
- 仍缺：时间轴点击目标尺寸（≥44px）无断言；413/403 E2E 走 mock 后端，真实后端 413/403 仅集成/HTTP 测试（新增 `TestP1ConvMessageAggregateAncestorChain` 覆盖 413/403 契约）；生产部署未验证；**`app.tsx` prepend 滚动锚定"二次 apply 写回旧值"缺陷已修复**（conv-frontend，2026-11-21）

<a id="tc-p1-006"></a>
### TC-P1-006 · PRD-CONV-005 发送·流式·断线重连

- 对应 PRD：`PRD-CONV-005`（P0，implemented）
- 前置：后端可用；可模拟 WS 断开与发送失败
- 步骤：① 输入并发送；② 观察流式；③ 停止；④ 发送失败后重试；⑤ 断网→恢复
- 断言：
  1. Send 202、delta 追加、done 收尾、输入清空；
  2. 流式中可停止，停止后不再追加；
  3. 失败可恢复且不丢文本、不重复提交；
  4. 断线后自动重连、`since` 回放、不丢不重。
- 自动化层级：component（Composer 10/10）+ integration（App.conversation 发送/流式/重连 6 条）+ API（WS 3 个 + 新增生命周期/多客户端/since/错误帧）+ E2E 02/16
- 当前证据：`Composer.test.tsx` 用例 2/6/7/9 + 新增 5 条（发送失败保留文本与重试、IME 组合、模式切换、停止、长文本）；`App.conversation.test.tsx::sends with a client mutation id and shows the streaming reply`、`keeps the text and shows a retryable error when send fails`、`does not duplicate the reply when the same delta sequence arrives twice`、`stops streaming and ignores later deltas`、`reconnects after the socket closes and reloads missed messages`；`TestP1ConvWSReplyLifecycleOrderAndDeltas`、`TestP1ConvWSMultiClientSameSessionConsistency`、`TestP1ConvWSSubscribeReplayAndSinceContinuation`、`TestP1ConvWSFrameErrorsAndKeepalive`、`TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM2MockStreamRecordsUsageAndDecision`、`TestM55StartupRecoversStaleStreaming`、`TestM55StreamingWatchdogTimeout`；CDP 02（Enter 发送 + WS 流式）、CDP 16（发送 502 不假落库）
- 实现状态：**partial**
- 仍缺：`clientMutationId` 后端 0 处理（`grep` 无匹配）→ 幂等不成立；"停止"只断言前端回调 + `{type:'correct'}` 发送，未验证后端真实中断（后端 `TestM6ArchivedChatWSReturnsErrorNotReply` 属归档只读，不覆盖停止）；Lead 缺陷清单仍列"send 失败丢文本"，与新增用例标题冲突，**未验收前按未解决记录**；`since` 截断/保留窗口未定义

<a id="tc-p1-007"></a>
### TC-P1-007 · PRD-CONV-006 Composer 输入与快捷键

- 对应 PRD：`PRD-CONV-006`（P0，implemented）
- 前置：Composer 可用
- 步骤：① Enter/Shift+Enter/Ctrl+Enter/Meta+Enter；② 中文 IME 组合中按 Enter；③ 切换发送模式；④ 发送失败与只读
- 断言：
  1. 各组合键行为符合当前 sendMode；IME 组合期间不发送；
  2. 发送模式切换即时生效、持久化、aria 文案同步；
  3. 失败恢复、disabled/streaming 状态正确；长文本不截断。
- 自动化层级：component（Composer 10/10 + 新增 5 条）+ API（chat 校验）+ E2E 03
- 当前证据：`Composer.test.tsx` 全部 10 条 + 新增 5 条；`TestP1ConvChatRequestValidation`（POST /api/chat 校验）；CDP 03（Tab/Shift+Tab 可达、Enter 发送、Shift+Enter 换行、IME 取值护栏）
- 实现状态：**partial**
- 仍缺：真实浏览器中文输入法未手测（jsdom 与 CDP 模拟不算真实 IME）；**后端侧只到请求校验，无 Composer 行为契约，故后端证据仅 partial（Lead 口径）**；`COMP-composer-send-mode` 未签收；跨标签 sendMode 归 SYNC-003

<a id="tc-p1-008"></a>
### TC-P1-008 · PRD-SYNC-001 WS 连接与重连

- 对应 PRD：`PRD-SYNC-001`（P0，implemented）
- 前置：后端可启动；可中断 WS
- 步骤：① 建立连接并订阅；② 制造断连；③ 观察状态与重连；④ 重连后补发
- 断言：
  1. 事件有序、`since` 补发、同会话多客户端 fanout；
  2. 断连可见（reconnecting）、按退避重连、重连后不重复渲染；
  3. 停止帧（correct）真实中止。
- 自动化层级：API（新增 WS 4 条）+ integration（2 条）+ E2E 02
- 当前证据：`TestP1ConvWSReplyLifecycleOrderAndDeltas`、`TestP1ConvWSMultiClientSameSessionConsistency`、`TestP1ConvWSSubscribeReplayAndSinceContinuation`、`TestP1ConvWSFrameErrorsAndKeepalive`、`TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients`、`TestM6ArchivedChatWSReturnsErrorNotReply`；`App.conversation.test.tsx::reconnects after the socket closes and reloads missed messages`、`does not duplicate the reply when the same delta sequence arrives twice`；CDP 02
- 实现状态：**partial**（按 Lead 口径不得写 covered）
- 仍缺：**E2E 未覆盖重连/replay**（真实断网场景无 e2e）；`since` 截断/日志保留窗口未定义；断连 UI（reconnecting 状态）无端到端断言；断言 3 无测试

<a id="tc-p1-009"></a>
### TC-P1-009 · PRD-SYNC-002 多标签 active/ancestor/read cursor

- 对应 PRD：`PRD-SYNC-002`（P0，implemented）
- 前置：同一浏览器两个标签（同源）
- 步骤：① A 切会话；② A 产生祖先链；③ A 读到最新消息；④ B 观察三通道
- 断言：
  1. B 的 active 跟随（不回抖/不成环）；
  2. B 的祖先链合并去重；
  3. B 的未读清零、游标推进；
  4. 同 `at` 冲突有确定性 tiebreak。
- 自动化层级：integration（BroadcastChannel 单测 6 条）+ E2E 13（多标签 active/发送/发送模式）
- 当前证据：`App.tabsync.test.tsx` 4 条（采纳他标签 active、忽略自身回声、忽略过期激活、合并他标签祖先链、发布自身 active 与祖先链）；`App.tabsync.channel.test.tsx` 2 条（稳定 channel 名 + 挂载公告、同会话重公告保留祖先链）；CDP 13
- 实现状态：**partial**（由 missing 升级，理由：三通道已有单测）
- 仍缺：断言 3 未读/游标无测试（依赖 SYNC-004，未实现）→ 多标签未读合并无法验证；断言 4 `at` 冲突 tiebreak 无直接断言（`app.tsx` 有 at+tiebreak 逻辑但未测）；无双 target/跨进程浏览器矩阵（CDP 13 是否为双 target 需以 `audit-P1-CONV.md` 为准，文档未给出双页证据则按单页保守处理）；`opId` 未用于去重

<a id="tc-p1-010"></a>
### TC-P1-010 · PRD-SYNC-003 发送模式/设置跨标签同步

- 对应 PRD：`PRD-SYNC-003`（P1，implemented）
- 前置：两个同源标签
- 步骤：① A 切换发送模式；② B 观察按钮与快捷键；③ 刷新 A 观察持久化
- 断言：
  1. 切换持久化（localStorage）；aria 与 hint 同步；
  2. B 通过 BroadcastChannel 或 storage 最终一致；
  3. 无 BroadcastChannel 时降级不报错。
- 自动化层级：component（1 条）+ E2E 13
- 当前证据：`Composer.test.tsx::toggles send mode, persists it and changes keyboard behavior`；CDP 13（多标签发送模式同步断言，见 `audit-P1-CONV.md`）
- 实现状态：**partial**
- 仍缺：断言 2 的**单测**无（`library.tsx` 有 BroadcastChannel + storage 双通道实现但无测试）；断言 3 降级路径无测试；`COMP-composer-send-mode` 未签收

<a id="tc-p1-011"></a>
### TC-P1-011 · PRD-SYNC-004 未读与已读游标

- 对应 PRD：`PRD-SYNC-004`（P1，partial）
- 前置：无（口径未定）
- 步骤：—
- 断言：未读计数/已读时机/多标签合并/刷新恢复（口径未定义，无法断言）
- 自动化层级：无
- 当前证据：无
- 实现状态：**missing**
- 缺口：无后端（`backend/internal` grep `unread|read_cursor|notification` 0 匹配）；前端仅内存态；产品口径 6 问未答（见 `CHG-CONV-005/spec.md` §3.1、`frontend.md` §2）

<a id="tc-p1-012"></a>
### TC-P1-012 · PRD-SYNC-005 远程访问与通知中心

- 对应 PRD：`PRD-SYNC-005`（P2，unimplemented）
- 前置：无（未实现）
- 步骤：—
- 断言：不适用（能力不存在）
- 自动化层级：无
- 当前证据：无
- 实现状态：**missing（gap）**
- 缺口：无鉴权、无设备/会话管理、无通知渠道与数据模型；与当前"本机单用户无鉴权"安全基线冲突，需系统级决策（`CHG-CONV-005`，blocked）

<a id="tc-p1-e1"></a>
### TC-P1-E1 · 域级场景：空/加载/错误恢复

- 覆盖：A2、A6
- 断言：Sidebar/RightPanel/MetricsDashboard/会话面板的空、加载、错误、重试四态可见；错误不显示假 0；重试后可恢复
- 当前证据：`Sidebar.test.tsx` 用例 7/8；`RightPanel.test.tsx` 用例 2/4；`MetricsDashboard.test.tsx` 用例 3/4/5；`ConversationPanel.test.tsx` 7 条（ready/loading/empty/custom empty/error+onRetry/custom error）；`App.conversation.test.tsx::renders an empty conversation`、`retries the message list after a failure`、`retries the session list after a failure`、`keeps stats failure visible without inventing zero`；`conversation-responsive.test.tsx`；CDP 08（新建空态）、CDP 15（列表 500→重试恢复）
- 实现状态：**pass**
- 仍缺：权限四态归 E3；无 E2E 断网四态组合（CDP 15 为 HTTP 失败，不是断网）

<a id="tc-p1-e2"></a>
### TC-P1-E2 · 域级场景：错误/失败恢复

- 覆盖：A2、A8
- 断言：发送失败、卡片失败、413/403、归档只读、WS 错误帧均有可见反馈与恢复路径
- 当前证据：`Composer` 用例 6 + 新增"发送失败保留文本并重试"；`MessageItem` 用例 7/8；`App.integration` 用例 2/3；`App.conversation` 413/403/发送失败/列表重试；`TestP1ConvWSFrameErrorsAndKeepalive`、`TestP1ConvWSReplyLifecycleOrderAndDeltas`；`TestM6ArchivedChatWSReturnsErrorNotReply`；CDP 05/15/16
- 实现状态：**partial**
- 缺口：`rename`/`toggleArchive` 失败无反馈（`app.tsx:450/530`）；WS 重连失败无 UI 断言；错误信封不统一（后端契约分歧，已记录未修）

<a id="tc-p1-e3"></a>
### TC-P1-E3 · 域级场景：响应式/键盘/权限

- 覆盖：A3、A4、A6
- 断言：375/768/1280 三档不破版；键盘可达（Tab/箭头/Home/End/Escape）；权限不足有明确反馈
- 当前证据：`conversation-responsive.test.tsx` 6 条（375 裁切/单列/Composer 在视口内/代码块滚动/时间轴 gutter 窄屏隐藏桌面恢复/375 守卫覆盖手机段）；CDP 01b（375 收窄无溢出）；`TimelineGroups.test.tsx` 键盘 3 条；`Sidebar` Enter/Escape；归档只读后端测试
- 实现状态：**partial**
- 缺口：375 下无会话入口（真实产品缺陷，E2E 未测）；无 768/1280 截图 diff；权限面本地单用户无鉴权 UI（SYS-001 partial），"权限不足"只能以归档只读近似；无 axe/对比度检查

## 3. AC → 用例映射

| AC | 用例 | 状态（2026-11-21） |
|---|---|---|
| `AC-CONV-001-01` | TC-P1-001 | 有证据 |
| `AC-CONV-001-02` | TC-P1-001 + E1 | 部分（主会话不可归档缺） |
| `AC-CONV-002-01` | TC-P1-002 | 有证据 |
| `AC-CONV-002-02` | TC-P1-002 + E2 | 部分（重命名/归档失败反馈缺陷） |
| `AC-CONV-003-01` | TC-P1-003 | 部分（搜索语义不一致） |
| `AC-CONV-003-02` | TC-P1-003 + TC-P1-011 | missing |
| `AC-CONV-004-01` | TC-P1-004 | 有证据 |
| `AC-CONV-004-02` | TC-P1-004 + E1/E2 | 部分（域级四态已改善，错误信封不统一） |
| `AC-CONV-007-01` | TC-P1-005 | 有证据 |
| `AC-CONV-007-02` | TC-P1-005 + E3 | 部分（尺寸断言缺、未部署） |
| `AC-CONV-005-01` | TC-P1-006 | 有证据 |
| `AC-CONV-005-02` | TC-P1-006 + E2 | 部分（幂等/停止/重连 e2e 缺） |
| `AC-CONV-006-01` | TC-P1-007 | 有证据 |
| `AC-CONV-006-02` | TC-P1-007 + E2 | 有证据（跨标签归 SYNC-003；真实 IME 未测） |
| `AC-SYNC-001-01` | TC-P1-008 | 部分（后端 WS 契约已加强，前端重连 e2e 缺） |
| `AC-SYNC-001-02` | TC-P1-008 + E2 | 部分（重连 UI 无端到端断言） |
| `AC-SYNC-002-01` | TC-P1-009 | 部分（三通道单测已有，无双 target 矩阵） |
| `AC-SYNC-002-02` | TC-P1-009 | missing（未读游标依赖 SYNC-004） |
| `AC-SYNC-003-01` | TC-P1-010 | 部分（单测缺、组件未签收） |
| `AC-SYNC-003-02` | TC-P1-010 | missing（降级路径无测试） |
| `AC-SYNC-004-01` | TC-P1-011 | missing |
| `AC-SYNC-004-02` | TC-P1-011 + E2 | missing |
| `AC-SYNC-005-01` | TC-P1-012 | missing |
| `AC-SYNC-005-02` | TC-P1-012 | missing |

## 4. PRD 覆盖（不升级 covered）

**0 covered / 11 partial / 1 gap**（与 TRACEABILITY §2 一致）。逐 PRD 理由（2026-11-21 第 2 次回写）：

| PRD | 覆盖 | 不升级 covered 的核心原因 |
|---|---|---|
| CONV-001 | partial | 主会话不可归档无断言；pin 未接线 |
| CONV-002 | partial | 重命名/归档失败路径无 catch 与测试 |
| CONV-003 | partial | 搜索语义待产品决策；未读无实现/无测试 |
| CONV-004 | partial | 消息纯度无独立 AC；`COMP-message-colors` 未按实现签收 |
| CONV-007 | partial | 时间轴目标尺寸无断言；生产未部署验证 |
| CONV-005 | partial | 幂等后端未实现；停止真实中断未验证；重连 e2e 缺 |
| CONV-006 | partial | 真实 IME 未手测；后端只到请求校验；组件未签收 |
| SYNC-001 | partial | 重连/replay 无 e2e；`since` 保留窗口未定义 |
| SYNC-002 | partial | 未读游标通道无测试；无双 target 矩阵；`opId` 未去重 |
| SYNC-003 | partial | 跨标签 sendMode 无单测、降级无测试；组件未签收 |
| SYNC-004 | partial | 仅前端内存态；无后端、无测试、无口径 |
| SYNC-005 | **gap** | 未实现；无鉴权/通知产品定义（blocked） |

## 5. 验收映射（域级 A1–A8）

| A | 内容 | 状态 | 证据/缺口 |
|---|---|---|---|
| A1 | P0 主路径可走通 | 部分 | 19 条 E2E 主路径通过；重连/多标签真实矩阵仍缺 |
| A2 | 空/加载/错误/权限四态 | 部分 | E1 已 pass；E2/E3 partial；权限面近似为归档只读 |
| A3 | 键盘与可访问性 | 部分 | Enter/Escape/箭头/Home/End 有测试；无 axe/对比度 |
| A4 | 375/768/1280 | 部分 | 375 有组件断言+CDP 01b；768/1280 无断言 |
| A5 | 消息纯度 | 部分 | 后端测试有；无前端独立 AC/断言 |
| A6 | 三档不破版 | 部分 | 同 A4；375 无会话入口 |
| A7 | 错误可恢复 | 部分 | 多数恢复路径有测试；生命周期失败缺陷 |
| A8 | 无重复/脏数据 | 部分 | WS seq 去重、卡片幂等有测试；发送幂等不成立 |

## 6. 未实现与缺口（2026-11-21 第 2 次回写后）

1. SYNC-005 完全未实现（P1 唯一 gap），阻塞见 `CHG-CONV-005`。
2. SYNC-004 无后端、无测试、无口径。
3. SYNC-002 未读游标通道无测试、无双 target 矩阵。
4. SYNC-001/005 重连/replay 无 e2e；`since` 保留窗口未定义。
5. CONV-005 幂等未实现（前端传参、后端忽略）；停止真实中断未验证。
6. CONV-002 生命周期失败反馈缺陷（`app.tsx:450/530`）。
7. CONV-003 搜索语义不一致（消息搜索 vs 标题搜索）+ 跨会话正文搜索缺失。
8. 组件 spec 四处状态与实现不一致（message-colors / timeline-groups / timeline-tip / composer-send-mode）。
9. 375 无会话入口；无 768/1280 断言。
10. `docs/testing/` 无 2026-11-21 原始报告；E2E 为 mock 后端 + 非 Playwright；无 CI 接线；覆盖率仅单文件。
11. 后端契约分歧（已记录未修）：错误信封不统一、`finished_at` 成功路径缺省、WS 全局事件不按 session 过滤、`POST /api/chat` 未知 sessionId 不 404、`hasMore` `>=` 边界、`waitForReplyDone` 多轮早退。

## 7. 回写记录

- 2026-11-20：首次执行证据回写（6 pass / 6 partial / 3 missing）。
- 2026-11-21（第 1 次）：P1 收口复核（收紧判定标准；TC-002/TC-006 校正为 partial；PRD 覆盖维持 0/11/1；建立 5 个 CHG-CONV 包；新增 `CONV-CLOSURE.md`）。
- 2026-11-21（第 2 次）：按 conv-frontend（115/115、typecheck 0）、conv-backend（246 顶层、16 包 ok）、conv-e2e（19/19×2）回传结果回写：TC-009 missing→partial、E1 partial→pass；补入新增测试落点与 E2E 场景 08–16；TC-007 依 Lead 口径保持 partial；PRD 覆盖**维持 0/11/1**。

# 司墨产品追溯矩阵（TRACEABILITY）

> 状态：**active**（2026-11-22 P1 收口后，同日移除 `PRD-SYNC-005`；全仓覆盖 12 covered / 37 partial / 22 gap）
> 核心三列：**PRD → CHANGE → TEST**；另附覆盖状态与缺口，避免“有链接=已覆盖”。
> 产品树：[`TREE.md`](TREE.md)；ID 规则：[`ID-SPEC.md`](ID-SPEC.md)；缺口：[`SPEC-GAP.md`](SPEC-GAP.md)。

## 1. 覆盖定义

| 状态 | 判定 |
|---|---|
| `covered` | 产品 spec + 变更 + 开发 spec + 组件（如适用）+ 任务卡 + TEST + **执行证据** 齐全 |
| `partial` | 有部分 spec/实现/测试线索，但缺产品 AC、域测试证据或某侧开发 spec |
| `gap` | 无产品 spec，或无可执行 TEST/证据；骨架测试计划本身不算覆盖 |
| `n/a` | 确实不适用，且理由已写；不得用 n/a 掩盖缺口 |

## 2. 域汇总

| 域 | PRD | covered | partial | gap | 产品 spec | TEST |
|---|---:|---:|---:|---:|---|---|
| [`P1`](#p1) | 13 | 13 | 0 | 0 | [spec](../../specs/product/P1-CONV/spec.md) | [test](../../specs/test/P1-CONV/test-plan.md) |
| [`P2`](#p2) | 6 | 0 | 0 | 6 | [spec](../../specs/product/P2-TASK/spec.md) | [test](../../specs/test/P2-TASK/test-plan.md) |
| [`P3`](#p3) | 5 | 0 | 4 | 1 | [spec](../../specs/product/P3-WORK/spec.md) | [test](../../specs/test/P3-WORK/test-plan.md) |
| [`P4`](#p4) | 6 | 0 | 2 | 4 | [spec](../../specs/product/P4-FILE/spec.md) | [test](../../specs/test/P4-FILE/test-plan.md) |
| [`P5`](#p5) | 6 | 0 | 5 | 1 | [spec](../../specs/product/P5-MEM/spec.md) | [test](../../specs/test/P5-MEM/test-plan.md) |
| [`P6`](#p6) | 6 | 0 | 4 | 2 | [spec](../../specs/product/P6-TEAM/spec.md) | [test](../../specs/test/P6-TEAM/test-plan.md) |
| [`P7`](#p7) | 5 | 0 | 4 | 1 | [spec](../../specs/product/P7-SCHED/spec.md) | [test](../../specs/test/P7-SCHED/test-plan.md) |
| [`P8`](#p8) | 12 | 0 | 9 | 3 | [spec](../../specs/product/P8-SET/spec.md) | [test](../../specs/test/P8-SET/test-plan.md) |
| [`P9`](#p9) | 7 | 0 | 4 | 3 | [spec](../../specs/product/P9-TOOL/spec.md) | [test](../../specs/test/P9-TOOL/test-plan.md) |
| [`P10`](#p10) | 6 | 0 | 5 | 1 | [spec](../../specs/product/P10-METRIC/spec.md) | [test](../../specs/test/P10-METRIC/test-plan.md) |
| **合计** | **72** | **13** | **37** | **22** | **10/10** | **10/10** |

> 说明：10 份 test-plan 原为骨架；2026-11-20 已回写 69 个前端单测、11 个 CDP E2E 与 223 个后端测试的**部分执行证据**（见 §2.1）。2026-11-23 补入 `PRD-CONV-009`（会话内任务与编排）后，全仓覆盖为 **13 covered / 37 partial / 22 gap**，P1 为 **13 / 0 / 0**：P1 原有的 12 个 PRD 具备可复现证据链，全部为 covered（`CONV-005` 停止机制由 `stop_upstream_test.go` 假上游证明，`CONV-006` 由 `IME-EVIDENCE-20261122.md` 的 CDP 合成组合态补证，`CONV-008` 真机 304 由第八轮验收补齐）；33 条既有 AC = 33 pass / 0 partial。2026-11-26 `PRD-CONV-009` 完成交付并签发，26 条 AC 全部 pass（560 条断言），升 covered。其余 9 域维持原口径，不能因“用例跑过一部分”升级。
>
> 2026-11-21 补充（第 2 次证据回写）：前端单测 69→**115/115**、后端 **246** 个顶层测试、E2E **19/19×2** 已按真实用例回写进 `specs/test/P1-CONV/test-plan.md` 与 [`CONV-CLOSURE.md`](CONV-CLOSURE.md)；用例口径 **4 pass / 9 partial / 2 missing**（TC-009 升 partial、E1 升 pass），P1 覆盖口径**维持 0/12/1**（2026-11-21 历史口径；2026-11-22 P1 收口后为 12/0/0，SYNC-005 已移除）。
>
> 2026-11-21 补充：P1 已建立 5 个正式变更包 `CHG-CONV-001..005`（会话管理 / 消息与渲染 / 输入与发送 / 多标签与同步 / 未读与通知），并新增缺口总账 [`CONV-CLOSURE.md`](CONV-CLOSURE.md)。六类产物已补齐；31 条有效 AC 全 pass、SYNC-005 两条仅登记，但逐 PRD 仍待验收签字或组件签收，覆盖口径**维持 0/12/1**，不升级任何 P1 PRD（2026-11-21 历史口径；2026-11-22 P1 收口后为 12 covered / 0 conditional / 0 gap，SYNC-005 已移除）。
>
> 2026-11-20 补充：P1–P4、P10 的 35 个 PRD 已建立域级 legacy 归档包 `CHG-LEGACY-P1-CONV`、`CHG-LEGACY-P2-TASK`、`CHG-LEGACY-P3-WORK`、`CHG-LEGACY-P4-FILE`、`CHG-LEGACY-P10-METRIC`；CHANGE 列保留原 FE/COMP 映射并追加包链接。legacy 包只表示“可追溯归档”，不改变 covered/partial/gap，也不代表六类产物闭环。

## 2.1 执行证据（不升级 covered）

证据详情：前端 [`../testing/EVIDENCE-20261120.md`](../testing/EVIDENCE-20261120.md)、2026-11-21 回传（115/115，报告未落 docs）；后端 [`../testing/BACKEND-EVIDENCE-20261120.md`](../testing/BACKEND-EVIDENCE-20261120.md)、2026-11-21 回传（246 顶层）；E2E：[`../../specs/test/e2e/README.md`](../../specs/test/e2e/README.md) + [`../../frontend/e2e/report/cdp/audit-P1-CONV.md`](../../frontend/e2e/report/cdp/audit-P1-CONV.md)；停止机制：[`../testing/STOP-UPSTREAM-EVIDENCE-20261122.md`](../testing/STOP-UPSTREAM-EVIDENCE-20261122.md)；停止定向与幂等：[`../testing/STOP-EVIDENCE-2-20261122.md`](../testing/STOP-EVIDENCE-2-20261122.md)；IME：[`../testing/IME-EVIDENCE-20261122.md`](../testing/IME-EVIDENCE-20261122.md)；投影：[`../testing/ACCEPT-CONV-8-20261122.md`](../testing/ACCEPT-CONV-8-20261122.md)；后端全量日志：`backend/.tmp/final-backend.log`。

| 域 | 已回写的部分证据 | 覆盖判定 | 不能升级的原因 |
|---|---|---|---|
| P1 会话与消息 | 前端 243/243（26.45s，0 skip）；后端全量 EXIT=0（16 个有测试的包全部 ok，另 10 个包无测试文件，`cmd/simo` 253.124s，日志 `backend/.tmp/final-backend.log`），定向 stop 2.07s、chat 整包 3.139s、停止上游 8.059s；E2E 19/19×2（01–16，07 OOS）；用例 33 条 AC = 33 通过 / 0 部分，SYNC-005 已移除、无 blocked 登记 | 已 13/0/0 | 2026-11-22 收口：12 个 PRD 判 covered；`PRD-CONV-006` 由 CDP 合成组合态补证（`IME-EVIDENCE-20261122.md`）；`PRD-CONV-005` 停止机制由 `stop_upstream_test.go` 假上游证明（10ms 取消、delta 0、idle 在 retracted 之后）；`PRD-CONV-008` 真机 304。2026-11-26 `PRD-CONV-009` 交付并签发：26 条 AC 全部 pass、560 条断言，升 covered |
| P2 任务与执行 | RightPanel 6 展示层、E2E 06 定位 | 仍 0/0/6 | 后端生命周期/取消/重试/复杂度/子会话均无执行证据 |
| P3 工作台与视图 | LibraryUtilities 2、App 工作台指标、RightPanel/E2E 07 | 仍 0/4/1 | WORK-005 未实现；真实 usage/每日聚合/最近活动未覆盖 |
| P4 文件与交付物 | RightPanel 交付物、E2E 07 下载 | 仍 0/2/4 | 上传/隔离/预览/PDF/Office 未覆盖 |
| P5–P9 | 后端 246/246 PASS（16 package with tests，0 skip）；P5 记忆、P6 团队、P7 调度、P8 设置/系统、P9 工具均有直接测试 | 仍 0/26/10 | 产品 AC/change 包/前端/权限/异常未齐；PASS 只证明既有测试通过 |
| P10 指标 | MetricsDashboard 9、App 工作台指标 | 仍 0/5/1 | 006 导出/对比/告警未实现；真实后端聚合未覆盖 |
| **合计** | 115 单测 + 19 E2E + 246 后端测试 | **12/37/23** | P1 为 12/0/1（12 个既有 PRD 收口，新增 `PRD-CONV-009` 记 gap）；其余 9 域的证据仍只到“部分用例/部分 AC”，未到 PRD 覆盖 |

> 结论：本轮把“没有任何执行证据”推进为“前端、E2E 与 P5–P9 后端均有用例级证据”。P1 原有的 12 个 PRD 已于 2026-11-22 收口（12 covered / 0 partial / 0 gap，33 条 AC 全 pass），停止机制、IME、消息定向与投影真机 304 均已补证；2026-11-23 新增 `PRD-CONV-009`（会话内任务与编排）只有原型九屏，18 条 AC 未建脚本，P1 改计 12/0/1，全仓 12/37/23。其余 9 域 covered/partial/gap 判定未变，后续仍须按 change 包补齐六类产物才允许逐项升级。

## 3. PRD → CHANGE → TEST

### P1 · 会话与消息
<a id="p1"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-CONV-001` | 会话树与主会话 | [CHG-CONV-001](../../specs/changes/CHG-CONV-001/spec.md) / [FE-003](../../specs/FE-003-chat-capabilities/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-001](../../specs/test/P1-CONV/test-plan.md#tc-p1-001) | `covered` | 已闭环（2026-11-22）：六类产物齐，AC 全 pass（含主会话保护、置顶同级排序）；部署验证归整线出口。 |
| `PRD-CONV-002` | 会话生命周期 | [CHG-CONV-001](../../specs/changes/CHG-CONV-001/spec.md) / [FE-001](../../specs/FE-001-frontend-rebuild/spec.md) / [FE-003](../../specs/FE-003-chat-capabilities/spec.md) / [FE-004](../../specs/FE-004-first-run-empty/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-002](../../specs/test/P1-CONV/test-plan.md#tc-p1-002) | `covered` | 已闭环（2026-11-22）：创建/重命名/归档/恢复有集成 + 后端契约 + E2E 08/09/10，AC 全 pass（含失败反馈与重试）；删除为显式非目标。 |
| `PRD-CONV-003` | 会话搜索与未读 | [CHG-CONV-001](../../specs/changes/CHG-CONV-001/spec.md) / [CHG-CONV-005](../../specs/changes/CHG-CONV-005/spec.md) / [FE-003](../../specs/FE-003-chat-capabilities/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-003](../../specs/test/P1-CONV/test-plan.md#tc-p1-003) | `covered` | 已闭环（2026-11-22）：标题搜索/失败态/未读（由 SYNC-004 承接）AC 全 pass；正文搜索仍为 P2 非目标。 |
| `PRD-CONV-004` | 消息流与渲染 | [CHG-CONV-002](../../specs/changes/CHG-CONV-002/spec.md) / [FE-001](../../specs/FE-001-frontend-rebuild/spec.md) / [FE-003](../../specs/FE-003-chat-capabilities/spec.md) / [COMP-message-colors](../../specs/COMP-message-colors/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-004](../../specs/test/P1-CONV/test-plan.md#tc-p1-004) | `covered` | 已闭环（2026-11-22）：18/18 + 后端 category 14+5 + E2E 01a/02；表格渲染子句已关闭；消息纯度无独立 AC。 |
| `PRD-CONV-007` | 祖先消息整级加载 | [CHG-CONV-002](../../specs/changes/CHG-CONV-002/spec.md) / [FE-007](../../specs/FE-007-ancestor-messages/spec.md) / [COMP-timeline-groups](../../specs/COMP-timeline-groups/spec.md) / [COMP-timeline-tip](../../specs/COMP-timeline-tip/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-005](../../specs/test/P1-CONV/test-plan.md#tc-p1-005) | `covered` | 已闭环（2026-11-22）：集成 5 条祖先用例 + E2E 04a–04d + prepend 锚定；时间轴命中由 [ACCEPT-CONV-6](../testing/ACCEPT-CONV-6-20261122.md) 真机判 pass。 |
| `PRD-CONV-008` | 右栏会话投影 | [CHG-CONV-006](../../specs/changes/CHG-CONV-006/proposal.md) | [TC-P1-CONV-008](../../specs/test/P1-CONV/test-plan.md#tc-p1-conv-008) | `covered` | 已闭环（2026-11-22）：`AC-CONV-008-04` 真机 spec-projection 200→304（ETag `spec-c5a2d772dd1d5d88`、304 空体，见 [ACCEPT-CONV-8](../testing/ACCEPT-CONV-8-20261122.md)）；`AC-CONV-008-03` 375 四态截图已补；`AC-CONV-008-05` 的 G18 负路径仍缺断言，不阻塞该条。 |
| `PRD-CONV-005` | 发送·流式·断线重连 | [CHG-CONV-003](../../specs/changes/CHG-CONV-003/spec.md) / [FE-002](../../specs/FE-002-chat-robustness/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-006](../../specs/test/P1-CONV/test-plan.md#tc-p1-006) | `covered` | 已闭环（2026-11-22）：`AC-CONV-005-01/02` 判 pass；停止按 `messageId` 定向（`stop_interrupt_test.go:32`、`:402`），停止机制由 `stop_upstream_test.go` 假上游证明（停止后 10ms 上游 context 取消、之后 `reply.delta`/`message.delta` 为 0、`idle` 在 `retracted` 之后，`STOP-UPSTREAM-EVIDENCE-20261122.md`）；发送幂等已实现（`idempotency.go`，`p1_conv_chat_idempotency_test.go` 7 条 pass）。环境限制：真实厂商 403、跨标签双 WS、断网 e2e 不进判据。 |
| `PRD-CONV-006` | Composer 输入与快捷键 | [CHG-CONV-003](../../specs/changes/CHG-CONV-003/spec.md) / [FE-006](../../specs/FE-006-chat-experience/spec.md) / [COMP-composer-send-mode](../../specs/COMP-composer-send-mode/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-007](../../specs/test/P1-CONV/test-plan.md#tc-p1-007) | `covered` | 已闭环（2026-11-22）：`AC-CONV-006-02` 由 CDP `Input.imeSetComposition` 五点验证转 pass（`IME-EVIDENCE-20261122.md`、两张截图）；其余 10/10 + 新增 5 条 + E2E 03 均 pass；物理输入法未覆盖只作环境限制。 |
| `PRD-SYNC-001` | WS 连接与重连 | [CHG-CONV-004](../../specs/changes/CHG-CONV-004/spec.md) / [FE-002](../../specs/FE-002-chat-robustness/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-008](../../specs/test/P1-CONV/test-plan.md#tc-p1-008) | `covered` | 已闭环（2026-11-22）：后端生命周期/多客户端/since/错误帧 4 条 + 前端重连集成 + E2E 02 均 pass。 |
| `PRD-SYNC-002` | 多标签 active/ancestor/read cursor | [CHG-CONV-004](../../specs/changes/CHG-CONV-004/spec.md) / [FE-009](../../specs/FE-009-web-multitab/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-009](../../specs/test/P1-CONV/test-plan.md#tc-p1-009) | `covered` | 已闭环（2026-11-22）：BroadcastChannel 单测 6 条 + E2E 13；未读游标由 SYNC-004 承接并通过。 |
| `PRD-SYNC-003` | 发送模式/设置跨标签同步 | [CHG-CONV-004](../../specs/changes/CHG-CONV-004/spec.md) / [FE-006](../../specs/FE-006-chat-experience/spec.md) / [COMP-composer-send-mode](../../specs/COMP-composer-send-mode/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-010](../../specs/test/P1-CONV/test-plan.md#tc-p1-010) | `covered` | 已闭环（2026-11-22）：单标签持久化 + E2E 13 多标签发送模式均 pass。 |
| `PRD-SYNC-004` | 未读与已读游标 | [CHG-CONV-005](../../specs/changes/CHG-CONV-005/spec.md)（剩余范围） / [FE-003](../../specs/FE-003-chat-capabilities/spec.md) / [CHG-LEGACY-P1-CONV](../../specs/changes/CHG-LEGACY-P1-CONV/spec.md) | [TC-P1-011](../../specs/test/P1-CONV/test-plan.md#tc-p1-011) | `covered` | 已闭环（2026-11-22）：AC-SYNC-004-01/02/03 全 pass（未读持久化）；CHG-CONV-005 中原 SYNC-005 范围已移除。 |
| `PRD-CONV-009` | 会话内任务与编排 | [CHG-CONV-007](../../specs/changes/CHG-CONV-007/proposal.md) | [TC-P1-CONV-009](../../specs/test/P1-CONV/test-plan.md#tc-p1-conv-009) | `covered` | 已闭环（2026-11-26）：26 条 AC 全部 pass、560 条断言，五道门禁本包全绿，真机 16/16；验收报告 [ACCEPT-CONV-007-R5](../testing/ACCEPT-CONV-007-R5-20261126.md)，复盘 [RETRO-CHG-CHG-CONV-007](../plan/RETRO-CHG-CHG-CONV-007.md)。形态以原型 `docs/design/task-prototype-v3-20261123.html` 九屏为准；任务执行器与生命周期归 P2-TASK，交付物存储与下载实现归 P4-FILE |

### P2 · 任务与执行
<a id="p2"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-TASK-001` | 任务生命周期与执行组 | [CHG-LEGACY-P2-TASK](../../specs/changes/CHG-LEGACY-P2-TASK/spec.md) | [TC-P2-001](../../specs/test/P2-TASK/test-plan.md#tc-p2-001) | `gap` | 后端 tasks 路由存在，但无前端执行组完整契约、无域测试计划。 |
| `PRD-TASK-002` | 任务概览与进度 | [CHG-LEGACY-P2-TASK](../../specs/changes/CHG-LEGACY-P2-TASK/spec.md) | [TC-P2-002](../../specs/test/P2-TASK/test-plan.md#tc-p2-002) | `gap` | 右栏/概览已有部分展示；无 PRD、无 AC、无进度口径与测试。 |
| `PRD-TASK-003` | 长任务异步与开始/结束消息 | [CHG-LEGACY-P2-TASK](../../specs/changes/CHG-LEGACY-P2-TASK/spec.md) | [TC-P2-003](../../specs/test/P2-TASK/test-plan.md#tc-p2-003) | `gap` | 仅有 m19 契约；异步开始/结束消息、解耦与恢复未实现验收。 |
| `PRD-TASK-006` | 取消·重试·预算·恢复 | [CHG-LEGACY-P2-TASK](../../specs/changes/CHG-LEGACY-P2-TASK/spec.md) | [TC-P2-004](../../specs/test/P2-TASK/test-plan.md#tc-p2-004) | `gap` | 后端有 cancel/retry/runtime；预算/并发/恢复缺产品 spec 与前端入口。 |
| `PRD-TASK-004` | 复杂度分级与确认门禁 | [CHG-LEGACY-P2-TASK](../../specs/changes/CHG-LEGACY-P2-TASK/spec.md) | [TC-P2-005](../../specs/test/P2-TASK/test-plan.md#tc-p2-005) | `gap` | C0–C4 已写入 docs/task-complexity.md，但无实现、无测试。 |
| `PRD-TASK-005` | 子会话与任务归属 | [CHG-LEGACY-P2-TASK](../../specs/changes/CHG-LEGACY-P2-TASK/spec.md) | [TC-P2-006](../../specs/test/P2-TASK/test-plan.md#tc-p2-006) | `gap` | 父会话只维护 childSessionIds、子会话内建 Task 的规则已定，但未实现/未验证。 |
### P3 · 工作台与视图
<a id="p3"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-WORK-001` | 双页导航与工作台入口 | [FE-001](../../specs/FE-001-frontend-rebuild/spec.md) / [FE-005](../../specs/FE-005-workbench/spec.md) / [CHG-LEGACY-P3-WORK](../../specs/changes/CHG-LEGACY-P3-WORK/spec.md) | [TC-P3-001](../../specs/test/P3-WORK/test-plan.md#tc-p3-001) | `partial` | FE-001 总签字仍待补测，导航仅两页。 |
| `PRD-WORK-002` | 用量与统计卡 | [FE-005](../../specs/FE-005-workbench/spec.md) / [CHG-LEGACY-P3-WORK](../../specs/changes/CHG-LEGACY-P3-WORK/spec.md) | [TC-P3-002](../../specs/test/P3-WORK/test-plan.md#tc-p3-002) | `partial` | 统计口径/空值/错误态未统一为 PRD AC。 |
| `PRD-WORK-003` | 每日趋势与最近活动 | [FE-005](../../specs/FE-005-workbench/spec.md) / [CHG-LEGACY-P3-WORK](../../specs/changes/CHG-LEGACY-P3-WORK/spec.md) | [TC-P3-003](../../specs/test/P3-WORK/test-plan.md#tc-p3-003) | `partial` | 趋势口径与时区未写产品级定义。 |
| `PRD-WORK-004` | 工作台交付物与三态 | [FE-004](../../specs/FE-004-first-run-empty/spec.md) / [FE-005](../../specs/FE-005-workbench/spec.md) / [CHG-LEGACY-P3-WORK](../../specs/changes/CHG-LEGACY-P3-WORK/spec.md) | [TC-P3-004](../../specs/test/P3-WORK/test-plan.md#tc-p3-004) | `partial` | 空/错误态通过；loading 未捕获，打开/预览未验证；产品 spec 待建。 |
| `PRD-WORK-005` | 自定义视图 13 类块 | [CHG-LEGACY-P3-WORK](../../specs/changes/CHG-LEGACY-P3-WORK/spec.md) | [TC-P3-005](../../specs/test/P3-WORK/test-plan.md#tc-p3-005) | `gap` | 只有视图 Schema/渲染契约，无前端页面、无测试。 |
### P4 · 文件与交付物
<a id="p4"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-FILE-001` | 会话文件聚合与列表 | [CHG-LEGACY-P4-FILE](../../specs/changes/CHG-LEGACY-P4-FILE/spec.md) | [TC-P4-001](../../specs/test/P4-FILE/test-plan.md#tc-p4-001) | `gap` | 后端聚合/分页存在，前端无文件页；无域级测试与证据。 |
| `PRD-FILE-005` | 工作区目录与输出隔离 | [CHG-LEGACY-P4-FILE](../../specs/changes/CHG-LEGACY-P4-FILE/spec.md) | [TC-P4-002](../../specs/test/P4-FILE/test-plan.md#tc-p4-002) | `gap` | 仅 docs/workspace-layout 约定；无隔离/越权测试。 |
| `PRD-FILE-002` | 上传与附件 | [CHG-LEGACY-P4-FILE](../../specs/changes/CHG-LEGACY-P4-FILE/spec.md) | [TC-P4-003](../../specs/test/P4-FILE/test-plan.md#tc-p4-003) | `gap` | 上传后端存在，前端无附件入口；缺大小/类型/失败路径 AC。 |
| `PRD-FILE-003` | 交付物卡片与列表 | [FE-003](../../specs/FE-003-chat-capabilities/spec.md) / [FE-005](../../specs/FE-005-workbench/spec.md) / [CHG-LEGACY-P4-FILE](../../specs/changes/CHG-LEGACY-P4-FILE/spec.md) | [TC-P4-004](../../specs/test/P4-FILE/test-plan.md#tc-p4-004) | `partial` | 卡片状态与可操作性未统一。 |
| `PRD-FILE-004` | 预览与下载 | [FE-005](../../specs/FE-005-workbench/spec.md) / [CHG-LEGACY-P4-FILE](../../specs/changes/CHG-LEGACY-P4-FILE/spec.md) | [TC-P4-005](../../specs/test/P4-FILE/test-plan.md#tc-p4-005) | `partial` | 打开/预览未验证；Markdown/代码/图片/PDF 无分类型验收。 |
| `PRD-FILE-006` | 文件生成（PDF/Office/图片） | [CHG-LEGACY-P4-FILE](../../specs/changes/CHG-LEGACY-P4-FILE/spec.md) | [TC-P4-006](../../specs/test/P4-FILE/test-plan.md#tc-p4-006) | `gap` | 后端文件生成契约存在；无统一产品 AC、无生成失败/回滚测试。 |
### P5 · 记忆
<a id="p5"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-MEM-001` | 记忆条目·作用域·搜索 | [CHG-LEGACY-P5-MEM](../../specs/changes/CHG-LEGACY-P5-MEM/spec.md) | [TC-P5-001](../../specs/test/P5-MEM/test-plan.md#tc-p5-001) | `partial` | 后端 6 项记忆测试 pass（可见性/FTS/注入/重启/中文搜索/隔离）；无 HTTP 层、无前端记忆页、无召回质量/性能矩阵。 |
| `PRD-MEM-006` | 记忆迁移与索引 | [CHG-LEGACY-P5-MEM](../../specs/changes/CHG-LEGACY-P5-MEM/spec.md) | [TC-P5-002](../../specs/test/P5-MEM/test-plan.md#tc-p5-002) | `gap` | 未实现（仅 v1–v6 migration 代码）；无迁移/回滚测试。 |
| `PRD-MEM-002` | 实体·关系·金字塔 | [CHG-LEGACY-P5-MEM](../../specs/changes/CHG-LEGACY-P5-MEM/spec.md) | [TC-P5-003](../../specs/test/P5-MEM/test-plan.md#tc-p5-003) | `partial` | V3 pipeline 测试 pass；实体/图谱/金字塔 HTTP 与失败路径未测。 |
| `PRD-MEM-003` | 冲突与争议保留 | [CHG-LEGACY-P5-MEM](../../specs/changes/CHG-LEGACY-P5-MEM/spec.md) | [TC-P5-004](../../specs/test/P5-MEM/test-plan.md#tc-p5-004) | `partial` | 冲突/偏好/canonical 测试 pass；冲突产品规则/UI 未测。 |
| `PRD-MEM-004` | 召回 R1/R2 | [CHG-LEGACY-P5-MEM](../../specs/changes/CHG-LEGACY-P5-MEM/spec.md) | [TC-P5-005](../../specs/test/P5-MEM/test-plan.md#tc-p5-005) | `partial` | R1/R2 测试 pass；真实质量/延迟/降级矩阵未测。 |
| `PRD-MEM-005` | 向量召回与巩固 | [CHG-LEGACY-P5-MEM](../../specs/changes/CHG-LEGACY-P5-MEM/spec.md) | [TC-P5-006](../../specs/test/P5-MEM/test-plan.md#tc-p5-006) | `partial` | 巩固/向量 6 测试 pass；无 UI/端到端。 |
### P6 · 团队与智能体
<a id="p6"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-TEAM-001` | 智能体 roster 与模型 | [CHG-LEGACY-P6-TEAM](../../specs/changes/CHG-LEGACY-P6-TEAM/spec.md) | [TC-P6-001](../../specs/test/P6-TEAM/test-plan.md#tc-p6-001) | `partial` | V0 view 测试 pass；无前端/成员分页/权限。 |
| `PRD-TEAM-002` | 团队成员=子会话+负责人 | [CHG-LEGACY-P6-TEAM](../../specs/changes/CHG-LEGACY-P6-TEAM/spec.md) | [TC-P6-002](../../specs/test/P6-TEAM/test-plan.md#tc-p6-002) | `partial` | 内部路由测试 pass；无跨会话越权 E2E。 |
| `PRD-TEAM-005` | 团队内部消息隔离 | [CHG-LEGACY-P6-TEAM](../../specs/changes/CHG-LEGACY-P6-TEAM/spec.md) | [TC-P6-003](../../specs/test/P6-TEAM/test-plan.md#tc-p6-003) | `partial` | 隔离/WS 广播测试 pass；无泄漏/重连测试。 |
| `PRD-TEAM-003` | 团队模板·角色·触发器 | [CHG-LEGACY-P6-TEAM](../../specs/changes/CHG-LEGACY-P6-TEAM/spec.md) | [TC-P6-004](../../specs/test/P6-TEAM/test-plan.md#tc-p6-004) | `partial` | 模板/触发器测试 pass；无前端管理。 |
| `PRD-TEAM-004` | 团队只读投影与对话创建 | [CHG-LEGACY-P6-TEAM](../../specs/changes/CHG-LEGACY-P6-TEAM/spec.md) | [TC-P6-005](../../specs/test/P6-TEAM/test-plan.md#tc-p6-005) | `gap` | 只读投影未实现；无测试。 |
| `PRD-TEAM-006` | 子代理并行与团队任务板 | [CHG-LEGACY-P6-TEAM](../../specs/changes/CHG-LEGACY-P6-TEAM/spec.md) | [TC-P6-006](../../specs/test/P6-TEAM/test-plan.md#tc-p6-006) | `gap` | 子代理并行/任务板未实现；无测试。 |
### P7 · 调度
<a id="p7"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-SCHED-001` | 定时任务 CRUD | [CHG-LEGACY-P7-SCHED](../../specs/changes/CHG-LEGACY-P7-SCHED/spec.md) | [TC-P7-001](../../specs/test/P7-SCHED/test-plan.md#tc-p7-001) | `partial` | once/pause/run-now 测试 pass；完整 CRUD/分页/权限未测。 |
| `PRD-SCHED-002` | 列表与下次运行时间 | [CHG-LEGACY-P7-SCHED](../../specs/changes/CHG-LEGACY-P7-SCHED/spec.md) | [TC-P7-002](../../specs/test/P7-SCHED/test-plan.md#tc-p7-002) | `partial` | next-run 测试 pass；时区口径未产品化。 |
| `PRD-SCHED-003` | 立即运行与幂等 | [CHG-LEGACY-P7-SCHED](../../specs/changes/CHG-LEGACY-P7-SCHED/spec.md) | [TC-P7-003](../../specs/test/P7-SCHED/test-plan.md#tc-p7-003) | `partial` | run-now/事件测试 pass；幂等/并发未测。 |
| `PRD-SCHED-004` | 重复规则与时区 | [CHG-LEGACY-P7-SCHED](../../specs/changes/CHG-LEGACY-P7-SCHED/spec.md) | [TC-P7-004](../../specs/test/P7-SCHED/test-plan.md#tc-p7-004) | `partial` | 非法 cron/next-run 测试 pass；DST/时区未测。 |
| `PRD-SCHED-005` | 失败·重试·通知 | [CHG-LEGACY-P7-SCHED](../../specs/changes/CHG-LEGACY-P7-SCHED/spec.md) | [TC-P7-005](../../specs/test/P7-SCHED/test-plan.md#tc-p7-005) | `gap` | 失败重试/通知未实现；无测试。 |
### P8 · 设置与系统
<a id="p8"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-SET-001` | 模型与 Provider | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-001](../../specs/test/P8-SET/test-plan.md#tc-p8-001) | `partial` | config、migrate 的精确测试 pass（见 CHG-LEGACY-P8-SET evidence）；无设置页/热更新。 |
| `PRD-SET-002` | 权限·沙盒·审批 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-002](../../specs/test/P8-SET/test-plan.md#tc-p8-002) | `partial` | 权限/审批测试 pass；无前端权限矩阵/真实越权。 |
| `PRD-SET-003` | 外观·主题·语言 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-003](../../specs/test/P8-SET/test-plan.md#tc-p8-003) | `gap` | 未实现；无主题/语言测试。 |
| `PRD-SET-005` | 快捷键·关于·版本 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-004](../../specs/test/P8-SET/test-plan.md#tc-p8-004) | `gap` | 未实现；无快捷键/关于页测试。 |
| `PRD-SET-004` | 数据目录·备份·恢复 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-005](../../specs/test/P8-SET/test-plan.md#tc-p8-005) | `partial` | config migration/workspace-migrate 测试 pass；备份/恢复/回滚演练未做。 |
| `PRD-SET-006` | 能力管理（MCP/CLI/Skills/目录） | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-006](../../specs/test/P8-SET/test-plan.md#tc-p8-006) | `gap` | 未实现；无能力管理测试。 |
| `PRD-SYS-001` | 本地单用户与鉴权边界 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-007](../../specs/test/P8-SET/test-plan.md#tc-p8-007) | `partial` | health/404 测试 pass；无认证/远程/多用户安全测试。 |
| `PRD-SYS-002` | 权限 fail-closed | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-008](../../specs/test/P8-SET/test-plan.md#tc-p8-008) | `partial` | default policy/approval/hook 测试 pass；无并发/组合策略。 |
| `PRD-SYS-004` | 数据备份·迁移·回滚 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-009](../../specs/test/P8-SET/test-plan.md#tc-p8-009) | `partial` | workspace-migrate 测试 pass；无正式备份/恢复演练。 |
| `PRD-SYS-003` | 健康检查与运行时状态 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-010](../../specs/test/P8-SET/test-plan.md#tc-p8-010) | `partial` | health/readiness/error envelope 测试 pass；无进程/依赖故障演练。 |
| `PRD-SYS-005` | 日志与审计 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-011](../../specs/test/P8-SET/test-plan.md#tc-p8-011) | `partial` | error envelope 测试 pass；审计查询/脱敏未测。 |
| `PRD-SYS-006` | 安装·升级·便携包 | [CHG-LEGACY-P8-SET](../../specs/changes/CHG-LEGACY-P8-SET/spec.md) | [TC-P8-012](../../specs/test/P8-SET/test-plan.md#tc-p8-012) | `partial` | config path 测试 pass；安装/升级/卸载未测。 |
### P9 · 工具与能力
<a id="p9"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-TOOL-001` | 工具注册·执行·审计 | [CHG-LEGACY-P9-TOOL](../../specs/changes/CHG-LEGACY-P9-TOOL/spec.md) | [TC-P9-001](../../specs/test/P9-TOOL/test-plan.md#tc-p9-001) | `partial` | action registry/native tools 测试 pass；无前端能力视图。 |
| `PRD-TOOL-002` | 权限·审批·沙盒 | [CHG-LEGACY-P9-TOOL](../../specs/changes/CHG-LEGACY-P9-TOOL/spec.md) | [TC-P9-002](../../specs/test/P9-TOOL/test-plan.md#tc-p9-002) | `partial` | 权限/审批测试 pass；无真实越权/并发。 |
| `PRD-TOOL-003` | Skills 发现与加载 | [CHG-LEGACY-P9-TOOL](../../specs/changes/CHG-LEGACY-P9-TOOL/spec.md) | [TC-P9-003](../../specs/test/P9-TOOL/test-plan.md#tc-p9-003) | `gap` | backend 无 skills 实现/测试；产品 spec 原 partial 为文档不一致，按 backend 口径 unimplemented。 |
| `PRD-TOOL-005` | CLI 工具白名单 | [CHG-LEGACY-P9-TOOL](../../specs/changes/CHG-LEGACY-P9-TOOL/spec.md) | [TC-P9-004](../../specs/test/P9-TOOL/test-plan.md#tc-p9-004) | `partial` | Pwsh approval/exit code/env timeout 测试 pass（blocklist）；白名单/注入未测。 |
| `PRD-TOOL-004` | MCP 接入 | [CHG-LEGACY-P9-TOOL](../../specs/changes/CHG-LEGACY-P9-TOOL/spec.md) | [TC-P9-005](../../specs/test/P9-TOOL/test-plan.md#tc-p9-005) | `gap` | MCP 未实现；无协议/安全测试。 |
| `PRD-TOOL-006` | 联网搜索与抓取 | [CHG-LEGACY-P9-TOOL](../../specs/changes/CHG-LEGACY-P9-TOOL/spec.md) | [TC-P9-006](../../specs/test/P9-TOOL/test-plan.md#tc-p9-006) | `partial` | mock search/fetch/SSRF 测试 pass；真实网络/限流/引用未测。 |
| `PRD-TOOL-007` | 能力目录 L0–L3 | [CHG-LEGACY-P9-TOOL](../../specs/changes/CHG-LEGACY-P9-TOOL/spec.md) | [TC-P9-007](../../specs/test/P9-TOOL/test-plan.md#tc-p9-007) | `gap` | 能力目录未实现；无测试。 |
### P10 · 指标
<a id="p10"></a>

| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |
|---|---|---|---|---|---|
| `PRD-METRIC-001` | 系统性能指标 | [FE-008](../../specs/FE-008-metrics-dashboard/spec.md) / [CHG-LEGACY-P10-METRIC](../../specs/changes/CHG-LEGACY-P10-METRIC/spec.md) | [TC-P10-001](../../specs/test/P10-METRIC/test-plan.md#tc-p10-001) | `partial` | 指标口径只存在于仪表盘文档。 |
| `PRD-METRIC-002` | 任务质量指标 | [FE-008](../../specs/FE-008-metrics-dashboard/spec.md) / [CHG-LEGACY-P10-METRIC](../../specs/changes/CHG-LEGACY-P10-METRIC/spec.md) | [TC-P10-002](../../specs/test/P10-METRIC/test-plan.md#tc-p10-002) | `partial` | 完成率/一次完成/返工数据不全；无产品 AC。 |
| `PRD-METRIC-003` | 延迟 p50/p90 | [FE-008](../../specs/FE-008-metrics-dashboard/spec.md) / [CHG-LEGACY-P10-METRIC](../../specs/changes/CHG-LEGACY-P10-METRIC/spec.md) | [TC-P10-003](../../specs/test/P10-METRIC/test-plan.md#tc-p10-003) | `partial` | TTFT/耗时分位数未完整采集；无延迟口径测试。 |
| `PRD-METRIC-004` | 7/30 天窗口与 partial | [FE-008](../../specs/FE-008-metrics-dashboard/spec.md) / [CHG-LEGACY-P10-METRIC](../../specs/changes/CHG-LEGACY-P10-METRIC/spec.md) | [TC-P10-004](../../specs/test/P10-METRIC/test-plan.md#tc-p10-004) | `partial` | 时区/今日未完整已有实现但无产品级 AC。 |
| `PRD-METRIC-005` | 明细表与口径说明 | [FE-008](../../specs/FE-008-metrics-dashboard/spec.md) / [CHG-LEGACY-P10-METRIC](../../specs/changes/CHG-LEGACY-P10-METRIC/spec.md) | [TC-P10-005](../../specs/test/P10-METRIC/test-plan.md#tc-p10-005) | `partial` | 口径变更流程未定义。 |
| `PRD-METRIC-006` | 导出·对比·告警 | [CHG-LEGACY-P10-METRIC](../../specs/changes/CHG-LEGACY-P10-METRIC/spec.md) | [TC-P10-006](../../specs/test/P10-METRIC/test-plan.md#tc-p10-006) | `gap` | 未实现；无导出/告警测试。 |

## 4. 历史 FE/COMP 变更映射

| 历史目录 | 新 ID | 主要覆盖 PRD | 说明 |
|---|---|---|---|
| `FE-001-frontend-rebuild` | `CHG-LEGACY-001` | CONV-001/002/004, WORK-001 | 不重命名，保留原目录与证据 |
| `FE-002-chat-robustness` | `CHG-LEGACY-002` | CONV-005, SYNC-001 | 同上 |
| `FE-003-chat-capabilities` | `CHG-LEGACY-003` | CONV-001/003/004, FILE-003 | 同上 |
| `FE-004-first-run-empty` | `CHG-LEGACY-004` | CONV-002, WORK-004 | 同上 |
| `FE-005-workbench` | `CHG-LEGACY-005` | WORK-001/002/003/004, FILE-004 | 同上 |
| `FE-006-chat-experience` | `CHG-LEGACY-006` | CONV-006, SYNC-003 | 同上 |
| `FE-007-ancestor-messages` | `CHG-LEGACY-007` | CONV-007 | 同上 |
| `FE-008-metrics-dashboard` | `CHG-LEGACY-008` | METRIC-001/002/003/004/005 | 同上 |
| `FE-009-web-multitab` | `CHG-LEGACY-009` | SYNC-002 | 同上 |
| `FE-009-frontend-tests` | `CHG-LEGACY-010` | 跨域测试基础设施 | 编号冲突，保留全名 |
| `COMP-conversation-panel` | `COMP-LEGACY-001` | CONV-004 | 组件契约，不单独算 change |
| `COMP-timeline-groups` | `COMP-LEGACY-002` | CONV-007 | 同上 |
| `COMP-timeline-tip` | `COMP-LEGACY-003` | CONV-007 | 同上 |
| `COMP-message-colors` | `COMP-LEGACY-004` | CONV-004 | 同上 |
| `COMP-composer-send-mode` | `COMP-LEGACY-005` | CONV-006 | 同上 |

## 5. Gap 清单（按域）

- **P1 会话与消息**：无 PRD 级 gap，13 个 PRD 全部 covered / 0 partial。`PRD-CONV-009`（会话内任务与编排）于 2026-11-26 交付并签发，26 条 AC 全部 pass、560 条断言，验收报告 [ACCEPT-CONV-007-R5](../testing/ACCEPT-CONV-007-R5-20261126.md)。其余 12 个 PRD 维持 covered（33 条既有 AC 全 pass）。非阻塞项：`AC-CONV-008-05` 的组件级负路径（G18）仍缺断言；真实厂商 403、跨标签双 WS、断网 e2e（CONV-005）与物理输入法（CONV-006）属环境限制，不进 AC 判据。
- **P2 任务与执行**：`PRD-TASK-001`（partial）、`PRD-TASK-002`（partial）、`PRD-TASK-003`（unimplemented）、`PRD-TASK-006`（partial）、`PRD-TASK-004`（unimplemented）、`PRD-TASK-005`（unimplemented）
- **P3 工作台与视图**：`PRD-WORK-005`（unimplemented）
- **P4 文件与交付物**：`PRD-FILE-001`（partial）、`PRD-FILE-005`（partial）、`PRD-FILE-002`（partial）、`PRD-FILE-006`（partial）
- **P5 记忆**：`PRD-MEM-001`（partial）、`PRD-MEM-006`（unimplemented）、`PRD-MEM-002`（partial）、`PRD-MEM-003`（partial）、`PRD-MEM-004`（partial）、`PRD-MEM-005`（partial）
- **P6 团队与智能体**：`PRD-TEAM-001`（partial）、`PRD-TEAM-002`（partial）、`PRD-TEAM-005`（partial）、`PRD-TEAM-003`（partial）、`PRD-TEAM-004`（unimplemented）、`PRD-TEAM-006`（unimplemented）
- **P7 调度**：`PRD-SCHED-001`（partial）、`PRD-SCHED-002`（partial）、`PRD-SCHED-003`（partial）、`PRD-SCHED-004`（partial）、`PRD-SCHED-005`（unimplemented）
- **P8 设置与系统**：`PRD-SET-001`（partial）、`PRD-SET-002`（partial）、`PRD-SET-003`（unimplemented）、`PRD-SET-005`（unimplemented）、`PRD-SET-004`（partial）、`PRD-SET-006`（unimplemented）、`PRD-SYS-001`（partial）、`PRD-SYS-002`（partial）、`PRD-SYS-004`（partial）、`PRD-SYS-003`（implemented）、`PRD-SYS-005`（partial）、`PRD-SYS-006`（partial）
- **P9 工具与能力**：`PRD-TOOL-001`（partial）、`PRD-TOOL-002`（partial）、`PRD-TOOL-003`（gap/unimplemented）、`PRD-TOOL-005`（partial）、`PRD-TOOL-004`（unimplemented）、`PRD-TOOL-006`（partial）、`PRD-TOOL-007`（unimplemented）
- **P10 指标**：`PRD-METRIC-006`（unimplemented）

## 6. 维护规则

- 每次变更完成：更新对应 PRD 行、CHANGE、TEST、覆盖与证据。
- 状态只按真实证据调整，不得无证据升级；发现不实立即降级并写原因。
- 产品 spec 已建，链接必须是真实锚点；TEST 链接必须指向具体用例锚点。
- 每季度清一次 gap；连续两个季度未补的升级到项目风险清单。

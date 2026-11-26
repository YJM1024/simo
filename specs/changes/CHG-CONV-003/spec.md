# CHG-CONV-003 · 输入与发送收口

状态：进行中（2026-11-21；主路径有证据，异常路径与组件契约未齐）
Implements: PRD-CONV-005、PRD-CONV-006
Covers: `AC-CONV-005-01`、`AC-CONV-005-02`、`AC-CONV-006-01`、`AC-CONV-006-02`
Change: CHG-CONV-003
变更类型：纯文档（只补契约、任务卡与证据登记，不改实现与产品 AC 文本）
Domains: `CONV`
Owner：产品（AC 口径）/ 前端（`frontend/src/components/library.tsx` Composer 509–590、`frontend/src/app.tsx` 发送流水线）/ 后端（`POST /api/chat`、WS）
design.md：N/A：无新方案。

> 关联：产品 spec [`../../product/P1-CONV/spec.md#prd-conv-005`](../../product/P1-CONV/spec.md#prd-conv-005)；
> 域计划 [`../../test/P1-CONV/test-plan.md#tc-p1-006`](../../test/P1-CONV/test-plan.md#tc-p1-006)；
> 组件 [`../../COMP-composer-send-mode/spec.md`](../../COMP-composer-send-mode/spec.md)。
判级：变更级
创建日期：2026-11-21
关闭日期：N/A：尚未收口，关闭日期在验收签字后补记
## 1. 目标

把"发送/流式/断线重连"与"Composer 输入/快捷键"收敛为可验收契约，并**明确断线重连与发送幂等尚未被测试**这一事实。目标不是宣称 P0 发送功能已完成，而是给出准确状态与后续任务。

## 2. 六类产物状态

| 类别 | 产物 | 状态 | 缺口 |
|---|---|---|---|
| 产品 spec | §4.3 | 有 | AC-005-02 把"停止/失败恢复/断线重连"打包，未逐条可断言 |
| CHANGE | 本包 | 有 | — |
| 前端开发 spec | [`frontend.md`](frontend.md) | 有 | — |
| 后端开发 spec | [`backend.md`](backend.md) | 有 | 重连回放语义（`since`）未在产品 AC 定义 |
| 组件 spec | `COMP-composer-send-mode` | **spec ready（未验收）** | 组件已实现并有组件测试，但契约未签收 |
| 任务卡 | [`tasks.md`](tasks.md) | 有 | 未派发 |
| 测试 spec / 用例 | [`test-plan.md`](test-plan.md) + TC-P1-006/007 | 有 | 断线重连/幂等/跨标签 = missing |
| 执行证据 | [`evidence.md`](evidence.md) | partial | 引用 2026-11-20 报告，未重跑 |

**结论：主路径证据充分，异常路径缺失 + 组件未签收 → `partial`。**

## 3. 行为契约（实查基线）

### 3.1 CONV-005 发送流水线

1. 输入非空 → `sendChat(sessionId, text, clientMutationId?)`（`frontend/src/api.ts`）→ `POST /api/chat`（后端 202 Accepted）。
2. WS 订阅 `{type:'subscribe', data:{sessionId, since}}`；帧 `reply.delta` 追加、`message.created/reply.done/message.done` 触发刷新；按 `seq` 去重（`App.integration` 用例 7）。
3. 停止：`Composer` 停止按钮 → `connectEvents().stop()` 在 socket OPEN 时发 `{type:'correct', data:{sessionId}}`。
4. 失败：发送异常 → `onSend` reject → Composer 恢复文本 + 可读错误 + 重试；重复提交被禁用。
5. 重连：socket `close` → `onStatus('reconnecting')` → `setTimeout(open, retryDelay)`，`800ms` 起 ×1.8，上限 `5000ms`；重连后 `subscribe` 携带 `since`（`app.tsx` 的 `lastEventId`）。
6. 后端恢复：`TestM55StartupRecoversStaleStreaming`、`TestM55StreamingWatchdogTimeout` 覆盖服务重启与看门狗；`TestWebSocketEventOrder`、`TestWebSocketSinceContinuation` 覆盖顺序与补发。

**未验证**：浏览器真实断网→恢复的重连矩阵；`clientMutationId` 幂等（重复发送是否去重）；长连接多会话订阅隔离。

### 3.2 CONV-006 Composer

- 快捷键判定：`withModifier || (sendMode==='enter' && !shiftKey) || (sendMode==='shift-enter' && shiftKey)`（`library.tsx:570`）。
- 发送模式：localStorage `simo.composer.sendMode`（含 legacy key 迁移），`BroadcastChannel('simo.composer.sendMode.v1')` + `storage` 事件双通道；`aria-pressed`/`aria-label` 随模式变化；hint 文案切换。
- 三态：`disabled`（不可发送）、`streaming`（停止按钮）、`sendError`（可读错误）。
- IME：`compositionstart/end` 期间不发送（组件测试覆盖）。
- 长文本不截断。

## 4. AC 证据与缺口

| AC | 证据 | 状态 | 缺口 |
|---|---|---|---|
| `AC-CONV-005-01` | Composer 发送/清空/回车/Ctrl+Meta 用例；E2E 02/05；后端 `POST /api/chat` 202 + `TestM2MockStreamRecordsUsageAndDecision` | 有证据 | 无真实后端端到端"发送→流式→完成"一次断言 |
| `AC-CONV-005-02` | 停止、失败恢复/重试、重复提交防护（Composer 用例 6/7/8/9）；WS 去重（App.integration 7） | 部分 | **断线重连、发送幂等 = missing** |
| `AC-CONV-006-01` | Composer 用例 1/2/3/4/5/10（Enter/Shift/Ctrl/Meta/IME/长文）；E2E 03 | 有证据 | 真实浏览器 IME（中文输入法）未测 |
| `AC-CONV-006-02` | 失败恢复/重试、disabled、streaming、持久化（用例 6/7/8/9） | 部分 | 跨标签同步未测（SYNC-003）；权限 N/A（本机单用户） |

### 4.1 判据映射

- `AC-CONV-005-01` → `scripts/ac/AC-CONV-005-01.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。
- `AC-CONV-005-02` → `scripts/ac/AC-CONV-005-02.mjs`，脚本存在，本轮未运行；断线重连与发送幂等仍记 `missing`。
- `AC-CONV-006-01` → `scripts/ac/AC-CONV-006-01.mjs`，脚本存在，本轮未运行；真实中文 IME 手测记 `missing`。
- `AC-CONV-006-02` → `scripts/ac/AC-CONV-006-02.mjs`，脚本存在，本轮未运行；跨标签同步待 `CHG-CONV-004` 用例。

## 5. 需求（R）

- **R1** 发送必须：空文本不发送、发送中不可重复提交、失败可恢复且不丢文本。
- **R2** 停止必须真正中断当前回复并回到可输入态。
- **R3** 断线必须可见（状态提示）且重连后不重复、不丢消息（`since` 回放 + `seq` 去重）。
- **R4** 发送模式必须持久化，切换后快捷键行为与 aria 文案一致，跨标签一致。
- **R5** IME 组合输入期间 Enter 不得触发发送。

## 6. 验收（A）

- A1 六类产物状态逐项写清；组件未签收必须写 partial。
- A2 发送流水线每步有代码位置与测试落点。
- A3 断线重连/幂等若无测试，必须列为 `missing` 并给任务卡。
- A4 不得以"停止按钮存在"代替"停止真的中断"证据。
- A5 不改 P2–P10、不改代码/测试/部署。

## 7. 非目标

- 不实现真实断网 E2E、离线队列、多设备同步。
- 不改 COMP 状态、不改重连参数。

## 8. 回滚

纯文档；删除目录并撤销链接即回滚。

## 9. 状态与错误边界

- 发送失败：Composer 恢复文本、显示可读错误并允许重试；发送中重复提交按钮禁用。
- 流式中：停止按钮可见；`correct` 帧后不再产生 delta，消息终态为 stopped。
- 断线：状态栏显示 `reconnecting`；重连按 `since` 补发并按 `seq` 去重，已渲染消息不重复。
- IME 组合输入期间 Enter 不发送；真实中文输入法未测，记 `missing`。

## 10. 接口与数据

- `POST /api/chat` 返回 202 Accepted；WS 帧 `subscribe {sessionId, since}`、`correct {sessionId}`。
- 事件帧：`reply.delta`、`message.created`、`reply.done`、`message.done`，前端按 `seq` 去重。
- 发送模式持久化在 localStorage `simo.composer.sendMode`（含 legacy key 迁移），跨标签走 BroadcastChannel 与 `storage` 事件。

## 11. 待确认

- `clientMutationId` 是否作为发送幂等键由产品裁决；未定前不建去重表。
- 真实断网→恢复的重连矩阵、长连接多会话订阅隔离未验证，列入 `TASK-CHG-CONV-003-01`。
- 断线回放的日志保留窗口未定义，超窗兜底（全量刷新）待产品与后端确认。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-21：建立本包并首次登记状态。
- 2026-11-21：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

未收口：当前状态为七值口径中的一项，剩余工作与缺口见本文件
「待确认」节与 `test-plan.md` 的未覆盖清单；关闭前需补齐证据并由验收 Agent 独立签字。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。

## 12. 功能点覆盖

覆盖范围：`PRD-CONV-005`、`PRD-CONV-006`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-CONV-005` | in | `AC-CONV-005-01`、`AC-CONV-005-02` | 流式输出与停止；入口为发送中的停止按钮与增量渲染 |
| `PRD-CONV-006` | in | `AC-CONV-006-01`、`AC-CONV-006-02` | 失败与重试；入口为消息错误态与重试操作 |

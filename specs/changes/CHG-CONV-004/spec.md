# CHG-CONV-004 · 多标签与同步收口

状态：进行中（2026-11-21；实现存在，多标签/重连路径零测试）
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003
Covers: `AC-SYNC-001-01`、`AC-SYNC-001-02`、`AC-SYNC-002-01`、`AC-SYNC-002-02`、`AC-SYNC-003-01`、`AC-SYNC-003-02`
Change: CHG-CONV-004
变更类型：纯文档（只补契约、任务卡与证据登记，不改实现与产品 AC 文本）
Domains: `SYNC`
Owner：产品（AC 口径）/ 前端（`tabsync.ts`、`app.tsx`、Composer）/ 后端（WS）
design.md：N/A：无新方案。

> 关联：产品 spec [`../../product/P1-CONV/spec.md#prd-sync-001`](../../product/P1-CONV/spec.md#prd-sync-001)；
> 域计划 [`../../test/P1-CONV/test-plan.md#tc-p1-008`](../../test/P1-CONV/test-plan.md#tc-p1-008)；
> 组件 [`../../COMP-composer-send-mode/spec.md`](../../COMP-composer-send-mode/spec.md)。
判级：变更级
创建日期：2026-11-21
关闭日期：N/A：尚未收口，关闭日期在验收签字后补记
## 1. 目标

把"WS 连接与重连""多标签三通道同步""发送模式跨标签"写成可验收契约，并**如实记录**：三者的自动化证据分别是"后端强/前端弱""仅代码无测试""仅持久化有测试"。目标是把 SYNC 域从"含糊 implemented"变成"明确 partial + 可执行任务"。

## 2. 六类产物状态

| 类别 | 产物 | 状态 | 缺口 |
|---|---|---|---|
| 产品 spec | §4.4 | 有 | AC-SYNC-001-02/002/003 的边界不可断言（无"重连不丢不重""多标签一致"的量化口径） |
| CHANGE | 本包 | 有 | — |
| 前端开发 spec | [`frontend.md`](frontend.md) | 有 | — |
| 后端开发 spec | [`backend.md`](backend.md) | 有 | 多标签不是后端职责，明确 N/A 边界 |
| 组件 spec | `COMP-composer-send-mode`（SYNC-003） | **spec ready 未验收** | 其余 N/A |
| 任务卡 | [`tasks.md`](tasks.md) | 有 | 未派发 |
| 测试 spec / 用例 | [`test-plan.md`](test-plan.md) + TC-P1-008/009/010 | 有 | 多标签与重连 = missing |
| 执行证据 | [`evidence.md`](evidence.md) | partial | 后端有，前端无 |

**结论：`partial`。SYNC-002 的"implemented"只能理解为"代码存在"，不等于"已验证"。**

## 3. 行为契约

### 3.1 SYNC-001 WS 连接与重连

- 连接：`connectEvents(sessionId)` 打开 `/api/ws?sessionId=`；`open` 后发 `subscribe {sessionId, since}`。
- 状态：`onStatus('open'|'reconnecting')` → `StatusBar`；`close` 一律进入重连。
- 退避：`retryDelay` 800ms 起 ×1.8，上限 5000ms，`open` 成功重置。
- 回放：`since` = 前端 `lastEventId`；后端按 `seq` 补发；前端按 `seq` 去重（App.integration 用例 7）。
- 后端证据：`TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients`。
- **未测**：浏览器真实断连→重连；重连期间发送是否排队/丢失；`since` 截断/溢出。

### 3.2 SYNC-002 多标签三通道

`tabsync.ts` 协议（`CHANNEL='simo.tab-sync.v1'`，BroadcastChannel，不支持时 `null`）：

| type | 字段 | 消费行为（`app.tsx`） |
|---|---|---|
| `active_session_changed` | `tabId,opId,at,sessionId` | 忽略本标签；按 `at` 新者优先、`at` 相同按 `tabId` 字典序；`remoteActiveRef` 抑制回声；切换 active 并清祖先链 |
| `ancestor_chain_changed` | `tabId,opId,at,sessionId,chain` | 拉取 chain 内各会话全量消息并合并去重；`chain` 为空则清空；按 chain 键去重 |
| `read_cursor_changed` | `tabId,opId,at,sessionId` | 同会话且 `at` 不旧于本地游标时更新游标并清未读 |

发布点：`app.tsx:171`（read cursor）、`224`（active）、`495`（ancestor chain）。`opId` 仅作标识，前端未按 `opId` 去重（依赖 `at`/`tabId`/chain key）。

- **未测**：任何双标签用例；回声抑制、tiebreak、chain 合并均无断言。

### 3.3 SYNC-003 发送模式跨标签

- 持久化：localStorage `simo.composer.sendMode`（legacy key 迁移）。
- 广播：`BroadcastChannel('simo.composer.sendMode.v1')` postMessage + `window.storage` 双通道；两个标签各持一份状态。
- 组件测试覆盖"切换/持久化/快捷键行为"；**不覆盖**跨标签同步与 storage 事件。

## 4. AC 证据与缺口

| AC | 证据 | 状态 | 缺口 |
|---|---|---|---|
| `AC-SYNC-001-01` | 后端 WS 顺序/补发/fanout；App.integration delta 去重；`connectEvents` 实现 | 部分 | 无前端重连用例 |
| `AC-SYNC-001-02` | 重连退避代码 | **missing** | 无 close→open 断言；无"不丢不重"量化 |
| `AC-SYNC-002-01` | `tabsync.ts` + `app.tsx` 三个消费分支 | **missing** | 无多标签测试 |
| `AC-SYNC-002-02` | 回声抑制/at-tiebreak/chain 去重代码 | **missing** | 无边界断言（乱序、同 at、chain 空） |
| `AC-SYNC-003-01` | Composer 用例 8（持久化/快捷键） | 部分 | 跨标签未测 |
| `AC-SYNC-003-02` | storage 事件监听代码 | **missing** | 无测试 |

### 4.1 判据映射

- `AC-SYNC-001-01` → `scripts/ac/AC-SYNC-001-01.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。
- `AC-SYNC-001-02` → `scripts/ac/AC-SYNC-001-02.mjs`，脚本存在，本轮未运行；前端 close→open 断言仍记 `missing`。
- `AC-SYNC-002-01` → `scripts/ac/AC-SYNC-002-01.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。
- `AC-SYNC-002-02` → `scripts/ac/AC-SYNC-002-02.mjs`，脚本存在，本轮未运行；乱序、同 `at`、chain 空三项无断言。
- `AC-SYNC-003-01` → `scripts/ac/AC-SYNC-003-01.mjs`，脚本存在，本轮未运行；跨标签未测。
- `AC-SYNC-003-02` → `scripts/ac/AC-SYNC-003-02.mjs`，脚本存在，本轮未运行；storage 事件无测试。

## 5. 需求（R）

- **R1** 重连必须可观察（状态可见），重连后消息不重复、不丢失；`since` 截断必须有兜底（全量刷新）。
- **R2** 多标签 active 切换不得形成回声风暴；同毫秒冲突必须有确定性 tiebreak。
- **R3** 祖先链广播必须去重（chain key），不得重复拉取/重复渲染。
- **R4** 发送模式跨标签必须最终一致（BroadcastChannel 或 storage 至少一条通道可用）。
- **R5** 无 BroadcastChannel 的环境必须降级为"单标签可用"，不得报错。

## 6. 验收（A）

- A1 六类产物状态逐项写清；组件未签收写 partial。
- A2 三通道协议字段与消费分支可在代码定位。
- A3 SYNC-001/002/003 至少各有一条已执行用例，否则标 `missing`。
- A4 不得把"后端 `TestM88` 双客户端 fanout"当成"多标签 UI 同步已验证"。
- A5 不改 P2–P10、不改代码/测试/部署。

## 7. 非目标

- 不做跨设备/跨浏览器同步；不启用 Playwright；不改退避参数。
- 不把 SYNC-002 的"代码存在"改写成"已验证"。

## 8. 回滚

纯文档；删除目录并撤销链接即回滚。

## 9. 状态与错误边界

- 连接 `close` 一律进入 `reconnecting`；退避 800ms 起 ×1.8、上限 5000ms，`open` 成功重置。
- `since` 截断或溢出时前端必须全量刷新，不能停在缺口状态；当前无断言，记 `missing`。
- 多标签同 `at` 冲突按 `tabId` 字典序 tiebreak；本标签消息不得回声，由 `remoteActiveRef` 抑制。
- 无 BroadcastChannel 时跨标签同步降级为单标签可用，不报错。

## 10. 接口与数据

- WS `/api/ws?sessionId=`；帧 `subscribe {sessionId, since}`，后端按 `seq` 补发。
- `tabsync.ts` 协议：`active_session_changed`、`ancestor_chain_changed`、`read_cursor_changed`，字段 `tabId`/`opId`/`at`/`sessionId`/`chain`。
- 发送模式通道：`BroadcastChannel("simo.composer.sendMode.v1")` 与 `window.storage` 双通道，localStorage 为持久层。

## 11. 待确认

- 重连期间发送是排队还是丢弃，产品未给口径；`since` 截断的兜底策略同样待定。
- 多标签活动会话冲突的 tiebreak 已按代码实现记录，是否升级为产品 AC 待确认。
- 真实双标签 E2E 需 CDP 双 target，当前环境未启用 Playwright。

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

覆盖范围：`PRD-SYNC-001`、`PRD-SYNC-002`、`PRD-SYNC-003`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-SYNC-001` | in | `AC-SYNC-001-01`、`AC-SYNC-001-02` | 多端同步；入口为多客户端会话列表一致 |
| `PRD-SYNC-002` | in | `AC-SYNC-002-01`、`AC-SYNC-002-02` | 多标签同步；入口为标签页之间状态一致 |
| `PRD-SYNC-003` | in | `AC-SYNC-003-01`、`AC-SYNC-003-02` | 断线与重连；入口为断线提示与自动恢复 |

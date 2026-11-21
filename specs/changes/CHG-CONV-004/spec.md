# CHG-CONV-004 · 多标签与同步收口

状态：**partial**（2026-11-21；实现存在，多标签/重连路径零测试）
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003
Domains: `SYNC`
Owner：产品（AC 口径）/ 前端（`tabsync.ts`、`app.tsx`、Composer）/ 后端（WS）
design.md：N/A —— 无新方案。

> 关联：产品 spec [`../../product/P1-CONV/spec.md#prd-sync-001`](../../product/P1-CONV/spec.md#prd-sync-001)；
> 域计划 [`../../test/P1-CONV/test-plan.md#tc-p1-008`](../../test/P1-CONV/test-plan.md#tc-p1-008)；
> 组件 [`../../COMP-composer-send-mode/spec.md`](../../COMP-composer-send-mode/spec.md)。

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

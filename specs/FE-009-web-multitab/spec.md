# FE-009 · Web 多终端统一控制（Spec）

状态：**implemented / accepted（A1–A10 已签，2026-11-14，build `mwfc8mdr`；8787 已部署）**
Owner：前端（实现）/ 后端（WS/事件契约配合）/ 验收
范围：**同源多标签页**（同一浏览器、同一账号/同一 `SIMO_HOME`）；不做跨账号/公网多设备。
关联：`docs/session-core-spec.md`、`specs/FE-007-ancestor-messages/spec.md`、`docs/session-spec.md`、`DESIGN.md`。
验收证据：`docs/tasks/acceptance.md`「FE-009 复验签字（2026-11-14，build `mwfc8mdr-7n9p9`，A1–A10 通过）」。

## 1. 目标

同一来源打开多个标签页时，所有标签共享同一 active session 与会话运行态：任一张标签发消息，其他标签实时看到 `message.created` / `reply.delta` / `reply.done`；active session 切换、祖先链、未读/已读同步；每张标签滚动策略独立（在底部才自动跟随，上翻不强制拉底）；断线按游标补拉；同帧重复发送不重复渲染。

## 2. 非目标

- 跨账号/公网/多设备鉴权与同步（后续独立 spec）；
- 移动端适配/原生 App；
- 多用户协作、权限共享、跨 `SIMO_HOME` 同步；
- 改消息/流式/任务后端语义；改分类/时间轴视觉。

## 3. 术语

- **标签（tab）**：同源浏览器标签页，持有独立 `tabId`；
- **active session**：当前所有标签应共同展示的会话；
- **同步通道**：同源 `BroadcastChannel`（控制态）+ 服务端 WS（消息/流式）；
- **游标**：WS 事件 id/消息 id/流式 seq，用于断线续接与去重；
- **last-write-wins**：控制态冲突按操作时间/序号取最后，不做静默合并。

## 4. 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 同源标签各自可发送消息；发送方标签与其他标签都收到 `message.created`，不重复渲染 |
| R2 | MUST | 所有标签对同一 active session 订阅；`reply.delta`/`reply.done` 实时同步，流式文本逐步一致 |
| R3 | MUST | active session 切换在标签间同步；最后操作生效；切会话时旧会话/祖先链/未读态按规则重置或更新 |
| R4 | MUST | 祖先链加载/清空在标签间同步（同一 active session）；切会话清空并广播 |
| R5 | MUST | 未读/已读同步：读游标/已读消息集合同步，另一标签不重复计未读；未读不因隐藏标签的旧状态回退 |
| R6 | MUST | 滚动跟随策略每标签独立：在底部才自动跟随新消息；上翻不强制拉底，显示新消息提示/未读 |
| R7 | MUST | 冲突：控制态 last-write-wins；同帧重复发送按 `clientMutationId` 去重；同事件/同消息 id 去重，不重复渲染 |
| R8 | MUST | 断线重连：带 `since`/最新游标补拉；游标过期时取最近快照/最新消息；补拉与实时事件去重、无空洞 |
| R9 | MUST | 同源隔离：不跨账号/跨 `SIMO_HOME`；无鉴权公网不启用；控制态不泄露到非同源 |
| R10 | MUST | 1600/1180/375 多标签布局不破版；双/三标签并发无 console error、无重复消息/流式错位 |

## 5. 同步机制

### 5.1 通道

- **控制态**（active session、祖先链、已读游标、滚动策略广播）：同源 `BroadcastChannel('simo.tab-sync.v1')`；
- **消息态**（message.created/reply.delta/reply.done）：每个标签各自连接服务端 WS，服务端按订阅广播；标签本地按事件 id/消息 id 去重；
- 不用 `localStorage` 轮询做主同步（只可持久化 activeSessionId 等偏好，不能替代事件）。

### 5.2 控制消息

```json
{
  "type": "active_session_changed",
  "tabId": "tab-a",
  "opId": "tab-a:7",
  "at": 1760000000000,
  "sessionId": "s-main",
  "epoch": 7
}
```

- 发送方先本地应用，再广播；接收方应用时不回广播（防环）；
- 冲突：比较 `at`，同毫秒比较 `tabId` 字典序；胜者生效；
- 每个控制域独立 `epoch`/`opId`：active session / ancestor / read cursor 分开，不互相覆盖。

### 5.3 active session

- 切换动作（树/搜索/通知/命令面板）更新 active session，广播 `active_session_changed`；
- 其他标签收到后：切换订阅，清空旧会话的祖先链/本地未读缓存，应用新会话布局；滚动位置按本地策略重置到会话默认（通常底部）；
- 旧标签正在发送/流式：不取消服务端请求；消息仍按 sessionId 归属，不在新会话渲染。

### 5.4 祖先链

- 加载/清空以 active session 为 key 广播 `ancestor_chain_changed`（chain ids + epoch）；
- 接收方仅在 active session 一致时应用；切会话时所有标签清空并广播新 epoch；
- 同一会话重复加载同一祖先：按 chain id 去重，不重复 prepend；
- 失败/413 不广播破坏性状态，只本地提示。

### 5.5 未读/已读

- 每个标签本地维护未读，但已读游标（`readCursor`/已读 id 集）通过控制消息同步；
- 用户在某标签阅读/切到会话时广播 `read_cursor_changed`；
- 接收方只前进不后退（单调 max），不因另一标签隐藏/旧状态把已读回退；
- 未读计数 = 消息总数 - 已读游标之前的消息；不以“标签是否可见”单独判定已读。

## 6. 滚动策略

- **每标签独立**：滚动位置不广播、不强制同步；
- 判断 `atBottom`（距底 ≤ 阈值，如 24px）：
  - 在底部：新消息/流式增长自动跟随；
  - 上翻：不拉底；显示“新消息”提示/未读计数；用户点“回到底部”才滚到底并清零；
- active session 切换：本地按新会话默认位置（底部）或保留该会话上次位置，二选一统一；不得把另一标签的 scrollTop 广播；
- 375：输入区/新消息提示不遮消息；滚动容器无横向滚动。

## 7. 冲突与去重

| 场景 | 规则 |
|---|---|
| active session 同帧切换 | last-write-wins（at + tabId 决胜）；只应用胜者 |
| 祖先链加载/清空 | 按 active session + epoch；后操作覆盖旧链；同祖先 id 去重 |
| 已读游标 | 单调 max；不回退 |
| 同一标签重复点击发送 | 提交时生成一次 `clientMutationId`；同帧只发一次；按钮 loading 禁用 |
| 两标签同时发送 | 各自 `clientMutationId` 不同 → 两条消息都合法；按 message id 渲染，不合并/不重复 |
| 重复 WS 事件 | 按 event id + message id 去重；`reply.delta` 按 messageId+seq 去重/有序 |
| 断线补拉与实时重叠 | 补拉结果按 id 去重；实时事件已存在则跳过 |

> “最后操作生效”只用于控制态；消息是追加事实，不丢弃任一条合法消息。

## 8. 断线重连

1. WS 断开：标签显示重连状态；发送按钮可保留输入但不重复提交；
2. 重连成功：发送 `since` = 最后已处理事件 id/最新游标；
3. 服务端回放缺失事件；若游标过期/无回放 → 取最近快照 + 最新消息列表；
4. 合并：按 message id/event id 去重；`reply.delta` 从对应 seq 续接；
5. 多标签各自重连，互不阻塞；一个标签重连不影响其他标签的实时流；
6. 补拉完成后清除“重连中”，不重复显示历史消息。

## 9. 页面/状态

- 接口失败/断线：三态可读；发送失败保留输入、可重试；
- active session 被其他标签切走：当前标签更新标题/消息/祖先链；未读按规则更新；
- 375：双/三标签仍各自可用；不新增移动端专用交互；
- 控制消息丢失/乱序：以 seq/epoch 丢弃旧消息，不应用过期切换。

## 10. 影响范围

- **AppShell/ChatPage**：active session、订阅切换、多标签控制通道；
- **Message store/WS client**：事件去重、流式 seq、since 补拉；
- **Ancestor chain（FE-007）**：链状态广播/清空；
- **未读/滚动**：已读游标同步、每标签本地滚动策略；
- **后端**：WS 广播到同源多连接、事件 id/游标、快照/补拉；不改业务语义；
- **不影响**：分类/时间轴视觉、Composer 布局、任务执行语义。

## 11. 验收标准 A1–A10

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 双标签消息 | 标签 A 发送 → A/B 都出现且仅一次；B 发送同理 |
| A2 | 三标签流式 | A/B/C 同时打开同 active session；A 发送；三标签 `reply.delta` 文本一致、`reply.done` 一致 |
| A3 | 每标签可发送 | 三个标签分别发送；消息归属/顺序正确；无重复渲染 |
| A4 | active session 同步 | A 切会话 → B/C 跟随；同帧冲突按 last-write-wins；无回跳 |
| A5 | 祖先链同步 | A 加载/清空祖先 → B/C 同 active session 同步；切会话全清；不重复 prepend |
| A6 | 已读/未读 | A 阅读/切会话 → B 未读更新；已读不回退；不重复计未读 |
| A7 | 滚动策略 | 在底部自动跟随；上翻不强制拉底；显示新消息提示；标签 B 滚动不影响 A |
| A8 | 同帧重复/并发发送 | 同标签重复点击只发一次；两标签同时发送两条合法消息；按 id 不重复 |
| A9 | 断网重连 | 断网→恢复：since/最新游标补拉；无重复/无空洞；流式续接正确；多标签互不阻塞 |
| A10 | 375/稳定性 | 双/三标签 1600/1180/375 无溢出/console error；控制态不跨账号/跨 home；无重复消息 |

## 12. 待确认

1. 控制态 `at` 是否用单调序号（避免跨标签时钟差）；建议 opId 单调 + 收到顺序；
2. active session 是否持久化到 localStorage 并作为新标签初始值；
3. 已读游标粒度（会话级/消息 id/seq）；
4. 祖先链是否跨标签共享加载结果，还是各自请求后按链状态同步；
5. 后端事件 id/游标是否已具备；缺失则先补 WS 契约（另立 FE/B 任务）。

---

*本文件只定义 FE-009 spec，不改代码；实现前需确认 WS 事件 id/游标与多连接广播契约。*

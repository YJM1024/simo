# CHG-CONV-005 · 未读与通知收口

状态：**blocked**（2026-11-21；缺产品口径与鉴权模型，不推进实现）
Implements: PRD-SYNC-004、PRD-SYNC-005
Domains: `SYNC`
Owner：产品（口径）/ 前端 + 后端（待口径后）；协调：Lead
design.md：N/A —— 阻塞中，方案不可写（见 `proposal.md` §4）。

> 关联：产品 spec [`../../product/P1-CONV/spec.md#prd-sync-004`](../../product/P1-CONV/spec.md#prd-sync-004)、
> [`#prd-sync-005`](../../product/P1-CONV/spec.md#prd-sync-005)；
> 域计划 [`../../test/P1-CONV/test-plan.md#tc-p1-011`](../../test/P1-CONV/test-plan.md#tc-p1-011)。

## 1. 目标

把 SYNC-004（未读与已读游标）与 SYNC-005（远程访问与通知中心）的**现状、缺口、阻塞条件**写成可审计记录，并作为 P1 收口时唯一的"不能闭环"出口。目标不是实现它们。

## 2. 六类产物状态

| 类别 | 产物 | 状态 | 缺口 |
|---|---|---|---|
| 产品 spec | §4.4 | 有（SYNC-004 partial / SYNC-005 unimplemented） | AC 只有一句话目标，无未读口径、无鉴权/通知模型 |
| CHANGE | 本包 | 有（blocked） | — |
| 前端开发 spec | [`frontend.md`](frontend.md) | 有（现状） | 目标态不可写 |
| 后端开发 spec | [`backend.md`](backend.md) | 有（不存在性证明） | 无 API/表/迁移 |
| 组件 spec | — | N/A | 无组件可定（未读徽标/通知中心 UI 未立项） |
| 任务卡 | [`tasks.md`](tasks.md) | 有（全部 blocked） | 等决策 |
| 测试 spec / 用例 | [`test-plan.md`](test-plan.md) | 有（missing） | 无可执行用例 |
| 执行证据 | [`evidence.md`](evidence.md) | **missing** | 无实现即无证据 |

**结论：`blocked`（≈gap）。SYNC-005 在 P1 保持 `gap`；SYNC-004 保持 `partial`（有实现碎片、无测试与后端）。**

## 3. 现状契约（实查基线）

### 3.1 SYNC-004 未读与已读游标

- 前端：`app.tsx:96` `const [unread, setUnread] = useState(0)`；累加 214（消息数增加且未贴底）；清零 167（切会话）/239（收到更晚 read cursor）/400（滚到底）；展示 656"回到底部 · N 条新消息"。
- 游标：`syncStateRef.readCursor`（`app.tsx:101`）**仅内存**；`tabsync` 的 `read_cursor_changed` 在标签间广播 `at`，收到即更新并清 0（239）。
- **无**：左侧列表未读徽标、跨会话未读汇总、刷新后恢复、后端持久化。
- 后端：`grep unread|read_cursor|lastRead|last_read|notification` 在 `backend/internal` **0 匹配**；无表、无 API。

### 3.2 SYNC-005 远程访问与通知中心

- 现状：`127.0.0.1:8787` 无鉴权、单用户桌面应用（`docs/CONTINUITY.md` §4）；无公网暴露、无设备注册、无通知通道、无通知数据模型。
- 产品 spec 仅一句目标行为；`TREE.md` 标 `unimplemented · [backlog](BACKLOG.md)`。

## 4. 为什么不能在本轮闭环（诚实结论）

1. 未读口径决定数据模型；口径未定就写表/API 会造成返工与误迁移。
2. 远程访问需要鉴权，而鉴权是系统级（SYS）能力，当前 P1 安全基线是本机单用户；贸然加"远程"会改变整个 API 权限面，超出本会话域收口范围，且 P2–P10 已冻结。
3. 通知中心依赖通知渠道/隐私/离线策略，无产品结论。
4. 因此本轮**不伪造**这两个 PRD 的 covered/partial 证据；在 `docs/product/CONV-CLOSURE.md` 中登记为 P1 唯一未闭环项与解锁路径。

## 5. 需求（R）

- **R1** 未读必须有唯一口径（徽标粒度、已读时机、多标签合并规则），且可被测试断言。
- **R2** 若持久化，必须定义表结构、写入点、清理策略、迁移与回滚。
- **R3** 远程访问必须先有身份与授权模型、传输安全、审计；不得以"加个 token"代替。
- **R4** 通知中心必须定义渠道、去重、免打扰、离线补发与隐私边界。

## 6. 验收（A）

- A1 本文件必须明确写出"现状没有任何后端未读/通知实现"，不得用"暂未接入"模糊表述。
- A2 阻塞原因与解锁条件必须可执行（谁、给什么、到哪一步）。
- A3 不得创建"TODO 实现未读"的空任务卡冒充进行中。
- A4 P1 收口报告必须引用本包作为未闭环出口。

## 7. 非目标

- 不实现任何未读/通知/远程能力；不改鉴权；不改产品 AC。
- 不把 SYNC-005 从 backlog 移出。

## 8. 回滚

纯文档；删除目录并撤销链接即回滚。

# CHG-CONV-005 · 未读与通知收口

状态：异常（2026-11-21；缺产品口径与鉴权模型，不推进实现）
Implements: PRD-SYNC-004
Covers: `AC-SYNC-004-01`、`AC-SYNC-004-02`、`AC-SYNC-005-01`
Change: CHG-CONV-005
变更类型：纯文档（只补契约、阻塞条件与证据登记，不改实现与产品 AC 文本）
Domains: `SYNC`
Owner：产品（口径）/ 前端 + 后端（待口径后）；协调：Lead
design.md：N/A：阻塞中，方案不可写（见 `proposal.md` §4）。

> 关联：产品 spec [`../../product/P1-CONV/spec.md#prd-sync-004`](../../product/P1-CONV/spec.md#prd-sync-004)、
> [`#prd-sync-005`](../../product/P1-CONV/spec.md#prd-sync-005)；
> 域计划 [`../../test/P1-CONV/test-plan.md#tc-p1-011`](../../test/P1-CONV/test-plan.md#tc-p1-011)。
判级：变更级
创建日期：2026-11-21
关闭日期：N/A：阻塞条件未解除，收口时补记（见 spec §4）
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

- 判据：`AC-SYNC-004-01` → `scripts/ac/AC-SYNC-004-01.mjs`（脚本存在，本轮未运行）；`AC-SYNC-004-02` → `scripts/ac/AC-SYNC-004-02.mjs`（脚本存在，本轮未运行）。- 后端：`grep unread|read_cursor|lastRead|last_read|notification` 在 `backend/internal` **0 匹配**；无表、无 API。

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

## 9. 状态与错误边界

- 本包 `blocked`：不得以空实现或 TODO 卡冒充进行中；未读接口不存在时前端显示"未知"，不得显示 0（`AC-SYNC-004-02`）。
- 远程访问未实现前，`127.0.0.1:8787` 保持无鉴权本机单用户；不得用单一 token 代替身份与授权模型（`AC-SYNC-005-01`）。判定：人工：验收 Agent 核对 §3.2 与后端 grep 结果，无脚本。
- 通知中心无渠道、去重、免打扰定义，不建数据模型、不建空 API。

## 10. 接口与数据

- 现状：后端 `backend/internal` 对 `unread|read_cursor|lastRead|last_read|notification` 零匹配，无表、无 API。
- 前端只有内存未读计数（`app.tsx:96`）与标签间 `read_cursor_changed` 广播，刷新即失。
- 若后续实现，须先定表结构、写入点、清理策略、迁移与回滚（R2）。

## 11. 待确认

- 未读口径六问（徽标粒度、已读时机、多标签合并、跨会话汇总、刷新恢复、权限）产品未答，是 `TASK-CHG-CONV-005-01` 的阻塞前置。
- 远程访问的身份/授权模型与威胁清单未定，需 Lead 批准跨域变更（`TASK-CHG-CONV-005-05`）。
- 通知中心的渠道、去重、免打扰、离线补发与隐私边界未定（`TASK-CHG-CONV-005-06`）。

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

覆盖范围：`PRD-SYNC-004`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-SYNC-004` | in | `AC-SYNC-004-01`、`AC-SYNC-004-02` | 未读与已读游标；产品状态按 TREE.md 为 implemented，本包因产品口径与鉴权模型缺失停在异常，未新增实现 |

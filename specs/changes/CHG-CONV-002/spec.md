# CHG-CONV-002 · 消息与渲染收口

状态：**partial**（2026-11-21；实现与测试较硬，六类产物刚补齐，组件契约为未签收态）
Implements: PRD-CONV-004、PRD-CONV-007
Domains: `CONV`
Owner：产品（AC 口径）/ 前端（MessageItem、Timeline、App 集成）/ 后端（chat 消息流、all_messages、cards）
design.md：N/A —— 无新方案；本包把既有渲染/加载契约写成可验收描述。

> 关联：产品 spec [`../../product/P1-CONV/spec.md#prd-conv-004`](../../product/P1-CONV/spec.md#prd-conv-004)；
> 域计划 [`../../test/P1-CONV/test-plan.md#tc-p1-004`](../../test/P1-CONV/test-plan.md#tc-p1-004)；
> 组件：[`../../COMP-message-colors/spec.md`](../../COMP-message-colors/spec.md)、[`../../COMP-timeline-groups/spec.md`](../../COMP-timeline-groups/spec.md)、[`../../COMP-timeline-tip/spec.md`](../../COMP-timeline-tip/spec.md)。

## 1. 目标

把"消息流与渲染""祖先消息整级加载"两条 PRD 收敛为：前端渲染/交互契约 + 后端消息与 all-messages 契约 + 逐 AC 证据。**不宣称组件已验收**：三个相关 COMP 中两个是 `spec ready`、一个是 `approved 待实现`，而实现面已有分类标签渲染——这一漂移必须被记录（见 §5）。

## 2. 六类产物状态

| 类别 | 产物 | 状态 | 缺口 |
|---|---|---|---|
| 产品 spec | `P1-CONV/spec.md` §4.2 | 有 | AC 为域级模板句，"消息纯度""时间轴目标尺寸"无独立断言 |
| CHANGE | 本包 | 有 | — |
| 前端开发 spec | [`frontend.md`](frontend.md) | 有 | — |
| 后端开发 spec | [`backend.md`](backend.md) | 有 | all-messages 的游标语义未在产品 AC 中定义 |
| 组件 spec | COMP-message-colors / COMP-timeline-groups / COMP-timeline-tip | **partial** | 状态为 `approved 待实现` / `spec ready`，**均未签收**（`specs/COMP-*/spec.md` 第 2 行） |
| 任务卡 | [`tasks.md`](tasks.md) | 有 | 未派发 |
| 测试 spec / 用例 | [`test-plan.md`](test-plan.md) + TC-P1-004/005 | 有 | 见 §4 |
| 执行证据 | [`evidence.md`](evidence.md) | partial | 引用 2026-11-20 报告，未重跑 |

**结论：组件类未签收 + AC 粒度过粗 → `partial`，不升级 `covered`。**

## 3. 行为契约（实查基线）

### 3.1 CONV-004 消息流与渲染

- 渲染：`MessageItem`（`frontend/src/components/library.tsx:176`）props `message, onCardAction, readOnly`；用户/司墨徽标、分类标签（8 类映射表驱动）、`formatTime`、复制（`navigator.clipboard` + `execCommand` 回退）、fenced/inline code、长文换行、流式光标、`failed` 徽标。
- 卡片：`CardBlock`（`library.tsx:217`）提交/已提交/失败重试/只读禁用；后端 `POST /api/cards/{id}/actions/{actionId}`（`cards.go`）。
- 纯度：`internal=0` 过滤，系统/内部消息不进 UI 流（`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`）；消息编辑被禁（`TestM50MessageEditingDisabled`、`TestM50WebSocketEditRejected`）。
- 分页：`GET /api/sessions/{id}/messages`（`TESTM11MessagePagination`），前端 `listMessages(sessionId, limit=100)`。

### 3.2 CONV-007 祖先消息整级加载

- 后端：`GET /api/sessions/{id}/messages/all`（`M81*`、`M89AllMessagesLimitsAndErrors`），返回祖先链消息、有序、带形状约束。
- 前端：`App.integration` 4 条祖先链用例——去重合并、413 重试成功、403 视为空并记 visited、切会话清链；`getAllSessionMessages`。
- 时间轴：`TimelineGroups`（`library.tsx:432`）+ `Timeline`（355）+ `TimelineTip`（281）；点击/键盘跳转、tooltip、ancestor 透明度、移动端隐藏。
- E2E：CDP 04a–04d 覆盖祖先链加载与时间轴跳转。

## 4. AC 证据与缺口

| AC | 证据 | 状态 | 缺口 |
|---|---|---|---|
| `AC-CONV-004-01` | MessageItem 18/18；E2E 01a；`TestChatPersistsAndFiltersBySession` | 有证据 | 无"消息纯度"独立 AC；渲染分类只在组件级 |
| `AC-CONV-004-02` | failed 徽标、流式光标、只读禁用、卡片重试（MessageItem 用例 6/7/8/9）；413/403 映射见 CONV-007 | 部分 | 空/加载/权限的域级 E1/E2/E3 仍 partial |
| `AC-CONV-007-01` | App.integration 祖先 4 用例；`M81*`；E2E 04a–04d | 有证据 | 真实后端 + 生产部署未验证（"已签未部署"） |
| `AC-CONV-007-02` | 413/无重试、403/空祖先、重复 id 去重、切会话清链 | 部分 | 时间轴点击目标尺寸（≥44px）无断言；长祖先链深度上限（16）未在 UI 断言 |

## 5. 文档漂移（重要）

- `specs/COMP-message-colors/spec.md` 状态为 "approved（…未实现/未改代码）"，但 `MessageItem.test.tsx` 已有分类标签渲染与 8 类映射断言 → **组件 spec 状态滞后于实现**。
- `COMP-timeline-groups` / `COMP-timeline-tip` 为 `spec ready（待确认/未实现）`，而 `TimelineGroups.test.tsx` 8 条已跑通 → **"未实现"表述不成立**。
- 处理：本包不擅自改 COMP 状态（需设计与独立验收签字），在 `CONV-CLOSURE.md` 记录为待办。

## 6. 需求（R）

- **R1** 用户消息与司墨消息必须可区分，分类标签仅在 `category` 存在时出现，缺失不得占位。
- **R2** 复制失败必须有可见降级（不静默），代码块/长文不得溢出。
- **R3** 流式期间必须有可感知状态；失败消息必须可重试且不丢输入。
- **R4** 祖先消息必须整级加载、去重、按时间排序；413/403 必须映射为可恢复/空态，不得空白。
- **R5** 时间轴跳转必须支持键盘与点击，且点击目标尺寸达标（待补断言）。
- **R6** 组件 spec 状态必须与实现一致（当前三者不一致，见 §5）。

## 7. 验收（A）

- A1 六类产物状态逐项写清，组件类未签收必须显式写 partial。
- A2 每条契约可在实查基线（文件:行号）定位。
- A3 每个 AC 至少一条已执行用例或 `missing`。
- A4 漂移项（COMP 状态）必须记录并给出后续任务卡，不得抹平。
- A5 不改 P2–P10，不改代码/测试/部署。

## 8. 非目标

- 不新增消息类型/虚拟滚动/富文本；不改 COMP 状态；不部署验证生产可用性。
- 不把"组件 18/18"当作"产品 AC 全绿"。

## 9. 回滚

纯文档新增与链接追加；删除本目录 + 撤销 TREE/TRACE 链接即回到基线。

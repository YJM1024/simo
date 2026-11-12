# 司墨规格索引（FE / COMP）

> 本目录只放**可验收的功能/组件规格**；产品总览见 [`../docs/product-plan.md`](../docs/product-plan.md)，任务与当前状态见 [`../docs/tasks/STATUS.md`](../docs/tasks/STATUS.md)，验收证据见 [`../docs/tasks/acceptance.md`](../docs/tasks/acceptance.md)。
> 最近更新：2026-11-12。**状态以 spec 文件头为准；实现/验收状态以 `docs/tasks/STATUS.md` 为准**，两者不一致时在下方注明。

## 1. FE（前端功能）

| ID | 主题 | spec 状态 | 实现/验收状态（STATUS 摘要） | 文档 |
|---|---|---|---|---|
| **FE-001** | 前端整体重构 | `draft`（待评审） | 六件套已完成；React 工程/F-07 验收通过，**FE-001 总签字待补测**（真实双击重命名/卡片提交/断线重连） | [spec](FE-001-frontend-rebuild/spec.md) · [design](FE-001-frontend-rebuild/design.md) · [proposal](FE-001-frontend-rebuild/proposal.md) · [tasks](FE-001-frontend-rebuild/tasks.md) · [test-plan](FE-001-frontend-rebuild/test-plan.md) · [evidence](FE-001-frontend-rebuild/evidence.md) |
| **FE-002** | 对话稳定性（断线/重连/消息一致性） | `draft → approved`（Lead 批准执行） | FE-002–005 独立功能验收 **4/6 全通过、2 项部分/未验证**；本项断线重连无重复已验证 | [spec](FE-002-chat-robustness/spec.md) |
| **FE-003** | 会话能力 + 消息/任务/交付物结合 | `approved`（Lead 直接执行） | FE-002–005 批次内；卡片提交+幂等已验证（409 未造出）、交付物打开无样本未验证 | [spec](FE-003-chat-capabilities/spec.md) |
| **FE-004** | 首次使用与空态 | `approved`（Lead 直接执行） | 空库工作台真实 0/空态/错误态通过；loading 未捕获 | [spec](FE-004-first-run-empty/spec.md) |
| **FE-005** | 工作台 | `approved`（Lead 直接执行） | 工作台交付物 `/api/deliverables` total=0 空/错误态通过；打开/预览未验证 | [spec](FE-005-workbench/spec.md) |
| **FE-006** | 对话体验（P1） | `approved`（Lead 决策） | STATUS 未单列实现/验收记录 → **待实现/待验收确认** | [spec](FE-006-chat-experience/spec.md) |
| **FE-007** | 祖先消息按会话整级加载 | **`spec ready`（待 Lead/前端确认；未实现）** | 未实现 | [spec](FE-007-ancestor-messages/spec.md) |
| **FE-008** | 指标仪表盘 | **`ready for review`（待 Lead/前端确认；未实现）** | 未实现 | [spec](FE-008-metrics-dashboard/spec.md) |

## 2. COMP（组件）

| ID | 主题 | spec 状态 | 实现/验收状态（STATUS 摘要） | 文档 |
|---|---|---|---|---|
| **COMP-conversation-panel** | ConversationPanel（会话面板容器） | **`approved`（用户已确认 message-cards 原型，2026-11-12；待前端实现）** | 待前端实现；message-cards 视觉基线已签字 | [spec](COMP-conversation-panel/spec.md) |
| **COMP-timeline-groups** | Timeline 会话分组 + 分类浮层 | **`spec ready`（待 Lead/设计确认；组件库先行，未接页面）** | STATUS 记录组件**已签字通过**（build `mwdmvfow`），**未接首页/未部署**；spec 由 design-scribe 更新中 | [spec](COMP-timeline-groups/spec.md) |
| **COMP-timeline-tip** | TimelineTip（时间轴消息预览） | **`spec ready`（待 Lead/设计确认；未实现）** | STATUS 记录**已签字 + 8787 线上闭环**（build `mwdfw9t5`）；spec 更新待 design-scribe | [spec](COMP-timeline-tip/spec.md) |

## 3. 状态双源说明

- spec 文件头是**需求/验收标准**的状态（draft / spec ready / approved）；
- `docs/tasks/STATUS.md` 是**实现/验收/部署**状态（如 COMP-timeline-groups 已签但未接首页）；
- 二者不一致不代表矛盾：通常是“规格已 ready/approved，实现已签，但 spec 文档尚未回写”。回写由 design-scribe 统一处理，其他角色不抢写 `docs/process`/spec 状态。

## 4. 新增规格约定

1. 目录：`specs/<FE-xxx-topic>/spec.md` 或 `specs/COMP-xxx/spec.md`；
2. 必须含：目标/非目标、需求（MUST/SHOULD/MAY）、验收标准、证据要求、状态/owner；
3. 先更新本索引与 `docs/tasks/STATUS.md` 的链接，再派发实现；
4. 验收证据写 `docs/tasks/acceptance.md`（视觉/功能签字），不要只留在聊天。

# 司墨规格索引

> 状态：**active**（2026-11-20 重构为“产品域 + 变更包 + 测试计划”）
> 本目录不再按“一功能点一 spec”扩张。新增/迭代/修复一律开 `specs/changes/<CHG>/`，先有产品 spec 再开发。
> 当前产品树见 [`../docs/product/TREE.md`](../docs/product/TREE.md)，追溯见 [`../docs/product/TRACEABILITY.md`](../docs/product/TRACEABILITY.md)，缺口见 [`../docs/product/SPEC-GAP.md`](../docs/product/SPEC-GAP.md)。
> **实现/验收状态以 [`../docs/tasks/STATUS.md`](../docs/tasks/STATUS.md) 与 [`../docs/tasks/acceptance.md`](../docs/tasks/acceptance.md) 为准**；本索引只做类型与路径导航。

## 1. 五类目录

| 类型 | 路径 | 作用 | 当前数量 |
|---|---|---|---:|
| 产品域 spec | `specs/product/<P*-*>/spec.md` | 一能力域一份，PRD 作为章节；长期产品事实 | 10 |
| 域测试计划 | `specs/test/<P*-*>/test-plan.md` | 一能力域一份；用例按 PRD 分节 | 10 |
| 变更包 | `specs/changes/<CHG-ID>/` | proposal/spec/design/frontend/backend/tasks/test-plan/evidence | 0 新建（10 历史 FE 映射为 legacy） |
| 组件 spec | `specs/COMP-*/spec.md` | 组件公共契约；不按页面拆 | 5 |
| 模板 | `specs/templates/*.md` | 产品/测试/变更包模板 | 3 |

## 2. 产品域 P1–P10

| 域 | 名称 | 技术域码 | 产品 spec | 测试计划 | PRD 数 | 覆盖状态 |
|---|---|---|---|---|---:|---|
| P1 | 会话与消息 | CONV/SYNC | [spec](product/P1-CONV/spec.md) | [test-plan](test/P1-CONV/test-plan.md) | 12 | 0 covered / 11 partial / 1 gap |
| P2 | 任务与执行 | TASK | [spec](product/P2-TASK/spec.md) | [test-plan](test/P2-TASK/test-plan.md) | 6 | 0 covered / 3 partial / 3 gap |
| P3 | 工作台与视图 | WORK | [spec](product/P3-WORK/spec.md) | [test-plan](test/P3-WORK/test-plan.md) | 5 | 0 covered / 4 partial / 1 gap |
| P4 | 文件与交付物 | FILE | [spec](product/P4-FILE/spec.md) | [test-plan](test/P4-FILE/test-plan.md) | 6 | 0 covered / 2 partial / 4 gap |
| P5 | 记忆 | MEM | [spec](product/P5-MEM/spec.md) | [test-plan](test/P5-MEM/test-plan.md) | 6 | 0 covered / 0 partial / 6 gap |
| P6 | 团队与智能体 | TEAM | [spec](product/P6-TEAM/spec.md) | [test-plan](test/P6-TEAM/test-plan.md) | 6 | 0 covered / 0 partial / 6 gap |
| P7 | 调度 | SCHED | [spec](product/P7-SCHED/spec.md) | [test-plan](test/P7-SCHED/test-plan.md) | 5 | 0 covered / 0 partial / 5 gap |
| P8 | 设置与系统 | SET/SYS | [spec](product/P8-SET/spec.md) | [test-plan](test/P8-SET/test-plan.md) | 12 | 0 covered / 0 partial / 12 gap |
| P9 | 工具与能力 | TOOL | [spec](product/P9-TOOL/spec.md) | [test-plan](test/P9-TOOL/test-plan.md) | 7 | 0 covered / 0 partial / 7 gap |
| P10 | 指标 | METRIC | [spec](product/P10-METRIC/spec.md) | [test-plan](test/P10-METRIC/test-plan.md) | 6 | 0 covered / 2 partial / 4 gap |

> 覆盖状态来自 [`../docs/product/TRACEABILITY.md`](../docs/product/TRACEABILITY.md)；测试计划全部是骨架，证据为 `missing`，因此不因“文件存在”升级为 covered。

## 3. 历史 FE（已归类为 change legacy，不删除；勿新增 FE-xxx）

| 历史目录 | 新 ID | 主题 | 文档 |
|---|---|---|---|
| `FE-001-frontend-rebuild` | `CHG-LEGACY-001` | 前端整体重构 | [spec](FE-001-frontend-rebuild/spec.md) · [test-plan](FE-001-frontend-rebuild/test-plan.md) |
| `FE-002-chat-robustness` | `CHG-LEGACY-002` | 断线/重连/消息一致性 | [spec](FE-002-chat-robustness/spec.md) · [test-plan](FE-002-chat-robustness/test-plan.md) |
| `FE-003-chat-capabilities` | `CHG-LEGACY-003` | 会话能力 + 消息/任务/交付物 | [spec](FE-003-chat-capabilities/spec.md) · [test-plan](FE-003-chat-capabilities/test-plan.md) |
| `FE-004-first-run-empty` | `CHG-LEGACY-004` | 首次使用与空态 | [spec](FE-004-first-run-empty/spec.md) · [test-plan](FE-004-first-run-empty/test-plan.md) |
| `FE-005-workbench` | `CHG-LEGACY-005` | 工作台 | [spec](FE-005-workbench/spec.md) · [test-plan](FE-005-workbench/test-plan.md) |
| `FE-006-chat-experience` | `CHG-LEGACY-006` | 对话体验 | [spec](FE-006-chat-experience/spec.md) · [test-plan](FE-006-chat-experience/test-plan.md) |
| `FE-007-ancestor-messages` | `CHG-LEGACY-007` | 祖先消息整级加载 | [spec](FE-007-ancestor-messages/spec.md) · [test-plan](FE-007-ancestor-messages/test-plan.md) |
| `FE-008-metrics-dashboard` | `CHG-LEGACY-008` | 指标仪表盘 | [spec](FE-008-metrics-dashboard/spec.md) · [test-plan](FE-008-metrics-dashboard/test-plan.md) |
| `FE-009-web-multitab` | `CHG-LEGACY-009` | 多标签同步 | [spec](FE-009-web-multitab/spec.md) · [test-plan](FE-009-web-multitab/test-plan.md) |
| `FE-009-frontend-tests` | `CHG-LEGACY-010` | 前端测试分层（编号冲突，保留全名） | [spec](FE-009-frontend-tests/spec.md) · [test-plan](FE-009-frontend-tests/test-plan.md) |

> 历史 spec 文件头的 `draft/spec ready/approved` 是当时需求状态，不代表现在已实现；实现状态看 STATUS/acceptance。FE-007/008 等曾出现“spec 未实现、STATUS 已签”的滞后，本次不重写历史文件，只在新索引与 TREE 中按证据降级。

## 4. 组件 spec（COMP）

| ID | 主题 | spec | test-plan |
|---|---|---|---|
| `COMP-composer-send-mode` | Composer 发送模式与跨标签同步 | [spec](COMP-composer-send-mode/spec.md) | [test-plan](COMP-composer-send-mode/test-plan.md) |
| `COMP-conversation-panel` | ConversationPanel 容器 | [spec](COMP-conversation-panel/spec.md) | [test-plan](COMP-conversation-panel/test-plan.md) |
| `COMP-message-colors` | 消息角色/分类色彩契约 | [spec](COMP-message-colors/spec.md) | [test-plan](COMP-message-colors/test-plan.md) |
| `COMP-timeline-groups` | Timeline 会话分组 | [spec](COMP-timeline-groups/spec.md) | [test-plan](COMP-timeline-groups/test-plan.md) |
| `COMP-timeline-tip` | TimelineTip 预览 | [spec](COMP-timeline-tip/spec.md) | [test-plan](COMP-timeline-tip/test-plan.md) |

> 只给**公共契约**建 COMP；纯展示小组件不单独建，避免文件爆炸。

## 4.1 模板

| 模板 | 用途 |
|---|---|
| [`templates/product-spec.md`](templates/product-spec.md) | 产品域 spec：目标/非目标/场景/PRD/AC/状态 |
| [`templates/test-plan.md`](templates/test-plan.md) | 域测试计划：用例→PRD、数据/mock、证据、门禁 |
| [`templates/change-package.md`](templates/change-package.md) | 变更包八件套与六类产物检查 |

> `specs/changes/` 当前只有说明，不预建空变更目录；创建时复制模板并替换 `CHG-*`。

## 5. 新增/修改规则

1. **先产品**：在 `specs/product/<域>/spec.md` 加/改 PRD 与 AC；再开 `specs/changes/<CHG>/`。
2. **变更包字段**：proposal、spec（Implements: PRD-xxx）、design、frontend.md、backend.md、tasks.md、test-plan.md、evidence.md；不涉及的写 `N/A + 理由`。
3. **测试用例**加到 `specs/test/<域>/test-plan.md`，不新建“每功能一测试 spec”。
4. **组件**：新增/修改公共契约才建 COMP；页面内小改放变更包 frontend.md。
5. **不新增 FE-xxx**：FE 编号只用于历史归档；新工作用 `CHG-<域>-NNN`。
6. **状态诚实**：`implemented`/`partial`/`unimplemented` 三态；未实现必须标 `unimplemented`；证据缺失写 `missing`。

## 6. 与 check-sdd 的兼容

- `scripts/check-sdd.mjs` 当前只扫描 `specs/<一层目录>/spec.md`；`specs/product/<P*-*>/spec.md` 与 `specs/test/<P*-*>/test-plan.md` 是两层，**不会**被旧检查器误判。
- 不要创建 `specs/product/spec.md`、`specs/test/spec.md` 等“巧合路径”，否则会被当成旧式 spec 检查。
- 旧 FE/COMP 仍受 check-sdd 约束（状态/目标/需求 R/验收 A/非目标 + 同目录 test-plan/evidence），改动时保持 PASS。
- 检查器未来应升级为识别“产品域/测试计划/变更包”三类；升级前以本 README + `SPEC-GAP` 的兼容说明为准。

## 7. 文件数量估算（避免爆炸）

| 类型 | 数量 |
|---|---:|
| 产品域 spec | 10 |
| 域测试计划 | 10 |
| E2E 测试计划 | 1（待建） |
| 组件 spec | 5 现有 + 按公共契约新增 |
| 历史 FE change legacy | 10 |
| 新建完整变更包 | 每个 8 文件 |
| 新建轻量变更包 | 每个 5 文件（proposal/spec/tasks/test-plan/evidence） |
| **长期稳态** | **约 45–60 个文件**（不含归档） |

> 71 个 PRD 不各建文件；产品域 spec 内以章节维护。完成变更移入归档，不留在活跃索引。


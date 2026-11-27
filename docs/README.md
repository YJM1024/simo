# 司墨文档索引

> **项目记录与续接入口：[`CONTINUITY.md`](CONTINUITY.md)**（项目定位、先读顺序、当前真实状态、下一项工作流程、文档当天落盘规则）。
> 产品功能树：[`product/TREE.md`](product/TREE.md) · 规格索引：[`../specs/README.md`](../specs/README.md) · 执行框架：[`framework/README.md`](framework/README.md)（指针；规则正文在独立仓 [MOXIAN.md](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/MOXIAN.md)）。
>
> 本目录是产品、设计、流程、任务与契约文档的统一入口；**文档是事实来源，聊天只用于沟通**。
> 当前阶段与验收状态：先读 [`CONTINUITY.md`](CONTINUITY.md) §4；[`tasks/STATUS.md`](tasks/STATUS.md) 最后更新 2026-11-20，以 CONTINUITY 与执行证据为准。
> 仓库根文件：[`../README.md`](../README.md)（快速开始）、[`../AGENTS.md`](../AGENTS.md)（六维基线）、[`../DESIGN.md`](../DESIGN.md)（视觉唯一事实来源）。

## 0. 先读（按角色）

| 角色 | 入口 |
|---|---|
| 所有人 | [`../README.md`](../README.md) · [`../AGENTS.md`](../AGENTS.md) · [`CONTINUITY.md`](CONTINUITY.md) · [`tasks/STATUS.md`](tasks/STATUS.md) |
| 产品/设计 | [`product-plan.md`](product-plan.md) · [`product/TREE.md`](product/TREE.md) · [`design-core.md`](design-core.md) · [`../specs/README.md`](../specs/README.md) |
| 前端 | [`../frontend/README.md`](../frontend/README.md) · [`frontend-feature-map.md`](frontend-feature-map.md) · [`../DESIGN.md`](../DESIGN.md) |
| 后端 | [`../backend/README.md`](../backend/README.md) · 契约区（§5） |
| 流程/协作 | [`framework/README.md`](framework/README.md) · [`ops-policy.md`](ops-policy.md) · [`GITHUB.md`](GITHUB.md) |
| 验收 | [`tasks/acceptance.md`](tasks/acceptance.md) · [`../frontend/review/REVIEW.md`](../frontend/review/REVIEW.md) |

## 1. 产品

| 文档 | 内容 | 生效日期 | 签字人 |
|---|---|---|---|
| [`product-plan.md`](product-plan.md) | 产品定位、能力边界、里程碑与优先级 | 待补 | 待补 |
| [`product/TREE.md`](product/TREE.md) | **产品功能树**：10 个能力域 P1–P10、L2/L3 功能点、状态与 spec/测试链接 | 待补 | 待补 |
| [`product/TRACEABILITY.md`](product/TRACEABILITY.md) | **PRD → CHANGE → TEST** 追溯矩阵与覆盖状态 | 待补 | 待补 |
| [`product/ID-SPEC.md`](product/ID-SPEC.md) | ID 规范（PRD/AC/CHG/FE/BE/COMP/TEST/TASK/ACC）与旧编号映射 | 待补 | 待补 |
| [`product/SPEC-GAP.md`](product/SPEC-GAP.md) | 规格缺口审计、当前状态、P0 补课顺序与文件规模估算 | 待补 | 待补 |
| [`user-guide.md`](user-guide.md) | 用户手册：三栏、对话、任务、工作台、权限、记忆/团队/视图、卡片 | 待补 | 待补 |
| [`admin-guide.md`](admin-guide.md) | 管理员指南：配置、Key、低 token、`AGENTD_HOME`/`SIMO_HOME`、迁移、备份、排障 | 待补 | 待补 |
| [`release-notes-v1.md`](release-notes-v1.md) | 发布说明：当前能力、测试证据、默认模型、已知限制与 P1 | 待补 | 待补 |
| [`product/capability-catalog.md`](product/capability-catalog.md) | 能力目录：能力域/用户可见入口/边界 | 待补 | 待补 |
| [`product/config-management.md`](product/config-management.md) | 配置管理与环境变量约定 | 待补 | 待补 |
| [`product/metrics-dashboard.md`](product/metrics-dashboard.md) | 指标口径与用量仪表盘 | 待补 | 待补 |
| [`workspace-layout.md`](workspace-layout.md) | 工作区/数据根目录布局 | 待补 | 待补 |
| [`tech-stack.md`](tech-stack.md) | 技术栈与运行拓扑（开发参考） | 待补 | 待补 |

## 2. 设计

| 文档 | 内容 | 生效日期 | 签字人 |
|---|---|---|---|
| [`../DESIGN.md`](../DESIGN.md) | **唯一视觉基线**（暖纸、无渐变、当前尺寸；2026-11-12 裁决） | 2026-11-12 | 待补 |
| [`design-core.md`](design-core.md) | 总体设计：架构、模块边界与关键决策 | 待补 | 待补 |
| [`frontend-feature-map.md`](frontend-feature-map.md) | 前端旧功能 → 新布局映射（M67 重写基线） | 待补 | 待补 |
| [`task-stack-component.md`](task-stack-component.md) | TaskStack 组件规格 | 待补 | 待补 |
| [`session-core-spec.md`](session-core-spec.md) / [`session-spec.md`](session-spec.md) | 会话/消息/迁移/kickoff/确认的产品契约 | 待补 | 待补 |
| [`design-system.md`](design-system.md) | 历史设计系统（M62 暖纸前的 `#F7F8FA`/渐变导航；**本轮不适用**，以 `DESIGN.md` 为准） | 待补 | 待补 |
| [`visual-language.md`](visual-language.md) | 历史视觉语言（同上；仅作历史参考） | 待补 | 待补 |
| [`dsh-alignment.md`](dsh-alignment.md) | 与 DeepSeek Harness 的工具/安全模型对照 | 待补 | 待补 |

> 设计相关规格（FE/COMP）正文在 [`../specs/`](../specs/README.md)，不在本目录重复。

## 3. 流程

| 文档 | 内容 | 生效日期 | 签字人 |
|---|---|---|---|
| [`framework/README.md`](framework/README.md) | 框架已迁至独立仓的指针：仓库链接、版本、获取方式与脚本查找规则；规则正文在 [MOXIAN.md](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/MOXIAN.md) | 待补 | 待补 |
| [TASK-MATRIX.md（独立仓）](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/TASK-MATRIX.md) | 八类任务判级、必做项与阶段出口；角色职责见 [ROLES.md（独立仓）](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/ROLES.md) | 待补 | 待补 |
| [`process/standards/README.md`](process/standards/README.md) | 通用规范仓库内快照：spec 工作流 / Agent 开发规范（canonical 在 `$DSH_HOME/rules/`） | 待补 | 待补 |
| [`process/component-system.md`](process/component-system.md) | 组件系统与画廊门禁规则 | 待补 | 待补 |
| [`process/research/`](process/research/) | 产品/前端/后端/组件库/Spec/测试/Storybook 调研（7 份） | 待补 | 待补 |
| [`process/skills/`](process/skills/) | 可复用技能：backend-contract、component-gallery、frontend-implementation、pitch-writing、product-discovery、release-checklist、spec-driven、testing-strategy | 待补 | 待补 |
| [`ops-policy.md`](ops-policy.md) | 工作区写作用域、临时目录、禁止递归删除等运维红线 | 待补 | 待补 |
| [`GITHUB.md`](GITHUB.md) | GitHub 推送/仓库结构/凭据约定 | 待补 | 待补 |

## 4. 任务

| 文档 | 内容 | 生效日期 | 签字人 |
|---|---|---|---|
| [`tasks/README.md`](tasks/README.md) | 任务系统索引、金字塔、角色与写作用域、状态定义 | 待补 | 待补 |
| [`tasks/STATUS.md`](tasks/STATUS.md) | **当前阶段/已完成/进行中/阻塞/下一步（最高优先级状态文件）** | 待补 | 待补 |
| [`tasks/product.md`](tasks/product.md) | 产品需求金字塔与产品任务（P-*） | 待补 | 待补 |
| [`tasks/frontend.md`](tasks/frontend.md) | 前端设计/组件/页面任务（F-*） | 待补 | 待补 |
| [`tasks/backend.md`](tasks/backend.md) | 后端领域/API/数据任务（B-*） | 待补 | 待补 |
| [`tasks/acceptance.md`](tasks/acceptance.md) | 验收标准、检查表与验收任务（A-*）；含视觉/功能签字证据 | 待补 | 待补 |

## 5. 契约 / 测试计划

| 文档 | 内容 | 生效日期 | 签字人 |
|---|---|---|---|
| [`m1-contract.md`](m1-contract.md) | 基础骨架：单二进制、三栏、流式、持久化、WS | 待补 | 待补 |
| [`m2-contract.md`](m2-contract.md) | 对话核心：模型、撤回、纠偏、并行任务、权限骨架 | 待补 | 待补 |
| [`m3-contract.md`](m3-contract.md) | 记忆地基：条目/作用域/候选/冲突/FTS/只读记忆页 | 待补 | 待补 |
| [`m8-contract.md`](m8-contract.md) | 富文本 + 上传 | 待补 | 待补 |
| [`m9-contract.md`](m9-contract.md) | 权限沙盒 + 工具运行时 | 待补 | 待补 |
| [`m10-contract.md`](m10-contract.md) | 工作流编排 + 逐任务汇报 | 待补 | 待补 |
| [`m11-contract.md`](m11-contract.md) | 文件聚合/分页/会话概览 | 待补 | 待补 |
| [`m12-contract.md`](m12-contract.md) | 文件生成 + 联网（SSRF/审批） | 待补 | 待补 |
| [`m13-contract.md`](m13-contract.md) | 定时任务 | 待补 | 待补 |
| [`m14-contract.md`](m14-contract.md) | 消息分类/会话路径/概览列表化 | 待补 | 待补 |
| [`m15-contract.md`](m15-contract.md) | 消息回复/引用 | 待补 | 待补 |
| [`m18-contract.md`](m18-contract.md) | Spec 驱动执行/概览/执行器 | 待补 | 待补 |
| [`m19-contract.md`](m19-contract.md) | 长程运行时/恢复/预算/审批 TTL | 待补 | 待补 |
| [`m20-contract.md`](m20-contract.md) / [`m20-test-plan.md`](m20-test-plan.md) | 动作层/CLI + 测试计划 | 待补 | 待补 |
| [`m21-memory-contract.md`](m21-memory-contract.md) | 记忆 v0.3（实体/关系/canonical/金字塔/冲突/智能体记忆） | 待补 | 待补 |
| [`m22-recall-contract.md`](m22-recall-contract.md) | 召回 R1（实体/关系下钻/RRF/debug） | 待补 | 待补 |
| [`m23-ui2-contract.md`](m23-ui2-contract.md) | UI-2 深度件（轨迹/卡片/计划/压缩/通知） | 待补 | 待补 |
| [`m24-view-contract.md`](m24-view-contract.md) | 视图 Schema（13 块/版本/校验/渲染） | 待补 | 待补 |
| [`m41-card-contract.md`](m41-card-contract.md) | 交互卡片（Schema/路由/版本/WS/fallback） | 待补 | 待补 |
| [`team-contract.md`](team-contract.md) | 团队 V0/V1/V2 实现契约 | 待补 | 待补 |
| [`testing/EVIDENCE-20261120.md`](testing/EVIDENCE-20261120.md) | 2026-11-20 测试证据：69 单测、11 CDP E2E、覆盖率与 8787 健康检查 | 2026-11-20 | 待补 |

> FE/COMP 规格见 [`../specs/README.md`](../specs/README.md)；评测见 [`../evals/README.md`](../evals/README.md)；安装/升级见 [`../deploy/INSTALL.md`](../deploy/INSTALL.md)。

## 6. 运维与运行手册

| 路径 | 用途 | 状态 | 生效日期 | 签字人 | 备注 |
|---|---|---|---|---|---|
| [`process/RUNBOOK.md`](process/RUNBOOK.md) | 变更执行手册：七个阶段的入口条件、步骤、产出物与门禁 | superseded（由独立仓 [MOXIAN.md](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/MOXIAN.md) 第 5、10、11、13 章取代，历史内容供追溯） | 2026-11-24 | 维护人 Lead（代行） | 批准人：用户，待签 |

> RUNBOOK 首行标注已停止使用，执行以 [MOXIAN.md（独立仓）](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/MOXIAN.md) 为准；取代范围见 [ADOPTION.md（独立仓）](https://github.com/YJM1024/moxian-framework/blob/main/docs/framework/ADOPTION.md)。

## 7. 维护约定

- 新增文档先在本索引登记（分类 + 一句话内容），再在任务/状态中引用；
- 登记行同时写生效日期与签字人，日期取文档生效当天（`YYYY-MM-DD`），签字人取批准该文档的角色；未签字时写 `待补` 并在收口前补齐，补不齐时收口门记 warn 并登记原因与到期日；
- 契约变更必须先改 `docs/m*-contract.md`，再改实现/评测；
- 视觉规范以 `../DESIGN.md` 为唯一来源，历史 `design-system.md`/`visual-language.md` 不再作为当前裁决依据；
- `docs/process/` 由 design-scribe 维护，其他角色只读引用，避免抢写；
- 归档入口见 [`../archive/README.md`](../archive/README.md)：`research/`、`labs/`、`frontend/prototype-v3/`、`design/26-前端原型-v3.md` 已移入；其余 `design/`、`harness/`、`skeleton/` 及 `frontend/prototype/` 保留原位（原因见归档清单）。

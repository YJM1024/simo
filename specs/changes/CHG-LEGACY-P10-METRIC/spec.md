# SPEC · CHG-LEGACY-P10-METRIC

Covers: AC-P10-01、AC-P10-02、AC-P10-03、AC-P10-04（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-METRIC-001, PRD-METRIC-002, PRD-METRIC-003, PRD-METRIC-004, PRD-METRIC-005, PRD-METRIC-006

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：product + frontend + backend
- 日期：2026-11-20
- 产品依据：`specs/product/P10-METRIC/spec.md`
- 追溯：6 个 PRD；覆盖仍为 **0 covered / 5 partial / 1 gap**
Change：CHG-LEGACY-P10-METRIC
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

把 P10 指标 的已存在的实现、接口、组件与执行证据固化为可追溯的 CHANGE 包，并把未实现/未验证项明确留在缺口，而不是用汇总测试数替代逐 PRD 验收。

## 2. 需求与状态

| ID | 需求（产品 spec） | 实现事实 | 产品状态 | 主要证据 |
|---|---|---|---|---|
| PRD-METRIC-001 | 系统性能指标 | 后端 /api/metrics 提供性能数据，前端 MetricsDashboard 展示。 | 已实现 | MetricsDashboard 9/9；E2E 01a/01b。 |
| PRD-METRIC-002 | 任务质量指标 | 质量口径有展示，但真实任务样本/失败分布未形成验收。 | 部分 | MetricsDashboard 9/9 展示部分；无后端质量聚合契约测试。 |
| PRD-METRIC-003 | 延迟 p50/p90 | 延迟卡片展示 p50/p90，数据聚合与边界未验收。 | 部分 | MetricsDashboard 9/9；无真实延迟样本。 |
| PRD-METRIC-004 | 7/30 天窗口 | 指标窗口 group 可切换 7d/30d，组件有 aria-label。 | 已实现 | MetricsDashboard 9/9；E2E 01a/01b。 |
| PRD-METRIC-005 | 明细表与口径 | 表格 wrapper 可聚焦，展示指标明细与口径。 | 已实现 | MetricsDashboard 9/9（含空/错/partial 态）。 |
| PRD-METRIC-006 | 导出/对比/告警 | 无导出、对比或告警入口/API。 | 未实现 | 无实现/无测试，保持 gap。 |

## 3. 验收标准（本包）

| AC | 断言 | 结果 | 证据 |
|---|---|---|---|
| AC-P10-01 | 性能/质量/延迟卡片显示真实指标，不展示假 0。 | PARTIAL | TC-P10-001/002/003；MetricsDashboard 9/9 部分。 |
| AC-P10-02 | 7/30 天窗口切换，空/加载/错误/partialToday 有可见状态。 | PASS（组件级） | TC-P10-004/005；MetricsDashboard 9/9；E2E 01a。 |
| AC-P10-03 | 明细表可键盘聚焦、口径可读、空态不误导。 | PASS（组件级） | TC-P10-005；MetricsDashboard 9/9。 |
| AC-P10-04 | 导出、对比、告警可配置并验证。 | MISSING | TC-P10-006；未实现。 |

> 说明：结果 `PASS（…级）` 只表示该断言的已有测试/证据通过，不等于该 PRD 的所有产品 AC 通过；`MISSING` 表示没有执行证据或未实现。

## 4. 状态、错误与边界

- 本包状态固定为 `historical / partial`，不写 `implemented`/`covered`。
- 成功响应与错误格式沿用既有后端契约；未逐路由验证 400/403/404/500 的矩阵。
- 所有前端测试使用隔离 fixture/mock；E2E 使用隔离 API/临时 home，不是 8787 生产实例。
- 所有后端测试使用临时 `SIMO_HOME`/SQLite；未接触正式数据。
- 未验证项、未实现项在 `evidence.md` 与 `test-plan.md` 中保留 `missing`，不补写“通过”。

## 5. 接口与数据（归档）

主要接口见 [backend.md](backend.md)；前端组件见 [frontend.md](frontend.md)。本包不新增接口、表或迁移。

## 6. 待确认

- 缺失 PRD 是否进入下一条实现型 CHG，由 backlog 优先级决定。
- 现有 domain test-plan 的用例级 pass 是否足以支持某个 AC 升级，需要独立验收，不由本包自签。
- 产品 AC 与工程测试的映射仍需逐项复核；本包只提供基线。

## 7. 链接

- [proposal.md](proposal.md)
- [backend.md](backend.md)
- [frontend.md](frontend.md)
- [tasks.md](tasks.md)
- [test-plan.md](test-plan.md)
- [evidence.md](evidence.md)
- 域测试计划：[P10-METRIC test-plan](../../test/P10-METRIC/test-plan.md)
- 全量前端证据：[`docs/testing/EVIDENCE-20261120.md`](../../../docs/testing/EVIDENCE-20261120.md)

## 非目标

本包是历史归档，只登记既有事实：不新增能力、不改实现与数据、不把未验证项写成已完成；未覆盖的断言保持 `missing`，后续承接见对应的 `CHG-CONV-*` 收口包。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-20：建立本包并首次登记状态。
- 2026-11-20：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

已归档：本包是历史归档包，不再接受变更；产品能力仍按域 spec 的 `covered/partial/gap` 统计，归档不表示完成。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。

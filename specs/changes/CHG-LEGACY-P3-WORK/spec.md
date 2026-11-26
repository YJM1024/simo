# SPEC · CHG-LEGACY-P3-WORK

Covers: AC-P3-01、AC-P3-02、AC-P3-03、AC-P3-04（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-WORK-001, PRD-WORK-002, PRD-WORK-003, PRD-WORK-004, PRD-WORK-005

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：product + frontend + backend
- 日期：2026-11-20
- 产品依据：`specs/product/P3-WORK/spec.md`
- 追溯：5 个 PRD；覆盖仍为 **0 covered / 4 partial / 1 gap**
Change：CHG-LEGACY-P3-WORK
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

把 P3 工作台与视图 的已存在的实现、接口、组件与执行证据固化为可追溯的 CHANGE 包，并把未实现/未验证项明确留在缺口，而不是用汇总测试数替代逐 PRD 验收。

## 2. 需求与状态

| ID | 需求（产品 spec） | 实现事实 | 产品状态 | 主要证据 |
|---|---|---|---|---|
| PRD-WORK-001 | 双页导航与工作台入口 | app.tsx 通过 Segmented 在 chat/workbench 切换，工作台 section 有 aria-label。 | 已实现 | LibraryUtilities 2/2；E2E 01a/01b。 |
| PRD-WORK-002 | 用量与统计卡 | 工作台展示用量/配额/会话/消息统计，数据来自 stats/usage API。 | 已实现 | App.integration 7/7（工作台指标路径）；后端 /api/usage、/api/stats 存在。 |
| PRD-WORK-003 | 每日趋势与最近活动 | MetricsDashboard/WorkbenchChart 展示 7/30 天窗口和每日趋势。 | 已实现 | MetricsDashboard 9/9；App.integration 7/7。 |
| PRD-WORK-004 | 工作台交付物三态 | 右栏/工作台可见交付物并触发下载；空/加载/错误与预览未完整覆盖。 | 部分 | RightPanel 6/6；E2E 07 下载；三态未全测。 |
| PRD-WORK-005 | 自定义视图 13 类块 | views 后端有 list/get/versions/render-state，但前端无自定义视图构建器。 | 未实现 | 无前端/无执行证据，保持 gap。 |

## 3. 验收标准（本包）

| AC | 断言 | 结果 | 证据 |
|---|---|---|---|
| AC-P3-01 | 对话/工作台双页可切换，375 宽无横向溢出且时间轴/侧栏按断点隐藏。 | PASS（组件/E2E） | TC-P3-001；LibraryUtilities 2/2；E2E 01a/01b。 |
| AC-P3-02 | 用量/统计卡/趋势按真实 API 展示，空/错误不显示假 0。 | PARTIAL | TC-P3-002/003；App.integration 7/7；Metrics 9/9；部分。 |
| AC-P3-03 | 工作台交付物空/加载/错误三态与真实下载可用。 | PARTIAL | TC-P3-004；RightPanel 6/6；E2E 07 下载；三态不全。 |
| AC-P3-04 | 自定义视图 13 类块可创建、排序、版本化、渲染。 | MISSING | TC-P3-005；未实现。 |

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
- 域测试计划：[P3-WORK test-plan](../../test/P3-WORK/test-plan.md)
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

## 8. 功能点覆盖

覆盖范围：`PRD-WORK-001`、`PRD-WORK-002`、`PRD-WORK-003`、`PRD-WORK-004`、`PRD-WORK-005`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-WORK-001` | in | `AC-WORK-001-01`、`AC-WORK-001-02` | 双页导航与工作台入口 |
| `PRD-WORK-002` | in | `AC-WORK-002-01`、`AC-WORK-002-02` | 用量与统计卡 |
| `PRD-WORK-003` | in | `AC-WORK-003-01`、`AC-WORK-003-02` | 每日趋势与最近活动 |
| `PRD-WORK-004` | partial | `AC-WORK-004-01` | 交付物与下载可见，空、加载、错误三态与预览未全测 |
| `PRD-WORK-005` | out | — | 未实现：后端 views 有 list、get、versions、render-state，前端没有自定义视图构建器 |

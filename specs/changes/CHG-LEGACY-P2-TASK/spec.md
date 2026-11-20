# SPEC · CHG-LEGACY-P2-TASK

Implements: PRD-TASK-001, PRD-TASK-002, PRD-TASK-003, PRD-TASK-006, PRD-TASK-004, PRD-TASK-005

- 状态：historical / partial（归档，不代表产品完成）
- Owner：product + frontend + backend
- 日期：2026-11-20
- 产品依据：`specs/product/P2-TASK/spec.md`
- 实现状态：3 个部分实现（TASK-001/002/006）、3 个未实现（TASK-003/004/005）
- 追溯状态：**0 covered / 0 partial / 6 gap**（按 `docs/product/TRACEABILITY.md` 当前实际；审计建议 0/3/3 与 TRACE 不一致，未按建议数改写，待统一口径）
- 追溯：6 个 PRD 均有本 CHANGE 包，但六类产物与完整 AC 证据未闭环

## 1. 目标

把 P2 任务与执行 的已存在的实现、接口、组件与执行证据固化为可追溯的 CHANGE 包，并把未实现/未验证项明确留在缺口，而不是用汇总测试数替代逐 PRD 验收。

## 2. 需求与状态

| ID | 需求（产品 spec） | 实现事实 | 实现状态 | 主要证据 |
|---|---|---|---|---|
| PRD-TASK-001 | 任务生命周期与执行组 | tasks 模块提供列表/详情/状态与执行组所需的运行时数据；前端有 OverviewPanel/ExecutionGroup 展示。 | 部分 | RightPanel.test.tsx 6/6（展示层）；E2E 06 任务定位。 |
| PRD-TASK-002 | 任务概览与进度 | 右栏/会话概览显示任务与状态；进度口径和后端聚合未形成产品 AC。 | 部分 | RightPanel.test.tsx 6/6；E2E 06。 |
| PRD-TASK-003 | 长任务异步与开始/结束消息 | 仅有任务执行器/异步运行基础，产品要求的开始/结束消息解耦与恢复未完成。 | 未实现 | 无直接执行证据，保持 gap。 |
| PRD-TASK-006 | 取消·重试·预算·恢复 | 后端存在 cancel/retry/runtime 路由；预算/并发/恢复与前端入口未完成验收。 | 部分 | 无域级执行证据；不以路由存在判通过。 |
| PRD-TASK-004 | 复杂度分级与确认门禁 | C0–C4 规则写入 docs/task-complexity.md，但代码与测试未实现。 | 未实现 | 无实现/无测试，保持 gap。 |
| PRD-TASK-005 | 子会话与任务归属 | 父会话维护 childSessionIds、子会话内建 Task 的规则已定，但未实现。 | 未实现 | 无实现/无测试，保持 gap。 |

## 3. 验收标准（本包）

| AC | 断言 | 结果 | 证据 |
|---|---|---|---|
| AC-P2-01 | 会话概览/右栏能看到任务列表与状态，点击任务能定位并高亮。 | PASS（展示级） | TC-P2-001/002；RightPanel 6/6；E2E 06。 |
| AC-P2-02 | 任务取消、重试、运行时状态有可验证的 API 与前端交互。 | MISSING | TC-P2-004；仅路由/代码存在，无执行证据。 |
| AC-P2-03 | 长任务异步开始/结束消息可解耦、可恢复，且不重复插入消息。 | MISSING | TC-P2-003；未实现。 |
| AC-P2-04 | 复杂度分级触发确认门禁，C0–C4 行为有 AC 与测试。 | MISSING | TC-P2-005；未实现。 |
| AC-P2-05 | 子会话创建后任务归属正确、父会话不误建 Task。 | MISSING | TC-P2-006；未实现。 |

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
- 域测试计划：[P2-TASK test-plan](../../test/P2-TASK/test-plan.md)
- 全量前端证据：[`docs/testing/EVIDENCE-20261120.md`](../../../docs/testing/EVIDENCE-20261120.md)

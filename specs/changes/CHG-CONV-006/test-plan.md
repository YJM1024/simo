# CHG-CONV-006 · 测试计划（变更级）

状态：draft
Change: CHG-CONV-006
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003、PRD-CONV-004、PRD-CONV-005、PRD-CONV-006、PRD-CONV-007、PRD-CONV-008、PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003、PRD-SYNC-004
Covers: AC-CHG-CONV-006-01、AC-CHG-CONV-006-02、AC-CHG-CONV-006-03、AC-CHG-CONV-006-04、AC-CHG-CONV-006-05、AC-CHG-CONV-006-06、AC-CHG-CONV-006-07、AC-CHG-CONV-006-08、AC-CHG-CONV-006-09、AC-CHG-CONV-006-10、AC-CHG-CONV-006-11

## 1. 用例、AC 与证据

本表只登记变更级 AC 的判据入口。33 条域级 AC 的用例在 `specs/test/P1-CONV/test-plan.md`，状态为 pass 32 / partial 1 / blocked 2（`AC-CONV-006-02` conditional，`SYNC-005` 不覆盖）。本轮为文档补登记，未执行下列用例，结果列写 missing。

| 用例 | AC | 测试落点 | 层级 | 期望 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| AC-CHG-CONV-006-01 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-02 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-03 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-04 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-05 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-06 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-07 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-08 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-09 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-10 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |
| AC-CHG-CONV-006-11 | `spec.md` §4 证据锚点 | 单元 / HTTP / 集成 | missing（本轮未复跑） | 全部断言通过，无 fail 与 skip | 代码与用例锚点见 spec.md；域级结果见 `docs/testing/ACCEPT-CONV-9-20261122.md` |  |

## 2. 数据与 mock

沿用域级 test-plan 的夹具：会话树用 15 节点数据集（主会话 75 条、子树 3 条），投影用 `taskLimit=3/50` 两个边界，幂等用例用同一 `clientMutationId` 的双发与重启后重放。前端用例复用 `frontend/src/App.*.test.tsx` 与 `RightPanel.test.tsx` 的既有 mock 上游，不新造厂商接口。

## 3. 层级与接线

单元层覆盖 `frontend/src/app.tsx` 的状态与 `backend/internal/modules/sessions`、`chat` 的包内测试；HTTP 层覆盖归档 409、投影 400/404/304 与 `taskLimit` 边界；集成层覆盖 `App.integration.test.tsx` 的右栏补取与停止定向；真机层引用 `docs/testing/ACCEPT-CONV-9-20261122.md` 的 8787 走查。脚本入口 `scripts/ac/<AC-ID>.mjs` 通过 `scripts/run-ac.mjs` 逐个执行。

## 4. 未覆盖与不跳过声明

`AC-CONV-006-02` 的真实中文输入法保持 conditional，自动化只覆盖组合键与 `isComposing` 分支，不计 pass。真实厂商中断因 403 环境限制不验证。删除会话与子会话移动是产品显式非目标，不建用例。`AC-SYNC-005-01/02` 处于 blocked，不在本包验收面。以上缺项如实记录，不用 skipped 或推断替代通过。

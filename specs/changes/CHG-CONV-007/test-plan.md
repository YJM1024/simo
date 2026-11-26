# CHG-CONV-007 · 测试计划（变更级）

状态：已验收（2026-11-26；验收报告 [`ACCEPT-CONV-007-R5-20261126.md`](../../../docs/testing/ACCEPT-CONV-007-R5-20261126.md)，结论 pass）
Change: CHG-CONV-007
Implements: PRD-CONV-009
Covers: AC-CONV-009-01、AC-CONV-009-02、AC-CONV-009-03、AC-CONV-009-04、AC-CONV-009-05、AC-CONV-009-06、AC-CONV-009-07、AC-CONV-009-08、AC-CONV-009-09、AC-CONV-009-10、AC-CONV-009-11、AC-CONV-009-12、AC-CONV-009-13、AC-CONV-009-14、AC-CONV-009-15、AC-CONV-009-16、AC-CONV-009-17、AC-CONV-009-18、AC-CHG-CONV-007-01、AC-CHG-CONV-007-02、AC-CHG-CONV-007-03、AC-CHG-CONV-007-04、AC-CHG-CONV-007-05、AC-CHG-CONV-007-06、AC-CHG-CONV-007-07、AC-CHG-CONV-007-08

## 1. 用例、AC 与证据

18 条 AC 与 `TC-P1-CONV-037..054` 一一对应，脚本入口为 `scripts/ac/AC-CONV-009-NN.mjs`，18 个脚本均已建成并执行。下表结果列与证据列于 2026-11-26 按实测回填，判定与断言计数以 `specs/changes/CHG-CONV-007/evidence.md` §1 为准，并与 `specs/test/P1-CONV/test-plan.md` §18.2 的 18 条产品判据 pass、断言 367 条对齐。

| 用例 | AC | 测试落点 | 层级 | 期望 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| TC-P1-CONV-037 | `AC-CONV-009-01` | `scripts/ac/AC-CONV-009-01.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（25 条断言） | `evidence.md` E-AC-CONV-009-01-01 |
| TC-P1-CONV-038 | `AC-CONV-009-02` | `scripts/ac/AC-CONV-009-02.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（33 条断言） | `evidence.md` E-AC-CONV-009-02-01 |
| TC-P1-CONV-039 | `AC-CONV-009-03` | `scripts/ac/AC-CONV-009-03.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（16 条断言） | `evidence.md` E-AC-CONV-009-03-01 |
| TC-P1-CONV-040 | `AC-CONV-009-04` | `scripts/ac/AC-CONV-009-04.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（12 条断言） | `evidence.md` E-AC-CONV-009-04-01 |
| TC-P1-CONV-041 | `AC-CONV-009-05` | `scripts/ac/AC-CONV-009-05.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（18 条断言） | `evidence.md` E-AC-CONV-009-05-01 |
| TC-P1-CONV-042 | `AC-CONV-009-06` | `scripts/ac/AC-CONV-009-06.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（12 条断言） | `evidence.md` E-AC-CONV-009-06-01 |
| TC-P1-CONV-043 | `AC-CONV-009-07` | `scripts/ac/AC-CONV-009-07.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（33 条断言） | `evidence.md` E-AC-CONV-009-07-01 |
| TC-P1-CONV-044 | `AC-CONV-009-08` | `scripts/ac/AC-CONV-009-08.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（16 条断言） | `evidence.md` E-AC-CONV-009-08-01 |
| TC-P1-CONV-045 | `AC-CONV-009-09` | `scripts/ac/AC-CONV-009-09.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（15 条断言） | `evidence.md` E-AC-CONV-009-09-01 |
| TC-P1-CONV-046 | `AC-CONV-009-10` | `scripts/ac/AC-CONV-009-10.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（13 条断言） | `evidence.md` E-AC-CONV-009-10-01 |
| TC-P1-CONV-047 | `AC-CONV-009-11` | `scripts/ac/AC-CONV-009-11.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（9 条断言） | `evidence.md` E-AC-CONV-009-11-01 |
| TC-P1-CONV-048 | `AC-CONV-009-12` | `scripts/ac/AC-CONV-009-12.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（18 条断言） | `evidence.md` E-AC-CONV-009-12-01 |
| TC-P1-CONV-049 | `AC-CONV-009-13` | `scripts/ac/AC-CONV-009-13.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（UI 16 条断言；集成层 skip） | `evidence.md` E-AC-CONV-009-13-01 |
| TC-P1-CONV-050 | `AC-CONV-009-14` | `scripts/ac/AC-CONV-009-14.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（17 条断言） | `evidence.md` E-AC-CONV-009-14-01 |
| TC-P1-CONV-051 | `AC-CONV-009-15` | `scripts/ac/AC-CONV-009-15.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（34 条断言） | `evidence.md` E-AC-CONV-009-15-01 |
| TC-P1-CONV-052 | `AC-CONV-009-16` | `scripts/ac/AC-CONV-009-16.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（46 条断言） | `evidence.md` E-AC-CONV-009-16-01 |
| TC-P1-CONV-053 | `AC-CONV-009-17` | `scripts/ac/AC-CONV-009-17.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（17 条断言） | `evidence.md` E-AC-CONV-009-17-01 |
| TC-P1-CONV-054 | `AC-CONV-009-18` | `scripts/ac/AC-CONV-009-18.mjs` | HTTP / 组件 / CDP | 全部断言通过，无 fail 与 skip | pass（17 条断言） | `evidence.md` E-AC-CONV-009-18-01 |

### 1.1 变更级 AC 的覆盖映射（2026-11-26 补登）

8 条变更级 AC 与产品 18 条并列在本包验收面内，判据写在 `specs/changes/CHG-CONV-007/spec.md` §5，断言入口在 `scripts/ac/`，证据行在 `specs/changes/CHG-CONV-007/evidence.md` §1。下表只登记映射，不重复判据正文。

| 变更级 AC | 任务卡 | 判据位置 | 断言脚本 | 证据行 |
| --- | --- | --- | --- | --- |
| `AC-CHG-CONV-007-01` | T07 界面脚本、T08 三档走查 | `spec.md` §5 AC-01（`:84-93`） | `scripts/ac/AC-CHG-CONV-007-01.mjs` | `evidence.md` E-AC-CHG-CONV-007-01-01 |
| `AC-CHG-CONV-007-02` | T02 失败原因落库、T06 接口断言 | `spec.md` §5 AC-02（`:95-104`） | `scripts/ac/AC-CHG-CONV-007-02.mjs` | `evidence.md` E-AC-CHG-CONV-007-02-01 |
| `AC-CHG-CONV-007-03` | T03 取消级联、T06 接口断言 | `spec.md` §5 AC-03（`:106-115`） | `scripts/ac/AC-CHG-CONV-007-03.mjs` | `evidence.md` E-AC-CHG-CONV-007-03-01（pass） |
| `AC-CHG-CONV-007-04` | T06 越权与会话隔离 | `spec.md` §5 AC-04（`:117-126`） | `scripts/ac/AC-CHG-CONV-007-04.mjs` | `evidence.md` E-AC-CHG-CONV-007-04-01 |
| `AC-CHG-CONV-007-05` | T07 界面脚本、T05 抽屉几何 | `spec.md` §5 AC-05（`:128-137`） | `scripts/ac/AC-CHG-CONV-007-05.mjs` | `evidence.md` E-AC-CHG-CONV-007-05-01 |
| `AC-CHG-CONV-007-06` | T07 只读详情与任务图 | `spec.md` §5 AC-06（`:139-148`） | `scripts/ac/AC-CHG-CONV-007-06.mjs` | `evidence.md` E-AC-CHG-CONV-007-06-01 |
| `AC-CHG-CONV-007-07` | T07 汇总卡与筛选一致 | `spec.md` §5 AC-07（`:150-159`） | `scripts/ac/AC-CHG-CONV-007-07.mjs` | `evidence.md` E-AC-CHG-CONV-007-07-01 |
| `AC-CHG-CONV-007-08` | T06 启动上下文与归属 | `spec.md` §5 AC-08（`:161-170`） | `scripts/ac/AC-CHG-CONV-007-08.mjs` | `evidence.md` E-AC-CHG-CONV-007-08-01 |

第 1 节结果列已按 2026-11-26 实测回填：18 条产品判据 pass 18 条、partial 0 条、missing 0 条、blocked 0 条、skip 0 条，断言合计 367 条；8 条变更级 AC 全部 pass、断言合计 193 条。本包 26 条 AC 的判定与断言合计以 `specs/changes/CHG-CONV-007/evidence.md` §1 为准（pass 26 条、partial 0 条、missing 0 条、blocked 0 条、断言 560 条），本次只回填状态与证据行，未重跑任何 AC。

## 2. 数据与 mock

夹具：10 个任务批量 `.tmp/chg-conv-007/batch-10.json`、20 条历史会话 `.tmp/chg-conv-007/context.json`、8 节点任务图与失败下游、三种等待语义的依赖链。`P2-TASK` 与 `P4-FILE` 未就绪时按 `spec.md` §8 风险 1 用接口桩，桩数据路径写进证据。

## 3. 层级与接线

HTTP 组覆盖任务消息字段、归属 403/404、交付物 `size`；单元组件组覆盖任务卡片、右栏三标签、厚卡、详情、任务图；CDP 组覆盖 40/320/280 几何、首行 0–8px、三档断点与截图。三组通过 `scripts/run-ac.mjs` 分组执行，CDP 组排队。

## 4. 未覆盖与不跳过声明

任务执行器与生命周期状态机归 `P2-TASK`，交付物落盘与类型识别归 `P4-FILE`，登录与鉴权模型归 P8，均不在本包实现。真实厂商链路不可用时只验证本地取消与状态投影，并在证据中标注环境限制。以上缺项如实记录，不用 skipped 或推断替代通过。

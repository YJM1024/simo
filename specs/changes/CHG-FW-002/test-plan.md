# CHG-FW-002 · 测试计划（变更级）

状态：进行中
Change: CHG-FW-002
Implements: N/A：框架内部变更，不新增产品功能点
Covers: AC-CHG-FW-002-01、AC-CHG-FW-002-02、AC-CHG-FW-002-03、AC-CHG-FW-002-04、AC-CHG-FW-002-05、AC-CHG-FW-002-06

## 1. 用例、AC 与证据

六条变更级 AC 与 `TC-FW-001..006` 一一对应，判据正文在 `specs/changes/CHG-FW-002/proposal.md` 第 11 节，证据行在 `specs/changes/CHG-FW-002/evidence.md` 第 9 节。结果列按当前实测状态回填：AC-01 为 P0 已完成的归档复核，判 pass；AC-02 至 AC-06 对应的 P1 至 P5 尚未开工，断言脚本与产物未落盘，判 missing 并写解除条件，结论以 `evidence.md` 为准。

| 用例 | AC | 测试落点 | 层级 | 期望 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| TC-FW-001 | `AC-CHG-FW-002-01` | `node scripts/check-archive.mjs`，加人工核对 `archive/v1.7.5/INDEX.md` 与四件、回滚包 | 文档结构 / 人工 | 12 份副本 sha256 与复制前一致，变更包四件齐，回滚步骤可照着执行 | pass | `evidence.md` E-AC-CHG-FW-002-01-01 |
| TC-FW-002 | `AC-CHG-FW-002-02` | `node scripts/check-rule-fields.mjs`、`node scripts/check-mapping.mjs` | 文档结构 / 人工 | 九章规则位 158 个且不超过 180，每条六字段，285 条旧规则 285/285 有归宿且映射可回放 | missing | `evidence.md` E-AC-CHG-FW-002-02-01 |
| TC-FW-003 | `AC-CHG-FW-002-03` | `node scripts/check-sdd.mjs --self-test`，加人工抽查两份附属文件 | 文档结构 / 人工 | 附属文件不再出现旧章号，门禁与规则位双向可查，self-test 15 passed、0 failed | missing | `evidence.md` E-AC-CHG-FW-002-03-01 |
| TC-FW-004 | `AC-CHG-FW-002-04` | 模板计数命令、`node scripts/check-rule-fields.mjs --templates`，加人工核对适配层 | 文档结构 / 人工 | 模板 35 份齐，适配层 2 份与新七角色、新档位逐项一致 | missing | `evidence.md` E-AC-CHG-FW-002-04-01 |
| TC-FW-005 | `AC-CHG-FW-002-05` | 各门禁 `--self-test` 连跑三次，`node scripts/verify-all.mjs` 的 L0 结构层 | 脚本 / 集成 | 每个门禁有 pass 与 fail 夹具，同一夹具连续三次同结果，汇总接入 L0 层 | missing | `evidence.md` E-AC-CHG-FW-002-05-01 |
| TC-FW-006 | `AC-CHG-FW-002-06` | 人工：按 `DESIGN.md` 第 8.4 节做 R1、R2 两轮验收，做一次回滚演练，核对签字 | 人工 | R1、R2 两轮判 pass，回滚演练一次成功，归档索引与验收报告签字齐 | missing | `evidence.md` E-AC-CHG-FW-002-06-01 |

判定值只取 `pass`、`partial`、`missing`、`blocked` 四值；`missing` 必须同时给原因码、解除条件、责任人与到期日，明细写在 `evidence.md` 第 9 节对应行。

## 2. 数据与 mock

夹具：归档 12 份副本与复制前 sha256 清单（`archive/v1.7.5/INDEX.md`）、285 行旧规则映射表、158 个规则位清单、35 份模板清单、七角色与新档位对照表。本包只读文档与脚本，不访问网络、数据库与浏览器，不需要接口桩或 mock 数据；门禁 pass/fail 夹具由各脚本自带的 `--self-test` 生成在临时目录，跑完即弃。

## 3. 层级与接线

文档结构层由 `scripts/check-gates.mjs --stage exit --change CHG-FW-002` 汇总，覆盖结构、任务表列、证据索引与功能点覆盖；脚本层由各门禁的 `--self-test` 与 `scripts/verify-all.mjs` 的 L0 层验证，要求同一夹具连跑三次同结果；人工层是 P5 的两轮验收与回滚演练，由验收角色独立签字。三层的执行入口与结果写入 `evidence.md` 第 9 节，判定值不跨层合并。

## 4. 未覆盖与不跳过声明

P1 至 P5 尚未开工，AC-02 至 AC-06 对应的九章改写、附属文件对齐、模板与适配层、门禁脚本、两轮验收与回滚演练都没有产物，这五条按 missing 登记并要求复跑，不用 skipped 或推断替代通过。AC-01 只覆盖 P0 的归档与回滚包骨架，完成判据里的交付前 11/12 复核限制写在 `evidence.md` 第 2 节，不并入本条判 pass 的依据。

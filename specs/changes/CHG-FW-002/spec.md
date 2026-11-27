# SPEC · CHG-FW-002

状态：进行中
Implements: N/A：本包只改执行框架文档、模板、门禁脚本与归档，不新增产品功能点
Covers：AC-CHG-FW-002-01、AC-CHG-FW-002-02、AC-CHG-FW-002-03、AC-CHG-FW-002-04、AC-CHG-FW-002-05、AC-CHG-FW-002-06
Change：CHG-FW-002
变更类型：重构
Owner：撰写员
变更号：CHG-FW-002
负责人：撰写员
创建日期：2026-11-27
关闭日期：N/A：未关闭，P5 两轮验收通过后填写

首部之外的口径写在 `change.md`：冻结时间 2026-11-27 03:56（Asia/Shanghai），冻结人用户（Lead 代签），依据 `docs/framework/v2/JOURNAL.md`。本文件只写契约表路径与 AC 判据，不复制契约取值（MXV2-5-11）。

## 1. 目标

把现行执行框架总册从旧章号体改写为九章体，规则位收为 158 个且不超过 180，285 条旧规则逐条给出归宿并可回放；附属文件、模板与适配层改指新章号；门禁脚本补齐规则表、`--rule` 单跑与 pass/fail 夹具；旧版 12 份正本按原样归档并给出可执行的回滚包。

## 2. 非目标

- 不改产品功能、后端接口、前端页面与运行时行为，本包不产生用户可见功能。
- 不改 `specs/contract/` 下的契约表，285 行迁移映射的正文留在 `docs/framework/v2/DESIGN.md` 与 `docs/framework/v2/IMPLEMENT.md`。
- 不删旧文档，旧章号正文只做归档，不做就地删除。

## 3. 需求

框架需求点为 `V2-01` 至 `V2-08`，落在 `change.md` 第 4 节与 `DESIGN.md` 第 3 节；本包不新增产品功能点，`Implements` 写 N/A 并给理由。

六个流程点 `P-REQ-01` 至 `P-REQ-06` 对应六个批次 P0 至 P5，每个流程点带一条验收点 `P-ACC-01` 至 `P-ACC-06`，验收点编号与第 4 节的六条 AC 一一对应；链式对应见 `change.md` 第 11.3 节。点文件按 `points/` 目录实际落盘范围登记，当前只有一条链落盘，八列登记见 `LINKAGE.md`。

## 4. 验收（AC 判据）

| AC | 判据（可观察） | 判定轨道 | 判定人 |
|---|---|---|---|
| `AC-CHG-FW-002-01` | 归档 12 份副本与复制前 sha256 一致；变更包四件齐；回滚包可照着执行 | 脚本：`node scripts/check-archive.mjs` 与 `Get-FileHash`；人工：逐份核对四件与回滚包步骤 | 验收员 |
| `AC-CHG-FW-002-02` | 九章规则位 158 个且不超过 180；每条六字段；285 条旧规则全部有归宿且映射可回放 | 脚本：`node scripts/check-rule-fields.mjs`、`node scripts/check-mapping.mjs`；人工：抽查 5 条旧号回查归宿 | 验收员 |
| `AC-CHG-FW-002-03` | 附属文件不再出现旧章号；门禁与规则位双向可查 | 脚本：`node scripts/check-sdd.mjs --self-test`；人工：抽查两份附属文件的章号引用 | 验收员 |
| `AC-CHG-FW-002-04` | 模板 35 份齐；适配层 2 份与新七角色、新档位一致 | 脚本：模板计数命令、`node scripts/check-rule-fields.mjs --templates`；人工：核对适配层角色名与档位 | 验收员 |
| `AC-CHG-FW-002-05` | 每个门禁有 pass/fail 夹具；同一夹具连续三次同结果；汇总接入 L0 层 | 脚本：各门禁 `--self-test`、`node scripts/verify-all.mjs`；人工：核对三次输出是否同值 | 验收员 |
| `AC-CHG-FW-002-06` | R1、R2 两轮验收通过；回滚演练一次成功；归档索引与验收报告签字 | 人工：两轮验收报告与 `docs/framework/v2/ROLLBACK-DRILL.md` 逐项核对 | 验收员 |

判定值只取 `pass`、`partial`、`missing`、`blocked` 四值；未取到证据写 `missing` 并给原因码与解除条件，不写「通过」代过。

## 5. 状态与错误边界

- 门禁脚本退出码非零即判失败，不得把失败改判为跳过；`skipped` 不计入通过。
- 同一夹具连续三次结果不一致时按 `missing` 处理，并记 R-BUILD 或 R-ENV 原因码。
- 归档副本只看 sha256 是否与复制前一致；不一致时按 `R-SCRIPT` 之外的码登记并写明复算命令。
- 证据索引缺行、路径打不开、生成时间超过 7 天，均按门禁 error 处理，不改判为 warning。

## 6. 接口与数据：契约表位置

- 契约表：N/A：本次不改 `specs/contract/` 下的契约表，285 行迁移映射与 158 个规则位的正文在 `docs/framework/v2/DESIGN.md` 第 7 节与 `docs/framework/v2/IMPLEMENT.md` 第 4 节，索引见 `change.md` 第 5 节。
- 变更单号：无，本包未开契约变更单。

五列产物与载体：

| 列 | 内容 | 载体 |
|---|---|---|
| 产品 | N/A：本次不新增产品功能点，V2-01 至 V2-08 是框架需求点 | `change.md` 第 4 节与 `DESIGN.md` 第 3 节 |
| 设计 | 九章结构、规则五类归位与门禁设计 | `DESIGN.md` 第 6 节与第 7 节 |
| 前端 | N/A：本次无前端页面、组件或交互交付物 | `change.md` 第 5 节 |
| 后端 | N/A：本次无接口、数据、迁移与错误码改动 | `change.md` 第 5 节 |
| 测试 | 每批退出条件与两轮验收 | `IMPLEMENT.md` 第 8 节、`evidence.md`、`test-plan.md` |

## 7. 待确认

- `U-12`：门禁扩展规则里 `MX-G-14` 至 `MX-G-19`、`MX-G-21` 至 `MX-G-25` 尚未脚本化，当前按人工判据执行，登记见 `GATES.md` 第 4 节与第 6 节。
- `DESIGN.md` 第 8.4 节的 R1、R2 验收与回滚演练列为 P5 另办项，不随冻结一次完成。
- P1 开工条件：用户确认 P0 交付，当前等待 Lead 转达。

## 8. 链接

关联：`change.md`、`proposal.md`、`tasks.md`、`evidence.md`、`test-plan.md`、`LINKAGE.md`、`docs/framework/v2/DESIGN.md`、`docs/framework/v2/IMPLEMENT.md`、`docs/framework/v2/JOURNAL.md`、`docs/framework/v2/ROLLBACK.md`。

## 9. 功能点覆盖

覆盖范围：无功能点（框架内部变更，只改总册、模板、门禁脚本与归档，不涉及产品功能点）

本包不对应 `docs/product/TREE.md` 里的任何功能点，覆盖范围按无功能点声明；实现产物是文档、模板、脚本与归档，验收走 `test-plan.md` 与本文件第 4 节的六条 AC。

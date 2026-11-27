# TASKS · CHG-FW-002

本文件按 P0 至 P5 六个批次列任务。P0 已执行完毕，P1 至 P5 待办。执行口径以用户 2026-11-27 的指令为准：变更包建 `proposal.md`、`change.md`、`tasks.md`、`evidence.md` 四件；归档索引 `INDEX.md` 提前到 P0 完成，P5 只复核不重建。

状态：实现中。

## 任务表

| ID | 任务 | Owner | 执行人 | 写作用域 | 依赖 | AC | 证据 | 状态 | 档位 | 禁止项 | 评审人 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P0 | 基线快照、变更包与回滚包骨架 | 撰写员 | v2-p0-snapshot（Lead 委派） | `docs/framework/archive/`、`specs/changes/CHG-FW-002/`、`docs/framework/v2/ROLLBACK.md` | 无 | `CHG-FW-002` · `P-REQ-01` · `AC-CHG-FW-002-01`：12 份副本 sha256 与现行一致，四件齐，回滚包可执行 | `evidence.md` 第 2 至 3 节、`archive/v1.7.5/INDEX.md` | 实现中 | high | 不改 12 份正文；不删文件；不跑 Git 写操作 | 验收员 |
| P1 | 总册改写为九章 | 撰写员 | 框架架构（Lead 代行） | `docs/framework/MOXIAN.md`、`VERSION`、`v2/CHANGELOG.md`、`v2/JOURNAL.md` | P0 | `CHG-FW-002` · `P-REQ-02` · `AC-CHG-FW-002-02`：九章计数 12/14/16/24/18/18/22/18/16，158 位且不超过 180，285 条全部有归宿 | `check-rule-fields.mjs` 与 `check-mapping.mjs` 输出 | 草稿 | high | 不改产品与运行时；不删旧文档 | 验收员 |
| P2 | 附属文件对齐九章 | 撰写员 | 框架架构（Lead 代行） | `GATES.md`、`TASK-MATRIX.md`、`ROLES.md`、`EFFORT.md`、`domains/` 四份、`README.md`、`ADOPTION.md`、`v2/BACKLOG.md` | P1 | `CHG-FW-002` · `P-REQ-03` · `AC-CHG-FW-002-03`：各文件不再出现旧章号，门禁与规则位双向可查 | `check-sdd.mjs --self-test` 15 passed | 草稿 | high | 不改脚本判据；不超出 9 个门禁脚本清单 | 验收员 |
| P3 | 模板与适配层对齐 | 撰写员 | 模板与适配（Lead 代行） | `docs/framework/templates/` 35 份、`docs/framework/adapters/` 2 份 | P1、P2 | `CHG-FW-002` · `P-REQ-04` · `AC-CHG-FW-002-04`：模板 35 份齐，改写 6 份字段与六字段规则一致 | 计数命令与 `check-rule-fields.mjs --templates` | 草稿 | high | 不改模板既有语义；不新增第 36 份模板 | 验收员 |
| P4 | 脚本与门禁 | 撰写员 | 门禁脚本（Lead 代行） | `scripts/check-*.mjs` 9 个、4 个新增脚本、`scripts/verify-all.mjs` | P1 至 P3 | `CHG-FW-002` · `P-REQ-05` · `AC-CHG-FW-002-05`：每个门禁有 pass/fail 夹具，连续三次同结果 | 各 self-test 输出 | 草稿 | high | 不改总册条文；不跳过 self-test | 验收员 |
| P5 | 归档复核与两轮验收 | 验收员 | 验收角色（独立） | `archive/v1.7.5/INDEX.md`、`accept/ACCEPT-FW-V2-20261127.md`、`v2/ROLLBACK-DRILL.md`、`JOURNAL.md` 收尾 | P0 至 P4 | `CHG-FW-002` · `P-REQ-06` · `AC-CHG-FW-002-06`：R1、R2 通过，回滚演练一次成功，签字齐全 | 验收报告与演练记录 | 草稿 | max | 不由实现者代签；不跳过回滚演练 | 用户 |

## P0 明细

| 步骤 | 产出 | 分钟（预计） | 验收 | 状态 |
|---|---|---|---|---|
| T0-1 | `specs/changes/CHG-FW-002/` 四件 | 10 | 四份文件存在且含需求点、变更号、冻结哈希、六批与待办 | done |
| T0-2 | 12 份副本，保持 `domains/` 子目录 | 5 | `Get-ChildItem` 递归计数为 12 | done |
| T0-3 | 复制前后逐份 sha256 记录 | 10 | 12/12 一致，无不一致项 | done |
| T0-4 | `archive/v1.7.5/INDEX.md` | 5 | 九列主表 12 行，一行一份 | done |
| T0-5 | `docs/framework/v2/ROLLBACK.md` | 10 | 回滚步骤、复验命令、责任人可照着执行 | done |
| T0-6 | 越界检查 | 5 | 新增文件全部落在允许写作用域，未改 12 份正文 | done |

## P1 至 P5 步骤拆分

每步预计不超过 20 分钟，步骤号从 S1 连续编；到点无进展时先写检查点再停下报卡点，不续跑。

| 步骤 | 所属卡 | 产出 | 分钟（预计） | 验收 | 状态 |
|---|---|---|---|---|---|
| S1 | P1 | 九章总册初稿与 `VERSION` | 20 | 章数与 158 位自查 | 未开始 |
| S2 | P1 | 285 行映射表与两份脚本输出 | 20 | 158 rules、0 error、285/285 | 未开始 |
| S3 | P2 | 附属文件改指新章号 | 20 | `check-sdd.mjs --self-test` 15 passed | 未开始 |
| S4 | P2 | `README.md`、`ADOPTION.md`、`BACKLOG.md` 同步 | 15 | 旧章号检索为零 | 未开始 |
| S5 | P3 | 31 份模板处置为 35 份 | 20 | 模板计数 35 | 未开始 |
| S6 | P3 | 适配层 2 份改七角色与新档位 | 15 | 角色名与档位逐项核对 | 未开始 |
| S7 | P4 | 9 个既有脚本加 RULES 与 `--rule` | 20 | 各脚本 `--self-test` 通过 | 未开始 |
| S8 | P4 | 4 个新增脚本与 `verify-all.mjs` 的 L0 层 | 20 | 同一夹具连续三次同结果 | 未开始 |
| S9 | P5 | 归档复核与两轮验收 | 20 | 12/12、R1 与 R2 判 pass | 未开始 |
| S10 | P5 | 回滚演练与签字 | 20 | 演练一次成功、签字齐全 | 未开始 |

## 待办清单

P1 待办：重写 `MOXIAN.md` 为九章，建 `VERSION` 写 `v2.0.0`，建 `v2/CHANGELOG.md` 首条记九章与 285 条迁移，`JOURNAL.md` 追加 P1 条目；跑 `check-rule-fields.mjs` 与 `check-mapping.mjs`，输出 158 rules、0 error 与 285/285 mapped。

P2 待办：`GATES.md` 收为索引页并保留 9 个脚本清单、24 条人工判据与 `U-12` 未决项；`TASK-MATRIX.md`、`ROLES.md`、`EFFORT.md` 与四份域文件改指新章号；`README.md`、`ADOPTION.md`、`v2/BACKLOG.md` 同步；跑 `check-sdd.mjs --self-test`，期望 15 passed、0 failed。

P3 待办：模板 31 份按 `IMPLEMENT.md` 第 2.2 节处置为保留 25、改写 6、新增 4，合计 35；适配层 2 份改七角色与新档位；跑模板计数与字段检查。

P4 待办：9 个既有脚本按第 5.5 节改法施工，新增 `check-rule-fields.mjs`、`check-mapping.mjs`、`check-archive.mjs`、`check-evidence.mjs` 四类脚本，`verify-all.mjs` 加 L0 结构层；每个门禁准备 pass/fail 夹具，连续三次同结果。

P5 待办：复核 `INDEX.md` 与 12 份副本，跑 `check-archive.mjs` 得 12/12；按 `DESIGN.md` 第 8.4 节做 R1、R2 两轮验收，抽样 5 条旧号回查；建 `accept/ACCEPT-FW-V2-20261127.md`，完成 `ROLLBACK-DRILL.md` 演练并签字；`JOURNAL.md` 收尾。

## 拆分要求

一个任务只承担一个批次的验收能力，写作用域不重叠，P1 与 P2 有依赖所以串行，P3 依赖 P1、P2 的字段口径，P4 依赖前三批的正文与模板，P5 只做复核与签字。每个任务都写了 owner、scope、AC、证据与依赖，缺一项不派发。P0 的归档与变更包由 Lead 委派子智能体执行，验收由未参与执行的验收角色在 P5 一并复核；实现者不得给自己的产出签字。

## 状态

- 取值：任务卡与流程点只取 `草稿` / `已冻结` / `实现中` / `通过` 四值（MXV2-2-11）；旧词 `todo`、`in_progress`、`blocked`、`review`、`done` 不再使用，步骤表的执行状态只记该步做没做完，不进入四值。
- P0 为 `实现中`，表示执行完成、独立验收未做；P1 至 P5 为 `草稿`，任务卡尚未派发，对应流程点处于 `已冻结`。
- `通过` 只在验收员签字后写入，当前没有任务卡使用该值。
- 阻塞原因/等待谁：无。P1 开工条件是用户确认 P0 交付，当前等待 Lead 转达。

# 变更包 CHG-MOXIAN-V16 · 墨线框架 v1.6 冻结与发布

版本：v1.0，2026-11-25。
变更号：CHG-MOXIAN-V16
标题：墨线框架 v1.6 冻结与发布变更包
状态：已验收
负责人：文档
判级：变更级
变更类型：纯文档
创建日期：2026-11-25
关闭日期：2026-11-25
Change：CHG-MOXIAN-V16
Implements: N/A：本变更为框架版本冻结的治理变更，不改变产品行为，无对应产品 PRD
Covers：AC-CHG-MOXIAN-V16-01、AC-CHG-MOXIAN-V16-02、AC-CHG-MOXIAN-V16-03、AC-CHG-MOXIAN-V16-04、AC-CHG-MOXIAN-V16-05、AC-CHG-MOXIAN-V16-06、AC-CHG-MOXIAN-V16-07、AC-CHG-MOXIAN-V16-08、AC-CHG-MOXIAN-V16-09、AC-CHG-MOXIAN-V16-10、AC-CHG-MOXIAN-V16-11、AC-CHG-MOXIAN-V16-12
Owner：文档

## 1 头部

| 字段 | 值 |
|---|---|
| 变更号 | `CHG-MOXIAN-V16` |
| 标题 | 墨线框架 v1.6 冻结与发布变更包 |
| 状态 | 已验收 |
| 负责人 | 文档 |
| 判级 | 变更级；主类型纯文档，理由是本变更只新建与回写文档，不改脚本、接口与运行代码 |
| 创建日期 | 2026-11-25 |
| 关闭日期 | 2026-11-25 |
| 验收人 | 验收 |

v1.6 的验收签字、覆盖率复判与脚本自检在 2026-11-25 已完成。本包是这次真实完成的变更的登记载体，不重新实施框架改动，只把已有事实整理成门禁可读的字段与证据。

## 2 目标与背景

要解决的问题是框架自身的变更没有变更包，导致验收报告 KD-02 所指的证据索引为空、KD-06 所指的走查记录没有真实门禁运行可以对照。现状可核对为三处：`specs/changes/` 下没有 `CHG-MOXIAN-V16`；`docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md:124` 的 KD-02 仍写「框架自身的证据索引未落地」；全仓 `scripts/check-gates.mjs` 本轮为 127 error、322 warning。

预期结果有四项，与第 4 节 AC 对应。第一，四份变更文件与测试计划落盘，字段齐全且门禁可读。第二，12 条 AC 各有真实证据行，证据路径可以打开。第三，本包在 `check-gates --change CHG-MOXIAN-V16` 下 MX-G-08 至 MX-G-12 全部 PASS。第四，验收报告两行补上关闭说明，KD-02 关闭、KD-06 转由本包实跑记录承接。

## 3 范围与非目标

包含改动三句。第一，新建 `specs/changes/CHG-MOXIAN-V16/` 下的 `proposal.md`、`spec.md`、`tasks.md`、`evidence.md` 与 `logs/`。第二，新建 `specs/test/FRAMEWORK/test-plan.md`。第三，只改 `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` 的 KD-02 行末与 KD-06 行末。

明确不做三件事。第一，不改 `docs/framework/` 下的框架正文、版本行、模板与脚本。第二，不修复九个既有变更包的 127 个 error，也不改动它们的任何文件。第三，不执行 git 命令，不推送、不打 tag、不改远端仓库。

## 4 影响面

受影响的 REQ 点为 `N/A：框架治理变更不落在产品需求点树上，不新增或修改产品功能点`。长期 spec 的回写范围只有验收报告第 5 节两行，框架正文以已验收状态引用，不改写。AC 清单如下，判定值与证据指向逐条给出。

| AC 编号 | 判定项 | 判定值 | 证据 | 判据 |
|---|---|---|---|---|
| AC-CHG-MOXIAN-V16-01 | v1.6 版本收口：10 个文件版本行为 v1.6，审核事件模板为 v1.1 | 11/11 命中 | `logs/versions.log` | 人工: 按日志逐行核对文件与版本值 |
| AC-CHG-MOXIAN-V16-02 | 统计口径：284 条规则、41 个角色、68 条现行门禁、21 道门禁四处文本一致 | 4/4 一致 | `logs/stats.log` | 人工: 核对 MOXIAN、GATES 的原文行 |
| AC-CHG-MOXIAN-V16-03 | 角色编号 `MX-R-01` 至 `MX-R-41` 连续且唯一 | 41/41 | `logs/roles.log` | 人工: 核对编号集合无缺号无重号 |
| AC-CHG-MOXIAN-V16-04 | 模板目录 29 个 `.md` 与附录 A 表 A-1 的 29 个模板路径一一对应，本轮新增 12 份全部存在 | 29/29 + 12/12 | `logs/templates.log`、`logs/templates-close.log` | 人工: 核对目录、表 A-1 与新增清单 |
| AC-CHG-MOXIAN-V16-05 | 本轮新增 7 条门禁、3 条契约、5 条证据形式、2 个角色均可检索到定义行 | 17/17 | `logs/new-items.log` | 人工: 按编号逐条 grep 定义行 |
| AC-CHG-MOXIAN-V16-06 | 验收报告判 pass，签字人 `mx-accept-v16c`，日期 2026-11-25 | 3/3 | `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md:156,162` | 人工: 核对签字表与验收意见 |
| AC-CHG-MOXIAN-V16-07 | 25 任务覆盖率三轮复判为 175/175，pass 175、partial 0 | 175/175 | `docs/framework/accept/STRESS-RERUN-25-20261125.md:3,63` | 人工: 核对首段结论与第 3 节汇总表 |
| AC-CHG-MOXIAN-V16-08 | 矩阵覆盖率门重跑为 66/66、门禁引用 96/96、末行 PASS | 66/66 + 96/96 | `logs/matrix.log` | 人工: 核对脚本末行与汇总行 |
| AC-CHG-MOXIAN-V16-09 | 契约门重跑为 7/7、0 failed、末行 PASS | 7/7 | `logs/contract.log` | 人工: 核对脚本末行 |
| AC-CHG-MOXIAN-V16-10 | 六脚本与性能脚本自检全部退出 0；断言实测 gates 12、trace 11、spec-language 8、contract 14、incremental-coverage 14、evidence 14，合计 73，性能 34，总 107 | 7/7 命令 EXIT=0 | `logs/self-tests.log`、`logs/self-tests-close.log` | 人工: 核对命令退出码与末行断言数 |
| AC-CHG-MOXIAN-V16-11 | 本包结构门禁 MX-G-08 至 MX-G-13 全 PASS，本包 error 为 0；全仓 error 未因本包增加，kd-01 修复后为 0（127→62→0 归因见 E-11-03） | 6/6 PASS + 本包 0 error | `logs/struct-change.log`、`logs/struct-full.log`、`logs/attribution-127-62-0.log` | 人工: 核对本包六项 PASS 与全仓末行 |
| AC-CHG-MOXIAN-V16-12 | 发布事实：`VERSION` 为 v1.6，`main` 为 `9f8edeb` | 2/2 | `moxian-framework/VERSION`、`moxian-framework/.git/refs/heads/main` | 人工: 核对文件内容与提交哈希一致性 |

## 5 五列契约索引

本变更不涉及产品、设计、前端与后端四列的契约；测试列落在新建的 `specs/test/FRAMEWORK/test-plan.md`。五列逐列登记如下，不适用项写理由。

| 列 | 产出文件与冻结版本 | 说明 |
|---|---|---|
| 契约表 | `N/A：框架治理变更无外部接口契约，无需建 specs/contract/FRAMEWORK/contract.md` | 不新增契约项 |
| 产品 | `N/A：不改变产品行为，无产品 spec 增量` | 框架治理 |
| 设计 | `N/A：无界面与视觉产出，无设计 spec 增量` | 框架治理 |
| 前端 | `N/A：无前端代码与组件改动` | 框架治理 |
| 后端 | `N/A：无后端路由、字段与错误码改动` | 框架治理 |
| 测试 | `specs/test/FRAMEWORK/test-plan.md`，v1.0，2026-11-25 | 12 条用例映射 12 条 AC |

## 6 任务卡清单

四张卡覆盖变更包、测试计划、门禁复跑与报告回写。owner 与验收签字人分列，卡内 scope 与禁止项见 `tasks.md` 的同一张表。

| 卡号 | owner | scope | AC | 证据 | 推理档位 | 状态 |
|---|---|---|---|---|---|---|
| TASK-CHG-MOXIAN-V16-01 | 文档 | `specs/changes/CHG-MOXIAN-V16/proposal.md`、`spec.md` | AC-CHG-MOXIAN-V16-01 至 -05 | `logs/versions.log` 等五份日志 | `high` | 已通过 |
| TASK-CHG-MOXIAN-V16-02 | 文档 | `specs/test/FRAMEWORK/test-plan.md` | AC-CHG-MOXIAN-V16-06 至 -07 | 验收报告与压力复判报告 | `high` | 已通过 |
| TASK-CHG-MOXIAN-V16-03 | 测试 | `specs/changes/CHG-MOXIAN-V16/logs/` | AC-CHG-MOXIAN-V16-08 至 -11 | `logs/matrix.log` 等六份日志 | `low` | 已通过 |
| TASK-CHG-MOXIAN-V16-04 | 文档 | `specs/changes/CHG-MOXIAN-V16/evidence.md`、`docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` | AC-CHG-MOXIAN-V16-06、-12 | 证据索引与两行回写 | `high` | 已通过 |

## 7 证据索引

完整 15 列登记表在 `specs/changes/CHG-MOXIAN-V16/evidence.md`，本节给出汇总指针。15 条证据均为 2026-11-25 本机实跑或真实文件核对，没有 `missing` 行。

| 类型 | 路径 | 对应 AC | 复跑命令 |
|---|---|---|---|
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/versions.log` | AC-CHG-MOXIAN-V16-01 | `Select-String -Path docs\framework\*.md -Pattern '^(版本\|状态)：'` |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/stats.log` | AC-CHG-MOXIAN-V16-02 | `Select-String -Path docs\framework\MOXIAN.md,docs\framework\GATES.md -Pattern '284 条\|68 条\|二十一道'` |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/roles.log` | AC-CHG-MOXIAN-V16-03 | `& $NODE -e "统计 ROLES.md 中 MX-R 编号"` |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/templates.log` | AC-CHG-MOXIAN-V16-04 | `Get-ChildItem docs\framework\templates\*.md` |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/new-items.log` | AC-CHG-MOXIAN-V16-05 | `Select-String` 按 17 个编号逐条检索 |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/matrix.log` | AC-CHG-MOXIAN-V16-08 | `& $NODE scripts\check-matrix-coverage.mjs` |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/contract.log` | AC-CHG-MOXIAN-V16-09 | `& $NODE scripts\check-contract.mjs` |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/self-tests.log` | AC-CHG-MOXIAN-V16-10 | 七个脚本各跑一次 `--self-test` |
| 集成日志 | `specs/changes/CHG-MOXIAN-V16/logs/struct-change.log` | AC-CHG-MOXIAN-V16-11 | `& $NODE scripts\check-gates.mjs --change CHG-MOXIAN-V16` |
| 人工记录 | `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md:156` | AC-CHG-MOXIAN-V16-06 | 人工核对签字表 |
| 人工记录 | `moxian-framework/VERSION` | AC-CHG-MOXIAN-V16-12 | `Get-Content moxian-framework\VERSION` |

## 8 风险与依赖

风险 R1（已关闭）：任务书口径写 30 份，复核确认其为输入口径错误。`docs/framework/templates/` 实测 29 个 `.md`，`MOXIAN.md` 表 A-1 的 29 个路径与目录双向无差集，验收报告正文只写 29 份、没有 30 份字样（`logs/templates-close.log`）。结论是不缺模板、不补建，以 29 为唯一有效口径。承接人：文档。

风险 R2（已关闭）：全仓结构门禁的基线为 127 个 error、322 个 warning，本包通过不等于全仓通过。kd-01 在 14:50–14:59 修复九个既有包后清零到 0，127→62→0 的归因见 `logs/attribution-127-62-0.log`；本包仍分别登记 `--change` 与全仓两条结果。承接人：各既有包 owner。

依赖：验收报告与压力复判报告必须先于本包存在，当前两份文件均已签署或落盘；七个检查脚本与 Node v24.21.0 是本机运行条件；`moxian-framework/` 副本是发布事实的本地依据，远端仓库未在本轮访问。

## 9 状态流转记录

| 时间 | 从 | 到 | 推进人 | 依据 |
|---|---|---|---|---|
| 2026-11-25 | 无 | 草稿 | 文档 | proposal 与 spec 同批建立，编号 `CHG-MOXIAN-V16` |
| 2026-11-25 | 草稿 | 进行中 | 文档 | 四份文件与测试计划落盘，门禁复跑开始 |
| 2026-11-25 | 进行中 | 已验收 | 验收 | 本包 MX-G-08 至 MX-G-12 全 PASS，12 条 AC 均有证据行 |

## 10 收口

漂移检查六组对照的结论如下。文件与字段组：四份文件、12 条 AC、4 张任务卡与 15 条证据一致。编号组：AC 编号从 -01 连续到 -12，任务卡从 -01 连续到 -04。链组：`Covers`、§4 AC 表、测试计划、证据表四处编号一致。版本组：框架 11 个文件的版本落点与验收报告第 1 节表一致。证据组：15 条证据的路径在本机可打开，生成时间均为 2026-11-25。状态组：四张卡与变更包状态一致，未出现未登记的状态词。

AC 与证据对账：AC 12 条，pass 12，未验证 0，证据 15 条（12 条 AC 各至少 1 条，AC-11 三条，AC-12 两条）。长期 spec 回写补丁 2 行、1 个文件。关闭结论：本包以已验收状态关闭，验收由 `验收` 子智能体复核，用户批准；KD-02 与 KD-06 两行按第 3 节范围回写，不改签字与结论。

# 任务卡 CHG-MOXIAN-V16 · 墨线框架 v1.6 冻结与发布

版本：v1.0，2026-11-25。
所属变更：`CHG-MOXIAN-V16`（Change 字段同值）。
状态：已验收。

## 1 任务卡总表

| 卡号 | owner | 执行人 | scope | AC | 证据 | 推理档位 | 状态 | 依赖 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|---|
| TASK-CHG-MOXIAN-V16-01 | 文档 | kd-06-real-run | `specs/changes/CHG-MOXIAN-V16/proposal.md`、`spec.md` | AC-CHG-MOXIAN-V16-01 至 -05 | `logs/versions.log`、`logs/stats.log`、`logs/roles.log`、`logs/templates.log`、`logs/new-items.log` | `high` | 已通过 | 验收报告与框架正文已落盘 | 验收 | 不改框架正文、版本行与模板；不写未实测的模板份数 |
| TASK-CHG-MOXIAN-V16-02 | 文档 | kd-06-real-run | `specs/changes/CHG-MOXIAN-V16/evidence.md`、`specs/test/FRAMEWORK/test-plan.md` | AC-CHG-MOXIAN-V16-06、-07 | `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md`、`docs/framework/accept/STRESS-RERUN-25-20261125.md` | `high` | 已通过 | 任务卡 01 的编号与 AC 表冻结 | 验收 | 不改验收结论与签字；不把走查改写成实跑 |
| TASK-CHG-MOXIAN-V16-03 | 测试 | kd-06-real-run | `specs/changes/CHG-MOXIAN-V16/logs/` | AC-CHG-MOXIAN-V16-08 至 -11 | `logs/matrix.log`、`logs/contract.log`、`logs/self-tests.log`、`logs/struct-change.log`、`logs/struct-full.log` | `low` | 已通过 | 七个检查脚本与 Node v24.21.0 可用 | 验收 | 不修既有包、不改脚本、不隐藏全仓 127 error |
| TASK-CHG-MOXIAN-V16-04 | 文档 | kd-06-real-run | `specs/changes/CHG-MOXIAN-V16/evidence.md`、`docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` | AC-CHG-MOXIAN-V16-06、-12 | `moxian-framework/VERSION`、`moxian-framework/.git/refs/heads/main`、报告第 5 节两行 | `high` | 已通过 | 本包门禁 PASS、证据索引 15 行齐备 | 验收 | 只改 KD-02 与 KD-06 行末；不动签字、其它行与 git |

## 2 卡 01：变更包与事实登记

所属变更 `CHG-MOXIAN-V16`，REQ 为 `N/A：框架治理变更不落产品需求点树`，CT 为 `N/A：无契约表改动`。允许范围是 proposal 与 spec 两份文件，禁止项是改动框架正文、版本行、模板与本轮未跑过的数字。验收标准是两份文件节数齐全、头部 11 个字段齐全、12 条 AC 每条有判定值、证据指向与人工判据。证据为五份事实日志，状态从进行中推进到已通过，签字由 `验收` 复核。

步骤有三步。第一步写入提案与十节 spec，第二步采集版本行、统计口径、角色、模板与新增编号五份日志，第三步按日志回填判定值并把差异写进风险节。完成判据是 `check-gates --change CHG-MOXIAN-V16` 的 MX-G-09 与 MX-G-10 均 PASS。交接物是两份文件与五份日志路径。

## 3 卡 02：测试计划与覆盖率映射

所属变更 `CHG-MOXIAN-V16`，REQ 同上，CT 为 `N/A：无契约表改动`。允许范围是 `specs/changes/CHG-MOXIAN-V16/evidence.md` 与 `specs/test/FRAMEWORK/test-plan.md`，禁止项是改动验收报告结论、签字与压力复判原文。验收标准是 12 条 `TC-FW` 用例逐条映射 12 条 AC，五列为用例、AC、判定值、证据、通道，`check-evidence --test-plan` 解析出 12 条 AC 且覆盖并集为 12。证据为验收报告与压力复判报告的原文行，状态已通过。

步骤有三步。第一步写用例表并给每条用例编号，第二步把证据编号与 15 行证据索引对齐，第三步跑证据门禁并按模板修格式。完成判据是证据门禁 PASS 且没有 error。交接物是测试计划与证据索引的对齐表。

## 4 卡 03：门禁与脚本自检复跑

所属变更 `CHG-MOXIAN-V16`，REQ 同上，CT 为 `N/A：无契约表改动`。允许范围是 `logs/` 下的命令输出，禁止项是修既有包、改脚本、把全仓 127 error 写成 0。验收标准是矩阵 66/66、契约 7/7、七次自检退出 0 且断言合计 107、本包结构门禁五项 PASS、全仓结果与基线 127 error 一致。证据为五份日志，状态已通过。

步骤有四步。第一步跑矩阵与契约两个脚本并保存末行，第二步逐条跑七个 `--self-test` 并记录退出码与断言数，第三步跑本包结构门禁与全仓结构门禁，第四步跑追溯门禁。完成判据是四份日志都有末行结论且路径可在证据表中打开。交接物是 logs 目录与命令清单。

## 5 卡 04：证据索引与报告回写

所属变更 `CHG-MOXIAN-V16`，REQ 同上，CT 为 `N/A：无契约表改动`。允许范围是 `evidence.md` 与验收报告第 5 节 KD-02、KD-06 两行，禁止项是改验收意见、签字、其它行，以及执行 git 命令。验收标准是 15 列 15 行证据全部 pass、路径存在、生成时间在 7 天内，报告两行只在行末追加指定文字且 diff 只涉及两行。证据是 `VERSION` 与 `.git/refs/heads/main` 文件内容、两行回写后的原文。状态已通过。

步骤有三步。第一步把 15 条证据写成 15 列表，第二步按证据编号回填测试计划的证据列，第三步改报告两行并用逐行 diff 核对。完成判据是 `check-evidence --test-plan` PASS、`check-gates --change` PASS、报告改动行为 2。交接物是 evidence.md 与报告 diff。

## 6 并行与串行

卡 01 与卡 03 可并行，卡 01 的事实日志不依赖门禁运行；卡 02 依赖卡 01 的 AC 编号；卡 04 依赖卡 01 至 03 全部结果。同一文件只由一个执行人写入，证据索引与报告回写都收敛在卡 04，避免并发覆盖。

## 7 省略项

前端开发 spec、后端开发 spec、组件 spec 三项省略，理由是本变更为纯文档治理变更，没有界面、接口与组件产出。任务卡模板中的 CT 字段写 `N/A` 并给出理由，不省略字段本身。

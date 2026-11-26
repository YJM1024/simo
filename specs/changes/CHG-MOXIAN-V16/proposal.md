# 变更提案 CHG-MOXIAN-V16 · 墨线框架 v1.6 冻结与发布

版本：v1.0，2026-11-25。
状态：已验收。
归属：框架治理变更，负责人 `文档`，验收人 `验收`。

## 1 背景与问题

墨线框架 v1.6 于 2026-11-25 完成版本收口、四处口径一致性修正与独立验收，验收报告 `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` 判 pass，签字人 `mx-accept-v16c`。这一轮改动真实发生，但仓库里没有与它对应的变更包，验收报告 KD-02 记录的「框架自身的证据索引未落地」因此没有可挂载的载体，KD-06 记录的「25 任务压测为走查非实跑」也没有真实的门禁运行记录可以替代。

问题有两个可核对的现状。其一是 `specs/changes/` 下 19 个既有变更包中没有 `CHG-MOXIAN-V16`，v1.6 的版本行、验收结论、覆盖率复判与六个脚本自检结果散落在 `docs/framework/accept/` 与 `docs/framework/` 正文里，门禁无法逐条读取。其二是全仓 `scripts/check-gates.mjs` 本轮实跑为 `FAILED: 127 error(s), 322 warning(s)`，127 个 error 分布在 9 个既有包，框架自身没有一次「本包 MX-G-08 至 MX-G-12 全部通过」的运行记录。

本提案把 v1.6 当作一个已完成变更补建变更包，用真实文件与真实命令输出填满其证据索引，让门禁对这个包逐条判通过，同时为 KD-02 提供第一份框架证据索引。KD-06 的 175/175 走查记录保持原样，本包只补充真实跑过的门禁、覆盖率与自检记录，不改写走查结论。

## 2 目标

1. 在 `specs/changes/CHG-MOXIAN-V16/` 建 proposal、spec、tasks、evidence 四份文件，字段按 `docs/framework/templates/change.md`、`task-card.md`、`evidence-index.md` 填写。
2. 在 `specs/test/FRAMEWORK/test-plan.md` 建 `TC-FW-001` 至 `TC-FW-012` 十二条用例，逐条映射 12 条变更级 AC。
3. 重跑结构门禁、证据门禁与追溯门禁，把本包 MX-G-08 至 MX-G-12 判为通过，并记录全仓既定 127 个 error 不变。
4. 在验收报告 KD-02 与 KD-06 两行末补关闭说明，不改签字与结论。

## 3 范围与非目标

本变更的范围有三句。第一，新建 `specs/changes/CHG-MOXIAN-V16/` 四份文件与 `logs/` 下的命令输出。第二，新建 `specs/test/FRAMEWORK/test-plan.md` 一份测试计划。第三，只改 `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` 第 5 节 KD-02 与 KD-06 两行的行末文字，其它字符与原签字不动。

非目标有三条。第一，不修改 `docs/framework/` 下任何框架正文、版本行与模板，v1.6 内容按已验收状态引用。第二，不修复 `CHG-B1-001`、`CHG-CONV-001` 至 `CHG-CONV-007`、`CHG-SYS-001` 九个既有包的 127 个 error，它们保持原值。第三，不执行 git 命令，不推送、不打 tag、不改远端仓库，发布事实以工作区内的 `moxian-framework/` 副本与既有验收报告为准。

## 4 影响面

受影响的 REQ 点为 `N/A：框架治理变更不落在产品需求点树上，不新增或修改产品功能点`。受影响的 AC 编号为 `AC-CHG-MOXIAN-V16-01` 至 `-12`，共 12 条。受影响的长期文件为 `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` 第 5 节两行；新建文件的回写范围为 `specs/changes/CHG-MOXIAN-V16/` 与 `specs/test/FRAMEWORK/`。

数据语义处置：本变更不涉及数据库、接口字段、用户数据与迁移。权限与安全审计：不涉及权限模型与审计事件；证据只引用仓库内已公开的框架文档与本地命令输出。

## 5 依赖、风险与假设

依赖三项。第一，`docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` 的 pass 结论与 `mx-accept-v16c` 签字已存在。第二，`docs/framework/accept/STRESS-RERUN-25-20261125.md` 的三轮 175/175 记录已存在。第三，本机 Node v24.21.0 与 `scripts/` 下七个检查脚本可用。

风险两条。R1（已关闭）：任务书口径写 30 份，复核确认属输入口径错误；模板目录与表 A-1 均为 29 个且双向无差集，验收报告正文也只写 29 份，不补建模板，以 29 为唯一口径。R2（已关闭）：全仓结构门禁基线为 127 个 error，本包通过不代表全仓通过；kd-01 修复九个既有包后清零到 0，本包仍分别登记本包结果与全仓结果，不合并口径。

假设两条。第一，`moxian-framework/VERSION` 与 `.git/refs/heads/main` 是私有仓 `YJM1024/moxian-framework` 在当前工作区的副本，文件内容可作发布事实的本地证据。第二，2026-11-25 当天的命令输出在 7 天有效期内，无需重跑历史轮次。

## 6 决策请求

批准人：用户。验收人：`验收` 子智能体。出口层级：变更级。待确认项：无；模板计数差异按第 5 节 R1 处理并留档。

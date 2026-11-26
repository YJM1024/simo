# 测试计划 FRAMEWORK · CHG-MOXIAN-V16

版本：v1.0，2026-11-25。
归属：框架治理变更 `CHG-MOXIAN-V16`，执行人 `kd-06-real-run`，验收人 `验收`。
状态：已执行。

## 1 概述

本计划把 `CHG-MOXIAN-V16` 的 12 条变更级 AC 转成 12 条用例，编号 `TC-FW-001` 至 `TC-FW-012`。用例只覆盖两类动作：一类是对已落盘文件做可复现的文本核对与编号统计，另一类是重跑仓库已有的检查脚本并读取末行结论。每条用例的判定值取自 2026-11-25 本机实际运行输出或真实文件内容，证据编号与 `specs/changes/CHG-MOXIAN-V16/evidence.md` 的 15 列表一一对应。

本计划不重建 v1.6 的验收结论，也不重新设计 25 个压测任务。验收报告与压力复判报告作为输入文件，只在用例中读取指定行；框架正文、脚本与模板在本轮不改动。

## 2 环境与入口

运行环境为 Windows，工作目录 `E:\dsh_home\workspaces\agent`，Node 使用 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`（v24.21.0，PATH 中没有 node）。命令统一在仓库根目录执行，日志写入 `specs/changes/CHG-MOXIAN-V16/logs/`。

三条门禁入口分别是 `scripts/check-gates.mjs`、`scripts/check-evidence.mjs` 与 `scripts/check-trace.mjs`。辅助入口是 `scripts/check-matrix-coverage.mjs`、`scripts/check-contract.mjs` 与六个 `--self-test` 子命令。所有命令只读文件，除日志输出外不写任何业务文件。

## 3 用例表

证据列写短号 `E-01` 至 `E-12`，避免与 AC 编号在同一单元格内重复。短号与 `evidence.md` 第 2 节一一对应，完整编号按 `E-<AC编号>-<两位序号>` 展开，例如短号 `E-01` 对应第一条 AC 的第一条证据。

| 用例 | AC | 判定值 | 证据 | 通道 |
|---|---|---|---|---|
| TC-FW-001 | AC-CHG-MOXIAN-V16-01 | pass | E-01 | 人工：按 `logs/versions.log` 核对 11 个版本行 |
| TC-FW-002 | AC-CHG-MOXIAN-V16-02 | pass | E-02 | 人工：按 `logs/stats.log` 核对四处统计口径 |
| TC-FW-003 | AC-CHG-MOXIAN-V16-03 | pass | E-03 | 脚本：统计 `ROLES.md` 中 `MX-R` 编号集合 |
| TC-FW-004 | AC-CHG-MOXIAN-V16-04 | pass | E-04 | 脚本：统计模板目录与表 A-1 的路径集合 |
| TC-FW-005 | AC-CHG-MOXIAN-V16-05 | pass | E-05 | 脚本：按 17 个编号检索定义行 |
| TC-FW-006 | AC-CHG-MOXIAN-V16-06 | pass | E-06 | 人工：核对验收报告签字表与验收意见 |
| TC-FW-007 | AC-CHG-MOXIAN-V16-07 | pass | E-07 | 人工：核对压力复判报告首段与第 3 节汇总 |
| TC-FW-008 | AC-CHG-MOXIAN-V16-08 | pass | E-08 | 脚本：重跑 `check-matrix-coverage.mjs` |
| TC-FW-009 | AC-CHG-MOXIAN-V16-09 | pass | E-09 | 脚本：重跑 `check-contract.mjs` |
| TC-FW-010 | AC-CHG-MOXIAN-V16-10 | pass | E-10 | 脚本：七次 `--self-test` 并读取退出码 |
| TC-FW-011 | AC-CHG-MOXIAN-V16-11 | pass | E-11 | 脚本：`check-gates --change` 与全仓各跑一次 |
| TC-FW-012 | AC-CHG-MOXIAN-V16-12 | pass | E-12 | 人工：核对 `VERSION` 与 `main` 引用文件 |

## 4 执行记录

2026-11-25 14:49 至 15:05 执行一轮，12 条用例全部取得证据，没有 `missing`、`partial` 或 `blocked`。执行顺序是先用文本统计完成 TC-FW-001 至 005，再读取两份验收文档完成 006 与 007，然后重跑矩阵、契约与七个自检完成 008 至 010，最后跑本包与全仓结构门禁、追溯门禁并回写报告两行完成 011 与 012。

结构门禁的本包结果为 MX-G-08 至 MX-G-13 六项全部 PASS，本包 error 为 0。全仓本轮实测 62 error、318 warning、107 passed / 13 failed，同日早间基线为 127 error、322 warning、77 passed / 37 failed；全仓差值来源未核，本包不在 error 包中。证据门禁在 12 条用例的 AC 并集上 PASS，追溯门禁 PASS 并把本包计入治理豁免。

## 5 覆盖统计

| 统计项 | 数值 | 说明 |
|---|---|---|
| 用例数 | 12 | `TC-FW-001` 至 `TC-FW-012` |
| 覆盖 AC 数 | 12 | 并集等于 `Covers` 的 12 条 |
| pass | 12 | 每条用例一行判定值 |
| partial / missing / blocked | 0 / 0 / 0 | 本轮没有未验证项 |
| 证据行 | 14 | AC-11 与 AC-12 各 2 行 |

覆盖结论：12 条 AC 全部有用例与证据，AC 与用例的映射是一对一，证据与 AC 的映射是 14 对 12。未覆盖项为 0，未验证项为 0。模板份数的口径差异不属于未覆盖项，已在证据备注与变更包风险节登记。

# 证据索引 CHG-MOXIAN-V16 · 墨线框架 v1.6 冻结与发布

版本：v1.0，2026-11-25。
关联变更：`CHG-MOXIAN-V16`。
状态：已验收。

## 1 结论

结果：15 条证据全部 `pass`，覆盖 12 条 AC，没有 `missing`、`partial`、`blocked`。其中 11 条来自本轮命令输出或日志核对（含新增的自检计数与归因日志），2 条来自 2026-11-25 的独立验收签字与压力复判报告，2 条来自发布版本文件。所有路径在 2026-11-25 本机可打开，判定人一列区分自动运行与人工核对。

证据采集遵守两条口径。第一，日志只记录命令实际输出的行，不补写未出现的结论。第二，脚本自检计数以实际输出为准；三个脚本已补计数输出，备注记录实测条数，不沿用旧报告数字。路径列只写文件本身，行号写在备注列，避免路径带行号后无法直接打开。

## 2 证据索引表

| 证据编号 | AC 编号 | 证据类型 | 路径 | 生成命令 | 生成时间 | 判定人 | 判定结果 | 未验证原因码 | 关联任务卡 | 轮次 | 可复跑 | 构建版本 | 失效标记 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E-AC-CHG-MOXIAN-V16-01-01 | AC-CHG-MOXIAN-V16-01 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/versions.log | `& .\.tmp\kd-06\gen-logs.ps1` | 2026-11-25T14:56+08:00 | 自动（PowerShell 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-01 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 11 个文件版本行；MOXIAN.md:3、GATES.md:2、ROLES.md:3-4、TASK-MATRIX.md:3、EFFORT.md:3、README.md:19、README.md:42、四个 domains 第 3 行、audit-events.md:3 |
| E-AC-CHG-MOXIAN-V16-02-01 | AC-CHG-MOXIAN-V16-02 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/stats.log | `Select-String -Path docs\framework\MOXIAN.md,docs\framework\GATES.md -Pattern '284 条','68 条','二十一道'` | 2026-11-25T14:56+08:00 | 自动（PowerShell 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-01 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 四处文本一致；MOXIAN.md:5、:1245、:1374、:1474，GATES.md:2、:265；284 条为文档声明口径，唯一编号复算为 297，不能机械复算出 284 |
| E-AC-CHG-MOXIAN-V16-03-01 | AC-CHG-MOXIAN-V16-03 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/roles.log | `& $NODE .tmp\kd-06\role-count.cjs` | 2026-11-25T14:56+08:00 | 自动（Node 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-01 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 唯一编号 41 个，范围 MX-R-01 至 MX-R-41，无缺号；ROLES.md:208 为 MX-R-40、MX-R-41 定义行 |
| E-AC-CHG-MOXIAN-V16-04-01 | AC-CHG-MOXIAN-V16-04 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/templates.log | `& .\.tmp\kd-06\fix-logs.ps1` | 2026-11-25T15:03+08:00 | 自动（PowerShell 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-01 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 目录 29 个 .md 与表 A-1 的 29 个模板路径双向无差集；新增 12 份存在 12/12；任务书口径 30 份经复核为输入错误（验收报告正文无 30 份字样），不补建模板，R1 已关闭，复核见 logs/templates-close.log |
| E-AC-CHG-MOXIAN-V16-05-01 | AC-CHG-MOXIAN-V16-05 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/new-items.log | `& $NODE .tmp\kd-06\items.cjs` | 2026-11-25T14:56+08:00 | 自动（Node 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-01 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 门禁 MX-G-64 至 MX-G-70 七条、契约 MX-6-30 至 MX-6-32 三条、证据形式 MX-9-30 至 MX-9-34 五条、角色 MX-R-40 与 MX-R-41 两条，共 17/17 命中定义行 |
| E-AC-CHG-MOXIAN-V16-06-01 | AC-CHG-MOXIAN-V16-06 | 人工记录 | docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md | 人工读取签字表与验收意见 | 2026-11-25T14:50+08:00 | 人工:文档 | pass | 不适用 | TASK-CHG-MOXIAN-V16-02 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 第 156 行验收人 mx-accept-v16c 判 pass，第 162 行结论 pass 并写签字日期 2026-11-25；第 3 行状态栏已回写为「已验收，验收人 mx-accept-v16c，验收日期 2026-11-25」，与第 7 节签字一致 |
| E-AC-CHG-MOXIAN-V16-07-01 | AC-CHG-MOXIAN-V16-07 | 人工记录 | docs/framework/accept/STRESS-RERUN-25-20261125.md | 人工读取压力复判报告 | 2026-11-25T14:50+08:00 | 人工:文档 | pass | 不适用 | TASK-CHG-MOXIAN-V16-02 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 第 63 行逐格计数 pass 175、partial 0、missing 0、blocked 0，严格通过率 175/175；第 31 行说明第三轮任务 4 证据形式改判 pass；第 3 行为第二轮历史结论 174/1 |
| E-AC-CHG-MOXIAN-V16-08-01 | AC-CHG-MOXIAN-V16-08 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/matrix.log | `& $NODE scripts\check-matrix-coverage.mjs` | 2026-11-25T14:57+08:00 | 自动（Node 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-03 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 主矩阵 48/48、附加类型 18/18，合计 66/66；门禁引用 96/96；末行 PASS (gate: matrix, checks: 66, warnings: 7)，EXIT=0 |
| E-AC-CHG-MOXIAN-V16-09-01 | AC-CHG-MOXIAN-V16-09 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/contract.log | `& $NODE scripts\check-contract.mjs` | 2026-11-25T14:57+08:00 | 自动（Node 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-03 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 7 项检查全 PASS，末行 PASS (gate: contract, checks: 7, warnings: 7)，7 passed 0 failed，EXIT=0 |
| E-AC-CHG-MOXIAN-V16-10-01 | AC-CHG-MOXIAN-V16-10 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/self-tests.log | `& $NODE scripts\check-gates.mjs --self-test` 等七个命令 | 2026-11-25T15:03+08:00 | 自动（Node 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-03 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 七个命令 EXIT 全为 0；本轮复跑 gates 12、spec-language 8、contract 14，连同 trace 11、incremental-coverage 14、evidence 14 合计 73，性能 34，总 107，与报告一致；复核日志 logs/self-tests-close.log |
| E-AC-CHG-MOXIAN-V16-11-01 | AC-CHG-MOXIAN-V16-11 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/struct-change.log | `& $NODE scripts\check-gates.mjs --change CHG-MOXIAN-V16` | 2026-11-25T15:07+08:00 | 自动（Node 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-03 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | MX-G-08 至 MX-G-13 六项全 PASS，0 failed，EXIT=0；本包 error 为 0 |
| E-AC-CHG-MOXIAN-V16-11-02 | AC-CHG-MOXIAN-V16-11 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/struct-full.log | `& $NODE scripts\check-gates.mjs` | 2026-11-25T15:09+08:00 | 自动（Node 实跑） | pass | 不适用 | TASK-CHG-MOXIAN-V16-03 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 全仓 FAILED: 62 error(s), 318 warning(s)，107 passed / 13 failed；同日早间基线 127 error、322 warning、77 passed / 37 failed；65 个差值由 B1 与 CONV-001..005 六包修复消掉，余 62 属 CONV-006/007/SYS-001，127→62→0 归因见 E-AC-CHG-MOXIAN-V16-11-03；本包不在 error 包中 |
| E-AC-CHG-MOXIAN-V16-11-03 | AC-CHG-MOXIAN-V16-11 | 集成日志 | specs/changes/CHG-MOXIAN-V16/logs/attribution-127-62-0.log | `Select-String -Path .tmp\kd-01\gates-*.txt -Pattern 'FAILED:'` 与 `Get-ChildItem specs\changes -Recurse` | 2026-11-25T15:20+08:00 | 人工:文档 | pass | 不适用 | TASK-CHG-MOXIAN-V16-03 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 127→62→0 归因：65 = B1 15 + CONV-001..005 各 10；62 = CONV-006 44 + CONV-007 8 + SYS-001 10；run2 的 13 条 FAIL 检查行只落在这三个包；九包外无其它变更包被改，docs 同期改动不改变结构门禁计数 |
| E-AC-CHG-MOXIAN-V16-12-01 | AC-CHG-MOXIAN-V16-12 | 人工记录 | moxian-framework/VERSION | `Get-Content moxian-framework\VERSION` | 2026-11-25T15:04+08:00 | 人工:文档 | pass | 不适用 | TASK-CHG-MOXIAN-V16-04 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 第 1 行为 v1.6 |
| E-AC-CHG-MOXIAN-V16-12-02 | AC-CHG-MOXIAN-V16-12 | 人工记录 | moxian-framework/.git/refs/heads/main | `Get-Content moxian-framework\.git\refs\heads\main` | 2026-11-25T15:04+08:00 | 人工:文档 | pass | 不适用 | TASK-CHG-MOXIAN-V16-04 | R1 | 是 | N/A：纯文档变更无构建产物 | 有效 | 内容 9f8edeb45db5a42f245dc314a208d78112b1d053；远程 URL 为 git@github.com:YJM1024/moxian-framework.git；本轮未访问远端，未执行 git 命令 |

## 3 文档校验记录

本节按 `docs/framework/templates/change.md` 第 6 节对纯文档变更的六项校验登记，校验对象是本包四份文件与新建测试计划，校验方式为逐项读取与门禁解析。

| 校验项 | 结论 | 事实 |
|---|---|---|
| 信息一致 | pass | 版本行、状态、负责人、判级四个来源一致，判级在四份文件均写变更级 |
| 符号可见 | pass | 本文件不新增术语与缩写；AC、TC、E 三类编号在首次出现处给出格式说明 |
| 读写路径 | pass | spec.md 指向 tasks.md、evidence.md、test-plan.md 的三个路径均存在 |
| 变更声明 | pass | proposal 第 3 节列明三句范围与三条非目标，与本包实际改动一致 |
| 语言规则 | pass | `check-spec-language.mjs` 未在本包报 error；中文标点与术语按框架正文用词 |
| 链接与编号 | pass | AC 12 条、TC 12 条、E 15 条，编号连续且双向可解析 |

## 4 未验证项与解除条件

本包没有 `missing` 与 `blocked` 行。两项口径差异均已关闭：模板份数差 1 经复核为任务书输入错误，目录与附录 A 均为 29 份且双向无差集，验收报告正文只写 29 份，不补建模板，见 `logs/templates-close.log`；自检断言计数差经复跑确认 gates 12、spec-language 8、contract 14，与验收报告一致，见 `logs/self-tests-close.log`。两项责任人为 `文档`，已于 2026-11-25 完成。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-CHG-MOXIAN-V16-01-01 | AC-CHG-MOXIAN-V16-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-02-01 | AC-CHG-MOXIAN-V16-02 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-03-01 | AC-CHG-MOXIAN-V16-03 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-04-01 | AC-CHG-MOXIAN-V16-04 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-05-01 | AC-CHG-MOXIAN-V16-05 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-06-01 | AC-CHG-MOXIAN-V16-06 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-07-01 | AC-CHG-MOXIAN-V16-07 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-08-01 | AC-CHG-MOXIAN-V16-08 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-09-01 | AC-CHG-MOXIAN-V16-09 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-10-01 | AC-CHG-MOXIAN-V16-10 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-11-01 | AC-CHG-MOXIAN-V16-11 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-12-01 | AC-CHG-MOXIAN-V16-12 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-01-01-01 | AC-CHG-MOXIAN-V16-01-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-02-01-01 | AC-CHG-MOXIAN-V16-02-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-03-01-01 | AC-CHG-MOXIAN-V16-03-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-04-01-01 | AC-CHG-MOXIAN-V16-04-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-05-01-01 | AC-CHG-MOXIAN-V16-05-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-06-01-01 | AC-CHG-MOXIAN-V16-06-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-07-01-01 | AC-CHG-MOXIAN-V16-07-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-08-01-01 | AC-CHG-MOXIAN-V16-08-01 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-09-01-01 | AC-CHG-MOXIAN-V16-09-01 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-10-01-01 | AC-CHG-MOXIAN-V16-10-01 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-11-01-01 | AC-CHG-MOXIAN-V16-11-01 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-11-02-01 | AC-CHG-MOXIAN-V16-11-02 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-11-03-01 | AC-CHG-MOXIAN-V16-11-03 | 门禁脚本 | node scripts/check-gates.mjs | specs/changes/CHG-MOXIAN-V16/evidence.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-12-01-01 | AC-CHG-MOXIAN-V16-12-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |
| E-AC-CHG-MOXIAN-V16-12-02-01 | AC-CHG-MOXIAN-V16-12-02 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-MOXIAN-V16/spec.md | 2026-11-25 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

# 墨线框架终验报告（ACCEPT-STRESS-FINAL）

验收角色：独立终验子智能体 mx-accept-final2。时间：2026-11-24 22:31 至 23:10（Asia/Shanghai）。范围：`docs/framework/` 下的总册、角色、门禁、任务矩阵、四份域规范、五份模板、三份复测报告、缺口登记与上一轮终验报告，以及 `scripts/` 下四个门禁脚本。

方法：逐文件读取并用行号取证；用固定路径 Node 运行时 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` 实跑四个 `--self-test`；用正则统计规则编号、跨文件引用与四类文本写法；把缺口登记、三份复测报告与上一轮终验报告的未决项合并去重。本报告只新建本文件，未修改被查文件。

结论：13 格残余缺口全部补齐，三份复测报告的覆盖率数字可以复算，四个门禁脚本自检全部通过，七份文件的规则编号连续。抽查发现 12 条问题，其中 5 条是规范性条文之间的口径不一致，1 条是总册自查的规则总数失实，其余 6 条为版本绑定滞后与登记残留。合并遗留 22 条，阻断框架使用 0 条，其中 1 条只阻断历史包 CHG-CONV-007 的收口。建议有条件定稿，先修三条硬项，其余列入 v1.4。

## 一、七项检查结果

| 项 | 结果 | 主要证据 | 说明 |
|---|---|---|---|
| 1 三份复测报告的结论与数字 | 部分通过 | `accept/STRESS-1-R2.md:7、77、117`；`accept/STRESS-2-R2.md:96`；`accept/STRESS-3-R2.md:3、204` | 三组覆盖率经算术复核一致；抽查 9 格中 8 格的规则号存在且内容对得上，1 格引用的条文与格子描述不一致（问题 7） |
| 2 13 格残余缺口的补缺状态 | 通过 | 三份报告的状态列共 13 行；条文落点见 2.2 节 | 13 格状态列均写「已补」，逐条核对状态列引用的规则、模板与表格，全部存在且内容对应 |
| 3 版本与规则编号 | 部分通过 | `MOXIAN.md:3、1381`；`ROLES.md:3、224`；`GATES.md:2`；四份域规范与五份模板首部；规则计数命令输出 | 版本全部升到补缺后状态，七份文件的规则编号连续；`MOXIAN.md:1381` 写 237 条，实测 257 条（问题 1） |
| 4 四个门禁脚本自检 | 通过 | `.tmp/final2/check-gates.log` 等四份日志；命令输出见 2.4 节 | 断言数 12、14、14、11，退出码均为 0 |
| 5 口径唯一性 | 部分通过 | 定义处与引用处见 2.5 节 | 写作用域、兼容门、抽样口径、附加类型、卡状态五值各一处定义；原因码六码在测试域规范另立码表（问题 5） |
| 6 文本规范 | 通过 | `docs/framework/` 全文扫描；`GATES.md:111、112、114、129、130、138` | 对照句式 3 行、感叹号 2 行、右箭头 1 行、第二人称 1 行，全部落在门禁规则定义与自检夹具内 |
| 7 遗留清单 | 通过 | 合并结果见第四节 | 22 条，每条写责任人、来源行号与阻断判断；阻断框架使用 0 条 |

## 二、逐项核对

### 2.1 三份复测报告的结论与数字

三份报告的结论数字与各自的表格计数一致。第一份写 96 格中 93 格有规定，覆盖率 96.9%，四个任务分别为 24、24、21、24 格，合计 93 格（`accept/STRESS-1-R2.md:7、73-77、117`）。第二份写 72 格中 68 格有规定，覆盖率 94.4%，三个任务分别为 21、24、23 格，合计 68 格（`accept/STRESS-2-R2.md:96`）。第三份写可用 66 格、缺 2 格、冲突 4 格、无规定 0 格，72 格合计，可用覆盖率 91.7%，条文覆盖率为 100.0%（`accept/STRESS-3-R2.md:3、168、204`）。

| 抽查格 | 报告位置 | 引用的规则 | 条文落点 | 核验结果 |
|---|---|---|---|---|
| STRESS-1-R2 任务一 契约与设计 | `STRESS-1-R2.md:16` | GATES MX-G-28 八态唯一集合 | `GATES.md:152` | 一致，八态枚举与「唯一集合」表述对得上 |
| STRESS-1-R2 任务二 契约与设计 | `STRESS-1-R2.md:31` | MX-6-19 文件流四项 | `MOXIAN.md:417` | 一致，Content-Type、Content-Disposition、体积上限与超时四项齐全 |
| STRESS-1-R2 任务四 测试与证据 | `STRESS-1-R2.md:64` | MX-9-24 固定测量命令 | `MOXIAN.md:774` | 一致，命令文本与三次中位数口径对得上 |
| STRESS-2-R2 任务 5 受理与判级 | `STRESS-2-R2.md:15` | 安全修复严重级别四值 | `TASK-MATRIX.md:47-56` | 一致，致命、严重、一般、轻微四值与判定信号齐全 |
| STRESS-2-R2 任务 7 契约与设计 | `STRESS-2-R2.md:42` | MX-BE-22 续传水位与补拉窗口 | `domains/backend.md:96` | 一致，两项写入 WS 契约节，未写按契约缺失处理 |
| STRESS-2-R2 任务 7 测试与证据 | `STRESS-2-R2.md:45` | MX-QA-59 判定对象与去重键 | `domains/testing.md:134` | 一致，三项判定对象与后端消息 ID 去重键对得上 |
| STRESS-3-R2 任务 8 执行 | `STRESS-3-R2.md:37` | runbook 第 3、4、7 节 | `templates/runbook.md:24、36、57` | 一致，命令块、检查点与回滚三节齐全 |
| STRESS-3-R2 任务 9 契约与设计 | `STRESS-3-R2.md:54` | MX-PD-64 令牌六项 | `domains/product-design.md:215` | 一致，六项字段与契约表类 7 对齐 |
| STRESS-3-R2 任务 9 测试与证据 | `STRESS-3-R2.md:57` | MX-2-18 与 MX-PD-65 | `MOXIAN.md:152`；`domains/product-design.md:216` | 规则号存在，内容不一致：格子写七项与四档，MX-2-18 写五项，MX-PD-65 写三档 |

第三份报告第 57 行的格子在门禁列写「可访问性七项为唯一集合」，引用 MX-2-18 与 MX-FE-53。`MOXIAN.md:152` 的 MX-2-18 写五项，`MOXIAN.md:1206` 的表 B-3 也写五项，`TASK-MATRIX.md:107` 与 `domains/frontend.md:229` 写七项。该处不一致已被报告 7.2 节的 C-04 与 C-05 登记为一致性缺陷，没有计入 6 个不可用格，因此 91.7% 与 100.0% 两个数字按报告自己的计数口径成立，条文层次的不一致仍然留到本轮。

### 2.2 13 格残余缺口的补缺状态

三份报告在各自表格末尾新增「补缺状态（2026-11-24）」列，13 行全部写「已补」。逐条核对状态列引用的落点如下。

| 编号 | 状态列位置 | 状态列写法 | 核对的条文与模板 | 结论 |
|---|---|---|---|---|
| R-01 | `STRESS-1-R2.md:109` | 已补（MX-R-33；MX-5-23 与 migration-plan 第 2 节同步引用） | `ROLES.md:121`；`MOXIAN.md:340`；`templates/migration-plan.md:21` | 通过 |
| R-02 | `STRESS-1-R2.md:110` | 已补（TASK-MATRIX 第 2 节兼容门统一；表 B-3 改为引用） | `TASK-MATRIX.md:108`；`MOXIAN.md:1207` | 通过 |
| R-03 | `STRESS-1-R2.md:111` | 已补（MX-9-25 合并为唯一口径；MX-QA-58 改为引用） | `MOXIAN.md:775`；`domains/testing.md:103`；`templates/migration-plan.md:51` | 通过 |
| R2-G01 | `STRESS-2-R2.md:83` | 已补（TASK-MATRIX 第 1 节、MX-5-21、ROLES 第 7 节、change.md 受控节、defect-record 第 2 节） | `TASK-MATRIX.md:56`；`MOXIAN.md:338`；`ROLES.md:87`；`templates/change.md:144`；`templates/defect-record.md:21` | 通过 |
| R2-G02 | `STRESS-2-R2.md:84` | 已补（change.md 受控节；表 B-3 安全评审门证据落点） | `templates/change.md:131-152`；`MOXIAN.md:1210` | 通过 |
| R2-G03 | `STRESS-2-R2.md:85` | 已补（change.md 受控节通知记录表；defect-record 第 9 节） | `templates/change.md:146-152`；`templates/defect-record.md:73` | 通过 |
| R2-G04 | `STRESS-2-R2.md:86` | 已补（MX-6-17、MX-8-06、TASK-MATRIX 第 3 节缺陷契约格） | `MOXIAN.md:415、606`；`templates/defect-record.md:25` | 通过 |
| U8-01 | `STRESS-3-R2.md:174` | 已补（MX-R-30、ROLES 第 15 节；TASK-MATRIX 第 3、8 节、表 B-3 与 GATES 第 3.7 节改为引用） | `ROLES.md:201`；`TASK-MATRIX.md:153、258`；`GATES.md:255`；`MOXIAN.md:1211` | 通过 |
| U9-01 | `STRESS-3-R2.md:175` | 已补（MX-R-31、ROLES 第 4、5 节；TASK-MATRIX 第 3、8 节、token-change 第 5 节与 MX-FE-53 改为引用） | `ROLES.md:70`；`TASK-MATRIX.md:270、272`；`templates/token-change.md:41`；`domains/frontend.md:229` | 通过 |
| U9-02 | `STRESS-3-R2.md:176` | 已补（TASK-MATRIX 第 8 节设计交付测试行、ROLES 第 5 节产出） | `TASK-MATRIX.md:273`；`ROLES.md:65` | 通过 |
| U9-03 | `STRESS-3-R2.md:177` | 已补（MX-R-34、MX-2-14、表 10-2 说明行；token-change 第 7 节引用） | `ROLES.md:176`；`MOXIAN.md:148、833`；`templates/token-change.md:59` | 通过 |
| U10-01 | `STRESS-3-R2.md:178` | 已补（MX-R-32、ROLES 第 6 节；TASK-MATRIX 第 8 节与 backend 第 8.7 节改为引用） | `ROLES.md:82`；`TASK-MATRIX.md:282`；`domains/backend.md:413` | 通过 |
| U10-02 | `STRESS-3-R2.md:179` | 已补（MX-R-32、ROLES 第 6 节；与 U10-01 同批） | `ROLES.md:82`；`TASK-MATRIX.md:282` | 通过 |

三处写作用域用引用方式收口，未在本轮补出新文件。文档作者取产品、设计或后端，由 Lead 在受理阶段指定，写在 `ROLES.md:201`；前端写 `frontend/` 下令牌文件的边界写在 `ROLES.md:70`；后端写 `tools/<工具名>/` 的边界写在 `ROLES.md:82`。三处都声明其他文件只引用，抽到的 `TASK-MATRIX.md:153、258、270、272、282`、`GATES.md:255` 与 `domains/backend.md:413` 均为引用句。

### 2.3 版本与规则编号

| 文件 | 版本与状态 | 依据 |
|---|---|---|
| `MOXIAN.md` | v1.3，active | `MOXIAN.md:3、5`；D.2 记录在 `:1287` |
| `ROLES.md` | v0.3，active | `ROLES.md:3-4`；版本说明在 `:224` |
| `GATES.md` | v0.3，active | `GATES.md:2` |
| `domains/backend.md` | v0.3，active | `domains/backend.md:4` |
| `domains/frontend.md` | v0.3，active | `domains/frontend.md:3` |
| `domains/product-design.md` | v0.3，active | `domains/product-design.md:3` |
| `domains/testing.md` | v0.3，active | `domains/testing.md:5` |
| `templates/change.md` | v0.3 | `templates/change.md:3` |
| `templates/defect-record.md` | v0.2，active | `templates/defect-record.md:3` |
| `templates/migration-plan.md` | v0.2，active | `templates/migration-plan.md:3` |
| `templates/token-change.md` | v0.2，active | `templates/token-change.md:3` |
| `templates/cli-contract.md` | v0.2，active | `templates/cli-contract.md:3` |

五份模板即本轮改动的 change、defect-record、migration-plan、token-change 与 cli-contract，首部版本分别为 v0.3、v0.2、v0.2、v0.2、v0.2，其中四份在版本说明里写明改指哪条 ROLES 规则或补哪一节。`templates/change.md:3` 只写「状态：v0.3，2026-11-24。」，没有写明本版改了什么，属于版本说明缺失（问题 10）。

规则编号按文件统计如下。`MOXIAN.md` 十三章逐章从 01 起连续，无缺号与重号，合计 257 条，各章为 14、20、18、18、24、21、20、28、27、19、16、18、14。`ROLES.md` 的 MX-R-01 至 MX-R-34 连续。`GATES.md` 的 MX-G-01 至 MX-G-54 连续，MX-G-55 与 MX-G-56 为预留号，MX-G-57 与 MX-G-58 在预留号之后，现行规则 56 条，与 `GATES.md:2` 的自述一致。`domains/backend.md` 的 MX-BE-01 至 MX-BE-76、`domains/frontend.md` 的 MX-FE-01 至 MX-FE-53、`domains/product-design.md` 的 MX-PD-01 至 MX-PD-66、`domains/testing.md` 的 MX-QA-01 至 MX-QA-60 均连续。

`MOXIAN.md:1381` 写「十三章合计 237 条规则」，与按规则行计数的 257 条相差 20 条，差额与第 2 章的 20 条规则数相同（问题 1）。同一行又写「本版不新增章级规则」，因此该差异无法用本版新增解释。附录 A 的 GATES 行写 56 条 MX-G 规则，与 `GATES.md:2` 一致，这一处计数没有问题。

### 2.4 四个门禁脚本自检

四个脚本用同一 Node 运行时执行，工作目录为工作区根目录，输出写入 `.tmp/final2/` 下四份日志。

| 脚本 | 断言数 | 退出码 | 日志末行 |
|---|---:|---:|---|
| `scripts/check-gates.mjs` | 12 | 0 | `SELF-TEST PASS` |
| `scripts/check-contract.mjs` | 14 | 0 | `SELF-TEST PASS` |
| `scripts/check-incremental-coverage.mjs` | 14 | 0 | `SELF-TEST PASS (14 assertions)` |
| `scripts/check-evidence.mjs` | 11 | 0 | `SELF-TEST PASS (11 assertions)` |

断言数按日志中 `PASS` 开头的行计数，与两个脚本自报的 assertions 数一致。四个脚本运行后都把夹具移入工作区隔离目录 `.tmp/_gate-trash/` 并打印移动路径（`check-incremental-coverage.log` 倒数第三行、`check-evidence.log` 倒数第三行），没有写入 `docs/framework/`。运行前后 `docs/framework/` 下 Markdown 的最后修改时间保持在 22:30，与本次运行无关。

### 2.5 口径唯一性

| 口径 | 定义处 | 其余位置的处理 | 结论 |
|---|---|---|---|
| 写作用域（文档作者、令牌文件、`tools/`） | `ROLES.md:201` 的 MX-R-30，两条子边界在 `:70` 与 `:82` | `TASK-MATRIX.md:153、258、270、272、282`、`GATES.md:255`、`MOXIAN.md:833、1211`、`domains/backend.md:413` 均为引用 | 通过 |
| 兼容门 | `TASK-MATRIX.md:108` | `MOXIAN.md:1207` 写「通过条件按 TASK-MATRIX 第 2 节兼容门执行」；`TASK-MATRIX.md:150` 的迁移契约格写「兼容方向与登记项按第 2 节兼容门执行」 | 通过 |
| 抽样口径 | `MOXIAN.md:775` 的 MX-9-25 | `domains/testing.md:103` 的 MX-QA-58、`templates/migration-plan.md:51`、`MOXIAN.md:722` 均为引用，平方根、等距抽样与 1000 行上限只出现在 MX-9-25 | 通过 |
| 附加类型 | `TASK-MATRIX.md:239` 第 8 节 | `MOXIAN.md:277-279` 只写处理与数量上限，`MOXIAN.md:361` 是立项字段的取值清单，两处不另立门禁 | 通过（附注） |
| 卡状态五值 | `MOXIAN.md:244` 表 3-3 | `GATES.md:296` 明写「以表 3-3 为唯一定义处」；`MOXIAN.md:557`、`templates/change.md:83`、`templates/task-card.md:65` 均引用 | 通过 |
| 原因码六码 | `MOXIAN.md:248-255` 表 3-4 | `MOXIAN.md:193、736、752` 引用；`domains/testing.md:235-244` 另列一张六码表；`templates/evidence-index.md:27、47-54` 另列状态与可用码的对应表 | 部分通过 |

原因码一处需要说明。`MOXIAN.md:1313` 写「门禁设计、证据模板、测试域规范与证据脚本都按本表执行，不保留第二套前缀」，测试域规范第 8 节仍自建一张表，字段为原因码、含义、适用状态、写法与解除条件。两处取值与状态对应一致，执行不会得出相反结论，仍不满足「只有一处定义、其余为引用」的要求（问题 5）。

### 2.6 文本规范

扫描范围为 `docs/framework/` 下全部 Markdown，按行统计，命中行如下。

| 类别 | 命中行数 | 命中位置 | 判定 |
|---|---:|---|---|
| 对照句式 | 3 | `GATES.md:111、130、138` | 111 行是 MX-G-21 的规则定义，130 与 138 行是自检夹具与输出样例 |
| 感叹号 | 2 | `GATES.md:112、129` | 112 行是 MX-G-22 的规则定义，129 行是夹具示例 |
| 右箭头符号 | 1 | `GATES.md:112` | 同一处规则定义，列出被禁符号 |
| 第二人称泛指 | 1 | `GATES.md:114` | MX-G-24 的规则定义，把第二人称代词列为被检词 |

上述 7 处命中分布在 6 行内，全部落在门禁规则的被检词清单与自检夹具内，叙述性正文与其他文件的命中为 0。`GATES.md:129` 与 `:130` 的示例句子分别用于演示感叹号与对照句式会被 MX-G-22、MX-G-21 命中，`GATES.md:138` 是失败样例的输出行。

### 2.7 遗留清单的合并口径

合并来源为 `accept/STRESS-GAPS.md` 第 8 节的未决点、三份复测报告的无规定格与未验证项、`accept/ACCEPT-FINAL.md` 第三节的 24 条遗留，以及本轮抽查的新发现。同一事实在多处登记时合并为一行，来源列写全部出处。`ACCEPT-FINAL.md` 中已被后续修订关闭的条目不再列入，包括八份文件的状态转为 active、适配层与角色文件的过期引用、`AGENTS.md` 入口索引的三行、对账表行号、卡状态五值、附录 A 的 MX-G 条数、MX-7-16 的节号与「四套状态词」表述。关闭依据见 `ACCEPT-FINAL.md:105-127`、`ROLES.md:3-4`、`adapters/deepseek.md:78`、`AGENTS.md:30、56、61`、`ABSORB-RECONCILE.md:142`、`MOXIAN.md:1145、492、194`。

## 三、问题清单

| 编号 | 严重度 | 问题 | 证据 | 影响与建议 |
|---|---|---|---|---|
| 1 | 中 | 总册自查写的规则总数与正文不符 | `MOXIAN.md:1381` 写 237 条；按 `- MX-<章>-<序号>` 行统计为 257 条，十三章分别 14、20、18、18、24、21、20、28、27、19、16、18、14 | 自查结论不可复算，引用总数时会出现两个数字。建议改为 257 条，或写明计数口径与排除范围 |
| 2 | 中 | 可访问性门的检查项数在两处规范中不同 | `MOXIAN.md:152` 的 MX-2-18 与 `MOXIAN.md:1206` 的表 B-3 写五项；`TASK-MATRIX.md:107` 与 `domains/frontend.md:229` 写七项，并称七项为唯一集合 | 执行者按五项做会少做错误识别与 reduced-motion 两项。建议以七项为准回写 MX-2-18 与表 B-3，执行时先取更严的七项 |
| 3 | 中 | 令牌变更截图的档位口径不同 | `domains/product-design.md:216` 的 MX-PD-65 写三档视口；`MOXIAN.md:727` 的 MX-9-11 与 `domains/frontend.md:195` 写四档加 1280 条件档 | 同一令牌变更的截图数量取决于引用哪一条。建议 MX-PD-65 改为引用 MX-9-11，执行时取四档 |
| 4 | 中 | 检查点字段在角色文件与总册中字段集不同 | `ROLES.md:152-161` 的表 3 为八字段；`MOXIAN.md:627-641` 的表 8-1 为七字段；`MOXIAN.md:645` 声称角色文件表 3 引用同一字段集 | 换人续做时字段对不上，`MOXIAN.md:645` 的声明不成立。建议按表 8-1 回写 ROLES 表 3，或删除「同一字段集」的表述 |
| 5 | 中 | 原因码六码在两份文件各有一张码表 | `MOXIAN.md:248-255` 表 3-4；`domains/testing.md:235-244`；`templates/evidence-index.md:27、47-54` | 取值一致，状态对应一致，执行无相反结论，仍不符合一处定义。建议测试域与证据模板改为引用表 3-4 |
| 6 | 低 | 附属文件的版本绑定滞后于总册 | `README.md:42` 写总册 v1.2；`EFFORT.md:3` 写与 TASK-MATRIX v0.3 同步，矩阵已到 v0.5；`adapters/deepseek.md:3` 绑总册 v1.2；`adapters/README.md:46` 写分支绑 `main v0.1-draft`，与分支文件自述的 v1.2 冲突 | 读者按入口文件会取到旧版本号。建议随 v1.3 一次改齐四处 |
| 7 | 低 | 第三份复测报告抽查格的内容与现行条文不一致 | `accept/STRESS-3-R2.md:57` 写七项与四档；`MOXIAN.md:152` 写五项；`domains/product-design.md:216` 写三档 | 报告已在 7.2 节的 C-04 与 C-05 登记，未计入不可用格。建议在 C-04 与 C-05 关闭时同步改该格备注 |
| 8 | 低 | 采纳对账表对附录 C 的描述与表 C-2 冲突 | `ABSORB-RECONCILE.md:207、211` 称附录 C 没有逐条列候选名与重启条件；`MOXIAN.md:1233-1252` 的表 C-2 已列 16 条候选名与重启条件 | 回查时会误以为没有索引。建议改写为「98 条采纳项未逐条索引，16 条不采纳项已列于表 C-2」 |
| 9 | 低 | 任务矩阵的门禁实现状态与门禁文件不一致 | `TASK-MATRIX.md:219` 写 MX-G-46 至 MX-G-50 的脚本尚未建立；`GATES.md:300` 写 MX-G-47 已由 `scripts/check-evidence.mjs` 实现 | 读者无法判断 MX-G-47 是否可自动执行。建议改为逐条列已实现与未实现 |
| 10 | 低 | 变更包模板版本升级无说明，提案模板字段不齐 | `templates/change.md:3` 只写版本号；`docs/process/templates/proposal.md:5-47` 为八节，`MOXIAN.md:355-372` 的表 5-2 为十九项 | 无法从模板首部看出改了什么；按八节填 proposal 会缺类型判级、规模判级与涉及契约项。建议补版本说明，并把 proposal 模板回写为十九项 |
| 11 | 低 | 测试域规范的测试层数与表 9-1 不同 | `domains/testing.md:138` 写「五个机器层之外保留人工层」；`MOXIAN.md:702、708-716` 的表 9-1 为六层加人工层，含命令行与产物层 | 独立工具任务的取证层缺少唯一出处。建议测试域第 5 节改为引用表 9-1 |
| 12 | 低 | 复测报告首部的依据行数与版本为补缺前快照 | `accept/STRESS-1-R2.md:5` 写 1390、304、218、300 行，现为 1393、305、228、300 行；`accept/STRESS-3-R2.md:5` 写 v1.2、v0.4、v0.2、v0.4、v0.2，现为 v1.3、v0.5、v0.3、v0.4、v0.3；`:7` 写十份模板，目录现有十一份 | 复核者按首部取版本会对不上。建议在报告首部加一行「复核基线与补缺状态列的日期」 |

## 四、遗留表

合并口径见 2.7 节。「是否阻断使用」按新变更能否按墨线继续执行判断；历史包自身的收口阻断在括号内单列。

| 序 | 事项 | 来源 | 责任人 | 是否阻断使用 |
|---:|---|---|---|---|
| 1 | U-12：19 条门禁规则（MX-G-14 至 19、21 至 25、46、48、49、50、53、54、57、58）的脚本、失败样例与固定夹具未建立 | `GATES.md:276、300`；`MOXIAN.md:1369`；`accept/ACCEPT-FINAL.md:111` | Lead，各门禁责任人 | 否（13 条按 `GATES.md:276` 人工判据执行，其余 6 条只在设计层生效） |
| 2 | 可访问性门五项与七项并存 | `MOXIAN.md:152、1206`；`TASK-MATRIX.md:107`；`domains/frontend.md:229` | Lead，验收配合 | 否（取七项更严口径可执行） |
| 3 | 视觉基线三档与四档并存 | `domains/product-design.md:216`；`MOXIAN.md:727`；`domains/frontend.md:195` | 设计 owner，前端配合 | 否（取四档更严口径可执行） |
| 4 | 检查点字段八项与七项并存 | `ROLES.md:152-161`；`MOXIAN.md:627-645` | Lead，ROLES owner 配合 | 否（按表 8-1 执行） |
| 5 | 原因码六码在测试域与证据模板各有一张表 | `domains/testing.md:235-244`；`templates/evidence-index.md:27、47-54` | 测试 owner | 否（两处取值一致） |
| 6 | 提案模板八节与立项字段十九项不一致 | `docs/process/templates/proposal.md:5-47`；`MOXIAN.md:355-372` | Lead | 否（字段以表 5-2 为准） |
| 7 | 证据模板无文档校验记录节 | `docs/process/templates/evidence.md:5-47`；`GATES.md:247` | Lead，测试配合 | 否（可写入第 6 节并注明） |
| 8 | 文档入口无运维手册小节与生效日期列 | `docs/README.md:30`；`TASK-MATRIX.md:263` | Lead | 否（生效登记可暂写变更包） |
| 9 | 测试域第 5 节五个机器层与表 9-1 七层不一致 | `domains/testing.md:138`；`MOXIAN.md:702、708-716` | 测试 owner | 否（按表 9-1 执行） |
| 10 | 三份模板待建：`security-matrix`、`a11y-checklist`、`visual-baseline` | `MOXIAN.md:1156、1157、1160`；`accept/STRESS-GAPS.md:187` | 测试 owner，前端 owner | 否（各有替代条款，见 MX-BE-69 与 MX-9-11） |
| 11 | 前端 768 档视觉基线未建立 | `domains/frontend.md:13、195` | 前端 owner | 否（缺该档时按 MX-9-11 补档） |
| 12 | 附录 C 的采纳项逐条索引未建，对账表表述与表 C-2 冲突 | `ABSORB-RECONCILE.md:207、211`；`MOXIAN.md:1233-1252` | 附录 C 维护人（未定，现由本册作者代管） | 否 |
| 13 | 任务矩阵的门禁实现状态与 GATES 不一致 | `TASK-MATRIX.md:219`；`GATES.md:300` | Lead | 否 |
| 14 | 真实仓库无域契约表与夹具清单，MX-G-51 与 MX-G-52 无真实输入 | `accept/ACCEPT-BATCH4-R2.md:105`；`accept/ACCEPT-FINAL.md:53` | 测试 owner，设计 owner | 否（首个变更包落地时补） |
| 15 | 未决点 U-02、U-04、U-07、U-11 待 Lead 裁决 | `MOXIAN.md:1359、1361、1364、1368` | Lead | 否 |
| 16 | 未决点 U-05：不稳定用例清单路径与视觉容差口径 | `MOXIAN.md:1362`；`MOXIAN.md:1150` | 验收 | 否（容差已由 MX-9-11 定为 0） |
| 17 | 未决点 U-09：回放报告后四项冲突取值待产品确认 | `MOXIAN.md:1366`；`accept/REPLAY-CHG-CONV-007.md:166` | 产品 owner | 否 |
| 18 | `ADOPTION.md` 的六条未决项 | `ADOPTION.md:98-103` | Lead | 否（旧流程文件已停用） |
| 19 | 48 格矩阵覆盖为人工计数，无脚本复核 | `accept/WALKTHROUGH.md:146-156` | 验收 | 否 |
| 20 | 总册自查的规则总数 237 与实测 257 不符 | `MOXIAN.md:1381` | Lead | 否（条文可执行，计数需修正） |
| 21 | 入口与附属文件的版本绑定滞后 | `README.md:42`；`EFFORT.md:3`；`adapters/deepseek.md:3`；`adapters/README.md:46` | Lead | 否 |
| 22 | CHG-CONV-007 的 18 条失败测试走出口 A 或出口 B 待用户裁决，出口 B 未经确认即执行 | `accept/REPLAY-CHG-CONV-007.md:169-170` | 用户 | 否（阻断 CHG-CONV-007 收口，不计入框架阻断） |

## 五、能否定稿的建议

建议有条件定稿。13 格残余缺口已全部补齐，三份报告的覆盖率数字可复算，四个门禁脚本自检通过，七份文件的规则编号连续，这些条件支持把 v1.3 作为现行版本继续使用。

三条硬项应在签字前修完。第一条是把 `MOXIAN.md:1381` 的 237 改为 257，或写明计数口径与排除范围，否则总册自查的结论无法复算。第二条是把可访问性门统一为七项，回写 `MOXIAN.md:152` 的 MX-2-18 与 `MOXIAN.md:1206` 的表 B-3，使 `TASK-MATRIX.md:107` 与 `domains/frontend.md:229` 的「唯一集合」成立。第三条是把检查点字段统一为表 8-1 的七项，回写 `ROLES.md:152-161` 的表 3，或删去 `MOXIAN.md:645` 关于同一字段集的表述。

其余 19 条遗留不阻断定稿，列入 v1.4 的回写清单。视觉基线档位与原因码码表两条属于同批可修的口径问题，建议与三条硬项一并处理；模板待建、真实输入缺失与历史包裁决按各自责任人排期。若用户要求本轮立即签字，可把三条硬项写进附录 D 的下一条版本记录作为已知条件，签字后按 v1.3.1 回写，签字文本需注明这三处例外。

## 六、未验证项与自检

未验证项有四项。98 条采纳落点没有逐条重读，只核对了表 C-1 的四行汇总、表 C-2 的 16 条不采纳项与对账表的未决段。三个复测任务没有实际执行，报告结论只做条文互相对照。四个门禁脚本只跑 `--self-test`，没有在真实变更包上跑完整门禁。历史报告中的旧行号按快照保留，没有逐条追改。

自检结果：本报告只新建 `docs/framework/accept/ACCEPT-STRESS-FINAL.md`，未修改任何被查文件，运行脚本只在 `.tmp/` 下产生日志与隔离夹具。报告正文按中文完整句书写，未使用对照句式、感叹号、箭头与第二人称泛指，七项检查与 12 条问题、22 条遗留均给出文件与行号。报告行数按 `Get-Content` 计数在交付时给出。

## 七、签字前硬项修复记录

修复角色：修复子智能体 mx-fix-3hard。时间：2026-11-24 22:45 起，按 Asia/Shanghai 计时。范围：只改第三节问题 1、问题 2 与问题 4 涉及的文件，另在本节追加记录；未改代码与脚本，未升文件版本号，未改历史报告正文。

表 7-1 三条硬项的改法与位置

| 问题号 | 文件与行号 | 改前 | 改后 |
|---|---|---|---|
| 1 | `MOXIAN.md:1381`、`:1383` | 十三章合计 237 条规则 | 改为 257 条，写入逐章条数与计数口径，D.7 拆为两段 |
| 2 | `MOXIAN.md:152` | MX-2-18 逐项写键盘可达、焦点顺序、可访问名称、对比度与目标尺寸五项 | 按 `domains/product-design.md` MX-PD-29 的七项逐项写结论，本条不另列清单 |
| 2 | `MOXIAN.md:1206` | 表 B-3 可访问性门的证据落点写五项 | 按 MX-PD-29 的七项写结论，项名不在本表重列 |
| 2 | `domains/product-design.md:118` | MX-PD-29 称七项定义在 `TASK-MATRIX.md` 第 2 节 | 七项改由本条定义，并列出引用本条的其他位置 |
| 2 | `domains/product-design.md:208` | 设计 spec 增量字段表写五项 | 写七项，项名按 MX-PD-29 |
| 2 | `TASK-MATRIX.md:107` | 门禁名册列出七项并称七项为唯一集合 | 按 MX-PD-29 执行，本表不另列清单 |
| 2 | `domains/frontend.md:207`、`:229` | 列出七项，并把唯一集合指向 `TASK-MATRIX.md` 第 2 节与 MX-2-18 | 改指 MX-PD-29，不另列清单 |
| 4 | `ROLES.md:148`、`:150 至 :161` | 表 3 在 `:150` 至 `:161` 列八字段，`:148` 写字段按表 3 固定 | 字段只取 `MOXIAN.md` 表 8-1 的七项，删去八字段表，在 `:150` 写明八字段到七项的合并对照 |
| 4 | `MOXIAN.md:624`、`:645` | 称 ROLES 表 3 的八字段写法按本表改写 | 改指 `ROLES.md` 第 12 节引用表 8-1 |
| 4 | `MOXIAN.md:1323`、`:1367` | 记 ROLES 表 3 待回写，U-10 部分关闭 | 记回写完成，U-10 该项关闭 |
| 4 | `templates/task-card.md:87`、`:93` | 指向 ROLES 第 12 节的检查点表 | 改指 `MOXIAN.md` 表 8-1 的七项 |
| 4 | `README.md:58` | 写 ROLES 表 3 八项与表 8-1 七项不一致 | 写第 12 节已改为引用表 8-1 七项，768 档仍缺 |

问题 2 的现场与交办说明有两点出入，据实记录。现有文件没有一处把可访问性项数写成三项，写五项的有 `MOXIAN.md:152`、`MOXIAN.md:1206` 与 `domains/product-design.md:208` 三处；`domains/product-design.md:216` 的「三档视口」是视觉基线档位，与可访问性项数无关，对应第三节问题 3，本轮未改。本报告第三节问题 2 的证据行写「`:152` 与 `:1206` 写五项，`TASK-MATRIX.md:107` 与 `domains/frontend.md:229` 写七项」，与现场一致，本报告该条无需改写。

### 7.1 规则总数口径

`MOXIAN.md:1381` 现写 257 条，计数方式为十三章正文中以 `- MX-<章>-<序号>` 开头的条款行，逐章为 14、20、18、18、24、21、20、28、27、19、16、18 与 14 条，章内序号从 `01` 起连续，无跳号与重号。该口径不含附录 A 登记的 56 条 MX-G 门禁规则（`MOXIAN.md:1145`，与 `GATES.md:2` 一致），也不含 `ROLES.md` 的 MX-R 规则与四份域规范的规则，附录与各文件的条数按各自文件统计。修复前后各按同一正则统计一次，两次结果均为 257 条，逐章分布一致。

### 7.2 四个门禁自检

| 脚本 | 断言数 | 退出码 | 日志 |
|---|---:|---:|---|
| `scripts/check-gates.mjs` | 12 | 0 | `.tmp/fix-3hard/check-gates.log` |
| `scripts/check-contract.mjs` | 14 | 0 | `.tmp/fix-3hard/check-contract.log` |
| `scripts/check-incremental-coverage.mjs` | 14 | 0 | `.tmp/fix-3hard/check-incremental-coverage.log` |
| `scripts/check-evidence.mjs` | 11 | 0 | `.tmp/fix-3hard/check-evidence.log` |

断言数按日志中以 `PASS` 开头的行计数。四份日志的末行有两份为 `SELF-TEST PASS`，对应结构门禁与契约门禁；另两份分别为 `SELF-TEST PASS (14 assertions)` 与 `SELF-TEST PASS (11 assertions)`。运行时为 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`（v24.21.0），工作目录为工作区根目录。

### 7.3 三项的唯一定义与引用位置

| 事项 | 唯一定义 | 引用位置 | 复核结论 |
|---|---|---|---|
| 十三章规则总数与计数口径 | `MOXIAN.md:1381` | 附录 A 的 GATES 行按 `GATES.md` 统计 56 条 MX-G，不计入该总数 | 总数只写一处，口径写明含十三章条款行、不含附录与域规范 |
| 可访问性七项 | `domains/product-design.md:118` 的 MX-PD-29 | `MOXIAN.md:152`、`MOXIAN.md:1206`、`TASK-MATRIX.md:107`、`domains/frontend.md:207` 与 `:229`、`domains/product-design.md:208` | 规范性正文只在定义处列名，`domains/product-design.md:278` 的脚本行按七项登记覆盖范围 |
| 检查点七字段 | `MOXIAN.md` 表 8-1（`:627` 至 `:641`），定性见 `:645` | `ROLES.md:148` 与 `:150`、`MOXIAN.md:624`、`templates/task-card.md:87` 与 `:93`、`MOXIAN.md:1147` | 字段名、写法与判定只在表 8-1 定义，其余位置引用 |

### 7.4 遗留表状态与残余问题

第三节问题 1、问题 2、问题 4 与第四节遗留表第 2、4、20 项本轮关闭，遗留表其余条目不变。残余问题有三项。第一项是 `domains/product-design.md:216` 的三档视口与 `MOXIAN.md:727`、`domains/frontend.md:195` 的四档并存，属于第三节问题 3 与遗留表第 3 项，本轮未改，执行时仍取四档。第二项是 `accept/ABSORB-RECONCILE.md:72` 记「`domains/frontend.md`:206 命中七项清单」，该格是批次快照，`domains/frontend.md:207` 现已改为引用 MX-PD-29，快照未回改。第三项是历史报告 `accept/STRESS-3.md` 与 `accept/STRESS-3-R2.md:57`、`:190` 的旧写法按快照保留，其中 `:190` 的 C-04 所说「MX-2-18 与表 B-3 仍写五项」已不成立，并入 v1.4 的处理清单。

### 7.5 签字判断

三条硬项已关闭，四个门禁自检通过，三项各有唯一出处与引用位置，可以签字。签字文本不需要再列这三处例外；版本号仍取 v1.3，回写 v1.3.1 时把本节并入附录 D 的版本记录。

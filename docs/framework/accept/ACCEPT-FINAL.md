# 墨线框架终验报告（ACCEPT-FINAL）

验收角色：独立终验子智能体 mx-final-check。本报告只读被查文件，未修改任何被查文件，只新建本文件。

验收时间：2026-11-24 20:53 至 21:10（Asia/Shanghai）。

验收对象：`docs/framework/` 下总册、入口、采纳说明、任务矩阵、角色、档位、门禁、适配层、四份域规范、五份模板、四份采纳清单与对账表、`accept/` 五份报告，以及 `scripts/` 下四个门禁脚本与复核用到的既有脚本。

方法：逐文件读取并核对首部状态与行号；用目录枚举核对文件存在性与行数；用固定路径的 Node 运行时实跑四个门禁脚本的 `--self-test` 并记录断言数与退出码；对八组口径做两处交叉核对；对 98 条采纳记录做全表计数并抽查 10 条正文落点；对 `docs/framework/` 全文统计四类文本写法；把 `ADOPTION.md`、`accept/` 与总册附录 D 的未决项合并去重。

结论：**有条件通过（修复后待复验）**。文档体系、98 条采纳对账与四个门禁脚本自检均成立，但追溯与语言两道门禁的扩展规则尚未落地且未登记，加上文件状态与三处口径未收口，修复前这两道门禁只能按人工判据使用。

## 一、八项检查结果

| 项 | 结果 | 证据 | 说明 |
|---|---|---|---|
| 1 正式文件与状态 | 部分通过 | 被查文件 28 份（不含本报告；根 8、accept 5、adapters 2、domains 4、templates 5、absorb 4）；`MOXIAN.md:3` 版本 v1.2，`:5` 状态 active；十三章标题在 `MOXIAN.md:66、123、167、255、304、377、446、561、657、746、834、905、979`，附录 A 至 D 在 `:1060、1107、1156、1195`；规则编号 `MX-G-01` 至 `MX-G-52` 连续无缺号 | 28 份文件全部存在，总册版本、状态、十三章与四附录均正确。`ROLES.md:3-4` 为 v0.1-draft 与草案，`EFFORT.md:3` 为 draft v0.4，`GATES.md:2` 为设计稿 v0.2，`domains/product-design.md:3`、`domains/frontend.md:3`、`domains/testing.md:3-5` 为 draft，`domains/backend.md:1-11` 无版本与状态行，`templates/review.md:3` 为 v0.1-draft。 |
| 2 验收报告齐全 | 通过 | `accept/ACCEPT-BATCH1.md` 108 行、`ACCEPT-BATCH4.md` 180 行、`ACCEPT-BATCH4-R2.md` 130 行、`REPLAY-CHG-CONV-007.md` 196 行、`WALKTHROUGH.md` 164 行；结论分别在 `ACCEPT-BATCH1.md:11`、`ACCEPT-BATCH4.md:10`、`ACCEPT-BATCH4-R2.md:10`、`REPLAY-CHG-CONV-007.md:15`、`WALKTHROUGH.md:144` | 五份文件齐全且都有结论节，前四份为验收或回放结论，`WALKTHROUGH.md:3` 标注 draft 并保留历史快照。`WALKTHROUGH.md:33、139、125` 仍写四值证据类型、十二列证据索引与待裁决的检查门禁签发人，属于历史快照，不计入现行口径，引用时须注意。 |
| 3 门禁脚本与自检 | 部分通过 | 四个脚本自检：`check-gates.mjs` 12 项 PASS、退出码 0；`check-contract.mjs` 14 项 PASS、退出码 0；`check-incremental-coverage.mjs` SELF-TEST PASS（14 assertions）、退出码 0；`check-evidence.mjs` SELF-TEST PASS（11 assertions）、退出码 0。缺口证据：`GATES.md:239-246` 声称追溯与语言脚本已追加规则；`scripts/check-gates.mjs:1762-1768` 帮助只列 MX-G-08 至 MX-G-13，`:1786-1820` 无 `--gate` 参数，`:1839` 只调用 `runStructure`；`scripts/check-trace.mjs:5-21` 只列 T1 至 T6 与 R4，`:965-975` 只接受 root、json 与 self-test；`scripts/check-spec-language.mjs:10-17` 只列 R1 至 R7，`:382-398` 不接受 scope 与 change | 四个脚本均存在且自检通过。六道门禁中结构、契约、增量覆盖率与证据四道有独立脚本；追溯门禁的 AC 四处核对（MX-G-14 至 MX-G-19）与语言门禁的 R8 至 R12（MX-G-21 至 MX-G-25）没有脚本实现；`check-gates.mjs` 只实现结构门禁。在 08 至 43 与 46 至 52 的 43 条检查规则中，15 条没有脚本，其中 4 条（MX-G-46、48、49、50）已登记 U-12（`MOXIAN.md:1307`），其余 11 条没有登记。 |
| 4 口径一致抽查 | 部分通过 | 五要素：`MOXIAN.md:460`、`TASK-MATRIX.md:149`、`ROLES.md:120`、`AGENTS.md:34`、`adapters/deepseek.md:46`；五列：`MOXIAN.md:389`、`TASK-MATRIX.md:9`、`GATES.md:4`；判定四值：`MOXIAN.md:190` 与 `:240`、`GATES.md:208`、`templates/evidence-index.md:26`、`domains/testing.md:86`、`scripts/check-evidence.mjs:102`；原因码：`MOXIAN.md:191` 与 `:248-253`、`GATES.md:210`、`templates/evidence-index.md:27`、`domains/testing.md:228-233`、`scripts/check-evidence.mjs:104`；证据十五项：`MOXIAN.md:704` 与 `:715-729`、`GATES.md:208`、`templates/evidence-index.md:11`、`domains/testing.md:86`、`scripts/check-evidence.mjs:116`；证据六类：`MOXIAN.md:717` 与 `:731`、`GATES.md:208`、`domains/testing.md:86`、`templates/evidence-index.md:21`、`scripts/check-evidence.mjs:108`；卡状态：`MOXIAN.md:242` 与 `:472`、`GATES.md:264`、`templates/task-card.md:31`、`templates/change.md:77`；按批汇报：`MOXIAN.md:577` 与 `:981`、`ROLES.md:191`、`adapters/deepseek.md:78` | 前五项在两处以上完全一致。证据类型在 `TASK-MATRIX.md:119` 写成“取四值”，与表 9-2 的六类冲突。卡状态在规范性文件中统一为待派、进行中、已交付、已退回四值，检查清单要求五值，第五值在全部文件中没有定义。按批汇报在 `adapters/deepseek.md:78` 仍指向第 13 章 MX-13-01，现行唯一来源是 `MOXIAN.md:577` 的 MX-8-01。 |
| 5 采纳落地 | 部分通过 | 对账表第 3 至 6 节共 98 个数据行，状态为已落 82 行、只落计划 16 行；判定为采纳 32 条、改造后采纳 50 条、不采纳 16 条；四份清单首部候选数为 18、26、28、26；`MOXIAN.md:1164-1168` 表 C-1 的候选数与判定分布同对账表一致 | 82 条采纳类全部有正文落点。抽查 10 条中 9 条的文件与行号准确，1 条行号错误：`ABSORB-RECONCILE.md:142` 把增量覆盖率证据写成 `GATES.md:165`，该行是代码围栏，对应标题在 `GATES.md:171`、脚本映射在 `:245`。另用脚本核对 22 条带引号关键词的取证行，22 条全部命中。 |
| 6 迁移完成度 | 部分通过 | `AGENTS.md:28、30、33、37、41、48、56` 共 7 处指向 `docs/framework/`，在 `AGENTS.md` 全文检索停用文件名命中 0 行；9 份停用文件首行均含“停止使用”，其中 7 份在 `docs/process/`，2 份在 `.trash/pending-delete/mx-draft/docs/framework/_draft/`；根 `README.md:19` 与 `docs/README.md:4、18、58、59` 均指向框架入口或规则文件；`ADOPTION.md:34-36` 三步均记“已完成，2026-11-24” | 入口链接、停用提示与两份 README 的链接均已迁移。`AGENTS.md:30` 仍写“任何需求先开 spec.md”，与 `MOXIAN.md:316` 的 MX-5-01“先建 proposal.md、两份同批建立”不一致；`:56` 写语言标准 213 行，实际 216 行；`:61` 写六个脚本尚未实现，实际 `check-spec-language.mjs`、`scripts/ac/*.mjs`、`probe-cdp.mjs`、`ac-coverage.mjs`、`serve.ps1` 与汇总 runner 均已存在；`:63` 要求把并发规则写进第 8.2 节，现行 `MOXIAN.md:585-591` 只有 MX-8-08 至 MX-8-10。`ADOPTION.md:98-103` 仍有 6 条未决项。 |
| 7 文本规范 | 通过 | `docs/framework/` 全文统计：对照句式 3 处（`GATES.md:108、127、135`），感叹号 3 处（`GATES.md:109、126`），右向箭头符号 3 处（`GATES.md:109`），第二人称泛指 2 处（`GATES.md:111`） | 全部命中集中在 `GATES.md` 的规则定义、输出样例与围栏夹具内，规则正文与其余 27 份文件在正常叙述位置命中 0 处。 |
| 8 遗留清单 | 通过 | 合并 `ADOPTION.md:98-103`、`accept/ACCEPT-BATCH4-R2.md:99-105`、`accept/REPLAY-CHG-CONV-007.md:166-170`、`MOXIAN.md:1296-1307` 与 `WALKTHROUGH.md:164`，去重后见第三节 24 条 | 每条标出责任人、来源行号与阻断判断。阻断框架使用的条目为 0 条，阻断历史包收口的条目为 2 条。 |

## 二、问题清单

| 编号 | 严重度 | 问题 | 证据 | 影响与建议 |
|---|---|---|---|---|
| P-01 | 高 | 追溯门禁与语言门禁的扩展规则没有脚本实现，也没有登记为待建 | `GATES.md:239-246` 声称 `check-trace.mjs` 追加 A1 至 A6、`check-spec-language.mjs` 追加 R8 至 R12；`scripts/check-trace.mjs:5-21、965-975` 只有 T1 至 T6 与 R4；`scripts/check-spec-language.mjs:10-17、382-398` 只有 R1 至 R7；`MOXIAN.md:1307` 的 U-12 只列 MX-G-46、48、49、50；`scripts/check-gates.mjs:1839` 只跑结构门禁 | 追溯门禁对 AC 在 Covers、五列、两份 test-plan 与证据索引四处的核对不能自动执行，语言门禁对 R8 至 R12 不能自动执行。`REPLAY-CHG-CONV-007.md:28` 的 `check-trace` 返回 PASS 683 项，同时该报告 `:46` 指出它不核对变更包登记状态，二者叠加会形成假通过。建议把 11 条未登记规则补入 U-12 与 `GATES.md` 第 6 节，或在附录 B 明确这两道门禁暂按人工判据执行，并补齐失败样例。 |
| P-02 | 中 | 多份规范性文件仍标注草案或设计稿，后端域规范没有状态行 | `ROLES.md:3-4`、`EFFORT.md:3`、`GATES.md:2`、`domains/product-design.md:3`、`domains/frontend.md:3`、`domains/testing.md:3-5`、`templates/review.md:3`；`domains/backend.md:1-11` 无版本与状态 | 总册已 active，这些文件却被其他条款当作唯一来源引用，审计时无法证明其已冻结。建议逐份转 active 或写明冻结例外与批准人，后端域规范补首部版本与状态。 |
| P-03 | 中 | `TASK-MATRIX.md:119` 把证据类型写成“取四值”，与表 9-2 的六类冲突 | `TASK-MATRIX.md:119`；`MOXIAN.md:717、731`；`GATES.md:208`；`templates/evidence-index.md:21`；`domains/testing.md:86`；`scripts/check-evidence.mjs:108` | 执行者按矩阵写四值类型时，证据门会判非法类型并记 error。建议改为“证据类型取六类，判定结果取四值”。 |
| P-04 | 中 | 适配层、档位与角色文件保留四处过期引用 | `adapters/deepseek.md:78` 仍指第 13 章 MX-13-01；`adapters/deepseek.md:3` 版本绑定 `main v0.1-draft`；`EFFORT.md:3` 写与 `TASK-MATRIX.md` v0.1 同步，实际为 v0.3；`ROLES.md:33` 仍引 `docs/process/templates/task-card.md`，`:187` 仍写“第二批填充时引用” | 按适配文件执行按批汇报会引到已改作他用的 MX-13-01，按角色文件找模板会落到与框架模板并存的旧副本。建议统一改为第 8 章 MX-8-01、总册 v1.2、矩阵 v0.3 与 `docs/framework/templates/task-card.md`，并删除批次措辞。 |
| P-05 | 中 | `AGENTS.md` 入口索引保留四处过期事实 | `AGENTS.md:30` 写先开 spec.md，与 `MOXIAN.md:316` 的 MX-5-01 不一致；`:56` 写语言标准 213 行，实际 216 行；`:61` 写六个脚本尚未实现，实际均已存在；`:63` 写把并发规则写入第 8.2 节，现行第 8.2 节只有 MX-8-08 至 MX-8-10 | 入口文件是会话首先读到的索引，过期事实会直接改变开工动作。建议按现行总册与脚本清单改写这四行，并把“下阶段”段落改为带日期的计划或删除。 |
| P-06 | 低 | 对账表一条证据行号错误 | `ABSORB-RECONCILE.md:142` 写 `GATES.md:165` 命中增量覆盖率门禁，`GATES.md:165` 实际是代码围栏，对应内容在 `:171` 与 `:245` | 抽查复跑时按该行号取不到证据。建议改为 `GATES.md:171` 或 `:245`。 |
| P-07 | 中 | 检查清单要求卡状态五值，规范文件统一为四值 | `MOXIAN.md:242` 与 `:472`、`GATES.md:264`、`templates/task-card.md:31`、`templates/change.md:77` 均为四值；`ACCEPT-BATCH4-R2.md:18` 记录五值写法已清零 | 按检查清单验收会判文档缺第五值，按文档执行会与清单不符。第五值在全部文件中没有定义，建议由清单方确认：若确认四值，更新检查清单；若确认五值，先改 `MX-7-15` 与三处模板，再同步门禁。 |

## 三、遗留清单

合并口径：取 `ADOPTION.md` 第 98 至 103 行的 6 条、`accept/ACCEPT-BATCH4-R2.md` 第 99 至 105 行的 7 条、`accept/REPLAY-CHG-CONV-007.md` 第 166 至 170 行的 5 条、`MOXIAN.md` 附录 D.5 第 1296 至 1307 行的 12 条，以及 `WALKTHROUGH.md:164` 的未验证项。同一事实在多处登记时合并为一行，来源列写全部出处。

“是否阻断使用”按新变更能否按墨线继续执行判断。历史包自身的收口阻断在括号内单列，不计入框架使用的阻断数。

| 序 | 事项 | 来源 | 责任人 | 是否阻断使用 |
|---:|---|---|---|---|
| 1 | U-12：MX-G-46、48、49、50 的脚本实现、失败样例与固定夹具未建立 | `MOXIAN.md:1307`；`ACCEPT-BATCH4-R2.md:99、104`；`GATES.md:268` | Lead，各门禁签发角色 | 否（按 GATES 第 6 节与 TASK-MATRIX:190 人工执行） |
| 2 | 附录 A 与 D.7 仍写 50 条 MX-G 规则，MX-9-23 仍无规范性入向引用 | `MOXIAN.md:1087、1319、1331`；`ACCEPT-BATCH4-R2.md:99` | Lead | 否 |
| 3 | 对账表第 197、207、211 行仍写附录 C 没有逐条列候选名与重启条件，与表 C-2 冲突 | `ABSORB-RECONCILE.md:197、207、211`；`ACCEPT-BATCH4-R2.md:100` | 附录 C 维护人，Lead 确认 | 否 |
| 4 | MX-7-16 把任务卡状态的同批写法指向 `templates/change.md` 第 9 节，实际在第 6 节 | `MOXIAN.md:473`；`ACCEPT-BATCH4-R2.md:101` | Lead | 否 |
| 5 | TASK-MATRIX 第 190 行仍写 MX-G-46 至 MX-G-50 尚未建立，与 U-12 现状不一致 | `TASK-MATRIX.md:190`；`ACCEPT-BATCH4-R2.md:102` | Lead | 否 |
| 6 | ROLES 表 3 仍是八字段检查点，总册表 8-1 为七字段 | `ROLES.md:142-153`；`MOXIAN.md:603-621`；`ACCEPT-BATCH4-R2.md:103` | Lead，ROLES owner 配合 | 否（按表 8-1 执行） |
| 7 | 前端域第 5.1 节 G5 的基线仍为 1600、1280、1180、375 四档，缺 768 档 | `domains/frontend.md:194`；`MOXIAN.md:698、825`；`ACCEPT-BATCH4-R2.md:103` | 前端域 owner，Lead 复核 | 否（按 MX-9-11 与 MX-10-12 执行） |
| 8 | 真实仓库没有 `specs/test/<域>/fixtures/manifest.json` 与 `specs/contract/<域>/contract.md`，MX-G-51 与 MX-G-52 没有真实输入 | `ACCEPT-BATCH4-R2.md:105`；`GATES.md:268` | 测试 owner 提供夹具清单，设计 owner 提供域契约表 | 否（首个新变更包落地时补） |
| 9 | U-02：附录 A 至附录 C 的维护人未定 | `MOXIAN.md:1297`；`ABSORB-RECONCILE.md:207` | Lead | 否 |
| 10 | U-04：四份采纳清单的落点章号口径未统一 | `MOXIAN.md:1299`；`ABSORB-RECONCILE.md:205` | Lead | 否 |
| 11 | U-05：视觉回归容差与不稳定用例清单路径待定，容差已由 MX-9-11 定为像素差 0，`docs/testing/flaky.md` 仍待建 | `MOXIAN.md:1300、698` | 验收 | 否 |
| 12 | U-07：归档目录与索引的最终形态未定，现行 MX-11-11 按只更新索引执行 | `MOXIAN.md:1302、897` | Lead | 否 |
| 13 | U-09：回放报告后四项冲突的取值仍待产品 owner 确认 | `MOXIAN.md:1304`；`REPLAY-CHG-CONV-007.md:166` | 产品 owner | 否 |
| 14 | U-11：`docs/plan/DECISIONS.md` 的 DEC-11 条目未回写 MX-5-01 与 MX-5-08 | `MOXIAN.md:1306`；`ACCEPT-BATCH4-R2.md:103` | Lead | 否 |
| 15 | `SDD-STANDARD.md` 的范围在表 1-2 写第 1 至 7 章，文件实际到第 4.6 节 | `ADOPTION.md:98` | Lead | 否（旧文件已停用） |
| 16 | `docs/process/skills/`、`standards/` 与 `research/` 三个子目录未逐份核对 | `ADOPTION.md:99` | Lead | 否 |
| 17 | 契约表补建的责任人未定，`specs/contract/` 目录尚不存在 | `ADOPTION.md:100` | Lead | 否（阻断 CHG-CONV-006 与 CHG-CONV-007 的补登记收口） |
| 18 | `component-system.md`、`COMPONENT-PARITY-GATE.md`、`PRODUCTION-CUTOVER.md` 与 `SPEC-STANDARD.superseded.md` 未列入处置清单 | `ADOPTION.md:101` | Lead | 否 |
| 19 | `docs/CONTINUITY.md:27、54` 与 `docs/tasks/STATUS.md:40、48` 仍把 `docs/process/FRAMEWORK.md` 当现行流程引用 | `ADOPTION.md:102` | Lead | 否 |
| 20 | `GATES.md:36`、`MOXIAN.md:741`、`domains/testing.md:193` 的条文正文仍以停用文件为落点，已加停用说明 | `ADOPTION.md:103` | Lead | 否 |
| 21 | 回放报告记载的检查点是否存在有冲突：异常登记写未落盘，事故现场写 22:16 已落盘 | `REPLAY-CHG-CONV-007.md:167` | Lead，产品复核 | 否（历史包 CHG-CONV-007） |
| 22 | 回放报告列出三条门禁脚本限制：`MX-G-43` 未实现、`check-trace` 不查变更包登记、`check-gates` 按旧八节模板核对 | `REPLAY-CHG-CONV-007.md:168` | Lead | 否（`MX-G-43` 已由 `check-evidence.mjs` 实现，其余待复评） |
| 23 | CHG-CONV-007 的 18 条失败测试按出口 A 回滚或出口 B 前向修，以及出口 B 未经用户确认 | `REPLAY-CHG-CONV-007.md:169-170` | 用户 | 否（阻断 CHG-CONV-007 收口） |
| 24 | 48 格矩阵覆盖依赖人工计数，没有脚本复核 | `WALKTHROUGH.md:146-164` | 验收 | 否 |

`WALKTHROUGH.md:164` 的六条未验证项中，脚本、模板、DEC-11 与视觉阈值四条并入本表第 1、6、7、11、13、14 行，48 格人工计数单列为第 24 行，六条新规缺独立条号一条已由现行总册的 MX-5-20、MX-6-16、MX-9-23、MX-12-18 与 GATES MX-G-46、MX-G-47 解决，不再单列。

## 四、未验证项

1. 82 条采纳落点未逐条重读，只抽查 10 条并用脚本核对 22 条带引号关键词的取证行。
2. 48 格矩阵没有脚本复核，本次只核对状态行、待填充计数与 `TASK-MATRIX.md:186` 的“待填充 0 格”。
3. 四个门禁脚本的自检夹具按脚本设计移入工作区隔离目录 `.tmp/_gate-trash/`，没有持久化保存，跨会话复跑需要重新生成。
4. 真实仓库没有域契约表与夹具清单，MX-G-51 与 MX-G-52 只在自检夹具上验证，没有真实输入。
5. 浏览器、CDP 与端到端测试未执行，本次范围是文档、脚本与静态口径。
6. `WALKTHROUGH.md` 与 `ACCEPT-BATCH4.md` 中的旧行号属于历史快照，本次只核对现行文件，不追改历史报告。

## 五、下一步建议

1. 在 v1.3 首批把 P-01 的 11 条规则登记为 U 编号，补齐 `check-trace.mjs` 的 AC 四处核对、`check-spec-language.mjs` 的 R8 至 R12 与失败样例；未补齐前在附录 B 把这两道门禁标为人工执行。
2. 把 `ROLES.md`、`EFFORT.md`、`GATES.md`、三份域规范与 `templates/review.md` 的状态改为 active 或写明冻结例外，`domains/backend.md` 补版本与状态行。
3. 修正 P-03 至 P-06 的文字与行号，涉及 `TASK-MATRIX.md:119`、`adapters/deepseek.md:3、78`、`EFFORT.md:3`、`ROLES.md:33、187`、`AGENTS.md:30、56、61、63` 与 `ABSORB-RECONCILE.md:142`。
4. 按 `ACCEPT-BATCH4-R2.md` 第六节关闭 7 条遗留，优先处理 50 条改 52 条、对账表第 197、207、211 行、MX-7-16 的节号与 `TASK-MATRIX.md:190`。
5. 回写 `ROLES.md` 表 3 的七字段与 `domains/frontend.md` 第 5.1 节的 768 档，关闭 U-10 的两项。
6. 首个新变更包落地时补 `specs/contract/<域>/contract.md` 与 `specs/test/<域>/fixtures/manifest.json`，按 MX-G-51 与 MX-G-52 各跑一次真实样例。
7. 由用户对 CHG-CONV-007 的出口 A 与出口 B 作出裁决，裁决前该包保持异常状态。
8. 由清单方确认卡状态取四值还是五值；确认四值后更新检查清单，确认五值时先改 MX-7-15 与三处模板。

## 自检记录

本报告只新建 `docs/framework/accept/ACCEPT-FINAL.md`，没有修改任何被查文件。核对用命令为 `Get-Content` 行数统计、`Select-String` 行号取证、`[System.IO.File]::ReadAllLines` 编码安全读取，以及固定路径 Node 运行时 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` 的四次 `--self-test`。

四个自检结果：`check-gates.mjs` 12 项、退出码 0；`check-contract.mjs` 14 项、退出码 0；`check-incremental-coverage.mjs` 14 项、退出码 0；`check-evidence.mjs` 11 项、退出码 0。

八项结果为：1 部分通过、2 通过、3 部分通过、4 部分通过、5 部分通过、6 部分通过、7 通过、8 通过。

问题清单 7 条，其中高 1 条、中 5 条、低 1 条。遗留清单 24 条，阻断框架使用 0 条，阻断历史包收口 2 条。

报告行数在交付时按 `Get-Content` 计数。

## 修复记录

修复日期：2026-11-24。修复角色：mx-fix-final。下列行号均为修复后的现行行号。

| 问题 | 文件与行号 | 改法 |
|---|---|---|
| P-01 | `GATES.md:10`、`:239`、`:244`、`:245`、`:247`、`:252`、`:267`、`:276`；`MOXIAN.md:1124`、`:1154`、`:1309` | 在 GATES 第 4 节映射表把 A1 至 A6 与 R8 至 R12 标为尚未实现，`MX-G-14` 至 `MX-G-19` 与 `MX-G-21` 至 `MX-G-25` 按人工判据执行并写明责任人；`MX-G-01` 增补人工判据按已执行计的例外；第 5 节注明既有自检不覆盖这 11 条规则；第 6 节与 U-12 同步登记。总册附录 B 增补六道门禁的脚本实现状态段，并修正样例段对追溯与语言自检覆盖范围的描述。 |
| P-02 | `ROLES.md:3`、`:4`、`:210`；`EFFORT.md:3`；`GATES.md:2`；`domains/product-design.md:3`；`domains/frontend.md:3`；`domains/testing.md:3`、`:5`；`domains/backend.md:3`、`:4`；`templates/review.md:3`；`ABSORB-RECONCILE.md:89` 至 `:116`、`:165` 至 `:167`、`:190` 至 `:192` | 八份规范性文件由 draft、设计稿或草案转为 active，统一写明 2026-11-24 随第四批复验冻结；`domains/backend.md` 补版本、状态与位置三行，并把对账表中 `domains/backend.md` 的 34 处带文件名引用与三处相对行号按新增四行整体后移。 |
| P-03 | `TASK-MATRIX.md:119` | 把“证据类型取四值”改为“证据类型取六类，判定结果取四值”。 |
| P-04 | `adapters/deepseek.md:3`、`:73`、`:77`、`:78`；`EFFORT.md:3`、`:116`；`ROLES.md:33`、`:187` | 按批汇报引用改为第 8 章 MX-8-01；版本绑定改为总册 v1.2；档位文件改为与矩阵 v0.3 同步；任务卡模板路径改为 `docs/framework/templates/task-card.md`；删除第二批填充措辞。 |
| P-05 | `AGENTS.md:30`、`:56`、`:57`、`:61`、`:63` | 第 30、56、61、63 行按要求改写：变更入口改为 proposal.md 与 spec.md 同批建立；语言标准行数改为 216 行、裁决编号改为 DEC-11 至 DEC-31；六个脚本改为已落地并列出未实现的门禁规则；并发规则一条改为第 8.2 节现状与待写入内容。另按用户点名的入仓提交号同步第 57 行，写为本地 `f4781853` 与远端 `165887cc` 的现状。 |
| P-06 | `ABSORB-RECONCILE.md:142` | 把 `GATES.md:165` 改为现行 `GATES.md:175` 的标题行与 `:249` 的脚本映射行。 |
| P-07 | `MOXIAN.md:242`、`:471`、`:472`、`:473`、`:533`、`:556`、`:1261`、`:1307`；`GATES.md:38`、`:39`、`:272`；`TASK-MATRIX.md:89`；`templates/change.md:7`、`:77`、`:83`；`templates/task-card.md:5`、`:31`、`:65` | 任务卡状态在表 3-3 定义为五值并逐值写明含义，作为唯一定义处；MX-7-14、MX-7-15、MX-7-16、表 7-4、派单卡模板、D.4 第三条、U-10 状态说明、结构门禁与派单门改为引用表 3-3；两份模板删去自带的四值定义，改为引用表 3-3。 |

修复后的自检结果：`check-gates.mjs` 12 项 PASS、退出码 0；`check-contract.mjs` 14 项 PASS、退出码 0；`check-incremental-coverage.mjs` 14 assertions PASS、退出码 0；`check-evidence.mjs` 11 assertions PASS、退出码 0。另跑 `check-trace.mjs` 与 `check-spec-language.mjs` 的 `--self-test`，前者 11 assertions PASS，后者 SELF-TEST PASS，退出码均为 0。四个门禁脚本均使用 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` 执行。

本轮修复未提交、未推送。报告第三节的 24 条遗留清单、`docs/framework/README.md` 第 54 至 60 行的遗留索引、历史报告中的旧行号与 `ADOPTION.md` 的 6 条未决项不在本次范围；`adapters/README.md:44、46` 的旧版本示例未被报告点名，本轮未改。

复验结论：7 条问题逐条核对后判定均已修复，复验通过。
抽查依据：P-01 见 `GATES.md:10、239、244、245、247、252、267、276` 与 `MOXIAN.md:1124、1154、1309`；P-02 见八份文件首部与 `ABSORB-RECONCILE.md:89 至 116` 的行号后移；P-03 见 `TASK-MATRIX.md:119`；P-04 见 `adapters/deepseek.md:3、73、77、78`、`EFFORT.md:3、116`、`ROLES.md:33、187`；P-05 见 `AGENTS.md:30、56、57、61、63`；P-06 见 `ABSORB-RECONCILE.md:142` 已改指 `GATES.md:175` 与 `:249`；P-07 见 `MOXIAN.md:242、471 至 473、533、1261、1307`、`GATES.md:38、39、272`、`TASK-MATRIX.md:89` 与两份模板的引用行。
四个门禁脚本以 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` 重跑 `--self-test`，`check-gates.mjs` 12 项、`check-contract.mjs` 14 项、`check-incremental-coverage.mjs` 14 项、`check-evidence.mjs` 11 项，全部 PASS 且退出码均为 0。
两处确认：表 3-3 第 242 行给出待派、进行中、待验收、已通过、打回五值并逐值写明含义，`templates/change.md:7、77、83` 与 `templates/task-card.md:5、31` 只引用表 3-3，未重写定义；`GATES.md` 第 4 节第 239、244、245、247、252 行把未实现的 11 条规则标为按人工判据执行，并分别写明责任人。
仍存项有一处：`MOXIAN.md:619` 仍写“表 3-3 的四套状态词”，与表 3-3 现有五组状态不一致，属表述残留，不影响 7 条问题的结论；历史验收报告中的四值写法按快照保留。

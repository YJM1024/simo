# 墨线框架采纳说明

状态：active v1.7.3，2026-11-25。位置：`docs/framework/ADOPTION.md`。适用范围：本工作区所有引用旧流程文件的会话、模板与变更包。迁移完成日期为 2026-11-24，本版只同步版本号。

旧流程文件的处置已经确定，9 份停止使用并在文件顶部加了提示，`SPEC-STANDARD.md` 与两个模板目录继续有效，入口与模板引用的改写按三步顺序执行。执行依据只有 [`MOXIAN.md`](MOXIAN.md) 一份，旧文件只保留历史内容供追溯。框架版本与修订记录以该文件首部与附录 D 为准。

## 旧文件对照

对照表逐份列出旧文件在墨线里的位置与处置方式，位置写到章号或文件，处置分继续有效、部分条款被取代、停止使用三类。表内的链接按文件自身所在目录书写，草稿两行用工作区相对路径标注当前位置。每行的处置标签与文件首行的提示一致，继续有效的文件不加提示。

| 旧文件 | 墨线中的位置 | 处置 |
|---|---|---|
| [`PROCESS.md`](../process/PROCESS.md) | 第 5 章变更包状态机、第 10 章三层验收、第 11 章收口、第 13 章复盘 | 部分条款被取代；状态机、验收与复盘改由第 5、10、11、13 章执行，其余停止使用 |
| [`RUNBOOK.md`](../process/RUNBOOK.md) | 第 5 章至第 11 章的阶段顺序、第 7 章派单、第 8 章执行 | 部分条款被取代；阶段顺序并入章序，其余停止使用 |
| [`SIX-DIM.md`](../process/SIX-DIM.md) | 第 1 章框架自证标准、第 13 章度量；六维基线保留在全局 `AGENTS.md` | 部分条款被取代；六维基线由全局 `AGENTS.md` 保留，其余停止使用 |
| [`FRAMEWORK.md`](../process/FRAMEWORK.md) | 第 4 章任务类型引用 `TASK-MATRIX.md`、第 5 章入口、附录 B 门禁引用 `GATES.md`、组件登记门 | 部分条款被取代；门禁与任务类型分别由 `GATES.md` 与 `TASK-MATRIX.md` 执行，其余停止使用 |
| [`ROLES.md`](../process/ROLES.md) | 第 2 章角色与职责，唯一来源为 `docs/framework/ROLES.md` | 停止使用；只作历史，角色以 `docs/framework/ROLES.md` 为准 |
| [`SCENARIOS.md`](../process/SCENARIOS.md) | 第 4 章判级与 `TASK-MATRIX.md` 的八类任务 | 部分条款被取代；六场景并入八类任务，其余停止使用 |
| [`SDD-STANDARD.md`](../process/SDD-STANDARD.md) | 第 1 章至第 4 章的早期条文，文件到第 4.6 节结束 | 停止使用；只作历史 |
| `docs/framework/_draft/ch1-7.md`（已移入隔离目录） | 第 1 章至第 7 章正文的来源草稿 | 停止使用；只作历史，现位于 `.trash/pending-delete/mx-draft/docs/framework/_draft/` |
| `docs/framework/_draft/ch8-13.md`（已移入隔离目录） | 第 8 章至第 13 章与附录 A 至附录 D 正文的来源草稿 | 停止使用；只作历史，现位于 `.trash/pending-delete/mx-draft/docs/framework/_draft/` |
| [`SPEC-STANDARD.md`](../process/SPEC-STANDARD.md) | 第 3 章 AC 语言与第 6 章五列字段，MX-1-06 与 MX-6-02 引用其第 2 节 | 继续有效；作为第 3 章与第 6 章的引用来源 |
| [`docs/process/templates/`](../process/templates/)（12 份） | 附录 A 的沿用模板条目 | 继续有效；作为附录 A 的沿用模板 |
| [`docs/framework/templates/`](templates/)（5 份） | 第 6 章契约表、第 7 章任务卡、第 10 章评审、第 9 章证据索引、第 5 与第 11 章变更包 | 继续有效；作为第 5 章至第 11 章的模板 |

继续有效的 18 份文件不加停用提示，其余 9 份已在首行加提示，其中 2 份草稿随移动进入隔离目录。停用提示的链接按文件位置区分，`docs/process/` 下 7 份写 `../framework/MOXIAN.md`，草稿在移入隔离目录前写 `../MOXIAN.md`，该链接在隔离目录下不再解析。对照表的 12 行中，继续有效 3 行、部分条款被取代 5 行、停止使用 4 行，覆盖 9 份停用文件与 18 份继续有效文件。

## 迁移顺序

迁移按入口、模板引用、旧文件停用三步执行，前一步的完成判据满足后才进入下一步。三步已于 2026-11-24 全部完成，下表记录动作、完成判据与状态，复查命令与结果见本节末。

| 步骤 | 动作 | 完成判据 | 状态 |
|---|---|---|---|
| 1 | 改入口：`AGENTS.md` 的 7 行与 `README.md` 的 1 行改为指向 MOXIAN 章号、`docs/framework/ROLES.md` 或 `docs/framework/TASK-MATRIX.md` | 两个文件不再引用已停用文件，`SPEC-STANDARD.md` 的 3 处引用保留 | 已完成，2026-11-24 |
| 2 | 改模板引用：`docs/process/templates/` 下 8 份模板的 9 行改为指向 `docs/framework/` 下的对应文件或章号 | 模板目录不再引用已停用文件，字段与第 11 章回写补丁一致 | 已完成，2026-11-24 |
| 3 | 停用旧文件：9 份保留原文与首行提示，2 份草稿已按附录 D.6 移入隔离目录 | 首行提示齐全，移动结果与附录 D.6 的记录一致 | 已完成，2026-11-24 |

三步的顺序不能调换。入口先改，后续会话读到的执行依据才是墨线；模板其次，派单与记录才不沿用旧字段；停用最后，旧文件在被引用期间仍有提示可查。

### 复查记录（2026-11-24）

步骤 1 与步骤 2 由迁移角色 mx-migrate-refs 完成，复核范围为链接改写，模板字段未改。步骤 3 的首行提示与草稿移动已在此前完成，本轮只核对结果。三步的完成判据均已满足。

复查命令在仓库根执行，统计 `AGENTS.md`、工作区根 `README.md`、`docs/framework/` 与 `docs/process/templates/` 四个范围内指向停用文件的 Markdown 链接。

```powershell
$files = @((Get-Item AGENTS.md), (Get-Item README.md))
$files += Get-ChildItem docs/framework -Recurse -Filter *.md -File
$files += Get-ChildItem docs/process/templates -Filter *.md -File
$files | Select-String -Pattern '\]\([^)]*(PROCESS|RUNBOOK|SIX-DIM|FRAMEWORK|SCENARIOS|SDD-STANDARD)\.md'
```

结果为 42 个文件中命中 6 行，全部是本文件第 13、14、15、16、18、19 行对照表里的停用文件链接，属于对照表允许的例外。`AGENTS.md`、工作区根 `README.md`、`docs/framework/templates/` 与 `docs/process/templates/` 的命中数均为 0。把 `ROLES` 一并纳入链接检查后，`AGENTS.md` 第 33 行已指向 `docs/framework/ROLES.md`，指向已停用 `docs/process/ROLES.md` 的链接只剩本文件第 17 行的对照表。五个新目标路径 `docs/framework/MOXIAN.md`、`docs/framework/ROLES.md`、`docs/framework/TASK-MATRIX.md`、`docs/framework/GATES.md` 与 `docs/framework/templates/` 均存在。

正文里仍有 7 处提及把停用文件当作现行依据，它们不是 Markdown 链接，不在本轮 scope，当时登记在未决点，收尾轮已处理，见下一节复查记录。9 份停用文件的停用提示与 2 份草稿的移动结果已在步骤 3 核对，提示齐全，附录 D.6 记录的隔离路径存在。

入口改写的 scope 为 `AGENTS.md` 与 `README.md`，模板改写的 scope 为 `docs/process/templates/`。停用核对由验收角色复核，结果记录在本文件。任务卡按第 7 章的五项填写，证据列写复核命令与输出。

### 复查记录（2026-11-24，收尾轮）

本轮处理上一轮登记的三项文档漂移。`docs/README.md` 第 4、18 行改为指向 `docs/framework/README.md`，第 58、59 行改为指向 `docs/framework/README.md` 与 `docs/framework/TASK-MATRIX.md`；`docs/framework/README.md` 第 62 行改为步骤 1 与步骤 2 已完成，并补记步骤 3 也已完成。7 处非链接引用按落点性质分开处理，其中 4 处改指墨线对应章，3 处只在原处加停用说明。

改指的四处在说明性引用位置：`GATES.md` 第 172 行与 `absorb/testing.md` 第 72 行改指 `MOXIAN.md` 第 9.4 节的 MX-9-21 与 MX-9-22；`absorb/frontend.md` 第 19 行改指 `domains/frontend.md` 第 2.2 节、第 2.3 节与第 8 节；`absorb/testing.md` 第 5 行改指 `MOXIAN.md` 第 9.4 节、`domains/testing.md` 第 4 节与 `domains/backend.md` 第 8.6 节。加注的三处属于规则正文的落点：`GATES.md` 第 36 行、`MOXIAN.md` 第 741 行与 `domains/testing.md` 第 193 行各加一句「该文件已停用，条款以墨线为准」，规则内容未改。

复查在仓库根执行。链接检查用 `Select-String -Path docs/README.md,docs/framework/README.md -Pattern 'process/(FRAMEWORK|SCENARIOS)\.md'`，命中 0 行；对 `docs/framework/` 递归扫描 `FRAMEWORK.md`、`SCENARIOS.md`、`SDD-STANDARD.md`、`PROCESS.md`、`RUNBOOK.md` 与 `SIX-DIM.md` 六个文件名，剩余命中全部属于四类：本文件的对照表、复查记录与未决点，总册第 1 章与附录 D 的历史记录，三处加注行，以及 `accept/` 下的历史验收报告。本轮新引用的 `docs/framework/README.md`、`docs/framework/TASK-MATRIX.md`、`docs/framework/ROLES.md`、`docs/framework/MOXIAN.md`、`docs/framework/domains/testing.md` 与 `docs/framework/domains/backend.md` 均存在。

仍存项见下一节未决点，共六条。本轮未删除文件，未改动代码与 spec。

## 旧变更包的补登记

`CHG-CONV-006` 与 `CHG-CONV-007` 按旧结构建立，两个目录都已有 `proposal.md` 与 `spec.md`，同批建立的要求已经满足，补登记不新建目录、不搬文件、不重写正文。两包共同缺的字段有类型判级、规模判级、验收人、冻结时间、契约表路径与冻结记录、追溯矩阵登记。`CHG-CONV-006` 的 `proposal.md` 第 3 行记 `draft`，`spec.md` 第 3 行记 `accepted`，两处状态不一致，补登记时以验收报告 `ACCEPT-CONV-9-20261122.md` 的结论为准记已验收。

补登记只补必要字段，字段与写入位置见下表。表中的字段按现有文件补写，不在正文增加新章节。补写内容与旧条文分开存放，读者能区分历史正文与本次补登。

| 字段 | 写入位置 | 取值来源 |
|---|---|---|
| 变更号 | `proposal.md` 与 `spec.md` 首部 | 目录名，已存在 |
| 状态 | 同上 | 表 5-3 的七值，旧状态词按事实映射 |
| 类型判级 | 同上 | MX-4-01 的八类主类型与最多两个附加类型 |
| 规模判级 | 同上 | 表 5-1 的三档 |
| 验收人与冻结时间 | 同上 | 验收报告签字人与首次冻结日期 |
| 契约表路径、冻结时间、冻结人、变更单号 | `spec.md` 的契约索引行 | MX-6-14；没有契约表时先补建 |
| 追溯登记 | `docs/product/TRACEABILITY.md` | 主域、状态与 owner |

补登记的具体动作有四件。第一，在两个文件首部加一行登记块，冻结时间取首次冻结日期，没有记录的写补登记日期并注明「补登记」。第二，在 `spec.md` 加契约表登记行，两包目前都没有 `specs/contract/` 目录，需要先补建域契约表，只登记本次涉及的契约项。第三，更新 `docs/product/TRACEABILITY.md`，`CHG-CONV-007` 在第 75 行仍写「待建」，与目录已存在的事实不一致。第四，在 `proposal.md` 末节加一行补登记录，写日期、执行人与所补字段。

历史结论不追改。已冻结的 AC 编号、变更级 AC、证据与验收签字保持原样，补登记不改旧条文、不重排编号、不补写当时没有的判据。需要改历史结论时另开变更包，按第 12 章与附录 D 登记。

## 过渡期规则

1. 旧文件被引用时以墨线为准，引用处写 MOXIAN 的章号或规则编号，旧文件条文只作背景，不作为判定依据（MX-1-07）。
2. 冲突在发现后 24 小时内登记为未决点，写清文件、行号与两种取值，由 Lead 裁决后回写，临时口径在下一版删除（附录 D.4）。
3. 已签字的变更包不受停用影响，历史结论不追改，停用只改变新工作的引用来源（附录 D.4）。
4. 新工作不引用已停用文件的条款编号，需要引用旧文件时写成历史背景，并给出 MOXIAN 的对应位置。

## 未决点

- `SDD-STANDARD.md` 的范围：表 1-2 写它的条文范围是第 1 至 7 章，文件实际到第 4.6 节结束，表 1-2 或该文件需在下一版对齐。
- `docs/process/skills/`、`standards/` 与 `research/` 三个子目录未逐份核对，处置待下一轮补充。
- 契约表补建的责任人未定：`specs/contract/` 目录尚不存在，两包补登记前需要先建域契约表，并由 Lead 指派执行人。
- `docs/process/` 下的 `component-system.md`、`COMPONENT-PARITY-GATE.md`、`PRODUCTION-CUTOVER.md` 与 `SPEC-STANDARD.superseded.md` 未列入本次清单，处置待定；`RELEASE-CHECKLIST.md` 已被附录 A 引为现行，保持有效。
- `docs/CONTINUITY.md` 第 27、54 行与 `docs/tasks/STATUS.md` 第 40、48 行仍把 `docs/process/FRAMEWORK.md` 当现行流程文件引用，不在本轮 scope，待下一轮按同一口径改指。
- `GATES.md` 第 36 行、`MOXIAN.md` 第 741 行与 `domains/testing.md` 第 193 行的条文正文仍以停用文件为落点，本轮已加停用说明，条文改写按附录 D 记版本后另做。

## 维护

本文件随 MOXIAN 的版本修订同步更新，旧文件处置变化时先改本文件再动旧文件。新增旧文件或调整处置时，在对照表加一行并在末节记录日期与执行人。引用本文件时写路径，不复制表内容。每轮版本收口时核对一次对照表与各文件首行提示，差异超过 24 小时未登记的按过渡期规则第 2 条处理。

版本记录：v1.7，2026-11-25，随 v1.6 修订版同步版本号；v1.7.1，2026-11-25，作为维护版同步版本号；v1.7.2，2026-11-25，作为补登版同步版本号，契约门四项检查、组件 spec 模板补登、语言门误报规则与矩阵提示归零同批登记；v1.7.3，2026-11-25，作为维护版同步版本号，推理档位口径收窄到四类 `max` 场合，日常验收与契约设计改 `high`；旧文件处置与三步迁移结论不变，迁移完成日期仍为 2026-11-24。

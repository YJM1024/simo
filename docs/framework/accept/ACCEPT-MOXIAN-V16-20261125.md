# 墨线 SDD 框架 v1.6 验收报告

状态：已验收，验收人 mx-accept-v16c，验收日期 2026-11-25。日期：2026-11-25。范围：框架总册、四份附属规范、四份域规范、框架入口说明与审核事件模板的版本收口，以及四处口径一致性修正。结论：矩阵覆盖率门与契约门实跑通过，六脚本自检与性能脚本自检合计 107 项通过；全仓 `check-gates` 的 127 error、322 warning 是修复前基线，已由 kd-01 修复清零，127→62→0 的归因见 `specs/changes/CHG-MOXIAN-V16/evidence.md` 的 E-AC-CHG-MOXIAN-V16-11-03；本报告列 6 条已知欠账，均不阻断冻结，第 7 节验收人签字栏已填写。

本报告的证据取自 2026-11-25 本轮实跑的命令输出与改动后的文件正文。凡写入“PASS”的检查项，均在本轮由本机 Node 直接执行并核对末行输出；未执行的检查项写 `missing` 并注明，不以历史结论代替。行号在落笔前逐条用检索现查，不再沿用旧报告的行号。

## 1 范围与版本

本版把框架统一到 v1.6，统计口径固定为 284 条规则、41 个角色、21 道门禁与 68 条门禁规则。十三章与附录 A 至 D 的结构不变，本轮不新增或删除规则，四份附录与四份域规范的规则编号全部沿用。改动只落在 `docs/framework/` 下 11 个文件，没有删除任何文件，也没有执行任何 git 命令。

十个框架文件的版本行与入口说明已统一为 v1.6，审核事件模板单独升 v1.1。`docs/framework/MOXIAN.md` 行 3 写 `版本：v1.6`，行 5 的状态叙述补入 v1.6 一段；表 D-2 行 1374 新增 v1.6 版本行；D.7 行 1474 的自查首句改为 v1.6 口径；D.8 行 1487 在冻结记录表追加 v1.6 待验收行。`docs/framework/README.md` 行 42 写总册 v1.6 与 v1.6 验收报告路径，行 19 的门禁条数由 52 改为 68。

附属文件与域文件的版本落点如下表，行号均为本次改动后的现行行号。

| 文件 | 版本落点 | 本次改动 |
|---|---|---|
| `docs/framework/MOXIAN.md` | 行 3、行 5、表 D-2 行 1374、D.7 行 1474、D.8 行 1487 | 版本升 v1.6，补状态叙述，登记 v1.6 版本行、自查口径与待验收记录 |
| `docs/framework/TASK-MATRIX.md` | 行 3、行 130 | 首部已为 v1.6，插件市场审核门行补三条人员分离 |
| `docs/framework/GATES.md` | 行 2、第 3.14 节行 339 至 343 | 首部已为 v1.6，检查项、判定值与责任人按三角色分工改写 |
| `docs/framework/ROLES.md` | 行 3、行 4、行 208、行 227 | 首部已为 v1.6，MX-R-40 补六项字段，版本记录保持 41 条 |
| `docs/framework/EFFORT.md` | 行 3、行 143 | 状态改 active v1.6，第 8 节追加 v1.6 变更记录行 |
| `docs/framework/README.md` | 行 19、行 42 | 门禁条数改 68，总册版本与验收报告路径改 v1.6 |
| `docs/framework/domains/frontend.md` | 行 3 | 版本升 v1.6，补一句同步说明 |
| `docs/framework/domains/backend.md` | 行 3、行 4 | 版本升 v1.6，补一句同步说明 |
| `docs/framework/domains/testing.md` | 行 3、行 5 | 版本升 v1.6，补一句同步说明 |
| `docs/framework/domains/product-design.md` | 行 3 | 版本升 v1.6，补一句同步说明 |
| `docs/framework/templates/audit-events.md` | 行 3、行 16、行 28 至 32、行 38、行 45 | 模板版本升 v1.1，示例执行人与判定改为三角色分工 |

## 2 覆盖率证据

矩阵覆盖以 `scripts/check-matrix-coverage.mjs` 的本轮实跑为准。主矩阵 48 格与第 8 节附加类型 18 格全部有取值，合计 66/66，覆盖率 100.0%；动作、模板、门禁三列各 66/66 字段齐全；缺失清单为空。脚本末行为 `PASS (gate: matrix, checks: 66, warnings: 7)`，7 条 warning 是组件 spec、ADR 与 repro 按产物类型核对时的既有提示，不构成缺格。

门禁引用由 v1.5 的 84/84 增至 96/96，增量来自第 3.9 至 3.15 节七道门禁在矩阵各行的引用格。规则引用 27/27，总册命中 11 条、伴随册命中 16 条；模板引用 102/102，其中独立模板文件 95、按产物类型核对 7、无模板 4。以上三类引用的编号均在 `MOXIAN.md`、`GATES.md`、`ROLES.md` 或四份域规范内有定义，没有悬空编号。

契约覆盖以 `scripts/check-contract.mjs` 的本轮实跑为准。校验对象是 `specs/contract/CONV/contract.md`，MX-G-26、MX-G-27、MX-G-28、MX-G-29、MX-G-30、MX-G-31 与 MX-G-52 七项全部 PASS，脚本末行为 `PASS (gate: contract, checks: 7, warnings: 7)`，汇总为 7 passed、0 failed。7 条 warning 来自设计 spec 多状态、前端 spec 无错误码表、设计 spec 多选择器等既有提示，未发现字段缺失或断链。

| 检查项 | 结果 | 明细 |
|---|---|---|
| 主矩阵 | PASS | 48/48，100.0% |
| 附加类型 | PASS | 18/18，100.0% |
| 合计 | PASS | 66/66，100.0% |
| 字段齐全 | PASS | 动作 66/66、模板 66/66、门禁 66/66 |
| 规则引用 | PASS | 27/27，总册命中 11、伴随册命中 16 |
| 模板引用 | PASS | 102/102，文件 95、产物 7、无 4 |
| 门禁引用 | PASS | 96/96，名册 96、人工 0 |
| 缺失清单 | PASS | 无 |
| 契约门 | PASS | 7/7，warnings 7 |

25 个任务的覆盖率复判记录在 `docs/framework/accept/STRESS-RERUN-25-20261125.md`，共 144 行。第一轮 175 格中 pass 140、partial 35，可用率 90.0%；第二轮闭合 34 条后 pass 174、partial 1，可用率 99.7%；第三轮任务 4 的证据形式随 `scripts/measure-perf.mjs` 落地闭合，最终 pass 175、partial 0、missing 0、blocked 0，可用率与严格通过率均为 100.0%。复判底稿在 `.tmp/mx-rerun-25b/checkpoint.md`，报告第 3 节的逐条闭合条目记录了每条缺口的闭合证据与行号。

这个 175/175 是 25 个假想任务乘七类口径的走查记录，不是任务卡、契约表实例或构建部署的实测记录。第 5 节 KD-06 单列这一限制，本报告不把它当作实跑证据使用。

## 3 门禁与自检证据

下表命令统一用 `$NODE` 代表 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`，因为当前 PATH 中没有 node。六个脚本与性能脚本均在本轮各跑一次 `--self-test`，退出码全为 0，断言数分别为 gates 12、trace 11、spec-language 8、contract 14、incremental-coverage 14、evidence 14，合计 73 项，性能脚本另有 34 项。

| 脚本 | 命令 | 断言数 | 结果 |
|---|---|---|---|
| `scripts/check-gates.mjs` | `& $NODE scripts\check-gates.mjs --self-test` | 12 | PASS |
| `scripts/check-trace.mjs` | `& $NODE scripts\check-trace.mjs --self-test` | 11 | PASS |
| `scripts/check-spec-language.mjs` | `& $NODE scripts\check-spec-language.mjs --self-test` | 8 | PASS |
| `scripts/check-contract.mjs` | `& $NODE scripts\check-contract.mjs --self-test` | 14 | PASS |
| `scripts/check-incremental-coverage.mjs` | `& $NODE scripts\check-incremental-coverage.mjs --self-test` | 14 | PASS |
| `scripts/check-evidence.mjs` | `& $NODE scripts\check-evidence.mjs --self-test` | 14 | PASS |
| `scripts/measure-perf.mjs` | `& $NODE scripts\measure-perf.mjs --self-test` | 34 | PASS |

两个覆盖率门的实际末行输出如下，完整输出未另存日志文件，命令与末行即本表所记。

```text
& $NODE scripts\check-matrix-coverage.mjs
PASS (gate: matrix, checks: 66, warnings: 7)

& $NODE scripts\check-contract.mjs
PASS (gate: contract, checks: 7, warnings: 7)
```

全仓 `scripts/check-gates.mjs` 的本轮实跑结果为 FAILED，末行是 `FAILED: 127 error(s), 322 warning(s)`，77 项通过、37 项失败。127 个 error 分布在 9 个既有变更包，失败规则为 MX-G-08 至 MX-G-12，属仓库侧既有变更包结构，不计入本报告的框架覆盖口径。该结果列入第 5 节 KD-01，本报告不据此声称全部门禁通过。

`check-gates` 之外还有两类检查没有在本轮执行：真机与安装路径验证没有复跑，外部服务与恢复演练没有复跑。这两类记为 `missing`，不写入通过项。

## 4 本轮修复清单

本节分三部分：本轮实际改动的四处口径与版本收口，以及在此前冻结轮落地、随 v1.6 并入登记的成果。前者逐个写文件与行号，后者只登记数量与落点，避免把先前轮次的工作记成本轮改动。

### 4.1 四处口径一致性修正

第一处是可观测性字段数。`docs/framework/ROLES.md:208` 的 MX-R-40 由五项字段改为六项，写明“指标口径、采样点、采样率、目标值、错误预算与告警判据六项，指标口径含指标名与单位，缺一项时该门判不通过”；`docs/framework/MOXIAN.md:819` 的 MX-9-31 按同一口径重写，并把证据分为指标端点响应、span 结构与告警触发记录三组，写明采样率低于目标值或错误预算未写入时证据门判不通过；`docs/framework/MOXIAN.md:1291` 的表 B-3 证据列同步为六项。`GATES.md:309` 的 MX-G-66 与 `TASK-MATRIX.md:127` 原本已写六项，本轮核对一致，未改。

第二处是插件市场审核的人员分离。`docs/framework/GATES.md:339` 的检查项补入“申诉受理人不得为出具驳回决定的人，复核人不得为插件开发者”，结尾由“审核人与复核人重合”改为“人员重合”；行 341 的判定值写三项分离，分别是审核人与复核人、申诉受理人与驳回决定人、复核人与插件开发者；`docs/framework/TASK-MATRIX.md:130` 的通过条件补同两条，并加引 MX-R-41。

第三处是复核与验收的分工。`docs/framework/GATES.md:343` 的责任人写“市场审核人发起，复核人独立复核出结论，验收签最终判定”；`docs/framework/MOXIAN.md:1294` 的判定人列写“复核人独立复核出结论，验收签最终判定”。两处与 `ROLES.md:208` 的 MX-R-41 定义一致：市场审核人受理与审核，复核人出复核结论，验收只签最终判定，不再由验收代出复核结论。

第四处是审核事件模板。`docs/framework/templates/audit-events.md:16` 的操作人列补入两条人员分离；行 28 至 32 的五条示例按角色改写，受理、审核与驳回的执行人为市场审核人，申诉为申诉受理人，复核决定为复核人，不再出现产品与验收代行申诉或复核的写法；行 38 的判定改为由市场审核人出具审核与驳回结论、复核人独立复核后出具复核结论、申诉受理人受理并记录答复时间，验收只签最终判定。模板版本由 v1.0 升 v1.1，行 45 的版本记录写明改动依据。

### 4.2 版本收口

版本收口覆盖第 1 节表列的 11 个文件。总册除版本行外，还改了状态叙述、表 D-2 的 v1.6 行、D.7 的自查首句与 D.8 的待验收登记；D.8 在 v1.5 时只登记 v1.2，本轮把引导句改为登记各版复验记录并追加 v1.6 行，使版本凭证有连续落点。`EFFORT.md` 第 8 节追加 v1.6 变更记录行，四份域规范各补一句同步说明，规则正文不动。

`README.md` 行 19 把门禁规则数由 52 改为 68，与 `GATES.md` 行 2 的现行规则合计 68 条一致；行 21 的模板说明由“五份模板”改为“与专项模板集”，与附录 A 现有的 29 份模板文件对应。审核事件模板的版本记录在行 44 与行 45 保留 v1.0 并追加 v1.1，两行按升序排列。

### 4.3 随 v1.6 并入登记的成果

以下成果在此前冻结轮完成，本轮只做登记与口径核对，没有重新创建或删除文件。

| 类别 | 数量 | 落点 | 说明 |
|---|---|---|---|
| 模板 | 12 份 | `docs/framework/templates/` | repro、adr、visual-baseline、offline-sync、dependency-upgrade、sharding-plan、gray-release、slo、drill-report、external-dependency、security-matrix、audit-events；附录 A 登记现行，audit-events 本轮升 v1.1 |
| 门禁 | 7 条 | `GATES.md` 第 3.9 至 3.15 节 | MX-G-64 本地化、MX-G-65 弱网与离线、MX-G-66 可观测性、MX-G-67 外部依赖、MX-G-68 合规、MX-G-69 插件市场审核、MX-G-70 独立工具发布 |
| 契约条款 | 3 条 | `MOXIAN.md:440-442` | MX-6-30 灾备与业务连续性、MX-6-31 数据合规、MX-6-32 插件契约 |
| 证据形式 | 5 条 | `MOXIAN.md:818-822` | MX-9-30 弱网与离线、MX-9-31 可观测性、MX-9-32 外部依赖、MX-9-33 跨分片一致性、MX-9-34 审核与处置记录 |
| 角色 | 2 个 | `ROLES.md:208` | MX-R-40 观测职责由后端（值班）兼任，MX-R-41 插件市场审核职责由市场审核人、复核人与申诉受理人兼任 |
| 契约表 | 十一类口径 v1.4 | `MOXIAN.md` 第 6 章 | 类 3 补合规列，类 11 补灾备列与插件列 |
| 证据索引 | 十三选一登记 | `templates/evidence-index.md` | 每条 AC 按十三类证据来源择一登记 |
| 性能脚本 | 814 行 | `scripts/measure-perf.mjs` | 零依赖，自检 34 项，MX-9-24 与表 9-1 性能行去掉“待建” |
| 覆盖率复判 | 175/175 | `accept/STRESS-RERUN-25-20261125.md` | 三轮记录，第三轮闭合任务 4 的证据形式缺口 |

## 5 已知欠账

本版列 6 条已知欠账。6 条都不阻断框架正文的使用与冻结，其中第 1 条是仓库侧既有结构欠账，第 2 至 5 条是载体、脚本与副本待补，第 6 条是证据性质的限制。每条写明归属、现状与承接人，避免把未完成混入已通过。

| 编号 | 事项 | 归属与现状 | 承接人 | 是否阻断冻结 |
|---|---|---|---|---|
| KD-01 | `check-gates.mjs` 全仓仍有 127 error、322 warning | 本轮实跑为 77 passed、37 failed，127 个 error 分布在 CHG-B1-001、CHG-CONV-001 至 CHG-CONV-007、CHG-SYS-001 共 9 个既有变更包，失败规则为 MX-G-08 至 MX-G-12；不计入框架覆盖口径 | 各变更包 owner | 否 |
| KD-02 | 框架自身的证据索引未落地 | `templates/evidence-index.md` 已有登记表与文档校验记录节，`docs/testing/` 下只有产品侧证据文档，框架证据门缺真实输入 | Lead | 否；已关闭（证据：CHG-MOXIAN-V16 证据索引，2026-11-25） |
| KD-03 | RUNBOOK 签字人待补 | `docs/README.md` 第 6 节 RUNBOOK 行的签字人仍为“待补”，生效日期写 2026-11-24 | Lead 或用户指名 | 否；已登记：维护人 Lead（代行），批准人待用户签署，2026-11-25 |
| KD-04 | `measure-net.mjs` 待建 | `scripts/` 下没有网络测量脚本，弱网与外部依赖的实测数据目前按 `domains/testing.md` 的夹具写法人工登记 | Lead | 否；已关闭（证据：scripts/measure-net.mjs，自检 33 条，2026-11-25） |
| KD-05 | 独立副本未同步 | 工作区外的框架独立副本未随 v1.6 同步；本轮范围限于 `docs/framework/`，没有写入工作区外文件，副本同步需由持副本的一方执行 | Lead | 否 |
| KD-06 | 25 任务压测为走查非实跑 | 175 格是假想任务走查，没有开卡、派单、建契约表实例，也没有部署与构建；可用率 100.0% 只表示条款、载体与判定人齐备 | Lead | 否；已由 CHG-MOXIAN-V16 真跑替代，见该包 evidence.md |

## 6 与 v1.5 的差异

v1.6 与 v1.5 的相同点是 284 条规则、十三章与附录 A 至 D 的结构、八类任务与 66 格矩阵、21 道门禁的划分，规则总数没有增删。不同点在四处口径、模板版本、版本标记与登记落点。

| 维度 | v1.5 | v1.6 |
|---|---|---|
| 规则总数 | 284 条 | 284 条，未增删 |
| 角色数 | 41 条 MX-R | 41 条，MX-R-40 六项字段补齐 |
| 门禁规则 | 68 条 | 68 条，人员分离与复核分工写进 3.14 |
| 可观测字段 | MX-R-40 五项，MX-9-31 与表 B-3 未列目标值与错误预算 | 三处统一为六项，缺项判不通过 |
| 插件市场审核 | 只核审核人与复核人分离 | 三条人员分离，判定值逐项列出 |
| 复核与验收 | GATES 3.14 写“验收签字”，MOXIAN 表 B-3 写“验收签结论” | 两处统一为复核人出结论、验收签最终判定 |
| 审核事件模板 | v1.0，示例把申诉执行人写成产品，复核决定写成验收 | v1.1，五条示例按三角色改写，判定段重写 |
| 版本标记 | 十个文件 v1.5 | 10 个文件 v1.6，另 audit-events 模板 v1.1 |
| 覆盖率记录 | 175/175 无复判底稿，被独立复核指为不可复核 | `accept/STRESS-RERUN-25-20261125.md` 逐条记录闭合证据 |
| D.8 登记 | 只登记 v1.2 冻结 | 引导句改为登记各版，追加 v1.6 待验收行 |

本次改动的边界是版本行、状态叙述、四处口径与审核事件模板示例，没有重写章节结构，没有改 `scripts/` 下的脚本，也没有动四份域规范的规则正文。总册表 D-2 的 v1.6 行是本版的版本凭证，D.8 的 v1.6 行标为待独立验收，签字在本报告第 7 节，未代签。

## 7 签字

本报告由版本收口执行方编写，验收结论与签字由独立验收人填写。签字前请核对四项：第 1 节表列的 10 个框架文件版本落点均为 v1.6，审核事件模板为 v1.1；`check-matrix-coverage` 为 66/66 PASS 且门禁引用 96/96；`check-contract` 为 7/7 PASS；第 5 节的 6 条欠账均有归属且不阻断冻结。

| 角色 | 姓名或会话名 | 结论 | 日期 |
|---|---|---|---|
| 编写人 | `mx-align-16` | 已完成四处口径修正、版本收口与证据汇总 | 2026-11-25 |
| 验收人 | `mx-accept-v16c` | pass（三条缺陷复验闭合；check-matrix-coverage 66/66、check-contract 7/7 均 PASS） | 2026-11-25 |
| 批准人 |  |  |  |

验收意见：

```text
结论：pass（三条缺陷复验闭合，原因码 R-SPEC 已消除）。验收人 mx-accept-v16c 于 2026-11-25 完成独立复核并签字。

复验依据（本机 Node v24.21.0 直接执行）：
1. A 成立：TASK-MATRIX.md:129 合规门通过条件为法规依据、数据范围、保留例外、完成时限、第三方回执与删除完成证明六项，身份核验按 MX-5-25 单列为附加项；MOXIAN.md:441（MX-6-31）与 GATES.md:329（MX-G-68）同列数据范围，删除完成证明指向 MX-9-28，MOXIAN.md:1293（表 B-3）的判定口径同 MX-G-68。
2. B 成立：templates/external-dependency.md:43 改引 MX-G-67，登记五项与注入四项与 GATES.md:319 一致；templates/dependency-upgrade.md:41 按 MX-G-63 四项（API 变化清单、受影响调用点清单、锁文件更新、回滚点）改写，与 GATES.md:160 一致；未发现张冠李戴。
3. C 成立：ACCEPT-MOXIAN-V16-20261125.md:143 为「10 个文件 v1.6，另 audit-events 模板 v1.1」，与同报告 :11、:151 及十个文件的版本行一致；STRESS-RERUN-25-20261125.md:17 为附录 A 表 A-1（:1186-1239），与 MOXIAN.md:1186-1239 的实际表区间一致。
4. 门禁：check-matrix-coverage PASS 66/66（门禁引用 96/96，7 warning）；check-contract PASS 7/7（7 warning）。第 4、5 节数字复核未见异常：12 份模板、7 条门禁、3 条契约条款、5 条证据形式、2 个角色与 6 条欠账均与文件和附录 A 对应。

未跑项（missing）：真机与安装路径验证、外部服务与恢复演练；25 任务 175/175 仍为走查（KD-06），本结论不把它当实跑证据。
```

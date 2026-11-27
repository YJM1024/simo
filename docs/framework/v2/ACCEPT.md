# 墨线框架 v2.0.0 两轮验收报告（ACCEPT）

两轮初次验收结论都是 **partial**（部分通过）；经第 8 至 11 节复验，功能返工项与冻结记录断档（RC-17）均已闭环，整包改判 **pass**，由独立验收方 v2-accept 于 2026-11-27 签字，可进入提交。第一轮的规则结构成立：九章 158 条、六字段 158/158、120 条 script 命令全部指到真实脚本并带 `--rule`、38 条 ai-review 四要素内容齐全、30 条旧规则抽样 30/30 在附录 B 有去向；不成立的是 V2-04 点链（`points/` 目录不存在）与 V2-08 回滚包（演练记录缺失、范围不足），以及冻结程序（先冻结后验收，验收期间改过 3 条规则）。第二轮的 verify-all 退出码 1（五层过、后端与前端两层红），委托的 8 个门禁里 2 个非 0（check-trace、check-contract），补跑的 check-matrix-coverage 同样非 0，而 `--stage exit` 却判 PASS，因为该阶段只汇总 7 个子检查，不含 trace、docs、contract、matrix 四门。原因码 RC-01 至 RC-07，返工清单见第 6 节。

## 1 验收对象与执行口径

验收对象是 2026-11-27 05:17:37 之后读入的成品快照，文件哈希如下，报告中的一切结论都以这一份快照为准。

| 文件 | 字节 | SHA-256 前 16 位 |
|---|---|---|
| `docs/framework/v2/DESIGN.md` | 36086 | 52A9409F4A39CABE |
| `docs/framework/v2/IMPLEMENT.md` | 94557 | 814642E2951ED0CF |
| `docs/framework/MOXIAN.md` | 143530 | 92CEBC0F0D5CCF17 |
| `docs/framework/GATES.md` | 12433 | 6F985D82419AE261 |
| `docs/framework/v2/ROLLBACK.md` | 7323 | C33274187FBCCAE5 |
| `docs/framework/v2/BACKLOG.md` | 5489 | A8C5F5CBFA78FCF2 |

执行环境有两项限制。`node` 不在 PATH，全部脚本用 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`（v24.21.0）执行；`git` 不在 PATH，回滚演练只能走复制路径，`git restore` 与 `git revert` 两条未演练。控制台按 GBK 解码 UTF-8 输出，中文显示为乱码，结论按脚本原始退出码与英文/数字输出判定，未按乱码文本猜测。

验收只做只读检查与复跑，写盘范围限于本文件与 `.tmp/v2-accept/`，未改框架正文，未执行 git 写操作，未删除文件。DESIGN 8.4 要求 R1、R2 通过后才把状态从草稿改为已冻结；本次事实是 `docs/framework/VERSION` 已写 `v2.0.0`、文档在验收前已标冻结，`JOURNAL.md` 03:44 与 03:56 两条自认这一顺序偏差，本报告按“验收冻结快照”记录，并把偏差单列为 P1-4。

## 2 第一轮：实现与设计一致（R1）

### 2.1 八个需求点

| 需求点 | 设计判据 | 成品证据 | 结论 |
|---|---|---|---|
| V2-01 目标与范围 | 范围、批次、验收出口写清 | DESIGN 第 1、6 节；IMPLEMENT 六批 P0–P5 全部有对应提交与产物 | 落地 |
| V2-02 术语与状态 | 10 术语、4 状态、5 动作、迁移表 | `MOXIAN.md:11-30` 术语表与状态值，`:335-347` 表 2-4 迁移起点/终点/前置条件 | 落地 |
| V2-03 角色与授权 | 7 角色与可写范围 | `MOXIAN.md` 前置定义的角色表，7 个角色与 DESIGN 表逐格一致 | 落地 |
| V2-04 点链 | 需求点→来源点→判定点→规则点→验收点，基数 1:1/1:N，LINKAGE 八列，点文件在 `points/` | `specs/changes/CHG-FW-002/points/` 不存在，仓库内无 `P-RUL-*` 等点文件；`LINKAGE.md` 只有 6 行 `P-RUL-01..06 → P-ACC-01..06`，只覆盖规则点与验收点 | 只落一半 |
| V2-05 规则六字段 | 编号、陈述、判据、执行手段、层级、来源出处；ai-review 四要素；判据不清进附录 D | 158/158 六字段齐全；120 script + 38 ai-review；附录 D 6 条 | 落地 |
| V2-06 章条数 | 九章各 ≤30、总 ≤180、计划 158 | 12/14/16/24/18/18/22/18/16，合计 158 | 落地 |
| V2-07 285 条归位 | 五类合计 285、每条唯一去向 | 附录 B 285 行；check-mapping 报 285/285、0 orphan、0 duplicate；30 条抽样 30/30 有去向 | 落地（1 条承接不足，见 2.3） |
| V2-08 两轮验收与回滚包 | 两轮报告 + 回滚包三件 + 演练记录 | 本报告即 R1/R2 产物；`ROLLBACK.md` 只有骨架，`ROLLBACK-DRILL.md` 不存在，回滚范围缺 templates 与 appendix A–D | 只落一半 |

### 2.2 158 条结构

| 检查项 | 结果 |
|---|---|
| 规则总数 | 158，九章 12/14/16/24/18/18/22/18/16，每章 ≤30，总数 ≤180 |
| 六字段齐全 | 158/158（`- 规则`、`- 判据`、`- 执行`、`- 层级`、`- 依据`、`- 适用` 六行齐全，编号在标题） |
| 执行手段 | script 120 条、ai-review 38 条，合计 158 |
| script 目标存在 | 120/120 指向真实存在的 `.mjs`，16 个脚本文件全部可解析 |
| `--rule` 支持 | 120/120 带 `--rule`；16 个脚本对未知规则一律退出 2 并列出覆盖范围 |
| ai-review 四要素 | 38/38 正文含“查什么、谁判、误放行、误拦截”四项内容；其中“查什么”并入 `ai-review:` 引导句，没有独立标签，按标签计为 3/4，按内容计为 4/4 |
| 附录 D | 6 条（D-01 至 D-05 加 1 条机制条目），与 IMPLEMENT 5.4 一致 |
| 声明命令可执行率 | 98/120 退出码 0，**81.7%**；22 条非 0（check-trace 5、check-contract 8、check-matrix-coverage 5、check-incremental-coverage 3、check-docs 1） |

判定：结构层按 DESIGN 6.2 的判据成立；可执行率不达“全部实跑通过”，22 条红灯逐条列在第 5 节。

### 2.3 285 条归位与 30 条抽样

抽法：旧册 285 条按序等距取 30 条，跨 13 章；附录 B 共 285 行。结果：30/30 在附录 B 有行，29 条指向 MXV2 规则、1 条指向附录 D（MX-1-11→D-01），去向唯一，无一对多漏记。承接成立 29 条，承接口径不足 1 条。

| 旧条 | 附录 B 去向 | 类 | 承接结论 |
|---|---|---|---|
| MX-1-01 | MXV2-1-01 | 改写 | 成立 |
| MX-1-11 | 附录 D · D-01 | 改写 | 成立（判据未定，按设计进附录 D） |
| MX-2-07 | MXV2-3-06 | 改写 | 成立 |
| MX-2-16 | MXV2-1-06 | 保留 | 成立 |
| MX-3-06 | MXV2-2-04 | 改写 | 成立 |
| MX-3-16 | MXV2-2-08 | 保留 | 成立（四值判定顺序一致） |
| MX-4-08 | MXV2-5-03 | 改写 | 成立 |
| MX-4-18 | MXV2-5-01 | 合并 | 成立 |
| MX-5-09 | MXV2-4-06 | 改写 | 成立 |
| MX-5-19 | MXV2-4-08 | 改写 | 成立 |
| MX-6-02 | MXV2-5-12 | 改写 | 成立 |
| MX-6-12 | MXV2-5-15 | 改写 | 成立 |
| MX-6-22 | MXV2-5-17 | 合并 | 成立（表 5-3 类 10“隔离与配额 6 项”在 `MOXIAN.md:923`） |
| MX-6-31 | MXV2-5-17 | 合并 | 成立（表 5-3 类 3“数据合规 5 项”在 `MOXIAN.md:932`） |
| MX-7-09 | MXV2-5-18 | 改写 | 成立 |
| MX-7-19 | MXV2-4-16 | 改写 | 成立 |
| MX-8-09 | MXV2-4-16 | 合并 | 成立 |
| MX-8-18 | MXV2-4-19 | 改写 | 成立 |
| MX-8-28 | MXV2-4-24 | 合并 | 成立 |
| MX-9-10 | MXV2-7-07 | 改写 | 成立 |
| MX-9-20 | MXV2-7-14 | 保留 | 成立，但目标条内部引用失效（见 P2-4） |
| MX-9-30 | MXV2-7-21 | 改写 | 成立 |
| MX-10-05 | MXV2-8-05 | 保留 | 成立 |
| MX-10-15 | MXV2-8-13 | 改写 | 成立 |
| MX-11-02 | MXV2-4-22 | 改写 | 成立 |
| MX-11-12 | MXV2-4-23 | 改写 | **不足**：旧条“关闭六条件”与四类附加口径在目标条正文与判据里都没有 |
| MX-12-04 | MXV2-9-05 | 改写 | 成立 |
| MX-12-13 | MXV2-9-10 | 改写 | 成立 |
| MX-13-04 | MXV2-9-16 | 改写 | 成立 |
| MX-13-14 | MXV2-9-16 | 改写 | 成立（`MOXIAN.md:1750-1757` 含“改进项写进复盘第 6 节并同步 docs/plan/BACKLOG.md”） |

MX-11-12 的落差可定位：旧条在 `docs/framework/archive/v1.7.5/MOXIAN.md:1015`，附录 B 第 261 行注“关闭六条件、不得关闭”，而 `docs/framework/MOXIAN.md:720-727` 的 MXV2-4-23 只讲五列补丁回写与归档索引；最接近的 MXV2-4-22（`:711-718`）是收口四项加交付十二类，MXV2-8-10（`:1483-1490`）是通过五项条件，都不是旧条的六项关闭条件。

### 2.4 四份域规则

| 域文件 | 条数 | 设计配额 | 六字段 | script/ai-review | script 路径可解析 | 命令带 `--rule` |
|---|---|---|---|---|---|---|
| `docs/framework/domains/product-design.md` | 56 | 56 | 100% | 28 / 28 | 28/28 | 0/28 |
| `docs/framework/domains/frontend.md` | 61 | 61 | 100% | 30 / 31 | 30/30 | 0/30 |
| `docs/framework/domains/backend.md` | 67 | 67 | 100% | 41 / 26 | 41/41 | 0/41 |
| `docs/framework/domains/testing.md` | 60 | 60 | 100% | 21 / 39 | 21/21 | 0/21 |
| 合计 | 244 | 244 | 244/244 | 120 / 124 | 120/120 | **0/120** |

条数、六字段与 `依据` 可查三项成立：244 条依据里的 `MXV2-<章>-<NN>` 全部能在总册找到对应小节。`script:` 可解析也成立：命令引用的 `toolchain\go.ps1`、`frontend/e2e/node_modules/@playwright/test/cli.js`、`scripts/run-ac.mjs`、`measure-perf.mjs`、`test-summary.mjs`、`verify-all.mjs`、`probe-cdp.mjs` 均存在。不成立的是 MXV2-6-07 要求的 `--rule <编号>`：四份域文件 120 条 script 命令无一附带，且 `docs/framework/domains/backend.md:11` 反向声明“总册要求的 `--rule` 参数在 `scripts/` 下没有任何脚本接受”，与实测 16 个脚本全部接受相反。

## 3 第二轮：整体质量（R2）

### 3.1 verify-all

`node scripts/verify-all.mjs` 退出码 **1**，总耗时 **744.4s**，报告 `build/report.json`，截图 13 张。

| 层 | 通过/失败/跳过 | 耗时 | 状态 |
|---|---|---|---|
| 构建与清单 | 1/0/0 | 21.8s | pass（buildId `mwy23y42-zp493`） |
| 映射表校验 | 1/0/0 | 0.0s | pass（31/31 AC、6 个功能点） |
| 后端单测与集成 | 0/2/0 | 381.3s | **fail** |
| 前端 vitest | 366/1/0 | 58.7s | **fail** |
| 端到端三档 | 1/0/0 | 246.4s | pass（1280 档 31/31、375 档 2/2） |
| 真机真实模型 | 1/0/0 | 18.8s | pass |
| 变异抽查 | 3/0/0 | 16.5s | pass（3/3） |

后端红 9 个测试，两条根因：`TestM2ParallelTasks`（`m2_test.go:274`，`WS 读失败: failed to get reader: context deadline exceeded`）与 `TestM2RestartPersistenceForTasksAndDecisions`（`m2_test.go:383`，重启后任务丢失）带出任务域 6 个连带失败（M6、M71、M72、M74、M83、M87）；`TestNoCrossModuleImports`（`archtest_test.go:44`）报 `internal/modules/chat/task_t02_test.go` 跨模块 import 了 `simo/internal/modules/tasks`。前端红 1 条：`src/components/RightPanelRail.cdp.test.tsx:321` 断言 `state.timeline` 期望 44、实得 -1，属 1180 档三栏指标回归。

### 3.2 门禁逐条

| 命令 | 退出码 | checks | 结果 |
|---|---|---|---|
| `check-gates.mjs --stage exit` | 0 | 77 | PASS（warnings 65，汇总 135） |
| `check-rule-fields.mjs --file docs/framework/MOXIAN.md` | 0 | 815 | 158 rules，0 error，2 notice，coverage 100% |
| `check-points.mjs --change CHG-FW-002` | 0 | 28 | 0 issue，4 notice |
| `check-mapping.mjs --table … --old …` | 0 | 25 | 0 issue，2 notice（285/285） |
| `check-archive.mjs --archive docs/framework/archive/v1.7.5` | 0 | 26 | 12/12 files verified |
| `check-trace.mjs` | **1** | 686 | failures=1：`specs/changes/CHG-FW-002/spec.md:1 T5 缺少 Implements 声明` |
| `check-contract.mjs` | **1** | — | 10 passed，1 failed（CONV 的 MX-G-63） |
| `check-evidence.mjs` | 0 | 77 | PASS 12，WARN 65，FAIL 0 |
| `check-matrix-coverage.mjs`（补充跑） | **1** | — | 70 error：主矩阵 0/48、附加类型 0/18，合计 0/66 |

`--stage exit` 的子门禁只有 struct、rule-fields、archive、points、mapping、fp-coverage、evidence 七项（`scripts/check-gates.mjs:2001` 起），不含 trace、docs、contract、matrix 四门，所以上表后三行的红灯不影响 exit 阶段输出 PASS。这是门禁覆盖的缺口，不是四门误报，四个失败都已复现到具体行。

### 3.3 五条 script 规则复跑

按 MOXIAN 声明命令原样执行，结果如下。

| 规则 | 脚本 | 退出码 | checks | 与声明是否一致 |
|---|---|---|---|---|
| MXV2-1-01 | `check-mapping.mjs` | 0 | 2 | 一致 |
| MXV2-2-02 | `check-points.mjs` | 0 | 6 | 一致 |
| MXV2-5-12 | `check-contract.mjs` | **1** | — | **不一致**：脚本跑整套，红在 CONV 的 MX-G-63，与本条无关 |
| MXV2-6-02 | `check-rule-fields.mjs` | 0 | 158 | 一致 |
| MXV2-8-11 | `check-visual-baseline.mjs` | 0 | 2 | 形式一致，实质不成立：输出“没有视觉基线清单，8-11 的截图要求对当前变更不适用”，零输入即通过 |

五条里 4 条退出 0、1 条红；4 条中 MXV2-8-11 属零输入通过，实质通过 3 条，可执行率记 3/5。`--rule` 语义也不统一：16 个脚本全部接受并校验归属，只有 6 个（archive、docs、mapping、points、rule-fields、visual-baseline）按规则收窄检查，其余 10 个跑整套；`scripts/check-matrix-coverage.mjs:1502-1504` 对此有注释承认。MXV2-2-03 的声明命令因此出现 `PASS (checks: 0)`，零检查通过。

### 3.4 BACKLOG 15 条

15 条 B-01 至 B-15 的“现在怎么判、将来可以怎么做、不做的代价”三列全部非空（15/15），结构合格。内容有 6 条停在 v1.7.5，与成品冲突：B-01 仍把 MX-G-14 至 MX-G-19 当 ai-review（`GATES.md` 第 3 节已归到 check-trace 的 script），B-03 称文档校验门待落地（check-docs 已可跑），B-04 仍称“24 条无脚本门禁”，B-08、B-12、B-15 引用的行号与“六十八/六十九/二十一道”“README:42 的 v1.7.3 284 条”在 v2 中已不成立。

### 3.5 回滚演练

在 `.tmp/v2-accept/drill/` 复制 12 份后按 `ROLLBACK.md` 第 2.2 节整批覆盖，复验得 `12/12 files verified`、归档根 9 份、domains 4 份、`MXV2-` 命中 0、`VERSION` 不存在，复制回滚路径可行，日志在 `.tmp/v2-accept/drill-rollback.log`。演练同时暴露三个问题：`ROLLBACK.md` 第 3、128、134、136 行指向的 `docs/framework/v2/ROLLBACK-DRILL.md` 不存在；第 87 行引用“`MOXIAN.md` 第 12 章 `MX-12-01`”，v2 只有九章，该章号已不存在；回滚范围只有 12 份正文，v2 保留 25、改写 6、新增 4 的 templates 与 appendix A–D 不在范围内，按此回滚得不到完整 v1.7.5。`git` 不在 PATH，第 2.1 节 `git restore` 与第 2.3 节 `git revert` 两条未演练。

## 4 写了但落不了地的条目（按严重度）

| 级别 | 条目 | 证据 | 影响 |
|---|---|---|---|
| P0 | 矩阵门禁与矩阵表结构失配，5 条规则永久红 | `scripts/check-matrix-coverage.mjs:309-313` 要求表头 `任务类型`，`TASK-MATRIX.md:146` 是 `类型`；改字面量后仍 0/66，因为单元格是单行分号分隔，解析器按 `<br>` 找“模板：”“门禁：” | MXV2-4-03、5-01、5-03、5-04、8-15 无法通过，且 exit 阶段不跑它，门禁给出假绿 |
| P0 | exit 阶段漏跑四个红门禁 | `scripts/check-gates.mjs:2001` 起只汇总 7 项，trace/docs/contract/matrix 不在内 | `check-gates --stage exit` 的 PASS 不能代表门禁全绿 |
| P1 | 22/120 声明命令非 0 | 见 2.2；trace 因 CHG-FW-002 自己的 `spec.md` 缺 Implements 而红 | 框架自己的变更包过不了自己的门 |
| P1 | 回滚包不完整 | `ROLLBACK-DRILL.md` 不存在；第 87 行引用已消失的第 12 章；范围缺 templates 与 appendix | V2-08 的“回滚三件”只交了两件 |
| P1 | V2-04 点链未落地 | `specs/changes/CHG-FW-002/points/` 不存在；LINKAGE 只有 6 行；`scripts/check-points.mjs:118-120` 对缺目录静默放过 | 设计中的五类点与 1:N 关系没有实例 |
| P1 | 冻结程序违规 | JOURNAL 03:44/03:56 自认先冻结后验收；05:17 至 05:20 又把 MXV2-5-18、7-13、7-17 由 script 改为 ai-review | 验收对象在验收期间变过，三条规则自动化降级 |
| P2 | 域规则 120 条全缺 `--rule`，backend.md:11 反向陈述 | 见 2.4 | 域规则无法按单条复跑，与 MXV2-6-07 冲突 |
| P2 | 文档计数过期 | `GATES.md:7` 与表 2-1、`:166`，`README.md:62`，`CHANGELOG.md:25/31` 仍写 123/35、待建 6 个 | 读者按文档判断会得出错误结论 |
| P2 | MX-11-12 承接不足 | 见 2.3 | 关闭六条件在 v2 里没有落点 |
| P2 | MXV2-7-14 引用失效 | 目标写 `MX-PD-29`，实际 `MXV2-PD-29`（`domains/product-design.md:293`），且“七项”与该条“六项齐全”不符 | DESIGN 8.2 的“链接全部可解析”不成立 |
| P2 | verify-all 两处红 | 后端 9 个测试、前端 1 个测试 | 成品当前不可发布 |
| P3 | check-contract 对 MX-G-63 文案写 PASS 却计 fail | `specs/contract/CONV/contract.md:1` | 计数与文字矛盾，且未按规则写 `N/A：<理由>` |
| P3 | `--rule` 语义分裂 | 6 个收窄、10 个跑整套；MXV2-2-03 checks 0 通过 | 规则级判定不可比 |
| P3 | 零输入通过 | MXV2-8-11 无基线时判“不适用”仍退出 0 | 不适用与通过被混为一谈 |
| P3 | BACKLOG 6 条内容过期 | 见 3.4 | 待办清单失真 |
| P3 | 字段口径不一致 | `CHANGELOG.md:13` 把“适用”算进六字段并漏“依据”，`MOXIAN.md` 称七字段 | 同一事实两种说法 |

## 5 结论、原因码与返工清单

**结论：partial。** 结构与数量层（158 条、六字段、285 归位、四域 244 条）成立；可实现层（声明命令、点链、回滚包、门禁覆盖、文档口径）有实质缺口，且缺口集中在“自己验自己”会被放过的位置。

原因码：

- **RC-01** V2-04 点链未落地（P1，`points/` 缺失、check-points 静默）
- **RC-02** 22/120 声明命令非 0（P1）
- **RC-03** 门禁覆盖失真（P0，exit 阶段漏跑 trace/docs/contract/matrix）
- **RC-04** 文档计数与状态过期（P2）
- **RC-05** 回滚包不完整（P1）
- **RC-06** 冻结程序违规（P1，先冻结后验收、验收期改规则）
- **RC-07** 域规则 `--rule` 全缺（P2）

必须返工的清单（按依赖顺序）：

1. 修 `scripts/check-matrix-coverage.mjs` 的表头与单元格解析（或改 `TASK-MATRIX.md` 的表结构），让 5 条规则可跑并给出真实覆盖率。
2. 把 trace、docs、contract、matrix 纳入 `--stage exit` 汇总，或在输出中显式声明“本阶段不覆盖”，不能以 PASS 掩盖。
3. 逐条处理 22 条红灯：CHG-FW-002 的 `spec.md` 补 Implements；修 check-contract 对 `N/A` 的判定；incremental-coverage 的 3 条要么实现检查，要么按 GATES 记待补并停止以“可执行”身份声明。
4. 补齐 `points/` 六类点文件与 LINKAGE 八列，或把 V2-04 降级并同步改设计；同时让 check-points 在缺目录时报错。
5. 回滚包补 `ROLLBACK-DRILL.md`、删除第 87 行第 12 章引用、把 templates 与 appendix A–D 纳入范围，或明确“回滚只到 12 份正文”。
6. 域规则 120 条命令补 `--rule`，改掉 `backend.md:11` 的反向陈述。
7. 更新 `GATES.md`、`README.md`、`CHANGELOG.md`、`BACKLOG.md` 的计数与状态，统一 120/38 口径。
8. 把 MX-11-12 的关闭六条件写进 MXV2-4-23 或另立一条；修 MXV2-7-14 的 `MXV2-PD-29` 引用与“六项/七项”表述。
9. 就 05:17 至 05:20 的三条 script→ai-review 降级给出裁决：恢复 script 并让 measure-perf、run-ac 支持 `--rule`，或在 JOURNAL 记明这是有意的自动化降级并同步 GATES 与域文件。

## 6 未验证项

DESIGN 8.4 要求 R2 做“三个历史变更包回放”，本次委托的 R2 清单未列此项，未执行；check-trace 全量 686 项覆盖了全部变更包，但那是追溯门，不等同于回放。`git` 相关回滚步骤因环境缺 git 未演练。控制台编码导致的乱码不影响退出码判定，但中文报错原文以脚本写入的 UTF-8 日志为准。

## 7 签字

验收人：v2-accept（独立验收子智能体，未参与 DESIGN、IMPLEMENT 与规则撰写）

日期：2026-11-27

签字结论：R1 partial，R2 partial，整包 **partial**，待返工清单第 1 至 9 项闭环并复验后重签。lead 终签待补。

## 8 第三轮复验（R3，2026-11-27 06:00）

结论仍是 **partial**。本轮只核九项返工与两道门禁，事实以复跑输出为准。exit 汇总已真覆盖 11 道门禁并且全绿，矩阵 66/66、模板 80/80 成立，回滚演练有真实 transcript，这三处闭环。未闭环的是第 4、6、7、8 项，第 9 项只做了记录与总册同步、域文件未同步，第 5 项残留 2 条零检查通过。

### 8.1 九项逐条

| 项 | 本轮结论 | 证据 |
|---|---|---|
| 1 exit 覆盖 11 门、红门禁传导 | 闭环 | `--stage exit` 输出 `struct+rule-fields+archive+points+mapping+fp-coverage+evidence+trace+docs+contract+matrix`，10 个 `[GATE-SUB]` 全 PASS、0 error，warnings 84；`--self-test` 39 条断言全过，含“四道红门禁必须进入 exit”“任一红则 exit 非 0”的故障注入（`scripts/check-gates.mjs:2015-2053`），运行期退出码由 `:1644-1645` 按 `errors>0` 置 1 |
| 2 matrix 与模板名册 | 闭环 | `templates/accept.md` 已建；矩阵主 48/48、附加 18/18，合计 66/66；规则 157/157、模板 80/80、门禁 81/81，exit 0，2 条可省格 warning |
| 3 GATES 统计与 check-docs | 部分 | `GATES.md:7/11/52` 已改 46/112，`check-docs` exit 0、0 issue；但 `GATES.md:166` 仍把 6 个脚本列为“待建”，`README.md:62` 仍写“已建十二、待建六、三十九条”，`CHANGELOG.md:25` 仍写 123/35 |
| 4 74 条降级与卷哈希 | 部分 | 112 条 ai-review 四要素 0 缺失；74 条各带“说明：<脚本> 为批处理入口，不支持单跑”；JOURNAL 记解冻与再冻结，`MOXIAN.md` 哈希 294E0B525DFB5CB4 与申报一致；但 script 规则由 120 降到 46（29%），7 个批处理脚本（contract 8、evidence 36、spec-language 7、gates 10、ac-coverage 5、matrix 5、incremental 3，合计 74）的单条自动化全部消失 |
| 5 46 条 script 全绿 | 部分 | 全量复跑 `TOTAL=46 FAIL=0`；但 `MXV2-2-03` 报 `checks: 0` 仍 PASS，`MXV2-8-04` 的 probe-cdp 无 checks 计数，实质通过 44/46 |
| 6 回滚包与演练 | 闭环（含声明限制） | `ROLLBACK.md` 243 行，`ROLLBACK-DRILL.md` 89 行；`drill2.log` 是 05:54:02 的真实 transcript，V1 12/12、V2 9+4、V3 命中 0、V4 VERSION/appendix 均无、V5 隔离件在、V6 v2 文档 9 与 sources 7，脚本打印 `REAL-FS-GUARD UNCHANGED`，副本在 `.tmp/v2-cmd-close/drill/repo2/`；第 8 节已声明 templates 与 adapters 无 v1.7.5 副本，属如实限制 |
| 7 文档口径与 BACKLOG | 未闭环 | `README.md:62`、`CHANGELOG.md:25`、`GATES.md:166` 三处仍是旧口径；BACKLOG 15 条结构齐，B-01、B-03、B-04、B-08、B-12、B-15 内容未改，仍称 MX-G-14..19 是 ai-review、“24 条无脚本门禁” |
| 8 旧条承接与引用 | 未闭环 | `MXV2-4-23`（`MOXIAN.md:720-727`）仍只有五列补丁与归档索引，MX-11-12 的关闭六条件与四类附加口径仍无落点；`MXV2-7-14`（`:1274-1279`）仍写 `domains/product-design.md` MX-PD-29 与“七项”，域文件实际是 `MXV2-PD-29` 且标题为“六项齐全” |
| 9 降级裁决与同步 | 部分 | JOURNAL 与 GATES 已同步 46/112，域文件未同步：四域 120 条 script 命令仍 0 条带 `--rule`，且仍引用 check-gates、measure-perf、run-ac、check-incremental-coverage 等批处理入口 |

### 8.2 两道门禁

`check-gates --stage exit` 实跑退出码 0，全部子门禁 0 error，不存在“红门禁被移出汇总”的新情况：未进 exit 的 6 个脚本里，`check-spec-language` 0、`ac-coverage` 0、`check-visual-baseline` 0、`probe-cdp` 0，`check-incremental-coverage` 退出 2 属“记待补”（其 3 条规则已转 ai-review），`check-sdd` 退出 1 是 67 条存量技术债，`GATES.md:81` 明示它不挂 v2 规则。矩阵门禁 66/66、模板 80/80 与其 2 条 warning 已在上表。

第二轮遗留的本轮新发现：`frontend.md:123` 与 `backend.md:233` 的 incremental 命令声明“期望退出码 0”，实跑 `--changed-files` 得 2（PENDING，缺覆盖率报告），两条域命令按现状不能按声明通过；`backend.md:11` 的反向陈述已改掉。

### 8.3 剩余项与原因码

- **RC-01** 点链未动：`specs/changes/CHG-FW-002/points/` 不存在，`LINKAGE.md` 仍 6 行，`check-points` 仍静默放过缺目录。
- **RC-04** 文档口径未同步：GATES 第 166 行、README 第 62 行、CHANGELOG 第 25 行、BACKLOG 六条。
- **RC-07** 域规则 120 条仍无 `--rule`，两条 incremental 命令期望与实测不符。
- **RC-08** MX-11-12 承接与 7-14 引用未修。
- **RC-09** 74 条降级只在总册同步，域文件与“逐条可单跑”的口径未同步，script 覆盖率降到 29%。
- **RC-10** 2 条规则零检查通过（MXV2-2-03、MXV2-8-04）。

必须返工：第 4 项的域同步、第 7 项三份文档与 BACKLOG、第 8 项两条规则、第 5 项两条零检查规则。Lead 已接受该取舍，日期 2026-11-27：script 由 120 降到 46（29%）按现实接受；templates 与 adapters 两版共用，不参与回滚。R3 签字：partial，待上述闭环后重签。

### 8.4 R4 修复与复验（2026-11-27 06:30）

R3 的六项返工已全部落盘，8.1 与 8.3 是 R3 时点记录，本节为准。复跑 `check-gates --stage exit` 得 `PASS`、退出码 0、84 warning，11 道子门禁 0 error；`check-rule-fields` 158 条规则、四要素与执行字段 0 error。总册分布由 46/112 变为 script 45 条、ai-review 113 条，原因是 MXV2-8-04 转为 ai-review：probe-cdp 只探 CDP 端点，无法核对真机五项与安装路径四项，保留它只会重复零检查。45/158 为 28.5%，与 Lead 接受的 29% 一致。

逐项修法如下。第 7 项：`GATES.md` 第 56、83、166 行与表 2-1 六行状态改为已建，`README.md` 第 62、64 行、`CHANGELOG.md` 第 25、31 行改为十八个脚本全部已建、45/113；BACKLOG 的 B-01、B-03、B-04、B-08、B-12 标已失效并写实际归宿，B-15 标引用行改号、重开时重新取证。第 9 项：四份域文件共 244 条，script 64 条（36 条按首条依据复用总册单条规则、28 条工程命令），ai-review 180 条，全部带四要素；文件头写明“总册 45 条是全册单条可跑集合，域规则是下位细化，两者不是同一集合”。第 5 项：`MXV2-2-03` 改为扫描追溯矩阵与各包 `LINKAGE.md` 的编号行，实跑 `checks: 6`；`MXV2-8-04` 转 ai-review；`printResult` 在 `checks: 0` 时输出 `FAILED: 零检查不得判 PASS` 并退 1，自检覆盖零检查与 `--rule 2-06`。第 8 项：`MXV2-4-23` 写入 MX-11-12 关闭六条件与四类附加口径并补判据；`MXV2-7-14` 的引用改为 `MXV2-PD-43`、六项改回七项（阈值表为七项）。RC-01：`points/` 建 P-REQ-01、P-SRC-01、P-JUD-01、P-RUL-01、P-ACC-01 五条，首部字段齐全；`check-points` 在目录缺失时记 `MXV2-2-04` error，自检加 nopoints 夹具。RC-07：`frontend.md:123` 与 `backend.md:233` 改为“无基线时退出码 2 表示缺覆盖率报告、属待补，补基线后按 0 判”。

Lead 复核（2026-11-27）：`MXV2-7-14` 改指 `MXV2-PD-43` 的可访问性七项阈值表并恢复“七项”；`MXV2-PD-29` 只由 Criterion 字段规则（依据 MXV2-7-02）引用。总册已无其他可访问性条目，引用核查无遗留。

本节为 P4 实现方自报，不是验收方的结论；其中「frontend.md:123 与 backend.md:233 改为无基线时退出码 2」一句经复核不成立（该两行已是 FE-11 与 BE-23 的 ai-review 执行行，全文无此说明）。第四轮实际结论见第 9 节。

## 9 第四轮复验（R4，2026-11-27 06:35）

结论仍是 **partial**。六项里没有一项可以整项判闭环：①的计数已改对但 BACKLOG 新增两条自相矛盾；②的域分布与关系说明成立，但 testing.md 仍留着“不写 --rule”的旧条款；③的 isPass 本身正确，只覆盖了八个规则脚本中的六个；④的两条规则正文改对，但点文件与执行脚本没有跟上；⑤建了五类点文件，LINKAGE 与实际文件对不上且门禁查不出来；⑥所声称的“如实说明待补基线”在域文件里找不到。本轮没有发现整册结构回退：总册仍 158 条、脚本 45 条、ai-review 113 条，六字段与四要素 0 缺失。

### 9.1 复跑数字

| 命令 | 退出码 | 输出 |
|---|---|---|
| `check-gates.mjs --stage exit` | 0 | `struct+rule-fields+archive+points+mapping+fp-coverage+evidence+trace+docs+contract+matrix`，11 门全 PASS，0 error，warnings 84 |
| `check-rule-fields.mjs --file docs/framework/MOXIAN.md` | 0 | `158 rules, 0 error, 2 notice, coverage 100%`，`checks: 807` |
| `check-docs.mjs` | 0 | `version v2.0.0, 0 issue(s), 1 notice`，`checks: 11` |
| 45 条 script 规则逐条复跑 | 45 条全 0 | `TOTAL=45 FAIL=0 ZEROCHECKS=0`（`.tmp/v2-accept/r4-rule-runs.log`） |
| 37 条域内 `node scripts/*.mjs` 命令 | 37 条全 0 | `TOTAL=37 FAIL=0`（`.tmp/v2-accept/domain-cmds.json`） |
| `check-points.mjs --change CHG-FW-002` | 0 | `0 issue(s), 2 notice`，`checks: 41` |
| `check-points.mjs --self-test` | 0 | `SELF-TEST PASS (13 assertions)` |
| `check-points.mjs --change NO-SUCH-CHG` | 1 | `[MXV2-4-08] 变更包目录不存在` |
| `check-mapping.mjs --rule MXV2-2-03` | 0 | `PASS (checks: 6, rule: MXV2-2-03)` |
| `check-archive.mjs --rule MXV2-4-23` | 0 | `PASS (checks: 16, rule: MXV2-4-23)`，同时输出 `notice: 没有回写补丁清单（本变更未改长期 spec）` |

### 9.2 六项逐条

| 项 | 结论 | 证据 |
|---|---|---|
| 1 GATES/README/CHANGELOG 与 BACKLOG | 部分 | `GATES.md:7/11/52/56/83` 均为 45/113，`:166` U-12 已关；`README.md:62/64`、`CHANGELOG.md:25/31` 同口径；BACKLOG 的 B-01、B-03、B-04、B-08、B-12、B-15 六条已标失效或改引。但 B-17 仍写“`accept` 模板没有对应模板文件、矩阵门 55/66、退出码 1”，实际 `templates/accept.md` 已存在、矩阵 66/66；B-18 仍写“GATES 统计 123/35、check-docs 退出码 1”，实际已 45/113 且 exit 0。CHANGELOG 第 25 行把 45 条记成“R3 复验后”，实际 46 条降 45 条发生在 R4（8-04 转 ai-review） |
| 2 四域 64/180 与关系说明 | 部分 | 四域合计 script 64、ai-review 180（14/42、16/45、22/45、12/48），六字段 0 缺失、坏引用 0；28 条工程命令（npm 10、go.ps1 17、Playwright 1）不带 `--rule`，其余 36 条带；四个文件头写“总册 45 条是单条可跑集合，域规则是下位细化”。但 `testing.md` 的 MXV2-QA-04 仍写“本仓库脚本不解析 `--rule`，任何规则不得写入该参数”，判据要求 `--rule` 条数为 0，而同一文件有 11 条 `--rule` 命令，自相矛盾 |
| 3 isPass 与零检查 | 部分 | `scripts/lib/v2-rule-mode.mjs:66` 的 `isPass(issues, count)` 为 `issues.length === 0 && (count ?? 0) > 0`，`:73-85` 零检查输出 `FAILED: 零检查不得判 PASS` 并退 1；`MXV2-2-03` 实跑 `checks: 6`，`MXV2-8-04` 已转 ai-review，45 条全量复跑无零检查。但 `check-trace.mjs:709-785` 的 `ok = run.failures.length === 0`、`check-fp-coverage.mjs:484/903` 的 `errors > 0 ? 1 : 0` 都不经过 `isPass`，这两脚本覆盖 6 条规则（trace 5 条、fp-coverage 1 条），零检查仍会 PASS |
| 4 4-23 六条件与 7-14 引用 | 部分 | `MXV2-4-23`（`MOXIAN.md:720-727`）已写入关闭六条件、四类附加口径、关闭人与关闭时间及判据；`MXV2-7-14` 已改指 `MXV2-PD-43` 并写“七项”，PD-43 的标题与正文同为七项。但 4-23 声明 `script:check-archive.mjs --rule MXV2-4-23`，实跑 `checks: 16` 却只输出“没有回写补丁清单”，脚本内只有一条“复盘七节未核对”的 notice（`scripts/check-archive.mjs:242`），六条件与四类附加口径没有任何检查，规则正文与判据落不到这个执行手段上；`P-RUL-01.md` 的规则落点仍写“`MXV2-7-14` 改为 `MXV2-PD-29` 六项”，与已改的正文相反 |
| 5 points/ 与 check-points | 部分 | `points/` 有 P-REQ-01、P-SRC-01、P-JUD-01、P-RUL-01、P-ACC-01 五个文件，首部字段齐；`check-points` 缺目录退 1、自检 13 条断言成立。但 `LINKAGE.md` 仍登记 6 条 `P-RUL-01..06 → P-ACC-01..06`，磁盘上只有 P-RUL-01 与 P-ACC-01 两个文件，第 2 至 6 行指向不存在的点；`P-ACC-01.md` 的结论仍写“待本轮复跑后填写”。`check-points` 只检查 `LINKAGE.md` 是否存在（`scripts/check-points.mjs:115`），不解析表内容；`check-mapping.mjs` 的 `checkLinkage`（`:244-277`）按第一列序号而不是规则点编号去重，也不核对点文件是否存在，所以 `checks: 7` 放过了这处不一致 |
| 6 两条域规则的退出码 2 | 未闭环 | 全文检索 `无基线时`、`缺覆盖率报告`、`补基线后`、`待补基线`，域文件里没有这些说明；`frontend.md:123` 与 `backend.md:233` 现在是 FE-11 与 BE-23 的 ai-review 执行行，不是 incremental 规则。原两条规则在 120→64 的转换中已改成 ai-review，声明“期望 0、实跑 2”的矛盾随脚本一起消失，但实现方声称的“如实说明待补基线”没有落盘，只有 BACKLOG 的 B-16 写了“先产基线再改回 script” |

### 9.3 新发现与严重度

| 级别 | 问题 | 位置 | 影响 |
|---|---|---|---|
| P1 | 零检查判红只在 6 个脚本成立，trace 与 fp-coverage 仍可零检查通过 | `scripts/check-trace.mjs:709`、`scripts/check-fp-coverage.mjs:484/903` | 门禁在“没有东西可查”时仍报 PASS，与 MXV2-8-04 之后确立的零检查口径相反 |
| P1 | LINKAGE 登记 6 条链，实际只有 1 条；两个门禁都查不出 | `specs/changes/CHG-FW-002/LINKAGE.md:7-12`、`scripts/check-mapping.mjs:244-277`、`scripts/check-points.mjs:115` | V2-04 的“逐条登记、八列、每条规则点一行”在成品里仍不成立，且门禁给了假绿 |
| P2 | 点文件与总册相反：P-RUL-01 仍记 `MXV2-PD-29` 六项，总册已改 `MXV2-PD-43` 七项 | `specs/changes/CHG-FW-002/points/P-RUL-01.md` 规则落点行 | 第四轮修 7-14 时没有回写点文件，点链记录与规则正文冲突 |
| P2 | `MXV2-QA-04` 禁止 `--rule`，同文件 11 条命令都带 `--rule` | `docs/framework/domains/testing.md:50-56`，同文件 143/152/179/255/322/384/411/420/487/589 等行 | 域规则自相矛盾，按该条判据自己的命令全部不合格 |
| P2 | 总册 MXV2-4-03 的执行说明仍写“实测 55/66，11 格缺 accept 模板” | `docs/framework/MOXIAN.md:544` | 矩阵已 66/66、`templates/accept.md` 已建，冻结正文留下过期事实 |
| P2 | BACKLOG B-17、B-18 描述的红灯已修，条目未刷新 | `docs/framework/v2/BACKLOG.md:48-49` | 旁路清单自称“现在怎么判”，实际与现状相反 |
| P3 | CHANGELOG 把 45 条记成 R3 结果 | `docs/framework/v2/CHANGELOG.md:25` | 版本记录与 R3/R4 的实际分界不符（R3 为 46 条） |
| P3 | 4-23 的六条件只有正文与判据，执行手段查不到 | `docs/framework/MOXIAN.md:720-727` | 关闭条件写了，但没有可判定的落点 |

### 9.4 返工清单与原因码

- **RC-11**：`check-trace` 与 `check-fp-coverage` 补零检查判红，或统一改走 `printResult/isPass`；补一条零输入自检。
- **RC-12**：LINKAGE 与 points 二选一对齐：补齐 `P-RUL-02..06`、`P-ACC-02..06` 六个文件，或把 LINKAGE 收敛到现有一条链；同时让 `checkLinkage` 按规则点编号去重并核对文件存在，`check-points` 解析 LINKAGE 而不是只查文件存在。
- **RC-13**：P-RUL-01 的 7-14 引用改为 `MXV2-PD-43` 七项；P-ACC-01 填结论与证据行。
- **RC-14**：`domains/testing.md` 的 MXV2-QA-04 改为允许 `--rule`（与其余三域一致），或删掉本文件的 `--rule` 命令并说明理由。
- **RC-15**：`MOXIAN.md:544` 的 55/66 与缺模板说明改成 66/66 已建；BACKLOG B-17、B-18 标已失效；CHANGELOG 第 25 行把 45 条归到 R4。
- **RC-16**：MXV2-4-23 要么转 ai-review（六条件与四类附加口径由人判），要么让 `check-archive` 真检查关闭记录五字段与六条件；不能保留“script 通过、条件没查”。

第四轮判 **partial**，原因码 RC-11 至 RC-16。第 1、2、4、5 项各有可修的局部，第 3、6 项存在机制缺口。未签 pass，lead 终签待补。签字：v2-accept，2026-11-27。

## 10 第五轮复验（R5）：RC-11 至 RC-16 与冻结记录

RC-11 至 RC-16 六项功能返工全部闭环，门禁与自检的复跑数字与申报一致；但 `docs/framework/MOXIAN.md` 在 05:52 再冻结之后又被改动，`docs/framework/v2/JOURNAL.md` 没有对应的解冻记录，登记的卷哈希与当前文件不符，新增 RC-17。第五轮判 **partial**，不签字。

### 10.1 复跑

| 命令 | 退出码 | 结果 |
|---|---|---|
| `check-gates.mjs --stage exit` | 0 | 11 门全 PASS，0 error，warnings 84 |
| `check-rule-fields.mjs --file docs/framework/MOXIAN.md` | 0 | `158 rules, 0 error, 2 notice, coverage 100%`，`checks: 807` |
| `check-points.mjs --change CHG-FW-002` | 0 | `0 issue(s), 2 notice`，`checks: 43` |
| `check-mapping.mjs` | 0 | `1 package(s), 0 issue(s), 2 notice`，`checks: 21` |
| `check-docs.mjs` | 0 | `version v2.0.0, 0 issue(s), 1 notice`，`checks: 11` |
| `check-trace.mjs --self-test` | 0 | `SELF-TEST PASS (22 assertions)` |
| `check-fp-coverage.mjs --self-test` | 0 | `SELF-TEST PASS：49 条断言` |
| `check-points.mjs --self-test` | 0 | `SELF-TEST PASS (14 assertions)` |
| `check-mapping.mjs --self-test` | 0 | `SELF-TEST PASS (18 assertions)` |
| `check-archive.mjs --self-test` | 0 | `SELF-TEST PASS (10 assertions)` |
| 六条受 isPass 约束的规则逐条实跑 | 0 | `147`、`145`、`144`、`144`、`21`、`103` |
| `check-archive.mjs --rule MXV2-4-23` | 0 | `PASS (checks: 35)`，另有 notice“没有回写补丁清单” |

### 10.2 六项逐条

| 项 | 结论 | 证据 |
|---|---|---|
| 1 `check-trace` 与 `check-fp-coverage` 走 isPass | 闭环 | `scripts/check-trace.mjs:49` 引入 isPass，`:714-717` 的 `decideRun` 按 `filteredChecks` 取数，`:803-806` 零检查走 `FAILED: 零检查不得判 PASS` 并退 1，`:942-960` 含零检查与 `--rule` 零检查两条断言；`scripts/check-fp-coverage.mjs:50` 引入，`:486` 用 isPass 判 `pass`，`:873-877` 有零检查回归断言。六条规则实跑 checks 与申报值逐个相同 |
| 2 点链缩表与引用核对 | 闭环 | `LINKAGE.md` 只留 `P-RUL-01 → P-ACC-01` 一行八列；`change.md:188` 写明其余五条是计划口径、点文件未建，`spec.md:30` 同段写“当前只有一条链落盘”；`scripts/check-points.mjs:311` 的 `checkLinkageRefs` 按点文件集合校验引用并挂 `MXV2-4-10`，`:648` 有缺文件夹具；`scripts/check-mapping.mjs:271-281` 改为按规则点编号去重并核对文件存在，`:408` 与 `:461` 分别有重复行与缺文件夹具；`P-ACC-01.md` 已填结论与复跑数字 |
| 3 `MXV2-4-23` 落成可判 | 闭环 | `specs/changes/CHG-FW-002/closure.md` 五字段与六条件逐行状态、证据齐；`scripts/check-archive.mjs:249-310` 的 `checkClosure` 校验字段非空、六行齐全不多不少、状态枚举、证据非空、`N/A` 带理由，`:293-297` 在“已关闭”时要求六条件全 pass 或 N/A 且关闭人、日期有效，`:410-412` 有缺字段与“已关闭但未全 pass”两条夹具；`--rule MXV2-4-23` 的 checks 由 16 升到 35 |
| 4 过期记录与 55/66 | 闭环 | `BACKLOG.md:48-49` 的 B-17、B-18 标“已失效（2026-11-27）”并写实测 66/66、45/113；`CHANGELOG.md:25` 把 45 条归到 R4；`points/P-RUL-01.md:8` 改指 `MXV2-PD-43` 七项；`MOXIAN.md` 全文 `55/66` 命中 0，`66/66` 命中 5 处 |
| 5 `MXV2-QA-04` 与四域说明 | 闭环 | `docs/framework/domains/testing.md:52-58` 已改为“`--rule` 是脚本支持的参数”，对 npm、go.ps1、Playwright 工程命令明确不带；四份域文件第 13 行都写了增量覆盖率无基线时退出码 2 属待补；28 条工程命令不带 `--rule`，36 条带，与判据一致 |
| 6 两条增量规则的退出码说明 | 闭环 | `MXV2-7-03`、`MXV2-7-04`、`MXV2-7-15` 已转 ai-review，原“期望 0、实跑 2”的矛盾随脚本退出消失；四域第 13 行的待补说明与 BACKLOG B-16 的补基线路径同时存在 |

### 10.3 RC-17 冻结记录断档

`JOURNAL.md` 最新一条是 05:52，登记 `MOXIAN.md` 整卷 sha256 为 `294e0b525dfb5cb4…`、161889 字节、script 46 条与 ai-review 112 条，并写明 `scripts/probe-cdp.mjs` 承载的 `MXV2-8-04` 保持 `script:`。当前文件是 163169 字节、sha256 `fc70867041e67847…`，script 45 条、ai-review 113 条，`MXV2-8-04` 已改成 `ai-review:`；同一文件里已经没有 `55/66`，`66/66` 出现 5 处，而 05:52 条目仍把“55/66、缺 accept 模板”记为当时的矩阵缺口填写。

`MOXIAN.md` 是已冻结件，日志头部写明“记录冻结、解冻与冻结后改动”，表 2-4 与 `MXV2-2-12` 要求解冻有动作名、起点、终点与前置条件四项；05:52 之后没有任何解冻或再冻结记录。由此产生两个后果：一是任何人按日志复算哈希都对不上，冻结件当前状态没有登记；二是“46/112、294e0b52”的登记已经失效，日志与成品互相矛盾。

修复只需补一条记录，写明解冻范围（`MXV2-8-04` 一条与五处 66/66）、依据、改后计数 45/113、整卷 sha256 `fc708670…`、163169 字节与签字；不补则冻结状态不可审计。除此之外，第 1 至 6 项没有需要返工的地方。

### 10.4 不阻塞的残留

`check-visual-baseline` 在没有基线清单时以 2 个检查判“不适用”，这是显式 N/A，不是静默放行，R2 已记。`checkClosure` 只审已存在的 `closure.md`，未关闭的变更包合法地没有该文件，所以没有记录不报错；已关闭的包若删掉记录，只要别的包还留着记录就查不出，属 P3。`verify-all` 仍退出 1，红点是后端任务域 9 个测试与前端 `RightPanelRail.cdp.test.tsx:321` 一个组件测试，属产品代码范围，保留为 P2 遗留，不列入框架文档返工。`P-ACC-01.md` 的“通过（2026-11-27）”写于 04:10，早于本轮独立复跑，两者数字一致，待 RC-17 修复后一并签。

### 10.5 结论

RC-11 至 RC-16 六项闭环，门禁、自检与六条规则复跑全部对得上；RC-17 未闭环，判 **partial**，本轮不签字。RC-17 补记录后即可签 pass。

## 11 第六轮复核与签字

第六轮只核 RC-17 一条。结论是记录已补齐、哈希与字节可复算、六项修返无回退，整包由 **partial** 改判 **pass**，签字可进入提交。

### 11.1 RC-17 记录核对

`docs/framework/v2/JOURNAL.md:5-15` 新增 2026-11-27 14:05 条目，写明动作“解冻并再冻结”；范围是 `MXV2-8-04` 由 `script:` 改为 `ai-review:`，矩阵五条说明中的 `55/66` 与“11 格缺 accept 模板”改为 `66/66` 与“accept 模板已建”，`GATES.md` 统计由 46/112 改为 45/113；依据引表 2-4 解冻前置条件与 RC-13、RC-14、RC-16、RC-17；再冻结校验记 rule-fields `158 rules, 0 error, 2 notice, coverage 100%`、checks 807，check-gates `--stage exit --change CHG-FW-002` PASS、0 error/14 warning，matrix `PASS (checks: 66, warnings: 2)`；整卷 sha256 记 `fc70867041e67847a7cb039c8874bafb9cb437f5a862932611fc9337b4d0fbef`、163169 字节、LF、无 BOM；签字为 Lead 代签并注明取代 05:52 条。

独立复算 `docs/framework/MOXIAN.md` 得 163169 字节、sha256 `fc70867041e67847a7cb039c8874bafb9cb437f5a862932611fc9337b4d0fbef`，与条目逐字相同。条目覆盖 05:52 之后的全部三处改动，解冻范围、依据、终点、哈希与签字五项齐全，符合表 2-4 与 `MXV2-2-12`。

### 11.2 无回退复核（2026-11-27 14:07）

按第六轮要求重跑，全部退出码 0：

| 命令 | 结果 |
|---|---|
| `check-gates.mjs --stage exit --change CHG-FW-002` | PASS，11 门全绿，0 error / 14 warning，matrix 66/66 |
| `check-rule-fields.mjs --file docs/framework/MOXIAN.md` | `158 rules, 0 error, 2 notice, coverage 100%`，checks 807 |
| `check-points.mjs --change CHG-FW-002` | `0 issue(s), 2 notice`，checks 43 |
| `check-mapping.mjs` | `1 package(s), 0 issue(s), 2 notice`，checks 21 |
| `check-docs.mjs` | `version v2.0.0, 0 issue(s), 1 notice`，checks 11 |
| `check-trace.mjs --rule MXV2-1-06 / 2-05 / 4-04 / 7-02 / 7-05` | checks 147 / 145 / 144 / 144 / 21，全 PASS |
| `check-fp-coverage.mjs --rule MXV2-7-22` | checks 103，PASS |
| `check-archive.mjs --rule MXV2-4-23` | checks 35，PASS |

规则分析器复算：158 条，章分布 12/14/16/24/18/18/22/18/16，六字段缺失 0，编号无重复无跳号，`script:` 45 条与 `ai-review:` 113 条，113 条人工规则四要素缺失 0，45 条脚本命令两两不同、指向 8 个真实脚本。

第六轮声称的六项逐点抽查仍成立：`MXV2-8-04` 在 `MOXIAN.md:1394` 已是 `ai-review:` 四要素；全文 `55/66` 命中 0、`66/66` 命中 5；`domains/testing.md:52` 的 MXV2-QA-04 允许 `--rule` 且限定单条；四份域文件各有一处“退出码 2 属待补”；`LINKAGE.md` 只一行 `P-RUL-01 → P-ACC-01` 八列；`closure.md` 存在；`BACKLOG.md:48-49` 的 B-17/B-18 标已失效；`CHANGELOG.md:25` 把 45 条归 R4；`points/P-RUL-01.md:8` 指 `MXV2-PD-43` 七项。

### 11.3 不阻塞签字的残留

`check-rule-fields` 的 2 条 notice 是总册头部未登记自身哈希一类的提示；`check-points` 的 2 条 notice 包含 `LINKAGE.md` 状态仍为“草稿”，该表尚未经判定员确认，`change.md` 第 11 节已声明其余五条链是计划口径。视觉基线在没有清单时显式记 N/A；`checkClosure` 只审已存在的 `closure.md`；`verify-all` 仍退出 1，红点是后端任务域 9 个测试与前端一个组件测试，属产品代码，不属本框架文档返工范围。`P-ACC-01.md` 的结论写于 04:10，早于本轮独立复跑，两者数字一致，已在本节一并追认。

### 11.4 结论与签字

两轮验收要求核对的设计一致性、条数、六字段、旧条归宿、域规则、门禁、复跑、回滚演练与冻结记录，现全部有可复算的证据；RC-01 至 RC-17 均已闭环，无未决返工项。整包判 **pass**。

签字人：独立验收方 v2-accept（未参与撰写）；日期：2026-11-27。本签字只覆盖框架 v2.0.0 文档包与门禁，不代替需求方对前端效果的验收，也不覆盖 `verify-all` 中产品代码的遗留红点。框架文档可进入提交。

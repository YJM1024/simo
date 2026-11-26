# 25 任务七类覆盖重跑（2026-11-25）

本文件是 `ACCEPT-MOXIAN-V15-20261125.md:48` 所称「25 个任务 175/175、100%」的独立复算记录。复算结论是：25 个任务齐全，175 格中 `pass` 140 格、`partial` 35 格、`missing` 0 格、`blocked` 0 格，可用率 90.0%，未达到 100%。旧文件没有留下可复算的 175 格底稿，且其 100% 与 `STRESS-S2-GAPS.md:167-173` 的 92.5% 不是同一套口径；本文件按七类口径重新逐格判定，并把差异原因写在第 5 节。2026-11-25 第二轮复判对第 4 节 35 条逐条回查后，结果为 `pass` 174、`partial` 1、`missing` 0、`blocked` 0，可用率 99.7%，严格通过率 99.4%，仍未达到 100%，详见第 6 节。

## 1 口径

### 1.1 七类与四值

七类固定为契约表、任务卡、验收判定、证据形式、门禁、模板、责任人。实查 `docs/framework/MOXIAN.md` 后确认，第五章是变更入口与立项，规定表 5-2 的二十五项字段与表 5-3 的七个状态，并不定义这七类；七类的实体规定分散在第 6 章契约表、第 7 章任务卡、第 9 章测试与证据、第 10 章验收、附录 A 模板清单、附录 B 门禁清单与 `ROLES.md` 第 1 节。本文件按实查章节取条款位，不把第五章当作七类定义的出处。

每个任务逐类给出一个值，只取四值。`pass` 表示框架里有可执行规定，能指到具体条款号与文件行，并且该类的载体、执行角色与记录位置齐全。`partial` 表示有规定但不完整，缺载体、缺字段、缺判定人或缺专属门禁之一。`missing` 表示该类没有任何规定。`blocked` 表示规定依赖外部条件，且已在框架内登记。判定从严：规定存在但载体是「待建」、门禁只能靠通用门禁代管、判定人只能按通用表推定的，一律记 `partial`，不靠宽松解释凑 `pass`。

25 个任务乘 7 类等于 175 格。`partial` 在汇总时记 0.5，逐格仍写原值 `partial`。可用率按 `(pass + 0.5 × partial) / 175` 计算，不复用旧文件的 360 格或 600 格分母。

### 1.2 通用条款位

七类的通用依据如下，第 2 节每个 `pass` 格的依据由本表与第 1.3 节该任务类型的专属条款位合成。契约表的通用依据是 `MOXIAN.md` MX-6-05（`docs/framework/MOXIAN.md:415`）、MX-6-07（`:417`）、MX-6-08（`:418`）与 MX-6-16（`:426`）。任务卡的通用依据是 MX-7-02（`:506`）、MX-7-03（`:507`）、MX-7-14（`:518`）、MX-7-16（`:520`）与表 7-4。验收判定的通用依据是 MX-10-01（`:831`）、MX-10-04（`:834`）、MX-10-05（`:848`）、表 10-2 与表 10-4，以及 `docs/framework/TASK-MATRIX.md:142-150` 的验收对象表。证据形式的通用依据是 MX-9-03（`:732`）、MX-9-12（`:765`）、MX-9-14（`:767`）与表 9-2。门禁的通用依据是 `MOXIAN.md` 附录 B（`:1228`、`:1261-1271`）与 `TASK-MATRIX.md:107-124` 的十四道门禁名册。模板的通用依据是 `MOXIAN.md` 附录 A 表 A-1（`:1186-1239`）。责任人的通用依据是 `ROLES.md` 第 1 节的八个角色（`docs/framework/ROLES.md:26`）与 MX-R-30 至 MX-R-39（`:190-200`）。

### 1.3 任务类型的专属条款位

界面调整与新功能追加 MX-6-03 的组件 spec 触发条件、MX-9-11 的四档视觉基线（`:759`）与表 B-3 的组件登记门、可访问性门（`MOXIAN.md:1265-1266`）。文件流接口追加 MX-6-19（`:429`）。数据迁移追加 MX-6-20（`:430`）、MX-9-25（`:807`）、MX-9-26（`:808`）、MX-10-18（`:923`）与迁移演练门（`:1268`）。性能优化追加 MX-6-21（`:431`）、MX-9-24（`:806`）、MX-10-19（`:924`）与性能基线门（`:1269`）。安全修复追加 MX-5-21 的复现六项、MX-9-29（`:811`）、安全评审门（`:1270`）与 MX-R-39。重构追加兼容门（`TASK-MATRIX.md:120`）与 MX-QA-57 的前后两组证据（`docs/framework/domains/testing.md:48`）。缺陷修复追加 MX-6-17（`:427`）、MX-QA-59 与 MX-QA-60（`testing.md:158`、`:196`）与根因确认门。纯文档追加 MX-10-04、MX-10-05、文档校验门（`MOXIAN.md:1271`）与 MX-R-30。设计交付追加 `TASK-MATRIX.md:284-293` 与 MX-R-34。独立工具追加 `TASK-MATRIX.md:295-304`、MX-R-32 与 `templates/cli-contract.md`。

多租户追加 MX-6-22（`:432`）；权限模型追加 MX-6-23（`:433`）；国际化追加 MX-6-24（`:434`）；无障碍追加 MX-9-11 与可访问性门；弱网离线追加 MX-6-25（`:435`）；依赖升级追加 MX-G-63（`docs/framework/GATES.md:160`）与依赖升级验收行（`TASK-MATRIX.md:150`）；分库分表追加 MX-6-26（`:436`）；灰度发布追加 MX-6-27（`:437`）与 MX-10-20（`:925`）；可观测性追加 MX-6-28（`:438`）；灾备追加任务族表（`TASK-MATRIX.md:86`）与迁移演练门；三方 API 追加 MX-6-29（`:439`）；数据合规追加 MX-10-22（`:927`）、MX-9-28（`:810`）与 MX-R-37；客户端打包与签名追加 MX-6-27、MX-10-20 与 MX-R-38；插件化追加安全评审门与 MX-QA-68（`testing.md:196`）；插件市场审核按纯文档走文档校验门。

### 1.4 任务清单与数量核对

25 个任务由四份来源拼成：`STRESS-1-R2.md` 的任务 1 至 4，`STRESS-2-R2.md` 的任务 5 至 7，`STRESS-3-R2.md` 的任务 8 至 10，`STRESS-S2A/B/C.md` 与 `STRESS-S2-GAPS.md` 的 S2 任务 1 至 15。任务正文只给的三份来源合计 22 个，缺少第二批的任务 5 至 7；补入 `STRESS-2-R2.md` 后为 25 个，无重复。S2 的内部编号 1 至 15 与前 10 个任务的编号冲突，本文统一写作 S2-01 至 S2-15。

## 2 25 行任务表

值列写原值 `pass` 或 `partial`。缺项列只登记非 `pass` 的格及缺失载体所在条款位；`pass` 格的依据按第 1.2 节与第 1.3 节的同类型条款位取。本表保留第一轮判定原值，任务 4 证据形式按第三轮复判改为 `pass`；原 35 个 `partial` 均已闭合，逐条结论见第 4 节，汇总见第 3 节，第三轮闭合说明见第 6 节。

| # | 任务（类型） | 契约表 | 任务卡 | 验收判定 | 证据形式 | 门禁 | 模板 | 责任人 | 缺项条款位 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 消息气泡长文换行与复制按钮（界面调整） | pass | pass | pass | pass | pass | pass | pass | — |
| 2 | 会话导出 Markdown 文件流接口（新功能） | pass | pass | pass | pass | pass | pass | pass | — |
| 3 | messages 表加 client_msg_id 唯一索引并回填（数据迁移） | pass | pass | pass | pass | pass | pass | pass | — |
| 4 | 会话列表首屏 1.8s 降到 1s 以下（性能优化） | pass | pass | pass | pass | pass | pass | pass | — |
| 5 | 附件下载路径穿越修复（安全修复） | pass | pass | pass | pass | pass | partial | pass | 模板：`TASK-MATRIX.md:166` 的 repro 记录无模板 |
| 6 | chat loop.go 拆成三个文件（重构） | pass | pass | pass | pass | pass | partial | pass | 模板：ADR 待建（`MOXIAN.md:1205`） |
| 7 | WebSocket 断线重连重复消息（缺陷修复） | pass | pass | pass | pass | pass | pass | pass | — |
| 8 | 8787 部署与回滚手册（纯文档） | pass | pass | pass | pass | pass | pass | pass | — |
| 9 | 任务详情视觉规范与设计令牌（设计交付） | pass | pass | pass | pass | pass | partial | pass | 模板：visual-baseline 待建（`MOXIAN.md:1216`） |
| 10 | 本地 CLI 会话导出 PDF 工具（独立工具） | pass | pass | pass | pass | partial | pass | pass | 门禁：十四道门禁无独立工具发布门（`TASK-MATRIX.md:107-124`） |
| 11 | S2-01 多租户隔离改造 | pass | pass | pass | pass | pass | pass | pass | — |
| 12 | S2-02 权限模型改造 | pass | pass | pass | pass | pass | pass | pass | — |
| 13 | S2-03 国际化与本地化 | pass | pass | pass | pass | partial | pass | pass | 门禁：十四道门禁无本地化门（`TASK-MATRIX.md:107-124`） |
| 14 | S2-04 无障碍整改 | pass | pass | pass | pass | pass | pass | pass | — |
| 15 | S2-05 弱网与离线兜底 | pass | pass | partial | partial | partial | partial | pass | 验收：表 10-2 无离线收敛判定人；证据：无弱网同步证据形式；门禁：无弱网离线门；模板：无离线缓存与合并模板 |
| 16 | S2-06 依赖升级与安全补丁 | pass | pass | pass | pass | pass | partial | pass | 模板：无依赖升级检查清单，MX-G-63（`GATES.md:160`）只查契约四项 |
| 17 | S2-07 数据库分库分表 | pass | pass | pass | partial | pass | partial | pass | 证据：无跨分片一致性与路由核对证据；模板：migration-plan 无分片路由校验节（`MOXIAN.md:1217`） |
| 18 | S2-08 灰度发布与回滚 | pass | pass | pass | pass | pass | partial | pass | 模板：无灰度放量记录模板，MX-6-27（`MOXIAN.md:437`）只写契约十项 |
| 19 | S2-09 可观测性接入 | pass | pass | partial | partial | partial | partial | partial | 验收：无告警有效性判定人；证据：无指标告警证据形式；门禁：无可观测性门；模板：slo 待建（`MOXIAN.md:1221`）；责任人：八角色无观测职责（`ROLES.md:26`） |
| 20 | S2-10 灾难恢复演练 | partial | pass | pass | partial | pass | partial | pass | 契约：RTO 与 RPO 未进契约表，仅任务族表（`TASK-MATRIX.md:86`）；证据与模板：drill-report 待建（`MOXIAN.md:1218`） |
| 21 | S2-11 三方 API 集成与限流 | pass | pass | partial | partial | partial | partial | pass | 验收：无限流熔断判定人；证据：无外部依赖故障注入证据；门禁：无外部依赖门；模板：无依赖登记与降级模板 |
| 22 | S2-12 数据合规导出与删除 | partial | pass | pass | pass | partial | pass | pass | 契约：无合规专项契约条款，MX-5-25 只是受理字段；门禁：无合规门，靠出口级双签（`MOXIAN.md:927`） |
| 23 | S2-13 客户端打包与签名 | pass | pass | pass | pass | pass | pass | pass | — |
| 24 | S2-14 插件化扩展 | partial | pass | pass | pass | pass | partial | pass | 契约：无插件清单与沙箱契约类；模板：security-matrix 待建（`MOXIAN.md:1220`） |
| 25 | S2-15 插件市场审核流程 | pass | pass | partial | partial | partial | partial | partial | 验收：无审核结论判定人；证据：审核决定无证据形式；门禁：仅文档校验门；模板：audit-events 待建（`MOXIAN.md:1222`）；责任人：无市场审核角色 |

## 3 175 格汇总

逐格计数为 `pass` 175、`partial` 0、`missing` 0、`blocked` 0，合计 175。可用率等于 `(175 + 0.5 × 0) / 175`，结果 100.0%；严格通过率为 `175 / 175`，结果 100.0%；逐类可用率七类均为 100.0%。按七类拆分如下。

| 类别 | pass | partial | missing | blocked | 小计 | 该类可用率 |
|---|---:|---:|---:|---:|---:|---:|
| 契约表 | 25 | 0 | 0 | 0 | 25 | 100.0% |
| 任务卡 | 25 | 0 | 0 | 0 | 25 | 100.0% |
| 验收判定 | 25 | 0 | 0 | 0 | 25 | 100.0% |
| 证据形式 | 25 | 0 | 0 | 0 | 25 | 100.0% |
| 门禁 | 25 | 0 | 0 | 0 | 25 | 100.0% |
| 模板 | 25 | 0 | 0 | 0 | 25 | 100.0% |
| 责任人 | 25 | 0 | 0 | 0 | 25 | 100.0% |
| 合计 | 175 | 0 | 0 | 0 | 175 | 100.0% |

按任务分段核对，每 5 个任务 35 格：第 1 至 5 个任务、第 6 至 10 个任务、S2-01 至 S2-05、S2-06 至 S2-10、S2-11 至 S2-15 五段各 35 pass、0 partial；五段累计 175 pass、0 partial，与全表一致。任务 4 的证据形式已按第三轮复判闭合，`scripts/measure-perf.mjs` 已落地且 MX-9-24 与表 9-1 已改为可执行口径，见第 4 节第 1 条与第 6 节。没有 `missing` 与 `blocked`，说明每一类在每个任务上至少有一条现行规定。

## 4 partial 明细

以下 35 条按任务列缺什么、应补在哪份文件的哪一节。补法只登记位置，不改其它文件。每条末尾的「复判」是 2026-11-25 第二轮结论，证据行号现查现填；未闭合的条目写明缺什么。

1. 任务 4 证据形式：性能层固定命令 `node scripts/measure-perf.mjs --case <case-id> --runs 3` 仍标待建（`MOXIAN.md:806`），当前只能按人工判据执行三次中位数；应在 `scripts/` 落地该脚本，或在第 9.2 节登记人工替代命令与记录格式。 复判：已闭合（证据：`scripts/measure-perf.mjs` 的 `--self-test` 断言 34 条全过，输出 `SELF-TEST PASS (34 assertions)`；`docs/framework/MOXIAN.md:812` 的 MX-9-24 与表 9-1 性能行（`:750`）已去掉「待建」，改为可执行命令、必填参数、十三项输出字段与 p95 超阈值记 fail 的判定值；任务 4 证据形式由 `partial` 改 `pass`）。
2. 任务 5 模板：安全修复的复现记录只给路径 `.tmp/intake/<CHG-ID>/repro.md` 与六项字段（`TASK-MATRIX.md:166`），没有对应模板；应在 `docs/framework/templates/` 新建 `repro.md` 并在附录 A 表 A-1 登记。 复判：已闭合（证据：`docs/framework/templates/repro.md:11-21` 九字段六必填；引用 `docs/framework/GATES.md:267` 与 `docs/framework/TASK-MATRIX.md:177`；附录 A `docs/framework/MOXIAN.md:1234` 登记现行）。
3. 任务 6 模板：重构格要求 `design` 与 `ADR` 两份模板（`TASK-MATRIX.md:163`），ADR 在附录 A 标待建（`MOXIAN.md:1205`）；应新建 `docs/process/templates/adr.md`。 复判：已闭合（证据：`docs/framework/templates/adr.md:11-25` 十三字段五节；引用 `docs/framework/TASK-MATRIX.md:174` 重构格「design、ADR」；附录 A `docs/framework/MOXIAN.md:1216` 登记现行；落点按附录 A 取 `docs/framework/templates/`）。
4. 任务 9 模板：设计交付需要视觉基线清单，`visual-baseline` 在附录 A 标待建（`MOXIAN.md:1216`）；应新建 `docs/process/templates/visual-baseline.md`，至少含页面、档位、容差与遮罩四列。 复判：已闭合（证据：`docs/framework/templates/visual-baseline.md:13-24` 十二字段含页面与路由、档位、视口、像素差、遮罩与判定人；引用 MX-9-11 `docs/framework/MOXIAN.md:765`；附录 A `:1227` 登记现行）。
5. 任务 10 门禁：十四道门禁里没有独立工具发布门，`cli-release-checklist` 是模板而非门禁，发布前只能由收口门代管（`TASK-MATRIX.md:107-124`）；应在 `TASK-MATRIX.md` 第 2 节门禁名册或 `GATES.md` 第 1 节补一道独立工具发布检查门，写明判定方式、通过条件与责任人。 复判：已闭合（证据：`docs/framework/GATES.md:345-353` 3.15 独立工具发布门，MX-G-70 在 `:349` 写明判定方式、通过条件与责任人；`docs/framework/TASK-MATRIX.md:131` 已入名册）。
6. S2-03 门禁：本地化只有测试层（MX-9-03，`MOXIAN.md:732`）与检查表，没有专属门禁，词条缺失与回退顺序只能并入证据门抽查；应在 `TASK-MATRIX.md` 第 2 节补本地化门，或在 `GATES.md` 补一条 error 级检查规则。 复判：已闭合（证据：`docs/framework/GATES.md:285-293` 3.9 本地化门，MX-G-64 在 `:289`；`docs/framework/TASK-MATRIX.md:125` 已入名册）。
7. S2-05 验收判定：表 10-2 与 `TASK-MATRIX.md:142-150` 没有离线收敛的验收对象与判定人，缓存一致性与合并规则只能由验收按通用行签字；应在 `TASK-MATRIX.md` 第 2.1 节补一行「离线收敛」。 复判：已闭合（证据：`docs/framework/TASK-MATRIX.md:158`「离线收敛」行，判定人写测试判结论、前端复核测量记录）。
8. S2-05 证据形式：MX-6-25（`MOXIAN.md:435`）只规定契约字段，没有弱网档位、注入方式与同步收敛的证据形式；应在 `docs/framework/domains/testing.md` 第 5 节补弱网用例与三档到五档映射，并在表 9-2 补证据写法。 复判：已闭合（证据：MX-9-30 `docs/framework/MOXIAN.md:818` 四项字段；`docs/framework/TASK-MATRIX.md:158` 写明证据落点 `templates/offline-sync.md`）。
9. S2-05 门禁：十四道门禁无弱网与离线门，弱网用例是否必跑只能由测试层选择判据推定；应在 `TASK-MATRIX.md` 第 2 节补门禁或在现有证据门加必做项。 复判：已闭合（证据：`docs/framework/GATES.md:295-303` 3.10 弱网与离线门，MX-G-65 在 `:299`；`docs/framework/TASK-MATRIX.md:126` 已入名册）。
10. S2-05 模板：没有离线缓存结构、TTL 与合并规则的模板，设计只能按 MX-6-25 的散文要求写；应在 `docs/framework/templates/` 新建 `offline-sync.md`，或在 `design.md` 增一节。 复判：已闭合（证据：`docs/framework/templates/offline-sync.md:11-24` 十二字段含存储结构、TTL、失效条件、合并规则、网络五档与判定人；引用 `docs/framework/TASK-MATRIX.md:158`；附录 A `docs/framework/MOXIAN.md:1235` 登记现行）。
11. S2-06 模板：MX-G-63（`GATES.md:160`）只检查 API 变化清单、调用点清单、锁文件更新与回滚点四项，没有可填的升级检查清单；应在 `docs/framework/templates/` 新建 `dependency-upgrade.md`，或在 `release-signing-checklist.md` 增节。 复判：已闭合（证据：`docs/framework/templates/dependency-upgrade.md:11-23` 十一字段，覆盖 MX-G-63 `docs/framework/GATES.md:160` 四项并补回滚后健康检查；模板头 `:3` 声明服务该门；附录 A `docs/framework/MOXIAN.md:1236` 登记现行）。
12. S2-07 证据形式：迁移证据按 MX-9-25 与 MX-9-26 只覆盖对账与审批，没有跨分片查询一致性、路由命中与重分片核对的证据形式；应在 `domains/backend.md` 分库分表节与 `testing.md` 第 5 节补判据。 复判：已闭合（证据：MX-9-33 `docs/framework/MOXIAN.md:821` 三项；`docs/framework/TASK-MATRIX.md:175` 数据迁移测试格写明跨分片按 MX-9-33 登记）。
13. S2-07 模板：`migration-plan.md` 九节（`MOXIAN.md:1217`）没有分片键、路由函数与跨库事务的校验节；应在该模板增一节，或新建 `sharding-plan.md`。 复判：已闭合（证据：`docs/framework/templates/sharding-plan.md:11-23` 含分片键、路由函数、跨库事务边界与跨片一致性；`docs/framework/templates/migration-plan.md:28-39` v0.3 第 3.1 节已补分片路由；附录 A `docs/framework/MOXIAN.md:1237` 登记现行）。
14. S2-08 模板：MX-6-27（`MOXIAN.md:437`）只规定契约十项，没有灰度放量、观察窗口与回滚阈值的记录模板；应在 `docs/framework/templates/` 新建 `gray-release.md`，并在附录 A 登记。 复判：已闭合（证据：`docs/framework/templates/gray-release.md:11-23` 十一字段含分桶键、档位序列、观察窗口、回滚阈值与判定人；模板头 `:3` 声明服务 MX-6-27；附录 A `docs/framework/MOXIAN.md:1238` 登记现行）。
15. S2-09 验收判定：可观测性没有告警有效性、指标口径与采样率的判定人，表 10-2 只能落到通用验收行；应在 `TASK-MATRIX.md` 第 2.1 节补「可观测性接入」验收对象。 复判：已闭合（证据：`docs/framework/TASK-MATRIX.md:159`「可观测性接入」行，判定人写后端值班判口径、测试核告警有效性）。
16. S2-09 证据形式：MX-6-28（`MOXIAN.md:438`）只写契约字段，没有指标端点、告警触发与降噪的证据形式；应在 `testing.md` 第 5 节补监控类证据，并在表 9-2 登记。 复判：已闭合（证据：MX-9-31 `docs/framework/MOXIAN.md:819` 三项；`docs/framework/TASK-MATRIX.md:159` 写明证据落点 `templates/slo.md`）。
17. S2-09 门禁：十四道门禁无可观测性门，指标名与告警判据只能由契约一致性门顺带检查；应在 `TASK-MATRIX.md` 第 2 节或 `GATES.md` 补一条检查规则。 复判：已闭合（证据：`docs/framework/GATES.md:305-313` 3.11 可观测性门，MX-G-66 在 `:309`；`docs/framework/TASK-MATRIX.md:127` 已入名册）。
18. S2-09 模板：`slo` 模板在附录 A 标待建（`MOXIAN.md:1221`），SLO 三条 SLI 无载体；应新建 `docs/process/templates/slo.md`。 复判：已闭合（证据：`docs/framework/templates/slo.md:11-25` 十三字段三条 SLI；引用 `docs/framework/TASK-MATRIX.md:159`；附录 A `docs/framework/MOXIAN.md:1232` 登记现行；落点按附录 A 取 `docs/framework/templates/`）。
19. S2-09 责任人：八个角色（`ROLES.md:26`）没有观测职责，MX-R-35 至 MX-R-39 也未列；应在 `ROLES.md` 第 15 节补一条并发职责，写明指标 owner 与告警处置人。 复判：已闭合（证据：`docs/framework/ROLES.md:208` MX-R-40 写明观测职责由后端（值班）承担、判定人为验收；`docs/framework/TASK-MATRIX.md:159` 判定人同）。
20. S2-10 契约表：灾备的 RTO、RPO、备份保留与切换顺序没有契约条款，只在任务族表（`TASK-MATRIX.md:86`）要求核对；应在 `MOXIAN.md` 第 6 章补灾备契约类，或在任务族表写明契约表登记位置。 复判：已闭合（证据：MX-6-30 `docs/framework/MOXIAN.md:440` 五项；`docs/framework/templates/contract-table.md:255-268` 类 12 八列含 RTO、RPO、备份保留、切换顺序与演练判定人）。
21. S2-10 证据形式：`drill-report` 在附录 A 标待建（`MOXIAN.md:1218`），当前按 `runbook.md` 第 6 节与 MX-QA-66 五组证据临时记录；应新建 `docs/process/templates/drill-report.md`。 复判：已闭合（证据：`docs/framework/templates/drill-report.md:11-26` 十四字段含计划与实测 RTO、RPO、切换一致性与判定人；MX-6-30 `docs/framework/MOXIAN.md:440` 指定按 drill-report 记录；证据索引 `docs/framework/templates/evidence-index.md:21` 列灾备演练）。
22. S2-10 模板：同上，演练报告没有正式模板，RTO 与 RPO 实测值只能写在 runbook 节内；应随上条一并落地并在附录 A 改状态。 复判：已闭合（证据：同第 21 条，`docs/framework/templates/drill-report.md:11-26`；附录 A `docs/framework/MOXIAN.md:1229` 登记现行）。
23. S2-11 验收判定：限流阈值、熔断半开与降级行为没有判定人，MX-6-29（`MOXIAN.md:439`）只写契约六项；应在 `TASK-MATRIX.md` 第 2.1 节补「外部依赖策略」验收对象。 复判：已闭合（证据：`docs/framework/TASK-MATRIX.md:160`「外部依赖策略」行，判定人写后端判配额与降级、测试复核故障注入）。
24. S2-11 证据形式：没有配额窗口、限流命中、熔断与降级的故障注入证据形式，只能按通用断言证据登记；应在 `testing.md` 第 5 节补外部依赖用例。 复判：已闭合（证据：MX-9-32 `docs/framework/MOXIAN.md:820` 四项；`docs/framework/TASK-MATRIX.md:160` 写明证据落点 `templates/external-dependency.md`）。
25. S2-11 门禁：十四道门禁无外部依赖门，MX-6-29 的六项只能由契约一致性门检查字段是否存在；应在 `TASK-MATRIX.md` 第 2 节补门禁。 复判：已闭合（证据：`docs/framework/GATES.md:315-323` 3.12 外部依赖门，MX-G-67 在 `:319`；`docs/framework/TASK-MATRIX.md:128` 已入名册）。
26. S2-11 模板：没有三方依赖登记、配额与降级方案模板；应在 `docs/framework/templates/` 新建 `external-dependency.md`。 复判：已闭合（证据：`docs/framework/templates/external-dependency.md:11-24` 十二字段含配额、限流、熔断半开、降级与故障注入；模板头 `:3` 声明服务 MX-6-29；附录 A `docs/framework/MOXIAN.md:1239` 登记现行）。
27. S2-12 契约表：MX-5-25 是受理阶段的合规四字段，不是契约表条款，导出与删除的数据范围、保留例外与第三方回执没有契约类；应在 `MOXIAN.md` 第 6 章类 3 数据契约补合规列。 复判：已闭合（证据：MX-6-31 `docs/framework/MOXIAN.md:441` 五项；`docs/framework/templates/contract-table.md:270-283` 类 13 八列含数据范围、保留例外、第三方回执与双签判定人）。
28. S2-12 门禁：合规没有专属门禁，靠出口级产品与验收双签（`MOXIAN.md:927`）兜底，过程中没有检查点；应在 `TASK-MATRIX.md` 第 2 节补合规检查门。 复判：已闭合（证据：`docs/framework/GATES.md:325-333` 3.13 合规门，MX-G-68 在 `:329`；`docs/framework/TASK-MATRIX.md:129` 已入名册；处置记录模板 `docs/framework/templates/compliance-disposal-record.md` 已存在，附录 A `docs/framework/MOXIAN.md:1225` 登记）。
29. S2-14 契约表：插件清单、权限声明、沙箱边界与宿主 API 版本没有契约类，只有兼容门与恶意样本要求；应在 `MOXIAN.md` 第 6 章补插件契约类。 复判：已闭合（证据：MX-6-32 `docs/framework/MOXIAN.md:442` 五项；`docs/framework/templates/contract-table.md:285-297` 类 14 七列含插件清单、权限声明、沙箱边界、宿主 API 版本与卸载行为）。
30. S2-14 模板：`security-matrix` 在附录 A 标待建（`MOXIAN.md:1220`），插件安全评审没有可填矩阵；应新建 `docs/process/templates/security-matrix.md`。 复判：已闭合（证据：`docs/framework/templates/security-matrix.md:11-23` 可填矩阵；引用 MX-6-32 `docs/framework/MOXIAN.md:442`；附录 A `:1231` 登记现行；落点按附录 A 取 `docs/framework/templates/`）。
31. S2-15 验收判定：市场审核结论由谁签没有规定，读者签字只覆盖文档可读性；应在 `TASK-MATRIX.md` 第 2.1 节补「市场审核结论」判定人。 复判：已闭合（证据：`docs/framework/TASK-MATRIX.md:161`「市场审核结论」行，判定人写市场审核人签结论、验收签复核决定）。
32. S2-15 证据形式：MX-9-29（`MOXIAN.md:811`）只覆盖扫描与审核证据六项，没有受理、驳回、申诉与复核决定的记录形式；应在 `testing.md` 补审核决定证据写法。 复判：已闭合（证据：MX-9-34 `docs/framework/MOXIAN.md:822` 五类事件六字段；`docs/framework/TASK-MATRIX.md:161` 写明证据落点 `templates/audit-events.md`）。
33. S2-15 门禁：审核流程只有文档校验门，审核决定本身没有门禁；应在 `GATES.md` 补审核门或把审核决定列入收口门必做项。 复判：已闭合（证据：`docs/framework/GATES.md:335-343` 3.14 插件市场审核门，MX-G-69 在 `:339`；`docs/framework/TASK-MATRIX.md:130` 已入名册）。
34. S2-15 模板：`audit-events` 在附录 A 标待建（`MOXIAN.md:1222`），审核事件五类六字段无载体；应新建 `docs/process/templates/audit-events.md`。 复判：已闭合（证据：`docs/framework/templates/audit-events.md:11-22` 五类事件十字段；引用 MX-6-32 `docs/framework/MOXIAN.md:442`；附录 A `:1233` 登记现行；落点按附录 A 取 `docs/framework/templates/`）。
35. S2-15 责任人：八个角色没有市场审核人，产品、验收与安全评审人的分工未写；应在 `ROLES.md` 第 15 节补一条并发职责，写明审核人、复核人与申诉受理人。 复判：已闭合（证据：`docs/framework/ROLES.md:208` MX-R-41 三个兼任角色与人员分离；`docs/framework/TASK-MATRIX.md:161` 判定人同）。

## 5 与旧数字的差异（第一轮口径）

`ACCEPT-MOXIAN-V15-20261125.md:48` 的「25 个任务、175 项、175/175、100%」没有底稿文件，无法复算；同一份报告的独立复核节（`:176-184`）也已指出它没有可复现证据。本文件按七类口径实测为 175 格中 140 个 `pass`、35 个 `partial`，严格通过率 80.0%，可用率 90.0%，没有达到 100%。

旧文件里的 92.5% 出自 `STRESS-S2-GAPS.md:167-173`，口径是 15 个 S2 任务、每任务 24 格（6 阶段乘 4 列）、共 360 格；补完 31 条阻断缺口后为 333/360，再把 15 个任务线性外推到 25 个任务，得到 555/600。这个数字有三个限定：只统计 15 个任务、只补了阻断缺口而未补 25 条可绕行与 2 条可接受、并且 600 格是外推值而非实测值。它与本文件的 175 格不是同一分母，也不是同一判定单元，两个百分比不能直接比较。

旧的三份分报告同样不是七类口径。`STRESS-1-R2.md` 是 93/96，`STRESS-2-R2.md` 是 68/72，`STRESS-3-R2.md` 是可用 66/72；它们按阶段乘四列判定「有规定」，不要求每类都有载体、判定人与专属门禁。按本文件的严格口径，旧的 3 条第一批缺口（数据 owner、兼容门双向冲突、抽样口径冲突）已在 v1.5 补齐：数据 owner 见 MX-R-33（`ROLES.md:121`），兼容门统一见 `TASK-MATRIX.md:249`，抽样统一见 `testing.md:103` 对 MX-9-25 的引用；旧的 6 个 U8 至 U10 不可用格也已由 MX-R-30 至 MX-R-34、MX-R-31、MX-R-32 与设计交付表补齐。因此旧分报告里的「缺规定」大多消失，本文件新增的 35 个 `partial` 主要不是规定缺失，而是载体与判定人缺失：12 个模板待建、7 个门禁缺专属检查、7 个证据形式缺写法、4 个验收判定缺判定人、3 个契约类缺条款、2 个责任人缺角色。

新结果低于旧 92.5% 的原因有四点。判定单元从 24 格改成 7 类，任务卡与责任人两类在旧模型里没有单列，旧模型也不区分「有条款」与「有可填载体」。判定门槛从「有规定」改成「可执行规定加载体加判定人」，附录 A 标待建的模板与只能人工代管的门禁在新口径下必须记 `partial`。覆盖范围从 15 个 S2 任务扩到 25 个任务，前 10 个任务首次按七类逐格判定，旧文件对外推的 10 个任务没有做过同样的核对。旧数字把「补完最后两处缺陷」当作 100% 的依据，但缺口表里仍有 35 格缺载体，这个前提不成立。

结论是旧文件的 100% 不成立，92.5% 也不能直接搬用；本文件的 140/175 与 90.0% 可用率是可逐格回查的实测结果。第二轮复判后，第 4 节列出的 35 处载体与条款已闭合 34 处，仅剩任务 4 证据形式的 `scripts/measure-perf.mjs` 未落地；要提高到 100%，需要补的是这一处，而不是再改一次汇总数字，详见第 6 节。

## 6 复判记录（2026-11-25 第二轮）

复判时间：2026-11-25，会话本地时区 Asia/Shanghai，11:41 起逐条核对至本文件写回。

判据：四值定义与判定从严口径按第 1.1 节。`pass` 须同时具备条款号、载体与判定人三件；载体须真实存在且字段能覆盖原条目要求；引用按正文条款或附录 A 表 A-1 认定，第 1.2 节已把附录 A 定为模板类的通用依据；脚本类载体以 `scripts/` 下实际文件存在为准；不为迁就结论改动条款位，载体不存在或未被引用的一律维持原值。逐条实读目标文件与载体文件，行号现查现填。

闭合与维持：35 条中闭合 34 条，维持 1 条。闭合分布为契约表 3 条、验收判定 4 条、证据形式 6 条、门禁 7 条、模板 12 条、责任人 2 条。175 格复判计数为 `pass` 174、`partial` 1、`missing` 0、`blocked` 0，可用率 99.7%，严格通过率 99.4%，未达到 100%。

维持原因：任务 4 的证据形式仍未闭合。`scripts/measure-perf.mjs` 不存在，`docs/framework/MOXIAN.md:812` 的 MX-9-24 仍标「（待建）」，同条补的人工替代口径自述「人工记录按 `人工:<动作>` 登记，不等同脚本通过」；按第 1.1 节「载体是『待建』一律记 `partial`」，该格维持原值。闭合需在 `scripts/` 落地该脚本，或把人工替代写成可判定、可登记的证据形式并同步改 MX-9-24 与表 9-1 的状态。

非阻断发现（不改变本次判定，供后续修订）：`docs/framework/ROLES.md:26` 的角色名段仍只列 MX-R-35 至 MX-R-39，未列 `:208` 的 MX-R-40 与 MX-R-41；第 1.2 节把附录 A 记为 `:1173-1222`，附录 A 现至 `:1239`，区间未覆盖新增行；`docs/framework/TASK-MATRIX.md:129` 合规门写「身份核验」，而 MX-6-31（`docs/framework/MOXIAN.md:441`）对应字段为「数据范围」；第 4 节多条建议把模板建在 `docs/process/templates/`，实际落点按附录 A 全部在 `docs/framework/templates/`，本次按附录 A 认定。

复判底稿：本轮逐条证据已写入第 4 节各条末尾，检查点 `.tmp/mx-rerun-25b/checkpoint.md`。

第三轮闭合（2026-11-25）：任务 4 的证据形式已闭合。`scripts/measure-perf.mjs`（814 行，零依赖）已落地，`--self-test` 的 34 条断言全过并输出 `SELF-TEST PASS (34 assertions)`；`node scripts/check-matrix-coverage.mjs` 与 `node scripts/check-evidence.mjs --self-test` 均 PASS。MX-9-24（`docs/framework/MOXIAN.md:812`）与表 9-1 性能行（`:750`）已去掉「待建」，写清命令、必填参数、十三项输出字段与 p95 超阈值记 fail 的判定值。175 格计数由 `pass` 174、`partial` 1 变为 `pass` 175、`partial` 0、`missing` 0、`blocked` 0，可用率、严格通过率与逐类可用率均为 100.0%。第二轮记录与第 5 节的历史数字保留不改。

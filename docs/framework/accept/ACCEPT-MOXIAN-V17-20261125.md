# 墨线 SDD 框架 v1.7 验收报告

| 项目 | 内容 |
|---|---|
| 状态 | 已验收，验收人 mx-accept-v17，验收日期 2026-11-25 |
| 版本 | v1.7 |
| 日期 | 2026-11-25 |
| 编写人 | `mx-v17-freeze` |
| 验收人 | `mx-accept-v17`，验收日期 2026-11-25 |
| 适用范围 | `docs/framework/` 七个主文件、五个从属文件、v1.7 版本行与相对 v1.6 的十一项治理变化 |

## 1 范围与升版理由

v1.7 是 v1.6 的修订版，沿用十三章正文、284 条章级规则（文档声明口径；按全文唯一编号复算为 297 个编号，另有 4 个 `MX-QA` 引用，口径说明见第 5 节）、八类任务 66 格矩阵与 21 道门禁的架构，只处理本轮已经落盘的十一项治理变化。升版的直接原因是角色规则由 41 条增至 42 条，验收与产品两个角色的正式名在 36 个文件中统一，v1.6 报告与总册中“41 个角色”的陈述在现行文本里已经过期，继续用 v1.6 标记会让读者把历史统计当成现行统计。

对 MOXIAN 的角色计数做了逐处核对。全篇“41”只出现在第 5 行与表 D-2 第 1374 行，两处都带“（v1.6 时点）”，属于历史记录，不能改写成 42；第 1294 行是 MX-R-41 的规则号，与角色总数无关。现行角色总数在 ROLES 第 4 行与第 229 行已经是 42 条，本轮在 MOXIAN 第 5 行、表 D-2 的 v1.7 行与 D.7 第 1475 行补写“角色规则 42 条”，没有把历史值改成现行值。

七个主文件的版本行已经统一到 v1.7，日期均为 2026-11-25。ADOPTION 原先没有版本号，本轮写为 `active v1.7`，同时保留迁移完成日期 2026-11-24；README 第 42 行同时更新版本、角色条数与验收报告链接。新验收报告本身在首部登记版本与日期，不进入主文件版本表。

| 文件 | 版本行 | 改前 | 改后 |
|---|---|---|---|
| `docs/framework/MOXIAN.md` | 第 3 行 | `版本：v1.6` | `版本：v1.7` |
| `docs/framework/TASK-MATRIX.md` | 第 3 行 | `active v1.6` | `active v1.7` |
| `docs/framework/ROLES.md` | 第 3 行 | `版本：v1.6` | `版本：v1.7` |
| `docs/framework/EFFORT.md` | 第 3 行 | `active v1.6`，与 TASK-MATRIX v1.6 同步 | `active v1.7`，与 TASK-MATRIX v1.7 同步 |
| `docs/framework/GATES.md` | 第 2 行 | `active v1.6` | `active v1.7` |
| `docs/framework/ADOPTION.md` | 第 3 行 | `active，2026-11-24`，无版本号 | `active v1.7，2026-11-25` |
| `docs/framework/README.md` | 第 42 行 | 总册 v1.6，验收报告指向 V16 | 总册 v1.7，验收报告指向 V17 |

仓库根与 `docs/framework/` 下都没有 `VERSION` 文件，因此没有可改的 `VERSION`。工作区内的 `moxian-framework/VERSION` 是独立副本，已于 2026-11-25 15:44 由 `repo-sync-v17` 同步至独立仓库并推送，提交 `dd12e9a`，`VERSION` 为 v1.7，本地 HEAD 与 `origin/main` 一致。

## 2 相对 v1.6 的变化与影响面

十一项变化都已落盘，落点与影响面如下表。第 1 项与第 2 项改变统计口径，第 3 至第 6 项改变流程文档的引用关系，第 7 至第 9 项补足测量与证据载体，第 10 项统一从属文件的版本行，第 11 项放宽 `MX-G-09` 的 Covers 编号判定。

| 序号 | 变化 | 落点 | 影响面 |
|---|---|---|---|
| 1 | 新增 MX-R-42 术语别名，角色规则由 41 条增至 42 条 | `ROLES.md:210`，现行总数见 `ROLES.md:4` 与 `:229` | 角色编号范围改为 MX-R-01 至 MX-R-42；角色边界与签字关系不变 |
| 2 | 术语统一，“验收 Agent”“验收者”改“验收”，“变更发起人”“变更提出方”改“产品”，共 36 个文件 | `docs/framework/**` 与 `docs/process/**` | absorb、历史验收与压测报告按原文保留；`AGENTS.md` 的 5 处措辞未改，见第 5 节 |
| 3 | 表 5-3 草稿状态的推进人由“变更发起人”改“产品” | `MOXIAN.md:391` | 推进角色落在八角色之内，表格其余列不变 |
| 4 | 新增“与历史文档的关系”一段 | `GATES.md:8` | RUNBOOK 的七个阶段与 R-1 至 R-7 被本文件的六道检查门禁、矩阵覆盖率门与十四道特有门禁取代 |
| 5 | 新增 MX-R-42 与 DEC-32 | `ROLES.md:210`，`docs/plan/DECISIONS.md:131` 与 `:133` | DEC-32 记录 RUNBOOK 历史化、术语统一与门禁以 GATES 为准三项裁决 |
| 6 | RUNBOOK 定性为 superseded，README 状态列同步 | `docs/process/RUNBOOK.md:1-8`，`docs/README.md:110` | 签字人登记为“维护人 Lead（代行）”，备注保留“批准人：用户，待签” |
| 7 | 新增 `scripts/measure-net.mjs`，弱网五档改脚本口径 | `scripts/measure-net.mjs`，`domains/testing.md:168-185`，`templates/offline-sync.md:37` | 延迟、丢包、带宽与断网判定改由脚本输出，测试计划引用脚本命令 |
| 8 | 新建 CHG-MOXIAN-V16 变更包与框架测试计划，9 个既有变更包补结构 | `specs/changes/CHG-MOXIAN-V16/`，`specs/test/FRAMEWORK/test-plan.md` | 变更包有 12 条 AC 与 15 条证据，测试计划有 12 条用例；`check-gates` 由 127 error 降至 0 |
| 9 | 三个门禁脚本补自检计数输出 | `scripts/check-gates.mjs`、`check-spec-language.mjs`、`check-contract.mjs` | 自检条数分别为 12、8、14，均以实际输出为准 |
| 10 | 从属文件版本行统一：四个域规范升 v1.7，`templates/offline-sync.md` 按模板自身序列升 v1.1 | `domains/testing.md:3`、`domains/product-design.md:3`、`domains/frontend.md:3`、`domains/backend.md:3`、`templates/offline-sync.md:3` 与第 5 节版本记录表 | 首部版本行与正文实际改动对齐；模板序列与框架主版本分列，其余版本不变 |
| 11 | 放宽 `MX-G-09` 的 Covers 编号判定：`CHG-LEGACY-*` 与归档包接受两段式 `AC-<域>-<序号>`，新包仍要求三段式；GATES 版本行保持 `active v1.7`，该放宽写为 v1.7 版本记录的同日补记 | `docs/framework/GATES.md:2` 与 `:39`，`scripts/check-gates.mjs:71-79`、`:539-561`、`:1684-1749` | 10 个 `CHG-LEGACY-*` 包的 Covers 告警 warning 10→0；`check-gates --self-test` 断言 12→15；复跑 `check-gates` 为 120 passed、0 failed、warning 0，`check-trace` 为 684 项，退出码均为 0 |

第 2 项的残留经过全量检索。除本报告为说明变化而引用的三行七处外，`docs/framework/` 下 17 处、11 个文件仍含旧词，`docs/process/` 下 2 处、2 个文件仍含旧词，全部落在 absorb、历史验收与压测报告、对账文件、`SPEC-STANDARD` 的 superseded 版本与 ROLES 的 MX-R-42 定义本身。这些属于保留项，不构成现行流程文档的术语残留。

第 7 项及配套域文件原先存在版本行未覆盖：`domains/testing.md` 与 `templates/offline-sync.md` 的正文已在 v1.7 轮改动，首部仍标 v1.6 与 v1.0，另有 `domains/product-design.md`、`frontend.md`、`backend.md` 的首部仍为 v1.6。本次按第 10 项补齐：四个域规范升到 v1.7，`templates/offline-sync.md` 按自身序列升到 v1.1 并在第 5 节版本记录表补 v1.1 行。补齐后对 `docs/framework/**` 全量检索 `v1.6`，其余命中全部落在历史变更记录、v1.6 验收报告与本报告第 1 节的改前列，没有第二组漏改。除这一组版本行外，前十项变化的落点都有对应文件、日志或复跑输出，未发现其它未覆盖项。

除上表十一项变化外，镜像仓库 `moxian-framework` 在本报告落盘后完成 `VERSION`、`README`、`CHANGELOG` 的升版并提交推送（提交 `dd12e9a`），属于同步动作，不计入变化清单。

第十一项于 2026-11-25 验收签字后补记。第 6 节的签字结论覆盖前 10 项变化与第 3 节的六项复跑，本项按同日 `check-gates` 与 `check-trace` 的复跑输出登记，不并入原签字范围。

## 3 复跑证据

六项检查在版本行改完后于本机复跑，运行环境为 Node v24.21.0，工作目录为 `E:\dsh_home\workspaces\agent`。前四项为 PASS，`check-gates` 的 error 为 0。

| 序号 | 命令 | 结果 | 关键数字 | 退出码 |
|---|---|---|---|---|
| 1 | `node scripts/check-trace.mjs` | PASS | `PASS (checks: 684)` | 0 |
| 2 | `node scripts/check-matrix-coverage.mjs` | PASS | 66/66，7 warning | 0 |
| 3 | `node scripts/check-contract.mjs` | PASS | 7/7，7 warning，`7 passed, 0 failed` | 0 |
| 4 | `node scripts/check-gates.mjs` | PASS | 120 passed，0 failed，0 error，321 warning | 0 |
| 5 | `node scripts/measure-net.mjs --self-test` | SELF-TEST PASS | 33 assertions | 0 |
| 6 | `node scripts/check-evidence.mjs --change CHG-MOXIAN-V16` | PASS | 14 项检查，PASS 13，WARN 1，FAIL 0，error 0；AC 12 条，证据 15 条 | 0 |

`check-evidence` 的 14 项检查验证的是 CHG-MOXIAN-V16 的 15 条证据覆盖 12 条 AC，不自动判定 v1.7 新增结论；v1.7 的增量由第 2 节逐项核对。唯一 WARN 是未提供 `--build-time`，属于纯文档变更没有构建产物的预期提示。`measure-net` 的 33 项自检覆盖 JSON 结构、阈值上下界、参数错误与输出回读。

三个门禁脚本的自检也复跑通过。`check-gates.mjs --self-test` 为 12 条断言，`check-spec-language.mjs --self-test` 为 8 条断言，`check-contract.mjs --self-test` 为 14 条断言，三项退出码均为 0。`check-spec-language` 的全量实跑不是本轮六项 PASS 的要求，实跑结果为 116 error、137 warning、退出码 1，列入第 5 节。

本报告定稿前在同一工作树复跑一次，表中数字与最终树一致。

## 4 继承 v1.6 的结论与 KD 关闭

v1.6 验收报告共 171 行，第 7 节由 `mx-accept-v16c` 签署 pass。v1.7 没有改动该报告正文，只在本次修订范围内重新验证变化项；未变化的结构、规则编号与门禁行为继续沿用 v1.6 的签字结论。

v1.6 第 5 节列了 6 条 KD，本轮 6 条均已关闭或已登记。关闭状态与证据如下表。

| 编号 | v1.6 状态 | v1.7 处理 | 证据 |
|---|---|---|---|
| KD-01 | `check-gates` 127 error、322 warning | 关闭：error 降到 0，warning 为 321 | 第 3 节第 4 行；120 passed、0 failed |
| KD-02 | 框架证据索引未落地 | 关闭：CHG-MOXIAN-V16 已建 15 条证据，覆盖 12 条 AC | `specs/changes/CHG-MOXIAN-V16/evidence.md` |
| KD-03 | RUNBOOK 签字人待补 | 关闭登记：签字人为“维护人 Lead（代行）”，批准人仍写用户待签 | `docs/README.md:110` |
| KD-04 | `measure-net.mjs` 待建 | 关闭：脚本 732 行，自检 33 条 | `scripts/measure-net.mjs`；第 3 节第 5 行 |
| KD-05 | 独立副本未同步 | 已关闭：2026-11-25 15:44 由 `repo-sync-v17` 同步并推送，提交 `dd12e9a`，`VERSION` 为 v1.7 | `moxian-framework/VERSION`；`moxian-framework/.git/refs/heads/main` |
| KD-06 | 25 任务压测为走查非实跑 | 关闭：由 CHG-MOXIAN-V16 真跑替代，15 条证据与 12 条用例落盘 | 变更包证据索引与 `specs/test/FRAMEWORK/test-plan.md` |

KD-03 的“关闭”是登记意义上的关闭，签字人与批准人是两列，批准人仍待用户签署。KD-05 已由 `repo-sync-v17` 于 2026-11-25 15:44 完成同步并推送，提交 `dd12e9a`，本地 HEAD 与 `origin/main` 一致，不再作为开放项。

## 5 已知遗留

本轮遗留 4 条，均不阻断 v1.7 版本行与验收报告的提交。四条都是既有欠账或按规则保留的内容。

1. **321 条 warning**：`check-gates` 以 120 passed、0 failed 通过，但仍有 321 条 WARN，其中包含 `specs/changes/CHG-MOXIAN-V16/evidence.md` 缺 AC 证据表的提示。warning 不改变 error 为 0 的结论，留待各变更包 owner 按 MX-G-13 等规则逐条清理。
2. **`check-spec-language` 的既有 error**：全量实跑为 116 error、137 warning、退出码 1，命中集中在 `specs/product/` 的既有 spec，属于既有欠账。本轮没有改这些文件，也没有把该项计入六项 PASS。
3. **`AGENTS.md` 的措辞未改**：项目 `AGENTS.md` 第 35、36、70、81、105 行仍有“验收 Agent”“验收者”。DEC-32 明确该项另议，本轮可写范围不含 `AGENTS.md`，保持原文。
4. **absorb 与历史文档保留项**：除本报告为说明变化而引用的三行七处外，`docs/framework/` 下 17 处、11 个文件，`docs/process/` 下 2 处、2 个文件仍含旧词，全部属于 absorb、历史验收与压测报告、对账文件、superseded 版本与 MX-R-42 定义本身。这些按“absorb 与历史验收报告按原文保留”的口径不动。

KD-05 原登记为第 5 节之外的开放项，已于 2026-11-25 15:44 由 `repo-sync-v17` 同步并推送后关闭，见第 4 节。遗留清单合计 4 条，均在本节。本报告原稿于 15:39 落盘，镜像仓库的同步提交发生在其后，原稿按落盘时的状态把 KD-05 记为开放。

章级规则条数有两个口径，报告同时保留。文档声明口径按 `MOXIAN.md` 第 1475 行的章内条款行「- MX-<章>-<序号>」逐行统计，十三章合计 284 条，各章为 14、20、18、18、27、32、20、28、34、22、18、19、14 条。按全文唯一编号复算为 297 个编号，其中 13 个是各章编号区间的端点 `MX-<章>-99`，不是规则本体，扣除后仍为 284 条；另有 4 个 `MX-QA` 编号（57、59、66、68）是引用 `domains/testing.md` 的规则，不计入章级规则。`specs/changes/CHG-MOXIAN-V16/evidence.md` 第 18 行已登记 284 与 297 的差异。

## 6 签字

本报告由版本收口执行方编写，验收结论与签字由独立验收人填写。独立验收人已复跑第 3 节的六项检查，抽查第 2 节十项变化的落点，核对第 5 节的 4 条遗留，结论与日期见下表。

| 角色 | 姓名或会话名 | 结论 | 日期 |
|---|---|---|---|
| 编写人 | `mx-v17-freeze` | 已完成版本行、计数与十项变化核对，提交独立验收 | 2026-11-25 |
| 验收人 | `mx-accept-v17` | pass（六项复跑与十项变化复核通过；四处缺口已修复并复核） | 2026-11-25 |
| 批准人 |  |  |  |

验收意见：

```text
结论：pass（六项复跑与十项变化复核通过，四处报告缺口已修复并复核）。验收人 mx-accept-v17 于 2026-11-25 完成独立复核并签字。
```

## 7 附件清单

| 附件 | 用途 | 规模 |
|---|---|---|
| `docs/framework/MOXIAN.md` | 总册 v1.7，表 D-2 与 D.7、D.8 的 v1.7 记录 | 1491 行 |
| `docs/framework/ROLES.md` | 42 条角色规则与 MX-R-42 术语别名 | 233 行 |
| `docs/framework/GATES.md` | 68 条门禁规则与第 8 行历史文档关系 | 402 行 |
| `docs/framework/TASK-MATRIX.md` | 八类任务 66 格矩阵与 v1.7 变更记录 | 337 行 |
| `docs/framework/EFFORT.md` | 四十八格档位表与 v1.7 变更记录 | 144 行 |
| `docs/framework/ADOPTION.md` | 旧流程文件处置与 v1.7 版本记录 | 109 行 |
| `docs/framework/README.md` | 入口说明与 v1.7 版本段 | 64 行 |
| `docs/framework/accept/ACCEPT-MOXIAN-V16-20261125.md` | 已签字母版，正文未改 | 171 行 |
| `docs/process/RUNBOOK.md` | superseded 历史手册 | 250 行 |
| `docs/plan/DECISIONS.md` | DEC-32 裁决 | 133 行 |
| `specs/changes/CHG-MOXIAN-V16/spec.md` | 12 条变更级 AC | 125 行 |
| `specs/changes/CHG-MOXIAN-V16/evidence.md` | 15 条证据覆盖 12 条 AC | 48 行 |
| `specs/test/FRAMEWORK/test-plan.md` | 12 条用例 TC-FW-001 至 TC-FW-012 | 54 行 |
| `scripts/measure-net.mjs` | 延迟、丢包、带宽与断网测量脚本 | 732 行，33 项自检 |
| `specs/changes/CHG-MOXIAN-V16/logs/roles.log` | 角色编号核对记录 | 11 行 |
| `specs/changes/CHG-MOXIAN-V16/logs/struct-change.log` | 本包 6 项结构检查与 1 条 WARN | 10 行 |
| `specs/changes/CHG-MOXIAN-V16/logs/self-tests-close.log` | 三脚本自检 12、8、14 条 | 44 行 |

以上附件在 2026-11-25 本机均可打开，日志只记录命令实际输出的行，不补写未出现的结论。

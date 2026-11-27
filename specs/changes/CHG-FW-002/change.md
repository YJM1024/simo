# 变更包 · CHG-FW-002

## 1 头部

| 字段 | 值 |
|---|---|
| 变更号 | `CHG-FW-002` |
| 状态 | 实现中 |
| 类型判级 | 主类型：重构；附加类型：文档交付、设计交付 |
| 规模判级 | 变更级：改 8 个需求点、改已冻结契约项、需一次全量回归与一次重建 |
| owner | 需求方 |
| 验收人 | 验收员 |
| 冻结时间 | 2026-11-27 03:56（Asia/Shanghai） |
| 标题 | 执行框架 v2 重构与旧版归档 |
| 负责人 | Lead（需求方代行，见第 9 节状态流转） |
| 判级 | 规模：变更级；主类型：重构；附加类型：文档交付、设计交付；理由见第 1.0 节 |
| 创建日期 | 2026-11-27 |
| 关闭日期 | N/A：P5 两轮验收与回滚演练通过后填写 |

### 1.0 判级五字段

- 主类型：重构
- 附加类型：文档交付、设计交付
- 非目标：不改产品、后端、前端运行时代码与接口
- 影响面：`docs/framework/` 12 份正文、`templates/` 35 份、`adapters/` 2 份、`scripts/` 13 个门禁脚本、本变更包与 `archive/v1.7.5/`
- 判级理由：`TASK-MATRIX.md` 表 1-1 重构判别信号为「外部行为不变，内部结构或依赖调整」，本次只重排框架结构与规则位，不改产品与运行时行为；因改 8 个需求点、改写已冻结契约项并需一次全量回归与重建，按 MXV2-4-03 取变更级。

### 1.1 冻结记录

| 项 | 值 |
|---|---|
| 设计方案 | `docs/framework/v2/DESIGN.md`，36086 字节；整卷 sha256 `52a9409f4a39cabed1b41f522717c69d64910392208c27ab681a19d09d5dad1a`，正文 sha256 `67d70f9391f51c6996d360ab2cbee878bbbda9d1fce113a63147a155a44bb614` |
| 实现方案 | `docs/framework/v2/IMPLEMENT.md`，94557 字节；整卷 sha256 `814642e2951ed0cfa2f60afa1b8951fa4caf11c83874f06e1556753e24bdab3f`，正文 sha256 `2f869b49f4e2b2af5828dd4acbfe6432805ca680c6274037a0f6cb608e84ea05` |
| 冻结时间 | 设计 2026-11-27 03:44，实现 2026-11-27 03:56（Asia/Shanghai） |
| 冻结人 | 用户；Lead 代签，记录见 `docs/framework/v2/JOURNAL.md` |
| 偏差 | `DESIGN.md` 第 8.4 节的 R1、R2 验收与回滚演练列为 P5 另办项，不随冻结一次完成 |

### 1.2 立项字段载体

| 字段 | 载体 | 落点 |
|---|---|---|
| 用户原话、问题、场景 | proposal | 第 1 节背景与问题 |
| 范围、非目标 | proposal | 第 3 节范围 |
| 目标指标与测量口径 | proposal | 第 2 节目标 |
| 类型与规模判级 | 变更包头部 | 本节判级字段 |
| 涉及契约项 | 契约表 | 第 5 节，正文在 `DESIGN.md` 第 7 节与 `IMPLEMENT.md` 第 4 节 |
| 依赖、风险、假设、待确认项 | proposal | 第 6 节与第 7 节 |
| 影响域、数据语义处置 | proposal | 第 4 节影响面 |
| 验收人与出口层级 | proposal | 第 7 节决策请求 |
| 状态 | 变更包头部 | 本节状态字段 |

### 1.3 六类专项字段

| 专项 | 结论 | 决定人与记录位置 |
|---|---|---|
| 涉及契约项 | 涉及：285 行迁移映射、158 个规则位、69 条门禁分流与规则六字段；核对结论见第 5 节与 `DESIGN.md` 第 7 节 | 架构师，2026-11-27，`JOURNAL.md` |
| 数据语义处置 | N/A：本变更不读写业务数据，不存在历史重复值、空值与唯一约束冲突 | 需求方，proposal 第 4 节 |
| 目标指标与测量口径 | 目标值 158 个规则位（上限 180）、285/285 映射覆盖；测量命令 `check-rule-fields.mjs` 与 `check-mapping.mjs`；样本量为全量 285 条 | 架构师，`IMPLEMENT.md` 第 8 节 |
| 数据合规处置 | N/A：不处理个人信息、不导出数据、不删除记录 | 需求方，本表 |
| 插件卸载清理 | N/A：本变更不安装或卸载插件，无第三方数据需要解除关联 | 需求方，本表 |
| 备份与第三方副本 | N/A：不产生备份与第三方副本，归档副本只读保留 | 需求方，本表 |

## 2 目标与背景

要解决的问题是旧框架的规则、门禁与角色分散且计数不一致，重写时无法证明 285 条没有丢失。现状是 12 份正文共 4676 行，总册 13 章 285 条，`GATES.md` 69 条门禁，`ROLES.md` 42 条角色规则，四个领域文件另有 282 条；`README.md` 的 284 条、68 条与总册不一致；69 条门禁里 24 条只有人工判据。用户于 2026-11-27 03:44 与 03:56 冻结设计与实现方案，要求按六个批次推进。

预期结果逐条编号，与第 4 节的 AC 一一对应。

| 编号 | 预期结果 |
|---|---|
| R1 | P0 归档 12 份副本与现行 sha256 全部一致，变更包四件齐，回滚包骨架可照着执行 |
| R2 | P1 总册收为九章 158 个规则位（上限 180），每条六字段齐全，285 条旧规则全部有归宿且映射表可回放 |
| R3 | P2 附属文件对齐新章号，旧章号不再出现在正文，门禁与规则位双向可查 |
| R4 | P3 模板 35 份齐，适配层 2 份与新七角色、新档位一致 |
| R5 | P4 门禁脚本具备 pass/fail 夹具，同一夹具连续三次结果一致，汇总编排接入 L0 结构层 |
| R6 | P5 R1、R2 两轮验收通过，回滚演练一次成功，归档索引与验收报告签字 |

## 3 范围与非目标

包含三句：改需求点 V2-01 至 V2-08；改契约项 285 行迁移映射、158 个规则位、69 条门禁分流、规则六字段格式、点链与状态机；动 `docs/framework/` 的 12 份正文与 `templates/`、`adapters/`，动 `scripts/` 下 13 个门禁脚本，动本变更包与 `docs/framework/archive/v1.7.5/`。

明确不做：不改产品、后端、前端运行时代码与接口，不改 `docs/product/` 与 `specs/product/` 的功能事实，不删除任何旧文档，不在 P0 执行 Git 提交或推送；上述相邻工作分别归产品域变更与后续发布批次。

## 4 影响面

受影响的 REQ 点为 V2-01 目标与范围、V2-02 术语与状态、V2-03 角色与授权、V2-04 流程点链、V2-05 规则格式、V2-06 框架结构、V2-07 差异清单、V2-08 验证与回滚，八点均为新增。AC 编号为 `AC-CHG-FW-002-01` 至 `AC-CHG-FW-002-06`，逐条对应 R1 至 R6。

长期 spec 文件包括 `docs/framework/MOXIAN.md`、`GATES.md`、`TASK-MATRIX.md`、`ROLES.md`、`EFFORT.md`、`README.md`、`ADOPTION.md`、`ABSORB-RECONCILE.md` 与 `domains/` 四份；新增 `docs/framework/VERSION`、`docs/framework/v2/CHANGELOG.md`、`docs/framework/v2/MAPPING.md`、`docs/framework/accept/ACCEPT-FW-V2-20261127.md`；模板与适配层按 `IMPLEMENT.md` 第 2.2 节逐份处置。

## 5 五列契约索引

| 列 | 产出文件与冻结版本 | 说明 |
|---|---|---|
| 契约表 | `docs/framework/v2/DESIGN.md` 第 7 节、`docs/framework/v2/IMPLEMENT.md` 第 4 节，2026-11-27 冻结 | 285 行映射、158 个规则位、69 条门禁分流与六字段格式的共同出处 |
| 产品 | N/A：本次不新增产品功能点，V2-01 至 V2-08 是框架需求点，记录在 `DESIGN.md` 第 3 节 | 不改 `docs/product/` 与 `specs/product/` |
| 设计 | `docs/framework/v2/DESIGN.md` 第 6 节与第 7 节，2026-11-27 冻结 | 九章结构、规则五类归位与门禁设计 |
| 前端 | N/A：本次无前端页面、组件或交互交付物 | 前端域文件只改编号与引用，不产生前端 spec |
| 后端 | N/A：本次无接口、数据、迁移与错误码改动 | 后端域文件只改编号与引用，不产生后端 spec |
| 测试 | `docs/framework/v2/IMPLEMENT.md` 第 8 节与 `specs/changes/CHG-FW-002/evidence.md`，P5 另出 `docs/framework/accept/ACCEPT-FW-V2-20261127.md` | 每批退出条件按第 8 节命令执行，验收报告汇总两轮结论 |

## 6 任务卡清单

| 卡号 | owner | scope | AC | 证据 | 推理档位 | 状态 |
|---|---|---|---|---|---|---|
| `TASK-CHG-FW-002-P0` | v2-p0-snapshot（Lead 委派） | `docs/framework/archive/`、`specs/changes/CHG-FW-002/`、`docs/framework/v2/ROLLBACK.md` | `AC-CHG-FW-002-01` | `evidence.md` 第 2 至 3 节 | `high` | 已完成（待独立验收） |
| `TASK-CHG-FW-002-P1` | 框架架构（Lead 代行） | `docs/framework/MOXIAN.md`、`VERSION`、`v2/CHANGELOG.md`、`v2/JOURNAL.md` | `AC-CHG-FW-002-02` | 第 7 节脚本证据与 `JOURNAL.md` | `high` | 待办 |
| `TASK-CHG-FW-002-P2` | 框架架构（Lead 代行） | `GATES.md`、`TASK-MATRIX.md`、`ROLES.md`、`EFFORT.md`、`domains/` 四份、`README.md`、`ADOPTION.md`、`v2/BACKLOG.md` | `AC-CHG-FW-002-03` | 第 7 节脚本证据与 `JOURNAL.md` | `high` | 待办 |
| `TASK-CHG-FW-002-P3` | 模板与适配（Lead 代行） | `docs/framework/templates/` 35 份、`docs/framework/adapters/` 2 份 | `AC-CHG-FW-002-04` | 计数与字段检查输出 | `high` | 待办 |
| `TASK-CHG-FW-002-P4` | 门禁脚本（Lead 代行） | `scripts/check-*.mjs` 9 个、4 个新脚本、`scripts/verify-all.mjs` | `AC-CHG-FW-002-05` | 每个门禁 pass/fail 夹具输出 | `high` | 待办 |
| `TASK-CHG-FW-002-P5` | 验收角色（独立） | `archive/v1.7.5/INDEX.md`、`accept/ACCEPT-FW-V2-20261127.md`、`v2/ROLLBACK-DRILL.md`、`JOURNAL.md` 收尾 | `AC-CHG-FW-002-06` | 两轮验收报告与演练记录 | `max` | 待办 |

P0 已完成的范围是 12 份归档副本、归档索引、变更包四件与回滚包骨架，明细见 `tasks.md` 的 P0 清单。

## 7 证据索引

| 类型 | 路径 | 对应 AC | 复跑命令 | 谁来填 |
|---|---|---|---|---|
| 脚本证据 | `specs/changes/CHG-FW-002/evidence.md` 第 2 至 3 节 | `AC-CHG-FW-002-01` | 第 2 节的 PowerShell 复制与哈希循环 | 实现者 |
| 归档索引 | `docs/framework/archive/v1.7.5/INDEX.md` | `AC-CHG-FW-002-01` | `Get-FileHash` 逐份比对 | 实现者 |
| 映射与字段 | `.tmp/ac/AC-CHG-FW-002-02.json`（P1 起） | `AC-CHG-FW-002-02` | `node scripts/check-mapping.mjs`、`node scripts/check-rule-fields.mjs` | 实现者 |
| 门禁夹具 | `.tmp/ac/AC-CHG-FW-002-05.json`（P4 起） | `AC-CHG-FW-002-05` | 每个门禁的 self-test 命令 | 实现者 |
| 验收报告 | `docs/framework/accept/ACCEPT-FW-V2-20261127.md`（P5 建） | `AC-CHG-FW-002-06` | `node scripts/check-archive.mjs`、`node scripts/verify-all.mjs` | 验收角色 |

## 8 风险与依赖

| 编号 | 风险 | 应对与承接人 |
|---|---|---|
| R1 | 285 条在迁移中丢条、重号或漏引 | 映射表逐条核对，P1 跑 `check-mapping.mjs`，Lead 复核 |
| R2 | 脚本扩展把存量门禁打红 | 先跑 self-test 再挂汇总，存量 1497 条 error 不计入本轮失败，门禁脚本 owner 处理 |
| R3 | 旧编号的外部引用漏改 | 附录 B 保留旧号列，P5 抽样 5 条回查，验收角色执行 |
| R4 | 归档副本被后续批次误改 | 归档目录只读，P5 用 `check-archive.mjs` 复核 12/12，验收角色执行 |

依赖 `DESIGN.md` 与 `IMPLEMENT.md` 的冻结版本、P0 归档、P4 的 13 个脚本与 P5 的独立验收角色。P0 在 30 分钟窗口内完成；若超时，先写 `.tmp/v2-p0/checkpoint.md` 再停。

## 9 状态流转记录

| 时间 | 从 | 到 | 推进人 | 依据 |
|---|---|---|---|---|
| 2026-11-27 03:54 | 无 | 进行中 | Lead | 用户冻结设计与实现方案并下达 P0，proposal 与 change 同批建立 |
| 2026-11-27 05:02 | 进行中 | 实现中 | 撰写员 | 旧状态词「进行中」按 MXV2-2-11 归并为四值之一，不涉及其它迁移 |

## 10 收口

| 字段 | 当前值 |
|---|---|
| 漂移检查结论 | 未到收口，N/A；P5 按六组漂移对照逐组判定 |
| AC 与证据对账 | 6 条 AC 中 `AC-CHG-FW-002-01` 为 pass，其余 5 条未跑；证据 1 份（`evidence.md`） |
| 回写长期 spec 的补丁行数 | 未到收口，N/A；P5 汇总 |
| 关闭结论 | 未关闭；P5 两轮验收与回滚演练通过后由验收角色与 Lead 签字 |

## 11 流程点链

本章按 MXV2-4-10 的顺序登记本包的五类流程点，编号按 MXV2-2-04 取 `P-<类型>-<NN>`。六条链与 P0 至 P5 六个批次一一对应，每条链的终点是第 4 节的一条 AC。点状态只取 MXV2-2-11 的四值，判据按 MXV2-6-16 在开工前冻结，冻结后改动走修订登记。

### 11.1 六条链

| 链 | 需求点 | 需求点行为句 | 来源点 | 判定点 | 规则点 | 验收点 | AC | 状态 |
|---|---|---|---|---|---|---|---|---|
| 1 | P-REQ-01 | 归档目录 12 份副本与复制前 sha256 一致，变更包四件齐备，回滚包能照着执行回退 | P-SRC-01 | P-JUD-01 | P-RUL-01 | P-ACC-01 | `AC-CHG-FW-002-01` | 实现中 |
| 2 | P-REQ-02 | 总册收为九章、规则位 158 个且不超过 180，每条六字段齐全，285 条旧规则全部有归宿并能被映射表回放 | P-SRC-02 | P-JUD-02 | P-RUL-02 | P-ACC-02 | `AC-CHG-FW-002-02` | 已冻结 |
| 3 | P-REQ-03 | 附属文件不再出现旧章号，门禁与规则位能双向查到对方 | P-SRC-03 | P-JUD-03 | P-RUL-03 | P-ACC-03 | `AC-CHG-FW-002-03` | 已冻结 |
| 4 | P-REQ-04 | 模板 35 份齐，适配层 2 份与新七角色、新档位一致 | P-SRC-04 | P-JUD-04 | P-RUL-04 | P-ACC-04 | `AC-CHG-FW-002-04` | 已冻结 |
| 5 | P-REQ-05 | 每个门禁有 pass/fail 夹具，同一夹具连续三次同结果，汇总脚本接入 L0 结构层 | P-SRC-05 | P-JUD-05 | P-RUL-05 | P-ACC-05 | `AC-CHG-FW-002-05` | 已冻结 |
| 6 | P-REQ-06 | R1、R2 两轮验收通过，回滚演练一次成功，归档索引与验收报告签字齐全 | P-SRC-06 | P-JUD-06 | P-RUL-06 | P-ACC-06 | `AC-CHG-FW-002-06` | 已冻结 |

### 11.2 判定点与判据冻结

| 判定点 | 判据 | 冻结时间 | 冻结人 | 状态 |
|---|---|---|---|---|
| P-JUD-01 | `node scripts/check-archive.mjs --archive docs/framework/archive/v1.7.5` 输出 `12/12 files verified`，四件文件存在 | 2026-11-27 03:44 | 用户（Lead 代签） | 实现中 |
| P-JUD-02 | `node scripts/check-rule-fields.mjs` 输出 158 rules、0 error；`node scripts/check-mapping.mjs` 输出 285/285 mapped | 2026-11-27 03:56 | 用户（Lead 代签） | 已冻结 |
| P-JUD-03 | `node scripts/check-sdd.mjs --self-test` 输出 15 passed、0 failed | 2026-11-27 03:56 | 用户（Lead 代签） | 已冻结 |
| P-JUD-04 | 模板计数命令输出 35 份；`node scripts/check-rule-fields.mjs --templates` 与六字段一致 | 2026-11-27 03:56 | 用户（Lead 代签） | 已冻结 |
| P-JUD-05 | 每个门禁 `--self-test` 含 pass 与 fail 两类夹具，同一夹具连续三次结果一致 | 2026-11-27 03:56 | 用户（Lead 代签） | 已冻结 |
| P-JUD-06 | 两轮验收报告结论为 pass；`ROLLBACK-DRILL.md` 有一次成功演练记录；索引与报告签字齐全 | 2026-11-27 03:56 | 用户（Lead 代签） | 已冻结 |

### 11.3 规则点与验收点对应

| 规则点 | 验收点 | AC | 基数 | 例外原因 |
|---|---|---|---|---|
| P-RUL-01 | P-ACC-01 | `AC-CHG-FW-002-01` | 1:1 | 无：默认一对一 |
| P-RUL-02 | P-ACC-02 | `AC-CHG-FW-002-02` | 1:1 | 无：默认一对一 |
| P-RUL-03 | P-ACC-03 | `AC-CHG-FW-002-03` | 1:1 | 无：默认一对一 |
| P-RUL-04 | P-ACC-04 | `AC-CHG-FW-002-04` | 1:1 | 无：默认一对一 |
| P-RUL-05 | P-ACC-05 | `AC-CHG-FW-002-05` | 1:1 | 无：默认一对一 |
| P-RUL-06 | P-ACC-06 | `AC-CHG-FW-002-06` | 1:1 | 无：默认一对一 |

本包已落盘的链按默认一对一登记，没有一对多与多对一，也没有跨包引用；第 11.1 节其余五条链是计划口径，点文件尚未建立，`LINKAGE.md` 只登记已落盘的一条，待点文件建立后补行。后续若出现一个判定拆成多条规则或一条规则由多个验收点共检，按 MXV2-4-11 在 `LINKAGE.md` 的原因列写明，不在此处新开口径。

## 受控节

N/A：本次为框架文档重构，不是安全修复，不涉及数据删除、导出或法定保留例外，无需披露记录与通知记录。

# CHG-CONV-007 · 任务卡

状态：已完成并签发（2026-11-26；验收报告 [`ACCEPT-CONV-007-R5-20261126.md`](../../../docs/testing/ACCEPT-CONV-007-R5-20261126.md)，复盘 [`RETRO-CHG-CHG-CONV-007.md`](../../../docs/plan/RETRO-CHG-CHG-CONV-007.md)；2026-11-25 20:45 重立，2026-11-24 的异常登记见 [`FAIL-20261124-CHG-CONV-007`](../../../docs/plan/FAIL-20261124-CHG-CONV-007.md)）
Implements: `PRD-CONV-009`
Change: CHG-CONV-007
变更类型：**新功能**（主类型；附加类型：无）
规模判级：变更级
派单方：Lead；验收签字人：验收（`chg-007-accept`）与用户（只看前端效果）

本文件把 2026-11-23 的 17 张旧卡（W0 至 W5）重排为 10 张卡（T01 至 T10）。旧卡的 done 结论与行号引用保留在第 7 节，不删除、不改写；新卡按 `templates/task-card.md` 的十八项填写，卡号与检查点路径按本文件的 `TNN`。

## 1 派发规则

1. 每张卡按 owner、scope、验收标准、证据、禁止项五要素派发，五项齐全才可派；scope 之外的文件不写，同一文件同一时间只允许一张卡修改。
2. 推理档位由派单方填写，执行方不改。档位取 `EFFORT.md` 主表「新功能」行的阶段值，格式为「档位（阶段）｜升档理由：—」。
3. 每张卡在派发前拆成步骤，每步预计不超过 20 分钟，写清产出与汇报对象；某步超过 20 分钟仍无进展，执行方停下并报告卡点。
4. 检查点固定为 `.tmp/chg-007-<卡号>/checkpoint.md`，字段只取 `MX-8-14` 的七项：步骤号、状态（未开始/进行中/完成/停下）、已完成、未完成、证据路径、下一步、更新时间（`YYYY-MM-DD HH:MM` 带时区）；每完成一步与停下时各更新一次。
5. 前置卡未完成时本卡不得开工；标「并行」的卡可以同时跑，但后端先冻结接口形状（`MX-7-07`），前端按冻结后的形状实现。
6. 证据只写真实跑过的结果：断言结果落 `.tmp/ac/<AC-ID>.json`，汇总进 [`evidence.md`](evidence.md)；未执行的写 `missing` 或 `blocked` 并写原因码、解除条件与到期日，不写「通过」。
7. 实现者不自签：卡的评审人为 `chg-007-accept`（T09 本身由用户签），执行人、用例作者与签字人三者不同人。
8. 执行方不 commit、不 push、不碰 `.git`、不删文件；回滚按第 6 节逐卡执行，破坏性命令一律不跑。

## 2 卡清单总表

| 卡 | 任务 | owner | 所属阶段 | scope | 依赖 | AC | 验收标准 | 证据 | 推理档位 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 契约冻结复核 | 设计 | 契约与设计 | `specs/changes/CHG-CONV-007/proposal.md`（§5、§11 追加）；四列 spec、contract 与 `scripts/ac/` 只读 | 无 | 26 条判据可执行性复核 | 26 条逐条有脚本路径或 `人工:动作`；`check-contract.mjs` 0 处差异 | `.tmp/chg-007-T01/contract-review.md`；check-contract 输出 | max（契约与设计）｜升档理由：— | 已完成 | chg-007-accept | 不改五列 spec、contract、scripts 与代码；不改 18 条编号与判据文字；不删文件；不跑 git |
| T02 | 后端任务消息与卡片数据 | 后端 | 执行 | `backend/internal/modules/tasks/conv.go`、`conv_http.go`、`service.go`、`http.go`；`backend/internal/modules/chat/model.go`、`service.go`、`category.go`（新建） | T01 | -01、-02、-03、-04、-16、-17 | 01 一卡一 `task_id`；02 10 条折叠、12 条显示「还有 2 条」；03 历史 0 目标 1 约束至少 1；04 成功 1 次与 403 1 次；16 字节等于 `size`；17 跨会话 0 条 | `.tmp/chg-007-T02/` 的 go test 日志、消息与下载响应 JSON；`.tmp/ac/AC-CONV-009-0N.json` | high（执行）｜升档理由：— | 已完成 | chg-007-accept | 不改前端；不改既有四类 category；不新增迁移列（确需增列回 T01 改判）；不改五列 spec；不跑 git |
| T03 | 后端编排、等待与取消级联 | 后端 | 执行 | `backend/internal/modules/tasks/workflow.go`、`concurrency.go`、`service.go`（编排段）；`migrations.go` 只读 | T02（同一 `service.go` 串行） | -05、-06、-13、-14、-15、-18 | 05 八步第 6 步默认展开；06 轨迹 14 行时间戳单调；13 八节点四态齐全；14 触发 1、1、3；15 取消后下游启动 0 次；18 30 分钟不取消、1 分钟提醒 1 条 | `.tmp/chg-007-T03/` 的 go test 日志、取消级联日志、可控时钟说明；`.tmp/ac/*.json` | high（执行）｜升档理由：— | 已完成 | chg-007-accept | 不改执行器 `real_executor.go`；不新增迁移列；不改前端；不跑 git |
| T04 | 前端任务卡片与汇总卡 | 前端 | 执行 | `frontend/src/components/task-card.tsx`（新建）；`frontend/src/components/library.tsx` 的 `MessageItem`（`:501`）；`frontend/src/types.ts` | T01；并行 T02（T02 的 S1 冻结接口形状后开工） | -01、-02、-07 | 01 一卡一 `task_id`；02 10 条折叠与「还有 2 条」入口 1 个；07 操作入口 0 个、关闭入口 1 个 | `.tmp/chg-007-T04/` 的 vitest 日志与 DOM 快照；`.tmp/ac/*.json` | high（执行）｜升档理由：— | 已完成 | chg-007-accept | 不改 `library.tsx` 的 OverviewContent 与 RightPanel 段（T05 owner）；不改后端；不跑 git |
| T05 | 前端右栏、详情与任务图 | 前端 | 执行 | `frontend/src/components/library.tsx`（OverviewContent `:1097`、RightPanel `:1164`）；`frontend/src/styles.css`；`task-list.tsx`、`task-detail.tsx`、`task-graph.tsx`、`task-deliverables.tsx`（新建）；`frontend/src/app.tsx` | T04（同一 `library.tsx` 串行） | -05、-06、-08 至 -13 | 08 收起 40px、展开 320px（280 加 40）、三图标；09 角标等于进行中数、10 显示 `9+`；10 折叠态按会话记忆；11 首行距滚动口 0 至 8px；12 列表数 11、2、1、3；13 八节点四态齐全、21 节点按层分行 | `.tmp/chg-007-T05/` 的 vitest 日志、CDP `metrics.json` 与截图 | high（执行）｜升档理由：— | 已完成 | chg-007-accept | 不改消息流卡片（T04）；不改接口；不改 `PRD-CONV-008` 的四态与 ETag；不跑 git |
| T06 | 断言脚本·接口组与夹具 | 测试 | 测试与证据 | `scripts/ac/AC-CONV-009-01.mjs`、`-02`、`-03`、`-04`、`-14` 至 `-18`（新建 9 个）；`scripts/ac/AC-CHG-CONV-007-02.mjs`、`-03`、`-04`、`-08`（新建 4 个）；`scripts/fixtures/tasks/`（新建） | T01；并行 T02、T03 | -01 至 -04、-14 至 -18；变更级 -02、-03、-04、-08 | 13 条脚本各自可运行并写 `.tmp/ac/<AC-ID>.json`；断言数字与 `spec.md` §3、§5 一致 | `.tmp/ac/` 的 13 个 JSON；`.tmp/chg-007-T06/` 运行日志 | high（测试与证据）｜升档理由：— | 已完成 | chg-007-accept | 不改实现代码；不改 `-05` 至 `-13`（T07 owner）；不改五列 spec；不伪造夹具数据；不跑 git |
| T07 | 断言脚本·界面组 | 测试 | 测试与证据 | `scripts/ac/AC-CONV-009-05.mjs` 至 `-13.mjs`（已有，修补与校准）；`scripts/ac/AC-CHG-CONV-007-01.mjs`、`-05`、`-06`、`-07`（新建 4 个）；`scripts/fixtures/cdp/`（新建） | T01；并行 T06 | -05 至 -13；变更级 -01、-05、-06、-07 | 9 条已有脚本可跑通并写 JSON；4 条新建可运行；几何采样容差 ±1px | `.tmp/ac/` 的 13 个 JSON；`.tmp/chg-007-T07/shots/` 与 `metrics.json` | high（测试与证据）｜升档理由：— | 已完成 | chg-007-accept | 不改接口组脚本（T06）；不改实现代码；不改设计 spec 的尺寸值；不跑 git |
| T08 | 集成与端到端三档走查 | 测试 | 测试与证据 | `docs/testing/CHG-CONV-007-E2E-20261125.md`（新建）；`docs/testing/CONV/CHG-CONV-007-20261125/`（新建）；`.tmp/chg-007-T08/`、`.tmp/chg-007-T08d/t08-summary.json`、`.tmp/chg-007-T08d/t08-*.json`、`.tmp/chg-007-T08d/run-manifest.json` | T02 至 T07 | 变更级 -01 至 -08 | 8 条变更级 AC 各有证据行；375、768、1280 三档无横向溢出；下载字节等于 `size` | `.tmp/chg-007-T08d/t08-summary.json`、`.tmp/chg-007-T08d/` 逐条 JSON 与三档截图；`scripts/ac/` 脚本 | high（测试与证据）｜升档理由：— | 已完成 | chg-007-accept | 不改代码、不改 spec；不伪造截图；开关关闭时不得把端到端记通过；不跑 git |
| T09 | 变更级全量回归与独立验收 | 验收 | 验收与收口 | `specs/changes/CHG-CONV-007/evidence.md`；`docs/testing/ACCEPT-CONV-007-R5-20261126.md`（新建）；`.tmp/chg-007-T09/` | T08 | 26 条复核与五条门禁 | 全量前端与后端回归各 1 次 0 失败；26 条判定与证据行一致；五条门禁输出贴入报告 | 回归日志、五条门禁输出、签字行；[ACCEPT-CONV-007-R5-20261126.md](../../../docs/testing/ACCEPT-CONV-007-R5-20261126.md) | max（验收与收口）｜升档理由：— | 已完成 | 用户 | 不改代码与 spec 正文；不代改 18 条 AC；不自签；不跑 git |
| T10 | 复盘与收口回写 | 复盘 | 验收与收口 | `docs/plan/RETRO-CHG-CHG-CONV-007.md`（新建）；`specs/changes/CHG-CONV-007/proposal.md` §9、§10 | T09 | 全部 26 条回顾 | 复盘七节齐全；请求数、总输入与前三项占比有数据；§9 补收口行 | 复盘文件、`acp_cache` 与请求扫描数据；[RETRO-CHG-CHG-CONV-007.md](../../../docs/plan/RETRO-CHG-CHG-CONV-007.md) | high（验收与收口）｜升档理由：— | 已完成 | chg-007-accept | 不改判任何 AC；不改代码；不删证据；不跑 git |

## 3 逐卡步骤与交接

每张卡的 scope、禁止项、验收标准与证据见第 2 节总表；本节补执行人、契约项、步骤表、省略项、检查点与回滚。

### T01 契约冻结复核

- 执行人 `chg-007-contract`；REQ `REQ-CONV-009.1` 至 `.7`（编号待产品补登，见 proposal §11 的 D-02）；CT `CT-CONV-434` 至 `CT-CONV-451`；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T01/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 读 `spec.md` §3、§5 与契约表类 6，把 18 条 AC 与 8 条变更级 AC 逐条对表 | 15 | 对表草图（AC、CT、脚本、夹具、证据路径五列） | 产品 |
| S2 | 核 9 条已有脚本的路径、夹具与输出格式，标出与判据不符的项 | 20 | 脚本体检表 | 产品 |
| S3 | 为 17 条缺脚本的判据标判据形式、负责人与到期日 | 15 | 判据缺口表 | Lead |
| S4 | 写复核记录并追加 proposal §5、§11 | 20 | `.tmp/chg-007-T01/contract-review.md` 与 proposal 追加行 | 验收 |

回滚：只新增复核记录与 proposal 追加段，按行撤销即可。

### T02 后端任务消息与卡片数据

- 执行人 `chg-007-be1`；REQ `REQ-CONV-009.1`、`.5`、`.6`；CT `CT-CONV-434` 至 `-451` 中与消息、归属、交付物对应的行；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T02/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 冻结接口形状：消息字段、任务列表与图、详情、取消、交付物响应 | 20 | 接口形状单一页 | 前端 T04、T05；测试 T06 |
| S2 | 落 `category="task"` 写入与 `task_id` 关联，补单测 | 20 | 代码与 `go test` 输出 | 后端 |
| S3 | 汇总卡数据与启动上下文裁剪（历史 0、目标 1、约束至少 1） | 20 | 单测与样例 JSON | 后端 |
| S4 | 交付物分组与下载 `size`、跨会话隔离查询 | 20 | 单测与响应 JSON | 测试 T06 |

回滚：`category="task"` 与 `task_id` 关联是新增值，回滚停用写入并保留数据，不删历史消息。

### T03 后端编排、等待与取消级联

- 执行人 `chg-007-be2`；REQ `REQ-CONV-009.3`、`.4`；CT `CT-CONV-439` 至 `-450` 中与等待、取消、任务图对应的行；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T03/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 依赖关系与三种等待触发（全部完成、任一完成、每个完成） | 20 | 单测 | 后端 |
| S2 | 取消级联：上游取消后下游 30 秒内启动 0 次 | 20 | 单测与级联日志 | 测试 T06 |
| S3 | 时限提醒与无自动超时（1 分钟提醒 1 条、30 分钟不取消） | 15 | 可控时钟用例 | 测试 T06 |
| S4 | 任务图状态投影（四态与失败下游虚线依据） | 20 | 接口样例 | 前端 T05 |

回滚：依赖与取消相关表按迁移版本回退；已写入的依赖关系不迁移到旧结构。

### T04 前端任务卡片与汇总卡

- 执行人 `chg-007-fe1`；REQ `REQ-CONV-009.1`、`.3`；CT `CT-CONV-434`、`-435`、`-440`；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T04/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 卡片组件与类型定义，覆盖单卡与失败态 | 20 | `task-card.tsx` 与单测 | 前端 |
| S2 | `MessageItem` 渲染分支与 `task_id` 定位 | 20 | `library.tsx` 改动与单测 | 前端 |
| S3 | 汇总卡折叠、标题计数与「还有 N 条」入口 | 20 | 组件测试与 DOM 快照 | 测试 T07 |

回滚：`task-card.tsx` 删除或 revert，`library.tsx` 只回退 MessageItem 段，消息流回到纯文本渲染。

### T05 前端右栏、详情与任务图

- 执行人 `chg-007-fe2`；REQ `REQ-CONV-009.2`、`.3`、`.4`、`.6`；CT `CT-CONV-436` 至 `-451` 中界面与验收入口对应的行；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T05/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 右栏壳三标签与 40px 竖条（展开 320 等于 280 加 40） | 20 | 结构与样式改动 | 前端 |
| S2 | 角标与概览四节折叠态按会话记忆 | 20 | 单测 | 测试 T07 |
| S3 | 任务厚卡、四筛选与两种只读详情 | 20 | `task-list.tsx`、`task-detail.tsx` 与单测 | 测试 T07 |
| S4 | 任务图八节点四态、超 20 节点按层分行 | 20 | `task-graph.tsx` 与单测 | 测试 T07 |
| S5 | 交付物行与「还有 N 个」定位滚动 | 20 | `task-deliverables.tsx` 与 CDP 采样 | 测试 T07 |

回滚：五组组件按卡独立回滚，右栏回退到 `PRD-CONV-008` 的只读投影。

### T06 断言脚本·接口组与夹具

- 执行人 `chg-007-qa1`；REQ 全部七条；CT 覆盖 `CT-CONV-434` 至 `-451` 的接口类判据；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T06/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 任务夹具与公共断言库（启动上下文、等待触发、取消级联） | 20 | `scripts/fixtures/tasks/` 与 helper | 测试 |
| S2 | 写 `AC-CONV-009-01` 至 `-04` 四条脚本 | 20 | 4 个脚本 | 测试 |
| S3 | 写 `-14` 至 `-16` 三条脚本 | 20 | 3 个脚本 | 测试 |
| S4 | 写 `-17`、`-18` 与变更级 `-02`、`-03`、`-04`、`-08` 六条脚本 | 20 | 6 个脚本 | 测试 |
| S5 | 逐条跑通并落 JSON，失败项写原因码 | 20 | 13 个 `.tmp/ac/*.json` | 测试 |

回滚：只新增脚本与夹具，删除新增文件即可；不触碰已有脚本。

### T07 断言脚本·界面组

- 执行人 `chg-007-qa2`；REQ `REQ-CONV-009.2` 至 `.4`；CT 覆盖 `CT-CONV-436` 至 `-451` 的界面与验收入口判据；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T07/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 校准 `-05` 至 `-09` 五条已有脚本并跑通 | 20 | 5 个 JSON | 测试 |
| S2 | 校准 `-10` 至 `-13` 四条已有脚本并跑通 | 20 | 4 个 JSON | 测试 |
| S3 | 写变更级 `-01`、`-05`、`-06`、`-07` 四条脚本 | 20 | 4 个脚本 | 测试 |
| S4 | 三档跑通与截图采样，几何值写入 `metrics.json` | 20 | 截图与 `metrics.json` | 测试 |

回滚：已有脚本的修改按行 revert；新建脚本删除。

### T08 集成与端到端三档走查

- 执行人 `chg-007-e2e`；REQ 全部七条；CT `CT-CONV-434` 至 `-451` 全量；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T08/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 打开 `cfg.Modules["tasks"]`，串创建、编排、取消主链 | 20 | 集成日志 | Lead |
| S2 | 跑失败重试与取消级联端到端 | 20 | 日志与截图 | Lead |
| S3 | 375、768、1280 三档走查与测量 | 20 | 三档截图与 `metrics.json` | Lead |
| S4 | 写 E2E 报告，为 8 条变更级 AC 各落证据行 | 20 | `docs/testing/CHG-CONV-007-E2E-20261125.md` | 验收 |

回滚：只新增报告与截图，revert 即可；开关改回关闭。

### T09 变更级全量回归与独立验收

- 执行人 `chg-007-accept`；REQ 全部七条；CT `CT-CONV-434` 至 `-451`；验收签字人 用户；省略项：无省略。
- 检查点：`.tmp/chg-007-T09/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 跑全量前端与后端回归各 1 次 | 20 | 回归日志 | Lead |
| S2 | 跑 `check-gates`、`check-trace`、`check-contract`、`check-evidence` 并贴输出 | 15 | 四条输出 | Lead |
| S3 | 26 条 AC 判定与证据行对账，更新 `evidence.md` | 20 | 对账后的 evidence.md | Lead |
| S4 | 写验收报告与签字行 | 15 | `docs/testing/ACCEPT-CONV-007-R5-20261126.md` | 用户 |

回滚：只新增报告与 evidence 更新，按行 revert。

### T10 复盘与收口回写

- 执行人 `chg-007-retro`；REQ 全部七条（回顾）；CT `N/A：复盘卡不核对契约项`；验收签字人 `chg-007-accept`；省略项：无省略。
- 检查点：`.tmp/chg-007-T10/checkpoint.md`。

| 步骤号 | 内容 | 预计分钟 | 产出 | 汇报对象 |
|---|---|---|---|---|
| S1 | 收集请求数、总输入与前三项占比，取 `acp_cache` 与请求级扫描 | 20 | 成本表 | Lead |
| S2 | 写复盘七节（做对、做错、成本、规则缺口、下一轮、证据、签字） | 20 | `docs/plan/RETRO-CHG-CHG-CONV-007.md` | Lead |
| S3 | 回写 proposal §9、§10 与收口状态 | 15 | proposal 追加行 | 用户 |

回滚：只新增复盘文件与 proposal 追加段。

## 4 26 条 AC 的判据形式与负责人

18 条产品 AC 全部是脚本判据，`scripts/ac/AC-CONV-009-01.mjs` 至 `AC-CONV-009-18.mjs` 均已建成并执行，没有纯人工判据。8 条变更级 AC 中 4 条为脚本加人工复核（`-01`、`-05`、`-06`、`-07`，复核动作是看三档截图与视觉签字），其余 4 条为脚本判据；8 个脚本同样已建成并执行。

| AC | 判据形式 | 判据位置 | 负责人 | 当前状态 |
|---|---|---|---|---|
| AC-CONV-009-01 | 脚本 | `scripts/ac/AC-CONV-009-01.mjs` | 测试 `chg-007-qa1` | pass（25 条断言） |
| AC-CONV-009-02 | 脚本 | `scripts/ac/AC-CONV-009-02.mjs` | 测试 `chg-007-qa1` | pass（33 条断言） |
| AC-CONV-009-03 | 脚本 | `scripts/ac/AC-CONV-009-03.mjs` | 测试 `chg-007-qa1` | pass（16 条断言） |
| AC-CONV-009-04 | 脚本 | `scripts/ac/AC-CONV-009-04.mjs` | 测试 `chg-007-qa1` | pass（12 条断言） |
| AC-CONV-009-05 | 脚本 | `scripts/ac/AC-CONV-009-05.mjs` | 测试 `chg-007-qa2` | pass（18 条断言） |
| AC-CONV-009-06 | 脚本 | `scripts/ac/AC-CONV-009-06.mjs` | 测试 `chg-007-qa2` | pass（12 条断言） |
| AC-CONV-009-07 | 脚本 | `scripts/ac/AC-CONV-009-07.mjs` | 测试 `chg-007-qa2` | pass（33 条断言） |
| AC-CONV-009-08 | 脚本 | `scripts/ac/AC-CONV-009-08.mjs` | 测试 `chg-007-qa2` | pass（16 条断言） |
| AC-CONV-009-09 | 脚本 | `scripts/ac/AC-CONV-009-09.mjs` | 测试 `chg-007-qa2` | pass（15 条断言） |
| AC-CONV-009-10 | 脚本 | `scripts/ac/AC-CONV-009-10.mjs` | 测试 `chg-007-qa2` | pass（13 条断言） |
| AC-CONV-009-11 | 脚本 | `scripts/ac/AC-CONV-009-11.mjs` | 测试 `chg-007-qa2` | pass（9 条断言） |
| AC-CONV-009-12 | 脚本 | `scripts/ac/AC-CONV-009-12.mjs` | 测试 `chg-007-qa2` | pass（18 条断言） |
| AC-CONV-009-13 | 脚本 | `scripts/ac/AC-CONV-009-13.mjs` | 测试 `chg-007-qa2` | pass（UI 16 条断言；集成层 skip） |
| AC-CONV-009-14 | 脚本 | `scripts/ac/AC-CONV-009-14.mjs` | 测试 `chg-007-qa1` | pass（17 条断言） |
| AC-CONV-009-15 | 脚本 | `scripts/ac/AC-CONV-009-15.mjs` | 测试 `chg-007-qa1` | pass（34 条断言） |
| AC-CONV-009-16 | 脚本 | `scripts/ac/AC-CONV-009-16.mjs` | 测试 `chg-007-qa1` | pass（46 条断言） |
| AC-CONV-009-17 | 脚本 | `scripts/ac/AC-CONV-009-17.mjs` | 测试 `chg-007-qa1` | pass（17 条断言） |
| AC-CONV-009-18 | 脚本 | `scripts/ac/AC-CONV-009-18.mjs` | 测试 `chg-007-qa1` | pass（17 条断言） |
| AC-CHG-CONV-007-01 | 脚本加人工复核 | `scripts/ac/AC-CHG-CONV-007-01.mjs` 与三档截图 | 测试 `chg-007-qa2` | pass（14 条断言） |
| AC-CHG-CONV-007-02 | 脚本 | `scripts/ac/AC-CHG-CONV-007-02.mjs` | 测试 `chg-007-qa1` | pass（14 条断言） |
| AC-CHG-CONV-007-03 | 脚本 | `scripts/ac/AC-CHG-CONV-007-03.mjs` | 测试 `chg-007-qa1` | pass（52 条断言） |
| AC-CHG-CONV-007-04 | 脚本 | `scripts/ac/AC-CHG-CONV-007-04.mjs` | 测试 `chg-007-qa1` | pass（15 条断言） |
| AC-CHG-CONV-007-05 | 脚本加人工复核 | `scripts/ac/AC-CHG-CONV-007-05.mjs` 与三档截图 | 测试 `chg-007-qa2` | pass（31 条断言） |
| AC-CHG-CONV-007-06 | 脚本加人工复核 | `scripts/ac/AC-CHG-CONV-007-06.mjs` 与任务图截图 | 测试 `chg-007-qa2` | pass（17 条断言） |
| AC-CHG-CONV-007-07 | 脚本加人工复核 | `scripts/ac/AC-CHG-CONV-007-07.mjs` 与筛选截图 | 测试 `chg-007-qa2` | pass（25 条断言） |
| AC-CHG-CONV-007-08 | 脚本 | `scripts/ac/AC-CHG-CONV-007-08.mjs` | 测试 `chg-007-qa1` | pass（25 条断言） |

分布：26 条 AC 全部建成脚本并执行，缺脚本 0 条。判定分布为 pass 26 条、partial 0 条、missing 0 条、blocked 0 条、skip 0 条；断言合计 560 条，其中 18 条产品 AC 367 条、8 条变更级 AC 193 条。`AC-CONV-009-13` 的集成层按规则 skip、0 条断言，不计入 pass，UI 层 16 条断言通过。分布口径与 `evidence.md` §1、`specs/test/P1-CONV/test-plan.md` §18.2 一致。

## 5 依赖与并行

- 执行阶段可并行三张卡：T02（后端）、T04（前端）、T06 或 T07（测试），符合同一域并行不超过三张。T02 的 S1 先冻结接口形状，T04 在 S1 之后开工。
- 串行链：T01 → T02 → T03（同一 `service.go`）；T04 → T05（同一 `library.tsx`）；T06 与 T07 不同文件可并行；T08 汇总 T02 至 T07；T09 → T10。
- 文件级冲突：`backend/internal/modules/tasks/service.go` 由 T02、T03 顺序修改；`frontend/src/components/library.tsx` 由 T04、T05 顺序修改；`proposal.md` 由 T01、T10 顺序追加；`evidence.md` 只由 T09 修改。
- 脚本先红后绿：T06、T07 可以在实现卡完成前写脚本并按失败状态落盘，实现完成后复跑转绿，不把红脚本记成 pass。

## 6 回滚

- T01、T08、T09、T10 只新增文档、报告与追加段，按文件或按行 revert。
- T02：`category="task"` 与 `task_id` 是新增值，回滚停用写入并保留数据，不删历史消息；不新增迁移列，因此没有迁移回滚脚本。
- T03：依赖与取消相关行为按代码 revert；已写入的依赖关系不迁移到旧结构。
- T04、T05：五组组件按卡独立回滚，右栏回到 `PRD-CONV-008` 的只读投影，消息流回到纯文本进度。
- T06、T07：只新增或按行修改脚本，删除新增文件与撤销脚本改动即可。

## 7 旧卡去向（2026-11-23 的 17 张卡，不改写）

| 旧卡 | 原任务 | 原状态 | 去向 |
|---|---|---|---|
| W0-01 | 产品 spec 定稿 | done | 保留，判据来源 |
| W0-02 | 变更包骨架与 TC 锚点 | done | 保留，本文件与 `evidence.md` 接手 |
| W1-01 | 设计 spec §17 | done | 保留，`specs/design/P1-CONV/spec.md:756-1042` |
| W1-02 | 前端 spec | 待建 | 已落盘于 `specs/frontend/P1-CONV/spec.md` §17（`:1044` 起），原卡状态漂移，由 T01 复核 |
| W1-03 | 后端 spec | 待建 | 已落盘于 `specs/backend/P1-CONV/spec.md` §17（`:760` 起），原卡状态漂移，由 T01 复核 |
| W1-04 | 测试 spec | 待建 | 已落盘于 `specs/test/P1-CONV/test-plan.md` §18（`:900` 起），原卡状态漂移，由 T01 复核 |
| W1-05 | 设计对齐核验 | done | 保留 |
| W2-01 | 任务消息与卡片数据 | 待建 | 由 T02 承接 |
| W2-02 | 编排与等待、取消级联 | 待建 | 由 T03 承接 |
| W2-03 | 归属隔离、护栏与交付物 | 待建 | 由 T02 承接（与 W2-01 合并） |
| W3-01 | 消息流任务卡片与汇总卡 | 待建 | 由 T04 承接 |
| W3-02 | 右栏三标签与角标 | 待建 | 由 T05 承接 |
| W3-03 | 概览四节与定位 | 待建 | 由 T05 承接 |
| W3-04 | 厚卡、四筛选与详情 | 待建 | 由 T05 承接 |
| W3-05 | 任务图与交付物 | 待建 | 由 T05 承接 |
| W4-01 | 18 条与 8 条断言脚本 | 待建 | 拆为 T06（接口组）与 T07（界面组） |
| W5-01 | 集成、走查、回归与签字 | 待建 | 拆为 T08（集成与端到端）、T09（回归与验收）与 T10（复盘） |

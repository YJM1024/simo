# EVIDENCE · CHG-CONV-007

> 只写真跑过的证据；命令、路径、测量值可复现。未执行写 `missing`，不写“通过”。

## 1. 结论

- 结果：**部分完成**（W0-01、W0-02、W1-01、W1-05 有证据；W1-02 至 W1-04 与 W2–W5 未执行，记 `missing`）
- 范围：`PRD-CONV-009` 的 18 条 AC 与 `AC-CHG-CONV-007-01..08`
- 版本/buildId：文档阶段，无构建
- 执行人/时间：产品角色，2026-11-23

W0 的两项已完成：产品 spec 定稿（含四项裁决写回）、变更包四文件与 test-plan §18 锚点落盘。W0-02 的门禁结果为 `PASS (checks: 683)`，失败项 0、提示项 0。W1-01 的设计 spec §17 已落盘于 `specs/design/P1-CONV/spec.md`；W1-05 的对照核验已完成，原 4 处旧值已由设计列回写，DEC-30/31 对齐同日完成，落点见 §5。

## 2. 命令与输出

命令中的 `node` 指运行时绝对路径 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`；PATH 中没有 node。

```powershell
& "E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" scripts/check-trace.mjs
```

```text
check-trace: PRD 追溯结构门禁
  PRD 总数：TREE 72，TRACEABILITY 声明 72，TRACEABILITY 实际 72
  缺失（TRACEABILITY 未收录）：0
  坏 TEST 锚点：0
  缺失 TEST 计划：0
  非法 TEST 链接：0
  产品 spec PRD 声明：72，产品 spec 问题：0
  change 包：19，change 问题：0，治理豁免：1
  E2E README：存在；R4 检查行：72
  失败项：0，提示项：0
PASS (checks: 683)
```

2026-11-23 21:45 文档回写后复跑同一条命令：失败项 0、提示项 0，`PASS (checks: 683)`，退出码 0；本次只复核追溯结构，18 条 AC 的断言脚本仍未建。

```powershell
& "E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" scripts/check-spec-language.mjs
```

```text
FAILED: 96 error(s), 137 warning(s)
```

全仓语言门禁的 96 条错误全部落在既有产品 spec（`specs/product/P4-FILE/spec.md` 等），`specs/changes/CHG-CONV-007/spec.md` 命中 0 条。本包不修既有错误，也不把这条全局 FAILED 记为本包失败。

## 3. 逐卡证据要求

| 卡 | 复现命令 | 产物路径 | 通过判据 | 状态 |
|---|---|---|---|---|
| W0-01 | 人工核对产品 spec `:310-363`、`:377`、`:395-397`、`:406`，四项裁决写回 `:323`、`:329`、`:336-341`、`:345`、`:357`、`:359`、`:408` | `specs/product/P1-CONV/spec.md` | 15 条行为、18 条 AC、A9、状态行、裁决 ⑧ 与 DEC-26..29 齐备 | done |
| W0-02 | `node scripts/check-trace.mjs` | `.tmp/chg-conv-007/check-trace.log` | 退出码 0，失败项 0，锚点 `tc-p1-conv-009` 可解析 | done |
| W1-01 | 人工核对 `specs/design/P1-CONV/spec.md:756-1042` | `specs/design/P1-CONV/spec.md` §17（`:756-1042`）；§17.12 判据 `:981-1027`；§16 变更记录 v0.3 `:748` | §17.1 至 §17.13 各节齐备；右栏壳 280+40、概览四节、任务厚卡与等待标签、两种详情、交付物、任务图、消息流任务卡、三档断点、45 条 `V-CONV-009-*`（`:983-1026`）均有落点 | done |
| W1-02 | `node scripts/check-spec-language.mjs`；与设计 spec 逐项比对 | `specs/frontend/P1-CONV/task-panel.md` | 18 条 AC 的前端判定面全部有落点；组件、props、事件、接口、失败态各 1 节 | missing |
| W1-03 | 人工评审 + 前端 owner 确认接口形状 | `specs/backend/P1-CONV/task-orchestration.md` | 路由表、表结构、错误码、开关与回滚各 1 节；与 W1-02 的请求响应一致 | missing |
| W1-04 | `node scripts/ac-coverage.mjs --json` | `specs/test/P1-CONV/test-plan.md` §18；`.tmp/chg-conv-007/ac-coverage.json` | 18 条 AC 均有 TC 行；`items` 中 18 条无 `missing` | missing |
| W1-05 | 人工对照 `specs/product/P1-CONV/spec.md:343-366`、`:350-351`、`:355-358` 与 `docs/plan/DECISIONS.md:121-124`、`:128-129` | `specs/design/P1-CONV/spec.md` §17（`:756-1042`）、§17.12（`:981-1027`）、§16 v0.4（`:747`） | 18 条 AC 均有设计侧落点；DEC-26..31 逐条可对照；原 4 处差异已回写：§17.8.3 `:936-938`、§17.9.3 `:958`、§17.9.2 `:950`、§17.13 `:1028-1042`；DEC-30/31 落点见 §5 | done |
| W2-01 | `go test ./internal/modules/chat/ ./internal/modules/tasks/` | 测试输出 `.tmp/chg-conv-007/w2-01-test.log`；消息样例 `.tmp/chg-conv-007/task-message.json` | 退出码 0；样例含 `category="task"`、`task_id`，批量 10 条有汇总字段 | missing |
| W2-02 | `go test ./internal/modules/tasks/ -run 'Test.*(Depend|Wait|Cancel)'` | `.tmp/chg-conv-007/w2-02-test.log`；`.tmp/chg-conv-007/cancel.log` | 三种等待各 1 组断言通过；取消 A 后 B 启动 0 次 | missing |
| W2-03 | `go test ./internal/modules/tasks/ ./internal/modules/chat/`；`Invoke-RestMethod` 请求越权路径 | `.tmp/chg-conv-007/forbidden.json`；`.tmp/chg-conv-007/download.json` | 越权响应 403 且正文不含任务数据；下载字节数等于响应 `size` | missing |
| W3-01 | `cd frontend; pnpm test -- TaskCard` | `.tmp/chg-conv-007/w3-01-vitest.log`；`.tmp/chg-conv-007/task-card.html` | 单卡与 10 条汇总各 1 组用例通过；汇总标题计数 10 | missing |
| W3-02 | `cd frontend; pnpm test -- RightPanel`；CDP 测宽 | `.tmp/chg-conv-007/shots/metrics.json`；`.tmp/chg-conv-007/shots/right-panel-1280.png` | 收起 40px±1、展开整栏 320px（面板 280 + 竖条 40）、图标 3 个、角标与进行中数一致 | missing |
| W3-03 | `cd frontend; pnpm test -- Overview`；CDP 测首行位置 | `.tmp/chg-conv-007/shots/overview-375.png`；`metrics.json` 的 `firstRowTop` | 刷新前后折叠态一致；首行距滚动口顶部 0–8px；另一会话默认全开 | missing |
| W3-04 | `cd frontend; pnpm test -- TaskList TaskDetail` | `.tmp/chg-conv-007/w3-04-vitest.log` | 四筛选计数 11/2/1/3；计划第 6 步展开、第 7 步无入口；边做边想步骤节点 0 | missing |
| W3-05 | `cd frontend; pnpm test -- TaskGraph Deliverables`；CDP 截图 | `.tmp/chg-conv-007/shots/task-graph.png`；`.tmp/chg-conv-007/w3-05-vitest.log` | 8 节点四态齐全、失败下游虚线 1 条；交付物行含类型徽标与来源任务名 | missing |
| W4-01 | `node scripts/run-ac.mjs --only AC-CONV-009-01`（逐条 18 次）；`node scripts/run-ac.mjs --group cdp` | `.tmp/ac/AC-CONV-009-01..18.json`；`.tmp/chg-conv-007/run-ac-*.log` | 18 条各自退出码 0；JSON 含 `pass`、判据明细与采样时间 | missing |
| W5-01 | `cd frontend; pnpm test`；`go test ./...`；`node scripts/check-trace.mjs` | `docs/testing/CHG-CONV-007-E2E-20261123.md`；`.tmp/chg-conv-007/shots/{375,768,1280}.png` | 全量回归退出码 0；三档无横向溢出；8 条变更级 AC 全部有证据；验收签字 1 条 | missing |

## 4. 截图 / DOM / 测量

| 项 | 档位 | 路径 / 数值 |
|---|---|---|
| 右栏展开宽 | 375 / 768 / 1280 | 280px ±1；`.tmp/chg-conv-007/shots/right-panel-{375,768,1280}.png` |
| 右栏收起宽 | 375 / 768 / 1280 | 40px ±1；同上 `metrics.json` |
| 任务卡片 | 1280 | `.tmp/chg-conv-007/shots/task-card.png` |
| 计划详情第 6 步 | 1280 | `.tmp/chg-conv-007/shots/task-detail-plan.png` |
| 边做边想时间线 | 1280 | `.tmp/chg-conv-007/shots/task-detail-live.png` |
| 任务图弹窗 | 1280 | `.tmp/chg-conv-007/shots/task-graph.png` |
| 「还有 N 个」首行距滚动口顶部 | 1280 | 0–8px；`metrics.json` 的 `firstRowTop`（采样 `target.top − scroller.top`） |
| 横向溢出 | 375 | `document.documentElement.scrollWidth` = 视口宽 |

几何判据只取 CDP 真渲染或真机结果，jsdom 的 `getBoundingClientRect` 不充当尺寸证据。

## 5. 未跑 / 豁免 / 文档一致性

- 已完成：W0-01、W0-02、W1-01、W1-05，证据见 §3。
- 未跑：W1-02 至 W1-04、W2-01 至 W5-01，状态 `missing`。
- 原因：本角色只写变更包文档；其余卡按 [tasks.md](tasks.md) 派发。
- 语言门禁：全仓 96 条既有错误不在本包修复范围；本包 spec 命中 0 条，证据见 §2。
- 覆盖统计：test-plan §18 目前只有占位，`scripts/ac-coverage.mjs` 会把这 18 条记为 `missing`，W1-04 填完 TC 行后复跑。

已消除的不一致（2026-11-23 回写后复核）：

1. 设计 spec §17.8.3（`:936-938`）已按 DEC-29 改写：按依赖层分行、单层每 4 个换行、画布双向滚动、缩放固定 1.0。
2. 设计 spec §17.9.3（`:958`）已改为单卡最多平铺 10 条，第 11 条起收进「还有 N 条」。
3. 设计 spec §17.13（`:1028-1042`）未决项 0 条，原三项以已裁记录保留，含 DEC-30/31 与 AC-11 措辞。
4. 设计 spec §17.9.2（`:950`）已补等待确认的「确认」「取消」与等待资源的「恢复」入口，任务详情保持 0 入口（DEC-27）。
5. DEC-30/31 对齐：§17.4.5（`:868`）写四态卡可点、可聚焦、只读；`V-CONV-009-19`/`-20`（`:1001-1002`）、`V-CONV-009-21`（`:1003`）同步；§17.13 已裁记录在 `:1040-1042`。对照 `docs/plan/DECISIONS.md:128-129` 与产品 `specs/product/P1-CONV/spec.md:350-351`、`:355-358`。
6. `proposal.md` 风险 5/6 已按 DEC-29、DEC-26 改写，`:72` 的几何口径改为距滚动口顶部 0–8px，`:13` 已记变更包立起。
7. `specs/product/P1-CONV/spec.md:398` 已写变更包已立、17 张任务卡；`:317` 的六类状态已同步为 CHANGE ✅、任务卡 ✅。

仍存在的文档漂移（行号引用，不影响口径）：

1. `specs/changes/CHG-CONV-007/spec.md:11` 写 §4.6 `:310-363`、A9 `:377`，产品 spec 现为 `:310-366`、`:380`。
2. 同文件 `:17` 写 AC `:343-363`、A9 `:377`、状态 `:395-397`、裁决 ⑧ `:406`，现为 `:343-366`、`:380`、`:398`、`:409`。
3. 同文件 `:37` 写编号与产品 `:336-353` 一致，现为 `:342-366`。
4. `specs/changes/CHG-CONV-007/tasks.md:32`（W0-01 行）与 `:41`（W1-01 行）仍用 `:310-363`/`:377`/`:755-1039` 等旧区间；`:89` 同。
5. `specs/changes/CHG-CONV-007/evidence.md:52` 的 W0-01 行区间是核验当时的旧值，未随文档刷新。
6. `specs/product/P1-CONV/spec.md:317` 前端 spec 落点写 `frontend.md`，`tasks.md:42` 的 W1-02 落点为 `specs/frontend/P1-CONV/task-panel.md`（两文件均未建）。

## 6. 风险

1. `backend/internal/modules/tasks` 的开关 `cfg.Modules["tasks"]` 默认关闭，W2/W3 期间断言必须用夹具；W5 打开开关后要重跑一次，避免夹具与真实路径分叉。
2. `P4-FILE` 未提供真实文件时，下载字节判据只能用夹具；夹具必须走正式响应路径，路径与字节数写进 §3 的 `download.json`。
3. CDP 9223 不可用时改用 8787 真机，截图与 `metrics.json` 缺一即记 `missing`，不以 jsdom 结果顶替。
4. 任务图只覆盖 8 个节点；超过 20 个节点的排布已由 DEC-29（`:124`）裁决，本包不实现超限排布，W4 脚本按裁决补超限判据。

## 7. 链接

- 变更 spec：[spec.md](spec.md)；任务卡：[tasks.md](tasks.md)；提案：[proposal.md](proposal.md)
- 产品 spec：[`specs/product/P1-CONV/spec.md`](../../product/P1-CONV/spec.md) §4.6
- 测试计划：[`specs/test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md) §18
- 追溯：[`docs/product/TREE.md`](../../../docs/product/TREE.md) `:148`、[`docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md) `:75`
- 设计 spec：[`specs/design/P1-CONV/spec.md`](../../design/P1-CONV/spec.md) §17（`:756-1042`）
- 裁决：[`docs/plan/DECISIONS.md`](../../../docs/plan/DECISIONS.md) 的 DEC-25（B1-01 部分取代）、DEC-26（`:121`）、DEC-27（`:122`）、DEC-28（`:123`）、DEC-29（`:124`）
- 原型：[`docs/design/task-prototype-v3-20261123.html`](../../../docs/design/task-prototype-v3-20261123.html)

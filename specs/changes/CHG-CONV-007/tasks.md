# CHG-CONV-007 · 任务卡

状态：**异常（前向修）**（2026-11-24 18:13；异常登记与现场见 [`FAIL-20261124-CHG-CONV-007`](../../../docs/plan/FAIL-20261124-CHG-CONV-007.md)，裁决待用户确认，当前按出口 B 执行；转异常前为 `进行中`，W0、W1-01、W1-05 已完成）
Implements: `PRD-CONV-009`
Change: CHG-CONV-007
变更类型：**增量型变更**

派发规则：

1. 每张卡按 owner / scope / AC / 证据四要素派发，scope 之外的文件不写；同一文件同一时间只允许一个 owner 修改。
2. 实现者不自签：W5 由验收 Agent 独立签字，用户只验收前端效果。
3. 单卡以 30 分钟为上限；到点未完成，把已完成部分、未完成项与下一步写进 `.tmp/chg-conv-007/<卡号>-checkpoint.md`，再决定续跑或拆卡。
4. 证据缺失写 `missing`，不写“通过”；断言脚本的输出 JSON、命令与退出码一并落盘。
5. 依赖未就绪时用夹具或桩数据推进，夹具路径写进证据，不在实现里硬编码测试分支。
6. 回滚按卡执行；涉及数据库迁移的卡先写回滚脚本再写迁移。

## 波次总览

| 波次 | 内容 | 卡数 | 出口 |
|---|---|---|---|
| W0 | 产品定稿与包骨架 | 2 | 18 条 AC 冻结，四文件与 TC 锚点落盘，门禁 0 失败 |
| W1 | 设计、前端、后端、测试四列 spec | 5 | 四列判据冻结，实现前不再改 AC 含义 |
| W2 | 后端实现 | 3 | 任务消息、编排、归属、护栏、交付物接口有单测 |
| W3 | 前端实现 | 5 | 卡片、右栏、概览、详情、任务图、交付物组件可跑 |
| W4 | 18 条断言脚本 | 1 | 每条脚本独立运行并写证据 JSON |
| W5 | 集成与端到端验收 | 1 | 8 条变更级 AC 有证据，全量回归与三档走查完成 |

## W0 · 产品定稿与包骨架（已完成）

| 卡 | 任务 | owner | scope（作用域文件） | AC | 证据 | 状态 |
|---|---|---|---|---|---|---|
| W0-01 | 产品 spec 定稿：15 条目标行为、18 条 AC、场景 I、A9、状态与裁决 ⑧ | 产品 | `specs/product/P1-CONV/spec.md` §4.6（`:310-363`）、A9（`:377`）、§6（`:395-397`）、§7（`:406`）；原型 `docs/design/task-prototype-v3-20261123.html` 只读 | `AC-CONV-009-01..18` 的编号、主语与判据 | 产品 spec 行号引用；原型九屏用户确认记录（2026-11-23）；本包 `spec.md` §3 映射表；四项裁决写回 `:323`、`:329`、`:336-341`、`:345`、`:357`、`:359`、`:408`（DEC-26..29） | done |
| W0-02 | 变更包骨架、TC 锚点与追溯登记 | 产品 | `specs/changes/CHG-CONV-007/{proposal,spec,tasks,evidence}.md`；`specs/test/P1-CONV/test-plan.md` §18 占位 | `AC-CHG-CONV-007-01..08` 的定义；门禁 T4/T5 | `node scripts/check-trace.mjs` 退出码 0；输出贴入 `evidence.md` §2；锚点 `tc-p1-conv-009` 可被 `docs/product/TREE.md:148` 与 `TRACEABILITY.md:75` 解析 | done |

W0-02 于 2026-11-23 完成：`specs/changes/CHG-CONV-007/` 的 proposal、spec、tasks、evidence 四文件与 `tc-p1-conv-009` 锚点已落盘，变更包已立；W0 出口（18 条 AC 冻结、门禁 0 失败）达成，之后进入 W1。

## W1 · 四列 spec

| 卡 | 任务 | owner | scope（作用域文件） | AC | 证据 | 状态 |
|---|---|---|---|---|---|---|
| W1-01 | 设计 spec：任务卡片、右栏三标签与 40px 竖条、概览四节、任务厚卡与四筛选、两种详情、任务图弹窗、三档断点 | 设计 | `specs/design/P1-CONV/spec.md` §17（`:755-1039`，本次落盘，新建内容并入既有文件）；`docs/design/task-prototype-v3-20261123.html` 只读 | `AC-CONV-009-01`、`-02`、`-05`、`-06`、`-07`、`-08`、`-09`、`-10`、`-11`、`-12`、`-13` | 设计 spec 落盘于 `specs/design/P1-CONV/spec.md`：§17.1 入口 `:757-763`、§17.2 右栏壳 280+40 `:765-799`、§17.3 概览四节 `:801-831`、§17.4 任务厚卡与等待标签 `:833-871`（标签 `:847`）、§17.5 计划详情 `:873-899`、§17.6 边做边想 `:901-907`、§17.7 交付物 `:909-915`、§17.8 任务图 `:917-937`、§17.9 消息流任务卡 `:939-957`、§17.10 三档断点 `:959-970`、§17.11 状态与降级 `:972-978`、§17.12 45 条 `V-CONV-009-*` `:980-1023`；§16 变更记录 v0.3 `:748`、v0.4 `:747` | done |
| W1-02 | 前端 spec：组件、props、状态机、接口调用、降级与空态、第五类消息渲染 | 前端 | `specs/frontend/P1-CONV/task-panel.md`（新建）；`frontend/src/types.ts` 只读 | 18 条 AC 的前端判定面；`AC-CHG-CONV-007-05`、`-06`、`-07` | spec 按功能点分节，每节列组件文件、props、事件、接口与失败态；与设计 spec 的尺寸值一致 | 待建 |
| W1-03 | 后端 spec：路由、表与字段、状态投影、编排与等待语义、取消级联、归属、四条护栏、错误码 | 后端 | `specs/backend/P1-CONV/task-orchestration.md`（新建）；`backend/internal/modules/tasks/` 只读 | `AC-CONV-009-03`、`-04`、`-14`、`-15`、`-17`、`-18`；`AC-CHG-CONV-007-02`、`-03`、`-04`、`-08` | 路由表、表结构、错误码表、开关与迁移回滚各 1 节；接口形状经前端 owner 确认 1 次 | 待建 |
| W1-04 | 测试 spec：18 条 TC、三组运行方式、夹具、证据路径 | 测试 | `specs/test/P1-CONV/test-plan.md` §18；`specs/test/P1-CONV/fixtures/task/*.json`（新建） | 18 条 AC 全部映射 TC；`AC-CHG-CONV-007-01..08` | test-plan §18 有 18 行 TC 与 AC 对应；夹具清单与生成命令；`node scripts/ac-coverage.mjs` 报告 18 条被覆盖 | 待建 |
| W1-05 | 设计 spec 对齐核验：§17 与产品四项裁决、18 条 AC 的设计侧落点逐条对照，差异落清单 | 设计 | `specs/design/P1-CONV/spec.md` §17 只读（`:756-1042`）；`specs/product/P1-CONV/spec.md:343-366`、`:350-351`、`:355-358` 只读 | 18 条 AC 各有设计侧落点；DEC-26..31 逐条可对照，差异有行号或已回写 | 核验记录：`specs/design/P1-CONV/spec.md` §17.12（`:981-1027`，45 条 V 判据）、§16 v0.4（`:747`）、§17.9.1（`:942-944`，独立消息类型）、§17.4（`:834-873`，三种等待标签）；DEC-30/31 对齐落点：§17.4.5（`:868`）、`V-CONV-009-19`/`-20`（`:1001-1002`）、`V-CONV-009-21`（`:1003`）、§17.13（`:1040-1042`）；原 4 处差异已回写：§17.8.3 `:936-938`、§17.9.3 `:958`、§17.9.2 `:950`、§17.13 `:1028-1042` | done |

W1-05 的 done 表示核验已做完并落差异清单；核验由变更包维护角色执行，设计列复签记录仍缺。原四处差异已由设计列回写：§17.8.3（`:936-938`）按 DEC-29 改为按依赖层分行，§17.9.3（`:958`）改为单卡最多 10 条，§17.9.2（`:950`）补上等待确认「确认」「取消」与等待资源「恢复」入口，§17.13（`:1028-1042`）未决项 0 条并以已裁记录保留。DEC-30/31 的对齐同日完成，落点见 W1-05 行的证据列。

## W2 · 后端实现

| 卡 | 任务 | owner | scope（作用域文件） | AC | 证据 | 状态 |
|---|---|---|---|---|---|---|
| W2-01 | 任务消息类型与卡片数据：`category="task"`、`task_id` 关联、批量汇总所需字段、启动上下文裁剪 | 后端 | `backend/internal/modules/chat/category.go`、`model.go`、`migrations.go`、`service.go`；`backend/internal/modules/tasks/service.go`、`http.go` | `AC-CONV-009-01`、`-02`、`-03` | `go test ./internal/modules/chat/ ./internal/modules/tasks/` 退出码 0；`POST /api/sessions/{id}/messages` 响应含 `task_id` 与 `category=task` 的样例 JSON，写 `.tmp/chg-conv-007/task-message.json` | 待建 |
| W2-02 | 编排与等待语义、取消级联：依赖关系、三种等待触发、整链取消、下游不启动 | 后端 | `backend/internal/modules/tasks/workflow.go`、`concurrency.go`、`service.go`、`migrations.go` | `AC-CONV-009-14`、`-15`；`AC-CHG-CONV-007-03` | `go test ./internal/modules/tasks/ -run 'Test.*(Depend|Wait|Cancel)'`；取消日志 `.tmp/chg-conv-007/cancel.log` 含 A 取消时间与 B 启动 0 次 | 待建 |
| W2-03 | 归属隔离、四条护栏与交付物分组下载：会话隔离查询、权限越界 403 与跨会话 404、下载字节一致 | 后端 | `backend/internal/modules/tasks/http.go`、`deliverables.go`、`content_disposition.go`；`backend/internal/modules/chat/permissions.go`、`grants.go` | `AC-CONV-009-04`、`-16`、`-17`；`AC-CHG-CONV-007-04`、`-08` | `go test ./internal/modules/tasks/ ./internal/modules/chat/`；`Invoke-RestMethod` 的 403 与 404 响应 `.tmp/chg-conv-007/forbidden.json`；下载字节比对 `.tmp/chg-conv-007/download.json` | 待建 |

## W3 · 前端实现

| 卡 | 任务 | owner | scope（作用域文件） | AC | 证据 | 状态 |
|---|---|---|---|---|---|---|
| W3-01 | 消息流任务卡片与批量汇总卡：第五类消息渲染、`task_id` 定位、汇总展开 | 前端 | `frontend/src/components/task-card.tsx`（新建）、`frontend/src/components/library.tsx` 的 `MessageItem`（`:501`）、`frontend/src/types.ts` | `AC-CONV-009-01`、`-02`；`AC-CHG-CONV-007-01` | `cd frontend; pnpm test -- TaskCard`；组件测试覆盖单卡与 10 条汇总；DOM 快照 `.tmp/chg-conv-007/task-card.html` | 待建 |
| W3-02 | 右栏三标签、40px 竖条、角标：`RightPanel` 改造，任务与交付物标签页 | 前端 | `frontend/src/components/library.tsx` 的 `OverviewContent`（`:1097`）与 `RightPanel`（`:1164`）、`frontend/src/styles.css` | `AC-CONV-009-08`、`-09`；`AC-CHG-CONV-007-05` | `pnpm test -- RightPanel`；CDP 测宽 `.tmp/chg-conv-007/shots/metrics.json` 含 40/320/280 与 3 图标；角标 9+ 断言 | 待建 |
| W3-03 | 概览四节与「还有 N 个」定位：折叠态按会话记忆、跨会话默认全开、跳转滚动 | 前端 | `frontend/src/components/library.tsx` 概览段、`frontend/src/app.tsx`（投影加载与 `locateTask`） | `AC-CONV-009-10`、`-11`；`AC-CHG-CONV-007-07` | `pnpm test -- Overview`；CDP 测首行距滚动口顶部 0–8px 的 `metrics.json`；刷新前后折叠态对比 | 待建 |
| W3-04 | 任务厚卡、四筛选、两种只读详情：状态/模式/刻度/产出/失败原因，计划步骤与边做边想时间线 | 前端 | `frontend/src/components/task-list.tsx`（新建）、`frontend/src/components/task-detail.tsx`（新建）、`frontend/src/components/library.tsx` | `AC-CONV-009-05`、`-06`、`-07`、`-12`；`AC-CHG-CONV-007-06` | `pnpm test -- TaskList TaskDetail`；两种模式各 1 组组件测试；入口计数断言（操作 0、关闭 1） | 待建 |
| W3-05 | 任务图与交付物分组：覆盖全应用的只读弹窗、四态与虚线、交付物行与下载 | 前端 | `frontend/src/components/task-graph.tsx`（新建）、`frontend/src/components/task-deliverables.tsx`（新建）、`frontend/src/app.tsx` | `AC-CONV-009-13`、`-16`；`AC-CHG-CONV-007-06` | `pnpm test -- TaskGraph Deliverables`；CDP 截图 `.tmp/chg-conv-007/shots/task-graph.png`；下载文件名与字节断言 | 待建 |

## W4 · 断言脚本

| 卡 | 任务 | owner | scope（作用域文件） | AC | 证据 | 状态 |
|---|---|---|---|---|---|---|
| W4-01 | 18 条 AC 断言脚本与 8 条变更级脚本：HTTP、单元组件、CDP 三组，统一 JSON 输出 | 测试 | `scripts/ac/AC-CONV-009-01..18.mjs`（新建 18 个）、`scripts/ac/AC-CHG-CONV-007-01..08.mjs`（新建 8 个） | `AC-CONV-009-01..18`；`AC-CHG-CONV-007-01..08` | 每条脚本单独运行 1 次，退出码与 `.tmp/ac/<AC-ID>.json` 齐全；`node scripts/run-ac.mjs --group unit` 与 `--group cdp` 各 1 次汇总输出；`node scripts/ac-coverage.mjs` 覆盖 18/18 | 待建 |

## W5 · 集成与端到端验收

| 卡 | 任务 | owner | scope（作用域文件） | AC | 证据 | 状态 |
|---|---|---|---|---|---|---|
| W5-01 | 集成、三档走查、全量回归与签字：打开 `modules.tasks`，串起创建、编排、取消、交付物全链 | 验收 | `docs/testing/CHG-CONV-007-E2E-20261123.md`（新建）；`specs/changes/CHG-CONV-007/evidence.md`；截图目录 `.tmp/chg-conv-007/shots/` | `AC-CHG-CONV-007-01..08` 全部；抽查 `AC-CONV-009-01`、`-13`、`-15`、`-17` | 全量前端 `pnpm test` 与后端 `go test ./...` 各 1 次退出码 0；375/768/1280 三档截图与 `metrics.json`；`node scripts/check-trace.mjs` 0 失败；验收报告签字 1 条 | 待建 |

## 依赖与并行

- W1 四列可并行，W1-05 在 W1-01 落盘后做核验，已随 W1-01 完成；W1-02 依赖 W1-01 的尺寸与组件树，W1-04 依赖 W1-02 与 W1-03 的接口形状；四列在 W1 末统一冻结判据。
- W2 与 W3 在 W1 冻结后并行；W3 依赖 W2-01 的消息字段与 W2-03 的交付物响应形状，接口未定时先用 W1-03 的契约桩。
- W4 依赖 W2 与 W3 的可运行入口；CDP 组排队执行，HTTP 与单元组并行上限 4。
- W5 依赖 W4 全部脚本可运行；`modules.tasks` 开关在 W5 打开，W2/W3 期间用夹具。
- 同一文件冲突：`library.tsx` 由 W3-01 至 W3-04 顺序修改，不并行；`app.tsx` 由 W3-03 与 W3-05 顺序修改。

## 回滚

- 文档卡按文件 revert；W1 五张卡未签字前可直接删除新建文件，设计 spec 的 §17（`:755-1039`）按行区间整段回退。
- W2-01 的 `category="task"` 与消息字段是新增值，回滚停用写入并保留数据，不删历史；迁移回滚脚本随卡提交。
- W2-02 的依赖与取消表按迁移版本回退，已写入的依赖关系不迁移到旧结构。
- W3 五组组件按卡独立回滚，右栏回退到 `PRD-CONV-008` 的只读投影。
- W4/W5 只新增脚本与报告，回滚即 revert，不影响运行时。

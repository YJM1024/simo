# 司墨产品 Backlog（未实现 PRD）

状态：**active（backlog，不代表完成）** — 本文件只登记当前 `unimplemented` 的产品功能点与推进顺序，不创建变更包、不写代码、不改变任何 PRD 的实现状态。
> 关联：[`TREE.md`](TREE.md) · [`TRACEABILITY.md`](TRACEABILITY.md) · [`SPEC-GAP.md`](SPEC-GAP.md) · [`ID-SPEC.md`](ID-SPEC.md)。
> 统计口径：16 个 `unimplemented` PRD；covered 仍为 0，partial 48，gap 23；本文件不把任何一项计入 covered/partial。

## 1. 口径

- **纳入条件**：产品 spec 中 `实现状态：unimplemented` 的 PRD；有设计/契约但没有可用实现和完整验收的，也按 `unimplemented` 处理。
- **优先级**：沿用产品 spec 的 P0/P1/P2；P0 表示应先补产品与开发 spec，不代表已经排期或本轮实现。
- **完成定义**：六类产物齐备（产品 spec、前端/后端开发 spec、组件 spec 如适用、任务卡、测试 spec）+ 当前 build 执行证据 + 独立验收；仅“文档写好”不算完成。
- **本轮边界（2026-11-20）**：只做文档收口；不创建 `specs/changes/`、不改代码、不改 8787、不改 data。表中“是否本轮实现”全部为**否**。
- **与 kernel 的边界**：P5–P9 的 change 包与 `docs/testing/BACKEND-EVIDENCE-20261120.md` 由 kernel 负责；本文件不与其写作用域冲突，也不预填其 evidence。

## 2. 未实现清单（16 项）

| # | PRD | 能力 | 当前状态 | 缺口 | 优先级 | 依赖 | 建议下一步 | 是否本轮实现 |
|---:|---|---|---|---|---|---|---|---|
| 1 | [`PRD-SYNC-005`](../../specs/product/P1-CONV/spec.md#prd-sync-005) | 远程访问与通知中心 | `unimplemented` | 无远程鉴权/通知产品 spec；无实现、无验收 | P2 | 会话/同步、远程鉴权、通知投递 | 先补远程访问与通知的产品设计（鉴权、传输、通知中心），再开 change 包 | 否 |
| 2 | [`PRD-TASK-003`](../../specs/product/P2-TASK/spec.md#prd-task-003) | 长任务异步与开始/结束消息 | `unimplemented` | 仅有 M19 契约；异步开始/结束消息、解耦与恢复未实现验收 | **P0** | [`M19`](../m19-contract.md)、任务运行时、WS/事件 | 先定开始/结束消息与恢复状态机，补 M19 开发 spec，再开 change 包 | 否 |
| 3 | [`PRD-TASK-004`](../../specs/product/P2-TASK/spec.md#prd-task-004) | 复杂度分级与确认门禁 | `unimplemented` | C0–C4 只有文档，无实现、无测试 | **P0** | [`M10`](../m10-contract.md)、[`task-complexity`](../task-complexity.md) | 把 C0–C4 转成可执行门禁与 AC，补前端确认交互/后端策略，再开 change 包 | 否 |
| 4 | [`PRD-TASK-005`](../../specs/product/P2-TASK/spec.md#prd-task-005) | 子会话与任务归属 | `unimplemented` | `childSessionIds`、子会话内建 Task 的规则已定但未实现/未验证 | **P0** | [`M1`](../m1-contract.md) / [`M10`](../m10-contract.md)、[`session-core`](../session-core-spec.md) | 先定 childSessionIds→Task 的归属、可见性与清理规则，补会话契约，再开 change 包 | 否 |
| 5 | [`PRD-WORK-005`](../../specs/product/P3-WORK/spec.md#prd-work-005) | 自定义视图 13 类块 | `unimplemented` | 只有视图 Schema/渲染契约，无前端页面、无测试 | P1 | [`M24`](../m24-view-contract.md)、工作台/右栏 | 先做 13 块视图 schema→前端只读渲染 MVP，补组件与 AC，再开 change 包 | 否 |
| 6 | [`PRD-MEM-006`](../../specs/product/P5-MEM/spec.md#prd-mem-006) | 记忆迁移与索引 | `unimplemented` | 迁移/索引只有契约；无迁移回滚与兼容性测试 | P2 | [`M21`](../m21-memory-contract.md)、数据库迁移 | 先做迁移 dry-run/回滚/索引兼容设计，补数据迁移测试，再开 change 包 | 否 |
| 7 | [`PRD-TEAM-004`](../../specs/product/P6-TEAM/spec.md#prd-team-004) | 团队只读投影与对话创建 | `unimplemented` | 只读投影/通过对话创建仍为设计；无验收 | P1 | [`TEAM`](../team-contract.md)、权限 | 先定只读投影字段与对话创建入口/权限，补 TEAM 开发 spec，再开 change 包 | 否 |
| 8 | [`PRD-TEAM-006`](../../specs/product/P6-TEAM/spec.md#prd-team-006) | 子代理并行与团队任务板 | `unimplemented` | 子代理并行/任务板未实现；只有流程文档与契约 | P2 | [`M10`](../m10-contract.md) / [`TEAM`](../team-contract.md) | 先定并行调度与任务板数据源，补 M10/TEAM 契约，再开 change 包 | 否 |
| 9 | [`PRD-SCHED-005`](../../specs/product/P7-SCHED/spec.md#prd-sched-005) | 失败·重试·通知 | `unimplemented` | 失败重试/通知未实现；无产品规则 | P2 | [`M13`](../m13-contract.md)、通知投递 | 先定失败分类/重试退避/通知渠道，补 M13 契约，再开 change 包 | 否 |
| 10 | [`PRD-SET-003`](../../specs/product/P8-SET/spec.md#prd-set-003) | 外观·主题·语言 | `unimplemented` | 只有浅色暖纸基线；无主题/语言设置 | P2 | [`DESIGN`](../../DESIGN.md)、设置壳层 | 先出主题/语言 token 与切换设计，评估与 `DESIGN.md` 基线关系，再开 change 包 | 否 |
| 11 | [`PRD-SET-005`](../../specs/product/P8-SET/spec.md#prd-set-005) | 快捷键·关于·版本 | `unimplemented` | 无快捷键帮助/关于页 | P2 | 应用壳层、build-id/版本来源 | 先定快捷键表、关于页与版本展示来源，补前端任务卡，再开 change 包 | 否 |
| 12 | [`PRD-SET-006`](../../specs/product/P8-SET/spec.md#prd-set-006) | 能力管理（MCP/CLI/Skills/目录） | `unimplemented` | 只有 P2 backlog；无实现、无测试 | P2 | [`M9`](../m9-contract.md)、[`capability-catalog`](capability-catalog.md) | 先定能力目录/权限/安装卸载边界，补 M9/TOOL 契约，再开 change 包 | 否 |
| 13 | [`PRD-TOOL-003`](../../specs/product/P9-TOOL/spec.md#prd-tool-003) | Skills 发现与加载 | `unimplemented` | 后端无 skills 代码/测试；产品 spec 原 partial 为文档不一致，按 backend 口径降级 | P1 | [`M20`](../m20-contract.md)、工具运行时 | 先补 Skills 发现/加载/权限与失败路径的后端实现和测试，再开 change 包 | 否 |
| 14 | [`PRD-TOOL-004`](../../specs/product/P9-TOOL/spec.md#prd-tool-004) | MCP 接入 | `unimplemented` | 未实现；无协议/安全验收 | P2 | MCP 传输、鉴权、审计、沙盒 | 先定 MCP 传输/鉴权/超时/审计与安全验收，再开 change 包 | 否 |
| 15 | [`PRD-TOOL-007`](../../specs/product/P9-TOOL/spec.md#prd-tool-007) | 能力目录 L0–L3 | `unimplemented` | 只有 capability-catalog 草案；无实现、无测试 | P2 | [`capability-catalog`](capability-catalog.md)、P9 工具面 | 先把目录草案收敛为 L0–L3 可执行模型与入口，再开 change 包 | 否 |
| 16 | [`PRD-METRIC-006`](../../specs/product/P10-METRIC/spec.md#prd-metric-006) | 导出·对比·告警 | `unimplemented` | 未实现；无导出/告警测试 | P2 | [`metrics-dashboard`](metrics-dashboard.md)、指标 API/遥测 | 先定导出格式、对比口径、告警阈值与权限，补指标契约，再开 change 包 | 否 |

## 3. 建议分批

### 第 1 批：P0（先补产品/开发 spec）

1. `PRD-TASK-003` 长任务异步与开始/结束消息
2. `PRD-TASK-004` 复杂度分级与确认门禁
3. `PRD-TASK-005` 子会话与任务归属

理由：三者共同决定 Task/子会话的运行时边界；不先定，后续执行组、团队任务板、指标都会重复返工。建议各开独立 change 包，不合并成“大 Task 改造”。

### 第 2 批：P1（有契约、缺产品闭环）

1. `PRD-WORK-005` 自定义视图 13 类块
2. `PRD-TEAM-004` 团队只读投影与对话创建

理由：已有 M24/TEAM 契约，缺前端入口、权限与验收；可先做只读/只展示 MVP，再做写路径。

### 第 3 批：P2（按依赖解锁）

`PRD-SYNC-005`、`PRD-MEM-006`、`PRD-TEAM-006`、`PRD-SCHED-005`、`PRD-SET-003/005/006`、`PRD-TOOL-004/007`、`PRD-METRIC-006`。

理由：多为跨域能力或设置/目录类，需先有稳定契约、权限模型或通知/遥测基础；不建议与 P0 并行抢同一运行时。

## 4. 未实现项的完成门槛

每个 PRD 从 backlog 移出前必须满足：

1. `specs/product/<域>/spec.md` 的 PRD 场景/行为/AC/状态已更新，且不再是 `unimplemented`。
2. 有对应 change 包（proposal/spec/design/frontend/backend/tasks/test-plan/evidence；不涉及侧写 `N/A + 理由`）。
3. 有独立测试用例与当前 build 的执行证据；未跑不得写“通过”。
4. 有独立验收记录；实现者不得自签。
5. `TREE.md`、`TRACEABILITY.md`、`SPEC-GAP.md` 与本文件同步更新；本文件只保留仍未完成项，完成项移入历史/归档。

## 5. 与 kernel / evidence 的衔接

- P5–P9 的 change 包与 `docs/testing/BACKEND-EVIDENCE-20261120.md` 由 kernel 负责；本文件**不**创建或修改 `specs/changes/`，也不预填其证据。
- kernel 完成 evidence 后，再由对应 owner 把证据映射到 `specs/test/<域>/test-plan.md` 与 `TRACEABILITY.md`；映射时必须区分“部分用例执行”和“PRD 覆盖”，不得因为 backlog 项有局部证据就升级。
- 本文件是规划清单，不是排期承诺；优先级变化必须回写产品 spec 与 TREE，而不是只改本表。

## 6. 维护规则

- 新增 `unimplemented` PRD：同步加入本表、TREE 状态列与 SPEC-GAP，缺一不可。
- 完成/降级：必须附 change 包、测试证据与独立验收；只删本表行不算完成。
- 本轮（2026-11-20）只建本文件与 TREE backlog 链接；不改任何代码、测试、运行实例或 `specs/changes/`。

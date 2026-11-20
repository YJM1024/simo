# PROPOSAL · CHG-LEGACY-P5-MEM

- 变更 ID：CHG-LEGACY-P5-MEM
- 类型：历史能力归档（docs-only）
- Owner：backend
- 日期：2026-11-20
- 关联产品域：`specs/product/P5-MEM/spec.md`
- 状态：archived / partial（不表示 P5 已完整交付）

## 1. 背景

P5（记忆系统）的后端服务、HTTP 接口、SQLite 迁移和一批测试已经存在，但 `specs/test/P5-MEM/test-plan.md` 仍是全 `missing` 的骨架；仓库中没有与真实代码对应的 P5 变更包，也没有可复核的后端执行证据。直接在产品 spec 上勾选完成会虚构能力，因此需要一次只读审计。

## 2. 目标

1. 把 P5 已存在的后端 API、数据表、迁移、错误边界和测试映射固化成可追溯的变更包。
2. 区分 `partial`（有实现且有测试）、`partial`（有实现、测试不足）、`unimplemented`（无实现）三类事实。
3. 用一次真实全量 `go test ./...` 的结果作为包级证据，而不是引用计划中的测试。

成功标准：每个 PRD 至少能回答“后端做了什么 / 测试在哪里 / 还缺什么”；没有测试的地方明确写 `missing`，不写 `covered`。

## 3. 范围

### In scope（只读审计 + 归档文档）

- `backend/internal/modules/memory/**`、`backend/internal/core/memory/**` 的 HTTP、服务、迁移与召回/巩固实现。
- 相关测试：`backend/cmd/simo/m3_test.go`、`m21_test.go`、`m22_test.go`、`m27_test.go`、`m30_test.go`、`m31_recall_test.go`、`m32_test.go`，以及 `backend/internal/modules/memory/*_test.go`。
- 2026-11-20 全量测试执行证据。

### Out of scope

- 不实现 MEM-006（迁移/索引产品化），不改变任何表结构或向量算法。
- 不新增前端页面；P5 当前没有用户可见的独立记忆页面。
- 不修改产品 spec、TREE、TRACEABILITY、验收记录。
- 不写正式数据，不启动 8787，不部署。

## 4. 影响面

| 层 | 影响 |
|---|---|
| 前端 | 无（N/A，见 frontend.md） |
| 后端 API | 仅归档既有 `/api/memory*`、`/api/debug/recall*`、`/api/debug/memory/*` |
| 数据/SQLite | 归档 v1–v6 迁移事实；不新增迁移 |
| 测试 | 仅引用并执行；本包不新增测试 |
| 文档 | 新增 `specs/changes/CHG-LEGACY-P5-MEM/**` |

## 5. 方案比较

| 方案 | 结论 |
|---|---|
| A. 直接把 P5 标成 covered 并在测试计划填“通过” | 拒绝：没有逐 AC 证据，且 MEM-006 无实现，属于虚构完成 |
| B. 只写一份总报告 | 不足：无法按 PRD 追溯 owner/scope/AC/证据 |
| C. 历史归档变更包 + 全量测试证据（采用） | 能保留真实边界，后续实现可按缺口继续 |

## 6. 风险、依赖与假设

- 风险：产品 spec 中的 AC 面向 UI/用户可感知结果，后端测试只能证明 API/数据路径，不能替代前端验收。
- 风险：`partial` 容易被误读为“已完成大部分”；本包在 `evidence.md` 对每个 PRD 给出已覆盖/未覆盖点。
- 依赖：项目 Go 工具链 `toolchain/go/bin/go.exe`；临时目录必须在 `backend/../.tmp`，否则系统临时目录可能拒绝访问。
- 假设：P5 没有独立前端入口；记忆能力通过会话上下文注入间接影响用户。
- 待确认：MEM-006 是否仍是 P2 优先；向量召回（MEM-005）的产品默认策略是否确认为“默认关闭、显式开启”。

## 7. 决策请求

请产品/验收 owner 确认：

1. 接受本包为 **历史归档 + 缺口清单**，不据此修改 P5 产品状态为 implemented。
2. 接受 MEM-006、前端可感知的 AC-02 继续记为 `missing/backlog`。
3. 后续若要升级为正式变更，另开实现型 CHG，不在本包内扩 scope。

## 8. 链接

- 产品 spec：[`specs/product/P5-MEM/spec.md`](../../product/P5-MEM/spec.md)
- 后端说明：[`backend.md`](backend.md)
- 测试计划：[`test-plan.md`](test-plan.md)
- 执行证据：[`evidence.md`](evidence.md)

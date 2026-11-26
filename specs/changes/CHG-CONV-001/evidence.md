# CHG-CONV-001 · 执行证据

状态：**partial**（引用 2026-11-20 已执行报告；2026-11-21 仅做只读核对，**未重跑**）
Change: CHG-CONV-001
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003

结果：本轮未重跑，逐条证据见下表；未验证项按 `missing` 记，不宣称通过。

## 1. 证据来源（存在性已核对）

| 文件 | 大小 | 内容 |
|---|---|---|
| `docs/testing/EVIDENCE-20261120.md` | 10684 B | 前端 69/69、覆盖率、CDP 11/11×5、4A 118 检查、4B 契约边界、P1 映射、16 项 unimplemented |
| `docs/testing/BACKEND-EVIDENCE-20261120.md` | 13348 B | 后端 26 包/16 含测试/223 run PASS、逐包表 |
| `frontend/review/TEST-REPORT.md` | 6674 B | 8 个测试文件 69 用例明细 |
| `frontend/e2e/report/cdp/summary.md` | 907 B | CDP 11/11 场景与耗时 |
| `docs/testing/EDGE-CONTRACTS-20261121.md` | 3289 B | 边界契约补充（非 P1 专项） |

## 2. 历史执行记录（报告原文结论，非本次执行）

| 命令 | 环境 | 结果 |
|---|---|---|
| `cd frontend && npm test` | 2026-11-20，Vitest + jsdom | **69/69 PASS**（8 文件） |
| `npm run test:e2e:cdp` | 2026-11-20，CDP runner，API 隔离 19230 | **11/11**，连续 5 次 |
| `go test ./...`（后端） | 2026-11-20，26 包 | **223/223 PASS**（283.33 s） |
| 覆盖率 | `library.tsx` 单文件 | lines 85.58%（仅此文件） |

## 3. 逐 AC 证据

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-CONV-001-01-01 | AC-CONV-001-01 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-21 | pass | 是 | 1 |
| E-AC-CONV-001-02-01 | AC-CONV-001-02 | 前端组件测试 | npm test | frontend/review/TEST-REPORT.md | 2026-11-21 | partial | 是 | 1 |
| E-AC-CONV-002-01-01 | AC-CONV-002-01 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-21 | pass | 是 | 1 |
| E-AC-CONV-002-02-01 | AC-CONV-002-02 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-CONV-001/spec.md | 2026-11-21 | missing | 否 | 0 |
| E-AC-CONV-003-01-01 | AC-CONV-003-01 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-21 | partial | 是 | 1 |
| E-AC-CONV-003-02-01 | AC-CONV-003-02 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-CONV-001/spec.md | 2026-11-21 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

| AC | 证据 | 状态 |
|---|---|---|
| `AC-CONV-001-01` | Sidebar 9/9（渲染+选中）；`TestTreeCreateRenameAndDescendants`；`TestM4SessionTreeAndRenamePersistAcrossRestart`；`TestM14SessionPathMultiLevel`；E2E 01a | 有证据（缺"切换后中栏内容"断言） |
| `AC-CONV-001-02` | Sidebar empty/loading/error/retry + stats 不造假 0 | 部分（主会话不可归档无断言） |
| `AC-CONV-002-01` | Sidebar 重命名/归档恢复；`TestM6ArchiveReadonlyAndUnarchive`；`TestM70*` 3 个 | 有证据 |
| `AC-CONV-002-02` | 无失败注入用例；`rename`/`toggleArchive` 无 catch | **missing** |
| `AC-CONV-003-01` | Sidebar 搜索/无匹配/服务端 ids/搜索中；`TestUI1SessionSearchAndPin` | 部分（前端未走标题搜索） |
| `AC-CONV-003-02` | 无未读/游标测试；实现仅内存态 | **missing** |

## 4. 2026-11-21 只读核对（本次实际动作）

- 读：`frontend/src/api.ts`（27、136 行）、`frontend/src/app.tsx`（96/167/214/239/353-364/400/450/530/535/583/656）、`frontend/src/components/library.tsx`（50–157 Sidebar）、`backend/internal/modules/sessions/http.go`（16-29）、`backend/internal/modules/chat/module.go`（173-213）。
- grep：`backend/internal` 的 `unread|read_cursor|lastRead|last_read|notification` → **0 匹配**；`frontend/src` 仅 app.tsx/tabsync.ts 命中内存态。
- 未执行：任何测试命令（本会话为 spec owner，不跑测试、不改代码）。

## 5. 缺失清单（不得写成通过）

1. `AC-CONV-002-02` 生命周期失败反馈（前端缺陷）。
2. `AC-CONV-003-02` 未读/已读游标（无测试、无后端）。
3. 会话标题搜索前端接线路径。
4. 主会话不可归档的产品 AC 与断言。
5. 真实后端 + E2E 的会话切换内容断言（现只有组件级）。

## 6. 环境与限制

- 前端报告环境：本地 Vitest/jsdom；CDP E2E 使用隔离端口 19230，**不是 8787 生产实例**；CI 未接线。
- 8787 历史实例：build `mwfzyf8u-h9f0d`，PID 42660（2026-11-20 legacy 包记录），本轮未访问。
- 本包结论只能作为"引用报告 + 实查契约"的审计证据，不能作为"2026-11-21 回归通过"。

---

## 2026-11-21 第 2 次证据回写（指针）

本文件是变更包建立时的证据快照。同日测试侧回传结果（前端 115/115、后端 246 个顶层测试、E2E 19/19×2）后的最新用例与覆盖状态，以 [P1 test-plan](../../test/P1-CONV/test-plan.md) 与 [CONV-CLOSURE](../../../docs/product/CONV-CLOSURE.md) 为准；本包结论不因新增测试自动升级。

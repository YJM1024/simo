# P1-CONV 收口总账（CONV-CLOSURE）

状态：**active**（2026-11-21 P1 会话域收口审计与补齐；2026-11-21 第 2 次证据回写：前端 115 / 后端 246 / E2E 19；批次 5 验收依据）
范围：`P1 · 会话与消息` 的 12 个 L3（CONV-001..007、SYNC-001..005）
口径：只按**真实、可复现**的证据判定；本文件不重跑测试、不修改代码/测试/CI/部署；`partial` 一律不写成 `covered`。
关联：产品 spec [`specs/product/P1-CONV/spec.md`](../../specs/product/P1-CONV/spec.md) · 测试计划 [`specs/test/P1-CONV/test-plan.md`](../../specs/test/P1-CONV/test-plan.md) · 功能树 [`TREE.md`](TREE.md) · 追溯 [`TRACEABILITY.md`](TRACEABILITY.md)。

## 1. 结论摘要（2026-11-21）

- 六类产物：**5 个 `CHG-CONV-*` 变更包 × 7 文件 = 35 个文件已建**（`specs/changes/CHG-CONV-001..005/`），逐 PRD 映射见 §2。
- 用例：**4 pass / 9 partial / 2 missing**（15 条）。2026-11-21 第 2 次回写把 `TC-P1-009`（SYNC-002）missing→partial、`TC-P1-E1` partial→pass；`TC-P1-002`、`TC-P1-006`、`TC-P1-007` 仍是 partial（理由见各 PRD 行与 §4.2）。
- 测试规模（2026-11-21 回传）：前端 **115/115 PASS**（typecheck exit 0；`library.tsx` 覆盖率 82.83/83.64/84.14/85.88）、后端 **246 个顶层测试**（`go test ./... -count=1` exit 0，16 包 ok，0 skip）、E2E **19/19 PASS ×2**（CDP + mock 后端 19230，非 Playwright）。
- PRD 覆盖：**0 covered / 11 partial / 1 gap（SYNC-005）** —— 与 `TRACEABILITY.md` §2 一致；**全部 12 个 PRD 均不升级 covered**（新增测试只提升用例证据，六类产物与全 AC 证据仍未齐）。
- 产品 spec：12 条 AC 已按真实交互重写（不再是模板句），并显式声明“非 P1 但页面可见”的边界与 SYNC-005 排除（§5）。
- 已修复：`app.tsx` 祖先 prepend 滚动锚定“二次 apply 写回旧值”（conv-frontend，2026-11-21；对应 CONV-007 / TC-P1-005）。
- 仍有 **13 类跨 PRD 缺口**（§4），其中 3 类需要产品口径（搜索语义、未读口径、右栏会话投影是否建 PRD），1 类需要产品立项（SYNC-005），2 类需要 Lead 安排（证据落 `docs/testing/`、部署验证）。

## 2. 六类产物矩阵（12 PRD）

图例：✅ 齐且有真实证据 · ⚠️ 有文件但未签收/与实现不一致 · ❌ 缺失 · N/A 不适用（已在包内写理由）。

| L3 | 产品 spec | CHANGE | 前端 spec | 后端 spec | COMP spec | 任务卡 | test-plan | 执行证据（2026-11-21） | 覆盖 |
|---|---|---|---|---|---|---|---|---|---|
| `CONV-001` | ✅ | [CHG-CONV-001](../../specs/changes/CHG-CONV-001/spec.md) | ✅ | ✅ | N/A | ✅ | ✅ `TC-P1-001` pass | ✅ 组件+集成+API+E2E 01a/11 | **partial** |
| `CONV-002` | ✅ | [CHG-CONV-001](../../specs/changes/CHG-CONV-001/spec.md) | ✅ | ✅ | N/A | ✅ | ✅ `TC-P1-002` partial | ⚠️ 创建失败已测；重命名/归档失败缺 | **partial** |
| `CONV-003` | ✅ | [CHG-CONV-001](../../specs/changes/CHG-CONV-001/spec.md)（搜索）/ [CHG-CONV-005](../../specs/changes/CHG-CONV-005/spec.md)（未读） | ✅ | ✅ 搜索 / ❌ 未读 | N/A | ✅（未读 blocked） | ✅ `TC-P1-003` partial | 搜索 ✅（E2E 14/15+集成）/ 未读 ❌ | **partial** |
| `CONV-004` | ✅ | [CHG-CONV-002](../../specs/changes/CHG-CONV-002/spec.md) | ✅ | ✅ | ⚠️ `COMP-message-colors` | ✅ | ✅ `TC-P1-004` pass | ✅ 18/18 + API（含 category）+ E2E 01a/02 | **partial** |
| `CONV-007` | ✅ | [CHG-CONV-002](../../specs/changes/CHG-CONV-002/spec.md) | ✅ | ✅ | ⚠️ `COMP-timeline-groups` / `-tip` | ✅ | ✅ `TC-P1-005` pass | ✅ comp+集成+API+E2E 04a–04d；prepend 缺陷已修复 | **partial** |
| `CONV-005` | ✅ | [CHG-CONV-003](../../specs/changes/CHG-CONV-003/spec.md) | ✅ | ✅ | N/A | ✅ | ✅ `TC-P1-006` partial | ⚠️ 重连集成用例已有；幂等/停止缺 | **partial** |
| `CONV-006` | ✅ | [CHG-CONV-003](../../specs/changes/CHG-CONV-003/spec.md) | ✅ | N/A | ⚠️ `COMP-composer-send-mode` | ✅ | ✅ `TC-P1-007` partial | ✅ 10/10 + 新增 5 + E2E 03（后端仅请求校验） | **partial** |
| `SYNC-001` | ✅ | [CHG-CONV-004](../../specs/changes/CHG-CONV-004/spec.md) | ✅ | ✅ | N/A | ✅ | ✅ `TC-P1-008` partial | ⚠️ 后端 WS 4 条 + 前端重连集成；e2e replay 缺 | **partial** |
| `SYNC-002` | ✅ | [CHG-CONV-004](../../specs/changes/CHG-CONV-004/spec.md) | ✅ | N/A | N/A | ✅ | ✅ `TC-P1-009` partial | ⚠️ BroadcastChannel 6 条；未读游标/双 target 缺 | **partial** |
| `SYNC-003` | ✅ | [CHG-CONV-004](../../specs/changes/CHG-CONV-004/spec.md) | ✅ | N/A | ⚠️ `COMP-composer-send-mode` | ✅ | ✅ `TC-P1-010` partial | ⚠️ E2E 13；无跨标签单测/降级测试 | **partial** |
| `SYNC-004` | ✅ | [CHG-CONV-005](../../specs/changes/CHG-CONV-005/spec.md)（blocked） | ✅ 现状 | ❌ 无实现 | N/A | ✅ 全 blocked | ✅ `TC-P1-011` **missing** | ❌ | **partial** |
| `SYNC-005` | ✅ 仅登记 | [CHG-CONV-005](../../specs/changes/CHG-CONV-005/spec.md)（blocked） | ❌ | ❌ | ❌ | ❌ 未拆 | ✅ `TC-P1-012` **missing** | ❌ | **gap** |

### 2.1 六类产物计数

| 产物 | 齐备 | 缺口 |
|---|---|---|
| 产品 spec | 12/12（行为级 AC 已重写） | — |
| 变更包 CHANGE | 12/12 有包（5 个包覆盖） | SYNC-004/005 包 blocked |
| 前端开发 spec | 11/12 | SYNC-005 未拆 |
| 后端开发 spec | 9/12（含 N/A+理由） | SYNC-005 未拆；SYNC-004 无实现 |
| COMP spec | 5 个组件 spec 均未签收 | message-colors / timeline-groups / timeline-tip / composer-send-mode |
| 任务卡 | 11/12（未读全 blocked） | SYNC-005 未拆 |
| test-plan | 12/12 有用例（15 条，锚点齐全） | 2 条 missing（SYNC-004/005） |
| 执行证据 | 9/12（SYNC-002 由零测试升为部分证据） | SYNC-004/005 无实现；CONV-003 未读 |

## 3. 逐 PRD 缺口、owner 与下一步

| L3 | 缺口（事实，2026-11-21 回写后） | owner | 下一步 |
|---|---|---|---|
| `CONV-001` | 主会话不可归档无断言；pin 后端已实现（`TestUI1SessionSearchAndPin`）但 UI 未接线 | 测试 / 前端 | 测试补 1 条主会话归档断言；前端决定 pin 是否纳版 |
| `CONV-002` | `rename`(`app.tsx:530`)/`toggleArchive`(`app.tsx:450`) 无 `try/catch` → 失败静默；前端无删除入口（后端 `TestP1ConvSessionDeleteRequiresConfirmation` 已有契约） | 前端 / 产品 | 前端补 catch + 错误提示（`CHG-CONV-001` TASK-02/03）；产品确认是否要删除会话 |
| `CONV-003` | 搜索语义：产品=标题搜索，UI=当前会话消息搜索（`api.ts:136` 只传 q，后端默认 `main`、不含子会话）；跨会话正文搜索缺失；未读无徽标/持久化/测试 | 产品 / 前端 / 后端 | 产品二选一并写回 AC；未读归 `CHG-CONV-005`（blocked） |
| `CONV-004` | `COMP-message-colors` 仍 approved“未实现”，分类标签已渲染且有 14+5 子例测试；消息纯度无独立 AC | 设计/验收 / 产品 | 组件按实现签收（`CHG-CONV-002`）；产品决定消息纯度是否升 AC |
| `CONV-007` | 时间轴点击目标 ≥44px 无断言；E2E 413/403 走 mock；未部署验证；`COMP-timeline-groups`/`-tip` 未签收；prepend 锚定缺陷**已修复** | 设计/验收 / 测试 / Lead | 组件签收；测试补尺寸断言；Lead 安排部署验证 |
| `CONV-005` | 无 e2e close→open replay；`clientMutationId` 后端 0 处理（幂等不成立）；停止仅断言回调+帧发送，未验证后端真实中断；Lead 仍列“send 失败丢文本”与新增用例标题冲突，未验收 | 后端 / 测试 | 后端实现幂等去重；测试补「断网→重连→since 续传」e2e 与「停止→真实中断」 |
| `CONV-006` | 真实中文 IME 未手测；后端只到 `POST /api/chat` 校验、无 Composer 行为契约；`COMP-composer-send-mode` 未签收 | 测试 / 设计/验收 | 手测 IME；组件签收；后端侧若要证据需补契约测试 |
| `SYNC-001` | 重连/replay 无 e2e；断连 UI（reconnecting）无端到端断言；`since` 日志截断/保留窗口未定义 | 前端 / 后端 / 测试 | 定义保留窗口；补 e2e 重连用例 |
| `SYNC-002` | BroadcastChannel 单测 6 条已有；未读/游标通道无测试（依赖 SYNC-004）；`opId` 未用于去重；无真实双 target 矩阵 | 测试 / 前端 | CDP 双 target 或补 tiebreak 断言；`opId` 去重或删除字段 |
| `SYNC-003` | 跨标签 sendMode 无单测、无降级路径测试（实现已有 BroadcastChannel + storage 双通道） | 测试 | 补 BroadcastChannel/storage 单测与降级断言 |
| `SYNC-004` | 无后端、无持久化、无口径；未读 6 问未答 | 产品 / 后端 | 产品答 6 问（`CHG-CONV-005/spec.md` §3.1）；口径定后再拆后端任务 |
| `SYNC-005` | 完全未实现；无鉴权/通知模型，与 127.0.0.1 无鉴权基线冲突 | 产品 / Lead | 决定是否立项；立项需先有 SYS 鉴权与通知数据模型 |

## 4. 跨 PRD 缺口

### 4.1 缺口清单（13 类）

1. **组件 spec 漂移**：4 个 COMP（message-colors / timeline-groups / timeline-tip / composer-send-mode）文档状态落后于实现，需设计/验收签收。
2. **搜索语义不一致**（CONV-003）：标题搜索 vs 消息搜索，需产品二选一；跨会话正文搜索为真实能力缺口。
3. **未读无后端**（CONV-003 / SYNC-004）：仅前端内存态（`app.tsx:96/214/656`），后端 grep `unread|read_cursor|notification` 0 匹配。
4. **发送幂等缺失**（CONV-005）：前端传 `clientMutationId`，后端 0 处理。
5. **重连 e2e 缺失**（CONV-005 / SYNC-001）：前端已有集成重连用例（`App.conversation.test.tsx::reconnects after the socket closes and reloads missed messages`）与后端 since 测试，但无断网 e2e；退避 800→5000ms 无断言；`since` 保留窗口未定义。
6. **多标签真实矩阵缺失**（SYNC-002/003）：BroadcastChannel 单测已有 6 条，但无双 target/跨进程矩阵；未读游标通道无法验证。
7. **生命周期失败反馈缺陷**（CONV-002）：两处无 `try/catch`；仅“创建失败”已测。
8. **真实性/环境**：E2E 为 mock 后端 19230（非 8787 真实模型）、非 Playwright；无 CI 接线；前端覆盖率仅 `library.tsx`（82.83–85.88），虽较 2026-11-20 提升仍非域级覆盖。
9. **部署验证缺失**（CONV-007 等）：“已签未部署”，生产可用性未证明。
10. **右栏会话投影无 PRD/AC**（F 组）：`RightPanel.test.tsx` 6 条覆盖展示，但 12 个 PRD 中没有“右栏会话投影”；任务/交付物/权限三组属 P2/P4/P8。是否新增 PRD 或并入 CONV-004 AC，需产品决定。
11. **卡片交互（G 组）无 P1 AC**：按 Lead 口径归 M41/`COMP-*` 卡片契约；P1 只要求卡片渲染与只读/失败态正确。
12. **后端契约分歧（已记录未修）**：错误信封不统一、`finished_at` 成功路径缺省、WS 全局事件流不按 session 过滤、`POST /api/chat` 未知 sessionId 不 404、`hasMore` `>=` 边界、`waitForReplyDone` 多轮会早退。
13. **证据归档缺口**：`docs/testing/` 无 2026-11-21 原始报告（前端/后端为 Lead 转达回传，E2E 仅有 `frontend/e2e/report/cdp/` 产物）；375 无会话入口、无 768/1280 断言。

### 4.2 用例状态校正记录（诚实降级/升级）

- 2026-11-21（第 1 次）：`TC-P1-002` pass → **partial**：`AC-CONV-002-02` 要求生命周期失败有可见反馈，实际两处请求无 `try/catch`（`frontend/src/app.tsx:450,530`），组件测试未覆盖该路径。
- 2026-11-21（第 1 次）：`TC-P1-006` pass → **partial**：PRD 名称含“断线重连”，但当时无任何重连用例；且幂等未实现。
- 2026-11-21（第 2 次）：`TC-P1-009` missing → **partial**：`App.tabsync.test.tsx`（4）+ `App.tabsync.channel.test.tsx`（2）覆盖三通道与回声/过期处理；未读游标与双 target 矩阵仍缺。
- 2026-11-21（第 2 次）：`TC-P1-E1` partial → **pass**：`ConversationPanel.test.tsx`（7）+ `App.conversation` 空态/重试 + CDP 08/15 补齐四态。
- 2026-11-21（第 2 次）：`TC-P1-006` 加证据但**不升级**：新增前端重连用例与幂等参数传递，但后端仍 0 处理 `clientMutationId`，停止真实中断未验证。
- 当前口径：**4 pass / 9 partial / 2 missing**；PRD **0 covered / 11 partial / 1 gap**。

## 5. 边界声明（批次 5 要求）

- **SYNC-005 排除**：远程访问与通知中心 `unimplemented`，不计入 P1 验收通过面，也不得被引用为已覆盖。
- **非 P1 但页面可见**（另域验收）：工作台指标（P3/P10-METRIC）、右栏任务投影（P2-TASK-002）、交付物只读（P4-FILE）、权限只读（P8-SET）、卡片交互（M41/COMP）、团队/日程/记忆/智能体/工作台独立页面（P2–P10）。
- **P2–P10 冻结**：本轮不改其 spec、TREE 行、TRACEABILITY 行与代码。
- **右栏**：P1 只覆盖“会话投影（目标/输入/状态）”，任务/交付物/权限三组不属 P1。

## 6. 下一步（按角色，2026-11-21 回写后）

- **产品**：答搜索语义二选一；答未读 6 问；决定主会话归档是否升 AC、消息纯度是否升 AC；决定右栏会话投影是否建 PRD；决定 SYNC-005 是否立项。
- **前端**：补生命周期失败 `try/catch`（`app.tsx:450/530`）；决定 pin/删除入口；补 375 会话入口；确认“send 失败丢文本”缺陷是否已随新用例修复（修复前以缺陷记）。
- **后端**：实现 `clientMutationId` 幂等；定义 `since` 保留窗口；统一错误信封 / `finished_at` / `hasMore` 边界 / 未知 sessionId 404 等契约分歧；未读/游标（口径定后）。
- **设计/验收**：签收 4 个 COMP spec，使之与实现一致。
- **测试**：补断网重连 e2e、双 target 多标签矩阵、跨标签 sendMode 单测与降级、真实 413/403 e2e、768/1280 断言、真实 IME 手测、主会话归档断言。
- **Lead**：把 2026-11-21 前端/后端报告落 `docs/testing/`；安排 CONV-007 部署验证；决定是否把上述缺口拆成任务卡进入下一迭代；批次 5 验收以本文件 §2/§3 为准。

## 7. 证据与核对方法

- 已读：`docs/CONTINUITY.md`、`docs/product/{TREE,TRACEABILITY,SPEC-GAP,ID-SPEC}.md`、`specs/product/P1-CONV/spec.md`、`specs/test/P1-CONV/test-plan.md`、`specs/changes/README.md`、`specs/templates/change-package.md`、`E:\dsh_home\rules\spec-workflow.md`、`docs/process/ROLES.md`。
- 2026-11-21 回写读取的证据：
  - 历史基线：`docs/testing/EVIDENCE-20261120.md`、`docs/testing/BACKEND-EVIDENCE-20261120.md`、`frontend/review/TEST-REPORT.md`、`frontend/e2e/report/cdp/summary.md`。
  - 新证据：`frontend/e2e/report/cdp/audit-P1-CONV.md`（19 场景断言）、`frontend/e2e/report/cdp/results.json`（inScope 19/passed 19/skippedOos 07）、`frontend/e2e/report/cdp/run-20261121-131332.log`；前端 115/115 与后端 246 的原始输出由 conv-frontend / conv-backend 回传（Lead 转达），**尚未落 `docs/testing/`**。
  - 代码事实：`frontend/src/{app.tsx,api.ts,tabsync.ts,components/library.tsx}`、新增 6 个前端测试文件、后端新增 5 个测试文件与既有 P1 测试函数名、`backend/internal` 路由表与 `unread|read_cursor|notification` grep。
- **本轮未执行**：未跑测试、未起服务、未改代码/测试/CI/部署；所有 PASS 数字均引自上述回传/报告，未在本次会话复跑。
- 复现：`cd frontend && npm test`、`cd frontend && npx tsc --noEmit`、`pnpm test:e2e:cdp`、后端 `go test ./... -count=1`；门禁 `node scripts/check-sdd.mjs`、`node scripts/check-trace.mjs`。

## 8. 维护

- 每次新增/签收 P1 功能，同步更新本文件 §2 矩阵、`specs/test/P1-CONV/test-plan.md`、`TREE.md` P1 行、`TRACEABILITY.md` §3 行。
- 覆盖升级规则：**六类产物 + 全 AC 证据** 同时齐才可写 `covered`；仅有一侧或部分用例一律 `partial`。
- 本文件为 P1 域内总账，非 P2–P10 的收口依据。

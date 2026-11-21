# CHG-CONV-001 · 会话管理收口：提案

状态：**partial**（2026-11-21；文档收口，不改代码）
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003
Domains: `CONV`
Owner：产品（AC 口径）/ 前端（Sidebar、app.tsx）/ 后端（sessions 模块）；协调：Lead

## 1. 为什么做

P1-CONV 的 12 个 PRD 在 `docs/product/TRACEABILITY.md` 中长期是 **0 covered / 11 partial / 1 gap**，但缺口描述是"域级执行证据仍为 missing；测试计划骨架已建、未运行"这类笼统说法。2026-11-20 已实际执行前端 69/69、CDP E2E 11/11（5 次）、后端 223/223，证据文件在 `docs/testing/EVIDENCE-20261120.md` 与 `docs/testing/BACKEND-EVIDENCE-20261120.md`，却没有任何变更包把"哪个 PRD 的哪条 AC 由哪个用例证明"写清楚。本包把会话管理三条 PRD 的实现面、契约、任务、测试与证据收口成可审计的七件套，**不新增能力**。

## 2. 做什么

- 把 CONV-001（会话树与主会话）、CONV-002（生命周期）、CONV-003（搜索与未读）的现有实现写成前后端契约（`frontend.md` / `backend.md`）。
- 给出逐 AC 的证据映射与缺口列表（`test-plan.md` / `evidence.md`）。
- 拆分可派发的任务卡（`tasks.md`），每张卡带 owner/scope/AC/证据四要素。

## 3. 不做什么

- 不改任何代码、测试、部署（`.github/`、`backend/`、`frontend/` 本轮零写入）。
- 不新增 pin 会话的 UI、不做会话标题搜索接线、不做未读持久化——这些是后续任务卡，不在本包内实现。
- 不把 `partial` 写成 `covered`；本包不改变任何 PRD 的实现状态。

## 4. 影响与风险

- 影响面：仅 `specs/`、`docs/product/` 文档；运行时代码零改动。
- 风险：文档若与实现漂移会误导后续实现者。缓解：所有契约行号/路由/测试函数名均来自 2026-11-21 实查，并标注"实查基线"。
- 替代方案：不建包，直接改产品 spec 的"当前剩余缺口"。否决原因：六类产物要求变更包承载开发 spec 与任务卡，只改产品 spec 无法满足 G1/G3/G5 门禁。

## 5. 验收口径

见 `spec.md` §5 的 A 编号；证据缺失项一律写 `missing`，不得以"接口存在"代替用户路径验收。

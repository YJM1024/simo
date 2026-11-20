# TASKS · CHG-LEGACY-P3-WORK

本包为 docs-only 历史归档；任务只覆盖审计、证据映射与文档，不包含新功能实现。

## T1 盘点现有实现

- Owner：product + frontend + backend
- Scope：只读 工作台 app.tsx、MetricsDashboard/WorkbenchChart、E2E 01a/01b/07 与既有产品 spec/test-plan
- AC：列出真实文件、API、组件与状态；区分已实现/部分/未实现。
- Evidence：[backend.md](backend.md)、[frontend.md](frontend.md)、[spec.md](spec.md)
- 状态：done

## T2 证据映射

- Owner：product + test
- Scope：只读 `docs/testing/EVIDENCE-20261120.md`、`docs/testing/BACKEND-EVIDENCE-20261120.md`、`frontend/review/TEST-REPORT.md`、`frontend/e2e/report/cdp/summary.md` 与 [域 test-plan](../../test/P3-WORK/test-plan.md)
- AC：每个 PRD 有证据或明确 `missing`；不编造测试名，不把全量测试通过写成 AC 通过。
- Evidence：[test-plan.md](test-plan.md)、[evidence.md](evidence.md)
- 状态：done

## T3 执行证据登记

- Owner：test
- Scope：前端 `cd frontend && npm test`（69/69）、`npm run test:e2e:cdp`（11/11，5 次）、后端 `cd backend && go test ./... -count=1 -json`（223/223）
- AC：记录命令、时间、文件/日志路径与限制；未执行项保持 missing。
- Evidence：`docs/testing/EVIDENCE-20261120.md`、`docs/testing/BACKEND-EVIDENCE-20261120.md`
- 状态：done（仅登记已有结果，未重跑）

## T4 缺口登记

- Owner：product
- Scope：[spec.md](spec.md)、[evidence.md](evidence.md)
- AC：未实现 PRD、未验证 AC、未覆盖测试逐项列出；不把 `partial` 写成完成。
- Evidence：`spec.md` §6、`evidence.md` §5
- 状态：done

## T5 验收交接

- Owner：product → 验收 Agent
- Scope：本包七件套与已有证据
- AC：验收 Agent 独立核对 PRD/测试/链接/状态；实现者不自签产品完成。
- Evidence：交接消息 + 本包文件清单
- 状态：pending（等待独立验收）

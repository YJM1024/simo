# TASKS · CHG-LEGACY-P4-FILE

本包为 docs-only 历史归档；任务只覆盖审计、证据映射与文档，不包含新功能实现。

## T1 盘点现有实现

- Owner：product + frontend + backend
- Scope：只读 tasks/chat 文件与交付物、RightPanel、E2E 07 与既有产品 spec/test-plan
- AC：列出真实文件、API、组件与状态；区分已实现/部分/未实现。
- Evidence：[backend.md](backend.md)、[frontend.md](frontend.md)、[spec.md](spec.md)
- 状态：done

## T2 证据映射

- Owner：product + test
- Scope：只读 `docs/testing/EVIDENCE-20261120.md`、`docs/testing/BACKEND-EVIDENCE-20261120.md`、`frontend/review/TEST-REPORT.md`、`frontend/e2e/report/cdp/summary.md` 与 [域 test-plan](../../test/P4-FILE/test-plan.md)
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

## 任务表

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| T1 | 盘点现有实现 | product + frontend + backend | 只读 tasks/chat 文件与交付物、RightPanel、E2E 07 与既有产品 spec/test-plan | 无 | 列出真实文件、API、组件与状态；区分已实现/部分/未实现。 | [backend.md](backend.md)、[frontend.md](frontend.md)、[spec.md](spec.md) | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T2 | 证据映射 | product + test | 只读 `docs/testing/EVIDENCE-20261120.md`、`docs/testing/BACKEND-EVIDENCE-20261120.md`、`frontend/review/TEST-REPORT.md`、`frontend/e2e/report/cdp/summary.md` 与 [域 test-plan](../../test/P4-FILE/test-plan.md) | 无 | 每个 PRD 有证据或明确 `missing`；不编造测试名，不把全量测试通过写成 AC 通过。 | [test-plan.md](test-plan.md)、[evidence.md](evidence.md) | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T3 | 执行证据登记 | test | 前端 `cd frontend && npm test`（69/69）、`npm run test:e2e:cdp`（11/11，5 次）、后端 `cd backend && go test ./... -count=1 -json`（223/223） | 无 | 记录命令、时间、文件/日志路径与限制；未执行项保持 missing。 | `docs/testing/EVIDENCE-20261120.md`、`docs/testing/BACKEND-EVIDENCE-20261120.md` | done（仅登记已有结果，未重跑） | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T4 | 缺口登记 | product | [spec.md](spec.md)、[evidence.md](evidence.md) | 无 | 未实现 PRD、未验证 AC、未覆盖测试逐项列出；不把 `partial` 写成完成。 | `spec.md` §6、`evidence.md` §5 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T5 | 验收交接 | product → 验收 Agent | 本包七件套与已有证据 | 无 | 验收 Agent 独立核对 PRD/测试/链接/状态；实现者不自签产品完成。 | 交接消息 + 本包文件清单 | pending（等待独立验收） | 验收 Agent | 不改实现、不删文件、不编造证据 |

> 本表由既有 T1–T5 任务卡转录，字段与卡片正文一致；原卡片保留在上文，供逐条核对。

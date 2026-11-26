# TASKS · CHG-LEGACY-P6-TEAM

本包为 docs-only 历史归档，不包含新的团队功能实现。

## T1 团队后端能力盘点

- Owner：backend
- Scope：只读 `backend/internal/modules/chat/team.go`、`actions.go`、`migrations.go`
- AC：列出只读路由、内部 action、v13/v14 表；明确 action 不是用户 CRUD。
- Evidence：`backend.md` 第 2–3 节。
- 状态：done

## T2 内部消息隔离核验

- Owner：backend
- Scope：`m24_test.go`、`m25_test.go`、内部 turn 代码
- AC：确认内部消息不进入主窗口；不把“团队消息表存在”当作权限隔离完成。
- Evidence：`TestM24TeamV1InternalRouting`、`TestM25TeamV2TemplateAndTrigger`。
- 状态：done

## T3 模板/角色/触发器核验

- Owner：backend
- Scope：`m25_test.go` + team 模板/触发器代码
- AC：记录继承、角色、幂等 fire、交付物、事件；失败重试/通知缺失须登记。
- Evidence：`TestM25TeamV2TemplateAndTrigger`、`TestM31TeamEventsBroadcastOnWS`。
- 状态：done

## T4 全量测试与证据

- Owner：backend
- Scope：`backend/` 下 `go test ./... -count=1 -json`，环境变量到 `../.tmp`
- AC：命令、包数、测试数、失败数、耗时完整；失败则不得 PASS。
- Evidence：`docs/testing/BACKEND-EVIDENCE-20261120.md`。
- 状态：done（26 包 / 223 / 0 fail / 283.33s）

## T5 TEAM-004/TEAM-006 缺口登记

- Owner：backend
- Scope：`spec.md`、`evidence.md`
- AC：明确无产品路径，不写成 covered；给出后续实现建议。
- Evidence：`spec.md` R4/R6、`evidence.md` 未验证项。
- 状态：done

## T6 验收交接

- Owner：backend → 验收 Agent
- Scope：本包文档 + 全量证据
- AC：验收 Agent 独立复核路由、测试名与状态；实现者不自签。
- Evidence：交接消息 + 文件清单。
- 状态：pending

## 任务表

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| T1 | 团队后端能力盘点 | backend | 只读 `backend/internal/modules/chat/team.go`、`actions.go`、`migrations.go` | 无 | 列出只读路由、内部 action、v13/v14 表；明确 action 不是用户 CRUD。 | `backend.md` 第 2–3 节。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T2 | 内部消息隔离核验 | backend | `m24_test.go`、`m25_test.go`、内部 turn 代码 | 无 | 确认内部消息不进入主窗口；不把“团队消息表存在”当作权限隔离完成。 | `TestM24TeamV1InternalRouting`、`TestM25TeamV2TemplateAndTrigger`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T3 | 模板/角色/触发器核验 | backend | `m25_test.go` + team 模板/触发器代码 | 无 | 记录继承、角色、幂等 fire、交付物、事件；失败重试/通知缺失须登记。 | `TestM25TeamV2TemplateAndTrigger`、`TestM31TeamEventsBroadcastOnWS`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T4 | 全量测试与证据 | backend | `backend/` 下 `go test ./... -count=1 -json`，环境变量到 `../.tmp` | 无 | 命令、包数、测试数、失败数、耗时完整；失败则不得 PASS。 | `docs/testing/BACKEND-EVIDENCE-20261120.md`。 | done（26 包 / 223 / 0 fail / 283.33s） | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T5 | TEAM-004/TEAM-006 缺口登记 | backend | `spec.md`、`evidence.md` | 无 | 明确无产品路径，不写成 covered；给出后续实现建议。 | `spec.md` R4/R6、`evidence.md` 未验证项。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T6 | 验收交接 | backend → 验收 Agent | 本包文档 + 全量证据 | 无 | 验收 Agent 独立复核路由、测试名与状态；实现者不自签。 | 交接消息 + 文件清单。 | pending | 验收 Agent | 不改实现、不删文件、不编造证据 |

> 本表由既有 T1–T6 任务卡转录，字段与卡片正文一致；原卡片保留在上文，供逐条核对。

# BACKEND · CHG-LEGACY-P6-TEAM

- Scope：`backend/internal/modules/chat/team.go`、`actions.go`、`migrations.go` 的 team 部分
- 状态：历史归档，无新增实现

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/chat/team.go` | 团队只读 HTTP、内部消息、模板、触发器、交付物、owner |
| `backend/internal/modules/chat/actions.go` | `team.*` action 分发 |
| `backend/internal/modules/chat/migrations.go` | v13 team v1、v14 templates/roles |
| `backend/internal/modules/chat/loop.go` | 内部 turn、主窗口隔离 |
| `backend/internal/core/eventlog` | team 内部事件类型注册与 WS 广播 |

## 2. API（实际注册）

| 方法/路径 | 行为 | 测试 |
|---|---|---|
| `GET /api/sessions/{id}/team` | 按 lead 或成员解析团队，返回 `{ok,team,members}`；无团队时 `team:null`、空数组 | `TestM23TeamV0View`、`TestM24TeamV1InternalRouting` |
| `GET /api/teams/{id}` | 团队详情 + 模板 + 成员 + deliverables + triggers；未知 404 `team_not_found` | `TestM25TeamV2TemplateAndTrigger` |
| `GET /api/teams/{id}/members` | 成员列表 + total | `TestM23TeamV0View` |
| `GET /api/teams/{id}/messages` | 内部消息，created_at asc，最多 200 | `TestM24TeamV1InternalRouting` |
| `GET /api/teams/{id}/deliverables` | 团队交付物，最多 100 | `TestM25TeamV2TemplateAndTrigger` |
| `GET /api/teams/{id}/triggers` | 团队触发器，最多 100 | `TestM25TeamV2TemplateAndTrigger` |

内部 action（非普通用户 CRUD）：`team.get`、`team.create`、`team.template.upsert`、`team.template.get`、`team.owner.set`、`team.trigger.create`、`team.trigger.fire`、`team.deliverables`、`team.triggers`、`team.message.send`、`team.messages`。

## 3. 数据与迁移

chat 迁移 v13（`M24 team v1`）：

- `teams(id,name,lead_session_id,status,created_at,updated_at)`
- `team_members(id,team_id,session_id UNIQUE,role_key,role_type,agent_id,status,created_at)`
- `team_messages(id,team_id,from_session_id,to_session_id,kind,payload_json,status,correlation_id,idempotency_key UNIQUE,created_at,delivered_at)`
- `team_triggers(id,team_id,from_member_id,to_member_id,on_event,condition_json,action_json,status,retry_count,max_retries,idempotency_key UNIQUE,created_at,updated_at)`
- `team_deliverables(id,team_id,from_member_id,to_member_id,kind,artifact_id,ref_path,summary,status,created_at)`

chat 迁移 v14（`M25 team v2 templates/triggers`）：

- `team_templates(id,name,version,inherits_from,base_persona,status,created_at,updated_at)`
- `team_template_roles(... role_key,title,role_type,agent_id,persona_override,tools_json,model,responsibilities,inputs_json,outputs_json,inherits_from,order_index, UNIQUE(template_id,role_key))`
- `team_member_roles(team_id,member_id,template_id,role_key,persona_version, PRIMARY KEY(team_id,member_id))`
- `teams.template_id`、`teams.template_version`

## 4. 行为细节

- `teamForSession` 先按 `teams.lead_session_id`，再按 `team_members.session_id` 查找；成员名优先会话标题，否则从 `agent:<id>` 解析 agent 名。
- `createTeam`：每个成员创建一个子 session，设置 owner，写 `team_members`，发内部事件；是内部路径，不是用户 HTTP API。
- `sendTeamMessage`：校验参数非空、from/to 在同一团队（`COUNT(DISTINCT session_id) ... IN (?,?) < 2` 报错 `内部消息仅允许团队成员之间发送`）；可选 idempotencyKey；写 `team_messages` 状态 delivered；重复不重复广播。
- 模板：`upsertTeamTemplate` 版本递增；继承必须存在，自继承报 `模板继承环`，深度 >3 报 `模板继承超过 3 层`。
- 触发器：`createTeamTrigger` 幂等；`fireTeamTrigger` 已 fired 直接返回；最多重试（默认 2）；写 `team_deliverables`，在目标会话启动内部 turn；失败状态 failed。
- 内部消息隔离：内部 turn 不写用户消息、不发 `message.created`；主窗口断言由 M24 覆盖。团队消息另存 `team_messages`，不进入 `messages` 表。

## 5. 错误与边界

- `GET /api/teams/{id}` 未知 → 404 `team_not_found`。
- 读取 team 失败 → 500 `读取团队失败`；读取内部消息失败 → 500 `读取内部消息失败`。
- 内部 action 参数错误返回 action 错误（非统一 400 路由契约）。
- 无团队时 `GET /api/sessions/{id}/team` 200，不是 404。
- 团队消息读取没有 HTTP 鉴权矩阵；不能证明普通会话无法越权读取。
- TEAM-004 只读投影/会话创建、TEAM-006 并行/看板没有完整实现；当前 view 不能替代产品验收。

## 6. 测试映射

| 测试 | 文件 | 覆盖 |
|---|---|---|
| `TestM23TeamV0View` | `backend/cmd/simo/m23_test.go` | `/api/team` 视图、成员、并发上限、记忆实体 |
| `TestM24TeamV1InternalRouting` | `backend/cmd/simo/m24_test.go` | 团队解析、内部消息、主窗口隔离、成员会话 |
| `TestM25TeamV2TemplateAndTrigger` | `backend/cmd/simo/m25_test.go` | 模板/角色、创建团队、owner、触发器幂等、交付物、事件 |
| `TestM31TeamEventsBroadcastOnWS` | `backend/cmd/simo/m31_test.go` | 团队事件 WS 广播 |
| `TestTeamInternalEventTypesRegistered` | `backend/internal/core/eventlog/*_test.go` | 团队内部事件类型注册 |

## 7. 未验证 / 风险

- 无团队 UI；无前端 AC 验收。
- 无多成员并发、重复投递、成员退出、lead 转移测试。
- 无 HTTP 越权/鉴权测试。
- 无模板继承真实多级成功用例，仅错误边界和基础角色。
- 无触发器失败重试/超时/通知测试。
- TEAM-004/TEAM-006 无法端到端验收。

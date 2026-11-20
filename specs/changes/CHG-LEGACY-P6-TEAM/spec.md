# SPEC · CHG-LEGACY-P6-TEAM

Implements: PRD-TEAM-001, PRD-TEAM-002, PRD-TEAM-003, PRD-TEAM-004, PRD-TEAM-005, PRD-TEAM-006

- 状态：historical / partial（归档，不代表产品完成）
- Owner：backend
- 日期：2026-11-20
- 产品依据：`specs/product/P6-TEAM/spec.md`

## 1. 目标

为 P6 每个 PRD 建立后端事实基线，重点区分“内部数据结构/action 已存在”和“用户可用的团队能力已完成”。

## 2. 需求与状态

| ID | 需求 | 后端事实 | 状态 | 主要证据 |
|---|---|---|---|---|
| R1 | TEAM-001 roster/model | `/api/team`、`/api/teams/{id}`、members 返回 agentId/role/status/name；团队/成员表存在 | partial | `TestM23TeamV0View`、`TestM24TeamV1InternalRouting` |
| R2 | TEAM-002 member=subsession+owner | `createTeam` 为成员创建子 session，设置 owner，写 `team_members` | partial | `TestM24TeamV1InternalRouting`、`TestM25TeamV2TemplateAndTrigger` |
| R3 | TEAM-003 template/roles/triggers | action `team.template.upsert`、`team.create`、`team.trigger.*`；模板继承/角色/触发器/交付物 | partial | `TestM25TeamV2TemplateAndTrigger` |
| R4 | TEAM-004 read-only projection/conversation creation | 有只读 view 端点，但没有完整产品投影/版本/会话创建 API 与验收 | unimplemented | 无专用测试；不能把 view 当完成 |
| R5 | TEAM-005 internal message isolation | `team_messages` 独立表、内部 turn、主窗口不显示内部文本 | partial | `TestM24TeamV1InternalRouting`、`TestM25TeamV2TemplateAndTrigger`、eventlog 测试 |
| R6 | TEAM-006 subagent parallel/team board | 无并行子 agent 调度、无团队看板端点/UI；只有 concurrency 上限约束 | unimplemented | `TestM23TeamV0View` 仅证明上限，不证明并行/看板 |

## 3. 验收标准（本包）

- **AC-P6-01**：`GET /api/sessions/{id}/team` 对 lead 和 member 都能解析团队；无团队返回 `team:null`、`members:[]`，不 500。证据：`TestM23TeamV0View`、`TestM24TeamV1InternalRouting`。
- **AC-P6-02**：团队成员有独立子 session 和 owner；成员列表含 agentId/name/status。证据：`TestM24TeamV1InternalRouting`、`TestM25TeamV2TemplateAndTrigger`。
- **AC-P6-03**：内部团队消息不进入主会话用户可见消息。证据：`TestM24TeamV1InternalRouting` 断言主窗口不含 `请确认交付物标准`。
- **AC-P6-04**：模板继承合法、自继承/深度超限拒绝；模板创建成员带角色。证据：`TestM25TeamV2TemplateAndTrigger`。
- **AC-P6-05**：触发器有幂等键，重复 fire 不重复交付。证据：`TestM25TeamV2TemplateAndTrigger`。
- **AC-P6-06**：团队事件可通过 WS 广播。证据：`TestM31TeamEventsBroadcastOnWS`、`TestTeamInternalEventTypesRegistered`。
- **AC-P6-07**：TEAM-004/TEAM-006 无产品可验收路径，记 `unimplemented`；不得判 PASS。

## 4. 状态、错误与边界

- 无团队时 `handleSessionTeam` 返回 200，`team` 为 null，`members=[]`。
- 未知团队 `GET /api/teams/{id}` 返回 404 `team_not_found` / `团队不存在`。
- 内部消息校验：teamId/from/to/content 非空；from/to 必须属于同一团队，否则错误 `内部消息仅允许团队成员之间发送`。
- 模板自继承 → `模板继承环`；继承深度 >3 → `模板继承超过 3 层`。
- 团队创建、模板、触发器、owner 设置目前只通过内部 action 暴露，不是普通用户 HTTP CRUD。
- 团队消息表与主消息表分离；但 `team_messages` 通过 `/api/teams/{id}/messages` 可读，缺少 HTTP 鉴权矩阵。
- 事件：`team.template.applied`、`team.created`、`team.member.added`、`team.owner.changed`、`team.trigger.fired` 等注册在 eventlog。
- TEAM-004 的“只读投影”在代码里有基础 view，但与产品要求（版本化、可订阅、会话创建）不完整，状态保持 unimplemented。

## 5. 接口与数据（归档）

只读路由：`GET /api/sessions/{id}/team`、`GET /api/teams/{id}`、`/members`、`/messages`（上限 200）、`/deliverables`、`/triggers`。

内部 action：`team.get`、`team.create`、`team.template.upsert`、`team.template.get`、`team.owner.set`、`team.trigger.create`、`team.trigger.fire`、`team.deliverables`、`team.triggers`、`team.message.send`、`team.messages`。

数据（chat 迁移 v13/v14）：`teams`、`team_members`、`team_messages`、`team_triggers`、`team_deliverables`、`team_templates`、`team_template_roles`、`team_member_roles`；`teams.template_id/template_version`。精确字段见 `backend.md`。

## 6. 待确认

- TEAM-004 是否仍要求“只读团队投影 + 从团队创建会话”作为独立用户入口？
- 团队内部消息的读取权限边界：是否只允许 lead/成员，是否禁止普通会话读取？
- TEAM-006 的并行子 agent 与看板是否仍为 P2；若需要，是否由任务/工作流域承接？

## 7. 链接

- [proposal.md](proposal.md) · [backend.md](backend.md) · [frontend.md](frontend.md) · [tasks.md](tasks.md) · [test-plan.md](test-plan.md) · [evidence.md](evidence.md)
- 全量证据：[`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)

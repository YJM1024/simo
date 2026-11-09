# M21–M26 后端实现摘要（RELEASE 素材）

> 范围：`agentd` 后端。构建基线：`simo.exe`（2026-11-08 05:07:16，Windows amd64）。
> 用户实例 `simo-live.exe` / 8787 未由本实现改动。

## 1. 迁移版本

| 版本 | 模块/名称 | 内容 |
|---|---|---|
| memory **v2** | M21 记忆模型 v0.3 | `entities`、`entity_relations`、`memories`、`memory_item_history`、`memory_entities`、`entity_facts`、`memory_attribution`、`conflicts`、`canonical_units`、`raw_messages`、`raw_events`、`agent_memory`、`pyramid_nodes`、`pyramid_sources`、`maintenance_jobs`；索引/回填/双写 |
| memory **v3** | M22 召回派生层 | `recall_aliases`、`recall_entity_fts`、`recall_entity_facts`、`recall_edges`、`recall_meta`、`recall_relation_registry`、`memory_item_entities`；`entities.entity_class` |
| memory **v4** | 品牌归一 | `ent-agent-simo` 名称统一为「司墨」 |
| chat **v13** | M24 团队 V1 | `teams`、`team_members`、`team_messages`、`team_triggers`、`team_deliverables` |
| chat **v14** | M25 团队 V2 | `team_templates`、`team_template_roles`、`team_member_roles`；`teams.template_id/template_version` |
| chat **v15** | M26 视图 Schema | `view_pages`、`view_versions`（append-only，软删保留历史） |

M23 并发/成员视图复用已有 `tasks`/`workflows`（任务执行者列 v5 已有），无新增迁移。
M26 新增 action 目录：`ui.view.rollback`；`ui.set_view/ui.get_view/ui.delete_view` 由占位改为真实实现。

## 2. API / 动作增量

### M21 记忆 v0.3
- `GET /api/memory/items/{id}`
- `GET /api/memory/entities`、`/entities/{id}`、`/entities/{id}/timeline`
- `GET /api/memory/graph`
- `GET /api/memory/pyramid`
- `GET /api/memory/canonical/{id}`
- `GET /api/memory/agents`、`/agents/{id}/memory`
- 旧 `GET /api/memory/items|scopes|conflicts` 兼容；`POST/PUT/PATCH/DELETE /api/memory*` 仍 404。
- 双写：`memory_items`（真相兼容）+ `memories`（v3）；读开关 `AGENTD_MEMORY_V3=0|false|off|v2` 关闭 v3 enrich。
- 冲突：同 `factKey` 不同值 → disputed/conflict；M3 老 `status=disputed` 仍返回成对条目。

### M22 召回 R1
- `GET|POST /api/debug/recall`（loopback；`query/sessionId/agentId/trace`）
- `POST /api/debug/recall/seed`
- `POST /api/debug/recall/rebuild`（按 entities/entity_relations 重建 aliases/FTS/edges，幂等）
- 返回 `entities/items(paths include sourceItem/sourceVersion/cite)/trace/budgetReport/warnings`；无向量标 `no_semantic_path`。

### M23 团队 V0
- `GET /api/team`、`GET /api/workflows/{id}/members`
- 任务/工作流响应 `stateReason`；任务 `executorAgentId`（默认 `agent:task-npc`）
- 并发：`AGENTD_MAX_CONCURRENCY`、`AGENTD_WORKFLOW_CONCURRENCY`（默认 3，FIFO）；`AGENTD_TASK_EXECUTOR=agent:simo` 可换执行者。

### M24 团队 V1
- `GET /api/sessions/{id}/team`
- `GET /api/teams/{id}`、`/members`、`/messages`
- 内部消息不进用户主窗口；Lead 汇总；消息带来源/时间/会话；团队事件落审计日志。
- 成员=下级会话；用户可直接对成员 sessionId 发 chat。

### M25 团队 V2
- 动作：`team.template.upsert/get`、`team.create`（`templateId`）、`team.owner.set`、
  `team.trigger.create/fire`、`team.deliverables`、`team.triggers`
- 模板继承合并（≤3 层，同名覆盖）；generic 角色复用稳定 agent，template 角色独立 agent id；
- `GET /api/teams/{id}` 增 template/roles/deliverables/triggers；负责人切换写 `team.owner.changed`。

### M26 视图 Schema
- `POST /api/actions/ui.set_view`：`mode=create|replace|patch|rollback`，`baseVersion` 乐观并发（409），`reason` 必填；
- `POST /api/actions/ui.get_view`、`ui.delete_view`、`ui.view.rollback`；
- `GET /api/views?sessionId=`、`/api/views/{id}`、`/versions`、`/versions/{v}`、`/render-state`；
- patch 仅允许 `set_page_props/replace_blocks/set_block_props/set_block_actions/add_block/remove_block`；
- 失败不产生版本、回滚=新版本指向旧 schema、删除=软删；
- 校验：会话归属、13 块白名单、≤200 块/≤256KB、只读数据绑定、动作存在/块白名单、`equivalence.chatPrompt` + `actionSequence` 一致、禁 HTML/JS/on*/style/iframe/`data:`/外链图片。

## 3. 事件增量

- M21/M22：记忆/召回以只读 API 与既有事件为主；无新增用户可见事件。
- M24/M25 团队内部事件（落 `events`，不广播用户 WS）：
  `team.created`、`team.archived`、`team.template.applied`、`team.member.added`、
  `team.member.status_changed`、`team.owner.changed`、`team.message.queued/delivered/failed`、
  `team.trigger.fired/failed`、`team.deliverable.ready`。
  `TestTeamInternalEventTypesRegistered` 覆盖全部 12 类型；`TestM25TeamV2TemplateAndTrigger`
  断言实际写入 `team.template.applied/created/member.added/owner.changed/trigger.fired`。
- M26 视图事件（广播 WS）：
  `view.updated`（pageId/version/baseVersion/mode/reason/hash）、`view.render`（打开视图）、
  `view.binding.failed`、`view.renderer.error`（后两者为渲染器/前端契约预留）。

## 4. 测试证据

| 范围 | 证据 | 结果 |
|---|---|---|
| M20 基线 | 88 mock + 7 real-smoke | 88/88、real 7/7 |
| M21 记忆 | eval cases `memory-entities/types/canonical/v3-conflict/pyramid` + `memory-agent/hidden`；`TestMemoryV3FactConflictAndCanonical`、`TestM21MemoryV3Pipeline` | 7/7 case；Go 通过；M21 API 断言 pyramid nodes 非空 |
| M22 召回 | eval `recall-r1/fusion/degrade/hidden/rebuild`；`TestM22RecallR1` | 5/5 case；Go 通过；rebuild 幂等 |
| M23 团队 V0 | `team-v0-view`、`team-hidden`；`TestM23TeamV0View` | 23/23 断言；并发=1 时 running≤1、排队有 stateReason |
| M24 团队 V1 | `team-v1-enter/members/messages/persist`；`TestM24TeamV1InternalRouting` | 4/4 case；内部消息不进主窗口 |
| M25 团队 V2 | eval `team-v2-template/instance/owner/trigger/hidden`；`TestM25TeamV2TemplateAndTrigger` | 5/5 case、49/49 断言；模板继承/generic vs template/负责人/触发幂等 + `team.%` 事件≥3 |
| M26 视图 | `TestM26ViewSchemaLifecycle`、`TestM26ViewValidation` | 创建/409/patch/rollback 逐字一致/软删；非法块/无 chatPrompt/HTML 拒绝 |
| 回归 | M21/M22/M24 关键 case 13/13、team-v1 4/4、M25 5/5；M22–M26 Go 测试 | 通过 |

## 5. 边界/已知限制

- M21 canonical 以同步写路径为主；异步 canonical 作业、完整 agent 记忆提炼、L1–L4 金字塔压缩仍是后续增强。
- M22 R1 通过 loopback debug 端点/内部服务可用；chat 自动召回仍由 22 检索层后续接线（R2 向量/2 跳为开关占位）。
- M23 `stateReason` 为 API 派生展示，不单独持久化。
- M24/M25 团队创建/模板/触发以动作层入口为主；对话自然语言创建仍由 Agent 动作调用完成。
- M26 前端渲染器由 `web/` 并行实现；后端响应同时提供 `schema/view` 与 `views/pages/items` 兼容字段。

# M41 实现契约：交互卡片（完整能力）

> **状态**：实现契约 v0.2（2026-11-09，按完整能力修正；不是 MVP）。**只写设计，不写代码。**
> **定位**：卡片是**消息内的交互视图**，不是第二数据源；渲染、动作、权限、审批仍遵守「视图 = 事件投影 + 动作层」。
> **前置**：M24/M26 视图 Schema、M20 动作层、M18 SpecCore、M40 视觉组件层。
> **参考**：[`m24-view-contract.md`](m24-view-contract.md)（10 步校验/动作白名单）、[`m20-contract.md`](m20-contract.md)（动作目录/风险/审批/幂等）、[`visual-language.md`](visual-language.md)。

---

## 1. 目标与非目标

### 1.1 目标（完整能力）

1. **可持久化、可版本化的消息卡片**：`chat.send_card` 生成，挂在某条 agent 消息上；一条消息可挂多张卡。
2. **两种完整动作路由**：`route=agent`（转成用户动作消息 + turn）与 `route=action`（直接走动作层），二者都有完整权限、审批、幂等、状态与恢复语义。
3. **状态机**：`active → submitted / disabled / expired`，并支持 `superseded/archived/invalid` 与版本冲突；`submitted` 有独立 submission 状态。
4. **版本与 409**：PATCH 生成新版本；`baseVersion` 乐观锁；版本不可变；冲突 409 不落库。
5. **WS**：`card.updated`、`card.action.updated`、`card.expired`、`card.disabled` 等增量；按会话/消息隔离。
6. **重启持久**：卡片、版本、submission、action invocation 全部落库；重启后可恢复/对账，不重复执行。
7. **校验**：复用视图 10 步 + 卡片特有的 `fallbackText`、`route`、动作白名单、会话/版本/权限校验。
8. **安全边界**：禁 HTML/脚本/内联样式/事件属性；R3+ 动作必须审批；无权限提权/跨会话。
9. **与视图 Schema 的关系**：卡片复用视图块 registry/渲染器/校验思想，但**独立消息级存储与版本链**，不复用 `view_pages`。

### 1.2 非目标

- 不做自由 HTML/JSX/可执行 UI；不做用户手写 schema；
- 不做跨会话/团队共享卡片（会话内卡片；跨会话视图 P1）；
- 不改变 M20 动作目录/风险模型；卡片只是动作调用方；
- 不引入“卡片消息”新消息类型；卡片附在普通 agent 消息上。

---

## 2. Card Schema

### 2.1 顶层（服务端返回完整结构）

```json
{
  "schemaVersion": 1,
  "cardId": "card-01j...",
  "version": 3,
  "sessionId": "s-main",
  "messageId": "m-...",
  "position": 0,
  "status": "active",
  "title": "任务确认",
  "blocks": [],
  "dataBindings": [],
  "actions": [],
  "style": {"variant": "default", "density": "default"},
  "equivalence": {"chatPrompt": "确认后执行任务 T", "actionMap": []},
  "fallbackText": "任务 T 等待确认；可回复“确认执行”或“取消”。",
  "state": {
    "submission": null,
    "disabledReason": "",
    "expiresAt": 0
  },
  "meta": {
    "createdBy": "agent:simo",
    "createdAt": 1760000000000,
    "updatedAt": 1760000000000,
    "asOfSeq": 1234
  }
}
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `schemaVersion` | 是 | 当前 `1`；不支持 `CARD_SCHEMA_VERSION_UNSUPPORTED` |
| `cardId` | 是 | `card-[a-z0-9-]{1,80}`；服务端生成；同会话唯一 |
| `version` | 是 | ≥1；每次 PATCH/刷新递增；不可回退 |
| `sessionId` | 是 | 必须与消息会话一致；跨会话拒绝 |
| `messageId` | 是 | 所属 agent 消息；GET 时必须可见 |
| `position` | 是 | 同消息多卡 0..n，稳定排序 |
| `status` | 是 | `active/submitted/disabled/expired/superseded/archived/invalid`（§6） |
| `title` | 否 | ≤80 字，仅展示 |
| `blocks` | 是 | 1–24 个；复用视图块 registry；卡片内不嵌套块 |
| `dataBindings` | 否 | 0–16；只读动作；只能本会话可见数据 |
| `actions` | 是 | 1–8；见 §3/§4 |
| `style` | 否 | 只允许枚举/token；禁止原值样式 |
| `equivalence` | 是 | `chatPrompt` 必填；`actionMap` 标明每个动作的对话等价 |
| `fallbackText` | **是** | 1–2000 字；纯文本/Markdown 子集；不能空/只写“不支持”；无 HTML |
| `state` | 是 | 服务端状态；客户端只读 |
| `meta` | 是 | 审计/一致性（`asOfSeq`） |

### 2.2 blocks

- 复用视图块类型/渲染器注册表（13 核心块 + `chart` 扩展）；**不新增卡片专属块**；
- 每块 `{id,type,props,dataBinding?}`；`id` 卡内唯一；`type` 白名单外整卡 fallback；
- `props` 必须是该块 props Schema；禁止 `html/script/iframe/on*`/模板表达式；
- 卡片块上限 24、总大小 ≤256KB；卡片内禁止 12 栅格嵌套（移动端窄卡不适用）；
- 交互块仅 `form/ask/action/table/kanban` 的受控子集；所有交互必须走 §4 动作路由。

### 2.3 dataBindings

```json
{
  "id": "b1",
  "source": "task.list",
  "params": {"sessionId": "s-main"},
  "maxItems": 20,
  "ttlMs": 5000,
  "refreshOn": ["action:retry"]
}
```

- `source` 必须是 M20 动作目录中的**只读动作**；写动作不能作数据源；
- 只能读当前会话/可见下级会话；团队卡片 P1 需显式授权；跨会话拒绝；
- 解析失败：块内展示 fallback 文案 + `card.binding.failed`（内部事件）；不阻塞其他块；
- `asOfSeq` 为渲染一致性水位；超过 TTL 重新解析，不无限缓存。

### 2.4 style

```json
{"variant":"default|info|ok|warn|danger","density":"compact|default"}
```

- 仅枚举映射 M40 token；禁止 `color/background/fontSize/width` 等原值；
- 卡片必须用 `platform/ui` 的 Card/Button/Badge/Table 等组件，不得自绘一套。

### 2.5 equivalence / fallbackText

- `equivalence.chatPrompt`：一段自然语言，能只用默认对话复现卡片的操作；
- `equivalence.actionMap`：每个 actionId → 对话意图摘要；缺一项 `CARD_EQUIVALENCE_INCOMPLETE`；
- 每个 action 必须能在 `chatPrompt` 中表达；`route=action` 也要说明“用户原本可怎么说”；
- `fallbackText` 必须包含关键内容 + 操作说明；不能只写“暂不支持”；fallback 不自动执行动作。

---

## 3. 动作定义与两种路由

### 3.1 Action 结构

```json
{
  "id": "confirm",
  "label": "确认执行",
  "route": "agent",
  "prompt": "确认执行任务 T",
  "variant": "primary",
  "confirm": "risk",
  "timeoutMs": 1800000
}
```

```json
{
  "id": "retry",
  "label": "重试",
  "route": "action",
  "action": "task.retry",
  "params": {"taskId": "t-..."},
  "variant": "secondary",
  "confirm": "always",
  "timeoutMs": 1800000
}
```

- `id` 卡内唯一；`label` ≤24 字；`variant` 仅 primary/secondary/ghost/danger；
- `route` 只能是 `agent|action`；同一 action 不可双路由；
- `route=agent` 必须有 `prompt`（≤500 字）；`route=action` 必须有已注册 `action`；
- `confirm`：`always`（前端二次确认）|`risk`（按动作风险）|`none`；**前端确认不能替代审批**；
- `timeoutMs`：submitted 超时；默认 30 分钟；范围 1s–24h；
- 卡片 actions 最多 8；禁用动作必须有 `disabledReason`（见 `state`）。

### 3.2 `route=agent`（完整语义）

1. 用户点击 → 校验卡片 `active`、动作 `enabled`、`baseVersion` 一致、无 in-flight；
2. 服务端写入一条 **用户动作消息**（role=user；text = action 的 `prompt` + 必要参数摘要；`meta.cardAction` 含 cardId/actionId/version）；
3. 启动正常 agent turn（同一会话权限/审批/预算）；
4. 卡片进入 `submitted`（`submission.kind=agent`），记录动作消息 id；
5. agent 的回复/任务/审批走正常流程；失败/超时后卡片可回 `active`（带 `lastError`）或由 agent 发新版本；
6. **不直接修改任务/工作流/文件**；一切业务变更由 agent/动作层完成；
7. 幂等键 `(cardId,version,actionId,idempotencyKey)` → 重复返回同一动作消息 id，不重复发消息；
8. 权限：以会话用户身份发送；不能携带更高权限；不能绕过用户审批；
9. 若会话归档/卡片 disabled/expired → 返回 `CARD_INACTIVE`，不写消息。

### 3.3 `route=action`（完整语义）

1. 校验卡片 `active`、动作白名单、`baseVersion`、无 in-flight、动作参数合法；
2. 动作必须存在于 M20 动作目录，且被该块 `allowedActions` 允许；
3. **权限/风险/审批沿用动作目录**：
   - R0–R2：按动作 `readOnly/confirmation`；写类仍需确认；
   - **R3+：必须审批**（创建 approval，卡片 `submitted` + `submission.status=awaiting_approval`）；
   - R4：必须有 `confirm=always` 且人工审批；禁止静默执行/批量自动执行；
4. 禁止参数携带 `sandbox_permissions/justification` 等提权字段；服务端剥离并拒绝 `CARD_FORBIDDEN`；
5. 执行以动作层 `idempotencyKey` 保证副作用不重复；非幂等动作也必须带客户端幂等键；
6. 结果：成功/失败/拒绝/过期 → 更新 submission；卡片可 bump 版本（刷新数据）并发 `card.updated`；
7. 失败不乐观改卡片/业务状态；用户可显式重试（新 idempotencyKey）；
8. 权限拒绝/审批拒绝不执行，不写入业务；返回明确错误。

### 3.4 路由选择规则（生成时）

- 需要探索、澄清、多步、跨工具 → `route=agent`；
- 已绑定、单步、有明确动作目录项 → `route=action`；
- 同一卡片可混合两种路由（如“确认”走 agent、“重试”走 action），但每个 action 只能一种；
- 生成器必须给出 `equivalence.actionMap` 说明两种路由的用户可复现方式。

---

## 4. API / WS

### 4.1 生成卡片

`POST /api/actions/chat.send_card`（M20 动作端点）

```json
{"sessionId":"s-main","messageId":"m-...","position":0,"card":{ "...Card Schema..." }}
```

返回：

```json
{"ok":true,"cardId":"card-...","version":1,"messageId":"m-...","status":"active"}
```

- 仅 agent/任务执行者可调用；服务端生成 cardId、校验、写 `message_cards` + `card_versions` v1；
- `messageId` 必须是已存在的 agent 消息；不存在 404；卡片不能先于消息；
- 校验失败 400（`CARD_*`）；成功后 `card.updated`。

### 4.2 读取 / 更新

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/cards/{id}` | 当前版本 schema + status/state/fallbackText |
| GET | `/api/cards?messageId=` | 按消息列卡片（position）；`includeInactive=true` 仅内部/调试 |
| GET | `/api/cards/{id}/versions` | 版本列表（version/createdAt/reason/hash；不含正文） |
| GET | `/api/cards/{id}/versions/{v}` | 指定版本（回滚/审计；只读） |
| PATCH | `/api/cards/{id}` | 生成新版本（agent/owner/内部执行者） |

PATCH body：

```json
{"baseVersion":3,"card":{...},"reason":"刷新数据"}
```

- 只有会话 owner/agent 或内部执行者；用户无编辑入口；
- 成功生成 `version+1`，旧版本 `superseded`；`baseVersion` 不一致 409 `CARD_BASE_CONFLICT`；
- 不允许修改 `cardId/sessionId/messageId/version`（服务端控制）；
- PATCH 可同时更新 `status`（仅允许 active/disabled/expired 的合法迁移，见 §6）。

### 4.3 卡片动作

`POST /api/cards/{id}/actions/{actionId}`

```json
{
  "messageId": "m-...",
  "baseVersion": 3,
  "payload": {},
  "idempotencyKey": "uuid"
}
```

返回：

```json
{
  "ok": true,
  "route": "agent",
  "actionId": "confirm",
  "submission": {"status":"submitted","messageId":"m-user-...","approvalId":""}
}
```

- `route=agent`：返回用户动作消息 id；卡片状态变 `submitted`；
- `route=action`：返回动作结果/审批 id；审批时 submission `awaiting_approval`；
- 错误码：`CARD_NOT_FOUND` 404、`CARD_ACTION_UNKNOWN` 400、`CARD_ACTION_DISABLED` 409、`CARD_FORBIDDEN` 403、`CARD_BASE_CONFLICT` 409、`CARD_INACTIVE` 409、`CARD_ACTION_FAILED` 502/409；
- 幂等：同 idempotencyKey 返回已存在 submission，不重复发消息/执行动作；
- 同一卡片同 action 同时只允许一个 in-flight；重复点击 409 `CARD_IN_FLIGHT`（前端禁用按钮，但服务端仍要拦）；
- 动作执行结果由动作层权威；卡片不维护第二份结果。

### 4.4 WS（按会话/消息隔离）

| 事件 | data | 说明 |
|---|---|---|
| `card.updated` | `{cardId,messageId,version,status,submission?}` | 新版本/状态变化 |
| `card.action.updated` | `{cardId,actionId,status,message?}` | submission 状态（submitted/awaiting_approval/succeeded/failed/denied/expired） |
| `card.expired` | `{cardId,expiresAt}` | TTL/归档导致过期 |
| `card.disabled` | `{cardId,reason}` | 被 owner/系统禁用 |

- 只向该会话/消息可见客户端推送；跨会话不广播；
- WS 不替代 HTTP：动作仍必须 HTTP 返回结果；WS 用于刷新；
- 断线重连用 `since`；丢失时 GET 卡片/版本对账。

---

## 5. 数据库（重启持久）

### 5.1 `message_cards`

| 列 | 说明 |
|---|---|
| `id` | `card-...` PK |
| `message_id` / `session_id` | 所属消息/会话；索引 |
| `position` | 同消息多卡排序 |
| `current_version` | 当前版本 |
| `status` | active/submitted/disabled/expired/superseded/archived/invalid |
| `submission_json` | 当前 submission（kind/status/actionId/messageId/approvalId/startedAt/finishedAt/error） |
| `fallback_text` | 当前 fallback（冗余给旧客户端） |
| `disabled_reason` / `expires_at` | 状态原因/过期时间（0=不过期） |
| `created_by` / `created_at` / `updated_at` | 审计 |
| `deleted_at` | 软删 |

索引：`(message_id,position)`、`(session_id,status,updated_at)`、`(expires_at)`。

### 5.2 `card_versions`

| 列 | 说明 |
|---|---|
| `card_id` / `version` | PK 联合；version 从 1 递增 |
| `version_status` | `active` / `superseded` |
| `schema_json` | 完整 schema（权威历史） |
| `fallback_text` | 该版本 fallback |
| `schema_hash` | sha256 |
| `created_by` / `created_at` | 审计 |
| `reason` | create/update/refresh/rollback? |

- 版本不可变；PATCH 写新版本，旧版本 `superseded`；
- `message_cards.current_version` 指向 `version_status=active` 的版本；
- 历史卡死/损坏可回滚到旧版本（新版本指向旧 schema；不删中间版本）。

### 5.3 `card_action_invocations`（幂等/审计/恢复）

| 列 | 说明 |
|---|---|
| `id` | `cai-...` |
| `card_id` / `card_version` / `action_id` | 归属 |
| `idempotency_key` | 与 card/action 组合唯一 |
| `route` | agent/action |
| `status` | pending/awaiting_approval/succeeded/failed/denied/expired/unknown |
| `actor` / `approval_id` / `message_id` | 审计/关联 |
| `result_json` / `error_code` | 结果 |
| `created_at` / `finished_at` | |

唯一键：`(card_id, card_version, action_id, idempotency_key)`；同键重复请求返回原记录。

### 5.4 重启恢复规则

1. 卡片/版本/invocation 全部来自 SQLite；**无纯内存卡片状态**；
2. `active` 保持 active；`expires_at<=now` 启动时置 `expired` 并 WS；
3. `route=agent` 的 submitted：用户动作消息已持久化，按正常 turn 队列恢复；若消息未开始，重试该 turn（幂等）；
4. `route=action` 的 in-flight：
   - 有成功结果 → `succeeded` + 卡片更新；
   - 有明确失败 → `failed`；
   - 结果未知（崩溃/进程被杀）→ `unknown`，**不自动重试副作用**；卡片回 `active` 并提示“需要重试/核对”；用户可用新幂等键重试；
5. `card_action_invocations` 唯一键保证重启后重复请求不重复执行；
6. 恢复/对账不得改写历史版本；只追加新版本/状态事件。

---

## 6. 状态机

### 6.1 Card 状态

```text
构造期（未持久化）：draft → validated
持久化后：active
active ──submit──► submitted ──finish/retry──► active
active ──disable──► disabled ──enable──► active
active/submitted/disabled ──expire──► expired
active ──new version──► superseded（旧版本）
active/submitted/disabled/expired ──archive──► archived
invalid（校验失败，不持久化为 active）
```

| 状态 | 含义 | 允许操作 |
|---|---|---|
| `draft` | 构造中（不落库） | 校验/丢弃 |
| `validated` | 校验通过（不落库） | attach 生成 active |
| `active` | 用户可见、可交互 | GET/PATCH（新版本）/动作/disable/expire |
| `submitted` | 动作已提交，等待 agent/动作/审批结果 | 只读；新 in-flight 禁止；可 disable/expire |
| `disabled` | 被 owner/系统禁用 | 只读 fallback；不可动作；可由 PATCH enable |
| `expired` | TTL/消息归档导致过期 | 只读 fallback；不可恢复动作（可归档） |
| `superseded` | 旧版本被新版本替代 | 只读历史；不可动作 |
| `archived` | 归档/软删 | 只读；不可动作 |
| `invalid` | 校验失败/不可渲染 | 仅 fallbackText；不可动作 |

**迁移守卫**：
- 只有 `active` 接受新动作；
- `submitted` 不接受第二个 in-flight；submission 结束后按结果回 `active`（失败/需要重试）或由新版本 `active` 替代；
- `disabled→active` 只能 owner/系统且未 expired/archived；
- `expired` 终态（除 archive）；`superseded` 终态（版本只读）；
- 任何迁移 update `updated_at` 并发 `card.*` WS；非法迁移 409。

### 6.2 Submission 状态

`pending → awaiting_approval → succeeded | failed | denied | expired | unknown`

- `route=agent`：`submitted` 后为 `pending`，用户动作消息被 agent 接单→`succeeded`（不代表任务完成）；失败→`failed`；
- `route=action`：审批→`awaiting_approval`；通过后执行→`succeeded/failed`；拒绝→`denied`；超时→`expired`；结果未知→`unknown`；
- submission 状态不直接决定卡片版本；卡片可由 agent 发新版本。

### 6.3 版本状态

- 当前版本 `active`；历史 `superseded`；
- `baseVersion` 不等于当前 → 409 `CARD_BASE_CONFLICT`，不写新版本；
- 版本号只增不减；回滚=新版本（不删旧版本）。

---

## 7. 校验规则（视图 10 步 + 卡片增量）

### 7.1 复用视图 10 步（m24 §9）

1. JSON 可解析、`schemaVersion` 支持；
2. 顶层未知键/大小/深度（卡片 ≤256KB，块 ≤24）；
3. 块类型白名单、块 id 唯一、数量/嵌套限制；
4. 各块 `props` 对该块 renderer Schema；
5. `dataBindings` 来源是只读动作、参数合法、会话内、无跨会话；
6. `actions` 存在、动作白名单、参数 Schema；
7. 动作风险/确认不因卡片降级；
8. `equivalence` 与动作语义一致；
9. 禁止 HTML/JS/inline style/事件属性/`javascript:`/`data:` URL/模板表达式；
10. 渲染器注册表/可访问性/fallback 可用。

### 7.2 卡片特有（必查）

11. **`fallbackText` 必需**：非空、1–2000 字、不能只写“暂不支持”、不能含 HTML；不满足 `CARD_FALLBACK_REQUIRED`；
12. **`route` 合法**：`agent|action`；agent 有 `prompt`；action 有已注册动作；同一 action 不可双路由；
13. **动作白名单**：`route=action` 的动作必须在块 `allowedActions` 与卡片动作目录中；R3+ 仍审批；
14. **会话/消息绑定**：`sessionId` 一致、`messageId` 存在且为 agent 消息；
15. **版本**：PATCH `baseVersion` 匹配；新版本 = current+1；version 不可回退；
16. **状态**：只有 active 接动作；submitted 已有 in-flight 拒绝；disabled/expired/superseded/archived 拒绝；
17. **权限**：动作以当前会话用户执行；禁止 `sandbox_permissions/justification` 等提权参数；
18. **不可信内容**：记忆/网页/子代理文本标 `untrusted`，转义，不自动填动作参数；
19. **卡片动作数量/ID 唯一**：1–8，label ≤24，confirm 枚举；
20. **fallback/结果清洗**：fallback 和错误不泄露 Key/内部路径。

### 7.3 错误码

| 码 | HTTP | 含义 |
|---|---|---|
| `CARD_SCHEMA_INVALID` | 400 | Schema 不通过 |
| `CARD_SCHEMA_VERSION_UNSUPPORTED` | 400 | 版本不支持 |
| `CARD_UNKNOWN_BLOCK` | 400 | 块未知 |
| `CARD_LIMIT_EXCEEDED` | 400 | 大小/块/动作超限 |
| `CARD_FALLBACK_REQUIRED` | 400 | 缺/空 fallbackText |
| `CARD_ROUTE_INVALID` | 400 | route/prompt/action 非法 |
| `CARD_ACTION_UNKNOWN` | 400/404 | action 不存在/不在白名单 |
| `CARD_ACTION_DISABLED` | 409 | 动作被禁用 |
| `CARD_IN_FLIGHT` | 409 | 已有 in-flight |
| `CARD_INACTIVE` | 409 | 状态不允许动作 |
| `CARD_BASE_CONFLICT` | 409 | baseVersion 过期 |
| `CARD_SESSION_MISMATCH` | 403 | 跨会话 |
| `CARD_FORBIDDEN` | 403 | 权限/提权参数 |
| `CARD_ACTION_FAILED` | 502/409 | 动作失败/审批拒绝 |
| `CARD_NOT_FOUND` | 404 | 不存在/已软删 |

---

## 8. 与视图 Schema 的关系

| 维度 | 视图（M24/M26） | 卡片（M41） |
|---|---|---|
| 归属 | 会话页面 | 某条 agent 消息（消息内） |
| 存储 | `view_pages`/`view_versions` | `message_cards`/`card_versions` |
| 规模 | 1–200 块；页面级 | 1–24 块；轻量 |
| 渲染 | 同一 renderer registry | **复用同一 registry**；无卡片专属块 |
| 动作 | 页面动作绑定 | 两种 route（agent/action）；动作白名单 |
| 可见性 | 会话级、可长期 | 消息级、随消息/归档；TTL |
| 复用边界 | 不共享表/版本链；卡片不能引用 view_pages 为数据源；视图不能内嵌卡片 |

- 共享：块类型/props Schema/renderer/token/10 步校验思想/动作目录；
- 不共享：持久化表、版本链、页面级 layout、全局视图入口；
- 未来“卡片升级为视图”需显式转换动作，非本期。

---

## 9. 验收标准

1. **Schema**：`chat.send_card` 生成合法卡片，挂到 agent 消息；非法卡片被拒且错误码可读；
2. **fallbackText**：缺/空/只写“不支持”/含 HTML → 400 `CARD_FALLBACK_REQUIRED`；渲染失败/旧客户端显示 fallback；
3. **route=agent**：点击写一条用户动作消息并触发 turn；卡片 `submitted`；不直接改业务；重复点击幂等；失败/超时回 active 可重试；
4. **route=action**：动作白名单校验；R0–R2 按动作确认，R3+ 创建审批并 `awaiting_approval`；R4 需 confirm=always + 审批；拒绝/失败不改业务，返回明确错误；
5. **权限/提权**：跨会话 403；提权参数被拒绝/剥离；卡片动作不提升会话权限；
6. **幂等/并发**：同 idempotencyKey 不重复；同卡同 action in-flight 只能一个；幂等结果可重放；
7. **版本/409**：PATCH 生成新版本；baseVersion 冲突 409 不落库；历史可查；旧版本 superseded；
8. **状态机**：active→submitted/disabled/expired 合法；非法迁移 409；expired/disabled 拒绝动作；
9. **WS**：card.updated/action.updated/expired/disabled 按会话隔离；断线重连可对账；
10. **重启**：卡片/版本/submission/invocation 持久；active 保持；submitted 恢复/对账；未知结果不自动重试副作用；
11. **安全**：HTML/脚本/事件属性/危险 URL/超大 schema/跨会话全部拒绝；fallback 也清洗敏感信息；
12. **视觉/可访问**：M40 组件/状态齐全；键盘可操作；focus-visible；不出现 emoji 图标。

---

## 10. 测试计划

| 层 | 用例 | 判据 |
|---|---|---|
| 单元 | 20 步校验表：schema/块/bindings/actions/fallback/route/version/权限 | 表驱动；错误码精确 |
| 单元 | 状态机迁移矩阵（合法/非法/并发） | 非法 409；版本单调 |
| 单元 | 幂等键：重复 agent/action、in-flight | 返回原结果；不重复副作用 |
| 集成 | `chat.send_card`→GET/PATCH→WS；消息归属/position | API+WS 快照 |
| 集成 | route=agent：动作消息/turn/失败/超时/重试 | 不改业务；幂等 |
| 集成 | route=action：R2/R3/R4、审批通过/拒绝/超时 | 审批不可绕过；失败保留 |
| 集成 | 重启：active/submitted/in-flight/unknown 对账 | 不重复执行；状态可读 |
| 安全 | XSS/JS/危险 URL/跨会话/提权/超大 schema | 全拒绝；fallback 转义 |
| 回归 | M1–M40 evals + M41 case；前端 tsc/门禁 | 全绿/见 `evals/RELEASE.md` |

**建议 M41 case**：`card-schema`、`card-fallback`、`card-route-agent`、`card-route-action-approval`、`card-idempotency`、`card-version-conflict`、`card-state-machine`、`card-restart`、`card-ws-scope`、`card-security`、`card-visual`。

---

## 11. 安全边界与风险

| # | 风险 | 约束/应对 |
|---|---|---|
| 1 | 卡片变第二数据源 | 卡片只读投影；版本/状态以 DB 为权威；动作层执行业务 |
| 2 | HTML/JS/XSS | 硬拒绝；块/token 白名单；fallback 转义；danger URL 拒绝 |
| 3 | 跨会话数据泄露 | sessionId/messageId 强校验；bindings 只读本会话；WS 按会话过滤 |
| 4 | 绕过审批/提权 | R3+ 审批；R4 需确认+审批；提权参数剥离；动作以用户身份执行 |
| 5 | 重复点击/重放 | idempotency 唯一键；in-flight 锁；重启对账不重放副作用 |
| 6 | 状态/版本漂移 | 状态机守卫；baseVersion 409；版本不可变；hash 校验 |
| 7 | 重启丢失 | 全量落库；submitted/in-flight 恢复/unknown；不自动重试未知副作用 |
| 8 | fallback 泄露 | fallback/错误清洗 Key/路径/内部字段；只放用户可见文本 |
| 9 | 旧客户端/未知块 | fallbackText 必需；整卡 fallback；不白屏 |

---

*本契约只写设计，不写实现；动作白名单/风险/审批以 M20 动作目录为准，块/渲染器以 M24 注册表为准。*

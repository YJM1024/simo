# M23 实现契约：UI-2 深度件（轨迹 / 卡片 / 计划 / 模型 / 压缩 / 通知）

> **状态**：实现契约 v0.1（2026-11-08）。只写设计/契约，不写代码。
> **定位**：UI-2 不是新数据源，而是**同一套会话事件/消息的更深投影**；所有视图必须满足 design-core 的**视图等价原则**（能用默认对话复现）。
> **依据**：[`docs/design-core.md`](design-core.md)、[`docs/dsh-alignment.md`](dsh-alignment.md) §7.2（视图 = 事件投影 + 受控呈现元数据；拒绝生成式 UI）、[`docs/product-plan.md`](product-plan.md)、[`docs/m18-contract.md`](m18-contract.md)、[`docs/m11-contract.md`](m11-contract.md)。
> **约束**：UI 不出现 Spec 内部字段/术语；不写 API Key；不引入第三方 UI/Markdown 库；不承诺未验证能力。

---

## 1. 目标与非目标

### 1.1 目标

1. **轨迹视图**：聊天/执行轨迹一键切换；工具调用、审批、压缩、重试、任务事件在时间线上可见、可筛选、可跳转。
2. **工具调用卡片**：命令/输出/diff/审批/产物按类型渲染，折叠与展开一致，支持来源/耗时/状态/错误。
3. **计划与待办**：plan 预览、todo 列表、打勾（经动作层）、来源会话；与 Spec/任务不形成第二真相。
4. **模型选择器**：composer 内切模型/推理强度，接后端配置；不可用时明确禁用。
5. **计划模式**：先出计划，用户确认后再执行；确认前无副作用。
6. **压缩可视化**：上下文压缩事件可见，显示“已压缩 N 条/工具结果、节省 token”等摘要，不展示内部原文。
7. **通知中心**：任务完成/审批/错误三类；toast + 历史中心；未读/已读/筛选/跳转。

### 1.2 非目标

- 不做“模型生成可执行 UI”（HTML/JS/组件树）——见 dsh-alignment §7.2；
- 不新增第二套事件/消息存储；轨迹/卡片都是事件投影；
- 不做团队 V1/V2 消息 UI（那是 team-contract）；
- 不做浏览器通知/声音/桌面弹窗（沿用 M7：只做站内）；
- 不把 Spec / 记忆内部字段暴露给用户。

---

## 2. 通用设计原则

1. **事件投影**：视图数据来自 `messages` / `event_log` / `tasks` / `artifacts` / `approvals` / `notifications`；视图不自持第二套状态（可用 `asOfSeq`/`stateVersion` 做一致性快照）。
2. **只读优先**：轨迹、卡片、计划预览默认只读；唯一可写动作是“确认计划”“打勾/取消打勾”“模型/推理选择”，都必须落到动作层并审计。
3. **受控呈现元数据**：工具结果可带 `presentationMeta`（diff/artifact/分类），前端按注册表渲染；**不接受模型自由生成 UI**。
4. **聊天/轨迹等价**：轨迹能看到的执行事实，聊天里必须能通过对话复现/追问；轨迹不产生“只能在轨迹做”的能力。
5. **安全**：命令/参数/输出按工具规则脱敏（不显示 Key、不显示环境变量值）；大输出走 spill 只显示摘要与路径；审批展示原文但排除敏感值。
6. **主题与无障碍**：只使用现有语义 token；焦点可达、键盘可操作、`aria-live` 只播报状态；不刷屏。
7. **性能**：轨迹/通知分页；首屏只加载当前窗口；工具输出折叠懒加载；长会话虚拟列表可后置（P1）。

---

## 3. 轨迹视图（Trajectory）

### 3.1 入口与布局

- 中栏顶部标签：**对话 / 轨迹**（在现有 对话/文件/概览 旁；或作为会话内二级切换）；
- 默认「对话」；切换状态按会话记忆（本地偏好），不改变消息已读/任务状态；
- 轨迹 = 按时间排序的事件流（不是另一份聊天记录），每项有：
  - `at`（时间）、`kind`、`title`、`status`、`summary`、`source`（会话/任务/工具/审批）；
  - 可展开详情（工具卡片/审批卡片/产物卡片）；
  - 点击可跳回对话锚点（若是消息/汇报）或打开任务详情。

### 3.2 事件种类（首版）

| kind | 来源 | 展示 |
|---|---|---|
| `message` | 用户/司墨消息 | 摘要/角色/会话标签；可跳对话 |
| `tool.call` | 工具审计事件 | 工具名、风险、状态、耗时；展开卡片 |
| `approval` | 审批事件 | 风险、工具、命令摘要、决策 |
| `task` | 任务/工作流事件 | 创建/开始/完成/失败/取消/重试 |
| `plan` | 计划模式 | 计划提出/确认/拒绝/修改 |
| `compaction` | 上下文压缩 | “已压缩 N 条”/节省 token；详情折叠 |
| `retry` | 模型/工具/任务重试 | 第 N 次、原因、下次时间 |
| `error` | 错误帧/失败事件 | 可读错误 + 下一步 |

### 3.3 API

`GET /api/sessions/{id}/trajectory?before=<seq>&limit=<n>&kinds=tool.call,approval,compaction,retry`

```json
{
  "ok": true,
  "asOfSeq": 1234,
  "items": [
    {"seq": 1233, "at": 1760000000000, "kind": "tool.call",
     "title": "write_file", "status": "ok", "summary": "写入 report.md",
     "source": {"sessionId": "...", "taskId": "...", "messageId": "..."},
     "detailRef": {"toolCallId": "tc-...", "card": "file_write"}}
  ],
  "nextBefore": 1200,
  "hasMore": true
}
```

- `asOfSeq`：服务端快照水位；分页游标只在同一语料版本内有效；跨版本失效→返回 409 `trajectory_stale`，前端刷新；
- `kinds` 过滤；默认排除内部 `spec.*`/`memory.*` 等非用户事件；
- 大字段只返回 `detailRef`，详情按需 `GET /api/tool-calls/{id}`（或复用已有 tool 审计查询）；
- 不返回 Key/环境变量值；命令脱敏规则见 §4.4。

### 3.4 时间线交互

- 分组：按 turn/任务分组，可折叠；
- 过滤：全部/工具/审批/任务/压缩/错误；
- 搜索：按标题/摘要（可选 P1）；
- 当前时间线高亮；点击消息项跳转并高亮对应聊天消息；
- 轨迹中审批卡片可直接允许/拒绝（复用 §4 审批动作）；其他项只读。

---

## 4. 工具调用卡片

### 4.1 分类与渲染

| `card` 类型 | 触发 | 必须展示 | 可展开 |
|---|---|---|---|
| `command` | `pwsh` | 命令（脱敏）、cwd、退出码、stdout/stderr 摘要、耗时、是否超时/被杀 | 完整输出（≤展开上限，超限显示 spill 路径） |
| `file_read` / `search` | `read`/`glob`/`grep` | 路径/模式、命中数、前几条摘要 | 命中列表/文件树 |
| `file_write` / `file_edit` | `write`/`edit` | 路径、diff（新增/删除行）、是否审批、结果 | unified diff（只读） |
| `web` | `web_search`/`web_fetch` | 查询/URL、状态、来源数、截断 | 来源列表/正文摘要（可点击，`rel=noopener`） |
| `filegen` | `make_pdf/docx/xlsx/pptx/image` | 产物名、类型、大小、预览/下载 | 产物卡片 |
| `approval` | 审批请求 | 风险、工具、命令/参数原文（脱敏）、影响范围、可允许一次/本会话/拒绝、单次提权 | 参数 JSON |
| `retry`/`error` | 重试/失败 | 第 N 次、原因、可重试性、下一步 | 错误详情 |

### 4.2 卡片数据协议（后端受控元数据）

```json
{
  "id": "tc-...",
  "tool": "write",
  "risk": "write",
  "status": "pending|running|ok|failed|denied|timeout",
  "summary": "写入 report.md",
  "startedAt": 1760000000000,
  "durationMs": 120,
  "approvalId": "ap-...",
  "meta": {
    "card": "file_write",
    "path": "workspace/report.md",
    "diff": {"added": 12, "removed": 3, "patchRef": "diff-..."},
    "artifact": {"id": "art-...", "name": "report.md", "mime": "text/markdown"},
    "truncated": false,
    "spillPath": ""
  }
}
```

- `meta` 由工具执行层/动作层产生（受控）；前端按 `card` 注册表渲染；
- 未识别 `card` → 通用 JSON 折叠卡片，不白屏；
- `diff` 只传 patchRef 或受控 patch，不把完整文件塞进列表；
- 产物卡片复用 M11/M12 的 preview/download；
- 审批卡片的按钮调用 M9 审批动作；状态变化通过事件更新，不本地猜测。

### 4.3 生命周期

- pending → running → ok/failed/denied/timeout；审批前不执行（M9）；
- 同一 toolCallId 只渲染一张卡片；重试更新同一卡片（attempt+1）或新建重试条目，二者选一且全局一致（建议同一卡片展示尝试次数）；
- 失败不结束对话；卡片展示错误与“重试/忽略”入口（重试经动作层）。

### 4.4 安全与脱敏

- 命令/参数：隐藏 `*KEY*`、`*TOKEN*`、`*SECRET*`、`PASSWORD` 等值；路径可显示；
- 输出：不显示环境变量值；API Key 永不显示；
- 大输出：inline ≤64KB（沿用后端限制），超出显示 `spillPath` 与行数摘要；
- 网页内容标记来源/不可信，不作为指令。

---

## 5. 计划与待办

### 5.1 Plan 预览

- 触达：计划模式（§7）生成；或工作流 plan 生成后；
- 面板位置：中栏「计划」侧栏/顶部卡片（不新增顶级导航）；可折叠；
- 内容：标题、目标摘要、步骤/任务列表（含依赖）、预计产出、当前状态、来源会话；
- 计划是**用户可读的执行方案**，不是 Spec；不展示 `specId/status/evidence` 等内部字段；
- 确认/修改/取消按钮：确认后进入执行；修改→重新生成计划；取消→保持计划模式/回到对话。

### 5.2 Todo 列表

```json
{
  "planId": "plan-...",
  "sessionId": "s-...",
  "items": [
    {"id": "todo-1", "title": "收集资料", "status": "todo|doing|done|blocked",
     "dependsOn": [], "sourceSessionId": "s-...", "taskId": "t-...",
     "checkable": true}
  ]
}
```

- 来源会话：每个 item 带 `sourceSessionId`/`sourceSessionTitle`（跨成员时显示，不复制内容）；
- **打勾**：用户点击 checkbox → 发 `todo.toggle` 动作（经对话/动作层），**不直接 UPDATE 任务**；
  - 服务端校验：若关联 task，task 未 done 时只能“请求完成”，由执行者/审批确认；已 done 时只能取消勾选为“请求撤回”，需说明；
  - 纯 plan 级 todo 可直接切换，但写 `todo_events` 审计并提示“已记录，执行仍以任务状态为准”；
- 状态以任务/计划为真相；Todo 是投影；不允许 UI 直接改状态。

### 5.3 API

- `GET /api/sessions/{id}/plan`：当前计划（plan+items+来源+状态）；
- `POST /api/sessions/{id}/plan/confirm` / `reject`：确认/拒绝计划（动作层，审计）；
- `POST /api/sessions/{id}/todos/{id}/toggle`：打勾请求（动作层，见上）；
- 计划模式生成使用 §7 API。

---

## 6. 模型选择器

### 6.1 位置与内容

- composer 工具条右侧：模型名 + 推理强度（low/medium/high/max 或后端返回枚举）；
- 点击弹出选择器：模型列表（来自后端）、当前选中、上下文窗口/能力标签（如有）、推理强度；
- 选择器显示“下一条消息生效”还是“本会话生效”（以契约配置为准；默认本会话）；
- 后端不支持时：选择器禁用并提示“当前后端未提供模型切换”，不假装成功。

### 6.2 API / 动作层

| 能力 | 契约 |
|---|---|
| `GET /api/models` | `{models:[{id,label,provider,contextWindow,reasoningEfforts[]}], current:{model,reasoning}}` |
| `POST /api/sessions/{id}/model` | `{model, reasoning}` 设置会话偏好；动作层校验可用性/权限；审计 |
| 全局默认 | 配置中心（settings）设置默认模型；新会话继承 |
| 事件 | `model.changed`（sessionId, model, reasoning, actor） |

- 模型名/推理只作为配置传递，不写入用户消息；不显示 Key；
- 切换失败（模型不可用/限流）→ 保持原选择 + 明确提示；不自动回退到昂贵模型；
- 选择器只消费后端能力；不在前端硬编码模型清单。

---

## 7. 计划模式（Plan Mode）

### 7.1 行为

1. composer 有「计划」开关（或 `/plan` 指令）；
2. 开启后，用户消息触发的 turn 进入**只读计划阶段**：只允许读/搜索/分析，不写文件、不执行命令、不产生副作用；
3. 模型输出计划（Plan preview + todo），不直接执行；
4. 用户「确认执行」→ 动作层 `plan.confirm` → 进入执行（沿用正常工具/权限/审批）；「修改」→ 重新生成；「取消」→ 退出计划模式；
5. 确认前不能执行任何副作用动作；计划模式对子任务/成员同样生效（防委派绕过）。

### 7.2 API / 事件

- Chat/WS 请求带 `mode:"plan"`（或动作 `turn.plan`）；
- `plan.proposed` 事件（planId, sessionId, plan, todo）；
- `POST /api/sessions/{id}/plan/confirm|reject`；
- `plan.confirmed` / `plan.rejected` / `plan.revised` 事件；
- 计划提案有 TTL（默认 30 分钟），过期需重新生成；
- 计划确认需要用户显式动作/对话确认；不允许模型自行确认。

### 7.3 边界

- 计划模式不改变 Spec 的最终状态机（仍按 M18 推进）；计划是用户可见的执行方案，不是 Spec 字段；
- 计划模式下的只读工具仍走 M9 权限；不因计划模式绕过审批；
- 计划模式确认后若用户插话，按现有“消息不打断后台工作/显式修正才抢占”处理。

---

## 8. 压缩可视化

### 8.1 事件

后端在压缩发生时发 `context.compacted`（内部事件日志，可投影给用户摘要）：

```json
{
  "type": "context.compacted",
  "data": {
    "sessionId": "s-...",
    "beforeTokens": 120000,
    "afterTokens": 48000,
    "removedMessages": 42,
    "removedToolOutputs": 12,
    "summaryRef": "ckpt-...",
    "at": 1760000000000
  }
}
```

- UI 显示：**“已压缩 42 条消息、12 条工具结果，约节省 72k tokens”**（数字来自事件，不估算）；
- 位置：对话流内联小条（可折叠）+ 轨迹 `compaction` 项；
- 展开只显示统计/时间/触发原因，不展示被压缩原文/摘要正文（内部不可见）；
- 压缩失败/降级：显示“压缩失败，继续使用原上下文”（不阻塞对话）。

### 8.2 API / 边界

- 事件由上下文工程（M19/压缩模块）产生；前端只消费；
- 不新增“查看压缩摘要”入口（内部）；如需 debug，走 `-debug` 只读端点；
- 压缩不改变用户消息记录；聊天里不重复/不隐藏消息（只是上下文层事件）。

---

## 9. 通知中心

### 9.1 类型与数据

| 类型 | 触发 | 跳转 |
|---|---|---|
| `task_done` | 任务完成 | 会话/任务详情 |
| `approval` | 待审批 | 审批卡片/任务详情 |
| `error` | 任务/模型/连接错误 | 错误详情/重试 |

```json
{
  "id": "ntf-...",
  "kind": "task_done|approval|error",
  "title": "任务完成：整理周报",
  "sessionId": "s-...",
  "taskId": "t-...",
  "approvalId": "ap-...",
  "createdAt": 1760000000000,
  "readAt": 0,
  "link": "/?session=s-..."
}
```

### 9.2 UI

- 顶栏铃铛 + 未读角标；点击打开**通知中心**（抽屉/弹层）；
- 标签：全部/未读/任务/审批/错误；按时间倒序；分页/加载更多；
- 操作：单条已读、全部已读、点击跳转；无“删除全部”硬删除（可后置）；
- 现有 toast 继续存在；toast 与中心同源（同 `notifications` 记录），避免重复；
- 不接浏览器通知/声音。

### 9.3 API / 表

- `GET /api/notifications?before=&limit=&kind=&unread=1`；
- `POST /api/notifications/{id}/read`；`POST /api/notifications/read-all`；
- 事件：`notification.created`、`notification.read`；
- 表 `notifications(id, session_id, kind, title, task_id, approval_id, link, created_at, read_at, dedupe_key UNIQUE)`；
- 去重：同 kind+session+task/approval+时间窗口（如 5 分钟）合并；不重复推送。

---

## 10. 依赖（所需动作层能力）

| # | 能力 | 用于 | 现状/要求 |
|---|---|---|---|
| 1 | 事件投影查询（trajectory, asOfSeq/分页/过滤） | 轨迹 | 需新增后端投影/查询 |
| 2 | 工具调用受控元数据（presentationMeta/diff/artifact） | 卡片 | 部分已有审计；需补 diff/产物元数据 |
| 3 | 计划提案/确认/拒绝动作（plan.*） | 计划模式 | 需新增动作层 + 只读计划权限 |
| 4 | 模型列表/选择/推理强度（model.*） | 模型选择器 | 需新增后端配置/动作；当前可能是固定模型 |
| 5 | 压缩事件与计数（context.compacted） | 压缩可视化 | 需上下文模块发事件（M19） |
| 6 | 通知持久化/已读/查询（notification.*） | 通知中心 | 需新增表/API；toast 现有 |
| 7 | 审批动作（allow_once/session/deny） | 卡片/轨迹 | M9 已有 |
| 8 | 产物预览/下载 | 卡片 | M11/M12 已有 |
| 9 | 会话/任务/计划来源定位 | 轨迹/待办 | 现有消息/task 关系；补 source 字段 |

> 依赖能力未就绪时，对应 UI **禁用/降级并说明**，不伪造数据；不新增前端本地真相。

---

## 11. 验收标准

1. **轨迹**：对话/轨迹可切换；工具/审批/任务/压缩/重试/错误在时间线可见；筛选/分页/跳转/高亮正确；`asOfSeq` 过期显示刷新提示；无 Spec/Key 泄露。
2. **卡片**：command/file_write/file_read/frontend/filegen/approval 六类按类型渲染；diff 可展开；审批可允许一次/本会话/拒绝；大输出走 spill；未知卡片降级；同一 toolCallId 不重复。
3. **计划与待办**：计划预览含步骤/依赖/来源会话；确认前无副作用；todo 打勾经动作层，不直接改任务；来源会话可跳转；无 Spec 字段。
4. **模型选择器**：composer 可见；列表来自后端；切换本会话生效；不支持时禁用并说明；失败保持原选择；不显示 Key。
5. **计划模式**：开启后只读计划，确认前无写/执行；确认后正常执行；计划对子任务/成员继承（防绕过）；ttl/取消/修改可用。
6. **压缩可视化**：显示“已压缩 N 条消息/工具结果/节省 token”（来自事件）；可折叠；不显示内部摘要；压缩失败有提示。
7. **通知中心**：三类通知；未读角标；历史/筛选/已读/跳转；toast 同源去重；不接浏览器通知。
8. **通用**：主题 token、键盘可达、`aria-live` 状态；移动/窄屏最低可用；M1–M22 回归；evals 新增 UI2 case 全绿。

---

## 12. 测试计划

| 层 | 用例 | 判据 |
|---|---|---|
| 单元 | trajectory 归一化/筛选/分页/`asOfSeq` 过期 | 纯逻辑测试 |
| 单元 | 卡片分类与脱敏（命令/Key/大输出/diff） | 快照测试 |
| 单元 | plan/todo 打勾状态机；模型选择器选项归一化 | 纯逻辑测试 |
| 集成 | 轨迹 API 与事件一致；跳转锚点 | API + UI 断言 |
| 集成 | 工具调用 → 卡片 → 审批 → 状态更新 | mock 工具/审批 |
| 集成 | 计划模式：proposed→confirm→执行；未确认无副作用 | WS/REST + 审计 |
| 集成 | 压缩事件 → UI 计数；通知创建/已读/去重 | 事件/DB 断言 |
| 集成 | 模型切换 → 下一轮请求使用新模型/强度 | debug 请求快照 |
| 回归 | M1–M22 mock 套件；窄屏/键盘 | 全绿 |
| 安全 | 轨迹/卡片/通知无 Key/Spec 字段；越权查询 | 扫描 + 权限测试 |

**建议 mock case**：`ui2-trajectory`、`ui2-tool-cards`、`ui2-plan-mode`、`ui2-todo-toggle`、`ui2-model-selector`、`ui2-compaction`、`ui2-notification-center`。

---

## 13. 风险

| # | 风险 | 应对 |
|---|---|---|
| 1 | 轨迹/卡片变成第二数据源 | 只读事件投影；`asOfSeq`；不写任务/消息 |
| 2 | 工具输出/命令泄露 Key | 统一脱敏；测试扫描；spill 摘要；不显示 env 值 |
| 3 | 计划模式被绕过（子任务/成员直接执行） | 计划模式继承；动作层强制只读；确认前无副作用 |
| 4 | Todo 打勾与任务状态冲突 | 打勾只发动作请求；任务状态是唯一真相；冲突提示 |
| 5 | 模型选择器后端未就绪/模型不可用 | 禁用并说明；失败保持原选择；不自动回退 |
| 6 | 压缩事件缺失/数字不准 | 只显示事件给的真实计数；无事件不显示；不估算 |
| 7 | 通知重复/刷屏 | 同源 + dedupe key；toast/中心共用记录；三类限制 |
| 8 | 大轨迹性能 | 分页/懒加载/折叠；先当前窗口；P1 虚拟列表 |
| 9 | 无障碍回归 | 键盘/aria/焦点测试；不因深件破坏现有三栏 |

---

## 14. 与参考的映射

| 参考 | 落点 |
|---|---|
| design-core §6 视图等价 | 轨迹/卡片/计划均为事件投影；对话可复现 |
| design-core §7 对话即操作 | 打勾/确认计划/切模型走动作层，不 UI 直写 |
| dsh-alignment §7.2 | 视图 = 事件投影 + 受控呈现元数据；拒绝生成式 UI；只读优先 |
| product-plan §1.1/§1.2 | 轨迹视图、压缩、模型选择、计划模式、通知中心 |
| m18-contract | 计划/待办不暴露 Spec；每个会话独立 |
| m11-contract | 概览/文件/历史继续；轨迹为执行侧补充视图 |

---

*本契约只写设计，不写实现；依赖项未就绪时 UI 必须降级并说明，不伪造数据。*

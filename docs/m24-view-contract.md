# M24 实现契约：视图 Schema（自定义视图 = 同一套会话消息 + 动作）

> 前置：M20（动作层）、M18（SpecCore/概览）、M19（长程运行时）、M21/M22（记忆/召回）、团队 V0–V2（上下文隔离）。
> 定位：**最后里程碑**。允许 Agent 为用户生成"页面级视图"——但**视图只是投影**：不产生第二套数据、不产生 UI-only 能力、不执行任意代码。
> 上游原则（用户已确认）：
> - **视图等价原则**（`docs/design-core.md` §6）：任何自定义视图/工作流都必须等价于"同一套会话消息 + 动作"，并且能用默认对话复现；不能复现的视图是无效视图。
> - **一切操作可通过对话完成**（`docs/design-core.md` §7）：动作层是唯一能力层；UI/CLI/对话都是客户端，不存在"只能在 UI 做"的操作。
> - M20 动作层（`docs/m20-contract.md`）：动作有 schema/权限/风险等级/审计；结果统一 `{ok,data?,error?}`。
> - DSH 参考（`docs/dsh-alignment.md` §7.2）：DSH 的 UI = **客户端插件 + Slots + 受控呈现元数据 + 事件投影**，**没有生成式 UI**；可抄"类型→渲染器注册表 + 受控描述符 + 事件投影"，不抄"模型生成可执行 UI / 插件式 UI 运行时"。
> 数字默认值均为**工程默认、可配、非验收承诺**；后续按 M24 基线校准（17 §6.2 纪律）。

---

## 1. 目标与非目标

### 1.1 目标（可验收）

1. **视图即数据**：Agent 可以用一个受 schema 约束的 **ViewPage** 描述"用户要看的页面"（布局 + 块 + 数据绑定 + 动作绑定），由宿主按**组件注册表**渲染。
2. **对话等价可验证**：每个视图必须带"默认对话复现路径"，能在无视图时通过对话完成同一任务；评测可自动断言。
3. **动作唯一入口**：视图里的每个交互都落到 M20 动作（`/api/actions/{name}`），不新增业务 API、不绕过审批/审计。
4. **安全**：schema 是**纯声明式 JSON**（无 HTML/JS/表达式/任意代码）；只读数据绑定按会话/作用域裁剪；写动作沿用 M19/M9 审批；不可信内容渲染转义。
5. **可演进**：schema 版本化、页面版本化、冲突检测、回滚、校验错误码稳定、渲染器可降级（不认识/禁用 → 回退）。
6. **不回归**：M1–M23 evals 全绿；单机 SQLite 单写者约束不破；前端模块化/主题 token/TS strict 不破。

### 1.2 非目标（明确不做）

- **不做生成式 UI**：模型不生成 HTML/JSX/组件源码/任意脚本；只生成声明式 schema。
- **不做插件/第三方渲染器注册**（P1 之后才讨论；V1 渲染器由宿主内置）。
- **不做用户手写 schema 编辑器**：用户通过对话表达；Agent 通过 `ui.set_view` 生成/修改；用户只能"看/用/回滚"。
- **不做 UI-only 能力**：动作目录里没有的动作，视图不能绑。
- 不做跨机/多用户/权限体系改造（V1 单机单用户；团队视图 P1）。

---

## 2. 核心模型与不变量

### 2.1 对象

| 对象 | 定义 |
|---|---|
| **ViewPage** | 一个页面的完整声明：`id`、`sessionId`、`title`、`schemaVersion`（schema 方言版本）、`layout`、`blocks[]`、`equivalence`、`meta`。**归属会话**（V1 不做全局视图）。 |
| **ViewBlock** | 页面里的一个块：`id`（页内唯一）、`type`（13 种之一）、`props`（受该 type 的 props schema 约束）、`data?`（数据绑定）、`actions?`（动作绑定）。 |
| **DataBinding** | 块/页面级的**只读**数据来源：`{ action, args, select?, refresh? }` —— 解析时由宿主以页面会话身份调用 M20 **只读动作**。 |
| **ActionBinding** | 交互到动作的映射：`{ action, args, confirm? }`；`action` 必须存在于动作目录且属于该块的允许清单。 |
| **Renderer** | 宿主内置组件：`type@version → 组件`；只消费声明式 props + 已解析数据 + 宿主回调，**不 fetch、不 eval**。 |
| **ViewVersion** | 不可变版本：`{ pageId, version, schema, createdBy, createdAt, baseVersion, reason }`。 |

### 2.2 不变量（违反即实现错误）

| # | 不变量 | 检验 |
|---|---|---|
| **V1** | **不新增真相**：视图只读绑定 + 动作调用；不建第二套状态（滚动/折叠/宽高等纯展示偏好可留在视图层，见 design-core §6 例外） | 断开视图后，会话/任务/记忆状态不变；对话可复现 |
| **V2** | **动作唯一**：所有写交互经 `/api/actions/{name}`；视图不直接调业务 API | 审计里每个视图操作都有 action 记录（含 pageId/blockId 来源） |
| **V3** | **无代码**：schema 中不得出现可执行内容（`html`/`script`/`jsx`/`component`/`style`/`on*`/模板表达式/URL 表达式） | 校验器拒绝 + 渲染器只认白名单 props |
| **V4** | **对话等价**：含任何 ActionBinding 的页面必须有非空 `equivalence.chatPrompt`，且能映射出动作序列 | 作者校验 + 评测 A6 |
| **V5** | **可降级**：渲染器缺失/被禁用/块未知/数据失败 → 走 fallback（文本/表格/提示），页面不白屏；默认对话始终可用 | A7 |
| **V6** | **作用域**：数据绑定只在页面所属会话及其可见子会话/记忆中解析；不跨用户/跨租户 | A9 |
| **V7** | **可回放**：页面渲染本身是事件（`ui.view.render`）；同一 schema+数据版本可重放出同一页面 | 事件缺失即失败 |
| **V8** | **版本不可变**：任何修改 = 新版本；回滚 = 新版本指向旧 schema（不删历史） | 版本表 append-only |

---

## 3. 页面 Schema（`schemaVersion: 1`）

### 3.1 顶层结构

```json
{
  "schemaVersion": 1,
  "id": "view-<session>-<slug>",
  "sessionId": "main",
  "title": "本周工作台",
  "layout": { "kind": "grid", "columns": 12, "gap": "md",
              "areas": [ { "block": "progress-main", "colSpan": 12 },
                         { "block": "task-board", "colSpan": 8 },
                         { "block": "files", "colSpan": 4 } ] },
  "blocks": [
    { "id": "progress-main", "type": "progress",
      "props": { "title": "本周进度" },
      "data": { "action": "workflow.list", "args": { "sessionId": "$session" }, "select": "items[0]" } },
    { "id": "task-board", "type": "kanban",
      "props": { "columns": ["queued", "running", "done", "failed"] },
      "data": { "action": "task.list", "args": { "sessionId": "$session" } },
      "actions": [ { "id": "open", "action": "task.get", "args": { "taskId": "$row.id" } },
                   { "id": "retry", "action": "task.retry", "args": { "taskId": "$row.id" }, "confirm": "risk" } ] },
    { "id": "files", "type": "deliverable",
      "data": { "action": "file.list", "args": { "sessionId": "$session" } } }
  ],
  "equivalence": {
    "chatPrompt": "打开本周工作台：看进度、任务列表和交付物；点任务看详情，失败任务可以重试。",
    "actionSequence": [ { "action": "workflow.list" }, { "action": "task.list" }, { "action": "file.list" } ]
  },
  "meta": { "createdBy": "agent", "reason": "用户要一个工作台", "tokensEstimate": 900 }
}
```

### 3.2 字段约束

| 字段 | 必需 | 约束 |
|---|---|---|
| `schemaVersion` | ✅ | 整数；V1 只接受 `1`；不匹配 → `VIEW_SCHEMA_VERSION_UNSUPPORTED` |
| `id` | ✅ | `view-[a-z0-9-]{1,64}`；宿主也可分配；**页内唯一**（同会话） |
| `sessionId` | ✅ | 必须等于生成时的会话（跨会话生成 → 拒绝） |
| `title` | ✅ | 1–80 字符；纯文本（不允许 markdown 标题以外格式） |
| `layout` | ✅ | `kind: rows|grid`；grid `columns ≤12`；`areas[]` ≤ 200 项且每个 block 恰好出现一次 |
| `blocks[]` | ✅ | 1–200 个；`id` 页内唯一；`type` ∈ 13 种；深度 ≤3（仅 layout 嵌套，块内不再嵌套块） |
| `equivalence` | 含 ActionBinding 时 ✅ | `chatPrompt` 1–500 字符；`actionSequence[]` 可选（由校验器推导比对） |
| `meta` | ✅ | `createdBy: agent|user`、`reason`、可选 `tags[]` |
| 总大小 | ✅ | 序列化 JSON ≤ **256KB** |
| 未知顶层键 | — | 拒绝（`VIEW_UNKNOWN_FIELD`）：避免"偷偷塞代码/配置" |

---

## 4. 视图块清单（V1 共 13 种）

> 通用规则：props 由该 type 的 props schema 约束；`data` 只能引用**只读动作**；`actions` 只能引用**该块允许清单**内的动作；所有文本渲染默认转义（markdown 走白名单子集）。

| type | 用途 | 关键 props | 数据绑定 | 交互/动作 | 上限 | 降级 |
|---|---|---|---|---|---|---|
| **chat** | 内嵌会话消息流（某会话/某任务/某工作流的消息子集） | `filter`(session/task/workflow)、`showComposer`(bool，默认 false)、`replyTo`(可选) | `chat`/`session.messages` 只读 | 发送（若开 composer）→ `chat.send`/`chat.reply`；消息操作 → `chat.correct`/`chat.retract` | 消息 ≤200 条/页，分页 | 回退为 `text`（消息摘要列表） |
| **form** | 结构化输入 | `fields[]`（text/textarea/number/select/date/checkbox，≤20）、`submitLabel` | 可选（预填） | 提交 → 页面声明的动作（args 映射字段） | 字段 ≤20；单字段值 ≤8KB | 回退为 `text` + 对话提示 |
| **ask** | 单问题 + 选项（澄清/确认） | `question`(≤300 字)、`options[]`(2–5)、`allowCustom`(bool) | — | 选择 → `chat.send`（V1；M20 若加 `chat.answer` 则改用） | 1 问/页 | 回退为 `text` 问题 |
| **action** | 按钮/确认 | `label`(≤40)、`variant`(primary/secondary/danger)、`confirmText?` | — | `action` 绑定（R3+ 强制审批） | ≤30 个/页 | 回退为纯文本说明 |
| **deliverable** | 产物/文件卡片 | `kind`(artifact/upload/all)、`layout`(list/grid) | `file.list`/`task.artifacts` | 打开/下载/预览 → `file.preview`/`file.download`；删除 → `file.delete`（R4 确认） | ≤200 项 | 回退为 `table`（名称/大小/时间） |
| **text** | 静态/绑定短文 | `text`(≤8KB)、`variant`(body/muted/caption) | 可选 `data` 取字段 | — | 8KB | 原样显示/截断 |
| **markdown** | 富文本（白名单子集） | `markdown`(≤32KB) | 可选绑定 | 允许链接（http/https/mailto，`rel=noopener noreferrer`） | 32KB | 回退为 `text`（去格式纯文本） |
| **table** | 结构化列表 | `columns[]`(≤12，含 label/format)、`pageSize`(≤100)、`sortable` | 只读动作 | 行操作 → 允许清单（打开/取消等）；翻页/排序是**展示状态**（允许不入动作层） | 行 ≤200/页 | 回退为 `text` 摘要 |
| **image** | 图片 | `src`(仅 **artifact/attachment 引用**；P1 才允许经配置的 https 外链)、`alt`(必填)、`fit` | 可绑定 artifact id | 点击放大（展示状态） | ≤10 张/页，单张 ≤10MB | 回退为 `text`（alt + 文件名） |
| **progress** | 进度条/百分比 | `title`、`showEta`(bool)、`unit` | `task.get`/`workflow.get` | 暂停/继续（若绑定 `task.cancel`/`workflow.pause` 等，需白名单） | 1–20 个/页 | 回退为 `text`（"已完成 3/8"） |
| **timeline** | 有序事件流 | `source`(session events/task events/workflow events)、`maxItems`(≤100) | 事件只读 | 点击定位消息（展示状态） | 100 项 | 回退为 `table` |
| **dag** | 工作流 DAG | `orientation`(LR/TB)、`showStatus`(bool) | `workflow.get`（plan/depends） | 点节点 → `task.get`；重试/取消 → 对应动作（R3+ 审批） | 节点 ≤100 | 回退为 `table`（依赖列表） |
| **kanban** | 任务看板（按状态分列） | `columns[]`(状态名)、`groupBy`(status/owner)、`wipLimit?`（仅展示） | `task.list` | 拖拽改状态 → **不直接写库**，映射到 `task.cancel`/`task.retry` 或 `workflow.resume` 等**语义动作**（禁止"任意改状态"动作）；打开 → `task.get` | ≤500 卡片 | 回退为 `table` |

> **`kanban` 拖拽的硬约束**：V1 不允许"拖到任意列 = 直接改状态"；只支持映射到**目录里已存在且有权限/审批**的动作（例如：拖到 `cancelled` → 弹出确认 → `task.cancel`）。这是"动作唯一入口"的直接推论。

---

## 5. 数据绑定（只读、按会话裁剪）

### 5.1 绑定结构

```json
{ "action": "task.list",              // 必须是动作目录中的只读动作（读风险 R0/R1）
  "args": { "sessionId": "$session", "status": ["running","queued"] },
  "select": "items",                  // 可选：JSONPath 子集（仅 a.b[0].c）
  "fields": ["id","title","status"],  // 可选：字段裁剪
  "refresh": { "on": ["view.open","ws:task.updated"], "maxEverySec": 5 } }
```

### 5.2 规则

1. **只读动作白名单**：数据绑定只能引用动作目录中标记为只读（R0/R1-read）的动作；写动作只能出现在 `actions`。目录 `describe` 的 `risk`/`readOnly` 字段是权威。
2. **作用域注入**：`$session`/`$page`/`$viewer` 由宿主解析；**禁止**绑定显式跨会话 id（校验器拒绝 `sessionId != 页面 sessionId`，`FILE_CROSS_SESSION_DENIED`）。
3. **权限裁剪**：数据以页面会话身份解析；无权限 → 该块显示空态（不是报错），审计记 `view.binding.denied`。
4. **刷新**：`on` 只允许白名单事件（`view.open`、`ws:task.updated`、`ws:workflow.updated`、`ws:message.created`、手动 `view.refresh`）；`maxEverySec` 默认 5；**不做后台轮询**（V1）；刷新是展示行为，不产生动作。
5. **As-of 一致**：一次渲染内所有绑定数据取同一 `asOfSeq`（若数据源提供），避免"进度和任务列表不一致"。
6. **失败降级**：绑定失败（动作不可用/超时/无数据）→ 该块 fallback 渲染 + `view.binding.failed` 事件；页面其余块正常；**不阻塞渲染**。
7. **不可信内容**：来自记忆/外部抓取/子代理的文本一律按不可信渲染（转义；markdown 白名单），并在块上带 `untrusted: true` 视觉提示（不进入动作参数自动拼接）。

---

## 6. 动作绑定（M20 唯一入口）

### 6.1 绑定结构

```json
{ "id": "retry",                              // 页内交互 id
  "action": "task.retry",                     // M20 动作名
  "args": { "taskId": "$row.id" },            // 静态字面量或 $ 引用（白名单：$session/$row/$field/$selection）
  "confirm": "risk",                          // none | risk | always（继承动作风险等级，只能更严不能更松）
  "idempotencyKey": "$pageId/$blockId/$actionId/$row.id" }  // 可选；默认宿主按此规则生成
```

### 6.2 规则

1. **动作必须存在**：`VIEW_ACTION_UNKNOWN`（对照目录 `actions list`）；块类型白名单外 → `VIEW_ACTION_NOT_ALLOWED`。
2. **风险与审批**：动作风险 R3+ 沿用 M9/M19 审批（R4+ 不可被 `--yes` 跳过，M20 边界）；视图的 `confirm` 只能把确认级别**调严**（如动作默认 none，视图可设 always）。
3. **结果回填**：动作结果按 M20 统一信封返回；视图只做"成功后刷新/提示"，**不在视图里做业务状态推导**；错误展示 `error.message` + `error.recovery`（可读文案）。
4. **乐观更新禁止**：V1 不乐观改 UI；一律"动作成功 → 刷新绑定/事件驱动更新"。
5. **幂等**：双击/重放使用默认幂等键（`pageId+blockId+actionId+参数摘要`），服务端按 M20 幂等语义处理（M19 tool/报告幂等不替代动作幂等）。
6. **审计来源**：每次动作调用带 `source:{kind:"view", pageId, blockId, actionId}`，与对话/CLI 同账本（M20 §1 原则）。

---

## 7. 与对话等价（核心）

### 7.1 等价声明（必须）

```json
"equivalence": {
  "chatPrompt": "自然语言复现路径（一句话到一段话，用户能照着说）",
  "actionSequence": [ {"action":"task.list"}, {"action":"task.retry","args":{"taskId":"<示例>"}} ],
  "steps": [ "在对话里说：……", "秘书会：……" ]   // 可选，给人读
}
```

### 7.2 校验规则

1. 页面含任何 `ActionBinding` → `chatPrompt` 非空（`VIEW_EQUIVALENCE_MISSING`）；纯只读页面（只读绑定 + 无动作）可省略，但建议提供。
2. `chatPrompt` 必须**不包含 UI 专属词汇**（"点这个按钮/拖到那列"不算等价；必须能转述为"让它重试这个任务"这类意图）。
3. `actionSequence` 若提供，校验器检查每个 action 都在目录中、且与页面实际绑定动作集合一致（缺/多 → `VIEW_EQUIVALENCE_MISMATCH`）。
4. **发布门槛**：写不出默认对话等价路径 → **不允许发布**（design-core §6 检验方式）。

### 7.3 复现算法（评测/降级共用）

```text
给定 ViewPage P：
1. 在干净会话（独立端口/home）用 chatPrompt 作为用户消息 → 秘书经动作层执行。
2. 收集动作序列 A_chat（审计过滤 source.kind=chat）。
3. 在同样数据状态下"操作页面"（按 actionSequence 或模拟交互）→ 收集 A_view。
4. 断言 A_view ⊆ A_chat（动作名+参数语义等价；允许顺序不同、允许 chat 多做只读动作）。
5. 断言最终状态一致（state_delta：任务/文件/记忆无差异；允许纯展示状态差异）。
```

### 7.4 降级与渲染事件

- **渲染即事件**：页面打开/刷新写 `ui.view.render{pageId,version,asOfSeq,blocks}`；动作写普通 `action.*` 事件；**事件日志是真相**，页面可从事件重放（V7）。
- **视图不可用时**：宿主显示"该视图暂不可用，可继续用对话" + 回退到 chat（同一会话），**不阻塞用户**。
- **不锁定**：视图被删除/禁用后，用户能力不减——因为能力都在动作层（V1/V2）。

---

## 8. Agent 生成/修改（`ui.set_view` 动作）

### 8.1 动作定义（并入 M20 `ui` 命名空间）

| 字段 | 值 |
|---|---|
| 名称 | `ui.set_view` |
| 风险 | **R2 写（本会话视图层）**；不涉及外部副作用；无需审批，但必须审计 |
| 参数 | `sessionId`（必需，= 当前会话）、`pageId?`、`mode: "create"|"replace"|"patch"|"rollback"`、`schema?`（create/replace）、`patch?`（patch 模式）、`baseVersion?`（并发控制）、`reason`（必需，一句人话）、`equivalence?`（可随 schema 提供） |
| 返回 | `{ok, data:{pageId, version, warnings[]}}` 或错误信封 |
| 幂等键 | `(sessionId, pageId, baseVersion, schemaHash)`；重复提交同 schema → 返回同一版本 |
| 伴随动作 | `ui.get_view`（读）、`ui.delete_view`（软删+审计）、`ui.view.rollback`（= set_view mode=rollback，供 CLI 显式调用） |

### 8.2 patch 模式（限制）

允许的 patch 操作（**不允许**任意 JSON Patch）：

```json
{ "ops": [
  { "op": "set_page_props", "title": "新标题" },
  { "op": "replace_blocks", "blocks": [ ...完整新块列表... ] },
  { "op": "set_block_props", "blockId": "x", "props": {...} },
  { "op": "set_block_actions", "blockId": "x", "actions": [...] },
  { "op": "add_block", "after": "y", "block": {...} },
  { "op": "remove_block", "blockId": "z" }
] }
```

理由：保持 diff 可审计/可校验/可合并；避免"用 patch 绕过整页校验"。

### 8.3 校验流水线（原子）

```text
1. 身份/作用域：sessionId == 当前会话；page 存在性（replace/patch/rollback）
2. JSON Schema（schemaVersion 对应方言）+ 未知键拒绝
3. 语义校验：块类型/枚举/props 约束/页面大小/块数/layout 覆盖
4. 绑定校验：只读动作存在 + 作用域 + 字段白名单
5. 动作校验：动作存在 + 块允许清单 + 风险/确认级别（只能调严）
6. 等价校验：chatPrompt 必需（含动作时）+ 与 actionSequence 一致性
7. 安全校验：无 HTML/JS/表达式/危险 URL scheme/外链图片（V1 拒绝）；markdown 白名单
8. 并发校验：baseVersion == current_version（否则 VIEW_BASE_CONFLICT，409，不覆盖）
9. 预演（dry-run，可选）：不落库返回 warnings（"绑定可能为空/块数过多"）
10. 提交：写 new version（append-only）+ 更新 current_version（同一事务）+ 审计 action
    失败：不产生版本、不改 current_version、返回稳定错误码
```

### 8.4 存储

```text
view_pages   (id TEXT PK, session_id TEXT NOT NULL, title TEXT, schema_json TEXT NOT NULL,
              current_version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active',
              created_by TEXT, created_at INTEGER, updated_at INTEGER,
              UNIQUE(session_id, id))
view_versions(page_id TEXT NOT NULL, version INTEGER NOT NULL, schema_json TEXT NOT NULL,
              created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
              base_version INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '',
              PRIMARY KEY(page_id, version))
```

- **append-only**：版本不可变；删除页面是软删（`status='deleted'`），历史保留。
- 保留策略：每页最近 **20 个版本**（可配）；更老版本归档（仍可审计），不做物理删除（P1 再考虑压缩）。
- 迁移：新模块 `views`（或并入 sessions 模块命名空间），`schema_migrations(module='views')`。

### 8.5 回滚

`ui.set_view{mode:"rollback", pageId, baseVersion: current, targetVersion: N}` → 新版本 `version=current+1`，`schema_json = versions[N].schema_json`，`reason="rollback to vN"`；**不改历史**、不删中间版本。回滚也要过等价校验（旧 schema 若引用已下架动作 → 拒绝并提示）。

---

## 9. 校验与安全

### 9.1 错误码（稳定，客户端/模型可读）

| 码 | 含义 | HTTP |
|---|---|---|
| `VIEW_SCHEMA_INVALID` | JSON Schema 不通过 | 400 |
| `VIEW_SCHEMA_VERSION_UNSUPPORTED` | schemaVersion 不支持 | 400 |
| `VIEW_UNKNOWN_FIELD` / `VIEW_UNKNOWN_BLOCK` | 未知键/块类型 | 400 |
| `VIEW_LIMIT_EXCEEDED` | 大小/块数/字段数/深度超限 | 400 |
| `VIEW_ACTION_UNKNOWN` / `VIEW_ACTION_NOT_ALLOWED` | 动作不存在/块不允许 | 400 |
| `VIEW_BINDING_INVALID` / `VIEW_CROSS_SESSION_DENIED` | 绑定非法/跨会话 | 400/403 |
| `VIEW_EQUIVALENCE_MISSING` / `VIEW_EQUIVALENCE_MISMATCH` | 等价声明缺失/不一致 | 400 |
| `VIEW_UNSAFE_CONTENT` | HTML/JS/危险 URL/markdown 越界 | 400 |
| `VIEW_BASE_CONFLICT` | baseVersion 过期 | 409 |
| `VIEW_NOT_FOUND` / `VIEW_DELETED` | 页面不存在/已删除 | 404/410 |
| `VIEW_BINDING_DENIED` | 数据无权限（渲染期，非错误页） | 200 + 空态 |

### 9.2 禁止项（硬）

- 禁止：`html`、`script`、`jsx`、`component`、`eval`、`style`（内联样式）、`className`、`onClick` 等事件属性、任何 `{{}}`/模板表达式、外链 `javascript:`/`data:` URL、`iframe`、表单 `action` 自由 URL。
- **样式只能用主题 token**（`variant` 枚举 + token 引用），不允许原始颜色/尺寸字符串（避免视觉漂移）。
- **图片**：V1 只允许 artifact/attachment 引用（`src: "artifact:<id>"`/`attachment:<id>`）；外链 https 图片 P1（需配置 allowlist + 隐私说明）。
- **markdown**：CommonMark 子集（段落/强调/列表/代码/表格/链接），禁原始 HTML；链接 scheme 白名单。
- **不可信内容**：来自记忆/抓取/子代理的文本默认 `untrusted`：转义渲染、不自动拼进动作参数（需用户明确选择）。
- **作用域隔离**：页面只能读本会话可见数据（含可见子会话/记忆作用域）；团队视图 P1 需要显式授权。
- **不做权限提权**：视图动作以**页面会话身份**执行，不能携带"更高权限"；审批仍按实际用户/会话策略。

---

## 10. 渲染器契约（组件注册表）

### 10.1 注册表

```text
rendererRegistry: {
  "<blockType>": {
    "version": 1,
    "propsSchema": "<JSON Schema>",
    "allowedActions": ["task.get","task.retry", ...],   // 与 §4 一致
    "dataSources": ["task.list", "workflow.get", ...],  // 只读动作白名单
    "responsive": {...},
    "a11y": {...}
  }
}
```

- **宿主内置**（V1 共 13 个，对应现有前端模块：`chat`↔`MessageList/ChatCenter`、`deliverable`↔`SessionFilesView/DeliverablesBar`、`progress`↔`TaskPanel`、`timeline`↔`HistoryRail`、`table`↔`UsagePage` 表格、`markdown`↔`MarkdownMessage`、`ask`↔`ApprovalBar` 类交互；`dag`/`kanban`/`image`/`form`/`action`/`text` 新增）。
- **渲染器职责边界**：只接收 `{block, data, theme, locale, onAction, onRefresh}`；**不 fetch、不读取全局状态、不 eval**；数据由宿主 binder 解析后传入。
- **错误边界**：渲染器抛错 → 该块 fallback（text/table）+ `view.renderer.error` 事件；页面其他块不受影响。
- **版本化**：`block.type` 隐含 renderer 版本（V1 只 v1）；前向兼容：未知 type（如未来版本生成的页面在旧客户端）→ **整页 fallback 为 chat/table 只读视图页**，不白屏。
- **禁用**：配置可禁用某 renderer（feature flag）→ 页面自动 fallback；评测用于 Δ 消融（§13）。

### 10.2 响应式

- 布局：12 栅格；断点 `sm<640 / md<1024 / lg≥1024`（项目既有断点）。
- 自动塌缩：`grid` 在 `sm` 变单列；`table` 在 `sm` 变卡片列表；`kanban` 在 `sm` 变纵向分组；`dag` 在 `sm` 变依赖列表（fallback table）。
- **不允许**在块内用固定像素宽度硬编码布局；必须走布局 schema。

### 10.3 主题 / 本地化 / 可访问性

- 颜色/圆角/间距只用主题 token（现有 `theme-light-tech` token 体系）；`variant` 枚举映射 token。
- 文案：块内静态文案走 `text`；交互标签由 `props.label` 提供并**必须**可由 locale 渲染（V1 只支持中文；英文 P1）。
- a11y：动作按钮可聚焦/可键盘触发；image 必填 `alt`；表格有表头；进度有可读文本（`aria-valuenow`）；kanban 拖拽必须有键盘替代（按钮触发动作）。

---

## 11. API / WS

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/views?sessionId=` | 该会话视图列表（id/title/version/updatedAt） |
| GET | `/api/views/{id}` | 当前版本 schema（含 version/equivalence） |
| GET | `/api/views/{id}/versions` | 版本列表（不含 schema 正文，可含 hash） |
| GET | `/api/views/{id}/versions/{v}` | 指定版本 schema（回滚前预览） |
| POST | `/api/actions/ui.set_view` | 创建/替换/patch/回滚（M20 动作端点） |
| POST | `/api/actions/ui.get_view` / `ui.delete_view` | 读/软删 |
| GET | `/api/views/{id}/render-state` | 一次渲染的 `asOfSeq` + 各绑定解析状态（调试/评测） |

- WS 事件：`view.updated`（pageId/version）、`view.render`（页面打开事件）、`view.binding.failed`、`view.renderer.error`。
- **视图页面本身不做独立 REST 数据接口**：所有数据来自动作层只读动作；避免第二套 API。

---

## 12. 评测扩展点（对接 E0/M1）

| 扩展点 | 做法 | 产出 |
|---|---|---|
| **等价性评测（A6）** | 按 §7.3 算法，chat 复现 vs 视图操作动作序列比对 | 指标：等价通过率、动作覆盖差 |
| **渲染器 Δ 消融** | 关闭某 renderer → 同页面 fallback；对比"有视图/无视图（纯对话）"任务完成率与耗时 | `Δ`（视图是否真有价值） |
| **绑定稳定性** | mock 数据源失败/超时/空数据 → fallback 率与错误可读性 | 指标：fallback 正确率 |
| **schema 生成质量** | 让 Agent 对固定意图生成页面；断言校验一次通过率、修复轮次、块类型使用分布 | L2 case |
| **安全回归** | 注入 HTML/JS/危险 URL/超大 schema → 必须拒绝；注入恶意 markdown → 转义 | 硬门禁（全绿） |
| **性能** | 页面打开到首帧、绑定解析耗时、动作往返 | P95（先基线） |
| 门禁 | schema/渲染器/动作白名单改动 → L1 全量 + L2 smoke；安全用例必须全绿；Δ 不得显著为负 | — |

---

## 13. 验收标准（M24）

> 每项用独立端口/home（不动 8787）；M1–M23 回归全绿。

| # | 断言 |
|---|---|
| **A1 生成** | Agent 通过 `ui.set_view` 生成含 chat/progress/kanban/deliverable 的页面 → UI 渲染成功、version=1、审计有 `ui.set_view` |
| **A2 校验** | 非法 schema（未知块/超限/缺 equivalence/未知键）→ 4xx 稳定错误码；**不产生版本** |
| **A3 并发** | 过期 `baseVersion` 提交 → 409，不覆盖新版本 |
| **A4 回滚** | 回滚到 v1 → 新版本 schema 与 v1 逐字一致；历史仍可查 |
| **A5 动作唯一** | 页面每个交互命中 `/api/actions/*`；审计来源含 pageId/blockId；R3+ 动作触发审批，拒绝则界面可见错误、无状态变化 |
| **A6 对话等价** | 对样例页面执行 §7.3：chatPrompt 可复现动作集合且最终状态一致（允许顺序不同/多只读动作） |
| **A7 降级** | 禁用某 renderer / 未知块 / 绑定失败 → fallback 渲染 + 提示；对话仍可完成任务 |
| **A8 安全** | 含 `<script>`/`onclick`/`javascript:`/内联 style/外链图片（V1）→ 全部拒绝；恶意 markdown 转义后显示 |
| **A9 作用域** | 页面绑定他会话 id → 拒绝；无权限数据 → 空态 + 审计，不泄露 |
| **A10 回归** | `go test ./...`、`go vet`、`tsc --noEmit`、前端构建、M1–M23 evals + 新增 M24 case 全绿 |

---

## 14. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | Agent 生成大量无效 schema（浪费 token/循环） | 体验差 | 校验错误码 + 可读 recovery；单会话视图数上限（默认 20）；生成修复轮次 ≤2（M19 修复环同款） |
| R2 | 数据绑定变成"第二套查询 API" | 架构漂移 | 只读动作白名单 + 统一 `/api/actions` 审计 + 禁止视图自带 fetch |
| R3 | 视图绕过审批/权限 | 安全 | 动作风险/确认只能调严；动作以会话身份执行；A5/A8 硬门禁 |
| R4 | schema 与 renderer 漂移 | 白屏 | 注册表版本化 + 未知块整页 fallback + 渲染器 Δ 消融 |
| R5 | 跨会话数据泄露 | 隐私 | 作用域校验 + `VIEW_CROSS_SESSION_DENIED`；团队视图留 P1 显式授权 |
| R6 | 视图过多/页面过重 | 性能 | 页面/块/行数上限；懒加载（P1）；打开耗时 P95 基线 |
| R7 | 等价声明走过场（chatPrompt 写空话） | 违背原则 | A6 自动复现断言；chatPrompt 禁 UI 专属词（人工抽检 + LLM grader 辅助） |
| R8 | 用户被界面"锁死" | 违背原则 | V1/V2/V5：能力都在动作层；删除视图不减少能力；对话始终可用 |

---

## 15. 边界与 V1 / P1

### 15.1 V1 做

- 13 种块 + 页面 schema v1 + 宿主渲染器注册表（内置）；
- `ui.set_view`（create/replace/patch/rollback）+ 版本/回滚/软删 + 审计；
- 只读数据绑定（会话/任务/工作流/文件/记忆动作）+ 事件刷新 + as-of 一致；
- 动作绑定（块白名单/风险只调严/结果回填/幂等/来源审计）；
- 对话等价校验 + 自动复现评测 + fallback 体系；
- 安全校验（无代码/无 HTML/URL&markdown 白名单/作用域/大小限制）；
- API/WS 事件 + 前端视图页面入口（会话内"视图"标签）+ 默认 chat 降级。

### 15.2 P1 / 暂缓

- 自定义/第三方渲染器与插件（**明确不做**，除非未来单独评审）；
- 外链图片/外部资源 allowlist；
- 团队共享视图模板（团队 V2 之后）；
- 视图离线缓存、增量渲染、可视化编辑（用户拖拽生成 schema）；
- 生成式 UI（**永远不做**：违背无代码/可审计原则）。

---

## 16. 待确认（≤5，每条带默认）

1. **视图归属**：V1 视图只属于会话（`session_id`），不做全局/跨会话；默认是。后续是否允许"智能体级模板"由团队 V2 再定。
2. **视图数/大小上限**：每会话 ≤20 个视图、每页 ≤256KB、≤200 块；默认如此，可按实测校准。
3. **kanban 拖拽**：只映射到既有语义动作（cancel/retry/resume），不允许"任意改状态"动作；默认是（如需"改状态"必须先加动作到目录并过审批）。
4. **markdown 块是否允许外部链接**：V1 允许 http/https/mailto（`rel=noopener noreferrer`），不允许 data:/javascript:；默认是。
5. **视图入口形态**：会话内"视图"标签页（与对话/文件/概览并列），不做独立全屏 app；默认是。

---

## 17. 参考

- `docs/design-core.md` §6（视图等价原则：同一真相/可复现/可降级/可迁移/不锁定/展示例外）、§7（动作层唯一能力层；对话等价；审计；不可 UI-only）
- `design/15-开发路线图-v1.md` §后续顺序第 7 项（视图 Schema 最后；自定义视图必须等价于"同一套会话消息+动作"，能用默认对话复现）
- `docs/dsh-alignment.md` §7.2（DSH：UI=客户端插件+Slots+受控呈现元数据+事件投影；无生成式 UI；可抄"类型→注册表+受控描述符+事件投影"）
- `docs/m20-contract.md`（动作目录/风险分级/统一信封/UI 与对话共用动作；本契约向 `ui` 命名空间增补 `set_view/get_view/delete_view`）
- `docs/m19-contract.md`（审批/长时等待/幂等/预算；视图动作沿用）
- `docs/m21-memory-contract.md`、`docs/m22-recall-contract.md`（记忆/召回绑定源与不可信内容）
- `docs/m1-contract.md` §3（现有 REST/WS 契约）、`docs/m11-contract.md`（文件/概览绑定源）
- 现有前端模块（渲染器起点）：`frontend/src/features/{chat,tasks,memory,schedules,agents,workbench,sessions}`（MessageList/ChatCenter、SessionFilesView/DeliverablesBar、TaskPanel/TaskDetail、MemoryPage、UsagePage、HistoryRail、MarkdownMessage 等）

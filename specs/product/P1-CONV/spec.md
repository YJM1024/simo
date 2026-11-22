# P1 · 会话与消息（产品域 Spec）

状态：**active**（2026-11-21 行为级重写；AC 依据真实实现与真实测试证据重写，不再使用模板句。实现状态逐项标注，不把“接口存在”当“产品完成”）
> 产品域：`P1`；技术域码：`CONV`、`SYNC`；ID 规则见 [`../../../docs/product/ID-SPEC.md`](../../../docs/product/ID-SPEC.md)。
> 对应测试计划：[`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；功能树：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；追溯：[TRACEABILITY.md](../../../docs/product/TRACEABILITY.md)；收口总账：[CONV-CLOSURE.md](../../../docs/product/CONV-CLOSURE.md)。
> 变更包：[CHG-CONV-001](../../changes/CHG-CONV-001/spec.md)（会话管理）、[CHG-CONV-002](../../changes/CHG-CONV-002/spec.md)（消息与渲染）、[CHG-CONV-003](../../changes/CHG-CONV-003/spec.md)（输入与发送）、[CHG-CONV-004](../../changes/CHG-CONV-004/spec.md)（多标签与同步）、[CHG-CONV-005](../../changes/CHG-CONV-005/spec.md)（未读与通知，blocked）、[CHG-CONV-006](../../changes/CHG-CONV-006/proposal.md)（会话域收口，进行中）。

## 1. 目标

把“会话与消息”从零散接口/旧 FE 规格收敛成可验收的产品能力：每条 AC 描述**用户在界面上能观察到的行为**（操作 → 预期可见结果），并与真实测试证据一一对应；未实现的能力标 `unimplemented`，缺证据的写 `missing`，不得写成已完成。

本域覆盖 13 个 L3：`covered` 11、`conditional` 1（CONV-006）、`gap` 1（SYNC-005），13 个 PRD 均有可运行实现。
改造前覆盖口径（2026-11-21，CHG-CONV-006 前）：**0 covered / 12 partial / 1 gap** —— 验收面 12 = `CONV-001..008` + `SYNC-001..004`（新增 CONV-008）；六类产物已补齐（见各 PRD“六类状态”），但每个 PRD 仍至少缺一类可复现 AC 证据，故不升级 covered。本轮由 [CHG-CONV-006](../../changes/CHG-CONV-006/proposal.md) 收口到 12 covered。

## 2. 非目标与边界

### 2.1 本域不做

- 不定义组件视觉与代码结构；组件契约见 `specs/COMP-*`，变更开发 spec 见 `specs/changes/CHG-CONV-*/`。
- 不把后端路由/表存在等同于用户可用；没有入口或没有证据的能力最多 `partial`。
- 不为每个 PRD 新建独立 spec；功能点在本文档内以 PRD 章节维护。
- 不在本 spec 修改代码、测试或部署。
- **排除 SYNC-005（远程访问与通知中心）**：未实现、无鉴权与通知数据模型，其 AC 仅登记为 `unimplemented`，不计入 P1 验收通过面。
- **删除会话（显式非目标）**：用户裁决“会话暂时不允许删除，只允许归档”。本阶段不提供删除 UI、确认令牌、二次确认或级联；`DELETE /api/sessions/{id}` 当前固定 403 `R4_CONFIRM_REQUIRED`，是保护性占位，不是待补功能。后续若要删除，须新开变更包并定义确认令牌、主会话拒绝、子会话级联、事务与回滚；backlog 编号 `REQ-CONV-002-03`（非 AC，不计入本 PRD 验收面）。
- **子会话不可移动 / 换父（显式非目标）**：本阶段不提供“把子会话挂到其他会话下”的 UI、接口或数据迁移；父链只读展示，不提供换父操作。理由：用户裁决“暂先限定为不能移动”；后续若要做，必须新开 CHG，定义 parent 变更的权限、环检测、消息/任务归属与回滚迁移，不能以“补一个入口”处理。
- **草稿会话语义**：`POST /api/sessions` 返回 `201 draft=true`；草稿是**服务端内存态**，不出现在 `GET /api/sessions` 与 `/tree`，首条消息物化后才进入列表。因此草稿行只存在于当前标签的会话态里，刷新后会消失（以服务端为准），不视为数据丢失。草稿不请求 `spec-projection`，右栏显示“发送第一条消息后生成目标与执行态”占位，该占位优先于加载/错误/暂无投影；这与 §4.5 `AC-CONV-008-03` 的空态口径不冲突（草稿是独立前置态）。

### 2.2 “非 P1 但页面可见”的边界（不得算作 P1 覆盖，也不假装页面只有会话）

会话页面上可见、但不属于本域 AC 的能力，另属其他域，单独验收：

| 页面可见物 | 归属域 / ID | 在 P1 中的处理 |
|---|---|---|
| 工作台指标（工作台页、指标卡/趋势/延迟） | P3 / P10-METRIC | 非 P1，不计 P1 AC；仅 CONV-004 的“不噪入消息流”边界相关 |
| 右栏会话投影（目标/输入/状态三组） | **P1 / `PRD-CONV-008`（本轮新增，见 §4.5）** | 独立 AC：`AC-CONV-008-01..04`；不再以 CONV-004 近似覆盖 |
| 右栏任务投影（任务组、执行组） | P2-TASK-002 | 非 P1；`PRD-CONV-008` 只覆盖**投影呈现**（只读分组、展开、`messageId` 定位），不覆盖任务创建/执行/确认 |
| 右栏交付物（只读列表/打开） | P4-FILE | 非 P1；`PRD-CONV-008` 只覆盖投影列表的**只读呈现与打开展示**，不覆盖上传/预览/版本能力 |
| 右栏权限列表（只读） | P8-SET（权限） | 非 P1；P1 的“权限不足”只能以归档只读近似 |
| 卡片交互（提交/重试/取消） | M41 / `COMP-*` 卡片契约 | 非 P1 AC；CONV-004 只要求卡片**渲染**与只读/失败态正确 |
| 团队 / 日程 / 记忆 / 智能体 / 工作台独立页面 | P2–P10（冻结） | 不在本轮范围；不修改 |
| 流式过程中的“停止”后端真中断 | 属 CONV-005 的 AC，但依赖 SYNC-001 的 correct 帧 | 见 CONV-005 AC-02（3） |

## 3. 场景（行为组）

- **A 会话导航与生命周期**：左栏会话树加载 → 选中/新建/重命名 → 归档/恢复 → 归档只读；含树深度、父链、重启保持；置顶入口本轮交付（AC-CONV-001-04：会话行菜单置顶/取消置顶，主会话、草稿、归档不提供，同父级分组内排序、不跨层上浮）；删除为显式非目标（`REQ-CONV-002-03` backlog，不计入本 PRD 验收）；子会话本阶段不可移动/换父（见 §2.1）。
- **B 搜索与未读**：左栏搜索以**标题搜索**为主（`GET /api/sessions?q=`，跨全部会话含子会话），消息正文搜索降 P2、不在本阶段验收；搜索中有状态、无匹配有提示；未读为**会话级持久化读游标**（有/无两态，刷新/重启后保留），进入即已读，不做全站数字/条数，多标签共享同一游标（见 SYNC-004 与 AC-CONV-003-02/03）。
- **C 消息渲染与祖先**：用户/司墨消息、分类标签、Markdown 与代码块、复制、失败/流式、卡片只读、跨会话祖先逐级加载、时间轴跳转、413/403/空上级。
- **D 输入与发送**：Enter / Shift+Enter / Ctrl(⌘)+Enter、IME 组合、发送失败重试、重复提交防护、流式中停止、归档禁用。
- **E 实时同步与多标签**：WS 三态、`subscribe`/`since` 回放、多标签 `active_session_changed`/`ancestor_chain_changed`/`read_cursor_changed`、发送模式跨标签同步。
- **F 右栏会话投影**：目标/输入/状态三组 + 任务组/交付物只读列表的加载、错误重试、空态、展开折叠、按 messageId 定位（任务创建/执行、交付物上传/预览、权限组仍非 P1）。
- **H 四态边界**：空、加载、错误、权限不足在各面板的可见反馈与恢复；不展示假 0、假成功。

## 4. 功能点与需求

> 每个功能点含：PRD、优先级、实现状态、六类产物状态、目标行为（真实交互）、AC。目标行为是**产品要求**；AC 是**可验证断言**，括号内为现实证据或缺口。

### 4.1 L2 · 会话管理

#### PRD-CONV-001 · 会话树与主会话
<a id="prd-conv-001"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `covered`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-001](../../changes/CHG-CONV-001/spec.md) ✅ / 前端开发 spec ✅（`CHG-CONV-001/frontend.md`）/ 后端开发 spec ✅（`CHG-CONV-001/backend.md`）/ 组件 spec N/A（复用 Sidebar 组件，无独立 COMP）/ 任务卡 ✅ / test-plan ✅（TC-P1-001 pass）/ 执行证据 ✅（组件 + 集成 + API + E2E 01a/11，2026-11-21）
- 目标行为：
  1. 打开应用后左栏按 `GET /api/sessions/tree` 渲染会话树，主会话 `main` 与子会话以层级（缩进/父链）呈现，active 会话高亮；
  2. 点击或键盘 Enter 切换会话，中栏消息随之切换；切换不残留上一会话的消息；
  3. 新建子会话先落“草稿”（不写库），首次发送后物化为真实会话；重启后空草稿被清理；
  4. 双击会话名进入重命名，Enter 提交、Escape 取消且不落库；重命名经重启保持；
  5. 多级父链（≥3 级）可展开、循环父链被守卫拒绝；
  6. 左栏底部显示连接状态、用量/配额、会话数/消息数；底部汇总报**全局**口径（全部会话数、归档数、全部消息数），会话行内出现的消息数字报**该会话自身**消息数（不含子会话）；统计失败显示占位文案而非 0；
  7. 历史会话可展开/收起（归档列表开关）。
- AC：
  - `AC-CONV-001-01` 主路径：**Given** 存在 `main` 与至少一个子会话，**When** 用户点击/Enter 选中另一会话，**Then** 左栏高亮切换、中栏渲染该会话消息、无上一会话残留；**And** 新建/重命名/切换后右侧统计与会话数一致。证据：`Sidebar.test.tsx`（render/select/rename）、`TestM4SessionTreeAndRenamePersistAcrossRestart`、`TestTreeCreateRenameAndDescendants`、`CDP 01a`。
  - `AC-CONV-001-02` 异常/边界：**Given** 会话列表为空/加载中/请求失败/统计失败，**Then** 分别出现空态、加载态、错误+重试、统计占位，均不显示假 0；**And** 重命名按 Escape 不落库、新建后不产生孤立空会话（重启清理）；多级父链不破版、循环父链被拒。证据：`Sidebar.test.tsx`（空/加载/错误/重试）、`TestM70*`（草稿）、`TestM14SessionPathCycleGuard`。**缺**：无“切换后中栏内容变化”的 E2E（主会话归档已由 AC-CONV-001-03 独立承接）。
  - `AC-CONV-001-03` 主会话不可归档（**P6，默认裁决**）：**Given** `main` 为主会话，**When** 用户打开其会话菜单或直接 `POST /api/sessions/main/archive`，**Then** 归档入口置灰/不展示且服务端返回 409 `main_session_protected`（真实信封 `{"ok":false,"error":"主会话不可归档","code":"main_session_protected"}`；`blockers` 为**期望新增字段（未实现）**，值 `["主会话不可归档"]`），会话仍为 active、仍可继续对话；**And** 其他会话可正常归档；**And** `POST /api/sessions/main/unarchive` 返回 200 no-op（archived 状态不变）。**现状**：`spec.go:297-301` 已在 `Archive` 中拒绝 `main`，`http.go:334-345` 输出 409 信封；`m81_all_messages_test.go:85` 已断言 409，`App.conversation.test.tsx:107-120` 仍按旧行为断言，需随本 AC 改写。证据（目标）：后端用例（main 归档 409 `main_session_protected` + unarchive main 200 no-op + 子会话归档 200）+ 前端菜单禁用用例 + E2E。
  - `AC-CONV-001-04` 置顶入口（**P4，默认裁决，本轮交付**）：**Given** 会话行菜单（非主会话、非草稿、未归档），**When** 用户点“置顶/取消置顶”，**Then** 菜单项按 `session.pinned` 在“置顶/取消置顶”间切换并调用 `POST /api/sessions/{id}/pin|unpin`；成功后不本地排序；**置顶只影响其所在同级分组内的顺序（同级内按 `pinned DESC, created_at DESC`），不改变父子归属、不提升到顶层**，重启后保持；同级唯一子会话因无兄弟可比，置顶后行序不变属预期；**And** 主会话、草稿会话、归档会话不提供该项。证据：`Sidebar.test.tsx:148`（菜单项按 `pinned` 切换）、`:184`（归档行无“置顶”，只有“恢复”）、`App.conversation.test.tsx:103/116`（置顶/取消置顶后按服务端刷新）、`:643`（树里已归档的会话置顶被拒）、`App.operation-errors.test.tsx:101`（pin 失败 toast 且菜单与列表保持未置顶）、`ui1_test.go:97`（真 HTTP pin/unpin 与 `?pinned=`）、`tree_order_test.go:76/97/117/148/172`（同级序前移/复原/只改同级/幂等/树平表一致）、`pin_guard_test.go:40/86/129`（归档拒绝、409 `session_archived`、重启保持）、`management_test.go:44`（`pinned DESC, created_at DESC`）；`test-plan.md:135` 记 pass。
  - `AC-CONV-001-05` 行内消息数与全局汇总（**Lead 裁决，2026-11-22**）：**Given** 主会话与至少一个子会话同时存在且统计可用，**When** 左栏渲染会话行与底部汇总，**Then** 会话行内出现的消息数字等于**该会话自身**的消息数（核对该会话自己的消息列表并累计条数），不含其子会话、也不含其他会话；主会话行的数字不因含子会话而变大；**And** 底部汇总保持**全局**口径（全部 N 会话、归档 M、全局消息 X），不随选中会话切换而变化；**And** 统计失败时两处各自显示占位，不显示假 0。证据：`Sidebar.test.tsx:53/306` 与 `App.integration.test.tsx:222/244`（行内数字取该会话自身计数、底部保持全局统计；切换会话时行内数字变化而底部汇总不变）、`view.go:12` 与 `counts.go:16`（后端分别输出单会话 `messageCount` 与全局 stats）、`message_count_test.go`（4 条，含 `main.messageCount=75`、15 会话求和 209）；`test-plan.md:165` 记 pass。历史：此前行内取全局统计且只对选中行显示，已修复并由上述用例覆盖。

#### PRD-CONV-002 · 会话生命周期
<a id="prd-conv-002"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `covered`；删除为显式非目标）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-001](../../changes/CHG-CONV-001/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-CONV-005/006 pass）/ 证据 ✅（组件 + 集成 + API + E2E 08/09/10；失败反馈见 `App.operation-errors.test.tsx:49`（rename）、`:75`（archive）、`Sidebar.test.tsx:77`；恢复失败仅 CDP 覆盖，见 `test-plan.md:137`）
- 目标行为：
  1. 新建会话后立即出现在列表并被选中；
  2. 重命名持久化（重启后同名）；
  3. 归档后会话进入“已归档”列表、中栏只读（Composer 禁用）、对该会话发消息被服务端拒绝（返回错误而非继续回复）；
  4. 有运行中任务时归档被门禁阻断（`canArchive` 不为真则拒绝）；
  5. 恢复（unarchive）后会话回到普通列表，可继续对话；
  6. 生命周期请求失败时有可见反馈，不产生重复行、不出现“界面成功但库里没变”。
- AC：
  - `AC-CONV-002-01` 主路径：**When** 用户新建→重命名→归档→恢复，**Then** 每步列表与中栏状态即时且一致；归档后 Composer 禁用、发消息被拒；恢复后可继续对话；重启后名称/归档态保持。证据：`Sidebar.test.tsx`（archive/restore）、`TestM6ArchiveReadonlyAndUnarchive`、`TestM6ArchivedChatWSReturnsErrorNotReply`、`TestM6CanArchiveGateBlocksRunningTask`、`TestM70DraftNotPersistedThenMaterialized`。
  - `AC-CONV-002-02` 异常/边界：**Given** 创建/重命名/归档/恢复请求失败，**Then** 出现可见错误反馈、列表不被乐观改成“已成功”，重试后不产生重复或脏数据。证据：`TestM70RestartCleansEmptySessions`（草稿清理）、`TestM6ArchivedChatWSReturnsErrorNotReply`。**现状**：`frontend/src/app.tsx:465-476`（`toggleArchive`）与 `:552-562`（`rename`）已有 `try/catch` + `setOpError`；`toggleArchive` 在 catch 内 `return`（`:470-473`），`rename` 另 `throw` 给侧栏保留编辑态（`:556-560`）。前端 W1 已修复；`App.operation-errors.test.tsx:49/75/96/115` 与 `Sidebar.test.tsx:77` 已断言失败反馈与重试不产生重复行，`test-plan.md:137` 记 pass（重试计数 POST /api/sessions 2、archive 2、unarchive 2、read 2），见 `CHG-CONV-001/tasks.md` TASK-02/03 与 `CHG-CONV-006/tasks.md`。
  - 删除会话不在本 PRD 验收面：显式非目标，见 §2.1 `REQ-CONV-002-03`（backlog）。

#### PRD-CONV-003 · 会话搜索与未读
<a id="prd-conv-003"></a>

- 优先级：P1
- 实现状态：`implemented`（覆盖 `covered`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-001](../../changes/CHG-CONV-001/spec.md) ✅（搜索部分）/ 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅（含未读 blocked 卡）/ test-plan ✅（TC-P1-CONV-008/009/010 pass，行 7–9）/ 证据 ✅（搜索：集成 + E2E 14/15；未读：`App.conversation.test.tsx:148/161/179/213` + `unread_test.go:93`，`test-plan.md:156-158`）
- 目标行为：
  1. 左栏搜索框输入关键词后，会话列表按匹配结果过滤；搜索中有“搜索中”状态；无匹配显示空提示；
  2. 过滤依据是**服务端返回的命中会话 id 集合**，不在前端伪造；
  3. 产品语义（**P1，默认裁决**）：“会话搜索”= **标题搜索**（`GET /api/sessions?q=`，后端 `title LIKE %q%`，跨全部会话含子会话、含归档会话的可见范围）；UI 调 `GET /api/sessions?q=`（`api.ts:34`、`app.tsx:435`，`test-plan.md:140` 记 pass）；消息正文搜索降为 P2、不在本阶段验收（见 AC-CONV-003-03），全局正文搜索进 backlog；
  4. 未读：会话内有新消息且用户未进入该会话时，左栏该行显示**会话级未读点**（有/无两态，非数字、非全站汇总）；进入会话即标记已读；**读游标持久化**（刷新/重启后仍能正确显示），多标签共享同一游标（任一标签已读，全部标签已读）；实现需新增后端读游标表与接口，**属本阶段新增能力，不是收口**；通知中心另立项。原“回到底部 · N 条新消息”按钮计数保留为会话内提示，不承担未读口径。
- AC：
  - `AC-CONV-003-01` 主路径（标题搜索）：**Given** 多个会话的标题中含唯一关键词（含子会话），**When** 用户在左栏搜索框输入关键词，**Then** 前端调用 `GET /api/sessions?q=<词>`，列表按服务端返回的会话 id 过滤，搜索中状态可见、无匹配有空提示；**And** 不因消息正文命中而显示未命中标题的会话。证据：`Sidebar.test.tsx`（search/filter/server ids/searching/no-match）、`TestUI1SessionSearchAndPin`（标题搜索后端）。**现状**：UI 走 `GET /api/sessions?q=`（`api.ts:34`、`app.tsx:435`），`test-plan.md:140` 记 pass（CDP 调用清单无 `/api/messages/search`）。
  - `AC-CONV-003-02` 异常/边界：**Given** 标题搜索请求失败，**Then** 列表回退为空结果并显示错误提示，不把失败误报为“无匹配”；**And** 未读在刷新/重启/多标签下按**持久化读游标**恢复：刷新后不清空、不出现幽灵未读，任一标签已读后其他标签同步清除；粒度仍为会话级有/无，不做全站数字。证据：`Sidebar.test.tsx:114`（search 失败路径）、`App.conversation.test.tsx:161/179/213`、`unread_test.go:93`；`test-plan.md:157` 记 pass，未读持久化细节由 AC-SYNC-004-* 承接。
  - `AC-CONV-003-03` 标题搜索（**P1，默认裁决**）：**Given** 标题含关键词的会话（含子会话与已归档会话），**When** 在左栏搜索框输入关键词，**Then** 前端调用 `GET /api/sessions?q=<词>`（不再调 `/api/messages/search`），列表按返回的会话 id 过滤；**And** 无匹配显示空提示、请求中显示“搜索中”、失败显示错误并可重试；**And** 消息正文搜索降为 P2、不在本阶段验收，不影响本 AC。证据：`Sidebar.test.tsx:102`（断言调用 `/api/sessions?q=`）、`App.conversation.test.tsx:227`（标题命中且 `searchQueries` 为空）、`TestUI1SessionSearchAndPin`（后端标题搜索）、E2E 14/15；`test-plan.md:140` 记 pass（CDP 调用清单只含 `/api/sessions?q=`，无 `/api/messages/search`）。

### 4.2 L2 · 消息与渲染

#### PRD-CONV-004 · 消息流与渲染
<a id="prd-conv-004"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `covered`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-002](../../changes/CHG-CONV-002/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 ⚠️（`COMP-message-colors` 契约已按现状契约化，实现与 hex 逐值一致；**未走独立签收流程**，签收缺口保留）/ 任务卡 ✅ / test-plan ✅（TC-P1-004 pass）/ 证据 ✅（18/18 + API category 14+5 + E2E 01a/02）
- 目标行为：
  1. 用户消息与司墨消息视觉区分（对齐/底色/角色标识）；分类标签（`category` 有值才渲染）按分类表驱动展示，不显示空标签；
  2. Markdown：围栏代码块、行内代码、长文本自动换行不横向溢出；宽表格在消息内自己的滚动容器 `.msg-table-wrap` 中横向滚动，不撑破消息列与页面；
  3. 复制消息文本成功有“已复制”反馈；Clipboard 不可用时用 `execCommand` 降级，降级成功/失败都不报错；
  4. 流式中显示光标，失败消息带失败徽标并可重试；
  5. 卡片消息渲染标题/字段/按钮；已提交后按钮禁用；`readOnly`（归档）时卡片控件禁用；
  6. 消息流只含对话消息，不含 system/internal 控制消息；消息不可编辑（编辑端点返回禁用错误）；
  7. 消息分页加载（默认 100 条），翻页不重复、不乱序。
- AC：
  - `AC-CONV-004-01` 主路径：**Given** 含用户/司墨/分类标签/代码块/表格/卡片/流式消息的会话，**When** 浏览并复制，**Then** 角色与分类标签正确、代码块与长文不溢出、复制有反馈、流式光标/失败徽标正确、卡片提交态与只读态正确；**And** 表格区域在 `.msg-table-wrap` 内横向滚动，页面与 `.conversation-scroll` 不溢出（1180 档 wrap clientWidth 496 / scrollWidth 819、可滚到 323；375 档 331/819、可滚到 488；两档 `table` 自身 819/819、不自溢；`.conversation-scroll` 1180 档 568/568、375 档 359/359，文档宽度分别 1180/375，ACCEPT-CONV-9 §2.5）。证据：`MessageItem.test.tsx` 18/18、`TestM41Cards*`、`TestM11MessagePagination`、`CDP 04a`。
  - `AC-CONV-004-02` 异常/边界：**Given** Clipboard 抛错/卡片提交失败/归档只读/internal 消息混入，**Then** 降级复制、卡片保留输入并显示错误可重试、控件禁用、internal 消息不出现在接口与流中。证据：`MessageItem.test.tsx`（fallback/failed card/readOnly）、`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`、`TestM50MessageEditingDisabled`。**缺**：消息纯度由 AC-CONV-004-03 独立承接；“空/加载”由域级 E1 承接（partial）。
  - `AC-CONV-004-03` 消息纯度（**P6，默认裁决**）：**Given** 会话中存在 `internal`/system 控制消息或仅内部使用的卡片事件，**When** 用户浏览消息流或调用 `GET /api/sessions/{id}/messages`，**Then** 消息流只含对话消息（user/assistant），internal 消息不出现在接口返回、WS 帧或 UI；**And** 卡片消息仍以卡片渲染、不因纯度规则丢失；**And** 消息不可编辑（编辑端点返回禁用错误）。证据：`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`、`TestM50MessageEditingDisabled`（已存在，缺口仅在“无独立 AC”；本轮补齐映射，不改行为）。

#### PRD-CONV-007 · 祖先消息整级加载
<a id="prd-conv-007"></a>

- 优先级：P1
- 实现状态：`implemented`（已签未部署）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-002](../../changes/CHG-CONV-002/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 ⚠️（`COMP-timeline-groups`/`-tip` 仍 `spec ready`，与 8 条组件测试通过不一致）/ 任务卡 ✅ / test-plan ✅（TC-P1-005 pass）/ 证据 ✅（component + 集成 5 条祖先用例 + API + E2E 04a–04d；prepend 锚定缺陷已修复）
- 目标行为：
  1. 进入子会话时按祖先链逐级加载全部消息（`GET /api/sessions/{id}/messages/all`），父会话消息在前、按时间排序、按 id 去重；
  2. 祖先消息在视觉上弱化（opacity），移动端隐藏时间轴但仍可读；
  3. 左侧时间轴每消息一根 bar，点击跳转；键盘（焦点+Enter/箭头/Home/End）可跳；tooltip 有 hover 延迟与关闭宽限；
  4. 上级加载返回 413（过大）时显示错误并可重试，重试成功后补齐；403（无权）时视为“无上级”并继续当前会话对话；
  5. 切换会话清空祖先链，不串消息；切回时恢复各会话滚动位置。
- AC：
  - `AC-CONV-007-01` 主路径：**Given** ≥2 级父子会话，**When** 进入子会话，**Then** 祖先消息整级出现、按时间排序、id 去重，时间轴 bar 数与消息数一致，点击/键盘可跳转，切会话清链、切回恢复滚动。证据：`App.integration.test.tsx`（祖先加载/去重/清链/滚动恢复）、`TimelineGroups.test.tsx` 8/8、`TestM81AllSessionMessages`、`CDP 04a–04d`。
  - `AC-CONV-007-02` 异常/边界与时间轴命中：**Given** 上级接口 413/403/空上级，**Then** 413 显示错误且重试可成功、403 与空上级都按“无上级”继续且不阻塞发消息、重复消息不渲染两遍；**And** 时间轴以整条轨道（宽 44px）为连续命中面，轨道内任意点映射到纵向最近的刻度，刻度视觉条可小于 44×44（6px 间距下逐条 44×44 必然重叠，几何不可满足，孤立控件的 44×44 口径不适用于密集时间轴）；**And** 点击后平滑滚动结束（70 条消息实测约 0.9 秒）时目标消息进入视口，且当前高亮（active）等于被点击的刻度；验收取样点为点击后 900ms，200ms 中间快照不作失败判据（ACCEPT-CONV-9 §2.3）；能置顶时顶部即目标消息；受滚动到底限制无法置顶的最后若干条，只要求进入视口且 active 正确。证据：`App.integration.test.tsx`（413 重试/403 空祖先）、`TestM89AllMessagesLimitsAndErrors`、`TimelineGroups.test.tsx`（整列命中/最近刻度）。验证备注：conv7 构建 `mwrdab5a-liehy` 真机 18 点矩阵偏差 0、19 点扫描 0 死区、track 44×662.95 连续可点、列外 1px 不触发。**缺**：413/403 仅前端 mock，无真实后端集成；未部署验证。

### 4.3 L2 · 输入与发送

#### PRD-CONV-005 · 发送·流式·断线重连
<a id="prd-conv-005"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `covered`，2026-11-22 收口）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-003](../../changes/CHG-CONV-003/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-006 pass，`AC-CONV-005-01/02` 判 pass）/ 证据 ✅（component + 集成重连/去重 + 后端 WS 4 测 + 停止定向 `stop_interrupt_test.go:32`/`:402` + 幂等 7 测）/ 残余未验证：断网 e2e、真实厂商连接级中断、跨标签双 WS
- 目标行为：
  1. 发送：点击发送或快捷键提交 → `POST /api/chat` 接受（202）→ 输入框清空 → 通过 WS 收 `delta` 增量追加、`done` 收尾；
  2. 流式中显示“停止”，点击后不再追加该回复（前端忽略后续帧并发 correct 帧请求中止）；
  3. 发送失败：输入文本保留、显示可读错误、可直接重试；重试不产生重复消息；
  4. 重复提交防护：同一时刻只允许一个发送在途；
  5. 断线：WS 断开显示重连中，按退避（800ms 起 ×1.8，上限 5000ms）重连，重连后用 `since` 续传，不丢消息、不重复渲染；
  6. 幂等：请求携带 `clientMutationId`，服务端据此去重（已实现，见 `backend/internal/modules/chat/idempotency.go`；`client_mutations` 表、TTL 7d、在途等待 5s，7 条测试在 `backend/cmd/simo/p1_conv_chat_idempotency_test.go`）。
- AC：
  - `AC-CONV-005-01` 主路径：**When** 用户发送文本，**Then** 消息乐观出现、流式增量渲染、done 后为终态、输入清空；停止后不再增长，停止只作用于被点消息，同会话其它流不受影响。证据：`Composer.test.tsx`（send/clear/streaming-stop）、`TestWebSocketEventOrder`、`TestM2MockStreamRecordsUsageAndDecision`、`stop_interrupt_test.go:402`（同会话双流只停目标）、`App.conversation.test.tsx:455`（逐条帧各带 messageId）、`CDP 02/05`。
  - `AC-CONV-005-02` 异常/边界：**Given** 发送失败、重复点击、WS 断开、停止中，**Then** 文本保留可重试、不重复提交、断线可见并按退避重连、`since` 续传不丢不重、停止后不追加。证据：`Composer.test.tsx`（失败恢复/防重复）、`TestM55StartupRecoversStaleStreaming`、`TestM55StreamingWatchdogTimeout`、`TestWebSocketSinceContinuation`。剩余未验证：真实厂商连接级中断（本机 `api.deepseek.com` 仍 403，停止用例用可控假上游）；跨标签双 WS（并发用例是同一条 WS 上的两条流）；前端无独立 `since` 回放用例，重连补拉 `App.conversation.test.tsx:486` 与后端 `p1_conv_ws_test.go:386` 共同覆盖不丢不重。停止真中断已覆盖：`stop_interrupt_test.go:32`（单流取消上游）、`:402`（双流只停目标）。

#### PRD-CONV-006 · Composer 输入与快捷键
<a id="prd-conv-006"></a>

- 优先级：P0
- 实现状态：`implemented`
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-003](../../changes/CHG-CONV-003/spec.md) ✅ / 前端 ✅ / 后端 N/A（纯前端交互，写 N/A+理由）/ 组件 ⚠️（`COMP-composer-send-mode` 仍 `spec ready`，未签收）/ 任务卡 ✅ / test-plan ✅（TC-P1-CONV-018 pass / TC-P1-CONV-019 partial）/ 证据 ✅（10/10 + 新增 5 条 + E2E 03；后端仅请求校验）
- 目标行为：
  1. 两种发送模式：`enter`（Enter 发送、Shift+Enter 换行）与 `shift-enter`（Shift+Enter 发送、Enter 换行）；Ctrl/⌘+Enter 在两种模式下都发送；
  2. 模式切换按钮 aria 状态与提示文案同步变化，选择写入 `localStorage`（`simo.composer.sendMode`），并迁移旧 key；
  3. 中文输入法组合期间按 Enter 不发送；
  4. 无 active 会话或会话已归档时 Composer 禁用；流式中显示停止；
  5. 发送失败错误区可读；长文本不截断。
- AC：
  - `AC-CONV-006-01` 主路径：**Given** 当前为 `enter` 模式，**When** Enter / Shift+Enter / Ctrl+Enter / ⌘+Enter，**Then** 分别发送/换行/发送/发送；**When** 切到 `shift-enter` 模式，**Then** 快捷键行为反转、按钮 aria 与提示同步、刷新后模式保持。证据：`Composer.test.tsx`（Enter、Shift+Enter、Ctrl/Meta、模式持久化）、`CDP 03`。
  - `AC-CONV-006-02` 异常/边界：**Given** IME 组合中、发送失败、无会话/归档、长文本，**Then** 组合中不发送、失败可恢复且文本保留、禁用态明确、长文本不截断。证据：`Composer.test.tsx`（IME/失败恢复/disabled/long text）。跨标签模式同步归 SYNC-003，已由 `Composer.test.tsx:144/178/198/219` 覆盖（`test-plan.md:155` 记 pass）。**缺**：真实中文输入法未手测（无输入法环境），本 AC 保持 `partial`（`test-plan.md:149`，§15 M-05）。

### 4.4 L2 · 多标签与同步

#### PRD-SYNC-001 · WS 连接与重连
<a id="prd-sync-001"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `covered`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-004](../../changes/CHG-CONV-004/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-CONV-020/021 pass）/ 证据 ✅（后端 WS 4 测 + 前端重连集成）/ ⚠️（断网 e2e replay 与 since 保留窗口缺）
- 目标行为：
  1. 连接 `GET /api/ws` 后发送 `subscribe{sessionId,since}`；事件按 seq 有序投递；
  2. 状态三态可见：connected / reconnecting / closed（连接点颜色/文案）；
  3. 断开后自动重连（退避 800ms→5000ms），重连带 `since` 续传，不重复渲染；
  4. 同会话多客户端 fanout（两个标签都能收到）；
  5. 归档会话的 WS 聊天请求返回错误帧，不继续回复；
  6. 启动时发现“流式中”残留消息会被恢复为失败态（避免永远转圈），流式看门狗超时同样收尾。
- AC：
  - `AC-SYNC-001-01` 主路径：**When** 打开页面并订阅，**Then** 连接态可见、事件有序、`since` 补发、双客户端都能收到。证据：`TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients`、`App.integration.test.tsx`（seq 去重）。
  - `AC-SYNC-001-02` 异常/边界：**Given** 断线/归档/残留流式，**Then** 显示重连中并重连成功、归档请求返回错误、残留被恢复为失败态。证据：`TestM6ArchivedChatWSReturnsErrorNotReply`、`TestM55StartupRecoversStaleStreaming`、`TestM55StreamingWatchdogTimeout`。证据补充：前端 close→open 重连与断线补拉见 `App.conversation.test.tsx:486`（`test-plan.md:151` 记 pass）。**缺口**：`since` 日志截断/保留窗口未定义。

#### PRD-SYNC-002 · 多标签 active/ancestor/read cursor
<a id="prd-sync-002"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `covered`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-004](../../changes/CHG-CONV-004/spec.md) ✅ / 前端 ✅ / 后端 N/A（BroadcastChannel 纯前端，写 N/A+理由）/ 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-CONV-022/023 pass）/ 证据 ✅（BroadcastChannel 单测 10 条 + E2E 13，`test-plan.md:152-153` 记 pass；peer 为模拟双实例，真双标签缺）
- 目标行为：
  1. 标签 A 切会话 → 其他标签跟随切换（广播 `active_session_changed`，带 `at` 与 tabId；同一 `at` 用 tabId 字典序 tiebreak，避免回抖；忽略自己 tabId，并用 remoteActiveRef 抑制回声）；
  2. 标签 A 加载祖先链 → 其他标签按 chain key 去重后合并（`ancestor_chain_changed`，逐会话拉 all messages 合并）；
  3. 标签 A 读到最新 → 广播 `read_cursor_changed`，其他标签在 `at >= 本地游标` 时清未读；
  4. BroadcastChannel 不可用时静默降级（不影响单标签使用）。
- AC：
  - `AC-SYNC-002-01` 主路径：**Given** 两个同源标签，**When** A 切会话/加载祖先/读消息，**Then** B 的 active、祖先链、未读分别跟随且不重复、不来回跳。证据：`App.tabsync.test.tsx:115`（active 跟随、忽略自身与旧帧）、`:148`（祖先合并且不重复）、`:165`/`:340`（三级祖先逐级加载）、`:235`/`:273`/`:297`/`:316`（读游标随 `at` 清未读、更旧不回退、重复幂等）；`App.tabsync.channel.test.tsx:98/113`；peer 用 `CapturingBroadcastChannel` 模拟，真双标签见 §15 M-03。
  - `AC-SYNC-002-02` 异常/边界：**Given** 两标签同 `at` 冲突/重复广播/不支持 BroadcastChannel，**Then** 有确定性 tiebreak、重复不叠加、降级不报错。证据：`App.tabsync.test.tsx:189/211`（同 `at` 按 tabId 字典序、两种到达序收敛同一终态）、`:148`（重复广播不叠加）、`:297`（更小 tabId 来晚不清已读）、`App.tabsync.degrade.test.tsx`（无 `BroadcastChannel` 挂载不抛、切会话仍生效、重挂恢复）；`test-plan.md:153` 记 pass。tiebreak 由 `at`+`tabId` 字典序保证，`opId` 未参与去重。

#### PRD-SYNC-003 · 发送模式/设置跨标签同步
<a id="prd-sync-003"></a>

- 优先级：P1
- 实现状态：`implemented`（覆盖 `covered`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-004](../../changes/CHG-CONV-004/spec.md) ✅ / 前端 ✅ / 后端 N/A / 组件 ⚠️（`COMP-composer-send-mode` `spec ready`）/ 任务卡 ✅ / test-plan ✅（TC-P1-CONV-024/025 pass）/ 证据 ✅（单标签持久化 + 跨标签/降级单测 `Composer.test.tsx:144/178/198/219` + E2E 13）
- 目标行为：
  1. 切换发送模式后写入 `localStorage`，刷新保持；
  2. 同一浏览器其他标签通过 `BroadcastChannel('simo.composer.sendMode.v1')` 或 `storage` 事件最终一致（双通道）；
  3. 无 BroadcastChannel 时退化为 `storage` 事件，仍可用；
  4. 按钮 aria-pressed/aria-label 与模式一致。
- AC：
  - `AC-SYNC-003-01` 主路径：**When** 切换模式，**Then** 当前标签按钮态与快捷键行为立即变化、刷新后保持。证据：`Composer.test.tsx::toggles send mode, persists it and changes keyboard behavior`。
  - `AC-SYNC-003-02` 异常/边界：**Given** 两个标签/无 BroadcastChannel，**Then** 另一标签最终一致、降级不报错。证据：`Composer.test.tsx:144`（storage 事件跨标签）、`:178`（真 `BroadcastChannel` 双实例）、`:198`（无通道降级仍可用并持久化）、`:219`（构造器抛错不崩、storage 兜底）；`test-plan.md:155` 记 pass。单进程双实例，真实两标签见 §15 M-03。

#### PRD-SYNC-004 · 未读与已读游标
<a id="prd-sync-004"></a>

- 优先级：P1
- 实现状态：`implemented`（覆盖 `covered`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-005](../../changes/CHG-CONV-005/spec.md)（**blocked**；口径已裁决，实际由 [CHG-CONV-006](../../changes/CHG-CONV-006/proposal.md) W3 承接）/ 前端 ✅ / 后端 ✅（读游标表/接口已实现）/ 组件 N/A / 任务卡 ✅（CHG-CONV-005 全 blocked → CHG-CONV-006）/ test-plan ✅（TC-P1-011 pass）/ 证据 ✅（`App.conversation.test.tsx:148/161/179/213`、`unread_test.go:93`、`p1_conv_unread_test.go:93`）
- 目标行为（**P2，默认裁决，2026-11-21；同日用户改判为持久化**）：
  1. 未读是**会话级有/无标记**；不做条数、不做全站汇总数字、不做数字徽标；
  2. 新消息到达且该会话不是当前 active 会话 → 置位；用户进入（激活）该会话 → 立即标记已读并清除；任一标签已读即全标签已读；
  3. 左栏该会话行显示**未读点**（有/无两态）；归档会话同样可有未读点；
  4. **持久化读游标**：刷新/重启后仍能正确显示未读；读游标按会话保存，进入即写已读；多标签共享同一游标（任一标签已读，全部标签已读）；**需新增后端读游标表与接口，属本阶段新增能力，不是收口**；
  5. 通知中心/系统级提醒另立项，不与本 PRD 同源（SYNC-005 边界）。
- AC：
  - `AC-SYNC-004-01` 主路径：**Given** 两个会话、当前 active 为 A，**When** B 收到新消息，**Then** B 行出现未读点、A 行无；**When** 用户切到 B，**Then** 未读点立即消失且切回 A 后不再出现；**When** 刷新或重启，**Then** B 的已读状态保持，不重新出现未读。证据：`App.conversation.test.tsx:148`（未读点+进入清除）、`:179`（`session_unread` 合并刷新）、`Sidebar.test.tsx:126`（只出点、无数字）、`unread_test.go:93`（重启持久化）；`test-plan.md:156` 记 pass。
  - `AC-SYNC-004-02` 异常/边界：**Given** 刷新、服务端重启、跨标签，**Then** 刷新/重启后未读按持久化游标恢复（已读不复活、未读不丢）、另一标签已读后本标签未读点清除、不出现幽灵未读；**And** 游标读写失败时左栏不显示假未读/假已读，进入会话仍可重试。证据：`App.conversation.test.tsx:161`（`session_read` 后刷新并信服务端）、`:213`（写失败保留红点+toast）、`:179`、`unread_test.go:93`、`p1_conv_unread_test.go:93`；`test-plan.md:157` 记 pass。
  - `AC-SYNC-004-03` 会话级持久化读游标（**P2，默认裁决**）：**Given** 任一标签收到某会话新消息，**When** 该会话非 active，**Then** 该会话显示未读点；**When** 用户进入该会话或任一标签标记已读，**Then** 所有标签该会话未读点清除；**And** 读游标写后端并在刷新/重启后恢复；**And** 不显示全站汇总数字/条数、不做跨设备同步、不把通知中心纳入本 AC。证据：`App.conversation.test.tsx:161/179`、`Sidebar.test.tsx:126`、跨标签 CDP 双 target（`test-plan.md:158`）；读游标写后端并在重启后恢复（`unread_test.go:93`）→ pass；实现属本阶段新增能力，不是收口。

#### PRD-SYNC-005 · 远程访问与通知中心
<a id="prd-sync-005"></a>

- 优先级：P2
- 实现状态：`unimplemented`
- 六类状态：产品 spec ✅（仅登记）/ CHANGE [CHG-CONV-005](../../changes/CHG-CONV-005/spec.md)（blocked）/ 前端 ❌ / 后端 ❌ / 组件 ❌ / 任务卡 ❌（未拆）/ test-plan ✅（TC-P1-CONV-028/029 blocked）/ 证据 ❌
- 目标行为：**未定义**（无鉴权模型、无设备管理、无通知渠道与数据模型；与当前 127.0.0.1 无鉴权基线冲突）。
- AC：
  - `AC-SYNC-005-01` 主路径：`unimplemented`，不计入 P1 验收通过面；不得对外宣称可用。
  - `AC-SYNC-005-02` 异常/边界：同上，仅登记为规划项。

### 4.5 L2 · 右栏会话投影

#### PRD-CONV-008 · 右栏会话投影（本轮新增）
<a id="prd-conv-008"></a>

- 优先级：P1
- 实现状态：`implemented`（覆盖 `covered`；组件/后端/6 条 `RightPanel.test.tsx` 已有，但此前无 PRD/AC）
- 六类状态：产品 spec ✅（本节）/ CHANGE [CHG-CONV-006](../../changes/CHG-CONV-006/proposal.md) ✅ / 前端开发 spec ⚠️（待 CHG-CONV-006 补 `frontend.md` §CONV-008）/ 后端开发 spec ⚠️（`spec_projection.go` 已有契约，待补 `backend.md`）/ 组件 N/A（复用 `library.tsx` 的 `OverviewPanel`，无独立 COMP）/ 任务卡 ⚠️（W2 补）/ test-plan ⚠️（TC 待补）/ 证据 ✅（`RightPanel.test.tsx` 6 条 + `m75_spec_projection_test.go` + `m87_task_message_mapping_test.go` + E2E 01a/06）
- 目标行为：
  1. 右栏 `aside.inspector` 展示当前会话的投影三组：**状态**（`status` 中文映射、`rev N`、`待确认 N`）、**目标**（`goal`；空时按状态给“目标待生成/本会话未记录目标”）、**输入**（`constraints` + `inputs`；空显示“暂无输入约束”）；
  2. **执行会话**组：已完成/进行中/未开始三组，首屏各 **3** 条（当前实现值）并标注该组 `total`；当某组 `total` 大于首屏条数时，**展开必须取到剩余条目**，展开后组头计数与可见条目数一致；不允许出现 `total` 大于可见条目却无法继续获取的状态；补取失败显示可见错误并可重试。每条带 `messageId` 时点击可定位到对应消息。**产品要求**：未开始组只展示 `pending`，运行中组只展示 `running`，不得混入 pending。**实现现状**：`frontend/src/components/library.tsx:700-704` 已将 `done`/`running`/`pending` 分别映射到三组，运行中不再混入 pending；`RightPanel.test.tsx:51-67` 已断言 pending 只出现在“未开始”；但 `ExecutionGroup` 展开只在首屏 3 条内切换，不补取，`total` 大于 3 时显示与可见不一致（`ACCEPT-CONV-4` 已判 `AC-CONV-008-02` 失败）。
  3. **交付物**组：只读列表（前 8 条 + 下载链接）；交付物打开走既有下载；不在右栏提交/重试/取消；
  4. 四态：加载=“右栏加载中…”，错误=“右栏加载失败”+重试，无投影=“暂无会话投影”，无会话时不崩且不伪造 `data-session`；
  5. 契约：`GET /api/sessions/{id}/spec-projection?taskLimit=1..50`（默认 3；越界 400 `invalid_task_limit`；会话不存在 404）；响应带 `ETag`，`If-None-Match` 命中 304；
  6. 窄屏（375）：右栏不渲染（sidebar 与 inspector 均 `display:none`，无抽屉入口），中栏主操作不被遮挡，遮挡判定不适用；投影内容在右栏显示的宽度档（>1024px）可读。
- AC：
  - `AC-CONV-008-01` 主路径（状态/目标/输入）：**Given** 有投影的会话，**When** 打开右栏，**Then** 三组按上述规则渲染，`rev`/`待确认` 与接口一致；**Given** 无投影，**Then** 显示“暂无会话投影”而非空白/假 0。证据：`RightPanel.test.tsx`（目标/输入/状态/rev/待确认）。
  - `AC-CONV-008-02` 任务组与交付物：**Given** 三组任务与交付物，**When** 展开/收起、点击带 `messageId` 的任务、点击交付物下载，**Then** 展开态正确、定位到对应消息、下载可用；`total` 大于首屏时的补取与计数见 `AC-CONV-008-05`；**And** 右栏不提供提交/重试/取消入口。证据：`RightPanel.test.tsx`（分组展开 + `messageId` 透传 + 交付物打开）、`m87_task_message_mapping_test.go`。
  - `AC-CONV-008-03` 四态与窄屏：**Given** 加载中/请求失败/无投影/无会话，**Then** 分别显示加载、错误+重试、空态、不崩；**And** 375 宽下抽屉不可达（sidebar 与 inspector 均不渲染），因此遮挡判定不适用；Composer 与发送按钮可见比例 1.0、文档 `scrollWidth=375` 不溢出。证据：`RightPanel.test.tsx:21/29/175`、`ExecRowHitArea.test.tsx:254`、`test-plan.md:163`（ACCEPT-CONV-9 §2.4：sidebar/inspector 矩形 0×0、无 toggle、Composer 359×144、发送 54×28）。
  - `AC-CONV-008-04` 契约与缓存：**Given** `taskLimit` 越界/会话不存在/`If-None-Match` 命中，**Then** 分别 400 `invalid_task_limit`、404、304；**And** 304 时前端不重复渲染、不闪空。证据：`spec_projection_etag_test.go:67/97/145/182/207`（Stable/NotModified/TracksTaskChange/TracksDeliverables/DistinguishesTaskLimit）、`m75_spec_projection_test.go:23/71`（投影内容/limit/404）、`api.test.ts:244/260/282/290/295`（304 返回缓存、`taskLimit` 各自 ETag、`cache=false`、500 仍抛、LRU）、`App.conversation.test.tsx:633`（304 保留搜索行与 active）、`spec_projection.go:127-141`（304 空体且保留 ETag/Cache-Control）；真机 304 已补（200/304/`taskLimit=50` 200，`.tmp/accept8/304-live.json`），`test-plan.md:164` 记 pass。残余：浏览器内 304 视觉不闪空仍沿用 jsdom 断言，未单独录屏。
  - `AC-CONV-008-05` 任务组展开补取（**Lead 裁决，2026-11-22**）：**Given** 某状态组首屏条数为 3、该组 `total` 大于 3（例如已完成 `total=6/items=3`、未开始 `total=4/items=3`），**When** 用户展开该组，**Then** 展开动作取到该组剩余条目，展开后可见条目数等于 `total`，组头计数与可见条目一致（不得折叠时显示 `3/3` 而实际总数为 6）；**And** 任一组不得停留在 `total` 大于可见条目且无法继续获取的状态；**And** 补取失败显示可见错误并可重试，不静默截断、不把失败当空组。证据：`RightPanel.test.tsx:59`、`App.integration.test.tsx:262/289/315`（`done.total=6/items=3` 展开到 6/6、`pending.total=4` 展开到 4/4、补取 500 显示“右栏加载失败”并可重试）、`library.tsx:1001`（组头 `{shown}/{totalCount}` 与补取条件）、`app.tsx:424-457`（`loadRight`/`expandRightGroup`）；E-ACC5 真机展开后条目数与接口 `total` 一致，`test-plan.md:166` 记 pass。残余：补取失败时错误态与已加载列表同时可读的组件级负断言仍缺（G18）。

## 5. 验收标准（A1–A8）

| ID | 验收标准（可判定） | 适用性 | 2026-11-21 状态 |
|---|---|---|---|
| A1 | 全部 P0 PRD（CONV-001/002/004/005/006、SYNC-001/002）主路径可走通，结果与状态一致 | 必验 | **部分**：11 条 E2E 通过；无重连/多标签主路径 |
| A2 | 空、加载、错误、权限不足在左栏/中栏/右栏/Composer 至少各有可见反馈，不静默、不假 0 | 必验 | **部分**：E1/E2/E3 partial；权限只能以归档只读近似（无鉴权 UI） |
| A3 | 有 UI 的功能点可用键盘完成主路径（Tab/Enter/Escape/箭头/Home/End），焦点可见 | 有 UI 必验 | **部分**：键盘用例有；无 axe/对比度/全键盘遍历 |
| A4 | 375/768/1280 三档不横向溢出、不遮挡主操作 | 有 UI 必验 | **部分**：仅 375（CDP 01b）；无 768/1280 |
| A5 | 不展示假 0/假成功；未实现/无证据项在界面与文档中明确标注 | 必验 | **部分**：统计占位已验；未读/远程无界面标注 |
| A6 | 权限/隔离默认拒绝（归档只读、越权路径不依赖前端隐藏按钮） | 涉及权限必验 | **部分**：归档只读后端测试有；无鉴权面 |
| A7 | `unimplemented`（SYNC-005）在 TREE/TRACEABILITY/spec 中一致标注，不计 covered | 必验 | **满足**（文档口径一致） |
| A8 | 每个 AC 至少映射一个用例；证据缺失写 `missing`，不写“通过” | 必验 | **部分**：35 行 AC 已映射（test-plan §3）；有效 33 = 32 pass / 1 partial（`AC-CONV-006-02` 待真实中文 IME）/ 2 blocked（SYNC-005 未实现），无未映射的 pass 项 |

## 6. 当前实现状态与未实现项

| PRD | 功能点 | 状态 | 说明（2026-11-22） |
|---|---|---|---|
| `PRD-CONV-001` | 会话树与主会话 | `implemented`（覆盖 `covered`） | 主路径+四态有组件/API 证据；**主会话不可归档（守卫已存在，AC-001-03）**；置顶入口本轮交付（AC-001-04）；切换中栏无 E2E |
| `PRD-CONV-002` | 会话生命周期 | `implemented`（覆盖 `covered`） | 归档/恢复/草稿有证据；失败反馈与“重试不产生重复/脏数据”已由 `App.operation-errors.test.tsx:49/75/96/115`、`Sidebar.test.tsx:77` 覆盖，`test-plan.md:137` 记 `AC-CONV-002-02` pass（重试计数 POST /api/sessions 2、archive 2、unarchive 2、read 2）；删除为显式非目标（`REQ-CONV-002-03` backlog），不计入验收面；DELETE 固定 403 保护性占位、UI 不暴露 |
| `PRD-CONV-003` | 会话搜索与未读 | `implemented`（覆盖 `covered`） | 标题搜索与未读均已有证据；**标题搜索为主（AC-003-03），消息正文搜索降 P2**；未读为会话级持久化读游标（SYNC-004，已实现并通过） |
| `PRD-CONV-004` | 消息流与渲染 | `implemented`（覆盖 `covered`） | 18/18 + API 证据；消息纯度已升独立 AC-004-03（证据已有）；COMP-message-colors 未签收 |
| `PRD-CONV-007` | 祖先消息整级加载 | `implemented`（覆盖 `covered`） | 祖先/时间轴/413/403 有证据；整列命中已真机验证（ACCEPT-CONV-6）、未部署；两个 COMP 未签收 |
| `PRD-CONV-008` | 右栏会话投影 | `implemented`（覆盖 `covered`） | 组件 + 后端 + 6 条组件测试 + E2E 01a/06；真机 spec-projection 200→304（ETag `spec-c5a2d772dd1d5d88`、304 空体）与 375 四态截图已补（ACCEPT-CONV-8）；375 下 sidebar 与 inspector 均 `display:none`、无抽屉入口，遮挡判定不适用；Composer 359×144、发送 54×28、可见比例 1.0、文档 `scrollWidth=375`（`test-plan.md:163`，ACCEPT-CONV-9 §2.4） |
| `PRD-CONV-005` | 发送·流式·断线重连 | `implemented`（覆盖 `covered`） | 发送/流式/失败/防重复有证据；停止按 `messageId` 定向已验真（`stop_interrupt_test.go:32`/`:402`、`App.conversation.test.tsx:455`）；幂等已实现（`idempotency.go` + 7 测）；残余未验证：真实厂商连接中断、跨标签双 WS、断网 e2e |
| `PRD-CONV-006` | Composer 输入与快捷键 | `implemented`（覆盖 `conditional`） | 10/10 + 新增 5 条；`AC-CONV-006-02` 真实中文输入法待人工验证（33 条生效 AC 中唯一 partial）；COMP 未签收 |
| `PRD-SYNC-001` | WS 连接与重连 | `implemented`（覆盖 `covered`） | 后端顺序/since/fanout/恢复有证据；前端 close→open 重连与断线补拉由 `App.conversation.test.tsx:486` 覆盖，`test-plan.md:151` 记 pass；`since` 日志截断/保留窗口仍未定义 |
| `PRD-SYNC-002` | 多标签 active/ancestor/read cursor | `implemented`（覆盖 `covered`） | `App.tabsync.test.tsx:115/148/165/189/211/235/273/297/316/340`、`App.tabsync.channel.test.tsx:98/113`、`App.tabsync.degrade.test.tsx` 覆盖 active/祖先/读游标、同 `at` tiebreak 与降级，`test-plan.md:152-153` 记 pass；peer 为模拟双实例，真双标签时序仍归 §15 M-03 |
| `PRD-SYNC-003` | 发送模式/设置跨标签同步 | `implemented`（覆盖 `covered`） | 单标签持久化与跨标签/降级均有测试：`Composer.test.tsx:144/178/198/219`，`test-plan.md:155` 记 pass；真实两标签时序见 §15 M-03 |
| `PRD-SYNC-004` | 未读与已读游标 | `implemented`（覆盖 `covered`） | 会话级持久化读游标已实现（后端表/接口 + 前端接入）；`AC-SYNC-004-01/02/03` 全 pass；SYNC-005 仍排除在本轮验收外 |
| `PRD-SYNC-005` | 远程访问与通知中心 | `unimplemented` | 无实现；无鉴权/通知模型；排除在本轮验收外 |

**未实现项（unimplemented）**：`PRD-SYNC-005`。
**覆盖口径**：**出口预期 12 covered / 0 partial / 1 gap（SYNC-005）**；**当前状态以证据为准：11 covered / 1 conditional（CONV-006）/ 0 partial / 1 gap（SYNC-005）**（`specs/test/P1-CONV/test-plan.md`：33 条生效 AC = 32 pass / 1 partial `AC-CONV-006-02`，SYNC-005 2 条 blocked）。删除/子会话移动为**显式非目标**，不计缺口；`implemented` 只表示“可运行实现 + 部分证据”。改造前统计为 0 covered / 12 partial / 1 gap。

## 7. 依赖、风险、待确认与边界清单

- 依赖：本域行为依赖 `SYNC-001` 的 WS 通道与 `SYNC-002` 的标签广播；WS 不可用时 P1 主路径只能走 HTTP 回退（当前无回退）。
- 风险 1：旧 `docs/tasks/frontend.md` 与后端能力面不一致；本 spec 不把“后端有接口”当“前端可用”（如 DELETE 仍 403 占位、标题搜索）。
- 风险 2：组件 spec 与实现漂移（message-colors / timeline-groups / timeline-tip / composer-send-mode 均未按实现签收）。
- 风险 3：未读口径已裁决（会话级持久化读游标），实现与用例已补（`unread_test.go:93`、`App.conversation.test.tsx:148/161/179/213`，`test-plan.md:156-158` 记 pass）；`CHG-CONV-005` 仍为 blocked 历史包，由 `CHG-CONV-006` 收口。
- 已裁决（**默认裁决，2026-11-21，用户可在 spec review 推翻**）：① 搜索=标题搜索（`GET /api/sessions?q=`，跨全部会话含子会话；消息正文搜索降 P2、不在本阶段验收，全局正文进 backlog）→ AC-CONV-003-03；② 未读=会话级持久化读游标（进入即已读、刷新/重启保留、多标签共享、不做全站数字/条数、通知中心另立项；需新增后端表/接口，属本阶段新增能力）→ AC-SYNC-004-01..03；③ 删除会话 = 显式非目标/backlog `REQ-CONV-002-03`（用户裁决暂不允许删除；不从本 PRD AC 验收；DELETE 固定 403 保护性占位、UI 不暴露；后续新 CHG 才定义确认令牌/主会话拒绝/级联/回滚）；④ pin 入口进 UI（本轮验收面：会话行菜单置顶/取消置顶；主会话、草稿、归档不提供；置顶只影响同级分组内顺序，不改变父子归属、不提升到顶层，同级内排序以后端返回为准）→ AC-CONV-001-04；⑤ 右栏会话投影新增 `PRD-CONV-008`（P1）→ §4.5；⑥ 主会话不可归档升 `AC-CONV-001-03`、消息纯度升 `AC-CONV-004-03`；⑦ 子会话不可移动/换父（显式非目标，后续新 CHG）→ §2.1。
- 仍待确认：SYNC-005 是否立项（本轮明确排除，保持 gap）；未读粒度仍为会话级有/无，若后续改判条数/全站数字，需另开 CHG，不回改已发布 AC 编号。
- **非 P1 但页面可见（另域验收，不计入本域）**：工作台指标（P3/P10）、右栏任务投影（P2-TASK-002）、交付物（P4）、权限只读（P8）、卡片交互（M41/COMP）、团队/日程/记忆/智能体/工作台独立页面（P2–P10 冻结）。
- 证据：测试计划 [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；未执行项一律 `missing`；逐 PRD 六类状态与 owner 见 [`CONV-CLOSURE.md`](../../../docs/product/CONV-CLOSURE.md)。

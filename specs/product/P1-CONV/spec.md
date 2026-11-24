# P1 · 会话与消息（产品域 Spec）

状态：**active**（2026-11-21 行为级重写；AC 依据真实实现与真实测试证据重写，不再使用模板句。实现状态逐项标注，不把“接口存在”当“产品完成”）
> 产品域：`P1`；技术域码：`CONV`、`SYNC`；ID 规则见 [`../../../docs/product/ID-SPEC.md`](../../../docs/product/ID-SPEC.md)。
> 对应测试计划：[`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；功能树：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；追溯：[TRACEABILITY.md](../../../docs/product/TRACEABILITY.md)；收口总账：[CONV-CLOSURE.md](../../../docs/product/CONV-CLOSURE.md)。
> 变更包：[CHG-CONV-001](../../changes/CHG-CONV-001/spec.md)（会话管理）、[CHG-CONV-002](../../changes/CHG-CONV-002/spec.md)（消息与渲染）、[CHG-CONV-003](../../changes/CHG-CONV-003/spec.md)（输入与发送）、[CHG-CONV-004](../../changes/CHG-CONV-004/spec.md)（多标签与同步）、[CHG-CONV-005](../../changes/CHG-CONV-005/spec.md)（未读与通知，blocked）、[CHG-CONV-006](../../changes/CHG-CONV-006/proposal.md)（会话域收口，进行中）。

## 1. 目标

把“会话与消息”从零散接口/旧 FE 规格收敛成可验收的产品能力：每条 AC 描述**用户在界面上能观察到的行为**（操作 → 预期可见结果），并与真实测试证据一一对应；未实现的能力标 `unimplemented`，缺证据的写 `missing`，不得写成已完成。

本域覆盖 12 个 L3：`covered` 12、`conditional` 0、`gap` 0，12 个 PRD 均有可运行实现与可复现证据。
改造前覆盖口径（2026-11-21，CHG-CONV-006 前，13 个 PRD 含当时未移除的 SYNC-005）：**0 covered / 12 partial / 1 gap** —— 验收面 12 = `CONV-001..008` + `SYNC-001..004`（新增 CONV-008）；六类产物已补齐（见各 PRD“六类状态”），但每个 PRD 仍至少缺一类可复现 AC 证据，故不升级 covered。本轮由 [CHG-CONV-006](../../changes/CHG-CONV-006/proposal.md) 收口到 12 covered / 0 partial / 0 gap。

## 2. 非目标与边界

### 2.1 本域不做

- 不定义组件视觉与代码结构；组件契约见 `specs/COMP-*`，变更开发 spec 见 `specs/changes/CHG-CONV-*/`。
- 不把后端路由/表存在等同于用户可用；没有入口或没有证据的能力最多 `partial`。
- 不为每个 PRD 新建独立 spec；功能点在本文档内以 PRD 章节维护。
- 不在本 spec 修改代码、测试或部署。
- **SYNC-005 已移除（2026-11-22 用户裁决）**：远程访问与通知中心不在 P1 范围，编号不复用；后续若要做，需先立鉴权 PRD。
- **删除会话（显式非目标）**：用户裁决“会话暂时不允许删除，只允许归档”。本阶段不提供删除 UI、确认令牌、二次确认或级联；`DELETE /api/sessions/{id}` 当前固定 403 `R4_CONFIRM_REQUIRED`，是保护性占位，不是待补功能。后续若要删除，须新开变更包并定义确认令牌、主会话拒绝、子会话级联、事务与回滚；backlog 编号 `REQ-CONV-002-03`（非 AC，不计入本 PRD 验收面）。
- **子会话不可移动 / 换父（显式非目标）**：本阶段不提供“把子会话挂到其他会话下”的 UI、接口或数据迁移；父链只读展示，不提供换父操作。理由：用户裁决“暂先限定为不能移动”；后续若要做，必须新开 CHG，定义 parent 变更的权限、环检测、消息/任务归属与回滚迁移，不能以“补一个入口”处理。
- **草稿会话语义**：`POST /api/sessions` 返回 `201 draft=true`；草稿是**服务端内存态**，不出现在 `GET /api/sessions` 与 `/tree`，首条消息物化后才进入列表。因此草稿行只存在于当前标签的会话态里，刷新后会消失（以服务端为准），不视为数据丢失。草稿不请求 `spec-projection`，右栏显示“发送第一条消息后生成目标与执行态”占位，该占位优先于加载/错误/暂无投影；这与 §4.5 `AC-CONV-008-03` 的空态口径不冲突（草稿是独立前置态）。

### 2.2 “非 P1 但页面可见”的边界（不得算作 P1 覆盖，也不假装页面只有会话）

会话页面上可见、但不属于本域 AC 的能力，另属其他域，单独验收：

| 页面可见物 | 归属域 / ID | 在 P1 中的处理 |
|---|---|---|
| 工作台指标（工作台页、指标卡/趋势/延迟） | P3 / P10-METRIC | 非 P1，不计 P1 AC；仅 CONV-004 的“不噪入消息流”边界相关 |
| 右栏会话投影（目标/输入/状态三组） | **P1 / `PRD-CONV-008`（本轮新增，见 §4.5）** | 独立 AC：`AC-CONV-008-01..04`；不再以 CONV-004 近似覆盖 |
| 右栏任务投影（任务组、执行组） | P2-TASK-002（执行面）/ **P1 / `PRD-CONV-009`（会话内呈现，见 §4.6）** | 任务卡片、右栏三标签、任务详情、任务图、编排与归属归 `PRD-CONV-009`；任务执行器、生命周期状态机、复杂度分级仍归 P2-TASK-002，编号不动 |
| 右栏交付物（只读列表/打开） | P4-FILE（存储与下载实现）/ **P1 / `PRD-CONV-009`（标签呈现）** | 交付物标签的分组、类型徽标与来源任务归 `PRD-CONV-009`；上传/预览/版本与文件落盘实现归 P4-FILE |
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
- **I 会话内任务与编排**：发起单个/批量任务 → 消息流出现任务卡片 → 右栏概览/任务/交付物三标签查看与定位 → 计划或边做边想详情只读回看 → 任务图看依赖四态 → 编排等待、失败与取消、交付物下载；任务只属发起会话，无系统自动超时（见 §4.6）。

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
  - `AC-CONV-001-01` 主语=左栏 `.session-item` 与中栏消息列；条件=`main` 与 ≥1 子会话，`pointerup` 命中另一行；动作=切换 active 会话；判据=切换后 500ms 内 `aria-current` 行 `data-session-id`=目标 ID，旧会话 `messageId` 出现 0 条（容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-001-01.mjs。
    其余情形：中栏渲染该会话消息、新建/重命名/切换后右侧统计与会话数一致；证据：`Sidebar.test.tsx`（render/select/rename）、`TestM4SessionTreeAndRenamePersistAcrossRestart`、`TestTreeCreateRenameAndDescendants`、`CDP 01a`；缺：切换后中栏变化的 E2E。
  - `AC-CONV-001-02` 主语=左栏四态占位节点；条件=会话树接口返回空集/未响应/500/`stats=null`；动作=打开页面；判据=四种占位各 1 个、数字 `0` 出现 0 处（采样=首帧后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-001-02.mjs；待拆：四态占位与重命名 Escape、草稿清理、父链守卫四条判据被并成一行。
    其余情形：Escape 提交后 `PUT /api/sessions/{id}` 调用 0 次、重启后空草稿 0 条、三级父链路径 3 段、循环父链被拒；证据：`Sidebar.test.tsx`、`TestM70*`、`TestM14SessionPathCycleGuard`。
  - `AC-CONV-001-03` 主语=归档端点响应与 `main` 行；条件=`main` 为 active 主会话；动作=归档；判据=HTTP 409、code=main_session_protected、archived=false 保持（采样=响应体，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-001-03.mjs；待拆：归档拒绝、unarchive no-op、其他会话可归档分属三个端点。
    证据：`spec.go:297-301`（拒绝 main）、`http.go:334-345`（409 信封）、`m81_all_messages_test.go:85`、`App.conversation.test.tsx:107-120`（仍按旧行为断言，需随本 AC 改写）。
  - `AC-CONV-001-04` 主语=会话行菜单置顶项与 `session.pinned`；条件=非主/非草稿/未归档会话且 `pinned=0`；动作=点击置顶；判据=文案变“取消置顶”、`pin` 端点调用 1 次、该行成为同级第一条且其余同级行保持原有相对顺序、取消置顶后恢复原序、跨层级不上浮且子会话始终在父会话之下（采样=重排后，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-001-04.mjs；待拆：切换动作（含取消置顶恢复原序）、同级排序、入口可见性、重启保持四种取样。
    证据：`Sidebar.test.tsx:148/184`、`App.conversation.test.tsx:103/116`、`App.operation-errors.test.tsx:101`、`tree_order_test.go:76/97/117`、`pin_guard_test.go:40/86/129`、`management_test.go:44`（`pinned DESC, created_at DESC`）。
  - `AC-CONV-001-05` 主语=会话行 `.session-count` 与底部汇总；条件=`main` 与 ≥1 子会话；动作=渲染并切换会话；判据=行内数=该会话 `messageCount`、底部=全部会话之和，切换后行内变而底部不变（采样=切换后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-001-05.mjs；待拆：行内单会话计数与底部全局汇总共用一行，口径不同、对象不同。
    其余情形：统计失败时两处各显示占位、数字 `0` 出现 0 处；样例 `main=75`、15 会话和 209；证据：`Sidebar.test.tsx:53/306`、`App.integration.test.tsx:222/244`、`message_count_test.go`、`view.go:12`、`counts.go:16`。

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
  - `AC-CONV-002-01` 主语=`data-archived`、`.composer` 与 `sessions.name`；条件=新会话走新建→重命名→归档→恢复；动作=依次提交四步；判据=每步后 500ms 列表态与中栏态同源：归档后 `disabled` 1 个、恢复后 0 个，重启后 `name` 与 `archived` 逐字段相等（容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-002-01.mjs。
    证据：`Sidebar.test.tsx`（archive/restore）、`TestM6ArchiveReadonlyAndUnarchive`、`TestM6ArchivedChatWSReturnsErrorNotReply`、`TestM6CanArchiveGateBlocksRunningTask`、`TestM70DraftNotPersistedThenMaterialized`。
  - `AC-CONV-002-02` 主语=四个端点失败响应与列表行数；条件=创建/重命名/归档/恢复各返回 500；动作=失败后手动重试 1 次（不要求自动重试）；判据=错误提示节点 1 个、创建/重命名失败后输入框值等于提交值、列表行数差 0、`archived` 不变（采样=失败响应后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-002-02.mjs；待拆：创建/重命名/归档/恢复四种失败各要一次取样。
    证据：`App.operation-errors.test.tsx:49/75/96/115`、`Sidebar.test.tsx:77`、`app.tsx:465-476`（toggleArchive）、`:552-562`（rename）；重试计数 POST /api/sessions 2、archive 2、unarchive 2、read 2。
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
  - `AC-CONV-003-01` 主语=搜索框与 `GET /api/sessions?q=` 响应 id 集；条件=≥1 会话标题含唯一关键词；动作=输入关键词；判据=请求含 `q=` 1 次、列表行 `data-session-id` 集=响应集（差 0）、`/api/messages/search` 0 次（采样=防抖后 300ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-003-01.mjs。
    其余情形：搜索中状态节点 1 个、无匹配空提示 1 个、失败错误 1 个；证据：`Sidebar.test.tsx`（search/filter/server ids/searching/no-match）、`TestUI1SessionSearchAndPin`、`api.ts:34`、`app.tsx:435`。
  - `AC-CONV-003-02` 主语=搜索失败态与未读点；条件=标题搜索 500，或刷新后看已读会话；动作=重开页面；判据=失败后列表 0 行且错误节点 1 个、已读会话未读点 0 个（采样=加载后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-003-02.mjs；待拆：搜索失败与未读游标恢复是两套机制，分属两个 PRD。
    其余情形：任一标签已读后其他标签未读点清除、粒度只有有/无两点、无数字节点；证据：`Sidebar.test.tsx:114`、`App.conversation.test.tsx:161/179/213`、`unread_test.go:93`。
  - `AC-CONV-003-03` 主语=标题搜索请求；条件=关键词命中标题（含子会话与归档会话）；动作=输入关键词；判据=`/api/sessions?q=` 1 次、`/api/messages/search` 0 次、行集与响应 id 集差 0（采样=防抖后 300ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-003-03.mjs；待拆：与 AC-CONV-003-01 同一断言重复。
    其余情形：无匹配空提示、请求中“搜索中”、失败可重试；正文搜索降 P2 不作判据；证据：`Sidebar.test.tsx:102`、`App.conversation.test.tsx:227`、`TestUI1SessionSearchAndPin`、E2E 14/15。

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
  - `AC-CONV-004-01` 主语=用户条目与司墨条目；条件=会话含两类消息条，视口 1180 与 375；动作=目视两档截图；判据=用户条目左对齐 4/4、司墨右对齐 4/4，底色与 `--msg-user`/`--msg-assistant` 一致（采样=两档首屏，容差 0）；判定=`人工:目视`；脚本=`N/A：角色对齐与底色无 DOM 判据`；待拆：渲染多项、溢出数值、复制反馈、视觉区分混在一条。
    实测：1180 档 `.msg-table-wrap` 496/819、375 档 331/819、`table` 819/819 不自溢；表格溢出、复制反馈、流式光标、卡片态待拆后各挂脚本；证据：`MessageItem.test.tsx` 18/18、`CDP 04a`、ACCEPT-CONV-9 §2.5。
  - `AC-CONV-004-02` 主语=复制反馈与卡片失败态；条件=剪贴板抛错、卡片 500、有 internal 消息；动作=复制、提交、拉取；判据=已复制 0 个且 execCommand 1 次、卡片输入值不变且错误 1 个、接口 internal 0 条（采样=响应后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-004-02.mjs；待拆：剪贴板降级、卡片失败、只读、internal 四条独立路径。
    证据：`MessageItem.test.tsx`（fallback/failed card/readOnly）、`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`、`TestM50MessageEditingDisabled`。
  - `AC-CONV-004-03` 主语=消息接口、WS 帧与 UI 条目；条件=库中有 internal 消息与卡片事件；动作=拉取并连 WS；判据=三处 internal 计数 0、卡片 `data-kind=card` ≥1、编辑端点禁用（采样=加载后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-004-03.mjs；待拆：接口纯度、WS 纯度、UI 纯度、卡片保留、编辑禁用五处判据。
    证据：`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`、`TestM50MessageEditingDisabled`。

#### PRD-CONV-007 · 祖先消息整级加载
<a id="prd-conv-007"></a>

- 优先级：P1
- 实现状态：`implemented`（已签未部署）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-002](../../changes/CHG-CONV-002/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 ⚠️（`COMP-timeline-groups`/`-tip` 仍 `spec ready`，与 8 条组件测试通过不一致）/ 任务卡 ✅ / test-plan ✅（TC-P1-005 pass）/ 证据 ✅（component + 集成 5 条祖先用例 + API + E2E 04a–04d；prepend 锚定缺陷已修复）
- 目标行为：
  1. 进入子会话时按祖先链逐级加载全部消息（`GET /api/sessions/{id}/messages/all`），父会话消息在前、按时间排序、按 id 去重；
  2. 祖先消息在视觉上弱化（opacity），移动端隐藏时间轴但仍可读；
  3. 左侧时间轴每消息一根 bar，点击跳转；键盘（焦点+Enter/箭头/Home/End）可跳；tooltip 有 hover 延迟与关闭宽限；
  4. 上级加载返回 413（过大）时显示错误并可重试，重试成功后补齐；403（无权）时给出 1 条非阻断中性提示并继续当前会话对话；空上级静默按无上级处理；
  5. 切换会话清空祖先链，不串消息；切回时恢复各会话滚动位置。
- AC：
  - `AC-CONV-007-01` 主语=`messages/all` 结果与轨道条数；条件=≥2 级父子会话、祖先 12 条；动作=进入子会话；判据=去重后 12 条、`createdAt` 逆序对 0、条数=消息数、切会话后祖先 0 条（采样=加载后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-007-01.mjs；待拆：整级加载、时间轴条数、键盘跳转、清链、滚动恢复五种取样。
    证据：`App.integration.test.tsx`（祖先加载/去重/清链/滚动恢复）、`TimelineGroups.test.tsx` 8/8、`TestM81AllSessionMessages`、`CDP 04a–04d`。
  - `AC-CONV-007-02` 主语=上级响应与 `.tl-track` 命中；条件=上级接口 413/403/空；动作=进入子会话点轨道；判据=413 时提示 1 条且重试补祖先；403 时提示 1 条、无「失败」「错误」字样、发送 1 次、切会话不残留、再触发仍 1 条；空上级时错误与提示各 0 条；采样=点击后 900ms、容差 0；判定=`自动`；脚本=scripts/ac/AC-CONV-007-02.mjs；待拆：三条错误路径与时间轴整列命中。
    时间轴：轨道宽 44px，轨道内任一点映射纵向最近刻度，点击后 900ms 目标进入视口且 active=被点刻度；18 点矩阵偏差 0、19 点扫描死区 0、列外 1px 不触发；祖先链：用 fetch 桩（`Page.addScriptToEvaluateOnNewDocument` 包装 `window.fetch`，规则经 `sessionStorage('__acStub')` 注入）对父级 `messages?scope=all` 返回 413/403/200 空数组，403 与空上级按上述条数判；证据：`App.integration.test.tsx`、`TestM89AllMessagesLimitsAndErrors`、`TimelineGroups.test.tsx`、`.tmp/ac/AC-CONV-007-02.json`、ACCEPT-CONV-9 §2.3。

### 4.3 L2 · 输入与发送

#### PRD-CONV-005 · 发送·流式·断线重连
<a id="prd-conv-005"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `covered`，2026-11-22 收口）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-003](../../changes/CHG-CONV-003/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-006 pass，`AC-CONV-005-01/02` 判 pass）/ 证据 ✅（component + 集成重连/去重 + 后端 WS 4 测 + 停止定向 `stop_interrupt_test.go:32`/`:402` + 停止上游 `stop_upstream_test.go` 三断言 + 幂等 7 测）/ 环境限制：真实厂商 `api.deepseek.com` 本机 403，连接级中断不可达，按产品侧机制判定；断网 e2e 与跨标签双 WS 仍属未取证据项，不作为 AC 判据
- 目标行为：
  1. 发送：点击发送或快捷键提交 → `POST /api/chat` 接受（202）→ 输入框清空 → 通过 WS 收 `delta` 增量追加、`done` 收尾；
  2. 流式中显示“停止”，点击后不再追加该回复（前端忽略后续帧并发 correct 帧请求中止）；
  3. 发送失败：输入文本保留、显示可读错误、可直接重试；重试不产生重复消息；
  4. 重复提交防护：同一时刻只允许一个发送在途；
  5. 断线：WS 断开显示重连中，按退避（800ms 起 ×1.8，上限 5000ms）重连，重连后用 `since` 续传，不丢消息、不重复渲染；
  6. 幂等：请求携带 `clientMutationId`，服务端据此去重（已实现，见 `backend/internal/modules/chat/idempotency.go`；`client_mutations` 表、TTL 7d、在途等待 5s，7 条测试在 `backend/cmd/simo/p1_conv_chat_idempotency_test.go`）。
- AC：
  - `AC-CONV-005-01` 主语=`POST /api/chat` 消息、delta 与输入框；条件=active 可发送，输入 1 条；动作=发送并在流中停止；判据=消息 500ms 内 1 条、`done` 后输入长度 0、停止后 messageId 增量 0、他流 >0（采样=帧到达，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-005-01.mjs；待拆：发送主路径与按 messageId 定向停止共用一行。
    证据：`Composer.test.tsx`（send/clear/streaming-stop）、`TestWebSocketEventOrder`、`stop_interrupt_test.go:402`、`App.conversation.test.tsx:455`、`CDP 02/05`。
  - `AC-CONV-005-02` 主语=上游 context 与 delta 数；条件=假上游 SSE 流式中；动作=发停止帧；判据=停止后 10ms context 关闭、两类 delta 0 帧、落库 0 条、回 idle、retracted 先于 idle（采样=10ms、2s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-005-02.mjs；待拆：失败保留、防重复提交、断线退避、停止机制四类判据。
    环境限制：真实厂商 `api.deepseek.com` 本机 403，连接级中断未观测，不作判据；证据：`stop_upstream_test.go`、`STOP-UPSTREAM-EVIDENCE-20261122.md`（5 PASS/0 FAIL）、`TestWebSocketSinceContinuation`。

#### PRD-CONV-006 · Composer 输入与快捷键
<a id="prd-conv-006"></a>

- 优先级：P0
- 实现状态：`implemented`
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-003](../../changes/CHG-CONV-003/spec.md) ✅ / 前端 ✅ / 后端 N/A（纯前端交互，写 N/A+理由）/ 组件 ⚠️（`COMP-composer-send-mode` 仍 `spec ready`，未签收）/ 任务卡 ✅ / test-plan ✅（TC-P1-CONV-018 pass / TC-P1-CONV-019 pass）/ 证据 ✅（10/10 + 新增 5 条 + E2E 03；后端仅请求校验）
- 目标行为：
  1. 两种发送模式：`enter`（Enter 发送、Shift+Enter 换行）与 `shift-enter`（Shift+Enter 发送、Enter 换行）；Ctrl/⌘+Enter 在两种模式下都发送；
  2. 模式切换按钮 aria 状态与提示文案同步变化，选择写入 `localStorage`（`simo.composer.sendMode`），并迁移旧 key；
  3. 中文输入法组合期间按 Enter 不发送；
  4. 无 active 会话或会话已归档时 Composer 禁用；流式中显示停止；
  5. 发送失败错误区可读；长文本不截断。
- AC：
  - `AC-CONV-006-01` 主语=输入框 keydown 与 `.mode-toggle`；条件=`enter` 与 `shift-enter` 两态；动作=按 Enter/Shift+Enter/Ctrl+Enter/⌘+Enter；判据=键后 100ms 发送数符合 4×2 映射、`aria-pressed` 与模式一致、刷新后 localStorage 值不变（容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-006-01.mjs。
    证据：`Composer.test.tsx`（Enter、Shift+Enter、Ctrl/Meta、模式持久化）、`CDP 03`。
  - `AC-CONV-006-02` 主语=输入框与错误节点；条件=IME 组合中、发送 500、无 active；动作=按 Enter、发送、重试；判据=组合中 Enter 发送 0 次且 isComposing=true、失败后输入不变且错误 1 个、禁用属性 1 个（采样=100ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-006-02.mjs；待拆：IME、失败恢复、禁用态、长文本四条件合写。
    长文本：输入 5000 字后 `scrollHeight`≥内容高度、截断 0 处；证据：`Composer.test.tsx`、`IME-EVIDENCE-20261122.md`（五点验证）、`test-plan.md` §15 M-05。

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
  - `AC-SYNC-001-01` 主语=WS 连接态节点与 `seq`；条件=两个客户端订阅同一会话；动作=打开并订阅；判据=连接态 1 个、`seq` 严格递增且重复 0、`since` 补发数=断开期帧数、两客户端 `seq` 集相等（采样=订阅后 2s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-001-01.mjs；待拆：连接态、事件有序、since 补发、双客户端 fanout 四条判据。
    证据：`TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients`、`App.integration.test.tsx`（seq 去重）。
  - `AC-SYNC-001-02` 主语=重连中节点与归档错误帧；条件=WS 断开、归档会话发消息、有残留流式；动作=重连、发送、重载；判据=重连中 1 个且 5000ms 内 connected、归档错误帧 1 个且回复 0 个、残留 1s 内变 `failed`（采样=各事件后，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-001-02.mjs；待拆：断线重连、归档错误帧、残留恢复三条独立路径。
    证据：`TestM6ArchivedChatWSReturnsErrorNotReply`、`TestM55StartupRecoversStaleStreaming`、`TestM55StreamingWatchdogTimeout`、`App.conversation.test.tsx:486`。

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
  - `AC-SYNC-002-01` 主语=标签 B 的 active、祖先与未读点；条件=同源 A/B，通道可用；动作=A 切会话、加载祖先、读消息；判据=B 的 active=A、祖先去重重复 0 条、未读随 at 清 0、回跳 0 次（采样=A 广播后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-002-01.mjs；待拆：active 跟随、祖先合并、读游标三条同步通道。
    peer 为 `CapturingBroadcastChannel` 模拟，真双标签缺；证据：`App.tabsync.test.tsx:115/148/165/340`、`App.tabsync.channel.test.tsx:98/113`。
  - `AC-SYNC-002-02` 主语=`at`+`tabId` tiebreak 与降级路径；条件=两标签同 `at`、重复广播、无通道；动作=两种到达序广播并重挂；判据=两序终态相同、重复广播后未读增量 0、无通道挂载异常 0 次且切会话仍生效（采样=广播后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-002-02.mjs；待拆：同 at 冲突、重复广播、无通道降级三条独立路径。
    tiebreak 只由 `at`+`tabId` 字典序决定，`opId` 不参与；证据：`App.tabsync.test.tsx:189/211/297`、`App.tabsync.degrade.test.tsx`。

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
  - `AC-SYNC-003-01` 主语=`.mode-toggle` 的 `aria-pressed` 与 `localStorage`；条件=当前 `enter`；动作=点切换；判据=点击后 100ms `aria-pressed` 反转、Enter 行为反转、`localStorage`=`shift-enter`，刷新后不变（采样=点击后 100ms 与刷新后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-003-01.mjs。
    证据：`Composer.test.tsx::toggles send mode, persists it and changes keyboard behavior`、`CDP 03`。
  - `AC-SYNC-003-02` 主语=标签 B 的 `.mode-toggle`；条件=两标签同源或通道构造抛错；动作=A 切换模式；判据=B 的 `aria-pressed` 500ms 内=A、广播 1 次、抛错 0 次且仍持久化（采样=切换后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-003-02.mjs；待拆：跨标签一致与无通道降级两条路径。
    证据：`Composer.test.tsx:144/178/198/219`、`test-plan.md:155`；单进程双实例，真两标签缺。

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
  5. 通知中心/系统级提醒不在本域范围（原 SYNC-005 已移除，编号不复用）。
- AC：
  - `AC-SYNC-004-01` 主语=B 行未读点；条件=两会话、active=A，B 收新消息；动作=收帧后切到 B；判据=收帧后 500ms B 行点 1 个、A 行 0 个；切到 B 后 500ms 点 0 个，刷新后仍 0（采样=三处，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-004-01.mjs；待拆：置位、进入清除、刷新保持三个取样点。
    证据：`App.conversation.test.tsx:148/179`、`Sidebar.test.tsx:126`（只出点、无数字）、`unread_test.go:93`（重启持久化）。
  - `AC-SYNC-004-02` 主语=重启后未读点与写失败 toast；条件=服务端重启、另一标签已读、`read` 端点 500；动作=重载并进入会话；判据=已读会话点 0 个、未读会话 1 个、写失败保留点 1 个且 toast 1 个（采样=加载后 1s 与响应后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-004-02.mjs；待拆：重启恢复、跨标签清除、写失败三条独立路径。
    证据：`App.conversation.test.tsx:161/179/213`、`unread_test.go:93`、`p1_conv_unread_test.go:93`。
  - `AC-SYNC-004-03` 主语=读游标 `read_at` 与未读点；条件=任一标签收到非 active 会话新消息；动作=进入会话标记已读；判据=点由 1 变 0（差 1）、`read_at`≥消息 `createdAt`、刷新后点 0 个（采样=标记后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-SYNC-004-03.mjs；待拆：与 AC-SYNC-004-01、-02 语义重复。
    不显示全站汇总数字节点（0 个）、不做跨设备同步、不含通知中心；证据：`App.conversation.test.tsx:161/179`、`unread_test.go:93`、`test-plan.md:158`。

> PRD-SYNC-005 已移除（2026-11-22 用户裁决）：远程访问与通知中心不在范围内，编号不复用。

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
  - `AC-CONV-008-01` 主语=`aside.inspector` 三组文本与 `rev`；条件=投影接口返回数据；动作=打开右栏；判据=三组节点各 1 个、`rev N` 与 `待确认 N` 等于响应字段（差 0）、无投影时空态 1 个且数字 0 处（采样=加载后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-008-01.mjs；待拆：三组渲染与无投影空态两套前置条件。
    其余情形：三类文案按中文渲染、进度行带 rev 标识；证据：`RightPanel.test.tsx`（目标/输入/状态/rev/待确认）、`m75_spec_projection_test.go`。
  - `AC-CONV-008-02` 主语=执行组展开态与定位；条件=三组任务与交付物存在；动作=展开、点带 messageId 的行、点交付物；判据=展开后可见行数=首屏数+补取数、目标 data-message-id 相等、右栏提交/重试/取消入口 0 个（采样=点击后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-008-02.mjs；待拆：展开、messageId 定位、交付物下载、无提交入口四条判据。
    证据：`RightPanel.test.tsx`（分组展开 + `messageId` 透传 + 交付物打开）、`m87_task_message_mapping_test.go`；下载落盘一项另挂 `人工:下载核验`（目录新增文件 1 个、字节数=响应 size）。
  - `AC-CONV-008-03` 主语=右栏四态与 375 档 scrollWidth；条件=投影在途/500/无投影/无会话，375 宽；动作=开页面；判据=四态各 1、侧栏/右栏 0×0、display:none 2 处、scrollWidth=375、Composer 可见 1.0（采样=首屏 1s，容差 ±1px）；判定=`自动`；脚本=scripts/ac/AC-CONV-008-03.mjs；待拆：四态占位与 375 窄屏布局两组对象。
    证据：`RightPanel.test.tsx:21/29/175`、`ExecRowHitArea.test.tsx:254`、`test-plan.md:163`、ACCEPT-CONV-9 §2.4（Composer 359×144、发送 54×28）；375 档遮挡判定不适用。
  - `AC-CONV-008-04` 主语=状态码与 ETag；条件=taskLimit 0/51、会话不存在、If-None-Match 命中；动作=发四类；判据=400 invalid_task_limit、404、304，304 体 0 字节、留 ETag、前端重渲染 0 次（采样=响应头与首帧，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-008-04.mjs；待拆：400/404/304 与前端不闪空四条判据。
    证据：`spec_projection_etag_test.go:67/97/145/182/207`、`m75_spec_projection_test.go:23/71`、`api.test.ts:244/260/282`、`spec_projection.go:127-141`、`.tmp/accept8/304-live.json`。
  - `AC-CONV-008-05` 主语=组头 `{shown}/{total}` 与可见条目数；条件=首屏 3 条、`total`=6 或 4；动作=展开该组；判据=展开后 1s 可见条目=`total`、组头分子=分母=`total`，补取 500 时错误 1 个且条目数不变（采样=展开后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-008-05.mjs。
    证据：`RightPanel.test.tsx:59`、`App.integration.test.tsx:262/289/315`、`library.tsx:1001`、`app.tsx:424-457`、`test-plan.md:166`；残余：错误态与已加载列表同时可读的负断言仍缺（G18）。

### 4.6 L2 · 会话内任务与编排

#### PRD-CONV-009 · 会话内任务与编排（本轮新增）
<a id="prd-conv-009"></a>

- 优先级：P1
- 实现状态：`unimplemented`（覆盖 `gap`；形态由用户确认，证据为原型 `docs/design/task-prototype-v3-20261123.html` 九屏，2026-11-23）
- 六类状态：产品 spec ✅（本节）/ CHANGE ✅（`CHG-CONV-007` 已立，`specs/changes/CHG-CONV-007/`，17 张任务卡）/ 前端开发 spec ⚠️（待变更包补 `frontend.md`）/ 后端开发 spec ⚠️（待补 `backend.md`）/ 组件 ⚠️（右栏三标签、任务卡片、任务图待立 COMP）/ 任务卡 ✅（`tasks.md` 17 张，W0 与设计 spec 卡 done，其余待派发）/ test-plan ⚠️（TC 待补）/ 证据 ❌（仅原型；18 条断言脚本与 test-plan 用例未建）
- 边界：本 PRD 承担会话内的任务创建、呈现、编排与归属；任务执行器与生命周期状态机仍归 `P2-TASK`（编号不动），交付物存储与下载实现仍归 `P4-FILE`。
- 目标行为：
  1. 创建任务提供单个与批量两个入口；发起时把目标、输入、约束三类内容注入任务上下文，缺省项按会话当前内容补齐；
  2. 任务继承发起会话的权限、工具、消息可见范围、知识库与记忆；启动时上下文只含目标与约束，历史消息 0 条；
  3. 执行模式由用户选择计划或边做边想；用户可在发起时给定步骤列表，系统按所选模式直接启动，不弹二次确认；
  4. 智能体发出的任务消息为任务卡片消息，字段固定为 `role="agent"`、`category="task"`、`task_id` 必填，消息流按 `category="task"` 走任务卡片渲染分支；既有四类消息（`progress`、`clarification`、`requirement`、`consultation`）的样式与渲染分支不变；同批任务折叠为 1 条汇总卡，单张汇总卡最多平铺 10 条子条目，超出部分折叠为「还有 N 条」入口并可展开；
  5. 右栏提供概览、任务、交付物三个标签；收起后保留 40px 竖条，竖条常驻三个图标；任务图标角标等于进行中任务数，计数 ≥10 时显示 `9+`，0 不渲染，1–9 显示数字；
  6. 概览固定四节：目标、输入、任务、交付物；每节标题行占满右栏宽度，右侧放计数与箭头；展开状态按会话记忆，刷新后保持；
  7. 任务标签用厚卡呈现状态、执行模式、步骤刻度或轨迹条数、产出数与失败原因；四枚筛选为全部、进行中、失败、已完成，列表内容与筛选计数一致；
  8. 计划任务详情为单列步骤并按执行顺序排列；当前步默认展开，思考、动作与观察内联显示在该步下方；已完成步可点标题行回看；未开始步没有展开入口；
  9. 边做边想详情为一条扁平时间线，按发生顺序正序排列，当前动作在最后一行；不分组、不设展开入口；
  10. 任务图以弹窗覆盖整个应用窗口，节点按依赖连线，状态四态为已完成、进行中、未开始、失败；失败节点的下游显示为未开始并用虚线连线；弹窗只读；节点超过 20 个时按依赖层分行，画布横向与纵向可滚动，缩放固定为 1.0 且不做自动缩放，单层超过 4 个节点时该层内每 4 个换行；
  11. 编排支持并发与串行两种连接；连接语义三种：全部完成、任一完成、每个完成各自触发；默认取全部完成，任一完成在第 1 个前置完成后即启动且其余前置继续执行、不取消，每个完成在 3 个前置完成后累计启动 3 次；等待原因三种为等待依赖、等待用户确认、等待资源或额度，默认行为见本节「等待语义默认值」；
  12. 失败与取消作用于单条任务或整条链；取消后下游不再启动；重试、跳过与中止由会话在收到失败提示后决定；
  13. 交付物标签按任务分组，每行显示类型徽标、文件名、来源任务与时间；下载入口点击后得到原文件；
  14. 任务只属于发起它的会话，其它会话看不到；生命周期从分钟级到小时级，系统不设自动执行超时；用户可设时限，到点只提醒不取消；
  15. 任务运行在同一后端进程内，与会话共享权限边界；四条护栏为工具调用走同一套审批、默认禁网禁子进程、取消能中断执行、单任务失败不损坏会话数据。

**等待语义默认值（2026-11-23 裁决）**：

- 等待依赖：等待方任务状态 = `未开始`，任务图节点显示「未开始 · 等待前置」；前置完成前等待方的步骤启动 0 次；前置失败或被取消时等待方保持 `未开始`，失败计数差 0，不自动重试，不级联标记失败。
- 等待用户确认：计划停在当前步，当前步状态 = `进行中`，确认入口 1 个、取消入口 1 个，两个入口位于消息流任务卡片内联区，任务详情保持只读；等待期间后续步骤启动 0 次；用户取消后当前步状态 = `失败`、失败原因 = `用户取消`，下游保持 `未开始`；等待确认的任务在四态中计为 `进行中`，状态行另给「等待确认」子计数。
- 等待资源或额度：任务执行暂停，已完成步骤与产出保留；任务卡显示「等待资源」标记 1 个、恢复入口 1 个，恢复入口同在任务卡内联区；暂停期间进度增量 0、后续步骤启动 0 次；资源恢复后从暂停步继续，已完成步骤不重跑。暂停是执行态，任务图仍按四态渲染，等待中的节点计为 `进行中` 并带等待标记，四态节点数之和仍等于节点总数。
- 三类等待均不设系统自动超时：等待 30 分钟内自动失败 0 次、自动取消 0 次；用户设定时限到点只发提醒 1 条，不取消任务；改变等待状态只有三种途径，前置完成、用户确认或取消、资源恢复。
- AC：
  - `AC-CONV-009-01` 主语=消息流任务卡片与右栏任务计数；条件=会话空闲、右栏展开；动作=发起 1 个任务；判据=消息流任务卡片 1 张、右栏任务计数自 N 增至 N 加 1（差 = 1 个）、卡片带 task_id 1 个（采样=发起后 5s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-01.mjs；待实现。
  - `AC-CONV-009-02` 主语=消息流汇总卡与展开项；条件=一次发起 10 个任务；动作=展开汇总卡；判据=消息流卡片 1 张、汇总卡标题计数 = 10 个、展开后子条目 10 条（采样=展开后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-02.mjs；待实现。
    - 超限判据：一次发起 12 个任务时，消息流汇总卡 1 张、标题计数 = 12 个、默认可见子条目 10 条、「还有 2 条」入口 1 个；点开后子条目 12 条、入口 0 个（采样=点开后 500ms，容差 0）。
  - `AC-CONV-009-03` 主语=任务启动上下文；条件=会话已有 20 条历史消息；动作=发起任务并读取上下文；判据=上下文历史消息 0 条、目标 1 个、约束 ≥ 1 个（采样=启动后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-03.mjs；待实现。
  - `AC-CONV-009-04` 主语=任务工具调用与会话权限边界；条件=会话可用工具 1 个、会话权限外路径 1 条；动作=调工具并请求越权路径；判据=工具调用成功 1 次、越权请求拒绝 1 次且状态码 = 403（采样=调用后 5s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-04.mjs；待实现。
  - `AC-CONV-009-05` 主语=计划任务步骤列表；条件=8 步任务进行到第 6 步；动作=打开详情、点第 5 步与第 7 步；判据=步骤按序 1..8、第 6 步默认展开且轨迹 ≥ 1 条、第 5 步展开后轨迹 ≥ 1 条、第 7 步展开入口 0 个（采样=打开后 1s 与点击后 500ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-05.mjs；待实现。
  - `AC-CONV-009-06` 主语=边做边想详情时间线；条件=轨迹 14 条；动作=打开详情；判据=步骤节点 0 个、轨迹行 = 14 条、时间戳单调不减且展开入口 0 个（采样=打开后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-06.mjs；待实现。
  - `AC-CONV-009-07` 主语=任务详情操作入口；条件=任意状态任务 1 个；动作=打开详情并扫描入口；判据=重试/取消/编辑/删除入口 0 个、关闭入口 1 个（采样=打开后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-07.mjs；待实现。
    - 四态可点判据：未开始、进行中、已完成、失败四种状态的任务卡各 1 张时，四张卡均可点且可聚焦，点击各打开同一只读详情 1 次；打开前后任务状态相同（差 0）、任务事件条数差 0、写请求 0 条（采样=点击后 1s，容差 0）。可点只表示能进入详情，不改变任务状态、不产生任务事件，与本条详情只读判据并存。
  - `AC-CONV-009-08` 主语=右栏竖条与面板宽度；条件=右栏在任务标签；动作=点收起、点任务图标、再点任务图标；判据=收起后整栏宽 = 40px（容差 ±1px）、图标 3 个；展开后整栏宽 = 320px（= 面板 280px + 竖条 40px）且任务标签选中 1 个；再点后回到 40px（采样=每次点击后 300ms，容差 ±1px）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-08.mjs；待实现。
  - `AC-CONV-009-09` 主语=右栏任务图标角标；条件=进行中任务 0 个、2 个、10 个与 11 个；动作=切换四种数据；判据=0 个时角标不渲染、2 个时角标 = 2、10 个与 11 个时文本 = `9+`、两位数字节点 0 个（采样=数据更新后 5s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-09.mjs；待实现。
  - `AC-CONV-009-10` 主语=概览四节折叠态；条件=当前会话折叠目标与交付物两节；动作=刷新页面、切到另一会话；判据=刷新后展开态与刷新前一致（差 0 处）、四节标题与计数各 1 个、另一会话为默认全开（采样=刷新后 1s 与切换后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-10.mjs；待实现。
  - `AC-CONV-009-11` 主语=「还有 N 个」入口与定位；条件=任务 11 个、当前在概览；动作=点任务节「还有 9 个」；判据=任务标签选中 1 个、目标任务卡成为列表首行且距滚动口顶部 0–8px、可见任务卡 ≥ 1 张（采样=点击后 500ms，容差 ±1px）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-11.mjs；待实现。
    - 几何口径：滚动口取常驻头（面板头 44px、筛选条 40px）之下的列表内容区顶边，采样只按该顶边计算；宽档滚动口顶边在视口顶下方 174px（=48+42+44+40），768 档为 182px（=48+42+8+44+40）；采样取 `target.getBoundingClientRect().top − scroller.getBoundingClientRect().top`，判据与容差同设计 `V-CONV-009-10`。
  - `AC-CONV-009-12` 主语=任务标签四枚筛选与列表；条件=全部 11、进行中 2、失败 1、已完成 3；动作=依次点四枚；判据=列表卡片数分别为 11/2/1/3（差 0 张）、选中态 1 个（采样=每次点击后 300ms，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-12.mjs；待实现。
    - 未开始归属注记：筛选条固定四项「全部 / 进行中 / 失败 / 已完成」，不单列「未开始」；未开始任务只出现在「全部」中，靠状态胶囊「未开始」区分，另外三枚不含未开始任务（采样=进入任务标签后 300ms，容差 0）。
  - `AC-CONV-009-13` 主语=任务图节点状态与依赖；条件=8 个节点含 1 个失败且有下游；动作=打开任务图；判据=四态节点数之和 = 8、失败节点 1 个、其下游 1 个为未开始且虚线 1 条（采样=打开后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-13.mjs；待实现。
    - 超限判据：节点 21 个且最大单层 5 个时，缩放 = 1.0（差 0）、画布可滚动（scrollHeight 大于 clientHeight 或 scrollWidth 大于 clientWidth）、最大层占 2 行且首行 4 个、次行 1 个、层间节点重叠 0 处（采样=打开后 1s，容差 ±1px）。
  - `AC-CONV-009-14` 主语=三种等待语义的触发次数；条件=前置 3 个、等待方 1 个；动作=依次完成前置；判据=全部完成在第 3 个完成后启动 1 次、任一完成在第 1 个完成后 500ms 内启动 1 次、每个完成各自触发累计 3 次（采样=每次完成后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-14.mjs；待实现。
    - 等待原因判据：等待依赖时下游状态 = 未开始且失败计数差 0；等待确认时当前步保持进行中、确认与取消入口各 1 个、后续步骤启动 0 次；等待资源或额度时进度增量 0、等待标记 1 个、恢复入口 1 个（采样=进入等待后 1s，容差 0）。
  - `AC-CONV-009-15` 主语=取消后的下游启动；条件=上游 A 与下游 B 各 1 个；动作=经接口层调用取消接口取消 A；判定通道=接口层调用取消接口 + 集成层观察下游状态（前端无整链取消入口，不以界面点击取消取证）；判据=B 启动 0 次、B 状态 = 未开始、取消确认 1 条（采样=取消后 30s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-15.mjs；待实现。
  - `AC-CONV-009-16` 主语=交付物行与下载结果；条件=任务产出文档 1 个；动作=点下载；判据=类型徽标 1 个、来源任务名 1 个、下载文件 1 个且字节数 = 响应 size（采样=下载完成后 5s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-16.mjs；待实现。
  - `AC-CONV-009-17` 主语=任务归属；条件=会话 A 发起任务 1 个；动作=切到会话 B 看右栏与任务图；判据=B 的任务数 = 0 个、任务图节点 0 个、跨会话查询返回 0 条（采样=切到 B 后 1s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-17.mjs；待实现。
  - `AC-CONV-009-18` 主语=超时与时限行为；条件=无时限任务 1 个、时限 1 分钟任务 1 个；动作=运行 30 分钟并等到时限；判据=自动取消 0 个、到点后取消 0 个且提醒 1 条（采样=运行 30 分钟与到点后 10s，容差 0）；判定=`自动`；脚本=scripts/ac/AC-CONV-009-18.mjs；待实现。

## 5. 验收标准（A1–A9）

| ID | 验收标准（可判定） | 适用性 | 2026-11-21 状态 |
|---|---|---|---|
| A1 | 全部 P0 PRD（CONV-001/002/004/005/006、SYNC-001/002）主路径可走通，结果与状态一致 | 必验 | **部分**：11 条 E2E 通过；无重连/多标签主路径 |
| A2 | 空、加载、错误、权限不足在左栏/中栏/右栏/Composer 至少各有可见反馈，不静默、不假 0 | 必验 | **部分**：E1/E2/E3 partial；权限只能以归档只读近似（无鉴权 UI） |
| A3 | 有 UI 的功能点可用键盘完成主路径（Tab/Enter/Escape/箭头/Home/End），焦点可见 | 有 UI 必验 | **部分**：键盘用例有；无 axe/对比度/全键盘遍历 |
| A4 | 375/768/1280 三档不横向溢出、不遮挡主操作 | 有 UI 必验 | **部分**：仅 375（CDP 01b）；无 768/1280 |
| A5 | 不展示假 0/假成功；未实现/无证据项在界面与文档中明确标注 | 必验 | **部分**：统计占位已验；未读无界面标注 |
| A6 | 权限/隔离默认拒绝（归档只读、越权路径不依赖前端隐藏按钮） | 涉及权限必验 | **部分**：归档只读后端测试有；无鉴权面 |
| A7 | `PRD-SYNC-005` 已从 TREE/TRACEABILITY/spec/test-plan 移除，编号不复用、不计 covered | 必验 | **满足**（2026-11-22 移除，文档口径一致） |
| A8 | 每个 AC 至少映射一个用例；证据缺失写 `missing`，不写“通过” | 必验 | **满足**：33 行既有 AC 已映射（test-plan §3）；33 条全部生效 = 33 pass / 0 partial / 0 blocked（`AC-CONV-006-02` 已由 CDP 合成组合态证据转 pass）；`PRD-CONV-009` 的 18 条见 A9 |
| A9 | `PRD-CONV-009` 的 18 条 AC 各有断言脚本与 test-plan 用例，六类产物齐备后才计入本域覆盖 | 本组必验 | **missing**：18 条脚本与 TC 未建；原型九屏已由用户确认形态 |

## 6. 当前实现状态与未实现项

| PRD | 功能点 | 状态 | 说明（2026-11-22） |
|---|---|---|---|
| `PRD-CONV-001` | 会话树与主会话 | `implemented`（覆盖 `covered`） | 主路径+四态有组件/API 证据；**主会话不可归档（守卫已存在，AC-001-03）**；置顶入口本轮交付（AC-001-04）；切换中栏无 E2E |
| `PRD-CONV-002` | 会话生命周期 | `implemented`（覆盖 `covered`） | 归档/恢复/草稿有证据；失败反馈与“重试不产生重复/脏数据”已由 `App.operation-errors.test.tsx:49/75/96/115`、`Sidebar.test.tsx:77` 覆盖，`test-plan.md:137` 记 `AC-CONV-002-02` pass（重试计数 POST /api/sessions 2、archive 2、unarchive 2、read 2）；删除为显式非目标（`REQ-CONV-002-03` backlog），不计入验收面；DELETE 固定 403 保护性占位、UI 不暴露 |
| `PRD-CONV-003` | 会话搜索与未读 | `implemented`（覆盖 `covered`） | 标题搜索与未读均已有证据；**标题搜索为主（AC-003-03），消息正文搜索降 P2**；未读为会话级持久化读游标（SYNC-004，已实现并通过） |
| `PRD-CONV-004` | 消息流与渲染 | `implemented`（覆盖 `covered`） | 18/18 + API 证据；消息纯度已升独立 AC-004-03（证据已有）；COMP-message-colors 已签收 |
| `PRD-CONV-007` | 祖先消息整级加载 | `implemented`（覆盖 `covered`） | 祖先/时间轴/413/403 有证据；整列命中已真机验证（ACCEPT-CONV-6）、未部署；两个 COMP 已签收 |
| `PRD-CONV-008` | 右栏会话投影 | `implemented`（覆盖 `covered`） | 组件 + 后端 + 6 条组件测试 + E2E 01a/06；真机 spec-projection 200→304（ETag `spec-c5a2d772dd1d5d88`、304 空体）与 375 四态截图已补（ACCEPT-CONV-8）；375 下 sidebar 与 inspector 均 `display:none`、无抽屉入口，遮挡判定不适用；Composer 359×144、发送 54×28、可见比例 1.0、文档 `scrollWidth=375`（`test-plan.md:163`，ACCEPT-CONV-9 §2.4） |
| `PRD-CONV-005` | 发送·流式·断线重连 | `implemented`（覆盖 `covered`） | 发送/流式/失败/防重复有证据；停止按 `messageId` 定向已验真（`stop_interrupt_test.go:32`/`:402`、`App.conversation.test.tsx:455`）；停止机制由 `stop_upstream_test.go` 按假上游证明（10ms 内取消上游 context、之后 delta 0、`idle` 在 `retracted` 之后，`STOP-UPSTREAM-EVIDENCE-20261122.md`）；幂等已实现（`idempotency.go` + 7 测）；环境限制：真实厂商 403、跨标签双 WS、断网 e2e 不作为判据 |
| `PRD-CONV-006` | Composer 输入与快捷键 | `implemented`（覆盖 `covered`） | 10/10 + 新增 5 条；`AC-CONV-006-02` 由 CDP `Input.imeSetComposition` 五点验证转 pass（`IME-EVIDENCE-20261122.md`），物理输入法未覆盖只作环境限制；COMP 已签收 |
| `PRD-SYNC-001` | WS 连接与重连 | `implemented`（覆盖 `covered`） | 后端顺序/since/fanout/恢复有证据；前端 close→open 重连与断线补拉由 `App.conversation.test.tsx:486` 覆盖，`test-plan.md:151` 记 pass；`since` 日志截断/保留窗口仍未定义 |
| `PRD-SYNC-002` | 多标签 active/ancestor/read cursor | `implemented`（覆盖 `covered`） | `App.tabsync.test.tsx:115/148/165/189/211/235/273/297/316/340`、`App.tabsync.channel.test.tsx:98/113`、`App.tabsync.degrade.test.tsx` 覆盖 active/祖先/读游标、同 `at` tiebreak 与降级，`test-plan.md:152-153` 记 pass；peer 为模拟双实例，真双标签时序仍归 §15 M-03 |
| `PRD-SYNC-003` | 发送模式/设置跨标签同步 | `implemented`（覆盖 `covered`） | 单标签持久化与跨标签/降级均有测试：`Composer.test.tsx:144/178/198/219`，`test-plan.md:155` 记 pass；真实两标签时序见 §15 M-03 |
| `PRD-SYNC-004` | 未读与已读游标 | `implemented`（覆盖 `covered`） | 会话级持久化读游标已实现（后端表/接口 + 前端接入）；`AC-SYNC-004-01/02/03` 全 pass。 |
| `PRD-CONV-009` | 会话内任务与编排 | `unimplemented`（覆盖 `gap`） | 形态由用户确认为原型 `docs/design/task-prototype-v3-20261123.html` 九屏（2026-11-23）；18 条 AC 已冻结编号，变更包已立（`specs/changes/CHG-CONV-007/`，含 17 张任务卡），断言脚本与 test-plan 用例待建；任务执行器与交付物存储分别由 P2-TASK、P4-FILE 承接 |

**未实现项（unimplemented）**：`PRD-CONV-009`（会话内任务与编排，18 条 AC 待建脚本与用例；原 `PRD-SYNC-005` 已移除，编号不复用）。
**覆盖口径**：**当前状态 12 covered / 0 partial / 1 gap**（13 个 PRD；`specs/test/P1-CONV/test-plan.md`：33 条既有 AC = 33 pass / 0 partial / 0 blocked）；`PRD-CONV-009` 的 18 条 AC 记 `missing`（脚本与用例未建，不计入按用例判定的覆盖）；删除/子会话移动为**显式非目标**，不计缺口；`implemented` 只表示“可运行实现 + 部分证据”。改造前按移除后的 12 个 PRD 计为 0 covered / 12 partial / 0 gap。

## 7. 依赖、风险、待确认与边界清单

- 依赖：本域行为依赖 `SYNC-001` 的 WS 通道与 `SYNC-002` 的标签广播；WS 不可用时 P1 主路径只能走 HTTP 回退（当前无回退）。
- 风险 1：旧 `docs/tasks/frontend.md` 与后端能力面不一致；本 spec 不把“后端有接口”当“前端可用”（如 DELETE 仍 403 占位、标题搜索）。
- 风险 2：组件 spec 与实现漂移（message-colors / timeline-groups / timeline-tip / composer-send-mode 均未按实现签收）。
- 风险 3：未读口径已裁决（会话级持久化读游标），实现与用例已补（`unread_test.go:93`、`App.conversation.test.tsx:148/161/179/213`，`test-plan.md:156-158` 记 pass）；`CHG-CONV-005` 仍为 blocked 历史包，由 `CHG-CONV-006` 收口。
- 已裁决（**默认裁决，2026-11-21，用户可在 spec review 推翻**）：① 搜索=标题搜索（`GET /api/sessions?q=`，跨全部会话含子会话；消息正文搜索降 P2、不在本阶段验收，全局正文进 backlog）→ AC-CONV-003-03；② 未读=会话级持久化读游标（进入即已读、刷新/重启保留、多标签共享、不做全站数字/条数、通知中心另立项；需新增后端表/接口，属本阶段新增能力）→ AC-SYNC-004-01..03；③ 删除会话 = 显式非目标/backlog `REQ-CONV-002-03`（用户裁决暂不允许删除；不从本 PRD AC 验收；DELETE 固定 403 保护性占位、UI 不暴露；后续新 CHG 才定义确认令牌/主会话拒绝/级联/回滚）；④ pin 入口进 UI（本轮验收面：会话行菜单置顶/取消置顶；主会话、草稿、归档不提供；置顶只影响同级分组内顺序，不改变父子归属、不提升到顶层，同级内排序以后端返回为准）→ AC-CONV-001-04；⑤ 右栏会话投影新增 `PRD-CONV-008`（P1）→ §4.5；⑥ 主会话不可归档升 `AC-CONV-001-03`、消息纯度升 `AC-CONV-004-03`；⑦ 子会话不可移动/换父（显式非目标，后续新 CHG）→ §2.1；⑧ 会话内任务与编排新增 `PRD-CONV-009`（P1）→ §4.6，任务执行器与生命周期仍归 `P2-TASK`、编号不动，交付物存储与下载实现归 `P4-FILE`，本 PRD 只约束会话内呈现、编排与归属（2026-11-23 用户确认原型九屏后落笔）。
- 仍待确认：未读粒度仍为会话级有/无，若后续改判条数/全站数字，需另开 CHG，不回改已发布 AC 编号。
- 已裁决（`PRD-CONV-009`，2026-11-23，取代本节原「仍待确认（PRD-CONV-009）」三处）：① 任务卡片消息字段固定为 `role="agent"`、`category="task"`、`task_id` 必填 → §4.6 第 4 条与 DEC-26；② 等待依赖、等待用户确认、等待资源或额度三类等待的默认值按 §4.6「等待语义默认值」执行，均不设系统自动超时 → DEC-27；③ 批量汇总卡单张最多平铺 10 条，超出部分显示「还有 N 条」并可展开 → §4.6 第 4 条与 DEC-28；④ 任务图超过 20 个节点按依赖层分行、画布横向与纵向可滚动、缩放固定 1.0 且不自动缩放、单层超过 4 个节点时该层内每 4 个换行 → §4.6 第 10 条与 DEC-29。
- **非 P1 但页面可见（另域验收，不计入本域）**：工作台指标（P3/P10）、任务执行器与生命周期状态机（P2-TASK）、交付物存储与下载实现（P4-FILE）、权限只读（P8）、卡片交互（M41/COMP）、团队/日程/记忆/智能体/工作台独立页面（P2–P10 冻结）。
- 证据：测试计划 [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；未执行项一律 `missing`；逐 PRD 六类状态与 owner 见 [`CONV-CLOSURE.md`](../../../docs/product/CONV-CLOSURE.md)。

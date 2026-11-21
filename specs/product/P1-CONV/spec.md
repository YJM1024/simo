# P1 · 会话与消息（产品域 Spec）

状态：**active**（2026-11-21 行为级重写；AC 依据真实实现与真实测试证据重写，不再使用模板句。实现状态逐项标注，不把“接口存在”当“产品完成”）
> 产品域：`P1`；技术域码：`CONV`、`SYNC`；ID 规则见 [`../../../docs/product/ID-SPEC.md`](../../../docs/product/ID-SPEC.md)。
> 对应测试计划：[`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；功能树：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；追溯：[TRACEABILITY.md](../../../docs/product/TRACEABILITY.md)；收口总账：[CONV-CLOSURE.md](../../../docs/product/CONV-CLOSURE.md)。
> 变更包：[CHG-CONV-001](../../changes/CHG-CONV-001/spec.md)（会话管理）、[CHG-CONV-002](../../changes/CHG-CONV-002/spec.md)（消息与渲染）、[CHG-CONV-003](../../changes/CHG-CONV-003/spec.md)（输入与发送）、[CHG-CONV-004](../../changes/CHG-CONV-004/spec.md)（多标签与同步）、[CHG-CONV-005](../../changes/CHG-CONV-005/spec.md)（未读与通知，blocked）。

## 1. 目标

把“会话与消息”从零散接口/旧 FE 规格收敛成可验收的产品能力：每条 AC 描述**用户在界面上能观察到的行为**（操作 → 预期可见结果），并与真实测试证据一一对应；未实现的能力标 `unimplemented`，缺证据的写 `missing`，不得写成已完成。

本域覆盖 12 个 L3：`implemented` 9、`partial` 2（CONV-003、SYNC-004）、`unimplemented` 1（SYNC-005）。
覆盖口径（2026-11-21）：**0 covered / 11 partial / 1 gap** —— 六类产物已补齐（见各 PRD“六类状态”），但每个 PRD 仍至少缺一类可复现 AC 证据，故不升级 covered。

## 2. 非目标与边界

### 2.1 本域不做

- 不定义组件视觉与代码结构；组件契约见 `specs/COMP-*`，变更开发 spec 见 `specs/changes/CHG-CONV-*/`。
- 不把后端路由/表存在等同于用户可用；没有入口或没有证据的能力最多 `partial`。
- 不为每个 PRD 新建独立 spec；功能点在本文档内以 PRD 章节维护。
- 不在本 spec 修改代码、测试或部署。
- **排除 SYNC-005（远程访问与通知中心）**：未实现、无鉴权与通知数据模型，其 AC 仅登记为 `unimplemented`，不计入 P1 验收通过面。

### 2.2 “非 P1 但页面可见”的边界（不得算作 P1 覆盖，也不假装页面只有会话）

会话页面上可见、但不属于本域 AC 的能力，另属其他域，单独验收：

| 页面可见物 | 归属域 / ID | 在 P1 中的处理 |
|---|---|---|
| 工作台指标（工作台页、指标卡/趋势/延迟） | P3 / P10-METRIC | 非 P1，不计 P1 AC；仅 CONV-004 的“不噪入消息流”边界相关 |
| 右栏会话投影（目标/输入/状态三组） | 无独立 PRD（P1 边界内，F 组） | 只以 CONV-004 的渲染一致性近似覆盖；**无独立 AC**，属缺口（见 CONV-CLOSURE §4） |
| 右栏任务投影（任务组、执行组） | P2-TASK-002 | 非 P1；本域只覆盖右栏“会话投影（目标/输入/状态）” |
| 右栏交付物（只读列表/打开） | P4-FILE | 非 P1，不计 P1 AC |
| 右栏权限列表（只读） | P8-SET（权限） | 非 P1；P1 的“权限不足”只能以归档只读近似 |
| 卡片交互（提交/重试/取消） | M41 / `COMP-*` 卡片契约 | 非 P1 AC；CONV-004 只要求卡片**渲染**与只读/失败态正确 |
| 团队 / 日程 / 记忆 / 智能体 / 工作台独立页面 | P2–P10（冻结） | 不在本轮范围；不修改 |
| 流式过程中的“停止”后端真中断 | 属 CONV-005 的 AC，但依赖 SYNC-001 的 correct 帧 | 见 CONV-005 AC-02（3） |

## 3. 场景（行为组）

- **A 会话导航与生命周期**：左栏会话树加载 → 选中/新建/重命名 → 归档/恢复 → 归档只读；含树深度、父链、重启保持；置顶后端已存在但 UI 未接线、删除后端已存在但 UI 无入口（均为缺口，见 §7）。
- **B 搜索与未读**：输入关键词过滤会话；搜索中有状态、无匹配有提示；未读只在“回到底部”按钮上以条数呈现，无侧栏徽标、无持久化。
- **C 消息渲染与祖先**：用户/司墨消息、分类标签、Markdown 与代码块、复制、失败/流式、卡片只读、跨会话祖先逐级加载、时间轴跳转、413/403/空上级。
- **D 输入与发送**：Enter / Shift+Enter / Ctrl(⌘)+Enter、IME 组合、发送失败重试、重复提交防护、流式中停止、归档禁用。
- **E 实时同步与多标签**：WS 三态、`subscribe`/`since` 回放、多标签 `active_session_changed`/`ancestor_chain_changed`/`read_cursor_changed`、发送模式跨标签同步。
- **F 右栏会话投影**：目标/输入/状态三组的加载、错误重试、空态、展开折叠、按 messageId 定位（任务/交付物/权限组非 P1）。
- **H 四态边界**：空、加载、错误、权限不足在各面板的可见反馈与恢复；不展示假 0、假成功。

## 4. 功能点与需求

> 每个功能点含：PRD、优先级、实现状态、六类产物状态、目标行为（真实交互）、AC。目标行为是**产品要求**；AC 是**可验证断言**，括号内为现实证据或缺口。

### 4.1 L2 · 会话管理

#### PRD-CONV-001 · 会话树与主会话
<a id="prd-conv-001"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `partial`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-001](../../changes/CHG-CONV-001/spec.md) ✅ / 前端开发 spec ✅（`CHG-CONV-001/frontend.md`）/ 后端开发 spec ✅（`CHG-CONV-001/backend.md`）/ 组件 spec N/A（复用 Sidebar 组件，无独立 COMP）/ 任务卡 ✅ / test-plan ✅（TC-P1-001 pass）/ 执行证据 ✅（组件 + 集成 + API + E2E 01a/11，2026-11-21）
- 目标行为：
  1. 打开应用后左栏按 `GET /api/sessions/tree` 渲染会话树，主会话 `main` 与子会话以层级（缩进/父链）呈现，active 会话高亮；
  2. 点击或键盘 Enter 切换会话，中栏消息随之切换；切换不残留上一会话的消息；
  3. 新建子会话先落“草稿”（不写库），首次发送后物化为真实会话；重启后空草稿被清理；
  4. 双击会话名进入重命名，Enter 提交、Escape 取消且不落库；重命名经重启保持；
  5. 多级父链（≥3 级）可展开、循环父链被守卫拒绝；
  6. 左栏底部显示连接状态、用量/配额、会话数/消息数；统计失败显示占位文案而非 0；
  7. 历史会话可展开/收起（归档列表开关）。
- AC：
  - `AC-CONV-001-01` 主路径：**Given** 存在 `main` 与至少一个子会话，**When** 用户点击/Enter 选中另一会话，**Then** 左栏高亮切换、中栏渲染该会话消息、无上一会话残留；**And** 新建/重命名/切换后右侧统计与会话数一致。证据：`Sidebar.test.tsx`（render/select/rename）、`TestM4SessionTreeAndRenamePersistAcrossRestart`、`TestTreeCreateRenameAndDescendants`、`CDP 01a`。
  - `AC-CONV-001-02` 异常/边界：**Given** 会话列表为空/加载中/请求失败/统计失败，**Then** 分别出现空态、加载态、错误+重试、统计占位，均不显示假 0；**And** 重命名按 Escape 不落库、新建后不产生孤立空会话（重启清理）；多级父链不破版、循环父链被拒。证据：`Sidebar.test.tsx`（空/加载/错误/重试）、`TestM70*`（草稿）、`TestM14SessionPathCycleGuard`。**缺**：主会话不可归档无独立断言；无“切换后中栏内容变化”的 E2E。

#### PRD-CONV-002 · 会话生命周期
<a id="prd-conv-002"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `partial`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-001](../../changes/CHG-CONV-001/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-002 partial）/ 证据 ✅（组件 + 集成 + API + E2E 08/09/10；创建失败已有用例，重命名/归档失败仍缺）
- 目标行为：
  1. 新建会话后立即出现在列表并被选中；
  2. 重命名持久化（重启后同名）；
  3. 归档后会话进入“已归档”列表、中栏只读（Composer 禁用）、对该会话发消息被服务端拒绝（返回错误而非继续回复）；
  4. 有运行中任务时归档被门禁阻断（`canArchive` 不为真则拒绝）；
  5. 恢复（unarchive）后会话回到普通列表，可继续对话；
  6. 生命周期请求失败时有可见反馈，不产生重复行、不出现“界面成功但库里没变”。
- AC：
  - `AC-CONV-002-01` 主路径：**When** 用户新建→重命名→归档→恢复，**Then** 每步列表与中栏状态即时且一致；归档后 Composer 禁用、发消息被拒；恢复后可继续对话；重启后名称/归档态保持。证据：`Sidebar.test.tsx`（archive/restore）、`TestM6ArchiveReadonlyAndUnarchive`、`TestM6ArchivedChatWSReturnsErrorNotReply`、`TestM6CanArchiveGateBlocksRunningTask`、`TestM70DraftNotPersistedThenMaterialized`。
  - `AC-CONV-002-02` 异常/边界：**Given** 创建/重命名/归档/恢复请求失败，**Then** 出现可见错误反馈、列表不被乐观改成“已成功”，重试后不产生重复或脏数据。证据：`TestM70RestartCleansEmptySessions`（草稿清理）、`TestM6ArchivedChatWSReturnsErrorNotReply`。**已知缺陷**：`frontend/src/app.tsx:450`（`toggleArchive`）与 `:530`（`rename`）无 `try/catch`，失败静默 → 本 AC **不满足**，见 `CHG-CONV-001/tasks.md` TASK-02/03。**缺**：前端无删除入口（后端 `DELETE /api/sessions/{id}` 已存在）。

#### PRD-CONV-003 · 会话搜索与未读
<a id="prd-conv-003"></a>

- 优先级：P1
- 实现状态：`partial`
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-001](../../changes/CHG-CONV-001/spec.md) ✅（搜索部分）/ 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅（含未读 blocked 卡）/ test-plan ✅（TC-P1-003 partial）/ 证据 ✅（搜索：集成 + E2E 14/15）/ ❌（未读，无实现无测试）
- 目标行为：
  1. 左栏搜索框输入关键词后，会话列表按匹配结果过滤；搜索中有“搜索中”状态；无匹配显示空提示；
  2. 过滤依据是**服务端返回的命中会话 id 集合**，不在前端伪造；
  3. 产品语义：“会话搜索”= 标题搜索（`GET /api/sessions?q=`）；但当前 UI 实际调用消息搜索（`/api/messages/search?q=`，默认只搜 `main` 且不含子会话）→ 语义偏差，属缺口；
  4. 未读：会话内新消息到达且用户不在底部时，“回到底部 · N 条新消息”按钮显示未读条数；切会话/回到 64px 内/收到跨标签已读广播时清零；**无**左侧未读徽标、**无**持久化。
- AC：
  - `AC-CONV-003-01` 主路径：**Given** 多会话且某条消息含唯一关键词，**When** 输入关键词，**Then** 列表按服务端命中 id 过滤、搜索中状态可见、无匹配有空提示。证据：`Sidebar.test.tsx`（search/filter/server ids/searching/no-match）、`TestUI1SessionSearchAndPin`（标题搜索后端）。**缺**：产品语义（标题搜索）与实现（消息搜索）不一致，需产品确认选择哪一种。
  - `AC-CONV-003-02` 异常/边界：**Given** 搜索请求失败或未读跨会话/跨标签，**Then** 搜索失败回退为空结果且有提示、未读按“离开底部累加/回到/切会话清零”规则呈现且不虚增。证据：`Sidebar.test.tsx`（search 失败路径）、`app.tsx:214`（累加）。**缺**：未读无徽标/无持久化/无测试（SYNC-004 承接），故 ACL-02 **不满足**。

### 4.2 L2 · 消息与渲染

#### PRD-CONV-004 · 消息流与渲染
<a id="prd-conv-004"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `partial`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-002](../../changes/CHG-CONV-002/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 ⚠️（`COMP-message-colors` 状态为 approved 但“未实现”，与已渲染的分类标签不一致，未签收）/ 任务卡 ✅ / test-plan ✅（TC-P1-004 pass）/ 证据 ✅（18/18 + API category 14+5 + E2E 01a/02）
- 目标行为：
  1. 用户消息与司墨消息视觉区分（对齐/底色/角色标识）；分类标签（`category` 有值才渲染）按分类表驱动展示，不显示空标签；
  2. Markdown：围栏代码块、行内代码、长文本自动换行不横向溢出；
  3. 复制消息文本成功有“已复制”反馈；Clipboard 不可用时用 `execCommand` 降级，降级成功/失败都不报错；
  4. 流式中显示光标，失败消息带失败徽标并可重试；
  5. 卡片消息渲染标题/字段/按钮；已提交后按钮禁用；`readOnly`（归档）时卡片控件禁用；
  6. 消息流只含对话消息，不含 system/internal 控制消息；消息不可编辑（编辑端点返回禁用错误）；
  7. 消息分页加载（默认 100 条），翻页不重复、不乱序。
- AC：
  - `AC-CONV-004-01` 主路径：**Given** 含用户/司墨/分类标签/代码块/卡片/流式消息的会话，**When** 浏览并复制，**Then** 角色与分类标签正确、代码块与长文不溢出、复制有反馈、流式光标/失败徽标正确、卡片提交态与只读态正确。证据：`MessageItem.test.tsx` 18/18、`TestM41Cards*`、`TestM11MessagePagination`、`CDP 04a`。
  - `AC-CONV-004-02` 异常/边界：**Given** Clipboard 抛错/卡片提交失败/归档只读/internal 消息混入，**Then** 降级复制、卡片保留输入并显示错误可重试、控件禁用、internal 消息不出现在接口与流中。证据：`MessageItem.test.tsx`（fallback/failed card/readOnly）、`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`、`TestM50MessageEditingDisabled`。**缺**：消息纯度无独立产品 AC；“空/加载”由域级 E1 承接（partial）。

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
  - `AC-CONV-007-02` 异常/边界：**Given** 上级接口 413/403/空上级，**Then** 413 显示错误且重试可成功、403 与空上级都按“无上级”继续且不阻塞发消息、重复消息不渲染两遍。证据：`App.integration.test.tsx`（413 重试/403 空祖先）、`TestM89AllMessagesLimitsAndErrors`。**缺**：413/403 仅前端 mock，无真实后端集成；时间轴点击目标 ≥44px 无断言；未部署验证。

### 4.3 L2 · 输入与发送

#### PRD-CONV-005 · 发送·流式·断线重连
<a id="prd-conv-005"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `partial`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-003](../../changes/CHG-CONV-003/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-006 partial）/ 证据 ✅（component + 集成重连/去重 + 后端 WS 4 测）/ ⚠️（幂等后端未实现、停止真实中断未验证、断网 e2e 缺）
- 目标行为：
  1. 发送：点击发送或快捷键提交 → `POST /api/chat` 接受（202）→ 输入框清空 → 通过 WS 收 `delta` 增量追加、`done` 收尾；
  2. 流式中显示“停止”，点击后不再追加该回复（前端忽略后续帧并发 correct 帧请求中止）；
  3. 发送失败：输入文本保留、显示可读错误、可直接重试；重试不产生重复消息；
  4. 重复提交防护：同一时刻只允许一个发送在途；
  5. 断线：WS 断开显示重连中，按退避（800ms 起 ×1.8，上限 5000ms）重连，重连后用 `since` 续传，不丢消息、不重复渲染；
  6. 幂等：请求携带 `clientMutationId`，服务端应据此去重（**当前后端未处理**，见缺口）。
- AC：
  - `AC-CONV-005-01` 主路径：**When** 用户发送文本，**Then** 消息乐观出现、流式增量渲染、done 后为终态、输入清空；停止后不再增长。证据：`Composer.test.tsx`（send/clear/streaming-stop）、`TestWebSocketEventOrder`、`TestM2MockStreamRecordsUsageAndDecision`、`CDP 02/05`。
  - `AC-CONV-005-02` 异常/边界：**Given** 发送失败、重复点击、WS 断开、停止中，**Then** 文本保留可重试、不重复提交、断线可见并按退避重连、`since` 续传不丢不重、停止后不追加。证据：`Composer.test.tsx`（失败恢复/防重复）、`TestM55StartupRecoversStaleStreaming`、`TestM55StreamingWatchdogTimeout`、`TestWebSocketSinceContinuation`。**缺**：前端无“close→open 重连/since 回放”测试；`clientMutationId` 后端 0 处理（`grep` 0 匹配）→ 幂等不成立；停止仅断言回调，未验证后端真中断。

#### PRD-CONV-006 · Composer 输入与快捷键
<a id="prd-conv-006"></a>

- 优先级：P0
- 实现状态：`implemented`
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-003](../../changes/CHG-CONV-003/spec.md) ✅ / 前端 ✅ / 后端 N/A（纯前端交互，写 N/A+理由）/ 组件 ⚠️（`COMP-composer-send-mode` 仍 `spec ready`，未签收）/ 任务卡 ✅ / test-plan ✅（TC-P1-007 partial）/ 证据 ✅（10/10 + 新增 5 条 + E2E 03；后端仅请求校验）
- 目标行为：
  1. 两种发送模式：`enter`（Enter 发送、Shift+Enter 换行）与 `shift-enter`（Shift+Enter 发送、Enter 换行）；Ctrl/⌘+Enter 在两种模式下都发送；
  2. 模式切换按钮 aria 状态与提示文案同步变化，选择写入 `localStorage`（`simo.composer.sendMode`），并迁移旧 key；
  3. 中文输入法组合期间按 Enter 不发送；
  4. 无 active 会话或会话已归档时 Composer 禁用；流式中显示停止；
  5. 发送失败错误区可读；长文本不截断。
- AC：
  - `AC-CONV-006-01` 主路径：**Given** 当前为 `enter` 模式，**When** Enter / Shift+Enter / Ctrl+Enter / ⌘+Enter，**Then** 分别发送/换行/发送/发送；**When** 切到 `shift-enter` 模式，**Then** 快捷键行为反转、按钮 aria 与提示同步、刷新后模式保持。证据：`Composer.test.tsx`（Enter、Shift+Enter、Ctrl/Meta、模式持久化）、`CDP 03`。
  - `AC-CONV-006-02` 异常/边界：**Given** IME 组合中、发送失败、无会话/归档、长文本，**Then** 组合中不发送、失败可恢复且文本保留、禁用态明确、长文本不截断。证据：`Composer.test.tsx`（IME/失败恢复/disabled/long text）。**缺**：真实中文输入法未手测；跨标签模式同步归 SYNC-003（无测试）。

### 4.4 L2 · 多标签与同步

#### PRD-SYNC-001 · WS 连接与重连
<a id="prd-sync-001"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `partial`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-004](../../changes/CHG-CONV-004/spec.md) ✅ / 前端 ✅ / 后端 ✅ / 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-008 partial）/ 证据 ✅（后端 WS 4 测 + 前端重连集成）/ ⚠️（断网 e2e replay 与 since 保留窗口缺）
- 目标行为：
  1. 连接 `GET /api/ws` 后发送 `subscribe{sessionId,since}`；事件按 seq 有序投递；
  2. 状态三态可见：connected / reconnecting / closed（连接点颜色/文案）；
  3. 断开后自动重连（退避 800ms→5000ms），重连带 `since` 续传，不重复渲染；
  4. 同会话多客户端 fanout（两个标签都能收到）；
  5. 归档会话的 WS 聊天请求返回错误帧，不继续回复；
  6. 启动时发现“流式中”残留消息会被恢复为失败态（避免永远转圈），流式看门狗超时同样收尾。
- AC：
  - `AC-SYNC-001-01` 主路径：**When** 打开页面并订阅，**Then** 连接态可见、事件有序、`since` 补发、双客户端都能收到。证据：`TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients`、`App.integration.test.tsx`（seq 去重）。
  - `AC-SYNC-001-02` 异常/边界：**Given** 断线/归档/残留流式，**Then** 显示重连中并重连成功、归档请求返回错误、残留被恢复为失败态。证据：`TestM6ArchivedChatWSReturnsErrorNotReply`、`TestM55StartupRecoversStaleStreaming`、`TestM55StreamingWatchdogTimeout`。**缺**：前端无 close→open 重连测试；`since` 日志截断/保留窗口未定义。

#### PRD-SYNC-002 · 多标签 active/ancestor/read cursor
<a id="prd-sync-002"></a>

- 优先级：P0
- 实现状态：`implemented`（覆盖 `partial`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-004](../../changes/CHG-CONV-004/spec.md) ✅ / 前端 ✅ / 后端 N/A（BroadcastChannel 纯前端，写 N/A+理由）/ 组件 N/A / 任务卡 ✅ / test-plan ✅（TC-P1-009 partial）/ 证据 ⚠️（BroadcastChannel 单测 6 条 + E2E 13；未读游标/双 target 缺）
- 目标行为：
  1. 标签 A 切会话 → 其他标签跟随切换（广播 `active_session_changed`，带 `at` 与 tabId；同一 `at` 用 tabId 字典序 tiebreak，避免回抖；忽略自己 tabId，并用 remoteActiveRef 抑制回声）；
  2. 标签 A 加载祖先链 → 其他标签按 chain key 去重后合并（`ancestor_chain_changed`，逐会话拉 all messages 合并）；
  3. 标签 A 读到最新 → 广播 `read_cursor_changed`，其他标签在 `at >= 本地游标` 时清未读；
  4. BroadcastChannel 不可用时静默降级（不影响单标签使用）。
- AC：
  - `AC-SYNC-002-01` 主路径：**Given** 两个同源标签，**When** A 切会话/加载祖先/读消息，**Then** B 的 active、祖先链、未读分别跟随且不重复、不来回跳。证据：**无自动化测试**（`tabsync.ts` 与 `app.tsx:220-256` 仅实现；CDP runner 单页）。
  - `AC-SYNC-002-02` 异常/边界：**Given** 两标签同 `at` 冲突/重复广播/不支持 BroadcastChannel，**Then** 有确定性 tiebreak、重复不叠加、降级不报错。证据：**无**（`opId` 未用于去重）。→ 本 PRD 状态 `implemented` 仅为代码存在，覆盖上按 **partial**。

#### PRD-SYNC-003 · 发送模式/设置跨标签同步
<a id="prd-sync-003"></a>

- 优先级：P1
- 实现状态：`implemented`（覆盖 `partial`）
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-004](../../changes/CHG-CONV-004/spec.md) ✅ / 前端 ✅ / 后端 N/A / 组件 ⚠️（`COMP-composer-send-mode` `spec ready`）/ 任务卡 ✅ / test-plan ✅（TC-P1-010 partial）/ 证据 ✅（单标签持久化 + E2E 13）/ ❌（跨标签单测与降级路径）
- 目标行为：
  1. 切换发送模式后写入 `localStorage`，刷新保持；
  2. 同一浏览器其他标签通过 `BroadcastChannel('simo.composer.sendMode.v1')` 或 `storage` 事件最终一致（双通道）；
  3. 无 BroadcastChannel 时退化为 `storage` 事件，仍可用；
  4. 按钮 aria-pressed/aria-label 与模式一致。
- AC：
  - `AC-SYNC-003-01` 主路径：**When** 切换模式，**Then** 当前标签按钮态与快捷键行为立即变化、刷新后保持。证据：`Composer.test.tsx::toggles send mode, persists it and changes keyboard behavior`。
  - `AC-SYNC-003-02` 异常/边界：**Given** 两个标签/无 BroadcastChannel，**Then** 另一标签最终一致、降级不报错。证据：**无测试**（`library.tsx:509-580` 有实现）→ 不满足。

#### PRD-SYNC-004 · 未读与已读游标
<a id="prd-sync-004"></a>

- 优先级：P1
- 实现状态：`partial`
- 六类状态：产品 spec ✅ / CHANGE [CHG-CONV-005](../../changes/CHG-CONV-005/spec.md)（**blocked**）/ 前端 ✅（仅现状）/ 后端 N/A-但明确"无实现"（grep 0 匹配）/ 组件 N/A / 任务卡 ✅（全 blocked）/ test-plan ✅（TC-P1-011 **missing**）/ 证据 ❌
- 目标行为（口径待产品确认，以下为待确认草案）：
  1. 每个会话有未读条数；进入会话并读到最新后清零；
  2. 左侧列表显示未读徽标（当前无）；
  3. 已读游标持久化（后端当前无 `unread`/`read_cursor` 字段/接口）；
  4. 多标签已读状态一致；
  5. 刷新/重启后未读不丢（当前仅内存）。
- AC：
  - `AC-SYNC-004-01` 主路径：**When** 用户收到新消息并离开底部、切走再回来，**Then** 未读计数出现并在正确时机清零。证据：`app.tsx:214`（累加）/`:656`（按钮）仅内存态，**无用例**。
  - `AC-SYNC-004-02` 异常/边界：**Given** 刷新、跨标签、服务端重启，**Then** 未读与游标正确恢复/一致。证据：**无**（无后端、无持久化、无口径）。
  > **blocked 说明**：未读口径 6 个问题未答（是否徽标/是否持久化/是否含子会话/清零时机/多标签优先级/远程设备），且与“本机单用户无鉴权”现状冲突；见 `CHG-CONV-005/spec.md` §3.1 与 `frontend.md` §2。

#### PRD-SYNC-005 · 远程访问与通知中心
<a id="prd-sync-005"></a>

- 优先级：P2
- 实现状态：`unimplemented`
- 六类状态：产品 spec ✅（仅登记）/ CHANGE [CHG-CONV-005](../../changes/CHG-CONV-005/spec.md)（blocked）/ 前端 ❌ / 后端 ❌ / 组件 ❌ / 任务卡 ❌（未拆）/ test-plan ✅（TC-P1-012 missing）/ 证据 ❌
- 目标行为：**未定义**（无鉴权模型、无设备管理、无通知渠道与数据模型；与当前 127.0.0.1 无鉴权基线冲突）。
- AC：
  - `AC-SYNC-005-01` 主路径：`unimplemented`，不计入 P1 验收通过面；不得对外宣称可用。
  - `AC-SYNC-005-02` 异常/边界：同上，仅登记为规划项。

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
| A8 | 每个 AC 至少映射一个用例；证据缺失写 `missing`，不写“通过” | 必验 | **部分**：24 AC 已映射（test-plan §3）；14 个 AC 仍为 missing/partial |

## 6. 当前实现状态与未实现项

| PRD | 功能点 | 状态 | 说明（2026-11-21） |
|---|---|---|---|
| `PRD-CONV-001` | 会话树与主会话 | `implemented` | 主路径+四态有组件/API 证据；主会话不可归档无断言；切换中栏无 E2E |
| `PRD-CONV-002` | 会话生命周期 | `implemented` | 归档/恢复/草稿有证据；失败反馈缺陷（无 catch）；无删除入口 |
| `PRD-CONV-003` | 会话搜索与未读 | `partial` | 搜索有证据但语义偏差；未读仅内存按钮计数，无徽标/持久化/测试 |
| `PRD-CONV-004` | 消息流与渲染 | `implemented` | 18/18 + API 证据；消息纯度无独立 AC；COMP-message-colors 未签收 |
| `PRD-CONV-007` | 祖先消息整级加载 | `implemented` | 祖先/时间轴/413/403 有证据；尺寸断言缺、未部署；两个 COMP 未签收 |
| `PRD-CONV-005` | 发送·流式·断线重连 | `implemented` | 发送/流式/失败/防重复有证据；无重连测试、幂等未实现、停止未验真中断 |
| `PRD-CONV-006` | Composer 输入与快捷键 | `implemented` | 10/10；真实 IME 未手测；COMP 未签收 |
| `PRD-SYNC-001` | WS 连接与重连 | `implemented` | 后端顺序/since/fanout/恢复有证据；前端重连无测试 |
| `PRD-SYNC-002` | 多标签 active/ancestor/read cursor | `implemented` | 代码存在，**零测试**；`opId` 未去重 |
| `PRD-SYNC-003` | 发送模式/设置跨标签同步 | `implemented` | 单标签持久化有测试；跨标签零测试 |
| `PRD-SYNC-004` | 未读与已读游标 | `partial` | 仅前端内存态；无后端；口径未定 |
| `PRD-SYNC-005` | 远程访问与通知中心 | `unimplemented` | 无实现；无鉴权/通知模型；排除在本轮验收外 |

**未实现项（unimplemented）**：`PRD-SYNC-005`。
**覆盖口径**：0 covered / 11 partial / 1 gap —— `implemented` 只表示“可运行实现 + 部分证据”，不等于 AC 全部有证据。

## 7. 依赖、风险、待确认与边界清单

- 依赖：本域行为依赖 `SYNC-001` 的 WS 通道与 `SYNC-002` 的标签广播；WS 不可用时 P1 主路径只能走 HTTP 回退（当前无回退）。
- 风险 1：旧 `docs/tasks/frontend.md` 与后端能力面不一致；本 spec 不把“后端有接口”当“前端可用”（如 pin、DELETE、标题搜索）。
- 风险 2：组件 spec 与实现漂移（message-colors / timeline-groups / timeline-tip / composer-send-mode 均未按实现签收）。
- 风险 3：未读与远程访问的产品口径未定，`CHG-CONV-005` 全部 blocked。
- 待确认：① 搜索语义（标题 vs 消息）；② 未读 6 问（`CHG-CONV-005/spec.md` §3.1）；③ 主会话不可归档是否升为 AC；④ SYNC-005 是否立项。
- **非 P1 但页面可见（另域验收，不计入本域）**：工作台指标（P3/P10）、右栏任务投影（P2-TASK-002）、交付物（P4）、权限只读（P8）、卡片交互（M41/COMP）、团队/日程/记忆/智能体/工作台独立页面（P2–P10 冻结）。
- 证据：测试计划 [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；未执行项一律 `missing`；逐 PRD 六类状态与 owner 见 [`CONV-CLOSURE.md`](../../../docs/product/CONV-CLOSURE.md)。

# 会话核心契约（Session Core Spec）

> 本文只定义产品语义与验收标准，不绑定前端实现。
> 每个功能点都必须有对应测试：后端 Go 测试、前端 check、或 CLI 端到端测试。

## 0. 术语

- **主会话（root）**：`main`，唯一根节点，不可删除。
- **子会话**：挂在任意会话下的节点；可创建、归档、恢复。
- **会话负责人**：该会话的智能体（agent）。
- **迁移**：把消息从一个会话/智能体移动到另一个会话/智能体，内容不变。
- **拆分（split）**：智能体判断需要新子会话后，创建子会话并回溯迁移一段消息。
- **静默操作**：动作层执行，不向聊天流插入系统消息。

## 1. 会话模型

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| S1 | 只有一个主会话 `main`，不可删除 | 删除 main 被拒绝；重启后 main 存在 | 后端：`TestSessionMainUndeletable` |
| S2 | 子会话形成树，任意深度 | 创建/移动后 tree 正确、无环 | 后端：`TestSessionTreeNoCycle` |
| S3 | 项目不是独立实体，只是会话映射 | 不存在 project 表/API；会话承担项目语义 | 后端：契约测试 `TestNoProjectEntity`（或文档核对） |
| S4 | 子会话继承父会话的任务/要求/约束，不继承人格 | 父任务可见；切换负责人不改变父人格 | 后端：`TestSessionInheritanceNoPersona` |
| S5 | 会话可置顶、归档、恢复；归档=只读可恢复 | 归档后写消息被拒；恢复后可写 | 后端：`TestSessionArchiveReadOnly` |
| S6 | 空会话不保存；最多一个本地草稿 | 空会话不落库；重复新建返回同一草稿；首条消息后物化 | 后端：`TestM70*`；前端：`check-m70` |
| S7 | 主会话可聚合子会话视图（可选） | 仅本会话/含子会话切换不改变数据归属 | 前端：`check-session-scope` |

## 2. 消息归属与路由

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| R1 | 消息默认属于当前会话 | 发送后 sessionId 正确 | 后端：`TestChatSendSession` |
| R2 | 显式提到子会话标题 → 路由到该子会话 | 目标会话有 user+agent；主会话无新消息 | 后端：`TestAutoRouteExplicitChildTitle` |
| R3 | 意图为新需求/新工作流 → 创建子会话并路由 | 新子会话存在，消息在其中 | 后端：`TestM56IntentNewSession` |
| R4 | 与已有子会话相关 → 路由到该子会话 | 相关性路由成功 | 后端：`TestM43AutoRouteRelevance` |
| R5 | 无法判断/闲聊 → 留在主会话 | 主会话收到消息 | 后端：`TestRouteFallsBackMain` |
| R6 | 显式"就在主会话回答/别路由"优先 | 不路由 | 后端：`TestRouteExplicitOverride` |
| R7 | 回复子会话消息 → 回复落在该子会话 | reply 的 sessionId 与目标一致 | 后端：`TestM43ReplyInheritance` |
| R8 | 路由静默：不产生 system/提示消息 | 主会话无新增消息 | 后端：`TestM43NoHintMessage` |
| R9 | 路由可关闭（配置） | 关闭后不自动路由 | 后端：`TestAutoRouteDisabled` |
| R10 | 跨任意会话引用/回复：回复仍写当前会话 | replyTo 指向祖先，reply 属于当前子会话 | 后端：`TestCrossSessionReplyStaysCurrent` |

## 3. 事后拆分与消息迁移

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| M0 | 迁移范围由智能体智能判断（用户可显式指定覆盖） | 智能体决定哪些消息/数据随迁；用户给出范围时按用户；不确定先问 | 评测：`eval-m0-migrate-scope` |
| M1 | 智能体可在任意时刻判断需要新子会话 | 创建子会话成功 | 后端：`TestSessionSplitCreate` |
| M2 | 回溯范围按语义，不按固定条数；支持任意消息 id 集合 | 可迁移任意消息列表；用户指定优先 | 后端：`TestMessageMigrateArbitraryIDs` |
| M3 | 用户与智能体消息成对迁移，顺序保持 | 迁移后顺序与原顺序一致 | 后端：`TestMessageMigrateOrder` |
| M4 | 内容不变：正文/时间戳/附件/卡片/引用 | 字段逐一相等（除归属） | 后端：`TestMessageMigratePreservesContent` |
| M5 | 归属重写：目标会话 + 可选目标智能体 | sessionId/agentId 正确，原会话移除 | 后端：`TestMessageMigrateOwnership` |
| M6 | 来源可追溯：`migratedFrom` + 审计事件 | 迁移记录可查，内容不被改写 | 后端：`TestMessageMigrateProvenance` |
| M7 | 单事务、幂等：重复迁移不重复 | 同一批重复执行结果一致 | 后端：`TestMessageMigrateIdempotent` |
| M8 | 不产生任何系统/提示消息 | 迁移后消息数 = 原消息数（目标） | 后端：`TestMessageMigrateNoSyntheticMessages` |
| M9 | 跨智能体迁移遵守人格/权限 | 非授权智能体不能迁；负责人可迁 | 后端：`TestMessageMigrateAgentPermission` |
| M10 | 可回滚：按 migratedFrom 移回 | 回滚后原会话/原智能体恢复 | 后端：`TestMessageMigrateRollback` |

## 4. 记忆随迁移

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| MM1 | 消息派生的溯源记录（raw/mentions/attribution）改挂目标会话 | 原会话不再引用；目标可查 | 后端：`TestMemoryProvenanceMigrated` |
| MM2 | memory_items 的 scope/sessionId 更新 | 目标会话可召回，原会话不重复 | 后端：`TestMemoryScopeMigrated` |
| MM3 | agent_memory 归属随智能体迁移，仍只读/人格隔离 | 不越权读取，归属正确 | 后端：`TestAgentMemoryMigratedIsolated` |
| MM4 | 召回索引（实体/词项/向量）重建或失效 | 迁移后目标可召回，旧索引无残留 | 后端：`TestRecallIndexRebuilt` |
| MM5 | 巩固/队列任务重新入队或取消，按消息 id 幂等 | 不重复巩固、不丢记忆 | 后端：`TestMemoryConsolidationMigrated` |
| MM6 | 冲突/争议记忆保留，不自动合并 | 冲突仍在，标注正确 | 后端：`TestMemoryConflictPreservedOnMigrate` |
| MM7 | 迁移与记忆迁移同事务 | 任一步失败则整体回滚 | 后端：`TestMigrateMemoryAtomic` |

## 5. 消息流纯度

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| P1 | 聊天流只有 user/agent 两种角色 | API 不返回 system 消息；前端不渲染 | 后端：`TestNoSystemMessages`；前端：`check-no-system` |
| P2 | 操作静默：迁移/路由/归档/任务不产生消息 | 操作前后消息数不变（除明确回复） | 后端：`TestSilentOperations` |
| P3 | 不生成历史/补写/合成消息 | 迁移只搬原消息；页面加载不新增消息 | 后端：`TestNoBackfilledMessages` |
| P4 | 智能体只在需要时说话 | 无必要不产生 agent 消息 | 人工/会话评测用例 |
| P5 | 父会话上下文是展示组合，不是新消息 | 跨会话引用不新增 message 行 | 后端：`TestCrossSessionReferenceNoMessage` |

## 7. 任务启动与汇报（Kickoff Protocol）

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| K1 | 收到任务先评估规模，决定方案展示力度 | 快速任务：一句话方案；长任务：目标/步骤/产出/风险 | 评测用例：`eval-k1-plan-depth` |
| K2 | **所有任务执行前都要先描述方案**，不能直接"好，我马上开始做" | 任何 task 创建或副作用工具调用前，存在 agent 方案消息 | 后端：`TestPlanBeforeTaskCreate`；评测：`eval-k2-plan-before-work` |
| K3 | 方案力度按上下文：用户有要求按用户，没要求由智能体评估 | 用户说"简单说"则一句话；说"详细方案"则完整方案 | 评测用例：`eval-k3-plan-verbosity-override` |
| K4 | 禁止空泛确认替代方案 | 不能只回"好的/马上开始"而不说明做什么 | 评测用例：`eval-k4-no-empty-ack` |
| K5 | 确认后执行模式：用户说"开始执行"后，先回一条开始消息，再创建任务 | 消息顺序：用户指令 → agent"开始执行" → task created | 后端：`TestKickoffAckBeforeTaskCreate` |
| K6 | 确认阶段不提前执行 | 用户未确认前不创建任务/不调用副作用工具 | 评测用例：`eval-k6-wait-confirm` |
| K7 | 方案至少包含：目标、做法、预计产出（按力度裁剪） | 快速任务可一句话；长任务需完整 | 人工/评测检查 |
| K8 | 用户显式指令优先（如"直接做，不用汇报"） | 按用户要求调整力度或跳过 | 评测用例：`eval-k8-explicit-override` |
| K9 | 方案之后才开始执行；执行中按约定汇报进度 | 方案消息时间早于 task/工具副作用 | 后端：`TestPlanBeforeTaskCreate` |

默认判断（可配置）：预计需要多步工具调用、>2 分钟、或涉及后台任务 → 长任务，给完整方案；其余给一句话方案，然后执行。无论长短，**都必须先有方案消息**。

## 8. 任务确认（Confirmation Policy）

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| C1 | 复杂度判断：复杂/长任务先确认；简单任务可不确认 | 复杂任务在执行前出现确认请求；简单任务不强制 | 评测：`eval-c1-confirm-complexity` |
| C2 | 高危动作一律确认（删除、清空、覆盖、发布、转账等） | 未确认前不执行；确认后才执行 | 后端：`TestHighRiskRequiresConfirm` |
| C3 | 确认前不得有副作用（任务创建/写/删/执行） | 确认前仅方案与只读操作 | 后端：`TestConfirmBeforeSideEffects` |
| C4 | 确认形式：交互卡片（确认/取消） | 卡片含确认、取消按钮；状态 active | 后端：`TestConfirmCardCreated`；前端：`check-confirm-card` |
| C5 | 用户在卡片点「确认/取消」→ 动作回传并更新卡片状态 | submitted/disabled；确认后执行，取消后不执行 | 后端：`TestConfirmCardActions` |
| C6 | 用户发文字「确认/取消/同意/不用了」→ 自动识别并更新对应卡片 | 卡片版本+1、WS `card.updated`；无需再点按钮 | 评测：`eval-c6-text-updates-card`；后端：`TestTextConfirmUpdatesCard` |
| C7 | 文字确认与卡片点击幂等，不能重复执行 | 同一确认只执行一次 | 后端：`TestConfirmIdempotent` |
| C8 | 确认/取消不产生系统消息 | 聊天流只有用户与智能体消息；卡片状态更新即可 | 后端：`TestConfirmNoSystemMessage` |
| C9 | 确认后执行：先回"开始执行"消息，再创建任务/副作用 | 顺序正确 | 后端：`TestKickoffAckAfterConfirm` |
| C10 | 卡片可被智能体更新（补充说明/变更方案）→ version+1 | `card.updated` 到达，旧按钮失效 | 后端：`TestConfirmCardUpdated` |

### 确认判定默认
- 高危动作（R4/R5）：必须确认，无法被"直接做"绕过；
- 影响范围大、不可逆、需要多步/长时间：确认；
- 只读、可回滚、低风险的小操作：可不确认；
- 用户显式"直接做/不用确认"可跳过普通确认，但**高危仍必须确认**。

### 文字确认与卡片联动
- 识别用户文字意图（确认/取消），定位当前会话最近一张待确认卡片；
- 更新卡片 `status`、`version`，发 `card.updated` 与审计事件；
- 卡片按钮与文字确认走同一幂等键，避免双重执行；
- 若存在多张待确认卡片，先问用户确认哪一张，不猜。

## 9. 长程任务状态视图（Task Stack）

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| T1 | 长程任务聊天流只保留开始、结束两条消息 | 中间进度不产生聊天消息 | 评测：`eval-t1-long-task-two-messages` |
| T2 | 中间状态由输入框上方的悬浮「任务概览」展示 | 有活跃长任务时视图出现；无任务自动隐藏 | 前端：`check-task-stack` |
| T3 | 每条概览：主标题（任务名）+ 副标题（当前步骤/解释）+ 状态 | 标题/步骤清晰，状态可区分 | 前端：`check-task-stack-content` |
| T4 | 多任务堆叠，最多默认展示 1–3 条 | 超过 3 条折叠为「还有 N 个任务」，不遮挡消息 | 前端：`check-task-stack-limit` |
| T5 | 超出部分可展开/收起；点击可查看全部进行中任务 | 展开后列表完整；可缩回 | 前端：`check-task-stack-expand` |
| T6 | 状态更新走 WS/实时数据，版本变化不产生聊天消息 | 视图实时变化，消息数不变 | 后端：`TestTaskStatusNoChatMessage`；前端：`check-task-stack-live` |
| T7 | 点击任务卡进入任务详情/运行状态，不改变当前会话 | 详情可看步骤、日志、取消/暂停 | 前端：`check-task-stack-detail` |
| T8 | 快速任务不出现常驻概览；完成后直接结束消息 | 短任务不堆叠 | 前端：`check-task-stack-quick` |
| T9 | 堆叠顺序：执行中优先，其次按更新时间 | 最新/活跃任务在前 | 前端：`check-task-stack-order` |
| T10 | 需要用户决策/阻塞时，用确认卡片或单条必要消息，不用状态刷屏 | 只有必要交互 | 评测：`eval-t10-blocker-single-message` |

### 视觉与交互
- 位置：输入框上方、消息列表底部，悬浮但不遮住最后几条消息；
- 默认最多 3 条，缩进/紧凑卡片；超出显示「还有 N 个任务，展开」；
- 展开为可滚动列表，可逐项折叠；
- 卡片内容：主标题 = 任务/步骤名，副标题 = 当前动作与原因，右侧状态/耗时；
- 结束或取消后从栈中移除，结束消息为最终汇报。

## 10. 交互卡片与操作确认

| ID | 规则 | 验收标准 | 测试 |
|---|---|---|---|
| A1 | 必要交互统一走交互卡片：方案确认、选择、表单、审批、取消 | 对应场景出现卡片，而非纯文字追问 | 评测：`eval-a1-card-for-interaction` |
| A2 | 用户每次有效操作后，至少收到一条智能体消息确认状态 | 点按钮/文字确认/提交表单后都有 agent 消息 | 后端：`TestActionAckMessage`；前端：`check-action-ack` |
| A3 | 确认后开始执行：先发确认消息，再执行/建任务 | 消息先于副作用；内容含"已确认/开始执行" | 后端：`TestConfirmAckBeforeExecution` |
| A4 | 取消/拒绝也要确认消息 | 明确告知"已取消/未执行" | 后端：`TestCancelAckMessage` |
| A5 | 确认消息是 agent 消息，不是 system 消息 | 聊天流只有 user/agent；无 system | 后端：`TestAckNotSystemMessage` |
| A6 | 重复点击/重复文字确认幂等：只执行一次，重复操作给出"已处理"或不重复执行 | 不重复建任务；不重复副作用 | 后端：`TestActionIdempotentAck` |
| A7 | 每次操作只发一条确认，不按内部步骤刷屏 | 一个用户操作对应一条 agent 确认 | 前端/评测：`check-action-ack-once` |
| A8 | 卡片可承载任意必要交互（含大模型方案确认） | 方案卡片含确认/取消；确认后进入执行 | 评测：`eval-a8-plan-card` |

### 统一交互模型
- 卡片动作 `route=agent`：用户操作转成结构化消息，触发智能体回复；
- 卡片动作 `route=action`：执行动作后，智能体仍需发一条结果/状态确认；
- 文字回复与卡片按钮走同一意图/幂等键；
- 确认后典型消息：
  - 确认：「好，已确认，现在开始执行方案」
  - 取消：「已取消，本次不执行」
  - 提交表单：「已收到填写的 X，接下来…」
- 所有确认消息必须早于任务创建/副作用，或与结果同一轮返回。

## 6. 已对齐决策

1. **迁移范围**：由智能体判断需要迁移哪些消息/数据；用户显式指定优先；不确定时先问用户，不擅自扩大。
2. **迁移粒度**：默认把用户消息与对应智能体回复成对迁移，保持顺序；也支持显式单条或消息集合。
3. **跨会话引用/回复**：回复仍写当前子会话，不迁到父会话（已确认）。
4. **目标智能体**：用户显式指定 > 目标会话负责人 > 当前负责人；迁移后是否同步目标会话 owner 由显式参数决定。
5. **空会话**：有任务/团队/子会话引用但无消息的会话保留；完全空且无引用才清理。
6. **记忆迁移**：记忆随消息迁到目标 scope；不保留原 scope 的只读副本，靠 `migratedFrom` + 审计追溯。
7. **迁移通知**：不产生系统/提示消息；需要时由智能体在正常回复里说明。

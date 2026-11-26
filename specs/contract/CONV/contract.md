# CONV 域契约表

状态：冻结
版本：v0.4.2
冻结日期：2026-11-25
owner：产品、设计、前端、后端、测试与验收（见 specs/changes/CHG-CONV-007/spec.md:9）
变更单号：CHG-CONV-006、CHG-CONV-007（v0.4 由 CHG-CONV-007 的 T01 冻结）
域：CONV
存放路径：specs/contract/CONV/contract.md
依据：docs/framework/templates/contract-table.md v1.3；scripts/check-contract.mjs 六类
覆盖：CHG-CONV-006 的 33 条 AC 与 CHG-CONV-007 的 18 条 AC，共 51 条 AC；v0.4 另冻结 26 条判据（18 条产品 AC 加 8 条变更级 AC），契约项合计 97 条
最后更新：2026-11-26

本表按 `scripts/check-contract.mjs` 校验的六类（数据形状、状态机、错误码、事件与消息、界面几何与选择器、验收入口）建模。模板第 7–11 类（设计令牌、命令行契约、数据分布、租户与授权、发布与签名）本次变更不涉及，未建。表首字段供脚本读取，状态自 v0.4 起为 `冻结`：冻结口径以本表与五列 spec §17 的同一字段名为准，实现与文档不一致时按本表回写文档或开实现卡修代码，不回退契约。

v0.2（2026-11-25）只动类 1 与类 5：类 1 补 CT-CONV-060 至 CT-CONV-097 共 38 行，覆盖 §5.1、§8.1 的 HTTP 形状与 §17.2、§17.5 的数据模型列；类 5 把选择器从末列移回 `选择器或aria` 列，与设计 §17.2.7、前端 §17.2.1 同值。类 2、类 3、类 4、类 6 未改，51 条 AC 不变。

v0.4（2026-11-25，CHG-CONV-007 T01）补 46 条，编号 CT-CONV-501 至 CT-CONV-546：九接口冻结 9 条（501–509）、越权与归属分流 6 条（510–515）、依赖连接完成判定 3 条（516–518）、错误信封 1 条（519）、游标与分页 1 条（520）、18 条产品 AC 判据 18 条（521–538）、8 条变更级 AC 判据 8 条（539–546）。新增表都放在各类标题下方的二级小节里，不替换类首表，脚本仍只解析类首表；因此这 46 条不参与 MX-G-26 至 MX-G-31 的字段与状态比对，只作为实现与验收的冻结口径，数值与判据来源可逐行追到五列 spec。

## 五列对应

产品、设计、前端、后端、测试五列各一行，指向本域真实文件与章节；契约项编号与下文六类表一致。

| 列 | 文件 | 章节与行号 | 对应契约项 | 判据锚点 |
|---|---|---|---|---|
| 产品 | `specs/product/P1-CONV/spec.md` | §4.1–§4.6，AC 定义 74–366 行 | CT-CONV-001 至 CT-CONV-451 | 51 条 AC 编号与判据原文 |
| 设计 | `specs/design/P1-CONV/spec.md` | §17 从 758 行起；§17.2.1 尺寸、§17.12 视觉判据 | CT-CONV-301 至 CT-CONV-305 | 面板 280、竖条 40、整栏 320、面板头 44、面板脚 28 |
| 前端 | `specs/frontend/P1-CONV/spec.md` | §17，1010–1448 行；选择器表 1051–1057，AC 表 1022–1039 | CT-CONV-301 至 CT-CONV-305、CT-CONV-440 至 CT-CONV-451 | 五个右栏选择器与 009 的 18 条断言 |
| 后端 | `specs/backend/P1-CONV/spec.md` | §17 从 760 行起；§14 685–723，§17.10 1189–1204，§17.12 1222–1243 | CT-CONV-001 至 CT-CONV-206 | N1–N9 字段、39 个错误码、6 个 WS 事件、009 后端判据 |
| 测试 | `specs/test/P1-CONV/test-plan.md` | AC→TC 映射矩阵 126–183 行；TC-P1-CONV-001..054 | CT-CONV-401 至 CT-CONV-451 | 33 条 pass 与 18 条 missing 的 TC 编号 |

## 类 1 数据形状

字段名取后端 spec 里实际出现的字段：CT-CONV-001 至 CT-CONV-029 来自 §17.4 的请求/响应表，CT-CONV-060 至 CT-CONV-097 补齐 §5.1、§8.1 的 HTTP 形状与 §17.2、§17.5 的数据模型列。建表语句、索引与迁移版本不在本表重复，只登记字段名、类型与边界。

| 编号 | 概念 | 实体或端点 | 字段路径 | 类型 | 可空 | 默认值 | 枚举取值或边界 | 来源 |
|---|---|---|---|---|---|---|---|---|
| CT-CONV-001 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `mode` | string | 否 | `plan` | plan、react 或 explore | 后端 §17.4.1 N1 请求体 |
| CT-CONV-002 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `goal` | string | 否 | 空串 | 非空文本 | 后端 §17.4.1 N1 请求体 |
| CT-CONV-003 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `inputs` | string[] | 否 | `[]` | 字符串数组 | 后端 §17.4.1 N1 请求体 |
| CT-CONV-004 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `constraints` | string[] | 否 | `[]` | 字符串数组 | 后端 §17.4.1 N1 请求体 |
| CT-CONV-005 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `tasks` | object[] | 否 | 无 | 非空数组 | 后端 §17.4.1 N1 请求体 |
| CT-CONV-006 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `clientMutationId` | string | 否 | 空串 | 会话内唯一 | 后端 §17.4.1 N1 请求体 |
| CT-CONV-007 | 任务创建响应 | `POST /api/sessions/{id}/tasks` | `ok` | bool | 否 | `true` | 恒为 true | 后端 §17.4.1 N1 201 响应 |
| CT-CONV-008 | 任务创建响应 | `POST /api/sessions/{id}/tasks` | `batchId` | string | 否 | 无 | batch- 前缀 | 后端 §17.4.1 N1 201 响应 |
| CT-CONV-009 | 任务创建响应 | `POST /api/sessions/{id}/tasks` | `messageId` | string | 否 | 无 | 消息 id | 后端 §17.4.1 N1 201 响应 |
| CT-CONV-010 | 任务创建响应 | `POST /api/sessions/{id}/tasks` | `counts` | object | 否 | 五键整数 | 五键整数 | 后端 §17.4.1 N1 201 响应 |
| CT-CONV-011 | 任务创建响应 | `POST /api/sessions/{id}/tasks` | `idempotent` | bool | 否 | `false` | 布尔 | 后端 §17.4.1 N1 201 响应 |
| CT-CONV-012 | 任务列表响应 | `GET /api/sessions/{id}/tasks` | `total` | number | 否 | `0` | 整数 | 后端 §17.4.1 N2 响应 |
| CT-CONV-013 | 任务列表响应 | `GET /api/sessions/{id}/tasks` | `hasMore` | bool | 否 | `false` | 布尔 | 后端 §17.4.1 N2 响应 |
| CT-CONV-014 | 任务列表响应 | `GET /api/sessions/{id}/tasks` | `nextBefore` | string | 是 | 空串 | 任务 id 或空串 | 后端 §17.4.1 N2 响应 |
| CT-CONV-015 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `task` | object | 否 | 无 | 任务投影对象 | 后端 §17.4.1 N3 响应 |
| CT-CONV-016 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `steps` | object[] | 否 | `[]` | 步骤数组 | 后端 §17.4.1 N3 响应 |
| CT-CONV-017 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `currentStepId` | string | 否 | 空串 | 步骤 id 或空串 | 后端 §17.4.1 N3 响应 |
| CT-CONV-018 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `traces` | object[] | 否 | `[]` | 轨迹数组 | 后端 §17.4.1 N3 响应 |
| CT-CONV-019 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `deliverables` | object[] | 否 | `[]` | 交付物数组 | 后端 §17.4.1 N3 响应 |
| CT-CONV-020 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `context` | object | 否 | 历史计数为零 | 目标、输入、约束与历史计数 | 后端 §17.4.1 N3 响应 |
| CT-CONV-021 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `budget` | object | 否 | 见 N3 | 预算对象 | 后端 §17.4.1 N3 响应 |
| CT-CONV-022 | 任务取消响应 | `POST /api/sessions/{id}/tasks/{taskId}/cancel` | `cancelled` | string[] | 否 | `[]` | 任务 id 数组 | 后端 §17.4.1 N4 响应 |
| CT-CONV-023 | 任务取消响应 | `POST /api/sessions/{id}/tasks/{taskId}/cancel` | `changed` | bool | 否 | `false` | 布尔 | 后端 §17.4.1 N4 响应 |
| CT-CONV-024 | 任务图响应 | `GET /api/sessions/{id}/tasks/graph` | `nodes` | object[] | 否 | `[]` | 节点数组 | 后端 §17.4.1 N8 响应 |
| CT-CONV-025 | 任务图响应 | `GET /api/sessions/{id}/tasks/graph` | `edges` | object[] | 否 | `[]` | 边数组 | 后端 §17.4.1 N8 响应 |
| CT-CONV-026 | 任务图响应 | `GET /api/sessions/{id}/tasks/graph` | `layers` | object[] | 否 | `[]` | 层数组 | 后端 §17.4.1 N8 响应 |
| CT-CONV-027 | 交付物列表响应 | `GET /api/sessions/{id}/deliverables` | `groups` | object[] | 否 | `[]` | 分组数组 | 后端 §17.4.1 N9 响应 |
| CT-CONV-028 | 交付物列表响应 | `GET /api/sessions/{id}/deliverables` | `files` | object[] | 否 | `[]` | 文件数组 | 后端 §17.4.1 N9 响应 |
| CT-CONV-029 | 交付物列表响应 | `GET /api/sessions/{id}/deliverables` | `fileCount` | number | 否 | `0` | 整数 | 后端 §17.4.1 N9 响应 |
| CT-CONV-060 | 会话消息发送请求 | `POST /api/chat` | `sessionId` | string | 是 | `main` | 会话 id；缺省 `main` | 后端 §5.1 请求体 |
| CT-CONV-061 | 会话消息发送请求 | `POST /api/chat` | `text` | string | 条件必填 | 空串 | TrimSpace 后非空或至少 1 个附件；UTF-8 字符数 ≤4000 | 后端 §5.1 请求体 |
| CT-CONV-062 | 会话消息发送请求 | `POST /api/chat` | `attachments` | string[] | 是 | `[]` | 最多 5 个 upload id，须属于该会话 | 后端 §5.1 请求体 |
| CT-CONV-063 | 会话消息发送请求 | `POST /api/chat` | `replyToMessageId` | string | 是 | 空串 | 引用消息 id；不存在或跨会话返回 400 | 后端 §5.1 请求体 |
| CT-CONV-064 | 会话投影响应 | `GET /api/sessions/{id}/spec-projection` | `status` | string | 否 | 无 | `draft`、`active`、`completed`、`archived`；`sessions.archived!=0` 强制 `archived` | 后端 §8.1 响应 |
| CT-CONV-065 | 会话投影响应 | `GET /api/sessions/{id}/spec-projection` | `revision` | number | 否 | `0` | 整数，每次 spec 更新加 1 | 后端 §8.1 响应 |
| CT-CONV-066 | 会话投影响应 | `GET /api/sessions/{id}/spec-projection` | `updatedAt` | number | 否 | `0` | 毫秒时间戳 | 后端 §8.1 响应 |
| CT-CONV-067 | 会话投影响应 | `GET /api/sessions/{id}/spec-projection` | `pendingConfirmations` | object | 否 | `{total,items,hasMore}` | 待确认项合计，各来源最多 3 条 | 后端 §8.1 响应 |
| CT-CONV-068 | 会话投影响应 | `GET /api/sessions/{id}/spec-projection` | `links` | object | 否 | 无 | `fullSpec` 与 `self` 两个链接 | 后端 §8.1 响应 |
| CT-CONV-069 | 任务模型 | `tasks` 表 | `inputsJson` | string | 否 | `[]` | JSON 字符串数组，≤20 条 | 后端 §17.2.1 |
| CT-CONV-070 | 任务模型 | `tasks` 表 | `constraintsJson` | string | 否 | `[]` | JSON 字符串数组，≤20 条 | 后端 §17.2.1 |
| CT-CONV-071 | 任务模型 | `tasks` 表 | `contextJson` | string | 否 | `{}` | 键固定为 `goal`、`inputs`、`constraints`、`historyCount`、`sessionId` | 后端 §17.2.1 |
| CT-CONV-072 | 任务模型 | `tasks` 表 | `waitingReason` | string | 否 | 空串 | 空串、`dependency`、`confirmation`、`resource` | 后端 §17.2.1 |
| CT-CONV-073 | 任务模型 | `tasks` 表 | `waitingSince` | number | 否 | `0` | 进入等待的毫秒时间戳，退出等待清 0 | 后端 §17.2.1 |
| CT-CONV-074 | 任务模型 | `tasks` 表 | `startedAt` | number | 否 | `0` | 首次进入 `running` 的时间，重试不重置 | 后端 §17.2.1 |
| CT-CONV-075 | 任务模型 | `tasks` 表 | `finishedAt` | number | 否 | `0` | 首次进入 `done`、`failed`、`cancelled` 的时间，重试清 0 | 后端 §17.2.1 |
| CT-CONV-076 | 任务模型 | `tasks` 表 | `failReason` | string | 否 | 空串 | 最近一次失败原因，≤500 字，重试成功后清空 | 后端 §17.2.1 |
| CT-CONV-077 | 任务模型 | `tasks` 表 | `deadlineAt` | number | 否 | `0` | 用户时限毫秒时间戳，0 表示未设；只提醒不取消 | 后端 §17.2.1 |
| CT-CONV-078 | 任务模型 | `tasks` 表 | `deadlineRemindedAt` | number | 否 | `0` | 时限提醒已发送的时间，保证只发一次 | 后端 §17.2.1 |
| CT-CONV-079 | 任务模型 | `tasks` 表 | `triggerCount` | number | 否 | `0` | 被依赖触发启动的累计次数，`each` 下等于已完成前置数 | 后端 §17.2.1 |
| CT-CONV-080 | 任务步骤 | `task_steps` 表 | `taskId` | string | 否 | 无 | 所属任务 id | 后端 §17.2.2 |
| CT-CONV-081 | 任务步骤 | `task_steps` 表 | `seq` | number | 否 | 无 | 同一任务内从 1 连续递增且唯一 | 后端 §17.2.2 |
| CT-CONV-082 | 任务步骤 | `task_steps` 表 | `title` | string | 否 | 无 | 步骤名，≤200 字 | 后端 §17.2.2 |
| CT-CONV-083 | 任务步骤 | `task_steps` 表 | `summary` | string | 是 | 空串 | 步骤摘要，≤200 字 | 后端 §17.2.2 |
| CT-CONV-084 | 任务轨迹 | `task_traces` 表 | `stepId` | string | 是 | 空串 | 所属步骤；`explore` 模式与步骤外动作留空 | 后端 §17.2.3 |
| CT-CONV-085 | 任务轨迹 | `task_traces` 表 | `category` | string | 否 | 无 | `think`、`action`、`observe` | 后端 §17.2.3 |
| CT-CONV-086 | 任务轨迹 | `task_traces` 表 | `tool` | string | 是 | 空串 | `action` 与 `observe` 的工具名，其它类别为空 | 后端 §17.2.3 |
| CT-CONV-087 | 任务轨迹 | `task_traces` 表 | `at` | number | 否 | 无 | 发生时间毫秒时间戳 | 后端 §17.2.3 |
| CT-CONV-088 | 任务批次 | `task_batches` 表 | `taskCount` | number | 否 | 无 | 批内任务数，1–12 | 后端 §17.2.4 |
| CT-CONV-089 | 任务批次 | `task_batches` 表 | `createdAt` | number | 否 | 无 | 创建时间毫秒时间戳 | 后端 §17.2.4 |
| CT-CONV-090 | 任务依赖 | `task_deps` 表 | `depId` | string | 否 | 无 | 前置任务 id，同会话同批次 | 后端 §17.2.5 |
| CT-CONV-091 | 任务依赖 | `task_deps` 表 | `joinMode` | string | 否 | `all` | `all`、`any`、`each`，同一等待方全部入边一致 | 后端 §17.2.5 |
| CT-CONV-092 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `tasks[].key` | string | 是 | 按 `t1`、`t2` 依次生成 | 批内唯一；重复返回 400 `invalid_argument` | 后端 §17.4.1 N1 请求体 |
| CT-CONV-093 | 任务创建请求 | `POST /api/sessions/{id}/tasks` | `tasks[].dependsOn` | string[] | 是 | `[]` | 批内其它任务的 `key`；自依赖、环、跨批次返回 400 | 后端 §17.4.1 N1 请求体 |
| CT-CONV-094 | 任务详情响应 | `GET /api/sessions/{id}/tasks/{taskId}` | `tracesHasMore` | bool | 否 | `false` | 轨迹是否被截断 | 后端 §17.4.1 N3 响应 |
| CT-CONV-095 | 任务卡片消息 | `messages` 表 | `role` | string | 否 | `agent` | 与消息流其它智能体消息一致，不新增角色 | 后端 §17.5.1 |
| CT-CONV-096 | 任务卡片消息 | `messages` 表 | `internal` | number | 否 | `0` | `0` 为用户可见，`1` 为内部消息 | 后端 §17.5.1 |
| CT-CONV-097 | 任务卡片消息 | `messages` 表 | `displayStatus` | string | 否 | 无 | `pending`、`running`、`done`、`failed` 四展示态，四态之和等于节点总数 | 后端 §17.3.1 与 §17.5.3 WS 载荷 |
| CT-CONV-042 | Composer props | 前端 `Composer` 受控 props | `disabled` | bool | 否 | `false` | 发送中或会话只读时为 `true` | 前端 spec §1.8 |
| CT-CONV-043 | Composer props | 前端 `Composer` 受控 props | `streaming` | bool | 否 | `false` | 流式增量进行中为 `true` | 前端 spec §1.8 |
| CT-CONV-044 | Composer props | 前端 `Composer` 受控 props | `sendError` | string | 是 | 无 | 发送失败文案；空串表示无错误 | 前端 spec §1.8 |
| CT-CONV-045 | 发送入参 | 前端 `sendChat` 入参 | `sessionId` | string | 否 | 无 | 目标会话 id | 前端 spec §1.8 |
| CT-CONV-046 | 发送入参 | 前端 `sendChat` 入参 | `text` | string | 否 | 无 | 用户输入正文，发送前 trim | 前端 spec §1.8 |
| CT-CONV-047 | 发送入参 | 前端 `sendChat` 入参 | `clientMutationId` | string | 否 | 无 | 一次发送一个，重试复用 | 前端 spec §1.8 |
| CT-CONV-048 | 消息字段 | 前端 `Message` 结构 | `role` | string | 否 | `agent` | `user`、`agent`、`system` | 前端 spec §1.8 与 §17.6.1 |
| CT-CONV-049 | 消息字段 | 前端 `Message` 结构 | `category` | string | 是 | 无 | 任务卡片消息为 `task` | 前端 spec §1.8 与 §17.6.1 |
| CT-CONV-050 | 消息字段 | 前端 `Message` 结构 | `taskId` | string | 是 | 无 | 任务卡片消息指向的任务 id | 前端 spec §1.8 与 §17.6.1 |
| CT-CONV-051 | 消息字段 | 前端 `Message` 结构 | `batchId` | string | 是 | 无 | 批量创建时写入的批次 id | 前端 spec §1.8 与 §17.6.1 |
| CT-CONV-052 | 消息字段 | 前端 `Message` 结构 | `taskCount` | number | 是 | 无 | 批次消息的任务数，1–12 | 前端 spec §1.8 与 §17.6.1 |
| CT-CONV-053 | 跨标签同步消息 | 前端 `BroadcastChannel` 消息 | `tabId` | string | 否 | 无 | 发送方标签 id | 前端 spec §1.8 |
| CT-CONV-054 | 跨标签同步消息 | 前端 `BroadcastChannel` 消息 | `opId` | string | 否 | 无 | 一次操作一个，接收方按它去重 | 前端 spec §1.8 |
| CT-CONV-055 | 跨标签同步消息 | 前端 `BroadcastChannel` 消息 | `at` | number | 否 | 无 | 发送时间毫秒时间戳 | 前端 spec §1.8 |
| CT-CONV-056 | 任务列表查询 | `GET /api/sessions/{id}/tasks` | `limit` | number | 是 | `50` | 1–100，越界 400 `invalid_task_limit` | 后端 §17.4.2 N2 查询参数 |
| CT-CONV-057 | 任务列表查询 | `GET /api/sessions/{id}/tasks` | `before` | string | 是 | 空 | 上一页最后一条任务 id | 后端 §17.4.2 N2 查询参数 |

本段 CT-CONV-060 至 CT-CONV-068 是 HTTP 线上形状，CT-CONV-069 至 CT-CONV-097 是数据模型与消息表列，CT-CONV-042 至 CT-CONV-055 是前端 props、发送入参与消息结构，CT-CONV-056 至 CT-CONV-057 是任务列表查询参数；字段路径按后端列名或前端字段名归一后的驼峰写法登记，两侧归一后同名，脚本按归一化名比对字段与类型。前端独有的字段以「前端 spec §1.8」为来源，后端独有的 `attachments`、`replyToMessageId` 等字段不设前端行，因为它们不在前端 props 或消息结构里，前端侧按不适用处理。

### 接口冻结（N1 至 N9）

九条接口全部挂在会话段下，路径与方法以本表为准；`backend/internal/modules/tasks/conv_http.go:15-25` 的注册顺序只作实现参照，不作契约来源。前端 `frontend/src/api.ts:405-431` 现有的 `GET /api/tasks/{id}`、`GET /api/sessions/{id}/task-graph`、`POST /api/tasks/{id}/confirmation`、`POST /api/tasks/{id}/resume` 四条路径在会话内路由上不存在，真机返回 404，实现卡按本表改路径，不改后端路由。不带会话段的 `/api/tasks*` 冻结为兼容层，只服务既有动作层，前端与验收脚本不得调用。

| 编号 | 方法 | 路径 | 成功 | 主要错误码 | 幂等 | 分页与游标 | 归属校验 |
|---|---|---|---|---|---|---|---|
| CT-CONV-501 | POST | `/api/sessions/{id}/tasks` | 201 | 400 `invalid_task_mode`、`invalid_argument`、`invalid_task_limit`、`task_batch_too_large`、`invalid_task_dependency`、`task_context_too_large`；404 `task_not_found`；409 `mutation_in_progress`；503 `task_executor_unavailable` | 同一会话内 `clientMutationId` 相同且请求体相同，重放 201 且 `idempotent=true`、`batchId` 不变 | 无分页；批量 1–12，单批 12 条上限 | 会话不存在返回 404，不建任何行 |
| CT-CONV-502 | GET | `/api/sessions/{id}/tasks` | 200 | 400 `invalid_task_limit`、`invalid_task_status`、`invalid_task_mode`、`invalid_argument`；404 `task_not_found` | 安全方法，不改变任务状态与计数 | `limit` 1–100 缺省 50；`before` 为不透明游标；`hasMore`、`nextBefore` 成对出现 | 会话不存在返回 404 |
| CT-CONV-503 | GET | `/api/sessions/{id}/tasks/graph` | 200 | 400 `invalid_argument`（`batchId` 格式不是 `batch-<16 hex>`）；404 `task_not_found` | 安全方法 | 不分页；`batchId` 可选，缺省整会话 | 会话不存在返回 404 |
| CT-CONV-504 | GET | `/api/sessions/{id}/tasks/{taskId}` | 200 | 404 `task_not_found`（不存在或跨会话） | 安全方法 | `traceLimit` 1–500 缺省 200；`traceBefore` 为轨迹 id | 跨会话返回 404，不返回 403，错误体不含标题、目标、步骤、轨迹 |
| CT-CONV-505 | POST | `/api/sessions/{id}/tasks/{taskId}/cancel` | 200 | 400 `invalid_argument`（`scope` 不是 `self` 或 `chain`）；404 `task_not_found` | 同一 `scope` 重复调用返回 `changed=false`，不重复写取消事件 | 无 | 跨会话返回 404 |
| CT-CONV-506 | POST | `/api/sessions/{id}/tasks/{taskId}/retry` | 200 | 409 `task_state_conflict` 带 `currentStatus`；404 `task_not_found` | 不做幂等重放，每次调用 `attempt` 加一 | 无 | 跨会话返回 404 |
| CT-CONV-507 | POST | `/api/sessions/{id}/tasks/{taskId}/confirmation` | 200 | 400 `invalid_argument`（`decision` 不是 `confirm` 或 `cancel`）；409 `task_state_conflict`；404 `task_not_found` | 不幂等，等待原因已不是 `confirmation` 时第二次调用返回 409 | 无 | 跨会话返回 404 |
| CT-CONV-508 | POST | `/api/sessions/{id}/tasks/{taskId}/resume` | 200 | 409 `task_state_conflict`；404 `task_not_found` | 不幂等，恢复后重复调用返回 409 | 无 | 跨会话返回 404 |
| CT-CONV-509 | GET | `/api/sessions/{id}/deliverables` | 200 | 400 `invalid_task_limit`；404 `task_not_found` | 安全方法 | `limit` 1–100 缺省 50；无游标；`hasMore` 只表示分组被截断，前端不得自动续页 | 会话不存在返回 404；`taskId` 不存在返回空 `groups` 与 200，不泄露存在性 |

### 幂等、错误信封与游标

| 编号 | 主题 | 冻结口径 | 禁止 |
|---|---|---|---|
| CT-CONV-519 | 错误信封 | 失败体固定为 `{"ok":false,"error":"...","code":"..."}`，附加字段只允许 `currentStatus`（`task_state_conflict`）、`path` 或 `tool`（`permission_denied`）；文案不得出现任务标题、目标、步骤与轨迹内容 | 追加其它字段；把 404 改写成 403 或在文案里暗示对象存在 |
| CT-CONV-520 | 游标与分页 | `before`、`nextBefore` 是不透明字符串，服务端当前形态为 `<updatedAtMs>:<taskId>`，前端与测试脚本只做透传不解析；列表 `limit` 缺省 50、区间 1–100，轨迹 `traceLimit` 缺省 200、区间 1–500；越界与非法整数一律 400 `invalid_task_limit`；游标失效返回空页，不返回 404 | 前端解析游标拼下一页；把 `hasMore=false` 与空 `nextBefore` 拆成两个判据 |

## 类 2 状态机

任务状态以后端 §17.3 的 8 个存储态为准，展示态 4 个。状态名用产品 §4.6 的中文展示名，英文存储值放在备注列；原因是设计 spec 与前端 spec 目前都没有任务状态矩阵，把英文 token 写成契约会给 MX-G-28 制造无对应方的声明。待两列补矩阵后，再把存储值转为契约 token。

| 编号 | 对象 | 状态取值全集 | 从状态 | 到状态 | 触发者 | 条件与副作用 | 非法迁移错误码 | 备注（不上机比对） |
|---|---|---|---|---|---|---|---|---|
| CT-CONV-030 | 任务 | 未开始、排队、进行中、已完成、失败、已取消、已中断、阻塞 | — | — | — | 展示态映射：已完成→已完成，进行中→进行中，未开始→未开始，失败、已取消、已中断→失败，阻塞→未开始（仅旧库兼容） | task_state_conflict | 存储值 pending、queued、running、done、failed、cancelled、interrupted、blocked |
| CT-CONV-031 | 任务 | 未开始、排队 | 未开始 | 排队 | 系统 | 全部入边按 join_mode 满足并取得并发槽；清空等待原因 | task_state_conflict | pending→queued |
| CT-CONV-032 | 任务 | 未开始、已取消 | 未开始 | 已取消 | 用户、系统 | 取消作用于该任务或整链；失败原因写已取消；下游保持未开始 | task_state_conflict | pending→cancelled |
| CT-CONV-033 | 任务 | 排队、进行中 | 排队 | 进行中 | 系统 | 执行器领取；开始时间若为空则写入 | task_state_conflict | queued→running |
| CT-CONV-034 | 任务 | 排队、已取消 | 排队 | 已取消 | 用户、系统 | 同未开始到已取消；不产生步骤启动 | task_state_conflict | queued→cancelled |
| CT-CONV-035 | 任务 | 进行中 | 进行中 | 进行中 | 系统 | 只改等待原因：等待确认或等待资源；不改状态与进度 | task_state_conflict | running→running |
| CT-CONV-036 | 任务 | 进行中、已完成 | 进行中 | 已完成 | 智能体 | 全部步骤完成；进度到满、写完成时间、清空失败原因 | task_state_conflict | running→done |
| CT-CONV-037 | 任务 | 进行中、失败 | 进行中 | 失败 | 智能体、系统 | 执行器报错或步骤失败；写最近一条原因与完成时间 | task_state_conflict | running→failed |
| CT-CONV-038 | 任务 | 进行中、已取消 | 进行中 | 已取消 | 用户、系统 | 取消在 5 秒内生效；未完成步骤回未开始，已完成步骤保留 | task_state_conflict | running→cancelled |
| CT-CONV-039 | 任务 | 失败、排队 | 失败 | 排队 | 用户 | 显式重试；尝试次数加一、步骤重置、清空失败原因、轨迹保留 | task_state_conflict | failed→queued |
| CT-CONV-040 | 任务 | 已取消、排队 | 已取消 | 排队 | 用户 | 显式重试；规则同失败到排队 | task_state_conflict | cancelled→queued |
| CT-CONV-041 | 任务 | 已中断、排队 | 已中断 | 排队 | 用户 | 显式重试；规则同失败到排队 | task_state_conflict | interrupted→queued |

补充：终态任务再次取消返回 200 且 `changed=false`，不构成非法迁移；重试只接受失败、已取消、已中断，其余状态返回 409 `task_state_conflict`。等待原因三种为等待依赖（未开始）、等待确认（进行中）、等待资源（进行中），均无系统超时；依赖连接三种 `all`、`any`、`each` 的启动次数见产品 §4.6 与后端 §17.3.4。

### 依赖连接完成判定

三种 `joinMode` 的判定以本表为准。计数的唯一来源是 `task_deps` 的入边行与 `tasks.trigger_count` 列：`trigger_count` 表示等待方被前置放行的次数，`attempt` 表示该任务己身被执行的次数（重试加一），两者独立，不得互相代替。当前 `backend/internal/modules/tasks/conv.go:1810-1836` 的 `markDependencyReady` 只区分 allDone 与 anyDone，`all` 被首个完成放行、`each` 无计数，实现卡按本表改正。

| 编号 | joinMode | 启动条件 | 触发次数与计数来源 | 步骤与产物 | 前置失败或取消 | 图与事件 |
|---|---|---|---|---|---|---|
| CT-CONV-516 | `all` | 全部入边前置都进入 `done` 后启动一次 | `trigger_count` 置为 1，不随前置数累加；来源为入边行全部 done 后的一次条件更新 | 复用同一任务与同一条步骤链，步骤从第 1 步开始 | 任一前置失败、取消或中断时等待方保持 `pending`、`waitingReason=dependency`，`trigger_count` 不变，边为虚线 | 启动时发一条 `task.updated`，载荷含 `triggerCount` |
| CT-CONV-517 | `any` | 任一入边前置进入 `done` 后立即启动一次 | `trigger_count` 置为 1；其余前置继续执行且不取消，它们的完成不再触发第二次 | 同 `all` | 同 `all`，但其余前置先完成也不改变已发生的触发 | 同 `all` |
| CT-CONV-518 | `each` | 每个入边前置进入 `done` 各触发一次，按前置完成顺序串行执行 | `trigger_count` 等于已完成前置数，N 个前置完成即为 N；每次触发在同一事务内自增，`attempt` 同时加一 | 复用同一任务与同一条步骤链；每次触发前把步骤重置为第 1 步 `pending`，已完成步骤的轨迹保留并继续追加 | 前置失败、取消或中断不触发，等待方保持 `pending`、`waitingReason=dependency`，已累计的 `trigger_count` 不回退 | 每次触发各发一条 `task.updated` |



## 类 3 错误码

覆盖后端 §14 总表与 §17.10 新增表的全部小写错误码，按同一 HTTP 逐条列全；`R4_CONFIRM_REQUIRED` 为大写保护性占位，不属于契约码，未列入。

| 编号 | 码值 | HTTP | 触发条件 | 响应附加字段 | 是否泄露存在性 | 客户端动作 |
|---|---|---|---|---|---|---|
| CT-CONV-101 | `bad_request` | 400 | 通用参数错误：非法 JSON、空文本、超长文本、非法 pinned、未知 WS 帧 | 无 | 不适用 | 提示可读原因并保留输入 |
| CT-CONV-102 | `forbidden` | 403 | 通用禁止：debug 端点非本机、动作层破坏性操作 | 无 | 不泄露 | 不重试，提示需确认或无权限 |
| CT-CONV-103 | `not_found` | 404 | 通用资源不存在 | 无 | 不泄露 | 刷新列表，不乐观删除 |
| CT-CONV-104 | `conflict` | 409 | 已归档改名或新建子会话、归档父下新建 | 无 | 不适用 | 提示已归档只读并引导恢复 |
| CT-CONV-105 | `body_too_large` | 413 | 请求体超过接口上限或上传体超限 | 无 | 不适用 | 截断或拆分，不原样重试 |
| CT-CONV-106 | `internal` | 500 | 未分类服务端错误 | 无 | 不适用 | 展示错误，可重试 |
| CT-CONV-107 | `unsupported_media_type` | 415 | Content-Type 不受支持 | 无 | 不适用 | 检查 Content-Type |
| CT-CONV-108 | `unavailable` | 503 | 服务依赖不可用 | 无 | 不适用 | 退避重试 |
| CT-CONV-109 | `archive_blocked` | 409 | 有排队或运行中任务，或验收键缺证据 | `blockers[]` | 不适用 | 展示 blockers，解除后重试 |
| CT-CONV-110 | `main_session_protected` | 409 | 对主会话执行归档 | 无 | 不泄露 | 不提供归档入口 |
| CT-CONV-111 | `session_archived` | 409 | 向归档会话发消息 | 无 | 不适用 | 切只读态，先恢复 |
| CT-CONV-112 | `session_not_found` | 404 | 会话 id 不存在；草稿物化竞态 | 无 | 不泄露 | 刷新树并切回主会话 |
| CT-CONV-113 | `invalid_session` | 400 | 会话 id 为空 | 无 | 不适用 | 修正请求 |
| CT-CONV-114 | `invalid_scope` | 400 | scope 不是 all 或空 | 无 | 不适用 | 只用 scope=all 或省略 |
| CT-CONV-115 | `messages_too_many` | 413 | 会话可见消息超过上限 | 无 | 不适用 | 提示分页或拆分 |
| CT-CONV-116 | `edit_disabled` | 400 | 任意消息编辑或修正 | 无 | 不适用 | 隐藏编辑入口，只读展示 |
| CT-CONV-117 | `mutation_in_progress` | 409 | 同一 clientMutationId 首请求未完成 | 无 | 不适用 | 稍后重试，不换 id 重发 |
| CT-CONV-118 | `invalid_task_limit` | 400 | 任务分页参数非整数或越界 | 无 | 不适用 | 钳制或改用默认值 |
| CT-CONV-119 | `invalid_attachment` | 400 | 附件不存在或不属于该会话 | 无 | 不泄露 | 重新上传或移除附件 |
| CT-CONV-120 | `too_many_attachments` | 400 | 附件数量超过上限 | 无 | 不适用 | 删减附件 |
| CT-CONV-121 | `file_too_large` | 413 | 单附件超过上限 | 无 | 不适用 | 压缩或拆分 |
| CT-CONV-122 | `invalid_path` | 400 | 附件路径非法 | 无 | 不适用 | 重新上传 |
| CT-CONV-123 | `upload_not_found` | 404 | 附件 id 或文件不存在 | 无 | 不泄露 | 重新上传 |
| CT-CONV-124 | `invalid_multipart` | 400 | 上传不是合法 multipart/form-data | 无 | 不适用 | 修正上传请求 |
| CT-CONV-125 | `missing_file` | 400 | 上传缺少 file 字段 | 无 | 不适用 | 补齐字段 |
| CT-CONV-126 | `invalid_argument` | 400 | 请求体非法 JSON 或取值非法 | 无 | 不适用 | 修正请求 |
| CT-CONV-127 | `team_not_found` | 404 | 团队 id 不存在 | 无 | 不泄露 | 刷新团队列表 |
| CT-CONV-128 | `invalid_sandbox` | 400 | 权限设置取值非法 | 无 | 不适用 | 回到合法枚举 |
| CT-CONV-129 | `confirmation_required` | 400 | 切 danger-full-access 未带确认 | 无 | 不适用 | 补确认参数 |
| CT-CONV-130 | `bad_decision` | 400 | approval decision 非法 | 无 | 不适用 | 改用 allow_once、allow_session、deny |
| CT-CONV-131 | `task_not_found` | 404 | 任务不存在或与会话不匹配 | 无 | 不泄露 | 退出详情并刷新列表，不提示无权限 |
| CT-CONV-132 | `task_state_conflict` | 409 | 重试、确认、恢复的状态前提不满足 | `currentStatus` | 不适用 | 刷新任务并隐藏不适用入口 |
| CT-CONV-133 | `invalid_task_mode` | 400 | 模式不是 plan、react 或 explore，或边做边想携带步骤 | 无 | 不适用 | 回退到计划模式 |
| CT-CONV-134 | `invalid_task_status` | 400 | 列表筛选含未知状态值 | 无 | 不适用 | 重置为全部 |
| CT-CONV-135 | `task_batch_too_large` | 400 | 一次创建超过批次上限 | 无 | 不适用 | 拆批提交 |
| CT-CONV-136 | `invalid_task_dependency` | 400 | 依赖不存在、跨批次、自依赖、成环或同一任务入边混合 joinMode | 无 | 不适用 | 提示并阻止提交 |
| CT-CONV-137 | `task_context_too_large` | 413 | 目标、输入或约束合计超过上限 | 无 | 不适用 | 要求删减后重试 |
| CT-CONV-138 | `permission_denied` | 403 | 路径越出工作区、工具不在白名单、未授权网络或子进程 | `path` 或 `tool` | 不泄露 | 展示为工具调用失败，不重试 |
| CT-CONV-139 | `task_executor_unavailable` | 503 | 任务模块已启用但执行器未装配 | 无 | 不适用 | 禁用发起入口并提示稍后重试 |
| CT-CONV-140 | `task_session_required` | 400 | 旧路由 `GET /api/tasks/{id}` 缺少 `sessionId` 查询参数 | 无 | 不适用 | 补 `sessionId`，或改用 `/api/sessions/{sid}/tasks/{taskId}` |

错误信封固定为 `{"ok":false,"error":"...","code":"..."}`；除 `task_state_conflict` 与 `permission_denied` 外不追加字段，`archive_blocked` 的 `blockers[]` 沿用既有归档门禁。

### 越权与归属分流

判定顺序固定为：会话存在 → 任务属于该会话 → 路径范围 → 工具白名单 → 网络与子进程 → 审批要求。前两步不满足返回 404，不返回 403；第三步及以后返回 403。`backend/internal/modules/tasks/conv.go:304-307` 的 `recordPermissionDenied` 目前只写轨迹、没有生产路径调用，实现卡按本表接上判定与 403 返回。

| 编号 | 场景 | HTTP | 码值 | 响应附加字段 | 产出与轨迹 | 客户端动作 |
|---|---|---|---|---|---|---|
| CT-CONV-510 | 会话归属不一致或任务不存在（详情、取消、重试、确认、恢复、交付物） | 404 | `task_not_found` | 无 | 不写行、不发事件、不写轨迹 | 按不存在处理，不重试，不提示无权限 |
| CT-CONV-511 | 执行期路径越出工作区 | 403 | `permission_denied` | `path` | 任务继续，结果不写产出；轨迹追加一条 `observe`，`text` 以 `403 ` 开头 | 展示工具调用失败，不重试 |
| CT-CONV-512 | 执行期工具不在白名单 | 403 | `permission_denied` | `tool` | 同 CT-CONV-511 | 同 CT-CONV-511 |
| CT-CONV-513 | 执行期未授权网络或子进程 | 403 | `permission_denied` | `tool`，无工具名时省略 | 同 CT-CONV-511 | 同 CT-CONV-511 |
| CT-CONV-514 | 需审批工具 | 409 | `APPROVAL_REQUIRED`（大写保护性占位，不进类 3 码表） | `approvalId` | 任务转入 `running` 加 `waitingReason=confirmation`，不写产出 | 弹确认，confirm 或 cancel 走 CT-CONV-507 |
| CT-CONV-515 | 交付物归属不一致或 `taskId` 不存在 | 200 空 `groups`；跨会话下载 404 `artifact_not_found` | — 或 `artifact_not_found` | 无 | 不返回文件元数据 | 列表显示空，不报错也不重试 |



## 类 4 事件与消息

| 编号 | 事件名 | 触发时机 | 载荷字段 | 顺序依据 | 去重键 | 补偿方式 |
|---|---|---|---|---|---|---|
| CT-CONV-201 | `task.created` | 批内每个任务创建后各发一条 | id、sessionId、batchId、mode、status、displayStatus、title、dependsOn、orderIndex、createdAt | 事件日志 id 单调；批内按 orderIndex 升序 | 事件 id | 重连带 since 回放，之后拉列表对账 |
| CT-CONV-202 | `task.updated` | 状态、等待原因、进度、尝试次数变化 | id、sessionId、batchId、status、displayStatus、waitingReason、progress、attempt、triggerCount、failReason、changed | 事件日志 id 单调 | 事件 id | 同上；以 HTTP 详情覆盖本地快照 |
| CT-CONV-203 | `task.step` | 步骤进入运行中或终态 | id、stepId、stepSeq、status、traceCount、progress、at | 同一任务 stepSeq 严格递增 | id、stepId、stepSeq | 重连后拉任务详情补齐步骤 |
| CT-CONV-204 | `task.trace` | 追加一条轨迹 | id、stepId、traceSeq、category、tool、text、at | 同一任务 traceSeq 严格递增 | id、traceSeq | 重连后按轨迹分页补齐 |
| CT-CONV-205 | `task.report` | 任务进入终态并需要汇报 | 既有汇报字段、displayStatus、failReason | 终态后只发一次 | 事件 id | 重连后拉任务详情与汇报消息 |
| CT-CONV-206 | `task.reminder` | 用户设定时限到点 | id、deadlineAt、at | 事件日志 id 单调；每任务最多一条 | 事件 id | 重连后按 deadlineAt 对账，不重复提醒 |

任务卡片是普通消息行，字段固定为 `role=agent`、`category=task`、`task_id`、`batch_id`、`text`、`status=done`、`internal=0`；批量创建只写一条汇总卡，`task_count` 与列表 `total` 不一致时以列表为准。事件顺序固定为全部 `task.created` 写完后写 `message.created`，最后返回 HTTP 响应。

## 类 5 界面几何与选择器

五个选择器同时取自设计 §17.2.7 的「DOM 锚点」表与前端 §17.2.1 的选择器表，两侧值相同、顺序相同；尺寸数值与设计 §17.2.1、§17.13 的像素值一致。设计侧原先把文件:行引用填在「产品锚点」列，该列已更名为「产品出处」，与 DOM 锚点表分开，选择器不再被文件引用混淆。元素名写全称，避免与正文里「竖条」「面板」等泛称行的其他像素值混淆。

| 编号 | 元素 | 选择器或aria | 属性 | 数值 | 单位 | 断点 | 容差 | token | 备注（不上机比对） |
|---|---|---|---|---|---|---|---|---|---|
| CT-CONV-301 | 右栏导航竖条 | `nav.insp-rail[aria-label="右栏导航"]` | 宽度 | 40 | px | 全宽档与 760–1023 抽屉 | ±1 | `--rail-strip` | 按钮 32×32、间距 4、顶部内边距 8、图标 18×18 |
| CT-CONV-302 | 右栏面板头 | `div.insp-head` | 高度 | 44 | px | 展开态 | ±1 | 无 | 左侧标题 12.5/650、计数 10.5、收起按钮 26×26 |
| CT-CONV-303 | 右栏内容滚动区 | `div.insp-body#insp-panel[role="region"]` | 宽度 | 280 | px | 展开态 | ±1 | `--rail-task-panel` | 独立滚动、内边距 12/14 |
| CT-CONV-304 | 右栏面板脚 | `div.insp-foot` | 高度 | 28 | px | 展开态 | ±1 | 无 | 左说明、右更新时间 HH:MM、文案随标签变化 |
| CT-CONV-305 | 右栏外壳 | `aside.inspector` | 宽度 | 320 | px | 1600、1280、1180、1024–1180 | ±1 | `--rail` | 收起 40、容器宽度立即落位（内容层 160ms 淡入与位移）；1024 以下改用 `--rail-strip` |

右栏根节点另带 `data-session`（仅当前会话存在时）、`data-tab`（overview、tasks、deliverables）与 `data-collapsed`；760–1023 时点击标签打开抽屉，不改变宽档收起记忆。角标为 `span.insp-badge[aria-hidden="true"]`，0 不渲染、1–9 显示数字、10 及以上显示 9+。

## 类 6 验收入口

CHG-CONV-006 的 33 条与 CHG-CONV-007 的 18 条 AC 逐条一行。前 33 条在测试计划中为 pass，证据路径指向对应 TC；后 18 条尚未实现，脚本与证据记 `missing`，不写通过。

| 编号 | AC编号 | 判据摘要 | 脚本路径 | 夹具名 | 证据路径 | 判定人 |
|---|---|---|---|---|---|---|
| CT-CONV-401 | `AC-CONV-001-01` | 切换 active 后 500ms 内 data-session-id 为目标 ID，旧会话消息 0 条 | scripts/ac/AC-CONV-001-01.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-001，pass） | 验收 Agent |
| CT-CONV-402 | `AC-CONV-001-02` | 四态占位各 1、数字 0 出现 0 处；Escape 不提交、重启空草稿 0、父链 3 段、循环父链被拒 | scripts/ac/AC-CONV-001-02.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-002，pass） | 验收 Agent |
| CT-CONV-403 | `AC-CONV-001-03` | 归档主会话返回 409 main_session_protected，archived 保持 false | scripts/ac/AC-CONV-001-03.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-003，pass） | 验收 Agent |
| CT-CONV-404 | `AC-CONV-001-04` | 置顶后成为同级第一条，取消恢复原序，跨层不上浮，子会话在父会话之下 | scripts/ac/AC-CONV-001-04.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-004，pass） | 验收 Agent |
| CT-CONV-405 | `AC-CONV-001-05` | 行内数等于该会话 messageCount，底部等于全部会话之和，切换后行内变而底部不变 | scripts/ac/AC-CONV-001-05.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-035，pass） | 验收 Agent |
| CT-CONV-406 | `AC-CONV-002-01` | 新建到恢复四步后列表与中栏同源，归档 disabled 1 个、恢复 0 个，重启字段相等 | scripts/ac/AC-CONV-002-01.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-005，pass） | 验收 Agent |
| CT-CONV-407 | `AC-CONV-002-02` | 四端点 500 后错误节点 1 个、输入值保留、行数差 0、archived 不变，重试计数各 2 | scripts/ac/AC-CONV-002-02.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-006，pass） | 验收 Agent |
| CT-CONV-408 | `AC-CONV-003-01` | 请求含 q 参数 1 次，行集等于响应 id 集，正文搜索 0 次，搜索中与无匹配各 1 个 | scripts/ac/AC-CONV-003-01.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-008，pass） | 验收 Agent |
| CT-CONV-409 | `AC-CONV-003-02` | 搜索失败列表 0 行且错误 1 个，已读会话未读点 0 个 | scripts/ac/AC-CONV-003-02.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-009，pass） | 验收 Agent |
| CT-CONV-410 | `AC-CONV-003-03` | 标题搜索 1 次、正文搜索 0 次，行集等于响应 id 集 | scripts/ac/AC-CONV-003-03.mjs | N/A（会话夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-010，pass） | 验收 Agent |
| CT-CONV-411 | `AC-CONV-004-01` | 用户条目左对齐 4/4、司墨条目右对齐 4/4，底色与 token 一致 | 无独立脚本；TC-P1-CONV-011（组件加人工目视） | N/A（消息夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-011，pass） | 验收 Agent |
| CT-CONV-412 | `AC-CONV-004-02` | 剪贴板降级 1 次、卡片失败错误 1 个、接口 internal 0 条 | scripts/ac/AC-CONV-004-02.mjs | N/A（消息夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-012，pass） | 验收 Agent |
| CT-CONV-413 | `AC-CONV-004-03` | 接口、WS、UI 三处 internal 0，卡片 data-kind=card 至少 1，编辑端点返回禁用 | scripts/ac/AC-CONV-004-03.mjs | N/A（消息夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-013，pass） | 验收 Agent |
| CT-CONV-414 | `AC-CONV-005-01` | 发送后 1 条消息、done 后输入 0，停止后该 messageId 增量 0、其他流大于 0 | scripts/ac/AC-CONV-005-01.mjs | N/A（流式夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-016，pass） | 验收 Agent |
| CT-CONV-415 | `AC-CONV-005-02` | 停止后 10ms 上游 context 关闭、两类 delta 0、落库 0、回 idle 且 retracted 先于 idle | scripts/ac/AC-CONV-005-02.mjs | N/A（假上游夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-017，pass） | 验收 Agent |
| CT-CONV-416 | `AC-CONV-006-01` | 两种模式四组键位映射正确，aria-pressed 与模式一致，localStorage 刷新后不变 | scripts/ac/AC-CONV-006-01.mjs | N/A（输入夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-018，pass） | 验收 Agent |
| CT-CONV-417 | `AC-CONV-006-02` | 输入法组合中发送 0 次，失败后输入不变且错误 1 个，禁用属性 1 个 | scripts/ac/AC-CONV-006-02.mjs | N/A（输入夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-019，pass） | 验收 Agent |
| CT-CONV-418 | `AC-CONV-007-01` | 祖先去重后 12 条、时间逆序 0、条数等于消息数，切会话后祖先 0 条 | scripts/ac/AC-CONV-007-01.mjs | N/A（祖先夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-014，pass） | 验收 Agent |
| CT-CONV-419 | `AC-CONV-007-02` | 413 提示 1 条且重试补齐，403 中性提示 1 条且无失败字样，空上级提示 0 条 | scripts/ac/AC-CONV-007-02.mjs | N/A（祖先夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-015，pass） | 验收 Agent |
| CT-CONV-420 | `AC-CONV-008-01` | 三组节点各 1 个，rev 与待确认计数等于响应，无投影空态 1 个 | scripts/ac/AC-CONV-008-01.mjs | N/A（投影夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-031，pass） | 验收 Agent |
| CT-CONV-421 | `AC-CONV-008-02` | 展开后可见行数等于首屏加补取，messageId 相等，提交重试取消入口 0 个 | scripts/ac/AC-CONV-008-02.mjs | N/A（投影夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-032，pass） | 验收 Agent |
| CT-CONV-422 | `AC-CONV-008-03` | 四态各 1、375 下侧栏与右栏 0×0、scrollWidth 等于 375、Composer 可见 | scripts/ac/AC-CONV-008-03.mjs | N/A（窄屏夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-033，pass） | 验收 Agent |
| CT-CONV-423 | `AC-CONV-008-04` | taskLimit 0 与 51 返回 400 invalid_task_limit、会话不存在 404、304 空体且保留 ETag | scripts/ac/AC-CONV-008-04.mjs | N/A（投影夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-034，pass） | 验收 Agent |
| CT-CONV-424 | `AC-CONV-008-05` | 展开后可见条目等于 total，组头分子分母都等于 total，补取 500 时错误 1 个且条目不变 | scripts/ac/AC-CONV-008-05.mjs | N/A（投影夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-036，pass） | 验收 Agent |
| CT-CONV-425 | `AC-SYNC-001-01` | 连接态 1 个、seq 严格递增且重复 0、since 补发等于断开期帧数、两客户端 seq 集相等 | scripts/ac/AC-SYNC-001-01.mjs | N/A（WS 夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-020，pass） | 验收 Agent |
| CT-CONV-426 | `AC-SYNC-001-02` | 重连中 1 个且 5000ms 内 connected，归档错误帧 1 个且回复 0，残留 1s 内变失败 | scripts/ac/AC-SYNC-001-02.mjs | N/A（WS 夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-021，pass） | 验收 Agent |
| CT-CONV-427 | `AC-SYNC-002-01` | 标签 B 的 active 等于 A，祖先去重 0 条，未读随 at 清 0，回跳 0 次 | scripts/ac/AC-SYNC-002-01.mjs | N/A（双实例夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-022，pass） | 验收 Agent |
| CT-CONV-428 | `AC-SYNC-002-02` | 两种到达序终态相同，重复广播未读增量 0，无通道异常 0 次且切会话仍生效 | scripts/ac/AC-SYNC-002-02.mjs | N/A（双实例夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-023，pass） | 验收 Agent |
| CT-CONV-429 | `AC-SYNC-003-01` | 点击后 aria-pressed 反转、Enter 行为反转、localStorage 为 shift-enter 且刷新不变 | scripts/ac/AC-SYNC-003-01.mjs | N/A（输入夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-024，pass） | 验收 Agent |
| CT-CONV-430 | `AC-SYNC-003-02` | 标签 B 的 aria-pressed 500ms 内等于 A，广播 1 次、构造抛错 0 次且仍持久化 | scripts/ac/AC-SYNC-003-02.mjs | N/A（双实例夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-025，pass） | 验收 Agent |
| CT-CONV-431 | `AC-SYNC-004-01` | 收帧后 B 行未读点 1 个、A 行 0 个；切到 B 后 0 个，刷新后仍 0 | scripts/ac/AC-SYNC-004-01.mjs | N/A（未读夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-026，pass） | 验收 Agent |
| CT-CONV-432 | `AC-SYNC-004-02` | 重启后已读会话点 0 个、未读会话 1 个，写失败保留点 1 个且 toast 1 个 | scripts/ac/AC-SYNC-004-02.mjs | N/A（未读夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-027，pass） | 验收 Agent |
| CT-CONV-433 | `AC-SYNC-004-03` | 未读点由 1 变 0，read_at 不早于消息 createdAt，刷新后点 0 个 | scripts/ac/AC-SYNC-004-03.mjs | N/A（未读夹具） | specs/test/P1-CONV/test-plan.md（TC-P1-CONV-028，pass） | 验收 Agent |
| CT-CONV-434 | `AC-CONV-009-01` | 发起 1 个任务后消息流任务卡 1 张、task_id 1 个，右栏任务计数增 1 | scripts/ac/AC-CONV-009-01.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-01，pass） | 验收 Agent |
| CT-CONV-435 | `AC-CONV-009-02` | 10 个任务只有 1 张汇总卡、标题计数 10、展开 10 条；12 个时默认 10 条加「还有 2 条」入口 | scripts/ac/AC-CONV-009-02.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-02，pass） | 验收 Agent |
| CT-CONV-436 | `AC-CONV-009-03` | 启动上下文历史消息 0 条、目标 1 个、约束至少 1 个 | scripts/ac/AC-CONV-009-03.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-03，pass） | 验收 Agent |
| CT-CONV-437 | `AC-CONV-009-04` | 工具调用成功 1 次，越权请求拒绝 1 次且状态码 403 | scripts/ac/AC-CONV-009-04.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-04，pass） | 验收 Agent |
| CT-CONV-438 | `AC-CONV-009-05` | 8 步按序，第 6 步默认展开且轨迹至少 1 条，第 5 步可回看，第 7 步无展开入口 | scripts/ac/AC-CONV-009-05.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-05，pass） | 验收 Agent |
| CT-CONV-439 | `AC-CONV-009-06` | 扁平时间线 14 行、步骤节点 0 个、时间戳单调不减、展开入口 0 个 | scripts/ac/AC-CONV-009-06.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-06，pass） | 验收 Agent |
| CT-CONV-440 | `AC-CONV-009-07` | 详情重试、取消、编辑、删除入口 0 个，关闭入口 1 个；四态卡均可点进同一只读详情 | scripts/ac/AC-CONV-009-07.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-07，pass） | 验收 Agent |
| CT-CONV-441 | `AC-CONV-009-08` | 收起整栏 40px、展开 320px（面板 280 加竖条 40）、三个图标，任务标签选中 1 个 | scripts/ac/AC-CONV-009-08.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-08，pass） | 验收 Agent |
| CT-CONV-442 | `AC-CONV-009-09` | 进行中 0 不渲染角标，2 显示 2，10 与 11 显示 9+，两位数字节点 0 个 | scripts/ac/AC-CONV-009-09.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-09，pass） | 验收 Agent |
| CT-CONV-443 | `AC-CONV-009-10` | 刷新后折叠态与刷新前一致，四节标题与计数各 1 个，另一会话默认全开 | scripts/ac/AC-CONV-009-10.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-10，pass） | 验收 Agent |
| CT-CONV-444 | `AC-CONV-009-11` | 点「还有 9 个」切到任务标签，目标任务卡成为首行且距滚动口顶部 0–8px | scripts/ac/AC-CONV-009-11.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-11，pass） | 验收 Agent |
| CT-CONV-445 | `AC-CONV-009-12` | 四枚筛选分别得到 11、2、1、3 张卡，选中态 1 个，未开始只出现在全部中 | scripts/ac/AC-CONV-009-12.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-12，pass） | 验收 Agent |
| CT-CONV-446 | `AC-CONV-009-13` | 8 节点四态之和为 8，失败下游 1 个为未开始且虚线 1 条；21 节点缩放 1.0、最大层 4 加 1 分两行 | scripts/ac/AC-CONV-009-13.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-13，pass） | 验收 Agent |
| CT-CONV-447 | `AC-CONV-009-14` | 全部完成启动 1 次、任一完成启动 1 次、每个完成累计 3 次；等待依赖、确认、资源各自计数符合约定 | scripts/ac/AC-CONV-009-14.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-14，pass） | 验收 Agent |
| CT-CONV-448 | `AC-CONV-009-15` | 取消 A 后 B 启动 0 次、状态为未开始、取消确认 1 条 | scripts/ac/AC-CONV-009-15.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-15，pass） | 验收 Agent |
| CT-CONV-449 | `AC-CONV-009-16` | 类型徽标 1 个、来源任务名 1 个、下载文件 1 个且字节数等于响应 size | scripts/ac/AC-CONV-009-16.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-16，pass） | 验收 Agent |
| CT-CONV-450 | `AC-CONV-009-17` | 会话 B 的任务数 0、任务图节点 0、跨会话查询 0 条 | scripts/ac/AC-CONV-009-17.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-17，pass） | 验收 Agent |
| CT-CONV-451 | `AC-CONV-009-18` | 无时限任务运行 30 分钟不取消，有时限任务到点取消 0 个且提醒 1 条 | scripts/ac/AC-CONV-009-18.mjs | N/A（任务夹具） | `specs/changes/CHG-CONV-007/evidence.md`（E-AC-CONV-009-18，pass） | 验收 Agent |

类 6 的 18 条 009 AC 已按变更包 `specs/changes/CHG-CONV-007/` 登记脚本路径与证据入口；证据列是断言脚本的实际结果，签收由验收 Agent 独立完成，未签收前不记为已验证。

### 26 条判据冻结

18 条产品 AC 与 8 条变更级 AC 的判据在 v0.4 冻结，编号、语义与 `specs/changes/CHG-CONV-007/spec.md:43-62`、`:84-170` 一致，不改写。`断言形式` 取接口、组件、CDP、人工四种：接口直打 8789 端口真后端，组件用 vitest 加 jsdom，CDP 走 9224 端口真浏览器读像素，人工只用于三档截图与视觉签字。`夹具` 一律指 `specs/test/P1-CONV/fixtures/task/` 下的具名夹具。`负责人` 是脚本归属卡，T08 负责三档 E2E 执行，不改判据。`失败原因码` 是断言失败时写进证据 JSON 的 fixed 字符串，同一 AC 的失败码不得复用。

| 编号 | AC | 断言形式 | 夹具 | 判定条件（冻结） | 负责人 | 失败原因码 |
|---|---|---|---|---|---|---|
| CT-CONV-521 | `AC-CONV-009-01` | 接口 | batch-10 的单任务 | 创建 1 个任务返回 201，`counts.all` 加 1，`messageId` 非空，列表可见 1 条且 `mode=plan` | T06 | `E-AC-CONV-009-01` |
| CT-CONV-522 | `AC-CONV-009-02` | 组件 | batch-12 | 消息表只写 1 条 `category=task`，`taskCount=12`，首屏 10 条加「还有 2 条」，展开后 12 条 | T06 | `E-AC-CONV-009-02` |
| CT-CONV-523 | `AC-CONV-009-03` | 接口 | history-20 | 详情 `context` 为 `historyCount=0`、`goal` 1 条、`constraints` 至少 1 条 | T06 | `E-AC-CONV-009-03` |
| CT-CONV-524 | `AC-CONV-009-04` | 接口 | tools-403 | 成功工具调用 1 次并产出 1 个文件；越权 1 次返回 403 `permission_denied`，轨迹 `observe` 1 条且 `text` 以 `403 ` 开头 | T06 | `E-AC-CONV-009-04` |
| CT-CONV-525 | `AC-CONV-009-05` | 组件 | steps-8 | `steps` 8 条且 `seq` 为 1 至 8，第 6 步默认展开、第 5 步可回看、第 7 步无展开控件 | T07 | `E-AC-CONV-009-05` |
| CT-CONV-526 | `AC-CONV-009-06` | 组件 | explore-14 | 时间线 14 行、步骤节点 0、`at` 单调不减、行上无展开控件 | T07 | `E-AC-CONV-009-06` |
| CT-CONV-527 | `AC-CONV-009-07` | 组件 | steps-8 | 详情内任务操作入口（重试、取消、编辑、删除）0 个、关闭 1 个；错误态的加载重试按钮不计入操作入口 | T07 | `E-AC-CONV-009-07` |
| CT-CONV-528 | `AC-CONV-009-08` | CDP | steps-8，宽档 1280 | 收起竖条 40、展开外壳 320 等于内容区 280 加竖条 40、三枚图标、任务标签选中态 1 个 | T07 | `E-AC-CONV-009-08` |
| CT-CONV-529 | `AC-CONV-009-09` | CDP | chain-3 | 角标数等于 `counts` 的进行中数；0 时不渲染；1 至 9 显示数字；大于等于 10 显示 `9+`；两位数节点 0 个 | T07 | `E-AC-CONV-009-09` |
| CT-CONV-530 | `AC-CONV-009-10` | CDP | sessions-a-b | 四节折叠态按会话记忆，刷新后一致，切到另一会话时默认全开 | T07 | `E-AC-CONV-009-10` |
| CT-CONV-531 | `AC-CONV-009-11` | CDP | history-20，11 个任务 | 「还有 9 个」跳转后任务标签首行距滚动口 0 至 8 像素；滚动口在面板头 44 与筛选条 40 之下，宽档自视口顶 174、768 档 182，容差正负 1 像素 | T07 | `E-AC-CONV-009-11` |
| CT-CONV-532 | `AC-CONV-009-12` | CDP | chain-3 | 四枚筛选分别得到 11、2、1、3 张卡，选中态 1 个，未开始只出现在全部中 | T07 | `E-AC-CONV-009-12` |
| CT-CONV-533 | `AC-CONV-009-13` | CDP | graph-8、graph-21 | 四展示态之和等于 8、失败下游 1 个未开始、虚线边 1 条；21 节点缩放 1.0、按依赖层分行、最大层 5 分 4 加 1、双向可滚动 | T07 | `E-AC-CONV-009-13` |
| CT-CONV-534 | `AC-CONV-009-14` | 接口 | chain-3 | `all` 全部完成后启动 1 次、`any` 任一完成后启动 1 次、`each` 每个前置完成各 1 次累计 3 次；`trigger_count` 与 `attempt` 的取值符合 CT-CONV-516 至 CT-CONV-518 | T06 | `E-AC-CONV-009-14` |
| CT-CONV-535 | `AC-CONV-009-15` | 接口 | chain-3 | 取消上游后 30 秒内下游启动 0 次、`status` 保持 `pending` 且 `waiting_reason=dependency`、`started_at=0`、`trigger_count` 不变；`scope=chain` 只中断已启动的下游，未启动的下游不改状态；已完成的下游结果不动；对终态再取消返回 200、`changed=false`、任务字段逐字段不变；前端无整链取消入口 | T06 | `E-AC-CONV-009-15` |
| CT-CONV-536 | `AC-CONV-009-16` | 接口 | sessions-a-b、三份产物 | 类型徽标 1 个、来源任务名 1 个、下载 1 个文件且字节数等于响应 `size`（会议纪要 12345 字节、截图 45678 字节、排期 890 字节） | T06 | `E-AC-CONV-009-16` |
| CT-CONV-537 | `AC-CONV-009-17` | 接口 | sessions-a-b | 会话 B 任务数 0、图节点 0、跨会话查询 0 条；用 B 的会话段请求 A 的任务详情返回 404 且响应体不含 A 的标题与目标 | T06 | `E-AC-CONV-009-17` |
| CT-CONV-538 | `AC-CONV-009-18` | 接口 | deadline-1m | 无时限任务运行 30 分钟不自动取消；有时限任务到点取消 0 个、提醒 1 条 | T06 | `E-AC-CONV-009-18` |
| CT-CONV-539 | `AC-CHG-CONV-007-01` | CDP 加人工 | batch-10 | 提交后 5 秒内出现汇总卡；厚卡与详情可打开；交付物下载字节等于响应 `size`；375、768、1280 三档横向不溢出（`scrollWidth` 不大于视口） | T07（T08 执行） | `E-AC-CHG-CONV-007-01` |
| CT-CONV-540 | `AC-CHG-CONV-007-02` | 接口 | graph-8 | 失败原因 1 条、状态为失败、失败计数加 1；重试 1 次后 `task_id` 不变、不重复建行；仍失败只保留最新原因、成功后失败计数减 1；同会话其它任务不受影响 | T06 | `E-AC-CHG-CONV-007-02` |
| CT-CONV-541 | `AC-CHG-CONV-007-03` | 接口 | chain-3 | A 取消后 B 30 秒内启动 0 次且为未开始；确认条 1 条、图上 B 为未开始且连线仍在；整链取消时未启动任务保持未开始、已启动任务被中断；只作用于目标链 | T06 | `E-AC-CHG-CONV-007-03` |
| CT-CONV-542 | `AC-CHG-CONV-007-04` | 接口 | sessions-a-b、tools-403 | 权限外请求 403 一次、合法请求成功一次，两者都不写产出；B 的三处计数为 0；B 路径请求 A 详情返回 404 且不返回正文；构造的越权请求后端仍拒绝 | T06 | `E-AC-CHG-CONV-007-04` |
| CT-CONV-543 | `AC-CHG-CONV-007-05` | CDP 加人工 | batch-10 | 1280 档展开 320、收起 40、三角标与角标一致；768 档收起 40 不遮挡、展开为 40 竖条加 280 抽屉浮层（`position: fixed`、不占布局、中栏宽度差 ≤1 像素）、无横向溢出；375 档竖条不重叠、`scrollWidth` 等于视口、任务标签可打开可滚动；三档各测 2 次，误差正负 1 像素 | T07（T08 执行） | `E-AC-CHG-CONV-007-05` |
| CT-CONV-544 | `AC-CHG-CONV-007-06` | 组件加 CDP | graph-8 | 详情只读，操作入口 0、关闭 1；图为全窗弹窗，操作入口只有关闭 1；失败下游未开始 1、虚线 1、四态之和等于总数；打开期间无写请求、关闭后状态不变 | T07（T08 执行） | `E-AC-CHG-CONV-007-06` |
| CT-CONV-545 | `AC-CHG-CONV-007-07` | CDP | batch-10、chain-3 | 10 个任务只出 1 张汇总卡、计数 10、展开 10 条；四筛选 11、2、1、3 与列表一致；切换筛选时选中态 1 个、首行不抖、滚动回顶；汇总卡计数与筛选结果一致 | T07 | `E-AC-CHG-CONV-007-07` |
| CT-CONV-546 | `AC-CHG-CONV-007-08` | 接口 | history-20、sessions-a-b | 历史 0、目标 1、约束至少 1，工具与知识库继承发起会话；另一会话三处计数 0；无自动超时、1 分钟时限提醒 1 次取消 0 次；`task_id` 会话内唯一且不跨会话 | T06 | `E-AC-CHG-CONV-007-08` |

**取消的传播口径（CT-CONV-535 与 CT-CONV-541 共用）**：`scope=self` 只取消目标任务；`scope=chain` 只中断目标链上已启动的下游，中断计入 `changed` 但不进 `cancelled[]`，并写一条中断轨迹；未启动的下游保持 `pending` 与 `waiting_reason=dependency`，步骤启动 0 次，`trigger_count` 与失败计数不变，图中连线保留且为虚线，已完成的下游结果不动。下游不因上游取消转 `cancelled`：`cancelled` 在展示态里映射为「失败」，级联取消等于把下游标成失败，与产品 §4.6 的等待语义和 `AC-CHG-CONV-007-03` 冲突。等待方没有系统清理，上游 `cancelled` 可以经重试转 `queued`，重跑完成后按 `join_mode` 放行下游；要作废下游由用户显式取消该任务。对终态任务再次取消返回 200、`changed=false`，任务字段不变。

判据冻结后，实现卡只允许改脚本与代码，不允许改本表判定条件的阈值、计数与断言形式；确需改判据时按变更包 AC 变更流程走，不在实现卡内改。



v0.3 补上了四项已登记缺口，原先靠文件级 `N/A` 放行的两处前端维度与两处未实现规则不再静音。

- **字段类型一致性（MX-G-27）**：`scripts/check-contract.mjs:591` 的 `extractSpecFieldTypes` 只从表头含「类型」列的字段表取类型，`:1321` 按来源里的 § 号或 N 号过滤到同源声明后与契约表同名字段比对，不一致记 error 并同时给出契约表 `contract.md:<行>`、spec 文件与行号、两侧类型；SQL 类型经 `SPEC_TYPE_ALIASES`（`:100`）归一为 `TEXT→string`、`INTEGER→number`。字段列由 `specFieldColumnIndex`（`:554`）按表头识别，接口调用表的操作名不再被当成字段。
- **缺格（MX-G-26）**：`runMxG26`（`:974`）在固定列检查之后逐行逐列扫描，任一固定列为空记 error，信息写明类名、行号和缺失列名（`:1047` 输出 `类 N 第 M 行缺「列名」`），不再允许空单元格静默通过。
- **中文状态（MX-G-28）**：`CONTRACT_STATE_MAP`（`:89`）把契约表的未开始、排队、进行中、已完成、失败、已取消、已中断、阻塞映射到存储态与展示态；`extractSpecStates`（`:628`）识别 `从`/`到`、`存储 status`、`displayStatus` 与状态列，`runMxG28`（`:1328`）在任务对象上比对后端 8 个存储态与 11 条迁移、前端 4 个展示态与 5 条投影迁移。结构化状态表存在时不再扫描散文箭头，避免 `rror`、`ode`、`vent` 一类碎片。
- **前端维度**：类 1 新增 CT-CONV-042 至 CT-CONV-057，来源标前端 spec §1.8 与前端 §17.6.1；前端 spec 新增 §1.8 的 14 个 props 与消息字段、§17.9.4 的 4 个展示态与 5 条迁移。原先 `specs/frontend/P1-CONV/spec.md:36-38` 的「前端字段」与 `:90-92` 的「前端状态」两条 N/A 已删除，改为指向上述两节的说明；设计侧任务状态维度仍不适用，理由保留在 `specs/design/P1-CONV/spec.md:18-20`，类别为 `设计状态`。

前端字段表与展示态表建立后，删 `sendChat` 的 `clientMutationId`、删 `Message` 的 `taskCount`、删展示态 `done` 都会分别触发 MX-G-27 缺字段或 MX-G-28 缺状态 error。自检断言由 18 条增至 27 条，覆盖类型一致放过、类型不一致报错、缺格报错、中文状态识别、前后端字段缺失、迁移缺失与展示态缺失。复跑结果为 7 项检查全过、0 条告警。

## 变更记录

| 版本 | 日期 | 变更 | 触发 |
|---|---|---|---|
| v0.4.2 | 2026-11-26 | 类 1 的 CT-CONV-001 枚举由「plan 或 explore」改为「plan、react 或 explore」，类 3 的 CT-CONV-133 文案同步；任务模式唯一口径为计划 plan、边做边想 explore、ReAct react 三种，契约项数量不变 | 独立验收 CHG-CONV-007 指出任务模式口径三方不一致：脚本用 `mode=execute` 创建任务被后端 `validateMode` 以 `invalid_task_mode` 拒绝，导致 AC-CONV-009-04 与 AC-CHG-CONV-007-04 零断言失败 |
| v0.4.1 | 2026-11-26 | 类 5 的 CT-CONV-305 备注由「宽度过渡 160ms」改为「容器宽度立即落位（内容层 160ms 淡入与位移）」；宽度 320、断点、容差、`--rail` 与 `--rail-strip` 均不变，契约项数量不变 | DEC-37（`docs/plan/DECISIONS.md:150`）；设计 §17.2.1、§17.2.7、`V-CONV-009-1` 与前端 §17.2.1 已同口径 |

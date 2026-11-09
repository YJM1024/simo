# M10 实现契约：会话内任务编排 + 任务面板 + 逐任务汇报

> 前置：V1 + M8 已交付；M9（权限/工具）在收尾。
> 核心：**会话即工作区**；一个会话可有 N 个任务；智能体自主拆解/推进；**每个任务完成都汇报**。

## 1. 概念

- **会话（Session）**：容器，等同工作区；不引入独立 workspace。
- **工作流（Workflow）**：一个会话内、由一次需求拆出的一组任务 + 依赖关系；有状态 `draft|running|paused|done|failed|cancelled`。
- **任务（Task）**：最小执行单元；状态 `pending|running|done|failed|cancelled|blocked`；有依赖 `depends_on[]`、写作用域、阶段/进度、产物、汇报消息 id。
- **汇报消息（Report）**：任务完成时由秘书在会话里发的普通 agent 消息（可带任务卡片），**不等整个工作流结束**。

## 2. 拆解与编排

- 用户提需求 → 秘书判断：单任务 or 工作流；
- 工作流由模型产出 **Plan**（JSON）：`{title, tasks:[{key,title,description,depends_on:[key],write_scope,estimate}]}`；解析失败 → 退化为单任务（不阻塞）。
- 依赖：无依赖可并行，有依赖等前置 done；
- 自动推进：任务 done → 查找 ready 任务 → 自动启动（**不需要用户确认**）；直到全部结束/失败超限/预算耗尽/用户中止；
- 用户干预：普通消息不打断；"停/暂停/改成…"才暂停或调整（后续任务重规划，已完成不回滚）。

## 3. 汇报节奏（用户确认）

| 时机 | 消息 |
|---|---|
| 任务开始 | 一条简短"开始做 X"（可配置关闭） |
| **任务完成** | **必须发**：结论 + 产物/文件 + 下一任务 |
| 任务失败/阻塞 | 必须发：原因、重试、是否需要用户介入 |
| 长任务阶段进展 | 按阶段或每 N 分钟（可配，防刷屏） |
| 工作流结束 | 一条总结（可选，不替代逐条汇报） |

- 汇报体：自然语言、讲要点、完整句子；不用关键词电报体；细节可折叠。
- 汇报消息写入 messages 表（role=agent），带 `taskId/workflowId` 元数据。

## 4. 边界（安全）

- 默认并发 **3**（可配置）；单工作流任务数上限（默认 12）；失败重试 ≤2；
- 每任务 token 预算可配；超预算暂停并汇报；
- 危险操作仍走审批；无法审批 → fail-closed / 暂停并通知；
- 暂停：不再启动新任务，运行中任务跑完即停；恢复继续；取消：终止 future，运行中按取消语义处理；
- 重启：`running` 任务 → `interrupted`（可重试），工作流暂停，汇报一条"已中断"。

## 5. 数据（增量）

- `workflows(id, session_id, title, status, plan_json, created_at, updated_at)`
- `tasks` 增列：`workflow_id, depends_on_json, order_index, report_message_id, budget_json`
- `workflow_events(id, workflow_id, type, payload, created_at)`
- `messages` 关联：`task_id/workflow_id`（可空）

## 6. API

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/api/workflows?sessionId=` | 列表（含任务摘要/进度） |
| GET | `/api/workflows/{id}` | 详情（任务+依赖+产物+汇报） |
| POST | `/api/workflows/{id}/pause` / `resume` / `cancel` | 控制 |
| GET | `/api/tasks?sessionId=&status=` | 任务列表（按状态过滤，任务面板用） |
| GET | `/api/tasks/{id}` | 已有，补 workflow/report 字段 |

WS 增量：`workflow.created/updated`、`task.report`（或复用 message.created）、`workflow.done`。

## 7. 前端

- 右栏「任务」选项卡：按状态分组（执行中 / 待开始 / 已完成 / 失败），工作流分组展示；进度条、阶段、耗时、产物、汇报入口；
- 任务详情：阶段/步骤/依赖/产物/取消/重试/暂停工作流；
- 会话内：任务汇报消息带小卡片（任务名/状态/产物），点击打开详情；
- 输入框始终可用；"停"按钮或消息指令暂停工作流。

## 8. 验收（M10）

1. 一个需求 → 秘书拆出 ≥2 个任务（含依赖）→ 自动执行 → **每个任务完成都出现一条汇报消息** → 最终总结；
2. 依赖顺序正确；无依赖并行（≤3）；任务面板状态实时更新；
3. "停"→ 不再启动新任务，运行中跑完即止，汇报暂停状态；恢复继续；
4. 失败重试 ≤2，超限标记失败并汇报；
5. 重启后工作流/任务/汇报不丢，running→interrupted；
6. `go vet/test`、`tsc`、构建、M1–M9 evals 全绿 + M10 新 case；
7. 不做独立工作区；不做智能体团队。

## 9. 边界

- 不做多智能体团队（M14）；不做定时任务（M13）；
- 复用 M9 权限与 M5 任务阶段/产物；工作流状态投影以事件日志为准。

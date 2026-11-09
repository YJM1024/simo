# M19 实现契约：长程运行时（小时级 → 天级）

> 前置：M18（SpecCore 驱动执行）落地；若 M18 未落地，本契约按"`tasks/workflows` 现有表 + `spec_id` 可空"降级实现（见 §16）。
> 依赖：M9（工具/审批/审计）、M10（工作流/逐任务汇报）、M13（调度/错过补偿）、M18（Spec/证据）。
> 定位：**M19 不新造任务模型，而是给已有 `tasks/workflows/schedules/approvals` 补"耐久、心跳、幂等、分层预算、长时审批、可观测、跨天汇报"**，让任务能可靠跑数小时到数天。
> 数字默认值一律是**工程默认、可配置、非验收承诺**，须按 M19 基线校准（17 §6.2 纪律）。
> 证据/参考：`docs/design-core.md` §9（长程能力清单）、`docs/dsh-alignment.md` §7（DSH 借鉴：三屏障/作业/恢复/预算/看门狗/查询缓存）、`design/19` §7+§11、`design/23` §6/§8/§9/§10/§11（本契约的主要语义来源）、现有 `agentd/internal/modules/{tasks,chat,sessions}` 迁移与 `agentd/README.md` §M9–M13。

---

## 1. 目标与非目标

### 1.1 目标（可验收）

1. **重启自动恢复**：进程被杀/重启后，可恢复任务**自动续跑**（从最近一致检查点），不可恢复任务**显式汇报**（不静默丢、不伪装成功）。
2. **不失控**：心跳 + 停滞检测 + 分层预算 + 熔断，长任务不会无限空转、不会默默烧钱。
3. **不重复副作用**：工具副作用、触发、汇报都有幂等键；崩溃重放**不重算副作用**（unknown 不自动重试）。
4. **人能离开**：审批等待可跨小时/跨天；等待不占执行资源、不丢任务上下文；超时有确定策略（默认 fail-closed）。
5. **可观测**：进度/耗时/预算/下次动作/ETA 可查，跨天分段汇报 + 最终汇总。
6. **不回归**：M1–M18 评测全绿；单机 SQLite 单写者约束不破。

### 1.2 非目标

- 不做跨机/分布式恢复（只承诺单实例 + 单写者；跨机见 P1）。
- 不做"未知副作用的恰好一次"（承诺的是：**不自动重试 + 三态标记 + 人可核对**）。
- 不做事件触发/webhook 生态（P2；本阶段只做"时间触发 + 工作流内部推进"的持久化）。
- 不新增用户可见的 Spec/Plan/Task 概念（仍投影为对话/任务面板/概览）。
- 不替换 M9 权限求值顺序、M10 工作流语义、M13 调度字段（只扩展）。

---

## 2. 状态机（持久、单一真相）

### 2.1 Task 状态机（在现有 status 上补齐）

现有：`queued/running/done/failed/cancelled/paused/blocked/interrupted`（`agentd/internal/core/task/task.go` 及 tasks 服务）。M19 明确**迁移表**与**恢复动作**：

| 状态 | 进入条件 | 可停留 | 重启后处理 | 可恢复？ |
|---|---|---|---|---|
| `queued` | 创建/依赖满足后置位 | 调度器拉起 | 保持 queued，**自动派发** | ✅ |
| `running` | 执行器已领取 | 执行中 | 有检查点：→ `queued`（新 attempt，续跑）；无检查点且无在飞副作用：→ `queued`；**有未知副作用** → `blocked(waiting_person)` | ✅/⚠️ |
| `waiting_approval`（**新增**） | 工具 ask 挂起 | 等人（分钟~天） | **保持**（审批行持久）；审批结果到达后回 `running`（同 attempt） | ✅ |
| `paused`（已有；细分 reason） | 预算软限 / 停滞 / 用户暂停 | 等人/等预算 | 保持；reason=`budget/stall/user` | ✅ |
| `blocked` | DAG 死锁 / 未知副作用 / 需人裁决 | 等人 | 保持 + 汇报；**不自动重试** | ✅ |
| `interrupted` | 进程崩溃/被杀（重启时标记） | 终端（可 retry） | 保留已完成阶段；用户/策略可 `retry`（attempt+1，新检查点） | ✅（retry） |
| `done` | 执行完成（证据齐） | 终态 | **不重跑** | — |
| `failed` | 重试耗尽/不可恢复错误 | 终态（可 retry） | 保留 + 汇报；`retry` 计数上限 2 | ⚠️ |
| `cancelled` | 用户取消 | 终态 | 保留已完成；**取消不复活** | ❌ |

**硬规则**：
- `done`/`verified`/`cancelled` **永不重跑**（重启恢复不得把它们置回 running）。
- `interrupted` 是"重启造成的"，不是"用户选择"的；`retry` 必须显式（自动续跑只对 `queued/running/waiting_approval/paused` 生效）。
- 状态变更**先落事件再推进**：每次迁移写 `events(type=task.status)` + `workflow_events` 同步；UI/WS 从事件投影。

### 2.2 Workflow 状态机

现有：`created/running/paused/done/failed/cancelled/interrupted`（M10）。M19 增补：

| 状态 | 语义 | 重启后 |
|---|---|---|
| `running` | 有在飞/就绪任务 | → `recovering`（**新增**，恢复中）→ `running`（自动续跑）或 `paused`（不可恢复/需人） |
| `recovering`（**新增**） | 正在对账 Task/检查点 | 恢复流程结束即迁出；**失败 → paused + 显式汇报** |
| `paused` | 用户暂停 / 预算熔断 / 停滞 | 保持；`resume` 继续 |
| `partial`（**新增终态**，见 §6.4） | 熔断后保留已验证部分收口 | 终态；可 reopen 新 workflow |
| `done/failed/cancelled` | 终态 | 不重跑；报告幂等（见 §5） |

`running → recovering` 由启动恢复器写入；`recovering` 必须快速（默认 <5s，任务数多时可 >5s 但 ≤30s，超时报"恢复超时，已暂停"）。

### 2.3 Approval 状态机（长时审批）

`pending → (allow_once|allow_session|deny|expired|superseded)`：
- `pending`：**持久**，带完整等待上下文（§7）。
- `expired`（**新增**）：超时策略触发，默认 `deny_and_pause`（fail-closed，不自动放行）。
- `superseded`（**新增**）：任务被取消/工作流被终止时，挂起审批自动作废（不执行）。

---

## 3. 检查点与恢复

### 3.1 两级检查点（不重复造）

| 层级 | 归属 | 时机 | 存储 |
|---|---|---|---|
| **执行级（三屏障）** | M9/现有执行层 | 模型请求前 / 顶层工具副作用前 / 每步前 | 事件日志（`events`）+ 工具调用记录 |
| **计划级 PlanCheckpoint** | **M19 新增** | Plan 激活/重规划后；每 Wave 开始/结束；**Task 派发前**；Task `done` 后；熔断/partial 前；停滞/blocked 前 | 新表 `runtime_checkpoints` |

### 3.2 新表 `runtime_checkpoints`（append-only，durable 投影）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | `ckpt-…` |
| `scope` | TEXT | `task` / `workflow` / `session` |
| `ref_id` | TEXT | taskId / workflowId / sessionId |
| `attempt` | INTEGER | task attempt（task 级） |
| `at` | INTEGER | 毫秒时间 |
| `event_seq` | INTEGER | 恢复游标（事件日志最大 seq） |
| `state_json` | TEXT | **冻结的状态快照**：任务状态/阶段/已完成的证据键/未满足依赖/`inFlight`（toolCallId/子代理 id）/writeScope/预算余量/`resumePoint`/openRisks |
| `reason` | TEXT | `dispatch` / `wave_start` / `task_done` / `breaker` / `stall` / `recovery` / `shutdown` |
| `created_at` | INTEGER | 写入时间（审计） |

约束：`UNIQUE(scope, ref_id, attempt, at)`；**只追加不改写**；每 scope 保留最近 N 条（默认 20）+ 每个 `task_done` 保留 1 条权威点（清理策略见 §16 风险）。

**恢复语义**：事件日志是真相，检查点是**durable 投影**；恢复 = 读事件尾部 + 取最新一致检查点 + 重放（不重算副作用）。

### 3.3 恢复算法（启动时，单实例锁内）

```text
1. 取单实例/会话写锁（已有）；拿不到 → 退出（第二个实例不得写）。
2. 读事件尾部，跳过撕裂尾；校验 seq 连续（现有 SQLite 事务保证）。
3. 对账 session：把 running 的 tasks 标记 interrupted（旧行为）→ M19 改为先进入恢复流程：
   - 有 runtime_checkpoint 且 checkpoint.event_seq 在日志中存在 → 候选续跑
   - 无 checkpoint 或 seq 不连续 → 置 interrupted + 显式汇报（不可恢复）
4. 对每个 workflow（status=running）：→ recovering：
   a. 写 recovery 事件（append-only）
   b. 逐 task 对账：done/verified 保留；running → 按 checkpoint：
        无未知副作用 → queued（attempt 不变，续跑）
        有未知副作用（tool_calls 结果未知）→ blocked(waiting_person)（不自动重试）
        waiting_approval → 保持（审批行在）；审批已过期 → 按 §7 超时策略
   c. 重算 ready 集（依赖 + 并发 + 写域）
   d. 写新 checkpoint(reason=recovery) 并汇报"已从中断点继续"（若适用）
5. 触发调度器 tick；workflow 迁回 running 或 paused。
6. 每个修复动作写 `recovery_actions` 审计（见 §9），不静默。
```

**不可恢复的显式汇报**（必须）：
- 场景：无检查点/检查点损坏/未知副作用/Plan 或 Spec 版本已变导致旧 brief 失效（M18）。
- 动作：任务置 `blocked`/`interrupted`，**在会话里发一条明确消息**（"上次执行在 X 步中断，结果未知；需要你确认/重试"），并给选项（重试 / 跳过 / 取消），**绝不假装完成**。

### 3.4 恢复的硬约束

1. **不重跑 `done`/`verified`**；不重复执行已提交的副作用（靠幂等键，§5）。
2. **unknown 不自动重试**：`OUTCOME_UNKNOWN` 的工具调用 → `blocked(waiting_person)`，人可核对后选择"重试/标记完成"。
3. 恢复过程中**不显示半截回复**；补发状态以"已恢复"事件为准。
4. 恢复失败（如 DB 损坏）→ **只读降级**：展示最后可读状态，禁止继续写，提示人工处理。

---

## 4. 心跳与停滞检测

### 4.1 心跳（进度真源）

**心跳 = "有 durable progress"**（不是进程活着）：

| 心跳来源 | 触发 | 写入 |
|---|---|---|
| 任务阶段推进 | phase 变更 | `task.progress` 事件 + `tasks.last_progress_at` |
| 工具结果落库 | 每次 tool result | 同上 |
| 证据写入（M18） | evidence 落库 | 同上 |
| 汇报发送 | task report | 同上 |
| 审批决定 | allow/deny | 同上 |
| 检查点写入 | checkpoint | 同上 |
| 显式心跳 | 长工具执行中（如 `run_python` 长跑） | 执行器每 ≤15s 写一次 |

新增列（`tasks`/`workflows`）：
```text
tasks:     last_progress_at INTEGER NOT NULL DEFAULT 0,
           last_heartbeat_at INTEGER NOT NULL DEFAULT 0,
           next_action TEXT NOT NULL DEFAULT '',   -- 人话："下一步：解析第 2 个附件"
           eta_hint TEXT NOT NULL DEFAULT '',      -- "约 20 分钟" / "未知"
           stall_state TEXT NOT NULL DEFAULT ''    -- '' | warned | escalated | paused
workflows: last_progress_at, started_at, next_action, eta_hint
```

### 4.2 停滞检测（默认阈值，可配）

| 信号 | 阈值（默认） | 动作 |
|---|---|---|
| 无 durable progress | **>60s** → `stall_warning`（S2 心跳/状态显示，不打扰） | 记录 + UI 状态 |
| 仍无进展 | **>5min** → `stall_escalated`：**暂停任务**（status=paused, reason=stall）+ **会话内汇报**（卡在哪/最后动作/三选一：继续等 / 改派重规划 / 人工接手） | 必须可见 |
| 同工具同参数重复 | ≥3 次 | 提醒 + 强制重规划（不直接杀） |
| 同 Task 重派/新 attempt | >3 | 拆 Task / 换方案 / 问人 |
| 修复轮次 | >5 | 裁决（继续/重拆/blocked） |
| DAG 无 ready 且无在飞 | 立即 | 标 blocked + 原因 |
| 写域死锁 | 调度周期内 | 等待/重排；>60s 升级 |

**硬规则**：
- 停滞检测的"暂停"**不消耗预算**（不空转烧 token），但**保持审批与上下文**（可恢复）。
- 等待人工（`waiting_approval`/`blocked`）**不算停滞**：`last_progress_at` 更新为"等待开始时间"，stall checker 跳过这两类状态；但 **等待超时**由 §7 处理。
- 检测到停滞 ≠ 再等等：必须**显式状态 + 选项**，不自动杀、不无限重试。

### 4.3 检查器实现约束

- 单 goroutine tick（默认 10s；与 M13 调度 tick 分开或复用均可）。
- 只读 DB 判断，动作走服务层（先事件后状态），保证"谁检测、谁负责"。
- 幂等：同一 stall episode 只汇报一次（用 `stall_state` + `report_key`，§5.3）。

---

## 5. 幂等键（副作用 / 触发 / 汇报）

### 5.1 三类幂等键

| 类别 | 键 | 存储 | 语义 |
|---|---|---|---|
| **工具副作用** | `effectKey = hash(sessionId, taskId, attempt, tool, canonical_args)`；工具也可显式带 `idempotency_key` 参数（M9 已有 `tool.call` 事件可扩展） | 新表 `tool_effects(effect_key PK, session_id, task_id, attempt, tool, result_ref, status, created_at)` | 执行前查：已 `committed` → 直接返回记录的结果（不重跑）；`attempted` 但无结果 → 标 unknown，交人核对 |
| **触发** | `triggerKey = scheduleId + dueAt`（M13 已有 `schedule_fires` PK）；事件触发用 `(triggerId, eventId)` | `schedule_fires`（已有）；P2 `event_trigger_fires` | 同一次到点只触发一次；重复投递可容忍 |
| **汇报** | `reportKey = hash(workflowId, taskId, attempt, kind)`；`kind ∈ {task_done, task_failed, stall, paused, resumed, daily_digest, final_summary}` | 新表 `report_log(report_key PK, session_id, workflow_id, task_id, kind, message_id, at)` | 重启/重放后不重复发同一条汇报；**恢复后的"已恢复"汇报也带 key** |

### 5.2 执行顺序（必须）

```text
工具执行：
  1) 计算 effectKey → 查 tool_effects
     - committed：返回记录（幂等命中，记审计）
     - attempted（上次执行中崩溃）：返回 unknown 结果（不重试），任务 → blocked(waiting_person)
     - 无记录：insert attempted（UNIQUE 防并发重复）
  2) 执行工具（三屏障：副作用前 flush）
  3) 成功：update committed + 结果指针；失败：failed（可按策略重试，重试前重新查 key）
  4) 写 tool.call 审计事件
```

**硬规则**：`attempted` 状态过期（默认 24h）由人工/核对器处理，**不自动清理成可重试**；清理只做归档。

### 5.3 汇报幂等

- 所有"逐任务汇报/停滞/暂停/跨天汇总/最终汇总"都写 `report_log`；发送前 `INSERT OR IGNORE`，`changes()==0` 则跳过。
- 重启后恢复流程里"已从中断点继续"的汇报同样走 key（`kind=resumed, attempt`），避免每次重启刷屏。

---

## 6. 分层预算与熔断

### 6.1 三层预算（继承，不重定义）

| 层 | 计量 | 软限（默认，占位） | 硬限（默认，可配） | 到限动作 |
|---|---|---|---|---|
| **任务** | 模型调用数 / 工具数 / token / wall-clock | 模型 30 次；工具 60 次；token 200K；wall 60min | 可配（默认关） | 软限：**完成当前步→paused(budget)+汇报**；硬限：立即 paused |
| **工作流** | 任务数 / token / wall-clock / 成本 | tasks 15；token 1M；wall 8h | 可配 | 软限：**停止新启动，等在飞完成**→`partial` 收口+汇报；硬限：立即暂停 |
| **会话（日）** | 日 token / 成本 | 可配（默认 token 2M/日） | 可配 | 到达：暂停该会话的新工作流 + 汇报"今日预算已到"；已有任务跑完当前步 |
| **全局（进程）** | 日 token / 成本 / 并发 | 可配 | 可配 | 拒绝新 workflow/新任务；保留只读 |

**预算来源**：`tasks.budget_json`（已有）扩展键；`workflows.budget_json`（**新增列**）；会话级放 `settings`/`sessions` 扩展；全局放 `config.local.json` + 环境变量覆盖。

### 6.2 记账与对账

- 计量来自**单一来源**（现有 token 计量/usage）；每次模型/工具结算写 `budget_ledger(scope_kind, scope_id, at, tokens, tool_calls, wall_ms)`。
- 预算余量以"账本求和"为准，**不用内存计数器**（重启不丢）；写入失败允许落后（fail-soft），但**不超前**。
- 到限判定用"账本 + 当前在飞预估"，**headroom ≥20%**；报告必须写清"可能超支的尾部"（诚实语义）。

### 6.3 熔断动作（circuit breaker，默认=A：砍范围而非延期）

| 触发 | 动作 | 用户可见 |
|---|---|---|
| 任务软限 | 当前步完成后 paused(budget)；给"继续一次/结束/调预算"选项 | 一句 + 选项 |
| 工作流软限 | **停止新启动**、等在飞完成；未开始任务标 `dropped`；`outcome=partial`；写 `final_summary` | "已完成 X/Y，其余因预算未做" |
| 会话日限 | 暂停该会话新工作流；在跑任务完成当前步；发"日预算到限"汇报 | 明确一句 |
| 全局限 | 拒绝新工作流/新任务；只读运行 | 明确一句 |
| 同一失败重复（>2 次重试） | 任务 failed 或 blocked；依赖方 blocked；工作流 failed/partial | 汇报 + 原因 |

**硬规则**：熔断**永不自动放行审批**、永不假装完成；`partial` 必须列出"没做什么/为什么"，不写成成功。砍 `must` 范围必须人确认（继承 design/23 Q2=A）。

### 6.4 `partial` 收口

新增终态 `partial`：工作流因预算/失败无法全做时，保留**已验证部分**，写最终汇总（做了/没做/为什么/可后续），并允许"新 workflow 续做"（不 reopen 旧 workflow，保持审计清晰）。

---

## 7. 长时审批（等待小时级不丢上下文）

### 7.1 现状与缺口

现有 `approvals(id, tool, args, status, result, created_at, decided_at, risk, sandbox, session_id, decision)` + `approval_grants`（allow_session）。缺口：**超时**、**等待上下文快照**、**审批期间任务状态**、**重启后可见**。

### 7.2 扩展（M19）

```text
approvals 增列：
  expires_at INTEGER NOT NULL DEFAULT 0,        -- 0=不过期；默认 now+24h
  timeout_action TEXT NOT NULL DEFAULT 'deny_and_pause',  -- deny_and_pause | pause_only | fail
  context_json TEXT NOT NULL DEFAULT '{}',      -- 冻结：sessionId/workflowId/taskId/attempt/tool/args 摘要/sandbox 档位/justification/模型与角色/下一步 resumePoint
  notified_at INTEGER NOT NULL DEFAULT 0,       -- 最近催办时间（站内提示）
  decided_by TEXT NOT NULL DEFAULT ''           -- user | timeout | system
```

### 7.3 审批期间的任务状态

- 工具 ask → 任务置 `waiting_approval`（**新增状态**），**不占执行槽位**、不烧 token；心跳记录 `last_progress_at=等待开始`。
- 审批结果到达：**同 attempt 恢复**（不新建 attempt、不重跑已完成的步）；从 `resumePoint` 继续。
- 审批期间允许用户继续聊（会话不被阻塞）；其他任务照常调度（并发与 WIP 见 §11）。
- **重启**：`waiting_approval` 保持；恢复器不把它当 running；审批行仍可查/可批。

### 7.4 超时策略（默认 fail-closed）

| 情形 | 默认动作 | 用户可见 |
|---|---|---|
| 到期 `expires_at` | `deny_and_pause`：approval→`expired`，工具结果为"审批超时，已拒绝"，任务→`paused(approval_timeout)`，**不自动放行** | "有一项操作等你确认超时了，已先停下" + 重新发起入口 |
| 催办 | 等待 1h/6h（可配）发站内提示（不重复刷屏） | 站内提示 |
| 用户批 allow | 立即执行一次（allow_once）或写 grant（allow_session）后恢复任务 | 一句"已继续" |
| 任务被取消 | approval→`superseded`，不执行 | 静默/状态 |

**硬规则**：**永不因超时而自动允许**；`allow_session` 的 grant 也要有 TTL（默认 24h，可配），到期自动失效并记审计。

---

## 8. 调度与触发持久化

- **时间触发**：沿用 `schedules` + `schedule_fires`（M13，已持久）；M19 只补：
  1. `next_run_at` 在启动时按"当前时间 + 错过只补最近一次"重算（已实现，回归验证）；
  2. **触发→任务** 的绑定持久化：触发时创建的任务写 `tasks.payload.trigger = {scheduleId, dueAt}`，便于幂等与追溯；
  3. 触发失败（审批不可用等）→ 暂停 schedule + 汇报（已有 fail-closed，补 `report_log` 幂等）。
- **工作流内部触发**（"完成一个自动创建下一个"）：**不建新队列表**，由 `workflows + tasks.depends_on_json` + ready 计算驱动（已有）；M19 要求：
  1. 每次"自动启动"写 `workflow_events(type=auto_start)` + checkpoint；
  2. 自动启动前检查预算/并发/写域（§6/§11），不满足则**不启动**并记原因；
  3. 重启后由恢复器重算 ready 集，**不重复启动已 running 的任务**。
- **事件触发**（文件变化/任务完成触发新工作流）：**P2**，本契约只预留 `trigger_key` 设计位。

---

## 9. 可观测（进度 / 耗时 / 下次动作 / ETA）

### 9.1 新增 API（只读）

| 方法 | 路径 | 返回 |
|---|---|---|
| GET | `/api/runtime/status` | 版本、运行时长、并发在跑数、预算余量、DB 大小、恢复状态 |
| GET | `/api/workflows/{id}/runtime` | 状态/开始时间/已耗时/进度（done/total）/当前任务/下次动作/ETA/预算余量/停滞标记/最近检查点 |
| GET | `/api/tasks/{id}/runtime` | 同上（任务级）+ attempt/`last_progress_at`/`stall_state`/`resumePoint` |
| GET | `/api/approvals?status=pending` | 挂起审批（含等待时长、到期时间、**不返回敏感参数全文**，只给摘要） |
| GET | `/api/recoveries?since=` | 近期恢复动作（`recovery_actions` 审计，见 9.2） |

### 9.2 审计表 `recovery_actions`（append-only）

`id, at, scope, ref_id, action(recovered|marked_interrupted|marked_blocked|marked_partial|superseded_approval|resumed|stall_paused), detail_json, event_seq`
—— 恢复/停滞/熔断的每一步都留痕，供 M19 评测与用户解释。

### 9.3 WS 事件（现有通道扩展）

`task.runtime`（progress/nextAction/eta/stallState/attempt）、`workflow.runtime`、`recovery.action`、`approval.expired`、`stall.warning`、`budget.circuit_open`。
均带 `id`（幂等/去重）、`sessionId`、`at`；前端重连可用现有 `since` 续接。

### 9.4 ETA 的诚实性

- `eta_hint` 只给"粗略区间/未知"，**不承诺日历时间**；依据：已完成任务的平均耗时 × 剩余任务数（样本不足 → "未知"）。
- 预算到限/停滞时 ETA 必须变成"暂停中/需确认"，不得继续显示进度假装在跑。

---

## 10. 汇报：跨天分段 + 最终汇总

### 10.1 汇报种类（全部走 `report_log` 幂等）

| 种类 | 时机 | 内容 | `kind` |
|---|---|---|---|
| 逐任务汇报 | 每个 task done/failed | 结论 + 产物 + 下一任务（已有） | `task_done`/`task_failed` |
| 停滞/暂停/恢复 | 状态变化时 | 卡在哪/为什么/选项 | `stall`/`paused`/`resumed` |
| **跨天分段汇报（新增）** | 越过本地日界（0:00）且该会话有活跃长任务时，**当天第一次可汇报点**发；或恢复后首条 | 昨天完成 X/Y、当前在做 Z、今天计划、阻塞、花费 | `daily_digest` |
| **最终汇总（新增/强化）** | workflow `done`/`partial`/`failed` | 做了/没做/证据指针/产物/后续建议 | `final_summary` |

### 10.2 跨天分段的硬规则

1. **一天一条**（按 `workflowId + yyyy-mm-dd` 幂等），不刷屏；用户可配置关闭。
2. 分段汇报**不新开对话**，就在原会话发一条消息（与逐任务汇报同一通道）。
3. 内容用自然汇报体（完整句子，不堆关键词，不用 Spec/内部词汇）；带产物链接/文件指针。
4. 长任务跨多天：每天一条 digest + 每个任务一条汇报 + 结束时一条最终汇总；**最终汇总必须包含全部产物与"未做项"**。

---

## 11. 并发与隔离

| 项 | 默认 | 说明 |
|---|---|---|
| 单写者 | 1（已有） | SQLite + 进程锁；**第二个实例启动失败**；恢复在其内执行 |
| 实现类任务并发 | ≤2（workflow 内） | 同 writeScope 自动降为 1 |
| 审查类任务并发 | ≤2 | 只读，无写域冲突 |
| 同时 running 的 workflow | ≤3（每会话） | 防多开导致证据/预算失控；超出排队（用户不可感知） |
| `waiting_approval`/`paused`/`blocked` | **不占执行槽位** | 等待不消耗 concurrency；但计入"活跃任务"用于报告 |
| 子代理深度 | 1（继承 M9/19） | M19 不增加 |
| 隔离 | 每任务产物 `artifacts/<taskId>/`；工作区写受 M9 sandbox 约束；取消/暂停**杀进程树**（pwsh/python） | 长跑进程不得跨任务泄漏 |

**并发安全**：
- 调度器单 goroutine + DB 事务做"领取任务"（`UPDATE tasks SET status='running' WHERE id=? AND status='queued'`，`changes()==1` 才执行）；
- 检查点/心跳写入不与状态迁移交叉覆盖（同一事务写事件 + 状态）；
- 恢复器启动时**暂停调度 tick**（避免恢复与派发竞争），恢复完成后恢复 tick。

---

## 12. 验收标准（小时级 → 天级）

> 前置：M1–M18 回归全绿；每个 case 用独立端口 + 独立 `AGENTD_HOME`（不动 8787）。

### 12.1 小时级（A1–A5）

| # | 场景 | 步骤 | 断言 |
|---|---|---|---|
| **A1 杀进程续跑** | 3 任务工作流跑到第 2 个任务中途，`kill -9` → 重启 | 恢复器识别 checkpoint → 任务回 queued（同 attempt/新 attempt 均可）→ 继续完成 | 不重跑已 done 任务；写文件不重复（幂等）；会话出现"已从中断点继续"；最终 done |
| **A2 未知副作用** | 在 pwsh 写操作 dispatch 后杀进程 → 重启 | 任务 `blocked(waiting_person)`，**不自动重试** | 汇报"结果未知"；重复副作用=0；人可选重试/标记 |
| **A3 长时审批** | 触发 write/pwsh 审批 → 不操作 → 重启 → 1h 后批准（模拟时钟） | `waiting_approval` 保持；批准后同 attempt 继续 | 上下文不丢（args/任务/进度可查）；不重建 attempt；不重复已完成步 |
| **A4 停滞检测** | 模拟执行器卡住（心跳不更新） | >60s 警告；>5min 暂停+汇报 | 不空转烧 token；汇报含"卡在哪/选项"；恢复后继续 |
| **A5 预算熔断** | 工作流 token 软限很小 → 触发 | 停新启动、等在飞完成、`partial` 收口+汇报 | 不自动延期/不假装完成；报告列"没做什么"；`final_summary` 幂等 |

### 12.2 天级（A6–A8，用模拟时钟/缩短阈值跑）

| # | 场景 | 断言 |
|---|---|---|
| **A6 跨天分段汇报** | 长任务跨 2 个"模拟天" | 每天一条 digest（同一 workflow+日期幂等）；内容含完成/当前/计划/花费；无重复 |
| **A7 长跑稳定** | 模拟 24h（压缩为 10–20min 真实时间，阈值同步缩短） | 无内存/连接泄漏；DB 不无限增长（检查点保留策略生效）；心跳/预算账本连续；无重复汇报 |
| **A8 断网/外部失败** | `web_fetch`/模型请求中途断网 | 失败入事件；任务按重试策略（≤2）→ failed/blocked 并汇报；不卡死；恢复后继续 |

### 12.3 回归

- `go test ./...`、`go vet ./...`、`tsc --noEmit`、前端构建、M1–M18 evals 全绿；M19 新增 case（evals 侧）。
- 关键指标（先基线）：
  - `t_ckpt`（崩溃→恢复可继续的时间） P95 ≤ 30s；
  - 重复副作用 = 0；`done` 重跑 = 0；
  - 停滞检出时延 ≤ 阈值 + 10s；误报（正常长工具被暂停）≤ 基线；
  - 报告重复 = 0；恢复后"丢上下文"投诉 = 0。

---

## 13. 测试计划（故障注入 · 长时模拟）

| 类别 | 手段 | 覆盖 |
|---|---|---|
| **杀进程** | 子进程执行中 `kill -9`（Windows 用 `taskkill /F`）；分别在：工具执行中 / 模型请求中 / 审批等待中 / 检查点写入瞬间 | A1/A2/A3；torn-tail；无重复副作用 |
| **重启** | 重启后检查：状态对账、ready 重算、汇报幂等、预算账本继续 | A1/A3；`recovery_actions` 完整 |
| **断网/外部失败** | mock provider 断连、`web_fetch` 超时、磁盘只读/写满（可选） | A8；降级与汇报 |
| **长时间模拟** | 注入**假时钟**（`AGENTD_FAKE_NOW`/测试注入）压缩时间：跨天、24h 长跑、审批超时、预算日限 | A6/A7；日界逻辑、TTL、调度错过补偿 |
| **并发/竞争** | 双实例启动（第二实例必须失败）、恢复器 vs 调度 tick、并发审批、重复触发（同 dueAt 投递两次） | §11 单写者/幂等 |
| **DB 故障** | 模拟 checkpoint 损坏/缺行、事件 seq 洞、approvals 半写 | 只读降级/显式汇报，不崩溃 |
| **回归** | 现有 M1–M18 全量 + 新 case；独立端口/home | 不回归 |

测试实现建议（不写代码，只给约定）：故障注入用"测试开关 + 可注入时钟"（mock 模式下确定性）；每个 case 断言用现有 evals 的 `state_delta`/`forbidden`/`file_exists`/`tool_used`/`trajectory_shape` 组合，另加 `timing` 断言（t_ckpt）。

---

## 14. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 恢复器与调度器竞争，重复派发 | 重复执行/重复副作用 | 恢复期间暂停 tick；领取任务用条件 UPDATE；幂等键兜底 |
| R2 | 检查点写入放大 | DB 增长、写延迟 | 时机限 6 类 + 每 scope 保留 20 条 + `task_done` 权威点；异步清理 |
| R3 | 停滞误判（正常长工具被暂停） | 用户体验差 | 长工具显式心跳（≤15s）；`waiting_approval/blocked` 豁免；阈值可配 |
| R4 | 预算账本落后/超前 | 熔断过早/过晚 | 账本落后允许（fail-soft）、超前禁止；headroom 20%；到限判定用账本+在飞预估 |
| R5 | 长时审批堆积 | 用户看不到/忘掉 | pending 列表 API + 站内催办（1h/6h）+ 到期 fail-closed + 重新发起入口 |
| R6 | 跨天汇报刷屏 | 打扰 | 一天一条 + 幂等 + 可关；只在有活跃长任务时发 |
| R7 | unknown 副作用被当成成功 | 数据错误 | 硬规则：unknown→blocked(waiting_person)，不伪造证据（M18） |
| R8 | 单机 SQLite 写竞争 | 恢复/心跳写失败 | 单写者；写失败 fail-soft + 重试一次；严重时只读降级 |
| R9 | 恢复时间过长（任务多） | 启动慢 | 恢复器批量对账；`recovering` 有上限（默认 30s 超时→paused+汇报）；增量恢复（P1） |
| R10 | 与 M18 未落地冲突 | 字段缺失 | §16 降级：`spec_id` 可空、Plan 检查点先用 workflow 级；M18 落地后补字段 |

---

## 15. V1 / P1 边界

### 15.1 V1 做（本契约验收范围）

- Task/Workflow 状态机扩展（`waiting_approval`、`recovering`、`partial`）与迁移；
- `runtime_checkpoints` + 恢复算法 + 显式汇报 + `recovery_actions` 审计；
- 心跳/停滞检测（60s 警告 / 5min 暂停+汇报）；
- 三类幂等键（tool_effects / schedule_fires 复用 / report_log）；
- 分层预算（任务/工作流/会话日）+ 熔断 + `partial`；
- 长时审批扩展（expires_at/context_json/timeout_action/grant TTL）+ fail-closed 超时；
- 调度触发持久化补强（触发→任务绑定、自动启动审计、重启不重复启动）；
- 可观测 API + WS 事件；跨天 digest + 最终汇总；
- 验收 A1–A8 + 测试计划（杀进程/重启/断网/假时钟）。

### 15.2 P1 / 暂缓

- 跨机恢复、多副本、分布式锁；
- 事件触发/webhook 生态（`event_triggers`）；
- 自适应 ETA（历史模型）、预算预测；
- 检查点增量/压缩、恢复并行化；
- 外部监控导出（OTel/Prometheus）。

---

## 16. 与 M18 的依赖与降级

| M18 能力 | M19 用在哪 | 未落地时的降级 |
|---|---|---|
| `specs.status/version`、`acceptance_keys`、`evidence` | 恢复时对齐 Spec 版本；partial 的"保留范围"；概览 | `spec_id` 可空；partial 用 workflow `plan_json` 的验收键；恢复只对齐 plan_json 版本 |
| Spec 驱动的任务创建/验收 | 自动启动/收口 | 沿用现有 tasks/workflows 语义；不阻塞 M19 主链路 |
| 概览（session_overviews） | 跨天 digest 的"计划/完成"素材 | 用 tasks/workflows 状态 + 事件聚合 |

恢复算法中"Plan/Spec 版本不一致 → 不恢复旧 Plan"这一条在 M18 未落地时降级为"plan_json hash 变化 → 不恢复旧任务链，标 blocked 并汇报"。

---

## 17. 待确认（≤5，每条带默认）

1. **审批默认超时**：24h（可配）是否可接受？默认动作 `deny_and_pause`（fail-closed，不自动放行）。
2. **停滞阈值**：60s 警告 / 5min 暂停并汇报（可配）是否合适？（长工具需显式心跳豁免）
3. **跨天 digest 时间**：按本地 0:00 后首个可汇报点发（默认开），还是每天固定时刻（如 09:00）发？默认前者。
4. **预算默认值**：任务 200K token/60min、工作流 1M/8h、会话日 2M —— 先作为基线占位、M19 后校准是否同意？
5. **`partial` 的语义**：作为 workflow 终态（可新开 workflow 续做）是否同意？备选：`paused` + 汇报。

---

## 18. 参考

- `docs/design-core.md` §9（长程运行时能力清单：持久化/检查点/任务图/暂停取消重试/预算超时/权限审批/产物/幂等/上下文/汇报/调度/可观测/并发隔离/可委派）
- `docs/dsh-alignment.md` §7（DSH：三屏障/恢复三态/作业 owner 与输出环/等待去重/两条完成投递/预算分层/看门狗；推断项：无任务 DAG 调度器、无统一停滞器、jobs 不持久）
- `design/19-AgentLoop设计-v0.md` §7（检查点与恢复）、§11（失败/预算/指标）
- `design/23-Planner与长程任务-v0.md` §6.4/§6.5（并发/WIP/死锁）、§8.1–§8.5（计划检查点/断点续跑/预算熔断/卡死检测）、§9（进度与 Hill Chart 投影）、§10（失败/恢复/Ledger 对账）、§11（评测断言与 L2 case）
- `design/17-评测设计-v0.md`（L1/L2、故障注入、`t_ckpt`、Δ 消融）
- 现有实现：`agentd/internal/modules/tasks/migrations.go`（tasks/workflows/workflow_events）、`agentd/internal/modules/chat/migrations.go`（approvals/approval_grants/schedules/schedule_fires）、`agentd/internal/core/task/task.go`（interrupted）、`agentd/README.md` §M9–M13
- `docs/m13-contract.md`（调度字段/错过补偿/fail-closed 现状）

# M20 测试计划：动作层 CLI 端到端测试（CLI ↔ 动作 ↔ 原生工具）

> 目标：验证 M20 的三条承诺——**动作目录是唯一能力层**、**CLI 与原生工具同参数同结果**、**风险分级与审批不可绕过**——并给出可执行的命令矩阵、断言、失败注入、覆盖率核对与 CI 编排。
> 前置：M20 实现（`simo` CLI + `/api/actions/*` + 动作目录 `list/describe`）可用；M1–M19 已验收；E0 评测骨架（`evals/run.mjs`）可用。
> 依据：`docs/m20-contract.md`（原则/动作目录/CLI 标志与退出码/风险分级/UI 与对话共用动作）、`docs/m24-view-contract.md`（`ui.set_view/get_view/delete_view` 动作与等价校验）、`docs/m19-contract.md`（审批持久化/超时/幂等）、`design/17`（E0：L1/L2、grader、隔离与门禁纪律）、`evals/run.mjs`（现有 case/graders/exit code 约定）。
> 本文只写测试计划，不写代码、不改其他文档；数字为工程默认、可调。

---

## 1. 范围与门禁

### 1.1 被测对象

| 层 | 被测 | 断言方式 |
|---|---|---|
| L0 静态 | 动作目录与 CLI 定义一致（无手写第二份路由/命令） | 静态检查（源码/生成物对比） |
| L1 动作目录契约 | 每个动作有 name/description/params JSON Schema/risk/readOnly/idempotent/httpRoute；`describe` 返回可解析 JSON | 机器断言 |
| L2 CLI 命令 | 12 个命名空间 × 主要动作的命令、标志、退出码、输出信封 | 端到端（起服务 + 调 `simo`） |
| L3 对拍 | CLI 与原生工具（模型 tool call）同参数 → 同结果/同状态/同审计 | 双路径对比 |
| L4 失败注入 | 网络/权限/审批超时/参数非法/并发冲突/DB 故障 | 故障注入 + 稳定错误码 |
| L5 回归 | M1–M19 evals 全绿；M24 视图动作（`ui.set_view` 等）走同一动作层 | 跑全量 evals |
| L6 覆盖率 | 现有 `/api` 路由 ↔ 动作目录 100% 对账（含显式 allowlist） | 自动枚举 + diff 报告 |

### 1.2 门禁（全部必须满足才算 M20 accepted）

1. L6 覆盖率 **100%**：每个非 allowlist 的 `/api` 路由恰好被一个动作覆盖（method+path）；每个动作的 `httpRoute` 真实存在；无孤儿 handler。
2. 退出码矩阵（§4）全部通过；`--json` 成功/失败信封都合法；`--dry-run` 零副作用。
3. 审批语义：R3+ 必须审批、R4+ **`--yes` 不可跳过**、`never` **fail-closed**（拒绝而非放行）。
4. 对拍矩阵（§6）全绿：结果/状态/审计三一致。
5. 失败注入（§8）全部返回稳定错误码，无 panic、无半写状态。
6. M1–M19 evals 不回归；`go test ./...`、`go vet`、`tsc --noEmit`、前端构建、模块度检查全绿。
7. 报告（§10）生成并归档；CI 顺序（§11）可复现。

---

## 2. 测试环境与隔离（与现有 evals 纪律一致）

| 项 | 约定 |
|---|---|
| 数据隔离 | 每个 suite 用**独立临时 `SIMO_HOME`**（`<tmp>/m20-<case>-<pid>`），**绝不写用户真实 `~/.simo`**；结束后清理（失败保留供诊断） |
| 端口隔离 | 独立端口（默认从 **18900** 起分配，按 suite 递增）；**不占用用户实例 8787** |
| 模型 | 默认 `SIMO_LLM=mock`（确定性）；真模型 smoke 单列（§11 阶段 7），不进常规门禁 |
| 服务生命周期 | suite 自己起 `simo serve`（或现有 simo 入口）→ 等 `/api/health` → 跑 → 杀进程；重启类 case 用 `.ps1` 脚本（沿用 `evals/*-restart.ps1` 模式） |
| CLI 调用 | 子进程直接执行 `simo.exe`（构建产物路径由 `SIMO_BIN` 指定），捕获 stdout/stderr/exit code；**禁 shell 拼接**（防参数注入，测试本身要证明 `--` 与空格路径安全） |
| 时钟 | 审批超时/跨天 case 用**可注入时钟**（`SIMO_FAKE_NOW` 或测试专用 debug 端点），不真等 |
| 夹具 | 每个 case 自带 seed：预置会话/任务/工作流/记忆/文件（通过动作层做准备，验证动作层自洽） |

---

## 3. CLI 命令矩阵（12 命名空间）

> 命令形式按 m20-contract：`simo <namespace> <action> [flags]`；工具名 = `simo_<namespace>_<action>`（或扁平名，按实现）。每条至少断言：**退出码 + `--json` 信封 + 状态/副作用**。标注 `[R]` = 只读、`[W]` = 写、`[X]` = 执行/危险。

| 命名空间 | 主要动作（矩阵覆盖） | 关键断言 |
|---|---|---|
| **session** | list[R] / get[R] / create[W] / rename[W] / archive[W] / unarchive[W] / pin[W] / unpin[W] / move[W] / owner.set[W] / delete[X] | list 与 UI 一致；create 返回 id 且 `GET /api/sessions` 可见；rename 后 message 的 `sessionPath` 更新；archive 后 chat 被拒（409 语义）；delete 需确认（`--yes` 对 R4 无效）；`--json` 字段稳定 |
| **agent** | list[R] / get[R] / set-owner[W] / persona[W] | set-owner 生效且 UI 同步；persona 写入后可读；非法 agent → 稳定错误码 |
| **chat** | send[W] / reply[W] / correct[W] / retract[W] | send 返回 messageId；reply 带 `replyTo` 快照；correct/retract 只影响目标消息；WS 收到对应事件；重复 send 幂等语义按目录声明 |
| **task** | list[R] / get[R] / cancel[W] / retry[W] | 状态机与 M19 一致；cancel 保留已完成；retry attempt+1；对不存在/已终态 task 的错误码 |
| **workflow** | list[R] / get[R] / pause[W] / resume[W] / cancel[W] / start[W] | pause 只停新启动；resume 继续；cancel 终止 future；重启后状态恢复（复用 M19 case） |
| **schedule** | list[R] / create[W] / update[W] / delete[W] / run-now[W] | 非法 cron → 2；下次时间正确；停机错过只补最近一次（复用 M13 case）；幂等 `scheduleId+dueAt` |
| **memory** | search[R] / get[R] / traverse[R] / conflicts[R] | 只读；作用域过滤生效；跨会话越权 → 5/空；冲突条目可见 |
| **file** | list[R] / preview[R] / download[R] / upload[W] / delete[X] | upload 大小/类型限制；download 与 UI 一致；delete 需确认；路径穿越拒绝（复用 M12/M21 case） |
| **permission** | get[R] / set[W] / approve[W] / deny[W] | set 模式生效（下次动作）；approve/deny 只对 pending 有效；已处理 → 409 语义；`never` 下 ask 动作直接拒绝 |
| **ui** | theme.set[W] / layout.set[W] / panel.toggle[W] / open[W] / **set_view[W]** / get_view[R] / delete_view[W] | theme 生效且对话同样可触发；`ui.set_view` 走 M24 校验（非法 schema → 稳定错误码，不产生版本）；`get_view` 返回当前版本；`--dry-run` 不落版本 |
| **config** | get[R] / set[W] | get 不泄露密钥（掩码）；set 需审批（R2/R3 按目录）；重启后生效 |
| **system** | health[R] / version[R] / stats[R] / usage[R] | health 200；version 与二进制一致；usage 与 `/api/usage` 一致 |

**命令样例（用于断言脚本模板）**：

```text
simo session list --json
simo session create --title "测试会话" --json
simo agent set-owner --session main --agent sec-1 --json
simo chat send --session main --text "你好" --json
simo task list --session main --status running --json
simo task retry --id task-1 --json
simo workflow resume --id wf-1 --json
simo schedule create --session main --trigger "every 1h" --prompt "提醒我喝水" --json
simo memory search --q "项目" --json
simo file upload --session main --path ./fixture.pdf --json
simo permission approve --id ap-1 --json
simo ui theme set light-tech --json
simo ui set-view --session main --file ./view.json --json
simo config get --json
simo system health --json
```

> 参数风格（`--id` 还是位置参数、别名）以 M20 实现 `describe` 为准；本计划只锁**语义**与**断言**，不锁拼写；实现后把矩阵落成 case 数据（JSON），不写死脚本。

---

## 4. 标志与退出码断言

### 4.1 退出码矩阵（m20-contract §3）

| 码 | 语义 | 触发用例 | 额外断言 |
|---|---|---|---|
| **0** | 成功 | 任一 R0–R2 动作正常执行；R3+ 已获批后执行 | stdout `--json` 信封 `{ok:true,data}`；stderr 为空或仅诊断信息 |
| **1** | 一般错误 | 服务不可达/连接中断；DB 读写失败；内部错误 | 信封 `error.code` 稳定（如 `ACTION_INTERNAL`/`ACTION_TRANSPORT`）；**不得半写**（状态回滚或幂等可恢复） |
| **2** | 参数/用法错误 | 缺必填参数；未知 action；未知 flag；非法 JSON body；非法枚举值 | `error.code=ACTION_INVALID_ARGS`；**不产生任何状态变更**；`--json` 下仍输出 JSON |
| **3** | 需要审批 | R3+（R4–R5 若命中审批策略）首次调用 | 输出 `error.code=APPROVAL_REQUIRED` + `approvalId`；**未执行任何副作用**；`simo permission approve <id>` 后可重试成功 |
| **4** | 被拒绝 | 用户 deny；审批超时（M19 `expired`）；`never` 策略；R4+ 带 `--yes`；权限不足策略拒绝 | `error.code=DENIED/APPROVAL_EXPIRED/NOT_ALLOWED`；状态不变；审计记录拒绝原因 |
| **5** | 权限不足 | 会话权限/角色不足（非审批问题）；跨会话越权；文件作用域外访问 | 错误可读；不泄露被拒资源内容 |

### 4.2 标志断言

| 标志 | 断言 |
|---|---|
| `--json` | 成功/失败/需审批**三种情况都输出单一 JSON 到 stdout**（不混入日志；诊断走 stderr）；字段 `ok`/`data`/`error{code,message,recovery?}`；退出码与上一节一致 |
| `--pretty` | 人类可读；与 `--json` **语义等价**（同一动作、同一数据；字段内容一致，仅格式不同）；不用于机器断言 |
| `--yes` | **仅跳过 R0–R2 的确认**；R3+ 仍返回 3（不自动审批）；**R4+ 返回 4（不可跳过）**；R5 同 4；`--yes` 不能绕过 `never` |
| `--dry-run` | 执行校验与预览，**零副作用**（DB/文件/动作审计中的状态变更=0；是否记"preview 审计"按实现定，但不得产生审批、不得创建实体）；返回 `data.wouldDo`（或 `plan`）；对 R3+ 返回 3 且不创建审批（或明确返回 dry-run 计划，按 M20 决定——见 §15） |
| `--pretty`+`--json` | 同时给出 → 2（互斥参数） |
| `--` | 支持以 `--` 结束 flag 解析，后续按位置参数；文件名含 `-` 的用例必须通过 |
| `SIMO_BASE_URL` 等环境变量 | 覆盖默认地址；优先级 = flag > env > 默认；测试 Server 地址指向临时端口 |

### 4.3 审批语义专项

| 场景 | 步骤 | 期望 |
|---|---|---|
| R3+ 首次 | 用 `pwsh`/`write` 类动作（需审批） | **exit 3** + approvalId；目标状态未变；`simo permission get`/`/api/approvals` 可见 pending |
| allow_once | approve 后**重试原命令** | exit 0；仅执行一次；approval→approved |
| allow_session | 审批选 allow_session（会话+工具+参数前缀） | 同前缀动作**不再 ask**；跨前缀仍 ask；grant 过期（M19 TTL）后重新 ask |
| deny | deny 后重试 | exit 4；状态不变；审计有 deny |
| **R4 不可 --yes** | `simo session delete id --yes` | **exit 4**；无删除；审计记录"被拒绝（R4）" |
| **never fail-closed** | 会话策略 `never` + R3 动作 | **exit 4**（不是 3、不是 0）；不创建审批、不执行 |
| 审批超时 | 用假时钟跨过 `expires_at`（M19） | 重试 → **exit 4**（`APPROVAL_EXPIRED`）；不自动放行 |
| 审批并发 | 同一动作并发两次 | 只创建一个 approval；两次都 3 或第二次拿到同一 id；approve 后仅执行一次（幂等） |

---

## 5. 幂等键测试

| 类别 | 用例 | 断言 |
|---|---|---|
| **动作幂等（目录声明 `idempotent=true`）** | 同参数 + 同 `--idempotency-key` 连续两次 | 第二次返回同一 `data`（含同一实体 id）；副作用=1；审计两条（都记命中） |
| **无 key 的幂等动作** | 同参数连续两次、不给 key | 默认键（`namespace.action + 参数摘要`）→ 仍只生效一次（按目录语义；若不支持则文档明确 non-idempotent） |
| **非幂等动作** | `chat.send`（若声明 non-idempotent）连续两次 | 两条消息（预期行为）；不得默默去重（测试要证明声明与实现一致） |
| **触发幂等** | 同一 schedule dueAt 投递两次（mock 时钟） | 只执行一次（M13 `schedule_fires`） |
| **汇报幂等** | 重启后恢复流程重复触发汇报 | 不重复发（M19 `report_log`） |
| **工具副作用幂等** | 同一 `tool_effects` key 重试 | 返回记录结果；不重复执行（M19 §5） |

---

## 6. 对拍：CLI 与原生工具同参数同结果

### 6.1 对拍方式

对每个动作 A、参数 P：

1. **路径 1（CLI）**：`simo <ns> <a> <P> --json`。
2. **路径 2（原生工具）**：mock LLM 产出 tool call `simo_<ns>_<a>`（参数 P）→ 走同一 `/api/actions`。
3. **比较**：
   - **只读动作**：`data` 规范化后**逐字相等**（剔除易变字段：时间戳、`updatedAt`、请求 id，按 §6.2 归一化）。
   - **写动作**：比较**状态差量**（`state_delta`：目标实体字段）+ 实体数量；创建类比较"规范化后的实体内容"（id 用占位符对齐）。
   - **执行类动作**：比较退出/结果信封 + 副作用（文件存在、进程退出码标记）+ 审批状态一致（CLI=3 ↔ 工具结果 `PENDING_APPROVAL`）。
   - **审计**：两条路径的 action 记录（name/params 摘要/risk/结果）一致；仅 `source` 不同（`cli` vs `tool`）。
4. **错误对拍**：非法参数/未知动作/权限不足/`never` 拒绝 → CLI 退出码与工具错误码**映射一致**（见 6.3）。

### 6.2 归一化规则（避免 flaky）

- 剔除/替换：`id`（按实体类型占位）、时间戳（`createdAt/updatedAt/at` 置 0）、`requestId/traceId`、绝对路径中的临时 home 前缀、排序（按稳定键排序）。
- 保留：所有业务字段、错误 `code`、状态机字段、数量、内容摘要。
- 比较前过一遍 `canonicalJSON`（键排序、数字规范化）；差异输出到报告 `diff` 字段。

### 6.3 退出码 ↔ 工具错误码映射（固定表）

| CLI exit | 工具结果 |
|---|---|
| 2 | `Error: ACTION_INVALID_ARGS` / `UNKNOWN_ACTION` |
| 3 | `PENDING_APPROVAL approvalId=…`（工具结果，不结束 turn） |
| 4 | `Error: DENIED` / `APPROVAL_EXPIRED` / `NOT_ALLOWED` |
| 5 | `Error: PERMISSION_DENIED` |
| 1 | `Error: ACTION_INTERNAL` / `TRANSPORT` |

对拍矩阵覆盖：**12 命名空间各 ≥1 只读 + 1 写/执行（若存在）+ 审批类 2 条**；`ui.set_view`（M24）单独覆盖创建/非法 schema/回滚三种。

---

## 7. 现有 API 100% 覆盖的核对方法

### 7.1 枚举真实路由（两条互补路径）

| 方法 | 做法 | 用途 |
|---|---|---|
| **A. 运行时枚举（首选）** | debug 模式新增 `GET /api/debug/routes`（仅 `-debug`/`SIMO_DEBUG=1` 且 loopback），返回 `[{method,pattern,source}]`，来源用模块注册信息 | 真实注册表，不靠文本推断 |
| **B. 源码枚举（兜底/CI 无服务时）** | 扫描 `backend/**/*.go` 中 `mux.HandleFunc("METHOD /path")` 字面量（现有 66 处；`backend/internal/modules/{sessions,chat,tasks,memory}/http*.go`、`module.go`、`platform/httpserver/server.go`），归一化（`{id}`→`:param`） | 无服务也能跑覆盖率门禁；与 A 交叉验证 |

### 7.2 动作目录侧

- 每个动作必须有 `httpRoute`（method+pattern）字段（M20 §2 目录应补；与 M24 一并要求）。
- 动作登记为工具名（`simo_<ns>_<action>`）+ CLI 子命令；`describe` 返回 schema/risk/readOnly/idempotent/httpRoute。

### 7.3 对账算法与 allowlist

```text
R = 枚举路由（A 优先，B 兜底）
A = 动作目录 httpRoute 集合
X = allowlist（显式豁免，必须带 reason/owner/date）
断言：
  1) 每个 r ∈ R \ X 恰好被 1 个 a ∈ A 覆盖（method+path 归一化后相等）
  2) 每个 a.httpRoute ∈ R（不得指向不存在的路由）
  3) allowlist 中的每条 r 仍存在于 R（路由删除后 allowlist 必须同步清理，否则失败）
  4) 无 allowlist 过期项（reviewedAt 超过 90 天 → 警告/失败，可配）
```

**allowlist 候选**（每条需理由）：`GET /`（静态前端）、`GET /api/ws`（WebSocket 长连接，工具面用 `chat.send` 等动作而非 ws）、`GET /api/health`（探活，`system.health` 动作已覆盖 → 优先映射，不豁免）、`/api/debug/*`（仅 debug 开关）、`GET /api/uploads/{id}`（内容下载：由 `file.download` 覆盖，不豁免）、`GET /api/artifacts/{id}/content`（`file.download`）。**原则：能映射就映射，不轻易豁免**。

### 7.4 已知需要补映射的路由（预检清单，测试会暴露）

> 以下来自当前路由清单（M24 前）与 M20 目录的**潜在缺口**，测试首跑会报 `missing`，实现需补动作或进 allowlist：

- `GET /api/artifacts`、`GET /api/artifacts/{id}`、`/content`、`GET /api/sessions/{id}/artifacts` → `file.*`
- `GET /api/uploads/{id}`、`/meta`、`POST /api/uploads` → `file.*`
- `GET /api/agents`、`GET /api/stats`、`GET /api/usage`、`GET /api/decisions` → `agent.list` / `system.stats` / `system.usage` / `session.decisions?`（需在目录中明确）
- `GET /api/permissions`、`POST /api/permissions` → `permission.get/set`
- `GET /api/runtime/status`、`/api/workflows/{id}/runtime`、`/api/tasks/{id}/runtime` → `system.runtime` / `workflow.get` / `task.get`（或新增 `runtime` 命名空间；需目录决策）
- `GET/POST /api/sessions/{id}/overview`、`/overview/refresh` → `session.overview.get/refresh`
- `GET /api/sessions/tree` → `session.tree`
- `GET /api/sessions/{id}/owner`、`PUT .../owner` → `session.owner.set/get`（目录已含 `session.owner.set`，需补 get）
- `PATCH /api/sessions/{id}` → `session.rename`
- 视图路由（M24）：`/api/views*` → `ui.get_view`/`ui.set_view`/`ui.delete_view` + 只读列表（可能需要 `ui.view.list`）

### 7.5 报告

`evals/reports/m20-coverage.json`：

```json
{ "routes": 66, "actions": 58, "missing": ["GET /api/x"], "extra": [],
  "allowlisted": [{"route":"GET /api/ws","reason":"...","owner":"...","reviewedAt":"..."}],
  "ok": false }
```

CI 门禁：`missing==0 && extra==0 && allowlist 全部有效`；覆盖率不达标**阻断合并**（或按实施阶段先设为 warning、验收前必须硬门禁——见 §15）。

---

## 8. 失败注入

| # | 注入 | 期望 |
|---|---|---|
| F1 | 服务不可达（关掉 server） | exit 1；`ACTION_TRANSPORT`；不重试超过 1 次（CLI 不做无限重试） |
| F2 | 服务 500（debug 端点强制内部错误） | exit 1；错误可读；状态无半写 |
| F3 | 权限不足（会话权限/角色限制） | exit 5；不泄露资源内容 |
| F4 | 审批超时（假时钟） | exit 4 `APPROVAL_EXPIRED`；不自动放行（M19） |
| F5 | `never` 策略 | exit 4；不创建审批记录 |
| F6 | 非法参数：缺参数/类型错/未知枚举/未知 action | exit 2；零副作用；`--json` 信封 |
| F7 | 非法 JSON body（`--body @file` 畸形） | exit 2；无状态变更 |
| F8 | 并发冲突：两 CLI 同时 `task.retry` 同 task | 一个成功、另一个稳定错误（`CONFLICT`/`ALREADY_RUNNING`）；attempt 只 +1 |
| F9 | DB 只读/锁（测试开关） | exit 1；只读降级不破坏数据 |
| F10 | 输出过大（大文件 download/print） | 按 M9 spill 规则：文件落盘/截断提示；exit 0（非错误） |
| F11 | 网络半途中断（动作执行中断言 WS 断线） | 状态由 M19 恢复逻辑兜底：unknown 不重试、显式汇报 |
| F12 | 时区/时钟异常 | 时间字段为毫秒时间戳/ISO；无解析崩溃 |

---

## 9. 与 M1–M19 回归衔接

- **复用现有 evals**：`evals/cases/*.json`（M1–M17）与 M18/M19 新增 case；M20 case 放 `evals/cases-m20/`（或 `cases/8x-*.json` 编号），沿用 grader：`regex/state_delta/forbidden/file_exists/tool_used/exit_code(新增)`。
- **新增 CLI grader**（计划）：`cli_exit`（期望退出码）、`cli_json`（JSON 信封 schema/字段断言）、`cli_stderr_empty`、`route_coverage`（读取覆盖率报告断言）。
- **重启类**：沿用 `evals/*-restart.ps1`（M10/M13/M14/M15 已有）；M20 增加 `cli-restart.ps1`（动作执行中杀进程 → 重启 → 幂等/恢复断言）。
- **独立端口/home**：所有 M20 case 与 M1–M19 一样隔离，**不动 8787**；同一 suite 内串行（SQLite 单写者）。
- **真实模型 smoke**：M20 不需要真模型（动作层是确定性的）；仅在 §11 阶段 7 可选跑 1 条"对话触发动作"验证 UI/对话等价，预算受控（≤2k tokens）。

---

## 10. 报告格式

### 10.1 机器可读（新增，供 CI/看板）

`evals/reports/m20-<yyyymmdd-HHMMSS>.json`：

```json
{ "suite": "m20", "schema": 1, "startedAt": "...", "durationMs": 0,
  "env": { "simoHome": "<tmp>", "baseUrl": "127.0.0.1:18900", "llm": "mock",
           "simoVersion": "...", "actionsCount": 0, "routesCount": 0 },
  "summary": { "total": 0, "pass": 0, "fail": 0, "skip": 0, "criticalFail": 0, "exitCode": 0 },
  "coverage": { "ok": false, "missing": [], "extra": [], "allowlisted": [] },
  "cases": [ { "id": "cli-session-rename", "tier": "critical", "status": "pass",
               "kind": "cli|parity|inject|coverage|regression",
               "durationMs": 0, "exitCode": 0, "assertions": [{"name":"exit=0","ok":true}],
               "evidence": {"stdout": "...", "stderr": "..."},
               "failure": {"class": "assertion|product|env|flake", "message": ""} } ] }
```

### 10.2 人读摘要（Markdown）

`evals/reports/m20-<ts>.md`：总 PASS/FAIL、覆盖率结论、失败用例表（用例/期望/实际/复现命令/证据路径）、耗时 Top10、与上次基线 diff（新增失败）。

### 10.3 失败分类与 flake 纪律

- `assertion`：实现与契约不符；`product`：服务错误/panic；`env`：端口/文件/环境；`flake`：超时/竞态。
- **只有时序类**允许重试一次；重试仍失败按失败计；flake 必须在报告中计数（不静默吞）。
- 失败证据必须保留：临时 home、stdout/stderr、覆盖率 diff、服务日志。

---

## 11. CI 运行顺序与时间预算

| 阶段 | 内容 | 预计耗时（本机） | 失败即阻断 |
|---|---|---|---|
| 0 | 静态：`gofmt -l`、`go vet ./...`、`tsc --noEmit`、前端构建、模块度检查 | ≤2min | ✅ |
| 1 | 单元：`go test ./...`（含权限/动作目录/路由枚举测试） | ≤3min | ✅ |
| 2 | 路由覆盖率门禁（离线：方法 B；有服务：方法 A） | ≤30s | ✅（验收后） |
| 3 | 服务起 + `/api/health` + 动作目录 L1 契约断言（`describe` 全量校验） | ≤30s | ✅ |
| 4 | **CLI 矩阵**（§3，mock，分批 `--only` 避免长套件中断） | ≤6min | ✅ |
| 5 | **对拍矩阵**（§6）+ 幂等（§5） | ≤4min | ✅ |
| 6 | **失败注入**（§8） | ≤3min | ✅ |
| 7 | M1–M19 evals 全量回归（mock）+ M20 case | ≤10min | ✅ |
| 8 | 真实模型 smoke（可选，单独 job/夜间） | ≤5min | ❌（只记录） |
| 9 | 汇总报告 + 归档证据 | ≤30s | — |

- 同一机器并发：**不同 suite 不同端口/home** 可并行；**同一 suite 内串行**（SQLite 单写者）。
- 建议 CI 先跑 0/1/2（快、离线），再起服务跑 3–8；失败时保存报告与证据目录。

---

## 12. 验收标准（M20 test plan 自身的验收）

| # | 断言 |
|---|---|
| A1 | 覆盖率：所有非 allowlist 路由被动作覆盖（missing=0、extra=0、allowlist 有效）；报告落盘 |
| A2 | 12 命名空间命令矩阵全部通过；`--json` 成功/失败/审批三种信封合法 |
| A3 | 退出码 0/1/2/3/4/5 各有 ≥1 用例且符合 §4 |
| A4 | `--yes` 对 R0–R2 生效、R3 不审批、R4+ 拒绝；`--dry-run` 零副作用 |
| A5 | 审批全链路（allow_once/allow_session/deny/timeout/never）通过；R4 不可 --yes |
| A6 | 对拍：≥12 命名空间 ×（1 只读 + 1 写/执行）+ 审批 2 条 + `ui.set_view` 3 条，结果/状态/审计一致 |
| A7 | 幂等：动作/触发/汇报/副作用四类 key 用例通过 |
| A8 | 失败注入 F1–F12 全部返回稳定错误码、无 panic、无半写 |
| A9 | M1–M19 evals 回归全绿；M20 case 全绿；隔离（端口/home）验证通过 |
| A10 | 报告 JSON+Markdown 生成；CI 顺序可复现；flake 计数可见 |
| A11 | `simo` 二进制不存在/版本不匹配时 suite 明确报 `env` 失败（不静默跳过） |
| A12 | 无 8787 污染、无用户真实 home 污染（测试前后校验） |

---

## 13. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | CLI 与动作目录手写双份，对拍假绿（两套实现都错） | 违背"唯一能力层" | 静态检查：CLI 命令由目录生成/注册；禁止手写第二份路由；对拍必须走同一 `/api/actions` |
| R2 | 覆盖率 allowlist 腐烂 | 覆盖率虚高 | allowlist 带 owner/date/reason + 90 天复核 + 路由删除即失败（§7.3） |
| R3 | 对拍 flaky（id/时间/排序） | CI 不稳 | 归一化规则（§6.2）+ 只比较稳定字段 + 失败保留 diff |
| R4 | 审批测试依赖真实人 | 不可自动化 | 用 `permission.approve` 动作 / debug 注入审批结果；`never` 与超时用假时钟 |
| R5 | 并发/重启测试互相污染 | 假失败 | 独立 home/port；同 suite 串行；重启脚本显式等待 health |
| R6 | `--yes` 被滥用到危险动作 | 安全问题 | 固定矩阵断言 R4+ `--yes` → exit 4；代码层按 risk 判定，不靠 CLI 解析 |
| R7 | 动作目录增长导致矩阵爆炸 | 维护成本 | 矩阵按"命名空间 × 类别"抽样 + 目录 L1 契约全量机器校验；新增动作必须补样例 |
| R8 | 真模型 smoke 不稳定 | 误报 | 默认 mock 门禁；real 仅夜间/手动，独立 tier，不进阻断 |

---

## 14. 边界 / V1 / P1

**V1（本计划覆盖）**：12 命名空间 CLI、退出码/标志、审批语义、对拍、幂等、覆盖率核对、失败注入、报告、CI 顺序。
**P1 / 暂缓**：交互式 REPL（`simo` 无参数进 shell）、动作别名/简写、远程/HTTP 客户端、MCP/第三方动作注册、多用户/租户权限矩阵、CLI 自动补全、跨机调用。**不做**：CLI 直接调业务 API 的"快捷路径"（会破坏唯一入口）。

---

## 15. 待确认（≤5，每条带默认）

1. **`--dry-run` 对 R3+ 的语义**：默认**不创建审批**、返回计划预览 + exit 3（"需要审批，dry-run 不落审批"）；若实现选择"dry-run 直接展示将执行的参数且 exit 0"，需改断言（默认按前者）。
2. **覆盖率门禁强度**：M20 实施首周设为 **warning**，验收前切 **blocking**；默认如此。
3. **动作 `httpRoute` 字段**：要求每个动作声明 `httpRoute`（method+pattern），由测试对账；默认加进 M20 目录 schema。
4. **对拍比较范围**：默认"归一化后 data + 状态差量 + 审计三元组"；是否把审计逐字比对降为警告（实现初期）？默认硬断言（验收前）。
5. **报告位置/保留**：`evals/reports/` 保留最近 30 份 + 失败证据永久保留（默认，可配）。

---

## 16. 参考

- `docs/m20-contract.md`（动作目录/风险分级/CLI 标志与退出码/`--yes` 仅 R2 以下/R4+ 不可跳过/统一信封/UI 与对话共用动作）
- `docs/m24-view-contract.md`（`ui.set_view/get_view/delete_view`、校验错误码、版本/回滚；本计划的 `ui` 命名空间对拍用例依据）
- `docs/m19-contract.md`（审批持久化/超时 fail-closed/幂等键/恢复；审批超时与幂等用例依据）
- `docs/m1-contract.md`（REST/WS 契约与 M1 验收）、`docs/m13-contract.md`（schedule 触发/错过补偿）
- `design/17-评测设计-v0.md`（E0：L1/L2、grader、隔离、门禁纪律、WITH/W/OUT）
- `evals/run.mjs`（现有 case/steps/graders/exit code 0/1/2、独立端口/home、token 统计、契约诊断）
- 现有路由清单（覆盖率基线）：`backend/internal/modules/{sessions,chat,tasks,memory}/http*.go` + `module.go` + `platform/httpserver/server.go`（本次 grep 得 **66 处 `mux.HandleFunc`**）
- `backend/README.md` §M9–M13（审批/审计/pwsh/spill/工作流/调度现状）

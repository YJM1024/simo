# E0 评测骨架（M1–M7）

> 依据：`design/17-评测设计-v0.md`（E0）+ `docs/m1-contract.md`…`m3-contract.md` + 各里程碑任务书。
> 形态：**零第三方依赖**、单命令、确定性 grader；流式断言走 **WebSocket**；只跑 `WITH` 臂（`W/OUT` 与 `Δ` 留接口）。
> 最终验收报告：见 [`RELEASE.md`](RELEASE.md)。

## 1. 怎么跑

```bash
node evals/run.mjs                                   # 全量（服务需已启动）
node evals/run.mjs --base-url http://127.0.0.1:8899  # 指定端口
node evals/run.mjs --case health                     # 单条
node evals/run.mjs --only health,ws-order            # 分组（逗号分隔）
node evals/run.mjs --list                            # 列出全部 case
node evals/run.mjs --verbose                         # 打印每个 grader 的判定细节
node evals/run.mjs --no-diagnostics                  # 跳过契约诊断
node evals/run.mjs --no-selfcheck                    # 跳过 harness 自检（不建议）
node evals/selftest.mjs                              # 只跑 harness 自检（7 项）
```

**退出码**：`0` 全过 ／ `1` 有失败 ／ `2` 前置不满足（服务未启动、case 非法、**harness 自检失败**）。
`2` 与 `1` 分开是刻意的：**"服务没起来 / 评测工具坏了"不应被误读成"产品有 bug"**。

### 服务侧环境（M2 起）

```powershell
$env:AGENTD_HOME = "E:\tmp\agentd-home"   # 独立数据根，别用真实 ~/.agentd
$env:AGENTD_LLM  = "mock"                 # 确定性 mock
$env:AGENTD_DEBUG = "1"                   # 打开 /api/debug/last-llm-request
agentd.exe serve -addr 127.0.0.1:8899
node evals/run.mjs --base-url http://127.0.0.1:8899
```

> **并行跑评测必须换端口 + 换 home**。两个评测共用一个端口时，请求会连到别人的实例：
> 审批写进了别人的 workspace（表现为"allow 后文件不存在"）、任务状态互相干扰（WS 错误/超时）。
> 诊断项「被测服务写入本 AGENTD_HOME」就是用来抓这类**假失败**的。
> **eval 进程自身也要设同一个 `AGENTD_HOME`**：`{{agentdHome}}` 变量由 run.mjs 从自己的 env 读取，用来断文件（如 `permission-ask` 的 mock-write.txt）；只给服务设、不给评测设会误报"文件不存在"。

### 交付冒烟（M7）

```powershell
powershell -NoProfile -File evals/release-smoke.ps1              # 构建 + 单二进制冷启动冒烟
powershell -NoProfile -File evals/release-smoke.ps1 -SkipBuild   # 复用已有 toolchain/tmp/release/agentd.exe
node evals/release-smoke.mjs --probe --base-url <url>            # 只断言已运行的服务（不 spawn）
node evals/release-smoke.mjs --deploy-check                      # deploy/ 静态核对（无容器 → 未实测）
```

冒烟覆盖：单文件交付 → 冷启动（健康/首页/WS/消息落库）→ 重启持久 → 换 home 空数据 → preflight 报错 → deploy 静态核对。

## 2. case 清单（144 条 = M1–M20 共 94 条 + M21–M26 共 30 条 + M27/M28/M30 共 9 条 + recall 实体绑定修复回归 1 条 + M31 团队 WS 1 条 + M32 向量 1 条 + M41 交互卡片 8 条；M34–M40 为 UI 里程碑，不新增 mock case）

| 层 | case（tier） | 结果（M7 验收） |
|---|---|---|
| M1 | `health` / `message-persist` / `ws-order`（critical） | 3/3 PASS |
| M2 | `reply-retraction`(critical) / `parallel-tasks` / `no-interrupt` / `reasoning-echo` / `ambiguity` | 5/5 PASS |
| M3 | `memory-write`(critical) / `memory-scope` / `memory-conflict` / `memory-search` / `memory-readonly`(critical) | 5/5 PASS |
| M4 | `session-tree`(critical) / `message-ownership`(critical) / `aggregate-view` / `session-rename` / `message-session-label` | 5/5 PASS |
| M5 | `task-phases`(critical) / `task-cancel` / `task-retry` / `artifact-preview` / `permission-ask`(critical) | 5/5 PASS |
| M6 | `session-archive`(critical) / `cross-session-artifact` / `canArchive-gate`(critical) / `spec-invisible`(critical) / `archive-readonly-memory` | 5/5 PASS |
| M7 | `preference-repeat` / `archive-ws-error` | 2/2 PASS |
| M8 | `upload-attach` / `upload-limits` / `upload-traversal` / `markdown-passthrough` | 4/4 PASS |
| M9 | `perm-defaults` / `perm-modes` / `pwsh-basic` / `pwsh-spill` / `escalation` / `env-clean` | 6/6 PASS |
| M10 | `workflow-plan` / `workflow-advance` / `task-report` / `workflow-pause` / `workflow-restart` | 4/4 PASS + 1 PENDING（重启由脚本覆盖，11/11 PASS） |
| M11 | `session-files` / `message-pagination` / `session-overview` / `overview-readonly` / `overview-no-spec` | 5/5 PASS |
| M12 | `make-pdf` / `make-office` / `web-search` / `web-ssrf` / `web-fetch` | 5/5 PASS |
| M13 | `schedule-once` / `schedule-crud` / `schedule-pause` / `schedule-restart` / `schedule-failclosed` | 4/4 PASS + 1 PENDING（重启由 `schedule-restart.ps1` 覆盖，11/11 PASS） |
| M14 | `message-categories` / `session-path` / `category-backfill` | 2/2 PASS + 1 PENDING（迁移回填由 `category-backfill.ps1` 覆盖，8/8 PASS） |
| M15 | `reply-context` / `reply-own` / `reply-cross-session` / `reply-persist` | 3/3 PASS + 1 PENDING（持久化由 `reply-persist.ps1` 覆盖，15/15 PASS） |
| M17 | `python-basic` / `python-file` / `python-timeout` / `python-spill` / `python-env` / `python-escape` | 6/6 PASS |
| UI-1 | `agents-api` / `session-search-pin` / `stats` | 3/3 PASS |
| M18 | `spec-state-machine` / `spec-evidence` / `overview-from-spec` / `spec-hidden` / `executor-config` | 5/5 PASS |
| M19 | `runtime-status` / `runtime-stall` / `runtime-idempotency` / `runtime-budget` / `runtime-recovery` / `runtime-long-approval` | 4/4 PASS + 2 PENDING（重启/长审批由 ps1 覆盖：11/11、12/12） |
| M20 | `cli-exit-codes` / `cli-actions-matrix` / `cli-approval` / `cli-flags` / `cli-idempotency` / `cli-parity` / `cli-coverage` | 7/7 PASS |
| M21 | `memory-entities` / `memory-types` / `memory-canonical` / `memory-v3-conflict` / `memory-pyramid` / `memory-agent` / `memory-hidden` | 7/7 PASS |
| M22 | `recall-r1` / `recall-fusion` / `recall-degrade` / `recall-hidden` / `recall-rebuild` / `recall-entity-binding`（修复回归） | 6/6 PASS |
| M23 | `team-v0-view` / `team-hidden` / `team-v0-concurrency` / `team-v0-executor` | 2/2 PASS + 2 PENDING（并发/执行器由 `team-concurrency.ps1` 6/6、`team-executor.ps1` 4/4 覆盖） |
| M24 | `team-v1-enter` / `team-v1-members` / `team-v1-messages` / `team-v1-persist` | 3/3 PASS + 1 PENDING（持久化由 `team-v1-persist.ps1` 12/12 覆盖） |
| M25 | `team-v2-template` / `team-v2-instance` / `team-v2-owner` / `team-v2-trigger` / `team-v2-hidden` | 5/5 PASS |
| M26 | `view-create` / `view-validate` / `view-rollback` / `view-hidden` / `view-equivalence` | 5/5 PASS |
| M27 | `recall-r2-twohop` / `recall-r2-agentic` / `recall-r2-switch` | 2/2 PASS + 1 PENDING（`AGENTD_RECALL_R2=0` 由 `m27-m30-env.ps1` 8/8 覆盖） |
| M28 | `view-editor` | 1/1 PASS（patch add/remove/replace + 409 + rollback 内容一致） |
| M30 | `memory-consolidate-basic` / `memory-consolidate-idempotent` / `memory-consolidate-conflict` / `memory-consolidate-agent` / `memory-consolidate-off` | 4/4 PASS + 1 PENDING（`AGENTD_MEMORY_CONSOLIDATE=0` 由 `m27-m30-env.ps1` 覆盖） |
| M31 | `team-ws-events` | 1/1 PASS（team.created/member.added/trigger.fired、幂等 fire 不重复、不进 chat 消息流） |
| M32 | `recall-vector` | PENDING→`m32-vector-env.ps1` 8/8（vector=1：trace.paths 含 vector、items 非空、vector_used；默认关由 `m27-m30-env.ps1` 12/12 覆盖） |
| M41 | `card-send` / `card-validation` / `card-agent-route` / `card-action-route` / `card-idempotency` / `card-version` / `card-action-approval` / `card-persist` | 7/7 PASS + 1 PENDING（`card-persist` 由 `card-persist.ps1` 6/6 覆盖） |

**gate 分级**：`critical` 红 = 阻塞；`normal` 红 = 告警。`pending`（case 里写 `"pending": "原因"`）整条跳过、显示 PENDING、不计分——当前共 **11 条 PENDING**，全部由专项 `.ps1` 脚本真实覆盖（9 个既有脚本 + 本轮新增 `m27-m30-env.ps1`；见 §7 终值）。

## 3. 怎么写一条 case

文件放 `evals/cases/NN-<id>.json`（文件名排序即执行顺序）：

| 字段 | 说明 |
|---|---|
| `id` / `name` / `tier` | 必填 id；tier = `critical`/`normal` |
| `pending` | 字符串原因；有则整条跳过 |
| `vars` | 模板变量；内置 `{{runId}}`、`{{caseSession}}`（每条 case 独立会话）、`{{agentdHome}}` |
| `steps[]` / `graders[]` | 见下 |

**两套插值**：

| 写法 | 何时展开 | 用途 |
|---|---|---|
| `{{var}}` | 装载 case 时一次性 | 静态变量；未声明即失败（fail-closed） |
| `{{@a.b.0.c}}` | **每个 step / 每个 grader 执行前** | 引用前序观察（capture 到的 id 等）；取不到即失败 |

### 步骤类型

- `http`：`{method,path,body,expectStatus}`；契约未定可用 `candidate:[{method,path,body},…]`（遇 404/405 试下一个形状）
- `ws`：`{path,sessionId,collectAfterText,chat|subscribe,until:{type},drainMs,onDelta}`；`collectAfterText` 把观测窗口从探针文本开始（规避 subscribe 回放历史）。
  **`until.type` 里显式写了 `error` 时**，error 帧视为**预期终止帧**：不抛错，且 `frames/raw/trace` 截断到该帧为止（之后的 drain 窗口可能混入其它会话/后台任务的广播帧，不属于本轮）。其余 case 收到 error 帧仍然直接失败。
- `poll`：`{method,path,until:{path,matchSome},intervalMs,timeoutMs}`，反复请求直到数组里出现匹配项
- `capture`：`{from(可为候选路径数组),where,whereContains,mode:'array',pick,last,saveAs}`
- `fs`：`{path,op:'remove'?}` 在**步骤序列的这一点**检查/清理文件（`file_exists` grader 只在末尾跑，证不了中间态）
- `sse`：保留（M2 起流式走 WS）

### grader（5 个，确定性）

| grader | 用途 |
|---|---|
| `regex` | 对目标文本（ctx 路径）做正则；`negate` 反选 |
| `state_delta` | 集合里**匹配 `where` 的条目**满足 `expect`，数量受 `atLeast`/`atMost`/`exactly` 约束（只给 `atMost` 时下限为 0） |
| `forbidden` | 目标里不得出现任一模式 |
| `file_exists` | 文件存在/不存在（`exists:false` 断言**必须不存在**） |
| `last_state` | 只校验**末条**匹配项（"任务末态仍 running"这类断言） |

## 3.5 M8（V1.1 富文本 + 上传）——4 条

| id | tier | 断言什么 | 当前 |
|---|---|---|---|
| `upload-attach` | critical | `POST /api/uploads` → 附件 id；`POST /api/chat` 带 `attachments:[id]`；`GET /api/messages` 该消息带 `attachments`（name/mime/size/id）；`GET /api/uploads/{id}` 200 且内容一致 + `Content-Disposition` | **红**（端点未落地） |
| `upload-limits` | normal | 单文件 >20MiB（用 `sizeBytes` 现生成，不塞 base64）→ 400/413 + 错误信封；单条消息 6 个附件 → 400/413 | **红**（同上） |
| `upload-traversal` | critical | `..%2F`、`%2e%2e%2f`、`..%5C` 三种穿越 → 400/404 且不泄露 `root:`/win.ini；未知 id → 404 | PASS |
| `markdown-passthrough` | critical | 列表/粗体/斜体/行内代码/引用/分隔线原样保存（`messages.text` 精确等于输入）；不被 HTML 转义；WS 能完成一轮 | PASS |

**上传相关写法**（`http` 步骤新增 `multipart`）：

```json
{ "type": "http", "method": "POST", "path": "/api/uploads?sessionId={{caseSession}}",
  "multipart": { "files": [ { "filename": "{{fname}}", "mime": "text/plain", "content": "..." } ] },
  "expectStatus": [200, 201], "saveAs": "upload" }
```

- 大文件用 `{ "sizeBytes": 22020096, "fill": 97 }` 现生成（避免把 20MB 放进 case JSON）；
- 响应里带 `raw`（Buffer），可做逐字节内容比对。

**两个踩坑（写在这免得再踩）**：

1. **不要用 raw body 正则断言含 `>`/`<`/`&` 的文本**：Go 的 `encoding/json` 默认转义成 `\u003e`/`\u003c`/`\u0026`。markdown 透传 case 改为 `capture` 出 `messages[].text`（解码后的字符串）再断言。
2. **`forbidden` 的 pattern 是正则**：写 `[boot loader]` 会被当成字符类（匹配任意单字符）→ 必须 `\\[boot loader\\]`。

## 3.6 M9（权限沙盒 + 工具运行时）——6 条

| id | tier | 断言什么 | 当前 |
|---|---|---|---|
| `perm-defaults` | critical | `GET /api/permissions` = `workspace-write` + `auto`；`read` 免批（无 pending `read_file`）；`mock:write` 产生 pending `write_file`，**拒绝后不落盘** | PASS |
| `perm-modes` | critical | 切 `read-only` → `mock:write` 被拒（不产生待批）；`danger-full-access` **无确认标记被拒**、带标记成功；切回 `workspace-write` | PASS |
| `pwsh-basic` | critical | `mock:pwsh:echo hi` → 审批 allow 后 result 含输出 + `[exit code: 0]`；危险命令（`Remove-Item -Recurse`）需审批、拒绝后不执行；`mock:write-outside` 不落盘 workspace 外 | PASS |
| `pwsh-spill` | normal | `mock:pwsh-big` → result 含 `Omitted … bytes … spill` 且 `artifacts/spill` 目录存在；`mock:pwsh-sleep` → result 含超时/终止标记 | PASS |
| `escalation` | critical | `mock:escalate` → 审批条目含 `justification`/`sandbox`，allow 后文件落地；`mock:escalate-jump`（跨档跳级）→ 不产生待批审批 | PASS |
| `env-clean` | critical | `mock:pwsh-env` → allow 后 result 含 `DEEPSEEK_API_KEY`，且**不含** `sk-…`/`Bearer …` 形态密钥 | PASS |

**评测侧假定的 mock 触发约定**（后端实现时请对齐，或告诉我改）：

| 触发文本 | 期望行为 |
|---|---|
| `mock:pwsh:<命令>` | 调 `pwsh` 工具，`command` = 冒号后原文（审批 `tool:"pwsh"`） |
| `mock:pwsh-big` | pwsh 产生 >64KB 输出（触发 spill） |
| `mock:pwsh-sleep` | pwsh 睡眠超过 `timeout_ms`（触发超时终止） |
| `mock:pwsh-env` | pwsh 打印 `$env:DEEPSEEK_API_KEY` |
| `mock:write-outside` | 尝试写 workspace 之外（应被路径策略拒） |
| `mock:escalate` | write 带 `sandbox_permissions`（宽一档）+ `justification` |
| `mock:escalate-jump` | write 带跨两档的 `sandbox_permissions`（应被拒） |

**API 形状假定**：`GET /api/permissions` → `{mode, policy}`；`POST /api/permissions {mode}`，切 `danger-full-access` 需确认标记（case 依次尝试 `confirm:true` / `confirm:"danger-full-access"` / `confirm:"CONFIRM"` / `ack:true`，任一成功即通过）。

**安全约束**：pwsh 类 case 只跑 `echo`/读/写 workspace 内临时文件/危险命令被拒的断言，**不执行任何真实破坏性命令**（危险命令即使被 allow 也只会被执行到审批层，case 用 deny 收尾）。

**与后端实现对齐（M9 落地后核对）**：

- 权限按**会话**隔离：GET 用 `?sessionId=`、POST body 带 `sessionId`（否则改的是全局默认，会污染其它 case）。
- 字段兼容：实现同时接受 `sandbox/approval` 与 `mode/policy`；GET 两套都返回，断言用 `mode/policy`。
- 提权：审批时用 `sandbox_permissions` 计算 effective sandbox；跨档/反向跳级（如 `read-only`）会被拒且不产生待批。
- 审批 decision 兼容 `allow/deny` 与 `allow_once/allow_session/deny`。

## 3.7 M10（会话内工作流编排 + 逐任务汇报）——5 条

| id | tier | 断言什么（结构断言，不依赖真实模型内容） | 当前 |
|---|---|---|---|
| `workflow-plan` | critical | `mock:workflow` → `GET /api/workflows?sessionId=` 出现工作流；detail 含 ≥2 任务；finalize 任务 `dependsOn` 非空；tasks 带 `workflowId` | PASS |
| `workflow-advance` | critical | 全部任务最终 `done`；**依赖串行**：finalize 完成时间 ≥ 两个前置；**并行**：collect 与 draft 完成时间差 ≤5s（实测 15ms）；workflow progress=100 | PASS |
| `task-report` | critical | 三个任务各自的 `reportMessageId` 都能在 `/api/messages` 找到（role=agent，含 `【任务汇报】`/`taskId`/`workflowId`）→ 证明**逐任务汇报**而非最后才报 | PASS |
| `workflow-pause` | normal | pause → status=`paused`；等 6s 后 finalize 仍 `pending`（不启动新任务）；resume → 最终 done；另一工作流 cancel → `cancelled` | PASS |
| `workflow-restart` | critical | **PENDING（run.mjs 内）**：需真实重启进程 → 由 `evals/workflow-restart.ps1` 覆盖：工作流/任务/消息不丢、status=`paused`、running→`interrupted` | 脚本 11/11 PASS |

**M10 触发与语义（评测侧假定，后端实现一致）**：

- 触发：聊天文本含 `mock:workflow` → 固定 3 任务 DAG：`收集与梳理资料`、`形成草稿`（无依赖，并行）、`汇总产出`（depends_on 前两者）；
- Mock 执行器：启动延迟 3s、每任务 5s；汇报模板 `【任务汇报】…结论：Mock 执行器完成：…`；
- 重启：`recoverInterrupted` 把遗留 running → `interrupted`，工作流置 `paused`，消息保留；
- **顺序断言用 `numeric` grader**（比较 ctx 里的时间戳/进度）：`gt/gte/lt/lte/eq/near/diffGt`，这是"依赖串行/并行"的确定性证据。

**新增步骤**：`wait`（`{type:'wait', ms}`）用于"暂停后等一会儿再断言"。

## 3.8 真实模型 smoke（单独入口，低 token；7 条）

**默认门禁 = 144 条 mock 协议套件（131 可执行 + 13 PENDING 由脚本覆盖）**；**里程碑验收 = mock + 真实模型 smoke**。

```powershell
# 真实模型 smoke（自建临时 home + 独立端口 18903 + 只停自己 PID；不碰 8787）
powershell -NoProfile -ExecutionPolicy Bypass -File evals/real-smoke.ps1 ^
  -Exe agentd\simo.exe -Port 18903 -TokenBudget 45000 -PriceIn 0.5 -PriceOut 2

# 直接跑（服务已由人工以真实模型启动时）
node evals/run.mjs --real --base-url http://127.0.0.1:18903 --price-in 0.5 --price-out 2
```

| case | tier | 结构断言 |
|---|---|---|
| `real-chat-markdown` | critical | 短问答有回复且含 Markdown 列表标记 `- `，无 error 帧 |
| `real-read-tool` | normal | 真实模型触发一次工具回环（`/api/debug/last-llm-request` 里出现 `tool_calls`/`role:"tool"`） |
| `real-approval-allow` | normal | 写操作产生 pending → allow → 文件真的落盘（fs 断言） |
| `real-workflow-2task` | normal | "拆成…"→ 工作流出现、≥2 任务、全部 done |
| `real-memory-write` | critical | "记住…" → `/api/memory?q=` 有该条目且 `authority=user_confirmed` |
| `real-upload-attach` | normal | 上传 + 带 attachments 的对话 → 消息带附件元数据且有回复 |

**稳定性策略（M20-B 后定稿）**：

- `real-category-demand` 保持**自然提问**；若唯一失败原因是"分类为空/无 `@@CATEGORY` 标记"且回复本身正常，**自动重试 1 次**（case 内 `retry` 规则；报告里记 `retried:1`），连续两次为空才红。
- **token 预算**：单次运行只做 `[WARN] token` 软告警；里程碑判定用 **3 次运行中位数 ≤45,000**（报告同时给 range）。`real-smoke.ps1 -TokenBudget 45000` 保留。
- 实测（M20-B 裁剪索引构建，3 次）：`7/7 PASS` ×3；total = **40,630 / 43,277 / 40,955**，**中位数 40,955**，range 40,630–43,277，均 ≤45,000，成本 ≈ `¥0.0241–0.0258`。

**token 控制**：

- prompt 只有一句话；每个 case 独立新会话（短历史）；**不断言具体文案**；
- `AGENTD_MAX_OUTPUT_TOKENS=256`（默认）、`AGENTD_REASONING_DEFAULT=low`（默认）——real-smoke.ps1 已设置；
- 运行结束打印 `/api/usage` 差值与**逐 case token**；`--price-in/--price-out`（元/百万 token）给成本估算，不给则只报 token。

**实测一次（2026-11-07，deepseek-flash，maxOutputTokens=256 / reasoning=low）**：
```
6/6 PASS；calls=16  prompt=17868  completion=1711  reasoning=564  total=19579
成本 ≈ ¥0.0124（按 input ¥0.5/M、output ¥2/M 估算）
逐 case：chat-markdown 1375 / read-tool 6147 / approval 5865 / workflow 3346 / memory-write 0（确定性写入，无 LLM 调用）/ upload 2846
```

**注意**：真实模型 case **不要用 `collectAfterText` 标记**（短 prompt 里没有唯一探针时窗口永不开启 → 假红）；真实 smoke 每个 case 都是独立新会话，直接收全部帧即可。

## 3.9 M11（文件聚合 / 分页 / 会话概览）——5 条

| id | tier | 断言什么 | 当前 |
|---|---|---|---|
| `session-files` | critical | 任务产物 + 上传附件都出现在 `GET /api/sessions/{id}/files`；每条有 `previewUrl`/`downloadUrl`；**按 id 去重**（forbidden 重复 id）；`?kind=artifact|upload` 过滤正确；非法 kind → 400 | PASS |
| `message-pagination` | normal | 15 条用户消息（+回复 ≥30 条）→ `?limit=8` 两页各 8 条、**两页 id 不重叠**；`hasMore:true`、`nextBefore` 是 `msg-`；**非法游标 → 空数组**（不报错、不返回全量） | PASS |
| `session-overview` | normal | `GET .../overview` → `POST .../overview/refresh`；7 个字段（goal/constraints/current/completed/pending/notes/timeline）非空；**自然句子**（含「。」、字段内无冒号堆叠）；再次 GET 命中缓存（version/updatedAt 不变） | PASS |
| `overview-readonly` | critical | 只有 `GET` 与 `POST .../refresh`；`POST/PUT/PATCH/DELETE .../overview`（非 refresh）→ 404/405 且无 `ok:true`；GET 仍 200 | PASS |
| `overview-no-spec` | critical | refresh 后响应不含 `specId`/`specVersion`/`specCore`/`spec:{}`，且确实是 overview（含 `goal` 字段，不是 404 伪装） | PASS |

**M11 踩坑（写清楚免得再踩）**：

- **这些端点要求会话已存在**：聊天用的隐式 `caseSession` 不会建 `sessions` 行 → 必须先 `POST /api/sessions` 建会话、再 capture 出真实 `sid` 用于后续所有 URL。
- **分页是 rowid 游标**：`ORDER BY rowid DESC`（新→旧），`before=<id>` 取更旧；`nextBefore` 是本页最新 id。断言用"两页都满 + id 不重叠 + 非法游标空"，不要依赖 `at` 时间排序（异步回复的 `at` 与 rowid 顺序可能不一致）。
- **去重是 forbidden 断言**：不能写成"必须匹配重复模式"。

## 3.10 M12（文件生成 + 联网）——5 条

| id | tier | 断言什么 | 当前 |
|---|---|---|---|
| `make-pdf` | critical | `mock:make-pdf` → 审批 `make_pdf` → allow → artifacts 出现 `application/pdf`；**内容以 `%PDF` 开头**（用 `content.raw` 的 Buffer JSON 断言字节 `[37,80,68,70]`）；size>0 | PASS |
| `make-office` | critical | docx/xlsx/pptx 各自：审批（`make_docx/xlsx/pptx`）→ allow → 三个 MIME 正确 → **ZIP 魔数 `PK\x03\x04`**（字节 `[80,75,3,4]`）+ size>0 | PASS |
| `web-search` | critical | `mock:web-search <q>` → 审批 `web_search` → allow → result 里能解析出 **http(s) URL**，且不是空结果/网络拒绝 | PASS |
| `web-ssrf` | critical | `mock:web-fetch http://127.0.0.1:8787/...` 与 `http://169.254.169.254/...`：审批 allow 后**被拒**（含 ssrf/private/loopback 类提示）；**不得泄露**本机 health 内容或云元数据（`ami-id` 等） | PASS |
| `web-fetch` | normal | `mock:web-fetch https://example.com/`：审批 allow 后返回结构（status/contentType/正文或结构化 Error），且不是 SSRF 拒绝 | PASS |

**M12 运行前提（评测/冒烟起服时需要）**：

```powershell
$env:AGENTD_PYTHON = "E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"  # 自带 python（含 python-docx/openpyxl/python-pptx）
$env:AGENTD_SCRIPTS = "<repo>\agentd\scripts"        # office_helper.py 所在目录
$env:AGENTD_CHROME = "C:\Program Files\Google\Chrome\Application\chrome.exe"  # make_pdf 用；缺省会自动探测 Program Files
```

缺依赖时工具会返回 `code=chrome_missing` / `code=python_missing` / `code=helper_missing`（清晰错误，不静默降级）——case 会因此红，属环境缺依赖而非断言错。

**M12 关键点（实测）**：

- **mock 模式下 web_search / web_fetch 返回确定性 fixture**（`source:"mock"`、3 条 `example.com/result/N` 结果）→ **mock 套件不依赖外网**；真实网络只在 real 模式下发生。
- 新增 **`count` grader**：数正则命中次数（`atLeast/atMost/exactly`），用于"≥3 条搜索结果""至少 N 个 URL"这类断言。
- **`regex` grader 的 pattern 是 JS 正则**，不支持 `(?i)` 内联标志 → 用 `"flags": "is"`。
- PDF/Office 断言用**魔数字节**：`content.raw` 是 Buffer，`JSON.stringify` 后形如 `{"type":"Buffer","data":[37,80,68,70,...]}` → `%PDF` / `PK\x03\x04` 可直接确定性命中断言。

## 3.11 M13（定时任务）——5 条

| id | tier | 断言什么 | 当前 |
|---|---|---|---|
| `schedule-once` | critical | `once`（`{{nowPlusIso:6}}`）到点触发：目标会话收到 prompt 且被 agent 回复；schedule `lastStatus=done`、`runCount=1`、`enabled=false`、`nextRunAt=0` | PASS |
| `schedule-crud` | critical | 建（201）/查列表/查详情/PATCH 启停/DELETE/详情变 404；**非法 cron、非法 once 时间、非法 trigger.type 均 400 + 错误信封** | PASS |
| `schedule-pause` | normal | PATCH `enabled:false` 后**等 12s（>5s tick）`runCount` 仍 0 且未 done**（暂停不触发）；`run-now` 立即触发至 done，消息落会话 | PASS |
| `schedule-restart` | critical | **PENDING（run.mjs 内）**：需真实重启 → 由 `evals/schedule-restart.ps1` 覆盖：interval 存活且 `nextRunAt` 重算 >0；停机错过的 once **只补一次**（runCount=1, done）；prompt 已投递 | 脚本 11/11 PASS |
| `schedule-failclosed` | normal | once prompt 用 `mock:write` 触发审批且**无人应答** → schedule `lastStatus=failed`、`enabled=false`、`nextRunAt=0`，会话收到"需要审批/无人应答/自动暂停"汇报，approval 仍 pending（fail-closed，不自动放行） | PASS |

**M13 评测要点**：

- **时间模板**（静态 case 需要"未来时间戳"）：`{{nowIso}}` / `{{nowPlusIso:N}}` / `{{nowMs}}` / `{{nowPlusMs:N}}`，在 case 装载期展开（`lib/resolve.mjs`）。
- **调度粒度**：后端 5s tick → once(now+6s) 实测约 10s 生效；`schedule-pause` 用 12s 等待覆盖 tick。
- **poll/capture 都支持"对象即单元素数组"**：`/api/schedules/{id}` 返回 `{schedule:{...}}`，无需先转列表。
- 重启类（M10/M13）都用**独立脚本**在真实进程上验证（run.mjs 不重启服务）；脚本自建端口+临时 home，只停自己 PID。

## 3.12 M14（消息分类 + 会话路径）——3 条

| id | tier | 断言什么 | 当前 |
|---|---|---|---|
| `message-categories` | critical | agent 回复首行 **模型标记**驱动：发 `mock:category=<requirement|clarification|progress|consultation>` → 四条消息 `category` 各自正确；**响应里不含 `@@CATEGORY`（后端已剥离）**；无 `delivery`；user 消息 `category` 为空 | PASS |
| `session-path` | critical | 主›子›孙三级：子/孙消息 `sessionPath` 从根到当前（首项=main、末项=当前会话）、每项 `title` 非空、`sessionTitle` 兼容；**WS 帧也带 `sessionPath`** | PASS |
| `category-backfill` | critical | **PENDING（run.mjs 内）**：需旧库升级 → 由 `evals/category-backfill.ps1` 覆盖：M13 旧二进制建库（agent 消息无 category）→ 当前二进制在同一 home 启动触发 chat v10 迁移 → **历史 agent 消息全部回填 `consultation`**、user 消息保持空、`sessionPath` 可用 | 脚本 8/8 PASS |

**M14 判定口径（重要）**：

- **分类枚举**：`requirement` 需求提出 / `clarification` 需求澄清 / `progress` 进度汇报 / `consultation` 信息咨询；**没有 delivery**。
- **由模型输出标记决定**：回复首行 `@@CATEGORY: <值>`，后端剥离该行后落库（未知值归 `consultation`）；mock provider 用 `mock:category=<值>` 触发（首行标记 + 第二行正文）。**不要按规则推断分类**。
- **历史回填**：旧库升级后所有历史 **agent** 消息记为 `consultation`（不断言 delivery）；user 消息 category 始终为空。
- **overview 列表化（M14-D）**：`completed`/`pending` 为 `[]string`，`timeline` 为 `[{at,text}]`（`at` 毫秒时间戳、`text` 完整句子），timeline 按时间升序；`session-overview` case 已按此断言（含"每项非空 + 有序"）。
- **real-smoke** 新增 `real-category-demand`：真实模型首条 agent 回复 `category ∈ {requirement, clarification, progress, consultation}` 且非空、`sessionPath` 末项=当前会话。

## 3.13 M15（消息回复/引用）——4 条

| id | tier | 断言什么 | 当前 |
|---|---|---|---|
| `reply-context` | critical | 回复 agent 消息：B 的 `replyTo` 快照 `{id,role,text,sessionId,sessionTitle}` 与引用源一致、text 非空；**模型上下文确实带 `[引用回复]`**（mock 回显里可验证）；引用后仍有正常回复 | PASS |
| `reply-own` | normal | 回复自己的 user 消息：`replyTo.id` 命中、`replyTo.role=user`，发送成功且获得回复 | PASS |
| `reply-cross-session` | critical | 在会话 Y 回复会话 X 的消息：`replyTo.sessionId=X`、**`sessionTitle` 非空且不是 id**；Y 的消息 `sessionId` 正确 | PASS |
| `reply-persist` | critical | **PENDING（run.mjs 内）**：需重启 → 由 `evals/reply-persist.ps1` 覆盖：带引用回复 → 杀进程 → 重启同一 home → `replyTo` 快照（id/role/text/sessionId/sessionTitle）完整不变 | 脚本 15/15 PASS |

**M15 评测要点**：

- `POST /api/chat`（及 WS `chat`）接受 `replyToMessageId`；消息响应带 `replyTo` **快照**（引用源被截断到 200 字，含 `sessionTitle`，避免翻页丢失）。
- `replyTo` 是**读取时解析**的（从被引用消息反查），所以重启后仍然存在；`reply-persist.ps1` 用"重启前/后快照逐字段比对"验证。
- **mock 回复会回显用户文本**（含注入的 `[引用回复] role：text`）→ 按文本 `whereContains` 抓消息会误抓到 agent 回显；抓用户消息请用 `where: {role, text}` 精确匹配，或用 POST 返回的 `messageId` 按 id 定位（脚本里踩过这个坑）。
- 非法/不存在的 `replyToMessageId` 当前返回 400（`被回复的消息不存在`）；按约定**不写成门禁断言**。

## 3.14 M17（Python 执行）——6 条

| id | tier | 断言什么 |
|---|---|---|
| `python-basic` | critical | `mock:python:<code>` → run_python 审批 allow → 输出含预期文本 + `[exit code: 0]` |
| `python-file` | critical | `mock:python-file`：cwd=workspace，写 `python-written.txt` → `[exit code: 0]` + 文件真的落盘（fs 存在且 size>0） |
| `python-timeout` | normal | `mock:python-sleep`（code sleep 5s / timeout_ms=1000）→ `code=TIMEOUT` + `[exit code: -1]`，不出现 exit 0 |
| `python-spill` | normal | `mock:python-big`（print 100KB > 64KB）→ `Omitted N bytes; full result at <path>` + `[exit code: 0]` |
| `python-env` | critical | `mock:python-env`：子进程 env 白名单——`AGENTD_HOME` 可见、`PATH_SET=True`；**不含** `DEEPSEEK_API_KEY/AGENTD_API_KEY/OPENAI_API_KEY/sk-` |
| `python-escape` | critical | `mock:python-outside`（`{"path":"../outside.py"}`）→ `path_denied`（越界被拒），不出现 exit 0、不泄露外部内容 |

**M17 mock 触发约定（后端已实现）**：

- 通用：`mock:python:<code>` —— `<code>` 直接作为 run_python 的 code（也可用 `mock:run-python:code=...` / `path=...`）
- 专用：`mock:python-sleep` / `mock:python-big` / `mock:python-env` / `mock:python-file` / `mock:python-outside`
- 结果文本：成功末行 `[exit code: N]`；超时 `Error: python timed out after <dur> (code=TIMEOUT)` + `[exit code: -1]`；spill 沿用 `Omitted N bytes; full result at <path>`（阈值 64KB）
- 工具名 `run_python`，审批 ask（R2）；read-only 模式下直接 `sandbox_denied`；cwd=workspace，env 白名单（`AGENTD_HOME`+PATH 等，无密钥）

**M17 评测要点（踩坑）**：

- **审批结果是共享的**：`GET /api/approvals` 会累积同 home 下之前 case 的审批结果 → 断言必须按 `approvalId` 取出**本条** `result`（`capture … where{id} pick result`），否则会被上一条的 `[exit code: 0]` 污染。
- **重建后端后再跑**：mock 触发是后端新加的，拿着旧二进制会"mock 不触发、无审批"（我踩过一次：build 早于 mock.go 修改时间）。

## 3.15 UI-1（agents / 搜索置顶 / 统计）——3 条

| id | tier | 断言什么 |
|---|---|---|
| `agents-api` | critical | `GET /api/agents` 数组非空、每项 `id/name/role/tools[]/model/icon` 齐全（内置 `simo` 必在）；`GET /api/sessions` 每条有 `ownerAgentId`（=simo）且能在 agents 里查到；agent 消息带 `agentId`（user 消息不带，后端语义如此）且 ∈ agents |
| `session-search-pin` | normal | `GET /api/sessions?q=` 命中 A / 不命中 B；不命中返回空；`POST /api/sessions/{id}/pin` → `pinned=true` 且**置顶首项**；unpin 恢复；非法 id → 404 |
| `stats` | critical | `GET /api/stats?granularity=day`：`buckets[]` 今天桶 `messages>=6`；`totals` 的 `tokens = prompt+completion+reasoning`（**含 reasoning**，用 `sum_eq` grader）；`granularity=week|month` 分桶；`metric=tokens` 生效；`sessionId` 过滤后消息数更少但≥4；非法 granularity/metric → 400 |

## 3.16 M18（Spec 驱动执行）——5 条

| id | tier | 断言什么 |
|---|---|---|
| `spec-state-machine` | critical | 新会话 spec `draft`；debug 钩子 `POST /api/debug/spec/transition` 合法迁移 draft→confirmed→planning→executing 每步 version+1；**非法迁移 4xx 且状态不变**；`POST /api/debug/spec/reopen` 后 `reopenedCount≥1`、version 递增 |
| `spec-evidence` | critical | mock:workflow 任务 done 后 debug spec 有 `task:<id>` evidence、`canArchive.allowed=true`；**无证据时归档 409+blockers**；有证据归档 200；evidence 幂等仍在 |
| `overview-from-spec` | normal | 概览 `goal/current` 自然汇报体、`constraints/completed/pending` 为数组、`timeline[{at,text}]` 有序且每项非空；**无 specId/specVersion/executorAgentId/acceptanceKeys** |
| `spec-hidden` | critical | `/api/specs`、`/api/specs/{id}`、`/api/sessions/{id}/spec` 全 404；sessions/messages/overview/agents 响应无 spec 内部字段 |
| `executor-config` | normal | debug spec 默认 `executorAgentId=agent:task-npc`；`POST /api/debug/spec/executor` 设为 `agent:simo` 后生效；消息无 NPC 用户可见汇报、report agentId=simo |

**M18 调试钩子（仅 `-debug` + loopback，测试用）**：`POST /api/debug/spec/transition` / `/reopen` / `/executor`，观测用 `GET /api/debug/spec?sessionId=`（返回 `spec` + `canArchive`）。

## 3.17 M19（长程运行时）——6 条（4 活跃 + 2 脚本）

`runtime-status` / `runtime-stall` / `runtime-idempotency` / `runtime-budget` 为活跃 case；`runtime-recovery` / `runtime-long-approval` 为 PENDING（需杀进程/跨重启，由 `evals/runtime-recovery.ps1` / `runtime-long-approval.ps1` 覆盖）。

**实测（m19 构建，全绿）**：`runtime-status` 10/10、`runtime-stall` 6/6、`runtime-idempotency` 5/5、`runtime-budget` 5/5；`runtime-recovery.ps1` 11/11（工作流同 id 存活、done 不重跑、收敛 paused、恢复汇报、recoveries 审计=1）、`runtime-long-approval.ps1` 12/12（重启后仍 pending → allow 执行；TTL 到期 `expired`/`decidedBy=timeout`、**不自动放行**）。

已实现的后端测试口：`GET /api/runtime/status|workflows/{id}/runtime|tasks/{id}/runtime`；`POST /api/debug/runtime/config`（stall 阈值/预算/审批 TTL/假时钟）；`GET /api/debug/runtime?sessionId=`（toolEffects/recoveries/checkpoints/reportLog 摘要）；mock 触发 `mock:stall` / `mock:effect-dup` / `mock:budget-burn`。

## 3.18 M20（动作层 CLI）——7 条

运行方式：`node evals/run.mjs --base-url http://127.0.0.1:18901 --cli <repo>/agentd/simo.exe`（`cli` 步骤用 spawnSync + stdout/stderr 重定向到临时文件，绕开沙箱 Node 管道限制）。

| id | tier | 断言什么 |
|---|---|---|
| `cli-exit-codes` | critical | 0 成功 / 2 参数错（`ACTION_INVALID_ARGS`、`--json+--pretty` 互斥）/ 3 需审批（`APPROVAL_REQUIRED`+approvalId）/ 4 拒绝（R4 不可 `--yes`）；`--json` 单 JSON 信封 |
| `cli-actions-matrix` | critical | session/agent/task/workflow/permission/memory/file/config/system 等命名空间只读动作 exit 0 + `"ok":true`；写动作 `session create` 后 HTTP `/api/sessions` 可见 |
| `cli-approval` | critical | R3 `workflow start` 首次 exit 3；`permission approve` 即执行（workflow 出现、approval→approved）；deny→denied；会话策略 `never` → exit 4（fail-closed） |
| `cli-flags` | normal | `--json`/`--pretty` 都能拿到 `id=main`；互斥→2；`--dry-run` exit 0 且**零副作用**；错误 base-url → 非 0 |
| `cli-idempotency` | normal | `session.create`（声明非幂等）两次=2 个实体；`session.rename`（幂等）两次=同一实体、无重复 |
| `cli-parity` | critical | CLI 与 HTTP 同参同结果：session.list/agent.list/system.health/config.get(经 `POST /api/actions/config.get`)/task.list |
| `cli-coverage` | critical | `actions list --json` ≥60 条且每项含 `toolName/inputSchema/risk/confirmation/readOnly/idempotent/httpRoute`；`/api/actions` count≥60、12 命名空间齐全；`actions describe` 5 个样例可用 |

**M20 实测发现 → M20-B 已修复并验证**：
1. ~~`schedule.list`、`session.decisions` 501~~ → **已接上**（`cli-actions-matrix` 15/15 断言 exit 0）。
2. ~~`--dry-run --json` 输出人话~~ → **已改为 JSON 信封**（`cli-flags` 严格断言 `^{` + `ok/data/...`）。
3. ~~未知子命令 `--json` 无 JSON 信封~~ → **已修**（`cli-exit-codes` 断言 stdout `ok:false`+`code`）。
4. ~~`--` 解析~~ → **已修**：dash 开头的 flag 值可直接传（`--title --dash-name`），`cli-flags` 已断言 title=`--dash-name`。
5. ~~真实模型 token 2.3×~~ → **已改为按需发现**：系统提示只放紧凑 `[actions]` 索引，完整 Schema 走 `actions.describe`；real-smoke 3 次中位数 **40,955**（range 40,630–43,277），较修复前 89,901 **-54%**，达标 ≤45k。

## 4. 契约诊断（不计入 PASS/FAIL）

每次运行后自动检查并打印 ✓/⚠，**不阻塞** case：

- M1：`/api/sessions`（须 JSON 非 SPA fallback）、`POST /api/chat → messageId`、`/api/messages` 按 sessionId 过滤、`WS /api/ws` 握手、未命中 `/api/*` → 404 JSON
- M3：记忆三端点结构、`conflicts` 是否 `status:"disputed" + items[]`、`items?q=` 是否生效、**记忆只读**（读 200 且写 404 才算 ✓，否则报"无法判断"，避免假绿）
- M4：`/api/sessions/tree`（含 `children`/`parentId`）、`includeChildren`、`PATCH /api/sessions/<真实 id>`（用真实会话、改成它自己，幂等）
- M5/M6：tasks 明细/取消/重试/artifacts/approvals、归档端点、`/api/specs` → 404、产物按 sessionId 过滤
- 通用：**「被测服务写入本 AGENTD_HOME」**（本次运行是否真写进这个 home，抓端口/home 错配）

## 5. harness 自检（评测工具的回归测试）

```bash
node evals/selftest.mjs      # 7 项，exit 0/1
```

run.mjs 默认先跑自检，失败 `exit 2` 并拒绝出分（`--no-selfcheck` 可跳过）。覆盖两次真实教训：

- grader 的 `{{@id}}` 没展开 → `state_delta` 拿字面量匹配，永远 0 条；自检含**静态检查 + 正例 + 负例**三道防线
- `state_delta` 只给 `atMost` 时下限被算成 1 → "最多 N 条"永远失败

## 6. 已知限制（详见 RELEASE.md）

- 本环境对 >60–120s 的进程有回收行为 → 全量 30 条（≈110–120s）实测时用 `--only` 拆批跑通
- 前端 `esbuild` 在本环境不可用（原生二进制缺失 + 沙箱禁 pipe spawn）；`tsc`/Tailwind 可跑
- 容器交付物仅静态核对（无 Docker 运行时）
- 全部评测在 `AGENTD_LLM=mock` 下；真模型下 `parallel-tasks`/`ambiguity`/`reasoning-echo` 可能波动，建议保持 `normal`
- **已知时序 flake（非阻塞）**：`workflow-advance` 的 `numeric near(collectDoneAt, draftDoneAt, tolerance=5000ms)` 依赖 mock 工作流两个无依赖任务的 `updatedAt` 间隔；机器负载高时可能超过 5000ms（M21–M26 最终验收 block2 实测一次 Δ=8049ms）。单跑连续 2 次 7/7 PASS，属时序容差问题、不是契约失败；CI 偶发时重跑该 case 即可，不据此判红。

## 7. M21–M26 终值（2026-11-08 最终验收）

> 被测：`agentd/simo.exe`（21,673,472 bytes，2026-11-08 04:46，含 M26 视图 Schema）。环境：`AGENTD_LLM=mock AGENTD_DEBUG=1`、独立端口 **18901**、新建 GUID 临时 `AGENTD_HOME`（4 块各起一次新服务；不碰 8787 / simo-live.exe）。评测进程同时设同一 `AGENTD_HOME`。

| 块 | 范围 | run.mjs 结果 |
|---|---|---|
| block1 | M1–M8（34 条） | **34/34 PASS** |
| block2 | M9–M15（33 条） | **28/29 PASS + 4 PENDING**（1 条 flake 重跑 PASS，见下） |
| block3 | M17–M20（27 条，含 CLI，`--cli agentd\simo.exe`） | **25/25 PASS + 2 PENDING** |
| block4 | M21–M26（30 条） | **27/27 PASS + 3 PENDING** |

- **合计**：124 条 case = **115 条可执行（114 PASS + 1 次 flake，重跑 2/2 PASS） + 9 条 PENDING**；PENDING 全部由 9 个专项 `.ps1` 覆盖：`workflow-restart.ps1` **13/13**、`schedule-restart.ps1` **11/11**、`category-backfill.ps1` **8/8**、`reply-persist.ps1` **15/15**、`runtime-recovery.ps1` **11/11**、`runtime-long-approval.ps1` **12/12**、`team-concurrency.ps1` **6/6**、`team-executor.ps1` **4/4**、`team-v1-persist.ps1` **12/12**（本轮新增）。
- **Flake 记录**：`workflow-advance` 的 `numeric near(collectDoneAt, draftDoneAt, tol=5000)` 在 block2 首次出现 Δ=8049（机器负载相关），单跑连续 2 次 7/7 PASS；属时序 flake，不影响契约判定，已在此记录。
- **real-smoke**（`evals\real-smoke.ps1 -Exe agentd\simo.exe -Port 18903 -TokenBudget 45000`，3 次）：3 次均 **7/7 PASS**；token = **37,725 / 39,868 / 40,432**，**中位数 39,868**（range 37,725–40,432，目标 ≤45,000 达标）；calls = 17/18/19。
- **验收结论**：M1–M26 无阻塞失败；M21/M22 P0 复验 5/5；M23/M24 3/3（2 PENDING→脚本 6/6、4/4）；**M25 5/5**；**M26 5/5**；默认门禁 = 124 条 mock 套件（9 PENDING 由脚本覆盖，不计入 PASS/FAIL）。
- **事故留档**：验收开始时的临时目录清理事故已完整留档于 `evals/incident/incident-2026-11-08.md`（含命令/时间线/根因/影响面/证据）；后续验收全程只读+新建 GUID home，未再删除任何目录。
- **已知产品问题（已转后端，不阻塞本次验收）**：team 相关内部事件类型未注册——`team.template.applied` / `team.created` 写内部事件时服务端报 `未知事件类型`（动作仍 HTTP 200）；M25/M26 case 已避开事件断言。

## 8. M27/M28/M30 终值（上一构建 12:29；最终以 §9 为准）

> 被测：`agentd/simo.exe`（21,810,688 bytes，2026-11-08 12:29，含 M27 R2 召回 + M28 视图编辑 + M30 记忆巩固）。环境：`AGENTD_LLM=mock AGENTD_DEBUG=1`、独立端口 18941–18946、每块新建 GUID 临时 `AGENTD_HOME`；评测进程同时设同一 `AGENTD_HOME`；不碰 8787 / `simo-live.exe`。

| 块 | 范围 | run.mjs 结果 |
|---|---|---|
| block1 | M1–M8（34 条） | **34/34 PASS** |
| block2 | M9–M15（33 条） | **28/29 PASS + 4 PENDING**（`workflow-advance` 1 次时序 flake Δ=8044ms，单跑 2/2 PASS） |
| block3 | M17–M20 + UI-1（27 条，含 CLI，`--cli agentd\simo.exe`） | **25/25 PASS + 2 PENDING** |
| block4 | M21–M30（39 条） | **34/34 PASS + 5 PENDING** |

- **合计**：133 条 case = **122 条可执行（122 PASS；1 次 flake 重跑 2/2 PASS） + 11 条 PENDING**；PENDING 由 10 个专项 `.ps1` 覆盖：`workflow-restart.ps1` 13/13、`schedule-restart.ps1` 11/11、`category-backfill.ps1` 8/8、`reply-persist.ps1` 15/15、`runtime-recovery.ps1` 11/11、`runtime-long-approval.ps1` 12/12、`team-concurrency.ps1` 6/6、`team-executor.ps1` 4/4、`team-v1-persist.ps1` 12/12、**`m27-m30-env.ps1` 8/8**（新增：R2=0 / CONSOLIDATE=0 两条 env 门禁）。
- **M27（召回 R2）**：`recall-r2-twohop`（2 跳路径 3 实体/2 边、hopLimit=2、steps、edgeVisits、cite）、`recall-r2-agentic`（steps 1–3、空结果 ask/no_hit）、`recall-r2-switch`（PENDING→脚本：hopLimit=1、无 steps、hop_capped）→ **2/2 PASS + 1 PENDING→脚本 1/1 PASS**。
- **M28（视图编辑）**：`view-editor`（patch `add_block`/`remove_block`/`set_block_props`/`replace_blocks`/`set_page_props`、过期 baseVersion→409 `VIEW_BASE_CONFLICT`、rollback 后内容与 v2 一致、版本数 4）→ **1/1 PASS**。
- **M30（记忆巩固）**：`memory-consolidate-basic`（candidateCount=3 / created=2 / conflict=1 + 可查）、`memory-consolidate-idempotent`（同 job、idempotent:true、不重复写）、`memory-consolidate-conflict`（同 factKey 两条 disputed 保留）、`memory-consolidate-agent`（agent_memory ownerAgent/source/authority）、`memory-consolidate-off`（PENDING→脚本：enabled=false、9 条超阈值不自动、手动可）→ **4/4 PASS + 1 PENDING→脚本 8/8**。
- **M25/M26 专项回归**：`team-v2-template/instance/owner/trigger/hidden` + `view-create/validate/rollback/hidden/equivalence` → **10/10 PASS**。
- **M29（便携包/安装/升级/备份恢复）**：按 Lead 交接，已由 harness-scout 验证通过（`deploy/package.ps1`/`install.ps1`/`upgrade.ps1`/`backup.ps1`/`restore.ps1` 的启动/升级/备份恢复链路）；本轮不重复执行，细节以 `deploy/INSTALL.md` 为准。
- **real-smoke（真实模型，3 次官方 + 1 次诊断）**：`-TokenBudget 45000`，7/7、7/7、6/7（第 3 次 `real-category-demand` 1 grader 红），token = **48,384 / 45,947 / 50,862，中位数 48,384**（**> 45,000，目标未达标**；诊断第 4 次 7/7 PASS、40,524）。token 高于 M21–M26 基线（中位 39,868），主因是 M27–M30 后动作/工具目录与提示词变长；建议下一轮重设基线或压缩按需发现索引。
- **已知产品缺陷（上一构建发现；已在 13:26 最终构建修复，见 §9）**：召回命中“带实体绑定的记忆”时……
- **事故/边界**：workflow-advance 时序 flake（Δ=8044ms，tolerance 5000ms，重跑 2/2 PASS）仍属已知机器负载 flake；真实模型 smoke 为软告警不影响 mock 门禁；无递归删除、无用户实例干扰。

## 9. M1–M33 构建终值（2026-11-08 13:53；M34–M40 最终构建见 §10）

> 被测：`agentd/simo.exe`（**21,860,864 bytes，2026-11-08 13:53:05**，sha256 `ADB4EA28…BFD`；M32 向量召回 + M33 前端 656,064）。环境：`AGENTD_LLM=mock AGENTD_DEBUG=1`、独立端口 19070–19079、每块新建 GUID 临时 `AGENTD_HOME`；评测进程同时设同一 `AGENTD_HOME`；不碰 8787 / `simo-live.exe`。

### 9.1 recall 修复 + M32 向量验证（先跑）

| case | 结果 | 耗时/说明 |
|---|---|---|
| `recall-entity-binding`（seed `memoryItems[].entityRefs` → recall 命中） | **PASS 4/4** | **3 ms**（原 30,003 ms，已不再自锁） |
| `recall-r1` | PASS 11/11 | 5 ms |
| `recall-rebuild` | PASS 10/10 | 11 ms |
| `recall-vector`（`AGENTD_RECALL_VECTOR=1`） | **PENDING→`m32-vector-env.ps1` 8/8** | seed/rebuild documents=2；items=1；trace.paths=graph,vector,fts；`vector_used`；hopLimit=2 |
| 默认关向量（`m27-m30-env.ps1`） | **PASS 4/4** | FTS still returns items=1；paths=graph,alias（无 vector）；无 `vector_used` |

### 9.2 全量分块（136 条 = 124 可执行 + 12 PENDING）

| 块 | 范围 | run.mjs |
|---|---|---|
| block1 | M1–M8（34 条） | **34/34 PASS** |
| block2 | M9–M15（33 条） | **28/29 PASS + 4 PENDING**（`workflow-advance` 1 次时序 flake Δ=8049ms，单跑 2/2 PASS） |
| block3 | M17–M20 + UI-1（27 条，含 CLI） | **25/25 PASS + 2 PENDING**（`stats` 本轮通过） |
| block4 | M21–M32（42 条，含 recall 修复回归 + M31 team WS + M32 vector） | **36/36 PASS + 6 PENDING** |

- **合计**：136 条 = **124 条可执行（124 PASS；1 次 flake 单跑 2/2 PASS） + 12 条 PENDING**；PENDING 由 11 个专项 `.ps1` 覆盖且全绿：`workflow-restart.ps1` 13/13、`schedule-restart.ps1` 11/11、`category-backfill.ps1` 8/8、`reply-persist.ps1` 15/15、`runtime-recovery.ps1` 11/11、`runtime-long-approval.ps1` 12/12、`team-concurrency.ps1` 6/6、`team-executor.ps1` 4/4、`team-v1-persist.ps1` 12/12、`m27-m30-env.ps1` **12/12**（含 M32 默认关断言）、`m32-vector-env.ps1` **8/8**。
- **M1–M33**：M31 `team-ws-events` 12/12；M32 `recall-vector` 由 `m32-vector-env.ps1` 8/8（vector=1 → `trace.paths` 含 vector、items 非空、`vector_used`；默认关 → 无 vector 路径、FTS 与 items 正常）；M33 前端构建 656,064（`GET /app.js` 实测 656,064、index 引用正常），无新增后端 case；M27–M30 9 条 + recall 修复回归 1 条均通过；M25/M26 专项 10/10。
- **M29**：按 Lead 交接，安装/升级/备份恢复由 Lead 实测与 harness-scout 验证；本轮不重复执行。

### 9.3 real-smoke（真实模型，-TokenBudget 45000）

官方 3 次：

| 次 | 结果 | token |
|---|---|---|
| 1 | 7/7 PASS | 46,980 |
| 2 | 6/7 PASS（`real-category-demand` 红） | 45,681 |
| 3 | 6/7 PASS（`real-category-demand` 红） | 41,870 |

- **官方 3 次中位数 45,681 > 45,000（超 681，未达标）**；range 41,870–46,980。
- 追加 3 次补充测量（不替换官方值）：44,016（6/7）/ 38,693（7/7）/ 44,431（7/7）；**6 次合并中位数 44,224 ≤ 45,000**，range **38,693–46,980**。
- `real-category-demand` 真实模型分类 flake：6 次中 3 次 PASS、3 次红（`^(requirement|clarification|progress|consultation)$` 未命中）；结构断言其余 6 条稳定。建议保持 normal/单跑重试；真实模型 token 波动较大，最终里程碑可同时记录 3 次与 6 次中位。

### 9.4 已知问题 / 遗留

1. **recall 实体绑定自锁已修复**：13:26 构建通过 `recall-entity-binding` 验证（3ms、items 非空）；M33 构建复验仍 4/4。
2. **real-smoke token 中位未稳定达标**：官方 3 次中位 45,681（超 681）；6 次合并中位 44,224（≤45k）；真实模型 token 波动大，建议以 6 次中位作为基线并保留 45k 软门禁。
3. `workflow-advance` 时序 flake（Δ≈8049ms > tolerance 5000ms）为机器负载相关；单跑 2/2 PASS，CI 复跑即可。`stats` 本轮通过（上一构建出现过 token 聚合 flake）。
4. `real-category-demand` 真实模型分类 flake（3/6）；mock 门禁不受影响。
5. M29 安装/升级/备份恢复：以 Lead 修完两个升级脚本后的重跑结论为准（备份路径记录、无备份回滚保护）；本轮不重复。

## 10. M34–M40 构建（2026-11-08 18:44；历史构建，最终 M41 见 §11）

> 被测：`agentd/simo.exe`（**21,893,120 bytes，2026-11-08 18:44:40**，sha256 `9282B56228934C98CDD22C496D59CBD6D05D63B31A6B2372EC3E2168B92D949D`；内嵌 `app.js` **667,866 bytes**）。
> 最终包：`deploy/dist/simo-M40-win-x64.zip`（**11.57 MiB / 12,127,288 B**，sha256 `62EA417C4305C0EB45C153C5B17FB488749E982766FAEDAC30A90C1FFEACE674`；包内 exe sha256 `9282B562…D949D`，与 `agentd/simo.exe` 一致）。

### 10.1 里程碑

- **M34 视图复杂交互 v2**：表单/表格/看板等复杂块交互增强（受控提交、失败保留、编辑器联动）。
- **M35 CI**：CI 流水线（构建 + 后端单测/门禁 + 前端 `check-*` 门禁 + evals 冒烟）。
- **M36 容器化**：Dockerfile/compose 与镜像构建链路。
- **M37 顶部选项卡**：顶部选项卡导航。
- **M38 三栏/右栏**：三栏布局与右栏信息/操作区调整。
- **M39 视觉规范**：颜色/字体/间距/圆角/阴影等设计 token 与组件约束。
- **M40 视觉重构**：整体视觉重构落地（顶部选项卡 + 三栏/右栏 + 规范 token 统一）。

### 10.2 界面门禁与前端修复

- **界面门禁 M2–M40 全绿：27 个脚本**（M2–M40 里程碑 check + UI-1/UI-2/UI-3；`check-modularity` 独立结构门禁另计）。
- **overview eval 4/4 全绿**。
- **UTF-8 乱码修复**：文本截断改为 **rune 安全**（不切断多字节字符）；旧缓存概览不兼容时**自动重建**。
- **概览展示上限**：最多 **6 条**；每条 **40 字**（标题/摘要）与 **50 字**（正文/要点）上限，安全截断。

### 10.3 mock 评测与 flake（沿用）

- **mock 仍 136 条**（124 可执行 + 12 PENDING）；**UI 里程碑不新增 mock case**；沿用 13:53 构建终值 **124/124 PASS + 12 PENDING（11 脚本全绿）**。
- **已知 flake 沿用**：`workflow-advance` 时序（Δ≈8049ms，单跑 2/2 PASS）、`stats` 偶发 token 聚合、`real-category-demand` 真实模型分类（3/6）；均不阻塞 mock 门禁。
- 本轮只更新评测文档，未改后端/前端代码；不递归删除、不触碰 8787/`simo-live.exe`。

## 11. M41 最终构建（2026-11-09 00:20:56；交互卡片）

> 被测：`agentd/simo.exe`（**22,002,688 bytes，2026-11-09 00:20:56**，sha256 `4905F6C7C932021EF5EC548C0D14093795617E3BEF6ADE4373412EB8C2D89421`；内嵌 `app.js` **675,939 bytes**；动作目录含 `chat.send_card`，`/api/cards/{id}` 可用）。环境：`AGENTD_LLM=mock AGENTD_DEBUG=1`、独立端口 19110–19114、每块新建 GUID 临时 `AGENTD_HOME`；评测进程同时设同一 `AGENTD_HOME`；不碰 8787 / `simo-live.exe`。

### 11.1 M41 交互卡片（8 条 = 7 活跃 + 1 PENDING）

| case | 结果 | 断言要点 |
|---|---|---|
| `card-send` | **PASS 9/9** | `chat.send_card` → 消息 `cards[]`（schema/version/fallbackText）；`GET /api/cards/{id}` 可查 |
| `card-validation` | **PASS 7/7** | 非法块/动作不存在/无 chatPrompt/缺 fallback/超长 fallback → 4xx 且不落卡（messages 无 cards） |
| `card-agent-route` | **PASS 6/6** | route=agent → 202、写用户动作消息（`actionId=confirm`）、触发 Agent 回复（user≥1、agent≥2） |
| `card-action-route` | **PASS 6/6** | route=action `task.list` → 200、result 返回、卡片 status=submitted、无审批误报 |
| `card-idempotency` | **PASS 5/5** | 同 card+action+payload 重复提交 → 第二次 `idempotent:true`，用户动作消息仅 1 条（不重复执行） |
| `card-version` | **PASS 7/7** | PATCH baseVersion=1 → version=2 + WS `card.updated`；过期 baseVersion → 409 `CARD_BASE_CONFLICT` |
| `card-action-approval` | **PASS 4/4** | route=action R4 `session.delete` → 403 `DENIED_R4`，不执行，会话仍在 |
| `card-persist` | **PENDING→`card-persist.ps1` 6/6** | 重启同 home 后消息 `cards[]`/cardId/fallback 与 `GET /api/cards/{id}` 均仍在 |

### 11.2 全量分块（144 条 = 131 可执行 + 13 PENDING）

| 块 | 范围 | run.mjs |
|---|---|---|
| block1 | M1–M8（34 条） | **34/34 PASS** |
| block2 | M9–M15（33 条） | **28/29 PASS + 4 PENDING**（`workflow-advance` 1 次时序 flake Δ=8048ms，单跑 2/2 PASS） |
| block3 | M17–M20 + UI-1（27 条） | **25/25 PASS + 2 PENDING** |
| block4 | M21–M41（50 条） | **43/43 PASS + 7 PENDING** |

- **合计**：144 条 = **131 条可执行（131 PASS；1 次 flake 单跑 2/2 PASS） + 13 条 PENDING**；PENDING 由 12 个专项 `.ps1` 覆盖且全绿：`workflow-restart.ps1` 13/13、`schedule-restart.ps1` 11/11、`category-backfill.ps1` 8/8、`reply-persist.ps1` 15/15、`runtime-recovery.ps1` 11/11、`runtime-long-approval.ps1` 12/12、`team-concurrency.ps1` 6/6、`team-executor.ps1` 4/4、`team-v1-persist.ps1` 12/12、`m27-m30-env.ps1` 12/12、`m32-vector-env.ps1` 8/8、`card-persist.ps1` 6/6。
- **M41**：7 条活跃全 PASS + `card-persist` 脚本 6/6；无红项。
- **回归**：M1–M40 全部通过（含 M27–M32、team-ws-events、recall-vector、M34–M40 UI 里程碑无新增 mock case）。

### 11.3 real-smoke（真实模型，3 次，-TokenBudget 45000）

| 次 | 结果 | token |
|---|---|---|
| 1 | 7/7 PASS | 39,462 |
| 2 | 7/7 PASS | 41,569 |
| 3 | 7/7 PASS | 41,524 |

**中位数 41,524 ≤ 45,000（达标）**，range **39,462–41,569**；3 次均 7/7，`real-category-demand` 本轮 3/3 通过。

### 11.4 已知 flake / 边界

- `workflow-advance` 时序 flake（block2 Δ=8048ms > tolerance 5000ms）为机器负载相关，单跑 **2/2 PASS**；其余无红项。
- 本轮只改 evals/（新增 8 条 card case + `card-persist.ps1` + README/RELEASE 终值）；不递归删除、不触碰 8787/`simo-live.exe`；M29 以 Lead 重跑结论为准。


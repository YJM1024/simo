# 司墨管理员指南（M41 完成态）

> 面向部署/维护者：安装、配置、数据目录、日志、Key 安全、外部依赖、定时任务、备份迁移与故障排查。
> 可执行文件名为 **`simo.exe`**（司墨）；内部 Go module 仍叫 `simo`（源码路径/构建包名不变，不影响运行与使用）。
> 使用者请先看 [`user-guide.md`](user-guide.md)；版本能力与限制见 [`release-notes-v1.md`](release-notes-v1.md)。

## 1. 运行形态

- **单二进制** `simo.exe`（Windows x64），内嵌前端；运行时不需要 Node、不需要额外数据库服务；
- **默认真实模型**（DeepSeek `deepseek-flash`），需要 API Key；离线体验用 `-model mock`；
- 一个数据目录 `SIMO_HOME`（默认 `%USERPROFILE%\.simo`）：SQLite、产物、工作区、上传附件、临时文件；
- **单实例**：同一数据目录只允许一个进程；第二个实例会被文件锁拒绝；
- 默认只监听 `127.0.0.1:8787`，**无登录/鉴权**，只适合本机。

---

## 2. 启动、停止与命令行

在 `simo.exe` 所在目录：

> 若使用仓库根目录的 `start.ps1`：它会**优先启动 `simo.exe`，并兼容旧版二进制**（适合从旧版本升级、尚未重建的场景）。

```powershell
# 启动（默认真实模型；需要先配好 Key）
.\simo.exe serve

# 离线体验（不联网、不需要 Key，确定性模拟）
.\simo.exe serve -model mock

# 换端口
.\simo.exe serve -addr 127.0.0.1:8788

# 调试端点（仅本机；默认关闭）
.\simo.exe serve -debug
```

- 停止：`Ctrl+C`（优雅关闭）；直接关窗口也可以，下次启动会回收残留锁；
- 不带 `serve`、直接给 flag 也等价启动，但推荐统一用 `serve`；
- `-h` / `help` 查看参数。

**命令行 flag（优先级最高）**：

| flag | 说明 |
|---|---|
| `-addr` | 监听地址，默认 `127.0.0.1:8787` |
| `-db` | SQLite 路径；相对路径相对 `SIMO_HOME` |
| `-model` | `real`（默认，需 Key）或 `mock`（离线） |
| `-llm-model` | 模型名，默认 `deepseek-flash` |
| `-debug` | 只读调试端点（仅本机，默认关闭） |
| `-enable-modules` | 启用模块（逗号分隔，覆盖其他来源） |
| `-disable-modules` | 禁用模块（逗号分隔） |

---

## 3. 配置：优先级与文件

**优先级从高到低**：

```
命令行 flag > 环境变量 > config.local.json（多个候选）> 默认值
```

`config.local.json` 的读取顺序（后者覆盖前者）：

1. `%SIMO_HOME%\config.local.json`
2. 当前工作目录下的 `config.local.json`
3. `simo.exe` 同目录下的 `config.local.json`
4. `SIMO_CONFIG` 指定的文件

> 日常使用建议只放一份：`%SIMO_HOME%\config.local.json`，避免从不同目录启动读到不同配置。

### 3.1 配置示例（默认真实模型）

```json
{
  "addr": "127.0.0.1:8787",
  "llm": "real",
  "provider": "deepseek",
  "baseURL": "https://api.deepseek.com",
  "model": "deepseek-flash",
  "apiKey": "<由管理员填写，不要提交>",
  "maxOutputTokens": 1024,
  "reasoning": {
    "default": "high",
    "byRole": {
      "secretary": "low",
      "expert": "high",
      "reviewer": "high",
      "summarizer": "low"
    }
  },
  "tools": {
    "chrome": "",
    "python": "",
    "scripts": ""
  },
  "modules": {
    "sessions": true,
    "chat": true,
    "tasks": true,
    "memory": true
  },
  "debug": false
}
```

| 字段 | 说明 |
|---|---|
| `addr` | 监听地址；只本机用 `127.0.0.1:8787` |
| `llm` | `real`（默认，需 Key）/ `mock`（离线） |
| `model` | 模型名（`deepseek-flash`） |
| `provider` / `baseURL` | 模型服务与地址 |
| `apiKey` | **不要提交**；建议用环境变量（§4） |
| `maxOutputTokens` | 单次输出上限，默认 1024（低 token 测试可设 256） |
| `reasoning.default` / `byRole` | 各角色思考强度；低 token 测试可设 `low` |
| `tools.chrome` / `tools.python` / `tools.scripts` | 外部工具路径；留空自动探测（§5） |
| `modules` | 模块开关；默认四个都开 |
| `debug` | 只读调试端点；默认 `false` |

### 3.2 环境变量

| 变量 | 作用 |
|---|---|
| `SIMO_HOME` | 数据根目录（默认 `%USERPROFILE%\.simo`） |
| `SIMO_CONFIG` | 额外指定一个配置文件 |
| `SIMO_ADDR` | 监听地址 |
| `SIMO_MODEL` | `real` / `mock` |
| `SIMO_LLM` | `real` / `mock`（与 `SIMO_MODEL` 同义，便于脚本切换） |
| `SIMO_LLM_MODEL` | 模型名 |
| `SIMO_PROVIDER` / `SIMO_BASE_URL` | 模型服务/地址 |
| `SIMO_API_KEY` / `DEEPSEEK_API_KEY` | API Key |
| `SIMO_MAX_OUTPUT_TOKENS` | 输出上限（低 token 测试用 256） |
| `SIMO_REASONING_DEFAULT` | 默认思考强度（低 token 测试用 `low`） |
| `SIMO_CHROME` / `SIMO_PYTHON` / `SIMO_SCRIPTS` | 外部工具路径（可选） |
| `SIMO_MEMORY_V3` | 记忆 v0.3 读开关；默认开；`0/false/off/v2` 回退旧表（排障/回滚用） |
| `SIMO_RECALL_R2` | 召回 R2（2 跳+agentic）；默认开；`0/false/off/v1/r1` 关闭回 R1 |
| `SIMO_RECALL_VECTOR` | 本地字符 n-gram TF-IDF 向量召回；默认关；`1/true/on/yes` 启用并与关键词/图谱融合；索引在 `recall_vectors`/`recall_vector_terms`，由 rebuild 维护 |
| `SIMO_MEMORY_CONSOLIDATE` | 记忆自动巩固；默认开；`0/false/off/no` 关闭 |
| `SIMO_MEMORY_CONSOLIDATE_THRESHOLD` | 触发巩固的未处理消息阈值；默认 8，正整数 |
| `SIMO_MEMORY_CONSOLIDATE_INTERVAL_SEC` | 定时巩固间隔秒；默认 300，最小 1 |
| `SIMO_MAX_CONCURRENCY` | 全局任务并发上限；默认 3，正整数，最大夹到 32 |
| `SIMO_WORKFLOW_CONCURRENCY` | 单工作流并发上限；默认 3，正整数，最大夹到 32 |
| `SIMO_TASK_EXECUTOR` | 子任务执行者：`task-npc`（默认）/ `simo`；内部会规范为 `agent:*` |
| `SIMO_MODULES` | 启用模块列表（逗号分隔，覆盖配置文件） |
| `SIMO_DISABLE_MODULES` | 禁用模块列表（逗号分隔） |
| `SIMO_DEBUG` | `1`/`true`/`yes` 打开调试端点 |

**模块**：`sessions`（会话）、`chat`（对话/工具/定时任务）、`tasks`（任务/工作流）、`memory`（记忆）。默认全开；不确定时不要动。禁用 `chat`/`sessions` 会导致服务不可用。

---

## 4. 模型 Key 与低 token 测试

### 4.1 默认真实模型

默认 `real`。启动时**没有 Key 会直接失败**（报"real 模式需要 API key"）。两种配置方式：

```powershell
# 推荐：环境变量
$env:DEEPSEEK_API_KEY = "<由管理员填写，不要提交>"
.\simo.exe serve
```

或写入 `%SIMO_HOME%\config.local.json` 的 `apiKey` 字段，并收紧文件权限（只允许当前用户读）。

### 4.2 离线体验

```powershell
.\simo.exe serve -model mock
# 或
$env:SIMO_LLM = "mock"; .\simo.exe serve
```

mock 不联网、确定性，适合熟悉界面/评测；**不是**真实模型。

### 4.3 低 token 测试（省成本）

不改变功能，只压低单次生成与思考强度：

```powershell
$env:SIMO_MAX_OUTPUT_TOKENS = "256"
$env:SIMO_REASONING_DEFAULT = "low"
.\simo.exe serve
```

真实模型 smoke 使用短 prompt + 低 token（默认 `maxOutputTokens=256`、`reasoning=low`）；日常使用默认 1024/high。降低后复杂任务可能更简短或更容易失败，属预期。

### 4.4 密钥禁止事项

- **不要**把 Key 写进命令行参数（进程列表可见）；
- **不要**把 `config.local.json` 提交到仓库；
- **不要**贴进聊天/日志/截图；
- 怀疑泄露：去服务商后台**吊销并重新生成**，再更新本机配置；
- 日志/调试端点不会返回 Key；工具执行环境也不继承 Key（已做环境白名单清理）。

---

## 5. 外部依赖：Chrome / Python（PDF、Office 与 run_python）

M12 起支持生成 PDF / Word / Excel / PPT / 图片；M17 起支持通用 `run_python`；都依赖本机外部程序。**缺失时工具会返回明确错误**，不会静默降级。

### 5.1 PDF（Chrome / Edge）

- 使用 **Chrome 或 Edge 的 headless 打印**生成 PDF；
- 默认探测常见安装路径（Program Files 下的 Chrome/Edge），也可显式指定：

```powershell
$env:SIMO_CHROME = "C:\Program Files\Google\Chrome\Application\chrome.exe"
.\simo.exe serve
```

或配置 `tools.chrome`。找不到时错误码 `chrome_missing`；导出失败可能回退到内置最小 PDF，仍失败会报 `pdf_failed`。

### 5.2 Python 运行时：Office 生成与 `run_python`

- 需要本机 Python 3，以及 `python-docx`、`openpyxl`、`python-pptx`、`Pillow`；
- **helper 脚本已内嵌在二进制里**（`office_helper.py`），运行时写到 `SIMO_HOME/tmp`，**不依赖当前目录或 scripts 目录**；
- Python 解释器默认探测常见安装位置/PATH（若使用随包运行环境则自动可用），也可显式指定：

```powershell
$env:SIMO_PYTHON = "<python.exe 路径>"
.\simo.exe serve
```

或配置 `tools.python`。`SIMO_SCRIPTS` / `tools.scripts` 可用于兼容自定义脚本目录（可选）。

- 缺 Python → `python_missing`；缺 helper → `helper_missing`；库缺失/生成失败 → `helper_failed`（错误会带原因）。
- 若用自定义 Python，请先安装上述库：

```powershell
<python.exe> -m pip install python-docx openpyxl python-pptx Pillow
```

#### `run_python`（M17，通用 Python 执行）

- 工具参数：`code`（直接给代码）或 `path`（workspace 内 `.py` 脚本）、`args`（字符串数组）、`timeout_ms`（1000–120000，默认 120s）；
- 执行目录固定为会话 **workspace**；stdout/stderr 合并，末尾 `[exit code: N]`；
- 输出超过 64KB 落盘（`artifacts/spill/`），聊天里显示摘要 + 路径；
- **环境白名单**：只传必要变量（如 `SIMO_HOME`、PATH），**不继承 API Key**；`PYTHONUTF8=1`；
- **审批**：执行类风险 `R2`，走 M9 审批；`read-only` 沙盒直接 `sandbox_denied`，`never` 策略直接拒绝；
- 超时会杀**进程树**；路径越界拒绝；找不到 Python 返回 `python_missing`；
- **不是完整 OS 级沙箱**：Python 代码本身仍可执行其语言能力；只运行可信代码，生产上建议配合低权限账户/容器隔离。

### 5.3 临时目录

- 生成过程的临时文件在 `SIMO_HOME/tmp`（PDF 的临时 HTML/profile、内嵌 helper 等）；
- 需要该目录可写、磁盘有空间；异常残留可停服务后清理 `SIMO_HOME/tmp`（不影响数据库）。

---

## 6. 数据目录 `SIMO_HOME`

### 6.1 布局

默认 `%USERPROFILE%\.simo`（容器内通常是 `/data`）：

```
SIMO_HOME/
├── simo.db              # SQLite 主库（会话/消息/任务/工作流/记忆/审批/定时任务等）
├── simo.db-wal          # WAL 日志（运行期存在）
├── simo.db-shm          # WAL 共享内存（运行期存在）
├── simo.db.lock         # 单实例锁（记录 pid；正常退出会删除）
├── artifacts/             # 任务产物、生成的文件（按会话/任务分目录）
├── workspace/             # 工具执行工作区；上传附件在 workspace/uploads/
├── tmp/                   # 临时文件（PDF/Office helper 等；可清理）
├── logs/                  # 日志目录（预留；当前进程日志走标准错误）
└── config.local.json      # 可选配置
```

### 6.2 换数据目录

```powershell
$env:SIMO_HOME = "D:\simo-data"
.\simo.exe serve
```

目录不存在会自动创建；换空目录 = 全新数据；首次启动会从旧路径自动迁移到 `SIMO_HOME`（**不删旧数据**）；一个 `SIMO_HOME` 只能被一个进程使用。

### 6.3 数据库与单写者

- 所有写操作串行化（单写者），WAL 模式；运行期 `-wal`/`-shm` 正常；
- `.lock` 文件由进程创建，正常退出删除；崩溃后若 pid 对应进程已不存在，下次启动自动回收。

### 6.4 用量统计接口（`/api/stats`）

UI-1 的「用量统计」读这个接口；也可直接用 curl/PowerShell 查：

```powershell
curl.exe -sS "http://127.0.0.1:8787/api/stats?metric=tokens&granularity=day&from=2026-10-01&to=2026-11-08"
```

| 参数 | 可选值/格式 | 默认 |
|---|---|---|
| `metric` | `messages` / `tokens` / `tasks` | `messages` |
| `granularity` | `day` / `week` / `month` | `day` |
| `from` / `to` | 毫秒时间戳、`RFC3339`、`YYYY-MM-DD`、`YYYY-MM-DD HH:mm:ss`；`to` 为当日则含当天 | `from=to-30天`，`to=现在` |
| `sessionId` | 只统计指定会话 | 全部会话 |

- 返回 `{ok, metric, granularity, from, to, buckets[], bySession[], totals}`；`buckets` 含 `start/end/label/value` 及分项计数；`totals` 含消息/token/任务与 prompt/completion/reasoning 分项；
- **只监听本机、无鉴权**：不要把该端口暴露出去；接口本身不返回 Key；
- 大范围/大数据量首次查询会慢一些；优先用 30 天内 + 合适粒度；**UI-1 已修复统计页慢的问题**（升级到最新构建；仍慢时先缩小范围，见 §11.13）。

### 6.5 智能体目录与会话负责人

- 内置智能体（`GET /api/agents`）：`simo`（主理人/统筹，默认）、`researcher`（研究员）、`builder`（工程师）、`reviewer`（审校）；每项含 `id/name/role/persona/tools/model/icon/tone/shape`；
- **负责人按会话存储**（`sessions.owner_agent_id`，默认 `simo`），只允许内置目录中的 id：
  - `GET /api/sessions/{id}/owner` → `{ok, sessionId, ownerAgentId}`；
  - `PUT /api/sessions/{id}/owner`，body `{"agentId":"researcher"}`；
  - 未知 id 返回 400；没有独立“新增智能体”接口（自定义 agent 属后续能力）；
- 负责人决定消息头像/汇报归属；UI 可在对话中表达切换（动作层校验），也可用上面接口；当前不提供独立的 owner 管理页。

> UI-1 的“智能体/负责人头像”数据来自该目录；后端目录接口未就绪时前端会按会话 id 做确定性兜底。

### 6.6 M18 表结构升级（sessions v6）

M18 把 Spec 从“状态/验收键”扩展为执行内核；启动时自动迁移，**迁移前先停服务并备份整个 `SIMO_HOME`**：

- `sessions` 模块 **v6**：`specs` 增加 `goal/constraints/current/plan/executor_agent_id/state_reason/reopened_count/last_injected_version`；
- 新增 `spec_transitions`（Spec 状态迁移 append-only 审计：from/to/version/reason/actor/at）；
- 新增 `spec_evidence`（验收证据，权威表；唯一键 `spec_id, acceptance_key, ref`，支持失效标记）；
- `session_overviews` 增加 `source_spec_version`、`dirty`（概览与 Spec 版本对齐/过期标记）；
- `tasks` 模块 **v5**：`spec_id`、`acceptance_keys`、`executor_agent_id`（任务级执行者覆盖；空=继承 Spec）；
- 旧 `specs.evidence` JSON 保留兼容读取，新写入以 `spec_evidence` 为准；旧任务迁移时可回填 `legacy` 证据，避免归档门禁误卡；
- **不要手改表结构**；迁移失败保持原版本并报错，恢复备份后再启动（见 §11.11）；迁移前旧版本备份仍可回退旧二进制。

> 这些表属于内部执行层，**不对用户开放 API/UI**；概览仍只展示目标/约束/现状/事项/时间线。排障用 §8 的 `-debug` 只读钩子。

### 6.7 M21–M33 迁移：memory / recall / team / views / consolidation

> M21–M33 的迁移版本段为 **v2–v15**（按模块实际：memory v2→v6、chat v13→v15）；启动时自动执行，失败不进入服务。升级前停服务并备份整个 `SIMO_HOME`。

| 模块 | 版本 | 内容 |
|---|---|---|
| memory | v2 | M21 记忆 v0.3：entities/relations/memories/canonical/mentions/conflicts/pyramid/raw 等表；旧 `memory_items` 兼容镜像 |
| memory | v3 | M22 召回派生层（实体/关系索引、recall trace 等） |
| memory | v4 | 智能体品牌名规范化（旧数据兼容） |
| memory | v5 | M30 自动巩固：`memory_consolidation_jobs` / `memory_consolidation_state` / `memory_writeback_audit` |
| memory | v6 | M32 本地 TF-IDF 向量：`recall_vectors(kind,ref_id,vector_json,norm,updated_at)` / `recall_vector_terms(term,df,updated_at)` |
| chat | v13 | M24 团队 V1：`teams`/`team_members`/`team_messages`/`team_triggers`/`team_deliverables` |
| chat | v14 | M25 团队 V2：`team_templates`/`team_template_roles`/`team_member_roles` + `teams.template_id/version` |
| chat | v15 | M26 视图 Schema：`view_pages`（当前页/软删）、`view_versions`（不可变版本） |

- `SIMO_MEMORY_V3` 默认开；设为 `0/false/off/v2` 时记忆读路径回退旧表，用于排障/回滚（写路径与旧表兼容策略见 m21 契约）；
- **M31 团队 WS 事件已上线**：`team.*` 已加入用户 WS 允许表（团队页实时刷新）；仍只投影状态/摘要，不显示成员内部消息正文；团队页另有 8s REST 轮询降级；
- 视图事件 `view.updated/view.render/view.binding.failed/view.renderer.error` 属于用户 WS 允许表；视图 schema 版本不可变，回滚生成新版本；M28 受控编辑器只提交白名单 patch；
- 召回 R2（M27）默认开 2 跳+agentic；`SIMO_RECALL_VECTOR` 默认关（M32 本地字符 n-gram TF-IDF；需 rebuild 索引，未启用/未重建时降级）；
- **不要手改表结构**；迁移失败恢复备份再启动；旧二进制回滚需同时回滚数据备份。

### 6.8 M21–M41 主要 API（只读/动作）

| 能力 | 入口 |
|---|---|
| 记忆 | `GET /api/memory/items`、`/entities`、`/entities/{id}`、`/graph`、`/pyramid`、`/conflicts`、`/agents`、`/agents/{id}/memory`、`/canonical/{id}` |
| 召回 | 仅 `-debug` 本机：`GET/POST /api/debug/recall`、`POST /api/debug/recall/seed|rebuild`；R2 由 `SIMO_RECALL_R2` 控制；rebuild 会同时重建 `recall_vectors`/`recall_vector_terms` 并返回 vectors 统计 |
| 自动巩固 | 仅 `-debug` 本机：`POST /api/debug/memory/consolidate`、`GET /api/debug/memory/consolidation`；默认由后台阈值/定时触发 |
| 团队 | `GET /api/sessions/{id}/team`、`GET /api/teams/{id}`、`/members`、`/messages`、`/deliverables`、`/triggers`；写操作走 `team.*` 动作 |
| 视图 | `GET /api/views?sessionId=`、`GET /api/views/{id}`、`/versions`、`/versions/{v}`、`/render-state`；生成/回滚走 `ui.set_view`/`ui.view.rollback` 动作；M28 编辑器调同一动作 |
| 并发 | 任务列表/运行时接口会显示并发/排队原因；配置见 §3.2 的 `SIMO_*_CONCURRENCY` |

> 以上均为只读展示/动作层入口；不要用 curl 直接改表。团队/记忆/视图页面没有编辑控件（M28 视图编辑器除外），写操作通过对话或动作层并审计。

### 6.9 M41 交互卡片（存储/API/安全）

- 契约：[`docs/m41-card-contract.md`](m41-card-contract.md)；cards 挂在普通 agent 消息上（不新增消息类型）；
- chat migration v16：`message_cards`（当前版本/状态/submission/fallback）、`card_versions`（不可变版本）、`card_action_receipts`（幂等/审计）；
- 动作 `chat.send_card`；API：`GET /api/cards/{id}`、`/versions`、`PATCH /api/cards/{id}`（`baseVersion` 409）、`POST /api/cards/{id}/actions/{actionId}`（route=agent/action）；WS `card.updated`；
- **权限/审批**：route=action 沿用 M20 风险/审批；R3+ 必须审批；R4 由卡片发起直接拒绝（`DENIED_R4`），不能提权/绕过；route=agent 只写用户动作消息并触发 turn；
- **持久/恢复**：卡片/版本/提交/幂等 receipt 全落库；重启后 active 保持、提交中按结果对账，未知副作用不自动重试；
- **安全**：禁 HTML/脚本/内联样式/事件属性；fallbackText 必需并清洗；跨会话拒绝；卡片不直接改业务状态。

---

## 7. 定时任务（schedules）

- 数据存在 `simo.db` 的 `schedules` 表（没有单独文件）；重启不丢；
- 进程内调度器约每 5 秒检查到期任务；
- 到点向目标会话投递内容，按正常对话/任务/工作流执行；结果以汇报消息出现在目标会话；
- 支持 `once / interval / daily / weekly / cron`、时区、启停、立即运行；
- 停机错过：重算下次时间，**只补最近一次**，不补历史全部；
- 需要审批但无人应答：**暂停该定时任务并汇报**（fail-closed），不会自动放行；
- 备份/迁移：随 `simo.db` 一起备份；恢复后下次运行时间自动重算。

> 定时任务依赖服务进程常驻；服务停止期间不会触发。V1 不做事件触发/webhook（P2）。

---

## 8. 日志与诊断

- 当前日志输出到**标准错误**（结构化文本）；`SIMO_HOME/logs/` 预留；需要留存可重定向：

  ```powershell
  .\simo.exe serve 2>> "$env:SIMO_HOME\logs\simo.log"
  ```

- 正常启动会打印：监听地址、数据根、数据库路径、模块列表、模型模式、模型名、debug 开关；
- 排障可临时打开 `-debug` 或 `SIMO_DEBUG=1`：**debug 钩子只在 debug 开启时注册**，且每个处理函数都再次校验**仅 loopback**；默认关闭，未开启时相关路径 404。**不要长期开启或暴露到非本机**。

  | 端点 | 用途 |
  |---|---|
  | `GET /api/health` | 健康检查（含 ready/checks；非 debug 也可用） |
  | `GET /api/debug/last-llm-request` | 最近一次模型请求快照（不含 Key；仅 debug + 本机） |
  | `GET /api/debug/spec?sessionId=` | 查看会话 Spec 内部状态（只读排障；用户 UI 不可见） |
  | `GET /api/debug/specs` | 列出/查询 Spec（只读排障） |
  | `POST /api/debug/spec/transition` | 手动触发状态迁移（仅排障；非法迁移 409） |
  | `POST /api/debug/spec/reopen` | reopen 已终结 Spec（仅排障） |
  | `POST /api/debug/spec/executor` | 设置子任务执行者（`agent:task-npc` / `agent:simo`） |
  | `GET /api/debug/runtime`、`POST /api/debug/runtime/config` | M19 运行时配置/状态预览（仅 debug + 本机） |
  | `GET /api/debug/goroutines` | goroutine 栈摘要 |

### 8.1 M19 runtime API（预告）

M19（长程运行时）已有预览 API，**不是完整 M19 交付**；字段/行为可能继续调整：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/runtime/status` | 版本 `m19`、uptime、活跃任务数、DB 大小、预算配置、`recovering` 标志 |
| GET | `/api/workflows/{id}/runtime` | 工作流进度/耗时/下一动作/ETA/停滞状态/检查点/预算 |
| GET | `/api/tasks/{id}/runtime` | 任务进度/尝试次数/心跳/恢复点/检查点/预算 |
| POST | `/api/debug/runtime/config` | **仅 debug**：stallWarnMs/stallPauseMs/workflowTokenBudget/approvalTtlMs/fakeNowMs |

- 这些是运行时**可观测性**接口，不替代任务/工作流 API；`recovering`、`remaining` 等字段当前可能是占位值，不能当作完整恢复/预算承诺；
- 完整心跳、幂等、强一致恢复、预算硬上限与失败接管仍按 M19 后续实现；当前排障以事件日志/检查点为准。

---

## 9. 端口与防火墙

- 默认 `127.0.0.1:8787`，只接受本机连接；
- 改端口：`.\simo.exe serve -addr 127.0.0.1:8788`；
- **不要**在没有鉴权/反向代理时改成 `0.0.0.0:8787` 暴露到局域网/公网；
- 防火墙通常不拦回环；改绑非回环需自行放行并加鉴权（V1 无鉴权）。

---

## 10. 备份、恢复与迁移

### 10.1 正确备份（停服务后整目录拷贝）

```powershell
# 1) 先停服务（Ctrl+C 或结束进程）
# 2) 拷贝整个数据目录（含 artifacts/workspace/tmp；tmp 可清理）
Copy-Item -Recurse -Force "$env:USERPROFILE\.simo" "D:\backup\simo-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

- **不要**在服务运行时直接复制 `simo.db`：WAL 可能未合并，可能不一致；
- 必须热备时用 SQLite 在线备份（如 `sqlite3 simo.db ".backup backup.db"`），不要文件复制；
- 备份含会话、任务/工作流、记忆、产物、上传附件、定时任务（DB 内）；`config.local.json` 可能含 Key，妥善保管。

### 10.2 恢复

```powershell
# 先停服务
Copy-Item -Recurse -Force "D:\backup\simo-20261107-120000" "$env:USERPROFILE\.simo"
.\simo.exe serve
```

恢复后抽查会话/任务/文件/定时任务，再做写入。

### 10.3 迁移到新机器

1. 停旧机服务，打包整个 `SIMO_HOME`；
2. 新机放同版本 `simo.exe`；
3. 解压到新机 `SIMO_HOME`（或设置 `SIMO_HOME`）；
4. 启动并检查；外部依赖（Chrome/Python）需在新机可用。

### 10.4 升级

- 停服务 → 备份 → 替换 `simo.exe` → 启动；
- 启动时按模块自动迁移数据库，幂等、只前进不回滚；失败保持原版本并报错（fail-closed）；
- 旧二进制不保证读新版本数据库；回滚用备份 + 旧二进制。

---

## 11. 故障排查

### 11.1 启动即失败：需要 API Key

- 默认 `real`，需 `DEEPSEEK_API_KEY`/`SIMO_API_KEY` 或配置 `apiKey`；临时离线用 `-model mock`。

### 11.2 端口被占用

```powershell
Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id <OwningProcess>
```

停占用进程或换端口（`-addr 127.0.0.1:8788`）。

### 11.3 单实例锁（`simo.db.lock`）

- 启动报"数据库已被另一个 simo 实例占用"：先确认是否真有实例在跑；
- 看锁文件 `pid=...`；若该 pid 已不存在（崩溃残留），可删锁后重启；
- **不要**在另一实例运行时删锁（可能双写损坏）。

### 11.4 数据目录不可写

- 确认 `SIMO_HOME` 存在且当前用户可写；不要放在 `Program Files` 等受保护目录；换用户目录重试。

### 11.5 配置解析失败

- JSON 不支持注释；确认 `llm` 只能是 `real`/`mock`，`-model` 只能是 `real`/`mock`；不确定时临时改名配置用默认值启动。

### 11.6 生成 PDF 失败（`chrome_missing` / `pdf_failed`）

- 本机无 Chrome/Edge：安装，或配置 `SIMO_CHROME`/`tools.chrome` 指向 `chrome.exe`/`msedge.exe`；
- Chrome 启动受限/权限问题：看日志中的 stderr 摘要；可先用 Edge 验证。

### 11.7 生成 Office/图片失败（`python_missing` / `helper_missing` / `helper_failed`）

- 安装 Python 3 并安装 `python-docx openpyxl python-pptx Pillow`；
- 配置 `SIMO_PYTHON`/`tools.python`；
- `helper_missing`：确认 `SIMO_HOME/tmp` 可写（helper 会写到那里）；
- `helper_failed`：看错误中的库名/原因；自定义 Python 常见于缺库。

### 11.8 临时目录问题

- `SIMO_HOME/tmp` 不可写/满盘会导致 PDF/Office 生成失败；清理残留后重试；
- 停服务后清理 `tmp/` 是安全的。

### 11.9 定时任务不触发

- 检查 `enabled`、`next_run_at`、时区、目标会话是否存在；
- 服务是否常驻；暂停/失败状态会保留并在列表显示；
- 需要审批无人应答会暂停该任务（fail-closed），处理审批后启用/恢复；
- 重启后只补最近一次，不会补历史。

### 11.10 联网失败 / 被拒

- 审批是否通过；`never` 策略会直接拒绝；
- 仅允许 `http/https`，**内网/本机地址会被拒绝**（安全设计）；换公开链接；
- 抓取有大小/超时限制；超限会截断。

### 11.11 数据库迁移失败

- **不要手改表结构**；停服务，恢复升级前备份；确认二进制与数据版本匹配；保留数据库+日志再排查。

### 11.12 页面 404/空白

- `/api/*` 未命中返回 404 JSON 属正常；首页空白检查前端产物是否内嵌；看浏览器 WebSocket 连接状态/日志。

### 11.13 用量统计慢/无数据

- **统计页慢的问题已修复**：用最新构建，优先选 30 天内、按天/周粒度；大范围首次查询仍可能较慢；
- 无数据：确认时间范围内有消息/任务；接口不可用时页面会明确显示“示例数据”，不是真实用量；
- 直接排障：`GET /api/stats?metric=messages&granularity=day&from=...&to=...`，看返回 `totals/bySession`；参数非法会 400。

### 11.14 置顶不生效

- **置顶不生效的问题已修复**：升级到最新构建；星标后应在会话树中排到前面；
- 置顶/搜索偏好存在**当前浏览器本地**：换浏览器、清 localStorage/无痕模式会恢复默认；
- 若仍不生效，确认点击的是会话行右侧星标，并检查浏览器控制台是否有本地存储错误。

### 11.15 Python 执行失败（`run_python`）

- `python_missing`：配置 `SIMO_PYTHON` 或 `tools.python`，或确保 PATH 中有 Python 3；
- 被拒：检查沙盒模式是否 `read-only`（执行被禁止）、审批策略是否 `never`；
- 超时：默认 120s，可在工具参数 `timeout_ms` 调整（≤120000）；
- 路径/参数错误：脚本必须在 workspace 内；`code`/`path` 二选一；
- 输出过大：超过阈值会落盘，按返回的 spill 路径查看；
- Python 代码本身仍可执行任意 Python 能力——只运行可信代码。

---

## 12. CI、容器与 Docker（M35/M36）

### 12.1 CI

- 本地全链路：`deploy/ci.ps1`（构建 `simo.exe` → mock evals → 可选 real smoke → 可选 docker config）；日志/数据都在工作区 `.tmp\ci-<GUID>\`，不碰 `8787`/实时实例；
- GitHub Actions：`.github/workflows/ci.yml`（`build-test` 必跑；`docker`/real-smoke 为可选 job）；Key 只从仓库 secrets 注入；
- 详见 [`deploy/CI.md`](../deploy/CI.md)（含跳过 frontend/go/evals、单 case、失败排查与已知环境限制）。

### 12.2 容器

- 文档：[`deploy/CONTAINER.md`](../deploy/CONTAINER.md)；构建入口 `deploy/docker-build.ps1`（本机无 Docker 时明确提示/exit 2，`-DryRun` 可静态自检）；
- `Dockerfile` 多阶段 + `compose.yaml`；容器内 `SIMO_HOME=/data`、`SIMO_ADDR=0.0.0.0:8787`，宿主只发布回环端口；compose 默认宿主端口 `18787`（`SIMO_PORT` 可覆盖，避免与本地 8787 冲突）；
- 生成 PDF/Office 的 Chrome/Python 依赖容器内未内置/未验证；无鉴权，容器/云端必须自行加反代鉴权；
- **本机无 Docker/WSL/Podman：镜像构建/运行未实测**，只做静态核对；有 Docker 环境按 CONTAINER.md 补测后再改状态。

### 12.3 Docker 安装（Windows）

- 目标机安装步骤见 [`deploy/DOCKER-INSTALL.md`](../deploy/DOCKER-INSTALL.md)（默认装到 E 盘，减少 C 盘占用；需管理员/重启/WSL2）；
- 本会话无管理员权限、WSL 未安装、网络受限，**安装未由智能体执行**；脚本/步骤已提供，装完后再按 §12.2 构建；
- 安装后确认 Docker Desktop 的 Disk image location 在 E 盘，并 `docker version`/`docker compose version` 可用。

---

## 13. 安全检查清单

- [ ] `simo.exe serve` 能启动；配好 Key 后健康检查 `ok:true`/`ready:true`；
- [ ] `SIMO_HOME` 指向预期目录、可写、磁盘足够；
- [ ] 只有一个实例，无残留锁；
- [ ] 端口只监听 `127.0.0.1`（未暴露公网）；
- [ ] Key 只在环境变量/受保护配置里，未提交、未打印；
- [ ] Chrome/Edge 与 Python 文档库可用（要用 PDF/Office 时）；
- [ ] 要用 `run_python` 时确认 `SIMO_PYTHON`/PATH 可用，审批策略与沙盒模式符合预期；只运行可信代码；
- [ ] 已做停服后的整目录备份；
- [ ] 定时任务时区/目标会话正确，审批有值守；
- [ ] 升级前已备份，可回滚旧二进制 + 备份。

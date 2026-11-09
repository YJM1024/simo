# M9 实现契约：权限沙盒 + 工具运行时（对齐 DSH）

> 前置：V1（M1–M8）已交付；DSH 对齐基线见 [dsh-alignment.md](dsh-alignment.md)。
> 目标：让 agent 能真正"操作电脑"（读/写/执行），同时不失控。

## 1. 权限模型（两层 × 组合）

### 1.1 沙盒模式（能碰哪里）

| 模式 | 文件 | 执行 | 网络 |
|---|---|---|---|
| `read-only` | 只读（workspace 及只读路径） | 禁止 | 禁止 |
| `workspace-write`（**默认**） | 读写限 `workspace/` | `pwsh` 仅 cwd=workspace | 禁止（web 工具单独授权） |
| `danger-full-access` | 任意路径 | 任意命令 | 允许 |

### 1.2 审批策略（动作前问不问）

| 策略 | 行为 |
|---|---|
| `ask`（每次询问） | 写/执行/网络都弹审批 |
| `auto`（**默认**） | 只读自动通过；写/执行/网络询问 |
| `never` | 不询问；**需审批的动作直接拒绝（fail-closed）**，不偷偷执行 |

- 顶栏常显当前「模式 + 策略」；切换 `danger-full-access` 需二次确认。
- 无审批应答器（如 WS 断开）→ 一律拒绝。

### 1.3 单次提权（对齐 DSH）

- 工具调用可带 `sandbox_permissions`（只允许**严格更宽一档**：read-only→workspace-write→danger-full-access）+ `justification`（必填）。
- 提权仅本次调用有效，必须走审批，记审计；不允许跨档跳级。

## 2. 工具集（M9，命名对齐 DSH）

| 工具 | 参数（关键） | 风险 | 默认审批 |
|---|---|---|---|
| `read` | `file_path`, `offset?`, `limit?` | 读 | auto |
| `glob` | `pattern`, `path?` | 读 | auto |
| `grep` | `pattern`, `path?`, `include?` | 读 | auto |
| `write` | `file_path`, `content`, `sandbox_permissions?`, `justification?` | 写 | ask |
| `edit` | `file_path`, `old_string`, `new_string`, `replace_all?` | 写 | ask |
| `pwsh` | `command`, `timeout_ms?`, `sandbox_permissions?`, `justification?` | 执行 | ask |

- 兼容旧名：`read_file`→`read`、`list_dir`→`glob`、`search_text`→`grep`（内部映射，不新增两套实现）。
- 工具失败**不结束 turn**；返回 `Error: <message>` + 稳定 `code` + 恢复提示。

## 3. 执行语义

- `pwsh`：进程树执行；`cwd` 默认 `workspace/`；**每次重建环境变量**（只传 PATH/HOME/TEMP 等白名单，不继承 API key）；`DSH_*` 类变量不注入。
- `[exit code: N]` 是**正常结果**，不是工具错误。
- 超时：默认 120s，超时终止进程树并返回结构化结果；可选转后台作业（M9 先不做持久终端）。
- 输出：stdout/stderr 各 ≤64KB inline；超出落盘到 `SIMO_HOME/artifacts/spill/<id>.txt`，返回 `Omitted N bytes; full result at <path>`。
- 写操作：先 canonicalize 路径，校验在允许根内（workspace/artifacts/uploads）；**写前校验读权限**（读不到的路径不能写）；拒绝符号链接穿越。
- 危险命令模式（删除、格式化、关机、注册表等）**一律 ask**，`never` 下直接拒绝。

## 4. 审批与审计

- 审批记录：`approvals` 表扩展 `risk, tool, args, sandbox, decision, decided_at, session_id`。
- API：`GET /api/approvals`、`POST /api/approvals/{id}`（沿用 M5）；新增 `GET /api/permissions`（当前模式/策略）、`POST /api/permissions`（切换，full 需确认标记）。
- 审计：每次工具调用记 `tool.call` 事件（tool/args 摘要/结果/耗时/是否提权）。
- 前端：审批条显示**风险等级 + 命令原文 + 影响范围**；允许一次 / 本会话允许 / 拒绝。

## 5. 验收（M9）

1. 默认 `workspace-write + auto`；read/glob/grep 直接成功；write/pwsh 弹审批，拒绝即不执行；
2. `pwsh` 执行 `echo hi` 返回输出+`[exit code: 0]`；写 workspace 文件成功；写 workspace 外被拒；
3. 切 `danger-full-access` 需确认；切回生效；
4. 单次提权：带 justification 申请宽一档，审批通过才生效，审计可见；
5. 大输出落盘 + inline 提示；超时终止；env 不含 API key；
6. `never` 模式下需审批动作被拒（fail-closed）；
7. `go vet/test`、`tsc`、构建、M1–M8 evals 全绿 + M9 新 case。

## 6. 边界

- M9 不做浏览器、不做网络、不做持久终端/后台作业（M10/M11）；
- 不做完整 OS 级沙盒（Windows Job 对象/低完整性级别留 P1）；M9 的隔离靠路径策略 + 环境清理 + 审批。

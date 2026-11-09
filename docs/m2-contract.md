# M2 实现契约（Lead 定义，实现以此为准）

> 前置：M1 验收通过（WebSocket + SQLite + 事件日志 + 三栏 + 模块化）。
> 技术栈见 [tech-stack.md](tech-stack.md)；交互语义见 design/13、19、14。

## 1. 目标（M2 一句话）

**把"外壳"变成"能连续对话的秘书"**：接真模型（deepseek-flash），连续步进，消息不打断后台工作，撤回/修正生效，任务可异步并行。

## 2. 范围

**包含**
1. 真模型接入：DeepSeek `deepseek-flash`，OpenAI 兼容，WebSocket 流式。
2. 对话 Loop（E1 最小版）：Turn/Step、Intent Frame、决策 `ANSWER / CLARIFY / CALL_TOOL / DELEGATE / WAIT / CLOSE`。
3. 消息分类与语义：Refine / Correct / NewTask / Ack；**默认并行，仅显式修正/停止才影响执行**。
4. 撤回：流式未完成的回复可撤回，WS 发 `reply.retracted`，UI 显示"已撤回"。
5. 歧义处理：高风险/歧义大 → 先问；否则先按最可能理解做 + 一句确认。
6. 任务异步：`DELEGATE` 创建后台任务（本阶段用 Mock 执行器），回复不被任务阻塞；任务完成回流。
7. 六步权限求值骨架（hooks→deny→ask→mode→allow→canUseTool），工具集先只读。
8. token 计量：使用 provider usage；记录 reasoning_tokens；按角色配置 reasoning_effort。
9. E0：新增 M2 case（撤回、并行任务、不打断、reasoning 处理）。

**不包含**：会话树/子会话（M4）、Spec/计划/验收门（M3+）、长任务面板详情（M5）、记忆页（M3）。

## 3. 模型适配层（`internal/platform/llm`）

- 接口：
  ```go
  type Message struct { Role string; Content string; ReasoningContent string; ToolCalls []ToolCall; ToolCallID string }
  type ChatRequest struct { Model string; Messages []Message; Tools []Tool; ReasoningEffort string; Thinking *Thinking; MaxTokens int }
  type Event struct { Kind string; Delta string; ReasoningDelta string; Usage *Usage; ToolCall *ToolCall; Done bool; Err error }
  type Provider interface { Stream(ctx context.Context, req ChatRequest) (<-chan Event, error) }
  ```
- 实现：`deepseek.go`（OpenAI 兼容 SSE 客户端，用 net/http 读 SSE 流）。
- 配置：`backend/config.local.json` → `model`, `reasoning.byRole`, `maxOutputTokens`。
- **纪律**：
  - 带 `tools` 的请求，后续消息必须回传 `reasoning_content`；
  - `reasoning_content` 只入执行轨迹（WS 可发 `trace.reasoning`），**不进入给用户看的正文**；
  - 思考模式忽略 temperature 等参数，不依赖它们做确定性。
- 单元测试：用 `mock.go`（脚本化流）覆盖正常/工具调用/错误/超时。

## 4. Loop（`internal/modules/chat`）

- 状态：`Idle → Speaking → Acting`（Acting 与 Speaking 可并存）。
- 每步：组装上下文（M2 最小：系统规则+人格+最近消息+Intent Frame）→ 调模型 → 解析决策 → 执行/回复 → 更新事件。
- **Intent Frame**（持久化为事件）：`goal, constraints[], focus, openTasks[], lastUserMsgId`。
- 决策解析：`DecisionEnvelope`（JSON Schema），失败四道闸（JSON 修复重试→schema 重试→语义失败 fail-closed→降级）。
- **不阻塞**：`DELEGATE` 立即返回 taskId，回复继续；任务完成以事件回流。

## 5. 消息语义（WS 增量）

客户端 → 服务端新增：
| type | data | 说明 |
|---|---|---|
| `chat` | `{sessionId, text}` | 普通消息（默认不打断） |
| `correct` | `{sessionId, targetMessageId?, text}` | 显式修正/停止；只影响指定回复或当前任务 |

服务端 → 客户端新增：
| type | data |
|---|---|
| `reply.created` | `{id, sessionId, role:"agent", status:"streaming"}` |
| `reply.delta` | `{id, delta}` |
| `reply.done` | `{id, status:"done"}` |
| `reply.retracted` | `{id, reason}` |
| `task.created` | `{id, title, status:"queued"}` |
| `task.updated` | `{id, status:"running"\|"done"\|"failed", summary?}` |
| `trace.reasoning` | `{id, delta}`（前端默认折叠） |
| `error` | `{code, message}` |

- 普通 `chat` 立即回 `reply.created`，不等待任何后台任务；
- 撤回：正在流式输出的 reply 收到 `correct` → 停止、发 `reply.retracted`、基于新消息重新回答。

## 6. 权限（六步骨架）

顺序：hooks → deny 规则 → ask 规则 → 权限模式 → allow 规则 → canUseTool。
- M2 工具：`read_file`、`list_dir`、`search_text`（只读）；`write_file` 默认 deny（M5 再开）。
- 自动批准的工具永远不到 `canUseTool`（记录警告）；`bypassPermissions` 下 deny 仍生效。
- 工具调用失败不结束 turn。

## 7. 数据库增量（`schema_migrations` 模块命名空间）

- `turns(id TEXT PK, session_id TEXT, status TEXT, started_at INT, ended_at INT)`
- `tasks(id TEXT PK, session_id TEXT, title TEXT, kind TEXT, status TEXT, payload TEXT, created_at INT, updated_at INT)`
- `decisions(id TEXT PK, turn_id TEXT, kind TEXT, payload TEXT, created_at INT)`
- 所有写经单写者；事件先落库。

## 8. E0（M2 增量）

新增 case（全部确定性可跑）：
1. `reply-retraction`：发消息 → 流式中发 `correct` → 收到 `reply.retracted`；旧 content 不保留在历史（标记 retracted）。
2. `parallel-tasks`：连发 3 条任务 → 收到 ≥3 个 `reply.created` + ≥3 个 `task.created`；任一任务完成不阻塞其余回复。
3. `no-interrupt`：任务运行中发普通消息 → 收到回复，任务状态不变（仍 running）。
4. `reasoning-echo`：带工具调用两轮 → 第二轮请求包含第一轮 `reasoning_content`（用 mock provider 断言）。
5. `ambiguity`：高风险请求（如删除）→ 模型输出 CLARIFY 而非直接执行。

## 9. 验收（M2 必须全过）

1. `simo.exe` 启动 + 浏览器打开；发消息得到真模型流式回复；
2. 连发三条任务：三条回复 + 三个任务并行，互不阻塞；
3. 流式中发"停/别做"：该回复撤回，其他任务不受影响；
4. 刷新/重启后会话、任务、撤回状态不丢；
5. `go vet`、`go test ./...`、`tsc --noEmit`、构建、`evals/run.mjs`（M1+M2 cases）全绿；
6. token 使用量记录（含 reasoning tokens）可在日志/接口查到。

## 10. 交付边界与纪律

- 不改 M1 契约已有行为（除契约允许的增量）；
- 模块化不退化（chat 模块不得 import tasks 模块；通过 core 事件/接口通信）；
- 所有模型调用走 `platform/llm`，业务模块不直接发 HTTP；
- API key 只从配置/环境变量读取，不写日志。

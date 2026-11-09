# M1 实现契约（Lead 定义，实现以本文件为准）

> 目标：可启动的单体骨架 —— 三栏 UI、**WebSocket** 流式、SQLite 持久化、事件日志、三屏障检查点、token 计量、E0 骨架。
> 技术栈以 [tech-stack.md](tech-stack.md) 为准（**WebSocket + TypeScript + Tailwind v4**）。
> 所有实现必须遵守本契约的接口/路径/表结构；如需变更，先改本文件并通知 Lead。

## 1. 仓库与包结构（Go 1.27，module `agentd`）

```
agentd/
├── go.mod
├── cmd/agentd/main.go          # serve 命令（-addr, -db）
├── internal/
│   ├── platform/               # 基础设施（config/httpserver/sqlite/log/tokenmeter）
│   ├── core/                   # 内核（eventlog/store/module）
│   └── modules/                # 业务模块（sessions/chat/tasks）
├── internal/webui/embed.go     # //go:embed dist
└── internal/webui/dist/        # 由 web/ 构建生成
```

前端：`web/`（**React 19 + TypeScript + Tailwind CSS v4** + esbuild，产物输出到 `agentd/internal/webui/dist`）。

## 2. 数据库（SQLite，单文件，单写者）

- 驱动：`modernc.org/sqlite`（纯 Go，v1.61.x）；Go 模块经 `https://goproxy.cn,direct` 拉取（见 `toolchain/go.ps1`）。
- 默认路径 `~/.agentd/agentd.db`（可用 `-db` 覆盖）；启动取进程级文件锁，第二个实例启动失败。
- 表（M1 最小集）：
  - `events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL)`
  - `sessions(id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0)`
  - `messages(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL)`
- **所有写操作必须经单写者入口**；事件先落库再返回/推送（三屏障检查点 M1 版：`Flush()` + 写前调用）。
- 迁移：`schema_migrations(module TEXT, version INTEGER)`；启动时幂等执行。

## 3. HTTP / WebSocket（M1 契约）

### 3.1 REST

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/api/health` | `{ok:true, time}` |
| GET | `/api/sessions` | `{sessions:[{id,title,createdAt,archived}]}`（M1 至少一个默认会话） |
| GET | `/api/messages?sessionId=` | `{messages:[{id,sessionId,role,text,at,status}]}`；必须按 sessionId 过滤 |
| POST | `/api/chat` | 请求 `{sessionId?, text}`；返回 202 `{ok:true, messageId}`；空文本 400 |
| GET | `/` | React `index.html`（`/api/*` 未命中必须返回 404 JSON，不得落入 SPA fallback） |

### 3.2 WebSocket

- 端点：`GET /api/ws?sessionId=<id>&since=<eventId?>`，升级为 WebSocket（库：`github.com/coder/websocket` v1.8.15）。
- 每标签页一条连接；单用户单机。
- 所有帧为 JSON，统一信封：`{ "type": string, "data": object }`。

客户端 → 服务端：

| type | data | 说明 |
|---|---|---|
| `subscribe` | `{sessionId, since?}` | 连接后发送；`since` 为上次收到的事件 id，服务端补发之后的增量 |
| `chat` | `{sessionId?, text}` | 等价于 POST /api/chat（前端二选一，推荐 WS 统一） |
| `ping` | `{}` | 心跳（也可用库的 control ping） |

服务端 → 客户端：

| type | data |
|---|---|
| `hello` | `{at}` |
| `message.created` | 完整 Message |
| `message.delta` | `{id, delta}` |
| `message.done` | `{id, status}` |
| `status` | `{state:"thinking"\|"idle"}` |
| `error` | `{code, message}` |

- 心跳：服务端每 30s ping；客户端断线指数退避重连（1s→2s→4s，上限 30s）。
- 续接：重连带 `since`，服务端从事件日志补发；客户端按事件 id 去重。
- 消息大小上限 1 MiB；超限关闭连接并记日志。

## 4. Mock 模型

- M1 使用 `internal/modules/chat/mock`：对用户消息流式回显固定文本，分片 40–60ms。
- 真实模型放 M2：DeepSeek（`deepseek-flash`，OpenAI 兼容，`reasoning_effort` 可调）。

## 5. 前端三栏（M1）

- **TypeScript（.tsx）+ Tailwind v4**；三栏：左会话树（M1 单根"主会话"）/ 中消息流 + 输入 / 右长任务面板（空态"暂无长任务"）；顶栏连接状态。
- **WebSocket 客户端**：连接 `/api/ws`，`subscribe` 带 `since`；自动重连/退避/去重/流式追加/滚动到底。
- 主题：`theme-light-tech` 浅色科技风 + 语义 token（CSS 变量 + Tailwind `@theme inline`），禁止硬编码颜色。
- 类型检查：`tsc --noEmit` 必须通过；构建 `node build.mjs` 出 `app.js` + `app.css`。

## 6. E0 骨架（M1 最小）

- 目录 `evals/`：cases（JSON）、run.mjs、graders（regex/state_delta/forbidden/file_exists）。
- M1 至少 3 条 case：健康检查、消息持久化、**WebSocket 事件顺序**（hello→message.created→status→message.delta→message.done）。
- Node 24 原生 `WebSocket` 客户端；`BASE_URL` 默认 `127.0.0.1:8787`；退出码 0=PASS、1=FAIL、2=服务未启动。

## 7. M1 验收（必须全过）

1. 干净数据目录 + 一条命令启动，浏览器打开即用；
2. 发消息 → 流式返回 → 刷新不丢；
3. 重启进程后消息仍在；
4. `go vet ./...`、`go test ./...`、`tsc --noEmit`、前端构建全部通过；
5. `evals/` 能跑通 3 条 case（含 WS 顺序）；
6. 无遗留 TODO 阻塞 M2。

## 8. 交付边界

- 只实现 M1 范围；不提前做 M2+ 的撤回/会话树/Spec/长任务。
- 新依赖规则：能用标准库就不用三方；引入的依赖必须能通过 `goproxy.cn` / npm 拉取，且许可证可接受。

## 9. 模块化架构（强制，非建议）

### 9.1 后端分层

```
agentd/internal/
├── platform/            # config | httpserver(含 WS writer) | sqlite | log | tokenmeter
├── core/                # eventlog | store | module(接口+Registry)
└── modules/             # sessions | chat(mock+WS 推送) | tasks(M1 空模块，验证插拔)
```

- `Module` 接口：`ID() / DependsOn() / Migrations() / Register(mux) / Start(ctx) / Stop(ctx)`。
- 启动时由 `cmd/agentd` 的 Registry 注册；配置可 enable/disable 模块。
- **模块间禁止直接 import**；通过 core 接口/事件通信。架构测试 `internal/core/module/archtest_test.go` 扫描 import 图，跨模块 import 即失败。
- 迁移按模块命名空间（`schema_migrations(module, version)`）。

### 9.2 前端模块化

```
web/src/
├── app/                 # 壳：布局、三栏骨架、providers
├── platform/            # http/ws 客户端、主题 token、持久化
└── features/            # sessions | chat | tasks，各自 manifest
```

- 每个 feature 导出 `manifest`：`{ id, slots: {leftTree?, center?, rightPanel?}, init? }`。
- `app` 通过 `features/registry.ts` 组合；**features 之间禁止互相 import**。
- 加/删功能 = 增删一个 feature 目录 + registry 一行。
- 主题只走 `platform/theme` 的语义 token，禁止硬编码颜色。
- `scripts/check-modularity.mjs` 扫描 features 间 import，发现即失败。

### 9.3 验收追加

- 后端：架构测试通过；空 `tasks` 模块可 enable/disable；
- 前端：manifest 注册可用；模块度检查通过；`tsc --noEmit` 通过；
- 文档：`agentd/README.md` 与 `web/README.md` 各有一节"如何新增一个模块"。

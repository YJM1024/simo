# 技术栈（冻结版 v2）

> 原则：**先定清楚，后写代码**；任何变更必须更新本文件并记版本。
> v2 变更（2026-11-07）：**WebSocket 取代 SSE**；**TypeScript 取代 JavaScript**；Postgres/Redis/MQ、Docker/K8s、第三方 UI 组件库改为「按需使用」。

## 1. 一句话

**Windows 本地单机 Web 应用**：Go 单体（内嵌前端、SQLite 持久化、**WebSocket 流式**）+ React 19 + **TypeScript** + Tailwind CSS v4，单二进制交付。

## 2. 运行时与工具链（固定版本）

| 项 | 版本 / 选择 |
|---|---|
| OS | Windows 10/11 x64（Windows-first） |
| Go | **1.27.3**（工作区自包含） |
| Node | **24.21.0** |
| pnpm | **11.28.5** |
| Go 模块代理 | **`https://goproxy.cn,direct`**（proxy.golang.org 本机不可达；GOSUMDB=off） |
| 交付物 | 单个 `simo.exe`（前端 `embed.FS` 内嵌） |

## 2.5 运行拓扑：持久化沙盒（所有会话共享一个常驻实例）

- **一个常驻实例**：`agentd` 是长生命周期服务；会话/子会话/任务都是它内部的数据，**不按会话创建容器**。
- **持久数据根 `AGENTD_HOME`**（默认 `%USERPROFILE%\.agentd`，可用环境变量覆盖）：
  ```
  AGENTD_HOME/
  ├── agentd.db          # SQLite（事件日志/会话/消息/任务）
  ├── artifacts/         # 产物
  ├── workspace/         # 工具执行沙盒（读写限定在此）
  ├── logs/
  └── config.local.json  # 可选，覆盖默认配置
  ```
- **迁移/上云**：拷贝或挂载 `AGENTD_HOME` + 同一镜像即可；业务代码禁止硬编码宿主绝对路径。
- **沙盒边界**：工具读写限定在 `workspace/` 与 `artifacts/`（权限层强制）；V1 无 OS 级隔离，容器版由容器提供。
- **部署形态**：
  - 本机（当前）：单二进制常驻进程 + 持久目录（逻辑沙盒，等价语义）；
  - 容器（交付物）：`deploy/Dockerfile` + `deploy/compose.yaml`（多阶段构建、非 root、只挂载 `AGENTD_HOME` 卷）；
  - 云端：同镜像 + 持久卷；对外访问需加鉴权（P1）。
- **本机限制**：当前机器无 Docker/WSL/Podman，容器交付物**无法本地实测**，标记为"已编写、待容器环境验证"。

## 3. 后端技术栈

| 类别 | 选择 |
|---|---|
| 语言 | Go 1.27（CGO 关闭优先） |
| HTTP | 标准库 `net/http` + ServeMux |
| **流式** | **WebSocket**（`github.com/coder/websocket` **v1.8.15**）；端点 `/api/ws` |
| 数据库 | **SQLite**（`modernc.org/sqlite` **v1.61.x**，纯 Go、WAL、单写者） |
| 迁移 | 自研 `schema_migrations(module, version)` |
| 配置 | JSON 本地文件 + 环境变量覆盖（`agentd/config.local.json` 不入库） |
| 日志 | `log/slog` |
| 测试 | `go test` + `httptest` + 架构测试 |
| 模块化 | 自研 `Module` 接口 + Registry |

**按需启用（V1 不用，后续按需要）**：PostgreSQL、Redis、消息队列（NATS/Kafka 等）；届时只替换 `platform/sqlite` 或事件总线实现，不动业务模块。

## 4. 前端技术栈

| 类别 | 选择 |
|---|---|
| 框架 | **React 19.3.1** |
| 语言 | **TypeScript 7.0.2**（`.tsx`，strict） |
| 类型包 | `@types/react` **19.3.0**、`@types/react-dom` **19.3.0** |
| 样式 | **Tailwind CSS 4.3.5**（官方 CLI，CSS-first `@theme inline` + CSS 变量） |
| 主题 | 自研 token 体系；默认 `theme-light-tech`；256 主题 P1 |
| 构建 | **esbuild 0.28.2（JS/TS） + @tailwindcss/cli 4.3.5（CSS）**；`tsc --noEmit` 做类型检查 |
| 流式客户端 | **原生 `WebSocket`**（带重连/退避/去重/`since` 续接） |
| HTTP | 原生 `fetch` |
| 状态 | `useState/useReducer/useContext` |
| 路由 | 无（单页三栏）；P1 再评估 |
| 测试 | `node:test`（评测/纯逻辑）；组件测试 P1 |

**按需启用**：第三方 UI 组件库（如 Radix/Headless UI）、状态库（Redux/Zustand）、路由库——**需要时再引入**，引入前须评估主题兼容与包体积。

## 5. 模型接入

| 项 | 选择 |
|---|---|
| Provider | DeepSeek（OpenAI 兼容），`https://api.deepseek.com` |
| 模型 | **仅 `deepseek-flash`** |
| 推理强度 | `reasoning_effort: low/high/max` 按角色；快速路径可 `thinking: disabled` |
| 流式 | WebSocket 帧推送；`reasoning_content` 默认不展示、入执行轨迹 |
| 工具调用 | 原生 tool calling；**带 tools 的后续请求必须回传 `reasoning_content`** |
| Key 存储 | 本地配置/环境变量；不入库、不进日志 |

## 6. 构建与运行

```powershell
cd web
node ..\toolchain\pnpm-run.mjs install   # 首次（或按现有方式跑 pnpm）
node build.mjs                           # Tailwind CSS + esbuild JS + tsc --noEmit

cd ..\agentd
..\toolchain\go.ps1 build -o simo.exe ./cmd/agentd
.\simo.exe serve -addr 127.0.0.1:8787
```

- 产物：`agentd/internal/webui/dist/{index.html,app.js,app.css}`。
- 开发：`node build.mjs --watch`（esbuild + tailwind watch）；不引入 Vite。

## 7. 质量门禁

| 门 | 工具 |
|---|---|
| Go 格式/静态 | `gofmt`、`go vet` |
| Go 测试 | `go test ./...`（httptest + 架构测试） |
| 类型检查 | `tsc --noEmit`（strict） |
| 前端构建 | `node build.mjs` |
| 模块度 | 后端架构测试 + 前端 `check-modularity.mjs` |
| 评测 | `evals/run.mjs`（WebSocket 用例；WITH/W/OUT/Δ；B0–B3） |
| 验收 | 每个里程碑按 `design/15` 演示脚本 |

## 8. 按需/暂不采用

| 项 | 状态 |
|---|---|
| PostgreSQL / Redis / MQ | **按需**（V1 SQLite + 进程内总线；数据量/并发上来再评估） |
| Docker / K8s | **按需**（V1 单二进制；需部署多机再评估） |
| 第三方 UI 组件库 | **按需**（V1 Tailwind + 自研组件，保证主题可控） |
| 状态库 / 路由库 | 按需（V1 原生 hooks） |
| TypeScript | **采用**（v2 起） |
| SSE | V1 不采用（WebSocket 一次到位） |
| Vite | 不采用（本机 pnpm/Vite 兼容问题，esbuild 足够） |
| Gin/Echo/GORM | 不采用（标准库 + database/sql 够用，减少依赖） |
| 分布式/多用户 | 非目标（单机单用户） |

## 9. 变更规则

- 本文件是技术栈唯一真相；改技术栈 = 改本文件 + 记版本 + 迁移成本说明。
- 新依赖须回答：能否标准库替代？能否离线/镜像拉取？许可证是否可接受？
- 大版本升级走一次完整 E0 回归。

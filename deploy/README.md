# agentd 容器交付物（deploy/）

> **便携包 / 安装 / 升级 / 备份恢复（M29）**：见 [`INSTALL.md`](INSTALL.md)（`package.ps1`、`install.ps1`、`upgrade.ps1`、`backup.ps1`、`restore.ps1`、`start.ps1` 加固）。
> **容器部署 / 升级 / 备份 / FAQ（M36）**：见 [`CONTAINER.md`](CONTAINER.md)；构建入口 `docker-build.ps1`（本机无 Docker 会明确提示）。
> **最终便携包（M41）**：`deploy/dist/simo-M41-win-x64.zip`（SHA256 `6b62bf3c2a52baf97fd51017dc0e07e212ca5b5d2219ce26b66af45c421b9753`，≈11.61 MB；包内 exe `4905F6C7C932021EF5EC548C0D14093795617E3BEF6ADE4373412EB8C2D89421`）。
> **Docker 安装（M36）**：见 [`DOCKER-INSTALL.md`](DOCKER-INSTALL.md)（Windows；需管理员/重启/WSL2，默认 E 盘）。
> **CI（M35）**：见 [`CI.md`](CI.md)（`deploy/ci.ps1` 一条命令 + `.github/workflows/ci.yml`；可选 real-smoke / docker job）。
> 下文是**容器**交付物说明（本机无 Docker，仍按"已编写/待容器环境验证"对待）。

把 `agentd`（Go 单体 + 内嵌 React 前端）打成**非 root、持久化、单实例**的容器镜像，并提供单机 Compose 编排。

> **状态（重要）**：本机（Windows）**没有 Docker / WSL / Podman**，因此镜像**构建与运行未经验证**。
> M1–M36 能力/评测数字/已知限制以 [`docs/release-notes-v1.md`](../docs/release-notes-v1.md) 与 [`evals/RELEASE.md`](../evals/RELEASE.md) 终值为准；本文件只描述容器静态核对。
> 本文所有"验证状态"都按 **已实测 / 未验证** 分开标注，见 [§7 验证状态](#7-验证状态实测与未验证)。
> 依据：`docs/tech-stack.md` §2.5（运行拓扑 / `AGENTD_HOME`）、`docs/m1-contract.md`（构建命令 / HTTP 契约）。

---

## 1. 文件清单与职责

| 文件 | 作用 |
|---|---|
| `Dockerfile` | **主镜像**：3 阶段（web 构建 → Go 编译 → alpine 非 root 运行），带 HEALTHCHECK。另含可选的 `runtime-distroless` 目标。 |
| `Dockerfile.go-only` | **备选镜像**：跳过 node 阶段，只编译 Go（复用本机已构建的前端产物）。用于容器内 npm/网络不可用的环境。 |
| `docker-build.ps1` | **M36 构建入口**：检查仓库上下文；无 Docker 时明确提示并退出 2；`-DryRun` 可无 Docker 做静态自检。 |
| `CONTAINER.md` | **M36 容器运维文档**：部署/升级/备份恢复/FAQ；含 E: 盘数据目录和 distroless 说明。 |
| `compose.yaml` | 单机编排：`127.0.0.1:18787`（默认，可 `AGENTD_PORT` 覆盖）、命名卷 `agentd-data:/data`、`restart: unless-stopped`、健康检查、最小权限。 |
| `.dockerignore` | 构建上下文排除清单（**规范内容**；见 §2.2 关于生效方式的说明）。 |
| `Dockerfile.dockerignore` | BuildKit 实际生效的排除清单（`<Dockerfile 路径>.dockerignore` 规则）。 |
| `Dockerfile.go-only.dockerignore` | 备选镜像专用排除清单（**不排除** `agentd/internal/webui/dist`）。 |
| `run-local.ps1` | 无 Docker 时用"同一二进制 + 隔离 `AGENTD_HOME` + 端口覆盖 + `/api/health`"模拟容器运行时语义（可本机实测）。 |

---

## 2. 构建

### 2.1 前置

| 项 | 要求 | 说明 |
|---|---|---|
| Docker | **24+ / BuildKit**（Compose v2） | 需要 BuildKit 的 `--target` 与 Dockerfile 专属 ignore 文件能力 |
| 网络 | 能访问 `goproxy.cn`（Go 模块）与 npm registry | `GOPROXY` 可用 `--build-arg` 覆盖 |
| 镜像 tag | `node:24-bookworm-slim` / `golang:1.27-alpine` / `alpine:3.22` | **`golang:1.27` 是否已有官方 tag 未验证**；若没有，用实际存在的 `1.27.x` 补丁 tag（`go.mod` 要求 `go 1.27`） |
| 平台 | 默认构建宿主架构（linux/amd64） | Apple Silicon 可用 `--platform linux/amd64`（未验证） |

### 2.2 构建上下文与 `.dockerignore` 的真相

构建上下文必须是**仓库根**（镜像要同时 `COPY web/` 与 `agentd/`）：

```bash
docker build -f deploy/Dockerfile -t agentd:local .
```

Docker 只认两种排除文件：

1. 构建上下文**根目录**的 `.dockerignore`；
2. `<Dockerfile 路径>.dockerignore`（BuildKit 特性）。

所以：`deploy/.dockerignore` **本身不会被 Docker 读取**，它是规范内容；`deploy/Dockerfile.dockerignore` 才是 `-f deploy/Dockerfile` 场景实际生效的那份。
若你更习惯根目录 `.dockerignore`，把 `deploy/.dockerignore` 复制/链接为仓库根 `.dockerignore` 即可（两者内容需保持一致）。

> 不配 ignore 也能构建，但上下文会包含 `toolchain/`（Windows 版 Go，数百 MB）与 `web/node_modules`，构建明显变慢。

### 2.3 命令

```bash
# Compose（推荐：会读 deploy/compose.yaml 里的 build.args）
docker compose -f deploy/compose.yaml build

# 或直接 docker build
docker build -f deploy/Dockerfile -t agentd:local .

# 备选：容器内 npm 不可用 / 复用本机前端产物
#   先在本机构建前端：cd web && node build.mjs   （产物落在 agentd/internal/webui/dist）
docker build -f deploy/Dockerfile.go-only -t agentd:local .

# 可选：更小的 distroless 运行镜像（无内置 HEALTHCHECK，见 §6.4）
docker build -f deploy/Dockerfile --target runtime-distroless -t agentd:distroless .
```

镜像 tag 建议：`agentd:<git-sha>` 或 `agentd:<date>`；`agentd:local` 仅用于本机。

---

## 3. 运行

### 3.1 Compose（推荐）

```bash
docker compose -f deploy/compose.yaml up -d --build
docker compose -f deploy/compose.yaml ps          # 等 STATUS 出现 (healthy)
docker compose -f deploy/compose.yaml logs -f agentd
```

浏览器打开：<http://127.0.0.1:18787>（默认；`AGENTD_PORT` 可覆盖）

> `compose.yaml` 当前显式设置了 `AGENTD_MODEL: mock`（无 Key 也能启动）；要用真实模型请改为
> `real` 并注入 `DEEPSEEK_API_KEY`（不要写进镜像/Compose 文件）。

```bash
docker compose -f deploy/compose.yaml down        # 停容器，保留命名卷 agentd-data
```

### 3.2 docker run（等价；示例为无 Key 的离线模式）

```bash
docker volume create agentd-data
docker run -d --name agentd \
  -p 127.0.0.1:18787:8787 \
  -e AGENTD_HOME=/data \
  -e AGENTD_ADDR=0.0.0.0:8787 \
  -e AGENTD_MODEL=mock \
  -v agentd-data:/data \
  --restart unless-stopped \
  agentd:local
```

> `AGENTD_MODEL=mock` 仅用于无 Key 的离线演示。要用真实模型：去掉该行（二进制默认 `real`），
> 并通过 `env_file`/Secret 注入 `DEEPSEEK_API_KEY`，不要写进镜像。

### 3.3 为什么必须设置 `AGENTD_ADDR=0.0.0.0:8787`

`agentd` 默认监听 `127.0.0.1:8787`（`cmd/agentd/main.go`），**容器内回环 ≠ 宿主端口**。不改的话端口映射不通。
镜像与 compose 里都已设置 `AGENTD_ADDR=0.0.0.0:8787`；宿主侧默认只发布 `127.0.0.1:18787`（`AGENTD_PORT` 可覆盖）（不对外网暴露）。

---

## 4. 配置与密钥

### 4.1 环境变量（`cmd/agentd/main.go` 支持）

| 变量 | 默认 | 说明 |
|---|---|---|
| `AGENTD_HOME` | `%USERPROFILE%\.agentd`（容器内 `/data`） | 持久数据根；容器里必须指向卷 |
| `AGENTD_ADDR` | `127.0.0.1:8787` | **容器内必须改 `0.0.0.0:8787`** |
| `AGENTD_PORT` | `18787` | **Compose 宿主端口**（不进入容器 env；避免与用户 8787 冲突） |
| `AGENTD_DATA_MOUNT` | `agentd-data` | **Compose 数据目录**：命名卷名或宿主路径（Windows 用 `E:/simo-data`） |
| `TZ` | `Asia/Shanghai` | 镜像/Compose 时区（alpine runtime 含 tzdata） |
| `AGENTD_MODEL` | `real` | `real`（默认，需 API Key）或 `mock`（离线体验；compose 示例显式设为 mock） |
| `AGENTD_MEMORY_V3` | 开 | 记忆 v0.3 读开关；`0/false/off/v2` 回退旧表（排障用，不影响 M24/M26） |
| `AGENTD_RECALL_R2` | 开 | 召回 R2（2 跳+agentic）；`0/false/off/v1/r1` 回退 R1 |
| `AGENTD_RECALL_VECTOR` | 关 | 本地字符 n-gram TF-IDF 向量；默认关（`1/true/on/yes` 开启并与关键词/图谱融合） |
| `AGENTD_MEMORY_CONSOLIDATE` | 开 | 记忆自动巩固；`0/false/off/no` 关闭 |
| `AGENTD_MEMORY_CONSOLIDATE_THRESHOLD` | 8 | 巩固阈值（未处理消息数） |
| `AGENTD_MEMORY_CONSOLIDATE_INTERVAL_SEC` | 300 | 巩固间隔秒 |
| `AGENTD_MAX_CONCURRENCY` | 3 | 全局任务并发上限（1–32） |
| `AGENTD_WORKFLOW_CONCURRENCY` | 3 | 单工作流并发上限（1–32） |
| `AGENTD_TASK_EXECUTOR` | `task-npc` | 子任务执行者：`task-npc`（默认）/ `simo` |
| `AGENTD_MODULES` | `sessions,chat,tasks,memory` | 覆盖启用的模块（4 个：sessions/chat/tasks/memory） |
| `AGENTD_DISABLE_MODULES` | 空 | 禁用模块（逗号分隔，例如 `tasks`） |

优先级：**flag > env > `<AGENTD_HOME>/config.local.json` > 默认值**。

### 4.2 配置文件（可选）

`config.local.json` 放在卷里（`/data/config.local.json`），或在 compose 里挂载只读文件：

```yaml
    volumes:
      - agentd-data:/data
      - ./agentd-config.json:/data/config.local.json:ro
```

### 4.3 密钥不入镜像（真实模型时）

- **绝不**用 `--build-arg` / `ENV` 把 API Key 写进 Dockerfile 或镜像层（镜像可被 `docker history` 与层导出读到）。
- 推荐：`env_file`（`.env` 不提交、`.dockerignore` 已排除 `.env`/`.env.*`）或 Docker secrets / 编排平台的 Secret 挂载。
- 运行时注入即可：`docker run -e DEEPSEEK_API_KEY=...`（或 `--env-file .env`），日志里不要打印密钥（`AGENTD_HOME/logs` 与 stdout 均按约定不记录密钥）。

```bash
# .env 示例（不要提交）
DEEPSEEK_API_KEY=sk-***
```

---

## 5. 持久化、备份与迁移

### 5.1 `AGENTD_HOME` 布局（与 docs/tech-stack.md §2.5 一致）

```text
/data/                     # = AGENTD_HOME（命名卷 agentd-data）
├── agentd.db              # SQLite：事件日志/会话/消息/任务（WAL 模式）
├── agentd.db-wal / -shm   # SQLite WAL 附属文件（运行期存在）
├── agentd.db.lock         # 单写者文件锁（保证单实例）
├── artifacts/             # 产物
├── workspace/             # 工具执行沙盒（读写限定在此）
├── logs/                  # 预留；当前进程日志走 stdout/stderr → 用 `docker logs`
└── config.local.json      # 可选
```

> 实测（本机 `run-local.ps1 -KeepData`）确认启动后会生成 `agentd.db`（含 `-wal`/`-shm`/`.lock`）与 `artifacts/ workspace/ logs/`。

### 5.2 备份（停容器最稳妥）

```bash
docker compose -f deploy/compose.yaml stop
docker run --rm -v agentd-data:/data -v "$PWD":/backup alpine \
  sh -c 'cd /data && tar czf /backup/agentd-data-$(date +%Y%m%d-%H%M%S).tgz .'
docker compose -f deploy/compose.yaml start
```

> 热备（不停容器）**不保证 SQLite 一致性**（WAL）；需要热备请用 `sqlite3 .backup` 或先 `stop`。

### 5.3 迁移到新机器 / 上云

1. 按 §5.2 打包卷；
2. 新机器 `docker volume create agentd-data` 后解包：

```bash
docker run --rm -v agentd-data:/data -v "$PWD":/backup alpine \
  sh -c 'cd /data && tar xzf /backup/agentd-data-YYYYmmdd-HHMMSS.tgz'
```

3. 用**同一镜像 tag** 启动（版本升级见 §6.5）。
4. 业务代码不硬编码宿主绝对路径，迁移只需"同一镜像 + 同一卷"。

### 5.4 换端口 / 只绑内网

- 宿主端口：改 `compose.yaml` 的 `ports` 左侧（默认 `127.0.0.1:18787:8787`；可用 `AGENTD_PORT` 覆盖，例如 `0.0.0.0:18787:8787` 或反代后面）。
- 容器内端口：改 `AGENTD_ADDR` 与 `EXPOSE`（镜像默认 8787；一般不需要改）。

---

## 6. 上云与运维

### 6.1 单实例约束（重要）

`agentd` 是**单写者**：SQLite + 进程级文件锁保证**同一数据目录只能有一个实例**（`docs/m1-contract.md` §2）。
因此：**不要**多副本共享同一个卷（第二个实例会启动失败）。云上请用 `replicas: 1` + RWO 卷（或单机部署）。

### 6.2 建议拓扑

```text
Internet / 内网
   │  HTTPS（TLS 终止在反代）
   ▼
反向代理（Caddy/Nginx/云 LB）  ← 鉴权（P1）放这里
   │  http://127.0.0.1:8787
   ▼
agentd 容器（单实例，持久卷 /data）
```

### 6.3 健康检查与优雅停机

- 健康端点：`GET /api/health` → `{"ok":true,"ready":true,"time":...,"checks":{"db":"ok","modules":[...]}}`（M7 起带就绪态）。
- Dockerfile 自带 `HEALTHCHECK`（alpine 用 busybox `wget`）；Compose 里显式重复了一份，便于 `compose ps` 观察。
- 停机：`docker stop` → SIGTERM → Go 侧优雅关闭（HTTP 10s + 模块 Stop）；compose 设 `stop_grace_period: 15s`（留余量）。
- `init: true` 让 tini 当 PID 1（回收僵尸进程）；Go 自身也处理 SIGTERM。

### 6.4 distroless 目标（可选）

```bash
docker build -f deploy/Dockerfile --target runtime-distroless -t agentd:distroless .
```

- 更小、无 shell；用户 `65532`（nonroot）；`/data` 由构建期预创建并 chown。
- **限制**：distroless **没有 wget/shell**，所以没有内置 `HEALTHCHECK`；请由编排层探针（compose/K8s）调 `/api/health`。
- 同样**未验证**。

### 6.5 升级与回滚

1. 备份卷（§5.2）；
2. `docker compose -f deploy/compose.yaml pull/build`（或换 tag）；
3. `up -d`；
4. 失败回滚：`docker run` 旧 tag + 同一卷（数据库迁移按 `schema_migrations` 幂等执行，旧版本对**新**表结构不保证兼容——升级前务必备份）。

---

## 7. 验证状态（实测与未验证）

### 7.1 已在本机实测 ✅（不含容器）

| # | 项目 | 方法 | 结果 |
|---|---|---|---|
| 1 | **Go 构建命令与 flag 可用** | 用镜像内同款参数在临时目录构建：`go build -trimpath -buildvcs=false -ldflags="-s -w" -o <tmp>/simo.exe ./cmd/agentd`（Go 1.27.3、`-mod=readonly`、离线模块缓存） | ✅ exit 0，产物约 12 MB |
| 2 | **`AGENTD_HOME` 隔离语义** | `deploy/run-local.ps1 -Exe <新构建二进制> -DataHome <临时目录>` | ✅ 所有状态落在临时目录 |
| 3 | **`AGENTD_ADDR` 覆盖生效** | 同脚本 `-Listen 127.0.0.1:18899` | ✅ 实际监听 18899（旧二进制不生效，见 §7.2） |
| 4 | **`/api/health` 健康检查** | 脚本轮询 `GET /api/health` | ✅ `{"ok":true,"time":1793981549173}` |
| 5 | **优雅停止 + 清理** | 脚本发终止信号并等待退出 | ✅ 正常退出，临时目录清理 |
| 6 | **数据布局** | `-KeepData` 后 `Get-ChildItem -Recurse` | ✅ `agentd.db`、`agentd.db-wal`、`agentd.db-shm`、`agentd.db.lock`、`artifacts/`、`workspace/`、`logs/` |
| 7 | **M36 构建脚本静态自检** | `powershell -NoProfile -File deploy/docker-build.ps1 -DryRun` | ✅ exit 0，输出 `docker build -f ...\deploy\Dockerfile -t simo:local <repo>` |
| 8 | **M36 无 Docker 提示** | `powershell -NoProfile -File deploy/docker-build.ps1`（无 Docker） | ✅ 明确提示 Docker 未安装并 exit 2，不安装/不改系统 |

### 7.2 过程中发现的一个事实（值得注意）

仓库里旧的 `agentd\agentd.exe`（历史产物）是**旧构建**：它忽略 `AGENTD_ADDR`（固定监听 8787）、日志格式也与当前源码不同。
新构建产物为 `simo.exe`；用旧 `agentd.exe` 跑 `run-local.ps1 -Listen 18899` 会健康检查失败，用新构建的 `simo.exe` 通过。
→ 结论：**镜像内从源码构建**，不受影响；但本机直接跑旧 exe 时不要指望环境变量生效，先重建。
（该发现只影响本机二进制，不在本任务范围内修改 `agentd/`。）

### 7.3 未验证 ❌（待容器环境）

| # | 未验证项 | 风险点 |
|---|---|---|
| 1 | `docker build` 全流程 | 3 个基础镜像 tag 是否存在（尤其 `golang:1.27-alpine`） |
| 2 | 前端阶段（node 24 + pnpm 11） | `corepack` 是否可用（已写 fallback：`npm i -g pnpm`）；`pnpm install --frozen-lockfile` 是否与 lockfileVersion 9.0 兼容 |
| 3 | Tailwind v4 / esbuild 原生二进制 | glibc（bookworm-slim）下应可装 `linux-x64` 原生包；musl 未选（避坑） |
| 4 | Go 阶段 `CGO_ENABLED=0` | modernc.org/sqlite 为纯 Go，预期可行；未实测 |
| 5 | 非 root（uid 10001）写 `/data` | 命名卷首次挂载会继承镜像目录属主；**bind mount 需宿主 chown 10001**（未验证） |
| 6 | `HEALTHCHECK`（busybox wget） | 命令语法与超时在真实 Docker 引擎下的行为 |
| 7 | `compose up` / 端口映射 / restart 策略 | 本机无 Docker |
| 8 | `init: true`（tini）+ SIGTERM 停机链 | 容器 PID 1 行为 |
| 9 | distroless 目标 | 无 shell/wget；`/data` 预创建与 65532 权限 |
| 10 | 跨架构（linux/amd64、arm64） | 未测 |
| 11 | 网络可达性（goproxy.cn / npm） | 构建机网络未知 |
| 12 | 真实模型与密钥注入（V1） | 二进制默认 `real`（需 API Key）；compose 示例用 mock 便于无 Key 启动；`.env`/secrets 方案未跑过 |
| 13 | YAML / Dockerfile 语法校验 | 本机无 docker 与 YAML 解析器（PyYAML/js-yaml 均不可用），只做了人工核对 + 编码检查（UTF-8 无 BOM、LF、无 Tab）+ `docker-build.ps1 -DryRun`；`compose config` / `docker build` 需容器环境执行 |
| 14 | **M36 E: 盘绑定目录 / compose 端口变量** | `AGENTD_DATA_MOUNT=E:/simo-data`、`AGENTD_PORT=...` 的 Compose 变量展开与宿主路径 | 未实测；文档已给示例，需 Windows Docker Desktop 复核 |
| 15 | **M36 TZ/tzdata / distroless HEALTHCHECK** | alpine runtime 已装 tzdata；distroless 无 shell/wget | 未实测；distroless 需外部探针 |

> **任何"已验证"表述都只针对 §7.1 的 8 项本机验证；镜像与编排一律按"已编写、待容器环境验证"对待。**

---

## 8. 故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 端口 18787 打不开 | 容器仍监听 127.0.0.1 | 确认 `AGENTD_ADDR=0.0.0.0:8787`（镜像/compose 已设）；宿主端口用 `AGENTD_PORT` 检查 |
| 容器启动即退出 | 卷不可写（bind mount 权限）/ 端口被占 / 第二个实例抢文件锁 | `docker logs agentd`；确保宿主目录属主与 uid 10001 一致；确认单实例 |
| 健康检查一直 unhealthy | 启动慢 / 依赖未就绪 | 看 `start_period`；`docker exec` 里 `wget -qO- http://127.0.0.1:8787/api/health` |
| `permission denied` 写 `/data` | 用了 bind mount 且宿主目录属主不是 10001 | `sudo chown -R 10001:10001 <host-dir>`，或改用命名卷 |
| 构建时 node 阶段失败 | npm registry 不可达 / corepack 缺失 | 加 `--build-arg` 换 registry；或改用 `Dockerfile.go-only`（本机构建前端 + 仅编译 Go） |
| 构建时 Go 下载失败 | `goproxy.cn` 不可达 | `--build-arg GOPROXY=https://proxy.golang.org,direct`（或私有 proxy） |
| 数据卷迁移后库损坏 | 热备 WAL 未合并 | 停容器后再打包（§5.2）；或用 `sqlite3 .backup` |

---

## 9. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0（2026-11-07） | 2026-11-07 | 首版：多阶段 Dockerfile（web/go/alpine 非 root + HEALTHCHECK）、distroless 目标、`Dockerfile.go-only` 备选、compose（127.0.0.1 端口 + 命名卷 + restart + 最小权限）、两份 `.dockerignore`（根/专属）、`run-local.ps1` 本机语义模拟；README 按"实测 / 未验证"分栏，明确本机无 Docker、镜像待容器环境验证。 |
| v1（M36） | 2026-11-08 | 容器化完善：新增 `docker-build.ps1`（无 Docker 明确提示/exit 2；`-DryRun` 静态自检）、`CONTAINER.md`（部署/升级/备份/FAQ）；alpine/Go-only runtime 增加 `TZ=Asia/Shanghai` + `tzdata` + `ca-certificates`；compose 默认宿主端口 18787（`AGENTD_PORT` 可覆盖，避免 8787 冲突）、`AGENTD_DATA_MOUNT` 支持 E: 盘绑定目录、`TZ` 传入构建。 |


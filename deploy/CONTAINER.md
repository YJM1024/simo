# 容器部署、升级、备份与 FAQ（M36）

> **状态**：脚本与 Dockerfile **静态核对通过**；本机无 Docker/WSL/Podman，**镜像构建与容器运行未实测**。
> 实测项只有：`docker-build.ps1 -DryRun` 的路径/命令检查、`compose.yaml` 文件解析的静态检查。
> 用户现有实例（8787 / `simo-live.exe`）不受本文命令影响；Compose 默认宿主端口为 **18787**。

## 1. 文件

| 文件 | 作用 |
|---|---|
| `Dockerfile` | 多阶段：web 构建（node/pnpm）→ Go 静态编译（CGO_ENABLED=0）→ alpine 非 root 运行；默认带 TZ/CA/healthcheck |
| `Dockerfile.go-only` | 复用本机 `agentd/internal/webui/dist`，跳过 web 阶段 |
| `compose.yaml` | 单机编排：端口/卷/env/healthcheck/restart/最小权限 |
| `docker-build.ps1` | 构建入口；无 Docker 时明确提示并退出 2 |
| `CONTAINER.md` | 本文件 |

## 2. 构建

```powershell
# 语法/路径自检（无 Docker 即可执行）
pwsh -NoProfile -File deploy/docker-build.ps1 -DryRun

# 真实构建（需要 Docker Desktop/Engine）
pwsh -NoProfile -File deploy/docker-build.ps1 -Tag simo:local

# 可选：distroless runtime（无 shell/wget，无内置 HEALTHCHECK；见 FAQ）
pwsh -NoProfile -File deploy/docker-build.ps1 -Tag simo:distroless -Distroless
```

构建上下文固定为**仓库根**。Dockerfile 会读取 `web/` 与 `agentd/`；不要把上下文改成 `deploy/`。

## 3. 运行（Compose）

```powershell
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d
docker compose -f deploy/compose.yaml ps
docker compose -f deploy/compose.yaml logs -f agentd
```

访问 `http://127.0.0.1:18787`。宿主端口可用 `AGENTD_PORT` 覆盖（默认 18787，避免与用户 8787 冲突）：

```powershell
$env:AGENTD_PORT = "18888"
docker compose -f deploy/compose.yaml up -d
```

容器内监听 `0.0.0.0:8787`（必须，否则端口映射不通）；`AGENTD_HOME=/data`。

## 4. 数据目录（可指向 E: 盘）

默认使用命名卷 `agentd-data`。要落到 Windows E 盘：

```powershell
$env:AGENTD_DATA_MOUNT = "E:/simo-data"
docker compose -f deploy/compose.yaml up -d
```

- 路径使用 `/`，不要用 `E:\simo-data`（Compose 短语法里反斜杠会被转义/解析歧义）。
- 宿主目录需要允许 Docker Desktop 访问；首次挂载后 `agentd` 会以 uid 10001 写入。
- Linux 绑定挂载若权限不足：`sudo chown -R 10001:10001 /path/to/simo-data`（容器外操作，按目标系统执行）。
- 不再使用自定义路径时，先备份数据，再删除/移走旧目录并恢复 `AGENTD_DATA_MOUNT`；不要删除用户数据。

## 5. 升级

```powershell
# 1) 先备份（停容器保证 SQLite/WAL 一致）
docker compose -f deploy/compose.yaml stop

docker run --rm -v agentd-data:/data -v "$PWD":/backup alpine `
  sh -c 'cd /data && tar czf /backup/agentd-data-$(date +%Y%m%d-%H%M%S).tgz .'
# E: 绑定目录场景：把 -v agentd-data:/data 换成 -v "E:/simo-data:/data"

# 2) 构建/拉取新镜像
pwsh -NoProfile -File deploy/docker-build.ps1 -Tag simo:2.x
# 或 docker pull <registry>/simo:2.x

# 3) 用新镜像启动；SQLite 迁移在服务启动时自动执行（只前进，不回滚）
$env:SIMO_IMAGE = "simo:2.x"   # compose 需同步 image 或用 --pull
docker compose -f deploy/compose.yaml up -d

# 4) 检查健康
docker compose -f deploy/compose.yaml ps   # 等待 (healthy)
```

升级失败回滚：

1. 停容器；
2. 用**旧镜像 tag** 启动；
3. 若旧版本无法读新 schema：停容器，用备份恢复数据卷（见 §6），再启动旧镜像。
4. **不要**在旧版本上直接改库；迁移只前进，回滚以备份为准。

## 6. 备份 / 恢复

备份（容器停止时最稳妥）：

```powershell
docker compose -f deploy/compose.yaml stop
docker run --rm -v agentd-data:/data -v "$PWD":/backup alpine `
  sh -c 'cd /data && tar czf /backup/agentd-data-$(date +%Y%m%d-%H%M%S).tgz .'
docker compose -f deploy/compose.yaml start
```

恢复：

```powershell
docker compose -f deploy/compose.yaml stop
docker run --rm -v agentd-data:/data -v "$PWD":/backup alpine `
  sh -c 'rm -rf /data/* && cd /data && tar xzf /backup/agentd-data-YYYYmmdd-HHMMSS.tgz'
docker compose -f deploy/compose.yaml start
```

> `rm -rf /data/*` 只作用于容器内命名卷/绑定目录；执行前确认备份文件存在。也可用 `backup.ps1/restore.ps1`（M29 本地便携版）流程对应。
> 热备份可能不一致（SQLite WAL）；建议先 `stop`。不使用 `docker compose down -v` 清卷，除非已确认数据不再需要。

## 7. FAQ

**Q：没有 Docker 怎么办？**
`docker-build.ps1` 会提示并退出 2，不自动安装。本地跑用 `deploy/run-local.ps1`（独立 `AGENTD_HOME`/端口，不碰用户 8787）。

**Q：容器 healthy 但页面打不开？**
确认宿主端口是 18787（或你的 `AGENTD_PORT`），且容器内 `AGENTD_ADDR=0.0.0.0:8787`；Windows 防火墙/代理也可能拦截。

**Q：distroless 镜像没有 HEALTHCHECK / 没有 shell？**
这是有意设计：distroless 无 `wget/shell`。请用编排层外部探针访问 `http://127.0.0.1:<宿主端口>/api/health`；默认 alpine 运行镜像内置 `HEALTHCHECK`。需要 `docker exec` 调试时请用默认 alpine 镜像。

**Q：时区不对？**
默认 `TZ=Asia/Shanghai`（构建 ARG 可覆盖）；alpine 运行镜像已装 `tzdata`。distroless 镜像无 tzdata，建议用默认 alpine，或自行构建带 tzdata 的 base。

**Q：绑定 E: 盘权限/路径？**
使用 `E:/simo-data`（正斜杠），确保 Docker Desktop 文件共享已包含 E 盘；Linux 宿主用 `chown 10001:10001`。不要把 `AGENTD_HOME` 指到镜像内非卷路径。

**Q：能否对外网开放？**
默认只绑 `127.0.0.1`；对外暴露请放在反向代理/TLS 后，并自行评估鉴权；不要直接暴露 8787。

**Q：如何换 API Key？**
不要把 key 写进 Dockerfile/Compose；用 `env_file`/Docker Secret/运行环境注入。compose 默认 `AGENTD_MODEL=mock`（无 key 可跑），真实模型改 `real` 并注入 `DEEPSEEK_API_KEY`。

**Q：能否只读根文件系统？**
未验证；`AGENTD_HOME=/data` 是唯一必需写路径。若启用 `read_only: true`，必须同时提供可写 `/data` 卷和必要 tmpfs（compose 注释示例未默认开启）。

## 8. 静态验证清单

- [x] `docker-build.ps1 -DryRun`：仓库根/web/agentd 路径存在，命令拼接正确。
- [x] `Dockerfile`：三阶段、`CGO_ENABLED=0`、非 root uid 10001/65532、`/data` 卷、`ENTRYPOINT ["/simo","serve"]`、`EXPOSE 8787`、healthcheck（alpine）。
- [x] `compose.yaml`：端口/卷/env/healthcheck/restart/安全选项齐全；默认 18787 避免冲突。
- [ ] `docker build` / `docker compose up` / `healthcheck`：**本机无 Docker，未实测**（需容器环境复核）。
- [ ] 真实模型 key 注入与 E: 盘绑定挂载：未实测。

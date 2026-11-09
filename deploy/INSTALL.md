# Simo 部署与安装（Windows 便携包 / 安装 / 升级 / 备份恢复）

> 适用：Windows 10/11 x64，单机单实例（SQLite 单写者）。容器方式见 [`README.md`](README.md)（本机无 Docker，容器部分仍为静态核对）。
> 本文件与脚本只做部署编排，不改业务代码；文件名前缀 `simo` 为产品名（内部模块仍叫 simo）。

## 1. 文件清单

| 文件 | 作用 |
|---|---|
| `package.ps1` | 构建（web dist + Go 二进制）→ 便携 zip（含 `start.ps1`、README、示例配置、`manifest.json`、`SHA256`） |
| `install.ps1` | 首次安装：校验包 → 解压到 `%LOCALAPPDATA%\Simo\app` → 初始化数据目录 → 生成 `start.cmd` |
| `upgrade.ps1` | 升级：校验 → 停服 → **自动备份** → 装新版本 → 健康冒烟 → 失败自动回滚；`-Rollback` 手动回滚 |
| `backup.ps1` | 一致性备份（Python `sqlite3.backup` 热备；无 Python 时要求停服后复制 db+WAL）→ zip + sha256 + manifest |
| `restore.ps1` | 恢复：校验 zip/manifest/`PRAGMA integrity_check` → 先做 pre-restore 备份 → 移动旧 db → 恢复 |
| `../start.ps1` | 启动器：**单实例锁**、端口占用识别、`/api/health` 健康检查、失败回退（打印日志尾）、日志与实例状态文件 |

## 2. 一键流程

### 2.1 构建便携包（开发机）

```powershell
# 完整构建（web + Go；需要 Node/pnpm 依赖与 Go 工具链）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\package.ps1

# 前端产物已是最新时，只重建 Go 二进制
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\package.ps1 -SkipWebBuild

# 直接复用已有二进制（最快，用于发布/离线环境）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\package.ps1 -SkipBuild -Exe backend\simo.exe
```

输出：`deploy\dist\simo-<version>-win-x64.zip` + `.sha256`（格式 `<hash>  <file>`），zip 内含 `VERSION.txt` 与 `manifest.json`（含 exe sha256）。

> 包内 `config.example.json` 现在以**无 BOM UTF-8** 写入；安装器播种 `config.local.json` 时也会剥 BOM（历史 BOM 会导致 simo 启动解析失败）。

### 2.2 安装（目标机）

```powershell
# 解压 zip 后也可以直接双击 start.cmd（默认 mock 模式，无需 Key）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\install.ps1 `
  -Package .\simo-M29-20260101-1200-win-x64.zip `
  -InstallDir "$env:LOCALAPPDATA\Simo" -Port 8787 -Start
```

- 数据目录默认 `%LOCALAPPDATA%\Simo\data`；已有 `config.local.json` **不会被覆盖**。
- 生成 `%LOCALAPPDATA%\Simo\start.cmd`（双击即可），参数会透传（如 `start.cmd -Model mock`）。
- **首次 `-Start` 且 apiKey 为空时自动以 `-Model mock` 启动**（避免 `real 模式需要 API key` 失败），并输出 `no apiKey found; starting in mock mode`；要真实模型请先填 `config.local.json` 的 `apiKey`。
- 首次安装若目标已存在 `current.json`，需显式 `-Force`（避免误覆盖）。

### 2.3 升级 / 回滚

```powershell
# 升级：校验 → 停服 → 自动备份 → 装新版本 → 健康冒烟；冒烟失败自动回滚（数据从备份恢复）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\upgrade.ps1 `
  -Package .\simo-M29-20260102-0900-win-x64.zip

# 跳过备份（不建议）：-SkipBackup；禁用自动回滚：-NoAutoRollback
# 手动回滚到上一版本（含数据备份恢复）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\upgrade.ps1 -Rollback
```

- 版本目录：`<InstallDir>\versions\<version>`；`current.json` 指向当前版本；`previous.json` 保留上一版本与备份路径。
- **升级前备份会记录路径并输出 `BACKUP_ZIP=<zip>`**；若备份失败则**中止升级、不切换版本**（不会出现“新版本+旧库”状态）。
- **`-Rollback` 要求有可用备份**：先恢复数据备份，再切回上一版本；没有备份时拒绝回滚并保持当前版本。
- 升级历史追加到 `<InstallDir>\upgrades.log`。

### 2.4 备份 / 恢复

```powershell
# 备份（服务运行时也可做一致性热备；Python 缺失时需要先停服）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\backup.ps1 `
  -DataDir "$env:LOCALAPPDATA\Simo\data" -IncludeArtifacts

# 只校验备份（不写入）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\restore.ps1 -Backup <zip> -VerifyOnly

# 恢复（会先自动做 pre-restore 备份；旧 db 移到 <DataDir>\pre-restore-<时间戳>\，不删除）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\restore.ps1 `
  -Backup <zip> -DataDir "$env:LOCALAPPDATA\Simo\data" -Force
```

- 备份 zip 含 `manifest.json`（逐文件 sha256）；恢复会校验 zip sha、逐文件 sha 与 SQLite `integrity_check`。
- **恢复会同时恢复 `simo.db`、`simo.db-wal`、`simo.db-shm`**；没有可用 Python 时跳过 `integrity_check` 并打印提示（不中断恢复）。
- 恢复默认**不覆盖** `config.local.json`（含密钥），需要时加 `-RestoreConfig`；产物恢复加 `-RestoreArtifacts`。
- **回滚**：`upgrade.ps1 -Rollback` 先恢复备份数据（含 db-wal/db-shm）再切版本；无备份则拒绝并保持当前版本。也可手动停服后从 `<DataDir>\pre-restore-<时间戳>\` 移回 db 文件。

## 3. `start.ps1` 行为（加固点）

| 能力 | 行为 |
|---|---|
| 单实例 | 每个数据目录一把独占锁 `<DataDir>\.start.lock` + 实例状态 `<DataDir>\.simo-instance.json`；重复启动直接退出 2 |
| 端口占用 | 先判断端口；若已是 Simo（`/api/health` 200）提示"已有实例"；被其他程序占用则报 PID 并退出 3 |
| 健康检查 | 启动后轮询 `/api/health`（默认 60s 超时，`-HealthTimeoutSec` 可调），未就绪则**只停自己启动的进程**，打印日志尾并退出 1 |
| 日志 | `<DataDir>\logs\simo-<时间戳>.out.log/.err.log`；控制台同时打印路径 |
| 停止 | `start.ps1 -Stop -DataDir <目录>`：只停状态文件记录且 exe 路径一致的进程；**绝不杀无关进程/其他实例** |
| 参数 | `-Listen host:port`、`-Model real\|mock`、`-DataDir`、`-Exe`、`-Background`、`-OpenBrowser` |

退出码：`0` 成功 / `1` 启动或健康检查失败 / `2` 已运行 / `3` 端口冲突 / `4` 参数或路径错误。

## 4. 数据与配置

```text
<DataDir>/                 # SIMO_HOME
├── simo.db (+ -wal/-shm)  # SQLite（WAL）
├── simo.db.lock           # 单写者锁（服务自身）
├── artifacts/ workspace/ logs/
├── config.local.json        # 可选：provider/baseURL/model/apiKey/reasoning
└── .simo-instance.json      # start.ps1 写入的 pid/端口（-Stop 用）
```

- 配置优先级：`flag > env > config.local.json > 默认值`；密钥**不要**写进镜像/脚本/仓库。
- 离线体验：`start.cmd` 默认 `-Model mock`；真实模型需填 `config.local.json` 的 `apiKey`（或 `DEEPSEEK_API_KEY` 环境变量）。

## 5. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动提示"already running" | 同数据目录已有实例/上次未正常退出 | `start.ps1 -Stop -DataDir <目录>`；再启动 |
| 端口被占用（退出 3） | 其他程序/另一个 Simo 占了端口 | 换 `-Listen 127.0.0.1:8790`，或先停占用进程（脚本会打印 PID） |
| 健康检查失败（退出 1） | 配置错误（Key/路径）、db 损坏、端口冲突 | 看 `<DataDir>\logs\*.err.log` 尾部；必要时 `restore.ps1 -VerifyOnly` 校验最近备份 |
| 升级后打不开 | 冒烟未通过已自动回滚；或手动安装错误版本 | 看 `<InstallDir>\upgrades.log`；`upgrade.ps1 -Rollback` 回滚并恢复数据备份 |
| 升级提示备份失败 | 备份未产生 `BACKUP_ZIP` | 升级已中止、版本未切换；检查数据目录/Python/磁盘，或加 `-SkipBackup`（不建议）后重试 |
| 回滚被拒绝 | 没有可用备份 | 先 `backup.ps1` 做备份；或先 `restore.ps1` 恢复数据后再 `-Rollback`；脚本会保持当前版本 |
| 安装 -Start 后是 mock | apiKey 为空时自动 mock（已提示） | 填 `config.local.json` 的 `apiKey` 后用 `start.cmd` 正常启动 |
| 恢复提示跳过 python | 没有可用 Python | 跳过 `integrity_check`，恢复仍继续；安装 Python 可恢复校验 |
| 备份提示无 Python | 运行中热备需要 Python | 安装 Python 或先停服再备份（脚本会复制 db+WAL） |
| 恢复被拒绝（非空目录） | 防误覆盖保护 | 确认目标目录后加 `-Force`（会先做 pre-restore 备份，旧 db 移动不删除） |
| Docker 镜像未实测 | 本机无 Docker/Podman | 见 `README.md` §7 未验证清单；在有 Docker 的环境按 README 构建 |

## 6. Docker 校验状态（本机 2026-11-08）

- `docker` / `podman` **NOT FOUND**；WSL 已安装但**没有 Linux 发行版**（无法 `wsl docker`）。
- 因此：**镜像构建与运行未实测**，仅做静态核对（文件存在、`HEALTHCHECK`/`EXPOSE`/`USER`/`VOLUME`/`STOPSIGNAL` 声明、`.dockerignore` 规则、compose 端口/卷）。详见 `README.md` §7（未验证清单 13 项）。
- 有 Docker 的环境建议执行：`docker compose -f deploy/compose.yaml build && docker compose -f deploy/compose.yaml up -d`，之后再替换本节状态为"已实测"。

## 7. 本轮实测记录（2026-11-08，工作区 `.tmp\<GUID>` 内）

- ✅ 便携包：`deploy\package.ps1 -SkipWebBuild` 从源码构建 `simo.exe` → zip + `.sha256`（产物已放 `deploy\dist\simo-M29-88d16d8d-win-x64.zip`，SHA256 `3c422cce…a9df3fa` 已复核一致）。
- ✅ 解压到 `.tmp\m29-verify-<GUID>` → 直接启动包内 `simo.exe serve`（mock/18917）→ `/api/health` **200**（`{ok:true,ready:true}`），数据布局生成 `simo.db(-wal/-shm)/artifacts/workspace/logs`；停止后端口释放。
- ✅ 包内 `start.ps1`：启动→健康检查→`ready` 路径正常；端口被占用场景能正确启动/探测；`-Stop` 对状态文件（进程已退出）优雅提示、不误杀；**未实测**：同数据目录第二个实例的主动拒绝（逻辑已实现，待补跑）。
- ✅ `backup.ps1`：Python `sqlite3.backup` 热备 → zip + sha256 + manifest；`restore.ps1 -VerifyOnly` 校验 zip/manifest/`integrity_check` 全通过。
- ✅ `restore.ps1 -Force`：恢复到新建空目录成功（exit 0）；会同时恢复 `simo.db`/`-wal`/`-shm`；无 Python 时跳过 `integrity_check` 并提示。过程中修复了 2 处 PowerShell 解析 bug——`if (Test-Path ... -and $switch)` 会被当作 `Test-Path -and` 参数，已改为 `if ((Test-Path ...) -and $switch)`。
- ✅ `install.ps1 -Start`：首次安装在 apiKey 为空时自动 `-Model mock` 启动并提示；`config.example.json` 无 BOM，安装器播种 config 时剥 BOM。
- ✅ `upgrade.ps1`：升级前备份输出 `BACKUP_ZIP=<zip>`；备份失败会中止、不切换版本。
- ✅ `upgrade.ps1 -Rollback`：要求有备份，先恢复数据（含 db-wal/db-shm）再切版本；无备份拒绝并保持当前版本。
- ⚠️ **未实测**：同数据目录第二个实例的主动拒绝（逻辑已实现，待补跑）；Docker 构建（本机无 Docker/Podman，WSL 无发行版）→ 仅静态核对，见 `README.md` §7。
- 合规：本轮所有新写入都在工作区（`deploy/`、`start.ps1`、`deploy/dist/`、`.tmp/`）；不使用系统 Temp 存测试目录，不递归删除；未触碰 8787 / `simo-live.exe`。

### 7.1 实测结果（2026-11-08）

- ✅ `install.ps1 -Start`：首次安装成功；apiKey 为空自动 mock 启动并提示；
- ✅ **M29 → M30 upgrade**：升级成功，备份路径已记录；
- ✅ **rollback M30 → M29**：备份恢复数据后旧版可正常启动；
- ✅ 上述 4 个本轮修复（无 BOM config、install 自动 mock、upgrade 备份路径/失败中止、restore db-wal/db-shm + rollback 要求备份）均已纳入脚本并复核。

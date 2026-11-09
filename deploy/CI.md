# CI（GitHub Actions + 本地一条命令）

> 目标：在 Windows 上把「Go 检查/测试 → Web 构建 → 打 exe → mock 评测（分块）→ 便携包」跑成一条可复现流水线，失败非零退出、产出可下载工件。
> 遵守 ops-policy：所有测试数据在**工作区** `.tmp\ci-<GUID>\`；不递归删除；不碰 8787 / `simo-live.exe`；不请求审批；密钥只用 secrets。

## 1. 本地：`deploy/ci.ps1`

```powershell
# 全链路（默认；需要 pnpm/esbuild 可用）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\ci.ps1

# 本机没有 pnpm/esbuild 原生工具链时（复用现有 frontend/dist）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\ci.ps1 -SkipWeb

# 只跑一部分
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\ci.ps1 -SkipWeb -SkipGo   # 本机 go vet 挂起时（见 §3 已知环境限制）
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\ci.ps1 -SkipWeb -SkipEvals
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\ci.ps1 -SkipWeb -Only "health,ws-order,memory-write"
```

阶段与产物：

| 阶段 | 内容 | 失败影响 |
|---|---|---|
| preflight | 检查 repo/工具（Go、Node、evals） | exit 2 |
| go | `go vet ./...` + `go test ./...`（simo，日志 `logs\go-*.log`） | exit 1 |
| web | `node frontend/build.mjs`（tsc + tailwind + esbuild；`-SkipWeb` 可跳过） | exit 1 |
| build | 构建 `simo.exe` 到 `.tmp\ci-<GUID>\simo.exe` | exit 1，跳过后续 |
| evals | mock 评测 **4 块**（M1–M8 / M9–M15 / M17–M20 / M21+），**每块新起服务 + 新 GUID home + 独立端口**（默认 19001–19004） | exit 1（记录块与日志） |
| package | `deploy/package.ps1 -SkipBuild` → `deploy\dist\simo-<版本>-win-x64.zip` + `.sha256` | exit 1 |
| docker | 有 docker 时跑 `docker compose config`；没有则 SKIP（不判失败） | 不影响 |

- 每个阶段打印 `PASS/FAIL/SKIP` 与耗时；最后输出摘要表、日志路径、工件路径与总耗时。
- 日志：`.tmp\ci-<GUID>\logs\`；测试 home：`.tmp\ci-<GUID>\home-b<块号>\`。
- 退出码：`0` 全过 / `1` 有阶段失败 / `2` 前置检查失败（与 evals 的 0/1/2 语义一致）。

## 2. GitHub Actions

工作流：`.github/workflows/ci.yml`，`runs-on: windows-latest`。

| Job | 触发 | 内容 |
|---|---|---|
| `build-test` | push（main/master）、PR、手动 | setup-go 1.27.x + node 24 + pnpm → `deploy/ci.ps1`（含 4 块 mock evals）→ 上传 `simo-portable-package` 与 `ci-logs` 工件 |
| `real-smoke` | 手动 + 仓库变量 `RUN_REAL_SMOKE=true` | 下载包 → 运行时用 **secret** 写临时 `config.local.json` → `real-smoke.ps1 -TokenBudget 45000` |
| `docker` | 手动 + 仓库变量 `RUN_DOCKER=true` | Ubuntu 上 `docker build` 两个 Dockerfile（可选，默认不跑） |

**密钥规则**：只从 `${{ secrets.DEEPSEEK_API_KEY }}` 读取，运行时注入环境变量/临时配置；**不要**把 Key 写进 workflow、Dockerfile、提交的 `config.local.json`。CI 日志不打印 Key。

启用可选 job（仓库 Settings → Variables）：`RUN_REAL_SMOKE=true`、`RUN_DOCKER=true`。

## 3. 失败排查

| 现象 | 原因 | 处理 |
|---|---|---|
| preflight 失败（exit 2） | Go/Node 不在 PATH，或缺 `backend/go.mod`/`evals/run.mjs` | 安装工具链；或让 `toolchain/go.ps1` 存在；CI 由 setup-go/setup-node 保证 |
| go vet/test 失败 | 代码/测试问题 | 看 `.tmp\ci-<id>\logs\go-vet.log` / `go-test.log`，本地复现 `..\toolchain\go.ps1 test ./...` |
| web 阶段失败 | pnpm 依赖未装 / esbuild 原生包缺失 | CI：`pnpm install --frozen-lockfile`；本地：可先 `-SkipWeb`，或补齐 `frontend/node_modules` |
| evals 块失败 | 产品回归 / 端口冲突 / 服务没起来 | 看 `logs\server-b<k>.err.log` 与 `logs\evals-<块>.log`；换 `-PortBase`；单条复现 `node evals/run.mjs --base-url ... --only <id>` |
| package 失败 | `deploy/package.ps1` 或磁盘/权限 | 看 `logs\package.log`；确认 `deploy\dist` 可写 |
| docker 阶段 SKIP | 本机无 docker（预期） | 不影响；需要时在有 Docker 的机器上跑 `docker compose -f deploy/compose.yaml build` |
| 端口被占用（evals 起不来） | 本机已有实例占用端口 | 用 `-PortBase 19100` 换段；`ci.ps1` 只停自己启动的进程 |
| **本机 `go vet` 长时间无输出/挂起** | 本机 Go 工具链缓冲/缓存锁（`toolchain\tmp` 缓存 + 长跑进程回收策略） | 用 `-SkipGo` 跳过 go 阶段（CI 的 `windows-latest` 由 `actions/setup-go` 提供干净缓存，不受影响）；或手动 `toolchain\go.ps1 vet ./...` 观察 |

## 4. 与验收的关系

- 本地 `ci.ps1` 与 `.github/workflows/ci.yml` 调用同一入口，避免"两套脚本漂移"。
- 9 条需要重启/长审批/并发环境的 PENDING case 仍由 `evals/*.ps1` 覆盖（不在 `ci.ps1` 内，避免 CI 时间过长）；完整验收跑法见 `evals/README.md` §7。
- 便携包产物与安装/升级/备份恢复用法见 `deploy/INSTALL.md`。

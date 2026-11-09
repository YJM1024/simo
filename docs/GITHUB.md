# 上传到 GitHub

> 本机环境没有 git/gh、也没有 GitHub token，沙箱网络也不能推送。
> 下面两种方式任选：**A. 你在本机用 Git 推送（推荐）**；**B. 直接用打包好的源码包上传**。

## A. 一键推送（推荐）

前提：安装 Git（`winget install --id Git.Git -e`，然后重开终端），在 GitHub 建一个空仓库。

在**管理员或普通** PowerShell 里执行：

```powershell
cd E:\dsh_home\workspaces\agent
# 用 PAT（推荐，权限只需 repo）
$env:GITHUB_TOKEN = 'ghp_xxx'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-github.ps1 `
  -RepoUrl https://github.com/<你的用户名>/<仓库名>.git `
  -Tag v1.0.0
```

脚本会：

1. `git init`（分支 main）+ `git add -A`；
2. 检查有没有把 `backend/config.local.json`、`data/simo.db` 这类敏感文件 staged，有就拒绝；
3. 本地提交、打 tag；
4. 用 token 推送到 GitHub；
5. 提示你配置 Actions secret：`DEEPSEEK_API_KEY`（真实模型 smoke 用）。

**安全**：`.gitignore` 已排除

- `backend/config.local.json`（含 DeepSeek key）；
- `data/`（本地数据库/上传/产物）；
- `.tmp/`、`.trash/`、`*.exe`、`deploy/dist/`（二进制与打包产物）；
- `node_modules/`、日志。

## B. 直接上传源码包

已生成：`deploy/dist/simo-source-M41.zip`

- 在 GitHub 网页端 New repository → 空仓库；
- 解压后 `git init` + push，或网页上传文件（大仓库建议用 Git 客户端）。

源码包同样**不含** `config.local.json`、`data/`、`.tmp/`、exe、zip 产物。

## 仓库里有什么

```
backend/       Go 后端（cmd/simo, internal/{platform,core,modules}）
frontend/          React 19 + TS 前端（esbuild 构建）
docs/         契约与手册（design-core、m11–m41、user/admin guide）
design/       设计记录、路线图 design/15
deploy/       Dockerfile/compose/CI/安装升级备份脚本
evals/        评测 harness（144 条 + 12 脚本）
scripts/      发布脚本等
.github/      CI workflow
start.ps1     本机启动脚本
```

## CI

- `.github/workflows/ci.yml` 已就绪：Windows runner 跑 `deploy/ci.ps1`（go vet/test、web build、mock evals、打包）；
- 可选 job：`real-smoke`（设置 repo variable `RUN_REAL_SMOKE=true` + secret `DEEPSEEK_API_KEY`）、`docker`（`RUN_DOCKER=true`）。

## 注意

- 如果 `config.local.json` 曾经被提交过（本脚本会拒绝，但手动 git 操作可能绕过），请**立即轮换 DeepSeek API Key**；
- 仓库默认 private 更安全；
- 二进制/便携包建议走 GitHub Releases（`deploy/dist/simo-M41-win-x64.zip`），不要塞进 git 历史。

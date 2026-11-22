# Git 卫生诊断报告（只读）

- 生成时间：2026-11-21 19:2x（本地时区 Asia/Shanghai）
- 工作区：`E:\dsh_home\workspaces\agent`
- Git：`.tools\git\cmd\git.exe`（2.56.1.windows.1）
- 性质：**只读诊断**。未执行 commit / fetch / reset / checkout / stash / clean / 删除；唯一写入是本文件与 `.tmp\gitcfg-empty`（后者为空的 git 配置占位文件，位于已忽略目录）。
- 凭据：报告与命令输出中均未出现 token 或带凭据 URL；远程仓库统一写作 `https://github.com/YJM1024/simo.git`。

---

## 0. 结论摘要

1. 这 1090 条不是一个"改乱了的仓库"，而是**两个不同时间的快照被放在一起比较**：本地 `.git` 是 2026-11-09 的一次性快照（仅 3 个提交，从无 remote），工作区是 2026-11-21 由 GitHub API 直接写盘后的结果。
2. 417 条 `M` **全部**带 `100755 → 100644` 模式漂移；其中 207 条**只有**模式漂移，156 条有文本改动，54 条是二进制改动。真正的内容改动只有 156 个文件（evals/docs/design/deploy/scripts/README）。
3. 611 条 `D` 里只有 262 条是运行产物（`agentd/.tmp-*` 下的 DB/WAL）；其余 349 条是目录重构（`agentd/ → backend/`、`web/ → frontend/` 重写、`research/` 归档删除）。**这些文件在本地 HEAD 里都还在**，可用 `git show HEAD:<path>` 取回，不属于不可逆丢失。
4. **真正的丢失风险在未跟踪资产**：2734 个未跟踪文件里有约 1549 个是本地独有的（`.tools` 284 个/91.8MB、`scratch` 1242 个/51.1MB、`data-backup-*` 与 `data-preprod-*` 23 个/12.9MB），没有 git 历史，远程是否有副本**无法判定**（网络被策略代理拒绝）。
5. 路线 B 第一步（clone 到 `.tmp\repo-clean`）**本次未能执行**：GitHub 出口被网络策略拦截（`CONNECT tunnel failed, response 403`），且全局 gitconfig 把 https 重写成 SSH，双重阻塞。详见 §7。
6. 在能放开网络之前，**不要对现有仓库做任何写操作**。放行后推荐路线 B（干净 clone + 逐文件对比 + 换 `.git`），它是唯一"不动工作区内容、可完整回滚"的路径。

---

## 1. 现状快照（实测）

| 项 | 值 | 证据 |
|---|---|---|
| 仓库根 | `E:/dsh_home/workspaces/agent` | `git rev-parse --show-toplevel` |
| 当前分支 | `main` | `git symbolic-ref --short HEAD` |
| 本地 HEAD | `10270a37d3043b18ab408cca460498df14af72fd` | `git rev-parse HEAD` |
| HEAD 日期 | 2026-11-09 16:29:39 +0000 | `git log -1 --date=iso` |
| 提交总数 | **3** | `git log --oneline`：`10270a3 UI:` / `3c44d52 ci:` / `08a47ca Simo` |
| HEAD 文件数 | 1028 | `git ls-tree -r --name-only HEAD` |
| 本地 ref | 只有 `refs/heads/main` | `git for-each-ref` |
| remote 配置 | **无 `[remote "origin"]`**；`branch.main.remote` 直接存了一整条带凭据 URL | `git config --local --list`（已脱敏） |
| `.git/objects` 最后写入 | 2026-11-10 00:29 | 目录 mtime |
| 工作区状态 | D 611 / M 417 / ?? 62（行数 1090） | `git status --porcelain=v1` |

> 计数会小幅波动（同一次诊断中观察到 1090–1093 条）：工作区有其它 agent/进程在持续写 `.tmp`、`docs` 等目录，`git status` 是活快照，不是静止值。

未跟踪文件的真实规模（`--untracked-files=all`）：

| 指标 | 数量 |
|---|---|
| 全部条目 | 3762 |
| 未跟踪文件 | 2734 |
| 被忽略条目（折叠） | 578 |

---

## 2. 差异性质分类

### 2.1 按 `git status --porcelain` 前缀

| 前缀 | 条数 | 含义 |
|---|---:|---|
| `D`（deleted） | **611** | HEAD 有、磁盘没有 |
| `M`（modified） | **417** | HEAD 有、磁盘有、元数据/内容不同 |
| `??`（untracked，折叠显示） | **62** | 新目录/新文件（展开后 2734 个文件） |
| 合计 | **1090** | |

### 2.2 `M` 的细分（关键发现）

`git diff --summary` 对 1028 个变更文件给出：**417 条 `mode change 100755 => 100644` + 611 条 `delete`，没有任何 `create`**。再按 numstat 拆：

| 子类 | 条数 | 说明 |
|---|---:|---|
| 仅模式漂移（0/0） | **207** | 内容一模一样，只是 committed 权限位是 755、Windows 检出后是 644 |
| 二进制改动 | **54** | 根目录 `.dh-d-*.bin`、`.g2.bin` 等探针产物；`.*-home/agentd.db*` 等运行库 |
| 文本改动 | **156** | 真实内容修改 |

156 个文本改动按目录：

| 目录 | 条数 | 代表 |
|---|---:|---|
| `evals/` | 95 | `evals/cases/*.json`、`evals/README.md`、`evals/RELEASE.md` |
| `docs/` | 22 | `docs/visual-language.md`（198 行改动）、`docs/tech-stack.md`、`docs/user-guide.md` |
| `design/` | 17 | `design/*.md` 小幅订正 |
| `deploy/` | 16 | `deploy/package.ps1`（31 行）、`deploy/run-local.ps1`（60 行）、`deploy/restore.ps1` |
| 根目录 | 3 | `README.md`（45+/27-）、`.gitignore`（9+/2-）、`start.ps1`（4+/5-） |
| `scripts/` | 3 | 校验脚本 |

> 注意：`skeleton/` 的 18 条、`docs/` 里若干条、`deploy/` 里 0/0 的条目，都是**纯模式漂移**，没有内容差异。`core.filemode=true` 是噪声根源。

### 2.3 `D` 的细分（611 条，互斥）

| 类别 | 条数 | 性质 | 是否可从 HEAD 取回 |
|---|---:|---|---|
| `agentd/.tmp-*`（DB/WAL/lock/index） | **262** | 运行产物/测试环境残留 | 是（但不该取回） |
| `web/src` + `web/public` | **154** | 旧前端实现 | 是 |
| `agentd/` 源码（`internal/`、`cmd/`） | **145** | 旧后端实现 | 是（144/145 在 `backend/` 有同名文件） |
| `web/scripts` | **41** | 旧前端构建/校验脚本 | 是 |
| `research/` | **9** | 调研文档，已被上游主动归档删除 | 是 |

### 2.4 `??` 的展开（2734 个文件，按顶层目录）

| 顶层 | 文件数 | 性质 |
|---|---:|---|
| `scratch/` | 1242 | 临时脚本/截图/profile，本地独有 |
| `backend/` | 480 | 真实成果（agentd 的新位置） |
| `frontend/` | 381 | 真实成果（web 的重写实现，`src` 仅 29 个文件） |
| `.tools/` | 284 | 便携 git 工具链，**未被忽略** |
| `specs/` | 170 | 真实成果（规格体系） |
| `docs/` | 65 | 真实成果（`docs/plan/`、`docs/process/` 等新目录） |
| `archive/` | 57 | 归档实验（424MB） |
| `design/` | 22 | 真实成果（新设计文档） |
| `data-preprod-20261113-101622/` | 12 | 本地数据库快照，本地独有 |
| `data-backup-20261112-213107/` | 11 | 本地数据库快照，本地独有 |
| `scripts/` | 3 | 真实成果 |
| `.github/` | 3 | CI 工作流 |
| 根目录文件 | 4 | `AGENTS.md`、`DESIGN.md`、`HANDOFF.md`、`LICENSE` |

### 2.5 抽样 15 条判定

| # | 状态 | 路径 | 磁盘存在 | 判定 |
|---:|---|---|---|---|
| 1 | `D` | `agentd/.tmp-index/agentd.db` | 否 | 运行产物（SQLite 索引库） |
| 2 | `D` | `agentd/internal/agent/loop.go` | 否 | 真实成果，已迁到 `backend/internal/agent/loop.go`（实测存在） |
| 3 | `D` | `web/src/app.tsx` | 否 | 旧前端源码；新实现是 `frontend/src`（29 个文件），旧文件只能从 HEAD 取回 |
| 4 | `D` | `web/scripts/check-m10-workflows.mjs` | 否 | 旧前端校验脚本 |
| 5 | `D` | `research/memory-first-prior-art.md` | 否 | 调研文档；`.tmp/delete-old-paths.mjs` 显示上游也删了 `research/` |
| 6 | `M` | `.allow-m12pdf.json` | 是 | 运行产物（探针 allow 配置），mode-only |
| 7 | `M` | `.chat-probe.json` | 是 | 运行产物（探针输出），mode-only |
| 8 | `M` | `evals/cases/100-memory-agent.json` | 是 | 真实成果（eval 用例，2+/1-） |
| 9 | `M` | `docs/visual-language.md` | 是 | 真实成果（198 行改写） |
| 10 | `M` | `design/README.md` | 是 | 真实成果（小改） |
| 11 | `M` | `deploy/package.ps1` | 是 | 真实成果（31 行改） |
| 12 | `M` | `skeleton/src/kernel/store.mjs` | 是 | mode-only（0/0，无内容变化） |
| 13 | `??` | `docs/plan/` | 是 | 真实成果（计划文档目录） |
| 14 | `??` | `specs/` | 是 | 真实成果（170 个规格文件） |
| 15 | `??` | `backend/` | 是 | 真实成果（480 个文件，旧 agentd 的新位置） |

补充：`?? .tools/` 虽未在折叠列表中单列，但 `--untracked-files=all` 下贡献 284 个条目，纯属工具链污染。

### 2.6 性质结论

| 桶 | 条数 | 处置建议 |
|---|---:|---|
| 真实工作成果（文本改动 + 新目录/规格/前后端） | 156 个改动文件 + ~1185 个未跟踪文件 | 保留，进入正规提交 |
| 运行产物/杂项（`.*-home/`、探针 json/bin、DB） | 262 删除 + 54 二进制改动 + 207 模式漂移中的多数 | 补 ignore，不提交 |
| 结构性删除（重构/重写/归档） | 349 | 不需要"恢复"，但需确认 `web/` 旧实现是否还要 |
| 纯模式漂移 | 207 | `core.filemode=false` 后自动消失 |

---

## 3. HEAD 落后多少

### 3.1 本地历史

```
10270a3 UI:
3c44d52 ci:
08a47ca Simo
```

三个提交全部产生于 2026-11-09（initial commit 的 reflog 时间戳为 1794236846，即 2026-11-09）。`.git/objects` 与 `index` 的 mtime 停在 **2026-11-10 00:29**，之后本地没有任何对象写入。

### 3.2 远程 head 是否在本地历史之外

- 远程 head（Lead 已通过 GitHub API 核实）：`03648018890f0b48358bcf6419b97d0d60403d2a`，2026-11-21。
- 本地验证：`git cat-file -e 0364801...^{commit}` → **退出码 128（对象不存在）**。
- 结论：**是，远程 head 完全在本地历史之外**。本地没有任何 remote-tracking ref（`git for-each-ref` 只有 `refs/heads/main`）。

### 3.3 落后多少提交：无法判定

- `git ls-remote` 无法完成（网络策略 403，见 §7）。
- 本地没有 `FETCH_HEAD`、没有 `refs/remotes/`、没有可用的 commit-graph 外资料。
- 旁证（不是计数）：`.tmp/restructure-push*.mjs` 里引用的父提交 `6038e6b21d1a7dfb6e8d9bb00c7c0609f8e549f2`、`f584aed89db1ca8f84d75336902e3ae0a7d6f47c` 均不在本地对象库，说明 11-09 之后至少有多次 API 提交，且提交链一路 force-update 到 11-21。

> 明确写"无法判定"：缺少网络与远程对象，任何具体数字都会是编造。

---

## 4. 是否存在丢失风险

### 4.1 可恢复（风险低）

611 个删除文件都存在于本地 HEAD，取回命令（**仅示意，本次未执行**）：

```powershell
.tools\git\cmd\git.exe show HEAD:agentd/internal/agent/loop.go > <目标路径>
```

`git fsck --no-reflogs` 还发现大量 dangling blob（历史中间态），说明 11-09 之前的内容也有残留对象可捞。

### 4.2 无法判定（远程侧）

"本地有、但远程没有"**无法判定**，原因：

1. 无法 `git ls-remote` / `git fetch`：代理返回 `CONNECT tunnel failed, response 403`；
2. GitHub API 同样 403（`curl https://api.github.com/repos/YJM1024/simo` → 403）；
3. 本地没有远程 tree/commit 对象可对比；
4. DSH 的 `github_api` 工具当前无 token（返回"没有配置 GitHub token"）。

### 4.3 真正的本地独有资产（无 git 历史）

| 路径 | 文件数 | 大小 | 说明 |
|---|---:|---:|---|
| `.tools/` | 375 | 91.8 MB | 便携 git（含 MinGit 解包） |
| `scratch/` | 1287 | 51.1 MB | 临时脚本、截图、Chrome profile |
| `data-backup-20261112-213107/` | 45 | 8.7 MB | 含 `agentd.db` 2.0MB、`simo.db` 2.67MB 及 WAL |
| `data-preprod-20261113-101622/` | 18 | 4.2 MB | 预发布数据快照 |
| `archive/` | 13316 | 423.9 MB | 归档实验 |
| `.tmp/` | 67364 | 5.0 GB | 已被 ignore，但本地唯一副本 |
| `data/` | 27 | 13.3 MB | 已被 ignore，运行数据 |

其中 `data-backup-*`、`data-preprod-*`、`scratch/`、`.tools/`、`archive/` 均**未被 `.gitignore` 覆盖**，既不在 HEAD，也无法确认远程是否有副本。

### 4.4 破坏性操作黑名单（当前状态下）

| 命令 | 后果 |
|---|---|
| `git reset --hard` / `git checkout -- .` | 把 156 个 11-21 内容回退成 11-09；复活 611 个已删文件（含 262 个 DB 产物）；不可撤销（除非再用 reflog/远程） |
| `git stash`（含 `-u`） | 同上，且会卷走未跟踪文件；stash 冲突时极易丢改动 |
| `git add -A && git commit` | 会把 262 个运行产物删除、2734 个未跟踪文件（含 92MB 工具链、数据库备份）写进历史 |
| `git clean -fdx` | 直接抹掉 `.tmp`（5GB）、`data/`、`backend/`、`frontend/` 等未跟踪内容；工作区规则也明令禁止 |
| 直接删/换 `.git` | 丢失 11-09 的唯一历史与 dangling 对象；并行 agent 正在写盘时可能连带丢索引 |

---

## 5. `.gitignore` 覆盖情况

当前 `.gitignore` 共 52 行，已在 11-21 更新（`agentd/` → `backend/`、新增 `frontend/dist/`、archive/storybook 缓存），但仍有明显缺口。

### 5.1 实测覆盖矩阵

| 路径 | 是否忽略 | 证据 |
|---|---|---|
| `.tools/git/cmd/git.exe` | 是（命中 `*.exe`） | `git check-ignore -v` |
| `.tools/` 其余 284 个文件 | **否** | `git status --untracked-files=all -- .tools` → 284 条 |
| `.final13-home/` | **否**（只有 `.m17-*`~`.m21-*`、`.m30-*`、`.m40-*`、`.leadcheck/`） | `check-ignore` 无输出 |
| `.m8-eval-home/` 等 `.m*` 早期 home | **否** | 同上 |
| `data-backup-*/`、`data-preprod-*/` | **否** | 同上 |
| `scratch/` | **否** | 同上 |
| 根目录 `.allow-*.json`、`.chat-probe.json`、`.d-d-*.json`、`*.bin` | **否**（且已被 11-09 提交跟踪） | 同上 |
| `*.db` / `*.db-wal` / `*.db-shm` | **否** | 已被跟踪，故 ignore 对新文件也需 `git rm --cached` 配合 |
| `evals/` 其余内容 | 部分（只有 `evals/reports/`、`evals/incident/`） | `.gitignore` 第 19–20 行 |
| `.git/` | 写了，但无意义（git 从不跟踪自己） | — |

### 5.2 建议补充的忽略项

```gitignore
# ---- local toolchain (reinstall with deploy/install-git.ps1) ----
.tools/

# ---- runtime homes / eval sandboxes (all generations) ----
.[a-z0-9]*-home/
.*-verify-home/
.*-eval-home/
.leadcheck/
.tmp-*/
.final13-home/

# ---- probe / allow / one-shot artifacts at repo root ----
.allow-*.json
.*-probe*.json
.chat-probe.json
.sch*.json
.d-*.json
.da-*.json
.dh-*.bin
.gh-*.bin
.g2.*
*.bin

# ---- local data snapshots ----
data-backup-*/
data-preprod-*/

# ---- scratch workspace ----
scratch/

# ---- binaries / databases ----
*.db
*.db-wal
*.db-shm
*.lock
```

配套动作（需 Lead 批准，**本次未执行**）：

```powershell
# 只改索引，不删磁盘文件
.tools\git\cmd\git.exe rm --cached -r --ignore-unmatch agentd web
.tools\git\cmd\git.exe config core.filemode false
```

> `core.filemode false` 会让 207 条纯模式漂移立即消失；剩余 1154 条中 611 条是结构删除、156 条是真实改动。

---

## 6. 三条路线对比

### 路线 A：保持 GitHub API 为主通道，本地 git 只读

**步骤**

```powershell
# 只读，不配置 remote
.tools\git\cmd\git.exe status --porcelain
.tools\git\cmd\git.exe log --oneline -5
```

**会不会破坏现有文件**：不会。
**回滚方式**：无需回滚。
**风险**：索引/HEAD 永久停在 11-09，任何人不小心执行 `checkout/reset` 就会造成 §4.4 的后果；本地永远没有"当前版本"的安全网；token 继续明文躺在 `.git/config`。
**适用**：只是短期观望，不作为长期方案。

### 路线 B：重新 clone 干净仓库到 `.tmp\repo-clean`，对比后人工合并（**推荐**）

**步骤**

```powershell
# 0) 绕开全局 insteadOf（否则 https 被重写成 ssh）
$env:GIT_CONFIG_GLOBAL = "E:\dsh_home\workspaces\agent\.tmp\gitcfg-empty"
$env:GIT_CONFIG_NOSYSTEM = "1"
$env:GIT_TERMINAL_PROMPT = "0"

# 1) 凭据只经进程参数传入，不落盘、不打印
#    $b64 = base64("x-access-token:<token>")
.tools\git\cmd\git.exe -c "http.extraheader=Authorization: Basic $b64" `
  clone https://github.com/YJM1024/simo.git .tmp\repo-clean

# 2) 记录
.tools\git\cmd\git.exe -C .tmp\repo-clean log -1 --format='%H %ad %s'
.tools\git\cmd\git.exe -C .tmp\repo-clean rev-list --count HEAD

# 3) 逐目录对比（排除 .git/.tmp/.tools/node_modules/data/dist/*.exe）
.tools\git\cmd\git.exe -c core.quotepath=false diff --no-index --stat `
  --  docs .tmp\repo-clean\docs
# 其余目录同理：design deploy evals specs scripts backend frontend harness skeleton

# 4) 可选：先看"工作区是否与远程一致"
.tools\git\cmd\git.exe -C .tmp\repo-clean status --porcelain
```

**会不会破坏现有文件**：不会（clone 只写 `.tmp/repo-clean`；diff 只读）。
**回滚方式**：`Move-Item .tmp\repo-clean .tmp\repo-clean-abandoned` 即可；工作区零改动。
**风险**：需要网络；clone 体积可能较大（`backend/` 本地 3.7GB 是含产物的，远程 tree 应远小于此）；token 会出现在本进程命令行（不对日志输出）；`--no-index` 对二进制只给"不同"不给细节。

### 路线 C：修复现有仓库（add remote + fetch + 建分支 + 分批提交）

**步骤（分段，任一步失败即停）**

```powershell
$git = ".tools\git\cmd\git.exe"
& $git config core.filemode false
& $git remote add origin https://github.com/YJM1024/simo.git
& $git fetch origin main                       # 需要网络
& $git branch backup/local-20261109 10270a3    # 保留旧历史
& $git update-ref refs/remotes/origin/main FETCH_HEAD
& $git reset --soft origin/main                # 只动 HEAD/index，不动工作区
& $git status --porcelain                      # 此时才是"本地 vs 远程"的真实差异
```

**会不会破坏现有文件**：`fetch`/`branch`/`update-ref` 不碰工作区；`reset --soft` 只改 HEAD 与索引，**不碰工作区文件**。但如果误用 `--mixed`/`--hard`，就会执行 §4.4 的回退。
**回滚方式**：`git reset --soft 10270a3` → `git remote remove origin`；`backup/local-20261109` 分支保留。
**风险**：
1. fetch 会把远程全部对象拉进现有 `.git`，若远程历史很大，磁盘与耗时不可控；
2. 现有 `.git` 是 11-09 的一次性快照，与远程历史**没有共同祖先**（initial commit 是本地产物），`reset --soft origin/main` 后 `git status` 会把整棵树显示为"全部新增/删除"，仍需要人工比对；
3. 任何并行 agent 在此时写盘，index 可能被污染；
4. 若误执行 `git checkout` 补文件，直接触发大范围回退。

### 对比表

| 维度 | A 只读 | B 干净 clone | C 原地修复 |
|---|---|---|---|
| 需要网络 | 否 | 是 | 是 |
| 是否动工作区文件 | 否 | 否 | 否（仅 `--soft`；误操作会） |
| 是否动现有 `.git` | 否 | 否（第二步才换） | 是（写入远程对象） |
| 可回滚性 | 无需 | 极好（删/移 `.tmp/repo-clean`） | 中（依赖 backup 分支 + reflog） |
| 能否得到"远程 vs 本地"精确差异 | 否 | 是（逐目录 `--no-index`） | 是（`reset --soft` 后 status），但历史无共同祖先 |
| 推荐度 | 临时 | **推荐** | 备选 |

---

## 7. 路线 B 执行结果（Lead 指定，第一步）

### 7.1 执行记录

| 步骤 | 结果 |
|---|---|
| 读取 `.git/config` 中的 URL（不打印） | 成功；URL 为 https 且内嵌凭据（长度 144） |
| 尝试 `git ls-remote`（带 Basic 头） | **失败**：`couldn't create signal pipe, Win32 error 5` → 全局 `url.git@github.com:.insteadOf https://github.com/` 把 https 重写成 SSH，ssh 又被沙箱的命名管道限制拦住 |
| 用 `GIT_CONFIG_GLOBAL=.tmp/gitcfg-empty` + `GIT_CONFIG_NOSYSTEM=1` 绕开 insteadOf 后重试 | **失败**：`fatal: unable to access '<url>' CONNECT tunnel failed, response 403`（exit 128） |
| `curl https://github.com/...` / `curl https://api.github.com/...` | 均 **403 CONNECT**（代理层拒绝，不是凭据问题） |
| `git clone ... .tmp\repo-clean` | **未执行**——前置连通性已失败，不做无意义重试 |
| `.tmp\repo-clean` 是否创建 | **否** |
| 克隆 HEAD / 分支 / commit 数 | **N/A（未克隆）** |
| `diff --no-index` 差异统计与清单 | **未执行** |
| 工作区是否已与远程 head 一致 | **无法判定**（见 §4.2） |

### 7.2 失败根因（两个独立阻塞）

1. **网络策略**：所有 `github.com:443` / `api.github.com:443` 的 CONNECT 均被本地策略代理 403 拒绝。这是本次无法完成 clone 的**决定性**原因。
2. **全局 git 配置**：`C:/Users/YJM1024/.gitconfig` 里的 `url.git@github.com:.insteadOf https://github.com/` 会把 https 静默改写成 SSH；本机无 SSH key，且 ssh 在该沙箱里无法建信号管道。**即使网络放行，不处理这条也会 clone 失败。**

### 7.3 已完成的替代核查

- 远程 head `0364801` 不在本地对象库（`cat-file -e` 退出码 128）。
- 本地只有 3 个提交、无 remote-tracking ref、无 `FETCH_HEAD`。
- 工作区 2734 个未跟踪文件、611 个删除、156 个真实文本改动（完整分类见 §2）。
- 未创建、未修改、未删除任何仓库文件；`data-backup-*` 等本地独有资产保持原样。

### 7.4 恢复执行的条件

满足任一即可继续第一步：

- 策略代理放行 `github.com:443`（及 `api.github.com:443`，便于校验 head）；或
- 由能联网的机器执行 `git clone --mirror`/`git bundle create`，把产物拷到 `.tmp/`（离线 bundle 后 `git clone <bundle> .tmp\repo-clean`）；或
- 提供可用的 `GITHUB_TOKEN` 并放行 api（仍需解决 https/ssh 改写）。

---

## 8. 执行路线 B / C 前必须由 Lead 确认的事项

1. **网络放行**：是否可以把 `github.com:443`（含 `api.github.com`）加入代理白名单？否则 B 的第一步无法开始，只能走离线 bundle。
2. **凭据处置**：`.git/config` 里明文内嵌了 token，且 `E:\dsh_home\dsh-github-publish\token` 也是明文文件。是否先**轮换 token**，再用 `-c http.extraheader` 临时传入？是否允许把 token 从 `branch.main.remote` 中移除（改回标准 `[remote "origin"]`）？
3. **并行写入窗口**：路线 B 第二步要移动 `.git`。工作区当前有其它 agent 在写（`git status` 计数在 1090–1093 间波动）。必须确认一个"停写窗口"，并确认 `.tmp` 与工作区在**同一磁盘卷**（否则 `Move-Item` 变复制，更慢也可能半途失败）。
4. **156 个文本改动以谁为准**：`evals/`（95）、`docs/`（22）、`design/`（17）、`deploy/`（16）等改动可能是 11-21 的最新值，也可能是 11-09 的旧值。**在拿到远程 tree 前不允许 `checkout/reset`**；拿到后需逐文件 diff 决策（保留本地 / 采用远程 / 合并）。
5. **旧 `web/` 是否废弃**：`web/src` 154 个文件在磁盘上已无对应物（`frontend/src` 只有 29 个文件，是重写版）。确认"旧 UI 不再需要"后，这些删除才可以接受；否则先从 HEAD 取回对照。
6. **本地独有资产归属**：`data-backup-*`（12.9MB，含真实 DB）、`data-preprod-*`、`scratch/`（51MB）、`archive/`（424MB）、`.tools/`（92MB）——是纳入仓库、另行归档，还是确认远程已有副本？在确认前不要 `clean`、不要格式化。
7. **`.git` 替换的授权与回滚点**：第二步需明确允许 `Move-Item .git .tmp\old-git`（不删除），并接受"移动后 `git status` 与旧 reflog 暂不可用，需用 `.tmp\old-git` 回滚"。
8. **是否允许改配置**：`core.filemode=false`、补 `.gitignore`、`git rm --cached` 运行产物——这些都会改变仓库行为，需明确授权。

---

## 9. 附：本次只读证据命令

```powershell
$git = "E:\dsh_home\workspaces\agent\.tools\git\cmd\git.exe"
& $git rev-parse HEAD
& $git log --oneline -10
& $git status --porcelain=v1
& $git status --porcelain=v1 --untracked-files=all
& $git diff --summary
& $git diff --numstat --diff-filter=M
& $git ls-tree -r --name-only HEAD | Measure-Object
& $git for-each-ref
& $git cat-file -e 03648018890f0b48358bcf6419b97d0d60403d2a^{commit}
& $git check-ignore -v --no-index <path>
& $git fsck --no-reflogs
```

> 所有命令均无写入；`cat-file -e`、`check-ignore`、`fsck`（`--no-reflogs` 不写 lost-found）均为只读语义。

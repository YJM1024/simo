# 提交执行清单（git-commit-plan）

> **状态：草案，未执行。** 本文只描述"到提交这一步为止"的命令与验收数值；所有命令在 Lead 下令前**一条都不跑**。
> 上游依据：`docs/plan/git-hygiene-report.md`（现状诊断）、`docs/plan/git-diff-vs-remote.md`（与远程 head 逐文件对比）、`docs/plan/gitignore-proposal.md`（忽略规则提案）。
> Lead 裁决（2026-11-21）：`frontend/review/` 只忽略 `**/*.png`；`archive/*` + `!archive/README.md`；`core.filemode=false` **暂不授权**，模式漂移先挂账。

## 0. 一句话

一次提交把「工作区现状」变成「索引现状」：追加 31 条忽略规则 → 移出 742 条已跟踪垃圾 → 纳入约 553 个源码/文档 → 提交；**含 commit，不含 push**。

## 1. 范围：这次提交包含什么、不含什么

| 类别 | 数量 | 处置 |
|---|---|---|
| 追加 `.gitignore` | 31 条规则 / 39 行 | 写入并提交（步骤 A） |
| 索引移除（`git rm --cached`） | **742** | 只动索引，**不动磁盘**（步骤 B） |
| 新入仓（`git add`） | **553**（live，±3） | 源码/文档（步骤 C） |
| 内容更新（已跟踪且内容 ≠ HEAD） | **156** | 一并提交（步骤 C） |
| 纯模式漂移（100755→100644） | **130**（= 286 − 156） | 已裁：选项 A，如实记录 644（§8.2） |
| 工作区领先远程 head 的文件 | **23**（19:52 复核，原为 5） | 一并提交；数量以冻结时重算为准（§7.1） |
| push / force-push | — | **不做**，见 §8.1 |
| `core.filemode` 配置 | — | **不改**（Lead 未授权） |

提交后索引条目预期：`1028 − 742 + 553 = 839`。

## 2. 步骤 A：追加 `.gitignore`（39 行，保持 LF）

### 2.1 现状（实测）

- 812 字节 / 52 行 / **纯 LF（CRLF = 0）**，mtime `2026-11-14 02:53`
- SHA256 `8655A8F9E3A37E9DD12EC32D89B4DC6F6C9EF50AF331064CD7F2477D24B52452`
- 末尾三行：`*.ignored_*`、`**/.pnpm-store/`、`.pnpm-store/`

### 2.2 追加块（31 条规则 + 8 行分节注释 = 39 行）

```gitignore
# ==== hygiene: toolchain & sandbox homes ====
.tools/
.*-home/

# ==== hygiene: runtime databases & sidecars ====
*.db
*.db-shm
*.db-wal
*.db.lock
backend/.tmp*

# ==== hygiene: one-off probe & dump artifacts in repo root ====
/.*-allow*.json
/.allow-*.json
/.*-probe*.json
/.probe-*.json
/.chat-probe*.json
/.d-d-*.json
/.da-d-*.json
/.g-g-*.json
/.ga-g-*.json
/.g2.json
/.sch*.json
/.ui1-*.json
/*.bin

# ==== hygiene: pre-op data snapshots ====
data-backup-*/
data-preprod-*/

# ==== hygiene: scratch workspace ====
scratch/

# ==== hygiene: frontend generated output & review screenshots ====
frontend/coverage/
frontend/coverage-threshold-check/
frontend/review/**/*.png

# ==== hygiene: backend generated output ====
backend/internal/webui/dist.bak-*/
backend/*.err
backend/*.out

# ==== hygiene: archived experiments (keep the index) ====
archive/*
!archive/README.md
```

> 分节注释之间有 8 个空行可加可不加；上面的 39 行是**实际校验过的**版本（31 条规则 + 8 行注释，无空行）。

### 2.3 关键约束：**不能用 `Add-Content`**

PowerShell 5.1 的 `Add-Content` / `Set-Content` / `Out-File` 写 **CRLF**；`.gitignore` 现在是纯 LF，混入 CRLF 会让 `git check-ignore` 对文件级模式静默失配（已在提案阶段踩过，全表 0 命中）。必须：

```powershell
$ts   = Get-Date -Format 'yyyyMMdd-HHmmss'
$repo = 'E:\dsh_home\workspaces\agent'
Set-Location $repo
# 0) 备份（复制，不移动）
Copy-Item .gitignore ".tmp\gitignore.bak-$ts"
# 1) 追加（LF 结尾，UTF-8 无 BOM）
$block = @'
<把 §2.2 的 39 行原样粘贴到这里>
'@
[IO.File]::AppendAllText("$repo\.gitignore", "`n" + $block + "`n", (New-Object System.Text.UTF8Encoding($false)))
```

### 2.4 校验（必须全部通过才进步骤 B）

```powershell
# 行数与字节数：52 → 92 行（52 + 1 空行 + 39）
(Get-Content .gitignore).Count
# 必须仍是 0 个 CRLF
$b=[IO.File]::ReadAllBytes('.gitignore'); ($b | Where-Object { $_ -eq 13 }).Count
# 有效文件不被忽略（期望 4 个合法根文件 + 抽查均无输出、退出码 1）
'.dockerignore','.gitignore','README.md','start.ps1','design/26-记忆中心并发Harness-v0.md','docs/testing/README.md','specs/product/TREE.md' |
  & .\.tools\git\cmd\git.exe check-ignore --no-index --stdin
# 覆盖量：未跟踪命中 2184、剩余 ~553
(& .\.tools\git\cmd\git.exe ls-files -o --exclude-standard).Count
```

**闸门**：`ls-files -o --exclude-standard` 数量必须落在 **550–560**，且路径全部落在 §4.1 的目录里；否则停手回查规则。

## 3. 步骤 B：索引清理 `git rm --cached`（742 条）

### 3.1 分组（来自 `git ls-files` = 1028 条的实测拆分）

| 组 | 条数 | 内容 | 磁盘现状 |
|---|---:|---|---|
| `agentd/` | 407 | 旧 Go 服务（145 源码 + 262 `.tmp-*` 运行库） | **目录已不存在** |
| `web/` | 195 | 旧前端（`src` 154 + `scripts` 41） | **目录已不存在** |
| `research/` | 9 | 上游已删除的实验目录 | **目录已不存在** |
| `.*-home/` | 78 | 16 个评测沙箱 HOME（`.final13-home`、`.m8-eval-home`、`.m13-eval-home`、`.ui1-verify-home` …） | 存在 |
| 根目录一次性探针 | 52 | `.allow-*`、`.*-probe*`、`.d-d-*`、`.da-d-*`、`.g-g-*`、`.ga-g-*`、`.g2*`、`.sch*`、`.ui1-*`、`*.bin` … | 存在 |
| `scratch/probe.txt` | 1 | 草稿探针 | 存在 |
| **合计** | **742** | | |

> 611（agentd + web + research）正好等于 `git status` 的 D 611；另 131 条（78 + 52 + 1）是**磁盘上还在、但属于垃圾**的已跟踪文件——它们不会因为 `.gitignore` 消失，必须走 `rm --cached`。

### 3.2 命令（两条，全部 `--cached`，磁盘零改动）

```powershell
$git = 'E:\dsh_home\workspaces\agent\.tools\git\cmd\git.exe'
Set-Location 'E:\dsh_home\workspaces\agent'

# B1) 三个已消失的旧目录：611 条
& $git rm -r --cached -q --ignore-unmatch -- agentd web research

# B2) 沙箱 HOME + 根探针 + scratch 草稿：131 条（用索引生成清单，避免手写漏项）
$keep = @('.dockerignore','.gitignore','README.md','start.ps1')
& $git ls-files |
  Where-Object { ($_ -match '/') -or ($keep -notcontains $_) } |
  Out-Null                                            # 只用于核对，不落盘
& $git ls-files |
  Where-Object { (($_ -split '/')[0] -like '.*-home') -or ($_ -notmatch '/' -and $keep -notcontains $_) -or ($_ -eq 'scratch/probe.txt') } |
  Set-Content '.tmp\rm-cached-131.txt' -Encoding ASCII
& $git rm --cached -q --pathspec-from-file='.tmp\rm-cached-131.txt'
```

> `Set-Content -Encoding ASCII` 写 CRLF 也没关系——`--pathspec-from-file` 会按行解析并容忍 CR（git 2.56）。若担心 CR，可改用 `[IO.File]::WriteAllText($f, ($lines -join "`n") + "`n", (New-Object System.Text.ASCIIEncoding))`。

### 3.3 校验

```powershell
(& $git status --porcelain | Measure-Object -Line).Lines          # 期望 = 742 行 staged D + 286 行 unstaged M
(& $git diff --cached --name-only --diff-filter=D).Count          # 期望 742
(& $git ls-files).Count                                           # 期望 286
Test-Path '.final13-home'                                         # 必须 True（磁盘未被删）
Test-Path 'scratch\probe.txt'                                     # 必须 True
```

## 4. 步骤 C：入仓（约 553 个）

### 4.1 分组（`.tmp/hygiene/remaining3.txt` 快照，3.84 MB）

| 目录 | 文件数 | 体积 | 主要构成 |
|---|---:|---:|---|
| `backend/` | 201 | 1438 KB | `internal/modules` 88、`cmd/simo` 64、`internal/platform` 26、`internal/core` 13、`tools` 3、`go.mod`/`go.sum`/README/RELEASE |
| `specs/` | 170 | 867 KB | `changes` 109、`test` 12、`product` 11、`FE-001` 6、各 `FE-00x`/`COMP-*` 各 2、`templates` 3 |
| `frontend/` | 81 | 680 KB | `src` 29、`e2e` 22、`review` 10（md/json，png 已忽略）、`prototype` 9、配置文件 |
| `docs/` | 66 | 804 KB | `process` 36、`product` 9、`tasks` 6、`testing` 5、`plan` 5、根 md |
| `design/` | 24 | 34 KB | 26–39 号设计稿 + `drafts/` 2 |
| `scripts/` | 3 | 66 KB | `check-trace.mjs`、`check-sdd.mjs`、`README.md` |
| `.github/workflows/` | 3 | 11 KB | `e2e.yml`、`storybook.yml`、（+1） |
| `archive/` | 2 | 2.9 KB | `README.md`、`archive/design` |
| 根 | 4 | 23 KB | `AGENTS.md`、`DESIGN.md`、`HANDOFF.md`、`LICENSE` |

其中 **34 篇新文档**（清单见 `docs/plan/gitignore-proposal.md` §2 与 `.tmp/hygiene/source-real.json`）已包含在上表内：`design/` 24、`specs/changes/CHG-SYS-001/` 3、`docs/plan/`、`.github/workflows/` 2、`frontend/src/raw.d.ts`、`frontend/prototype/` 2。

### 4.2 命令（先审后加）

```powershell
# C0) 审计闸门：列出"忽略规则放行"的全部未跟踪文件
& $git ls-files -o --exclude-standard | ForEach-Object { ($_ -split '/')[0] } |
  Group-Object | Sort-Object Count -Descending | Format-Table Count,Name
# 期望：仅 backend / specs / frontend / docs / design / scripts / .github / archive + 4 个根文件

# C1) 暂存全部变更（新增 + 删除 + 内容更新；被忽略的 2184 个不会进入）
& $git add -A
# C2) 核对暂存统计
& $git diff --cached --stat | Select-Object -Last 1
```

> 为什么 `add -A` 是安全的：`agentd/`、`web/`、`research/` **三个目录在磁盘上已不存在**（实测 `Test-Path` = False），不会被加回；`scratch/`、`.*-home/`、根探针均已被步骤 A 的规则覆盖。

### 4.3 校验

```powershell
(& $git diff --cached --name-only --diff-filter=A).Count   # 期望 550–560
(& $git diff --cached --name-only --diff-filter=D).Count   # 必须 742
(& $git diff --cached --name-only --diff-filter=M).Count   # 286（156 内容 + 130 模式）或 156（若采纳 §8.2 选项 B）
(& $git ls-files).Count                                    # 839 或 839
```

## 5. 步骤 D：commit

### 5.1 message 草案

```
repo: adopt 11-21 workspace, curate index, ignore runtime artifacts

- .gitignore: +31 rules covering 2,184 of 2,737 untracked files (262.7 MB)
  and 347 already-tracked paths (toolchain, sandbox homes, runtime DBs,
  root probes, data snapshots, scratch, coverage, review png, archive)
- index: drop 742 stale entries
  (agentd/ 407, web/ 195, research/ 9, *-home/ 78, root probes 52, scratch 1)
- add: ~553 source/doc files, incl. specs/changes/CHG-SYS-001,
  design/26-40, .github/workflows/{e2e,storybook}.yml, docs/plan/*
- update: 156 tracked files already matching the 2026-11-21 remote head,
  plus mode normalization 100755 -> 100644

Refs: docs/plan/git-hygiene-report.md
      docs/plan/git-diff-vs-remote.md
      docs/plan/gitignore-proposal.md
```

### 5.2 命令

```powershell
& $git commit -F '.tmp\commit-msg.txt'          # UTF-8 无 BOM 写入 message
& $git show --stat --oneline HEAD | Select-Object -First 3
(& $git status --porcelain | Measure-Object -Line).Lines     # 期望 0
(& $git ls-files).Count                                      # 期望 839
```

## 6. 回滚

| 场景 | 操作 | 影响 |
|---|---|---|
| 只做了 A（`.gitignore`） | `Copy-Item ".tmp\gitignore.bak-$ts" .gitignore -Force` | 只回文件，零风险 |
| 做了 A + B，未 commit | `git reset`（mixed，默认） | 索引回到 HEAD；**磁盘不动**；742 条恢复为已跟踪 |
| 做了 A+B+C，未 commit | 同上 `git reset` | 暂存全撤，工作区文件保留 |
| 已 commit，想撤提交 | `git reset --soft HEAD~1` → 再 `git reset` | 提交消失，改动回到工作区；旧 HEAD 仍在 reflog |
| `.git` 被改坏 | `Copy-Item ".tmp\old-git-$ts" .git -Recurse -Force`（执行前**复制**，42.57 MB） | 回到提交前仓库 |
| `.git/index.lock` 残留（现有一个 19:33 的） | **移动**到 `.tmp\old-lock\`（不删除） | 否则所有写操作报 "Another git process" |

> **禁用清单**（会造成不可逆内容丢失，本清单任何一步都不许用）：
> `git reset --hard` / `git checkout -- .` / `git checkout .` / `git stash` / `git clean -fdx` / `git restore .`
> 原因：156 个文件的内容会被回退到 2026-11-09 的旧值，611 个已删除文件会被复活。

## 7. 前置条件（全部满足才执行）

| # | 条件 | 验证方式 |
|---|---|---|
| 1 | Lead 明确说"冻结开始" | 指令原文（2026-11-21 19:52 起 Lead 要求：先停手，等冻结令） |
| 2 | `CHG-SYS-001` 收口（`test-plan.md` / `evidence.md` 写完，目录不再增长） | 两次 `ls specs/changes/CHG-SYS-001` 结果一致 |
| 3 | 5 个领先文件定稿且 mtime 稳定 ≥ 10 分钟 | `AGENTS.md`、`scripts/check-sdd.mjs`、`scripts/check-trace.mjs`、`backend/internal/modules/chat/migration_test.go`、`frontend/coverage/coverage-summary.json` |
| 4 | **停写窗口已生效**：所有 agent 停写工作区 | Lead 通知；`git status` 两次采样差 = 0（见 §7.1 ①） |
| 5 | **861 条 hash 已现场重算** | 见 §7.1 ②，比较基准是 `.tmp/repo-clean` 而不是本文档的数字 |
| 6 | **覆盖清单由重算结果生成** | 见 §7.1 ③，禁止用手工/文档里的 553 当清单 |
| 7 | `.git/index.lock` 不存在 | `Test-Path .git\index.lock` = False（现有一个 19:33 残留，执行前移到 `.tmp\old-lock/`） |
| 8 | 模式漂移处置已裁决 | 已裁：**选项 A**，提交如实记录 644（见 §8.2） |
| 9 | `.git` 已备份 | `.tmp\old-git-$ts` 存在且 ≥ 40 MB |
| 10 | 无后台 job 在跑 git | `job_list` |

### 7.1 冻结流程（Lead 发令后按顺序做，**不做完上一步不进下一步**）

**① 停写确认（不写任何东西）**
```powershell
# 间隔 60 秒采样两次，必须完全一致
& .\.tools\git\cmd\git.exe status --porcelain -uall | Sort-Object | Set-Content .tmp\freeze-a.txt -Encoding UTF8
Start-Sleep -Seconds 60
& .\.tools\git\cmd\git.exe status --porcelain -uall | Sort-Object | Set-Content .tmp\freeze-b.txt -Encoding UTF8
Compare-Object (Get-Content .tmp\freeze-a.txt) (Get-Content .tmp\freeze-b.txt)   # 期望：无输出
```
差异非空 = 还有 agent 在写 → 停手回报，**不自行判断"差一点没关系"**。

**② 现场重算 861 条（以 `.tmp/repo-clean` 为基准，不信文档）**
```powershell
# 逐条比对 repo-clean 与工作区（Get-FileHash，避免 git 管道吞中文路径）
# 产出：.tmp\freeze-same.txt / freeze-differ.txt / freeze-missing.txt
```
判据：`missing` 必须 = 0；`differ` 的每条都要确认"本地比远程新"（本地 mtime > 该文件在 `repo-clean` 里的末次提交时间），出现任何"本地旧"就必须先人工裁决。

**③ 用重算结果生成覆盖清单（不是 553）**
```powershell
# 覆盖集 = ②里的 differ + 工作区独有且未被 .gitignore 忽略的文件
& .\.tools\git\cmd\git.exe ls-files -o --exclude-standard > .tmp\freeze-add.txt
# 逐条核对冻结时的数量，记录到执行日志；与本文档 553 的差额必须能解释
```

> **为什么必须重算**：2026-11-21 19:2x 时"工作区 vs 远程"是 5 条领先；19:52 复核已是 **23 条**，新增 18 条集中在 19:44–19:46，是其他 agent 改的 `sessions/*.go`、`chat/*.go`、`frontend/src/app.tsx`、`scripts/check-*.mjs`、5 个 `CHG-CONV-00x/spec.md`。冻结窗口内可能还会变，任何"文档里的数"都只能当预期值，不能当输入。

## 8. 风险与未决

### 8.1 push 不在本清单内（最高风险项）

本地 3 个提交（2026-11-09）与远程 57 个提交**无共同祖先**。这次 commit 之后若直接 `git push`，会被拒（non-fast-forward）；要覆盖远程只能 `--force`，那会把远程 57 个提交从分支上摘下（对象仍在，但历史改写）。**正确做法**是先把 `.git` 换成路线 B 的干净克隆（`docs/plan/git-hygiene-report.md` §6 路线 B 第二步），或继续用 GitHub API 写盘。**这一轮只做本地 commit，不解决 push。**

### 8.2 模式漂移（130 条纯 `100755→100644`）——**Lead 已裁决：选项 A**

- **选项 A（已采纳）**：`add -A` 时让 git 记录 644，提交如实反映"与远程历史/GitHub API 写入的位一致"。日后真有 `.sh` 需要执行位，单独 `git update-index --chmod=+x <file>`，**不靠 `core.filemode` 掩耳**。
- 选项 B 作废（用 `-c core.filemode=false` 把 130 条挡在提交外）——会让索引位与磁盘/远程长期不一致。
- **不改 `.git/config`**：A 方案不需要动配置。

### 8.3 领先远程的文件随时可能再变（19:52 已从 5 条涨到 23 条）

- 长期领先的 5 个：`scripts/check-trace.mjs`（33.2 KB，11-21 11:22 还在写）、`scripts/check-sdd.mjs`（27.5 KB）、`AGENTS.md`（4420B）、`backend/internal/modules/chat/migration_test.go`、`frontend/coverage/coverage-summary.json`。
- 19:44–19:46 新增的 18 个：`backend/internal/modules/sessions/{http,service,spec}.go`、`backend/internal/modules/chat/{http,migrations}.go`、`frontend/src/app.tsx`、`frontend/src/components/{library.tsx,components.css,Sidebar.test.tsx}`、`frontend/src/App.test-utils.tsx`、`backend/cmd/simo/{m81_all_messages_test.go,p1_conv_sessions_http_test.go}`、`scripts/check-{sdd,trace}.mjs`、`specs/changes/CHG-CONV-001..005/spec.md`、`docs/product/SPEC-GAP.md`。
- 它们的内容都优于远程，但**必须在门禁脚本/验收收口后**才提交，否则"提交的内容"和"正在验收的内容"不是同一份。数量以冻结时 §7.1 ② 的重算为准。

### 8.4 数量是活快照

本清单的 553 / 2737 / 2184 都是 2026-11-21 19:30–19:45 的采样。执行时必须用 §2.4 / §4.2 的命令**现场重算**，不要相信本文件的数字。

### 8.5 `.gitignore` 管不了已跟踪文件

742 条必须靠 `git rm --cached`；忽略规则只是防止它们**再次**进来。反过来，`rm --cached` 之后如果哪条规则写漏，下次 `add -A` 会把垃圾重新加回来——所以 §2.4 的闸门必须过。

## 9. 执行后自检

```powershell
& $git status --porcelain                                    # 期望：0 行
& $git ls-files | Measure-Object -Line                       # 期望：839
& $git show --stat --oneline HEAD | Select-Object -First 1   # 期望：约 1581 files changed
& $git ls-files | Where-Object { $_ -match '\.tmp-|\.db$|\.db-|\.err$|\.out$|-home/' }   # 期望：空
& $git ls-files 'design/*' | Measure-Object -Line            # 期望 ≥ 24
& $git ls-files 'specs/changes/CHG-SYS-001/*'                # 期望：proposal/spec/tasks (+test-plan/evidence)
```

## 10. 边界

- 本文**没有执行任何一条命令**（除只读的 `ls-files` / `check-ignore` / `status` / `Test-Path` / `Get-FileHash`）。
- `.git`、`.gitignore`、索引、工作区文件均未改动：`.gitignore` SHA256 仍为 `8655A8F9…B52452`，HEAD 仍为 `10270a37d3043b18ab408cca460498df14af72fd`。
- 没有任何文件被删除或移动。
- 数字化结论均标注了来源文件与采样时间；未验证项在 §8 明确列出。

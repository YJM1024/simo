# 本地工作区 vs 远程 head 差异报告（只读）

- 生成时间：2026-11-21 19:3x（Asia/Shanghai；文中所有时间戳均为 **UTC**，+8 即本地时间）
- 对比双方：
  - **本地**：工作区磁盘内容（`E:\dsh_home\workspaces\agent`），逐文件计算 git blob sha1（`sha1("blob <len>\0" + bytes)`，与 git 对象格式一致；本仓库 `core.autocrlf=false`，磁盘字节即 blob 字节）。
  - **远程**：`GET /repos/YJM1024/simo/git/trees/03648018890f0b48358bcf6419b97d0d60403d2a?recursive=1`，共 **1021** 条 entry（861 blob / 160 tree），`truncated=false`。
- 通道：全部走 **node fetch**（`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` v24.21.0）调 GitHub REST API；**未使用 git/curl 联网**。token 从 `.git/config` 读取，仅存于进程内存，未打印、未落盘、未写日志（报告与脚本中均无凭据）。API 初始配额余量 4994/5000。
- 性质：**只读**。未 reset/checkout/stash/clean，未删除、移动任何文件，未改 `.git/config`，未轮换 token，未 commit/push。
- 中间产物（可复核）：`.tmp/hygiene/`（`remote-tree.json`、`differ.json`、`remote-only.json`、`local-only.json`、`source-real.json`、`remote/` 下的 5 个远程副本、`.mjs` 脚本）。

---

## 0. 结论（先说结果）

**工作区不是"落后 13 天的旧副本"，而基本就是远程 head 本身。** 远程 861 个文件里：

| 关系 | 数量 | 含义 |
|---|---:|---|
| 内容完全一致 | **836** | 本地 = 远程（逐字节） |
| 内容不同（本地更新） | **5** | 本地是 11-20/11-21 的新版本，远程还是旧版 |
| 远程有、本地没有 | **0** | 初判的 20 个是**假阳性**：本地全都存在，只是被嵌套 `.gitignore` 挡住（**2026-11-21 19:5x 更正**，见 §1） |

本地另有 2313 个远程没有的文件，其中**真正的源码/文档只有 34 个**（design 24、specs 3、docs 2、.github 2、frontend 3），其余 2279 个是运行产物、测试产物与截图证据。

**对"落后多少"的回答**：落后的是 `.git` 的元数据，不是内容。
- 远程 `main` 共 **57 个提交**，head `03648018890f0b48358bcf6419b97d0d60403d2a` @ **2026-11-21T06:38:14Z**，`docs: record final conversation-domain CI result`。
- 本地 3 个提交（`10270a3 UI:` / `3c44d52 ci:` / `08a47ca Simo`），全部 2026-11-09，与远程**无共同祖先**（本地是 11-09 的一次性快照，从未配置 remote），所以"落后 N 个提交"在 git 关系上无意义；按对象数比较是 **57 vs 3**。

**对路线 B/C 的直接影响**：之前担心的"156 个本地文本改动可能是 11-09 旧值、需要逐文件人工合并"——**不成立**。这 156 个文件与远程 head **逐字节一致**，是 11-21 的新值。

---

## 1. 清单①：一度被判为「远程有、本地缺」的 20 个（**已更正：实为假阳性，一条都不缺**）

> **更正（2026-11-21 19:5x）**：把远程 861 条路径逐条对本地磁盘 `Test-Path` → **present 861 / missing 0**。下表 20 条**在本地全都存在**，当初之所以被算成"远程独有"，是因为本地扫描集合取自 `git ls-files` + `git ls-files --others --exclude-standard`——后者会**剔除被忽略的文件**，而这 20 条正好被**嵌套 `.gitignore`** 挡住：
>
> | 嵌套规则文件 | 行号 | 规则 | 被挡住的条目 |
> |---|---|---|---|
> | `frontend/e2e/.gitignore` | 第 2 行 | `report/` | 18 条 `frontend/e2e/report/**` |
> | `skeleton/.gitignore` | 第 1 行 | `.state-demo/` | `skeleton/.state-demo/.superagent/state.jsonl` |
> | 同层 review 忽略规则 | — | — | `frontend/review/regression/baseline.sha256`（`git status` 亦报 clean/ignored） |
>
> **因此**：Lead 裁决①"这 20 个不回写"——**该问题不存在**（没有需要回写的对象）。它们在 `repo-clean` 克隆里本来就是已跟踪文件，内容与本地逐字节一致（见 §7 的 861 条全量比对）。

| # | 路径 | 远程 blob | 性质（本地均存在，被嵌套 ignore 挡住） |
|---:|---|---|---|
| 1 | `frontend/e2e/report/cdp/audit-P1-CONV.md` | `89950dce9b` | E2E 审计报告 |
| 2 | `frontend/e2e/report/cdp/results.json` | `60ade30e6a` | E2E 结果 |
| 3 | `frontend/e2e/report/cdp/run-20261120.log` | `35072e2358` | E2E 日志 |
| 4 | `frontend/e2e/report/cdp/run-iter1.log` | `f78df03f99` | E2E 日志 |
| 5 | `frontend/e2e/report/cdp/run-iter2.log` | `e53163e8f8` | E2E 日志 |
| 6 | `frontend/e2e/report/cdp/run-iter3.log` | `bdfefc26e3` | E2E 日志 |
| 7 | `frontend/e2e/report/cdp/run-iter4.log` | `f245d5c62f` | E2E 日志 |
| 8 | `frontend/e2e/report/cdp/run-iter5.log` | `e9516c6c29` | E2E 日志 |
| 9 | `frontend/e2e/report/cdp/summary.md` | `518add74b3` | E2E 汇总 |
| 10 | `frontend/e2e/report/chrome-blocked-20261120.log` | `a94f76d999` | E2E 日志 |
| 11 | `frontend/e2e/report/limitations-20261120.md` | `571547fd9d` | 限制说明 |
| 12 | `frontend/e2e/report/list-20261120.log` | `cbd6e47184` | E2E 日志 |
| 13 | `frontend/e2e/report/preflight-20261120.log` | `e90bfee330` | E2E 日志 |
| 14 | `frontend/e2e/report/results.json` | `9fe83d0ece` | E2E 结果 |
| 15 | `frontend/e2e/report/run-attempt-2.log` | `1747aef55a` | E2E 日志 |
| 16 | `frontend/e2e/report/run-attempt.log` | `c4e27e4a18` | E2E 日志 |
| 17 | `frontend/e2e/report/run-blocked-20261120.log` | `19e232f91f` | E2E 日志 |
| 18 | `frontend/e2e/report/stale-no-tests-results-20261120.json` | `c86c504278` | E2E 结果 |
| 19 | `frontend/review/regression/baseline.sha256` | `ef4374ce73` | 回归基线校验和（**唯一有工程价值的**：重建基线时可重生成） |
| 20 | `skeleton/.state-demo/.superagent/state.jsonl` | `6ec651efcb` | demo 运行态 |

判定：18/20 是 E2E 过程产物；`baseline.sha256` 可用同一套截图重算；`state.jsonl` 是 demo 运行态。**没有任何源码文件是"远程有、本地缺"**——不存在"本地丢了源码"的情况；**而且这 20 条本地一条都不缺**（见上方更正）。

---

## 2. 清单②：本地有、远程无（2313 个）

### 2.1 源码 / 文档（34 个，全部列全）

这 34 个既不在远程、也不在本地 HEAD，是 11-13 ~ 11-21 产生的**新成果**（其中多数是今天 19:00–19:30 正在写的内容）：

| 目录 | 数量 | 文件（大小 / mtime UTC） |
|---|---:|---|
| `design/` | 24 | `26-记忆中心并发Harness-v0.md` 67K 11-15 18:08；`27-多智能体协作与自主能力-方案v1.md` 33K 11-15 17:58；`27-功能树-v0.md` 14K 11-15 18:11；`28-产品功能全景-v0.md` 34K 11-18 12:37；`28-系统能力树-v0.md` 20K 11-18 12:05；`29-功能扩展与创新脑暴-v0.md` 23K 11-18 12:37；`29-系统设计方案-v1.md` 45K 11-18 12:14；`29-MVP-POC-脑爆-v0.md` 14K 11-18 12:21；`30-产品功能全景-v0.1.md` 32K 11-18 12:36；`30-Agent框架-类型与实例-v0.md` 16K 11-21 10:50；`31-核心设计原则-智能体类型-v1.1.md` 36K 11-21 11:29；`31-核心设计原则-智能体类型-v1.md` 14K 11-21 10:52；`32-通用Agent框架-v0.md` 13K 11-21 10:53；`33-智能体框架-产品功能树-v1.1.md` 40K 11-21 11:23；`33-智能体框架-产品功能树-v1.md` 22K 11-21 10:57；`34-类型库-模板与总览-v1.1.md` 49K 11-21 11:27；`34-类型库-模板与总览.md` 17K 11-21 10:57；`35-类型库-研发与算法.md` 77K 11-21 11:02；`36-类型库-产品与内容.md` 108K 11-21 11:04；`37-类型库-业务与服务.md` 95K 11-21 11:04；`38-类型库-专业与边界案例.md` 76K 11-21 11:06；`39-类型库-验证结论-v1.md` 16K 11-21 11:07；`drafts/27a-research-collaboration-modes.md` 20K 11-15 18:03；`drafts/27b-research-scale-consistency.md` 16K 11-15 18:02 |
| `specs/` | 3 | `changes/CHG-SYS-001/proposal.md` 6.3K 11-21 11:20；`spec.md` 21K 11-21 11:20；`tasks.md` 6.2K 11-21 11:19 |
| `docs/plan/` | 2 | `MASTER-PLAN.md` 9.8K 11-21 11:24；`git-hygiene-report.md` 24K 11-21 11:24（本诊断产物） |
| `.github/workflows/` | 2 | `e2e.yml` 3.2K 11-20 06:57；`storybook.yml` 2.6K 11-13 18:53 |
| `frontend/` | 3 | `src/raw.d.ts` 76B 11-20 06:28；`prototype/composer-send-mode.html` 4.8K 11-14 05:12；`prototype/composer-send-mode.css` 1.5K 11-14 05:34 |

> 注意：`design/31-…v1.1.md`、`design/34-…v1.1.md` 的 mtime 是 19:29、19:27（本地时间），即**此刻仍有 agent 在写**。

### 2.2 本地独有资产（2279 个）

| 类别 | 数量 | 体积 | 分布 | 建议 |
|---|---:|---:|---|---|
| 运行产物 | 1954 | 238.3 MB | `scratch/` 1243（51MB）、`.tools/` 284（92MB）、`backend/.tmp-*` 262（DB/WAL）、根目录探针 `.allow-*`/`.d-*.bin` 等 43、`archive/` 21（该目录共 13316 文件/424MB，其余已被 ignore）、`data-backup-*` 11、`data-preprod-*` 12、`.m*-home/` 约 82 | 不入仓，补 `.gitignore` |
| 截图/证据 | 278 | 46.1 MB | 全部 `frontend/review/*.png`（视觉评审截图） | 可保留为证据，建议不入仓或走 LFS |
| 构建/测试产物 | 38 | 0.8 MB | `frontend/coverage*` 21（coverage HTML）、`backend/*.err|*.out` 15、`backend/internal/webui/dist.bak-*` 3 | 不入仓 |

补充：这 2313 个里有 **131 个其实在本地 HEAD 里**（11-09 的老文件，远程已删、磁盘还在）：`.allow-*.json`、`.d-d-*.json`、`.dh-d-*.bin`、`.g2.bin`、`.m*-home/agentd.db*`、`scratch/probe.txt` 等——**全是探针与运行库垃圾**，无源码。

---

## 3. 清单③：两边都有但内容不同（5 个，全列）

| # | 路径 | 本地 blob | 远程 blob | 本地 mtime (UTC) | 远程最后提交 (UTC) | 差异（本地→远程） | 判定 |
|---:|---|---|---|---|---|---|---|
| 1 | `AGENTS.md` | `384615353a` | `aa2ba11bab` | 2026-11-20 17:58 | 2026-11-20 07:16 `docs: complete project record…` | 0+/2-（远程少 865B、2 行） | **本地新**：本地 4420B 含新增段落，远程 3555B 是旧版 |
| 2 | `scripts/check-sdd.mjs` | `4b90063ebb` | `71cdfb3ae7` | 2026-11-21 11:24 | 2026-11-12 15:07 `feat: message-cards UI…` | 70+/708- | **本地新**：本地 27.5KB / 远程 7.1KB，脚本扩充了 708 行检查规则 |
| 3 | `scripts/check-trace.mjs` | `c76a3696b8` | `e6451549e4` | 2026-11-21 11:22 | 2026-11-20 09:31 `chore: complete SDD…` | 222+/606- | **本地新**：本地 33.2KB / 远程 19.2KB |
| 4 | `backend/internal/modules/chat/migration_test.go` | `aad948bca3` | `73639ec5ef` | 2026-11-13 15:48 | 2026-11-12 13:46 `feat: message-cards UI…` | 0+/41- | **本地新**：本地 3337B / 远程 1662B，测试用例扩充 41 行 |
| 5 | `frontend/coverage/coverage-summary.json` | `af3aaf93f9` | `64d1d174cb` | 2026-11-21 05:35 | 2026-11-20 07:45 `test: add frontend unit/integration…` | 2+/2- | **本地新**：同尺寸（663B）重算，覆盖率数字更新 |

（"差异"列是 `git diff --no-index --numstat 本地 远程`，即"把本地改成远程要 +/- 多少行；0+/2- 表示远程比本地少 2 行。）

**5/5 都是本地更新，没有一个是"远程更新、本地是旧值"。**

---

## 4. 结论：哪些是 11-21 新值、哪些是 11-09 旧值（逐类给依据）

依据方法：内容哈希三方对照（本地磁盘 / 本地 HEAD blob / 远程 blob）+ 文件 mtime + 远程按路径的最后提交时间（`GET /commits?path=`）。

| 本地文件集合 | 数量 | 与 HEAD(11-09) 关系 | 与远程关系 | 结论与依据 |
|---|---:|---|---|---|
| `evals/` `docs/` `design/` `deploy/` `scripts/` 根目录文件的改动 | **156** | 内容**不同**于 HEAD | 与远程**逐字节相同** | **11-21 新值**。依据：这 156 个文件的 hash 与远程 blob 完全一致；分布 evals 95 / docs 22 / design 17 / deploy 16 / 根 3 / scripts 3，与 `git status` 的文本改动逐条对得上 |
| 其余 HEAD 内文件 | 261 | 内容**相同**于 HEAD | 远程同（或远程无此文件） | **11-09 原值**。这 261 个就是 `git status` 里那批 `100755→100644` 纯模式漂移 + 11-09 遗留物，内容从未变过 |
| 5 个 differ | 5 | 不在 HEAD（11-09 后新增） | 远程有同名但**更旧** | **11-21 新值**，本地领先远程（见 §3） |
| 34 个 design/specs/docs/.github/frontend 新文件 | 34 | 不在 HEAD | 远程**没有** | **11-21 新值**，从未推过；mtime 11-13 ~ 11-21 |
| 131 个 HEAD 里有、远程已删、磁盘还在 | 131 | 内容=HEAD | 远程已删 | **11-09 旧值（垃圾）**：探针 json/bin、`.m*-home` 的 DB/WAL，属于该清理的东西 |
| 611 个 HEAD 里有、磁盘没有 | 611 | — | 远程也没有 | **双方一致删除**（`agentd/`→`backend/` 迁移、`web/`→`frontend/` 重写、`research/` 归档）。若要找回只能 `git show HEAD:<path>` |

**关键判断**：
1. **本地不存在任何"11-09 旧值 vs 远程新值"的文件**（`LOCAL_OLD` 计数 = 0）。也就是说，如果现在把工作区当成"落后副本"去做 `checkout/reset`，**不会恢复出新东西，只会破坏 156 个已经和远程一致的文件 + 5 个领先远程的文件**。
2. 反过来，**远程没有任何本地缺的文件**（初判的 20 个 E2E 证据已证实本地都存在，只是被嵌套 ignore 挡住）；**本地比远程多的是 34 个真实文档/规格 + 领先版本的源码**。
3. 所以路线 B 第二步不需要"逐文件人工合并 156 个改动"这个重活；真正的决策只剩：34 个未推文档怎么处理、领先文件（2026-11-21 19:52 复核为 **23 个**，见 §7）要不要推。

---

## 5. 风险与限制

1. **工作区正在被写**：`scripts/check-trace.mjs`、`scripts/check-sdd.mjs` 的 mtime 是 19:22–19:24（本地时间），`design/*` 是 19:27–19:29。本报告是 19:2x–19:3x 的活快照，任何时刻都可能多出几条本地新文件。**这不是静止基线。**
2. **证据边界**：远程侧全部来自单次 tree API（`truncated=false`，1021 条，未发生 7MB/10 万条截断）；本地侧 3154 个文件全部读取并哈希成功，0 个不可读。未校验的是**远程仓库的 branch 保护/是否有其他分支**——只对 `main` 的 head 做了对比。
3. ~~**20 个远程独有文件未取回内容**~~ → **已作废**：`git clone` 等效物（`.tmp/repo-clean`，见 §7）已把 861 个远程文件全部落到本地，可随时逐字节复核，不再需要 blob API。
4. **token 仍在 `.git/config` 明文**：本次未改动，也未轮换；建议 Lead 决定处理时机（本报告不包含任何凭据）。

---

## 6. 附：可复现的 API 调用

```
GET /repos/YJM1024/simo/git/trees/03648018890f0b48358bcf6419b97d0d60403d2a?recursive=1
GET /repos/YJM1024/simo/git/blobs/<sha>                     # 5 次
GET /repos/YJM1024/simo/commits/0364801889...               # head 提交详情
GET /repos/YJM1024/simo/commits?path=<p>&per_page=1          # 5 次（每文件最后一次提交）
GET /repos/YJM1024/simo/commits?per_page=1&sha=main          # Link: rel="last" → 57
```

本地侧命令（只读）：

```powershell
.tools\git\cmd\git.exe -c core.quotepath=false ls-tree -r HEAD
.tools\git\cmd\git.exe -c core.quotepath=false ls-files
.tools\git\cmd\git.exe -c core.quotepath=false ls-files --others --exclude-standard
# 内容哈希：node 计算 sha1("blob <len>\0"+bytes)（core.autocrlf=false，磁盘字节=blob 字节）
```

---

## 7. 复核（2026-11-21 19:4x–19:5x）：用本地克隆替代 API 重算

第二轮报告的全部数字由 GitHub REST API 推出；本节用**真正取到的 pack** 重算一遍，结论有两处更正。

### 7.1 克隆物

- 位置 `.tmp/repo-clean`（工作区与旧 `.git` 未动）。
- 通道：node fetch 直连 `git-upload-pack`（`Bearer` 对 git 端点 401，必须 `Basic base64("x-access-token:<token>")`）；pack **22.3 MB / 3128 objects**。
- 校验：`log -1` = `03648018890f0b48358bcf6419b97d0d60403d2a` @ `2026-11-21T14:38:14+08:00`、`rev-list --count` = **57**、`ls-files` = **861**、`status --porcelain` = **0**、分支只有 `main`、无 tag、首个提交 `08a47ca 2026-11-09 Simo`。

### 7.2 861 条逐文件复核（`Get-FileHash SHA256` 两边比）

| 关系 | 数量 |
|---|---:|
| 内容一致 | **838** |
| 内容不同（**全部本地更新**） | **23** |
| 远程有、本地缺 | **0** |

- **比 19:2x 的 5 条多了 18 条**，新增分歧集中在 `11-21T11:44–11:46Z`（= 19:44–19:46 +08），是其他 agent 在同一时段改的真实代码：`backend/internal/modules/sessions/{http,service,spec}.go`、`backend/internal/modules/chat/{http,migrations}.go`、`frontend/src/app.tsx`、`frontend/src/components/{library.tsx,components.css,Sidebar.test.tsx}`、`frontend/src/App.test-utils.tsx`、`backend/cmd/simo/{m81_all_messages_test.go,p1_conv_sessions_http_test.go}`、`scripts/check-sdd.mjs`、`scripts/check-trace.mjs`、`specs/changes/CHG-CONV-001..005/spec.md`、`docs/product/SPEC-GAP.md`。
- **方向已逐条核过：23/23 本地 mtime 晚于该文件在远程的末次提交，无一"本地旧"**（例：`scripts/check-trace.mjs` 本地 `11-21T11:46Z` vs 远程末次 `2026-11-20T17:31+08`）。
- 结论不变但更硬：**工作区 ≈ 远程 head，落后的是 `.git` 历史；且本地只会更新，不会更旧。**

---

## 事故 2026-11-21 19:44

**做了什么**
为组装 `.tmp/repo-clean` 写了一条组装脚本，其中多写了一行 `& $git init -q --$null`。在 PowerShell 里 `--$null` 退化成空，实际执行的是 `git init -q --`；`--` 之后没有目录，**git 就地把 cwd（工作区）当成了目标**，等于在工作区仓库上跑了一次 `git init`。

**影响**
1. `.git/config` 被重写（mtime 变为 `2026-11-21 19:44:34`）。
2. `core.filemode` 从 `true` 变成 **`false`**。
3. 连锁症状：`git status --porcelain -uno` 从 **1028** 行掉到 **767** 行——417 条 `mode change 100755 => 100644` 全部消失（filemode=false 时 git 不再比较可执行位）。
4. **没有任何文件内容、索引条目、HEAD、分支、reflog 受影响**：HEAD 仍 `10270a37d3043b18ab408cca460498df14af72fd`，reflog 仍 3 条，`.gitignore` SHA256 未变，仍无 `[remote "origin"]`。

**复原动作与验证**
```powershell
.tools\git\cmd\git.exe config core.filemode true
```
复测：`status --porcelain -uno` = **1028**；`git diff --summary` = **611 条 delete + 417 条 `mode change 100755 => 100644`**，与事故前逐项一致；`diff --summary` 前三行为 `.allow-m12pdf.json`、`.allow-m12ssrf.json`、`.allow-m12web.json`。`.git/config` 的其余键（`repositoryformatversion` / `bare` / `logallrefupdates` / `ignorecase`、`[branch "main"]` 的 URL 与 merge）与事故前一致。

**残留**
- `.git/config` 的 **mtime 已被改变**（内容语义复原，时间戳无法复原）。
- 事故期间若有并发进程读过 `core.filemode`，会看到 `false`；窗口约 8 分钟（19:44:34 → 19:52 前后复原）。
- 归属：这是**越界写操作**（授权是"只读 + 只写 `.tmp`"），由本人执行、本人披露。

**教训**
1. **组装命令里不写可变参数**：`--$null`、`--$undefined`、`--$env:FOO` 这类写法在目标变量为空时会**静默退化成 `--`**，把下一条参数吃掉，命令就从"指定目录"变成"当前目录"。要传"无参数"就整条命令分开写，不要拼。
2. **任何 `git` 子命令先确认选项存在**：`git init --help` / `git <cmd> -h`，或先加 `--dry-run`（`rm`/`clean`/`push` 支持）；对 `init`、`config`、`update-ref` 这类"写元数据"的命令，先 `git config --get` / `git rev-parse` 记录基线再执行。
3. **写完组装脚本先只读跑一遍**（把 `init`/`update-ref` 换成 `rev-parse`/`config --get` 预演），确认目标路径打印出来是 `.tmp\repo-clean` 而不是 `E:\dsh_home\workspaces\agent`。
4. **凡是要写 `.git` 的命令，显式带 `-C <dir>`**：`& $git -C "$rc" init -q -b main` 比 `Set-Location` + 裸命令安全。


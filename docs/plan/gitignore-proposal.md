# `.gitignore` 增补提案（只读评估，不修改 `.gitignore`）

- 作者：repo-hygiene（工程角色 subagent）
- 时间：2026-11-21 19:30–19:40（Asia/Shanghai）
- 状态：**提案**，等待 Lead 拍板；本文件不改动仓库任何配置，`.gitignore` 本体未动
- 关联：[`git-hygiene-report.md`](git-hygiene-report.md)、[`git-diff-vs-remote.md`](git-diff-vs-remote.md)

---

## 1. 结论（先看这个）

1. 建议在现有 `.gitignore` **末尾追加一组 24 行的增量规则**（见 §3），预计把 `git status` 里的未跟踪噪音从 **2737** 压到 **554**，屏蔽 **262.7 MB** 运行产物。
2. 剩下的 **554 个文件 / 3.8 MB** 正好是「应该入仓的源码与文档」，不需要也不应该被忽略。
3. **但必须提前明确一个事实**：`.gitignore` 只影响「未跟踪文件」。当前 `git status` 的 1090 行里，**1028 行是已跟踪路径**（D 611 + M 417），它们**不会因为加了忽略规则而消失**——只能靠 `git rm --cached` 或重建索引解决。忽略规则的作用是**防止未来再被污染**，不是清理现状。
4. 有 3 个点需要 Lead 拍板（§8），其中最重要的是：`frontend/review/` 里除了 274 张 png，还有 3 篇评审文档 + 11 个 JSON/基线文件——按「只忽略截图」处理（本提案的默认选择），还是整目录忽略。

---

## 2. 测量方法与口径（可复现、全只读）

因为本机 `node` 不可用（`node` 不在 PATH，`.tools` 下只有 git），本次全部用 `git check-ignore` 做**离线模拟**，不写入任何配置：

```powershell
# 1) 取当前未跟踪（未忽略）文件清单与已跟踪清单（UTF-8 无 BOM、LF）
git -c core.quotepath=false ls-files --others --exclude-standard > .tmp\hygiene\untracked.txt
git -c core.quotepath=false ls-files                              > .tmp\hygiene\tracked.txt

# 2) 把候选规则写进临时文件，用 core.excludesfile 覆盖（只对本次进程生效，不落仓库）
git -c core.quotepath=false -c core.excludesfile=.tmp\hygiene\ex\rec2 `
    check-ignore --no-index -v --stdin < .tmp\hygiene\allpaths.txt
```

- `--no-index`：连**已跟踪**路径也参与匹配，用来找出「加了规则但仍在索引里、需要 `git rm --cached` 才生效」的文件。
- 基线：`untracked.txt` = **2737** 个当前未跟踪且未忽略的文件；`tracked.txt` = **1028** 个索引内路径。
- 口径说明：工作区有多个 agent 在写，这个数字是活快照（此前采样为 2734/2737/2737）。下文所有计数都基于同一次导出，**内部自洽**。
- 第 3 列的 `tracked=` 是**被该规则命中的索引文件数**——忽略规则对它们无效，必须 `git rm --cached` 才谈得上忽略。

---

## 3. 提案内容（增量，可直接追加到 `.gitignore` 末尾）

```gitignore
# ---- toolchain / sandbox homes (never committed) ----
.tools/
.*-home/

# ---- runtime databases & sidecars ----
*.db
*.db-shm
*.db-wal
*.db.lock
backend/.tmp*

# ---- one-off probe artifacts at repo root ----
/*.bin
/.allow-*.json
/.*-probe*.json
/.chat-probe*.json
/.d-d-*.json
/.sch*.json
/.ui1-*.json

# ---- data snapshots taken before risky ops ----
data-backup-*/
data-preprod-*/

# ---- scratch workspace ----
scratch/

# ---- frontend generated output & review screenshots ----
frontend/coverage/
frontend/coverage-threshold-check/
frontend/review/**/*.png

# ---- backend generated output ----
backend/internal/webui/dist.bak-*/
backend/*.err
backend/*.out

# ---- archived experiments (keep the index doc) ----
archive/*
!archive/README.md
```

### 3.1 每行实测覆盖（按上表顺序，去重后的「新增覆盖」）

| # | 规则 | 新增未跟踪文件 | 命中已跟踪（需 `git rm --cached`） | 累计 |
|---|---|---|---:|---:|
| 1 | `.tools/` | **284** | 0 | 284 |
| 2 | `.*-home/` | 0 | **78** | 284 |
| 3 | `*.db` | **70** | 71 | 354 |
| 4 | `*.db-shm` | **56** | 69 | 410 |
| 5 | `*.db-wal` | **60** | 69 | 470 |
| 6 | `*.db.lock` | **57** | 71 | 527 |
| 7 | `backend/.tmp*` | **46** | 0 | 573 |
| 8 | `/*.bin` | 0 | 7 | 573 |
| 9 | `/.allow-*.json` | 0 | 3 | 573 |
| 10 | `/.*-probe*.json` | 0 | 11 | 573 |
| 11 | `/.chat-probe*.json` | 0 | 1 | 573 |
| 12 | `/.d-d-*.json` | 0 | 5 | 573 |
| 13 | `/.sch*.json` | 0 | 3 | 573 |
| 14 | `/.ui1-*.json` | 0 | 1 | 573 |
| 15 | `data-backup-*/` | **4** | 0 | 577 |
| 16 | `data-preprod-*/` | **8** | 0 | 585 |
| 17 | `scratch/` | **1226** | 1 | 1811 |
| 18 | `frontend/coverage/` | **13** | 0 | 1824 |
| 19 | `frontend/coverage-threshold-check/` | **13** | 0 | 1837 |
| 20 | `frontend/review/**/*.png` | **274** | 0 | 2111 |
| 21 | `backend/internal/webui/dist.bak-*/` | **3** | 0 | 2114 |
| 22 | `backend/*.err` | **7** | 0 | 2121 |
| 23 | `backend/*.out` | **7** | 0 | 2128 |
| 24 | `archive/*` + `!archive/README.md` | **56** | 0 | 2184 |

- 合计：未跟踪 **2183**（差 1 是同一路径在 `ls-files` 里的重复行），占 2737 的 **79.8%**；屏蔽 **262.7 MB**。
- **规则间有重叠**，所以「单行独立覆盖」之和远大于 2183——上表是去重后的顺序累计，可直接相加。
- 主要重叠：`*.db/.db-shm/.db-wal/.db.lock` ⊂（`backend/.tmp*` ∪ `.*-home/`）；`/*.bin` 与 `archive/*` 也有一处交叉。

### 3.2 覆盖后还剩什么（554 个 / 3.8 MB）

| 目录 | 文件数 | 性质 |
|---|---:|---|
| `backend/` | 201 | Go 源码（`internal/modules` 88、`cmd/simo` 64、`internal/platform` 26、`internal/core` 13、其余工具/文档） |
| `specs/` | 170 | 产品/变更/测试 spec |
| `frontend/` | 81 | `src` 29、`e2e` 22、`prototype` 9，其余配置 |
| `docs/` | 66 | `process` 36、`product` 9、`tasks` 6、`testing` 5、`plan` 2 … |
| `design/` | 24 | 设计文档（含 `drafts/`） |
| `scripts/` | 3 | 门禁脚本 |
| `.github/` | 3 | CI workflow |
| `archive/` | 2 | `README.md`（被 `!` 反忽略）+ 1 个 `archive/design*` |
| 根 | 4 | `AGENTS.md`、`DESIGN.md`、`HANDOFF.md`、`LICENSE` |

结论：**没有残留垃圾**。唯一「看着像垃圾」的是 `frontend/e2e/scripts/cdp-probe.mjs`，它是 E2E 的调试脚本（源码），应保留。

---

## 4. 不该忽略的例外（并附验证）

用同一份 `core.excludesfile` 对下列「必须保留」路径做反查，结果如下（`check-ignore` 无输出 = 不会被忽略）：

| 路径 | 结论 |
|---|---|
| `design/README.md`、`design/drafts/*` | **不忽略** ✔ |
| `docs/testing/README.md`、`docs/**` | **不忽略** ✔ |
| `specs/**`（含 `CHG-SYS-001`） | **不忽略** ✔ |
| `.github/workflows/e2e.yml`、`storybook.yml` | **不忽略** ✔ |
| `frontend/src/app.tsx`、`frontend/e2e/**`、`frontend/prototype/**` | **不忽略** ✔ |
| `backend/go.mod`、`backend/internal/**/*.go` | **不忽略** ✔ |
| `AGENTS.md`、`LICENSE`、`HANDOFF.md`、`DESIGN.md` | **不忽略** ✔ |
| `archive/README.md` | **不忽略**（`!` 反忽略生效）✔ |
| `frontend/review/REVIEW.md`、`COMPONENT-LIBRARY.md`、`TEST-REPORT.md` | **不忽略**（因为规则收窄到 `**/*.png`）✔ |

**按 Lead 裁决保留、但当前仍在索引里的「已废弃跟踪文件」**（忽略规则对它们无效，见 §5）：
`agentd/` 下 145 个旧源码、`web/` 下 195 个旧源码、`research/` 9 个、`agentd/.tmp-*` 262 个、根目录探针 31 个、`.*-home/` 78 个 —— 共 611 条 D 行 + 417 条 M 行的成因。

---

## 5. 关键前提：忽略规则救不了现状的 1028 行

`git status --porcelain` 当前 1090 行：

| 类别 | 行数 | 说明 | 加忽略规则有用吗 |
|---|---:|---|---|
| `M` 内容/模式改动 | 417 | 全部是 `100755 → 100644` 模式漂移（`core.filemode=true`）+ 156 个内容已是 11-21 值 | ❌ 无效（已跟踪） |
| `D` 索引有、磁盘无 | 611 | 262 `agentd/.tmp-*` + 349 旧源码（`web/` 195、`agentd/` 145、`research/` 9） | ❌ 无效（已跟踪） |
| `??` 未跟踪顶层项 | 62 | 展开为 2737 个文件 | ✅ 本提案覆盖 2183 |

处置办法（**都需要一次提交，属 Lead 的「可以提交」之后的事**）：

```powershell
# 不要在现在执行；仅记录后续正确做法
git rm --cached -r --ignore-unmatch agentd web research
git rm --cached --ignore-unmatch .allow-*.json ".*-probe*.json" ".d-d-*.json" "*.bin" ".*-home"
git update-index --chmod=-x <156 个内容已同步的文件>   # 或修 core.filemode 后一次性对齐
```

> `core.filemode` 建议改 `false`（`git config core.filemode false`，属本地配置改动，需 Lead 同意）——这样 417 行模式漂移直接归零，不必逐个 `chmod`。

---

## 6. 规则本身的风险与规避（逐条）

| 风险 | 说明 | 本提案的规避 |
|---|---|---|
| `*.bin` 会命中 `.bin/` 目录 | gitignore 的 `*` 可匹配空串，`*.bin` 会连 `node_modules/.bin` 这类目录一起忽略 | 已改为根锚定 `/*.bin`，只影响仓库根的一次性二进制（`.g2.bin`、`.dh-d-*.bin` 等 7 个） |
| `*.db*` 无锚定 | 未来若在 `specs/` 放一个 `.db` 测试夹具会被误伤 | 当前仓库无此用例；若将来需要，用 `!specs/**/*.db` 反忽略 |
| `frontend/review/` 整目录忽略 | 会连带丢掉 3 篇评审文档 + 11 个 JSON/基线 | 已收窄为 `frontend/review/**/*.png`，只屏蔽 274 张截图（46.1 MB） |
| `archive/*` 全忽略 | 会连 `archive/README.md` 一起丢 | 已加 `!archive/README.md`；若该目录整体要入仓，删掉这两行 |
| 反忽略在父目录被忽略时无效 | 若写 `archive/`（带尾斜杠）则 `!archive/README.md` 不生效 | 本提案用 `archive/*`（不含目录本身），反忽略有效，已实测 |
| `.tools/` 整目录忽略 | 若将来有工具需要版本化，无法单独反忽略其子文件 | 需要时改成 `.tools/*` + `!.tools/<需要的那一项>`（前缀不带斜杠） |
| `.*-home/` 命名泛化 | 任何以 `-home` 结尾的点目录都会被忽略 | 现有 16 个目录全部是沙箱 HOME，无冲突；若将来出现 `.docs-home/` 之类需注意 |
| 与现有规则重复 | `archive/labs/storybook/node_modules|storybook-static|.cache|.home/` 已被 `archive/*` 覆盖 | 可在本次一并删除那 4 行（可选，不影响正确性） |

---

## 7. 与现有 `.gitignore` 的关系

现有 52 行里**已经覆盖、不必重复**的：`data/`、`.tmp/`、`*.log`、`logs/`、`uploads/`、`artifacts/`、`toolchain/`、`node_modules/`、`.pnpm-store/`、`**/.pnpm-store/`、`backend/internal/webui/dist/`、`frontend/dist/`、`deploy/dist/`、`*.exe`、`*.zip`、`*.sha256`、`__pycache__/`、`*.pyc`、`.leadcheck/`、`.m17-*`~`.m40-*`。实测这些规则的额外新增覆盖为 0（`*.log`、`data/`、`toolchain/`、`frontend/dist/`、`node_modules/` 均为 0），因此本提案不重复它们。

**建议顺手修掉的两处**（可选，零风险）：
1. 删除 `.git/` —— 对 `.git` 目录本身加忽略规则没有任何作用，属误导性冗余。
2. `archive/labs/storybook/node_modules/`、`storybook-static/`、`.cache/`、`.home/` 4 行可由 `archive/*` 替代。

**建议保留不动**的：`.m17-*`…`.m40-*` —— 它们与 `.*-home/` 不是子集关系（前者匹配任意 `.m17-…`，后者只匹配 `*-home` 结尾的目录），两个都留着才完整。

---

## 8. 需要 Lead 拍板的 3 件事

1. **`frontend/review/` 的处理粒度**
   - 默认（本提案）：只忽略 `**/*.png`（274 张 / 46.1 MB），保留 3 篇 md + 11 个 JSON/`baseline.sha256`。
   - 备选：整目录忽略（多屏蔽 11 个文件，但评审证据不入仓）。
   - **建议默认**：截图不入仓，文字评审入仓——文字可检索、可追溯，体积可忽略。

2. **`archive/` 是否整体忽略**
   - 默认：`archive/*` + 保留 `README.md`（56 个未跟踪文件、约 424 MB 目录不再进 status）。
   - 备选：继续按现有方式只忽略 storybook 缓存（会让 `archive/` 下 56 个文件长期留在 `??` 里）。
   - **建议默认**。

3. **是否同时修 `core.filemode=false`**
   - 这是**唯一能让 417 行模式漂移归零**的办法，但它是 `.git/config` 改动（本任务禁止）。需要 Lead 明确授权后单独执行。
   - 若不改，则需在提交时对 156 个内容文件之外的 261 个做 `--chmod=-x`，操作更繁琐且易错。

---

## 9. 执行清单（等 Lead 说「可以写入 `.gitignore`」后再做）

```powershell
# 1) 备份现有文件（移动到 .tmp，不删除）
Copy-Item .gitignore .tmp\gitignore.bak-20261121

# 2) 追加 §3 的增量块（手工编辑或 Add-Content）
Add-Content .gitignore -Value (Get-Content .tmp\hygiene\gitignore-block.txt -Raw)

# 3) 验证：未跟踪数量应从 2737 降到 ~554
git status --porcelain --untracked-files=all | Measure-Object -Line
git status --porcelain --ignored=matching | Select-String '^!!' | Measure-Object -Line

# 4) 反向抽查：确认例外仍未被忽略
git check-ignore -v design/README.md docs/testing/README.md specs/product/TREE.md
#    （应无输出）
```

回滚：`Move-Item .tmp\gitignore.bak-20261121 .gitignore -Force`（或从 git 历史取回）。

---

## 10. 本次评估的边界（诚实声明）

- 全部基于**一次导出快照**（19:33 前后）；工作区有其它 agent 在写，若文件在 19:33 之后新增，本表未计入。
- 未评估「已忽略但本不该忽略」的反向问题（例如现有 `*.exe` 是否误伤需要入仓的可执行脚本）——本轮只回答 Lead 问的增补方向。
- 未修改 `.gitignore`、未执行任何写操作、未触碰 `.git/`。
- 本机 `node` 不可用，`check-ignore` 的 `--stdin` 输入必须为 **UTF-8 无 BOM + LF**；用 `[IO.File]::WriteAllText` 写入，`Out-File` 会产生 CRLF 导致所有路径带尾 `\r`、匹配全部失败（本次已踩过，记录备查）。

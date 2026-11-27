# 框架 v2 回滚包

> 2026-11-27 文书削减：原 `docs/framework/v2/IMPLEMENT.md` 已并入 `docs/framework/v2/DESIGN.md` 的「怎么实施」节；本文引用该文件时保留原节号与行号，副本在 `E:\dsh_home\trash\pending-delete\fw-cut-20261127\docs\framework\v2\IMPLEMENT.md`。

状态：2026-11-27 由 P5 按现状重写，替换 P0 骨架。回滚对象是 `docs/framework/` 下随 v2.0.0 发布、且与 v1.7.5 有差异的内容；过程记录 `docs/framework/v2/` 与只读快照 `docs/framework/archive/v1.7.5/` 不参与回滚。规则依据是 `docs/framework/MOXIAN.md` 第 9 章 `MXV2-9-01`（四类触发与命令区分）、`MXV2-9-03`（单文件回滚与改动清单复核），以及 `docs/framework/v2/DESIGN.md 的「怎么实施」节` 第 8.2 节（回滚包三件）。

回滚基线是 `docs/framework/archive/v1.7.5/` 的 12 份正文副本与 1 份 `INDEX.md`，逐份 sha256 与字节数在 `INDEX.md` 的“补充字段”表内。归档只读：回滚只从归档复制回正文，不修改归档内容。执行人由 Lead 或其委派的子智能体担任，复核人由未参与本次改写的验收角色担任；已推送提交的撤销由发布员执行，本次由 Lead 代行并在 `docs/framework/v2/JOURNAL.md` 注明代行。

## 1 回滚对象与覆盖范围

覆盖范围按当前目录实点，逐类给处置，不按计划数推算。核对 v1.7.5 正文后确认：`templates/` 与 `adapters/` 在 v1.7.5 已存在（`archive/v1.7.5/ADOPTION.md` 第 24 行记 `templates/` 5 份，`archive/v1.7.5/MOXIAN.md` 第 1215 行记 `adapters/` 下 `README` 与 `deepseek.md`），归档没有保存这两个目录的旧副本，因此它们的文件级回滚不可执行；`VERSION` 与 `appendix/` 是 v2 新增，回滚时整件移入隔离目录。

| 对象 | 当前状态 | 回滚处置 | 依据 |
|---|---|---|---|
| `MOXIAN.md`、`GATES.md`、`TASK-MATRIX.md`、`ROLES.md`、`EFFORT.md`、`README.md`、`ADOPTION.md`、`ABSORB-RECONCILE.md`、`domains/backend.md`、`domains/frontend.md`、`domains/testing.md`、`domains/product-design.md` | v2 改写后的正文，12 份 | 从归档逐份复制回原位，覆盖当前正文 | `archive/v1.7.5/INDEX.md` |
| `VERSION` | v2 新增，内容 `v2.0.0` | 移入隔离目录，不就地删除 | `DESIGN.md` 的「怎么实施」节 第 2.1 节第 26 行 |
| `appendix/` | v2 新增目录，4 份（A 至 D）；v1.7.5 把附录写在总册第 1181 至 1380 行 | 整目录移入隔离目录 | `archive/v1.7.5/MOXIAN.md` 附录 A 至 D |
| `templates/` | v1.7.5 已存在，现 31 份；v2 改写 6 份、新增 4 份待建未落地 | 保留原位；6 份改写无归档基线，只能用 Git 历史恢复，恢复不了的登记为残留 | `DESIGN.md` 的「怎么实施」节 第 2.2 节；`ADOPTION.md` 第 24 行 |
| `adapters/` | v1.7.5 已存在，现 2 份（`README.md`、`deepseek.md`）；v2 在 P3 对齐参数 | 保留原位；同样无归档基线，按 Git 历史恢复，恢复不了的登记为残留 | `archive/v1.7.5/MOXIAN.md` 第 1215 行 |
| `v2/` | 9 份过程文档加 `sources/` 7 份 | 原样保留，不参与回滚 | `DESIGN.md` 的「怎么实施」节 第 2.2 节 |
| `archive/v1.7.5/` | 9 份根文件（含 `INDEX.md`）加 `domains/` 4 份 | 原样保留，只读 | `INDEX.md` |
| `accept/`、`absorb/`、`_draft/` | v2 之前既有的验收记录与吸收稿 | 不动 | 不在 v2 变更清单内 |

处置对象 17 个：12 份正文复制回原位，`VERSION` 与 `appendix/` 的 5 个文件移入隔离目录；保留对象 33 个：`templates/` 31 份、`adapters/` 2 份。`specs/`、`scripts/`、`backend/`、`frontend/` 不在本包范围。

`templates/` 的 6 份改写是 `change.md`、`task-card.md`、`contract-table.md`、`evidence-index.md`、`review.md`、`visual-baseline.md`（`DESIGN.md` 的「怎么实施」节 第 102 至 107 行）。有 Git 历史时按第 5 节路径三的 `git restore --source` 逐份恢复；没有 Git 时保留 v2 版本，在 `JOURNAL.md` 登记“模板 6 份未回退”的残留与原因。

## 2 回滚前确认

先判断属于哪一类，再选路径；判定结论与差异范围写进当天的 `JOURNAL.md` 条目，不凭印象直接覆盖。

| 情形 | 判定命令与特征 | 走哪条路径 |
|---|---|---|
| 单个文件改坏，尚未提交 | `git status --short` 只列出该文件 | 第 3 节路径一 |
| 整批 v2 改动要退回 v1.7.5，尚未提交 | 12 份正文与归档不一致，工作区未提交 | 第 4 节路径二 |
| 改动已提交但未推送 | `git log --oneline origin/main..HEAD` 列出 v2 提交 | 第 5 节路径三的 `reset --soft` |
| 改动已推送 | 远端已有对应提交 | 第 5 节路径三的 `git revert` |

开始前固定四个变量，后文命令都基于它们：

```powershell
$repo  = (Get-Location).Path
$root  = Join-Path $repo 'docs/framework'
$arc   = Join-Path $root 'archive/v1.7.5'
$trash = 'E:\dsh_home\trash\pending-delete\docs\framework'
$files = @('MOXIAN.md','GATES.md','TASK-MATRIX.md','ROLES.md','EFFORT.md','README.md','ADOPTION.md','ABSORB-RECONCILE.md','domains/backend.md','domains/frontend.md','domains/testing.md','domains/product-design.md')
```

先记差异，只记录不写入：

```powershell
foreach ($f in $files) {
  $a = (Get-FileHash -LiteralPath (Join-Path $arc $f) -Algorithm SHA256).Hash
  $b = (Get-FileHash -LiteralPath (Join-Path $root $f) -Algorithm SHA256).Hash
  if ($a -ne $b) { Write-Output ("DIFF {0} archive={1} current={2}" -f $f, $a, $b) }
}
```

没有 `DIFF` 行说明 12 份正文已经等于 v1.7.5，不需要回滚，只处理多余目录。演练时把 `$trash` 换到演练目录内的隔离区，其余变量不变，命令逐字相同。

## 3 路径一 单文件回滚

适用于一个文件改坏、改动尚未提交。回滚前先确认这个文件没有他人未提交的改动：

```powershell
git status --short -- docs/framework/MOXIAN.md
```

输出只有一行且是预期文件时继续；出现其它文件或该文件有他人改动，停下交 Lead 核对。

已纳入版本控制的文件用 `git restore`，它只恢复指定文件：

```powershell
git restore -- docs/framework/MOXIAN.md
```

该文件从未纳入版本控制、或环境没有 Git 时，从归档复制回原位：

```powershell
Copy-Item -LiteralPath (Join-Path $arc 'MOXIAN.md') -Destination (Join-Path $root 'MOXIAN.md') -Force
```

`domains/` 下的文件照同样写法，源与目标都带 `domains/`。`VERSION` 与 `appendix/` 是 v2 新增对象，没有可恢复的旧版，只能移入隔离目录；`templates/` 与 `adapters/` 有旧版但归档没留副本，单文件回滚同样走 Git 历史，没有 Git 时保留并登记：

```powershell
$rel = 'VERSION'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent (Join-Path $trash $rel)) | Out-Null
Move-Item -LiteralPath (Join-Path $root $rel) -Destination (Join-Path $trash $rel) -Force
```

目录对象把 `$rel` 换成 `appendix`，`Move-Item` 整目录移动，不递归删除、不合并。移动后按第 6 节复验。

## 4 路径二 整批回滚（工作区未提交）

适用于整批 v2 改动要退回 v1.7.5。四步按顺序执行，每步做完看输出再进下一步。

第一步，确认工作区没有别人的未提交改动，有就先停下：

```powershell
git status --short
```

第二步，把 12 份正文从归档复制回原位。只覆盖这 12 个文件，不动归档、不动 `docs/framework/v2/`：

```powershell
foreach ($f in $files) {
  $dst = Join-Path $root $f
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item -LiteralPath (Join-Path $arc $f) -Destination $dst -Force
}
```

第三步，移走 `VERSION`：

```powershell
$rel = 'VERSION'
if (Test-Path -LiteralPath (Join-Path $root $rel)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent (Join-Path $trash $rel)) | Out-Null
  Move-Item -LiteralPath (Join-Path $root $rel) -Destination (Join-Path $trash $rel) -Force
}
```

第四步，移走 `appendix/`。隔离目录已有同名对象时加时间戳，不覆盖历史隔离内容：

```powershell
$rel = 'appendix'
$src = Join-Path $root $rel
if (Test-Path -LiteralPath $src) {
  $dst = Join-Path $trash $rel
  if (Test-Path -LiteralPath $dst) { $dst = $dst + '-' + (Get-Date -Format 'yyyyMMddHHmmss') }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Move-Item -LiteralPath $src -Destination $dst -Force
  Write-Output ("MOVED {0} -> {1}" -f $rel, $dst)
}
```

`templates/` 与 `adapters/` 留在原位。有 Git 历史时接着恢复 6 份模板与适配层文件，命令见第 5 节；没有 Git 时跳过，把残留写进 `JOURNAL.md` 后再跑第 6 节复验。

## 5 路径三 提交级回滚

改动已经提交时按是否推送分两种。两种都禁止 `git reset --hard`、`git clean -fdx`、`git push --force` 与删除未跟踪文件；这三类会丢掉未提交改动或改写远端历史。

本地未推送的提交，按 `MXV2-9-01` 用软重置退到回滚点，工作区不动：

```powershell
git log --oneline -n 6
git reset --soft <回滚点>
```

软重置只移动 `HEAD`，索引与工作区仍是 v2 内容，接着用归档把正文退回 v1.7.5：

```powershell
git restore --source=<回滚点> --staged --worktree -- docs/framework
```

`git restore` 不会删除回滚点里不存在的路径，所以 `VERSION` 与 `appendix/` 仍在，按第 4 节第三步与第四步移入隔离目录。6 份模板与适配层文件在同一条 `git restore` 范围内，回滚点存在这些文件时会一并恢复；回滚点没有的文件保留现状并登记残留。最后跑第 6 节复验。

已推送的提交按逆序逐个 `git revert`，一次只回退一个提交，冲突就停下交 Lead 裁定：

```powershell
git log --oneline origin/main..HEAD
git revert --no-edit <提交号>
```

`git revert` 会按提交内容撤销新增与改写，`VERSION` 与 `appendix/` 随之消失，6 份模板回到回滚点版本；若某个提交没有覆盖全部对象，按第 4 节补做移入隔离目录并补恢复。撤销完成后跑第 6 节复验，再正常推送，不加 `--force`。

## 6 复验

回滚后逐项跑完六项，全部通过才算完成；执行人与复核人各自跑一遍，输出贴进 `JOURNAL.md` 条目。

第一项，12 份正文与归档逐份一致：

```powershell
$bad = @()
foreach ($f in $files) {
  $a = (Get-FileHash -LiteralPath (Join-Path $arc $f) -Algorithm SHA256).Hash
  $b = (Get-FileHash -LiteralPath (Join-Path $root $f) -Algorithm SHA256).Hash
  if ($a -ne $b) { $bad += $f }
}
if ($bad.Count -eq 0) { Write-Output '12/12 files verified' } else { Write-Output ('MISMATCH: ' + ($bad -join ', ')) }
```

期望输出 `12/12 files verified`。

第二项，归档目录仍完整：根目录 9 份（8 份正文加 `INDEX.md`），`domains/` 4 份：

```powershell
(Get-ChildItem -LiteralPath $arc -File).Count
(Get-ChildItem -LiteralPath (Join-Path $arc 'domains') -File).Count
```

期望依次为 `9` 与 `4`。

第三项，正文不再含 v2 规则号：

```powershell
Select-String -Path (Join-Path $root '*.md'), (Join-Path $root 'domains/*.md') -Pattern 'MXV2-' -SimpleMatch
```

期望无输出（退出码 1 表示没有匹配，属正常）。不能用 `framework/templates/` 做同类判据：v1.7.5 正文本来就引用该目录 60 处，命中属正常。

第四项，v2 新增对象已不在正文目录，旧目录仍在原位：

```powershell
Test-Path -LiteralPath (Join-Path $root 'VERSION')
Test-Path -LiteralPath (Join-Path $root 'appendix')
(Get-ChildItem -LiteralPath (Join-Path $root 'templates') -File -Recurse).Count
(Get-ChildItem -LiteralPath (Join-Path $root 'adapters') -File -Recurse).Count
```

期望依次为 `False`、`False`、`31`、`2`。

第五项，隔离目录收到全部对象：`VERSION` 1 个、附录 4 份：

```powershell
Test-Path -LiteralPath (Join-Path $trash 'VERSION')
(Get-ChildItem -LiteralPath (Join-Path $trash 'appendix') -File -Recurse).Count
```

期望依次为 `True` 与 `4`。

第六项，过程记录仍在：`v2/` 下 9 份文档与 `sources/` 7 份未被动过；模板与适配层的残留另记：

```powershell
(Get-ChildItem -LiteralPath (Join-Path $root 'v2') -File -Filter *.md).Count
(Get-ChildItem -LiteralPath (Join-Path $root 'v2/sources') -File -Filter *.md).Count
```

期望依次为 `9` 与 `7`。无 Git 时另外写清残留：6 份模板与适配层仍是 v2 版本，未回退。

## 7 责任与记录

执行人对命令与结果负责，复核人独立重跑第 6 节六项并签字，两份输出不一致时以复核人重跑结果为准并保留双方输出。回滚完成后在 `docs/framework/v2/JOURNAL.md` 追加一条，写清时间、触发类型（四类之一）、执行人、复核人、回滚点（提交号或归档版本）、实际移动与恢复的对象清单、六项复验输出、残留项与结论。变更包状态与验收结论按 `docs/framework/v2/ROLLBACK-DRILL.md` 的演练结果和验收报告更新，不在本文件改写状态。

## 8 已知限制

本会话的 `git` 不在 PATH，常见安装路径也未找到，因此路径一与路径三的 Git 命令本次未在真实仓库执行，文件级路径以归档复制为准；需要 Git 的动作在有 Git CLI 的环境执行，并按 `git status --short` 与 `git diff --stat` 留下范围证据。

归档按 `DESIGN.md` 的「怎么实施」节 第 6 节只收 12 份正文，`templates/` 与 `adapters/` 的 v1.7.5 版本没有副本，这是回滚包在文件级的不完整处：这两处只能靠 Git 历史恢复，恢复不了就保留现状并登记残留。补归档需要从 Git 历史导出旧副本，不能在当前工作区重造，已登记在 `docs/framework/v2/BACKLOG.md`。

`docs/framework/accept/` 与 `docs/framework/absorb/` 是 v2 之前既有的记录目录，归档里没有对应副本，回滚不动它们；如果确认其中某份是 v2 新增，按 `DESIGN.md` 的「怎么实施」节 第 2.1 节清单补登后再移入隔离目录，不凭目录名猜测。

## 9 演练记录

真实演练在 `.tmp/v2-cmd-close/drill/` 的副本上执行，不动本目录真实文件；演练日期、执行人、命令、六项输出、耗时、发现与两轮差异写 `docs/framework/v2/ROLLBACK-DRILL.md`。

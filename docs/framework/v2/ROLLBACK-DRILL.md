# 框架 v2 回滚演练记录

演练日期：2026-11-27 05:52 至 05:54（Asia/Shanghai）。执行人：`v2-cmd-close`（Lead 委派）。复核人：尚未指派独立子智能体复跑，本记录只有执行人输出，复核签字待补。起点版本 `v2.0.0`，回滚点 `docs/framework/archive/v1.7.5/`。演练目录 `.tmp/v2-cmd-close/drill/`，真实 `docs/framework/` 只作只读来源，未做任何写入。

环境：Windows PowerShell 5.1，`robocopy` 可用；本会话 `git` 不在 PATH，路径一与路径三的 Git 命令本次未实测。

## 1 演练方法

把真实 `docs/framework/` 整目录复制到 `.tmp/v2-cmd-close/drill/repo2/docs/framework/`，在副本上按 `docs/framework/v2/ROLLBACK.md` 第 4 节路径二逐步执行：复制 12 份正文、移走 `VERSION`、移走 `appendix/`，然后跑第 6 节六项复验。隔离区指到演练目录内的 `.trash2-<时间戳>/`，不写 `E:\dsh_home\trash\pending-delete\`，避免把演练产物混进真实隔离区。

复制命令与耗时：

```powershell
robocopy docs\framework .tmp\v2-cmd-close\drill\repo2\docs\framework /E /NFL /NDL /NJH /NJS /NP
```

复制 84 毫秒完成。演练前后对真实 `docs/framework/` 全目录做签名比对（路径、字节数、最后写入时间），结果 `REAL-FS-GUARD UNCHANGED`，确认真实文件未被改动。

## 2 第一轮：初稿把 templates/ 与 adapters/ 当成 v2 新增

初稿的处置是“`templates/`、`appendix/`、`adapters/` 三个目录整体移入隔离目录”，复验项包括“正文不再含 `framework/templates/` 与 `framework/appendix/` 的引用”。执行后前四项通过，第三项第二问命中：

```text
V3 mxv2-hits=0 template-ref-hits=60
```

60 处命中集中在 `ADOPTION.md`（2 处）、`GATES.md`（4 处）、`MOXIAN.md`（40 处）、`ROLES.md`、`TASK-MATRIX.md` 与四个 `domains/` 文件。回查归档原文：`archive/v1.7.5/ADOPTION.md` 第 24 行记 `docs/framework/templates/`（5 份），`archive/v1.7.5/MOXIAN.md` 第 1215 行记 `adapters/` 下 `README` 与 `deepseek.md`，说明两个目录在 v1.7.5 已存在，不是 v2 新增。

据此改回滚包：只移走 `VERSION` 与 `appendix/`，`templates/` 与 `adapters/` 保留原位；6 份被改写的模板与适配层文件因归档没有旧副本，只能靠 Git 历史恢复，恢复不了就登记残留。复验第三项相应收窄为只查 `MXV2-`，并写明 `framework/templates/` 在 v1.7.5 正文中本就存在 60 处引用，不能拿它当判据。

第一轮产物保留在 `drill/repo/`、`drill/.trash-20261127055252/` 与 `drill/drill.log`，作为这次纠偏的证据。

## 3 第二轮：按现行稿执行

第二轮目录 `drill/repo2/`，隔离区 `drill/.trash2-20261127055402/`，日志 `drill/drill2.log`。回滚前状态：

```text
PRE-DIFF-COUNT 10 MOXIAN.md,GATES.md,TASK-MATRIX.md,ROLES.md,EFFORT.md,README.md,ADOPTION.md,ABSORB-RECONCILE.md,domains/backend.md,domains/frontend.md,domains/testing.md,domains/product-design.md
PRE-VERSION True
PRE-TEMPLATES 31
PRE-ADAPTERS 2
PRE-APPENDIX 4
```

12 份正文里 10 份与归档不同；`README.md` 与 `ADOPTION.md` 与归档逐字节一致，属未改动项，不影响回滚。回滚三步耗时 29 毫秒：

```text
STEP-1 restore 12 body files from archive
STEP-1 done
STEP-2 move VERSION to trash
MOVED VERSION
STEP-3 move appendix to trash
MOVED appendix -> ...\.trash2-20261127055402\appendix
ROLLBACK-MS 29
```

## 4 六项复验输出

```text
V1 12/12 files verified
V2 archive-root=9 domains=4
V3 mxv2-hits=0
V4 version=False appendix=False templates=31 adapters=2
V5 trash-version=True appendix=4
V6 v2-docs=9 sources=7
```

| 项 | 期望 | 实测 | 结论 |
|---|---|---|---|
| 第一项 12 份正文与归档一致 | `12/12 files verified` | 同左 | 通过 |
| 第二项 归档完整 | 根 9、`domains/` 4 | `9`、`4` | 通过 |
| 第三项 正文无 v2 规则号 | 0 处 | 0 处 | 通过 |
| 第四项 新增对象已移走、旧目录仍在 | `VERSION`/`appendix` 为 `False`；模板 31、适配层 2 | 同左 | 通过 |
| 第五项 隔离区收到对象 | `VERSION` 为 `True`、附录 4 份 | 同左 | 通过 |
| 第六项 过程记录未动 | v2 文档 9、`sources/` 7 | 同左 | 通过 |

演练总耗时约 2 秒（复制 84 毫秒、回滚 29 毫秒，其余为启动与校验）。真实文件签名前后一致。

## 5 发现与遗留

归档缺 `templates/` 与 `adapters/` 的 v1.7.5 副本。这两个目录在 v1.7.5 已存在，回滚包却没有基线，文件级回滚对 31 份模板中的 6 份改写（`change.md`、`task-card.md`、`contract-table.md`、`evidence-index.md`、`review.md`、`visual-baseline.md`）与适配层 2 份无法完成。有 Git 历史时按 `ROLLBACK.md` 第 5 节的 `git restore --source` 恢复；没有 Git 时保留 v2 版本并在 `JOURNAL.md` 登记“模板 6 份未回退”的残留。补归档需要从 Git 历史导出旧副本，不能在当前工作区重造，已登记 `docs/framework/v2/BACKLOG.md`。

`templates/` 实有 31 份，比 `IMPLEMENT.md` 第 2.2 节计划的 35 份少 4 份待建（`linkage.md`、`point.md`、`rule-card.md`、`change-record.md`），回滚只处理实有部分。

Git 路径未实测。路径一的 `git restore`、路径三的 `git reset --soft` 与 `git revert` 本次都只做了文本核对，没有在真实仓库执行；下一次有 Git 环境时应补一次同路径演练，并把输出补进本文件。

## 6 结论

路径二在副本上逐步执行成功，六项复验全过，处置对象 17 个（12 份正文复制、`VERSION` 与 4 份附录移入隔离区），保留对象 33 个（模板 31、适配层 2）。回滚包在文件级对 12 份正文完整，对模板与适配层不完整，原因是归档未收旧副本，需 Git 历史或补归档解决。路径一与路径三待有 Git 的环境补演练。

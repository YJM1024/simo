# EVIDENCE · CHG-FW-002

> 2026-11-27 文书削减：本文记录的是当时实际跑过的命令与输出，正文里的 `spec.md`、`change.md`、`tasks.md`、`IMPLEMENT.md` 路径属历史路径。现在契约与 AC 判据在 `proposal.md` 第 11 节与第 12 节，施工内容在 `docs/framework/v2/DESIGN.md` 的「怎么实施」节，原文件副本在 `E:\dsh_home\trash\pending-delete\fw-cut-20261127\`。

状态：实现中。

## 1. 结论

- 结果：PASS WITH NOTES（仅限 P0 范围）。P1 至 P5 不属于本任务交付范围；交付前复算发现 `MOXIAN.md` 已被并行的 P1 执行方改写，归档副本保持 v1.7.5 原样，详见第 2 节与第 6 节。
- 范围/版本：`CHG-FW-002` P0，基线 v1.7.5；无 buildId，本次不构建运行时代码。
- 执行人/时间：v2-p0-snapshot（Lead 委派），2026-11-27 03:54 至 04:00（Asia/Shanghai）。

P0 交付 12 份归档副本、1 份归档索引、4 份变更包文件与 1 份回滚包骨架。复制时对 12 份副本逐份复算，12/12 与复制前一致。交付前再次比较源文件与归档，结果为 11/12；唯一差异是 `MOXIAN.md` 在 03:58:49 被另一执行方改写为 v2.0.0（371 行，sha256 `4234CCC99095FB4BEFEADE8BDB194D9BAD17941108D90D29EB078F4C199A4EF4`）。本任务没有写入 `MOXIAN.md`，也没有把改写后的内容重新复制进归档，归档仍保存 v1.7.5 原文。

## 2. 命令与输出

复制与哈希复核在同一段脚本里完成：先对 12 份源文件计 sha256，再复制到 `docs/framework/archive/v1.7.5/`，最后对副本复算并逐份比较。

```powershell
$files = @('MOXIAN.md','TASK-MATRIX.md','ROLES.md','EFFORT.md','GATES.md','README.md','ADOPTION.md','ABSORB-RECONCILE.md','domains/backend.md','domains/frontend.md','domains/testing.md','domains/product-design.md')
$srcRoot = 'docs/framework'
$dstRoot = 'docs/framework/archive/v1.7.5'
New-Item -ItemType Directory -Force -Path (Join-Path $dstRoot 'domains') | Out-Null
$pre = @{}
foreach ($f in $files) {
  $s = Join-Path $srcRoot $f
  $pre[$f] = Get-FileHash -LiteralPath $s -Algorithm SHA256
  Copy-Item -LiteralPath $s -Destination (Join-Path $dstRoot $f) -Force
}
$ok = 0; $bad = @()
foreach ($f in $files) {
  $post = Get-FileHash -LiteralPath (Join-Path $dstRoot $f) -Algorithm SHA256
  if ($post.Hash -eq $pre[$f].Hash) { $ok++ } else { $bad += $f }
}
Write-Output ("TOTAL files={0} ok={1} bad={2}" -f $files.Count, $ok, $bad.Count)
```

```text
OK MOXIAN.md 42A760E93B778FAA9A054014A78FA19642856A2CD986BF85449F607D9234F492
OK TASK-MATRIX.md D48BBC2E086B87543352537A515F46EB0451B495B023E265F3841E951A87434E
OK ROLES.md 1A9D343325E60088BD0AB44CD4BC9DB8B355C45F00D91D48B432EFAEEC0A8774
OK EFFORT.md B4052B4769C223D59BA3A88E8A6832069D59F28BB5F8F394F83CF5EE3D6AA964
OK GATES.md 8E1C1C112E770ADFBD57F0BD2E61752ECACD6F1D633674AE63B1EBE5168933E3
OK README.md 3C49A601458BC7581CE9D0718170887E33B928C1FB1A5B7D9C02D8DBF679EA69
OK ADOPTION.md DBEEC98E43400914E8937118F379531CB9BA3CBE2C3853DB1477DBD8CBBC90A7
OK ABSORB-RECONCILE.md 185EFA92A2A9F7884BD960D630C548DC56419B5FAF83C2A711B5A9348F92B9DB
OK domains/backend.md 6A3E1B48A6DFDC29D914AE67A73ADBBE9F732E6DF072092EA446638A53E02050
OK domains/frontend.md A7F33E6EE997667110A06445AD16E35110995AD054960F3AAA3FA49D65FC05F3
OK domains/testing.md 530DF2DC7CCA0AF464860B75836BCBE5EB9CFB834693DFA6E98DC5056A420F69
OK domains/product-design.md 8FC9E0D277ED1CD90F596C3F2F5F33DBC07BF211AB9CF6B86DEAF775E2DE31F6
TOTAL files=12 ok=12 bad=0
ARCHIVE-FILE-COUNT 12
```

冻结基线的整卷 sha256 与 `docs/framework/v2/JOURNAL.md` 的登记一致，说明本次归档所依据的两份方案没有在冻结后被改写。

```powershell
Get-FileHash docs/framework/v2/DESIGN.md, docs/framework/v2/IMPLEMENT.md -Algorithm SHA256
```

```text
DESIGN.md    52A9409F4A39CABED1B41F522717C69D64910392208C27AB681A19D09D5DAD1A  36086 bytes
IMPLEMENT.md 814642E2951ED0CFA2F60AFA1B8951FA4CAF11C83874F06E1556753E24BDAB3F  94557 bytes
```

结构计数与编码检查：

```text
docs/framework/archive/v1.7.5 根目录文件数 9（8 份正文副本 + INDEX.md）
docs/framework/archive/v1.7.5/domains 文件数 4
docs/framework/archive/v1.7.5 递归文件数 13（12 份副本 + 1 份索引）
6 份新建文件均 UTF-8 无 BOM
```

交付前复算在 2026-11-27 04:00 前后执行，比较 12 份源文件与归档副本：

```powershell
$files = @('MOXIAN.md','GATES.md','TASK-MATRIX.md','ROLES.md','EFFORT.md','README.md','ADOPTION.md','ABSORB-RECONCILE.md','domains/backend.md','domains/frontend.md','domains/testing.md','domains/product-design.md')
$ok = 0
foreach ($f in $files) {
  $a = (Get-FileHash -LiteralPath (Join-Path 'docs/framework/archive/v1.7.5' $f) -Algorithm SHA256).Hash
  $b = (Get-FileHash -LiteralPath (Join-Path 'docs/framework' $f) -Algorithm SHA256).Hash
  if ($a -eq $b) { $ok++ }
}
Write-Output ("HASH-OK " + $ok + "/12")
```

```text
HASH-OK 11/12
MOXIAN.md archive 42A760E93B778FAA9A054014A78FA19642856A2CD986BF85449F607D9234F492（232408 字节，mtime 2026-11-26 17:02:21）
MOXIAN.md current 4234CCC99095FB4BEFEADE8BDB194D9BAD17941108D90D29EB078F4C199A4EF4（26554 字节，mtime 2026-11-27 03:58:49）
```

其余 11 份仍一致。差异来自并行执行的 P1 总册改写，不是本任务的写入；本任务在 03:56 复制完成后未再对该文件做写操作。

## 3. 测试

| AC | 结论 | 证据路径 |
|---|---|---|
| `AC-CHG-FW-002-01` | pass（复制时 12/12 一致；交付前复算 11/12，差异见第 2 节） | `docs/framework/archive/v1.7.5/INDEX.md`、本文件第 2 节 |
| `AC-CHG-FW-002-02` 至 `-06` | missing（P1 至 P5 未开工，解除条件见 `test-plan.md` 的 TC-FW-002 至 006） | `specs/changes/CHG-FW-002/test-plan.md` |

断言数、耗时、退出码一律读脚本产出的 JSON：`.out/evidence/gates.json`（门禁）、`.out/evidence/rule-fields.json`（规则字段）、`.out/evidence/contract-coverage.json`（契约覆盖）、`.out/evidence/format-health.json`（格式体检）。本文件只写结论与路径，不抄数字。

## 4. 截图/DOM/测量

N/A：本次是文档与归档变更，无页面、无 DOM、无视觉判据。结构测量取文件计数、行数与字节数，已写进第 2 节与 `INDEX.md`。

## 5. 未跑/豁免

- 未跑：P1 至 P5 全部批次；`check-mapping.mjs`、`check-rule-fields.mjs`、`check-archive.mjs` 尚未在 P4 建立，无法执行；真实回滚演练留到 P5。
- 原因/谁批：用户本次只下达 P0；后续批次由 Lead 按 `tasks.md` 派单。
- 影响：本证据只能证明归档与变更包成立，不能证明九章改写、285 条迁移、门禁脚本与两轮验收成立。

## 6. 风险/备注

`IMPLEMENT.md` 第 8 节的 P0 校验命令按根目录 `*.md` 计数，期望 12；实际根目录是 8 份正文副本加 1 份 `INDEX.md`，按该命令计得 9，另外 4 份在 `domains/` 子目录。副本数应按 12 份文件清单或递归计数减索引来核，不能按根目录 `*.md` 计数。这一处需要在 P4 建 `check-archive.mjs` 时按递归清单实现，避免沿用会产生 9 的命令。

本会话的 `git` 不在 PATH，常见安装路径也未找到，因此没有用 `git status` 做越界核对，改用“枚举新建文件 + 复制时逐份哈希比对”证明复制当时源文件与副本一致；交付前复算时 `MOXIAN.md` 被并行 P1 改写，其余 11 份仍一致。P0 未执行任何 Git 写操作，未删除文件，未移动归档以外的文件。

并发改写：2026-11-27 03:58:49，`docs/framework/MOXIAN.md` 被另一执行方改写为 v2.0.0（371 行，66 处 `MXV2-`），文件从 232408 字节变为 26554 字节。该写入发生在本任务复制完成之后，本任务没有参与。它使 P0 的“12 份副本与现行一致”在交付时点上只剩 11/12，归档副本仍是正确的 v1.7.5 原文。是否重做 P0 基线、还是把 P1 的改写纳入后续验收，由 Lead 协调；本任务不重新复制，避免把 v2 内容混入 v1.7.5 归档。

变更包按用户 2026-11-27 的指令建四件，未按 `IMPLEMENT.md` 第 2.1 节第 28 行建五件；`INDEX.md` 也按用户指令提前到 P0，`IMPLEMENT.md` 原计划放在 P5。两处偏差以用户指令为准，已在 `tasks.md` 开头记录。

2026-11-27 05:02 按新流程补建 `spec.md` 与 `LINKAGE.md`，变更包当前为六件；`tasks.md` 开头那条四件记录保留为当时口径，不再作为当前文件清单。

## 7. 链接

- 变更包：`specs/changes/CHG-FW-002/proposal.md`、`change.md`、`tasks.md`
- 归档索引：`docs/framework/archive/v1.7.5/INDEX.md`
- 回滚包：`docs/framework/v2/ROLLBACK.md`
- 冻结记录：`docs/framework/v2/JOURNAL.md`
- 设计与实现：`docs/framework/v2/DESIGN.md`、`docs/framework/v2/IMPLEMENT.md`

## 8 流程点与验收点对照

第 1 节的「PASS WITH NOTES」按 MXV2-2-07 归并为四值，不另设第五值：五项用例全部执行且满足记 `pass`，交付前复算发现的差异写进备注列。下表按规则点与验收点逐条对应，判定值只取 `pass`、`partial`、`missing`、`blocked`，非 `pass` 行写原因码与解除条件。

| 规则点 | 验收点 | AC | 判定值 | 原因码 | 解除条件 | 证据 | 判定人 | 备注 |
|---|---|---|---|---|---|---|---|---|
| P-RUL-01 | P-ACC-01 | `AC-CHG-FW-002-01` | pass | — | — | 第 2 至 3 节，五项用例 | 未签（自验记录，待验收员复核） | 复制时 12/12；交付前复算 11/12，差异来自并行 P1 改写 `MOXIAN.md`，归档副本仍为 v1.7.5 原文，见第 6 节 |
| P-RUL-02 | P-ACC-02 | `AC-CHG-FW-002-02` | missing | `R-SCRIPT` | P1 开工并跑 `check-rule-fields.mjs`、`check-mapping.mjs` 通过 | 未跑，P1 待办 | 未签（自验记录，待验收员复核） | 两份判据脚本在 P4 才落地，P1 目前没有输出 |
| P-RUL-03 | P-ACC-03 | `AC-CHG-FW-002-03` | missing | `R-SCRIPT` | P2 完成改指章号并跑 `check-sdd.mjs --self-test` 得 15 passed | 未跑，P2 待办 | 未签（自验记录，待验收员复核） | 依赖 P1 的章号落地 |
| P-RUL-04 | P-ACC-04 | `AC-CHG-FW-002-04` | missing | `R-SCRIPT` | P3 模板处置完成并跑模板计数与字段检查 | 未跑，P3 待办 | 未签（自验记录，待验收员复核） | 31 份处置为 35 份的方案已冻结 |
| P-RUL-05 | P-ACC-05 | `AC-CHG-FW-002-05` | missing | `R-SCRIPT` | P4 各门禁 self-test 与三次同结果记录落地 | 未跑，P4 待办 | 未签（自验记录，待验收员复核） | 6 个新脚本已建，既有脚本尚未加 RULES 与 --rule |
| P-RUL-06 | P-ACC-06 | `AC-CHG-FW-002-06` | missing | `R-DRILL` | P5 完成回滚演练与两轮验收并签字 | 未跑，P5 待办 | 未签（自验记录，待验收员复核） | 两轮验收与演练均未开始 |

本表是验收点的判定记录，不替代验收员签字；六条链的对应关系与基数见 `change.md` 第 11.3 节，八列逐条登记见 `LINKAGE.md`。`P-ACC-01` 的差异是否要求重做 P0 基线，由 Lead 裁定后在本节追加一行，不覆盖已有记录（MXV2-4-20）。

## 9. 证据索引（十五列）

本节按 `docs/framework/templates/evidence-index.md` 的十五列登记，逐条挂到 Covers 的六条 AC 上，供 `scripts/check-evidence.mjs` 与变更级收口核对；判定值与原因码以本表为准。`AC-CHG-FW-002-06` 的原因码由上节第 8 节的 `R-DRILL` 校正为 `R-SPEC`：`R-DRILL` 只用于回滚演练执行后未通过的 `blocked` 行，而 P5 的演练尚未执行，按前置批次未交付记 `R-SPEC`，上节原记录保留不改。

| 证据编号 | AC 编号 | 证据类型 | 路径 | 生成命令 | 生成时间 | 判定人 | 判定结果 | 未验证原因码 | 关联任务卡 | 轮次 | 可复跑 | 构建版本 | 失效标记 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E-AC-CHG-FW-002-01-01 | `AC-CHG-FW-002-01` | 人工记录 | `docs/framework/archive/v1.7.5/INDEX.md` | `powershell`：第 2 节 12 份清单逐份 `Get-FileHash` | `2026-11-27T05:30+08:00` | 人工:验收员 | pass | 不适用 | TASK-CHG-FW-002-01 | R1 | 是 | `N/A：纯文档与归档变更，无构建产物` | 有效 | 复制时 12/12 哈希一致；交付前复算 11/12，差异来自并行 P1 改写 `MOXIAN.md`，见第 2 节与第 6 节 |
| E-AC-CHG-FW-002-02-01 | `AC-CHG-FW-002-02` | 断言脚本 | 不适用 | `node scripts/check-rule-fields.mjs`、`node scripts/check-mapping.mjs` | `2026-11-27T05:30+08:00` | 人工:验收员 | missing | R-SCRIPT：P1 未开工，九章规则位与 285 条映射未落盘；解除：P1 完成后复跑两份判据脚本、核 158 位与 285/285；责任人：撰写员；到期日：2026-12-05 | TASK-CHG-FW-002-02 | R1 | 是 | `N/A：无构建产物` | 有效 | 判据正文见 `spec.md` 第 4 节与 `test-plan.md` TC-FW-002 |
| E-AC-CHG-FW-002-03-01 | `AC-CHG-FW-002-03` | 断言脚本 | 不适用 | `node scripts/check-sdd.mjs --self-test` | `2026-11-27T05:30+08:00` | 人工:验收员 | missing | R-SCRIPT：P2 未开工，附属文件尚未改指新章号；解除：P2 完成后复跑 self-test 并抽查两份附属文件；责任人：撰写员；到期日：2026-12-05 | TASK-CHG-FW-002-03 | R1 | 是 | `N/A：无构建产物` | 有效 | 判据正文见 `spec.md` 第 4 节与 `test-plan.md` TC-FW-003 |
| E-AC-CHG-FW-002-04-01 | `AC-CHG-FW-002-04` | 断言脚本 | 不适用 | 模板计数命令、`node scripts/check-rule-fields.mjs --templates` | `2026-11-27T05:30+08:00` | 人工:验收员 | missing | R-SCRIPT：P3 未开工，模板 31 份尚未处置为 35 份；解除：P3 完成后复跑模板计数与字段检查；责任人：撰写员；到期日：2026-12-08 | TASK-CHG-FW-002-04 | R1 | 是 | `N/A：无构建产物` | 有效 | 判据正文见 `spec.md` 第 4 节与 `test-plan.md` TC-FW-004 |
| E-AC-CHG-FW-002-05-01 | `AC-CHG-FW-002-05` | 断言脚本 | 不适用 | 各门禁 `--self-test` 连跑三次、`node scripts/verify-all.mjs` | `2026-11-27T05:30+08:00` | 人工:验收员 | missing | R-SCRIPT：P4 未完工，既有脚本尚未加 RULES 与 `--rule`；解除：P4 完成后复跑各 self-test 三次与 verify-all 的 L0 层；责任人：撰写员；到期日：2026-12-08 | TASK-CHG-FW-002-05 | R1 | 是 | `N/A：无构建产物` | 有效 | 判据正文见 `spec.md` 第 4 节与 `test-plan.md` TC-FW-005 |
| E-AC-CHG-FW-002-06-01 | `AC-CHG-FW-002-06` | 人工记录 | 不适用 | 人工：按 `DESIGN.md` 第 8.4 节做 R1、R2 两轮验收与一次回滚演练 | `2026-11-27T05:30+08:00` | 人工:验收员 | blocked | R-SPEC：P5 两轮验收与回滚演练未执行，前置 P1 至 P4 未交付；解除：P1 至 P4 完成后执行 R1、R2 与回滚演练并补登签字；责任人：验收员；到期日：2026-12-10 | TASK-CHG-FW-002-06 | R1 | 是 | `N/A：无构建产物` | 有效 | 判据正文见 `spec.md` 第 4 节与 `test-plan.md` TC-FW-006 |

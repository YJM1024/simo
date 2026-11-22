# CHG-SYS-001 · 测试证据

执行人：gate-test（测试角色）。执行窗口：`2026-11-21T19:32:29+08:00` 起，至 `2026-11-21T19:40` 左右。
仓库根：`E:\dsh_home\workspaces\agent`（以下命令均以此为当前目录）。

环境：Windows PowerShell `5.1.26100.10068`；Node `v24.21.0`，绝对路径
`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`。本机 `git` 不在 PATH，
`git : The term 'git' is not recognized`；出网被策略代理拒绝，本轮未联网。退出码一律取
`$LASTEXITCODE`。

脚本快照（证据对应的实际字节，2026-11-21T19:36:45 复核仍未变）：
`scripts/check-sdd.mjs` = `29615` 字节，SHA256
`65C9002402EDC58B619FBADD3A308C6706B3F3103F2A29FC8807B082DE064211`，mtime
`2026-11-21T19:29:32.727`；`scripts/check-trace.mjs` = `33162` 字节，SHA256
`833C17FBEA0E172421957767EC22BE5F4AB8CC8313B6D1DA6F31D6D7A75ABDB1`，mtime
`2026-11-21T19:22:14.227`。记录字节数是为了与本轮另一 agent 的注释/文档改动区分：若之后脚本尺寸或
哈希变化，本证据需要重跑，不能沿用。

复跑用变量（先粘贴到同一 PowerShell 会话，表中命令即可原样复跑）：
`$node = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'`；
`$fx = 'C:\Users\YJM1024\AppData\Local\Temp\dsh-6zJVgw\gate-test-fixtures-20261121-192845'`；
`$tr = 'C:\Users\YJM1024\AppData\Local\Temp\dsh-6zJVgw\gate-test-trace-20261121-192950'`；
`$implMissing = 'C:\Users\YJM1024\AppData\Local\Temp\dsh-gt-impl-missing'`；
`$implEmpty = 'C:\Users\YJM1024\AppData\Local\Temp\dsh-gt-impl-empty'`。
这些夹具都在仓库外、未被删除，可直接复跑；若 `%TEMP%` 被系统清理，需按 `test-plan.md` 第 1 节重建。

## 1. 结果明细

| 项 | 用例 | 命令（可复跑原文） | 执行时间（+08:00） | 退出码 | 输出摘要（关键行） | 结果 |
|---|---|---|---|---|---|---|
| E-01 | `scripts/check-sdd.mjs` · TC-SYS-001-01 合规夹具 | `& $node scripts/check-sdd.mjs --root "$fx\good"` | 2026-11-21 19:32:59.666 | 0 | 末行 `PASS (checks: 11)`；无 R1/R2/R3 | pass |
| E-02 | `scripts/check-sdd.mjs` · TC-SYS-001-02 缺 evidence.md | `& $node scripts/check-sdd.mjs --root "$fx\no-evidence"` | 2026-11-21 19:32:59.975 | 1 | `specs/changes/CHG-FIXTURE-001/evidence.md:1 R1 变更包缺少必需产物 evidence.md；补该文件`；`FAILED: 1 issue(s)` | pass |
| E-03 | `scripts/check-sdd.mjs` · TC-SYS-001-03 缺 tasks.md | `& $node scripts/check-sdd.mjs --root "$fx\no-tasks"` | 2026-11-21 19:33:00.068 | 1 | `specs/changes/CHG-FIXTURE-001/tasks.md:1 R1 变更包缺少必需产物 tasks.md；补该文件` | pass |
| E-04 | `scripts/check-sdd.mjs` · TC-SYS-001-04 N/A 空理由 | `& $node scripts/check-sdd.mjs --root "$fx\na-empty"` | 2026-11-21 19:33:00.157 | 1 | `specs/changes/CHG-FIXTURE-001/spec.md:23 R1 缺少 frontend.md/backend.md，须在 spec.md 写「N/A：<≥8 字理由>」；补 N/A 理由` | pass |
| E-05 | `scripts/check-sdd.mjs` · TC-SYS-001-05 裸 N/A | `& $node scripts/check-sdd.mjs --root "$fx\na-bare"` | 2026-11-21 19:35:01.890 | 1 | 同上，`spec.md:23 R1 …；补 N/A 理由` | pass |
| E-06 | `scripts/check-sdd.mjs` · TC-SYS-001-06 缺 Covers | `& $node scripts/check-sdd.mjs --root "$fx\no-covers"` | 2026-11-21 19:33:00.251 | 1 | `specs/changes/CHG-FIXTURE-001/test-plan.md:3 R2 AC-FIX-001-01 未在 Covers: 中映射；补该 AC 编号` | pass |
| E-07 | `scripts/check-sdd.mjs` · TC-SYS-001-08 无可复现线索 | `& $node scripts/check-sdd.mjs --root "$fx\vacuous"` | 2026-11-21 19:33:00.341 | 1 | `specs/changes/CHG-FIXTURE-001/evidence.md:3 R3 证据条目缺少可复现线索…；补线索` | pass |
| E-08 | `scripts/check-sdd.mjs` · TC-SYS-001-09 只写「通过」 | `& $node scripts/check-sdd.mjs --root "$fx\bare-pass"` | 2026-11-21 19:35:02.169 | 1 | `specs/changes/CHG-FIXTURE-001/evidence.md:7 R3 证据不得只写「通过/已完成/ok/PASS」；补命令/路径/URL` | pass |
| E-09 | `scripts/check-trace.mjs` · TC-SYS-001-11 真实追溯基线 | `& $node scripts/check-trace.mjs` | 2026-11-21 19:32:54.408 | 0 | 末行 `PASS (checks: 659)`；PRD 71/71/71，failures 0，warnings 0；`[GOVERNANCE] specs/changes/CHG-SYS-001/spec.md:4 Implements: N/A — 本变更为工程治理，不改变任何产品行为，也无对应产品 PRD（见 §9 Q1 裁决）` | pass |
| E-10 | `scripts/check-trace.mjs` · TC-SYS-001-12 五行矩阵 | `& $node scripts/check-trace.mjs --root "$tr"` | 2026-11-21 19:33:24.750 | 1 | `TRACEABILITY.md:6 R4 PRD-DEMO-002 …「任务」列为空`；`TRACEABILITY.md:7 R4 PRD-DEMO-003 partial …「缺口」列为空`；DEMO-004（`gap`，缺口 `无`）**未报**；`FAILED: 2 issue(s)`；另有 T2 警告 5 个 PRD 未被引用 | fail |
| E-11 | `scripts/check-trace.mjs` · TC-SYS-001-13 Implements 缺失 | `& $node scripts/check-trace.mjs --root $implMissing` | 2026-11-21 19:35:02.478 | 1 | `specs/changes/CHG-TRACE-002/spec.md:1 T5 缺少 Implements 声明；补 PRD 列表或 Implements: N/A：<≥8 字理由>` | pass |
| E-12 | `scripts/check-sdd.mjs` · TC-SYS-001-07/10 补齐后全仓 | `& $node scripts/check-sdd.mjs` | 2026-11-21 19:39:15.787 | 1 | `FAILED: 24 issue(s)`；头部 `AC: 26，Covers 命中: 16`；本包 `R1/R2/R3` 均为 0；24 条全部落在 `CHG-CONV-001..004`（`R2` 10、`R3` 14） | pass |
| E-13 | `scripts/check-sdd.mjs` · TC-SYS-001-07/10 补齐后复核 | `& $node scripts/check-sdd.mjs`（第二次） | 2026-11-21 19:39:16.200 | 1 | `FAILED: 24 issue(s)`；失败计数与 E-12 一致（`R2` 10、`R3` 14），无本包失败 | pass |
| E-14 | `scripts/check-sdd.mjs` · TC-SYS-001-15/17 失败输出格式 | `& $node scripts/check-sdd.mjs --root "$fx\no-evidence"` | 2026-11-21 19:35:03.243 | 1 | `FAILprefix=False; jianyi=False; SUMMARY=False; colon0=False; lines=4; last=FAILED: 1 issue(s)`；失败行匹配 `^.+:\d+ R\d+ .+$`，行号 `1`；实际无 `[FAIL]`、无 `；建议：`、无 `SUMMARY:`、缺文件行号非 `0` | fail |
| E-15 | `scripts/check-sdd.mjs` · TC-SYS-001-16 退出码 2（sdd） | `& $node scripts/check-sdd.mjs --root 'C:\Users\YJM1024\AppData\Local\Temp\definitely-not-exist-20261121'` | 2026-11-21 19:35:02.678 | 2 | stderr `✗ 无法读取 specs/：C:\Users\YJM1024\AppData\Local\Temp\definitely-not-exist-20261121\specs`；stdout 为空 | pass |
| E-16 | `scripts/check-sdd.mjs` · TC-SYS-001-17 JSON 契约 | `& $node scripts/check-sdd.mjs --root "$fx\no-evidence" --json` | 2026-11-21 19:35:02.892 | 1 | `ok=False failures=1 keys=file,line,rule,message hint=False`；缺 `hint` 字段 | fail |
| E-17 | `scripts/check-sdd.mjs` · TC-SYS-001-18 sdd 自测第 1 次 | `& $node scripts/check-sdd.mjs --self-test` | 2026-11-21 19:32:35.456 | 0 | `SELF-TEST PASS (8 assertions, bad fixture issues=4)`；未打印临时目录 | pass |
| E-18 | `scripts/check-sdd.mjs` · TC-SYS-001-18 sdd 自测第 2 次 | `& $node scripts/check-sdd.mjs --self-test` | 2026-11-21 19:32:35.753 | 0 | 同上 | pass |
| E-19 | `scripts/check-trace.mjs` · TC-SYS-001-19 trace 自测第 1 次 | `& $node scripts/check-trace.mjs --self-test` | 2026-11-21 19:32:35.920 | 0 | `SELF-TEST PASS (6 assertions, bad fixture issues=2)` | pass |
| E-20 | `scripts/check-trace.mjs` · TC-SYS-001-19 trace 自测第 2 次 | `& $node scripts/check-trace.mjs --self-test` | 2026-11-21 19:32:36.094 | 0 | 同上 | pass |
| E-21 | `scripts/check-sdd.mjs` · TC-SYS-001-20 自测不写仓库 | `& $node scripts/check-sdd.mjs --self-test`；`@(Get-ChildItem specs -Recurse -File).Count`（执行时用 `Measure-Object` 的同义写法，结果一致）；`(Get-FileHash scripts\check-sdd.mjs -Algorithm SHA256).Hash` | 2026-11-21 19:36:55.260 | 0 | specs 文件数 `171` 前/后一致（补齐本文件前为 170）；脚本 SHA256 前后均为 `65C90024...4211`；未产生仓库内新文件 | pass |
| E-22 | `scripts/check-sdd.mjs` · L1 R3 豁免章节假证据 | `& $node scripts/check-sdd.mjs --root "$fx\exempt-fake"` | 2026-11-21 19:35:02.325 | 0 | `## 已知限制` 下的 `- 已完成` 未触发 R3，脚本 `PASS`；豁免条目数 1 | fail |
| E-23 | `scripts/check-sdd.mjs` · L2 含「归档」字样跳过 | `& $node scripts/check-sdd.mjs --root "$fx\archived-word"` | 2026-11-21 19:35:02.257 | 0 | 状态 `historical / 已归档` 的坏包（缺 evidence.md）被整包跳过，脚本 `PASS`；头部 archived skipped 1 | fail |
| E-24 | `scripts/check-sdd.mjs` · L3 3 段 AC 不提取 | `& $node scripts/check-sdd.mjs --root "$fx\ac-3seg"` | 2026-11-21 19:35:02.400 | 0 | 只提取 1 个 AC；`AC-P1-01` 未进入 R2，脚本 `PASS` | fail |
| E-25 | `scripts/check-trace.mjs` · TC-SYS-001-14 Implements 空理由 | `& $node scripts/check-trace.mjs --root $implEmpty` | 2026-11-21 19:35:02.587 | 1 | `specs/changes/CHG-TRACE-002/spec.md:4 T5 Implements: N/A 的理由需 ≥8 字；补足理由` | pass |
| E-26 | `scripts/check-trace.mjs` · TC-SYS-001-16 退出码 2（trace） | `& $node scripts/check-trace.mjs --root 'C:\Users\YJM1024\AppData\Local\Temp\definitely-not-exist-20261121'` | 2026-11-21 19:35:02.792 | 2 | stderr `✗ 根目录不存在：C:\Users\YJM1024\AppData\Local\Temp\definitely-not-exist-20261121` | pass |
| E-27 | `scripts/check-sdd.mjs` · 基线：补齐前全仓 | `& $node scripts/check-sdd.mjs` | 2026-11-21 19:32:42.209 | 1 | `FAILED: 26 issue(s)`；头部 `AC: 26，Covers 命中: 10`；本包 R1 2 条（`test-plan.md:1`、`evidence.md:1`）+ `CHG-CONV-001..004` 24 条（R2 10、R3 14） | pass |
| E-28 | `scripts/check-trace.mjs` · 补齐后 trace 复核 | `& $node scripts/check-trace.mjs` | 2026-11-21 19:39:16.332 | 0 | 末行 `PASS (checks: 659)`；与 E-09 一致，失败 0、警告 0 | pass |
| E-29 | `scripts/check-sdd.mjs` · TC-SYS-001-21 自测临时目录边界 | `& $node scripts/check-sdd.mjs --self-test`；`(Get-ChildItem $env:TEMP -Directory -Filter 'dsh-sdd-gate-*').Count` | 2026-11-21 19:36:55.418 | 0 | 自测退出后残留 `dsh-sdd-gate-*` 目录数 `0`（前 0 / 后 0），stdout 只有 `SELF-TEST PASS (8 assertions, bad fixture issues=4)`，未打印临时目录路径 | fail |

## 2. 汇总

29 条全部执行完毕：`pass` 22 条、`fail` 7 条（E-10、E-14、E-16、E-22、E-23、E-24、E-29）、
`missing` 0 条。`fail` 分两类：E-10/E-14/E-16/E-29 是**实现未满足 spec 的严格契约**，
E-22/E-23/E-24 是**已声明的检测盲区被夹具证实**；两类都按实测记录，不写成通过。

基线口径：补齐 `test-plan.md` 与 `evidence.md` 之前为 `26` 个失败（E-27）；补齐后实测 `24` 个，
且本包 `R1/R2/R3` 清零（E-12/E-13）。最后一轮复核（`2026-11-21 19:39:52.413`）仍为 `24`，
失败集合未变。`check-trace` 补齐前后均为 `0` 失败、`659` 项检查（E-09/E-28）。

## 3. 已知限制与未覆盖

**L1 R3 豁免章节不抓假证据**。位于「缺失/未跑/未执行/豁免/限制/风险/环境/备注」章节的条目，或含
`missing/未执行/不适用/N/A/缺口/待补/TODO/限制/风险/不能/无法` 的条目，不要求命令/路径/URL。
夹具 `"$fx\exempt-fake"` 在 `## 已知限制` 下写 `- 已完成`，`& $node scripts/check-sdd.mjs --root "$fx\exempt-fake"`
仍退出 `0`（E-22）。这类条目只能人工抽查。

**L2 含「归档」字样的 historical 包被跳过**。`isArchivedStatus` 的口径是
`/(?:\barchived\b|已归档|归档)/i`，匹配状态行任意位置。夹具 `"$fx\archived-word"` 把状态写成
`historical / 已归档` 并故意缺 `evidence.md`，`& $node scripts/check-sdd.mjs --root "$fx\archived-word"`
仍退出 `0`（E-23）。纯 `historical` 已不再跳过，新版自测对此有断言。

**L3 3 段旧式 AC 不提取**。`AC_RE` 要求至少 2 个 `XXX-` 组（`AC-<域>-<编号>-<NN>`），
`AC-P1-01` 只有 1 个组。夹具 `"$fx\ac-3seg"` 中 `& $node scripts/check-sdd.mjs --root "$fx\ac-3seg"`
只提取 1 个 AC，`AC-P1-01` 不参与 R2（E-24）。未归档的 legacy 包若用 3 段编号会漏检。

**L4 R4 占位符缺口**。`covered` 的六类空值与 `partial/gap` 的空缺口会被抓；但缺口列写
`无/待补/TODO/TBD` 不会被抓。五行夹具 DEMO-004 的 `gap | 无` 未报（E-10），与 AC-04
“应报 3 行”的判定不一致，TC-SYS-001-12 因此记 `fail`。

**L5 AC-05 严格输出未落地**。实际失败行为 `路径:行 R# 说明；补…`：无 `[FAIL] ` 前缀、无
`；建议：`、成功无 `SUMMARY:`、`--json.failures[]` 无 `hint`、缺文件时行号为 `1` 而非 `0`
（E-14/E-16）。当前只满足 `spec.md` §5.1 的宽松口径（含 `文件:行` 与修复提示）。

**L6 AC-06 自测边界未满足**。`scripts/check-sdd.mjs:802` 是
`rmSync(tmp, { recursive: true, force: true })`，`:811` 只打印 `SELF-TEST PASS ...`，不打印临时
目录路径；`scripts/check-trace.mjs` 自测同样删除临时目录。实测残留目录数 `0`（E-29），与 AC-06
“不就地删除、退出时打印路径”冲突。这是脚本实现问题，不是用例缺失。

**L7 R2 过度提取引用编号**。`spec.md` 正文凡出现 3 段编号（如 `AC-CONV-001`）都会被要求写进
`Covers:`；本计划因此声明了一个非本包 AC 才能过门禁。是否改为只扫描「验收」章节，需 Lead 裁决。

**L8 未覆盖**。并发写、大仓库性能、CI 环境（Linux/Node 版本矩阵）、`--json` 除 `hint` 外的完整
字段契约、`check-trace` 的 T1–T4/T6 细粒度负例，本轮均未单独构造夹具；`tasks.md` 中的 CI 接入
任务（`TASK-CHG-SYS-001-06`）不在本证据范围。

## 4. 复跑与维护

复跑顺序：先按第 1 节设置 `$node`/`$fx`/`$tr` 等变量，再逐行执行表中命令；`missing` 行必须补跑
后才能改结果。`check-sdd` 全仓结果依赖本包文件与 `CHG-CONV-*` 存量问题：若 `CHG-CONV-*` 被修复，
`24` 会下降，这是预期变化，不应视为本包回归。脚本若被再次修改，先记录新的字节数与 SHA256，
再重跑 E-01..E-29，不能沿用本表旧输出。

R3 的 `hasClue` 只把以 `node`/`npm` 等裸命令开头的片段当作命令（`COMMAND_RE`），
`& $node ...` 这种带调用运算符的绝对路径形式不被识别，因此每行额外放了 `scripts/*.mjs`
路径线索；这不是多余装饰，删掉会重新触发 R3。

## 5. 变更记录

| 日期 | 变更 | 变更包 | 影响 |
|---|---|---|---|
| 2026-11-21 | 首版：E-01..E-29，记录 22 pass / 7 fail / 0 missing 与 L1–L8 | `CHG-SYS-001` | 全部 |

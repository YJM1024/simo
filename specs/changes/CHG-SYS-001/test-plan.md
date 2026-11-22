# CHG-SYS-001 · 测试计划

状态：**active（用例已定义；真实执行结果见 `evidence.md`）**。

Covers: AC-SYS-001-01, AC-SYS-001-02, AC-SYS-001-03, AC-SYS-001-04, AC-SYS-001-05, AC-SYS-001-06, AC-CONV-001

> 说明：`AC-CONV-001` 不是本包的验收项，而是 `spec.md` 正文引用的既有包编号。当前 `check-sdd.mjs`
> 的 R2 会对 `spec.md` 全文提取 3 段及以上编号，因此必须在本行显式声明才能通过门禁；其口径偏差已列入
> 第 5 节 L7，交 Lead 裁决是否收紧提取范围。
>
> 本文件只定义**用例与断言**，不宣称通过。每条用例的执行时间、退出码、输出摘要落在
> `specs/changes/CHG-SYS-001/evidence.md` 的对应 `E-*` 行；未执行一律 `missing`。

## 1. 范围与环境

- 被测对象：`scripts/check-sdd.mjs`、`scripts/check-trace.mjs`（只读调用，不改脚本）。
- 覆盖 AC：`AC-SYS-001-01` … `AC-SYS-001-06`（6 条全部覆盖）。
- 仓库根：`E:\dsh_home\workspaces\agent`。
- 运行环境：Windows PowerShell 5.1.26100.10068；Node `v24.21.0`（绝对路径
  `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`）；无 `git`、无网络。
- 测试夹具：仓库外临时目录 `%TEMP%\dsh-6zJVgw\gate-test-fixtures-20261121-192845\*` 与
  `%TEMP%\dsh-6zJVgw\gate-test-trace-20261121-192950`；另建 `%TEMP%\dsh-gt-impl-*` 用于
  `Implements` 缺失/空理由。夹具不写入真实仓库。
- 基线口径：补齐本文件与 `evidence.md` 之前，全仓 `check-sdd` 为 26 个失败；补齐后应只剩
  `CHG-CONV-001..004` 的 24 个失败（`check-trace` 仍为 0 失败）。26/24 都要在证据中留痕。

## 2. 用例

> 每条用例的“证据”列写 `evidence.md` 中的行号标识；命令均为可复跑原文。
> 断言中的退出码用 `$LASTEXITCODE` 读取；输出包含用 `Select-String` 或字符串匹配判定。

### 2.1 AC-SYS-001-01 · 四件套与 N/A 理由

#### TC-SYS-001-01 · 合规夹具四件套齐全且 N/A 有理由
- Covers: AC-SYS-001-01
- 前置：夹具 `%TEMP%\dsh-6zJVgw\gate-test-fixtures-20261121-192845\good`，含 `spec.md`、`tasks.md`、
  `test-plan.md`、`evidence.md`，无 `design.md`，`spec.md` 含
  `frontend.md / backend.md：N/A：本夹具不涉及前端与后端改动。`。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\good`
- 断言：退出码 `0`；stdout 末行 `PASS (checks: 11)`；不出现 `R1`。
- 证据：`evidence.md` E-01。

#### TC-SYS-001-02 · 缺 `evidence.md` 必须报 R1
- Covers: AC-SYS-001-01
- 前置：夹具 `...\no-evidence`，删除 `evidence.md`，其余齐全。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\no-evidence`
- 断言：退出码 `1`；stdout 含
  `specs/changes/CHG-FIXTURE-001/evidence.md:1 R1 变更包缺少必需产物 evidence.md；补该文件`；
  末行 `FAILED: 1 issue(s)`。
- 证据：`evidence.md` E-02。

#### TC-SYS-001-03 · 缺 `tasks.md` 必须报 R1
- Covers: AC-SYS-001-01
- 前置：夹具 `...\no-tasks`，删除 `tasks.md`。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\no-tasks`
- 断言：退出码 `1`；stdout 含 `.../tasks.md:1 R1 变更包缺少必需产物 tasks.md；补该文件`。
- 证据：`evidence.md` E-03。

#### TC-SYS-001-04 · `N/A：` 空理由必须报 R1
- Covers: AC-SYS-001-01
- 前置：夹具 `...\na-empty`，`spec.md` 只写 `frontend.md / backend.md：N/A：`（无理由）。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\na-empty`
- 断言：退出码 `1`；stdout 含
  `specs/changes/CHG-FIXTURE-001/spec.md:23 R1 缺少 frontend.md/backend.md，须在 spec.md 写「N/A：<≥8 字理由>」；补 N/A 理由`。
- 证据：`evidence.md` E-04。

#### TC-SYS-001-05 · 裸 `N/A` 不给理由必须报 R1
- Covers: AC-SYS-001-01
- 前置：夹具 `...\na-bare`，`spec.md` 只写 `frontend.md / backend.md：N/A`（无冒号与理由）。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\na-bare`
- 断言：退出码 `1`；stdout 含 `spec.md:23 R1 ...；补 N/A 理由`。
- 证据：`evidence.md` E-05。

### 2.2 AC-SYS-001-02 · AC 必须被 `Covers:` 覆盖

#### TC-SYS-001-06 · 缺 `Covers:` 映射必须报 R2
- Covers: AC-SYS-001-02
- 前置：夹具 `...\no-covers`，`spec.md` 声明 `AC-FIX-001-01`，`test-plan.md` 的 `Covers:` 写成
  `AC-FIX-999-01`。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\no-covers`
- 断言：退出码 `1`；stdout 含
  `specs/changes/CHG-FIXTURE-001/test-plan.md:3 R2 AC-FIX-001-01 未在 Covers: 中映射；补该 AC 编号`。
- 证据：`evidence.md` E-06。

#### TC-SYS-001-07 · 本包 7 个被提取编号全部有 `Covers:`
- Covers: AC-SYS-001-02
- 前置：本文件顶部的 `Covers:` 行已显式列出 6 条 `AC-SYS-001-*` 与引用编号 `AC-CONV-001`。
- 命令：`& $node scripts/check-sdd.mjs`
- 断言：补齐后本包无 `R2` 失败；头部 `Covers 命中` 从 10 增至 16（+6，6 条 `AC-SYS-001-*`；`AC-CONV-001` 原已被既有包映射，不重复计数）；
  全仓剩余 `R2` 只出现在 `CHG-CONV-001..004`。
- 证据：`evidence.md` E-12、E-13。

### 2.3 AC-SYS-001-03 · 证据可复现

#### TC-SYS-001-08 · 证据条目无可复现线索必须报 R3
- Covers: AC-SYS-001-03
- 前置：夹具 `...\vacuous`，`evidence.md` 的证据条目只写 `- 已完成`，无命令/URL/路径。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\vacuous`
- 断言：退出码 `1`；stdout 含 `evidence.md:3 R3 证据条目缺少可复现线索…；补线索`。
- 证据：`evidence.md` E-07。

#### TC-SYS-001-09 · 整行只写「通过」必须报 R3
- Covers: AC-SYS-001-03
- 前置：夹具 `...\bare-pass`，在合规证据后追加独立一行 `通过`。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\bare-pass`
- 断言：退出码 `1`；stdout 含 `evidence.md:7 R3 证据不得只写「通过/已完成/ok/PASS」；补命令/路径/URL`。
- 证据：`evidence.md` E-08。

#### TC-SYS-001-10 · 本包证据表每行都带命令/路径
- Covers: AC-SYS-001-03
- 前置：`evidence.md` 的每条执行记录都在“命令”列放反引号命令。
- 命令：`& $node scripts/check-sdd.mjs`
- 断言：本包无 `R3` 失败；头部 `证据条目` 计数包含新增行，且失败条目不在 `CHG-SYS-001`。
- 证据：`evidence.md` E-13。

### 2.4 AC-SYS-001-04 · 追溯矩阵与 change 追溯语义

#### TC-SYS-001-11 · 真实仓库追溯基线
- Covers: AC-SYS-001-04
- 前置：真实仓库 `docs/product/TRACEABILITY.md`（71 个 PRD）与 `CHG-SYS-001/spec.md` 的
  `Implements: N/A：...`。
- 命令：`& $node scripts/check-trace.mjs`
- 断言：退出码 `0`；末行 `PASS (checks: 659)`；失败项 `0`；含
  `[GOVERNANCE] specs/changes/CHG-SYS-001/spec.md:4 Implements: N/A — ...`。
- 证据：`evidence.md` E-09。

#### TC-SYS-001-12 · 五行矩阵的 `covered` / `partial` / `gap` 判定
- Covers: AC-SYS-001-04
- 前置：夹具 `...\gate-test-trace-20261121-192950`，5 行：
  DEMO-001（六类齐）、DEMO-002（缺任务）、DEMO-003（partial 缺口空）、
  DEMO-004（gap 缺口 `无`）、DEMO-005（partial 缺口有内容）。
- 命令：`& $node scripts/check-trace.mjs --root <trace-fixture>`
- 断言（按 `spec.md` AC-04 判定）：只报 DEMO-002、DEMO-003、DEMO-004 三行，退出码 `1`，
  `FAILED: 3 issue(s)`；DEMO-001/005 不报。
- 实测：只报 2 行（DEMO-002/003），DEMO-004 的 `无` 未被识别为占位符 → 该断言**未通过**。
- 证据：`evidence.md` E-10（`fail`，原因 L4/L8）。

#### TC-SYS-001-13 · `Implements` 缺失必须失败
- Covers: AC-SYS-001-04
- 前置：`%TEMP%\dsh-gt-impl-missing`，在合规追溯夹具上新增
  `specs/changes/CHG-TRACE-002/spec.md`，只写状态、不写 `Implements`。
- 命令：`& $node scripts/check-trace.mjs --root $env:TEMP\dsh-gt-impl-missing`
- 断言：退出码 `1`；stdout 含
  `specs/changes/CHG-TRACE-002/spec.md:1 T5 缺少 Implements 声明；补 PRD 列表或 ...`。
- 证据：`evidence.md` E-11。

#### TC-SYS-001-14 · `Implements: N/A：` 空理由必须失败
- Covers: AC-SYS-001-04
- 前置：`%TEMP%\dsh-gt-impl-empty`，新增 `CHG-TRACE-002/spec.md`，写 `Implements: N/A：`（无理由）。
- 命令：`& $node scripts/check-trace.mjs --root $env:TEMP\dsh-gt-impl-empty`
- 断言：退出码 `1`；stdout 含 `spec.md:4 T5 Implements: N/A 的理由需 ≥8 字；补足理由`。
- 证据：`evidence.md` E-25。

### 2.5 AC-SYS-001-05 · 失败输出与退出码

#### TC-SYS-001-15 · 失败行与汇总行可机检
- Covers: AC-SYS-001-05
- 前置：任一失败夹具（`no-evidence`）。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\no-evidence`
- 断言：每条失败行匹配 `^.+:\d+ R\d+ .+$`；末行 `FAILED: 1 issue(s)`；stdout 总行数 `4`。
- 实测：通过（但仅满足宽松口径，严格口径见 TC-18）。
- 证据：`evidence.md` E-14。

#### TC-SYS-001-16 · 退出码 0 / 1 / 2
- Covers: AC-SYS-001-05
- 前置：`good`（应 0）、`no-evidence`（应 1）、不存在的 `--root`（应 2）。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\good`；`... no-evidence`；
  `& $node scripts/check-sdd.mjs --root <non-existent>`；`check-trace` 同理取 0/2。
- 断言：`0`、`1`、`2` 分别出现；`2` 时 stderr 含 `✗ 无法读取 specs/：...` 或 `✗ 根目录不存在：...`。
- 证据：`evidence.md` E-01、E-02、E-15、E-26。

#### TC-SYS-001-17 · `spec.md` 的严格输出契约
- Covers: AC-SYS-001-05
- 前置：`no-evidence` 夹具。
- 命令：`& $node scripts/check-sdd.mjs --root <fixtures>\no-evidence`；
  `& $node scripts/check-sdd.mjs --root <fixtures>\no-evidence --json`
- 断言（逐项）：
  1. 失败行以 `[FAIL] <路径>:<行号> — ` 开头；
  2. 失败行含 `；建议：<非空建议>`；
  3. 成功时输出 `SUMMARY: PASS（检查项 N，失败 0，警告 W）`；
  4. `--json` 的 `failures[]` 每项含 `file`、`line`、`message`、`hint`；
  5. 无法定位行号时用 `:0`。
- 实测：五项全部**未通过**（实际为 `path:line R1 message`，无 `[FAIL]`/`建议：`/`SUMMARY:`/`hint`，
  缺文件时行号为 `1` 而非 `0`）。
- 证据：`evidence.md` E-14、E-16（`fail`，原因 L5）。

### 2.6 AC-SYS-001-06 · `--self-test` 自证

#### TC-SYS-001-18 · `check-sdd --self-test` 连续两次通过
- Covers: AC-SYS-001-06
- 前置：当前脚本 `scripts/check-sdd.mjs`（29615 字节）。
- 命令：`& $node scripts/check-sdd.mjs --self-test`（连续两次）
- 断言：两次退出码均 `0`；stdout 均含
  `SELF-TEST PASS (8 assertions, bad fixture issues=4)`。
- 证据：`evidence.md` E-17、E-18。

#### TC-SYS-001-19 · `check-trace --self-test` 连续两次通过
- Covers: AC-SYS-001-06
- 前置：当前脚本 `scripts/check-trace.mjs`（33162 字节）。
- 命令：`& $node scripts/check-trace.mjs --self-test`（连续两次）
- 断言：两次退出码均 `0`；stdout 均含
  `SELF-TEST PASS (6 assertions, bad fixture issues=2)`。
- 证据：`evidence.md` E-19、E-20。

#### TC-SYS-001-20 · 自测不写真实仓库
- Covers: AC-SYS-001-06
- 前置：运行前统计 `specs/` 文件数与两脚本 SHA256。
- 命令：`(Get-ChildItem specs -Recurse -File | Measure-Object).Count`；
  `& $node scripts/check-sdd.mjs --self-test`；`(Get-FileHash scripts\check-sdd.mjs -Algorithm SHA256).Hash`
- 断言：运行前后 `specs/` 文件数同为 `171`（补齐本文件前为 `170`，加入本文件后 +1）；脚本哈希不变；不产生仓库内新文件。
- 证据：`evidence.md` E-21。

#### TC-SYS-001-21 · 自测临时目录边界（不删除、打印路径）
- Covers: AC-SYS-001-06
- 前置：无。
- 命令：`& $node scripts/check-sdd.mjs --self-test`；
  `(Get-ChildItem $env:TEMP -Directory -Filter 'dsh-sdd-gate-*').Count`
- 断言（按 `spec.md` AC-06 边界）：退出后临时目录仍在（计数 `>=1`），且 stdout 打印该目录路径。
- 实测：退出后残留目录计数 `0`，stdout 只有 `SELF-TEST PASS ...`，未打印路径 → **未通过**；
  代码依据 `scripts/check-sdd.mjs:802` 的 `rmSync(tmp, { recursive: true, force: true })` 与
  `:811` 的 PASS 输出（`check-trace.mjs` 同样在自测结尾删除临时目录）。
- 证据：`evidence.md` E-17、E-29（`fail`，原因 L6）。

## 3. 真实仓库基线口径

- 补齐前：`check-sdd` 退出码 `1`，`FAILED: 26 issue(s)` = 本包 `R1` 2 条（缺本文件与 `evidence.md`）
  + `CHG-CONV-001..004` 24 条（`R2` 10 + `R3` 14）。
- 补齐后：`check-sdd` 退出码仍为 `1`，应为 `FAILED: 24 issue(s)`，全部落在
  `CHG-CONV-001..004`；本包 `R1/R2/R3` 均为 0。
- `check-trace`：补齐前后均退出码 `0`，`PASS (checks: 659)`，`governance 1`。
- 24 条是**既有包的存量失败**，不属于本包修复范围；本包只负责证明自己的 6 条 AC 与
  “不再新增失败”。若数值不符，以 `evidence.md` 的实测输出为准并在汇报中说明。

## 4. 未执行 / 跳过

- `TC-SYS-001-12`（R4 占位符）按实测记为 `fail`，不是 `missing`。
- 无网络用例：本机出网被策略代理拒绝，未设计联网用例。
- CI 接入（`TASK-CHG-SYS-001-06`）不在本计划内：本计划只验证脚本行为，不验证 GitHub Actions。

## 5. 已知限制与未覆盖

- **L1 R3 豁免章节不抓假证据**：位于「缺失/未跑/未执行/豁免/限制/风险/环境/备注」章节，或条目含
  `missing/未执行/不适用/N/A/缺口/待补/TODO/限制/风险/不能/无法` 时，不要求命令/URL/路径；
  夹具 `exempt-fake` 在 `## 已知限制` 下写 `- 已完成` 仍 `exit 0`（`evidence.md` E-22）。
  这类条目只能人工抽查。
- **L2 含「归档」字样的 historical 包被跳过**：`isArchivedStatus` 用
  `/(?:\barchived\b|已归档|归档)/i` 匹配状态行任意位置；状态写
  `historical / 已归档` 的坏包会被整包跳过（`archived-word` 夹具缺 `evidence.md` 仍 `exit 0`，
  `evidence.md` E-23）。纯 `historical` 不再跳过（新版自测已断言）。
- **L3 3 段旧式 AC 不提取**：`AC_RE = /\bAC-(?:[A-Z0-9]+-){2,}\d+(?![A-Za-z0-9-])/g` 要求至少
  2 个 `XXX-` 组；`AC-P1-01` 只有 1 个组，不会被 R2 纳入（`ac-3seg` 夹具 `exit 0`，
  `evidence.md` E-24）。legacy 包通常已归档，但未归档的 3 段编号会漏检。
- **L4 R4 占位符缺口**：`covered` 的六类空值与 `partial/gap` 的空缺口会被抓，但缺口列写
  `无/待补/TODO/TBD` 不会被抓（五行夹具 DEMO-004 `gap | 无` 未报，`evidence.md` E-10）；
  与 `spec.md` AC-04 的判定（应报 3 行）不一致。
- **L5 AC-05 严格输出未落地**：实际失败行为 `路径:行 R# 说明；补...`，没有 `[FAIL]` 前缀、
  没有 `；建议：`、成功无 `SUMMARY:`、`--json.failures[]` 无 `hint`、缺文件行号为 `1` 而非 `0`
  （`evidence.md` E-14、E-16）。当前只满足 `spec.md` §5.1 的宽松口径（含 `文件:行` 与修复提示）。
- **L6 AC-06 自测边界未满足**：自测结束用 `rmSync` 删除临时目录且不打印路径，与 AC-06 的
  “不就地删除、退出时打印路径”冲突（`evidence.md` E-29）；这是脚本实现问题，不是用例缺失。
- **L7 R2 过度提取引用编号**：`spec.md` 正文凡出现 3 段编号（如 `AC-CONV-001`）都会被要求写进
  `Covers:`；本计划被迫声明一个非本包 AC 才能过门禁。是否改为只扫描「验收」章节，需 Lead 裁决。
- **L8 未覆盖**：并发写、大仓库性能、CI 环境（Linux/Node 版本矩阵）、`--json` 的完整字段契约
  （除 `hint` 外未逐字段断言）、`check-trace` 的 T1–T4/T6 细粒度负例，本轮均未单独构造夹具。

## 6. 变更记录

| 日期 | 变更 | 变更包 | 影响用例 |
|---|---|---|---|
| 2026-11-21 | 首版：21 条用例，覆盖 6 条 AC 与 8 条已知限制 | `CHG-SYS-001` | 全部 |

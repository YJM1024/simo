# CHG-SYS-001 · 规格门禁硬化（Gate Hardening）

状态：草稿（2026-11-21；Q1–Q5 已由 Lead 裁决并回填，待最终评审转 `ready`）
Implements: N/A：本变更为工程治理，不改变任何产品行为，也无对应产品 PRD（见 §9 Q1 裁决）
Domains: `SYS`
Change: CHG-SYS-001
变更类型：纯文档（补首部登记与缺失节，不改脚本、规则语义与既有裁决）
Covers: `AC-SYS-001-01`、`AC-SYS-001-02`、`AC-SYS-001-03`、`AC-SYS-001-04`、`AC-SYS-001-05`、`AC-SYS-001-06`
Owner：产品（本文件与 AC 口径）/ 后端（`scripts/check-sdd.mjs`、`scripts/check-trace.mjs`）/ 测试（自测用例、真实基线、证据）/ 验收（独立签字）

design.md：N/A：本变更为仓库级检查脚本与规格文档治理，无界面、视觉、交互或架构方案产出；方案取舍见 `proposal.md` §4，门禁规则与判定见本文件 §5。
frontend.md：N/A：本变更不改任何页面、组件、前端状态、前端接口调用或交互。
backend.md：N/A：本变更不改 API、数据模型、存储、权限、任务执行或迁移；被测对象是仓库内零依赖 Node 脚本。
组件 spec：N/A：本变更不新增、不修改任何组件的公共契约、变体、状态或视觉规则。

> 以上 `N/A：` 行以对应文件当前不存在为前提。`design.md` 按 Q3 裁决为按需，缺失不报错，本行仅作说明，不是 AC-01 强制项。若后续由设计/前端/后端角色在本包补建对应文件，应删除本行，并把 `N/A：理由` 移入该文件；不得两边都留。
判级：变更级
创建日期：2026-11-21
关闭日期：N/A：尚未收口，Q1–Q5 裁决已回填，待最终评审
## 1. 背景与问题

### 1.1 已核实的现状

- 全仓 71 个 PRD：**0 covered / 48 partial / 23 gap**；P1 的 12 个 PRD 也是 0 covered。
- `docs/product/TRACEABILITY.md` 是**事后统计**，不是开工门禁：它记录“现在长什么样”，不阻止“六类不齐就标 covered”，也不阻止“用 partial 把 gap 糊过去”。
- `scripts/check-sdd.mjs` 只遍历 `specs/` 的直接子目录，检查 `spec.md` 的「状态/目标/需求(R)/验收(A)/非目标」，并把 `A` 编号映射到同目录 `test-plan.md`/`evidence.md`；它**不遍历 `specs/changes/*/`**，因此变更包（L1）的六类产物、`AC-... → Covers:` 映射、证据可复现都不在门禁内。
- 其中 `scripts/check-sdd.mjs:118-123` 只对 `COMP-*` 追加「验收/影响范围」检查；`:125-158` 只检查 `frontend/src/components/manifest.json` 的 `name`/`variants`/`states`。
- `scripts/check-trace.mjs` 只校验 PRD/TREE/TRACEABILITY/TEST 的链接与锚点结构，以及 change 包的 `Implements: PRD-...`；它明确不判断某个 PRD 是否 `covered`。本变更按 Q1 裁决扩展该规则：`Implements` 缺失或为空 → FAIL；治理变更写 `Implements: N/A：<≥8 字理由>` → PASS 并标注 `governance`；不按 `CHG-SYS-*` 前缀开白。
- 5 个组件目录只有 `spec.md` + `test-plan.md`，缺 proposal/design/tasks/evidence，但没有任何自动门禁拦下。
- 现有脚本没有 `--self-test`；规则改动只能靠人眼看输出，无法证明“新规则判得对”。

### 1.2 问题陈述

门禁是软的，所以**文档越写越多，闭环一次没合上**。具体表现为四类“假完整”：

1. **六类不齐也能过**：变更包缺 `tasks.md`/`test-plan.md`/`evidence.md`，或前端/后端不适用却不写 `N/A：理由`，仍被视为有效变更包。
2. **AC 无用例也能过**：`spec.md` 里列了 AC，`test-plan.md` 里没有 `Covers:`，覆盖状态仍可写 partial，甚至被误读为“已有测试”。
3. **证据不可复现也能过**：`evidence.md` 只写“通过/已完成”，没有命令、URL、路径，验收人无法重跑。
4. **追溯矩阵不校验覆盖语义**：`covered` 行不要求六类齐全，`partial`/`gap` 行不要求写清缺口，矩阵退化成“链接合集”。

根因不是缺文档，是**缺可执行、可回归、会失败的判定**。本变更只修机制，不补内容。

## 2. 目标

1. **把六类产物变成硬门禁**：变更包的四件套（`spec.md`/`tasks.md`/`test-plan.md`/`evidence.md`）必须存在；不适用的前端/后端必须在 `spec.md` 写 `N/A：<非空理由>`；`design.md` 按需，缺失不报错。
2. **把 AC→用例变成硬映射**：`spec.md` 中每个变更级 AC 必须在同包 `test-plan.md` 中以 `Covers: <AC ID>` 至少覆盖一次。
3. **把证据变成可复现断言**：`evidence.md` 每条证据必须有命令、URL、文件路径之一，不能只写结论。
4. **把追溯矩阵变成语义门禁**：`covered` 行六类列齐全，`partial`/`gap` 行必须写明缺口。
5. **让失败可修复、成功可计数**：失败输出 `文件:行` + 一句话建议，退出码非 0；成功输出 `PASS` 与检查项计数。
6. **让规则自己可验证**：两个脚本都提供 `--self-test`，用临时目录构造正反样例并自断言。
7. **给治理变更一个合法出口**：change 包 `Implements` 缺失或为空仍失败；写 `Implements: N/A：<非空理由>`（理由 ≥8 字）时通过并在输出标注 `governance`，不按包名前缀开白。
8. **产品行为零变化**：本变更是纯工程治理，运行时代码、产品行为、数据与权限全部不变。

## 3. 非目标

- 不修改 P1 的任何功能实现、页面、接口、数据、权限或运行时行为。
- 不修改 P2–P10 的产品内容、覆盖状态与缺口结论。
- 不重写已有 spec，不批量补齐 71 个 PRD 的六类产物，不把任何 PRD 升级为 `covered`。
- 不为历史包补写实质内容；只允许如实标记状态或在基线中记录失败。
- 不新增自动修复（auto-fix）能力；检查脚本保持只读，不得改写被检文档。
- 不删除、不移动任何文件；新增文件的回滚也只能移入 `E:\dsh_home\trash\pending-delete\`。
- 不把 CI 接入当作本包的既成事实；CI 是 06 号任务，且依赖基线转绿。

## 4. 行为不变边界

本变更**不含产品功能**，因此必须明确“什么算行为不变”：

- **运行时代码零差异**：`frontend/`、`backend/`、Go 二进制、HTTP/WS 接口、SQLite schema、权限判定、任务执行路径均不修改。
- **产品行为不变**：用户看到的页面、交互、文案、数据、通知、快捷键、错误提示均不变；不存在“先改门禁顺手修功能”的空间。
- **数据不变**：无迁移、无回填、无字段增删、无索引变化。
- **只改仓库级治理面**：`scripts/`、`specs/` 文档、`docs/product/` 追溯表头与口径、`.github/workflows/` 的检查步骤。
- **门禁变严不是产品行为变化**：开发者会在本地/CI 看到新的失败，这是治理效果；不得因此降低产品验收标准。
- **越界即停**：实现中若发现必须改运行时接口/数据/权限才能让规则成立，立即停止并回到 Lead 重新判定范围（可能升级为完整变更），不得在本包内偷偷改。

## 5. 验收标准（AC）

> 本包是治理变更，无产品 PRD；以下为**变更级 AC**，编号按 §9 Q4 裁决采用 `AC-<CHG-ID>-<NN>`（如 `AC-SYS-001-01`），ID-SPEC 将补入该规则。每条都写成可被脚本或 `--self-test` 判定的断言。

### AC-SYS-001-01 · 变更包四件套与 N/A 理由

**断言**：`scripts/check-sdd.mjs` 遍历 `specs/changes/` 的每个直接子目录（跳过 `archive/` 子树），读取其 `spec.md` 的状态行；状态为 `archived` 的跳过，其余（含 `spec.md` 缺失）均为受检变更包。受检包必须同时存在 `spec.md`、`tasks.md`、`test-plan.md`、`evidence.md`；`frontend.md`、`backend.md` 任一不存在时，`spec.md` 必须含 `N/A：<非空理由>`（全角冒号，`N/A：` 后至少一个非空白字符）。`design.md` 按需，缺失不报错。缺失文件、`N/A：` 后为空、或只写裸 `N/A` 不给理由 → 失败。历史 `CHG-LEGACY-*` 包按实际状态处理：已完结的标 `archived` 并登记归档索引，脚本按“跳过 archived”自然放行；仍在用的保持红基线并进 `docs/product/SPEC-GAP.md`；不设 `--legacy` 开关，不按前缀豁免。

**判定**：构造“四件套齐全 + 两个 N/A 有理由（`design.md` 缺失不报错）”的样例应 PASS；分别缺 `tasks.md`、`N/A：` 空理由、裸 `N/A` 的样例应 FAIL，且失败行能定位到对应文件。

### AC-SYS-001-02 · 每个 AC 必须被 `Covers:` 覆盖

**断言**：对每个受检变更包，提取 `spec.md` 中所有形如 `AC-<CHG-ID>-<NN>` 的编号（如 `AC-SYS-001-01`，按 §9 Q4 裁决补入 ID-SPEC 的变更级 AC 规则）；每个编号必须在同包 `test-plan.md` 的至少一条 `Covers:` 声明中出现。`Covers:` 支持全角/半角冒号，可一次列多个 AC（逗号、顿号或空格分隔）；只出现在正文叙述、没有写 `Covers:` 的不算覆盖。

**判定**：样例中 3 个 AC 全部被 `Covers:` 列出 → PASS；删掉其中一个 `Covers:` 条目 → FAIL，且输出缺失的 AC 编号与 `test-plan.md` 的修复建议。

### AC-SYS-001-03 · 证据必须可复现

**断言**：`evidence.md` 中每条证据（表格数据行或列表项）必须含至少一个可复现线索：命令行（如 `node …`、`pnpm …`、`npm …`、`go test …`、`pwsh …`）、URL（`http://` 或 `https://`）、仓库相对路径/绝对路径、或截图文件路径（`.png`/`.jpg`/`.jpeg`/`.webp`）。只写“通过/已完成/PASS/OK”而没有任何线索 → 失败。`已知限制`、`未覆盖`、`缺口`、`跳过` 小节下的说明不按证据条目判定。

**判定**：样例中每条证据带命令/URL/路径 → PASS；把其中一条改成只写“通过” → FAIL，并指出该条所在行与“补命令/URL/路径”的建议。

### AC-SYS-001-04 · 追溯矩阵与 change 追溯语义

**断言**：`scripts/check-trace.mjs` 解析 `docs/product/TRACEABILITY.md` 的 PRD 行，按「覆盖」列判定：

- `covered`：六类列（`产品 spec`、`前端 spec`、`后端 spec`、`组件 spec`、`任务卡`、`TEST`）必须存在且非空；单元格写 `N/A：<非空理由>` 视为齐全；空、`—`、`-`、裸 `N/A`、`N/A：` 后无理由 → 失败。
- `partial` / `gap`：「缺口」列必须非空，且不能是占位符（`—`、`-`、`无`、`待补`、`TODO`、`TBD`）。
- 若整表缺六类列：只在存在 `covered` 行时失败（避免把当前 0 covered 的基线误报成结构失败）；`partial`/`gap` 的缺口检查不受影响。
- **change 包的 `Implements`**：缺失或为空 → 失败；写 `Implements: N/A：<非空理由>` 且理由 ≥8 字 → 通过，并在输出统计中标 `governance`；写 `Implements: PRD-...` 时按既有规则校验 PRD 存在。禁止按 `CHG-SYS-*` 前缀开白。

**判定**：构造包含 `covered`（六类齐全）、`covered`（缺任务卡）、`partial`（缺口为空）、`gap`（缺口为“无”）、`partial`（缺口有内容）五行的小矩阵，脚本应只对中间三行报错，其余两行通过。另构造三个 change 样例：`Implements` 缺失 → FAIL、`Implements: N/A：` 空理由 → FAIL、`Implements: N/A：本变更为工程治理`（≥8 字）→ PASS 且输出标注 `governance`。

### AC-SYS-001-05 · 失败输出与退出码

**断言**：两个脚本在失败时，每条失败输出一行：

```text
<相对路径>:<行号> R# <说明>
```

`R#` 为规则 ID（如 `R1`、`T5`），说明为一句话修复建议；无法定位具体行号时允许写 `0`。进程退出码：`0` 全通过；`1` 存在失败项；`2` 前置条件不可读（如仓库根缺 `specs/`）。成功时输出末行 `PASS (checks: <N>)`，`N` 为实际执行的检查规则数（按规则计，至少 1）。`--json` 模式下 `failures[]` 每项必须含 `rule`、`severity`、`path`、`line`、`hint` 五个字段；`hint` 为修复建议，可为 `null`。不再要求 `[FAIL] … 建议：…` 的人读前缀或 `SUMMARY:` 行。

**判定**：用样例分别触发 PASS/FAIL/前置错误，断言 stdout 匹配上述格式、退出码为 0/1/2；`--json` 解析后逐项检查五个字段存在，且 `hint` 为字符串或 `null`。

### AC-SYS-001-06 · `--self-test` 自证

**断言**：`scripts/check-sdd.mjs` 与 `scripts/check-trace.mjs` 均支持 `--self-test`。自测在系统临时目录创建独立样例根（`os.tmpdir()/sdd-selftest-<pid>-<timestamp>`），**不读写真仓库**，并由脚本内部断言，不依赖人眼看输出。至少覆盖：

- `check-sdd`：达标包 → PASS；缺 `tasks.md` → FAIL；`N/A：` 空理由 → FAIL；AC 无 `Covers:` → FAIL；证据只有“通过” → FAIL；`N/A：理由` 存在 → PASS；`superseded_by` 指向存在包 → R2/R3 跳过，指向不存在包 → `R5` FAIL。
- `check-trace`：`covered` 六类齐全 → PASS；`covered` 缺列 → FAIL；`partial` 缺口为空 → FAIL；`partial` 缺口有内容 → PASS；`gap` 缺口写 `无`/`待补`/`TODO`/`TBD` → FAIL；`partial`/`gap` 不得被误判为 `covered`；`Implements` 缺失/空理由/短理由（<8 字）→ FAIL；`Implements: N/A：本变更为工程治理`（≥8 字）→ PASS 且标注 `governance`。
- 自测自身：全部断言通过 → 退出码 0；任一断言失败 → 退出码 1，并打印断言名、期望值与实际值。
- 清理可观测：自测结束删除自建的临时目录，并打印一行 `tmp=<path> removed`，供证据捕获。

**边界**：自测不得写入仓库工作区；临时目录由脚本在系统临时区（`os.tmpdir()`）自建，结束后只删除该自建目录，绝不触碰仓库或用户文件；删除后打印 `tmp=<path> removed`。不得访问网络。

**判定**：连续运行两次 `--self-test` 均退出 0；临时目录位于系统临时区且不在仓库内，运行结束后已不存在；故意破坏一条断言时退出 1 并打印断言名。

### 5.1 AC 判定方式速查

| AC | 判定方式 | 通过条件 |
|---|---|---|
| `AC-SYS-001-01` | `node scripts/check-sdd.mjs --root . --json` + 自测样例 | 四件套与 `N/A：理由` 均被检查；缺项报 `文件:0` 或 `文件:行` |
| `AC-SYS-001-02` | 同上 | 每个 AC 在 `test-plan.md` 有 `Covers:`；缺失项逐条报出 |
| `AC-SYS-001-03` | 同上 | 每条证据至少一个命令/URL/路径线索 |
| `AC-SYS-001-04` | `node scripts/check-trace.mjs --root . --json` | `covered` 六类齐全，`partial`/`gap` 缺口非占位符；change 包 `Implements` 缺失/空理由 FAIL，`N/A：≥8 字` PASS 且标 `governance` |
| `AC-SYS-001-05` | 捕获 stdout/stderr + `$LASTEXITCODE` | 失败行为 `路径:行 R# 说明`；退出码 0/1/2；JSON 含 `rule/severity/path/line/hint` |
| `AC-SYS-001-06` | `node scripts/check-sdd.mjs --self-test`、`node scripts/check-trace.mjs --self-test` | 两次均退出 0，且不写仓库 |

### 5.2 规则偏差与已知限制（2026-11-21）

> 本节显式记账脚本实现与任务字面的差异，以及门禁抓不到的部分；不写进口头结论。

| 规则 | 偏差 / 已知限制 | 原因与口径 | 记录 |
|---|---|---|---|
| R2 AC 提取 | 实现用 `AC-(?:[A-Z0-9]+-){2,}\d+`，不是任务字面的 `AC-[A-Z0-9]+-\d+` | 字面正则在 4 段真实编号上只截到前缀（如 `AC-CONV-001`），R2 会形同虚设；完整正则兼容 4 段与 ID-SPEC 的 5 段编号。代价：3 段旧式编号不提取（legacy 已归档跳过） | Lead 裁决 2026-11-21 |
| R3 豁免与已知限制 | 豁免章节内的假证据不抓 | 「缺失 / 未跑 / 未执行 / 豁免 / 限制 / 风险 / 环境 / 备注」章节下的条目，或条目本身含 `missing` / `未执行` / `未跑` / `不适用` / `N/A` / `缺口` / `TODO` / `限制` / `风险` / `不能` / `无法` 的，不要求可复现线索（对齐 `docs/process/templates/evidence.md` §5）；空行结论检查（整行仅为「通过 / 已完成 / ok / PASS」）仍对全文生效。**这些章节内的假证据需人工抽查** | Lead 裁决 2026-11-21 |
| R2 提取范围 | 只在「验收标准 / AC」章节内提取，fenced code 内示例不提取 | 避免正文/状态表里顺带提到的编号被当作 AC 规范；真实验收：26 个 AC 编号与收窄前完全一致，10 条 R2 失败集不变（收窄未掩盖真问题） | Lead 裁决 2026-11-21 |
| R5 superseded_by | 目标包存在才允许 R2/R3 跳过；目标不存在报错 | 历史包由新包取代时保留文件、不靠删除或“假装修完”消红；只在字段指向真实存在的 `CHG-ID` 时生效，`R1` 仍照常执行 | Lead 裁决 2026-11-21 |

**R3 豁免与已知限制：豁免章节内的假证据不抓。** 该限制已同步写入 `scripts/check-sdd.mjs` 头注释与本节，验收时按人工抽查补足。

### 5.3 判据映射（门禁登记）

本包 6 条变更级 AC 的判据以人工核验脚本行为为准：运行命令后核对退出码、失败行格式与 `--json` 字段，人工签字前不记 pass。

| AC | 判据 | 结果 |
|---|---|---|
| `AC-SYS-001-01` | 人工：验收 Agent 运行 `node scripts/check-sdd.mjs --self-test`，核对四件套、`N/A：<理由>` 正反样例与失败行定位 | missing（未执行） |
| `AC-SYS-001-02` | 人工：验收 Agent 用 `--self-test` 样例核对 `AC → Covers:` 覆盖与缺失报错 | missing（未执行） |
| `AC-SYS-001-03` | 人工：验收 Agent 核对证据条目含命令/URL/路径线索，只写“通过”的样例报错 | missing（未执行） |
| `AC-SYS-001-04` | 人工：验收 Agent 运行 `node scripts/check-trace.mjs --self-test`，核对 covered 六类列、partial/gap 缺口与 `Implements: N/A：<≥8 字>` 标注 `governance` | missing（未执行） |
| `AC-SYS-001-05` | 人工：验收 Agent 捕获 stdout/stderr 与 `$LASTEXITCODE`，核对 `路径:行 R# 说明`、退出码 0/1/2 与 JSON 五字段 | missing（未执行） |
| `AC-SYS-001-06` | 人工：验收 Agent 连续两次运行 `--self-test`，核对退出码 0 与临时目录清理输出 | missing（未执行） |

## 6. 变更包粒度约定

- 一个 `CHG` 按**需求提出视角**聚合：一次用户需求可以覆盖多个功能点、多个产品场景，甚至多个分类；**不按单个功能点拆包**。
- 反例：一个按钮一个包、一条 AC 一个包、一个页面一个包。这样会把跨功能关系切断，也会让追溯矩阵退回“文件清单”。
- `Implements:` 可列多个 PRD ID；跨域时用**主域**编号，并在 `Domains:` 列出全部域，不允许多个头。
- 一个包内可以用多张任务卡拆并行工作面；任务卡 scope 不重叠，**同一文件同一时刻只能有一个 owner**。
- 本包即示例：一次“门禁硬化”需求覆盖规则实现、自测、基线、文档回填、CI 接入五个工作面，仍是一个 `CHG-SYS-001`。

## 7. 六类产物状态（本包自身）

| 类别 | 产物 | 当前状态 | 说明 |
|---|---|---|---|
| 产品 spec | 本文件 §1–§5 | 有 | 无产品 PRD，用“行为不变边界 + 变更级 AC”替代 |
| 变更包 | `proposal.md` / `spec.md` / `tasks.md` | 有 | 本包 |
| 前端开发 spec | `frontend.md` | N/A | 见文件头 `N/A：理由` |
| 后端开发 spec | `backend.md` | N/A | 见文件头 `N/A：理由` |
| 组件 spec | `specs/COMP-*` | N/A | 不新增/修改组件 |
| 任务卡 | `tasks.md` | 有 | 6 张卡，状态 `todo` |
| 测试 spec | `test-plan.md` | **缺失** | 由测试角色补齐；补齐前本包不满足 `AC-SYS-001-01` |
| 执行证据 | `evidence.md` | **缺失** | 由测试/验收角色补齐；补齐前不得标 `verified`/`accepted` |

**结论**：本包当前**不满足** `AC-SYS-001-01`，因为 `test-plan.md` 与 `evidence.md` 尚由其他角色负责。这不是豁免，而是门禁生效后的真实状态；补齐后方可重跑基线。

## 8. 影响、风险与回滚

依赖：无新增外部依赖；门禁脚本零依赖 Node 运行。

### 8.1 影响面

- 必需改动：`scripts/check-sdd.mjs`、`scripts/check-trace.mjs`。
- 回填改动：`scripts/README.md`、`specs/changes/README.md`、`docs/product/TRACEABILITY.md` 的表头/口径、`docs/product/ID-SPEC.md`（变更级 AC 与归档索引）、`docs/product/SPEC-GAP.md`（待修清单）。
- 接入改动：`.github/workflows/ci.yml`（06 号任务，依赖基线转绿）。
- 零改动：`frontend/`、`backend/`、数据库、接口、权限、任何产品运行时行为。

### 8.2 风险与缓解

- 依赖：无外部前置；前置变更 CHG-MOXX16 的规则冻结与本包 06 号 CI 任务尚未就绪，依赖项在 `docs/product/SPEC-GAP.md` 登记。

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| R1 基线大面积失败 | 首跑发现大量包缺件/缺 `Covers:`/证据不可复现 | 这是目的；按 `evidence.md` 的失败清单分批修，不提供静默豁免；确需例外按 `rules/spec-workflow.md` §5 由 Lead 书面记录 |
| R2 文本解析误判 | `N/A：`、`Covers:`、证据线索的写法变体 | `--self-test` 覆盖正反样例；误判改规则，不改文档绕过；规则变更必须带新样例 |
| R3 治理变更追溯 | 本包无 PRD，旧规则要求 `Implements: PRD-...` | Q1 已裁决：允许 `Implements: N/A：<≥8 字理由>`，通过时标注 `governance`，不按前缀开白；禁止伪造 PRD |
| R4 历史包拖累 | `CHG-LEGACY-*` 缺 `tasks.md`/`evidence.md` | Q2 已裁决：已完结的标 `archived` 并登记归档索引；仍在用的保持红基线并进 `SPEC-GAP.md`（owner/期限）；不新增 `--legacy` 软开关 |
| R5 自测残留临时目录 | 全局文件安全规则禁止就地删除 | 打印路径，人工移入 `E:\dsh_home\trash\pending-delete\`；不自作主张删除 |
| R6 CI 阻断正常开发 | 规则未稳定就设 required check | Q5 已裁决：先 `continue-on-error` 报告，基线转绿后再设 required check |

### 8.3 回滚

- 脚本规则：按文件回滚到变更前版本；无数据/接口迁移。
- 新增 fixture/自测文件：移入 `E:\dsh_home\trash\pending-delete\` 并保留路径结构，不就地删除。
- 文档回填：移除新增章节/列，不改动任何 PRD 状态与缺口结论。
- CI：移除新增检查步骤，恢复原 workflow。
- 回滚后必须重跑 `--self-test` 与基线，确认没有“回滚一半”的规则残留。

## 9. Lead 裁决记录（2026-11-21）

| # | 问题 | 裁决 | 落地位置 |
|---|---|---|---|
| Q1 | 治理变更无产品 PRD，check-trace 强制 `Implements: PRD-...` | 允许写 `Implements: N/A：<理由>`（理由非空、≥8 字）；`Implements` 缺失或为空 → FAIL；写 N/A 且有理由 → PASS 并标注 `governance`；禁止按 `CHG-SYS-*` 前缀开白 | AC-04、TASK-02 |
| Q2 | 历史 `CHG-LEGACY-*` 会大面积红基线 | 不开软开关；已完结的标 `archived` 并写进 ID-SPEC 归档索引，脚本跳过 archived；仍在用的保持红基线，进 `SPEC-GAP.md` 带 owner 与期限；不设 `--legacy` | AC-01、TASK-05 |
| Q3 | `design.md` 在全局规则中“按需”，AC-01 却强制 N/A | 缩回去：AC-01 只要求 `frontend.md`/`backend.md` 缺失时写 `N/A：理由`；`design.md` 缺失不报错 | AC-01、AC-06 |
| Q4 | 变更级 AC 编号无正式规则 | 在 `docs/product/ID-SPEC.md` 增加 `AC-<CHG-ID>-<NN>`（如 `AC-SYS-001-01`），与 `AC-<PRD-ID>-<NN>` 并列；变更级 AC 只能描述本次变更的验收，不得替代产品 AC | AC-02、TASK-05 |
| Q5 | CI 阻断级别与时机 | 先 `continue-on-error`，基线转绿后再设 required check | TASK-06 |

## 10. 附录 A · 六大角色与并行规则

| 角色 | 职责 | 不负责 |
|---|---|---|
| 产品 | 问题、场景、行为、AC、非目标、产品域 spec | 交互细节、视觉稿、代码实现、测试执行 |
| 设计 | 交互与视觉方案、tokens、组件方向、验收截图口径 | 产品范围决策、后端契约、最终验收签字 |
| 前端 | 页面/组件实现、状态、响应式、可访问性、前端测试 | 产品 AC 改写、后端接口/数据、组件公共契约单方面变更 |
| 后端 | 接口契约、数据、权限、迁移、后端测试 | 前端交互、视觉、产品范围、验收签字 |
| 测试 | 用例设计、自动化、证据归档、覆盖审计 | 改产品行为、替实现者自签、伪造通过 |
| 验收 | 独立核验 AC、证据、回归；签署结论（实现者不得自签） | 代替实现者写代码、改 AC 迎合实现 |

**并行规则**：

- 前端、后端视工作量可各开 2–3 个 Agent 并行；脚本治理同理，可按 `check-sdd` 与 `check-trace` 分两路。
- **同一文件同一时刻只能有一个 owner**；并行任务必须在 scope 里写清文件边界，交接时先冻结接口再换人。
- 证据由 owner 产出、测试复核、验收签字；实现者不得给自己的视觉/功能签字。
- 共享文件（如 `TRACEABILITY.md`、`tasks.md`）只允许一个 owner 写入；其他人以 issue/批注提出修改，不直接落盘。

## 11. 需求

1. 变更包的六类产物成为硬门禁：四件套必须存在，不适用的前端/后端写 `N/A：<非空理由>`，`design.md` 按需。
2. 变更级 AC 必须在本包 `test-plan.md` 的 `Covers:` 中出现，正文提及不算覆盖。
3. `evidence.md` 每条证据带命令、URL 或路径线索，只写结论的条目判失败。
4. `TRACEABILITY.md` 按覆盖列校验：`covered` 行六类齐全，`partial`/`gap` 行缺口非占位符。
5. 失败输出定位到 `文件:行`，退出码 0/1/2，成功输出 `PASS (checks: N)`；两个脚本提供 `--self-test`。
6. 治理包可写 `Implements: N/A：<≥8 字理由>` 通过并标 `governance`，不按前缀开白。
7. 产品行为、运行时代码、数据与权限零变化。

## 12. 接口与数据

| 接口或数据 | 形状 | 说明 |
|---|---|---|
| `node scripts/check-sdd.mjs --root <dir> [--json] [--self-test]` | 失败行 `<路径>:<行> R# <说明>`；成功末行 `PASS (checks: N)`；退出码 0/1/2 | `--json` 的 `failures[]` 含 `rule`/`severity`/`path`/`line`/`hint` |
| `node scripts/check-trace.mjs --root <dir> [--json] [--self-test]` | 同上；治理包的 `Implements: N/A：<≥8 字>` 标注 `governance` | 读取 `docs/product/TRACEABILITY.md` 与 change 包首部 |
| 变更包首部字段 | `状态`、`Implements`、`Covers`、`Change`、`Owner` 等 `键：值` 行 | 本文件只登记约定，不改解析实现 |
| 自测临时目录 | `os.tmpdir()/sdd-selftest-<pid>-<timestamp>` | 不在仓库内创建；结束打印清理行，不就地删除用户文件 |

## 13. 待确认

1. Q1–Q5 已由 Lead 裁决并回填 §9；本文件状态仍为 `draft`，最终评审转 `ready` 的时间点待 Lead 确认。
2. `test-plan.md` 与 `evidence.md` 是否存在：§7 记录为缺失，由测试/验收角色补齐；补齐前本包不满足 `AC-SYS-001-01`。
3. 06 号 CI 接入任务依赖基线转绿，是否本批启动待 Lead 定优先级。
4. 6 条变更级 AC 的判据映射已登记在 §5.3，执行结果本轮全部为 `missing`；补跑后再更新。

## 14. 链接与关联

- 提案与取舍：`proposal.md` 与 `docs/process/PROCESS.md` 第 2 节。
- 规则原文：`docs/framework/GATES.md` 的 MX-G-08 至 MX-G-12；脚本实现 `scripts/check-sdd.mjs`、`scripts/check-trace.mjs`。
- 追溯与缺口：`docs/product/TRACEABILITY.md`、`docs/product/SPEC-GAP.md`、`docs/product/ID-SPEC.md`。
- 裁决记录：本文件 §9 的 Q1–Q5；基线证据由 `evidence.md` 承接。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-21：建立本包并首次登记状态。
- 2026-11-21：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

未收口：当前状态为七值口径中的一项，剩余工作与缺口见本文件
「待确认」节与 `test-plan.md` 的未覆盖清单；关闭前需补齐证据并由验收 Agent 独立签字。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。

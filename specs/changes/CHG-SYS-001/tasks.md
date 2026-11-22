# CHG-SYS-001 · 任务卡

状态：**draft**（任务均未派发；Q1–Q5 已由 Lead 裁决并回填 `spec.md` §9，等 Lead 确认优先级）
Implements: N/A：工程治理，不改变产品行为，无对应产品 PRD
Domains: `SYS`
Change: CHG-SYS-001

> 四要素：**owner / scope / AC / 证据**。证据列写“什么命令/文件能证明完成”；未执行前状态一律 `todo`。实现者完成后改 `in-progress`/`implemented`，验收后由验收人改 `verified`/`accepted`，不得自签。
> `scope` 必须同时写“允许改什么”和“不碰什么”；同一文件同一时刻只能有一个 owner。

| 任务 | owner | scope（写作用域） | AC | 证据 | 状态 |
|---|---|---|---|---|---|
| `TASK-CHG-SYS-001-01` `check-sdd.mjs` 规则实现 | 后端（工程脚本） | `scripts/check-sdd.mjs`：变更包四件套与 `N/A：理由`（仅 `frontend.md`/`backend.md` 强制，`design.md` 按需）、`AC → Covers:`、证据可复现、失败格式/退出码。**不碰** `check-trace.mjs`、`frontend/`、`backend/`、`docs/`、`specs/` 既有文件；不删除/移动文件 | `AC-SYS-001-01`、`AC-SYS-001-02`、`AC-SYS-001-03`、`AC-SYS-001-05` | `node scripts/check-sdd.mjs --root . --json` 的正/反样例输出、退出码；与 03 的 `--self-test` 联调记录 | `todo` |
| `TASK-CHG-SYS-001-02` `check-trace.mjs` 规则实现 | 后端（工程脚本） | `scripts/check-trace.mjs`：`covered` 六类列、`partial`/`gap` 缺口、失败格式/退出码；在保留既有 TREE/PRD/TEST 锚点与 PRD 校验的前提下，扩展 change 包 `Implements` 规则——缺失/为空 FAIL，`N/A：<≥8 字理由>` PASS 并标注 `governance`，不按 `CHG-SYS-*` 前缀开白。**不碰** `check-sdd.mjs`、产品 spec、`TRACEABILITY.md` 内容（只读）；不删除/移动文件 | `AC-SYS-001-04`、`AC-SYS-001-05` | 五行小矩阵与三个 `Implements` 样例的正/反输出；`node scripts/check-trace.mjs --root . --json` 的真实基线；退出码 0/1/2 | `todo` |
| `TASK-CHG-SYS-001-03` `--self-test` 样例与断言 | 测试 | 新增 `scripts/selftest/` fixture 模块与断言；`--self-test` 入口由 01/02 接入，03 只调用约定好的 hook。**不碰** 01/02 的规则语义；不写真实仓库；不就地删除临时目录；不访问网络 | `AC-SYS-001-06` | `node scripts/check-sdd.mjs --self-test`、`node scripts/check-trace.mjs --self-test` 连续两次 exit 0；故意破坏一条断言时 exit 1 并打印断言名；临时目录路径不在仓库内 | `todo` |
| `TASK-CHG-SYS-001-04` 真实仓库基线跑一次并记录 | 测试/验收 | 只读运行两个脚本；把命令、日期、Node 版本、仓库根、完整输出、退出码、按 kind 的失败统计写入 `specs/changes/CHG-SYS-001/evidence.md`。**不碰** 脚本、被检文档、任何业务代码；不为“跑绿”修改任何文件 | `AC-SYS-001-05`（并作为 01–04 的基线证据） | `evidence.md` 含可复现命令与完整输出；失败项能按包/文件定位；`CHG-SYS-001` 的 `Implements` 判定记录为 `governance`；结论只写实测，不写“预计” | `todo` |
| `TASK-CHG-SYS-001-05` 文档与追溯回填 | 产品 | `scripts/README.md`（检查项/输出/self-test/退出码）、`specs/changes/README.md`（提包门禁）、`docs/product/TRACEABILITY.md`（仅表头/口径；如 `AC-SYS-001-04` 需要六类列，先加列并对存量行写 `N/A：理由`）、`docs/product/ID-SPEC.md`（补 `AC-<CHG-ID>-<NN>` 与归档索引）、`docs/product/SPEC-GAP.md`（仍红的 LEGACY 包带 owner/期限）。**不碰** 产品 spec、任何 PRD 的覆盖状态与缺口结论、P2–P10 功能内容 | `AC-SYS-001-02`、`AC-SYS-001-04` | 文档 diff；`node scripts/check-trace.mjs --root .` 输出；`TRACEABILITY.md` 表头与列名对照；ID-SPEC 的 AC 规则节与归档索引；SPEC-GAP 的 LEGACY 待修行 | `todo` |
| `TASK-CHG-SYS-001-06` 门禁接入 CI/提交钩子 | Lead/工程 | `.github/workflows/ci.yml` 增加 `check-sdd` 与 `check-trace` 步骤及必要脚本入口；按 Q5 先设 `continue-on-error`，基线转绿后再改 required check。**不碰** 业务代码；基线未绿前不得设为 required check | `AC-SYS-001-05` | 两次 CI run URL（`continue-on-error` 与 required check）；required check 配置截图；本地等价命令输出 | `todo` |

## 依赖

- **01 与 02 可并行**：文件不同，owner 不同；各自只改自己的脚本。
- **03 依赖 01/02 先冻结 `--self-test` 入口约定**（函数名、样例根目录、断言返回结构）；03 不直接改 01/02 的文件，避免同文件双 owner。若必须内联，先由 01/02 的 owner 交接文件所有权。
- **04 依赖 01/02 规则实现与 03 自测通过**；基线只记录，不修文档。
- **05 依赖 04 的真实失败清单**：先知道哪些包缺什么，再决定 `TRACEABILITY.md` 是否增列；不得先改矩阵再补证据。
- **06 依赖 04/05**；按 `spec.md` §9 Q5 裁决先 `continue-on-error`，基线转绿后再设 required check。

## 回滚

- 01/02：按文件回滚到变更前版本；规则回滚后必须重跑 `--self-test` 与基线，确认没有半套规则残留。
- 03：新增 fixture 文件回滚 = 移入 `E:\dsh_home\trash\pending-delete\` 并保留路径结构，不就地删除。
- 04：`evidence.md` 为新增证据记录，回滚 = 移除对应小节并保留“已回滚”说明，不删除文件。
- 05：文档回填按文件回滚；不得顺带恢复任何 PRD 的旧覆盖状态。
- 06：移除 CI 步骤，恢复原 workflow；若已设 required check，先由 Lead 解除再回滚。

## 派发前检查

- [ ] 每张卡都有唯一 owner、明确 scope、AC、证据、回滚方式。
- [ ] 01/02 的失败输出格式已按 `AC-SYS-001-05` 对齐（`文件:行 — 问题；建议：…`）。
- [ ] 03 的样例不读写真仓库，且不删除临时目录。
- [ ] 04 只记录实测，不把“未运行”写成“通过”。
- [ ] 05 不改任何 PRD 的覆盖状态与缺口结论。
- [ ] 05 的 ID-SPEC/SPEC-GAP 改动只补规则与待修清单，不改 PRD 覆盖状态。
- [ ] 06 先 `continue-on-error`，基线转绿前不设为 required check。

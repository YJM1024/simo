# CHG-SYS-001 · 规格门禁硬化：提案

状态：**draft**（2026-11-21；Q1–Q5 已由 Lead 裁决并回填，待最终评审转 `ready`）
Implements: N/A：本变更为工程治理，不改变任何产品行为，无对应产品 PRD（见 `spec.md` §9 Q1 裁决）
Domains: `SYS`
Owner：产品（问题与 AC 口径）/ 后端（`scripts/` 检查脚本）/ 测试（自测用例、基线、证据）/ 验收（独立签字）

## 1. 为什么做

全仓 71 个 PRD 的覆盖现状是 **0 covered / 48 partial / 23 gap**；P1 的 12 个 PRD 也是 0 covered。文档数量在增长，但「一个需求从 PRD 到 AC、到用例、到可复现证据」的闭环一次都没有合上。

问题不是文档写得少，而是**门禁是软的**：

- `docs/product/TRACEABILITY.md` 是事后统计：它记录“现在长什么样”，不阻止“没有六类产物就标 covered”，也不阻止“用 partial 把 gap 糊过去”。
- `scripts/check-sdd.mjs` 只遍历 `specs/` 的直接子目录，检查 `spec.md` 的「状态/目标/需求(R)/验收(A)/非目标」，并把 `A` 编号映射到同目录 `test-plan.md`/`evidence.md`；它**不遍历 `specs/changes/*/`**，所以变更包的六类产物、`AC-... → Covers:` 映射、证据可复现都不在门禁内。
- 其中 `scripts/check-sdd.mjs:118-123` 只对 `COMP-*` 追加「验收/影响范围」检查；`:125-158` 只检查 `frontend/src/components/manifest.json` 的 `name`/`variants`/`states`。
- `scripts/check-trace.mjs` 只校验 PRD/TREE/TRACEABILITY/TEST 的链接与锚点结构，以及 change 包的 `Implements: PRD-...`；它明确不判断某个 PRD 是否 `covered`。
- 结果是：`spec.md` 里写一句“支持 X”也算有 spec；`evidence.md` 写一句“通过”也算有证据；5 个组件目录只有 `spec.md` + `test-plan.md`，缺 proposal/design/tasks/evidence，却没有门禁拦下。

机制上的后果是：**写得越多，看起来越完整；闭环一次没合上，却没有任何红灯。** 本变更把“看起来完整”改成“可判定地完整”。

## 2. 做什么

1. **把规则写死到脚本**：给 `check-sdd.mjs` 增加变更包四件套存在性、`N/A` 理由、`AC → Covers:`、证据可复现四类检查；给 `check-trace.mjs` 增加 `covered` 六类列与 `partial`/`gap` 缺口检查，并扩展 change 包 `Implements` 规则：缺失/为空 FAIL，`Implements: N/A：<≥8 字理由>` PASS 且标注 `governance`，不按包名前缀开白。
2. **统一失败输出与退出码**：`文件:行 — 问题；建议：一句话`，失败退出非 0，成功输出 `PASS` 与检查项计数。
3. **给脚本加 `--self-test`**：用临时目录构造达标/不达标样例，脚本自己断言判定，不触碰真实仓库。
4. **跑一次真实基线并如实记录**：不为了让脚本变绿而改被检文档，红就是红。
5. **回填说明与追溯口径**：更新 `scripts/README.md`、`specs/changes/README.md`，给 `TRACEABILITY.md` 增列，并把变更级 AC 规则与归档索引补进 `docs/product/ID-SPEC.md`、把仍红的 LEGACY 包列入 `docs/product/SPEC-GAP.md`；不重写任何 PRD。
6. **接入 CI/提交钩子**：让门禁在合并前自动执行（依赖基线转绿，见 `tasks.md` 06）。

## 3. 不做什么

- 不改 P1 的功能实现、产品行为、页面、接口、数据、权限或任何运行时二进制。
- 不动 P2–P10 的产品内容、覆盖状态与缺口结论。
- 不重写已有 spec，不批量补 71 个 PRD 的六类产物；本包只交付“能让缺口现形”的机制。
- 不删除、不移动任何文件；新增文件回滚也只能移入 `E:\dsh_home\trash\pending-delete\`。
- 不把“脚本能跑”当成“文档已闭环”；基线失败必须原样记录。

## 4. 方案对比

| 方案 | 做法 | 取舍 |
|---|---|---|
| A 人工评审 | 每次提包由人逐项核对六类产物与 AC 映射 | 不可重复、随评审人漂移、没有退出码，正是当前“软门禁”的来源；否决 |
| B 继续加模板/加文档 | 再写一份“变更包填写指南” | 治症状不治机制；文档越多越难核对；否决 |
| C 可执行门禁（选定） | 脚本检查 + `--self-test` + 真实基线 + CI | 规则可回归、失败可定位、成本集中在一次实现；选定 |
| D 直接 CI 阻断 | 不跑基线就把规则设成 required check | 首跑即大面积红，无法区分“规则误判”与“真实缺口”；先做 C 的基线，再按 `tasks.md` 06 转阻断 |

选 C 而不是 D 的原因：**先证明规则判得对，再让它拦人**。`--self-test` 与真实基线就是“判得对”的证据。

## 5. 影响与风险

- 影响面：`scripts/check-sdd.mjs`、`scripts/check-trace.mjs`（必需）；`scripts/README.md`、`specs/changes/README.md`、`docs/product/TRACEABILITY.md` 表头、`docs/product/ID-SPEC.md`（变更级 AC 与归档索引）、`docs/product/SPEC-GAP.md`（待修清单）（回填）；`.github/workflows/ci.yml`（接入，见 06）。`frontend/`、`backend/` 运行时代码零改动。
- 预期红灯：按现状首次运行会暴露大量缺 `tasks.md`/`test-plan.md`/`evidence.md` 的包、缺 `N/A：理由` 的包、AC 无 `Covers:` 的包。这是本变更的**目的**，不是回归。
- 解析误判风险：`N/A：`、`Covers:`、证据线索都靠文本约定；缓解是 `--self-test` 覆盖正反样例，误判时改脚本规则，不允许手改文档绕过。
- 治理变更追溯：本包无产品 PRD，按 Lead 裁决 Q1 写 `Implements: N/A：<≥8 字理由>`；check-trace 对治理变更放行并标注 `governance`，不按 `CHG-SYS-*` 前缀开白，也不得为让本包变绿而伪造 PRD。
- 回滚：脚本与文档均可按文件回滚；新增文件移入 `E:\dsh_home\trash\pending-delete\`，不就地删除；无数据/接口迁移，无运行时回滚成本。

## 6. 验收口径

- 以 `spec.md` §5 的 `AC-SYS-001-01` … `AC-SYS-001-06` 为唯一判定口径；每条都可被脚本或 `--self-test` 判定。
- `test-plan.md` 与 `evidence.md` 由测试/验收角色补齐；本提案不预填“通过”。
- 本包在补齐 `test-plan.md`/`evidence.md` 前，按 `AC-SYS-001-01` 自身也不达标——这是门禁生效的证据，不申请豁免。

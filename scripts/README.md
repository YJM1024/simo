# scripts/ · SDD 自动检查

> 本目录放**仓库级只读检查脚本**；不修改业务代码/文档，不写文件。
> 脚本零第三方依赖，使用仓库内置 Node（建议 `node scripts/check-sdd.mjs`）。

## check-sdd.mjs

最低 SDD 门禁：把“无 spec 不开工 / 有验收标准且可映射”变成可重复的自动检查。

```bash
# 在仓库根执行
node scripts/check-sdd.mjs

# 指定仓库根（默认取脚本上一级）
node scripts/check-sdd.mjs --root .

# 机器可读
node scripts/check-sdd.mjs --json
```

### 检查项

1. **每个 `specs/*/spec.md`**
   - 必须有非空「状态：」行；
   - 必须有「目标」章节；
   - 必须有「需求」章节，且含至少一个 `R` 编号（如 `R1`）；
   - 必须有「验收」章节，且含至少一个 `A` 编号（如 `A1`）；
   - 必须有「非目标」章节。
2. **A 编号可追溯**
   - 每个 A 编号必须出现在同目录 `test-plan.md` 或 `evidence.md` 中（按 `\bA<数字>\b` 精确匹配，避免 `A1` 误匹配 `A10`）。
3. **COMP-* 额外要求**
   - 必须有「验收」章节；
   - 必须有「影响范围」或「影响页面」章节。
4. **组件清单**
   - `frontend/src/components/manifest.json` 必须存在且 `components[]` 非空；
   - 每个组件必须有非空 `name`、`variants[]`、`states[]`/`state[]`；
   - 空 `states` 只告警（组件可能需要显式声明无状态变体）；重复 name / 缺字段算失败。

### 输出与退出码

- 默认输出：统计 + `[FAIL] 文件 — 原因` + `[WARN]` + `SUMMARY`；
- `--json` 输出 `{ok, root, stats, failures, warnings}`；
- **exit 0**：全部通过；**exit 1**：存在失败项；**exit 2**：无法读取 `specs/` 等前置错误。

### 当前基线（2026-11-12，首次运行，预期失败）

脚本首次运行用于暴露缺口；当前 **specs 11 个（COMP 3）/ A 编号 77 / 已映射 0 / manifest 32 组件**，共 **24 项失败、12 项告警**，退出码 1。主要缺口：

- COMP-* 三个 spec 均缺「目标」「需求」章节，且没有 `test-plan.md`/`evidence.md` → A 编号不可映射；
- FE-001 的 `test-plan.md`/`evidence.md` 未逐条引用 A 编号（A1–A12 无法映射）；
- FE-002 无 `test-plan.md`/`evidence.md`；
- FE-003/004/005/006 缺「非目标」；
- FE-004/005/006 的「验收」章节是 bullet 描述（无 A 编号）；
- FE-006 缺「目标」；
- FE-007 的「数据/接口需求」没有 R 编号，且无 test-plan/evidence；
- FE-008 缺「需求」章节（当前为接口契约/指标映射），且无 test-plan/evidence；
- manifest 中 Icon/Badge/Card/Empty/Skeleton/Section/SectionHeader/List/TaskItem/StatusDot/EmptyState/DeliverableItem 的 `states` 为空（告警，不阻塞）。

> 这些是**预期的文档缺口**，后续由各 spec owner 补齐；本脚本验收标准是“补齐后 exit 0”。

### 维护约定

- 新增 spec 时：先补「状态/目标/需求/验收/非目标」，再在 `test-plan.md` 或 `evidence.md` 为每个 A 编号写映射；
- 新增组件时：必须登记 `manifest.json` 的 `name/variants/states`；
- 脚本只读；不要把它改成自动修文档/写文件的工具。

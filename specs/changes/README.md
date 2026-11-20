# 变更包（Change）

> 任何新增 / 迭代 / 修复都开一个变更包；目录为 `specs/changes/<CHG-ID>/`。
> 规则见 `$DSH_HOME/rules/spec-workflow.md`；ID 格式见 [`../../docs/product/ID-SPEC.md`](../../docs/product/ID-SPEC.md)。

## 命名

`CHG-<DOMAIN>-<NNN>`，例如 `CHG-CONV-001`、`CHG-FILE-002`。

- `<DOMAIN>` 是技术域码：CONV/TASK/WORK/FILE/MEM/TEAM/SCHED/SET/TOOL/METRIC/SYNC/SYS；
- 编号在该域内单调递增，不复用、不回收；
- 历史 FE-001–FE-009 已映射为 `CHG-LEGACY-001` … `CHG-LEGACY-010`，不删除、不重命名。

## 目录

```text
specs/changes/CHG-<DOMAIN>-<NNN>/
  proposal.md      # 为什么做、做什么、不做什么、影响/风险/替代方案
  spec.md          # 本次行为变化 + AC；必须写 Implements: PRD-DOMAIN-NNN
  design.md        # 方案、状态/数据流、失败路径、权衡
  frontend.md      # 涉及 UI 时：组件/状态/交互/接口/异常
  backend.md       # 涉及 API/数据/权限/迁移时：契约/错误/权限/迁移/观测
  tasks.md         # owner/scope/依赖/AC/证据/回滚
  test-plan.md     # 用例→AC 映射、数据/mock、层级、证据
  evidence.md      # 命令、测试、截图、日志、验收记录
```

模板见 [`../templates/change-package.md`](../templates/change-package.md)。

## 当前状态

- 新建变更包：**0**；
- 历史 FE 变更（只读归档）：10 个，索引见 [`../README.md`](../README.md)；
- 不预建空目录；没有 `proposal.md` 与 `spec.md` 的目录视为无效变更包。

## 门禁

1. **先产品后变更**：先改 `specs/product/<域>/spec.md` 的 PRD/AC，再开变更包；无产品 spec 不开工。
2. **`Implements` 必填**：`spec.md` 第一段必须写 `Implements: PRD-...`；多个 PRD 用逗号分隔。
3. **六类产物**：产品 spec、前端开发 spec、后端开发 spec、组件 spec（如适用）、任务卡、测试 spec；不涉及写 `N/A + 理由`。
4. **测试同步**：用例归并到 `specs/test/<域>/test-plan.md`，本包 `test-plan.md` 保留执行细节；证据缺失写 `missing`。
5. **不改行为**：只开 change、不改产品 spec；**改行为**：产品 spec 与 change 的 `spec.md` 必须同步。
6. **完成后归档**：`evidence.md` 完整、追溯矩阵更新；不得只改代码不写证据。

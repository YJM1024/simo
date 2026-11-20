# 通用规范快照（仓库内）

> 状态：**可移植快照**（2026-11-20）
> 本目录把全局通用规范复制进仓库，保证换一台机器、换一个会话也能读到同一份规则。
> **canonical（唯一权威）在 `$DSH_HOME/rules/`**：
> - `$DSH_HOME/rules/spec-workflow.md`
> - `$DSH_HOME/rules/agent-development.md`
> 本目录文件是逐字快照；若与全局文件不一致，以全局 canonical 为准，并在同一天重新复制、提交。

## 1. 文件

| 文件 | 内容 | 性质 |
|---|---|---|
| [`spec-workflow.md`](spec-workflow.md) | 规格驱动工作流：产品域/变更包/前后端/组件/测试分层、六类产物、G0–G6 门禁、追溯、DoD | 通用规范，不绑定本项目 |
| [`agent-development.md`](agent-development.md) | Agent 开发规范：角色/交接、任务卡、设计先行、前端质量、后端契约、测试与证据、验收 | 通用规范，不绑定本项目 |

## 2. 边界（必须遵守）

- 这两个文件是**通用规范**：不写项目名、具体需求编号、端口、文件路径、组件名，也不把某种技术栈写成硬性要求。
- 项目特定的产品树、PRD、change 包、域测试计划、验收记录，放在本仓库：
  - [`../../product/TREE.md`](../../product/TREE.md)
  - [`../../product/TRACEABILITY.md`](../../product/TRACEABILITY.md)
  - [`../../product/ID-SPEC.md`](../../product/ID-SPEC.md)
  - [`../../product/SPEC-GAP.md`](../../product/SPEC-GAP.md)
  - [`../../../specs/README.md`](../../../specs/README.md)
  - [`../../tasks/STATUS.md`](../../tasks/STATUS.md) / [`../../tasks/acceptance.md`](../../tasks/acceptance.md)
- 不在本目录放 `pdf.md` 或其他与软件交付无关的全局规则；本目录只收与 spec/开发/测试/验收直接相关的通用规范。
- 不直接编辑快照来“改规则”：先改 `$DSH_HOME/rules/` canonical，再复制回来并提交，避免仓库与全局分叉。

## 3. 同步方法

```powershell
Copy-Item "$env:DSH_HOME\rules\spec-workflow.md"     docs\process\standards\spec-workflow.md -Force
Copy-Item "$env:DSH_HOME\rules\agent-development.md" docs\process\standards\agent-development.md -Force
```

复制后校验 SHA256 一致，并在提交说明中注明“standards snapshot sync”。

## 4. 适用顺序

1. 先读全局 canonical（若可访问）；
2. 再读本目录快照（离线/换机时）；
3. 最后读项目 `docs/product/` 与 `specs/` 的具体规则；项目规则只能在通用规范之上**加严**，不能放宽通用底线（无 spec 不开工、测试必须有证据、实现者不得自签）。

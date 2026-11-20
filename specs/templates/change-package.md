# 变更包模板（`specs/changes/<CHG-ID>/`）

> 模板：复制为 `specs/changes/CHG-<DOMAIN>-NNN/` 下的实际文件；目录不存在时先在本文件确认模板，不预建空变更包。
> 规则见 `$DSH_HOME/rules/spec-workflow.md`；ID 见 [`../../docs/product/ID-SPEC.md`](../../docs/product/ID-SPEC.md)。

## 0. 文件清单

| 文件 | 何时需要 | 作用 |
|---|---|---|
| `proposal.md` | 全部 | 为什么做、做什么、不做什么、影响、风险、替代方案 |
| `spec.md` | 全部 | 本次行为变化与验收标准；必须写 `Implements: PRD-...` |
| `design.md` | 全部 | 方案、数据/状态流、失败路径、权衡 |
| `frontend.md` | 涉及 UI / 前端交互 | 组件、状态、交互、接口、异常、可访问性 |
| `backend.md` | 涉及 API / 数据 / 权限 / 迁移 | 接口、数据、错误、权限、迁移、观测 |
| `tasks.md` | 全部 | 任务卡：owner/scope/依赖/AC/证据/回滚 |
| `test-plan.md` | 全部 | 用例→AC 映射、数据/mock、层级、证据 |
| `evidence.md` | 实现后 | 命令、测试、截图、日志、验收记录 |

> 轻量变更（文案、样式微调、无行为变化的小修复）至少要 `proposal.md`、`spec.md`、`tasks.md`、`test-plan.md`、`evidence.md`；`design.md`、`frontend.md`、`backend.md` 可写 `N/A + 理由`，字段不能缺。

## 1. proposal.md

```md
# <CHG-ID> · <变更标题>

状态：draft
Implements: <PRD-DOMAIN-NNN>
关联 PRD：...
关联组件：...
关联历史 spec：...

## 背景与问题
## 目标
## 非目标
## 用户场景
## 影响范围（页面/接口/数据/权限/兼容）
## 风险与回滚
## 备选方案与取舍
## 验收方式
```

## 2. spec.md

```md
# <CHG-ID> · 行为规格

状态：draft
Implements: <PRD-DOMAIN-NNN>

## 1. 行为变化
- 变更前：
- 变更后：
- 边界/异常：
- 权限/隔离：
- 不改变的行为：

## 2. 验收标准
- A1 ...
- A2 ...

## 3. 非目标
## 4. 依赖
```

> `spec.md` 只写本次变化；长期产品事实写回 `specs/product/<域>/spec.md` 对应 PRD。改行为必须同步产品 spec；不改行为只留 change。

## 3. design.md

```md
# <CHG-ID> · 设计

## 方案
## 数据/状态流
## 接口与契约
## 失败与恢复
## 安全/权限
## 性能/兼容
## 关键权衡与放弃的方案
```

## 4. frontend.md

```md
# <CHG-ID> · 前端开发 spec

## 组件与文件
## 状态（loading/empty/error/partial/ready）
## 交互与键盘
## 接口与数据映射
## 异常与降级
## 可访问性（focus/aria/对比度/点击目标）
## 响应式（窄屏/375）
## 测试点与证据
```

## 5. backend.md

```md
# <CHG-ID> · 后端开发 spec

## 接口（方法/路径/请求/响应/状态码）
## 数据模型与迁移
## 错误码与错误语义
## 权限与隔离
## 幂等/并发/重试
## 观测（日志/指标/审计）
## 兼容与回滚
## 测试点与证据
```

## 6. tasks.md

```md
# <CHG-ID> · 任务卡

| # | 任务 | owner | scope（文件/目录） | 依赖 | AC | 证据 | 状态 |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | todo |
```

> 每个任务必须写清 owner/scope/AC/证据；实现者不得自签，验收由独立验收角色完成。

## 7. test-plan.md

```md
# <CHG-ID> · 测试计划

## 用例→AC 映射
| 用例 ID | 对应 AC/PRD | 前置 | 步骤 | 断言 | 层级 | 证据 |
|---|---|---|---|---|---|---|

## 数据与 mock
## 未执行/跳过
## 发布门禁
```

> 用例最终归并到 `specs/test/<域>/test-plan.md`；本文件保留本次变更的执行细节。

## 8. evidence.md

```md
# <CHG-ID> · 证据

| 项 | 命令/链接 | 结果 | 日期 | 执行人 |
|---|---|---|---|---|
| 构建 | | | | |
| 单元/组件 | | | | |
| 集成/E2E | | | | |
| 视觉 | | | | |
| 验收 | | | | |
```

## 9. 合并前检查

- [ ] `Implements` 指向真实 PRD，PRD 已更新或明确“仅变更、不改产品行为”；
- [ ] 六类产物齐全，N/A 有理由；
- [ ] 产品 spec、域 test-plan、TRACEABILITY 已同步；
- [ ] 任务卡 owner/scope/AC/证据齐全；
- [ ] 测试证据可复现，未执行写 `missing`；
- [ ] 回滚方案可执行；
- [ ] 组件 spec / parity 门禁（如涉及组件）通过。

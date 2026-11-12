# SKILL · spec-driven

## 何时使用

- 需求已批准，进入实现前；
- 需要把需求拆成可验证 AC、设计、任务、测试证据；
- 任何新功能/组件/迁移/较大 bugfix（可按规模合并文件，但内容不可省）。

不用于：纯文档/无运行时变更（可走轻量流程，但仍留验收）；紧急事故先止血（见 SCENARIOS 事故）。

## 输入

- 已确认的 pitch/需求/用户原话；
- 现有契约（`docs/session-core-spec.md`、`docs/session-spec.md`、`DESIGN.md`）；
- 影响面/依赖/风险。

## 步骤

1. **proposal**：为什么改、范围、非目标、替代方案、影响页面/契约；
2. **spec**：R/MUST-SHOULD 编号；每条 AC 用 Given/When/Then；每条 AC 必须映射断言；
3. **design**：DOM/接口/数据/时序/错误/回滚/兼容；写权衡；
4. **tasks**：T 编号、owner、写作用域、依赖、验收、可并行/串行；
5. **test-plan**：风险清单、分层、截图矩阵、交互/边界/错误；
6. **evidence**：命令、截图路径、DOM/请求测量、测试报告；
7. **门禁自检**：Spec Ready → Approved → Design Ready → Tasks Ready；未过不开发。

## 产物

```text
specs/<CHANGE-ID>/
  proposal.md
  spec.md
  design.md
  tasks.md
  test-plan.md
  evidence.md
```

- 小改可合并文件，但必须保留：范围/非目标、AC、任务/owner、证据；
- 组件变更按 [`component-gallery`](../component-gallery/SKILL.md) 额外登记。

## 检查表

- [ ] 每条 AC 至少一个可执行断言/证据；
- [ ] 有显式非目标与失败路径；
- [ ] 设计含错误/边界/回滚/兼容；
- [ ] 任务有 owner/scope/依赖；
- [ ] 测试计划覆盖正常/边界/错误/权限/回归；
- [ ] 没有“实现时再想”的关键决策。

## 反模式

- 先写代码再补 spec；
- AC 不可验证（“流畅/稳定/体验好”）；
- 只有 happy path；没有非目标导致范围膨胀；
- tasks 只写“前端/后端”不写 scope/依赖；
- evidence 只贴“已通过”没有命令/路径。

## 示例

```md
R1 (MUST): 时间轴按会话分组。
A1: Given 两条消息属于不同会话
    When 渲染时间轴
    Then 两组之间有 6px gap，且当前组正常 opacity。
断言: 组件测试断言 groupGap=6/opacity=1；截图 1600 标注。
```

## 链接

- 框架：[`FRAMEWORK.md`](../../FRAMEWORK.md) §2
- 场景：[`SCENARIOS.md`](../../SCENARIOS.md) 新功能/组件/迁移
- 上游：[`pitch-writing`](../pitch-writing/SKILL.md)
- 下游：[`testing-strategy`](../testing-strategy/SKILL.md)

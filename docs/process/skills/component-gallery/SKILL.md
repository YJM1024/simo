# SKILL · component-gallery

## 何时使用

- 新增组件，或修改组件 API/variant/视觉/交互；
- 页面需要现有组件无法表达的展示；
- 需要证明“组件已登记、状态完整、页面没有定制 CSS”。

不用于：页面布局微调（优先现有组件）；一次性页面私有块（应提升为组件或证明例外）。

## 输入

- COMP spec（语义/API/状态/tokens/使用场景）；
- `DESIGN.md` 与 token 单一来源；
- 截图档位（如 1600/1180/375，按场景可加 1920）；
- 依赖组件/可访问性要求。

## 步骤

1. **先找组合/变体**：现有组件能否组合/扩展？能则不新建；
2. **登记**：`specs/COMP-<NNN>-<slug>/` 最小集（proposal/spec/design/tasks/test-plan/evidence）；
3. **画廊条目**：名称、分组、variant/state、tokens、owner、版本、验收状态；
4. **状态与截图**：default/hover/focus/active/disabled/loading（按组件）、三态、窄屏；
5. **a11y**：键盘、焦点、名称、对比度、reduced-motion；
6. **页面采用**：只有登记后页面才能引用；页面只组合，不复制组件；
7. **回归**：旧页面/旧 variant 迁移；更新 manifest/截图。

## 产物

- 组件 spec + 画廊条目 + 截图基线 + 证据；
- 组件 API/变体变更记录与迁移任务；
- 页面无定制 CSS 的检查结果。

## 检查表

- [ ] 已登记，有 owner/版本/验收状态；
- [ ] 所有 variant/state 有展示或明确不适用；
- [ ] tokens 无硬编码；无页面级 CSS/inline；
- [ ] 键盘/焦点/aria/对比度通过；
- [ ] 三档（必要时四档）截图与 DOM 证据；
- [ ] 旧用法迁移/回归通过。

## 反模式

- 页面内先写一次性组件再“以后补”；
- 只登记默认态，漏 error/disabled/loading；
- 组件改样式不更新画廊/截图；
- 页面用 `!important`/class 覆盖组件；
- 把组件库做成展示站点，脱离真实页面验收。

## 示例

> 新组件 ConversationPanel：先写 COMP spec（白卡/灰底/居中/Composer 同宽/标签/右栏基线），再建画廊 `ready/empty/loading/error` + 1600/1920/1180/375 截图；manifest 记录 v1/owner；页面只 import，不写 border-radius/width。

## 链接

- 框架：[`FRAMEWORK.md`](../../FRAMEWORK.md) §4
- 组件流程：[`component-system.md`](../../component-system.md) §6.8
- 场景：[`SCENARIOS.md`](../../SCENARIOS.md) 组件
- 下游：[`frontend-implementation`](../frontend-implementation/SKILL.md)

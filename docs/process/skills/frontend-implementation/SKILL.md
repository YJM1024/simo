# SKILL · frontend-implementation

## 何时使用

- 设计/组件 spec 已批准，需要把页面或组件实现为真实前端；
- 需要接 API/WS、处理状态/响应式/可访问性；
- 需要证明页面没有定制 CSS、没有绕开组件库。

不用于：设计探索/原型未确认；组件 API 未定；后端契约未定（先走 `backend-contract`/`spec-driven`）。

## 输入

- 已批准的 spec/design/组件画廊条目；
- `DESIGN.md`、tokens 单一来源、原型截图；
- API 契约/数据形态；目标档位（1600/1180/375 等）。

## 步骤

1. **组件先行**：确认所需组件已登记；缺组件先走 `component-gallery`，不在页面临时造；
2. **布局**：页面只做 shell/三栏/居中/断点；不写颜色/边框/圆角/字号/阴影；
3. **数据**：API 客户端/WS 接入；loading/empty/error/streaming 三态齐全，不伪造；
4. **交互**：键盘、焦点、Esc、hover/active/disabled；失败保留状态，不乐观伪造；
5. **视觉**：只用 tokens；不写 inline style/页面 CSS；不复制组件；
6. **证据**：tsc/build、截图（含浮层/窄屏）、DOM 检查、关键交互录制/断言；
7. **回归**：旧页面/旧组件用法无回归；更新 REVIEW/evidence。

## 产物

- 页面/组件实现 + 接入代码；
- tsc/build/测试结果；截图与 DOM 证据；
- `evidence.md`：命令、路径、关键测量（如 gap/opacity/宽度）；
- 页面无定制 CSS 的检查记录。

## 检查表

- [ ] 页面只 import 已登记组件；
- [ ] 无 `<style>`/inline style/页面级 CSS/`!important`；
- [ ] 三态 + 流式/失败/空数据真实；
- [ ] 键盘/焦点/名称/对比度/reduced-motion；
- [ ] 1600/1180/375（必要时 1920）无破版；
- [ ] tsc/build/回归通过；截图可复现。

## 反模式

- 页面里写一次性 `<div>` + 自定义视觉；
- 用假数据/假 loading 冒充已接；
- 失败时乐观更新或掩盖错误；
- 为单页改全局 token/组件；
- 只测桌面，不测窄屏/键盘。

## 示例

> 实现 ConversationPanel：页面只组合 Header + ConversationPanel + Composer；宽度/居中/边框来自组件/tokens；用 CSS 测量验证白卡中心与中栏中心 ≤1px、Composer x/width/right ≤1px；截图 1600/1920/1180/375。

## 链接

- 框架：[`FRAMEWORK.md`](../../FRAMEWORK.md) §3.2
- 场景：[`SCENARIOS.md`](../../SCENARIOS.md) 新功能/组件
- 上游：[`component-gallery`](../component-gallery/SKILL.md)
- 下游：[`testing-strategy`](../testing-strategy/SKILL.md)

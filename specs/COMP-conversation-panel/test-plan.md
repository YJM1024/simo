# COMP-conversation-panel · 测试计划

> 状态（2026-11-21）：组件**已实现并接入页面**（`frontend/src/app.tsx:663` 使用 `ConversationPanel`，`library.tsx:671-687` 为实现），契约已按现状契约化（见 `spec.md` §0），其中 `CardBlock` 双层白框为**已知缺陷**（A5 记为缺陷跟踪，不计通过）。以下为实测计划；未跑的项不得写通过。截图早于当前源码（`components.css` 2026-11-21 20:29），**全部截图待重拍**。

| A | 场景 | 证据/状态 |
|---|---|---|
| A1 | 1600 灰底 + 消息卡白底 | 待重拍：组件画廊 + 截图（未签收） |
| A2 | 1180 居中/gutter | 待重拍：DOM 测量中心差 ≤1px |
| A3 | 375 左右 8/无圆角/无裁切 | 待重拍：375 截图（`frontend/review/` 无 768 档，375 已有但过期） |
| A4 | 消息卡：白底/1px line/r10/宽 680 | 待重拍：DOM computed style |
| A5 | CardBlock 双层白框 | **已知缺陷**：截图 + DOM 记录双层边框（卡片 1px + 卡片内卡 1px）；记缺陷不计通过，修法走新 CHG |
| A6 | Composer 与消息卡同宽/间距 | 待重拍：x/width/right ≤1px（Composer 宽 = 卡宽 − 40） |
| A7 | empty/loading/error 三态 | 待重拍：画廊三态（loading 用 `LoadingState`） |
| A8 | 长会话仅消息区滚动 | 待重拍：滚动容器测量（`.conversation-scroll`） |
| A9 | 页面无定制 CSS/内联尺寸 | 待重拍：页面源码扫描 |
| A10 | 画廊/回归 | 待重拍：manifest 登记 + 截图 + 旧组件回归 |
| A11 | 1600/1920/1180/375 居中 | 待重拍：DOM 中心差 ≤1px；375 左右 8 |
| A12 | Composer 与消息卡 x/width/right | 待重拍：≤1px（以消息卡为基准，不按老白卡列） |
| A13 | 标签/右栏基线 | 待重拍：Header 标签左基线与消息卡内容左基线 ≤1px；右栏任务标题与卡顶 12px 基线 ≤1px |

## 退出标准

- A1–A13 均有实测证据；A5 作为已知缺陷单列，须有缺陷记录链接；
- 所有截图晚于 `components.css` / `library.tsx` 的 mtime；
- 未跑项标“未覆盖/豁免”，不得写“通过”。

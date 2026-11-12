# 组件级 Parity 对比（1600 / 375，签字版 build `mwdrj27e-3vsey`）

- 日期：2026-11-13
- expected：`frontend/prototype/message-cards.html`（冻结原型）
- current：build `mwdrj27e-3vsey`（8898 静态 + 8787 API/数据；主会话）
- 视口：1600×1000、1280×1000、1180×1000、375×812；DPR2；主会话；窗口与对话滚动置顶
- 结论：**通过（可部署）**。1600/1280/1180 必修项与 375 三项均在容差内；已批准豁免项保留。

## 产物

- 全页：`expected-1600.png` / `current-1600.png` / `expected-375.png` / `current-375.png`
- 合成：`component-parity-1600.png` / `component-parity-375.png`
- 单组件并排：`1600/<组件>-compare.png`、`375/<组件>-compare.png`
- `raw/`（历史全页/DOM 证据）；card-block 首屏被 Composer 覆盖，组件图另滚动裁切
- 说明：需求清单实际列 11 个组件（原文称 12），本表逐项覆盖。

## 必修项复验

| 项 | 结果 | 证据 |
|---|---|---|
| timeline 1600 | **通过** | x358 / w44 / right402；card x430；gap **28**；timeline 在 chat-body 内 |
| timeline 1280 | **通过** | x260 / right304；card x312；gap **8** |
| timeline 1180 | **通过** | x248 / right292；card x300；gap **8** |
| timeline 375 | **通过** | expected/current 均 `display:none` |
| 1600 msg | **通过** | x430 / w680；padding **12×14**（与 expected 一致） |
| 1600 card-block | **通过** | x481 / w614；padding **14×16**（与 expected 一致） |
| 1600 composer | **通过** | x430 / w680（padding/高度为已批准豁免） |
| 375 message | **通过** | x**8** / w**359**；padding **10×12** |
| 375 Composer | **通过** | x**8** / w**359** |
| 375 CardBlock | **通过** | x**57** / w**297**；padding **12** |
| 375 chat-inner | **通过** | padding **12px 0**（timeline 隐藏后不保留左 gutter）；无横向溢出（375/375） |
| topbar | **通过** | gear 已恢复，title=设置，`.icon-btn` 1 个，无新增图标 |

## 已批准豁免（不计阻断）

- context 无重命名/置顶/归档
- 右栏 status/revision/待确认行
- Composer 左 padding 14px / 高度变化
- 数据/文案/条数差异（sidebar、消息内容、卡片内容、右栏任务、timeline bars 数量）

## 判定

- 1600：timeline 与 padding 保持，gap28；未回退。
- 1280/1180：timeline gap8，位于列内。
- 375：message/Composer x8 w359、CardBlock x57 w297，chat-inner padding12 0；与冻结原型一致。
- 未发现组件级错位/风格漂移；批准豁免项保留。
- **Gate：通过。可随分类标签 build 一起部署。**

**备注**：全页图与组件图均基于当前 build `mwdrj27e-3vsey`；8787 仍运行旧 build `mwdqyg05-famq9`，部署后需再核对线上 build-id。

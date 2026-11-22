# COMP-timeline-groups · 测试计划

> 状态（2026-11-21）：组件已实现并接入页面（`frontend/src/app.tsx:676`）；`spec.md` 已按实现与 Lead 裁决修订（active=`--timeline-selected`、组级 `.55`、阶段 1 无日期分组）。原签字记录（`docs/tasks/acceptance.md:373-386`）写于页面切换前，`:384` 称"App 仍用旧 Timeline"与实现不符，**该证据不可直接引用**；截图早于当前源码，**待重拍**。

| A | 场景 | 证据/状态 |
|---|---|---|
| A1 | 四档 44 rail/无裁切 | 待重拍：1600/1920/1180/375。**注意**：`components.css:885` 在 `≤93.75em`(1500px) 即隐藏轴，1180 档实测看不到轴——按页面层已知偏差记录，不计组件失败 |
| A2 | 角色可辨/无新色 | 待复验：`--timeline-user`/`--timeline-agent` 两 token，无新增角色色（`components.css:963-964`） |
| A3 | 当前 active | 待复验：`--timeline-selected` 宽 24 + `aria-current`（`components.css:965`）；**原"黑色/祖先 active opacity 1"作废** |
| A4 | 上级组 .55 | 待复验：祖先组整组 `opacity:.55`（`components.css:922`），**组内 active 同样被压暗、不额外提亮**；tooltip 不透明 |
| A5 | 组 gap 6 / 日期分组 | 待复验：切换会话 gap 6px（`components.css:920`）；**阶段 1 无日期分组，不检查日期层**（v2 候选） |
| A6 | 分类仅 Tooltip | 待复验：aria-label 不含分类；分类只出现在 tip 文本（`library.tsx:508`） |
| A7 | hover/focus/点击/键盘 | 待复验：点击/←→/Home/End/Enter 跳转、焦点不丢；**命中区 44×44 已实测**（`.tl-bar` rect 24×4 / hit 44×44，`docs/testing/20261121-123009-after-metrics.json`，coarse 指针；`components.css:1022-1026`） |
| A8 | 滚动/edge | 待复验：滚动时 tip 跟随不消失；首尾/组边 tick 不裁切 |
| A9 | Tooltip 内容 | 待复验：发送方/会话/（分类）/时间 + 两行摘要 |
| A10 | 无原生 title/rail 无文字 | 待复验：tick 无 `title`；44px rail 内无文字节点 |

## 退出标准

- A1–A10 均有晚于源码的截图/DOM 证据；A7 的命中区缺口单列；
- 不再以旧签字记录作为通过依据；未跑项标“未覆盖”，不得写“通过”。

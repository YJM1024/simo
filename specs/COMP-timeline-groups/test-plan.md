# COMP-timeline-groups · 测试计划

> 组件已签字；证据见 `docs/tasks/acceptance.md`「TimelineGroups 返工后复验」。active 覆盖规则待最新 spec 复验时确认。

| A | 场景 | 证据/状态 |
|---|---|---|
| A1 | 四档 44 rail/无裁切 | acceptance：1600/1920/1180/375；以签字 build 为准 |
| A2 | 角色可辨/无新色 | acceptance：user/agent token、无新色 |
| A3 | 当前 active/祖先 active opacity:1 | acceptance：active 24/黑；**祖先 active 覆盖需复验** |
| A4 | 上级 .55 | acceptance：祖先 .55（非 active）；active 例外 1 |
| A5 | 组 gap6/日期分组 | acceptance：R1 6px；日期分组 |
| A6 | 分类仅 Tooltip | acceptance：aria 不含分类；分类仅 tip |
| A7 | hover/focus/点击/键盘 | acceptance：点击/Enter/焦点 |
| A8 | 滚动/edge | acceptance：滚动/首尾 clamp |
| A9 | Tooltip 内容 | 计划：发送方/会话/时间 + 分类 |
| A10 | 无原生 title/rail 无文字 | acceptance：tick title 0；rail 无文字 |

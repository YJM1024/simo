# COMP-timeline-tip · 测试计划

> 证据见 `docs/tasks/acceptance.md`「COMP-timeline-tip · 8787 线上 smoke」；组件已实现并线上闭环。

| A | 场景 | 证据/状态 |
|---|---|---|
| A1 | hover 可见/样式 | acceptance：236×75、surface/line/radius/shadow |
| A2 | focus/aria-describedby | acceptance：focus 显示；无 title（tick title 0） |
| A3 | 滚动跟随 | acceptance：滚动 smoke；不消失 |
| A4 | 移出/Esc/blur | acceptance：切换/Esc smoke |
| A5 | 视口/edge clamp | 计划：边缘 tick clamp；组件实现待复验 |
| A6 | 内容/两行摘要 | acceptance：预览文本；长文本截断 |
| A7 | 不可点击/不抢焦点 | 计划：pointer-events none；焦点保持 |
| A8 | DPR2 三档/画廊 | 计划：1600/1180/375 截图 + gallery |

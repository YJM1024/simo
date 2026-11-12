# FE-007 · 测试计划

> 映射到 `docs/tasks/acceptance.md`「FE-007 实机验收结果」与「FE-007 祖先消息 · 独立验收预检」；未覆盖不写通过。

| A | 场景 | 证据/状态 |
|---|---|---|
| A1 | 默认仅当前会话 | 实机验收：默认态通过（以固定 build 为准） |
| A2 | scope=all/pagination:false | acceptance：后端契约已验；前端整组 prepend 待对照 |
| A3 | 逐级到根 | acceptance：三级链验收；root 按钮态 |
| A4 | 切会话重置 | acceptance：切换清空祖先链 |
| A5 | 时间轴覆盖/祖先 .55 | acceptance：时间轴/祖先 opacity/组 gap |
| A6 | data-message-id 锚定 | acceptance：锚定偏移 ≤1px 实测 |
| A7 | 滚动条稳定 | acceptance：容器/范围稳定实测 |
| A8 | 错误/空/重复/413 | acceptance：413/空/重试项；按固定 build 复验 |
| A9 | 权限/纯度 | acceptance：跨会话/无 system；归档只读 |
| A10 | 三档/键盘/CSS | acceptance：1600/1180/375、按钮/时间轴键盘、无页面 CSS |

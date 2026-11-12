# COMP-message-colors · 测试计划

> 映射到 `docs/tasks/acceptance.md`「分类标签修复」与 TimelineGroups 签字节；未覆盖不写通过。

| A | 场景 | 证据/状态 |
|---|---|---|
| A1 | 四类标签 | acceptance「分类标签修复」：agent 16/16 带标签（示例进度/澄清）；四类完整矩阵待补样 |
| A2 | 空回退 | acceptance：空 category 回退代码已覆盖，live 无空样本；待隔离夹具 |
| A3 | user 无标签 | acceptance：user 标签 0（1600/1280/375） |
| A4 | 时间轴三色/选中 | TimelineGroups 签字：user/agent/active 24；最终三色 token 待组件复验 |
| A5 | 祖先 .55 | TimelineGroups 签字：祖先 .55；active 覆盖 1 |
| A6 | hover 24 | 计划：hover 同角色色/24；待组件状态截图 |
| A7 | 对比度 | 本 spec 实测：6.32/5.24/5.47/5.50；标签文字可读 |
| A8 | 无硬编码/回归 | 计划：token 扫描、画廊/三档、console 0；待实现后验收 |

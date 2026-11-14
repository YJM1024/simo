# COMP-composer-send-mode · 测试计划

> 当前未实现；以下为验收计划，未跑不得写通过。

| A | 场景 | 验证方式 | 证据/状态 |
|---|---|---|---|
| A1 | 默认快捷键 | 输入文本按 Enter / Shift+Enter；检查消息数与内容 | 待实现：键盘事件/消息 id |
| A2 | 反转快捷键 | 切换后重复 Enter / Shift+Enter；检查互换 | 待实现：消息数/换行内容 |
| A3 | 始终发送 | 两种模式下按 Ctrl/Cmd+Enter；检查发送/无额外换行 | 待实现：键盘事件/消息 |
| A4 | IME | 组词中按 Enter/Shift/Ctrl；检查不发送/不切换；compositionend | 待实现：composition 事件/消息数 |
| A5 | 提示区 | hover/focus 显示；移出/失焦隐藏；测量 20px 槽/2px 间距/高度不变；文案精确为 `Enter 发送，Shift+Enter 换行` / `Enter 换行，Shift+Enter 发送`（中文逗号） | 待实现：DOM/rect/截图 |
| A6 | 切换语义 | 点击/Enter/Space；检查 aria-pressed/aria-label/焦点 | 待实现：DOM/a11y |
| A7 | 持久化/多标签 | 刷新恢复；非法值；双标签 BroadcastChannel/storage；无回环 | 待实现：localStorage/事件日志 |
| A8 | 375/回归 | 375 focus 显示；无横向溢出；Composer 高度/按钮/失败重试 | 待实现：三档截图/console |

## 退出标准

- A1–A8 均有实测证据；未跑项标“未覆盖/豁免”；
- 输入区显示/隐藏提示前后高度差 0；375 无横向滚动；
- console error 0。

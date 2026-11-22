# COMP-composer-send-mode · 测试计划

> 状态（2026-11-21 更正）：组件**已实现并有签字与线上 smoke**——`docs/tasks/acceptance.md:1109-1122`（2026-11-14 签字，build `mwfzyf8u-h9f0d`，A1–A8 通过，A5 间距实测 2px）、`:1124-1133`（8787 线上 smoke 通过并已部署）。原"当前未实现"表述作废。截图早于当前源码（`library.tsx` 2026-11-21 20:20），**截图待重拍**。未跑的项不得写通过。

| A | 场景 | 验证方式 | 证据/状态 |
|---|---|---|---|
| A1 | 默认快捷键 | 输入文本按 Enter / Shift+Enter；检查消息数与内容 | 已签字（`acceptance.md:1109-1122`）；待重拍截图 |
| A2 | 反转快捷键 | 切换后重复 Enter / Shift+Enter；检查互换 | 已签字，同上 |
| A3 | 始终发送 | 两种模式下按 Ctrl/Cmd+Enter；检查发送/无额外换行 | 已签字，同上 |
| A4 | IME | 组词中按 Enter/Shift/Ctrl；检查不发送/不切换；compositionend；**compositionend 后 50ms 内 Enter 不发送** | 已签字；**50ms 抑制窗口为 2026-11-21 新补契约，需新增实测**（`library.tsx:569-578`） |
| A5 | 提示区 | hover/focus 显示；移出/失焦隐藏；测量 20px 槽/2px 间距/高度不变；文案精确为 `Enter 发送，Shift+Enter 换行` / `Enter 换行，Shift+Enter 发送`（中文逗号） | 已签字（2px 实测）；待重拍截图 |
| A6 | 切换语义 | 点击/Enter/Space；检查 aria-pressed/aria-label/焦点 | 已签字；线上 smoke 见 `:1124-1133` |
| A7 | 持久化/多标签 | 刷新恢复；非法值；双标签 BroadcastChannel/storage；无回环；**旧 key `simo.composer.send-mode`（值 `enter-send`/`enter-newline`）映射为 `enter`/`shift-enter`、写新 key 并删旧 key，一次且不广播；新 key 优先** | 已签字（`shift-enter`）；**旧 key 迁移为 2026-11-21 新补契约，需新增实测**（`library.tsx:518-529`） |
| A8 | 375/回归 | 375 focus 显示；无横向溢出；Composer 高度/按钮/失败重试 | 已签字（`scrollWidth==innerWidth`）；待重拍 |

## 退出标准

- A1–A8 均有实测证据；A4/A7 新增的两条契约（50ms 抑制、旧 key 迁移）须各有实测；
- 输入区显示/隐藏提示前后高度差 0；375 无横向滚动；
- console error 0；截图晚于 `library.tsx` mtime。

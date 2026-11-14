# COMP-composer-send-mode · Composer 发送方式

状态：**spec ready（待实现/待验收；只文档，不改代码）**
Owner：前端（实现）/ 产品（交互口径）/ 验收
范围：Composer 输入区的发送/换行快捷键、发送方式切换提示、持久化与多标签同步。
视觉基线：`DESIGN.md`；相关组件：`Composer`、`Button/IconButton`、`Tooltip`。

## 1. 目标

让用户明确选择发送方式：默认 **Enter 发送 / Shift+Enter 换行**；可切换为 **Enter 换行 / Shift+Enter 发送**；**Ctrl/Cmd+Enter 始终发送**。切换在输入区提示区完成，不因隐藏/显示提示造成布局跳动；选择本地持久化并跨同源标签同步；IME 组词期间绝不误发/误切换。

## 2. 非目标

- 不改 Composer 高度、输入区布局、发送按钮位置、附件/命令面板；
- 不做自定义快捷键编辑（只切换这一对）；
- 不做跨账号/跨 `SIMO_HOME` 同步；
- 不改消息发送/流式/失败重试语义；
- 不新增移动端专用发送模式。

## 3. 术语

- **默认模式 `enter`**：Enter=发送，Shift+Enter=换行；
- **反转模式 `shift-enter`**：Enter=换行，Shift+Enter=发送；
- **始终发送**：Ctrl+Enter（Windows/Linux）/ Cmd+Enter（macOS）不受模式影响；
- **提示区**：Composer 内显示当前发送方式/切换入口的 20px 槽（默认隐藏，不占布局变化）。

## 4. 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 默认 `enter`：Enter 发送；Shift+Enter 插入换行；不发送 |
| R2 | MUST | 切换为 `shift-enter` 后反过来：Enter 换行；Shift+Enter 发送 |
| R3 | MUST | Ctrl/Cmd+Enter 在两种模式下都发送，行为一致 |
| R4 | MUST | IME composing 期间不发送、不切换；compositionend 后不补发误发 |
| R5 | MUST | 提示区 hover/focus 显示，移出/失焦消失；20px 槽始终保留，不造成布局跳动；图标与提示间距 2px |
| R6 | MUST | 点击或 Enter/Space 可切换；`aria-pressed` 表示当前是否反转；`aria-label` 说明当前模式/动作 |
| R7 | MUST | 选择存 `localStorage`，刷新恢复；同源多标签经 BroadcastChannel（storage 兜底）同步；非法值回退默认 |
| R8 | MUST | 375 下 focus 显示提示不溢出；不改变 Composer 既有高度/按钮布局 |

## 5. 快捷键行为矩阵

| 模式 | Enter | Shift+Enter | Ctrl/Cmd+Enter |
|---|---|---|---|
| `enter`（默认） | **发送** | 换行 | **发送** |
| `shift-enter`（反转） | 换行 | **发送** | **发送** |

规则：

- 空输入/纯空白：按发送不产生空消息（沿用现有发送门禁）；
- 发送失败保留输入（沿用现有失败重试）；
- 多行输入中 Enter 发送/换行按模式执行；
- Ctrl/Cmd+Enter 不受模式切换影响，始终发送；
- 不因模式切换清空草稿/滚动位置。

## 6. IME 组词

- `compositionstart` 后进入 composing；`compositionend` 结束；
- composing 期间：Enter/Shift+Enter/Ctrl/Cmd+Enter **都不发送、不切换模式**；键盘事件不触发切换按钮；
- `compositionend` 本身不发送、不切换；
- 浏览器在 compositionend 后补发 Enter 的，必须被抑制（不得“选词回车直接发消息”）；
- 组词中提示区可保持现状，但不得抢焦点/切换。

## 7. 提示区与切换控件

- 位置：Composer 内固定 20px 高的提示/工具槽；默认隐藏（`visibility/opacity`），但槽位始终占 20px，**不因显示/隐藏改变输入区高度/发送按钮位置**；
- hover（指针进入 Composer 提示区）或 focus-within（键盘进入）显示；鼠标移出/失焦消失；
- 图标 16px（线性），与提示文字/相邻控件间距 **2px**；提示文案随模式变化：
  - `enter`：`Enter 发送，Shift+Enter 换行`
  - `shift-enter`：`Enter 换行，Shift+Enter 发送`
- 切换控件是 button，可点击、可 Enter/Space 触发；`aria-pressed="true"` 表示当前为反转模式，`false` 为默认；
- `aria-label` 动态示例：`切换发送方式，当前 Enter 发送；按下后改为 Shift+Enter 发送`；
- 提示区不可用时（禁用 Composer）：不显示切换控件/不响应快捷键；
- 不显示原生 title；提示文字本身可读，图标不是唯一信息。

## 8. 持久化与多标签

- key：`simo.composer.sendMode`，值仅 `enter` / `shift-enter`；
- 初始化：读取 localStorage；缺失/非法 → `enter`，不写脏值；
- 切换：先本地更新 UI，再写 localStorage，再广播；
- 多标签：优先 `BroadcastChannel('simo.composer.sendMode.v1')`；不支持时监听 `storage` 事件兜底；
- 接收方应用收到的值，不再回广播（防环）；同值幂等；
- 无 localStorage（隐私模式/异常）→ 仅当前标签内存态，提示不写持久化；不阻塞发送；
- 多标签冲突：last-write-wins（同一 key）；收到旧值不回退版本；以最新写入为准；
- 不把发送模式写入服务端/会话数据。

## 9. 状态与布局

| 状态 | 表现 |
|---|---|
| default | 提示区隐藏但 20px 槽保留；输入区高度不变 |
| hover/focus-within | 显示 2px 间距图标 + 模式提示；可点击/Enter/Space 切换 |
| toggled | 文案/`aria-pressed`/快捷键行为立即更新；不重排 Composer |
| composing | 不响应 Enter 发送/切换；提示不抢焦点 |
| 375 | focus-within 显示提示；文字省略/缩小间距但图标 2px 不变；不横向溢出 |
| disabled | 不显示/不响应切换；不改变现有禁用样式 |
| preference-unavailable | 内存态生效，提示“未保存”；发送仍可用 |

## 10. 影响范围

- **Composer**：键盘处理、20px 提示槽、切换控件、IME 处理；
- **设置/本地偏好**：localStorage key、BroadcastChannel/storage 同步；
- **多标签**：与 FE-009 同源标签同步机制一致，但只同步发送模式；
- **不影响**：消息发送/流式/失败重试、卡片、附件、命令面板、页面布局。

## 11. 验收标准 A1–A8

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 默认快捷键 | Enter 发送；Shift+Enter 换行且不发送；空输入不产生消息 |
| A2 | 反转快捷键 | 切换后 Enter 换行；Shift+Enter 发送；与默认模式互斥 |
| A3 | 始终发送 | Ctrl/Cmd+Enter 在默认/反转模式都发送；不额外插入换行 |
| A4 | IME | composing 中 Enter/Shift+Enter/Ctrl/Cmd 均不发送/不切换；compositionend 不误发 |
| A5 | 提示区 | hover/focus 显示，移出/失焦消失；2px 间距；20px 槽保留；显示/隐藏不造成布局跳动；文案精确为 `Enter 发送，Shift+Enter 换行` / `Enter 换行，Shift+Enter 发送`（中文逗号） |
| A6 | 切换语义 | 点击/Enter/Space 可切换；`aria-pressed`/`aria-label` 正确；键盘焦点可见 |
| A7 | 持久化/多标签 | 刷新恢复；localStorage 非法值回退；两标签同步；无回环/无旧值覆盖新值 |
| A8 | 375/回归 | focus 显示不溢出；无横向滚动；Composer 高度/按钮布局/发送失败重试不回归；console 0 |

## 12. 待确认

1. `Shift+Enter` 在反转模式下发送时，是否允许修饰键组合（如 Ctrl+Shift+Enter）——本 spec 只定义单修饰；
2. 多标签冲突以最后写入为准，是否需要“当前标签优先”提示（本版不做）；
3. 提示文案在 375 是否只显示图标 + 短标签（本版允许省略文案，图标 2px 间距不变）；
4. 发送方式是否进入设置页（本版只在 Composer 提示区）。

---

*本文件只定义组件 spec，不改代码；实现前需确认 Composer 现有键盘/IME 事件边界。*

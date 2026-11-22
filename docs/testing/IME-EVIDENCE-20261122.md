# IME 真机验证证据（AC-CONV-006-02）

- 环境：http://127.0.0.1:8787（会话「主会话」id=main，基线 36 条用户消息 / 77 条总消息）；Chrome 157 CDP 127.0.0.1:9223，仅使用本次 `json/new` 创建的 target。
- 方法：`Input.imeSetComposition` 造组合，`Input.dispatchKeyEvent` 发 Enter，`Input.insertText` 提交；每步用 `Runtime.evaluate` 读 `textarea.value`、`.msg.from-user` 数、`.msg` 总数与末条正文。

| 验证点 | 动作 | 观察值 | 判定 |
|---|---|---|---|
| 1 组合文本显示且不发送 | `imeSetComposition({text:"nihao"})` | value 由 `""` 变 `"nihao"`；userCount 36、total 77 均不变；事件序列 compositionstart→compositionupdate→beforeinput→input | pass |
| 2 组合期间 Enter 不发送 | 组合 `nihao` 时 keyDown+keyUp Enter（key/code=Enter，VK=13） | keydown `isComposing=true`、keyCode 13；value 仍为 `"nihao"`；userCount 36、total 77 不变 | pass |
| 3 提交中文无拼音残留 | `imeSetComposition({text:"你好"})` 后 `Input.insertText({text:"你好"})` | value 精确为 `"你好"`，无 `nihao`/`ni hao` 残留；compositionend 后 userCount 仍 36 | pass |
| 4 点发送恰好 +1 且正文正确 | 点击 `.composer button.send`（非 disabled） | userCount 36→37（恰好 +1）；末条用户正文 `"你好"`；输入框清空；本轮后智能体返回失败回复 1 条 | pass |
| 5 连续两句不粘不重复 | 连续 IME 提交「第一句」「第二句」并各点一次发送，中间未手动清空 | 37→38→39，每次 +1；末两条依次 `["你好","第一句"]`、`["第一句","第二句"]`，无合并/重复 | pass |

- 截图：`docs/testing/ime-compose-20261122.png`（组合态 `nihao`，输入框与时间线）、`docs/testing/ime-timeline-20261122.png`（「第一句」「第二句」及失败回复）。
- 新增消息：会话「主会话」（main）共 +6 条 = 3 条用户消息（`你好`、`第一句`、`第二句`）+ 3 条智能体回复；三次回复均因后端生成失败显示「回复生成失败，未返回内容。」，会话总数 77→83。除此之外未发送其他消息。
- 说明：验证脚本首次尝试误点了页面中其他 `.send` 按钮（disabled 的「确认」），未产生消息（36/77 不变），已改用 `.composer button.send` 重测；五个验证点均有实测证据，无失败或未取到的步骤。

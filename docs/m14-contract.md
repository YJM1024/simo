# M14 实现契约：消息标签 + 会话路径 + 时间轴预览

> 前置：M13 已交付。目标：让用户一眼看出"每条消息是什么、属于哪个会话"，并能从时间轴预览消息。

## 1. 消息分类（仅 agent 消息）

| category | 中文 | 判定 |
|---|---|---|
| `requirement` | 需求提出 | 用户提出/修改需求（NewTask/Correct），秘书确认并开始处理（decision ANSWER/DELEGATE） |
| `clarification` | 需求澄清 | 秘书需要讨论/确认需求（decision CLARIFY） |
| `progress` | 进度汇报 | 任务做到一半的进展汇报、任务完成后的汇报，都归此类 |
| `consultation` | 信息咨询 | 纯信息问答，不涉及改动（其余 ANSWER/Ack） |
| 空 | 未分类 | 旧消息/系统消息；前端不显示分类徽标 |

- **user 消息**：`category` 留空（前端只显示会话标签）。
- **判定由模型完成**（用户要求：不用规则判定，规则不准）：system prompt 要求模型在回复**第一行**输出机器标记
  `@@CATEGORY: requirement|clarification|progress|consultation`，随后空行写正文；
  后端解析并把该行**从正文剥离**（用户看不到），持久化 `category`；流式输出时先缓冲首行再继续。
- 标记缺失/非法 → 回退 `consultation`（信息咨询），不阻塞回复、不报错。
- 历史消息：不重新判定，**全部旧 agent 消息统一记为 `consultation`（信息咨询）**；user 消息留空。

## 2. 会话路径（sessionPath）

- 消息响应增加 `sessionPath: [{id,title}]`，**从根到当前**（主会话 › 子会话 › 孙会话）。
- 计算：沿 `parent_id` 向上回溯到根，反转；防环/限深（≤16）。
- 加入 `GET /api/messages`、`GET /api/messages?includeChildren`、WS `message.created`/`reply.created`。
- 单条消息的 `sessionTitle` 保留（兼容）。

## 3. 消息头标签（前端）

- 位置：消息气泡上方/开头一行，先分类后会话：
  - 分类徽标（仅 agent）：需求提出 / 需求澄清 / 任务交付 / 信息咨询；颜色区分（accent/warn/ok/muted）；
  - 会话路径徽标：`主会话 › 子会话`（超过 3 级折叠中间为 `…`）；点击可跳转到对应会话；
- user 消息：只显示会话路径 + 时间。
- 未分类：不显示徽标，不留空位。

## 4. 时间轴预览（前端）

- 每个 tick：悬停（hover）即显示预览卡片，点击跳转+保持选中；
- 预览内容：角色、分类徽标（agent）、会话路径、时间、**消息摘要（≤120 字，按词截断）**；
- tick 颜色按角色/分类区分（user=accent，delivery=ok，clarification=warn，requirement=accent-strong，consultation=muted）；
- 键盘可达：tick 可 Tab 聚焦，Enter 跳转；预览卡片可关闭；
- 长会话折叠、当前视口高亮保持。

## 5. API / 数据

- `Message` 增 `category string`、`sessionPath []SessionPathItem`（`{id,title}`）。
- 迁移：chat v10 `ALTER TABLE messages ADD COLUMN category TEXT`。
- 测试：标记解析（4 类）、缺失/非法回退 consultation、标记从正文剥离、历史全部 consultation、sessionPath 多级/防环。

## 6. 验收（M14）

1. 提需求 → 秘书首条回复标「需求提出」；秘书追问 → 「需求澄清」；任务完成 → 「任务交付」；纯问答 → 「信息咨询」；
2. 主会话 › 子会话 › 孙会话中的消息，会话标签显示完整多级路径，点击可跳转；
3. 时间轴悬停显示预览（角色/分类/路径/摘要），点击跳转；
4. 旧消息无分类时不显示徽标；历史任务汇报回填 delivery；
5. `go vet/test`、`tsc`、构建、M1–M13 evals 全绿 + M14 新 case。

## 7. 边界

- 不做用户消息分类；不做手动改分类（后续可选）；
- 分类为规则判定，不额外调用模型（省 token）；误判可通过后续规则迭代修正。

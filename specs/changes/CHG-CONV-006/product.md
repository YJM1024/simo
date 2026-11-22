# CHG-CONV-006 · 会话域收口：产品对齐

状态：**draft**（2026-11-21；口径为“默认裁决”，用户可在 spec review 推翻）
Implements: `PRD-CONV-001`–`PRD-CONV-008`、`PRD-SYNC-001`–`PRD-SYNC-004`（12 个；`PRD-SYNC-005` 排除）
产品 spec 落点：[`specs/product/P1-CONV/spec.md`](../../product/P1-CONV/spec.md)

## 1. 验收面

- **纳入 12 个**：CONV-001/002/003/004/005/006/007/008、SYNC-001/002/003/004。
- **排除 1 个**：SYNC-005（远程访问与通知中心），保持 `unimplemented` + `gap`，不计入本轮通过面。
- **出口预期**：本轮结束时 12 个目标 `covered` + `SYNC-005` 仍 `gap`（12 覆盖 / 0 partial / 1 gap）。**当前状态以证据为准**：**0 covered / 11 partial / 1 gap**（基线 pass 17 / partial 9 / missing 6 / blocked 2，以 `specs/test/P1-CONV/test-plan.md` 为准），待 acceptance 回填；`AC-CONV-002-02` 重试断言待回填，未回填不得宣称闭环。
- 脚注：删除会话、子会话移动均为**显式非目标**，不计入缺口；删除 backlog 为 `REQ-CONV-002-03`，移动后续新开 CHG 定义迁移。

## 2. 12 个功能点逐条对齐

> “AC 增量”只写**本轮新增或修订**的 AC；“无新增”表示 AC 不动，只补证据与六类产物。
> “落点”指长期产品 spec 的具体节；编号一律追加，不重排、不改已发布 AC 的含义。

| 功能点 | 场景 | P | 现状（2026-11-21） | AC 增量 | 长期产品 spec 落点 |
|---|---|---|---|---|---|
| `PRD-CONV-001` 会话树与主会话 | A 导航与生命周期 | P0 | 树/选中/新建/重命名有组件+集成+API+E2E 证据；**主会话不可归档守卫已存在**（`spec.go:297-301`，409 `main_session_protected`）；pin 后端有、UI 本轮补 | **`AC-CONV-001-03`**：主会话不可归档（守卫已存在；补 unarchive main 200 no-op 与前端禁用证据）；**`AC-CONV-001-04`**：pin 入口本轮交付（会话行菜单置顶/取消置顶；主会话、草稿、归档不提供；置顶只影响同级分组内顺序，不改变父子归属、不提升到顶层，同级内排序以后端返回为准）；`AC-CONV-001-02` 删去“主会话归档无断言”的缺口句 | §4.1 `PRD-CONV-001` 目标行为 + AC-03/04 |
| `PRD-CONV-002` 会话生命周期 | A 生命周期 | P0 | 归档/恢复/草稿/失败回退有证据；草稿为服务端内存态，**刷新后草稿行消失属预期**；`toggleArchive`/`rename` 已加 `try/catch` + `setOpError`；**DELETE 路由固定 403，UI 无入口** | 删除会话移出本 PRD 验收面（显式非目标，backlog `REQ-CONV-002-03`，不计入缺口）；`AC-CONV-002-02` 的重试去重断言待 W2 回填 | §2.1 非目标 + §4.1 `PRD-CONV-002` 剩余 AC（无删除 AC） |
| `PRD-CONV-003` 会话搜索与未读 | B 搜索与未读 | P1 | 前端仍走消息搜索（`app.tsx:359-370`）；标题搜索后端已实现（`management.go:12-45`） | **新增 `AC-CONV-003-03`**：标题搜索 P1（`q`，跨全部会话含子会话）为主；消息正文搜索降 P2、不在本阶段验收；`AC-CONV-003-02` 的未读部分改指向持久化游标 SYNC-004 | §4.1 `PRD-CONV-003` 目标行为 1–4 + AC-03 |
| `PRD-CONV-004` 消息流与渲染 | C 消息渲染 | P0 | 18/18 + API + E2E；消息纯度只有散落的后端证据 | **新增 `AC-CONV-004-03`**：消息纯度（system/internal 不进流与接口、不可编辑）；`AC-CONV-004-02` 删去“无独立 AC”缺口句 | §4.2 `PRD-CONV-004` AC-03 |
| `PRD-CONV-005` 发送·流式·重连 | D 输入与发送 | P0 | 发送/流式/失败/防重复有证据；`clientMutationId` 后端 0 处理、停止未验真中断、无 close→open | 无新增 AC；补幂等、真实中断、重连三组证据 | §4.3 不改 AC；证据进 test-plan |
| `PRD-CONV-006` Composer 输入 | D 输入与发送 | P0 | 10/10 + 5 条新增；真实中文 IME 未手测；COMP 未签收 | 无新增 AC；补 IME 手测与 COMP 签收 | §4.3 不改 AC |
| `PRD-CONV-007` 祖先消息整级加载 | C 消息渲染 | P1 | 组件/集成/API/E2E 有证据；413/403 仅 mock、≥44px 无断言、未部署 | 无新增 AC；补真机 413/403、点击目标尺寸、部署验证 | §4.2 不改 AC |
| `PRD-CONV-008` 右栏会话投影（**新增**） | F 右栏投影 | P1 | 已有 `OverviewPanel` + `RightPanel.test.tsx` 6 条 + 后端 projection + E2E 01a/06，但**无 PRD/AC** | **新增 `AC-CONV-008-01`（三组主路径）/`AC-CONV-008-02`（任务组与交付物）/`AC-CONV-008-03`（四态与窄屏）/`AC-CONV-008-04`（契约与缓存）** | §4.5 全新 `PRD-CONV-008` |
| `PRD-SYNC-001` WS 连接与重连 | E 实时同步 | P0 | 后端顺序/since/fanout/恢复有证据；前端无 close→open；`since` 保留窗口未定义 | 无新增 AC；补前端重连用例 + 定义保留窗口 | §4.4 不改 AC |
| `PRD-SYNC-002` 多标签 active/ancestor/read | E 多标签 | P0 | 代码存在，**零自动化测试**；`opId` 未去重 | 无新增 AC；补双标签用例与 opId 去重断言 | §4.4 不改 AC |
| `PRD-SYNC-003` 发送模式跨标签同步 | E 多标签 | P1 | 单标签持久化有测试；跨标签零测试、降级未验 | 无新增 AC；补 BroadcastChannel/storage 双通道与降级用例 | §4.4 不改 AC |
| `PRD-SYNC-004` 未读与已读游标 | B/E 未读 | P1 | 仅 `app.tsx` 内存条数按钮；无后端、无持久化、口径未定 | **`AC-SYNC-004-01..03`**：会话级持久化读游标（进入即已读、不做全站数字/条数、任一标签已读即全标签已读、刷新/重启保留、通知中心另立项）；重写目标行为 1–5；**需新增后端游标表/接口，属本阶段新增能力，不是收口** | §4.4 `PRD-SYNC-004` |

**状态变化预期**（改造前 → 本包出口）：

| 功能点 | 前 | 后（预期） | 关键动作 |
|---|---|---|---|
| CONV-001 | implemented / partial | implemented / **covered** | 补 AC-03 + 切换中栏 E2E；AC-04 本轮交付（菜单置顶/取消置顶，同级内排序） |
| CONV-002 | implemented / partial | implemented / **covered** | 删除移出验收面（显式非目标，backlog）；补失败反馈重试去重证据 |
| CONV-003 | partial / partial | implemented / **covered** | UI 切标题搜索 + 补证据；消息正文搜索降 P2 |
| CONV-004 | implemented / partial | implemented / **covered** | 升 AC-03 + COMP 签收 |
| CONV-005 | implemented / partial | implemented / **covered** | 幂等/中断/重连证据 |
| CONV-006 | implemented / partial | implemented / **covered** | 真实 IME + COMP 签收 |
| CONV-007 | implemented / partial | implemented / **covered** | 真机 413/403 + 部署 |
| CONV-008 | （无 PRD） | implemented / **covered** | 新建 PRD + 用例映射 |
| SYNC-001 | implemented / partial | implemented / **covered** | 重连用例 + since 窗口 |
| SYNC-002 | implemented / partial | implemented / **covered** | 双标签用例 + opId |
| SYNC-003 | implemented / partial | implemented / **covered** | 跨标签用例 |
| SYNC-004 | partial / partial | implemented / **covered** | 持久化读游标（新增后端表/接口） |
| SYNC-005 | unimplemented / gap | unimplemented / **gap** | 不纳入（保持） |

## 3. 六条产品口径（默认裁决，用户可在 spec review 推翻）

> 每一条都标明“裁决内容 / 落点 / 影响 / 推翻成本”。默认不等于已确认；spec review 是推翻窗口。

### P1 · 搜索 = 标题搜索

- **裁决**：P1 的“会话搜索”只指**标题搜索**，走 `GET /api/sessions?q=`，`title LIKE` 匹配，**跨全部会话（含子会话）**，结果由服务端返回，前端不伪造；UI 从 `/api/messages/search?q=` 切到该接口（本地标题过滤保留为即时输入反馈）。现有**消息搜索降为 P2**，仍可用但不计入 P1 验收；**全局正文搜索进 backlog**。
- **落点**：`AC-CONV-003-03`；`PRD-CONV-003` 目标行为 1–4；`PRD-CONV-003` 优先级保持 P1。
- **影响**：`frontend/src/app.tsx:359-370` 的搜索实现要改；`Sidebar` 的 `searchIds` 语义改为“标题命中会话 id 集合”。
- **推翻成本**：若改回消息搜索，AC-03 作废、`TestUI1SessionSearchAndPin` 失去产品意义，SYNC-004 的未读入口也要重定；成本高于保留标题搜索。

### P2 · 未读 = 会话级持久化读游标

- **裁决**：未读是**会话级有/无标记**（不是条数、不是全站数字）；**进入会话即已读**；不做全站未读汇总；**同一会话任一标签已读，即全标签已读**；**持久化**：刷新/重启后仍能正确显示未读，不因刷新丢失或复活；**通知中心另立项**，不与未读同源。
- **落点**：`AC-SYNC-004-01..03`（主路径、边界、后端游标）；`PRD-SYNC-004` 目标行为重写；`AC-CONV-003-02` 的未读边界同步改指向该游标。
- **影响**：`app.tsx` 的 `unread` 数字改为会话级布尔徽标；`Sidebar` 会话行增加未读点（无数字）；跨标签继续用 `read_cursor_changed` 广播，但**新增后端读游标表与接口**（进入即写已读、启动/刷新读回），属本阶段新增能力，不是收口。
- **推翻成本**：若退回纯内存态，需撤掉后端表/接口与刷新/重启用例；但用户已明确选择“持久化，刷新后仍保留”，本包按持久化落。

### P3 · 删除会话（显式非目标，backlog）

- **裁决**：用户裁决“会话暂时不允许删除，只允许归档”。删除会话**移出 CONV-002 验收面**，不再是本 PRD 的 AC；本阶段不提供删除 UI，不实现确认令牌/二次确认/级联。后端存在 `DELETE /api/sessions/{id}` 路由，但当前仓库实现固定 403 `R4_CONFIRM_REQUIRED`（`http.go:68-69`），这是**保护性占位**，不是“待补功能”；UI 不暴露。
- **落点**：`specs/product/P1-CONV/spec.md` §2.1「删除会话（显式非目标）」+ backlog `REQ-CONV-002-03`（非 AC）；`PRD-CONV-002` 的验收面只保留剩余 AC（重命名/归档/恢复失败反馈、主会话保护、归档列表），全绿即 `covered`。
- **影响**：本包不改删除相关代码与测试；`TASK-CHG-CONV-006-12` 标 `parked`（backlog，不派发）；对外不宣称“删除可用”；删除不计入缺口。
- **后续入口**：新开 CHG（删除会话与级联），重新定义确认令牌、主会话拒绝、子会话级联、事务与回滚，再决定是否进 P1；在此之前只保留归档。

### P4 · pin 入口进 UI（本轮验收面）

- **裁决**：pin 的 UI 入口进本轮验收面；`AC-CONV-001-04` 保留并写明“会话行菜单提供置顶/取消置顶；主会话与草稿会话不提供；置顶只影响同级分组内顺序，不改变父子归属、不提升到顶层，同级内排序以后端返回为准；同级唯一子会话无兄弟可比，行序不变属预期”。前端契约以 `specs/frontend/P1-CONV/spec.md` §2.3 L118–133 与 C-17 为准；后端 `POST /api/sessions/{id}/pin|unpin` 与 `pinned` 排序保留。
- **落点**：`AC-CONV-001-04`（现状 `missing`，本轮实现）；`PRD-CONV-001` 目标行为与 §6 状态说明同步；TREE 覆盖回写按 12 covered 目标处理。
- **影响**：本轮需加 Sidebar 菜单项、`pinSession`/`unpinSession` 接线、服务端排序重拉与测试；占用 W4 前端工时，不改后端契约。
- **推翻成本**：若移出本轮，需撤回 `AC-CONV-001-04` 与本轮相关证据，恢复 P2 登记；会与前端 spec C-17 及 Lead 裁决冲突，不建议。

### P5 · 右栏“会话投影”= 新增 `PRD-CONV-008`（P1）

- **裁决**：右栏“会话投影”（目标/输入/状态三组，含任务组、交付物只读列表）不再以 CONV-004 “渲染一致性”近似覆盖，**新增 `PRD-CONV-008`**，P1；新增 L2“右栏会话投影”。
- **落点**：spec §4.5 全新 PRD + `AC-CONV-008-01..04`；TREE P1 增加一行、L2 4→5。
- **影响**：`docs/product/TREE.md` 域总览与 P1 表；`TRACEABILITY` 增加 008；`specs/test/P1-CONV/test-plan.md` 增 TC；`RightPanel.test.tsx` 6 条与 `m75`/`m87` 作为证据。
- **推翻成本**：若不新增 PRD，右栏投影继续处于“页面可见但无 AC”的缺口，A8“每 AC 有证据”无法解释这块；撤 PRD 需回退 TREE/TRACEABILITY。

### P6 · 两条隐性要求升为正式 AC

- **裁决**：`AC-CONV-001-03` 主会话不可归档；`AC-CONV-004-03` 消息纯度。两条此前只存在于“缺口/风险”叙述里，没有可判定断言，本轮升为 AC。
- **落点**：§4.1 `PRD-CONV-001`、§4.2 `PRD-CONV-004`；均追加编号，不改 01/02 的含义。
- **影响**：主会话不可归档守卫已存在（`spec.go:297-301`）；本轮补 `unarchive main` 200 no-op 与前端菜单禁用证据；消息纯度主要是把已有后端证据固化为 AC，不改实现。
- **推翻成本**：主会话若回退为可归档，需删除守卫与 AC-03，并改回两处旧断言；会与用户裁决冲突，不建议。

## 4. 两条隐性要求的正式化

1. **主会话不可归档 → `AC-CONV-001-03`**
   - 原文只在 `AC-CONV-001-02` 的“缺”里出现，无法判定、无法映射用例。
   - 现状：`spec.go:297-301` 已在 `Archive` 中拒绝 `main`，`http.go:334-345` 输出 409 `main_session_protected`；`m81_all_messages_test.go:85` 已断言 409，`App.conversation.test.tsx:107-120` 仍按“归档 main 成功”的旧行为断言，需改写。
   - 因此这条不是“补一句 AC”，而是**改测试断言、补 unarchive main 200 no-op 证据、再判覆盖**；W4 单列一张卡。
2. **消息纯度 → `AC-CONV-004-03`**
   - 原文散落在 `AC-CONV-004-02` 的证据列表里，没有独立断言。
   - 已有后端证据（`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM78ManualInternalTextRejected`、`TestM79LegacyInternalMessagesHiddenFromAPI`、`TestM50MessageEditingDisabled`），本轮固化为独立 AC，不改实现。

## 5. 不改动清单

- 不改 `P2`–`P10` 任何 spec、TREE 其它域、`docs/process/*`。
- 不删除、不移动任何文件；不 commit/push。
- 不把 `SYNC-005` 拉进本轮；不新建通知中心/远程访问设计。
- 不新增消息搜索的产品能力（正文搜索降 P2）；未读按本阶段新增能力实现（新增后端读游标表与接口）；pin UI 按 `AC-CONV-001-04` 本轮实现；不实现删除 UI（显式非目标，backlog `REQ-CONV-002-03`）；不实现子会话移动/换父（显式非目标）。

## 6. 待确认（不阻塞本轮落盘，但需在 review 时给答案）

1. **8787 走查签字人**：功能由验收 Agent 签，视觉由用户签；用户是否接受“同一人跑完 A1–A8 + 三档截图”作为一次走查？
2. **删除的确认形态（已搁置）**：用户裁决本阶段不删除；后续新 CHG 再定二次确认/令牌形态，本包不阻塞。
3. **CONV-008 的边界**：右栏“交付物”只读列表归 008 还是 P4-FILE？本包按“投影呈现归 008、下载/预览能力归 P4”切分，需 P4 owner 确认不重叠。
4. **设计列内容来源**：五列中的设计列此前为空，是否接受“按功能点写交互/状态/尺寸约束”，而不是重画视觉稿？
5. **COMP 签收 owner**：5 个 COMP 的签收由设计 owner 还是前端 owner 签字？跨 owner 时谁对“实现偏离 spec”做最终裁决？

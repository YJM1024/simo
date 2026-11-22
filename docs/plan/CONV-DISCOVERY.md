# CONV-DISCOVERY · 会话域现状盘点与功能点草案

> 状态：**draft（只读盘点，未改代码 / spec / 测试 / 部署）**
> 日期：2026-11-21 ｜ 角色：产品（`paint-discovery`）｜ 阶段：阶段 1（会话域 = "绘画"）
> 口径来源：`docs/plan/MASTER-PLAN.md:11-18`（「绘画」= 会话（CONV），用户 2026-11-21 定案）、`:80-86`（阶段 1 范围与出口条件）
> 上游证据：`specs/product/P1-CONV/spec.md`、`specs/test/P1-CONV/test-plan.md`、`docs/product/{TRACEABILITY,CONV-CLOSURE,TREE}.md`
> **诚实口径**：本文件不重跑测试、不启动 8787、不做双标签实测；所有 PASS 数字引自上述文档记录（`specs/test/P1-CONV/test-plan.md:8-13`），未在本次会话复现。凡未验证处一律写"未验证"。

---

## 0. 先读：7 条关键结论

1. **12 个 PRD 全部"有实现、无覆盖"**：覆盖口径 **0 covered / 11 partial / 1 gap**（`docs/product/CONV-CLOSURE.md:13`、`docs/product/TRACEABILITY.md:46`），`implemented` 只表示"可运行 + 部分证据"（`specs/product/P1-CONV/spec.md:285`）。
2. **用例判定 4 pass / 9 partial / 2 missing（共 15 条）**（`specs/test/P1-CONV/test-plan.md:3`），2 条 missing 全在未读/远程（`test-plan.md:214,226`）。
3. **阶段 1 的真实工作量不在"从零开发"，而在"补证据 + 修 3 个缺陷 + 5 个 COMP 签收 + 8787 验证"**：缺口清单见 §4。
4. **两个功能性缺陷是产品可见的**：生命周期请求失败静默（`frontend/src/app.tsx:456-460`、`:536-539` 无 `try/catch`）；未读只有内存按钮计数、无徽标/无持久化（`frontend/src/app.tsx:220`、`:662`；`specs/changes/CHG-CONV-005/frontend.md:22`）。
5. **搜索语义与实现不一致**：产品写"标题搜索"（`specs/product/P1-CONV/spec.md:100`），UI 实际调消息搜索（`frontend/src/api.ts:136-137`）；后端标题搜索与 pin 已实现但 UI 未接线（`backend/internal/modules/sessions/management.go:12-13`、`:48-53`；`frontend/src/api.ts:28` 只取 `/api/sessions/tree`）。
6. **后端已有、UI 无入口的能力有 3 个**：删除会话（`backend/internal/modules/sessions/http.go:25`、`backend/internal/core/action/action.go:60`）、置顶（`sessions/management.go:48-53`）、标题搜索（`sessions/http.go:52-53`）。
7. **文档漂移 3 处必须随阶段 1 修正**：`docs/product/SPEC-GAP.md:50-54` 仍写"CONV 产品 spec 待建"（实际已建）；`docs/plan/MASTER-PLAN.md:82,105` 写"7 个 COMP 未签收"（实际 5 个，见 `specs/COMP-*/`）；`spec.md:89`、`test-plan.md:80` 引用的 `app.tsx:450/530` 已漂移到 `:456/:536`。

---

## 1. 会话域现状（12 个 PRD）

### 1.1 PRD 矩阵

列说明：**AC** = 该 PRD 的 AC 条数（每条 PRD 均为 2 条：主路径 + 异常/边界，合计 24 条，见 `spec.md:265`）；**实现** = `spec.md:269-282` 的实现状态；**覆盖** = `TRACEABILITY.md:63-74` 的覆盖判定。

| L3 | 一句话职责 | 主场景 | AC | 实现 | 覆盖 | 用例 | 一句话缺口（含证据） |
|---|---|---|---|---|---|---|---|
| `CONV-001` 会话树与主会话 | 左栏按 `GET /api/sessions/tree` 渲染主会话+子会话，点选/Enter 切换、双击重命名、重启保持 | 打开应用 → 选会话 → 重命名 | 2 | `implemented` | `partial` | `TC-P1-001` **pass** | 主会话不可归档无独立断言；"切换后中栏内容变化"无 E2E；pin 后端有 UI 无（`spec.md:71-72`、`test-plan.md:60`） |
| `CONV-002` 会话生命周期 | 新建→草稿懒物化→重命名→归档（只读）→恢复；失败要有可见反馈 | 归档聊完的会话、恢复继续聊 | 2 | `implemented` | `partial` | `TC-P1-002` **partial** | `rename`/`toggleArchive` 无 `try/catch` → 失败静默（`app.tsx:456-460`、`:536-539`）；前端无删除入口（`test-plan.md:80`） |
| `CONV-003` 会话搜索与未读 | 搜索框过滤会话（服务端命中 id），未读在"回到底部"按钮上计数 | 找上周的会话；等回复时滚上去 | 2 | `partial` | `partial` | `TC-P1-003` **partial** | 产品=标题搜索 / UI=当前会话消息搜索（`spec.md:100` vs `api.ts:136-137`）；未读无徽标/无持久化/无测试（`app.tsx:220,662`） |
| `CONV-004` 消息流与渲染 | 角色区分、分类标签、Markdown/代码块、复制（含降级）、流式/失败态、卡片只读 | 读回复、复制一段代码 | 2 | `implemented` | `partial` | `TC-P1-004` **pass** | `COMP-message-colors` 仍"approved 未实现"（`specs/COMP-message-colors/spec.md:3`）；消息纯度无独立 AC（`spec.md:124`） |
| `CONV-007` 祖先消息整级加载 | 子会话逐级加载祖先消息、弱化展示、时间轴跳转、413/403 降级 | 在子会话里看父会话上下文 | 2 | `implemented`（已签未部署） | `partial` | `TC-P1-005` **pass** | 时间轴点击目标 ≥44px 无断言；413/403 仅 mock；未部署验证（`test-plan.md:126`） |
| `CONV-005` 发送·流式·断线重连 | 发送 202 → WS delta/done → 停止 → 失败重试 → 断线退避重连 + `since` 续传 | 发一条消息、断网后继续 | 2 | `implemented` | `partial` | `TC-P1-006` **partial** | `clientMutationId` 后端 0 处理（幂等不成立）；停止未验真中断；无 close→open E2E（`test-plan.md:142`） |
| `CONV-006` Composer 输入与快捷键 | 两种发送模式 + Ctrl/⌘+Enter、IME 组合不误发、模式持久化 | 多行输入、中文输入 | 2 | `implemented` | `partial` | `TC-P1-007` **partial** | 真实中文 IME 未手测；`COMP-composer-send-mode` 未签收；后端仅到请求校验（`test-plan.md:157`） |
| `SYNC-001` WS 连接与重连 | 连接三态可见、seq 有序、多客户端 fanout、归档错误帧、残留流式恢复 | 断线自动恢复 | 2 | `implemented` | `partial` | `TC-P1-008` **partial** | 无断网 e2e replay、断连 UI 无端到端断言、`since` 保留窗口未定义（`test-plan.md:172`） |
| `SYNC-002` 多标签 active/ancestor/read cursor | BroadcastChannel 广播 active/祖先链/已读游标，带 `at`+tabId tiebreak | 开第二个标签 | 2 | `implemented` | `partial` | `TC-P1-009` **partial** | 无真实双 target/跨进程矩阵；`opId` 未用于去重；未读通道依赖 SYNC-004（`test-plan.md:188`） |
| `SYNC-003` 发送模式/设置跨标签 | sendMode 写 localStorage + 双通道（BC/storage）同步 | 两个标签换发送模式 | 2 | `implemented` | `partial` | `TC-P1-010` **partial** | 跨标签单测与降级路径无测试（`test-plan.md:203`） |
| `SYNC-004` 未读与已读游标 | 会话未读条数、进入清零、徽标、持久化、多标签一致 | 看到哪个会话有新消息 | 2 | `partial` | `partial` | `TC-P1-011` **missing** | 无后端（`grep unread/read_cursor` 0 匹配，`CHG-CONV-005/spec.md:39`）；口径 6 问未答；`CHG-CONV-005` 全 blocked |
| `SYNC-005` 远程访问与通知中心 | 远程访问 + 通知中心（仅登记） | — | 2（占位） | `unimplemented` | **`gap`** | `TC-P1-012` **missing** | 无鉴权/设备/通知模型，与"本机单用户无鉴权"基线冲突；**已由用户排除出阶段 1**（`MASTER-PLAN.md:81,145`） |

**合计**：24 条 AC；0 covered / 11 partial / 1 gap；15 条用例 = 4 pass / 9 partial / 2 missing；测试基线 前端 115 / 后端 246 / CDP E2E 19（`test-plan.md:9-11`、`CONV-CLOSURE.md:12`）。

### 1.2 页面可见能力面（现状核验，含本次亲自读码的结论）

| 能力 | 现状 | 证据 |
|---|---|---|
| 左栏会话树（缩进/父链/active 高亮/连接与配额/统计占位） | **已实现** | `frontend/src/components/library.tsx:50-149`、`spec.md:63-69` |
| 会话菜单（仅"归档/恢复"） | **已实现，无删除/置顶** | `library.tsx:110`（菜单只有一条） |
| 搜索框（placeholder「搜索会话、消息…」） | **已实现，但语义是"标题前缀匹配 + 当前会话消息命中 id"** | `library.tsx:130-145`（`:114-115` 过滤逻辑） |
| 搜索接线 | **只调消息搜索，不调 `/api/sessions?q=`** | `app.tsx:360-367`、`api.ts:136-137`；`api.ts:28` 仅 `tree` |
| 未读计数 | **仅内存 + 一个"回到底部 · N 条新消息"按钮** | `app.tsx:220`（累加）、`app.tsx:662`（按钮）、`CHG-CONV-005/frontend.md:22` |
| 时间轴（一消息一 bar、点击/键盘跳转、tooltip） | **已实现** | `library.tsx:432+`（`TimelineGroups`）、`spec.md:135` |
| Composer（发送模式/IME/停止/失败保留） | **已实现** | `library.tsx:509+`、`spec.md:168-172` |
| 消息渲染（文本/Markdown/代码/分类/卡片只读） | **已实现** | `library.tsx:176-215`（`MessageItem`） |
| 生命周期失败反馈 | **缺陷：静默失败** | `app.tsx:456-460`、`:536-539`；另 `:449-454` 卡片提交同理无 `catch` |
| 删除会话入口 | **缺失（后端有）** | `sessions/http.go:25`、`action.go:60`（R4 破坏性） |
| 置顶入口 | **缺失（后端有排序/过滤）** | `sessions/management.go:48-53`、`sessions/http.go:41-53` |
| 右栏会话投影（目标/输入/状态） | **页面可见，但 12 个 PRD 无对应 PRD/AC** | `library.tsx:811`（`RightPanel`）、`CONV-CLOSURE.md:80` |
| 组件 spec 签收 | **5 个 COMP 全部未与实现对齐** | `specs/COMP-conversation-panel/spec.md:3`、`specs/COMP-message-colors/spec.md:3`、`specs/COMP-timeline-groups/spec.md:3`、`specs/COMP-timeline-tip/spec.md:3`、`specs/COMP-composer-send-mode/spec.md:3` |

---

## 2. 用户可见场景清单（15 条）

按"用户想干什么"写，不按代码模块写。**空态/失败态/多标签**均单列。

| # | 用户想干什么 | 现状 | 对应 PRD | 证据 |
|---|---|---|---|---|
| S1 | 第一次打开，看到上次聊到哪了；新用户看到干净的"暂无会话"并可立即新建 | 可用；空态有三种文案（暂无会话/无匹配/搜索中） | CONV-001/002 | `library.tsx:145`、`ConversationPanel.test.tsx`、CDP 08 |
| S2 | 点开一个会话继续聊，不串上一个会话的消息 | 可用；E2E 11 断言切后仅当前会话可见 | CONV-001 | `test-plan.md:57-58`、CDP 11 |
| S3 | 新建一个会话，说第一句后才真正落库（不留空壳） | 可用；草稿懒物化，重启清理 | CONV-002 | `spec.md:65`、`test-plan.md:74`、CDP 08 |
| S4 | 双击会话改名，改错了按 Esc 不保存 | 可用 | CONV-001 | `library.tsx:86-110`、CDP 09 |
| S5 | 把聊完的会话归档，避免污染列表；需要时恢复继续聊 | 可用；归档后中栏只读、发消息被拒 | CONV-002 | `library.tsx:110`、`spec.md:83-85`、CDP 10 |
| S6 | 找上周那个会话 | **半可用**：只能匹配标题或"当前主会话内的消息"；找不到其他会话的正文 | CONV-003 | `library.tsx:114-115`、`api.ts:136-137` |
| S7 | 等回复时滚上去看历史，回来时知道积累了几条 | **弱**：只有一个按钮计数，左侧列表不显示哪个会话有新消息 | CONV-003 / SYNC-004 | `app.tsx:220,662` |
| S8 | 在子会话里看到父会话上下文，并靠时间轴快速跳到某条 | 可用；祖先弱化 + bar 数=消息数 + 点击/键盘 | CONV-007 | `spec.md:133-137`、`TimelineGroups.test.tsx`、CDP 04a–04d |
| S9 | 粘贴多行文本/代码发送，Shift+Enter 换行、Enter 发送 | 可用；两种发送模式均可切换并持久化 | CONV-006 | `library.tsx:509+`、`Composer.test.tsx` |
| S10 | 用中文输入法选词时按 Enter 不误发 | 模拟可用，**真实 IME 未手测** | CONV-006 | `test-plan.md:157` |
| S11 | 断网/后端重启后，界面自己恢复并能继续发 | 半可用：有退避重连 + since 续传，**无断网 E2E、断连 UI 无端到端断言** | CONV-005 / SYNC-001 | `spec.md:155,188`、`test-plan.md:172` |
| S12 | 发送失败时文本还在，点重试不会重复发一条 | 可用（前端）；**幂等后端未实现**，重试去重无服务端保证 | CONV-005 | `test-plan.md:140-142` |
| S13 | 回复跑偏时点"停止"，服务端真的停下来 | 半可用：前端停止 + 发 correct 帧，**后端真实中断未验证** | CONV-005 / SYNC-001 | `test-plan.md:142,172` |
| S14 | 开第二个标签，跟当前会话与发送模式保持一致 | 可用；三通道有单测，**无双 target 真实矩阵** | SYNC-002/003 | `App.tabsync.test.tsx`、`App.tabsync.channel.test.tsx`、`test-plan.md:186-188` |
| S15 | 失败态可解释：列表 500、消息 413/403、归档只读、WS 错误帧 | 可用；错误有文案与重试；归档只读有后端测试 | E1/E2、CONV-002/007 | CDP 15/16、`test-plan.md:234-245` |

**场景层面缺的三个"用户会问"的问题**（当前无 UI、无 PRD）：能否删除会话（S5 的延伸）、能否置顶常用会话（S1 的延伸）、右栏"目标/输入/状态"是什么（S2 的延伸，见 §3 F 组）。

---

## 3. 功能点草案（L2 组 → L3 点）

> 用途：给阶段 1 的**产品功能树**定骨架。括号内是对应 PRD；标 **新增** 的是现有 spec 未覆盖、但页面或有后端能力已存在/用户会问的点。
> 优先级：P0 = 阶段 1 必过（阶段出口 12 PRD 全 covered 的组成部分）；P1 = 阶段 1 内应做；P2 = 可延后到阶段 2/3。

### L2-A 会话导航与生命周期（A 组）
- **A1 会话树渲染与主会话**（CONV-001）：左栏按树渲染、active 高亮、父链缩进。**P0**
- **A2 会话切换与消息隔离**（CONV-001）：点选/Enter 切换、中栏不残留上一会话。**P0**
- **A3 新建与草稿物化**（CONV-002）：草稿不写库、首条消息物化、重启清理空草稿。**P0**
- **A4 重命名**（CONV-001）：双击进入、Enter 提交、Escape 取消、重启保持。**P0**
- **A5 归档/恢复/只读**（CONV-002）：归档可发现、中栏只读、发消息被拒、恢复可继续。**P0**
- **A6 生命周期失败可见反馈**（CONV-002 AC-02 缺陷）：重命名/归档/恢复失败必须报错，不乐观改 UI。**P0**
- **A7 删除会话**（新增，后端已就绪）：菜单入口 + 二次确认 + 子会话级联提示 + 审计。**P1**
- **A8 置顶会话**（新增，后端已就绪）：菜单"置顶/取消"，列表置顶优先排序。**P2**
- **A9 多级父链与循环守卫**（CONV-001）：≥3 级可展开，循环父链被拒。**P1**
- **A10 归档列表开关**（CONV-001）："显示归档"切换历史会话可见性。**P1**

### L2-B 搜索与未读（B 组）
- **B1 会话标题搜索**（CONV-003 产品口径）：服务端 `q` 命中标题，前端只渲染命中。**P0**
- **B2 当前会话内消息搜索**（CONV-003 现状能力）：保留为"会话内查找"或按 §5-1 决策合并。**P1**
- **B3 跨会话正文搜索**（新增）：全局搜消息并跳转会话+消息。**P2**
- **B4 搜索四态**（CONV-003）：搜索中/无匹配/失败回退/清空恢复。**P1**
- **B5 会话级未读标识**（新增，SYNC-004）：列表显示"有新消息"（是否带数字见 §5-2）。**P1**
- **B6 未读持久化与已读游标**（SYNC-004）：后端字段/API + 清零时机。**P1**
- **B7 跨标签已读同步**（SYNC-004/SYNC-002）：任一标签读到最新，其他标签清零。**P1**
- **B8 通知中心/远程访问**（SYNC-005）：**已排除阶段 1**，保持 gap。**P2**

### L2-C 消息渲染与祖先（C 组）
- **C1 角色与分类渲染**（CONV-004）：用户/司墨区分、category 有值才显示。**P0**
- **C2 Markdown/代码块/长文换行**（CONV-004）：不横向溢出。**P0**
- **C3 复制与降级**（CONV-004）：成功反馈、Clipboard 不可用时 execCommand。**P0**
- **C4 流式与失败态**（CONV-004/005）：光标、失败徽标、可重试。**P0**
- **C5 卡片渲染与只读**（CONV-004）：提交后禁用、归档只读。**P0**
- **C6 消息纯度**（新增 AC）：system/internal 不进消息流（已有后端测试，缺产品 AC）。**P1**
- **C7 消息分页**（CONV-004）：默认 100 条，翻页不重不乱。**P1**
- **C8 祖先整级加载**（CONV-007）：父在前、按时间、按 id 去重、弱化展示。**P1**
- **C9 时间轴**（CONV-007）：一消息一 bar、点击/键盘跳转、tooltip、≥44px 点击区。**P1**
- **C10 祖先失败降级**（CONV-007）：413 可重试、403 视为无上级、空上级提示。**P1**

### L2-D 输入与发送（D 组）
- **D1 发送模式与快捷键**（CONV-006）：Enter / Shift+Enter / Ctrl(⌘)+Enter。**P0**
- **D2 IME 组合保护**（CONV-006）：组合中 Enter 不发送。**P0**
- **D3 流式与停止**（CONV-005）：停止后不追加。**P0**
- **D4 发送失败保留与重试**（CONV-005）：文本不丢、错误可读。**P0**
- **D5 重复提交防护与幂等**（CONV-005）：前端单在途 + 后端消费 `clientMutationId`。**P1**
- **D6 归档/无会话禁用态**（CONV-006/CONV-002）：Composer 禁用且原因可见。**P0**

### L2-E 实时与多标签（E 组）
- **E1 WS 连接三态**（SYNC-001）：connected/reconnecting/closed 可见。**P0**
- **E2 退避重连与 since 续传**（SYNC-001）：800ms→5000ms、不丢不重。**P0**
- **E3 多标签 active 跟随**（SYNC-002）：带回抖保护与 tiebreak。**P1**
- **E4 祖先链跨标签合并**（SYNC-002）：按 chain key 去重合并。**P2**
- **E5 发送模式跨标签同步**（SYNC-003）：BC + storage 双通道与降级。**P1**
- **E6 残留流式恢复**（SYNC-001）：启动/看门狗把"永远转圈"收尾为失败。**P1**

### L2-F 右栏会话投影（F 组，**当前无 PRD —— 缺口**）
- **F1 目标/输入/状态三组展示**（新增 PRD，建议 `PRD-CONV-008`）：加载、空态、错误重试。**P1**
- **F2 按 messageId 定位**（新增）：点击右栏条目跳回对应消息。**P1**
- **F3 展开/折叠**（新增）：三组默认策略与状态记忆。**P2**

### L2-G 四态与可达性（H 组，跨 PRD）
- **G1 空/加载/错误/权限不足**（E1–E3）：每面板可见反馈、不假 0、不假成功。**P0**
- **G2 响应式 375/768/1280**（A4）：不横向溢出、不遮挡主操作。**P1**
- **G3 键盘可达与焦点可见**（A3）：主路径 Tab/Enter/Escape/箭头/Home/End。**P1**

---

## 4. 阶段 1 出口缺口清单（要让 12 个 PRD 全部 covered）

> 出口条件（`MASTER-PLAN.md:85`）：12 PRD 全 `covered` + 测试全绿 + 8787 重建部署逐条走查（含视觉）。
> `covered` 判定（`CONV-CLOSURE.md:123`）：**六类产物 + 全 AC 证据同时齐**，缺一即 `partial`。

### 4.1 按 PRD 列缺口

| PRD | spec 缺口 | 测试缺口 | 证据/环境缺口 | owner |
|---|---|---|---|---|
| CONV-001 | 主会话不可归档是否升 AC 未定 | 无"切换后中栏内容变化"E2E；无主会话归档断言 | pin 未接线（决定见 §5-4） | 产品/测试/前端 |
| CONV-002 | — | 重命名/归档/恢复失败路径无用例 | 两处失败静默需修复（`app.tsx:456-460,536-539`）；无删除入口 | 前端/产品 |
| CONV-003 | 搜索语义二选一未定；未读口径未定 | 未读零证据（TC-011 missing）；跨会话正文搜索无用例 | 无后端未读实现；`grep` 0 匹配 | 产品/后端/测试 |
| CONV-004 | 消息纯度未升 AC | 无独立消息纯度用例 | `COMP-message-colors` 未签收 | 产品/设计验收 |
| CONV-007 | — | 时间轴 ≥44px 无断言；413/403 仅 mock | 未部署验证；`COMP-timeline-groups`/`-tip` 未签收 | 测试/设计验收/Lead |
| CONV-005 | 幂等是否属 AC 已写但后端未实现 | 无 close→open replay E2E；停止真实中断无验证 | 后端 0 处理 `clientMutationId`；`since` 保留窗口未定义 | 后端/测试 |
| CONV-006 | — | 真实中文 IME 未手测；后端无 Composer 契约 | `COMP-composer-send-mode` 未签收 | 测试/设计验收 |
| SYNC-001 | `since` 保留窗口未定义 | 无断网 E2E replay；断连 UI 无端到端断言 | 无 CI 接线 | 后端/前端/测试 |
| SYNC-002 | 未读通道 AC 依赖 SYNC-004 | 无双 target 真实矩阵；`opId` 去重无断言 | CDP 13 是否双页需以审计报告为准 | 测试 |
| SYNC-003 | — | 跨标签单测与降级路径无测试 | — | 测试 |
| SYNC-004 | 未读 6 问未答（数据模型/清零/持久化/多标签） | TC-P1-011 missing（无口径无法断言） | 无后端、无表、无 API | 产品→后端 |
| SYNC-005 | 已排除阶段 1 | 保持 missing | 不做 | — |

### 4.2 跨 PRD（不修则全域不能 covered）

1. **六类产物计数**（`CONV-CLOSURE.md:39-48`）：前端 spec 11/12、后端 spec 9/12、COMP 签收 0/5、任务卡 11/12、test-plan 12/12、执行证据 9/12。
2. **5 个 COMP 未签收**：`COMP-conversation-panel`、`COMP-message-colors`（均标 approved 却写"未实现/待实现"）、`COMP-timeline-groups`、`COMP-timeline-tip`、`COMP-composer-send-mode`（均 `spec ready`）——需按实现签收（`specs/COMP-*/spec.md:3`）。
3. **证据归档**：`docs/testing/` 无 2026-11-21 原始报告（`test-plan.md:13`、`CONV-CLOSURE.md:83`）；当前 PASS 数字靠 Lead 转达。
4. **E2E 真实性**：CDP + mock 后端 19230，非 Playwright、非 8787 真实模型、无 CI（`test-plan.md:39,42`）。
5. **8787 未验证**：现有 `simo-live-final4.exe` 构建于 2026-11-21 02:26，不含 13:00 后前端修复，**验证前必须重建**（`MASTER-PLAN.md:121`）。
6. **文档漂移**：`SPEC-GAP.md:50-54` 过期；`MASTER-PLAN.md:82,105` 的 COMP 数量（7）与 `CONV-CLOSURE.md:45`（4 个名字/5 个 spec）不一致；spec/test-plan 引用的 `app.tsx` 行号漂移。
7. **响应式断言**：仅 375 有 CDP 01b，无 768/1280（`spec.md:261`、`CONV-CLOSURE.md:83`）。

---

## 5. 待产品/用户拍板（6 条，均给推荐）

| # | 问题 | 推荐选项 | 理由（产品视角） |
|---|---|---|---|
| 1 | **搜索语义**：标题搜索 / 当前会话消息搜索 / 全局正文搜索？ | **标题搜索收口（与 `spec.md:100` 一致），把"当前会话消息搜索"降为新 L3 的 P2，跨会话正文搜索进 backlog** | 后端标题搜索已有 + 有契约测试（`sessions/management.go:12-13`）；消息搜索只有 `main`、不含子会话（`api.ts:136-137`），语义残缺，收口会拉长阶段 1 |
| 2 | **未读 6 问**（单位/时机/跨会话汇总/多标签合并/持久化/通知同源） | **会话级 hasUnread 布尔；进入会话即已读，离开底部才累加；不跨会话汇总数字；任一标签已读即全标签；阶段 1 不持久化、刷新归零；与通知中心不同源（通知不做）** | 与现状最接近（`app.tsx:220,662`），改动面最小；持久化需要新表/API/迁移，会拖出阶段 1 边界（`CHG-CONV-005/spec.md:48-49`） |
| 3 | **删除入口是否进 UI** | **进（P1）**：会话菜单"删除"+二次确认 + 级联子会话提示 | 后端 `DELETE` 与 R4 动作已就位（`sessions/http.go:25`、`action.go:60`），只差入口；不给入口用户会去改数据文件 |
| 4 | **pin 是否进 UI** | **进（P2，可排在删除之后）** | 后端已支持过滤/排序且有测试（`sessions/management.go:48-53`），UI 成本小；但阶段 1 优先级低于 12 PRD 收口 |
| 5 | **右栏会话投影（F 组）是否建 PRD** | **新增 `PRD-CONV-008`（P1），不并入 CONV-004** | 页面已可见（`library.tsx:811`）却无 PRD/AC（`CONV-CLOSURE.md:80`），属"可见但不可追溯"；并入 CONV-004 会把消息渲染与右栏投影耦合 |
| 6 | **主会话不可归档、消息纯度是否升 AC** | **两者都升为 AC**（主会话归档 → CONV-001 AC-03；消息纯度 → CONV-004 AC-03） | 主会话归档后端已拒但无断言；消息纯度已有 4 条后端测试（`test-plan.md:109`）却无产品 AC，属"测了但没要求" |

> 已定、不必再问：SYNC-005 不纳入阶段 1（`MASTER-PLAN.md:145`）；8787 验证强制、含视觉返工（`MASTER-PLAN.md:146-147`）。

---

## 6. 与现有 spec 的关系

### 6.1 结论：**不新增域，阶段 1 是"补齐 + 收口"**

- `CONV`/`SYNC` 已在 `docs/product/ID-SPEC.md:19-20` 域表内；新增域需先改域表并说明边界（`ID-SPEC.md:32`），而阶段 1 没有跨域新能力 → **不建 P11/新域码**。
- 现有 PRD 编号稳定（`ID-SPEC.md:40`），**不重命名、不拆文件**；本轮只在 `specs/product/P1-CONV/spec.md` 内增补 AC、在 `specs/test/P1-CONV/test-plan.md` 内补用例。
- 需新增 PRD 的点（见 §5-5）：右栏会话投影 → 建议 `PRD-CONV-008`；删除/置顶如不并入 CONV-002，可作 `PRD-CONV-009`（删除）/`PRD-CONV-010`（置顶），但**优先并入现有 PRD 的 AC 扩展**，避免 PRD 数量膨胀。

### 6.2 需要更新的文档（按 owner）

| 文档 | 变化 | owner |
|---|---|---|
| `specs/product/P1-CONV/spec.md` | 补 AC（主会话归档、消息纯度、搜索语义定稿、删除/置顶如立项）、修正行号引用 | 产品 |
| `specs/test/P1-CONV/test-plan.md` | 补失败反馈、断网 replay、双 target、IME 手测、768/1280、删除/置顶用例 | 测试 |
| `specs/changes/CHG-CONV-00{1..4}/` | 失败反馈缺陷（TASK-02/03）落实现；幂等/`since` 窗口 | 前端/后端 |
| `specs/changes/CHG-CONV-005/` | 未读口径定稿后解除 blocked | 产品 |
| `docs/product/TREE.md:94-120` | 按 §3 补 L2/L3（F 组、删除、置顶） | 产品 |
| `docs/product/TRACEABILITY.md:63-74` | 随证据升级覆盖行 | 产品/测试 |
| `docs/product/CONV-CLOSURE.md` | 每批证据回写矩阵、用例状态 | 产品 |
| `docs/product/SPEC-GAP.md:45-54,176-185` | 删除"待建"过期表述 | 产品 |
| `docs/plan/MASTER-PLAN.md:82,105` | COMP 数量与行号引用校正 | Lead |
| `specs/COMP-*` ×5 | 按实现签收 | 设计/验收 |

### 6.3 明确不做

- 不动 P2–P10 的 spec/TREE/TRACEABILITY/代码（`CONV-CLOSURE.md:98`）。
- 不为 SYNC-005 立项、不加鉴权（用户已排除）。
- 不在本文件中写产品 spec 正文、不改代码、不提交。

---

## 7. 复现与未验证项

- **复现命令**（未在本次会话执行）：`cd frontend && npm test`、`cd frontend && npx tsc --noEmit`、`pnpm test:e2e:cdp`、`cd backend && go test ./... -count=1`；门禁 `node scripts/check-sdd.mjs`、`node scripts/check-trace.mjs`（`CONV-CLOSURE.md:118`）。
- **本次已亲自读码核验**：`frontend/src/app.tsx`（搜索/未读/生命周期/Composer/归档）、`frontend/src/api.ts`、`frontend/src/components/library.tsx`（Sidebar/MessageItem/TimelineGroups/Composer/ConversationPanel/RightPanel）、`backend/internal/modules/sessions/{http.go,management.go}`、`backend/internal/core/action/action.go`、`specs/product/P1-CONV/spec.md`、`specs/test/P1-CONV/test-plan.md`、`docs/product/{TRACEABILITY,CONV-CLOSURE,SPEC-GAP,TREE,ID-SPEC}.md`、`docs/plan/MASTER-PLAN.md`、`specs/COMP-*/spec.md` 头部。
- **未验证**：未跑任何测试、未起 8787、未做双标签真实操作、未复现断网场景、未核实 CDP 13 是否双页。上述结论一律以文档记录为准并已标注来源。

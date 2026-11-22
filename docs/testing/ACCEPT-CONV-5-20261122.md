# ACCEPT-CONV-5 验收报告（2026-11-22）

**签字结论：不能签。** 33 条有效 AC 中 **27 条通过、4 条部分通过、2 条失败、0 条未验证**。本轮两条新增 AC（`AC-CONV-001-05` 行内消息数、`AC-CONV-008-05` 右栏补取）均以独立证据通过，上一轮失败的 `AC-CONV-008-02` 修复成立；但 `AC-CONV-007-02` 的时间轴点击命中区在桌面细指针下只有 20×4 像素，`AC-CONV-008-04` 的右栏投影收到 304 时把右栏替换成错误态，且从不发送 `If-None-Match`，这两条仍是失败。测试矩阵 35 行、33 条有效 AC，实现方自述 32 pass / 1 partial 与本轮结果不一致，需要按本报告更正。

## 1. 环境与证据方式

被测进程是 `backend/simo-8787-conv5.exe`，任务描述的 PID 3804 在本轮开始时已不存在，8787 无监听，我按 `start.ps1` 的口径用 `SIMO_HOME=E:\dsh_home\workspaces\agent\data` 与 `serve -addr 127.0.0.1:8787 -model real` 重启，并在此后三次重启取证（后台 job 依次为 `pwsh-4ec642c8d7334538`、`pwsh-2ca38b100a9c4bc2`、`pwsh-b2ad466d35134d88`、`pwsh-b4e3e95a001a4839`）。health 返回 200 `{"ok":true,"ready":true,"checks":{"db":"ok","modules":["sessions","chat","tasks","memory"]}}`，页面 `<meta name="build-id" content="mwqqswzw-13dcl">` 与任务给的 buildId 一致。

真实模型流式仍被上游 403 阻断：`POST /api/chat` 返回 202 后，WS 只出现 `reply.created`、`message.created`、`status`、`reply.done(status=error)` 与 `message.done(error)`，没有任何 `reply.delta`，agent 消息落库 `status=error`、文本为空。涉及真实流式的子项记环境未验证，不判通过也不判失败。

浏览器用 headless Chrome 157（CDP 9223，PID 33108）驱动，视口 1600×1000、1440×1000、375×812。造数走 `POST /api/chat`、`POST /api/sessions`、`PATCH /api/sessions/{id}` 与少量直写 SQLite（仅用于构造 120 条消息、internal 消息、读游标、循环父链与空会话）。探针在 `.tmp/accept5/*.mjs`，结构化结果在 `.tmp/accept5/out/*.json`，截图在 `.tmp/accept5/shots/`。串行前端全量的日志在 `.tmp/accept5/logs/vitest-serial2.log`。

## 2. 逐条判定

| AC | 本轮判定 | 证据（命令、响应、数值、截图） | 与上一轮差异与备注 |
|---|---|---|---|
| CONV-001-01 | 通过 | `.tmp/accept5/out/ui1.json`：点击「验收5-批量120」行后中栏标题为该会话、100 条含 `ACCEPT5-BULK`；CDP 真实 Enter 键切到「验收5-纯度」后 2 条、无批量残留、无 internal 文本；底部汇总两次不变 | 上轮通过，本轮复验 |
| CONV-001-02 | 通过 | `ui4.json`：列表 500 → 「会话加载失败 请求失败（500）」+重试，重试后 17 行；统计 500 → `.quota-note` 为「统计加载失败」、行计数仍在；`Input.dispatchKeyEvent` 按 Escape 后标题复原且 `q=ACCEPT5-ESC-TEST` 为 0；插入空会话后重启 20→19 由 `cleanupEmptySessions` 删除；L2/L3/L4 链 depth 2/3/4 正常；直插环 `sess-accept5-cycle-a/b` 后 `/api/sessions/tree` 200/4ms 丢弃环节点、UI 不显示、无挂起 | 上轮未验证，本轮补齐；环只能在库里直造，拒绝文案不可达，读路径静默丢弃且不挂起 |
| CONV-001-03 | 通过 | `api.json`：`POST /api/sessions/main/archive` → 409 `{"blockers":["主会话不可归档"],"code":"main_session_protected","error":"主会话不可归档","ok":false}`；`/main/unarchive` 200；主会话行无 `.session-more`；`probe-archive-mwqn8oz1` 归档后 archived=1、unarchive 200 复原 | 上轮通过，本轮复验并补 blockers 字段 |
| CONV-001-04 | 通过 | `ui1.json`：行菜单 `[置顶,归档]`，置顶后该行到同级最前（`[批量120, 验收序B, 验收序A,…]`）、菜单变 `[取消置顶,归档]`，取消后原序恢复；重启后 `sess-accept5-bulk pinned=true` 且在置顶组内按 createdAt 最前；主会话/草稿/归档行无置顶入口 | 上轮通过，本轮补重启保持 |
| CONV-001-05 | 通过 | `ui1.json` + `api.json`：17 行逐行等于 `GET /api/sessions` 的 `messageCount`（75/38/36/16/14/10/4/2；scratch 120/2/1）；`验收5-批量120` 行显示 120；归档行 2；草稿无 `.session-count`（测试口径为缺字段不渲染）；底部 `18 个会话 · 归档 1 · 332 条消息` 与 `stats.totals.messages=332`、归档 1、会话 18 一致，切换会话不变；统计 500 时底部「统计加载失败」、行数字仍在 | 本轮新增 AC；全部子项有证据。观察项见 5.2 |
| CONV-002-01 | 通过 | `ui6b/ui6e.json`：创建→重命名→归档→恢复每步列表与中栏一致；归档后 `textarea.disabled=true`、send disabled、`POST /api/chat` 到归档会话返回 409；重启后标题与 archived 状态保持 | 上轮 partial，本轮补齐创建/重命名/重启 |
| CONV-002-02 | 通过 | `ui6e.json`：创建 500 → 行数不变、中栏「请求失败（500），请稍后重试」；重命名 500 → `.toast` 同文案、编辑框仍有 `ACCEPT5-RENAME-FAIL2`、API 旧标题仍在；归档 500 → toast 且行不消失；恢复失败（`Fetch.failRequest` 拦 unarchive）→ toast、API 仍 `archived:1`，解除后重试变 0 | 上轮未覆盖，本轮四种失败路径分别实测 |
| CONV-003-01 | 通过 | `ui4.json`：标题搜索「验收5」得到 3 行（未读 1/纯度 2/批量 120），只发 `GET /api/sessions?q=…`；正文关键词 `ACCEPT5-BULK-001` 得 0 行、`没有匹配的会话` | 上轮通过，本轮补正文不误命中 |
| CONV-003-02 | 通过 | `ui4.json` 搜索 500 → 「搜索失败，请重试」+重试，不出现「没有匹配」；未读游标跨三次重启保持（`sess-accept5-unread` read 后 false、`sess-accept5-bulk` 未读 true）；双标签 A 点开即两标签清除；粒度会话级 | 上轮通过，本轮补重启与跨标签 |
| CONV-003-03 | 通过 | 全程只出现 `/api/sessions?q=`，无 `/api/messages/search`；延迟 q 请求显示「搜索中…」；无匹配空提示；500 可重试 | 上轮通过，本轮复验三态 |
| CONV-004-01 | 通过 | `ui11.json` 分类标签 4 种（进度汇报/需求澄清/需求提出/信息咨询）与 API `progress/clarification/requirement/consultation` 对应；`ui13.json` 2500 字 + 40 行代码块在 1600 与 375 下 `docOverflow=0`、`pre` 正常；复制成功按钮「已复制」且剪贴板内容与消息一致；agent 流式气泡有 `.stream-caret`；`ACCEPT5-REAL403` 显示「失败」徽标与「重试」；卡片 submitted/只读态正常 | 上轮 partial，本轮补齐分类/复制/代码块 |
| CONV-004-02 | 通过 | `ui6a/ui6d.json`：`clipboard.writeText` reject + `execCommand=false` → 按钮「复制失败」；卡片提交 500 单次 POST、错误 `role=alert`、输入保留、按钮「重试」，重试成功 submitted；`ui14.json` 归档后卡片 `取消`/`确认` disabled、select 与 textarea 全 disabled；internal 消息在 DOM 与 `/api/messages` 均不出现 | 上轮未验证，本轮全部构造 |
| CONV-004-03 | 通过 | `api.json`：`/api/messages` 角色只有 user/agent，internal 消息不返回；`ui6a.json` 纯度会话 DOM 20 条、`internalShown=false`；主会话 1 个 `.card-block` 正常渲染；`PATCH /api/messages/{id}` 与 `POST /api/messages/{id}/edit` 均 400 `edit_disabled`；WS 帧无 internal 消息 | 上轮通过，本轮补编辑端点与 WS |
| CONV-005-01 | 部分通过 | `ui5.json`（mock 8788）：180ms 内乐观出现、输入清空、`.stream-caret` 可见；连续 `reply.delta`/`message.delta` 后 `reply.done` 终态、caret 消失；停止按钮点击后 2.5s 无增长（grew=0），但 mock 回复在约 10ms 内已完成，停止未真正中断流 | 上轮环境限制；本轮 mock 通过，真实模型仍 403，停止语义只有弱证据 |
| CONV-005-02 | 部分通过 | `ui5.json`：`POST /api/chat` 500 → 无幽灵消息、文本 `MOCK-ACCEPT5-FAIL` 保留、`.composer-error` 显示「请求失败（500），请稍后重试」，重试成功 10→12 条且无重复 user；`ui9.json` 断网发送显示「网络请求失败，请检查连接后重试」；`ui9b.json` 重启 mock 后状态 `已连接→重连中→已连接`；`api4.json` 同 `clientMutationId` 两次 POST 返回同一 messageId 且 `idempotent:true`，库中仅 1 条 | 上轮通过；本轮「停止后不追加」与 005-01 同因只有弱证据，真实模型 403 |
| CONV-006-01 | 通过 | `ui5.json`：enter 模式下 Shift+Enter 换行（未发送）、Enter 发送；切 shift-enter 后 Enter 换行、Shift+Enter 发送、Ctrl+Enter 也发送；提示文案与 `aria-pressed` 同步；刷新后 localStorage `simo.composer.sendMode=shift-enter` 保持 | 上轮 partial，本轮补齐 Ctrl+Enter 与模式反转 |
| CONV-006-02 | 部分通过 | `ui5.json`：`compositionstart` 后 Enter 不发送；失败文本保留；2500 字不截断（scrollH 689 > clientH 85）；`ui4.json` 归档时 textarea 与 send disabled、占位文案明确；但「无会话禁用态」未取得真实证据，拦截 tree/stats 为空后 activeId 仍为 main、Composer 仍可用 | 上轮 partial；IME/长文/归档已补，无会话态仍不可达 |
| CONV-007-01 | 通过 | `ui7.json`：进入 L4 显示自己 2 条，逐级点击 2→4→6→44；44 条按 4 个会话 `at` 合并排序逐 id 一致（orderMatches=true）、去重后 44 个唯一 id；`.tl-bar` 44 个与消息数一致；点击/Enter 跳转生效；切到纯度清链（2 条），切回 L4 后 `scrollTop=141`；主会话滚动到 1800 切走再切回仍 1800 | 上轮报告遗漏该条，本轮独立取证 |
| CONV-007-02 | **失败** | `ui7.json`：413 注入显示「消息过多，暂不能完整加载」且可重试（撤注入后 4 条）；403 显示「无权读取该上级会话」；空上级显示「上级没有消息」；`probe_ui7c.mjs` 拦截上级响应把首条消息重复一次后 DOM 仍 4 条、4 个唯一 id、无重复。`ui7b.json`：44 条时 `.tl-bar` 视觉盒 20×4，中心命中、四角 ±21px 全部未命中，桌面细指针下点击目标只有 20×4；`components.css:1067-1082` 的 48×44 只在 `@media (pointer: coarse)` 生效，`ExecRowHitArea.test.tsx:100` 也是强制 coarse 才通过 | 上轮遗漏；矩阵自述 pass 依据的是粗指针环境，桌面不满足「≥44px」 |
| CONV-008-01 | 通过 | `ui3.json`：main 投影 `status=active, revision=34, pendingConfirmations.total=0`，UI「进行中 rev 34」、goal 占位「本会话未记录目标。」、三组 3/6、0/0、3/4 与接口一致；研究员 `rev 1 · 待确认 1` 与接口 `pendingConfirmations.total=1` 一致；拦截 200 `null` → 「暂无会话投影」 | 上轮 partial，本轮补齐三组与待确认；真实 404 无投影不可达（所有会话都有投影），该态为合成 |
| CONV-008-02 | 通过 | `ui2.json`：三组任务与 1 个交付物渲染；展开 done 6/6、折叠回 3/6；点击 done-1 命中 `.msg.is-flash[data-message-id="msg-a1"]`、时间轴 `is-current`、`scrollTop=534`；点下载触发 `Page.downloadWillBegin`（`weekly-report.md`），该 URL HEAD 200、`content-disposition: attachment`、`content-length: 101`、`text/markdown`；`submitInputs=[]` 无提交/重试/取消入口 | 上轮 fail 修复成立；headless 未把文件落盘属环境限制 |
| CONV-008-03 | 部分通过 | `ui3.json`：延迟投影 1.8s → 「右栏加载中…」；注入 500 → 「右栏加载失败 请求失败（500），请稍后重试」+重试；200 `null` → 空投影文案；375 下 inspector `display:none`、composer 359×144 与 send 54×28 可见可命中、`overflowX=0`、无重叠；但拦截 tree/stats 为空后左栏「暂无会话」而中栏仍渲染主会话消息、右栏仍显示「进行中 rev 34」，不是真正的「无会话」态 | 上轮 partial；加载/错误/空投影/375 已补，无会话态退化 |
| CONV-008-04 | **失败** | `api.json`：`taskLimit=0/200/abc/-1` 均 400 `invalid_task_limit`、缺会话 404、`ETag "spec-main-34"` 条件请求 304。`ui2.json`：强制投影返回 304 → 右栏整体变 `.state-error`「请求失败（304），请稍后重试」，展开态被错误态替换；所有投影请求头均为 `{}`，从不带 `If-None-Match`；`api.ts:289` 无 ETag 处理，`api.ts:18-28` 把 304 当 `!ok` 抛错 | 上轮自述 pass 依据的是会话列表 ETag，不是右栏投影；右栏「304 不重复渲染、不闪空」不成立 |
| CONV-008-05 | 通过 | `ui2.json`：初始 done 3/6、pending 3/4；展开 done 只发 1 次 `taskLimit=50` → 6/6 六行，展开 pending → 4/4 四行（复用数据）；折叠回 3/6 只显示 3 行；拦截 `taskLimit=50` 返回 500 → 「右栏加载失败 请求失败（500），请稍后重试」+重试；撤注入点重试恢复 3/6、再展开 6/6 | 本轮新增 AC；主路径与失败路径均有证据。观察项见 5.2 |
| SYNC-001-01 | 通过 | `ui8.json`：状态「已连接」、dot `connection-dot open`；`ui9c.json`：重连首帧 `{"type":"subscribe","data":{"sessionId":"main","since":9901}}`，断线期间插入的事件 9902 恰好补发 1 次、9897–9901 无重复；双标签（ui5c/ui12）都能收到新消息事件 | 上轮 partial，本轮补齐双端与 since |
| SYNC-001-02 | 通过 | `ui9b.json`：重启 mock 进程后状态 `已连接→重连中(t+14.4s)→已连接(t+24s)`，中间多次 `ERR_CONNECTION_REFUSED`；`ui13.json` 断网归档 → 「网络请求失败，请检查连接后重试」；重启后 `msg-accept5-streaming-1` 变 failed 且追加「[服务重启时检测到未完成的回复，已自动标记为失败。]」；`api4.json` since=1 完整补发、since=99999999 只回 hello、since=-5 全量回放、since='abc' 回 error 帧不崩 | 上轮 partial，本轮四项全部补齐 |
| SYNC-002-01 | 通过 | `ui10.json`：A、B 同在 L4；A 点「显示上级会话」后 B 也变 4 条、aria-label 同步、消息 id 序列完全相同（chainEqual=true）；A 切纯度 B 的 active 与中栏跟随，等 1.5s 无来回跳 | 上轮未验证，本轮两标签实测 |
| SYNC-002-02 | 通过 | `ui10/ui11.json`：注入 `at=now+60000` 的 `zzzz-tab` 两标签都切纯度，同 tab 同 at 第二条被忽略；反向先 `aaaa-tab` 生效、同 at 的 `zzzz-tab` 覆盖、`mmmm-tab` 不生效 → 同 at 按 tabId 字典序较大者胜；同一 read 广播连发两次消息数不变；`BroadcastChannel=undefined` 降级无异常 | 上轮未验证，本轮两方向注入 |
| SYNC-003-01 | 通过 | `ui4b.json`：A 切换后两标签提示都变「Enter 换行，Shift+Enter 发送」、`aria-pressed=true`；刷新 B 后仍保持（localStorage `simo.composer.sendMode=shift-enter`） | 上轮通过，本轮双标签复验 |
| SYNC-003-02 | 通过 | `ui4b.json`：两标签最终一致；A 注入 `BroadcastChannel=undefined` 并重载后本标签切换仍生效、无异常，B 不跟随属降级预期 | 上轮未验证，本轮实测降级 |
| SYNC-004-01 | 通过 | `ui12.json`：两标签都停在主会话时向纯度发消息 → 两标签纯度行 `data-unread=true`、主会话行无点；点开纯度后两点同时消失；回主会话不再出现 | 上轮较窄，本轮补「非 active 才出点」 |
| SYNC-004-02 | 通过 | `ui12g.json`：读接口失败 1 次 → 未读点仍 true、API `hasUnread:true`、toast「标记已读失败：…」，解除后进入即清；`ui12b.json` 刷新后保持已读；重启后 `sess-accept5-bulk unread=true`、`sess-accept5-unread unread=false` | 上轮 partial，本轮补读失败与重启 |
| SYNC-004-03 | 通过 | `ui5c.json`：两标签都停主会话，API 向纯度发 `API-UNREAD-PROBE-3` → 2.5s 内两标签纯度未读点出现、count 18→20；A 点开后两标签清除，刷新仍清除；游标写在后端 | 上轮未验证，本轮构造真实推送 |

## 3. 两条新增 AC 的专项证据

### 3.1 AC-CONV-001-05 行内消息数

`GET /api/sessions` 与 `/api/sessions/tree` 的 `messageCount` 逐会话一致（`treeCountMatch=true`），页面 17 行的 `.session-count` 与接口值逐行相等，`countMismatch=[]`：主会话 75、研究员 38、验收序C 36、新会话 16、验收未读V 14、验收未读U 10、验收序A 4，其余 8 个会话各 2；直写库的 `验收5-批量120` 行显示 120、纯度 2、未读 1。批量会话用 `limit=500` 校验 120 条全部在库，页面点开后中栏只渲染 100 条且 `hasMore=true`，这是消息列表分页，行数字仍取后端 `messageCount`，不受 100 上限影响。

归档行在「显示归档」打开后出现，数字 2 与接口一致；草稿行由「＋」创建，`messageCount=0` 且无 `.session-count` 元素，与测试口径「缺字段不渲染数字」一致。底部 `.quota-note` 为 `18 个会话 · 归档 1 · 332 条消息`，与 `stats.totals.messages=332`、归档 1、会话 18 一致，切到任意会话不变；统计接口 500 时底部变「统计加载失败」，行数字仍在，两处各自占位、不显示假 0。

证据：`.tmp/accept5/out/ui1.json`、`.tmp/accept5/out/api.json`、`.tmp/accept5/shots/accept5-ui1-01-main-1600.png`。

### 3.2 AC-CONV-008-05 右栏补取

主会话投影首屏 `done.total=6/items=3`、`pending.total=4/items=3`。展开「已完成」时右栏只发一次 `GET /api/sessions/main/spec-projection?taskLimit=50`，组头变 `6/6` 且实际渲染 6 行；再展开「未开始」直接用同一次响应渲染 `4/4` 四行，不再发请求；折叠「已完成」后组头回到 `3/6` 且只显示 3 行，没有把 6 条折叠成 3/3 的假计数。

补取失败用请求拦截构造：拦 `taskLimit=50` 返回 500，右栏整体换成错误态「右栏加载失败 请求失败（500），请稍后重试」并带重试按钮，只发出 1 次 `taskLimit=50` 请求，没有静默截断、没有把失败当空组。撤掉拦截点重试，请求走回 `taskLimit=3`、右栏恢复 `3/6` 与 `3/4`，再点展开回到 `6/6`，重试链成立。

证据：`.tmp/accept5/out/ui2.json`、`.tmp/accept5/shots/accept5-ui2-02-expanded-1600.png`、`accept5-ui2-04-refill-fail-1600.png`。

## 4. 上一轮 partial 与未验证项的重判

| 上轮状态 | AC | 本轮判定 | 本轮独立证据 |
|---|---|---|---|
| partial | CONV-002-01 | 通过 | 创建/重命名/归档/恢复全链 + 重启持久化 + 归档 409 |
| partial | CONV-004-01 | 通过 | 分类映射、代码块 1600/375 无溢出、复制成功/失败反馈 |
| partial | CONV-006-01 | 通过 | Shift+Enter/Enter 反转、Ctrl+Enter、模式持久化 |
| partial | CONV-006-02 | 部分通过 | IME、长文、归档禁用通过；无会话禁用态不可达 |
| partial | SYNC-001-01 | 通过 | 双标签收事件、subscribe 数字 since、9902 恰补一次 |
| partial | SYNC-001-02 | 通过 | 重连 UI、断网归档报错、残留流式恢复失败、since 边界 |
| partial | SYNC-004-02 | 通过 | 读失败不假已读、刷新/重启游标、跨标签清除 |
| partial | CONV-008-01 | 通过 | 三组一致、rev 34、待确认 1、空投影文案 |
| partial | CONV-008-03 | 部分通过 | 加载/错误/空/375 通过；无会话态退化 |
| 未验证 | CONV-001-02 | 通过 | 四态、Escape、空会话重启清理、多级链、环不挂起 |
| 未验证 | CONV-004-02 | 通过 | 剪贴板降级、卡片失败重试、归档卡片只读、internal 隐藏 |
| 未验证 | SYNC-002-01 | 通过 | 两标签 active/祖先链/未读跟随且不重复 |
| 未验证 | SYNC-002-02 | 通过 | 同 at tiebreak、重复广播不叠加、降级无异常 |
| 未验证 | SYNC-003-02 | 通过 | 双标签一致、无 BroadcastChannel 不报错 |
| 未验证 | SYNC-004-03 | 通过 | API 直发造未读、两标签点、跨刷新持久化 |
| 遗漏 | CONV-007-01 | 通过 | 逐级加载 2→4→6→44、排序去重、44 bar、跳转、清链与滚动恢复 |
| 遗漏 | CONV-007-02 | **失败** | 413/403/空上级/去重通过；时间轴命中区桌面 20×4 |

## 5. 失败与疑点

### 5.1 失败两项

`AC-CONV-007-02`：时间轴每个 bar 的视觉盒 20×4，`elementFromPoint` 在中心命中、四角 ±21px 全部未命中，桌面鼠标环境下有效点击目标只有 20×4；48×44 的扩大规则写在 `@media (pointer: coarse)` 内（`frontend/src/components/components.css:1067-1082`），触屏与粗指针环境才生效，而 AC 要求「时间轴点击目标 ≥44px」没有限定指针类型。测试矩阵用 `matchMedia('(pointer: coarse)')` 强制粗指针拿到通过，桌面场景不满足。该条其余子项成立：拦截上级消息接口把首条消息原样重复一次后，页面仍是 4 条、4 个唯一 id、无 `dupIds`（`.tmp/accept5/probe_ui7c.mjs`），重复消息只渲染一遍。

`AC-CONV-008-04`：服务端三条契约（taskLimit 越界 400、缺会话 404、`If-None-Match` 命中 304）都成立，但右栏投影路径的前端不成立。强制投影返回 304 时，右栏被替换成「请求失败（304），请稍后重试」错误态，展开状态丢失；所有投影请求头都是 `{}`，`getSpecProjection`（`frontend/src/api.ts:289`）从不带 `If-None-Match`，`readBody`（`api.ts:18-28`）把 304 当失败抛错。上一轮该条判 pass 用的证据是会话列表的 ETag（`api.ts:41`、`App.conversation.test.tsx:612`），不是 spec-projection。

### 5.2 疑点与观察项

底部汇总是全局口径，但新消息到达后不立即刷新：真实模型 403 会话创建后，行内数字变 2，底部仍显示 `19 个会话 · 归档 1 · 332 条消息`，同刻 `/api/stats` 与逐会话求和都是 334；刷新后恢复一致。行数字本身正确，汇总在 `stats` 轮询/WS 处理之外，属 001-05 的观察项，未判失败。

右栏补取失败后的「重试」不保留展开意图：重试走 `loadRight(activeId)` 默认 `taskLimit=3`，右栏回到 `3/6`，用户需要再点一次展开才回到 `6/6`。AC 要求「可重试」，该行为成立，但交互上多一步，记观察项。

时间轴跳转可能差一位：点击第 21 条 bar 后 `scrollTop` 1800→2172、`is-current` 变 21，但 `jumpToMessage`（`app.tsx:580-584`）不做 flash，scroll 事件再由 `syncTimeline`（`app.tsx:586-599`）按 64px 偏移重算 active，落点可能落在相邻消息。007-01 的「点击可跳转」成立，定位精度记观察项。

「无会话」态退化：拦截 tree 与 stats 返回空后左栏显示「暂无会话」、0 行、不崩，但中栏仍渲染主会话消息、右栏仍显示「进行中 rev 34」，因为 `activeId` 默认 `main` 且继续取 main 消息。008-03 的「无会话」子项只能记部分通过。

后端测试无法独立复跑：本机 `Get-Command go` 为空、runtimes 下无 go.exe，矩阵自述 16 包 281 PASS / 1 SKIP 只有实现方口径。前端串行全量实测 22 文件 / 222 用例全过、`Duration 70.61s`、exit 0，与矩阵自述 20 文件 / 200 用例差 2 文件 / 22 用例。上一轮并行全量有 4 个用例耗时约 5 秒（贴着 5 秒超时阈值），本轮串行单 worker 下无一超过 1.1 秒（最慢 `MessageTableLayout.test.tsx` 1073ms），两次的差别在用例数 200→222、文件数 20→22 与执行方式（并行→串行 `--maxWorkers=1`）。

## 6. 未验证清单（环境与子项限制，不影响上文 0 条未验证 AC 的计数）

- 真实模型流式（005-01、005-02 的流式段）：上游 `api.deepseek.com` 仍 403，只拿到 `status=error`、无 `reply.delta`。
- 停止中断：mock 回复在约 10ms 内完成，点击停止后无增长不能证明流被中断，「停止后不再增长」只有弱证据。
- 后端 `go test`：无 Go 工具链，281 PASS / 1 SKIP 未独立复跑。
- headless 下载落盘：`Page.downloadWillBegin` 与响应头已验证，`Page.setDownloadBehavior` 与 `Browser.setDownloadBehavior allowAndName` 都只出事件不写文件。
- 真实「无会话」态与真实「无投影 404」态：前者被默认 `activeId=main` 掩盖，后者因所有会话都有投影而不可达，二者均只用请求拦截合成。
- 归档会话中卡片只读在 8787 库无归档含卡片的会话，该子项在 mock 副本上构造。

## 7. 复现步骤

1. 启动被测服务：`$env:SIMO_HOME='E:\dsh_home\workspaces\agent\data'`，`backend\simo-8787-conv5.exe serve -addr 127.0.0.1:8787 -model real`，`GET /api/health` 应 200。
2. 启动浏览器：`chrome.exe --headless=new --remote-debugging-port=9223 --user-data-dir=.tmp/accept5/chrome --window-size=1440,900`。
3. 侧栏与计数：`node .tmp/accept5/probe_ui1.mjs`、`probe_ui4.mjs`；右栏：`probe_ui2.mjs`、`probe_ui3.mjs`；双标签：`probe_ui4b.mjs`、`probe_ui10.mjs`、`probe_ui11.mjs`；链路：`probe_ui7.mjs`、`probe_ui7b.mjs`、`probe_ui7c.mjs`；消息/复制/卡片：`probe_ui6a.mjs`、`probe_ui6d.mjs`；CRUD：`probe_ui6b.mjs`、`probe_ui6e.mjs`；未读：`probe_ui12g.mjs`；断线：`probe_ui9.mjs`、`probe_ui9b.mjs`、`probe_ui9c.mjs`；API 契约：`probe_api.mjs`、`probe_api4.mjs`。
4. mock 流式与发送路径：启动第二个实例 `serve -addr 127.0.0.1:8788 -model mock`（`SIMO_HOME=.tmp/accept5/mockdata`），跑 `probe_ui5.mjs`、`probe_ui5c_unread.mjs`。
5. 串行前端全量：在 `frontend/` 下 `node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=1`，结果见 `.tmp/accept5/logs/vitest-serial2.log`。
6. 数据复原：按第 8 节执行删除与 unarchive，最终 `sessions=15`、`messages=209`、`archived=0`。

## 8. 本轮数据变更

| 变更 | 内容 | 复原方式 | 状态 |
|---|---|---|---|
| 备份 | `.tmp/accept5/simo.db.pretest.bak`（15 会话 / 209 消息 / 9201 events） | 保留作对照 | 未删除 |
| scratch 会话 | `sess-accept5-bulk`（120 条+1）、`sess-accept5-purity`（2 可见+1 internal）、`sess-accept5-unread`（1+1+1，读游标）、`sess-af7c0bbd2aeaf4df`（ACCEPT5-REAL403，2 条）、`sess-accept5-cycle-a/b`、`sess-accept5-empty`、`sess-accept5-readcheck` 消息 | 已删 6 个 scratch 会话及其 messages / read_cursors / message_cards；`sess-accept5-empty` 在第一次重启时被 `cleanupEmptySessions` 清理 | 已复原 |
| 归档 | 测试期归档 `sess-8f146ad51a243c91`（probe-archive-mwqn8oz1） | `UPDATE sessions SET archived=0` | 已复原 |
| 置顶 | 测试期 `POST /pin` 置顶 `sess-accept5-bulk` | 随 scratch 会话删除 | 已复原 |
| 重命名 | 测试期把 `sess-accept5-purity` 改为乱码（PowerShell cp1252）后复原、再改名用于失败注入 | 随 scratch 会话删除 | 已复原 |
| 读游标 | 对 `sess-accept5-unread` 调 3 次 POST read、重置游标后再次标记 | 随 scratch 会话删除 | 已复原 |
| 三次重启 | job `pwsh-2ca38b100a9c4bc2`、`pwsh-b2ad466d35134d88`、`pwsh-b4e3e95a001a4839` | 当前 8787 由 `pwsh-b4e3e95a001a4839` 提供 | 保持运行 |
| event 行 | 测试期间 API 调用新增约 20 条 events（9201→9221） | 未删除，保留作审计；不影响 UI 与统计 | 保留 |
| mock 库 | `.tmp/accept5/mockdata/simo.db` 上提交卡片、发消息、改名、归档、置顶 | 一次性副本，不使用即弃 | 未清理 |

复原后 8787 实测：`sessions=15`、`messages=209`、`archived=0`、`stats.totals.messages=209`、无 scratch 残留；页面 15 行、底部 `15 个会话 · 归档 0 · 209 条消息`，截图 `.tmp/accept5/shots/accept5-ui15-restored-8787.png`。

# ACCEPT-CONV-4 验收报告（2026-11-22）

**签字结论：不能签。** 31 条 AC 中 13 条通过、1 条失败、9 条部分通过、7 条未验证、1 条因环境限制未验证。上一轮 6 条 fail 全部复现通过，修复成立；新发现 `AC-CONV-008-02` 失败（已完成组 6 条任务只显示 3 条，展开后仍标 `3/3`），另有 16 条 AC 存在未覆盖子项，真实模型流式被 403 阻断。

## 1. 环境与证据

后端为 `backend/simo-8787-final.exe`，本轮中途 PID 31004 被杀后重启为 PID 40036，health 200，`build-id=mwqo5cyi-ebk9w` 与重启前一致。浏览器经 CDP 9223 驱动（Chrome PID 14052），视口 1440×900、390×844（coarse 指针）、375×812。所有造数走 `POST /api/chat`、`POST /api/sessions`、`PATCH /api/sessions/{id}` 等 API，没有直接改库。探针脚本在 `.tmp/accept4/*.mjs`，结构化结果在同目录 `*.json`，截图在 `docs/testing/accept-conv4-*.png`。

真实模型流式不可用：后端日志记录 `请求模型失败: Post "https://api.deepseek.com/chat/completions": Forbidden`，回复以 `status=error` 结束，没有 `reply.delta`。相关 AC 只记环境限制，不判通过也不判失败。

文中数字都是对应探针执行时的快照。验证过程中又向主会话发了若干条测试消息，所以消息数从 69 增到 75、全局徽标从 195 增到 209，后文按各探针的原始快照引用。

## 2. 31 条 AC 判定

| AC | 判定 | 证据形式 | 路径或命令 | 备注 |
|---|---|---|---|---|
| CONV-001-01 | 通过 | CDP 实测 | `.tmp/accept4/misc.json` | 探测时验收序C 36 条、主会话 69 条，切换后中栏数量与内容对应；侧栏 14 行与底部 15 会话口径不同，见疑点 1 |
| CONV-001-02 | 未验证 | CDP 部分实测 | `.tmp/accept4/remaining.json` | tree 与 stats 同时失败时侧栏「会话加载失败」、底部「统计加载失败」、计数 `—`；空态、加载态、循环父链本轮未构造 |
| CONV-001-03 | 通过 | API+CDP | `.tmp/accept4/misc.json` | 主会话归档 409 `main_session_protected`，主会话行无 `.session-more` 与菜单；其他会话可归档，unarchive 200 |
| CONV-001-04 | 通过 | CDP+API | `.tmp/accept4/fixups.json` | 置顶后 `验收序B` 升到主会话之后，菜单变「取消置顶」，取消后原序恢复；fixups 已排除首轮点击错行 |
| CONV-002-01 | 部分通过 | CDP+杀进程重启 | `.tmp/accept4/fails.json`、`reconnect2.json` | 归档行「恢复」命中并成功（archived=0、行消失）；置顶与归档态跨杀进程重启保持；创建与重命名本轮未重跑，归档只读未验 |
| CONV-002-02 | 通过 | CDP 失败注入 | `.tmp/accept4/fixups.json` | 拦截 `POST /api/sessions` 后出现两处可见「网络请求失败，请检查连接后重试」，列表行数 15 不变，无乐观插入 |
| CONV-003-01 | 通过 | CDP+API | `.tmp/accept4/misc.json` | 搜索「验收链」返回 L4/L3/L2 三行，祖先与命中项齐全 |
| CONV-003-02 | 通过 | CDP 失败注入+API | `.tmp/accept4/fixups.json`、`remaining.json` | 搜索失败显示「搜索失败，请重试」与重试按钮，不出现「没有匹配」；未读点刷新后 true、点开后刷新 false |
| CONV-003-03 | 通过 | API 抓包+源码 | `.tmp/accept4/misc.json` | 搜索请求为 `GET /api/sessions?q=...`，参数与结果一致 |
| CONV-004-01 | 部分通过 | CDP 实测 | `.tmp/accept4/remaining.json` | 失败回复 8 个 `.badge.danger` 文本「失败」，附「回复生成失败，未返回内容。」与「重试」；角色渲染由 004-03 覆盖，分类、复制、代码块本轮未重跑 |
| CONV-004-02 | 未验证 | — | — | Clipboard 降级、卡片失败、internal 消息隐藏本轮未构造 |
| CONV-004-03 | 通过 | API+DOM | `.tmp/accept4/remaining.json`、`verify4.json` | 全库 203 条消息 role 仅 user/agent，status 仅 done/error；主会话 DOM 75 条消息中 `from-user` 35、`from-agent` 40、去重 messageId 75，两类角色各出现且无第三种 |
| CONV-005-01 | 环境限制未验证 | 后端日志 | `.tmp/accept4/serve-restart.log` | `api.deepseek.com` 返回 403，无 `reply.delta`；乐观出现/流式/done/清空的流式段无法判定 |
| CONV-005-02 | 通过 | CDP 失败注入+WS 抓帧 | `.tmp/accept4/fails.json`、`probe-since-2.json` | 拦截 `/api/chat` 失败后 textarea 保留原文、`.composer-error` 显示网络错误、UI 与 API 消息数不变；恢复后重发成功；发送中按钮禁用 |
| CONV-006-01 | 部分通过 | CDP 键鼠+localStorage | `.tmp/accept4/misc.json` | Enter 发送、Shift+Enter 换行、模式切换写 `simo.composer.sendMode=shift-enter` 且刷新保持；Ctrl/Meta 发送未测 |
| CONV-006-02 | 部分通过 | CDP 失败注入 | `.tmp/accept4/misc.json` | 空文本禁用发送、Enter 失败保留 `KEY-ENTER-TEST`；IME 组合输入与超长文本未测 |
| SYNC-001-01 | 部分通过 | WS 帧抓取 | `.tmp/accept4/probe-since-2.json` | subscribe 帧 `since` 为数字 9148/9149，无 `msg-`；直连 `?since=9148` 回放 `session_read` id=9149；双端并行标签未复验 |
| SYNC-001-02 | 部分通过 | WS 帧+杀进程重启 | `.tmp/accept4/reconnect2.json` | 状态先「就绪」、再「重连中」、最后回到「就绪」，重连 subscribe 带 `since=9190`，重启后事件 9191 到达且页面可见；归档报错与残留流式恢复失败未验 |
| SYNC-002-01 | 未验证 | — | — | 双标签 active/祖先/未读跟随本轮未开第二页 |
| SYNC-002-02 | 未验证 | — | — | 同 `at` 冲突 tiebreak 未注入构造 |
| SYNC-003-01 | 通过 | CDP+localStorage | `.tmp/accept4/misc.json` | 切换模式即时生效，刷新后 `aria=true` 与 localStorage 一致 |
| SYNC-003-02 | 未验证 | — | — | 双标签与无 BroadcastChannel 场景未构造 |
| SYNC-004-01 | 通过 | API+DOM | `.tmp/accept4/misc.json` | 未读点出现、点击后消失、刷新后仍为已读，未读状态与接口返回一致 |
| SYNC-004-02 | 部分通过 | CDP+重启 | `.tmp/accept4/reconnect2.json` | 刷新与重启后游标继续、页面补到 75 条；跨标签游标未测 |
| SYNC-004-03 | 未验证 | — | — | 会话级持久化读游标未构造多会话读模型 |
| CONV-008-01 | 部分通过 | API+CDP | `.tmp/accept4/recon.json` | 三组在 `taskLimit=3/50` 两次读取下与接口一致，rev 34；无投影的「暂无会话投影」占位未构造，草稿投影显示「目标待生成」 |
| CONV-008-02 | **失败** | API+CDP 点击 | `.tmp/accept4/remaining.json`、`verify4b.json` | `done.total=6/items=3`、`pending.total=4/items=3`；点击「已完成」展开后仍只有 3 条、标题仍 `3/3`；点击「汇总本周进展」只让一条 agent 消息闪一下，未独立确认该 messageId 正确；下载（Browser 事件）与无提交/重试/取消通过 |
| CONV-008-03 | 部分通过 | CDP 实测 | `.tmp/accept4/misc.json`、`remaining.json` | 375px 下 inspector `display:none`、不遮挡 Composer，草稿投影显示「目标待生成」；加载态与无会话态未构造 |
| CONV-008-04 | 通过 | API 实测 | `.tmp/accept4/remaining.json` | `taskLimit=0` 与 `999` 均 400 `invalid_task_limit`，缺会话 404 `not_found`，`If-None-Match` 命中返回 304 空体 |

## 3. 上一轮 6 条 fail 逐条复核

| 上轮 fail | 本轮做法 | 结果 | 判定 |
|---|---|---|---|
| AC-CONV-002-01 归档行「恢复」被遮挡 | 打开归档行菜单，用 `elementFromPoint` 取按钮中心，再真实点击 | 命中 BUTTON 文本「恢复」；`.session-menu` z-index 40、归档行 30；点击后 API `archived=0`、`.is-archived` 行消失、菜单关闭 | 修复通过 |
| AC-CONV-004-01 回复失败无徽标 | 读取主会话 69 条消息，统计 `.badge.danger`，滚入视口点击「重试」 | 8 个「失败」徽标，失败气泡含「回复生成失败，未返回内容。」与「重试」；重试点击未发 `POST /api/chat`，只把上一条用户文本「失败保留」填回输入框 | 徽标修复通过；重试语义另记风险 |
| AC-CONV-005-02 发送失败清空输入 | Fetch 拦截 `/api/chat` 返回失败，输入 `ACCEPT4-SENDFAIL-1795283069511` 后发送 | textarea 保留原文，`.composer-error` 显示「网络请求失败，请检查连接后重试」，UI 与 API 消息数均 34 不变；解除拦截重发后落库 | 修复通过 |
| AC-CONV-006-02 同因（失败恢复输入） | 同上，另用 Enter 提交 `KEY-ENTER-TEST` | 仅 1 次请求，textarea 保留 `KEY-ENTER-TEST` | 修复通过 |
| AC-SYNC-001-01 `since` 游标用 `msg-…` | 抓 `Network.webSocketFrameSent`，并直连 WS 回放 | 切会话 subscribe 为 `{"sessionId":"sess-cbb0858dc72e5e27","since":9148}`，切回主会话为 `since:9149`；直连 `?since=9148` 收到 `session_read` id=9149 | 修复通过 |
| AC-SYNC-001-02 重连后 `since` 仍错 | 先收事件至 id=9190，杀 PID 31004 并重启，观察重连帧与补发 | 状态在 0 秒为「就绪」、6.2 秒为「重连中」、21.0 秒回到「就绪」；重连 subscribe 带 `since:9190`；重启后 POST 的事件 9191 到达，消息从 73 增到 75 且页面可见 | 修复通过 |

## 4. 上一轮 9 条疑点结论

| 疑点 | 结论 | 依据 |
|---|---|---|
| 侧栏数与统计口径 | 已解决 | recon 时头部 `14` 为当前可见（`当前可见 14 个会话（归档 1 个）`），底部 `15 个会话 · 归档 1 · 195 条消息` 含归档；API 扁平 15、去重 15；恢复测试把归档行恢复后变为可见 15 行、`归档 0`，差异来自同一套可见/全量口径 |
| 行徽标显示全局消息数 | 仍存在 | 15 行中只有当前选中行显示 `.session-count`，主会话为 `209`（全局统计），不是该行 75 条；其他行无徽标 |
| 时间轴命中宽度 | 已解决 | coarse 指针下 `.tl-bar::after` 实测 48×44、pitch 44，±21px 命中同一 bar；spec 组件裁决 A7 明确细指针未实测、不列缺口 |
| 深度 ≥2 可见性 | 已解决 | L1/L2/L3/L4 四行全可见，`paddingLeft` 24/40/56/72 随深度递增，无截断 |
| tree 子项重复 | 已解决 | API 扁平 15、unique 15、DOM 15 行，无重复渲染 |
| 44px 仅 coarse 生效 | 已解决 | 实现按 `@media (pointer: coarse)` 生效，与组件 spec 的指针裁决一致；细指针视觉 20×4 不满足 44×44 字面，但 A7 已排除该缺口 |
| 右栏展开不补取 | 仍存在 | `taskLimit=3` 返回 items=3/hasMore=true；点击「已完成」展开后仍 3 条、标题仍 `3/3`，`done.total=6` 的后 3 条不可见，`pending.total=4` 只显示 3 条 |
| 下载无网络事件 | 已解决 | `Browser.downloadWillBegin` 命中 `/api/artifacts/art-weekly-report/content?download=1`，`weekly-report.md` 101 bytes、progress completed；下载不走 fetch，无 `requestWillBeSent` 属机制而非缺陷 |
| 创建失败内联而非 toast | 已解决 | 拦截创建请求后出现可见内联错误且列表不变，满足 AC-002-02「可见反馈」；spec 未要求 toast |

## 5. 未验证项与原因

- **真实模型流式（AC-CONV-005-01）**：`api.deepseek.com` 返回 403，后端记 `Forbidden`，没有 `reply.delta`。需要可用的模型通道或本地假模型。
- **AC-CONV-001-02 空态/加载态/循环父链**：循环父链没有可用的 API 构造路径，空会话态会破坏现有造数，本轮未做。
- **AC-CONV-004-02 剪贴板降级、卡片失败、internal 消息**：未授予剪贴板权限，也未构造 internal 消息。
- **AC-CONV-007-02 413/403、空上级、重复渲染**：超长父链与越权会话未构造。
- **AC-SYNC-002-01 / SYNC-003-02 双标签**：本轮未开第二标签页，未验证 BroadcastChannel 与 active/未读跟随。
- **AC-SYNC-002-02 同 `at` 冲突**：需要同毫秒注入两条事件，未构造。
- **AC-SYNC-004-03 会话级读游标**：未构造跨会话读模型。
- **AC-CONV-002-01 创建与重命名、归档只读**：本轮只复验了恢复与重启保持。
- **AC-CONV-006-01/02 的 Ctrl/Meta 发送、IME 组合、超长文本**：未测。
- **AC-CONV-008-03 加载态、无会话态**：需要可控的挂起接口或删除主会话，本轮未做。
- **AC-CONV-008-01 无投影占位**：没有构造出 projection 为空的会话，只验证了草稿占位。

## 6. 风险与签字条件

右栏「重试」只回填上一条用户文本、不发请求，源码 `frontend/src/components/library.tsx:595` 注释说明后端没有回复级重试接口；这满足「失败徽标」但容易让用户误以为已重试，建议在按钮文案或行为上消除歧义。

签字前需要完成三件事。第一，修复 AC-CONV-008-02：展开时按 `total` 补取剩余任务，或在折叠态显示真实总数而不是 `3/3`，并复验展开后 6 条全部可见。第二，补齐 16 条部分通过或未验证 AC 的证据，其中 7 条完全未验证，重点是双标签、同 `at` 冲突与会话级读游标。第三，真实流式拿到可用模型通道后补测；届时应单独记录 403 的日期与环境。

本轮 build `mwqo5cyi-ebk9w` 的上一轮 6 条 fail 修复全部成立，CSS 与渲染改动没有破坏已复验的 13 条 AC。

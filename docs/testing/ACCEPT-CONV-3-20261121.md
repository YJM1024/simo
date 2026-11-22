# P1-CONV 第三轮验收报告（2026-11-21）

验收对象是 8787 上新构建的 `backend/simo-8787-2330.exe`（22,070,784 字节，2026-11-21 23:26:22），验收面为 `specs/test/P1-CONV/test-plan.md` 中 31 条生效 AC。结论是**不能签字**：31 条里 23 条通过、6 条 fail、2 条未验证，另有 9 条疑点没有判 fail 但需要处理。6 条 fail 都有可复现的最小操作和期望/实际对照，其中恢复入口被后续行遮挡、发送失败丢输入、回复失败无徽标、`since` 游标类型错误均在本轮实测中稳定复现。

## 验收环境与方法

开工时交底的实例已经停止，8787 只有 TIME_WAIT。我用同一个 exe 在 `SIMO_HOME=E:\dsh_home\workspaces\agent\data` 下重新启动（默认 `%USERPROFILE%\.simo` 在沙箱里不可写），共重启 4 次用于验证重启持久化；最后一次是后台任务 `pwsh-d69768a54af44ac1`，PID 11520，日志 `.tmp/accept3/serve-2330e.log`，健康检查 `GET /api/health` 返回 `{"ok":true,"ready":true,...}`。浏览器复用既有 CDP 9223（Chrome 157.0.8103.80），每个用例都新开页面真实点击、真实键入，没有使用 jsdom 结论代替页面验证。

测试套件我自己重跑：后端 `..\toolchain\go.ps1 test ./... -count=1 -v` 得 PASS=298、FAIL=0、SKIP=1（唯一 skip 是既有的 `TestResolveToolPathCanonicalizesWorkspaceRoot`，原因是 symlink 权限），日志 `.tmp/accept3/be-test-v.log`；前端 `node node_modules/vitest/vitest.mjs run --pool=threads --reporter=verbose` 得 18 文件 / 171 用例全过，日志 `.tmp/accept3/fe-test-v.log`。交底材料写的是后端 277 PASS，实测 298，前端 171 与交底一致。

造数据全部经 API：用 `POST /api/sessions {title,draft:false}` 建了 `验收序A/B/C`、`验收未读U/V`，再用 `POST /api/chat` 各发一条消息让它们不会在重启时被空会话清理；为验证 ≥2 级父链，用 `parentId` 建了 `验收链L2/L3/L4`（深度 2/3/4，均挂在 `研究员` 下）。没有改动 sqlite 里的任何会话状态。

复现命令模板（在 `E:\dsh_home\workspaces\agent` 下）：

```
& 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' .tmp\accept3\<脚本>.mjs
```

每个 CDP 脚本会在 `.tmp/accept3/` 落一份同名 `.json`（结构化结果）和 `.log`（过程输出），截图落在 `docs/testing/accept-conv3-*`。

## 判定表

| AC | 判定 | 证据形式 | 证据路径或命令 | 备注 |
|---|---|---|---|---|
| AC-CONV-001-01 | pass | 真 HTTP + CDP 点击/Enter | `.tmp/accept3/http-checks.log`；`.tmp/accept3/ui-g.json`；`.tmp/accept3/ui-fix.log` | 点击或聚焦后 Enter 选中 `验收序C`，主栏消息全部属于 `sess-cbb0858dc72e5e27`（6 条），上一会话无残留；底部统计 `10 个会话 · 161 条消息` 与 `/api/stats` 一致 |
| AC-CONV-001-02 | pass | CDP 遮挡请求 + HTTP + 重启日志 | `.tmp/accept3/ui-cold.json`；`.tmp/accept3/ui-states.json`；`.tmp/accept3/http-fail-probes.log`；`.tmp/accept3/serve-2330e.log` | 冷启动挂起 tree 时显示 `会话加载中…` 且计数为 `—`；tree 失败显示 `会话加载失败`+重试；统计失败显示 `统计加载失败` 与 `—`，不出现假 0；Escape 不落库；重启清理空会话 count=0。循环父链一项未验证，见末节 |
| AC-CONV-001-03 | pass | 真 HTTP + CDP 菜单 | `.tmp/accept3/http-checks.log`；`.tmp/accept3/ui-pin.log` | `POST /api/sessions/main/archive` 返回 409 `main_session_protected` 且带 `blockers`；主会话行没有 `.session-more`，菜单不存在；`main/unarchive` 200 且 archived=0；主会话后续 `POST /api/chat` 仍为 202 |
| AC-CONV-001-04 | pass | 真 HTTP 顺序断言 + CDP + 像素比对 + 重启 | `.tmp/accept3/http-checks.log`；`.tmp/accept3/ui-pin.json`（`pixelIdentical:true`）；`.tmp/accept3/ui-restart.log` | 默认同级序 C,B,A,R（新→旧）；置顶 A 后 A,C,B,R，其余相对序不变且 `parentId` 仍是 main；取消后恢复原序且侧栏截图字节一致；归档后置顶 409 `session_archived`；主会话/草稿无入口；重启后 pinned=true |
| AC-CONV-002-01 | **fail** | CDP 命中测试 + 事件注入对照 | `.tmp/accept3/ui-restore2.json`；`.tmp/accept3/ui-restore3.json`；截图 `docs/testing/accept-conv3-restore2-restore-01-after-mouse-click.png` | 最小复现：归档 `验收序B` 后打开其行菜单点“恢复”，不产生任何请求，B 仍 archived=1。`elementFromPoint` 在该按钮中心返回下一行的 `.session-more`；根因是 `.session-row.is-archived{opacity:.55}` 形成层叠上下文，绝对定位的 `.session-menu` 被困在其中。用 JS 直接 `.click()` 或注入 `opacity:1` 后同一坐标点击都能触发 `POST /unarchive`，说明处理器与接口正常，只有鼠标命中区被后续行覆盖 |
| AC-CONV-002-02 | pass | CDP 注入失败 + HTTP 幂等探测 | `.tmp/accept3/ui-chain2.json`；`.tmp/accept3/http-fail-probes.log`；`.tmp/accept3/ui-last.json` | 归档会话改名 409 → toast `请求失败（409），请稍后重试`，重命名输入框保留原文 `归档改名不该保存`；归档请求注入 500 → toast `请求失败（500），请稍后重试`，行数不变；新建注入 500 → composer 内联错误 `请求失败（500），请稍后重试`，列表与当前会话不变；重复提交用同一 `clientMutationId` 只落一条 |
| AC-CONV-003-01 | pass | CDP 网络监听 + 真实请求 | `.tmp/accept3/ui-search2.json`；`.tmp/accept3/ui-search-304.json` | 输入 `验收序` 触发 `GET /api/sessions?q=%E9%AA%8C%E6%94%B6%E5%BA%8F`，行按服务端 id 过滤；零本地命中时显示 `搜索中…`（请求被挂起）；无匹配显示 `没有匹配的会话`；只用正文关键词 `seed` 搜索返回 0 行 |
| AC-CONV-003-02 | pass | CDP 失败注入 + 双标签 + 重启 | `.tmp/accept3/ui-search-304.json`；`.tmp/accept3/ui-unread2.json`；`.tmp/accept3/ui-restart.json` | 搜索请求失败只出现 `搜索失败，请重试` 与重试按钮，不出现无匹配文案；重启后已读/未读状态与游标保持；一侧读完另一侧点消失 |
| AC-CONV-003-03 | pass | CDP 网络监听 + 真 HTTP | `.tmp/accept3/ui-search2.json`；`.tmp/accept3/api-tree-snapshot.mjs` | 只调 `GET /api/sessions?q=`，全程无 `/api/messages/search`；`q=验收链` 能命中深度 4 的子会话；归档 `验收序B` 后 `q=验收序B` 仍返回 archived=1 的该会话；搜索 URL 的 304 也命中 |
| AC-CONV-004-01 | **fail** | CDP 真实发送 + API 断言 | `.tmp/accept3/ui-states.json`；截图 `docs/testing/accept-conv3-states-states-01-reply-error.png` | 角色与分类标签、代码块不溢出、复制反馈、卡片状态均通过；**回复失败时没有失败徽标**：接口落库 `{role:agent,status:"error",text:""}`，页面 agent 气泡为空，`.badge` 为 null、重试入口为空。原因是 `frontend/src/components/library.tsx:232` 只认 `status==='failed'`，没有把 `error` 映射过去 |
| AC-CONV-004-02 | pass | CDP 剪贴板失败注入 + 卡片失败注入 + 源码/用例 | `.tmp/accept3/ui-chain2.json`；`.tmp/accept3/ui-last.json`；`.tmp/accept3/fe-test-v.log` | 让 `navigator.clipboard.writeText` reject 后点复制仍显示 `已复制` 且无异常，降级路径可用；卡片提交注入失败后 `.card-error` 可见、选择与备注保留、按钮变 `重试`，恢复后提交成功；归档会话输入禁用；`TestM78InternalCardDoesNotPolluteMessageStream`、`TestM79LegacyInternalMessagesHiddenFromAPI` 通过 |
| AC-CONV-004-03 | pass | 真 HTTP + CDP DOM + 编辑接口 | `.tmp/accept3/api-tree-snapshot.mjs`；`.tmp/accept3/ui-g.json`；`.tmp/accept3/http-fail-probes.log` | 全库消息角色只有 user/agent（161 条），页面 DOM 角色集合 `["user","agent"]`；3 条带卡片的消息仍渲染成卡片；`PATCH /api/messages/{id}` 返回 400 `edit_disabled` |
| AC-CONV-007-01 | pass | CDP 真实点击 + 条数/去重/顺序断言 | `.tmp/accept3/ui-chain2.json`；截图 `docs/testing/accept-conv3-chain2-chain2-01-ancestors.png` | 用标题搜索进入深度 4 的 `验收链L4`，点两次“显示上级会话”后消息 2→4→6，分组为 L2/L3/L4 三层；id 去重后仍 6 条、时间戳单调不减；时间轴 bar 数等于消息数；点击与 Enter/Space 均能跳转；切回会话清链且滚动位置保留 |
| AC-CONV-007-02 | pass | CDP 注入 413/403/空 + 真实发送 | `.tmp/accept3/ui-last.json`；`.tmp/accept3/ui-g.json` | 413 显示 `消息过多，暂不能完整加载` 且保留按钮，重试后 105 条正常；403 显示 `无权限读取该上级会话` 且发送按钮可用，`POST /api/chat` 202、消息 +2；空祖先显示 `上级没有消息` 并隐藏入口；无重复渲染 |
| AC-CONV-005-01 | **未验证** | 运行日志 + 测试日志 | `.tmp/accept3/serve-2330d.log`；`.tmp/accept3/be-test-v.log` | 乐观气泡、输入清空、终态停光标都实测到；但沙箱网络策略阻断 `api.deepseek.com`，每次回复都以 `status:error` 结束且没有任何 `reply.delta`，无法观察增量流与正常 done，停止按钮也到不了可用态。`TestP1ConvWSReplyLifecycleOrderAndDeltas` 通过但属 mock 路径 |
| AC-CONV-005-02 | **fail** | CDP 网络失败注入（两次独立复现） | `.tmp/accept3/ui-fix.log`；`.tmp/accept3/ui-send2.json`；`.tmp/accept3/ui-since2.json` | 最小复现：输入文本后让 `POST /api/chat` 失败，composer 显示 `网络请求失败，请检查连接后重试`，但 **textarea 被清空**，期望保留原文可重试。另：重复点击只产生 1 条用户消息；重连提示与回填正常，但 `since` 游标类型错误导致切换后实时推送失效，见 SYNC-001 |
| AC-CONV-006-01 | pass | CDP 真实键盘 + localStorage + 刷新 | `.tmp/accept3/ui-send.json` | Enter 发送、Shift+Enter 换行；切到 shift-enter 模式后 Enter 只换行、Ctrl+Enter 发送；按钮提示与 aria 同步；`localStorage['simo.composer.sendMode']` 持久，刷新后仍是 shift-enter |
| AC-CONV-006-02 | **fail** | CDP 组合输入 + 失败注入 + 长文本 | `.tmp/accept3/ui-send.json`；`.tmp/accept3/ui-fix.log`；`.tmp/accept3/ui-chain2.json` | IME 组字期间 Enter 被拦截且文本保留；归档/无会话禁用态清晰；1200 字长文本不截断、不溢出；**但发送失败后文本被清空**（同 AC-CONV-005-02 的复现），不满足“可恢复且文本保留” |
| AC-SYNC-001-01 | **fail** | 双页 CDP + 原始 WS 协议探针 | `.tmp/accept3/ui-since2.json`；`.tmp/accept3/ui-since.json`；`.tmp/accept3/ui-fix.log` | 两个客户端都能收到事件、单页事件 id 严格递增；但 `since` 续传失败：`frontend/src/app.tsx:430` 把消息 id（`msg-…`）写进 `lastEventId`，`api.ts:188` 原样作为 `since` 发给后端，后端 `chat/http.go:336` 只收 int64，返回 `{"code":"bad_request","message":"subscribe.data 非法"}`。用数字 `since` 直接连 WS 能回放 7 帧，证明后端回放正常、客户端游标类型错 |
| AC-SYNC-001-02 | **fail** | 真杀进程重启 + 网络拦截 + WS 帧 | `.tmp/accept3/ui-restart.json`；`.tmp/accept3/ui-since2.json` | 断线时状态变 `重连中`，恢复后回到 `已连接`，重连会整段重载历史；但重连后的 subscribe 仍带 `msg-…` 游标并被拒绝，之后另一个客户端发来的消息页面收不到且状态仍显示已连接。归档会话 chat 返回 409 已验证；陈旧 streaming 恢复为失败态未单独构造 |
| AC-SYNC-002-01 | pass | 双页真实点击 | `.tmp/accept3/ui-tabs.json` | 一页切到 `验收序C`，另一页 1.5 秒内跟随；一页展开祖先链后另一页同样变成 93 条、两组；切换发送方式也同步；无重复消息与来回抢占 |
| AC-SYNC-002-02 | **未验证** | 降级探针 + 用例日志 | `.tmp/accept3/ui-fix.json`；`.tmp/accept3/fe-test-v.log` | 无 BroadcastChannel 时页面正常渲染、无异常与报错，另一页的发送方式仍通过 storage 事件到达（降级成立）；同 `at` 冲突的确定性取舍与重复广播不叠加没有构造，无法判定 |
| AC-SYNC-003-01 | pass | CDP 切换 + 刷新 | `.tmp/accept3/ui-send.json` | 点提示图标后当前页提示、aria、实际键位立即切换，刷新后保持 |
| AC-SYNC-003-02 | pass | 双页 + 移除 BroadcastChannel | `.tmp/accept3/ui-fix.json` | 禁用 BroadcastChannel 的页面没有报错，另一页切换发送方式后该页在 1.5 秒内变为一致状态 |
| AC-SYNC-004-01 | pass | 真 HTTP 发消息 + 双页 DOM | `.tmp/accept3/ui-unread2.json` | 非当前会话收到真实新消息后两侧都出现未读点，主会话没有；进入后点立即消失，返回原会话不再出现；刷新与重启后保持 |
| AC-SYNC-004-02 | pass | 重启 + 跨页已读 + 写失败注入 | `.tmp/accept3/ui-restart.json`；`.tmp/accept3/ui-unread2.json`；`.tmp/accept3/ui-g.json` | 重启后已读不复活、未读不丢；另一页读完后本页点被 `session_read` 清掉，无幽灵未读；`POST /read` 失败时点保留并 toast `标记已读失败：…`，故障解除后再进入即清除 |
| AC-SYNC-004-03 | pass | 真 HTTP + 双页 + 重启 | `.tmp/accept3/ui-unread2.json`；`.tmp/accept3/ui-restart.log` | 读游标是会话级、后端持久化、跨标签共享；页面上没有全站未读数字，只有每个会话一个两态点 |
| AC-CONV-008-01 | pass | CDP 读右栏 + 真 HTTP 对照 | `.tmp/accept3/ui-main.json`；`.tmp/accept3/ui-states.json` | 状态区显示 `已完成 rev 26 待确认 1`，与 `GET /api/sessions/main/spec-projection?taskLimit=3` 的 `revision:26, status:completed, pending:1` 一致；分组为 目标/输入/执行会话；无投影时显示 `暂无会话投影` |
| AC-CONV-008-02 | pass | CDP 点击 + 下载目录校验 | `.tmp/accept3/ui-states.json`；`.tmp/accept3/ui-tabs.log`；截图 `docs/testing/accept-conv3-states-states-05-task-jump.png` | 点 `汇总本周进展` 后对应 `msg-a1` 出现 `is-flash` 并滚动到可视区；组头可展开/收起；点下载后 `weekly-report.md`（101 字节）出现在下载目录；右栏无提交/重试/取消入口 |
| AC-CONV-008-03 | pass | CDP 四态 + 375px 布局测量 | `.tmp/accept3/ui-states.json`；`.tmp/accept3/ui-main.json`；截图 `docs/testing/accept-conv3-main-main-05-375.png` | 加载 `右栏加载中…`、失败 `右栏加载失败`+重试、无投影 `暂无会话投影` 均正常且不崩；375px 下右栏 `display:none`，composer 与发送按钮可见可点且无横向溢出。“无会话”态不可达，见末节 |
| AC-CONV-008-04 | pass | 真 HTTP + CDP 注入 304 | `.tmp/accept3/http-checks.log`；`.tmp/accept3/ui-last.json` | `taskLimit=0` 返回 400（错误码在 `error.code=invalid_task_limit`）、缺会话 404、带 `If-None-Match` 返回 304 空体；给 projection 注入 304 后右栏保留原内容、不闪空也不报错。前端从不给 projection 发条件头，见疑点 |

## 发现但未判定为 fail 的疑点

1. 侧栏会话数与统计不一致。侧栏标题右侧计数是 `7`（只统计根加一级子会话），页面底部统计是 `10 个会话`，接口 `GET /api/sessions/tree` 与 `/api/stats` 也是 10。原因是侧栏只渲染 `sessions` 顶层项及其 `children`，深度 ≥2 的会话不参与计数与渲染（`frontend/src/components/library.tsx:140-146`）。

2. 活跃会话行的消息数徽标显示全局总数。`主会话` 自身 69 条、`研究员` 38 条，切到两者时行内徽标都显示 `161`；来源是 `frontend/src/app.tsx:803` 把 `statsTotals?.messages` 当作 `messageCount` 传给 Sidebar。这个数字看起来是“当前会话消息数”，实际是全部会话合计，切换不变化。

3. 深度 ≥2 的会话在侧栏不可见。`验收链L2/L3/L4` 在树里存在（深度 2/3/4），侧栏只显示 7 行；只能通过标题搜索找到并进入。产品 spec 没有要求侧栏展示超过一级，但这意味着祖先链场景只能由 API/夹具数据触发，UI 本身产不出来。

4. 时间轴命中区名义 44×44、实测 42×44。`.tl-bar::after` 是 44×44，但 `.timeline` 宽 44px 且 `overflow:hidden`，左侧 2px 被裁掉；相邻 bar 的伪元素在 44px 间距下首尾相接，没有间隙。`elementFromPoint(259,405)` 落在外层 `chat-body`，`(301,405)` 与 `(280,426)` 命中 bar。执行行 6/6 实测 44px，达标。

5. 44px 只在 `pointer: coarse` 下生效。桌面指针环境下 exec 行 28px、时间轴条 20×4、行菜单按钮 20×20 且默认透明，需要悬浮才出现。产品 AC 没有写 44px，这是 test-plan 缺口注记的口径问题。

6. 右栏任务组展开不会补取数据。`taskLimit=3` 只拉到每组最多 3 条，展开“已完成 3/3”不产生新请求也不增加行，展开只是显示已取到的条目。

7. 交付物下载没有页面网络事件。点击 `下载` 后下载目录出现文件，但 `Network.requestWillBeSent` 没有记录到对应请求；文件层面已证明可用，网络层面证据缺失。

8. `GET /api/sessions/tree` 把同一子会话同时放在 `main.children` 和顶层数组里（顶层 10 条、去重后 10 个 id），任何遍历都要按 id 去重，否则会把子会话统计两遍。

9. 创建会话失败走 composer 内联错误而不是 toast。AC-CONV-002-02 只要求“可见错误反馈”，内联红字满足；如果产品口径要求统一 toast，需要改。

## 未能验证的项及原因

1. AC-CONV-005-01 的流式增量、正常 `done`、停止按钮。沙箱网络策略阻断模型端点，服务日志持续出现 `请求模型失败: Post "https://api.deepseek.com/chat/completions"`，所有回复以 `status=error` 结束；需要能访问模型的网络环境或用可控 mock 服务端重跑。后端 `TestP1ConvWSReplyLifecycleOrderAndDeltas` 只覆盖 mock 路径，不能替代真实增量观察。

2. AC-SYNC-002-02 的同 `at` 冲突取舍与重复广播不叠加。没有构造两个标签同时广播同一 `at` 的竞争场景；无 BroadcastChannel 的降级部分已验证。

3. AC-CONV-001-02 的循环父链拒绝。当前 `PATCH /api/sessions/{id}` 只接受 `title`，传入 `parentId` 会得到 400 `标题不能为空`；本阶段也没有换父接口，因此无法经 API 造环。源码有环保护的旁证（`backend/internal/modules/sessions/service.go:84-92` 的根兜底、`draft.go:108-117` 的向上找根），但没有运行期证据；直接改 sqlite 造环违反本轮验收纪律。

4. AC-CONV-008-03 的“无会话”状态。应用启动后必然选中 `main`，即使清空所有子会话也无法进入零会话界面，因此这一分支没有运行期证据，只有组件用例覆盖。

5. AC-CONV-004-02 中“内部消息绝不出现在 API/流”的端到端注入。API 角色扫描只看到 user/agent，后端有 `TestM78InternalCardDoesNotPolluteMessageStream`、`TestM79LegacyInternalMessagesHiddenFromAPI` 通过，但我没有在运行中的库里构造内部消息做一次真实注入回放。

## 签字结论

不能签字。通过 23 条、fail 6 条、未验证 2 条，且 fail 里 4 条是用户可感知的功能缺陷：归档会话的“恢复”菜单项被后续行遮挡点不到（AC-CONV-002-01）；发送失败后输入被清空（AC-CONV-005-02、AC-CONV-006-02）；回复失败没有失败徽标与重试入口（AC-CONV-004-01）；`since` 游标类型错误导致切换会话或重连后的实时推送失效（AC-SYNC-001-01、AC-SYNC-001-02）。

签字前需要：修复 `.session-row.is-archived` 的层叠上下文（例如菜单挪到行外或用 `isolation:isolate` 与更高的浮层容器）；把后端 `status:"error"` 映射到失败徽标并补重试入口；发送失败时恢复 textarea 原文；把 `lastEventId` 改成 WS 信封的数字事件 id 并在重连时检查订阅错误。修完后需要重跑本报告的定向脚本（`ui-restore2`、`ui-fix`、`ui-states`、`ui-since2`）与前后端全量，才能进入签字。未验证的 2 条需要能访问模型端点的环境或可控 mock 后补验，否则不能按 pass 记。

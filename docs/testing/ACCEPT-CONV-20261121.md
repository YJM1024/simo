# 验收记录：未读持久化 / 标题搜索 / 主会话不可归档 / 生命周期失败反馈（ACCEPT-CONV-20261121）

- 验收角色：独立验收子智能体 `accept-conv`（只复核，不改源码、不改 spec、不 commit、不删移文件）
- 验收时间：2026-11-21 21:10–21:35（Asia/Shanghai）
- 验收对象：`E:\dsh_home\workspaces\agent` 工作区当前源码 + 本次重建二进制 `backend/simo-8787-2113.exe`
- 测试数据：`E:\dsh_home\workspaces\agent\.tmp\accept\home`（从用户 `data/` 复制的 simo.db + wal/shm；**用户真实 `data/` 未被本次验收修改**，见 §2.5）
- 证据根目录：`.tmp/accept/`（日志/截图/脚本）；关键截图已复制到 `docs/testing/ACCEPT-*.png`

> 术语：pass 必须同时具备「操作/命令 + 输出原文或截图 + 时间」。`skipped`、`mock 断言替代联调`、`未联调` 都不判 pass。本次所有 UI 断言均打在 8787 真实后端（`-model mock` 仅替代模型推理），不是 mock 后端。

---

## 1. 判定表

| AC | 结果 | 证据 | 一句话 |
|---|---|---|---|
| AC-SYNC-004-01 | **partial** | `.tmp/accept/http-evidence.log:phase1/phase2`；`ACCEPT-unread-dot-main-no-menu.png`；`ACCEPT-live-unread-missing.png`；`.tmp/accept/cdp-gap-evidence.json` | 未读点渲染、进入即读、重启恢复、切回不复发都成立；但「非 active 会话收到新消息后行上出现未读点」**不实时**，需手动刷新（D1） |
| AC-SYNC-004-02 | **partial** | 同上 + `.tmp/accept/cdp-ghost.log`；`g1–g3` | 重启/刷新/跨标签按游标恢复、写失败不显示假已读均成立；但列表未刷新时点进未读会话**不补发 read**（D1 的后果，幽灵未读风险），故 -02 不能整条 pass |
| AC-SYNC-004-03 | **partial** | `http-evidence.log`；`cdp-accept3.log`（`session_read` 帧）；`g2/g3` | 任一标签已读 → 全部标签清除、游标落库、无全站汇总数字成立；非 active 新消息实时未读点缺失，违反本 AC 首句 |
| AC-CONV-003-01 | **pass** | `http-evidence.log`（`q=研究员` 命中子会话；正文词 0 命中）；`cdp-accept3.log`（仅 `/api/sessions?q=`，`messageSearchSeen:false`）；`a5/a6` | 搜索只匹配标题、含子会话、不调消息搜索、搜索中/无匹配空态均实测通过 |
| AC-CONV-003-02 | **partial** | `ACCEPT-search-failure-misreport.png`；`.tmp/accept/cdp-gap.log` | 失败时有错误 toast；但列表同时被置空并显示「没有匹配的会话」，正是 AC 明令禁止的「把失败误报为无匹配」 |
| AC-CONV-003-03 | **partial** | 同上 + `a5/a6` | 端点正确、不再调 `/api/messages/search`、空提示/搜索中成立；失败态误报 + 无重试控件，失败条款不满足 |
| AC-CONV-001-03 | **partial** | `http-lifecycle2.log`；`a1/a7`；`http-evidence.log` 409 原文 | 无归档入口、409 `main_session_protected`、unarchive 200 no-op、其他会话可归档、仍可对话均通过；但 spec 明示的 `blockers` 字段未实现（D3） |
| AC-CONV-002-02 | **partial** | `a8` 重命名失败；`a9` 归档失败；`cdp-accept3.log`；`http-lifecycle2.log` | 重命名/归档失败 → `role="alert"` toast + 输入保留 + 未落库，成立；创建/恢复失败与「重试不产生重复/脏数据」未覆盖 |

**总体：0 条可整条升 verified？不，AC-CONV-003-01 可以。** 其余 7 条 partial，见 §5 结论。

---

## 2. 环境、产物与进程

### 2.1 重建二进制

```powershell
# 前端产物（沙箱禁管道：原 build.mjs 的 spawnSync pipe 报 EPERM，改用 stdio:inherit 的等价脚本）
$node = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
& $node E:\dsh_home\workspaces\agent\.tmp\accept\build-frontend.mjs *> .tmp\accept\build.log
# buildId mwqfhab6-wqjd4；app.js 295.0kb；sha256 8abd7e8c44809d94fd1f75c62dddb0fcf4d2612188e4d302d282d47a3b7bcef3

# 后端（deploy/ci.ps1 同款参数）
cd E:\dsh_home\workspaces\agent\backend
& ..\toolchain\go.ps1 build -trimpath -buildvcs=false -ldflags '-s -w' -o simo-8787-2113.exe ./cmd/simo
```

- 产物：`backend/simo-8787-2113.exe`，**15,204,864 B**，2026/11/21 21:13:23（新文件；旧 `simo-8787-2044.exe` 22,029,824 B 原样保留，未覆盖）。
- 二进制内容校验：`main_session_protected`、`/read`、`session_read`、`hasUnread` 四个字符串均 FOUND（node 读文件 indexOf）。
- 说明：go build 输出直接回显（未单独落 `.log`），产物时间戳 + 上述二进制字符串 + 后续 HTTP 行为为证。

### 2.2 运行进程

```powershell
$env:SIMO_HOME='E:\dsh_home\workspaces\agent\.tmp\accept\home'
& 'E:\dsh_home\workspaces\agent\backend\simo-8787-2113.exe' serve -addr 127.0.0.1:8787 -model mock *> 'E:\dsh_home\workspaces\agent\.tmp\accept\serve2.log'
```

当前监听：`netstat -ano | Select-String ':8787'` → `TCP 127.0.0.1:8787 ... LISTENING 6692`；`Get-Process -Id 6692` → `simo-8787-2113`，StartTime 2026/11/21 21:16:40（重启后的实例）。`GET /api/health` → `{"ok":true,"ready":true,"checks":{"db":"ok","modules":["sessions","chat","tasks","memory"]}}`。

### 2.3 重启验证的「停-起」事实

- phase1（21:16:22）跑完 → 停止进程（后台 job kill，端口释放）→ 21:16:40 新进程监听 → phase2（21:16:45）继续。见 `.tmp/accept/serve2.log` 与 `http-evidence.log` 的 `phase1 done` / `phase2 start`。

### 2.4 数据构造

- 未读用**真实 agent 消息**：`POST /api/chat` 写用户消息 → mock agent 回复落库（`role=agent`）→ 游标未推进 → `hasUnread=true`。phase2 的回复 `msg-ca2ac82e578d390f at=1795267005125` 即此。
- 全部写入落在 `.tmp/accept/home` 的**独立 SIMO_HOME**，未写用户真实库。

### 2.5 用户数据未被改动

`Get-Item data/simo.db` → 2026/11/15 18:41:51；`data/simo.db-wal` → 2026/11/21 20:46:46，均早于本次验收开工（21:10）。本次所有会话/消息写入在 `.tmp/accept/home/simo.db`。

---

## 3. 逐条证据（命令原文 + 输出）

### 3.1 AC-SYNC-004：未读持久化、已读、重启、多标签

**HTTP（`.tmp/accept/probe-http.mjs`）**

```powershell
& $node .tmp\accept\probe-http.mjs phase1   # 21:16:22
& $node .tmp\accept\probe-http.mjs phase2   # 21:16:45（重启后）
```

原文（`.tmp/accept/http-evidence.log`；该日志因控制台编码中文显示为 mojibake，语义字段可读）：

- `GET /api/sessions` → 200，`main hasUnread=true`、`sess-fixture-researcher hasUnread=true`。
- `POST /api/sessions/main/read` → 200 `{"hasUnread":false,"ok":true,"sessionId":"main"}`；再查 → `main hasUnread=false`。
- 重启后 phase2：`after restart main hasUnread = false`（**持久化成立**）。
- `POST /api/chat {sessionId:"main",...}` → 202 `{"id":"msg-5f334d865401f2b1",...}`；新 agent 消息 `msg-ca2ac82e578d390f` 落库后 `main hasUnread after new agent message = true`（**新消息产生未读成立**）；再 read → false。
- `POST /api/sessions/nonexistent-accept-xyz/read` → 404 `{"ok":false,"error":"会话不存在","code":"not_found"}`。

**多标签 + DOM（`.tmp/accept/cdp-accept.mjs`，CDP 9223，两个 target）**

```powershell
& $node .tmp\accept\cdp-accept.mjs *> .tmp\accept\cdp-accept3.log
# RESULT PASS 22/22 checks（21:28:16）
```

- A 真实点击未读会话 → `POST /api/sessions/sess-fixture-researcher/read` 200 `{"hasUnread":false,"ok":true,"sessionId":"sess-fixture-researcher"}`（21:28:13）。
- B（已禁用 BroadcastChannel）收到 WS 帧：`{"type":"session_read","data":{"sessionId":"sess-fixture-researcher"},"id":8295}`。
- B 收到帧后重新拉 `/api/sessions/tree`（请求数 1→2），未读点 `data-unread` 消失。
- 初始 A/B 均渲染 `data-unread="true"`；主会话行无未读点。

**实时未读补测（`.tmp/accept/cdp-gap.mjs`、`.tmp/accept/cdp-ghost.mjs`）**

```powershell
& $node .tmp\accept\cdp-gap.mjs *> .tmp\accept\cdp-gap.log     # 21:31:36–21:31:43
& $node .tmp\accept\cdp-ghost.mjs *> .tmp\accept\cdp-ghost.log # 21:33:32–21:33:38
```

- 页面 active=main，向非 active 的 researcher 写入新消息（服务端 `hasUnread=true` 已确认），等 2.5s：
  - 行状态 `{"title":"研究员","unread":false,"active":false}`；该页未收到任何 `message_created`/`session_read` 帧（`framesAfterNewMessage: []`）→ **未读点不实时出现**（截图 `ACCEPT-live-unread-missing.png`）。
  - 点「刷新会话」后 `unread:true`（截图 `ACCEPT-live-unread-after-refresh.png`）→ 数据正确、仅实时性缺失。
- 幽灵未读：在未读点尚未出现时直接点进该会话，`readPosts=[]`（**不补发已读**）；刷新后当前会话短暂出现未读点，随即由「进入即读」效应清除并发出 read。见 `.tmp/accept/cdp-ghost.log`。

**已读写失败（AC-SYNC-004-02 失败分支）**

- 拦截 `POST /api/sessions/*/read` → 500：toast `标记已读失败：请求失败（500），请稍后重试`；行未读点仍在；服务端 `hasUnread=true`（不显示假已读）。截图 `ACCEPT-read-failure.png`。

### 3.2 AC-CONV-003：标题搜索

- 后端 `GET /api/sessions?q=研究员` → 200，仅 `sess-fixture-researcher`（main 的子会话），count=1。
- 只存在于正文的词：`q=周报范围和输出内容`、`q=三条可执行结论` → 均 `{"sessions":[]}`，count 0/0。
- UI（`cdp-accept3.log`）：输入「研究员」后行只剩 `["研究员"]`；相关请求仅 `GET /api/sessions?q=%E7%A0%94%E7%A9%B6%E5%91%98`，`messageSearchSeen:false`；正文词 → 0 行 + 空态「没有匹配的会话」；截图为证 `a5`、`a6`。
- 失败态（`cdp-gap.log`，拦截 `GET /api/sessions?q=*` → 500）：toast `搜索失败：请求失败（500），请稍后重试` **并且** 空态文案 = 「没有匹配的会话」→ 失败被误报为无匹配（截图 `ACCEPT-search-failure-misreport.png`）。这是 AC-CONV-003-02/03 失败条款的直接反例。

### 3.3 AC-CONV-001-03：主会话不可归档

```powershell
& $node .tmp\accept\http-lifecycle2.mjs *> .tmp\accept\http-lifecycle2.log   # 21:32:16
```

原文：

- `POST /api/sessions/main/archive` → **409** `{"ok":false,"error":"主会话不可归档","code":"main_session_protected"}`。
- `POST /api/sessions/main/unarchive` → **200** `{"ok":true,"session":{... "archived":0 ...}}`（no-op）。
- `POST /api/sessions/sess-fixture-researcher/archive` → 200 `archived:1`；`.../unarchive` → 200 `archived:0`（其他会话可正常归档/恢复）。
- `POST /api/chat {sessionId:"main"}` → 202（409 后仍可对话）。

UI（`a1`、`a7`）：主会话行无「会话操作」按钮；子会话行按钮打开菜单仅「归档」，无删除。

缺口（D3）：409 信封没有 spec 明示的 `blockers` 字段（`"blockers":["主会话不可归档"]`）。spec 把该字段标为「期望新增字段（未实现）」，因此本条只能 partial。

### 3.4 AC-CONV-002-02：生命周期失败反馈

- 重命名失败（拦截 PATCH → 500）：toast `请求失败（500），请稍后重试`（`button.toast[role="alert"]`）；重命名输入框仍在且值 = `验收失败标题-勿落库`；服务端标题仍「研究员」→ 未落库。截图 `ACCEPT-rename-failure.png`。
- 归档失败（拦截 POST archive → 500）：toast 同样出现；服务端 `archived` 仍为 0。截图 `a9`。
- 未覆盖：创建失败、恢复失败；「重试后不产生重复或脏数据」未构造用例。

### 3.5 全量测试（改后数字，自跑）

```powershell
# 前端（forks pool 在沙箱报 Failed to start forks worker EPERM，故用 threads）
cd E:\dsh_home\workspaces\agent\frontend
& $node node_modules\vitest\vitest.mjs run --pool=threads *> ..\.tmp\accept\vitest.log
& $node node_modules\typescript\bin\tsc --noEmit *> ..\.tmp\accept\tsc.log

# 后端
cd ..\backend
& ..\toolchain\go.ps1 test ./... -count=1 *> ..\.tmp\accept\gotest.log
& ..\toolchain\go.ps1 test ./internal/modules/chat -run 'Unread|Read|SessionRead' -v -count=1 *> ..\.tmp\accept\gotest-unread.log
```

- 前端：`Test Files 17 passed (17)`、`Tests 134 passed (134)`，Duration 32.93s，exit 0（21:28:40 起跑；对比旧数字 115/115 → 现在 134/134）。`tsc --noEmit` exit 0（tsc.log 0 字节）。
- 后端全量：**16 个包 ok、0 FAIL**（另外 10 个包 `[no test files]`），exit 0（21:32:51）。源码中 `func Test*` 声明 **260** 个（`grep` 统计，含本阶段新增未读用例）。
- 定向未读用例（`-v`）：`TestMigrationSessionReadCursorsUpgradeFromV22`、`TestUnreadMarkReadIdempotentAndPersistsAcrossRestart`、`TestMarkReadAtNeverRegresses`、`TestUnreadIgnoresUserAndHiddenMessages` 全 PASS，`ok simo/internal/modules/chat 2.219s`。

---

## 4. 缺陷清单（只报告，不修）

### D1（阻塞 AC-SYNC-004-01/02/03 整条 pass）非 active 会话的新消息不会实时产生未读点，且点进该会话不补记已读

- 复现：打开 8787，保持主会话 active；`POST /api/chat {sessionId:"sess-fixture-researcher", text:"..."}`；等待 agent 回复落库（`GET /api/sessions` 显示该会话 `hasUnread=true`）。
- 期望：左栏研究员行出现未读点。
- 实际：2.5s 内行仍 `data-unread` 缺失；页面未收到 `message_created`/`session_read` 帧；点「刷新会话」后才出现。
- 机制（读码）：`frontend/src/app.tsx:358-367` 只对 `session_read` 调 `loadSessions()`，其余事件仅 `loadMessages(activeId)`；`app.tsx:340-344` 的「进入即读」依赖 `flatSessions` 中 `hasUnread`，列表不刷新时点进会话不发 read（`readPosts=[]`）。
- 后果：用户在会话内时服务端仍记未读；下次刷新会先闪现未读点再被清掉（幽灵未读），与 AC-SYNC-004-01「B 行出现未读点」/ -03「非 active 会话有新消息显示未读点」不符。
- 证据：`.tmp/accept/cdp-gap.log`、`.tmp/accept/cdp-gap-evidence.json`、`.tmp/accept/cdp-ghost.log`、`docs/testing/ACCEPT-live-unread-missing.png`、`ACCEPT-live-unread-after-refresh.png`。

### D2（阻塞 AC-CONV-003-02/03 整条 pass）搜索失败被同时呈现为「没有匹配的会话」

- 复现：在页面拦截 `GET /api/sessions?q=*` 返回 500，输入「研究员」。
- 期望：显示错误提示并可重试，列表不得显示「没有匹配的会话」。
- 实际：toast `搜索失败：请求失败（500），请稍后重试` 出现，但空态同时显示「没有匹配的会话」；无重试控件。
- 证据：`.tmp/accept/cdp-gap.log`、`docs/testing/ACCEPT-search-failure-misreport.png`。

### D3（阻塞 AC-CONV-001-03 整条 pass）409 信封缺 `blockers` 字段

- 复现：`POST /api/sessions/main/archive` → 409 `{"ok":false,"error":"主会话不可归档","code":"main_session_protected"}`。
- 期望（spec `:75`）：信封含 `"blockers":["主会话不可归档"]`（spec 标注为期望新增字段、未实现）。
- 证据：`.tmp/accept/http-lifecycle2.log`。

### D4（观察项，未定性，不计入四项判定）会话区顶部的黑色矩形绘制带

- 现象：切到非主会话后，首条消息上方出现黑色矩形带（`a3`、`a7`、`a8`、`g2`、`g3`）；`elementFromPoint(700,185)` 命中正常 `.msg-text`；无 fixed/z-index≥10 覆盖层；200ms 与 3s 两次截图 sha256 相同（`b7874fa9054b4c64283efb5ac0f28776e1f851d05296160b0ffea2552aa098c8`）。
- 判定：DOM/命中测试找不到覆盖元素，疑为共享 headless Chrome 的合成/截图问题；**未定性，不写入上述 AC 结论**，但请实现者在本机浏览器复核。
- 证据：`.tmp/accept/probe-overlay.json`、`probe-overlay-200ms.png`、`probe-overlay-3s.png`。

---

## 5. 未验证项

1. `AC-SYNC-004-02`「游标写失败后进入会话仍可重试」的完整链路：只验证了写失败 → toast + 不显示假已读；未验证随后重试成功。
2. `AC-CONV-002-02` 的创建/恢复失败反馈；「重试后不产生重复或脏数据」（例如重复提交创建、归档重试）。
3. `AC-CONV-003-02/03` 的失败重试交互：当前无重试控件，未验证「可重试」；搜索失败时未读状态是否正确。
4. 真实模型（`-model real`）、真实用户库 `data/`、真实用户浏览器：本次为 `-model mock` + 复制库 + headless Chrome。mock 仅替代推理，HTTP/WS/DOM 均为真实链路。
5. 重启验证只覆盖「进程重启」，未覆盖机器重启/异常崩溃恢复。
6. D4 黑色绘制带未定性。

---

## 6. 结论

- **可升 verified：仅 `AC-CONV-003-01`。** 证据链完整（后端只查标题 + 前端仅 `/api/sessions?q=` + 正文词 0 命中 + 子会话在结果中 + 空态/搜索中）。
- **不可升 verified（保持 partial）**：`AC-SYNC-004-01`、`AC-SYNC-004-02`、`AC-SYNC-004-03`（D1）、`AC-CONV-003-02`、`AC-CONV-003-03`（D2）、`AC-CONV-001-03`（D3）、`AC-CONV-002-02`（缺重试/创建/恢复证据）。
- 修复 D1、D2 后建议按本文 §3 命令复跑：未读补测用 `cdp-gap.mjs` + `cdp-ghost.mjs`，搜索失败用 `cdp-gap.mjs` 的拦截段；D3 需 spec/实现双方确认 `blockers` 是否本阶段交付，若确认延后则应按流程把 AC 文本改为不含该字段，而不是判 pass。
- 本次不写 `accepted`（由用户/Lead 决定）。

---

## 7. v2 复验（2026-11-21 21:54–22:06，Lead 修复 D1/D2/D3 与 D4 对比度之后）

本节保留 §1–§6 的 v1 结论原文不改，只记录修复后的复验结果；v2 结果覆盖 v1 的状态判定，v1 的证据仍可追溯。

### 7.1 本轮产物与运行环境

- 二进制：`backend/simo-8787-2159.exe`，15,216,640 B，2026/11/21 21:55:19；旧 `simo-8787-2113.exe`、`simo-8787-2044.exe` 保留未覆盖（构建日志 `.tmp/accept/build2.log`）。
- 前端：buildId `mwqgzt96-6mkcx`，`app.js` sha256 `fb96310d281ff05aff6500e84a80ee302b57beef106140068f97c837cb12a4c1`，`app.css` sha256 `35fb205428df4d18f944f41ac6649df78889a58672b13a8e5cae387c8d5b9738`。
- 服务：`SIMO_HOME=E:\dsh_home\workspaces\agent\.tmp\accept\home`，`simo-8787-2159.exe serve -addr 127.0.0.1:8787 -model mock`；PID 27888（21:55:25 起），重启后 PID 34692（21:58:55 起）；`GET /api/health` 200 `{"ok":true,"ready":true,"checks":{"db":"ok","modules":["sessions","chat","tasks","memory"]}}`。
- 用户真实数据未改：`data/simo.db` 1,654,784 B、mtime 2026/11/15 18:41:51；`data/simo.db-wal` mtime 2026/11/21 20:46:46（早于本轮开工）。
- 前端重建命令（沙箱禁管道，改用 `stdio:'inherit'` 的等价脚本，Tailwind v4 + esbuild + build-id 注入）：

```powershell
cd E:\dsh_home\workspaces\agent
node .tmp\accept\build-frontend.mjs
Copy-Item frontend\dist\* backend\internal\webui\dist -Recurse -Force
..\toolchain\go.ps1 build -trimpath -buildvcs=false -ldflags "-s -w" -o simo-8787-2159.exe ./cmd/simo
```

### 7.2 判定（v1 → v2）

| AC | v1 | v2 | 关键证据 |
|---|---|---|---|
| AC-SYNC-004-01 | partial | **pass** | 非 active 会话收到消息后侧栏未读点 **441ms** 内出现，无需刷新；收到 `session_unread` 帧并触发 `GET /api/sessions/tree`；点击后未读点清除、刷新后不复发 |
| AC-SYNC-004-02 | partial | **pass** | 重启后已读仍为 `hasUnread=false`；写已读失败（拦截 500）显示红点与 toast、服务端仍 `true`；再次进入会话重试 200、红点清除、服务端 `false` |
| AC-SYNC-004-03 | partial | **pass** | B 标签收到同一条 `session_unread` 后出现红点；A 已读后 B 在未刷新、未切会话的情况下收到 `session_read` 并清除红点，B 仍停在主会话 |
| AC-CONV-003-01 | pass | pass（v1 结论保留） | 标题词命中子会话「研究员」，正文词 0 命中，全程只调 `/api/sessions?q=` |
| AC-CONV-003-02 | partial | **pass** | 搜索失败只显示错误态「搜索失败，请重试 / 请求失败（500），请稍后重试」+「重试」按钮，`.side-empty=null`（不再误报「没有匹配的会话」） |
| AC-CONV-003-03 | partial | **pass** | 搜索调用清单只有 `/api/sessions?q=…`，无 `/api/messages/search`；重试后返回真实结果并清除错误态 |
| AC-CONV-001-03 | partial | **pass** | 409 信封 `{"blockers":["主会话不可归档"],"code":"main_session_protected","error":"主会话不可归档","ok":false}`；main unarchive 200 且 `archived=0`；归档被拒后 main 仍可 `POST /api/chat` 202；主会话行无「会话操作」按钮 |
| AC-CONV-002-02 | partial | **pass** | rename/archive/restore/create 失败均出现 `role="alert"` 错误且界面不回滚成成功；重命名输入保留 `验收失败标题-v2`；重试各只发 2 次请求（失败 1 + 成功 1），服务端状态正确 |

### 7.3 逐条证据

- **AC-SYNC-004-01/03 与跨标签清除**：`.tmp/accept/cdp-v2.mjs` 运行 2026-11-21 21:58:05–21:58:31，40/40 PASS，exit 0（日志 `.tmp/accept/cdp-v2.log`，证据 `.tmp/accept/cdp-v2-evidence.json`）。关键原文：A 侧栏行 `{"title":"研究员","unread":true,"more":true,"active":false}`、`latencyMs:441`；A 帧 `{"type":"session_unread","data":{"sessionId":"sess-fixture-researcher"}}`；B 在 A 已读后 `{"title":"研究员","unread":false,...}` 且 `active` 仍为主会话，B 收到 `{"type":"session_read","data":{"sessionId":"sess-fixture-researcher"},"id":8713}`。截图 `.tmp/accept/v2-b2-live-unread-A.png`、`v2-b3-cross-tab-cleared.png`（副本 `docs/testing/ACCEPT-v2-live-unread.png`、`ACCEPT-v2-cross-tab-cleared.png`）。
- **AC-SYNC-004-02 持久化与写失败重试**：先标已读，`Stop-Process -Id 27888` 后端口释放，重启为 PID 34692（`.tmp/accept/serve4.log`）；`GET /api/sessions` 中「研究员」`hasUnread=false`；再 `POST /api/chat` 202 后 `hasUnread=true`；再 `POST .../read` 后 `false`。写失败重试见 `.tmp/accept/cdp-v2c.mjs` 的 D 段：拦截 `POST /api/sessions/sess-fixture-researcher/read` 返回 500，toast `标记已读失败：请求失败（500），请稍后重试`，红点仍在、服务端 `hasUnread=true`；放行后再次进入会话，请求 200、红点清除、服务端 `false`，read POST 共 2 次。
- **AC-CONV-003-02/03**：同一次 `cdp-v2.mjs` 中拦截 `GET /api/sessions?q=*` 返回 500，错误态文本 `搜索失败，请重试请求失败（500），请稍后重试重试`，`sideEmpty=null`，重试按钮 1 个；点击重试后重新发出 `GET /api/sessions?q=%E7%A0%94%E7%A9%B6%E5%91%98`，结果 `["研究员"]`。截图 `docs/testing/ACCEPT-v2-search-error-state.png`、`ACCEPT-v2-search-retried.png`。
- **AC-CONV-001-03**：`cdp-v2.mjs` HTTP 段记录 409 信封含 `blockers`（原文见上表），`main/unarchive` 200 `{"ok":true,"session":{...,"archived":0,...}}`，main `POST /api/chat` 202；主会话行 `{"title":"主会话","unread":false,"more":false,"active":true}`，子会话行 `more:true`。
- **AC-CONV-002-02**：`.tmp/accept/cdp-v2c.mjs` 运行 2026-11-21 22:04:38–22:04:44，24/24 PASS，exit 0（日志 `.tmp/accept/cdp-v2c.log`，证据 `.tmp/accept/cdp-v2c-evidence.json`）。关键原文：创建失败 `alerts:["请求失败（500），请稍后重试"]`、行数 3→3；创建重试成功 `{"n":4,"active":"新会话"}`、POST 共 2 次；归档失败 `archived:0`、行仍在；归档重试 `archived:1`、archive 请求 2 次；恢复失败 `archived:1`；恢复重试 `archived:0`、unarchive 请求 2 次。rename/archive 失败截图 `docs/testing/ACCEPT-v2-rename-failure.png`；创建/归档/恢复/已读失败截图 `docs/testing/ACCEPT-v2-create-failure.png`、`ACCEPT-v2-archive-failure.png`、`ACCEPT-v2-restore-failure.png`、`ACCEPT-v2-read-failure.png`、`ACCEPT-v2-read-retried.png`。

### 7.4 D4 代码块对比度复核

- 真实浏览器视口（1440×900，headless Chrome 157）：`.tmp/accept/v2-d2-code-block-viewport.png`，副本 `docs/testing/ACCEPT-v2-code-block.png`。
- `pre code`：文字 `rgb(233, 233, 240)` / 背景 `rgb(16, 18, 24)`，对比度 **15.49:1**，字号 12px；行内 `code`：`rgb(58, 60, 67)` / `rgb(244, 243, 239)`，**9.92:1**（修复前 1.09:1）。两项均 ≥ 4.5:1，且行内码样式未被连带改坏。

### 7.5 本轮全量测试（自跑，不引用他人数字）

```powershell
cd E:\dsh_home\workspaces\agent\frontend
node node_modules\vitest\vitest.mjs run --pool=threads
node node_modules\typescript\bin\tsc --noEmit
cd E:\dsh_home\workspaces\agent\backend
..\toolchain\go.ps1 test ./... -count=1
```

- 前端：`Test Files 17 passed (17)`、`Tests 139 passed (139)`，Duration 20.46s，exit 0（`.tmp/accept/vitest-v2.log`）。
- 类型检查：`tsc --noEmit` exit 0。
- 后端：`go test ./... -count=1` **16 个包 ok、0 FAIL、exit 0**（`cmd/simo` 252.207s），源码中 `func Test*` 声明 **265** 个（`.tmp/accept/gotest-v2.log`）。

### 7.6 新发现与观察项（不计入四项判定）

- **草稿会话不可见、不可归档（观察项 O1）**：`POST /api/sessions` 返回 201 `{"draft":true,...,"id":"sess-..."}` 后，该会话不出现在 `GET /api/sessions` 或 `/api/sessions/tree`，直接 `POST /api/sessions/{id}/archive` 返回 404 `{"ok":false,"error":"会话不存在","code":"not_found"}`。UI 上新建后点「归档」得到同样的 404（toast `请求失败（404），请稍后重试`，行保留，同时右栏报「右栏加载失败」），证据 `.tmp/accept/cdp-draft-archive.log`、`v2c-draft-archive.png`，副本 `docs/testing/ACCEPT-v2-draft-archive.png`。这是产品行为还是缺陷需确认，四项 AC 的失败反馈本身不受影响。
- **黑色矩形绘制带（延续 v1 D4 观察）**：v2 截图中 `s1` 仍出现，`b2` 未出现；`elementFromPoint` 命中正常 `.msg-text`，无覆盖层元素，未定性，不写入 AC 结论。

### 7.7 v2 结论

- 8 条 AC 本轮全部达到 **pass**：AC-SYNC-004-01/02/03、AC-CONV-003-02/03、AC-CONV-001-03、AC-CONV-002-02 由 partial 升为 pass，AC-CONV-003-01 维持 v1 的 pass。判 pass 均有命令或操作、输出原文或截图、时间三项。
- 未验证项：真实模型（`-model real`）、真实用户库、真实 GPU 浏览器、进程崩溃恢复；草稿会话不可归档属于待产品确认的观察项，不影响上述判定。
- 建议把上述 8 条升为 **verified**；本轮不写 `accepted`，该状态由用户或 Lead 决定。

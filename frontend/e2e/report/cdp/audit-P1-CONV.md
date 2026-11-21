# P1-CONV 会话域 CDP E2E 审计与补测报告

- 日期：2026-11-21
- owner：conv-e2e（会话域 E2E）
- 范围：P1-CONV（会话/对话）；P2–P10 冻结，不为它们新增 E2E
- 执行通道：`frontend/e2e/scripts/cdp-runner.mjs`（fork-free，`chromium.connectOverCDP()`，**不是 Playwright Test**）
- CDP 端点：`http://127.0.0.1:9223`（Chrome 157.0.8103.80 HeadlessChrome，实测可用）
- 隔离后端：`backend/simo-live-composer.exe`，端口 19230，`SIMO_LLM=mock`、`SIMO_MODEL=mock`（**mock 模型，不是 8787 真实模型**）
- 结论：**范围内 19/19 场景 PASS，exit 0**（连续两次完整运行）；07 工作台交付物下载属 P2 冻结域，默认跳过并标 `SKIPPED (OOS)`。

## 1. 结论摘要

1. 现有 11 条 CDP 场景中，10 条保留在 P1-CONV 范围内，1 条（07 交付物/工作台下载）移出范围（P2 冻结），以 `{ oos: true }` 注册，默认不跑、报告标 SKIPPED，**不删除、不放宽**。
2. 审计出 9 个会话域缺口：新建/空态、重命名、归档/恢复、会话切换隔离、长消息滚动与时间轴跳转、多标签同步、会话搜索、列表加载失败、发送失败。已补成 9 条真实 E2E（08–16），断言全部来自前端源码与后端契约，不含 mock 结果冒充。
3. 最终 `pnpm test:e2e:cdp` → `19/19 passed, 0 failed`，`exit code 0`；报告 `frontend/e2e/report/cdp/summary.md`、`results.json`、`run-20261121-*.log`。
4. 未覆盖项已在第 7 节逐条列出（WS 断线重连/replay、未读游标、跨会话正文搜索、归档 409 blockers 分支等），没有用“通过”包装。
5. 本轮**没有**运行 Playwright Test（`pnpm test:e2e`）：本机受限会话 fork worker 会 `spawn EPERM`，且不得声称已跑；`specs/` 下的 Playwright 用例只做了与 runner 的一致性对照，未执行。

## 2. 现有 11 条场景审计

| # | 场景 | 断言要点 | P1-CONV 映射 | 结论 |
|---|---|---|---|---|
| 01a | 首屏结构 1600×1000 | `.conversation-panel.is-ready`、user/agent 消息、`.timeline.timeline-groups`、`.inspector[aria-label="会话概览"]` | PRD-CONV-001/004，TC-P1-004 | 保留（范围内） |
| 01b | 375×812 | 无横向溢出、`.composer` 可见且 width>120、时间轴/侧栏隐藏 | PRD-CONV-004 + 全局 A4 | 保留（范围内） |
| 02 | Enter 发送 / WS 流式 | user/agent 消息、`.composer-error` 0、WS `reply.delta`>0 且 `reply.done`>0、无 console error | PRD-CONV-004/005、SYNC-001，TC-P1-006/008 | 保留（范围内） |
| 03 | Composer 键盘 | Enter 发送、Shift+Enter 换行、反转模式互换、hint `aria-pressed` | PRD-CONV-006，TC-P1-007 | 保留（范围内） |
| 04a | FE-007 逐级加载 | 祖先组逐个增加、opacity≈0.55、prepend 锚定偏移 ≤1px、切父会话清链 | PRD-CONV-007，TC-P1-005 | 保留（范围内） |
| 04b | 413 | 错误文案「消息过多，暂不能完整加载」、消息数不变、无祖先 | PRD-CONV-007 + A2/A6 | 保留（范围内） |
| 04c | 403 | 错误文案「无权读取该上级会话」、无祖先 | PRD-CONV-007 + A6 | 保留（范围内） |
| 04d | 空上级 | 「上级没有消息」提示、可继续向上、可回主会话 | PRD-CONV-007 + A2 | 保留（范围内） |
| 05 | 500 / 重试 | `.state-error[role=alert]` 含「消息加载失败」、重试后恢复 | PRD-CONV-004 + A2，TC-P1-006 | 保留（范围内） |
| 06 | 右栏任务定位 | 右栏任务行点击 → 消息 `.is-flash` 且 `data-task-id` 命中 | PRD-CONV-004（会话内消息定位）；任务/投影数据由 API seed，任务功能本身属 P2 不新增断言 | 保留（范围内，仅作消息定位回归） |
| 07 | 交付物下载 | 右栏/工作台可见、真实 download 事件、文件名与内容 `TODO\n` | 工作台/交付物属 **P2 冻结域**，非 P1-CONV | **移出范围**：`{ oos: true }`，默认跳过；未删除、断言未改 |

## 3. P1 PRD / TC 映射（本报告更新后）

| TC（test-plan） | PRD | 覆盖场景 | 证据级别 |
|---|---|---|---|
| TC-P1-001 | PRD-CONV-001 会话树/主会话 | 01a、11 | pass（CDP，本次实跑） |
| TC-P1-002 | PRD-CONV-002 生命周期（建/改名/归档/恢复） | 08、09、10 | pass（CDP，本次实跑） |
| TC-P1-003 | PRD-CONV-003 搜索与未读 | 14（标题/正文/无匹配） | partial：未读角标未覆盖 |
| TC-P1-004 | PRD-CONV-004 消息流/渲染 | 01a、04a、12、11 | pass（CDP，本次实跑） |
| TC-P1-005 | PRD-CONV-007 祖先整级加载 | 04a、04b、04c、04d | pass（CDP，本次实跑） |
| TC-P1-006 | PRD-CONV-005 发送/流式 | 02、05、16 | pass（CDP，本次实跑；重连不在内） |
| TC-P1-007 | PRD-CONV-006 Composer/快捷键 | 03 | pass（CDP，本次实跑） |
| TC-P1-008 | SYNC-001 WS 连接与重连 | 02（连接/流式）、13（跨标签推送） | partial：断线重连与 replay 未覆盖 |
| TC-P1-009 | SYNC-002 多标签 active/祖先/读游标 | 13（active 跟随、跨标签实时消息） | partial：读游标/祖先跨标签未覆盖 |
| TC-P1-010 | SYNC-003 发送模式跨标签 | 03（本标签）+ 13（跨标签同步） | pass（CDP，本次实跑） |
| TC-P1-011 | SYNC-004 未读/已读游标 | — | **missing**（未覆盖） |
| TC-P1-012 | SYNC-005 远程/通知（P2、unimplemented） | — | missing / 不在本轮范围 |
| TC-P1-E1 | 域级：空/加载 | 08（空态）、15（列表失败→恢复） | pass（CDP，本次实跑） |
| TC-P1-E2 | 域级：错误/恢复 | 04b/04c/05/15/16 | pass（CDP，本次实跑） |
| TC-P1-E3 | 域级：响应式/键盘/权限 | 01b、03、04c/04d | partial：权限仅覆盖祖先读取 403，其他权限面未覆盖 |

> 说明：`specs/test/P1-CONV/test-plan.md` 属于 `specs/**`，不在本 agent 的写作用域（只改 `frontend/e2e/**`），因此本报告只提供证据与映射，测试计划的证据回写由 Lead/验收 Agent 执行；本报告不修改、也不声称已修改测试计划。

## 4. 新增 9 条会话域 E2E（cdp-runner.mjs，08–16）

| # | 场景名 | 关键断言（真实浏览器 + 真实 API） | PRD / TC |
|---|---|---|---|
| 08 | 新建会话空态与首条消息物化 | 点「新建会话」→ h1「新会话」、`.conversation-panel.is-empty`、空态标题/描述/CTA；侧栏行 +1 但**会话树 API 数量不变**（懒草稿不落库）；点 CTA 后 textarea 获焦；首条消息后 `.is-ready`、user/agent 消息、h1 仍「新会话」、会话树 API +1 | PRD-CONV-002/004，TC-P1-001/002/004，A2 |
| 09 | 重命名 Enter/Escape/空值/blur | 空值不提交；Escape 不提交且标题不变；Enter 提交后 API title、h1、侧栏行同步；blur 提交同样持久化 | PRD-CONV-002，TC-P1-002 |
| 10 | 归档、显示归档、只读与恢复 | 归档后 API `archived=1`、默认列表隐藏、badge「已归档 · 只读」、textarea disabled、旧消息仍可见；`显示归档` 后 `.session-row.is-archived` 出现；恢复后 badge 消失、输入可用、可继续发送 | PRD-CONV-002，TC-P1-002 |
| 11 | 会话切换与消息隔离 | 甲乙互相看不到对方消息；`.tlg-session` 只 1 个且 `aria-label=当前会话：<title>`；API 双向校验不串会话 | PRD-CONV-001/004，TC-P1-001/004 |
| 12 | 长消息滚动、回到底部与时间轴跳转 | 32 条消息可滚动且首屏贴底 <4px；滚到顶出现「回到底部」、`[aria-current]` 唯一；点第 11 个 `.tl-bar` 后目标消息偏移 <4px；回到底部后按钮消失；跳首条时首条进入视口 | PRD-CONV-004，TC-P1-004，E1 |
| 13 | 多标签 active 会话、发送模式与 WS 同步 | A 切会话 → B h1 跟随（BroadcastChannel）；A 发消息 B 实时可见、B Shift+Enter 发送 A 实时可见（WS）；A 切反转模式 B `aria-pressed` 同步；B 反转模式下裸 Enter 只换行不发送 | SYNC-002/003，TC-P1-009/010 |
| 14 | 会话搜索标题/消息命中与无匹配空态 | 标题令牌只留命中行；正文令牌经 `/api/messages/search` 命中 main 行且无空态；无匹配显示「没有匹配的会话」；清空恢复 | PRD-CONV-003，TC-P1-003 |
| 15 | 会话列表加载失败与重试恢复 | 拦截 `/api/sessions/tree` 500 → `.sidebar .state-error` 含「会话加载失败」「请求失败（500）」、无行、无 loading；重试后行恢复、错误态消失；刷新按钮同样恢复 | 全局 A2/E2 |
| 16 | 发送失败提示且不假落库 | 拦截 `/api/chat` 502 → `.composer-error` 精确「请求失败（502），请稍后重试」、页面无该消息、**消息 API 无该文本**；恢复后重发成功且 composer-error 消失 | PRD-CONV-005 + A5，TC-P1-006 |

## 5. 新增 / 修改文件

只改 `frontend/e2e/**`；未改生产前端/后端、未删/移文件、未提交。

| 文件 | 类型 | 说明 |
|---|---|---|
| `frontend/e2e/scripts/cdp-runner.mjs` | 修改 | 新增 08–16 共 9 条场景；07 改为 `{ oos: true }` 并由 `E2E_INCLUDE_OOS` 控制；`scenario()` 支持 options、场景函数改为 `(page, context)`（多标签）；新增 `listAllSessions`/`findSessionById`/`sessionRow`/`openSecondTab` 助手；`results.json` 增加 `scope/includeOos/inScope/skippedOos`；`summary.md` 增加 SKIPPED 行；`expect` 超时统一到 15s（仅等待时间，不改期望值） |
| `frontend/e2e/README.md` | 修改 | 更新 §1 CDP 说明与实测结论、§3 增加 `E2E_INCLUDE_OOS`、§4 改为 4.1 Playwright / 4.2 CDP 两张表（19 条范围内 + 1 OOS）、§5 架构行、§6 已知限制（跨会话正文搜索不支持、重连/未读游标未覆盖、07 OOS） |
| `frontend/e2e/report/cdp/audit-P1-CONV.md` | 新增 | 本报告 |

未改：`frontend/e2e/specs/**`（Playwright 用例）、`support/**`、`scripts/preflight.mjs`、`scripts/cdp-probe.mjs`。

## 6. 运行命令与真实结果

```powershell
# 无全局 node 时（本机实际情况）
$env:PATH = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;' + $env:PATH
cd E:\dsh_home\workspaces\agent\frontend
node E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs test:e2e:cdp
```

| 运行 | 日志（`frontend/e2e/report/cdp/`） | 结果 |
|---|---|---|
| 基线（改前，11 条） | `run-20261121-130228-baseline.log` | 11/11 PASS，exit 0（07 当时在范围内） |
| 开发中首次全量 | `run-20261121-130836-dev.log` | 18/19，exit 1：08 失败——`.overview-empty span` 先命中了装饰点 `span.overview-empty-mark`（`·`），改选择器为 `.overview-empty div > span` |
| 复跑 | `run-20261121-131013.log` | 18/19，exit 1：13 偶发——A 侧发送后 5s 默认 expect 超时（截图确认消息已到达，仅等待不够），改为全局 15s + 该断言 20s |
| 修复后第 1 次 | `run-20261121-131214.log` | **19/19 PASS，exit 0** |
| 修复后第 2 次（最终报告） | `run-20261121-131332.log` | **19/19 PASS，exit 0** |

最终 `results.json` 关键字段：

```json
{ "scope": "P1-CONV", "includeOos": false, "inScope": 19, "passed": 19, "failed": 0,
  "skippedOos": ["07 交付物右栏/工作台可见并真实下载"] }
```

两次失败均为**测试代码/等待时间**问题，不是产品缺陷；修复方式是选择器正确化与合理等待，未放宽任何期望值。

> 说明：`report/cdp/` 下仍保留开发期失败截图 `08_新建会话空态与首条消息物化.png`（13:09）与 `13_多标签_active_会话_发送模式与_WS_同步.png`（13:11），它们是修复前的现场，不是最终结果；最终结果以 `results.json`/`summary.md`/`run-20261121-131332.log` 为准。按任务约束未删除/移动这些历史文件。

## 7. 未覆盖项（如实列出）

1. **SYNC-001 断线重连与 replay**：没有主动断开 WS 验证重连补发；只覆盖连接正常时的流式与跨标签推送。
2. **SYNC-004 未读/已读游标**：未读角标、切会话后 read cursor 跨标签一致均未覆盖。
3. **消息正文跨会话搜索**：真实产品缺口——前端 `searchMessages(q)` 不带 `sessionId`，后端 `handleMessageSearch` 只查默认会话 `main`；14 号场景因此只断言 main 正文命中，不假装支持跨会话。
4. **归档被 blockers 拒绝（409 `archive_blocked`）**：只覆盖“无任务/无证据→允许归档”与恢复；需要构造未完成任务的证据门槛，未做。
5. **权限面**：只覆盖祖先读取 403；会话级/卡片级默认拒绝（A6）其他分支未覆盖。
6. **会话 pin/owner/delete/搜索未读角标**：P1-CONV 主流程未强制，未覆盖。
7. **375px 深层会话/工作台导航**：375 只覆盖默认 main 页。
8. **真实模型（8787）**：明确不在 E2E 范围；本报告所有结果均来自隔离后端 + mock 模型，不得据此声称 8787 真实模型通过。
9. **Playwright Test（`pnpm test:e2e`）**：本机受限会话 fork worker `spawn EPERM`，本轮未运行，不得声称已跑；`specs/` 用例未执行。
10. **07 交付物下载**：P2 冻结域，默认跳过；如需回归用 `E2E_INCLUDE_OOS=1`（本轮未跑该模式）。

## 8. 复现与排障

- 每次运行自起隔离后端（空 `SIMO_HOME`、`SIMO_LLM=mock`、端口 19230），不碰 8787。
- 失败截图：`frontend/e2e/report/cdp/<场景名>.png`；栈日志：`.tmp/e2e-cdp-*/home/logs/api.log`（后端异常退出时保留）。
- CDP 端点不可用时：先确认 `http://127.0.0.1:9223/json/version`，或用 `E2E_CDP_URL` 指向可用端点；受限会话不能自行启动 Chrome。

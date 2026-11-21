# CHG-CONV-004 · 多标签与同步收口：提案

状态：**partial**（2026-11-21；文档收口，不改代码）
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003
Domains: `SYNC`
Owner：产品（AC 口径）/ 前端（`tabsync.ts`、`app.tsx`、Composer）/ 后端（WS `since`/`seq` 回放）
design.md：N/A —— 无新方案。

## 1. 为什么做

SYNC-001/002/003 在 TREE 标为 `implemented`，实际证据强弱差异很大：

- SYNC-001（WS 连接与重连）：后端有 `TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients`，前端有 App.integration 的 delta 去重——**但没有任何"断线→重连→补发"的前端用例**，而 PRD 名字就叫"连接与重连"。
- SYNC-002（多标签 active/ancestor/read cursor）：`tabsync.ts` 只有 1414 B，`app.tsx` 三处 publish、一处 consume，**零测试**；"多标签"在自动化里不存在。
- SYNC-003（发送模式跨标签）：localStorage 持久化有组件测试，但 BroadcastChannel/storage 双通道**零测试**，而 `COMP-composer-send-mode` 状态是 `spec ready`。

这不是"实现不存在"，而是"实现未被证明"。本包把三条同步 PRD 的契约与证据缺口写成可审计记录。

## 2. 做什么

- 把 `tabsync` 消息协议（类型/字段/去重键/权限边界）写成契约。
- 把 WS `since`/`seq` 回放与前端去重的契约写清，标出未测路径。
- 给出多标签测试策略（两个 BrowserContext/两个标签 + BroadcastChannel 断言）与任务卡。

## 3. 不做什么

- 不实现跨设备同步、不做服务端多标签会话管理。
- 不启用 Playwright（CDP runner 现状不改），不新增依赖。
- 不改代码/测试/部署。

## 4. 影响与风险

- 影响面：文档。风险：把"有 BroadcastChannel 代码"当成"多标签已验证"；本包 §4 逐条标未测。
- 替代方案：直接标 covered —— 无多标签证据，否决。

## 5. 验收口径

见 `spec.md` §6 A 编号；`evidence.md` 中未测项写 `missing`。

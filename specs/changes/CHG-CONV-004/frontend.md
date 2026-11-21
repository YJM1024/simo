# CHG-CONV-004 · 前端开发 spec

状态：**partial**
Change: CHG-CONV-004
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003
Scope：`frontend/src/tabsync.ts`、`frontend/src/app.tsx`（WS 生命周期 96–250、495）、`frontend/src/components/library.tsx`（Composer sendMode 509–590）
N/A：无。

## 1. 模块契约

### tabsync.ts（28 行，完整协议）

```ts
export const tabId = crypto.randomUUID?.() ?? `tab-${random}`   // 每标签唯一
const CHANNEL = 'simo.tab-sync.v1'
type TabSyncMessage =
  | { type:'active_session_changed'; tabId; opId; at; sessionId }
  | { type:'ancestor_chain_changed'; tabId; opId; at; sessionId; chain:string[] }
  | { type:'read_cursor_changed'; tabId; opId; at; sessionId }
publishTabSync(msg) / useTabSync(handler, deps?)
```
- `ensure()` 惰性建 `BroadcastChannel`；不支持时返回 `null`（`publishTabSync` 静默降级）。
- `handlers` 为模块级 Set；`useTabSync` 用 ref 转发最新 handler，卸载时移除。

### app.tsx 消费分支

| 分支 | 行 | 逻辑 |
|---|---|---|
| 忽略本标签 | 228 | `message.tabId === tabId` return |
| active 切换 | 229–238 | `newer = at 更大 || (at 相等 && tabId 字典序更大)`；相同会话忽略；设 `remoteActiveRef=true` 防回声（222 行消费后不再回播）；清祖先链 |
| read cursor | 239 | 同会话且 `at >= 本地游标` → 更新 `readCursor[sessionId]`、`setUnread(0)` |
| ancestor chain | 240–256 | chain 为空 → 清空；chain key 未变 → 忽略；否则逐会话 `getAllSessionMessages` 合并去重 |

发布点：171（read cursor，附 `at=本地游标`）、224（active，`at=lastActiveOp.at`）、495（ancestor chain，`at=Date.now()`）。

### WS 客户端（api.ts connectEvents）

- `open` → `onStatus('open')` + `subscribe{since}`；`close` → `onStatus('reconnecting')` + 退避（800→×1.8→5000，open 重置）。
- `stop()` 在 OPEN 时发 `{type:'correct'}`；`close()` 停止重连。

## 2. 状态与降级

| 场景 | 行为 |
|---|---|
| BroadcastChannel 不可用 | `publishTabSync` 无操作；单选标签仍可用（未测） |
| 两标签同秒切会话 | `at` 相同 → `tabId` 字典序决定，最终一致（未测） |
| 收到自身消息 | `tabId` 过滤（依赖 BroadcastChannel 不回投自身） |
| 重连中发送 | 发送仍直连 HTTP，回复经 WS 到达（未测重连窗口） |

## 3. 失败路径

| 路径 | 现状 | 判定 |
|---|---|---|
| WS 断开 | 状态转 `reconnecting`，退避重连 | 有实现，**无测试** |
| `since` 回放重复 | `seq` 去重（App.integration 用例 7） | 已测 |
| 多标签 active 回声 | `remoteActiveRef` 抑制 | 有实现，**无测试** |
| ancestor 拉取部分失败 | 单块失败不影响其他（248 行 catch） | 有实现，**无测试** |
| storage 事件 | Composer 监听 `storage` 更新模式 | 有实现，**无测试** |

## 4. 多标签测试策略（供 TASK 执行）

- 同一浏览器开两个页面（CDP `Target.createTarget` 或两 context），共享同源。
- 断言：A 切会话 → B `activeId` 变化且不抖回；A 产生祖先链 → B 合并去重；A 发消息 → B 未读清零；A 切发送模式 → B 按钮 aria 变化。
- 需暴露测试钩子或用 `BroadcastChannel` 直接投递消息，避免依赖真实 UI 时序。

## 5. 缺口

1. 无任何多标签用例（SYNC-002）。
2. 无重连用例（SYNC-001）。
3. 无跨标签 sendMode 用例（SYNC-003）。
4. `opId` 未用于去重，若未来需要幂等消费需补（当前仅标识）。

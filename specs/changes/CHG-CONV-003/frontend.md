# CHG-CONV-003 · 前端开发 spec

状态：**partial**
Change: CHG-CONV-003
Implements: PRD-CONV-005、PRD-CONV-006
Scope：`frontend/src/components/library.tsx`（Composer 509–590、StatusBar/StatusDot 连接态）、`frontend/src/app.tsx`（`send` 422、`stopStreaming` 415、`connectEvents` 生命周期）、`frontend/src/api.ts`
N/A：无。

## 1. Composer 契约（`library.tsx:509`）

| prop | 类型 | 行为 |
|---|---|---|
| `disabled` | boolean | 归档会话/无 active 会话时禁用（`app.tsx:658`：`!activeId || archived`） |
| `streaming` | boolean | 有 `status==='streaming'` 的消息时为真（`app.tsx:658`），显示停止按钮 |
| `onSend` | `(text)=>Promise<void>` | 发送入口 |
| `onStop` | `()=>void` | 停止当前回复 |
| `sendError` | string | 发送失败的可读错误（`app.tsx` 的 `error`） |

交互矩阵：

| 事件 | sendMode='enter' | sendMode='shift-enter' |
|---|---|---|
| Enter | 发送 | 换行 |
| Shift+Enter | 换行 | 发送 |
| Ctrl+Enter / Meta+Enter | 发送 | 发送 |
| IME 组合中 Enter | 不发送 | 不发送 |

发送模式持久化：localStorage `simo.composer.sendMode`（旧 key 迁移后删除）；跨标签用 `BroadcastChannel('simo.composer.sendMode.v1')` + `window.storage` 双通道；按钮 `aria-pressed` 与 `aria-label` 随模式变化；hint 文案同步。

## 2. 发送流水线（`app.tsx:422`）

1. `sendingRef` 互斥：进行中直接 return（防重复提交）。
2. `clientMutationId = tabId:Date.now()` 写入 `syncStateRef`，随 `sendChat` 发给后端。
3. `sendChat` 成功 → 拉取消息（`loadMessages`）→ WS delta 继续追加；失败 → `setError` + Composer 恢复文本（Composer 内部保留 draft 并重试）。
4. 流式结束由 `reply.done/message.done` 触发刷新，`StatusBar` 连接态由 `onStatus` 更新。

## 3. 停止契约（`app.tsx:415`）

- 将当前 `streaming` 消息加入 `ignoredReplyIds`，调用 `eventsRef.current?.stop()`（发送 `{type:'correct'}` 帧），本地把消息状态改为 `stopped`，不再追加后续 delta。

## 4. 重连契约（`api.ts:connectEvents`）

- `close` → `onStatus('reconnecting')` → `setTimeout(open, retryDelay)`；`retryDelay` 800ms 起 ×1.8，上限 5000ms；`open` 后重置为 800ms。
- `open` 后 `subscribe` 携带 `since: handlers.since?.() || undefined`（由 `app.tsx` 的 `lastEventId` 提供），后端补发后按 `seq` 去重。

## 5. 失败路径与缺口

| 路径 | 现状 | 判定 |
|---|---|---|
| 发送失败 | `setError` + 文本恢复 + 重试（Composer 用例 6） | 已测 |
| 重复提交 | `sendingRef` + 按钮禁用（用例 7） | 已测 |
| 停止 | 本地 stopped + correct 帧（用例 9） | 已测（未验证真实中断后后端确实停止） |
| 断线重连 | 代码存在（退避 + since） | **无测试**：无 close→open 用例、无 since 回放断言 |
| `clientMutationId` 幂等 | 前端传参，**后端无处理**（chat 模块 grep 0 匹配） | **契约不成立**，不得宣称幂等 |
| 跨标签 sendMode | BroadcastChannel 代码存在 | **无测试**（SYNC-003） |
| 真实 IME | composition 处理存在 | 仅 jsdom 模拟，未测真实输入法 |

## 6. 约束

- 不改键盘语义；新增快捷键需产品 AC + 组件 spec 同步。
- 不引入页面级定制 CSS；Composer 样式沿用类名。
- 断线重连参数（800/1.8/5000）为既有实现，改动需单独变更包。

## 7. 缺口（交任务卡）

1. 断线重连 E2E/集成用例（TASK-01）。
2. 发送幂等：后端实现或删除 `clientMutationId` 传参（TASK-02，需产品口径）。
3. 跨标签 sendMode 测试（TASK-04，SYNC-003）。
4. COMP-composer-send-mode 状态回写（TASK-03）。

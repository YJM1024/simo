# CHG-CONV-003 · 输入与发送收口：提案

状态：**partial**（2026-11-21；文档收口，不改代码）
Implements: PRD-CONV-005、PRD-CONV-006
Domains: `CONV`
Owner：产品（AC 口径）/ 前端（Composer、app.tsx 发送流水线）/ 后端（`POST /api/chat`、WS 流）
design.md：N/A —— 无新方案，描述既有发送流水线契约。

## 1. 为什么做

CONV-005（发送·流式·断线重连）与 CONV-006（Composer 输入与快捷键）是会话主入口，前端 Composer 10/10、后端 WS/流测试存在，但：
- PRD 名字里的"断线重连"**没有测试**（只有 WS 去重与事件顺序）；
- 发送幂等（`clientMutationId`）无测试；
- `COMP-composer-send-mode` 仍是 `spec ready（待实现/待验收）`，而组件已实现并测过——组件契约未签收；
- 发送模式跨标签同步（BroadcastChannel）无测试（SYNC-003 承接）。

这些必须被写清楚，否则"发送已实现"会被误读为"发送可验收"。

## 2. 做什么

- 收敛发送流水线：输入 → 校验 → `POST /api/chat`（202）→ WS delta → done → 状态归零；停止/失败/重连三条异常路径。
- 收敛 Composer 交互契约：Enter/Shift+Enter/Ctrl/Meta、IME、发送模式切换与持久化、disabled/streaming/sendError 三态。
- 给出逐 AC 证据，明确 `missing`。

## 3. 不做什么

- 不做真实断线重连 E2E，不改重连策略，不实现离线队列。
- 不把 COMP-composer-send-mode 状态改为 approved。
- 不改代码/测试/部署。

## 4. 影响与风险

- 影响面：文档。风险：把"发送按钮能用"当成"断线重连可用"；本包 §3 明确列出未验证路径。
- 替代方案：直接在产品 spec 写"已实现"——与测试事实不符，否决。

## 5. 验收口径

`spec.md` §5 A 编号；`evidence.md` 每条注明来源与是否已执行。

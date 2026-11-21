# CHG-CONV-002 · 消息与渲染收口：提案

状态：**partial**（2026-11-21；文档收口，不改代码）
Implements: PRD-CONV-004、PRD-CONV-007
Domains: `CONV`
Owner：产品（AC 口径）/ 前端（MessageItem、Timeline、App 集成）/ 后端（chat 消息流、all_messages）
design.md：N/A —— 只描述既有实现与缺口，不引入新交互方案。

## 1. 为什么做

CONV-004（消息流与渲染）与 CONV-007（祖先消息整级加载）是 P0/P1 会话体验的主干，2026-11-20 已有较硬的测试（MessageItem 18/18、App.integration 7/7、后端 M81/M89/M11/M50/M78/M79、CDP 04a–04d），但六类产物一直缺：没有变更包承载前后端契约、没有逐 AC 证据、组件 spec（COMP-message-colors / COMP-timeline-*）停在 `spec ready`/`approved 待实现`，导致 PRD 只能停在 partial。

## 2. 做什么

- 收敛"消息流纯度（无 system/静默噪音）、渲染分类、复制、卡片交互、流式/失败态、历史分页"的前端契约。
- 收敛"祖先链整级加载/all-messages 分页/413·403 映射/顺序与形状"的后端契约。
- 建立 AC → 用例 → 证据映射，明确组件 spec 未签收这一事实对覆盖的影响。

## 3. 不做什么

- 不新增消息类型、不改 Markdown 子集、不做虚拟滚动。
- 不把 COMP 状态改为 approved（需设计与独立验收签字）。
- 不改任何代码/测试/部署。

## 4. 影响与风险

- 影响面：文档。风险：把"组件级 pass"误当成"产品 AC 通过"；本包用 §4 明确两者差别。
- 替代方案：直接把 test-plan 升级为 pass 并标 covered —— 违反"不得虚报"，否决。

## 5. 验收口径

`spec.md` §6 A 编号；`evidence.md` 中每项须有文件/用例名，未跑写 `missing`。

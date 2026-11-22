# 司墨（simo）需求项 Backlog

> 本文件是**唯一的执行队列**。所有需求项、工作项、backlog 项统一叫「需求项」。
> 大需求项可拆成小需求项；拆完都进这个队列，**一项一项做**，做完一项再做下一项，直到全部做完。
> 维护者：Lead。最后更新：2026-11-21。

---

## 0. 执行规则

1. **一次只推进一个顶层需求项**（`REQ-NNN`），它的子项可以并行。
2. 顶层项开工前必须先拆到「单次可验收」的粒度，拆完写回本文件；没拆完不开工。
3. 每项必须有：**前置 / 状态 / 对应变更包 / 出口证据**，四者缺一不可。
4. 完成 = 出口证据齐 + 独立验收签字；**没有证据不算完成**。
5. 同一文件同时只有一个 owner；跨角色的子项按角色分派，不抢写。
6. 状态词只用：`queued`（排队）/ `running`（进行中）/ `blocked`（被前置卡住）/ `done`（已验收）/ `parked`（明确不纳入）。

---

## 1. 队列总览

| 顺序 | ID | 需求项 | 规模 | 状态 | 对应变更包 |
|---|---|---|---|---|---|
| 1 | REQ-001 | 流程与门禁硬化（六类产物可判定） | 大 | running | `CHG-SYS-001` |
| 2 | REQ-002 | 需求项 Backlog 与执行机制 | 小 | running | 本文件（治理，无包） |
| 3 | **REQ-010** | **会话域全量交付（"绘画"）** | **超大** | **running** | `CHG-CONV-006` |
| 4 | REQ-003 | 仓库基线入仓（内容对齐远程 head） | 中 | blocked（等 REQ-010 稳定） | 治理，无包 |
| 5 | REQ-020 | P2 任务与执行 | 大 | queued | 待建 |
| 6 | REQ-021 | P3 工作台 | 大 | queued | 待建 |
| 7 | REQ-022 | P4 文件与交付物 | 大 | queued | 待建 |
| 8 | REQ-023 | P5 记忆 | 大 | queued | 待建 |
| 9 | REQ-024 | P6 团队与智能体 | 大 | queued | 待建 |
| 10 | REQ-025 | P7 调度 | 大 | queued | 待建 |
| 11 | REQ-026 | P8 设置 | 大 | queued | 待建 |
| 12 | REQ-027 | P9 工具与能力 | 大 | queued | 待建 |
| 13 | REQ-028 | P10 指标 | 大 | queued | 待建 |
| 14 | REQ-029 | 全产品功能树盘点与缺口收口 | 大 | queued | 待建 |
| 15 | REQ-030 | 下一轮需求迭代 | 超大 | queued | 待建 |
| — | REQ-900 | SYNC-005 远程访问与通知中心 | — | parked（用户已明确不纳入） | — |

---

## 2. 当前项：REQ-010 会话域全量交付（拆解）

**目标**：会话域 12 个功能点全部 `covered`；长期 Spec 五列补齐；测试全绿；8787 真机走查通过；独立验收签字。

**范围**：`PRD-CONV-001..007` + `PRD-SYNC-001..004`（SYNC-005 parked）。

| 子项 | 内容 | 角色 | 前置 | 状态 |
|---|---|---|---|---|
| REQ-010-01 | 建包 `CHG-CONV-006` + proposal/product/tasks | 产品 | — | running |
| REQ-010-02 | 会话域功能树（`docs/product/TREE.md`） | 产品 | — | running |
| REQ-010-03 | 产品 Spec 对齐 12 功能点 + 六条口径 + `PRD-CONV-008` | 产品 | 01 | running |
| REQ-010-04 | 设计 Spec（`specs/design/P1-CONV/spec.md`） | 设计 | 03 | queued |
| REQ-010-05 | 前端 Spec（`specs/frontend/P1-CONV/spec.md`） | 前端 | 03 | queued |
| REQ-010-06 | 后端 Spec（`specs/backend/P1-CONV/spec.md`） | 后端 | 03 | queued |
| REQ-010-07 | 测试 Spec 重写（`specs/test/P1-CONV/test-plan.md`） | 测试 | 03–06 | queued |
| REQ-010-08 | 生命周期失败反馈（重命名/归档/恢复可见错误） | 前端 | — | running |
| REQ-010-09 | `clientMutationId` 幂等 | 后端 | — | running |
| REQ-010-10 | 主会话不可归档 + `TestMainSessionArchiveRejected` | 后端 | — | running |
| REQ-010-11 | 标题搜索接线（左栏搜会话名） | 前端 | 03 | queued |
| REQ-010-12 | 删除会话入口（二次确认 + 级联提示） | 前端 | 03 | queued |
| REQ-010-13 | 未读徽标（会话级 hasUnread，进入即已读） | 前端 | 03 | queued |
| REQ-010-14 | 右栏会话投影 `PRD-CONV-008` 落实现 | 前端 | 03 | queued |
| REQ-010-15 | pin 入口 | 前端 | 03 | queued（P2，可后置） |
| REQ-010-16 | 5 个 COMP 签收（message-colors / conversation-panel / timeline-groups / timeline-tip / composer-send-mode） | 设计+验收 | 04 | queued |
| REQ-010-17 | 测试补齐：单测 + E2E + 覆盖审计（后端/前端无头或浏览器内） | 测试 | 08–15 | queued |
| REQ-010-18 | 重建 `simo.exe`、起 8787、全角色真机走查（功能 + 视觉） | 全员 | 17 | queued |
| REQ-010-19 | 独立验收签字 + `acceptance.md` + 归档本包 | 验收 | 18 | queued |

**出口证据**：12 PRD `covered` 的追溯矩阵；测试命令与输出（后端 / 前端 / E2E）；8787 走查截图（功能 + 视觉对齐）；`acceptance.md` 签字；`check-sdd` / `check-trace` 基线。

---

## 3. 后续各项（开工前再拆）

- **REQ-020..028**：每个域按「功能树 → 五列长期 Spec → 缺陷/缺口 → 测试 → 8787 走查 → 验收」走一遍，与 REQ-010 同构，开工前拆子项。
- **REQ-029**：把 `docs/product/TREE.md` 收敛成完整功能树（域 → 场景 → 功能点 → AC → 覆盖 → 缺口 → 优先级），与 71 个 PRD 和 `SPEC-GAP.md` 对齐。
- **REQ-030**：全产品通过验收后，才进入下一轮需求迭代（新需求、新 backlog）。

## 4. 明确不做（parked）

- **REQ-900 SYNC-005**：远程访问与通知中心。与 `127.0.0.1` 无鉴权基线冲突，需要先立鉴权模型；用户已明确不纳入当前阶段。
- `CHG-LEGACY-*` 十个旧包：**不归档、不改状态**，作为历史记录保留，其覆盖缺口并入对应域需求项处理。

---

## 5. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-21 | 建立本文件；REQ-001/002/010 开工，REQ-010 拆为 19 个子项 |

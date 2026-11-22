# 司墨（simo）需求项 Backlog

> 本文件是**唯一的执行队列**。所有需求项、工作项、backlog 项统一叫「需求项」。
> 大需求项可拆成小需求项；拆完都进这个队列，**一项一项做**，做完一项再做下一项，直到全部做完。
> 维护者：Lead。最后更新：2026-11-22。

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
| 3 | **REQ-010** | **会话域全量交付（"绘画"）** | **超大** | **done** | `CHG-CONV-006` |
| 4 | REQ-003 | 仓库基线入仓（内容对齐远程 head） | 中 | done | 治理，无包 |
| 5 | REQ-020 | P2 任务与执行 | 大 | queued（B1 部分 parked） | 待建 |
| 6 | REQ-021 | P3 工作台 | 大 | queued（B1 部分 parked） | 待建 |
| 7 | REQ-022 | P4 文件与交付物 | 大 | queued（B1 部分 parked） | 待建 |
| 8 | REQ-023 | P5 记忆 | 大 | queued | 待建 |
| 9 | REQ-024 | P6 团队与智能体 | 大 | queued | 待建 |
| 10 | REQ-025 | P7 调度 | 大 | queued | 待建 |
| 11 | REQ-026 | P8 设置 | 大 | queued | 待建 |
| 12 | REQ-027 | P9 工具与能力 | 大 | queued | 待建 |
| 13 | REQ-028 | P10 指标 | 大 | queued | 待建 |
| 14 | REQ-029 | 全产品功能树盘点与缺口收口 | 大 | queued | 待建 |
| 15 | REQ-030 | 下一轮需求迭代 | 超大 | queued | 待建 |
| — | REQ-900 | SYNC-005 远程访问与通知中心 | — | removed（2026-11-22 用户裁决；原 parked） | — |

**REQ-003 出口证据**：远程 `main` head `de4cda8`（`de4cda8c2c60d0c6c43bb4c17e01548b44e840e6`，2026-11-22），206 files（A=142 / M=64 / D=0）；核验方式为三份关键文件 content sha 与本地一致（`specs/changes/CHG-CONV-006/spec.md` 15664 B、`docs/testing/ACCEPT-CONV-9-20261122.md` 11277 B、`docs/plan/RETRO-20261122.md` 15747 B）。本地提交 `76bc63e61dd309a94a7f06929e14e448c85cd550`，树 sha `1b9d3e4f56f5ec4972a1ffc0f0ac6208f6b82609` 与远程一致；推送走 GitHub REST API（`git push` 被代理 CONNECT 403），记录在 `.tmp/freeze/PUSH-API-RESULT.md`。

**REQ-003 后续待办（未裁决，仅记录）**：工作区本地 `.git` 仍是 2026-11-09 的旧落后仓库，与远程无共同祖先；后续要么整体替换为 `.tmp/repo-clean` 的 `.git`（旧目录移入 `E:\dsh_home\trash\pending-delete\`，不就地删除），要么继续用 API 入仓。决定未做，暂不执行。

---

## 2. 已交付：REQ-010 会话域全量交付（拆解）

**目标**：会话域 11 个功能点 `covered`、1 个 `conditional`（`PRD-CONV-006` 输入法待人工），SYNC-005 已移除（编号不复用）；长期 Spec 五列补齐；测试全绿；8787 真机走查通过；独立验收签字（报告 `docs/testing/ACCEPT-CONV-9-20261122.md`）。

**范围**：`PRD-CONV-001..007` + `PRD-SYNC-001..004`（SYNC-005 已移除）。

| 子项 | 内容 | 角色 | 前置 | 状态 |
|---|---|---|---|---|
| REQ-010-01 | 建包 `CHG-CONV-006` + proposal/product/tasks | 产品 | — | done（proposal/product/tasks/spec 齐；check-trace 16 包） |
| REQ-010-02 | 会话域功能树（`docs/product/TREE.md`） | 产品 | — | done（TREE 71 PRD；check-trace PASS 678） |
| REQ-010-03 | 产品 Spec 对齐 12 功能点 + 六条口径 + `PRD-CONV-008` | 产品 | 01 | done（11 covered / 1 conditional；spec §6 同口径） |
| REQ-010-04 | 设计 Spec（`specs/design/P1-CONV/spec.md`） | 设计 | 03 | done（69,224 B，13 节 + PRD 索引） |
| REQ-010-05 | 前端 Spec（`specs/frontend/P1-CONV/spec.md`） | 前端 | 03 | done（109,384 B，含 PRD→节号索引） |
| REQ-010-06 | 后端 Spec（`specs/backend/P1-CONV/spec.md`） | 后端 | 03 | done（80,252 B，按 PRD 分节） |
| REQ-010-07 | 测试 Spec 重写（`specs/test/P1-CONV/test-plan.md`） | 测试 | 03–06 | done（33 条 AC：32 pass / 1 partial / 0 blocked） |
| REQ-010-08 | 生命周期失败反馈（重命名/归档/恢复可见错误） | 前端 | — | done（AC-CONV-002-02 pass） |
| REQ-010-09 | `clientMutationId` 幂等 | 后端 | — | done（`idempotency.go`；AC-CONV-005-02 pass） |
| REQ-010-10 | 主会话不可归档 + `TestMainSessionArchiveRejected` | 后端 | — | done（AC-CONV-001-03 pass） |
| REQ-010-11 | 标题搜索接线（左栏搜会话名） | 前端 | 03 | done（AC-CONV-003-03 pass） |
| REQ-010-12 | 删除会话入口（二次确认 + 级联提示） | 前端 | 03 | parked（产品显式非目标，backlog `REQ-CONV-002-03`） |
| REQ-010-13 | 未读徽标（会话级 hasUnread，进入即已读） | 前端 | 03 | done（AC-SYNC-004-01/02/03 pass） |
| REQ-010-14 | 右栏会话投影 `PRD-CONV-008` 落实现 | 前端 | 03 | done（AC-CONV-008-01..04 pass；真机 304） |
| REQ-010-15 | pin 入口 | 前端 | 03 | done（AC-CONV-001-01/04 pass；真机置顶/重启保持） |
| REQ-010-16 | 5 个 COMP 签收（message-colors / conversation-panel / timeline-groups / timeline-tip / composer-send-mode） | 设计+验收 | 04 | done（5 个 COMP 全部 accepted；`docs/testing/COMP-SIGN-20261121.md` 复签章节 129 行起，A3 表格 1180/375、1920 宽、四态、三件回归均实测通过） |
| REQ-010-17 | 测试补齐：单测 + E2E + 覆盖审计（后端/前端无头或浏览器内） | 测试 | 08–15 | done（部分）（前端 243、后端 16 包 ok、E2E 19/19×2；真实厂商连接级中断（上游 403）、跨标签双 WS、中文输入法人工三项未验） |
| REQ-010-18 | 重建 `simo.exe`、起 8787、全角色真机走查（功能 + 视觉） | 全员 | 17 | done（部分）（构建/health 200；缺 768 档截图，下一批补或改成 375/1180 两档并说明） |
| REQ-010-19 | 独立验收签字 + `acceptance.md` + 归档本包 | 验收 | 18 | done（部分）（ACCEPT-CONV-9 签字；`acceptance.md` 未落盘、包未归档） |
| REQ-010-20 | 下一批补证（覆盖层残余） | 测试 | 17–19 | queued（真实厂商连接级中断/上游 403、跨标签双 WS、中文输入法人工、768 档视觉；转入下一批） |

**出口证据**：11 covered / 1 conditional（`PRD-CONV-006` 输入法待人工）、SYNC-005 排除的追溯矩阵；测试命令与输出（后端 / 前端 / E2E）；8787 走查截图（功能 + 视觉对齐）；`acceptance.md` 签字（`docs/testing/ACCEPT-CONV-9-20261122.md`）；`check-sdd` / `check-trace` 基线。

---

## 3. 后续各项（开工前再拆）

- **REQ-020..028**：每个域按「功能树 → 五列长期 Spec → 缺陷/缺口 → 测试 → 8787 走查 → 验收」走一遍，与 REQ-010 同构，开工前拆子项。
- **REQ-029**：把 `docs/product/TREE.md` 收敛成完整功能树（域 → 场景 → 功能点 → AC → 覆盖 → 缺口 → 优先级），与 71 个 PRD 和 `SPEC-GAP.md` 对齐。
- **REQ-030**：全产品通过验收后，才进入下一轮需求迭代（新需求、新 backlog）。

### 3.1 批次归属（2026-11-22）

依据 `docs/product/TREE-FULL.md` 第 6 节。批次表达开工顺序与出口判据；2026-11-22 起 B1 三行标 `parked`（见本节末注），其余批次不影响各 REQ 顶层状态（REQ-020/021/022 仍为 `queued`）；开工前仍需按原规则拆到"单次可验收"子项。

| REQ | 域 | 批次 | 该批承担的 PRD | 出口判据 |
|---|---|---|---|---|
| REQ-020 | P2 任务与执行 | **B1** 核心闭环 · `parked` | `TASK-001`、`TASK-002`、`TASK-003`、`TASK-006` | 任务从发起到执行组可见，取消与重试可用，异步开始/结束消息各有证据 |
| REQ-020 | P2 任务与执行 | **B3** 能力扩展 | `TASK-004`、`TASK-005` | 复杂度 C0–C4 未确认不得执行；子会话归属可为团队成员边界作判据 |
| REQ-021 | P3 工作台与视图 | **B1** 核心闭环 · `parked` | `WORK-004` | loading / empty / error 三态各有一张 8787 走查截图 |
| REQ-021 | P3 工作台与视图 | **B4** 完善与洞察 | `WORK-001`、`WORK-002`、`WORK-003`（回填）、`WORK-005` | 三条回填项补齐 AC 与证据后升 covered 或写明降级原因；自定义视图至少 3 类块可渲染 |
| REQ-022 | P4 文件与交付物 | **B1** 核心闭环 · `parked` | `FILE-001`、`FILE-003`、`FILE-004` | 会话内可列文件、可预览、可下载 |
| REQ-022 | P4 文件与交付物 | **B2** 权限与配置底座 | `FILE-002`、`FILE-005` | 上传与目录越界各有一条被拒绝并留痕的用例 |
| REQ-022 | P4 文件与交付物 | **B4** 完善与洞察 | `FILE-006` | PDF/Office/图片生成的成功与失败回滚各一条用例 |
| REQ-023 | P5 记忆 | **B3** 能力扩展 | `MEM-001`、`MEM-002`、`MEM-003`、`MEM-004` | 记忆条目可按作用域检索，冲突保留可见 |
| REQ-023 | P5 记忆 | **B4** 完善与洞察 | `MEM-005`、`MEM-006` | 实验能力显式标注且默认关闭；迁移与回滚有兼容性证据 |
| REQ-024 | P6 团队与智能体 | **B3** 能力扩展 | `TEAM-001`..`TEAM-005` | 团队可从对话创建、只读投影列出成员与负责人、越界访问被拒绝 |
| REQ-024 | P6 团队与智能体 | **B4** 完善与洞察 | `TEAM-006` | 子代理并行与任务板有可用入口，未做则写明理由 |
| REQ-025 | P7 调度 | **B3** 能力扩展 | `SCHED-001`..`SCHED-004` | UI 可建可改可删，run-now 重复触发只产生一个任务，DST 与非法 cron 各一条用例 |
| REQ-025 | P7 调度 | **B4** 完善与洞察 | `SCHED-005` | 失败重试与通知各有产品规则与用例 |
| REQ-026 | P8 设置与系统 | **B2** 权限与配置底座 | `SET-001`、`SET-002`、`SYS-001`、`SYS-002` | 模型 Provider 可在设置页改并持久；权限 fail-closed 有拒绝用例 |
| REQ-026 | P8 设置与系统 | **B4** 完善与洞察 | `SET-003`..`SET-006`、`SYS-003`..`SYS-006` | `SYS-003` 回填后升 covered；备份恢复与安装升级各有一份可核对的记录 |
| REQ-027 | P9 工具与能力 | **B2** 权限与配置底座 | `TOOL-001`、`TOOL-002`、`TOOL-005` | 工具执行留审计；CLI 白名单对命令注入与超时各一条用例 |
| REQ-027 | P9 工具与能力 | **B4** 完善与洞察 | `TOOL-003`、`TOOL-004`、`TOOL-006`、`TOOL-007` | 能力目录可读；MCP 与 Skills 若不做，在 TREE 保留 `未建` 并写明理由 |
| REQ-028 | P10 指标 | **B4** 完善与洞察 | `METRIC-001`..`METRIC-006` | 口径说明与 7/30 天窗口各有一份可核对数字，不展示假 0 |
| REQ-029 | 功能树收敛 | 开工前（待验收） | 71 个 PRD 全量 | 本文档已产出，经用户验收后由验收方转 `done`；出口证据为 `docs/product/TREE-FULL.md` 与本表 |

批次之间的依赖：B2 必须以 B1 的任务与会话链路为验收对象，B3 的团队与调度分别以 `TASK-005` 和 `TASK-001` 为前置，B4 需在 B1 至 B3 完成后重排。REQ-010-20 的补证项（真实厂商连接中断、跨标签双 WS、输入法人工、768 档视觉）并入 B1 同一次走查，不单开批次。

**B1 暂停（2026-11-22 用户裁决）**：B1 在用户只批准会话域的情况下越权开工，用户裁决「保留吧，好吧，我们只做完绘画相关就可以」。处置为保留产物、B1 三行标 `parked`；代码与文档已产出但未提交、未重建、未部署，保留待排期，重启需用户明确批准。REQ-020、REQ-021、REQ-022 的顶层状态为 `queued（B1 部分 parked）`，因为它们的 B2/B3/B4 行不属 B1 范围，仍按原排期等待。

## 4. 明确不做（parked）

- **REQ-900 SYNC-005（removed）**：远程访问与通知中心。与 `127.0.0.1` 无鉴权基线冲突，需要先立鉴权模型；用户于 2026-11-22 裁决移除，编号不复用，本行保留以维持可追溯。
- `CHG-LEGACY-*` 十个旧包：**不归档、不改状态**，作为历史记录保留，其覆盖缺口并入对应域需求项处理。

---

## 5. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-21 | 建立本文件；REQ-001/002/010 开工，REQ-010 拆为 19 个子项 |
| 2026-11-22 | REQ-003 转 `done`（远程 head `de4cda8`，206 files，A=142 / M=64 / D=0）；登记本地 `.git` 落后于远程的待办 |
| 2026-11-22 | REQ-010 转 `done`（11 covered / 1 conditional，验收报告 `docs/testing/ACCEPT-CONV-9-20261122.md`）；本文件自 `de4cda8` 入仓后的改动属下一批入仓 |
| 2026-11-22 | B1 三行标 `parked`（用户裁决：只做会话域；代码与文档保留，未提交、未重建、未部署） |

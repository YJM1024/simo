# CHG-CONV-006 · 执行证据

状态：draft
Change: CHG-CONV-006
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003、PRD-CONV-004、PRD-CONV-005、PRD-CONV-006、PRD-CONV-007、PRD-CONV-008、PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003、PRD-SYNC-004
Covers: AC-CHG-CONV-006-01、AC-CHG-CONV-006-02、AC-CHG-CONV-006-03、AC-CHG-CONV-006-04、AC-CHG-CONV-006-05、AC-CHG-CONV-006-06、AC-CHG-CONV-006-07、AC-CHG-CONV-006-08、AC-CHG-CONV-006-09、AC-CHG-CONV-006-10、AC-CHG-CONV-006-11

结果：域级验收已签字（ACCEPT-CONV-9）；本包本轮未重跑，逐条证据维持 `missing`。

## 1. 运行环境

- 工作树：`E:\dsh_home\workspaces\agent`
- 运行时：`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`（PATH 无 node）
- 本轮动作：只补文档结构，未启动服务、未跑前端或后端测试。

## 2. 逐条证据

| 变更级 AC | 证据锚点 | 结果 | 说明 |
|---|---|---|---|
| AC-CHG-CONV-006-01 | `frontend/src/App.operation-errors.test.tsx:49-133`；`frontend/src/app.tsx:773-804`、`:885-890` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-02 | `backend/cmd/simo/p1_conv_chat_idempotency_test.go:58-267`；`backend/internal/modules/chat/idempotency.go:40-143` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-03 | `backend/internal/modules/sessions/spec.go:299-301`、`http.go:361-365`；`frontend/src/components/library.tsx:123`、`:161` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-04 | `backend/cmd/simo/m70_test.go:24`、`m75_spec_projection_test.go:23`；`frontend/src/components/RightPanel.test.tsx:35` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-05 | `backend/internal/modules/sessions/pin_guard_test.go:40-129`、`tree_order_test.go:76-172`；`frontend/src/App.conversation.test.tsx:104` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-06 | `backend/internal/modules/chat/unread_test.go:93`；`frontend/src/App.conversation.test.tsx:222-254` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-07 | `frontend/src/components/library.tsx:161`；`backend/internal/modules/sessions/message_count_test.go:96`、`:168` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-08 | `frontend/src/app.tsx:431`、`:462-464`；`frontend/src/components/RightPanel.test.tsx:59`；`App.integration.test.tsx:262`、`:348` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-09 | `frontend/src/App.conversation.test.tsx:445-455`；`backend/internal/modules/chat/stop_interrupt_test.go:32` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-10 | `backend/internal/modules/sessions/spec_projection_etag_test.go:67-207`；真机记录见 `docs/testing/ACCEPT-CONV-9-20261122.md`（200 / 304） | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |
| AC-CHG-CONV-006-11 | `frontend/src/components/TimelineGroups.test.tsx:88-133`；`frontend/src/components/ExecRowHitArea.test.tsx:120`、`:172` | missing（本轮未执行） | 本轮只补结构，未复跑；域级签字见 ACCEPT-CONV-9，不据以把本条记为 pass |

## 3. 域级证据引用

域级验收报告 `docs/testing/ACCEPT-CONV-9-20261122.md` 记录 11 covered / 1 conditional / 1 gap：`AC-CONV-006-02` 因真实中文输入法未验保持 conditional，`PRD-SYNC-005` 保持 gap。域级 test-plan 第 10 行为 pass 32 / partial 1 / blocked 2。上述结论属于域级签字，不替代本表 11 条变更级 AC 的复跑。

## 4. 未取得的证据

本表 11 条全部为 missing（本轮未执行），原因是没有为变更级 AC 重跑用例；不写“通过”。补齐方式：按 `test-plan.md` §1 的落点逐条执行，把命令、退出码与失败点写回本表。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-CONV-001-01-01 | AC-CONV-001-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-001-02-01 | AC-CONV-001-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-001-03-01 | AC-CONV-001-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-001-04-01 | AC-CONV-001-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-001-05-01 | AC-CONV-001-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-002-01-01 | AC-CONV-002-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-002-02-01 | AC-CONV-002-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-003-01-01 | AC-CONV-003-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-003-02-01 | AC-CONV-003-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-003-03-01 | AC-CONV-003-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-004-01-01 | AC-CONV-004-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-004-02-01 | AC-CONV-004-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-004-03-01 | AC-CONV-004-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-005-01-01 | AC-CONV-005-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-005-02-01 | AC-CONV-005-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-006-01-01 | AC-CONV-006-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-006-02-01 | AC-CONV-006-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-007-01-01 | AC-CONV-007-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-007-02-01 | AC-CONV-007-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-008-01-01 | AC-CONV-008-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-008-02-01 | AC-CONV-008-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-008-03-01 | AC-CONV-008-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-008-04-01 | AC-CONV-008-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CONV-008-05-01 | AC-CONV-008-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-001-01-01 | AC-SYNC-001-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-001-02-01 | AC-SYNC-001-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-002-01-01 | AC-SYNC-002-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-002-02-01 | AC-SYNC-002-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-003-01-01 | AC-SYNC-003-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-003-02-01 | AC-SYNC-003-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-004-01-01 | AC-SYNC-004-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-004-02-01 | AC-SYNC-004-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-004-03-01 | AC-SYNC-004-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-01-01 | AC-CHG-CONV-006-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-02-01 | AC-CHG-CONV-006-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-03-01 | AC-CHG-CONV-006-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-04-01 | AC-CHG-CONV-006-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-05-01 | AC-CHG-CONV-006-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-06-01 | AC-CHG-CONV-006-06 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-07-01 | AC-CHG-CONV-006-07 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-08-01 | AC-CHG-CONV-006-08 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-09-01 | AC-CHG-CONV-006-09 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-10-01 | AC-CHG-CONV-006-10 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-CONV-006-11-01 | AC-CHG-CONV-006-11 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-SYNC-005-01-01 | AC-SYNC-005-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-006/spec.md | 2026-11-22 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

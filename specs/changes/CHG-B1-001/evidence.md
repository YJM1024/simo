# CHG-B1-001 · 证据

状态：`proposed`（未实现、未执行，本文件当前不含任何功能通过证据）

结果：本轮未重跑，逐条证据见下表；未验证项按 `missing` 记，不宣称通过。

## 文档门禁

| 检查 | 命令 | 结果 |
|---|---|---|
| 追溯一致性 | `node scripts/check-trace.mjs` | 见 `spec.md` §4 `AC-CHG-B1-001-07`；实现前记 `missing`，本轮执行结果记在下方「本轮执行」 |
| 变更包完整性 | `node scripts/check-sdd.mjs` | 同上 |

## 未执行（证据缺失）

以下条目在实现与测试执行前一律记 `missing`，不记通过：

- `AC-CHG-B1-001-01` 端到端主链路：missing，脚本未创建，会话内任务、产物与工作台截图为 0 张。
- `AC-CHG-B1-001-02` 失败与重试：missing，未构造失败任务。
- `AC-CHG-B1-001-03` 取消闭环：missing，未执行取消与 30 秒产物观察。
- `AC-CHG-B1-001-04` 越界负用例：missing，四条负路径未跑。
- `AC-CHG-B1-001-05` 工作台三态：missing，三张 8787 截图未取。
- `AC-CHG-B1-001-06` 状态机与重启：missing，未做重启实验。
- `AC-TASK-003-01`–`05`：blocked（实现 `unimplemented`，单任务消息未实现）。
- `AC-TASK-004-01`–`04`、`AC-TASK-005-01`–`04`：blocked（排期归 B3）。
- `AC-FILE-002-01`–`05`、`AC-FILE-005-01`–`05`、`AC-FILE-006-01`–`04`：missing（归 B2/B4，未在本轮执行）。

## 本轮执行

- `node scripts/check-trace.mjs`（2026-11-22，用 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe` 运行）：`PASS (checks: 680)`，退出码 0。摘要：PRD 总数 TREE 72 / TRACEABILITY 声明 72 / 实际 72，缺失 0，坏 TEST 锚点 0，产品 spec 问题 0，change 包 18、change 问题 0、治理豁免 1（`CHG-SYS-001`），R4 检查行 72。
- `node scripts/check-sdd.mjs`（同上 node 路径）：退出码 1，共 28 条 issue，全部落在本包之外的历史变更包（`CHG-CONV-001/002/003/004/006` 的 R2/R3/R1）与 `specs/COMP-message-colors/spec.md:97` 的 S1；本包（`CHG-B1-001`）0 条。复跑命令：`node scripts/check-sdd.mjs`，用 `Select-String 'CHG-B1-001'` 过滤本包，命中 0 行。
- 本轮产出（行数以写入时为准）：`proposal.md` 54 行、`spec.md` 150 行、`tasks.md` 22 行、`test-plan.md` 39 行、`evidence.md` 本文件；产品侧 `specs/product/P2-TASK/spec.md` 200 行、`specs/product/P4-FILE/spec.md` 192 行。
- 待复核：`check-sdd` 的 28 条 issue 属既有欠账（涉及 `specs/changes/CHG-CONV-001`、`CHG-CONV-002`、`CHG-CONV-003`、`CHG-CONV-004`、`CHG-CONV-006` 与 `specs/COMP-message-colors/spec.md`），本轮未触碰这些文件；是否单独清理由 Lead 裁决。本包首跑曾被 R3 在本文件第 30 行报 1 条（缺可复现线索），补上 `node scripts/check-sdd.mjs` 与文件名后复跑，结果见下表。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-CHG-B1-001-01-01 | AC-CHG-B1-001-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-B1-001-02-01 | AC-CHG-B1-001-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-B1-001-03-01 | AC-CHG-B1-001-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-B1-001-04-01 | AC-CHG-B1-001-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-B1-001-05-01 | AC-CHG-B1-001-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-B1-001-06-01 | AC-CHG-B1-001-06 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-CHG-B1-001-07-01 | AC-CHG-B1-001-07 | 断言脚本 | node scripts/check-gates.mjs | specs/changes/CHG-B1-001/evidence.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-003-01-01 | AC-TASK-003-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-004-01-01 | AC-TASK-004-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-005-01-01 | AC-TASK-005-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-002-01-01 | AC-FILE-002-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-005-01-01 | AC-FILE-005-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-006-01-01 | AC-FILE-006-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-001-01-01 | AC-TASK-001-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-001-02-01 | AC-TASK-001-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-001-03-01 | AC-TASK-001-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-001-04-01 | AC-TASK-001-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-001-05-01 | AC-TASK-001-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-001-06-01 | AC-TASK-001-06 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-002-01-01 | AC-TASK-002-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-002-02-01 | AC-TASK-002-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-002-03-01 | AC-TASK-002-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-002-04-01 | AC-TASK-002-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-003-02-01 | AC-TASK-003-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-003-03-01 | AC-TASK-003-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-003-04-01 | AC-TASK-003-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-003-05-01 | AC-TASK-003-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-006-01-01 | AC-TASK-006-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-006-02-01 | AC-TASK-006-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-006-03-01 | AC-TASK-006-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-006-04-01 | AC-TASK-006-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-006-05-01 | AC-TASK-006-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-006-06-01 | AC-TASK-006-06 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-006-07-01 | AC-TASK-006-07 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-004-02-01 | AC-TASK-004-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-004-03-01 | AC-TASK-004-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-004-04-01 | AC-TASK-004-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-005-02-01 | AC-TASK-005-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-005-03-01 | AC-TASK-005-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-TASK-005-04-01 | AC-TASK-005-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-001-01-01 | AC-FILE-001-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-001-02-01 | AC-FILE-001-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-001-03-01 | AC-FILE-001-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-001-04-01 | AC-FILE-001-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-001-05-01 | AC-FILE-001-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-001-06-01 | AC-FILE-001-06 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-005-02-01 | AC-FILE-005-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-005-03-01 | AC-FILE-005-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-005-04-01 | AC-FILE-005-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-005-05-01 | AC-FILE-005-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-002-02-01 | AC-FILE-002-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-002-03-01 | AC-FILE-002-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-002-04-01 | AC-FILE-002-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-002-05-01 | AC-FILE-002-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-003-01-01 | AC-FILE-003-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-003-02-01 | AC-FILE-003-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-003-03-01 | AC-FILE-003-03 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-003-04-01 | AC-FILE-003-04 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-003-05-01 | AC-FILE-003-05 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |
| E-AC-FILE-004-01-01 | AC-FILE-004-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-B1-001/spec.md | 2026-11-22 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

# CHG-B1-001 · 证据

状态：`proposed`（未实现、未执行，本文件当前不含任何功能通过证据）

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

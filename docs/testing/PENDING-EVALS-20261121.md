# 2026-11-21 重启/多进程类评测证据

状态：**active** — 记录 12 个需要真实起停/多进程的评测脚本实际执行结果。适用于本机 Windows 隔离环境，**不代表 8787 真实模型验收，也不改变 PRD 覆盖统计**。

## 1. 执行环境

| 项 | 值 |
|---|---|
| 被测二进制 | `.tmp/simo-current.exe`（由当前源码构建，非 8787 实例） |
| 模型 | mock / 测试配置；不使用真实模型 |
| 数据 | 每个脚本独立临时 `SIMO_HOME`，执行后保留在 `.tmp/<case>-*` |
| 端口 | 18902–19092 等独立端口，不使用 8787 |
| 进程窗口 | 隐藏窗口启动；子进程使用 `CREATE_NO_WINDOW` |
| 临时目录 | `TMP`/`TEMP` 指向 `E:\dsh_home\workspaces\agent\.tmp`，避免系统 Temp 不可写 |
| 日志 | `.tmp/pending-evals/<name>.log`、`.tmp/pending-evals/<name>.err.log` |

## 2. 结果汇总

12 个脚本全部退出码 0：

| 脚本 | 结果 | 关键验证 |
|---|---:|---|
| `workflow-restart` | 13/13 PASS | 进程被杀后工作流同 id 恢复、收敛 done、无重复 task、消息保留 |
| `schedule-restart` | 11/11 PASS | interval/once 跨重启保留、错过任务补偿、目标会话可见 |
| `reply-persist` | 15/15 PASS | `replyTo` 快照跨重启保留且字段一致 |
| `card-persist` | 6/6 PASS | 卡片消息与 `GET /api/cards` 跨重启保留 |
| `runtime-recovery` | 11/11 PASS | 中断工作流恢复、无重复/回退、恢复审计 |
| `runtime-long-approval` | 12/12 PASS | 审批跨重启 pending/approve/expire，不自动批准 |
| `team-concurrency` | 6/6 PASS | 全局/工作流并发上限、排队与 `stateReason` |
| `team-executor` | 4/4 PASS | 默认 executor 与 `SIMO_TASK_EXECUTOR` 覆盖 |
| `team-v1-persist` | 12/12 PASS | 团队/成员/内部消息跨重启保留 |
| `m27-m30-env` | 12/12 PASS | R2/hopLimit/agentic 关闭与 M32 向量默认关闭 |
| `m32-vector-env` | 8/8 PASS | `SIMO_RECALL_VECTOR=1` 重建索引、vector trace、R2 默认 hop |
| `category-backfill` | 8/8 PASS | 旧 agentd 库迁移 v10 后历史 agent 消息回填 consultation，user 消息保持空分类，`sessionPath` 可用 |

合计 **118 条脚本内检查全部 PASS**。

## 3. 特殊适配与限制

### 3.1 `category-backfill`

- 旧二进制优先 `toolchain\tmp\simo-eval.exe`，否则 `simo-m13.exe`；旧程序实际写入 `agentd.db`。
- 脚本同时设置 `SIMO_*` 与 `AGENTD_*` 环境；停旧进程后把 `agentd.db`/`-wal`/`-shm` 复制为 `simo.db`/`-wal`/`-shm`，再让当前二进制执行 chat v10 迁移。
- 这是历史迁移兼容性证据，不是“所有旧版本均可无损迁移”的证明。

### 3.2 不能据此宣称

- 这些脚本使用 mock 模型与临时数据；**不能**替代真实模型长程、真实用户数据、真实权限/审批策略验收。
- `team-concurrency` 的 `stateReason` 在日志中出现编码乱码（`reason=???:??????,??????`）；该条只断言字段非空，不等同于人类可读原因验证。
- 脚本全部在 Windows 本机执行；Linux CI 只覆盖 `go test` 与前端质量门禁，不覆盖这些起停脚本。
- 通过脚本用例不等于对应 PRD 的 AC 全部满足；`docs/product/TRACEABILITY.md` 仍为 **covered 0 / partial 48 / gap 23**，不因本文件升级。
- 本文件不修改 `docs/tasks/acceptance.md` 的签字范围；最终 CI 状态以 GitHub Actions 实际结果为准。

## 4. 复现

```powershell
# 示例：单个脚本（实际执行时使用隔离 home/端口，隐藏窗口）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File evals\workflow-restart.ps1

# 批量执行（本地脚本）
Get-ChildItem evals\*.ps1 | Where-Object { $_.Name -in @('workflow-restart.ps1', ...) }
```

批量执行日志见 `.tmp/pending-evals/`；`summary.txt` 包含早期系统 Temp 不可写造成的失败重试记录，**以各 `<name>.log` 的最终 PASS 行为准**。

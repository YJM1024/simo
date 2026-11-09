# M27/M28/M30 验收报告（上一构建 12:29；最终构建见 `evals/RELEASE.md` 文末附录）

> 生成时间：2026-11-08（Asia/Shanghai）
> 被测：`agentd/simo.exe`（21,810,688 bytes，2026-11-08 12:29；M27 + M28 + M30 同源构建）——**本报告为上一构建；13:26 最终构建已修复 recall 实体绑定自锁并重跑，终值见 `evals/RELEASE.md` 文末“最终构建终值（M1–M31）”。**
> 评测：`evals/`（零第三方依赖，bundled node v24.21.0）+ 10 个专项 `.ps1` 脚本
> 环境：`AGENTD_LLM=mock AGENTD_DEBUG=1`，独立端口 18941–18946，每块新建 GUID 临时 `AGENTD_HOME`；不碰 8787 / `simo-live.exe`

## 1. 结论

| 项目 | 结果 |
|---|---|
| **新增 case（9 条）** | **7 条活跃全 PASS + 2 条 env 门禁由 `m27-m30-env.ps1` 8/8 覆盖** |
| **M1–M30 分块全量** | **122/122 可执行 PASS + 11 PENDING，exit 0**（1 次既有 flake 重跑 2/2 PASS） |
| **M25/M26 专项回归** | **10/10 PASS** |
| **专项脚本（10 个）** | **全绿**：13/13、11/11、8/8、15/15、11/11、12/12、6/6、4/4、12/12、8/8 |
| **real-smoke（真实模型，3 次）** | 7/7、7/7、6/7；token 48,384 / 45,947 / 50,862，**中位 48,384 > 45,000（软目标未达标）** |
| **已知缺陷** | 新增 1 条（`debug recall` 命中实体绑定记忆时 30s 超时，未修，不阻塞本套 case） |

**一句话**：M27 R2 召回、M28 视图编辑、M30 记忆巩固的 mock 契约与回归全部通过；真实模型 smoke 结构断言基本通过但 token 预算超标，另发现召回单连接自锁缺陷需后续修复。

## 2. 新增 case（`evals/cases/121`–`129`）

| id | tier | 断言 |
|---|---|---|
| `memory-consolidate-basic` | critical | debug consolidate：候选 3 / 写回 2 / 冲突 1；job 可查；冲突保留 Orion/Vega |
| `memory-consolidate-idempotent` | normal | 同源消息重复调用：同一 job + `idempotent:true`，不重复写 |
| `memory-consolidate-conflict` | critical | 同 factKey 不同值 → 两条 `disputed` 均保留（不自动裁决） |
| `memory-consolidate-agent` | normal | 稳定事实/规范/偏好写 `agent_memory`，带 `ownerAgent=agent:simo`、`source=conversation`、`authority=inferred` |
| `memory-consolidate-off` | critical | PENDING → `m27-m30-env.ps1`：`enabled=false`、9 条超阈值不自动、debug 手动仍可 |
| `recall-r2-twohop` | critical | 2 跳 `paths`（3 实体/2 边）、`hopLimit=2`、`trace.steps`、`edgeVisits`、`cite` |
| `recall-r2-agentic` | normal | `steps` 1–3 步、空结果 `ask`/`no_hit`、`hopLimit=2` |
| `recall-r2-switch` | critical | PENDING → `m27-m30-env.ps1`：`AGENTD_RECALL_R2=0` → `hopLimit=1`、无 steps、`hop_capped` |
| `view-editor` | critical | `ui.set_view` patch（add/remove/set props/replace blocks）+ 过期 baseVersion 409 `VIEW_BASE_CONFLICT` + rollback 后内容与 v2 一致、版本 4 |

## 3. 全量统计（133 条 = 122 可执行 + 11 PENDING）

| 块 | 范围 | run.mjs |
|---|---|---|
| block1 | M1–M8（34 条） | 34/34 PASS |
| block2 | M9–M15（33 条） | 28/29 PASS + 4 PENDING（`workflow-advance` 1 次 flake Δ=8044ms，单跑 2/2 PASS） |
| block3 | M17–M20 + UI-1（27 条，含 CLI） | 25/25 PASS + 2 PENDING |
| block4 | M21–M30（39 条） | 34/34 PASS + 5 PENDING |

- PENDING 覆盖：`workflow-restart` 13/13、`schedule-restart` 11/11、`category-backfill` 8/8、`reply-persist` 15/15、`runtime-recovery` 11/11、`runtime-long-approval` 12/12、`team-concurrency` 6/6、`team-executor` 4/4、`team-v1-persist` 12/12、`m27-m30-env` 8/8。
- M25/M26 专项：`team-v2-*` 5/5 + `view-*` 5/5 = 10/10。
- M29（便携包/安装/升级/备份恢复）：按 Lead 交接，已由 harness-scout 验证通过；本轮不重复执行，细节以 `deploy/INSTALL.md` 为准。
- M27 新 case：`recall-r2-twohop` 10/10、`recall-r2-agentic` 7/7；M28：`view-editor` 19/19；M30：11/11、6/6、5/5、7/7。

## 4. 已知问题 / 风险

1. **召回单连接自锁（新发现，未修）**：`debug recall` 命中“带实体绑定的记忆”时约 30s（HTTP RequestTimeout）后返回空 `items`。根因：`internal/modules/memory/recall.go` 在 `memory_entities` 查询游标未关闭时嵌套 `QueryRow(entities)`，SQLite `SetMaxOpenConns(1)` 下等待唯一连接直到请求超时。现有 evals seed 不带 `entityRefs`，故 M22/M27 case 未暴露；真实会话记忆均带 scope/实体绑定。修复建议：先把 entity_id 收集到切片、关闭游标后再查实体；或改为一次 JOIN。
2. **真实模型 token 预算未达标（软目标）**：3 次 official 中位 48,384 > 45,000；诊断第 4 次 7/7 PASS、40,524。较 M21–M26 中位 39,868 上升，主因 M27–M30 后动作/工具目录与提示词变长，建议重设基线或压缩按需发现索引。
3. **real-category-demand 真实模型 flake**：第 3 次 1 个 grader 红，其余 2 次 PASS；属真实模型输出波动，建议保持 normal。
4. **workflow-advance 时序 flake（既有）**：Δ=8044ms > tolerance 5000ms，机器负载相关，单跑 2/2 PASS。
5. team 内部事件类型未注册（`team.template.applied` / `team.created`）为既有已转后端项，case 已避开。

## 5. 复现

```powershell
# 起 mock 服务（独立 home/端口）
$env:AGENTD_HOME="<workspace>\.tmp\<guid>"; $env:AGENTD_LLM="mock"; $env:AGENTD_DEBUG="1"
agentd\simo.exe serve -addr 127.0.0.1:18950 -debug

# 9 条新增 case（env 两条除外）
node evals/run.mjs --base-url http://127.0.0.1:18950 --agentd-home $env:AGENTD_HOME `
  --only memory-consolidate-basic,memory-consolidate-idempotent,memory-consolidate-conflict,memory-consolidate-agent,recall-r2-twohop,recall-r2-agentic,view-editor

# env 门禁（R2=0 / CONSOLIDATE=0，自建服务）
powershell -NoProfile -ExecutionPolicy Bypass -File evals\m27-m30-env.ps1 -Exe agentd\simo.exe -Port 18932
```

# 生产切换手册 · PRODUCTION CUTOVER

状态：**runbook（只文档；本文件不代表已执行/已部署）**
适用：将 8787 从旧 build/旧二进制切换到新 build（真实模型、正式数据）。
关联：[`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md)、[`COMPONENT-PARITY-GATE.md`](COMPONENT-PARITY-GATE.md)、[`SCENARIOS.md`](SCENARIOS.md) 发布、[`ROLES.md`](ROLES.md)。

> **硬规则**：`check:sdd` 与组件 parity 为 **Blocking**；`check:visual` 只是 nightly/warning，不阻断。任何 Blocking 未签 = 不切换。**不改代码、不部署，除非本文前置与用户授权全部满足。**

---

## 0. 前置条件（缺一不切换）

| # | 前置 | 通过标准 | 证据 |
|---|---|---|---|
| P1 | 构建冻结 | 待切换 build-id/commit/二进制 hash 固定；不再改代码/产物 | build-id、sha256 |
| P2 | 备份 | 生产 `SIMO_HOME` 整目录备份：DB+WAL、workspace/output、specs、config；可恢复验证 | 备份路径/大小/hash/恢复演练 |
| P3 | 数据迁移 dry-run | 在**副本**上跑迁移/校验（行数/抽样/hash/关键查询）；差异有清单 | dry-run 报告 |
| P4 | 真实模型配置 | Key 通过环境变量/受保护配置注入；模型/地址/推理强度确认；**不写入日志/文档/仓库** | 配置检查（脱敏） |
| P5 | 组件 parity | 当前 build 的 1600/375 图 + `component-parity.md`；验收 Agent 签字；无错位/风格漂移 | parity 三件套 + 签字 |
| P6 | `check:sdd` | 通过（Blocking）；AC/映射无缺 | 命令输出/退出码 |
| P7 | `check:visual` | **仅 nightly/warning**；记录趋势，不作为阻断，也不替代 parity | 报告（warning 可接受） |
| P8 | 回滚包 | 旧二进制、旧 build、旧 `SIMO_HOME`/DB 备份、回滚命令/负责人 | 路径/命令/联系人 |
| P9 | 维护窗口 | 停旧→切换→smoke 的时间窗；用户已知会 | 时间/通知记录 |
| P10 | 授权 | 真实模型密钥、正式数据、上线时间三项均已获用户明确授权；验收 Agent 对后端/迁移/流程签字 | 授权记录 |

> 备份必须在**停写后**做最终一致备份；运行中备份只作为预检，不作为回滚依据。

---

## 1. 切换步骤

> 命令均为 Windows PowerShell 形态；实际路径以现场 `SIMO_HOME`/部署目录为准。每步记录时间、命令、输出摘要、负责人。

### 1.1 宣布窗口/冻结

1. 通知用户进入维护窗口；确认无人正在长任务/审批/发送；
2. 冻结新 build、配置、迁移脚本；记录 build-id/commit/sha256；
3. 确认只保留一个实例，记录旧进程 PID/端口/锁。

### 1.2 停旧

```powershell
# 以实际进程/服务方式为准；先优雅停，再确认退出
Stop-Process -Id <old-pid>   # 或服务管理器停止
Get-NetTCPConnection -LocalPort 8787 -State Listen   # 应无结果
```

- 等待在途任务收敛/超时；记录未完成任务；
- 确认 `SIMO_HOME/*.lock` 不再被持有；**不要强杀后直接启动新实例**；
- 若无法优雅停：记录原因，先备份，再按回滚预案处理。

### 1.3 最终备份（停写后）

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -Recurse -Force $env:SIMO_HOME "D:\backup\simo-home-$stamp"
Get-FileHash "$env:SIMO_HOME\simo.db" -Algorithm SHA256
```

- 备份含 DB/WAL/workspace/output/specs/config；排除 `work/` 可选；
- 校验备份可读、大小/hash 记录；记录备份路径；
- 旧二进制/build 另存，不覆盖。

### 1.4 数据迁移（如需要）

- 只在副本 dry-run 通过后执行；
- 迁移前再次确认备份；迁移过程 fail-closed；
- 记录迁移版本、行数、抽样/hash、耗时；
- 失败 → 不启动新 build，直接回滚（§3）。

### 1.5 切 build

```powershell
# 原子替换：旧 binary 保留为 simo.exe.prev
Copy-Item .\simo.exe .\simo.exe.prev -Force
Copy-Item .\new\simo.exe .\simo.exe -Force
# 新前端产物若内嵌，确认 build-id/asset 与发布包一致
```

- 不改 `SIMO_HOME` 路径（同一生产 home）；如确需变更，按迁移手册单独评审；
- 确认文件时间/hash 与发布包一致；
- 不回滚配置中的真实模型设置（除非显式变更）。

### 1.6 启动 real

```powershell
$env:SIMO_HOME = "C:\Users\<user>\.simo"   # 以实际生产 home 为准
$env:SIMO_LLM = "real"
$env:SIMO_API_KEY = "<从受保护来源注入，不写入脚本/日志>"
.\simo.exe serve -addr 127.0.0.1:8787
```

- 先确认端口只监听回环；不暴露公网；
- 日志中不得出现 Key/敏感 header；
- 记录新进程 PID/build-id。

### 1.7 健康检查

```powershell
curl.exe -sS http://127.0.0.1:8787/api/health
```

- `ok:true`/`ready:true`；版本/build-id 与发布包一致；
- DB 可读、迁移版本正确、无启动错误；
- 前端资源加载（build-id/`?v=`）与当前 build 一致；console error 0。

### 1.8 发送/流式 smoke（真实模型）

- 使用**专用 smoke 会话**（非用户主会话正式内容），发一条固定短消息；
- 验证：用户消息落库、流式回复、首字/完成、无重复、无 console error；
- 验证后归档 smoke 会话；若产生测试消息，记录并清理/归档，不混入用户主会话；
- 真实模型 token/延迟按现场记录；失败按 §3 回滚；
- **不得用正式用户数据做破坏性测试**。

### 1.9 切换完成

- 恢复用户访问；观察日志/错误/健康；
- 记录切换完成时间、build-id、迁移版本、smoke 结果；
- 更新 `STATUS.md`/验收记录；未签项不得宣称完成。

---

## 2. 切换后验证清单

- [ ] 8787 health/ready 正常；build-id 与发布包一致；
- [ ] real 模型可用；Key 未出现在日志/页面/错误信息；
- [ ] 发送/流式 smoke 通过（专用会话）；
- [ ] 真实数据可读：会话/消息/任务/交付物；
- [ ] 迁移版本/行数/抽样校验通过；
- [ ] 分类标签/时间轴/组件 parity 无回归；
- [ ] `check:sdd` 通过；parity 签字有效；
- [ ] console error 0、关键请求无 4xx/5xx；
- [ ] `check:visual` 结果记录为 nightly/warning（不阻断）；
- [ ] 备份/回滚包仍可用；回滚负责人已知；
- [ ] 用户确认前端效果；验收 Agent 确认后端/迁移/流程；
- [ ] 文档/状态更新，未夸大。

---

## 3. 回滚

### 3.1 触发条件（任一）

- health/ready 持续失败；启动/DB 迁移失败；
- 真实模型 smoke 失败且无法短时修复；
- 关键数据不可读/写错/迁移对账失败；
- 严重 UI/接口回归，影响核心路径；
- 安全/密钥泄露迹象。

### 3.2 回滚步骤

1. **停新**：停止新 build，确认端口/锁释放；
2. **恢复旧二进制**：`simo.exe.prev` → `simo.exe`（或旧 build 目录）；
3. **恢复数据**：若迁移已执行，恢复**停写后备份的 `SIMO_HOME`/DB**；不要只回滚代码不回滚 schema；
4. **恢复配置**：旧 `config.local.json`/环境变量（不含新 Key 的意外变更）；
5. **启动旧 build**：`SIMO_LLM` 按旧生产配置（real/mock 按切换前记录）；
6. **健康 + 最小 smoke**：health/关键 API/发送（测试会话）；
7. **记录**：回滚原因、时间、数据恢复点、影响范围、后续动作。

### 3.3 回滚注意事项

- **不要同时运行新旧实例**（同一 `SIMO_HOME` 文件锁会阻止；也不得绕过锁）；
- 数据迁移若不可逆：旧代码可能读不了新 schema → 必须恢复备份，不可只换二进制；
- 回滚后保留新 build/日志/迁移证据，供复盘；
- 回滚完成不等于事故关闭，按 `SCENARIOS.md` 事故流程复盘。

---

## 4. 需要用户授权的项

以下三项必须由用户**明确授权**，缺一不切换：

1. **真实模型密钥**：允许在生产环境使用该 Key（通过环境变量/受保护配置注入，不写入仓库/文档/日志）；
2. **正式数据**：允许读取/迁移生产 `SIMO_HOME`/DB/workspace/output；允许在维护窗口停写；
3. **上线时间**：确认维护窗口与切换时间；确认可由验收 Agent 对后端/迁移/流程签字（用户只验收前端效果）。

授权记录写：谁、时间、范围、有效期；口头授权需落文档。

---

## 5. 角色与签字

| 角色 | 责任 |
|---|---|
| 发布 owner | 执行切换/回滚，记录证据 |
| 后端/数据 owner | 迁移 dry-run、备份恢复、DB/健康 |
| 前端 owner | build/前端 smoke、console/关键 UI |
| 测试 | smoke/回归/证据 |
| 验收 Agent | `check:sdd`、parity、后端/迁移/流程签字 |
| Lead | Go/No-Go、窗口、升级/回滚决策 |
| 用户 | 只验收前端效果 + 授权三项 |

> 实现者不得自签；无 parity/`check:sdd` 签字 = No-Go；`check:visual` warning 不是阻断也不是通过依据。

---

*本文件只定义生产切换 runbook；不执行部署、不改代码。执行前必须完成 §0 前置与 §4 授权。*

# 配置管理（MCP / CLI / Skills）· 草案

状态：**draft / P2 backlog（只记录需求；不进入当前 P0–P1，不写代码）**
范围：MCP 服务、CLI 工具、Skills 的安装/启用/编辑/测试，以及统一管理面、安全与验收。
关联：`docs/tasks/product.md` P10 backlog、`docs/process/skills/`、未来设置页 spec。本文不定义实现。

---

## 1. 目标与原则

**目标**：让用户能看见、启用/禁用、测试和审计司墨可用的外部能力（MCP/CLI/Skills），同时不把危险能力默认打开。

原则：

1. **默认最小权限**：新增能力默认 disabled；启用需要显式确认；
2. **密钥不入库明文**：只存 secret 引用（env/keychain/受保护文件），展示时永远脱敏；
3. **作用域清晰**：global / agent / session 三级；窄作用域优先，跨会话不共享未授权能力；
4. **可审计**：每次新增/编辑/启用/禁用/安装/调用关键动作留审计；
5. **先只读后写入**：分期先做列表+启用/禁用，再做安装/编辑/测试；
6. **管理面独立**：不放进对话/工作台导航；后续单独设置页（本草案不新增当前导航）。

## 2. MCP 服务

### 2.1 对象（概念字段）

```text
McpServer {
  id, name, description
  transport: 'stdio' | 'sse' | 'http'
  command?, args?, url?          // stdio 用 command/args；sse/http 用 url
  envRefs[], headerRefs[]        // 只存 secret 引用/非敏感键
  scope: 'global' | 'agent' | 'session'
  scopeId?                       // agentId/sessionId；global 为空
  enabled: boolean
  health: 'unknown' | 'ok' | 'error'
  tools: McpTool[]               // 发现结果，只读缓存
  lastCheckedAt?
  createdAt, updatedAt
}
```

### 2.2 管理能力

- 新增/编辑/删除（删除需确认；运行中调用先停用）；
- 传输：stdio（本地进程）、SSE、HTTP；按传输校验必填字段；
- 环境变量/headers：只允许引用 secret；非敏感值可明文；禁止在日志/UI 回显完整 secret；
- 启用/禁用：默认 disabled；启用前做一次连接/工具发现/健康检查；
- 工具发现：返回工具名/描述/参数 schema（脱敏）；失败不启用；
- 健康检查：连接、初始化、tools/list；失败显示可读错误，不自动重试风暴；
- 作用域：global/agent/session；同一工具多来源冲突时窄作用域优先，并显示冲突；
- 工具调用仍受权限/审批/沙箱约束，MCP 不能绕过。

### 2.3 安全

- stdio 只允许受控命令/参数，不允许用户任意拼接 shell；工作目录/环境白名单；
- SSE/HTTP 只允许显式 URL；内网/本机地址按现有 fetch 策略拦截；
- secret 只存引用；日志/审计/错误消息脱敏；
- 禁用/删除后立即从 agent 工具列表移除；不继续复用旧连接。

## 3. CLI 工具

### 3.1 对象

```text
CliTool {
  id, name, description
  commandWhitelist: string[]       // 允许的可执行/命令名，不接受任意 shell
  argsSchema?                      // 参数白名单/JSON Schema
  cwdScope: 'workspace' | 'fixed'
  fixedCwd?
  envRefs[]                       // 只传白名单环境变量
  timeoutMs
  sandbox: 'read-only' | 'workspace-write' | 'full'
  approval: 'auto' | 'ask' | 'always'  // 或映射 risk R0–R4
  scope: 'global' | 'agent' | 'session'
  scopeId?
  enabled: boolean
  version?
}
```

### 3.2 规则

- **命令白名单**：只允许登记的可执行与参数形态；禁止 `sh -c`/`cmd /c` 任意拼接；
- 参数：按 schema 校验；禁止路径穿越；写操作限工作区；
- 工作目录：只能是 workspace 根/固定子目录；不能指向系统目录；
- 环境：白名单传递，不继承 API key；secret 用引用；
- 超时：必须设置，超时终止进程树；
- 沙箱：read-only/workspace-write/full；默认 read-only 或 workspace-write；
- 审批：按风险/动作；R3+ 必须审批，不允许 CLI 配置绕过；
- 启用/禁用：禁用后不出现在工具列表；
- 作用域：按 agent/session；窄优先；跨 agent 不默认共享。

## 4. Skills

### 4.1 对象

```text
Skill {
  id, name, version
  source: 'local' | 'git' | 'registry'
  sourceRef                     // 路径/URL/仓库+ref；不暴露密钥
  description
  dependencies[]                // 版本约束
  permissions[]                 // filesystem/network/tools/secret 需求
  scope: 'global' | 'agent' | 'session'
  scopeId?
  enabled: boolean
  installedAt, updatedAt
  galleryEntry?                 // 画廊/清单登记 id
  integrity?                    // hash/signature（可选）
}
```

### 4.2 管理能力

- 安装/启用/禁用/更新/卸载（安装/更新需确认来源与权限）；
- 来源与版本：本地目录、git、registry；版本/ref 固定；更新显示 diff/权限变化；
- 依赖：解析/展示依赖；缺依赖不启用；
- 权限：声明所需 filesystem/network/tools/secret；最小权限；新增权限需再次确认；
- 作用域：global/agent/session；窄优先；不默认跨 agent 共享；
- 画廊/清单登记：Skills 的展示/描述/版本/权限/状态进入统一清单；无登记不启用；
- 卸载/禁用后从可用 skills 列表移除。

## 5. 统一管理面

### 5.1 入口

- **不放在对话/工作台导航**；后续作为设置页内的「能力/配置」区域（独立设置页 spec 再定）；
- 首版管理面只读 + 启用/禁用；安装/编辑/测试放第二期。

### 5.2 页面结构

1. **列表**：类型（MCP/CLI/Skill）、名称、来源、版本、作用域、状态（enabled/disabled/error）、最后检查时间；
2. **详情**：描述、传输/命令、权限、工具/参数、secret 引用（脱敏）、依赖、审计摘要；
3. **操作**：启用/禁用；第二期安装/编辑/删除/更新；
4. **测试**：连接/健康/工具发现/最小调用（需权限与审批）；测试结果只读展示；
5. **状态**：unknown/ok/error/disabled；错误可读、可重试；
6. **审计**：谁在何时启用/编辑/安装/调用；只读。

### 5.3 禁止

- 在对话/工作台塞配置入口；
- 明文显示密钥/header value；
- 未经测试直接启用；
- 用配置绕过审批/沙箱。

## 6. 安全（统一）

| 面 | 要求 |
|---|---|
| 权限 | 最小权限；scope 窄优先；跨会话/agent 需显式授权 |
| 审批 | MCP 工具/CLI 调用沿用动作风险；R3+ 审批；配置不可降级 |
| 密钥 | secret 引用，不落库明文；UI/日志/审计脱敏；导出不带 secret |
| 路径 | canonical 校验；拒绝 `..`/绝对路径/UNC/symlink 穿越；cwd 限 workspace |
| 网络 | URL 白名单/内网拦截；SSE/HTTP 不允许任意来源 |
| 审计 | 配置变更 + 调用关键动作；不可篡改/可导出 |
| 默认 | 新能力 disabled；失败 fail-closed；禁用立即生效 |

## 7. 验收草案

### 7.1 一期（只读列表 + 启用/禁用）

- 列表展示 MCP/CLI/Skills；状态/来源/版本/作用域正确；
- 启用前健康/工具发现；失败显示错误，不启用；
- 禁用后工具/技能从可用列表消失；不继续调用；
- 密钥/hdr 脱敏；审计有记录；
- 作用域隔离：agent/session 不串；
- 空/加载/错误三态；不造假数据。

### 7.2 二期（安装/编辑/测试）

- 新增/编辑/删除 MCP/CLI/Skill 带校验；
- 安装来源/版本/依赖/权限确认；更新显示变更；
- 测试连接/健康/最小调用；失败可回滚；
- 删除/卸载有确认，运行中先停用；
- 审计完整；secret 不入明文库。

### 7.3 验收编号建议

| ID | 场景 | 通过标准 |
|---|---|---|
| C1 | 列表/状态 | 三类能力列表、状态、作用域正确 |
| C2 | 启用/禁用 | 默认禁用；启用前检查；禁用立即移除 |
| C3 | 作用域 | global/agent/session 隔离；窄优先 |
| C4 | 密钥 | 无明文；UI/日志/审计脱敏 |
| C5 | MCP 健康 | 连接/工具发现失败不启用；错误可读 |
| C6 | CLI 安全 | 白名单/参数/cwd/env/timeout/沙箱生效 |
| C7 | Skills | 来源/版本/依赖/权限/清单/作用域 |
| C8 | 审计 | 变更与调用可追溯 |
| C9 | 二期安装/编辑 | 校验/确认/回滚 |
| C10 | 三态/响应式 | 空/加载/错误；设置页 1600/1180/375 |

## 8. 分期与优先级

- **P2 backlog，不进入当前 P0–P1**；
- **一期**：只读列表 + 启用/禁用 + 健康检查 + 审计；
- **二期**：安装/编辑/删除/更新 + 测试 + 权限 diff；
- **三期（可选）**：独立设置页导航、导入/导出、模板。

## 9. 待确认

1. MCP 是否允许远程 SSE/HTTP（安全边界/白名单）；
2. CLI 是否只允许登记工具，还是允许用户自定义命令（建议前者）；
3. Skills 来源是否允许远程 registry/git（供应链风险）；
4. 作用域默认值（global vs agent）；
5. 配置导入/导出是否包含 secret 引用；
6. 管理面是否最终独立设置页（当前明确不放进对话/工作台导航）。

---

*本文件只定义需求/安全/验收草案，不实现；所有 key/权限/路径需按既有安全基线评审后再落地。*

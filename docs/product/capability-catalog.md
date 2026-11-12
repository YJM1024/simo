# 能力目录树（Capability Catalog）· 草案

状态：**draft / P2 backlog（只记录需求；不实现、不接页面）**
范围：把 Skills / MCP / CLI / NCP 统一为可发现、可按需加载的能力节点树，供智能体/管理面使用。
关联：`docs/product/config-management.md`（能力的安装/启停）、`docs/process/skills/`、后续设置页。
本文只定义模型/协议/验收，不改代码。

---

## 1. 目标与原则

**目标**：能力很多时不把所有说明塞进上下文；用 **L0→L3 分层摘要 + catalog.list/search/load** 按需展开，并以 token 预算、权限过滤、缓存、版本/依赖、审计为硬约束。

原则：

1. **摘要优先**：默认只给 L0/L1/L2；L3 完整 schema 只有明确 load 才返回；
2. **预算硬上限**：任何 catalog 调用都带 token 预算；超出必须截断并给继续方式，不静默丢弃；
3. **先权限后排序/预算**：无权限/禁用节点不进入候选，不能通过搜索探测存在性；
4. **单一来源**：节点来自能力注册表（Skills/MCP/CLI/NCP），catalog 不复制业务数据；
5. **版本明确**：list/search 给版本；load 可固定版本；依赖/冲突可见；
6. **可解释**：每次结果给层级、来源、版本、`catalogRevision`、预算使用；管理面可追溯。

**NCP 定义**：本文把 NCP 作为“本地原生能力包”类节点（与 Skill/MCP/CLI 并列）；不改变其内部安装/启停语义。

## 2. 能力节点树

### 2.1 层级

```text
L0 根分类（少量，稳定）
└─ L1 分类摘要（按领域/类型分组）
   └─ L2 叶子摘要（单个能力：一句话 + 何时用 + 类型/版本/scope）
      └─ L3 完整说明（描述、输入/输出、调用 schema、示例、限制、权限、依赖）
```

- L0/L1 是**分类节点**，不可直接调用；L2/L3 是**能力节点**（叶子）；
- 一个能力只能有一个主分类路径；跨类标签用 tags，不复制节点；
- L2 是默认发现结果，L3 必须 `catalog.load` 获取；
- 层级不因安装顺序变化；分类路径稳定，能力 id 稳定。

### 2.2 根分类（建议）

| L0 id | 名称 | 包含 |
|---|---|---|
| `core` | 对话与会话 | 会话、消息、上下文、卡片 |
| `knowledge` | 记忆与检索 | 记忆、召回、文档检索 |
| `workspace` | 文件与工作区 | 文件、代码、交付物、workspace |
| `automation` | 任务与自动化 | 任务、工作流、定时、审批 |
| `external` | 外部能力 | MCP、联网、CLI、第三方集成 |
| `agent` | 智能体与团队 | 负责人、子会话、团队、模板 |
| `system` | 系统与诊断 | 设置、健康、日志、调试 |

NCP 可按来源归入对应 L1（如 workspace/automation），不强制单独根类；根类可配置但变更需版本。

### 2.3 节点模型

```ts
type CapabilityType = 'skill' | 'mcp' | 'cli' | 'ncp'
type NodeLevel = 'L0' | 'L1' | 'L2' | 'L3'
type NodeKind = 'category' | 'capability'

interface CapabilityNode {
  id: string                    // 稳定；分类/能力均唯一
  kind: NodeKind
  level: NodeLevel
  type?: CapabilityType         // capability 必填
  parentId: string | null
  name: string
  summary: string               // L0/L1/L2 必填，≤120 字
  whenToUse?: string            // L2 必填，一句
  version?: string              // capability
  source?: 'local'|'git'|'registry'|'builtin'
  scope: 'global'|'agent'|'session'
  scopeId?: string
  permissions?: string[]        // 声明式，不是 secret
  dependencies?: string[]       // capability id + version range
  tags?: string[]
  status: 'enabled'|'disabled'|'error'|'unavailable'
  health?: 'ok'|'unknown'|'error'
  schemaRef?: string            // L3 才解析；不内联在 L2
  catalogRevision: number
}
```

- `summary` 面向模型/用户，不塞 schema；`whenToUse` 用于搜索/选择；
- `status=disabled/error/unavailable` 节点默认不出现在 agent 结果；管理面可见（需权限）；
- `schemaRef` 只是引用，L2 不展开；L3 load 时按权限解析；
- 任何节点不包含 secret/header value/绝对路径。

## 3. 分层摘要内容

| 层 | 内容 | 默认 token 预算 |
|---|---|---|
| L0 | 根分类名 + 一句话 + 子节点数 | ≤ **400** |
| L1 | 分类摘要 + 直接子节点名/类型/状态计数 | ≤ **1200** |
| L2 | 叶子：id/name/type/version/scope/一句话/whenToUse/健康/权限摘要 | ≤ **2500**（单页） |
| L3 | 完整描述 + 输入/输出 + 调用 schema + 示例 + 限制 + 依赖/权限 | ≤ **6000**（单能力） |

- 预算是**上限**，不是目标值；实际使用回传 `budget.used`；
- L2 单页超过预算：截断并给 `nextCursor`/`truncated=true`，不静默丢弃；
- L3 超预算：按 schema 字段裁剪并给 `truncated` + `continuation`，不允许伪完整；
- 调用方（agent）可传更小预算；服务端不得超上限。

## 4. Catalog 协议

### 4.1 `catalog.list`

```json
{
  "parentId": "external",
  "depth": 1,
  "types": ["mcp","cli"],
  "scope": {"kind":"agent","id":"agent-1"},
  "budget": 1200,
  "cursor": null
}
```

```json
{
  "catalogRevision": 42,
  "nodes": [
    {"id":"mcp.github","kind":"capability","level":"L2","type":"mcp","name":"GitHub","summary":"仓库/Issue/PR 访问","version":"1.2.0","scope":"global","status":"enabled","health":"ok"}
  ],
  "total": 17,
  "nextCursor": "...",
  "truncated": false,
  "budget": {"limit":1200,"used":640}
}
```

- `depth` 默认 1，最大 2（L0→L2）；不允许一次 list 返回 L3；
- `parentId` 缺省为根；`types`/`status`/`tags` 可选过滤；
- 先权限过滤再计数，`total` 是可见总数；
- 排序：启用/健康优先，再按名称/相关性；稳定排序。

### 4.2 `catalog.search`

```json
{
  "query": "创建 GitHub issue",
  "types": ["mcp","cli","skill"],
  "scope": {"kind":"session","id":"main"},
  "topK": 8,
  "budget": 900
}
```

```json
{
  "catalogRevision": 42,
  "results": [
    {"id":"mcp.github","level":"L2","summary":"...","score":0.87,"type":"mcp","version":"1.2.0","why":"匹配 issue/仓库"}
  ],
  "total": 3,
  "truncated": false,
  "budget": {"limit":900,"used":420}
}
```

- 只返回 L2 摘要；不返回 L3 schema；需要时再 load；
- 无权限/禁用节点不参与排名；不得在 `why` 中泄露被过滤节点；
- 查询空/过短返回引导，不扫全表；
- 分页/预算同 list。

### 4.3 `catalog.load`

```json
{
  "id": "mcp.github",
  "version": "1.2.0",
  "include": ["schema","examples","permissions"],
  "scope": {"kind":"session","id":"main"},
  "budget": 6000
}
```

```json
{
  "catalogRevision": 42,
  "node": {
    "id":"mcp.github","level":"L3","type":"mcp","version":"1.2.0",
    "description":"...", "whenToUse":"...",
    "inputSchema": {"type":"object","properties":{}},
    "outputSchema": {"type":"object"},
    "examples": [],
    "permissions": ["network:github.com"],
    "limits": {"timeoutMs":30000},
    "dependencies": []
  },
  "truncated": false,
  "budget": {"limit":6000,"used":1800}
}
```

- `include` 可选；默认 full；权限不足返回 403，不返回部分 schema；
- `version` 固定时若不存在/被禁用/依赖缺失 → `409/404` 明确；
- load 不执行能力，只返回说明/schema；调用仍走动作层审批；
- 同一 `catalogRevision` 下缓存可复用；跨 revision 不拼接。

### 4.4 错误码

| 码 | 含义 |
|---|---|
| `CATALOG_NOT_FOUND` | id/版本不存在 |
| `CATALOG_FORBIDDEN` | 无权限/scope 不允许 |
| `CATALOG_DISABLED` | 已禁用/依赖缺失 |
| `CATALOG_BUDGET_EXCEEDED` | 调用方预算过小/结果无法安全截断 |
| `CATALOG_REVISION_CONFLICT` | 版本已变化，需重取 |
| `CATALOG_INVALID_ARGUMENT` | depth/query/scope 非法 |

## 5. 权限过滤

- 过滤顺序：**scope 可见 → enabled/健康 → 用户/agent 权限 → 再计数/排序/预算**；
- global/agent/session 三级：窄 scope 优先；session 节点不跨会话；agent 不跨 agent；
- 禁用/错误/依赖缺失默认对 agent 不可见；管理面可显示（需配置管理权限）；
- 无权限节点不得通过 search 计数、`total`、报错差异、`why` 泄露；
- catalog 不返回 secret/环境变量值/header value/绝对路径；权限只给声明式摘要；
- 调用能力仍受动作风险/审批/沙箱约束，catalog 不是授权。

## 6. 缓存与淘汰

- 缓存 key：`principal + scope + catalogRevision + view/query + budgetClass`；
- 分级：L0/L1 长 TTL（如 5 分钟），L2 中（60s），L3 短（30s）；均可配置；
- 失效：能力安装/更新/启用/禁用/权限变化/依赖变化 → `catalogRevision` 递增并清相关缓存；
- 淘汰：LRU + 最大条目/内存上限；先淘汰 L3，再 L2/L1；不淘汰当前 pin 的 L3；
- 不做跨权限共享；权限变化后旧缓存不可命中；
- 缓存未命中/过期不阻塞主流程；catalog 失败可降级到静态 L0 分类（只读、无 schema）。

## 7. 版本与依赖

- 能力 `version` 语义化；依赖写 `id + range`；加载时解析并显示；
- 依赖缺失/冲突 → `status=unavailable`，agent 不返回，管理面标冲突原因；
- `catalog.load` 可固定版本；未固定默认启用版本，回传实际版本；
- 更新版本 → `catalogRevision+1`，旧缓存失效；不静默切换正在调用的能力；
- 删除/禁用后节点从 agent 结果移除；管理面保留审计/历史（只读）。

## 8. 审计

记录（不包含 secret/完整 prompt）：

- `catalog.list`/`search`：principal、scope、query（截断/脱敏）、结果数、预算使用、catalogRevision；
- `catalog.load`：id/version、scope、include、是否截断、耗时、结果状态；
- 权限拒绝：原因码/节点 id（不泄露额外字段）；
- 缓存命中/失效、版本变化；
- 保留期与访问权限按现有审计策略；管理面可查但不可改。

## 9. 管理面（能力树浏览器）

- 入口：后续设置页内的「能力目录」区域；**不新增对话/工作台顶层导航**；
- 左树/树表：L0→L1→L2 展开；显示类型（Skill/MCP/CLI/NCP）、状态、版本、scope、健康；
- 搜索：复用 `catalog.search`，结果定位到树节点；L2 点击查看 L3 详情；
- 详情：L3 描述/schema/权限/依赖/版本/健康；不显示 secret；
- 操作：只读目录；启用/禁用/安装等走配置管理（不在树里直接改）；
- 状态：空/加载/错误/无权限/部分依赖缺失；
- 375：树折叠为列表/抽屉；不横向溢出。

## 10. 验收草案 C1–C10

| # | 场景 | 通过标准 |
|---|---|---|
| C1 | L0→L3 层级 | L0/L1 分类、L2 摘要、L3 完整说明严格分层；list 不返回 L3 |
| C2 | list 分页/预算 | depth/parent/过滤正确；total/nextCursor/truncated/budget 正确；超预算可续取 |
| C3 | search | 只返回 L2；相关排序；无权限/禁用不泄露；预算生效 |
| C4 | load | 返回 schema/权限/限制；版本固定；不执行能力；`include` 生效 |
| C5 | 权限过滤 | scope/启用/权限先过滤；403/404 不泄露存在性；跨会话/agent 拒绝 |
| C6 | 预算 | L0/L1/L2/L3 上限生效；超限截断+继续；不静默丢字段；调用方小预算不超 |
| C7 | 缓存 | key 含 revision/scope；启停/版本变化失效；LRU/内存上限；不跨权限共享 |
| C8 | 版本/依赖 | 版本固定/默认正确；缺依赖/冲突不可用；更新后 revision/缓存正确 |
| C9 | 审计 | list/search/load/拒绝可追溯；无 secret/完整 prompt；只读 |
| C10 | 管理面 | 树展开/搜索/L3 详情；状态齐全；375 可用；无顶层导航新增 |

## 11. 分期（P2）

- **P2 backlog，不进入当前 P0–P1**；
- 一期：静态 L0/L1 分类 + catalog.list（只读、无 L3）+ 权限过滤；
- 二期：search + L2 摘要 + 预算/分页 + 审计；
- 三期：load L3 + 缓存/版本依赖 + 管理面树浏览器；
- 不先做：跨用户市场、远程 registry、自动安装、能力推荐排序（另立 spec）。

## 12. 待确认

1. NCP 的标准定义/来源（本地包格式/版本字段）；
2. 根分类是否固定 7 类，还是允许租户/产品扩展；
3. 预算默认值/各模型上下文对应的比例；
4. 缓存 TTL/内存上限；
5. 管理面是否复用配置管理设置页；
6. 是否允许跨 agent 共享 global 能力（默认仅显式 global）。

---

*本文件只定义能力目录模型/协议/验收，不实现；先作为 P2 backlog，待配置管理与能力清单落地后再排期。*

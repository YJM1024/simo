# 会话规格（SessionSpec）与右栏概览投影

状态：spec draft（仅文档；不改代码）
定位：**SessionSpec 是会话的唯一事实源**；右栏「会话概览」只是它的**只读投影**，不是第二份数据。
关联：`docs/session-core-spec.md`（会话/消息/任务语义）、`docs/tasks/product.md`（产品域与验收）、`DESIGN.md`（右栏视觉）。

---

## 1. 语义

**一句话**：会话在推进中形成的目标、约束/输入、任务、用户交付物和待确认项，统一收敛为一份带版本号的 SessionSpec；右栏只按当前 revision 展示它，不写回。

| 原则 | 定义 |
|---|---|
| 单一数据源 | SessionSpec 是唯一事实；右栏 projection 由它派生，不存业务副本 |
| 右栏只读 | 概览没有任何编辑/勾选/拖动控件；修改只能通过对话/智能体动作 |
| revision | 每次有效修改产生新 revision；projection 必须携带 revision，禁止拼两个版本 |
| 只投影用户可见内容 | 不展示内部执行字段、工具原始输出、内部路径、密钥 |
| 空态反映 spec 状态 | 空态说明“当前处于 draft/active/completed/archived 的哪一步”，不是通用“暂无数据” |
| 可查看完整 Spec | 概览可提供只读入口，打开完整 SessionSpec 视图，不在右栏塞全部内容 |

**右栏「会话概览」不是**：任务面板的替代、可编辑的表单、聊天记录的摘要、独立的数据库表、或通过 PATCH 写入的 API。

## 2. 权威 SessionSpec 模型

```ts
type SessionSpecStatus = 'draft' | 'active' | 'completed' | 'archived'
type TaskViewState = 'done' | 'running' | 'pending'

interface SessionSpec {
  sessionId: string
  status: SessionSpecStatus
  revision: number                 // 从 1 开始，单调递增
  goal: { text: string; achieved: boolean } | null
  constraints: SpecEntry[]         // 约束：要求/边界/禁止项
  inputs: SpecEntry[]              // 输入：用户提供的信息/材料/引用
  tasks: SpecTask[]                // 执行任务（投影时按状态分组）
  deliverables: SpecDeliverable[]  // 仅用户产物
  pendingConfirmations: SpecPending[]
  createdAt: number
  updatedAt: number
}

interface SpecEntry {
  id: string
  text: string
  source: 'user' | 'agent' | 'system'
  createdAt: number
}

interface SpecTask {
  id: string
  title: string
  state: 'done' | 'running' | 'pending'
  updatedAt: number
}

interface SpecDeliverable {
  id: string
  name: string
  kind: 'file' | 'text' | 'image' | 'link'
  size?: number
  createdAt: number
  downloadRef: string              // 只给已授权引用，不暴露本地绝对路径
}

interface SpecPending {
  id: string
  kind: 'confirm' | 'choice' | 'approval'
  title: string
  cardId?: string
  createdAt: number
}
```

**写入语义**：

- 没有 `PATCH/PUT /spec`；用户改目标/约束/输入、确认/取消、追加任务等，都通过对话或卡片动作触发智能体动作；
- 智能体动作在**同一事务**中更新 SessionSpec 并递增 `revision`；失败不产生 revision；
- 任何展示层（右栏/工作台/完整 Spec）不得先写本地副本再“稍后同步”；
- revision 是并发/缓存校验键：同一 revision 的 projection 必须来自同一份 spec 快照。

## 3. 右栏投影映射（硬映射）

| 右栏区块 | SessionSpec 来源 | 展示规则 |
|---|---|---|
| **顶部** | `status` + `revision` + `pendingConfirmations` | 显示状态、`r{revision}`、待确认数量/最多 1 条摘要；不显示内部 ID |
| **目标** | `goal` | 目标文本 + 达成/未达成；无 goal 时显示 draft 引导 |
| **输入** | `constraints` + `inputs` | 两个只读小节；约束在前、输入在后；各显示摘要，超长省略 |
| **执行会话** | `tasks` | 按 `done / running / pending` 分组；**每组默认最多 3 条**，超出显示「还有 N 项」并可展开 |
| **交付物** | `deliverables` | **仅用户产物**；排除工具中间文件、缓存、日志、内部附件；最多默认 3 条，可展开/进入文件页 |
| **待确认** | `pendingConfirmations` | 顶部显示数量；展开只列标题/类型，动作在对话/卡片完成，不在概览执行 |
| **完整 Spec** | 全量 spec | 可选只读入口「查看完整 Spec」；不在右栏塞全部任务/字段 |

**明确排除**：`sessionId` 内部路由、agent 内部消息、工具调用原始 JSON、未完成中间产物、密钥/绝对路径、系统合成消息。

## 4. 投影接口契约

### 4.1 读取

```http
GET /api/sessions/{sessionId}/spec-projection?taskLimit=3
```

- `taskLimit`：每个任务组默认 **3**，范围 1–50；只影响预览/展开，不改变 spec；
- 只读；不产生 revision；不创建消息；不触发任务；
- 越权/跨会话 → 403；会话不存在 → 404；无 spec → 200 + `status:"draft"` + 空目标（见 §5）。

### 4.2 响应示例

```json
{
  "sessionId": "main",
  "status": "active",
  "revision": 12,
  "updatedAt": 1760000000000,
  "goal": {
    "text": "完成本轮会话面板改造并通过三档验收",
    "achieved": false
  },
  "constraints": [
    {"id": "c1", "text": "只改文档，不改代码", "source": "user", "createdAt": 1760000000000},
    {"id": "c2", "text": "桌面 1280–1600 优先", "source": "user", "createdAt": 1760000000000}
  ],
  "inputs": [
    {"id": "i1", "text": "方案 A：整块会话面板白底 + 圆角边框", "source": "user", "createdAt": 1760000000000}
  ],
  "tasks": {
    "done": {
      "total": 4,
      "items": [
        {"id": "t1", "title": "确认方案 A", "state": "done", "updatedAt": 1760000000000}
      ],
      "hasMore": true
    },
    "running": {
      "total": 1,
      "items": [
        {"id": "t5", "title": "编写 ConversationPanel spec", "state": "running", "updatedAt": 1760000000000}
      ],
      "hasMore": false
    },
    "pending": {
      "total": 0,
      "items": [],
      "hasMore": false
    }
  },
  "deliverables": {
    "total": 2,
    "items": [
      {"id": "d1", "name": "conversation-panel-spec.md", "kind": "text", "createdAt": 1760000000000, "downloadRef": "artifact:d1"},
      {"id": "d2", "name": "right-rail-1600.png", "kind": "image", "size": 182000, "createdAt": 1760000000000, "downloadRef": "artifact:d2"}
    ],
    "hasMore": false
  },
  "pendingConfirmations": {
    "total": 1,
    "items": [
      {"id": "p1", "kind": "confirm", "title": "确认是否冻结原型", "cardId": "card-...", "createdAt": 1760000000000}
    ]
  },
  "links": {
    "fullSpec": "/sessions/main/spec",
    "self": "/api/sessions/main/spec-projection?taskLimit=3"
  }
}
```

### 4.3 字段契约

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sessionId` | string | 是 | 当前会话；不返回跨会话数据 |
| `status` | `draft/active/completed/archived` | 是 | 见 §6 |
| `revision` | int ≥1 | 是 | 本次投影对应的 spec 版本；不随预览条数变化 |
| `updatedAt` | epoch ms | 是 | spec 最近修改时间 |
| `goal` | object/null | 是 | `text/achieved`；draft 可为 null |
| `constraints` | array | 是 | 可为空数组；元素 `SpecEntry` |
| `inputs` | array | 是 | 可为空数组；元素 `SpecEntry` |
| `tasks.done/running/pending` | group | 是 | 每组 `total/items/hasMore`；`items` 长度 ≤ `taskLimit` |
| `deliverables` | group | 是 | 仅用户产物；`total/items/hasMore` |
| `pendingConfirmations` | group | 是 | 只给标题/类型/关联 cardId；不含动作参数详情 |
| `links.fullSpec` | string | 是 | 只读完整 Spec 入口；不可写 |
| `links.self` | string | 是 | 当前投影 URL（查询参数可不同） |

- 任务组 `hasMore = total > items.length`；展开时用同一接口提高 `taskLimit`（最大 50），仍返回同一 `revision` 的投影；
- 若展开时 spec 已产生新 revision，返回新 revision 并整体刷新，不拼接两版；
- 服务端可返回 `ETag: "spec-{sessionId}-{revision}"`；客户端 `If-None-Match` 命中 → 304；
- 响应不得包含内部字段/工具输出/未授权 artifact 引用。

### 4.4 WS 与缓存

- WS 事件：`session.spec.updated` → `{sessionId,status,revision}`；客户端据此重新 GET projection；
- 不提供 projection 写入事件；不存在“局部修改概览”的 WS；
- 客户端缓存 key 必须含 `sessionId + revision`；revision 不一致时丢弃旧缓存；
- 断线重连按 `revision` 对账；不把 projection 当持久化源。

## 5. 空态与 spec 状态

| spec 状态 | 右栏表现 | 文案示例 |
|---|---|---|
| 无 spec / 未建立 | 目标区域显示引导；任务/交付物不伪造 | 「还没有会话目标。告诉司墨你想完成什么。」 |
| `draft` | `rN · 草稿`；无 goal 或 goal 待确认；待确认项可见 | 「目标待确认，确认后开始执行。」 |
| `active` + 无任务 | 目标/输入正常；执行会话显示空态 | 「暂无执行任务，下一步由对话推进。」 |
| `active` + 无交付物 | 交付物区空态，不显示内部文件 | 「还没有用户产物。」 |
| `completed` + 无交付物 | 显示完成但明确无产物 | 「已完成；本轮没有用户产物。」 |
| `archived` | 只读条 + 历史数据 | 「会话已归档，概览只读。」 |

**规则**：空态不能显示“暂无数据”就结束，必须说明当前 spec 状态与下一步（发起对话/查看完整 Spec）；空态不创建 revision、不生成消息。

## 6. 状态机

### 6.1 SessionSpec 生命周期

```text
                 create/记录目标
(no spec) ─────────────────────► draft
                                   │ 用户确认目标/约束（对话动作，revision+1）
                                   ▼
                                 active
                                   │ 所有任务终态 + 交付物满足/明确无产物 + 用户确认完成
                                   ▼
                                completed
                                   │ 归档会话
                                   ▼
                                archived（终态，只读）
```

| 迁移 | 触发 | 约束 |
|---|---|---|
| `(no spec) → draft` | 会话首次记录目标/约束 | 产生 revision 1；空目标也可 draft |
| `draft → active` | 用户确认目标/方案 | 通过对话/卡片；revision+1；不伪造确认 |
| `active → completed` | 任务完成 + 交付物满足/明确无产物 + 用户确认 | 有未决 pending 不得完成 |
| `completed → active` | 用户提出新需求/重开 | 显式对话；revision+1；不静默重开 |
| `draft/active/completed → archived` | 会话归档 | 只读；不删 spec |
| 任意 → 非法迁移 | 直接写库/投影写回 | 拒绝；projection 无写接口 |

- `pendingConfirmations` 不是生命状态；它可与 `draft/active/completed` 共存，但 `completed` 不得有未决项；
- 每次合法迁移必须产生 revision；revision 单调递增，不回退；
- `archived` 终态；需要继续必须新会话或显式恢复策略（另立 spec）。

### 6.2 投影读取状态

```text
idle ──open──► loading ──ok──► current(revision)
                  │                 │ WS/手动刷新
                  │                 ├──► stale（发现更高 revision）
                  │                 └──► error（读取失败，保留旧数据并标 stale）
                  └──error──► error（无数据；可重试）
```

| 状态 | 行为 |
|---|---|
| `current` | 展示该 revision；顶部显示 `rN` |
| `stale` | 顶部轻提示“有新版本”，自动/手动刷新；不静默混用旧数据 |
| `error` | 保留上次成功数据 + 标注过期；无历史时显示可重试错误 |
| `loading` | 骨架，不显示假 0/假空态 |

## 7. 一致性与权限

- projection 必须来自 `revision` 对应的 spec 快照；服务端不得将多个 revision 的字段拼在一起；
- 右栏只读：没有 PATCH/PUT/checkbox/拖拽写回；勾选/确认只能打开卡片或发对话；
- 修改路径唯一：用户对话/卡片 → 智能体动作 → SessionSpec 事务写 → revision+1 → WS/重取投影；
- 越权：非当前会话可见者不可读；团队内部消息/其他会话不进入 projection；
- 敏感信息：constraints/inputs/pending 只投影用户可见文本；artifact 只给授权引用，不暴露本地路径；
- 失败：读失败不改变 spec；写失败不产生 revision；投影不乐观改状态。

## 8. 验收标准

| # | 场景 | 通过标准 |
|---|---|---|
| S1 | 映射完整性 | 目标/输入/执行会话/交付物/顶部五块均按 §3 映射；无未映射的用户可见字段 |
| S2 | 单一数据源 | 修改只经对话/动作产生 revision；无 projection 写 API；刷新后与 spec 一致 |
| S3 | revision | 同一 revision 返回一致快照；写成功 revision+1；失败不变；不回退 |
| S4 | 任务分组 | done/running/pending 正确；每组默认≤3；`total/hasMore` 正确；展开后仍同 revision |
| S5 | 交付物 | 仅用户产物；内部中间文件/工具输出不出现；下载引用可用 |
| S6 | 待确认 | 顶部数量正确；概览不能执行确认/取消；动作只回对话/卡片 |
| S7 | 空态 | 按 §5 区分无 spec/draft/active/completed/archived；不伪造数据/消息 |
| S8 | 只读 | 右栏无编辑控件/写请求；点击完整 Spec 只读打开 |
| S9 | 一致/并发 | 展开时遇到新 revision 整体刷新；不拼接两版；缓存 key 含 revision |
| S10 | 响应式/视觉 | 1280/1180/375 无裁切/溢出；长文本省略/展开；与 DESIGN.md 右栏规范一致 |
| S11 | 权限/安全 | 跨会话 403；不泄露内部字段/路径/密钥；WS 只通知本会话 |

## 9. 影响范围

- **右栏「会话概览」**：唯一直接页面；改为 projection 渲染，不写回；
- **顶部状态条**：显示 status/revision/待确认数量；
- **完整 Spec 视图**（可选）：只读入口；不在本 spec 里定义其编辑能力；
- **任务/文件页**：projection 的展开/下载可跳转，但不复制其数据；
- **不改变**：聊天消息流、Composer、任务执行语义、审批动作路径。

---

*本文件只定义 SessionSpec 与右栏 projection 契约/状态机，不改代码。*

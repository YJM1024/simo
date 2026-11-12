# FE-008 · 指标仪表盘（Spec）

状态：**ready for review（待 Lead/前端确认；未实现）**
Owner：前端（实现）/ 产品（指标口径）/ 后端（聚合接口与埋点）/ 验收
位置：**工作台内指标区**；不新增顶层导航，不新建独立页面。
指标口径：见 [`docs/product/metrics-dashboard.md`](../../docs/product/metrics-dashboard.md)。只写文档，不改代码。

---

## 1. 目标

在工作台增加只读指标区，按 **KPI → 趋势 → 任务质量 → 每块表格** 展示系统性能与业务质量；支持 7/30 天筛选，空/加载/错误三态；所有数字来自真实聚合接口，**不显示示例数据/假 0**。

## 2. 非目标

- 不新增顶层导航（仍是对话/工作台）；
- 不做实时大屏、告警、导出、对比环比（首版）；
- 不在前端遍历大量消息自己算聚合；
- 不因数据缺失伪造 0/示例；不把不同口径混成一个百分比。

## 3. 页面结构

```text
工作台
├─ 现有工作台内容（用量/最近活动）
└─ MetricsDashboard（本 spec；只读）
   ├─ Header  [7天|30天]  [数据更新时间/时区]
   ├─ KPI 行   Token | 话题 | 消息 | 会话 | 回复 p50/p90 | TTFT p50/p90
   ├─ 趋势     Token/消息/话题（新/活跃）按日
   ├─ 任务质量 完成率 / 一次完成率 / 返工率 / 任务响应 p50/p90
   └─ 明细表   Token 按模型/会话 | 消息按角色/会话 | 会话 | 任务按会话/项目 | 延迟分位
```

- KPI 卡可一行 6 个（宽屏）/ 2 列（中屏）/ 1 列（375）；
- 每个块有标题、口径 tooltip、空/加载/错误状态；
- 趋势与明细表共用同一时间窗；筛选切换后全部同步刷新；
- 不把图表做成装饰：无数据时显示空态说明，不画假曲线。

## 4. 指标与展示映射

| 区块 | 指标 | 展示 |
|---|---|---|
| KPI | `tokens.total/prompt/completion/reasoning` | 总量大数字；分项 tooltip/小字；按日/模型/会话明细在表格 |
| KPI | `topics.newSessions` / `topics.activeSessions` | 两个数并列；不强行相加 |
| KPI | `messages.user/agent/total` | total 主数字，user/agent 分项 |
| KPI | `sessions.total/active/archived` | total 主数字；active/archived 分项 |
| KPI | `reply.p50/p90` | 两个分位；样本不足显示“样本不足” |
| KPI | `ttft.p50/p90` | 两个分位；缺埋点显示“待埋点” |
| 趋势 | tokens/messages/topics | 按日折线/柱；tooltip 含日期/数值/口径 |
| 任务质量 | completionRate / firstPassRate / reworkRate / taskResponseP50P90 | 比率卡 + 分子/分母；任务响应分位 |
| 明细 | tokensByModel/tokensBySession | 表格：模型/会话、total/prompt/completion/reasoning |
| 明细 | messagesByRole/messagesBySession | 表格：角色/会话、user/agent/total |
| 明细 | sessions | 表格：总/活跃/归档/新增 |
| 明细 | tasksBySession/project | 表格：会话/项目、任务数、done/failed/cancelled、完成率/一次完成/返工 |
| 明细 | latencySamples | 表格/分位摘要：样本数、p50/p90、最短/最长（延迟） |

## 5. 接口契约（目标）

> 现有 `/api/stats` 只覆盖部分；后端需新增/扩展聚合接口。前端只消费聚合结果，不在客户端算大范围分位。

```http
GET /api/metrics/dashboard?window=7d|30d&timezone=Asia/Shanghai
```

```json
{
  "window": {"kind":"7d","from":"2026-11-06T00:00:00+08:00","to":"2026-11-12T22:00:00+08:00","timezone":"Asia/Shanghai","partialToday":true},
  "generatedAt": 1760000000000,
  "availability": {
    "tokens":"partial", "topics":"partial", "messages":"ready", "sessions":"partial",
    "replySpeed":"missing", "ttft":"missing",
    "taskCompletion":"partial", "taskAttempts":"missing", "taskReopen":"missing"
  },
  "kpis": {
    "tokens":{"total":0,"prompt":0,"completion":0,"reasoning":0},
    "topics":{"newSessions":0,"activeSessions":0},
    "messages":{"user":0,"agent":0,"total":0},
    "sessions":{"total":0,"active":0,"archived":0},
    "reply":{"p50":null,"p90":null,"sample":0},
    "ttft":{"p50":null,"p90":null,"sample":0}
  },
  "trends":[{"date":"2026-11-06","tokens":0,"messages":0,"newSessions":0,"activeSessions":0}],
  "taskQuality":{
    "completionRate":{"value":0,"numerator":0,"denominator":0},
    "firstPassRate":{"value":0,"numerator":0,"denominator":0},
    "reworkRate":{"value":0,"numerator":0,"denominator":0},
    "response":{"p50":null,"p90":null,"sample":0}
  },
  "tables":{
    "tokensByModel":[{"model":"...","total":0,"prompt":0,"completion":0,"reasoning":0}],
    "tokensBySession":[{"sessionId":"...","title":"...","total":0}],
    "messagesByRole":[{"role":"user","count":0}],
    "messagesBySession":[{"sessionId":"...","title":"...","user":0,"agent":0,"total":0}],
    "sessions":[{"sessionId":"...","title":"...","active":true,"archived":false,"new":false}],
    "tasksBySession":[{"sessionId":"...","title":"...","project":null,"done":0,"failed":0,"cancelled":0,"completionRate":null,"firstPassRate":null,"reworkRate":null}],
    "latencySamples":[{"kind":"reply|ttft|task","p50":null,"p90":null,"sample":0}]
  }
}
```

契约规则：

- `availability` 逐项 `ready|partial|missing`；`null` 表示无数据/未埋点，**不是 0**；
- 比率必须带 `numerator/denominator`；分母为 0 时 `value=null`；
- 分位样本 <20：`p50/p90` 可返回、但 UI 标“样本不足”；无字段→`missing`；
- `tables` 只返回当前窗口聚合，不返回全量消息；
- 时间窗/时区/`partialToday` 必须回传，UI 明示；
- 错误用统一错误信封；400 参数/时区错误，500 聚合失败。

## 6. 数据/埋点依赖

| 指标 | 依赖 | 当前状态 |
|---|---|---|
| token total/prompt/completion/reasoning | turn usage/prompt/completion/reasoning、模型字段 | 部分已有；reasoning/model 需确认 |
| topics/messages/sessions | messages/sessions createdAt/role/archived | 部分已有；归档时间、活跃口径需补 |
| reply p50/p90 | turn/reply `startedAt`/`completedAt`、失败状态 | **缺埋点** |
| TTFT p50/p90 | `firstTokenAt` | **缺埋点** |
| task completion | task state/createdAt/doneAt | 部分（doneAt 待确认） |
| 一次完成/返工 | task attempts、reopen 事件/计数 | **缺埋点** |
| task response | task createdAt/completedAt | 部分 |
| 按项目 | session→project 映射 | 部分（无独立 project 实体） |

**硬规则**：缺埋点的指标显示“待埋点/数据未接入”；不得用 `completedAt-startedAt` 冒充回复速度/TTFT，不得用消息重试推断 task attempts。

## 7. 状态与交互

| 状态 | 表现 |
|---|---|
| loading | KPI/趋势/表格 skeleton；筛选器可用但禁止重复请求 |
| ready | 全部真实数据；显示更新时间/时区/partialToday |
| partial | 部分指标 `availability=missing`；该块显示“待埋点”+ 口径说明；其余正常 |
| empty | 窗口内无数据：空态文案，不显示假 0/假曲线 |
| error | 可重试错误；保留筛选；不残留旧窗口数据标为当前 |

- 筛选 7/30：切换后统一刷新；请求取消旧请求，避免旧响应覆盖新窗口；
- 刷新：显示数据更新时间；失败保留上次成功数据并标“已过期”；
- 无权限/参数错误显示明确错误，不静默空白。

## 8. 设计与可访问性

- 视觉：工作台现有 tokens/组件（Card/Table/Tabs/Badge/Empty/Skeleton/Toast），不新增视觉体系；
- 不新增顶层导航；指标区是工作台的一节；
- KPI 数字 `tabular-nums`；比率显示 `xx.x%` + 分子/分母 tooltip；
- 表格可横向滚动（窄屏），不破坏页面；375 单列；
- 图表用轻量 SVG/现有组件；有文本摘要/表格替代，颜色不是唯一编码；
- 键盘：筛选/重试/表格排序可操作；焦点可见；
- 错误/空态可读，不用红色大块制造噪音。

### 8.1 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 工作台内指标区，不新增顶层导航；KPI→趋势→任务质量→明细表 |
| R2 | MUST | 7/30 天筛选同步全部块；显示时区/窗口/更新时间/partialToday |
| R3 | MUST | Token total/prompt/completion/reasoning 与消息/会话/话题口径按产品文档 |
| R4 | MUST | 回复 p50/p90、TTFT p50/p90；缺埋点显示“待埋点” |
| R5 | MUST | 任务完成率/一次完成率/返工率带分子/分母，按会话/项目表 |
| R6 | MUST | 空/加载/错误/partial 四态；无假 0/示例数据；旧请求不覆盖新窗口 |
| R7 | MUST | 前端只消费聚合接口，不遍历全量消息；无页面定制 CSS |
| R8 | MUST | 1600/1180/375 无溢出；筛选/表格可键盘操作 |

## 9. 验收标准 A1–A12

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 位置 | 指标区在工作台内；无新增顶层导航/独立页面 |
| A2 | 筛选 | 7/30 切换后 KPI/趋势/任务质量/表格同一窗口；时间窗/时区显示 |
| A3 | KPI 口径 | Token 总/分项不重复；话题新/活跃不强行相加；会话 total/active/archived 不强行相加 |
| A4 | 趋势 | 按日数据与 KPI 一致；当前天 partial 标注；无假曲线 |
| A5 | 任务质量 | 完成率/一次完成率/返工率有分子/分母；分母 0 显示无数据；按会话/项目表正确 |
| A6 | 延迟 | 回复 p50/p90、TTFT p50/p90 有样本/分位；样本不足提示；缺埋点显示“待埋点” |
| A7 | 数据真实性 | 无示例数据/假 0；`null`/missing 不渲染成 0；接口失败不伪造 |
| A8 | 三态 | loading/empty/error/partial 齐全；错误可重试；旧请求不覆盖新窗口 |
| A9 | 边界 | 7/30 天边界、当天 partial、时区切换、跨窗口任务口径按文档 |
| A10 | 响应式 | 1600/1180/375 无横向溢出；表格窄屏可读/可滚；KPI 1–2 列 |
| A11 | 可访问性 | 筛选/按钮键盘可达；图表有文本替代；颜色非唯一编码；对比度 |
| A12 | 工程 | tsc/build 通过；无页面定制 CSS/内联 style；无 console error |

## 10. 影响范围

- **工作台**：新增 MetricsDashboard 区；不改对话页/Composer/右栏；
- **导航**：不新增顶层导航；不改变现有对话/工作台切换；
- **后端**：新增/扩展 metrics 聚合接口；补 turn/reply 时间戳、task attempts/reopen、归档时间等埋点；
- **数据**：不改消息/任务语义；只读聚合；
- **性能**：聚合接口分页/缓存/超时；前端不遍历全量消息；大窗口有 loading/取消。

## 11. 风险与待确认

- 后端聚合接口未就绪时，前端只能显示“数据未接入”，不得用 `/api/stats` 拼凑全部指标；
- 回复速度/TTFT 的起点口径（user 消息创建 vs turn started）需后端/产品确认；本 spec 默认 user 消息 `createdAt`；
- 话题是否改意图分类、是否独立导航、TTFT 是否只算成功回复，见产品文档 §6；
- 取消任务分母、跨窗口任务归属、p90 最小样本阈值需确认；
- 聚合查询成本/缓存策略需后端给出 P95，避免工作台首屏卡顿。

---

*本文件只定义 FE-008 spec；不改代码。实现前需确认聚合接口与 G1–G8 埋点。*

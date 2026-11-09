# Super Agent Kernel · 可运行参考骨架

一个**零第三方依赖**的 Agent 内核最小参考实现，用来演示下面这套架构在最小闭环里怎么落地：

```
Source ──▶ Event Bus ──▶ Gate/Policy ──▶ Router(Assessment) ──▶ Ticket + Mandate
                                                                   │
                                              Scheduler（worker slots + 人优先 slot）
                                                                   │
                     Worker/Reviewer Agent ◀── 上下文组装(Inliner/Spill) ──▶ Acceptance Gate
                                                                   │
                                              Human Review ──▶ Store（append-only JSONL，单写者）
```

三条贯穿设计：

- **存算分离**：事实只落 append-only JSONL，内存索引是重放出来的投影，重启不丢状态；
- **授权与上下文分离**：Mandate 记录授权范围，上下文由 D-06 独立组装，二者互不耦合；
- **验收门是一等原语**：`person/review` 只能凭验收门签发的 `clearance` 进入，缺证据必须退回 `working` 并列出缺失项。

代码是给你**改架构**用的：一个文件一块职责，换实现不改内核；所有外部依赖都走端口
（`llm` 模型端口 / `executor` 执行器端口 / `tools` 工具端口 / `source` 消息源端口 / `store` 存储 / `bus` 总线）。

---

## 快速开始

环境：Node ≥ 22（本机用 v24.21.0 验证），**零依赖，不需要 npm install**。

```powershell
$node = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
Set-Location E:\dsh_home\workspaces\agent\skeleton

# 1) 端到端 demo（真实终端自动上色；重定向到文件时自动无色）
& $node demo.mjs

# 强制彩色 / 强制无色
& $node demo.mjs --color
& $node demo.mjs --no-color

# 2) 测试（12 个用例，覆盖 6 条不变量）
& $node --test --test-isolation=none test/smoke.test.mjs
```

> **为什么测试命令带 `--test-isolation=none`？**
> Node 24 的 `node --test test/` 默认会为每个测试文件 spawn 子进程，子进程 stdio 走 pipe。
> 在受限沙箱（例如 DSH sandbox）里 pipe spawn 会被拒绝（EPERM），因此本仓库的 `npm test`
> 用 `--test-isolation=none` 在**当前进程内**跑同一个 test 文件。普通终端里
> `& $node --test test/` 也能通过。

**demo 是可复现的**：虚拟时钟 + 无随机数 + 无定时器，启动时清空 `.state-demo/`。
连续两次运行 `demo.mjs` 的输出逐字节一致（已实测）。

demo 覆盖剧情：

| 剧情 | 内容 | 验证的不变量 |
| --- | --- | --- |
| A | observe 影子模式：Gate 通过 + Assessment accept，只记 would-accept，不建 Ticket | 2 |
| B | 切 auto 重放同一事件：建票+Mandate → 派工 → 验收门打回（列缺失）→ 补齐 → person/review → 人确认 → ended | 3 |
| C | 闲聊噪音在确定性 Gate 被 drop，零模型调用 | — |
| D | 同 thread 跟进消息订阅直投已有 Ticket，跳过 Router/Assessment | — |
| E | 同一 Trigger 重复投递只产生一个 Ticket | 1 |
| F | worker slot 占满时人的请求拿到 +1 slot；空出普通 slot 时人先于排队任务 | 4 |

---

## 目录结构

```
skeleton/
├── package.json                # type: module；scripts: demo / test
├── demo.mjs                    # D-15 可运行入口：只编排剧情 A–F，经事件总线输出
├── README.md
├── .gitignore                  # 忽略 .state-demo/ .test-tmp/ 等运行产物
├── src/
│   ├── kernel/
│   │   ├── bus.mjs             # D-04 事件总线：emit/subscribe/通配
│   │   ├── store.mjs           # D-07 单写者 append-only Store（JSONL + lockfile）
│   │   ├── policy.mjs          # D-05 确定性 Gate + acceptMode + 规则版本号
│   │   ├── tasks.mjs           # D-03 Ticket 状态机 / Report 六态 / clearance 守卫
│   │   ├── scheduler.mjs       # D-08 worker slots + 人优先 slot + dispatch 循环
│   │   ├── context.mjs         # D-06 Inline & Spill 上下文组装
│   │   ├── acceptance.mjs      # D-09 验收门（evidenceContract → clearance）
│   │   ├── agent.mjs           # D-02 Agent 运行器（llm 端口；turn 结构化）
│   │   ├── digest.mjs          # （无独立决策）D-05/D-09/D-15 共用的确定性哈希工具
│   │   └── runtime.mjs         # D-15 端到端装配（composition root）
│   ├── llm/
│   │   └── mock.mjs            # D-14 确定性 MockLLM（可注入失败模式）
│   ├── scenarios/
│   │   └── bugfix.mjs          # D-10 可插拔场景包（规则 / 证据契约 / 提示词）
│   └── adapters/
│       └── cli.mjs             # D-01 终端适配器（时间戳/缩进/角色/颜色/分隔标题）
└── test/
    └── smoke.test.mjs          # 12 个用例，node:test + node:assert
```

---

## 决策清单（D-04 … D-15）

每个源文件头部都写了「本文件对应决策 D-xx + 它保证的不变量」。这里给总表：

| 决策 | 文件 | 职责 | 保证的不变量 |
| --- | --- | --- | --- |
| D-04 | `src/kernel/bus.mjs` | 同步事件总线，`on/once/onAny/emit`，事件不可变、seq 单调 | 内核只通过结构化事件对外表达；派发顺序确定 |
| D-07 | `src/kernel/store.mjs` | append-only JSONL + 内存索引 + 目录锁；`append/update/get/list` | **单写者**（第二个实例启动失败）；重启可从日志重建 |
| D-05 | `src/kernel/policy.mjs` | 白名单 / bot / 关键词 / @ / 缺陷信号 → explicit/inferred/notAdmitted；off/observe/auto | Gate 零模型调用；observe 正判定只能是 would-accept；规则哈希即版本 |
| D-03 | `src/kernel/tasks.mjs` | Ticket 状态机、Report 六态、stage 优先级、`enterReview` clearance 守卫 | 非法状态拒收；**ready 不能绕过验收门**；"在等人"只用结构化字段 |
| D-08 | `src/kernel/scheduler.mjs` | 计数信号量 worker slots + 1 个人优先 slot + dispatch 循环 + 队列泵 | slot 不超卖；**人优先**（+1 slot + 抢占空出的普通 slot）；executor 可换 |
| D-06 | `src/kernel/context.mjs` | 最近 N 条 inline（每条限 400 字），更早降 stub（50 字 + 对象 ID） | 纯函数；被截断/降级的消息保留可展开入口 |
| D-09 | `src/kernel/acceptance.mjs` | 按场景 evidenceContract 检查报告证据，缺项返回清单，通过签发 clearance | **验收门拦截缺证据**；同一证据同一哈希 |
| D-02 | `src/kernel/agent.mjs` | llm 端口驱动的一次 turn：输入/输出/工具调用结构化；worker/reviewer/assessor | 换真 LLM 只换端口；role 与 kind 不匹配即报错 |
| D-14 | `src/llm/mock.mjs` | 确定性 MockLLM，按 kind 返回脚本化结果，支持注入失败 | 零随机/零定时器；每次调用计数可审计 |
| D-10 | `src/scenarios/bugfix.mjs` | 场景包：admissionRules / evidenceContract / workerPolicy / prompts | **换场景只换这个文件**；契约与验收门同源 |
| D-01 | `src/adapters/cli.mjs` | 事件 → 彩色 trace（时间戳、层级缩进、角色标签、语义图标） | 只读事件、不改状态；未知事件有兜底 |
| D-15 | `src/kernel/runtime.mjs` + `demo.mjs` | 装配内核 + 端到端剧情入口 | 6 条关键不变量在装配层保持（见下） |

### 一次 `ingest(trigger)` 的链路（runtime.mjs）

1. 发 `source/trigger` 事件；
2. **幂等**：按 `trigger.id`（Source 侧 id）查 `trigger` 记录，命中则直接回放已有 Ticket；
3. 把消息写进 `message`（thread 历史 / 上下文原料）；
4. **订阅直通**：同 `threadKey` 已有 open Ticket 且作者不是 bot → 直接作为 `input` 投递，跳过 5–7；
5. **确定性 Gate**（不调模型）：notAdmitted → drop；off → 不处理；
6. **Assessment**（一次模型调用，observe 也跑，保证影子判定与 auto 一致）；
7. observe → 只写 `wouldAccept` 记录；auto → 建 `Ticket` + `Mandate` + `trigger` 记录；
8. `pump()`：把 open 且无 assignment 的 Ticket 交给 `scheduler.dispatch` → executor 端口；
9. 默认 executor：上下文组装（D-06）→ worker turn（D-02）→ 验收门（D-09）：
   - 缺证据 → `bounceForEvidence` 退回 `working` + 缺失清单；
   - 齐全 → 签发 clearance → reviewer turn → `enterReview`（person/review）；
10. 人类在 `person/review` 确认 → `ended`。

---

## 6 条关键不变量：实现点 / demo / 测试

| 不变量 | 实现位置 | demo | 测试用例 |
| --- | --- | --- | --- |
| 1 幂等 | `runtime.ingest` 的 `trigger` 记录（Source 侧 id 即幂等键） | E | `不变量 1 幂等…` |
| 2 observe 不建票 | `runtime.ingest` observe 分支只 `append('wouldAccept')` | A | `不变量 2 observe…` |
| 3 验收门拦截 | `acceptance.check` → `bounceForEvidence`；`tasks.enterReview` 校验 clearance | B | `不变量 3 验收门…`、`不变量 3 端到端…` |
| 4 人优先 slot | `scheduler`：human overflow slot + `pump()` 先人后任务 | F | `不变量 4 人优先…` |
| 5 单写者 | `store.createStore` 用 `.superagent/lock`（O_EXCL） | 汇总 | `不变量 5 单写者…` |
| 6 重启恢复 | `store` 启动时重放 `state.jsonl` 重建索引 | 汇总 | `不变量 6 重启恢复…`、`不变量 6 端到端…` |

---

## 接真实消息源（source 端口）

内核只认 Trigger 契约，不认 Slack / GitHub SDK。用 `createSourceAdapter` 把任意来源的原始事件规范化后投递：

```js
const slackSource = kernel.createSourceAdapter({
  id: 'slack-webhook',
  normalize(raw) {
    return {
      id: raw.event_id,                                  // Source 侧幂等键
      source: 'slack',
      threadKey: `slack:${raw.channel}`,
      author: raw.user,
      text: raw.text,
    };
  },
});

await slackSource.push(webhookBody);   // 内部走 kernel.ingest
```

换 Source（GitHub issue / 邮件 / CI 日志 / 工单）只需写一个新的 `normalize` 适配器；
幂等、Gate、订阅路由、调度、验收门都不变。demo 的剧情 A/B 就是用 `slack-webhook` 适配器投递的。

## 换成真 LLM 要改哪里

**只改一个地方：给 `createKernel` 传一个实现了 `llm` 端口的新对象，删掉 `createMockLLM`。** 内核其余部分不用动。

接口契约（D-02）：

```js
const llm = {
  model: 'your-model',
  // role: 'assessor' | 'worker' | 'reviewer'
  // task.kind: 'assess' | 'work' | 'review'
  // task.prompt: 场景包里对应的提示词；context: {text, stats}
  async ask({ role, context, task }) {
    switch (task.kind) {
      case 'assess':
        return { kind: 'assessment', accept: true, reason: '...', title: '...' };
      case 'work':
        return {
          kind: 'report',
          state: 'ready',                    // progress|waiting|ready|blocked|failed|dropped
          summary: '...',
          evidence: {                        // 字段必须匹配场景 evidenceContract
            reproTest: '...', testPass: true, diffScope: '...', rollback: '...',
          },
          actions: [{ tool: 'runTests', args: { suite: 'login' } }],
        };
      case 'review':
        return { kind: 'review', approve: true, notes: '...' };
    }
  },
};

const kernel = createKernel({ root, scenario: bugfixScenario, llm, acceptMode: 'auto' });
```

实践建议：

1. **prompt**：`task.prompt` 就是场景包的提示词；`context.text` 是 D-06 组装好的上下文。把两者拼成
   `[{role:'system', content: task.prompt}, {role:'user', content: context.text}]` 即可；让模型输出
   上面三种 JSON（可用 JSON mode），再补一层解析/重试。
2. **工具**：`createKernel({ tools: { runTests } })`；D-02 会按 `actions[]` 逐个执行并结构化记录
   （未登记的工具会被记录为 `ok:false`，不会崩内核）。真实模型返回 tool_call 时映射成 `actions`。
3. **换执行器**：如果不想用默认的「一次 turn」流程，传
   `createKernel({ executor: async (ticket, ctx) => { ... } })`，自己实现 Worker 运行循环
   （写 `ticket.assignment` 之外的 stage 变更统一走 `tasks.*`）。
4. **注意**：验收门只认 `report.evidence` 的结构；真实 LLM 输出的"我修好了"不构成证据。

---

## 换场景 / 加场景

复制 `src/scenarios/bugfix.mjs`，改 `id`、`admissionRules`、`evidenceContract`、`workerPolicy`、`prompts`，
再传给 `createKernel`。验收门直接吃同一份 `evidenceContract`，不存在"场景说四项、门只查三项"的漂移。

---

## 已知简化 / 未实现项（诚实清单）

- **observe 仍会调一次 Assessment**：为了让影子判定与 auto 判定一致。若你要 observe 零模型调用，在
  `runtime.ingest` 的 observe 分支跳过 `agent.assess` 即可（一处改动）。
- **progress 状态**会让 `pump()` 在下一轮继续重派（受 `maxRounds` 保护）；真实系统应挂起等待外部事件，
  本骨架未实现"事件唤醒"。
- **reviewer 只有单次 approve/reject**，没有多轮修订、逐条评论。
- **验收门只校验证据结构**（非空 text / true / 非空 list），不验证证据内容真实性——内容可信度要靠
  工具/沙箱侧可信执行保证，本骨架没有实现。
- **clearance 是结构凭证、无签名**；单进程内核内信任，不防伪造。
- **Store 没有 fsync / 崩溃截断修复**；lockfile 不检查 PID 存活，进程被强杀后需手动删除
  `.superagent/lock` 才能重启（这是有意的简化：宁可报错也不静默并存）。
- **人优先 slot 只在单进程调度器内生效**；多进程 / 多租户需要外部队列。
- **上下文按字符数近似 token**，inline 截断是简单字符截断。
- **Mandate 只记录 scope/ticket**，没有运行时 scope 校验；授权与执行仍靠代码路径约束。
- **单写者依赖本地文件系统**，不做跨机分布式锁。
- **重启只恢复 Store 数据**；崩溃时正在执行的 executor 不会自动续跑（`assignment` 可能残留，
  需要自己写恢复策略）。
- **无权限系统、无网络、无 MCP、无真实沙箱**；demo 用脚本化 MockLLM，不代表真实模型行为。
- **demo 剧情 F 直接使用 scheduler 端口**演示 slot 语义，不经过完整 Ticket 流程。

---

## 输出与调试

- 详细事件流可订阅总线：`kernel.bus.onAny((event) => { ... })`；
- `kernel.store.stats()` 可看 append-only 记录数 / 实体数 / 日志路径；
- `kernel.metrics` 是 demo 用的计数：triggers/dropped/wouldAccept/deduped/routerSkipped/tickets/
  bounced/reachedReview/ended；
- state 目录：`.state-demo/.superagent/state.jsonl`（demo），每行一条 `{"op":"put",...}` 记录，
  重启后按行重放。

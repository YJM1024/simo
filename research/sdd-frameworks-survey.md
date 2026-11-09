# SDD 框架生态调研（OpenSpec / Superpowers 之外）

> **状态**：调研报告，供设计决策参考。只调研 + 记录，不含实现代码。
> **日期**：2026-11-06
> **任务**：Team task-18。
> **范围**：Spec-Driven Development（SDD）生态中除 **OpenSpec**（Fission-AI）、**Superpowers**（obra）之外的框架/工具/方法论。
> **我方背景**（用于"可借鉴点"列）：**本地单机个人助理**、**记忆优先**、**Spec 内部化**（spec 不作为对外交付物，而是系统内部可检索的状态）、**Go 自研 SpecCore**。

---

## 0. 读法与证据分级

| 标记 | 含义 |
|---|---|
| 〔官〕 | 官方文档/官方博客/官方 README（已抓原文） |
| 〔仓〕 | 仓库文件/代码路径确认（已抓 raw 文件或 API） |
| 〔二〕 | 二手（评测站、第三方文章、搜索结果标题；未直读全文） |
| 〔推〕 | 本报告作者推断（无原文背书） |
| 〔通识〕 | 通用工程史/领域常识，非本次抓取所得，仅作背景 |

**一个必须交代的方法限制**：Kiro 与 Tessl 的官网主站是 JS 渲染外壳（直接抓 HTML 只得到导航），本报告对 Kiro 的一手依据是**AWS 官方博客 + AWS Builder Center 技术文章**，对 Tessl 的一手依据是**docs.tessl.io**（文档站可读）。两者都标注了来源与替代性，未把外壳页当正文。

---

## 1. 一句话全景：SDD 已经分三代，且竞争点正在转移

看完这一轮，我的判断是三句话〔推，依据见各框架小节〕：

1. **第一代（2025 上半年）"文档流水线"**：把一句话需求展开成 requirements → design → tasks → 实现。代表：**Kiro**、**Spec Kit 早期**。核心价值是"把隐含假设显式化"。
2. **第二代（2025 下半年）"方法论 + 角色"**：不只管文档，还管**谁在什么阶段做什么**。代表：**BMAD-METHOD**、**Agent OS**、**SPARC**。核心价值是"用流程治 agent 的随意性"。
3. **第三代（2026）"可组合过程引擎 + 分发 + 治理 + 评测"**：模板不再是卖点，卖点变成**扩展机制、跨 agent 分发、质量门禁、评测证据**。代表：**Spec Kit 1.0**（extensions / presets / workflows / bundles / catalogs）、**cc-sdd v3**（17 个 skills、跨 8 个 agent、per-task 评审）、**Tessl**（registry / governance / evals / observability）、**BMAD v7**（skills + eval runner）。

**这条演化对我们最重要**：说明"写一套 spec 模板"这件事**已经商品化、且正在贬值**。真正稀缺的是：**spec 怎么被判判定、怎么被检索、怎么被证明有用**——恰好是我们 E0（评测设计）与 SpecCore 要解决的事。

---

## 2. 逐个框架

### 2.1 GitHub Spec Kit

**是什么**〔官〕：GitHub 官方开源的 SDD **工具包**（MIT）——"给 AI coding agent 提供结构化流程、可复用模板和可记录的结果"。不是 agent，是**流程 + 模板 + CLI + 扩展系统**。

**当前形态比"四步流程"成熟很多**（这是最容易被旧文章误导的地方）〔官〕：

- **三个独立入口**，不是强制阶段：
  1. **Spec-Driven Development**（核心，随包内置）
  2. **Bug fixing**（扩展，需安装）
  3. **Idea assessment**（扩展）
- 官方明确："These are independent entry points, not mandatory phases."

**SDD 工作流（SDD 入口）**〔官〕：

| 步 | 命令（以 Copilot 语法为例） | 产物 |
|---|---|---|
| 0 | `/speckit-constitution` | 项目宪法（原则：代码质量、测试、可维护性）——**每个项目一次** |
| 1 | `/speckit-specify` | 规格（做什么/为什么） |
| 2 | `/speckit-plan` | 技术计划（技术栈、存储等约束） |
| 3 | `/speckit-tasks` | 任务分解 |
| 4 | `/speckit-implement` | 实现 |
| 5 | `/speckit-converge` | **收敛检查**；未收敛则回到 4 重跑，直到报 `Converged` |

> **`converge` 是 Spec Kit 区别于其它框架的关键一步**：它把"实现完成"和"实现符合规格"分开，并要求**循环到收敛**。这是把"验收"做成了流程里的显式回路，而不是人肉判断。

**另两个入口的工作流**〔官〕：

| 入口 | 命令序列 | 产物与判定 |
|---|---|---|
| Bug fixing | `bug-assess` → `bug-fix` → `bug-test` | `.specify/bugs/<slug>/` 下三份报告；**最终 verdict = `verified` / `partial` / `failed`，只有 `verified` 算出修好** |
| Idea assessment | `assess-intake` → `assess-research` → `assess-define` → `assess-shape` → `assess-decide` | `.specify/assessments/<slug>/`；**decision = `go` / `needs-clarification` / `kill`**；`kill` 也被声明为"有用的结果" |

**Spec 格式与产物**〔官〕：

- 落在 `.specify/` 目录；bug/assessment 各有子目录。
- 载体是 **Markdown 模板 + 斜杠命令（skills）**；命令在 **agent 的对话里跑**，不在终端跑（终端只用于 `specify` CLI 的 init/extension 管理）。
- 官方明确"**一次跑一个命令，审阅结果再继续**"——这是有意的防跑飞设计。

**扩展机制（这是 Spec Kit 1.0 的真正重心）**〔官〕：

| 机制 | 作用 |
|---|---|
| **Integration** | 连接/切换 coding agent（Copilot、Claude Code、Codex、Cursor…） |
| **Extension** | 加命令、质量门禁、完整流程；连外部工具；响应 agent 生命周期事件 |
| **Extension hook** | 在 Spec Kit 命令前/后跑扩展命令 |
| **Preset** | 改模板/命令/术语/方法论；**强制组织或合规标准** |
| **Project-local override** | 单项目覆盖某个模板 |
| **Workflow** | 自动化 prompt、命令、门禁、shell 任务 |
| **Workflow overlay** | **不改源码地修改已装工作流** |
| **Workflow step** | 给工作流加可执行行为 |
| **Bundle** | 按角色/团队打包一套安装 |
| **Catalog** | 发现社区组件 / 托管私有审批目录（**支持离线与气隙环境**） |
| **Artifact inventory** | **查看某个命令/模板/脚本到底来自哪一层** |

**工具形态**：CLI（`specify`，Python 3.11+ / uv 安装）+ agent 内斜杠命令/skills；多语言 README；MIT。

**强项**〔官〕：
- 官方维护、迭代快（已到 1.0，2026-10 有 1.0 对谈）；
- **扩展/预设/目录三层**让"组织级治理"有了落点（合规追溯、私有目录、离线）；
- **artifact inventory** 解决了"这套模板到底从哪来的"这个真实痛点；
- `converge` 与 bug 的 `verified` 把验收做成了**可判定状态**，不是感觉；
- 版本化 + 气隙支持，企业可用。

**弱项 / 已知失败点**〔推，结合文档自述〕：
- **流程仍然偏重**：6 个命令 × 每个都要人审，对"改一行"的小任务是纯负担（官方自己也把 trivial 交给"你的进程"而不是 SDD）；
- **产物在 repo 里**（`.specify/`）——对**没有 repo 的场景**（如我们的个人助理）无处安放；
- 模板/扩展生态越丰富，**"该用哪一层"的认知成本越高**（官方为此专门做了 inventory 和 "start with the smallest change" 的劝告，说明这已经是问题）；
- 文档提到社区目录"**不是审计也不是背书**"，要求自行审代码——**供应链风险被明确外包给用户**。

**对我们的可借鉴点**：

| 借 | 怎么用到我们身上 |
|---|---|
| **`constitution` 单独一步** | 正好对应我们的**项目规则/持久规则**（E3 提示词工程的落点）；它每项目一次、与流程解耦，和我们"持久规则每轮重注入"同构 |
| **`converge` 循环** | 我们的长任务也该有"实现→对照规格→未收敛则再来"的显式回路，而不是"agent 说完成就完成" |
| **产物状态的封闭枚举**（`verified`/`partial`/`failed`、`go`/`kill`） | 直接搬进我们的任务/验收状态机；**禁止自由文本判定** |
| **`kill` 也是有效结果** | 我们"琐碎自决"之外还应允许"这件事不值得做"作为正当结论，减少无效执行 |
| **artifact inventory** | 我们记忆注入也要能回答"这条规则从哪来的"（记忆来源分级，12 已有雏形） |
| **离线/气隙目录** | 我们是单机，**天然离线**；照抄"可用本地源"的心态，不引入联网依赖 |

**证据与来源**：
- 〔官〕README：https://github.com/github/spec-kit
- 〔官〕文档站：https://github.github.io/spec-kit/
- 〔官〕SDD 方法论全文（仓库内）：`spec-driven.md`

---

### 2.2 Kiro（AWS 的 spec-driven IDE）

**是什么**〔官〕：AWS 在 2025-07-14 发布的 **agentic IDE**（基于 Code OSS / VS Code 分支，兼容 Open VSX 插件），核心差异化是 **specs + hooks**。定位原话："既擅长 vibe coding，又远超 vibe coding——把原型送进生产系统"。

**解决什么问题**〔官，原文转述〕：prompt 出来的应用能跑，但
- 模型做了哪些假设没记录；
- 需求模糊，无法判断是否满足；
- 看不懂系统怎么设计的、对环境和性能有什么影响。

→ 所以"退一步，把决策想清楚"。

**完整工作流（三步 + 一步自动化）**〔官〕：

| 步 | 做什么 | 关键细节 |
|---|---|---|
| 1 | **一句话 → requirements** | 展开成 user stories；**每条验收标准用 EARS（Easy Approach to Requirements Syntax）写**，覆盖开发者通常会漏的边界情况 |
| 2 | **requirements → design** | 分析既有代码库 + 已批准的需求，产出数据流图、TypeScript 接口、数据库 schema、API 端点 |
| 3 | **design → tasks** | 生成 tasks 与 sub-tasks，**按依赖排序**，**每个 task 反向链接到需求**；每个 task 内含单元测试、集成测试、loading 状态、移动端响应式、无障碍要求 |
| 4 | **hooks（自动化）** | **事件驱动**：保存/创建/删除文件时或手动触发，后台跑一个 agent 任务 |

**Spec 格式与产物**〔官 +〔推〕〕：
- 三份 Markdown：requirements（含 EARS 验收标准）、design（含 Mermaid 图/接口/schema）、tasks（含依赖顺序 + 回链需求 + 测试项）。
- **specs 与代码库同步**：可以写代码后让 Kiro 更新 spec，或手改 spec 刷新 tasks——官方把这当成解决"文档与实现漂移"的手段。
- 目录路径（如 `.kiro/specs/<feature>/`、`.kiro/steering/`）：**本次未从官方正文确认**，标〔推〕/待核实（§6）。
- 另有 **steering**（项目级规则，跨项目引导 AI 行为）与 **MCP**。

**工具形态**：IDE（主形态）+ 后来扩展出 CLI / Web / Mobile / Crew（官网导航可见，具体能力未核）〔官 + 待核实〕。闭源商业产品（有免费额度）。

**强项**：
- **EARS 是全生态里最"可判定"的需求写法**——每条都是"WHEN… THE SYSTEM SHALL…"，天生能变成断言。这是 Kiro 最硬的资产。
- **任务反向链接需求**：可追溯性做到 task 粒度，不是文档粒度。
- **hooks 把"检查"从人的记忆搬到事件上**：保存 React 组件→更新测试；改 API→刷新 README；提交前→扫凭据。且**hook 一旦提交进 Git，全团队生效**（把规范变成可执行物）。
- **spec 与代码双向同步**是官方明确的目标，直面漂移问题。

**弱项 / 已知失败点**：
- **闭源 + 绑定 AWS 生态**，不可自托管、不可改内核〔推〕；
- **三个大文档对小事过重**：一个"改个按钮文案"也走 requirements/design/tasks 会被嫌繁〔推〕；
- **hooks 的威力与风险同源**：任何"保存即自动改测试/改 README"的自动化，在误触发时会**批量污染**；官方示例强调"提交到 Git 全团队生效"，反过来说**一次坏 hook 会传染全团队**〔推〕；
- 学**习曲线**：要理解 specs / steering / hooks / MCP 四个概念的关系，官方文档专门用一节做对比，说明容易混〔官〕。

**对我们的可借鉴点**：

| 借 | 怎么用 |
|---|---|
| **EARS 验收标准句式** | **最高价值**。我们的 E0 评测需要"可判定的期望"，EARS 是现成的模板：`WHEN <条件> THE SYSTEM SHALL <可观察结果>`。可以直接做进"任务验收条件"的生成约束里 |
| **task 反向链接需求** | 我们的长任务阶段也应回链目标，避免"做着做着忘了为什么" |
| **hooks = 事件驱动的检查** | 对应我们"不可信内容不得直接写记忆"这类硬策略：**放在事件上，不放在提示词里** |
| **spec↔代码双向同步** | 我们的对应物是"**spec↔记忆双向**"：需求变更要能回写记忆条目，记忆变更要能提示受影响的任务 |
| **steering** | 等价于我们的项目规则/持久规则层 |

**证据与来源**：
- 〔官〕发布博客（2025-07-14）：https://kiro.dev/blog/introducing-kiro/
- 〔官〕产品站/文档：https://kiro.dev/docs/specs/（JS 外壳，正文未取）
- 〔官〕AWS Builder Center 技术文章（2026-10-17，含 EARS 与 steering/hooks 讨论）：https://builder.aws.com/content/3Kp7g07c1mV5R3E5KxPFolK36nT/beyond-vibe-coding-building-reliable-applications-with-spec-driven-development-in-kiro

---

### 2.3 Tessl

**是什么**〔官〕：从"spec registry"起家、**已经转向"agentic 开发的开放平台"**。2025-09 的发布定位是"spec-driven framework + registry，让 AI coding agent 可靠"；到 2026-11，docs.tessl.io 的自述是**六个组件**：

| 组件 | 是什么 |
|---|---|
| **Registry & package manager** | 像依赖一样发现/安装/版本化/回滚 **skills 与 plugins**；公共+私有索引；agent 无关 |
| **Governance** | 按最佳实践和公司标准扫描打分 skill（**内置 Snyk 安全评分**）；RBAC；安装/发布策略；必装 skill；**完整审计轨迹** |
| **Evals** | **用真实任务、带 context 与不带 context 各跑一遍**，量化 skill/plugin 的实际影响——"每次改动都带证据，而不是猜测" |
| **Observability** | 看 skill 到底在哪些 session 真的**被激活**（不只是被安装）；挖 agent 日志找重复犯的错 |
| **Context & Findings** | 接 SCM 账号，映射 skills/配置在各仓库的分布；在组织层看**漂移、重叠、失管副本** |
| **Tessl Agent** | 对话式 agent，驱动平台并自主监控/改进 agentic 配置（open beta） |

**工作流**〔官〕：`Set up` → `Install CLI` → `init` 项目 → `Build your first factory` → `Improve your first skill`（再走 tutorials：包管理器用法、防不安全 skill、把公司 skill 标准代码化并强制、用 eval 证明 skill 有用、用 skill 降 agent 成本、Code Review、漏洞修复、CI 门禁、分布式 rollout）。

**Spec 格式与产物**〔官 +〔推〕〕：
- 当前官方叙事里，"**Context as code**"是核心：**skills / rules / docs 都作为版本化、可评审、可回滚的依赖**，以**普通文件形式落在你的 repo 里**（"so you own your agent setup and can walk away with it at any time"）。
- 早期（2025-09）的"spec 文件"叙事在现行文档目录里**已经看不到独立页面**；现行是 skills / plugins / evals / verifiers / schedules / automations。
- **迁移痕迹**：文档有 "Migrating from tiles to plugins"——说明它经历过一次概念改名（tiles → plugins）〔官〕。
- 具体 spec 文件扩展名/结构：**本次未确认**，标待核实。

**工具形态**：CLI + 云端平台 + GitHub/GitLab 集成 + CI action + 平台内 agent。闭源商业（有免费入口）。

**强项**：
- **把"上下文"当成依赖来管**（版本、回滚、审计）——这是全生态里最工程化的一种思路，避免了"prompt 随便改、没人知道改了啥"；
- **Evals 的对照结构**：明确说"带 context 与不带 context 各跑一遍"，这正是 `WITH / W/OUT / Δ` 的思路，**和我们的 E0 设计同构**；
- **观测到"激活"而非"安装"**：区分"装了"和"真用上了"，这是很多平台没做的；
- **治理是真的一等公民**（RBAC、策略、审计、Snyk 评分、漂移检测）；
- **不锁定**：产物是 repo 里的普通文件，可带走。

**弱项 / 已知失败点**：
- **平台导向、重**：六个组件对一个单机单人的场景是压倒性的〔推〕；
- **概念漂移风险**：从 "spec registry" 到 "skills/plugins 平台"，**同一家产品两年内换了中心概念**。对使用者意味着"你学的东西可能被改名"〔官有迁移页为证〕；
- **企业能力依赖云**：RBAC/审计/Reg飘/Rollout 都需要账号与云端，**离线不可用**〔推〕；
- 商业闭源：不能用它的内核，只能学思路。

**对我们的可借鉴点**：

| 借 | 怎么用 |
|---|---|
| **"带 context vs 不带 context"的对照评测** | 与 E0 的 `W/OUT` 完全一致，可作为"我们没走偏"的外部印证；把它写进 E1–E5 的验收要求 |
| **区分"安装"与"激活"** | 我们的记忆也要能回答"**这条记忆被真的用到了吗**"（对应 L3 的"记忆采纳/命中"指标） |
| **Context as code + 可回滚** | 我们的持久规则/spec 也要有版本与回滚（12 已有"读实时、写版本化"，这里只需把 spec 也纳入） |
| **漂移检测（drift/重叠/失管副本）** | 我们记忆里同样会出现"同一事实多份、互相漂移"——12 的 `disputed` 只处理冲突，**不处理"重复但没冲突"**，这个缺口值得补 |
| **反例警示**：概念改名要留迁移路径 | 我们自己若把 SpecCore 的产物命名改了，必须像 Tessl 一样留 migration 页 |

**证据与来源**：
- 〔官〕文档站首页（六组件、Context as code、问题清单）：https://docs.tessl.io/
- 〔官〕2025-09 发布文（"spec-driven framework and registry"，正文仅取到标题与摘要，其余被截断）：https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry/
- 〔官〕后续产品文（tiles→plugins 与 skills 叙事）：https://tessl.io/blog/announcing-tessls-products-to-unlock-the-power-of-agents/

---

### 2.4 BMAD-METHOD

**是什么**〔官〕：**方法论 + skills/agent 包**，自称 "Agile AI Driven Development（AiDD）"——"把一个想法或变更请求变成能跑的软件，**而不放弃思考**"。MIT。当前双线：**稳定版 v6.12**（npm 安装，仅修 bug）、**V7 预览 alpha**（skills 路线，2026-11 中间发布 v7）。

**解决什么问题**〔官，原文转述〕：coding assistant 擅长实现，但**常把未说出口的假设变成代码**。BMad 用 agent + workflow 把重要决策**显式化并留存为后续上下文**。

**核心设计：按意图大小缩放流程**〔官〕——这是 BMAD 最值得学的一点：

| 路径 | 触发条件 | 流程 |
|---|---|---|
| **Trivial** | 显而易见、低风险 | Change → Edit → Verify |
| **One session** | 一个连贯实现单元 | Intent → Build（plan/build/review）→ Result |
| **Epic** | 一个结果需要多个 Build | Intent → **Spec** → Stories → Build × N → Integrate → **Retrospective** |
| **Project** | 跨多个 epic 或约 20+ session | Intent → **共享契约**（product/UX/tech）→ Epics × N（每个走 epic 路径）→ 集成产品 |

官方原话点透了设计哲学："**每种路径用同一个实现单元；更大的工作只是在外围加共享上下文并重复它，而不是换一套交付系统。**"

**完整工作流（epic 路径示例）**〔官〕：

1. 把 epic 意图交给 **Sofia（Product Owner，`bmad-agent-po`）**；
2. Sofia 填 epic 的 requirements，**按依赖切成 stories，写进 epic 的 `tickets.toml`**；
3. 你审顺序、决定哪些 story 要 checkpoint；
4. 每个 story 用 `bmad-build` 跑一次（plan 写在 `tickets.toml` 旁，状态停在 `built`，**由你通过 Sofia 标 done**）；
5. 想无人值守就用 `bmad-build-auto`（一 story 一 run）；
6. epic 收尾：`bmad-retrospective` 读 entries + joined plans，**对 epic 的需求裁决组合结果**。

**角色与 skills（v7）**〔官〕：经典"分析师/PM/架构师/开发/QA"角色模型已在 v7 演化为**命名 agent + 一批 skills**：

| 阶段 | skills / agent | 产物 |
|---|---|---|
| 分析 | `bmad-brainstorming`、`bmad-forge-idea`、`bmad-deep-recon`、`bmad-prfaq` | `brainstorm-<slug>.md`、`forge-report.html`、带引用的 `research-<topic>.md`、`prfaq-<slug>.md` |
| 规划 | **John（PM，`bmad-agent-pm`）**、`bmad-ux`、`bmad-product-brief` | `prd-<slug>.md`、`brief-<slug>.md`、`DESIGN.md`、`EXPERIENCE.md`、`.memlog.md` |
| 方案 | `bmad-architecture` | `architecture-<slug>.md` |
| 交付 | **Sofia（PO，`bmad-agent-po`）**、`bmad-build`、`bmad-build-auto`、`bmad-retrospective` | requirements、`tickets.toml`、build plans、retro 报告 |

**Spec 格式与产物**〔官〕：
- 全部 Markdown，落在 **`_bmad-output/`**（默认输出目录）下的 `<type>-<slug>/` 文件夹；
- **`tickets.toml`** 是 epic 内的**有序任务表**（机器可读）；
- **`.memlog.md`** 伴随规划文档（记忆日志）；
- `bmad-eval` **eval runner** 与 **eval 格式**已成正式文档项（`reference/eval-format/`）。

**工具形态**：npm 安装（v6）/ skills CLI 或 Claude Code、Codex 插件市场（v7）；多模块生态（Builder、Test Architect、Loop、Game Dev Studio、Creative Intelligence）〔官〕。

**强项**：
- **right-sizing 做到极致**：四条路径、同一实现单元、明确"trivial 不需要 BMad"。这避免了 SDD 最常见的病——把小事做成大事；
- **"先有意图，再谈文档"**：明确说"well-defined intent = 完成时应为真的事 + 不能变的东西 + 范围外的东西"；缺意图时给一组**分析工具**（brainstorm/forge/recon/prfaq），且这些**不是阶段的必经**；
- **明确 token 上限的诚实提示**："Sofia 一次性读入，实际上限是几万 token，约 40 页文档；给她几倍的原始文档，她会静默丢掉重要的部分，先压缩再给。"——**承认了 LLM 的输入退化，并给出对策（先压缩）**，这种诚实很少见；
- **retrospective 作为收尾步骤**：对"组合结果"裁决，而不是只看每个 story 各自过没过；
- **`tickets.toml`**：既服务人又服务机器。

**弱项 / 已知失败点**：
- **概念与文件数量多**：14 种规划文档、多个 agent、memlog、tickets、initiative/epic/story 三层——**认知负担高**〔推〕；
- **版本处在迁移期**：v6 稳定 / v7 alpha 并行，README 自己说"V7 的 skills、安装路径和文档经常变，预期破坏性变更"〔官〕——**现在学它的具体形态有风险，学它的分层思想才稳**〔推〕；
- **强 prescriptive**：适合"愿意接受一套流程"的团队；对"只想要一个 spec 模板"的人是过杀〔推〕；
- 依赖 Node + Python + uv 三件套（安装门槛）〔官〕。

**对我们的可借鉴点**：

| 借 | 怎么用 |
|---|---|
| **right-sizing 四档** | **最高价值**。我们的个人助理天然需要"琐碎自决 vs 计划"的判定；BMAD 给了现成刻度：trivial / one-session / epic / project。可以直接搬到"任务规模判定"的档位定义（对应 E0 的 L1 分类组件） |
| **"先定意图，再谈文档"** | 我们的任务开始前也应先逼出"完成时为真的事 / 不能变的事 / 范围外的事"，而不是直接生成步骤 |
| **输入上限 + 先压缩** | 我们做记忆注入/文档处理时同样要设硬上限并先压缩；**这是对我们"缩短上下文"设计的独立佐证** |
| **不换交付系统，只重复单元** | 我们的长任务/子会话也该是"同一执行单元 + 外层聚合"，而不是为长任务另造一套机制 |
| **retrospective 裁决组合结果** | 对应我们长任务收尾必须"整体看"，不能只看每步成功 |
| **`tickets.toml` 机器可读任务表** | 我们任务表也该机器可读（Go 侧结构体 + 持久化），而不是只写 markdown |

**证据与来源**：
- 〔官〕README（v6/v7 双线、安装、模块生态）：https://github.com/bmad-code-org/BMAD-METHOD
- 〔官〕文档站"Choose a Planning Path"（right-sizing、agent 命名、产物表、token 上限）：https://docs.bmad-method.org/plan/choose-a-planning-path/
- 〔二/未读〕经典角色说明（`agents-guide.md`、`agent-roles.md`）：搜索结果指向仓库内 `src/modules/bmm/docs/agents-guide.md` 与 `docs/explanation/core-concepts/agent-roles.md`，本次未直读

---

### 2.5 Agent OS（buildermethods）

**是什么**〔官〕：Brian Casel 的**轻量标准管理系统**（免费开源）。定位很窄很清楚："**Agent OS 填补这个 gap**——它不替代 Claude Code / Cursor，而是补上'你的规范、模式、架构决策传不给 agent'这一块。"

**解决什么问题**〔官，原文转述〕：每次提示 agent，你都在**重教它本该已知的上下文**：约定背后的理由、团队打磨过的模式、塑造一切的架构决策——**agent 扫一遍代码是拿不到这些的**。

**工作流（v3 四步）**〔官〕：

| 步 | 名称 | 做什么 |
|---|---|---|
| 1 | **Install** | 简单安装脚本装进项目 |
| 2 | **Discover standards** | **从既有代码库提取模式与约定，写成文档化 standards** |
| 3 | **Inject standards** | **按你正在做什么，智能注入相关 standards** |
| 4 | **Shape spec** | 在 **plan mode** 里用增强的 shaping 问题，产出与产品使命和全部 standards 对齐的 spec |

另有 **product planning**（第 3 步）与 **Index standards**（把 standards 组织成可发现）。

**Spec / 产物格式**〔官〕：
- **全部是 Markdown 文件**，落在项目内 `agent-os/` 目录；
- 三层概念（本报告按官方导航归纳，具体目录名待核实）：**standards**（编码约定）、**product**（产品规划）、**instructions**（对 agent 的注入指令）〔推，依据 `agent-os/` 与 `standards`/`profiles`/`file-structure` 文档项〕；
- 官方有一页 **"Standards vs Skills"** 专门区分二者——说明它认为 standards ≠ skills（前者是**团队的约定事实**，后者是**可复用能力**）。

**工具形态**：安装脚本 + **Claude Code 斜杠命令**（首选）；其它工具靠"读这些 markdown 文件"也能用。有 profiles（配置档）与更新机制。

**强项**：
- **聚焦单一问题**：不管 spec 全流程，只管"**把团队的隐性约定变成可注入的显性 standards**"。这是全场最克制的一个；
- **Discover 方向反了**：多数工具假设"你先写规则"，Agent OS 主张"**从代码里把已有的规则挖出来**"——对存量项目非常实用；
- **inject 是"按需注入相关部分"**，不是全量塞进去（对上下文预算友好）；
- **plan mode 做 shaping**：把"问对问题"放在只读阶段，避免边聊边改。

**弱项 / 已知失败点**：
- **覆盖面窄**：不提供 tasks / implement / 验收 / 评审闭环；它明确"complement, not replace"〔官〕；
- **Discover 依赖模型对代码的理解**，抽取质量不稳定；错误的标准被注入后**会持续污染**所有后续工作〔推〕；
- **单一作者 + 免费工具**，长期维护与更新节奏是风险〔推〕；
- 与具体工具的集成（斜杠命令）以 Claude Code 为主，其它工具是"文件能用"级别〔官〕。

**对我们的可借鉴点**：

| 借 | 怎么用 |
|---|---|
| **Discover（从代码/历史里挖规则）** | 我们的"**记忆写回**"缺一个反向通道：从既有对话/历史里**主动挖掘**可复用规则，而不只等用户说"记住" |
| **Inject 按相关性注入** | 与我们的记忆检索/作用域注入完全同构；它证明"按需注入"是被独立验证的做法 |
| **Standards vs Skills 的区分** | 我们的记忆类型也该区分"**团队/个人的约定事实**"与"**可复用做法**"（12 的 `fact` vs `experience` 已有类似分野，可对齐术语） |
| **plan mode 里 shaping** | 我们的"只读调查 + 问对问题"阶段可以直接借用 |
| **克制**：只解决一个问题 | 反面提醒——SpecCore 不要什么都管，先把"spec 的判定与检索"做好 |

**证据与来源**：
- 〔官〕产品/文档首页：https://buildermethods.com/agent-os
- 〔官〕仓库 README：https://github.com/buildermethods/agent-os
- 〔官〕工作流/概念页（导航可证，正文未逐一抓）：`/agent-os/workflow`、`/agent-os/discover-standards`、`/agent-os/inject-standards`、`/agent-os/product-planning`、`/agent-os/shape-spec`、`/agent-os/standards-vs-skills`

---

### 2.6 SPARC（ruvnet）+ Roo Code

**是什么**〔二 + 待核实〕：一套**通过 Roo Code 的 Boomerang Tasks 编排自动化开发流程的结构化框架**，由 ruvnet 提出/实现（项目指向 `ruvnet/rUv-dev`，脚手架包 `create-sparc`）。Roo Code 文档以"社区方案"收录。

**解决什么问题**〔二，Roo Code 文档原文转述〕："通过结构化框架编排 set-and-forget 的 agentic 开发工作流……在保持开发者完全控制的前提下自动化复杂代码开发。"

**工作流（按 Boomerang 模式）**〔二〕：定义需求 → 生成代码 → 评审 → 精化，**连续反馈回路**；"Boomerang Tasks" = 把特定开发任务"扔给" Roo 并拿回实现；支持**预定义任务链 + 依赖管理**、**模式切换**（按开发阶段切换上下文设置）、**MCP 服务扩展**。

**SPARC 五字母**：**本次未在任何已抓正文中找到展开**。按社区通行说法是 **Specification / Pseudocode / Architecture / Refinement / Completion**〔推，待核实〕。**本报告不把它写成定论**。

**Spec 格式与产物**〔二〕：脚手架 `npx create-sparc init` 在根目录生成**完整项目结构**（子目录、配置、样板代码）+ 优化过的 prompt 模板。具体 spec 文件形态未确认。

**工具形态**：npm 脚手架 + Roo Code 模式/任务编排 + MCP。开源。

**强项**〔二〕：
- 提供**阶段化的 prompt 模板**（Specification → Pseudocode → Architecture → Refinement → Completion 的分段思路，本身对"先想再写"是有帮助的）；
- **Boomerang 的"扔出去再拿回来"** 是一种清晰的委派隐喻：任务边界显式；
- 与 IDE（Roo Code）深度绑定，开箱可跑。

**弱项 / 已知失败点**〔推〕：
- **文档质量参差**：五个字母的官方展开在可访问文档里都找不到，说明文档化程度不高；
- **强绑 Roo Code / VS Code 生态**，不可移植；
- **脚手架生成大量样板**："完整项目结构 + 配置 + 样板代码"很容易变成**过度生成**；
- `create-sparc` 在 npm 上的版本标注带警告符号（搜索结果显示 `⚠️`），**状态可疑**〔二，未核实〕。

**对我们的可借鉴点**：

| 借 | 怎么用 |
|---|---|
| **Boomerang 委派隐喻** | 我们派给"专家实例"的任务应有明确边界与回传契约；这与 16 §D15 借的"结算通知而非阻塞"一致 |
| **"先 pseudocode 再 architecture 再 code"的分段** | 我们的长任务中间产物可以是**伪代码/接口草案**，比直接改代码更容易被审阅与回滚 |
| **不借**：脚手架式大生成 | 我们是单机个人助理，生成项目模板无意义 |

**证据与来源**：
- 〔二〕Roo Code 文档（社区方案页，含特性与快速开始）：https://github.com/roovetgit/roo-code-docs/blob/6c9f34686fa7cd42584a382ed41e11f0d262886c/docs/community/sparc.md
- 〔二/未核〕`create-sparc` npm 页：https://www.npmjs.com/package/create-sparc
- 〔待核实〕项目仓库：https://github.com/ruvnet/rUv-dev

---

### 2.7 cc-sdd（Claude Code spec-driven development toolkit）

**是什么**〔官〕：一个**把"已批准的 spec"变成"长期自主实现"的 SDD harness**，以 **Agent Skills** 形式分发。**自称 "Kiro-inspired"**，且**兼容/可移植现有的 Kiro specs**。MIT。

**解决什么问题 / 核心主张**〔官，原文关键句〕：
> "cc-sdd 把 spec 当作**系统各部分的契约**，而不是交给 agent 的主命令文档。**代码仍然是真相来源**。spec 让代码各部分之间的边界显式化，从而让人和 agent 能并行工作而不必持续同步。"
> "**边界不是开销。** 边界是让你在里面自由移动、同时保护外面的东西。"

**工作流**〔官〕：

```
/kiro-discovery  →  /kiro-spec-init  →  /kiro-spec-requirements
                 →  /kiro-spec-design  →  /kiro-spec-tasks  →  /kiro-impl
```

- **`/kiro-discovery` 是入口**，负责**路由**：扩已有 spec / 无 spec 直接实现 / 建一个新 spec / 拆成多个 spec / 混合拆解。写 `brief.md`（必要时 `roadmap.md`），让你**不必重新解释范围**就能续做。
- **`/kiro-impl` 是长期自主实现**：有原生 subagent 时，**每个 task 一个新 implementer 跑 TDD（RED→GREEN，藏在 feature flag 后）+ 一个独立 reviewer + 阻塞或反复评审失败后自动 debug**；没有 subagent 时就地串行。**学习通过 `tasks.md` 的 `## Implementation Notes` 传播**。每次迭代处理一个 task；**记录 task 状态以支持中断后续跑**（先检查未完成的活与活跃 worker）。
- **`/kiro-spec-batch`**：把 roadmap 按**依赖波次**拆成多个 spec，有 subagent 时并行，并做**跨 spec 评审**（抓矛盾、职责重复、接口不匹配）。

**Spec 格式与产物**〔官〕：

| 产物 | 内容 |
|---|---|
| `requirements.md` | **EARS 格式**需求 + 验收标准 |
| `design.md` | 架构 + **Mermaid 图** + **File Structure Plan**（边界优先） |
| `tasks.md` | 任务，带 **`_Boundary:_`** 与 **`_Depends:_`** 标注；`## Implementation Notes` 承载跨任务学习 |
| `brief.md` / `roadmap.md` | discovery 产物（单 spec / 多 spec） |
| `{{KIRO_DIR}}/settings/templates/`、`rules/` | 可改的文档结构与生成规则 |

- 默认目录与 Kiro 兼容（`--kiro-dir` 可改）。
- **17 个 skills**，按需加载（progressive disclosure）。

**工具形态**：`npx cc-sdd@latest` 安装；**跨 8 个 agent**（Claude Code / Codex 稳定；Cursor / Copilot / Devin / OpenCode / Gemini CLI / Antigravity beta）；14 种语言。旧 `/kiro:*` 命令模式已废弃但保留。

**强项**：
- **"spec 是契约、代码是真相"** 这个立场是最清醒的一个：它**不把 spec 当唯一真理**，避免"文档与代码谁说了算"的无解争论；
- **boundary-first**：`File Structure Plan` 驱动任务边界，任务带 `_Boundary:_`/`_Depends:_`，**评审专查边界越界**（不只是风格问题）。这是把"架构约束"变成可检查项；
- **per-task 独立评审 + 自动 debug**：把"实现-评审"做成循环，而不是最后一次性评审；
- **`## Implementation Notes` 让学习在任务间传播**（一行字就把"经验沉淀"做进了产物里）；
- **discovery 负责路由**（要不要 spec、拆几个），避免"所有事都走全流程"；
- **诚实标注稳定性**：明确说"装上 17 个 skills ≠ 验证了 host 能跑完整自主循环"。

**弱项 / 已知失败点**〔官自述 + 〔推〕〕：
- **高度依赖宿主能力**：有 subagent 与没 subagent 是两套体验；官方自己说多个 beta 集成的"认证任务执行仍未验证"；
- **spec 产物仍然在 repo 里**（`.kiro/`），对无 repo 场景不适用；
- **Kiro-inspired 意味着继承 Kiro 的三文档重流程**，对小事同样偏重；
- 版本演进快（v1→v2→v3 大改，Skills 模式取代命令模式），**学习材料容易过期**。

**对我们的可借鉴点**（这个框架对我们价值很高）：

| 借 | 怎么用 |
|---|---|
| **"spec 是契约，代码/事实是真相"** | 直接对齐我们的立场：**spec 内部化**，不是权威来源；权威仍在记忆与事实 |
| **boundary-first：`_Boundary:_` / `_Depends:_`** | 我们的任务/子会话也可以带**边界声明**（允许碰哪些记忆作用域、哪些文件），并让评审专查越界。这比"事后看 diff"强 |
| **per-task 独立 reviewer + 自动 debug** | 对应我们 E0 的"评审用不同模型/不同角色"的想法，且给了循环结构 |
| **`## Implementation Notes` 传播学习** | **低成本高价值**：任务完成后往 tasks 里写一段"这次学到什么"，下次同任务族直接读。可作为 SpecCore 的一个产物字段 |
| **discovery 路由（要不要 spec / 拆几个）** | 我们的"任务规模判定"可以直接借这个五选一路由：扩已有 / 直接做 / 一个新 spec / 拆多个 / 混合 |
| **跨 spec 评审（矛盾/重复/接口不匹配）** | 我们多任务并行时同样需要跨任务一致性检查 |

**证据与来源**：
- 〔官〕仓库 README（v3.0 全部特性、工作流、产物、支持矩阵）：https://github.com/gotalab/cc-sdd
- 〔官〕`Why cc-sdd?`（哲学与取舍）：`docs/guides/why-cc-sdd.md`（README 链接，正文未逐一抓）

---

### 2.8 学术与工程传统

分两块：**经典谱系**（背景，帮助我们定位"SDD 到底新在哪"）与**2025–2026 的新工作**（有实证价值的）。

#### 2.8.1 经典谱系〔通识，非本次抓取〕

SDD 不是新发明，它是几条老传统的合流：

| 传统 | 主张 | 与 LLM-SDD 的关系 |
|---|---|---|
| **Design by Contract**（Meyer，1980s–90s） | 每个模块有前置/后置条件与不变式，运行时检查 | Kiro 的 EARS 验收标准几乎是它的自然语言翻版；"契约"思想在 cc-sdd 里被明确继承 |
| **形式化规格**（Z、VDM、TLA+、Alloy） | 用数学写规格，可机器验证 | LLM-SDD 目前**放弃了可验证性**，只保留"显式化"——**这是重大退步，也是最大的改进空间** |
| **Model-Driven Engineering / MDA** | 模型是一等公民，代码由模型生成 | LLM-SDD 的"spec → tasks → code"是它的松散版本，但**没有元模型约束** |
| **TDD / BDD**（Kent Beck、Dan North） | 先写测试/行为描述，再实现 | "先定义可判定期望"是同源；EARS 是 BDD Given-When-Then 的变体 |
| **Literate Programming / 文档即代码** | 文档与代码同源、可版本化 | 所有现行 SDD 的产物形态（repo 内 Markdown）都是它的后代 |

> 〔推〕这条谱系给我们的直接启示：**LLM-SDD 目前缺的正是"可验证性"**。它把规格从"能被机器检查"退化成了"能被模型读懂"。**谁把可验证性加回来（哪怕只是部分、用可判定验收条件 + 自动评测），谁就拿到了下一代的差异点。** 这恰好是我们 E0 已经在做的事。

#### 2.8.2 2025–2026 的新工作

| 工作 | 出处 | 与本主题的关系 | 证据级别 |
|---|---|---|---|
| **Specification Portability Across LLM Development Agents**（Grynets 等，2026-08-21） | arXiv:2608.21208（cs.SE / cs.AI / cs.LO，11 页） | **最有价值的一篇**：直接测"spec 在不同 agent 之间可移植吗" | 〔官〕已读摘要（下文详述） |
| **Requirements Development and Formalization for Reliable Code Generation: A Multi-Agent Vision** | ASE 2025（IEEE/ACM，DOI 10.1109/ASE63991.2025.00345） | 多 agent 做"需求开发 + 形式化"以提升代码生成可靠性 | 〔二〕仅标题与出处 |
| **Consort: A Spec-First Agent Framework for Enforced, Test-Driven Development on Live Database Branches** | arXiv:2609.09671 | "spec-first + 强制 TDD + 活数据库分支"——把 spec 与可执行验证绑定 | 〔二〕仅标题与出处 |
| **Thoughtworks Technology Radar：OpenSpec 条目** | thoughtworks.com/radar | 说明 SDD 工具已进入主流技术雷达评估（对 OpenSpec 的定位与取舍有公开评价） | 〔二〕页面为 JS 导航壳，正文未取 |

**重点：Specification Portability 那篇的实证结论**〔官，摘要〕——这篇对我们**极其重要**，因为它用数据打了"写一份 spec 就能到处用"的假设：

- 任务设定：Oracle→PostgreSQL 迁移（受控变换任务），跨 agent（**Kiro、Gemini、Copilot**；单 agent 阶段还有 Claude Code、Cursor）。
- **规模**：1,006 个 PL/SQL 文件；623 个成功重新生成；380 个生成脚本在 PG16 上成功执行。跨 agent 实验用 1,802 个 Oracle 脚本 + 对应 PG 实现。
- 指标：Token F1、exact match、SQL 语法有效性、AST exact match、AST 平均相似度、可立即运行性。
- **四个结论**：
  1. **spec 的大小本身不能预测实现质量**；
  2. **跨 agent 迁移会出现显著的"agent 相关退化"**——最强的一例是 **Gemini 直接消费 Kiro 产出的 spec**：Token F1 **0.035**、SQL 语法有效性 **2.33%**、AST 平均相似度 **0.015**；
  3. **重写（rewriting）能显著改善**；**压缩（compression）没有普适收益**；
  4. **检索增强式摄入（retrieval-augmented ingestion）是唯一同时出现在 Gemini 与 Copilot 帕累托前沿上的通用策略**。
- 作者的推论：异构 SDD 工作流里的 spec **不应被自动当作 agent 中立产物**；需要显式考虑 **spec 可移植性、agent 特定解释、基于检索的访问**。

> 〔推〕这篇论文对我们"**Spec 内部化**"的支撑是**直接的**：
> - "spec 大小不预测质量" → **不要靠"把 spec 写得更长更细"来提升效果**；
> - "跨 agent 严重退化" → **不要把 spec 设计成给"任意 agent"读的公共格式**；我们的 spec 是**给一个自研内核读**的，这反而是优势；
> - "压缩无普适收益" → 我们做记忆/spec 压缩时要**实测**，不能假设压了就更省更好（呼应"先测基线"）；
> - "检索增强是唯一共同有效策略" → **支撑"spec 不整块塞进上下文，而是可检索地按需取用"**。这正是"内部化 + 检索"的技术路线。

---

### 2.9 发现但未深入的（诚实标注，不做结论）

这些在检索中出现，但本次**没有足够证据**展开；列出来供后续按需深挖，避免"听说过就当真"。

| 名称 | 线索来源 | 状态 |
|---|---|---|
| **lightspec** | npm 包页（`lightspec`，0.x 版本） | 〔二〕仅见包名与版本，**是什么、是否 SDD 均未确认** |
| **Consort** | arXiv:2609.09671 | 〔二〕有摘要级定位（spec-first + 强制 TDD + DB 分支），未读正文 |
| **Thoughtworks Radar 收录的 SDD 工具族** | thoughtworks.com/radar | 〔二〕雷达有 OpenSpec 专条；**同期是否收录其它 SDD 工具未核实** |
| **IDE 内置的轻量 SDD**（Cursor Plan mode、Cline Plan/Act、Kilo Code Memory Bank 等） | 〔推/通识〕 | 这些属于"**产品内置的阶段化**"，不是独立 SDD 框架；本次**未取任何一手证据**，故不设小节。若需要，应单开一轮调研 |
| **OpenSpec / Superpowers 的对比定位** | 任务给定 | 按要求**不重复深入**；仅在 §3 对照表里作为已知参照占位（标"已知"） |

---

## 3. 横向对照表

> 只放能站住的信息；`—` 表示本次未确认。"重"= 流程/概念负担重，"轻"= 克制。

| 框架 | 类型 | 核心工作流 | Spec 载体与位置 | 工具形态 | 最硬的强项 | 最痛的弱项 |
|---|---|---|---|---|---|---|
| **GitHub Spec Kit** | 工具型（官方） | constitution → specify → plan → tasks → implement → **converge 循环**（+ bug/assess 两个扩展入口） | Markdown 模板 + 斜杠命令；`.specify/` | CLI（`specify`，Python/uv）+ agent skills | **扩展/预设/目录三层治理**；`converge` 与 `verified`/`go`/`kill` 的封闭状态；离线目录 | 流程偏重；产物必须在 repo 里；生态分层带来"该用哪层"的认知成本 |
| **Kiro** | IDE 型（AWS，闭源） | 一句话 → requirements（**EARS**）→ design（图/接口/schema）→ tasks（依赖排序 + 回链需求）→ 逐条执行；hooks 事件自动化 | Markdown 三件套；`.kiro/specs/`〔推/待核实〕 | IDE（Code OSS 分支）+ CLI/Web/Mobile/Crew | **EARS 可判定验收**；task 回链需求；hooks 把检查搬到事件上 | 绑定 AWS/闭源；三文档对小事过重；坏 hook 会传染团队 |
| **Tessl** | 混合型（平台，闭源） | 装 CLI → init → build factory → improve skill → 治理/分发/评测 | **Context as code**：skills/plugins/rules 作为版本化依赖，落 repo 普通文件 | CLI + 云平台 + GitHub/GitLab + CI | **带/不带 context 的对照评测**；区分"安装 vs 激活"；治理与审计；可带走 | 六组件过重；**概念漂移（spec→skills/plugins，tiles→plugins）**；企业能力依赖云 |
| **BMAD-METHOD** | 方法论型（+skills） | 四档 right-sizing：trivial / one-session / epic / project；epic 路径 = 意图→spec→stories→Build×N→集成→retro | Markdown + **`tickets.toml`** + `.memlog.md`；`_bmad-output/` | npm / skills CLI / Claude Code、Codex 插件市场 | **right-sizing 四档**；先定意图；**诚实承认输入上限并要求先压缩**；retro 裁决组合结果 | 概念/文件极多；v6/v7 并行迁移期；prescriptive |
| **Agent OS** | 工具型（轻） | install → **discover standards** → **inject standards** → product planning → **shape spec（plan mode）** | 全 Markdown；`agent-os/` 目录；standards / product / instructions | 安装脚本 + Claude Code 斜杠命令（其它工具读文件） | **从代码里挖 rules**（Discover）；按需 inject；只解决一个问题 | 不覆盖 tasks/实现/验收；Discover 质量不稳；单人维护 |
| **SPARC**（ruvnet / Roo Code） | IDE 型（社区） | 需求→生成→评审→精化循环；Boomerang Tasks 委派 + 任务链 + 模式切换 | 脚手架生成项目结构 + prompt 模板 | npm 脚手架 + Roo Code 模式/任务编排 + MCP | 阶段化 prompt 模板；**委派隐喻清晰** | 文档化差（五字母官方展开都查不到）；强绑 Roo Code；脚手架易过度生成 |
| **cc-sdd** | 工具型（跨 agent） | **discovery 路由** → spec-init → requirements（EARS）→ design（含 File Structure Plan）→ tasks（`_Boundary:_`/`_Depends:_`）→ **/kiro-impl（per-task TDD + 独立评审 + 自动 debug）**；`spec-batch` 多 spec | Markdown（与 Kiro 兼容）；`{{KIRO_DIR}}` | npx + **Agent Skills**，跨 8 agent | **"spec 是契约、代码是真相"**；**boundary-first**；per-task 评审循环；`Implementation Notes` 传播学习 | 强依赖宿主 subagent 能力；产物仍在 repo；继承 Kiro 三文档之重；版本演进快 |
| **学术（经典谱系）** | 方法论（历史） | Design-by-Contract / 形式化规格 / MDE / BDD / literate programming | 数学/契约/测试/文档 | — | **可验证性**（LLM-SDD 丢掉的正是这个） | 与 LLM 工作流脱节 |
| **arXiv:2608.21208（2026）** | 实证研究 | 受控迁移任务上测 spec 跨 agent 可移植性 | spec 文本（Kiro-origin 等） | 研究代码 | **给出量化退化证据**；指出检索增强是唯一共同有效策略 | 单一任务域（Oracle→PG）；未经同行评审〔推〕 |
| *（已知，不重复）* OpenSpec / Superpowers | — | — | — | — | 用户已了解 | — |

---

## 4. 分类总结

### 4.1 四类及其代表

| 类 | 定义 | 代表 | 典型用户 | 对我们的意义 |
|---|---|---|---|---|
| **工具型** | 以 CLI/脚本 + 模板/命令为核心，可插到任意 agent 上 | **Spec Kit**、**Agent OS**、**cc-sdd** | 已有 coding agent、想加流程的开发者 | **最可移植**：思路能直接搬，且不绑定 IDE |
| **IDE 型** | SDD 是 IDE 的一部分，深度绑定编辑器体验 | **Kiro**、**SPARC/Roo Code** | 愿意换编辑器的人 | 借**交互形态**（hooks、plan mode、逐 task 执行与 diff 审计），不借平台 |
| **方法论型** | 核心是"怎么想、按什么顺序想"，工具只是载体 | **BMAD**、（经典谱系的 formals/BDD） | 团队、想要纪律的人 | 借**刻度与角色**（right-sizing、意图三要素），不借其文件森林 |
| **混合型** | 平台 = 制品管理 + 治理 + 评测 + 分发 | **Tessl** | 组织、要治理与证据的人 | 借**治理与评测结构**（对照评测、激活监测、漂移检测），不借云端依赖 |

### 4.2 三条跨框架的共识（可直接采信）

1. **"先显式化，再实现"确实有效**——所有 7 个框架独立收敛到"需求/意图必须先成为可审阅的产物"。这不再是假设。
2. **产物应该是纯文本 + 可版本化**——全部落在 repo 的 Markdown（BMAD 另加 TOML）。**没有一个框架用数据库当 spec 存储**（〔推〕因为它们面向多人协作与 code review）。
3. **验收必须可判定**——Kiro 用 EARS、Spec Kit 用 `converge`/`verified`、cc-sdd 用 per-task 评审、BMAD 用 retro 裁决。**"agent 说做完了"在所有成熟框架里都不被接受。**

### 4.3 三条跨框架的分歧（必须自己选）

| 分歧 | 一侧 | 另一侧 | 我们的选择倾向 |
|---|---|---|---|
| **spec 是真理还是契约？** | Spec Kit：spec 是流程主干，converge 回它 | **cc-sdd：spec 是契约，代码是真相** | 取 cc-sdd：我们更要"事实是真相"（记忆优先） |
| **流程要不要随规模缩放？** | BMAD：四档缩放 | Kiro/Spec Kit：默认全流程 | 取 BMAD：个人助理必须能"琐碎自决" |
| **上下文是"写进 spec"还是"按需检索"？** | 多数：全量放进上下文 | arXiv 论文：检索增强是唯一共同有效策略 | 取论文 + Agent OS inject：**检索优先** |

---

## 5. 对"我们自研 SpecCore"的建议（8 条）

> 前提：**单机、记忆优先、Spec 内部化、Go 自研**。每条都注明"借谁 / 避谁"。

### S1｜把 spec 定位成"记忆的一种类型"，不是独立文件体系

- **借**：cc-sdd 的"spec 是契约、代码/事实是真相"；Tessl 的"context as code"（版本化、可回滚）。
- **避**：所有框架的"repo 内 Markdown 即制品"假设——**我们没有 repo，也不需要 code review**。
- **落地**：spec 在 SpecCore 里是**结构化条目 + 附件**（与 design/12 的记忆模型同构），带 `scope` / `authority` / `rv` / `source`。**导出成 markdown 只是视图**，不是存储形态。

### S2｜验收条件用 EARS，并强制"可判定"

- **借**：Kiro 的 EARS；Spec Kit 的封闭状态枚举（`verified`/`partial`/`failed`）；cc-sdd 的 per-task 验收。
- **避**：自然语言"完成说明"当验收。
- **落地**：每个 spec 条目必须有 ≥1 条 `WHEN … SHALL …` 形式的验收条件，且**能映射到 E0 的 grader**（regex / state_delta / forbidden / tool_used）。**映射不出来的验收条件不合法**——这条会强迫我们把"想要什么"想到可检验。

### S3｜四档规模判定，默认走最轻档

- **借**：BMAD 的 trivial / one-session / epic / project；cc-sdd 的 discovery 五选一路由。
- **避**：Kiro/Spec Kit 的"默认全流程"。
- **落地**：SpecCore 提供 `classify(intent) → tier`，**trivial 档禁止生成 spec 文档**（只留一条记忆记录）。这直接服务"琐碎自决、真歧义才问"的交互原则。

### S4｜boundary-first：任务带显式边界声明

- **借**：cc-sdd 的 `File Structure Plan` + `_Boundary:_` / `_Depends:_`；Kiro 的 task 回链需求。
- **避**："事后看 diff 判断越界"。
- **落地**：每个任务携带 `boundary`（允许触碰的记忆作用域 / 文件 / 工具白名单）与 `depends`（前置任务/事实）。**评审专查越界**，越界即失败（而不是"审核一下放过去"）。可与 16 §D12 的权限求值结合：**boundary 是 spec 侧的策略，权限是执行侧的强制，二者互为印证**。

### S5｜spec 不整块入上下文，一律走检索

- **借**：arXiv:2608.21208（**检索增强是唯一共同有效策略**）；Agent OS 的 inject（按相关性注入）；Claude/Codex 的工具延迟加载思路。
- **避**：把所有 spec 塞进 system prompt。
- **落地**：SpecCore 暴露"按任务/作用域/相似度检索 spec 片段"的接口；注入带预算与来源标注。**不做 embedding 也可以先做 FTS + 结构过滤**（与 16 §D9 的候选一致），并预留 `Retriever` 接口。

### S6｜把"学到什么"作为一等产物

- **借**：cc-sdd 的 `## Implementation Notes`（任务间传播学习）；Agent OS 的 Discover（从历史挖规则）；BMAD 的 retro。
- **避**：任务结束后什么都不留。
- **落地**：任务收尾强制产出一条 **learn**（可复用做法 / 踩过的坑 / 被推翻的假设），走 12 的**候选制**进入记忆，而不是直接写公共层。**这是"记忆优先"与 SDD 的接缝**——SDD 提供"何时该总结"，记忆模型提供"怎么安全地存"。

### S7｜对外零依赖，对内要能回答"这条规则/规格从哪来"

- **借**：Spec Kit 的 artifact inventory（分辨来源层级）；Tessl 的漂移检测（drift / 重叠 / 失管副本）。
- **避**：云端治理平台、目录市场、账户体系。
- **落地**：SpecCore 只做本地；但每条 spec/规则必须能追溯 `source`（用户原话 / 任务产物 / 导入 / 推断），并定期报"**未使用且低权威**"的条目（候选失效，不是删除）。**这解决 Tessl 指出的漂移问题，但不需要它的云。**

### S8｜不要为了"sdd 形状"造重流程；把省下的力气放在"判定"上

- **借**：Agent OS 的克制（只解决一个问题）。
- **避**：BMAD 的 14 种文档、Kiro 的三文档强制、Spec Kit 的六步全跑。
- **落地**：SpecCore 的 V1 只有四件事——**分类（S3）、边界（S4）、验收（S2）、检索（S5）**。其余（角色扮演、市场、治理、多 agent 编排）**明确不做**。
- **理由（这是本节最重要的一条）**：第 1 节的演化结论是"**模板已商品化，竞争点转向判定与证据**"。我们花在"让流程像 SDD"上的每一小时，都是从"让它可被验证"里偷的。

---

## 6. 待核实项（不要当结论用）

| # | 待核实 | 现状 |
|---|---|---|
| 1 | **SPARC 五个字母的官方展开** | 已抓的 Roo Code 社区页**未展开缩写**；通行的 Specification/Pseudocode/Architecture/Refinement/Completion 属〔推〕 |
| 2 | **Kiro 的目录路径**（`.kiro/specs/`、`.kiro/steering/`） | 未从官方正文确认；现有依据是 AWS 文章的行文与社区惯例 |
| 3 | **Kiro specs 的文件名约定**（`requirements.md`/`design.md`/`tasks.md`） | AWS 文章明确给出这三个文件名，但**是否还有 meta 文件**未确认 |
| 4 | **Tessl 早期 spec 文件的格式与扩展名** | 2025-09 发布文正文被截断（只取到标题与摘要）；现行文档已转向 skills/plugins，**未找到 spec 文件规范** |
| 5 | **Tessl 的产品叙事是否已放弃"spec"一词** | 现行文档目录无 spec 专页，但这不等于官方弃用该词（可能只是改名或并入 skills）——〔推〕，需读 changelog 或历史文档 |
| 6 | **BMAD 经典角色表**（analyst / PM / architect / dev / QA）在 v7 的对应关系 | 已见 John（PM）/ Sofia（PO）/ UX / architecture / build / retro；**QA 与 analyst 的 v7 落位未确认**（搜索结果指向 `agents-guide.md` 与 `agent-roles.md`，正文未读） |
| 7 | **Agent OS 三层（standards / product / instructions）的确切目录名** | 依据官方导航归纳，未逐一抓 `/agent-os/file-structure` 正文 |
| 8 | **Spec Kit 1.0 的 `converge` 判定标准** | README 只说"循环直到报 Converged"，**收敛的判定条件未披露** |
| 9 | **cc-sdd 的 17 个 skills 全名单** | README 列了主链路与部分支持 skill，**完整 17 个未列** |
| 10 | **arXiv:2608.21208 是否经同行评审** | arXiv 预印本，未见接收信息 |
| 11 | **Consort（arXiv:2609.09671）全文** | 仅摘要级；"live database branches" 的具体机制未读 |
| 12 | **ASE 2025 那篇的结论** | 仅标题与出处，未读 |
| 13 | **Thoughtworks Radar 对 OpenSpec 的评级与评论** | 页面为 JS 导航壳，正文未取 |
| 14 | **lightspec 是什么** | 仅见 npm 包名与 0.x 版本，**未确认是否 SDD 相关** |
| 15 | **Cursor Plan mode / Cline Plan-Act / Kilo Memory Bank 是否算 SDD** | 〔推〕属"产品内置阶段化"，本次未取一手证据，故未设小节 |

---

## 7. 来源清单

### 一手（已抓原文）

1. GitHub Spec Kit README（流程、扩展机制、三入口）— https://github.com/github/spec-kit
2. Spec Kit 文档站 — https://github.github.io/spec-kit/
3. Kiro 发布博客（2025-07-14，specs + hooks 原始设计意图）— https://kiro.dev/blog/introducing-kiro/
4. AWS Builder Center：Kiro 的 SDD 实践（2026-10-17，EARS/steering/hooks/MCP）— https://builder.aws.com/content/3Kp7g07c1mV5R3E5KxPFolK36nT/beyond-vibe-coding-building-reliable-applications-with-spec-driven-development-in-kiro
5. Tessl 文档站首页（六组件、Context as code、问题清单）— https://docs.tessl.io/
6. BMAD-METHOD README（v6/v7 双线、模块生态）— https://github.com/bmad-code-org/BMAD-METHOD
7. BMAD 文档：Choose a Planning Path（right-sizing、命名 agent、产物表、token 上限）— https://docs.bmad-method.org/plan/choose-a-planning-path/
8. Agent OS 产品/文档首页（Discover/Inject/Shape、工具兼容）— https://buildermethods.com/agent-os
9. Agent OS 仓库 README — https://github.com/buildermethods/agent-os
10. Roo Code 文档：SPARC by ruvnet（Boomerang、特性、快速开始）— https://github.com/roovetgit/roo-code-docs/blob/6c9f34686fa7cd42584a382ed41e11f0d262886c/docs/community/sparc.md
11. cc-sdd README（v3.0 特性、工作流、产物、支持矩阵）— https://github.com/gotalab/cc-sdd
12. arXiv:2608.21208 摘要（spec 跨 agent 可移植性，含量化结论）— https://arxiv.org/abs/2608.21208

### 二手 / 仅标题级（未读正文，已在正文标注）

13. Tessl 2025-09 发布文（"spec-driven framework and registry"，正文截断）— https://tessl.io/blog/tessl-launches-spec-driven-framework-and-registry/
14. Tessl 产品文（skills/plugins 叙事、tiles→plugins）— https://tessl.io/blog/announcing-tessls-products-to-unlock-the-power-of-agents/
15. `create-sparc` npm — https://www.npmjs.com/package/create-sparc
16. SPARC 项目仓库 — https://github.com/ruvnet/rUv-dev
17. Consort（arXiv:2609.09671）— https://export.arxiv.org/pdf/2609.09671
18. ASE 2025：Requirements Development and Formalization for Reliable Code Generation — https://ieeexplore.ieee.org/document/11334634
19. Thoughtworks Technology Radar：OpenSpec — https://www.thoughtworks.com/radar/tools/openspec
20. lightspec（npm）— https://www.npmjs.com/package/lightspec

### 已知，按要求未深入

21. OpenSpec（Fission-AI）
22. Superpowers（obra）

---

## 版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0 | 2026-11-06 | 首版：7 个框架 + 学术两块；横向对照表；四类分型；3 条共识 / 3 条分歧；8 条 SpecCore 建议；15 条待核实 |

---

*本报告为调研与决策辅助；标〔推〕"待核实"处请勿当结论引用。Kiro 与 Tessl 的官网正文未直接取得，其一手依据已在各节注明替代来源。*

# 27 · 多智能体协作模式全集（研究备忘）

> 性质：研究备忘，不是设计方案；不改 `design/` 其它文件。
> 范围：**A 任务内协作**（有消息流）、**B 任务间并发**（无消息流，经共享记忆/黑板协调）。
> 分级：〔文档〕=官方文档/论文原文可查；〔推断〕=本文归纳。URL 见文末。

## 0. 结论

1. **A/B 判据不是"几个 agent"，而是"消息有没有接收者"**：有 receiver→A；只写作用域→B。
2. **fan-out 买的是 token 预算，不是"协作"**：多 agent 约 15× chat token、单 agent 约 4×；BrowseComp 上 token 用量单独解释 80% 性能方差〔文档〕。
3. **最贵的失败是隐式决策冲突与验证缺失**：Cognition「actions carry implicit decisions」〔文档〕；MAST 把 1600+ 失败轨迹归为 14 模式/3 类（系统设计、agent 间失配、任务验证）〔文档〕。
4. **共享产物+引用 > 消息转述**：Anthropic 建议子 agent 写文件系统、只回传引用（少传话）〔文档〕，与司墨"记忆即黑板"同向。
5. **没有全场景最优模式**（§4）；原语集有 5 类表达不了（§3.3）。

## 1. 两个层次与判据

| 维度 | A 任务内协作 | B 任务间并发 |
|---|---|---|
| 协调介质 | 消息流 | 共享记忆 + 合并规则 |
| 产物寻址 | 给 agent（receiver） | 给作用域（scope/key） |
| 同步点 | join / await / 汇报 | 版本、租约、冲突检测 |
| 失败归因 | 某次答复 | 某次写、某个条目 |
| 授权 | 能跟谁说话 | 能写哪里 |
| 时延 | 轮次 × 单轮 | 调度 + 合并吞吐 |

**判据**（任一为"是"即 A）：①删掉消息对方仍能干活？否→A。②产物必须指定 receiver？是→A。③有 join/await 回路？是→A。④授权是通信而非写域？是→A。

**混合**：handoff 是 A 的退化（单次转移、无回路）；blackboard 既是 A 的介质也能承载 B；stigmergy 常跨任务，属 B。

## 2. 模式目录

### 2.1 A · 拓扑与控制

| 模式 | 定义/拓扑 | 原语 | 适用 · 不适用 | 成本·延迟 | 失败模式 | 判据 |
|---|---|---|---|---|---|---|
| 层级 supervisor | lead 拆解→派发→汇总；星形 | delegate→ask/inform→review→commit | 子任务不可预知、需动态拆解；忌强耦合/共享上下文 | 轮次×单轮；同步等待是公认瓶颈〔文档〕 | 分派含糊→重复漏项；worker 假设冲突 | 只有 lead 说话 |
| 链式 pipeline | 固定顺序，前一步输出为后一步输入 | inform；gate 处 review | 步骤固定且可验；忌需回头探索 | n×单轮，最省；无并发 | 误差级联；gate 形同虚设 | 边固定且无回边 |
| 图式 DAG | 节点=步骤、边=依赖，控制流在代码里〔文档〕 | delegate+inform+commit(state) | 依赖已知、要可复现；忌控制流临场决定 | 关键路径；调度开销小 | 图与真实依赖不符→假并行；state schema 成隐式契约 | 控制流不在对话里 |
| 路由 router-worker | 先分类再转交专家；一分多路（MoE 类比〔推断〕） | ask(classify)→delegate | 类别清晰、专家提示差异大；忌分类不准 | +1 次分类，省下游 token | 路由错→专家在错前提上工作 | 只有一个在干活 |
| handoff/升级 | 控制权整体转移，前者退出〔文档〕 | delegate+inform(全量历史) | 分诊→专家、一线→升级；忌并行/回访 | 低；默认继承全部历史 | 责任真空；错误决策被继承 | 同一时刻一人持有对话 |
| 对等协商 P2P | 无中心，两两多轮提议-反提议 | propose/accept/reject/inform | 利益冲突、需议价；忌有唯一可验解 | 轮次不可预测，易发散 | 不收敛；强势方主导 | 无 lead 且每轮改变对方状态 |

### 2.2 A · 协商、评审与聚合

| 模式 | 定义/拓扑 | 原语 | 适用 · 不适用 | 成本·延迟 | 失败模式 | 判据 |
|---|---|---|---|---|---|---|
| contract net | 公告→投标→授标→执行→报告〔文档〕 | ask→propose*→accept/reject*→commit→inform | 任务可声明、能力未知；忌投标成本高于任务 | ≥3 跳；投标数×1 次推理 | 虚假投标；中标不执行 | 有"投标"这一跳 |
| 市场/拍卖 | 价格信号分配任务与资源 | propose(报价)/accept/commit | 资源稀缺、可定价；忌无法定价或要公平 | 竞价轮次；机制设计成本 | 策略报价、赢家诅咒、饥饿 | 决策变量是价格 |
| 辩论 debate | 多实例多轮互评后收敛〔文档〕 | propose*→inform(批评)*→vote/commit | 开放推理、事实核验；忌有确定性验证器 | 轮次×agent 数，token 线性放大 | 互相附和趋同；说服力≠正确 | 有"看完再答"的轮次 |
| 评审 critic | 生成者+评审者闭环〔文档〕 | propose→review→(reject→propose)*→accept | 标准明确、可迭代；忌评审与生成同盲点 | 每轮 +1 次评审 | 橡皮图章；无限返工 | 有"打回重做"的边 |
| 投票 voting | 同一任务多次独立执行后聚合〔文档〕 | ask*→vote→commit | 答案离散、错误近似独立；忌错误相关 | k×token，可并行 | 多数暴政；k 不足是噪声 | 无相互可见，只末端聚合 |
| 共识 consensus | 多轮直至超多数同意；会议式 | propose*→vote*→commit | 需共同承诺；忌时间敏感/有客观答案 | 轮次下界高；最慢成员决定 | 假共识（沉默=同意）；少数被压制 | 终止条件=同意比例 |
| 仲裁 arbitration | 第三方裁决冲突；三角 | inform(争议)→review→commit(裁决) | 两方无法自行收敛；忌规则可自动判定 | +1 裁判，一次 | 裁判偏见、被上下文污染 | 有终局且不可上诉 |
| 集成 ensemble | 多层聚合，每层读上一层全部输出〔文档〕 | ask*→inform(全部输出)→commit | 质量优先；忌延迟敏感/需可解释 | 层数×宽度，最贵 | 输出同质化，聚合无增益 | 有"层"且层内互不可见 |
| 角色扮演/SOP | 按角色设定对话或走 SOP 流水线〔文档〕 | inform/propose；delegate(阶段) | 多视角、流程仿真、造数据；忌生产正确性 | 对话轮次，可控 | 角色漂移；SOP 形式化而无效 | 行为由角色而非分解决定 |

### 2.3 B · 无消息流的协调

| 模式 | 定义/拓扑 | 原语 | 适用 · 不适用 | 成本·延迟 | 失败模式 | 判据 |
|---|---|---|---|---|---|---|
| 发布订阅 | 发布者写 topic，订阅者按兴趣收〔文档〕 | subscribe+inform(publish) | 一对多通知、松耦合；忌需回执 | 内存低/跨进程高；扇出放大 | 订阅者 stale；通知风暴 | 发布者不知道谁在听 |
| 黑板 | 共享结构+知识源，谁有能力谁改〔文档〕 | commit(条目)+subscribe+review(控制) | 无固定分解、机会式求解；忌写冲突频繁 | 每次读写+调度；控制组件是瓶颈 | 焦点漂移、条目爆炸、无人收敛 | 靠"谁能改这块" |
| 共享工作区 | 读写同一文件树/库，副作用即协调 | commit(写)+subscribe(watch) | 产物是文件；忌并发写同一文件 | IO+冲突检测 | 覆盖写、孤儿产物 | 共享的是工件 |
| Stigmergy | 个体只改环境，后来者从痕迹推断〔推断〕 | observe+commit（无 ask/inform） | 大规模、个体简单；忌要覆盖/公平 | 单次极低；收敛慢 | 错误痕迹被放大；死循环 | 没人知道还有谁在干 |
| work-stealing/claim | 空闲实例抢任务，租约防重复〔文档〕 | subscribe(队列)+commit(claim) | 同质、量大、实例短命；忌需长上下文 | 调度开销低；续约成本 | 租约过期重复执行；长任务饿死 | 分配由谁先抢到决定 |
| 任务市场 | 工作项挂牌、实例竞价认领 | propose(报价)+accept+commit | 异构实例、成本差异大；忌同质实例 | 竞价开销；防策略行为 | 挑肥拣瘦；低价抢单烂尾 | 认领含价格信号 |
| 合并式并发 | 各写副本，按可交换规则合并〔文档〕 | commit(candidate)+review/merge | 写域可分区、冲突可判定；忌语义冲突 | 合并 CPU/人工仲裁 | 语义冲突被合并掩盖 | 靠合并规则而非对话 |

### 2.4 群体、社会与模拟

| 模式 | 定义/拓扑 | 原语 | 适用 · 不适用 | 成本·延迟 | 失败模式 | 判据 |
|---|---|---|---|---|---|---|
| swarm | 大量简单个体+局部规则，无中心 | observe/act | 搜索、覆盖、鲁棒；忌要审计 | 单体便宜、总量大；收敛慢 | 震荡、局部最优、不可复现 | 无人知道全局目标 |
| 蚁群式分配 | 信息素式痕迹强化好路径 | commit(痕迹)+subscribe | 路径/分配、环境缓变；忌剧变 | 迭代轮次多 | 早熟收敛 | 历史成功改变未来选择 |
| 生成式社会 | 记忆流+反思+计划，交互涌现〔文档〕 | observe/inform+commit(记忆) | 仿真、排练、造数据；忌事实性任务 | agent 数×轮次，很贵 | 记忆污染、人格漂移、不可评估 | 目标是"像"不是"对" |
| 多 agent 社会 | 引入规范、角色、惩罚的长期群体 | 原语集不足（§3.3） | 研究、开放环境；忌工程交付 | 不可控 | 规范漂移、共谋 | 存在制度层 |

### 2.5 人机协作

| 模式 | 定义/拓扑 | 原语 | 适用 · 不适用 | 成本·延迟 | 失败模式 | 判据 |
|---|---|---|---|---|---|---|
| HITL 审批门 | 关键动作前暂停等人，状态需持久化〔文档〕 | escalate+review+accept/reject | 高风险不可逆动作；忌高频低风险 | 人的时延是瓶颈；需幂等 | 橡皮图章；恢复重跑副作用 | 有"是/否"才继续 |
| 影子模式 | 新策略并行跑但不生效，只比对〔文档〕 | inform(旁路)+review | 上线前验证、换模型；忌有副作用 | 双倍推理 | 只比指标不比决策 | 输出不进入生效路径 |
| 人作为成员 | 人占角色位，走同一套原语 | 全部 | 需人的判断与责任；忌人跟不上节奏 | 注意力稀缺 | 上下文不同步；责任不清 | 人与 agent 同通道 |

### 2.6 组织形态与时间形态

| 形态 | 决策权/协调 | 代价 | 典型失败 | 判据 |
|---|---|---|---|---|
| 层级 | 顶部决策、逐层下达 | 延迟随深度线性 | 信息失真、中层只转发 | 有唯一老板 |
| 矩阵 | 职能线+项目线双汇报 | 协商成本×2，最高 | 责任冲突、决策悬空 | 一人两个上级 |
| 市场 | 价格/内部结算 | 竞价与防策略成本 | 短期化、挑单 | 有结算价 |
| 社区 | 声誉与规范 | 共识维护成本 | 搭便车、多数沉默 | 无固定上级 |

| 时间形态 | 含义 | 代价 | 典型失败 | 判据 |
|---|---|---|---|---|
| 同步 | 全等待后一起推进 | 延迟=最慢者 | 木桶、超时雪崩 | 有全局 barrier |
| 异步 | 消息队列/事件驱动 | 一致性弱、需幂等 | 乱序、重复、stale | 无全局 barrier |
| 长驻 | 实例常驻、反复领任务 | 失效与重载成本 | 用旧记忆做新判断 | 实例跨任务存活 |
| 会议式 | 固定轮次多方会谈 | 轮次成本 | 形式化 | 有议程与轮次上限 |

### 2.7 协议层：只讲差异与代价

| 协议 | 解决什么 | 关键差异 | 代价 |
|---|---|---|---|
| FIPA ACL | performative + 心智状态语义（inform/request/propose/accept-proposal） | 把"意图"写进消息类型 | 语义与实现都重；无共享记忆概念。fipa.org 本次 403，按〔推断〕 |
| MCP | 工具与上下文接入，client-server〔文档〕 | 只做 context exchange，不管编排 | 用它承载协作会丢角色与预算 |
| Google A2A | 以 task 为中心（SendMessage/GetTask/Cancel/Subscribe）+ AgentCard 发现〔文档〕 | 跨组织、peer 委派、异步 | 服务边界/鉴权/网络；单机过重（对齐 14 §11.3） |
| OpenAI handoff | handoff 作为 tool 转移控制权〔文档〕 | 接收者默认继承全部历史；单 run 内；guardrails 只覆盖首尾 | 历史污染、责任真空、跨 run 断链 |
| LangGraph | StateGraph+共享 state+reducer+Send+interrupt〔文档〕 | 图与状态显式、可恢复 | state schema 即隐式契约；interrupt 恢复从节点头重跑→副作用须幂等 |

## 3. 统一原语映射

### 3.1 十一个原语

| 原语 | 含义 | 主要出现在 |
|---|---|---|
| ask | 请求信息或动作 | supervisor、contract net |
| inform | 单向告知（可广播） | pipeline、handoff |
| propose | 提出方案/报价 | debate、市场 |
| accept/reject | 接受/拒绝（可带理由） | 投标、评审、共识 |
| commit | 落库或承诺（写候选、签约、认领） | 黑板、claim |
| review | 对产出做判定 | critic、审批门 |
| vote | 表决 | 投票、共识 |
| delegate | 委派任务并转移授权 | handoff、SOP |
| escalate | 上报，转移决策权 | 审批门、升级 |
| subscribe | 对某作用域变更感兴趣 | pub-sub、黑板、claim |

派生：`publish = inform(broadcast, scope)`；`claim = subscribe + commit(lease)`。

### 3.2 模式 = 原语序列 + 角色 + 共享范围 + 预算

`模式 = ⟨P 原语序列, R 角色集, S 共享范围, B 预算⟩`

- 层级：`⟨[delegate,(ask|inform)*,review,commit], {lead,worker*}, 任务视图, fan-out≤k⟩`
- contract net：`⟨[ask(公告),propose*,accept/reject*,commit,inform], {manager,bidder*}, 任务公告板, 投标轮次≤r⟩`
- 黑板：`⟨[commit(条目),subscribe,review(控制)], {知识源*,控制}, 黑板, 条目预算⟩`——**没有 ask**：黑板里没人"被问"，只有人"恰好看到"。

用处：任何模式都落到同一组字段；缺 `B` 就无法判断何时该停。

### 3.3 这组原语表达不了的

1. **无接收者的协调**：stigmergy 没有 ask/inform，只有改环境与偶然观察；原语集默认有 sender/receiver。
2. **联合承诺**：团队整体承诺而非两两承诺；缺 team-level commit 与违约追责。
3. **规范/制度层**：义务、禁止、惩罚、角色权利；只能硬编码进角色，不能协商。
4. **连续控制**：swarm 的梯度/势场不是离散消息。
5. **声誉与信任**：vote 只是一次性评价，表达不了带衰减、可传递的信誉。

## 4. 选择矩阵与反模式

| 任务特征 | 推荐 | 理由 |
|---|---|---|
| 可分解、低耦合、可并行写 | orchestrator-workers / B 层 fan-out | 并行度换时延，收益可测 |
| 可分解但接口未定 | 先单线程定契约再 fan-out | 接口并行讨论必生冲突假设〔文档〕 |
| 高耦合（同文件/同上下文） | 单 agent，或 claim+单写者 | 共享上下文是 fan-out 反条件〔文档〕 |
| 可验证（测试/评分器） | critic / evaluator-optimizer | 有验证器时别让 agent 自证 |
| 不可验证且高风险 | debate+审批门；或影子模式 | 用结构与人的判断替代"自信" |
| 时延敏感 | pipeline / router | 避开 debate、共识、集成 |
| 成本敏感 | 单 agent + 路由 | 15× 是量级参照〔文档〕 |
| 需多方共识 | 会议式共识+仲裁+人类终裁 | 共识买的是承诺，不是正确 |
| 同质、量大、可抢占 | claim/work-stealing+短命实例 | 分配靠抢，不靠中心 |
| 能力异构需发现 | contract net / AgentCard 路由 | 先发现能力再派单 |

**反模式**：①用多 agent 掩盖规格不清；②简单任务 fan-out（早期为简单 query 起 50 个子 agent〔文档〕）；③让 agent 互相对话定接口/风格；④并行写同一记忆或文件；⑤无验证器的投票；⑥对可验证问题用辩论；⑦拿黑板当权限边界（黑板不是 ACL）；⑧长驻实例+实时订阅却不做失效；⑨同步等待全部子 agent；⑩把 handoff 当协作。

## 5. 对司墨的两条含义（供参考，不是方案）

1. **判据先行**：A 层只在"接口未定/需协商/需审阅"时启用，默认 B；V1 直接对话是 A 子集，不能侵蚀 B 的不变量（单写者、候选合并、租约）。
2. **预算是模式的一等参数**（fan-out、轮次、token 上限）；"记忆即黑板"需补变更通知（订阅/唤醒）与失败归因（哪条记忆导致错误）。模板角色/通用角色=短生命周期/长驻，矩阵形态成本最高。

## 6. 未核实与不确定

- **FIPA ACL**：fipa.org 403，未一手核实（按〔推断〕）。
- **组织形态**（层级/矩阵/市场/社区）对照无一手来源，本文归纳。
- **stigmergy 用于 LLM agent** 无实证一手来源；术语仅核实条目元数据。
- **成本/延迟**：仅 Anthropic 单家数字（15×/4×、80%），延迟只有相对量级，未实测。

## 7. 参考 URL

1. Anthropic 多 agent 研究系统（15×、4×、80%、同步瓶颈、产物落盘）：https://www.anthropic.com/research/multi-agent-research-system
2. Anthropic《Building effective agents》：https://www.anthropic.com/research/building-effective-agents
3. Cognition《Don't Build Multi-Agents》：https://cognition.com/blog/dont-build-multi-agents
4. MAST《Why Do Multi-Agent LLM Systems Fail?》：https://arxiv.org/abs/2503.13657
5. OpenAI Agents SDK Handoffs：https://openai.github.io/openai-agents-python/handoffs/
6. LangGraph Workflows & agents（Send、共享 state reducer）：https://docs.langchain.com/oss/python/langgraph/workflows-agents
7. LangGraph Interrupts（暂停/恢复、节点重跑、幂等）：https://docs.langchain.com/oss/python/langgraph/interrupts
8. MCP 架构（client-server、只管 context exchange）：https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
9. A2A 规范（SendMessage/GetTask/Cancel/Subscribe、AgentCard）：https://a2a-protocol.org/latest/specification/
10. 协议综述 MCP/ACP/A2A/ANP：https://arxiv.org/abs/2505.02279
11. Nii 1986 黑板模型（HEARSAY-II）：https://ojs.aaai.org/aimagazine/index.php/aimagazine/article/view/537
12. Smith 1980 Contract Net（DOI 10.1109/TC.1980.1675516）：https://doi.org/10.1109/TC.1980.1675516
13. Gerkey & Matarić 2004 任务分配分类（DOI 10.1177/0278364904045564）：https://doi.org/10.1177/0278364904045564
14. Eugster et al. 2003 发布订阅综述（DOI 10.1145/857076.857078）：https://doi.org/10.1145/857076.857078
15. Blumofe & Leiserson 1999 work stealing（DOI 10.1145/324133.324234）：https://doi.org/10.1145/324133.324234
16. Shapiro et al. 2011 CRDT（RR-7687）：https://inria.hal.science/inria-00609399
17. Theraulaz & Bonabeau 1999 A Brief History of Stigmergy（DOI 10.1162/106454699568700）：https://doi.org/10.1162/106454699568700
18. Du et al. 2023 多 agent 辩论：https://arxiv.org/abs/2305.14325
19. Irving et al. 2018 AI safety via debate：https://arxiv.org/abs/1805.00899
20. Wang et al. 2022 Self-Consistency：https://arxiv.org/abs/2203.11171
21. Wang et al. 2024 Mixture-of-Agents：https://arxiv.org/abs/2406.04692
22. Shazeer et al. 2017 稀疏 MoE：https://arxiv.org/abs/1701.06538
23. Fedus et al. 2021 Switch Transformer：https://arxiv.org/abs/2101.03961
24. Park et al. 2023 Generative Agents：https://arxiv.org/abs/2304.03442
25. Li et al. 2023 CAMEL：https://arxiv.org/abs/2303.17760
26. Qian et al. 2023 ChatDev：https://arxiv.org/abs/2307.07924
27. Hong et al. 2023 MetaGPT：https://arxiv.org/abs/2308.00352
28. Wu et al. 2023 AutoGen：https://arxiv.org/abs/2308.08155
29. Fourney et al. 2024 Magentic-One：https://arxiv.org/abs/2411.04468
30. AWS SageMaker Shadow tests：https://docs.aws.amazon.com/sagemaker/latest/dg/shadow-tests.html
31. FIPA ACL 规范（本次 403，未一手核实）：http://www.fipa.org/specs/fipa00061/SC00061G.html

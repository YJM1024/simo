# 产品发现与定义：业界方法调研（给司墨开发框架的依据）

> 调研日期：2026-11-12。方法：`web_search` + `web_fetch` 实际查证；标注 **[已核验]** 表示本次抓取到页面正文并据其归纳，**[未验证]** 表示只检索到入口链接、未逐页核验正文或细节。
> 用途：为司墨「产品流程 + 规范/skill」提供可落地依据；不堆概念，每节落到"采纳/不采纳 + 理由"。
> 范围限定：产品发现与定义（Shape Up / JTBD / PR/FAQ / 四风险 / Lean Startup）。

## 0. 结论先行（给司墨的推荐骨架）

一个小团队/单人 + AI 的产品，最合适的不是全盘照搬某一套，而是**四段式**：

1. **发现（能否做）**：JTBD 一句话问题 + Cagan 四风险快速判定（价值/可用/可行/商业），目的只是"该不该进入 shaping"。
2. **定义（做多大）**：Shape Up 的 **appetite（固定时间、可变范围）+ pitch（问题/appetite/方案/兔子洞/不做清单）**，替代长 PRD。
3. **校准（给谁看）**：Amazon PR/FAQ 的**逆向写作**只借"新闻稿 + FAQ"两个工件，用于对外/对己的"发布即视角"压力测试，不引入六页纸会议流程。
4. **验证（该不该继续）**：Lean Startup 的**最小可验证假设 + build-measure-learn**，落到司墨的 evals/证据门禁（而非全公司创新会计）。

理由：司墨是"本地个人助理 + 自研框架"的小规模产品，缺的是**范围控制与验收证据**，不缺"战略对齐"文档；因此优先级是 Shape Up（定义/范围）> Cagan 四风险（早期风险）> PR/FAQ（对外叙事）> Lean Startup（假设实验）> JTBD（问题陈述，轻量用）。

---

## 1. 逐来源评估

### 1.1 Shape Up（Basecamp / 37signals，Ryan Singer）

- 链接：<https://basecamp.com/shapeup> （免费在线书，可购买纸质版）
- 作者/组织：Ryan Singer（37signals/Basecamp）
- 许可证：页面版权 © 37signals LLC；**未标注开源许可**，正文可在线阅读，不可照抄再发布 **[已核验（版权行）]**；细节条款 **[未验证]**
- 成熟度：2019 年出版，广泛传播的成熟方法；有完整目录与术语表（Appetite、Bet、Pitch、Circuit breaker、Hill chart 等）**[已核验]**
- 适用场景：小团队做"值得做且能在一个周期内交付"的产品工作；范围易膨胀、反复延期、backlog 越堆越多的团队
- 核心要素（据目录/术语表）：
  - **Shaping**：把抽象想法做成"粗略（rough）、已解决（solved）、有边界（bounded）"的方案，手段为 breadboard / fat marker sketch；输出不是可交付规格
  - **Appetite**：先定"愿意花多少时间"，而非估算；**fixed time, variable scope**
  - **Betting table + six-week cycles + cool-down**：以"下注"代替 backlog 排期；**circuit breaker**：一个周期没交付就默认取消而不是默认延期
  - **Pitch 五要素**：Problem / Appetite / Solution / Rabbit holes / No-gos **[已核验（目录）]**
  - **执行侧**：assign projects not tasks；scope map；hill chart 表示" uphill（未知未解）/ downhill（只剩执行）"；scope hammering 砍范围
- 优点：直接对抗"范围膨胀 + 估算失效 + 无限延期"；pitch/no-gos 让"不做什么"显式；不需要重型流程工具
- 缺点：六周周期与 cool-down 对单人/极小团队偏重（书中附录承认需按团队规模调整）；对"必须持续响应线上/客户"的团队不友好；shaping 需要资深判断力，容易变成"换个名字的详细设计"
- 对司墨：**采纳核心两件**——appetite + pitch（含 rabbit holes / no-gos）作为"里程碑定义模板"；**不采纳**六周周期/cool-down 的固定日历（改为按里程碑/发布节奏），**不采纳**betting table 会议（单人无此结构）。理由：我们缺的是范围控制模板，不是组织节奏。

### 1.2 Jobs-to-be-Done（Christensen Institute / Tony Ulwick、Bob Moesta 等）

- 链接：<https://www.christenseninstitute.org/theory/jobs-to-be-done/> **[检索到，未逐页核验正文]**
- 作者/组织：Clayton Christensen 提出理论框架；实践分支包括 Bob Moesta（Switch/需求侧访谈）、Tony Ulwick（Outcome-Driven Innovation）
- 许可证：机构网站文章版权归 Christensen Institute；无开源许可 **[未验证]**
- 成熟度：理论成熟、流派多（"jobs"定义在不同分支差异大），实践方法（switch interview、job map）成熟
- 适用场景：判断"用户为什么换/不换"；在方案之前锁定问题与进步（progress）；避免把"功能请求"当需求
- 优点：把需求从"功能清单"拉回"用户想完成的事/进步"；switch interview 对流失/采纳分析很有效
- 缺点：概念歧义大（不同作者定义不同）；不能直接产出验收标准；做严肃 JTBD 研究成本高（访谈、招募）
- 对司墨：**轻量采纳**——每个需求/变更先写一句"job statement"（When/ I want to / so I can）进入 spec 的 goal 字段；**不采纳**完整 switch interview/量化 job map 流程（成本不匹配）。理由：一句话 JTBD 就能显著改善需求陈述质量，重流程收益低。

### 1.3 Amazon PR/FAQ（Working Backwards）

- 链接：<https://www.aboutamazon.com/news/workplace/an-insider-look-at-amazons-culture-and-processes>（Amazon 官方介绍 Working Backwards 的公开文章，提到 PR/FAQ 与六页纸）**[检索到，未逐页核验 PR/FAQ 细节]**；《Working Backwards》作者 Colin Bryar & Bill Carr（书籍入口 **[未验证]**）
- 作者/组织：Amazon（方法）；Bryar & Carr（书）
- 许可证：Amazon 文章版权；方法本身无许可证（不可复制原文）；**[未验证]**
- 成熟度：企业级成熟方法；PR/FAQ 是 Amazon 内部标准工件
- 适用场景：需要"以终为始"检验价值假设；对外发布/对内立项前的叙事与 FAQ 压力测试
- 优点：强迫写"用户会看到什么"，暴露价值主张空洞；FAQ 逼出"为什么现在/成本/替代方案/风险"
- 缺点：企业语境重（六页纸评审会、跨部门对齐），小团队照搬会变成八股；PR/FAQ 容易写成营销稿而非决策文档
- 对司墨：**只采纳工件、不采纳会议/六页纸制度**——对外发布/大版本前写 1 页 PR + 1 页 FAQ（各 ≤1 页），作为"里程碑叙事门禁"；日常小改动不写。理由：叙事压力测试有价值，但从"1 页"变成"6 页 + 评审会"对小团队是负担。

### 1.4 Cagan 四风险（SVPG，Marty Cagan）

- 链接：<https://www.svpg.com/four-big-risks/> **[已核验正文]**
- 作者/组织：Marty Cagan / Silicon Valley Product Group
- 许可证：SVPG 网站版权；文章可引用，不可整篇转载 **[未验证（条款）]**
- 成熟度：成熟（《INSPIRED》第二版核心内容）；被广泛引用
- 关键内容（原文归纳）：风险四类——**value risk**（用户是否买/用）、**usability risk**（用户能否学会用）、**feasibility risk**（工程能否在时间/技能/技术内做出来）、**business viability risk**（是否符合商业模式/渠道/合同/合规/获客成本/品牌承诺）；**PM 负责 value+viability，产品设计师负责 usability，产品技术负责人负责 feasibility**；三个原则：**把大风险尽早解决（尤其 value/business）、协作解方案、以问题/结果而非功能路线图为导向** **[已核验]**
- 适用场景：立项与排期前的风险判定；决定"先做哪件事/先验证什么"；跨角色责任划分
- 优点：四风险是"最小充分"检查表；把"技术可行但没价值"和"有价值但赔钱"分开暴露；责任明确
- 缺点：是"分类框架"而非流程；AI 辅助开发降低 feasibility 风险后，团队容易低估 value/viability（Cagan 自己在文中强调这点）
- 对司墨：**采纳为 spec 的"风险四问"字段（各 1 行）**，并映射到门禁：value/viability 未答 → 不允许进入 build；feasibility 未答 → 不允许估工期。**不采纳**角色分工（单人产品，一人兼三角色，但要求"分四次自问"）。

### 1.5 Lean Startup（Eric Ries）

- 链接：<http://theleanstartup.com/> **[检索到，未逐页核验]**；书《The Lean Startup》（Crown Business，2011）**[未验证版本细节]**
- 作者/组织：Eric Ries
- 许可证：网站/书版权；方法无开放许可 **[未验证]**
- 成熟度：成熟且被广泛实践（含企业版 Lean Enterprise）；争议点在"创新会计/虚荣指标"被滥用
- 适用场景：不确定性高的新产品/新方向；需要用小实验验证假设、决定 pivot/persevere
- 优点：MVP + build-measure-learn + validated learning；强制"先写假设、再定度量"
- 缺点：MVP 常被曲解为"半成品"；创新会计在小规模下性价比低；容易只优化可度量指标而忽略价值
- 对司墨：**采纳"一条假设 + 一个可验证信号"的写法**，放进里程碑的"验证门禁"（与 evals 挂钩：假设 → 验收断言 → 证据）；**不采纳**完整创新会计/虚荣指标体系。理由：司墨有 evals 体系，天然适合"假设即断言"，无需另一套会计。

---

## 2. 对司墨的采纳建议（模板 / 流程 / 门禁）

### 2.1 模板（3 个，全部 ≤1 页，放 `docs/process/templates/`）

1. **`opportunity.md`（发现卡）**
   - Job statement（1 句：When … I want to … so I can …）
   - 四风险四问（value / usability / feasibility / business viability，各 1 行结论 + 依据）
   - 假设与验证信号（1 条假设 + 如何验证：evals/用户反馈/试用）
2. **`pitch.md`（定义卡，Shape Up 借形）**
   - Problem（现状与代价）
   - Appetite（愿意花的时间/预算，固定；范围可变）
   - Solution（粗略方案：breadboard 级，不写成详细设计）
   - Rabbit holes（明确不碰/需先验证的坑）
   - No-gos（本期不做清单，显式）
3. **`pr-faq.md`（叙事卡，仅大版本/对外）**
   - PR：用户视角 1 段（谁、得到什么、为什么现在）
   - FAQ：为什么现在 / 不做什么 / 成本与风险 / 替代方案 / 如何衡量成功

### 2.2 流程（4 步，映射到司墨里程碑）

`发现（opportunity）→ 定义（pitch）→ 规格（见 spec-driven.md）→ 验证（evals + 证据）→ 归档（PR/FAQ 仅对外版本）`

- 每步都有**退出条件**（见 2.3），不满足不进入下一步。
- 单人产品：发现/定义可合并一次 30 分钟自审，但工件必须落盘（避免"想过了"）。

### 2.3 门禁（最小可执行，不做形式主义）

| 门禁 | 位置 | 判定 |
|---|---|---|
| **G1 发现门禁** | 进入定义前 | job statement 存在；四风险至少 value/feasibility 有结论；否则不排期 |
| **G2 定义门禁** | 进入规格前 | appetite 明确；pitch 五要素齐全（含 no-gos）；rabbit holes 有处置计划 |
| **G3 规格门禁** | 进入实现前 | 验收断言（GWT/结构断言）可执行；见 spec-driven.md |
| **G4 证据门禁** | 宣称完成前 | 验收断言全绿（evals）+ 产物/证据指针；"未验证"项显式列出 |
| **G5 叙事门禁** | 对外发布/大版本 | 1 页 PR + 1 页 FAQ 完成（用户视角通顺、FAQ 有"不做什么"） |

### 2.4 不采纳清单（避免概念堆叠）

- 不搞六周周期/cool-down/ betting table 会议（Shape Up 的组织节奏部分）
- 不做完整 JTBD switch interview 研究流程（只留一句 job statement）
- 不搞六页纸评审会与跨部门 PR/FAQ 流程（只留 1 页工件）
- 不建 Lean Startup 创新会计体系（用 evals 断言代替）

## 3. 未验证与风险

- 上述页面中仅 SVPG 四风险、Shape Up 站、Kiro 文档做了正文抓取；JTBD、PR/FAQ（Amazon 官方页）、Lean Startup、Gherkin、Scrum.org 仅检索到入口，**细节未逐页核验**，已在各项标注。
- 许可证：Shape Up/SVPG/Amazon/Lean Startup 的方法描述均为版权内容，本调研只做摘要与引用，不复制原文；开源许可仅对 GitHub 项目（见 spec-driven.md）核实为 MIT。
- 风险：把 Shape Up 的"appetite"当成"估算"会退化成固定工期；把 JTBD 一句话写成功能名会失去价值；PR/FAQ 写成营销稿会失真。落地时必须保留"no-gos / 不做什么"字段作为刹车。

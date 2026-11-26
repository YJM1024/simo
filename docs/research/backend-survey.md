# 后端开发领域可被 AI 编码智能体执行的框架调研

本报告调研后端开发领域可被 AI 编码智能体执行的框架、规范与技能包，覆盖架构方法、接口契约、数据与迁移、可观测与运行、安全、智能体技能六组共 28 个候选，检索时间为 2026 年 11 月 24 日。资料以官方文档和项目仓库为主，GitHub 仓库页面在本次网络环境下多次超时，涉及 BMAD、Superpowers 与 Spec Kit 的部分细节改用搜索索引和第三方评测页交叉核对，未打开全文的条目在未查清项中列出。结论是接口契约与数据库迁移两类规范最适合做成阻断式门禁，架构方法适合做结构检查加人工评审，智能体技能包需要改写成本地流程文件后才能执行。本报告只做调研，不修改产品代码、spec 与流程文件。

## 一、架构方法（7 个）

1. C4 模型
    - 主张：用系统上下文、容器、组件、代码四级抽象描述架构，另配系统全景、动态、部署三类辅助图，图与代码保持分离（[c4model.com](https://c4model.com/)）。
    - 产出：context 与 container 两张图、元素清单（人、系统、容器、技术选型、协议）、图与仓库模块的对应表。
    - 适用阶段：设计阶段，用于变更影响分析与跨模块边界确认。
    - 可执行性：中，图可以用文本 DSL 生成并检查元素命名与引用完整性，架构合理性仍需人工判断，代价是维护图与目录映射，按每个变更半天估算。

2. 架构决策记录（ADR）
    - 主张：每个重要技术决策写成一页记录，包含上下文、决策、状态与后果，采用 Nygard 模板并持续维护状态（[adr.github.io](https://adr.github.io/)、[Nygard 原文](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)）。
    - 产出：docs/adr 下的编号文件、决策索引、proposed 至 accepted 至 superseded 的状态迁移记录。
    - 适用阶段：设计阶段建立，实现与复盘阶段回填后果。
    - 可执行性：高，模板加脚本可以检查编号唯一、状态合法、必填节齐全以及 design.md 是否引用，决策质量仍靠评审，脚本成本约一百行。

3. Clean Architecture
    - 主张：依赖方向由外向内，实体、用例、接口适配器、框架四层，业务规则不依赖框架与数据库（[Martin 原文](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)）。
    - 产出：分层目录、依赖规则文档、import 边界检查配置、用例层测试。
    - 适用阶段：设计到实现，用于约束模块依赖。
    - 可执行性：中高，dependency-cruiser 与 import-linter 可以把依赖方向写成断言，全套分层会让小服务产生大量转发代码，代价是目录与规则长期维护。

4. Hexagonal Architecture
    - 主张：端口定义业务所需接口，适配器实现数据库、消息、HTTP 等外部交互，业务核心不感知外部技术（[Cockburn 原文](https://alistair.cockburn.us/hexagonal-architecture/)）。
    - 产出：端口接口、适配器包、依赖注入装配、针对适配器的契约测试与 fake。
    - 适用阶段：设计到实现，用于隔离外部依赖。
    - 可执行性：中，目录与命名规则可以脚本检查，端口方法是否覆盖用例需要评审，只有一种存储实现时收益有限。

5. 领域驱动设计的限界上下文
    - 主张：按业务能力与语言边界划分子域和限界上下文，上下文之间用显式映射与防腐层隔离（[Fowler 定义](https://martinfowler.com/bliki/BoundedContext.html)）。
    - 产出：上下文地图、统一语言词表、上下文映射关系、跨上下文调用的防腐层。
    - 适用阶段：需求分析与建域设计，决定模块与服务拆分。
    - 可执行性：低到中，可以检查模块边界与跨上下文直接读库的行为，划分是否合理只能人工评审，代价是领域专家参与的时间。

6. 12-Factor App
    - 主张：配置放环境变量、进程无状态、日志作为事件流、开发与生产同构、依赖显式声明、优雅退出等十二条（[12factor.net](https://12factor.net/)）。
    - 产出：配置样例文件、启动与退出脚本、日志规范、依赖锁文件、端口绑定说明。
    - 适用阶段：实现与运行，作为部署前检查单。
    - 可执行性：高，硬编码密钥、配置读取方式、日志写文件、信号处理都可以脚本检查，开发生产同构这类条款无法自动判定。

7. AWS Well-Architected Framework
    - 主张：从卓越运营、安全、可靠性、性能效率、成本优化、可持续性六个支柱评审架构，给出问题清单与最佳实践（[AWS 文档](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)）。
    - 产出：评审问卷结果、高、中、低风险清单、改进项与责任人。
    - 适用阶段：架构评审与上线前，偏组织级治理。
    - 可执行性：低，问卷式评审无法直接变成断言，可以抽取备份、加密、限流、多可用区等少量检查项，完整评审按人日计。

## 二、接口契约（6 个）

8. OpenAPI 3.1 与 Spectral
    - 主张：以机器可读的 OpenAPI 文档作为接口唯一事实来源，用 Spectral 规则集约束命名、错误响应、分页与安全方案，3.1 系列的最新补丁版为 3.1.1，规范站同时已发布 3.2.x（[OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)、[Spectral](https://github.com/stoplightio/spectral)）。
    - 产出：openapi.yaml、.spectral.yaml 规则集、lint 报告、路由覆盖检查脚本、契约变更 diff。
    - 适用阶段：设计阶段冻结契约，验证阶段比对实现。
    - 可执行性：高，Spectral 提供 CLI 与自定义函数，可按 error 与 warn 分级阻断 CI，路由覆盖需要按框架解析路由表，代价是每个框架写一个适配脚本。

9. protobuf 与 gRPC
    - 主张：用 .proto 定义服务与消息并生成多语言 stub，基于 HTTP/2 支持一元与流式调用，schema 演进有兼容规则（[protobuf](https://protobuf.dev/overview/)、[gRPC](https://grpc.io/docs/what-is-grpc/introduction/)）。
    - 产出：.proto 文件、生成代码、buf 配置、grpcurl 冒烟脚本、兼容性基线。
    - 适用阶段：设计到实现，适合跨语言服务与流式接口。
    - 可执行性：高，buf lint 与 buf breaking 可以直接阻断，单体 HTTP/JSON 项目引入成本高，收益集中在跨语言与流式场景。

10. tRPC
    - 主张：TypeScript 前后端共享类型，过程调用自动推导输入输出类型，不需要代码生成（[trpc.io](https://trpc.io/docs/)）。
    - 产出：router 定义、输入校验 schema、客户端类型、端到端类型测试。
    - 适用阶段：实现阶段，限 TypeScript 全栈同仓项目。
    - 可执行性：中，类型检查本身就是断言，非 TypeScript 后端或跨团队协作无法使用，大版本升级会带来类型破坏。

11. JSON Schema
    - 主张：用 JSON Schema 描述数据结构，支持运行时校验、文档生成与跨语言代码生成，当前常用草案为 2020-12（[json-schema.org](https://json-schema.org/)）。
    - 产出：schema 文件、请求与响应校验中间件、配置 schema、契约测试数据。
    - 适用阶段：设计与实现，用于入参校验和配置校验。
    - 可执行性：高，ajv 一类校验器可以把 schema 变成运行时断言与测试用例，schema 与业务规则的一致性仍需测试覆盖。

12. Pact 消费者驱动契约
    - 主张：消费者测试生成契约文件，提供者回放验证，Broker 记录版本与部署矩阵，用 can-i-deploy 判断能否发布（[Pact 文档](https://docs.pact.io/)）。
    - 产出：pact 文件、消费者测试、提供者验证任务、Broker 中的版本与部署记录。
    - 适用阶段：验证与发布阶段，适合多服务协作。
    - 可执行性：中高，提供者验证可以进 CI，维护 Broker、版本与契约兼容性有持续成本，单团队单体项目收益有限。

13. Provider 契约校验
    - 主张：用 OpenAPI 文档校验提供者的实际响应，用 diff 工具检测破坏性变更，防止文档与实现漂移（[Pact 提供者验证](https://docs.pact.io/implementation_guides/javascript/docs/provider)、[oasdiff](https://github.com/oasdiff/oasdiff)、[Schemathesis](https://schemathesis.readthedocs.io/)）。
    - 产出：响应校验测试、OpenAPI 基线、破坏性变更报告、按 schema 生成的测试用例。
    - 适用阶段：验证与发布阶段。
    - 可执行性：高，oasdiff 的 breaking 检查可以阻断 CI，Schemathesis 可以基于 schema 生成用例，前提是基线稳定且测试环境可重复。

## 三、数据与迁移（4 个）

14. 迁移版本化（golang-migrate、Atlas）
    - 主张：迁移文件按版本号排序、成对提供 up 与 down、数据库记录 schema 版本，禁止手工改库（[golang-migrate](https://github.com/golang-migrate/migrate)、[Atlas](https://atlasgo.io/)）。
    - 产出：migrations 目录下的成对 SQL、atlas.hcl、迁移计划、lint 报告、dirty 状态检查。
    - 适用阶段：实现与发布阶段。
    - 可执行性：高，golang-migrate 可以检查版本与 dirty 状态，Atlas 支持声明式与版本化两种工作流并能提示数据丢失、锁表与破坏性变更，代价是迁移评审与回滚演练。

15. expand/contract 迁移法
    - 主张：破坏性 schema 变更拆成扩展、双写与回填、切换读、收缩四步，保证旧代码与新代码在发布窗口内共存（[ParallelChange](https://martinfowler.com/bliki/ParallelChange.html)、[Prisma 指南](https://www.prisma.io/docs/guides/v7/database/data-migration)）。
    - 产出：分阶段迁移清单、回填脚本、兼容期与删除条件、回滚点说明。
    - 适用阶段：设计与发布阶段，针对删列、改类型、拆表。
    - 可执行性：中，可以检查同一版本内是否删列、是否带回收脚本与删除前置条件，兼容期长度需要人工确定，代价是发布次数增加。

16. 幂等键
    - 主张：客户端为写请求生成唯一键，服务端持久化键与结果，重复请求返回同一结果（[IETF Idempotency-Key 草案](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)）。
    - 产出：Idempotency-Key 请求头、键与结果表、唯一索引、过期清理任务、重放测试。
    - 适用阶段：设计到验证阶段，覆盖下单、支付、创建资源一类接口。
    - 可执行性：高，可以写并发重复提交测试并断言只产生一条记录，草案尚未成为正式标准，键的作用域与冲突语义需要项目自行约定。

17. 事务与并发控制
    - 主张：用唯一索引兜底唯一性，用乐观锁版本号检测并发修改，明确事务边界与隔离级别（[Optimistic Offline Lock](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html)）。
    - 产出：唯一约束迁移、version 列、409 冲突响应、并发测试、死锁监控。
    - 适用阶段：设计与实现阶段。
    - 可执行性：高，并发测试可以断言两个请求一成一败、重复插入返回冲突，长事务与死锁需要运行期监控补充。

## 四、可观测与运行（4 个）

18. 结构化日志
    - 主张：日志写成 JSON 事件，固定时间、级别、服务、trace_id、request_id、事件名等字段，不记录敏感数据（[OWASP 日志备忘单](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)）。
    - 产出：日志字段规范、logger 封装、字段检查脚本、采样与保留策略。
    - 适用阶段：实现与运行阶段。
    - 可执行性：高，测试可以断言输出为 JSON 且必填字段齐全，敏感字段识别需要规则与评审，规则误报要持续维护。

19. OpenTelemetry
    - 主张：用统一 API 与 SDK 采集 traces、metrics、logs，通过 OTLP 导出，语义约定统一属性命名（[OpenTelemetry 文档](https://opentelemetry.io/docs/)）。
    - 产出：instrumentation 初始化、span 命名规范、Collector 配置、trace 上下文传播测试。
    - 适用阶段：实现与运行阶段。
    - 可执行性：中高，可以断言关键路径产生 span 且父子关系正确，Collector 与存储有运维成本，初期可以只做 trace_id 贯穿。

20. 健康检查与就绪探针
    - 主张：liveness 判断进程是否需要重启，readiness 判断是否可以接收流量，startup 保护慢启动过程（[Kubernetes 文档](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)）。
    - 产出：/healthz 与 /readyz 端点、探针配置、依赖检查超时与阈值。
    - 适用阶段：实现与部署阶段。
    - 可执行性：高，可以写测试断言依赖故障时 readyz 返回 503 且 healthz 保持 200，探针阈值需要按实际启动时间调整。

21. SLO 与错误预算
    - 主张：为关键用户旅程定义 SLI、SLO 目标与错误预算，预算耗尽时冻结发布（[Google SRE 手册](https://sre.google/sre-book/service-level-objectives/)）。
    - 产出：SLI 公式、SLO 文档、燃尽告警、发布冻结规则、月度复盘。
    - 适用阶段：运行与发布治理阶段。
    - 可执行性：中，SLI 计算可以脚本化，目标值与冻结策略需要人工决定，缺少真实流量时只能先落文档模板。

## 五、安全（4 个）

22. OWASP ASVS
    - 主张：按三个验证等级给出可测试的安全要求，覆盖编码、校验、认证、授权、日志等章节，当前稳定版为 5.0.0（[ASVS](https://asvs.dev/)、[V4 API 与 Web 服务](https://asvs.dev/v5.0.0/V4-API-and-Web-Service/)）。
    - 产出：ASVS 条目映射表、验证清单、测试用例、差距报告。
    - 适用阶段：设计与验证阶段。
    - 可执行性：中高，条目可以逐条映射到测试或检查项，全部自动化不现实，通常选 L1 与 L2 子集，映射表需要随版本维护。

23. 鉴权与越权检查
    - 主张：每次资源访问都判断主体、动作与资源，服务端强制执行并默认拒绝（[ASVS V8 授权](https://asvs.dev/v5.0.0/V8-Authorization/)、[OWASP Top 10](https://owasp.org/Top10/)）。
    - 产出：授权中间件、资源属主校验、IDOR 测试用例、403 与 404 的返回策略。
    - 适用阶段：设计与验证阶段。
    - 可执行性：高，可以为每个资源端点生成访问他人资源的用例并断言 403 或 404，复杂 RBAC 与 ABAC 组合需要人工设计权限矩阵。

24. 最小权限
    - 主张：主体、服务账号与数据库账号只授予完成任务所需的权限，并定期复核（[NIST 术语](https://csrc.nist.gov/glossary/term/least_privilege)）。
    - 产出：权限矩阵、数据库角色、令牌 scope、云 IAM 策略、复核记录。
    - 适用阶段：设计与部署阶段。
    - 可执行性：中，可以扫描配置中的通配符权限与超级账号，权限是否最小需要结合业务评审。

25. 审计日志
    - 主张：对认证、授权、管理操作与敏感数据访问记录操作者、时间、动作、对象与结果，保证可检索与防篡改（[OWASP 日志备忘单](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)）。
    - 产出：审计事件清单、字段规范、落库表、保留期与访问控制。
    - 适用阶段：设计与运行阶段。
    - 可执行性：中高，可以测试关键操作产生审计记录且字段齐全，覆盖面与防篡改依赖评审和基础设施支持。

## 六、智能体技能（3 个）

26. BMAD 架构师角色
    - 主张：架构师智能体基于 PRD 产出 architecture.md，校验 PRD、UX、架构与史诗的一致性，并在实现前做 readiness 检查（[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)）。
    - 产出：architecture.md、技术决策、与 PRD 的追溯、实现就绪报告。
    - 适用阶段：设计阶段。
    - 可执行性：中，模板与检查单可以直接借用，多角色编排与现有流程重叠，产物是自然语言，无法直接写成断言。

27. Spec Kit 的 plan 模板
    - 主张：写代码前生成实现计划，包含技术上下文、宪章检查、项目结构、阶段 0 研究与阶段 1 设计与契约（[spec-kit](https://github.com/github/spec-kit)、[plan 模板](https://github.com/github/spec-kit/blob/main/templates/plan-template.md)）。
    - 产出：plan.md、research.md、data-model.md、contracts 目录、quickstart.md。
    - 适用阶段：设计阶段。
    - 可执行性：高，章节齐全性可以脚本检查，内容质量靠评审，与现有 design.md 合并可以避免重复文档。

28. Superpowers 的调试与 TDD 技能
    - 主张：强制 RED、GREEN、REFACTOR 循环，先写失败测试；系统化调试要求先复现与定位根因再修改；技能以 Markdown 流程文件分发（[superpowers](https://github.com/obra/superpowers)）。
    - 产出：失败测试、最小实现、重构记录、根因说明、可复用的技能文件。
    - 适用阶段：实现与排障阶段。
    - 可执行性：高，可以检查测试是否先于实现、失败输出是否存在、修复后回归是否通过，强制程度依赖流程约束与评审。

## 七、对比表

| 候选 | 主要产物 | 适用阶段 | 可自动化程度 | 是否采纳 |
|---|---|---|---|---|
| C4 模型 | context 与 container 图 | 设计 | 中，图可校验、合理性靠评审 | 部分采纳 |
| ADR | 决策记录与索引 | 设计、复盘 | 高，模板与字段可检查 | 采纳 |
| Clean Architecture | 分层目录与依赖规则 | 设计、实现 | 中高，依赖方向可断言 | 部分采纳 |
| Hexagonal | 端口与适配器 | 设计、实现 | 中，边界可查、覆盖靠评审 | 部分采纳 |
| DDD 限界上下文 | 上下文地图与词表 | 需求、设计 | 低，划分靠人工 | 采纳 |
| 12-Factor | 配置与运行检查单 | 实现、运行 | 高，多数条款可脚本检查 | 部分采纳 |
| AWS Well-Architected | 六支柱评审与风险清单 | 设计评审、上线 | 低，问卷式 | 部分采纳 |
| OpenAPI 与 Spectral | 契约、规则集、lint 报告 | 设计、验证 | 高，可阻断 CI | 采纳 |
| protobuf 与 gRPC | proto、生成代码、兼容基线 | 设计、实现 | 高，buf 可阻断 | 暂缓 |
| tRPC | router 与共享类型 | 实现 | 中，类型检查即断言 | 不采纳 |
| JSON Schema | schema 与校验中间件 | 设计、实现 | 高，运行时与测试可用 | 采纳 |
| Pact | pact 文件与验证任务 | 验证、发布 | 中高，需 Broker | 部分采纳 |
| Provider 契约校验 | 响应校验与破坏性报告 | 验证、发布 | 高，diff 可阻断 | 采纳 |
| 迁移版本化 | 成对迁移与 lint 报告 | 实现、发布 | 高，可检查与演练 | 采纳 |
| expand/contract | 分阶段迁移清单 | 设计、发布 | 中，规则可查、周期靠人 | 采纳 |
| 幂等键 | 键表与重放测试 | 设计、验证 | 高，并发用例可断言 | 采纳 |
| 事务与并发 | 唯一约束、版本列、409 | 设计、实现 | 高，并发用例可断言 | 采纳 |
| 结构化日志 | 字段规范与检查脚本 | 实现、运行 | 高，格式可测 | 采纳 |
| OpenTelemetry | instrumentation 与 span 规范 | 实现、运行 | 中高，链路可测 | 部分采纳 |
| 健康检查与探针 | healthz 与 readyz | 实现、部署 | 高，语义可测 | 采纳 |
| SLO 与错误预算 | SLI 公式与冻结规则 | 运行、治理 | 中，计算可脚本化 | 部分采纳 |
| OWASP ASVS | 条目映射与差距报告 | 设计、验证 | 中高，子集可映射 | 采纳 |
| 鉴权与越权检查 | 授权中间件与 IDOR 用例 | 设计、验证 | 高，用例可生成 | 采纳 |
| 最小权限 | 权限矩阵与角色配置 | 设计、部署 | 中，配置可扫描 | 采纳 |
| 审计日志 | 事件清单与字段规范 | 设计、运行 | 中高，字段可测 | 采纳 |
| BMAD 架构师角色 | architecture.md 与就绪报告 | 设计 | 中，结构可查、内容靠评审 | 部分采纳 |
| Spec Kit plan 模板 | plan.md 与配套文档 | 设计 | 高，章节可查 | 部分采纳 |
| Superpowers 调试与 TDD | 失败测试与根因说明 | 实现、排障 | 高，流程顺序可查 | 部分采纳 |

## 八、可吸收进自建框架的 6 条

1. 把 OpenAPI 契约做成设计阶段的阻断门禁
    - 改什么：design.md 增加接口契约节，openapi.yaml 作为唯一来源；固定 Spectral error 级规则，覆盖 operationId 唯一、4xx 与 5xx 响应、security 声明、分页参数；增加路由覆盖脚本与 oasdiff 破坏性变更检查。
    - 放在哪一步：Design Ready 门禁与 Verify 门禁，对应现有框架的接口摘要与路由覆盖检查。
    - 怎么判有效：新增或修改的端点全部出现在 openapi.yaml，Spectral error 为 0，oasdiff 对主分支无 breaking 变更，脚本退出码非 0 时阻断合并，连续两个变更无契约漂移告警。

2. 给数据库迁移加安全门禁
    - 改什么：迁移目录规范加 Atlas lint 或 golang-migrate 校验，引入 expand/contract 检查单，禁止同一版本删列或改类型，增加影子库回滚演练。
    - 放在哪一步：Design Ready 审查迁移方案，Verify 在影子库执行 up 与 down。
    - 怎么判有效：每个迁移都有成对 up 与 down 且 down 可执行，lint 无数据丢失与锁表高风险项，破坏性变更拆成至少两个版本，回滚演练一次通过并留下日志。

3. 在任务卡与测试计划里固定并发与幂等断言
    - 改什么：tasks.md 与 test-plan.md 增加唯一约束、乐观锁、幂等键、事务边界四栏，每个写端点至少一条重复提交或并发用例。
    - 放在哪一步：Tasks Ready 冻结判据，Verify 执行用例。
    - 怎么判有效：写端点用例覆盖率 100%，并发测试稳定复现一成一败，重复请求返回同一资源标识，数据库存在对应唯一索引。

4. 把 ADR 与 C4 收敛成设计产物的结构检查
    - 改什么：design.md 必须引用至少一条 ADR，ADR 模板固定上下文、决策、状态、后果、替代方案五节，C4 只保留 context 与 container 两张文本图，节点名与仓库模块名对应。
    - 放在哪一步：Design Ready。
    - 怎么判有效：脚本检查 ADR 编号唯一、状态合法、五节齐全，design.md 存在链接，C4 图节点覆盖全部部署单元，评审只判断决策合理性与图是否失真。

5. 把可观测性做成上线前检查单
    - 改什么：日志字段规范固定 JSON 格式与 trace_id、request_id，定义 /healthz 与 /readyz 语义，约定 OTel span 命名，补 SLO 文档模板。
    - 放在哪一步：Verify 与上线前检查。
    - 怎么判有效：依赖故障时 readyz 返回 503 且 healthz 返回 200，日志断言必填字段齐全，关键链路产生父子 span，SLO 文档包含 SLI 公式与错误预算阈值。

6. 把安全要求拆成 ASVS 子集与越权用例
    - 改什么：从 ASVS 5.0.0 选取 L1 与 L2 子集，覆盖校验、API、认证、授权、日志五章，映射到测试；每个资源端点生成访问他人资源的用例；补审计事件清单。
    - 放在哪一步：Design Ready 做威胁与权限矩阵，Verify 执行用例。
    - 怎么判有效：映射表覆盖选定条目且每条有测试或人工判据，IDOR 用例对每个资源端点返回 403 或 404，审计日志字段齐全，未映射条目数为 0。

## 九、不适合直接搬的 3 条

1. 全套 Clean Architecture 与 Hexagonal 分层落地
    - 原因：目录与接口层数量翻倍，AI 容易生成只做转发的空壳代码，单体服务只有一种存储实现时端口没有替换价值，维护成本高于收益。可保留依赖方向检查与模块边界规则，去掉强制四层目录。

2. AWS Well-Architected 全套六支柱评审
    - 原因：问卷面向云上架构与组织治理，条目无法直接转成断言，一次完整评审按人日计，单人项目没有足够样本。可抽取可靠性、安全性、成本三类检查项并入上线检查单。

3. BMAD 全角色编排
    - 原因：十几个角色与多份文档同现有 Spec-Driven 流程重叠，AI 执行会重复产出 PRD 与架构文档，状态同步与追溯成本高。可只借架构师角色的实现就绪检查单，并入 Design Ready 评审。

## 十、结论

适合做成门禁脚本的是可判定的部分：OpenAPI lint 与路由覆盖、oasdiff 破坏性检查、迁移 up 与 down 执行与回滚演练、迁移 lint、并发与幂等用例、健康端点语义、日志字段断言、IDOR 用例。这些检查有明确退出码，失败即阻断合并，脚本维护成本集中在路由解析与测试环境稳定性。

适合做成模板的是结构固定的文档：ADR、C4 的 context 与 container、design.md 的契约与数据节、SLO 文档、任务卡的并发与安全断言栏、ASVS 映射表。模板只保证字段齐全，内容质量仍要评审。

依赖人工评审的是判断类工作：限界上下文划分、架构权衡、威胁建模、SLO 目标设定、审计事件覆盖范围、权限矩阵设计。现有框架已在后端节采纳 ADR、C4 与 OpenAPI 路由覆盖（[FRAMEWORK.md](../process/FRAMEWORK.md)），本次增量是把这些从建议改成 Design Ready 与 Verify 的可执行判据。

## 十一、来源

1. [c4model.com](https://c4model.com/)，C4 模型官方站点，四级抽象与辅助图。
2. [adr.github.io](https://adr.github.io/)，ADR 格式与工具索引。
3. [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)，Nygard 的 ADR 原始文章。
4. [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)，依赖方向与四层结构。
5. [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)，端口与适配器原文。
6. [BoundedContext](https://martinfowler.com/bliki/BoundedContext.html)，限界上下文定义。
7. [The Twelve-Factor App](https://12factor.net/)，十二条方法。
8. [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)，六支柱与评审方法。
9. [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)，接口描述规范。
10. [Spectral](https://github.com/stoplightio/spectral)，OpenAPI 规则检查工具。
11. [Protocol Buffers](https://protobuf.dev/overview/)，protobuf 语言指南。
12. [gRPC Introduction](https://grpc.io/docs/what-is-grpc/introduction/)，gRPC 概念与调用形态。
13. [tRPC Docs](https://trpc.io/docs/)，TypeScript 端到端类型调用。
14. [JSON Schema](https://json-schema.org/)，schema 规范与工具生态。
15. [Pact Docs](https://docs.pact.io/)，消费者驱动契约测试。
16. [Pact Provider Verification](https://docs.pact.io/implementation_guides/javascript/docs/provider)，提供者验证配置。
17. [oasdiff](https://github.com/oasdiff/oasdiff)，OpenAPI 破坏性变更检测。
18. [Schemathesis](https://schemathesis.readthedocs.io/)，基于 schema 的接口测试工具。
19. [golang-migrate](https://github.com/golang-migrate/migrate)，版本化迁移工具。
20. [Atlas](https://atlasgo.io/)，声明式与版本化 schema 管理。
21. [ParallelChange](https://martinfowler.com/bliki/ParallelChange.html)，expand 与 contract 模式。
22. [Prisma 数据迁移指南](https://www.prisma.io/docs/guides/v7/database/data-migration)，expand 与 contract 操作示例。
23. [Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)，IETF 草案。
24. [Optimistic Offline Lock](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html)，乐观锁模式。
25. [OpenTelemetry Docs](https://opentelemetry.io/docs/)，traces、metrics、logs 采集与导出。
26. [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)，探针语义与配置。
27. [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)，SLI、SLO 与错误预算。
28. [OWASP ASVS](https://asvs.dev/)，ASVS 5.0.0 入口。
29. [ASVS V4 API and Web Service](https://asvs.dev/v5.0.0/V4-API-and-Web-Service/)，接口安全验证要求。
30. [ASVS V8 Authorization](https://asvs.dev/v5.0.0/V8-Authorization/)，授权与越权验证要求。
31. [OWASP Top 10](https://owasp.org/Top10/)，失效的访问控制类别。
32. [NIST Least Privilege](https://csrc.nist.gov/glossary/term/least_privilege)，最小权限定义。
33. [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)，日志字段与审计事件建议。
34. [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)，多角色智能体开发方法。
35. [spec-kit](https://github.com/github/spec-kit)，规格驱动开发工具链。
36. [plan-template.md](https://github.com/github/spec-kit/blob/main/templates/plan-template.md)，Spec Kit 实现计划模板。
37. [superpowers](https://github.com/obra/superpowers)，TDD 与系统化调试技能包。

## 十二、未查清项

- BMAD、Superpowers 与 Spec Kit 的仓库全文在本次网络环境下未打开，角色命令、技能清单与模板章节依据搜索索引和第三方评测页核对，具体版本细节可能随仓库更新变化。
- OWASP Top 10 的 2025 版条目编号未逐条核对，报告只使用访问控制类别与 ASVS 授权章节。
- Pact 与 Broker 的 can-i-deploy 流程细节未实测，报告按官方文档描述记录。
- tRPC 与 JSON Schema 的版本兼容矩阵未逐项核对，报告只记录机制与适用边界。
- BMAD 架构师产物的机器可读 schema 未见公开资料，本报告按自然语言文档处理。
- Atlas 是否自动识别 expand/contract 模式未见公开资料，报告按 lint 提示与人工检查单处理。

# 工程规范、API 设计与测试：官方原文采集

本文件按固定表头抄录十五项官方来源，覆盖前端组件与测试、性能指标、API 设计、安全核查、服务可靠性、数据库迁移与 Go 语言约定。采集时间 2026-11-27，原文摘录保留英文原句，未做改写；版本以页面标注或文档所属版本为准，页面未标版本的写“文档页未标版本号”。每条来源在表后给两行检查方式，分别写可以用的工具与可以跑的命令。整页读不到的条目标“未取得原文”，只读到部分的在文末“取得范围与缺口”里写明缺哪一段。

## 前端

| 名称 | 版本 | 出处链接 | 侧（前端/后端/通用） | 核心要求（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|
| React 测试建议（`act`） | v19.3（页面标注） | https://react.dev/reference/react/act | 前端 | 渲染组件与触发更新的代码要包在 `await act()` 里，让断言之前先应用挂起的 React 更新。测试环境必须设置 `global.IS_REACT_ACT_ENVIRONMENT=true`，并优先用 `await` 加 async 函数的形式。 | 部分 | “`act` is a test helper to apply pending React updates before making assertions.”<br>“Using `act` requires setting `global.IS_REACT_ACT_ENVIRONMENT=true` in your test environment.” |
| React 组件纯度 | 文档页未标版本号 | https://react.dev/learn/keeping-components-pure | 前端 | 组件必须是纯函数，相同输入返回相同 JSX，且只返回 JSX，不改动渲染前已存在的对象或变量。Strict Mode 用来找出组件里的错误。 | 部分 | “React assumes that every component you write is a pure function.”<br>“Components should only _return_ their JSX, and not _change_ any objects or variables that existed before rendering” |
| Testing Library 查询优先级 | 页面标注 Last updated 2024-03-19 | https://testing-library.com/docs/queries/about/ | 前端 | 查询按用户可感知程度排序，`getByRole`、`getByLabelText`、`getByText` 一类可访问查询优先，`getByAltText`、`getByTitle` 次之，`getByTestId` 只用于无法用角色或文本匹配的场景。 | 有 | “we recommend this order of priority: 1. Queries Accessible to Everyone”<br>“getByTestId: The user cannot see (or hear) these, so this is only recommended for cases where you can't match by role or text” |
| Playwright 官方最佳实践 | 文档站未标版本号 | https://playwright.dev/docs/best-practices | 前端 | 测试应验证终端用户可见的行为，不依赖用户看不到的实现细节，每个测试自带存储、数据与 cookie 并相互隔离。定位用带自动等待与重试能力的 locator，断言用 web-first 断言。 | 有 | “Automated tests should verify that the application code works for the end users, and avoid relying on implementation details”<br>“Each test should be completely isolated from another test” |
| Storybook 交互测试 | 10.6（页面标注） | https://storybook.js.org/docs/writing-tests/interaction-testing | 前端 | 交互测试写在 story 里，story 先把组件置入初始状态，再由 `play` 函数模拟点击、输入、提交并断言结果。这类测试可用 Vitest addon 在 Storybook、终端或 CI 中自动运行。 | 有 | “You then use a play function to simulate user behavior like clicks, typing, and submitting a form and then assert on the end result.”<br>“They can be automated using the Vitest addon” |
| TypeScript `strict` | 文档页未标版本号，随 TypeScript 发布更新 | https://www.typescriptlang.org/tsconfig/strict.html | 前端 | 打开 `strict` 等于启用全部 strict 家族检查，可在其下逐项关闭。后续 TypeScript 版本可能在该开关下加入更严检查，升级后可能出现新的类型错误。 | 有 | “The `strict` flag enables a wide range of type checking behavior that results in stronger guarantees of program correctness.”<br>“Future versions of TypeScript may introduce additional stricter checking under this flag” |
| Core Web Vitals（LCP、INP、CLS） | 页面 Last updated 2024-10-31；三项指标当前均为 Stable | https://web.dev/articles/vitals | 前端 | 三项核心指标按 75 分位统计：LCP 在页面开始加载后 2.5 秒内发生，INP 在 200 毫秒以内，CLS 保持 0.1 或更低。判定一个页面通过，要求三项指标在 75 分位同时达标。 | 有 | “LCP should occur within 2.5 seconds of when the page first starts loading.”<br>“a good threshold to measure is the 75th percentile of page loads, segmented across mobile and desktop devices.” |

### 前端检查方式

React 测试建议（`act`）：
- 工具：Testing Library 的 `render`、`fireEvent`、`userEvent` 已把更新包在 `act` 内，React 在 act 环境变量未设置时会打印警告，jest 与 vitest 的 jsdom 环境承载这套断言。
- 命令：`npx jest --env=jsdom` 或 `npx vitest run --environment jsdom`，测试入口文件写 `global.IS_REACT_ACT_ENVIRONMENT = true`。

React 组件纯度：
- 工具：React 开发模式下的 `<StrictMode>` 会重复调用渲染函数以暴露副作用，ESLint 侧可加 `eslint-plugin-react-hooks` 检查 Hook 与渲染副作用。
- 命令：`npm run dev` 后在 Strict Mode 下逐页看控制台告警，`npx eslint src --ext .tsx` 跑 Hook 规则；纯度本身没有单条命令能判定。

Testing Library 查询优先级：
- 工具：`eslint-plugin-testing-library` 的 `prefer-screen-queries`、`no-node-access`、`no-container` 规则检查查询写法，优先级顺序本身要按文档逐条人工核对。
- 命令：`npx eslint tests --ext .tsx`，规则清单写进 `.eslintrc` 的 `overrides`。

Playwright 最佳实践：
- 工具：`@playwright/test` 的自动等待与重试、web-first 断言、trace viewer，`eslint-plugin-playwright` 检查手写等待与实现细节定位。
- 命令：`npx playwright test --trace on`，失败后用 `npx playwright show-trace test-results/<用例>/trace.zip` 查看。

Storybook 交互测试：
- 工具：Storybook 的 `play` 函数与 Interaction 面板，`@storybook/addon-vitest`（页面称 Vitest addon）在终端与 CI 里批量运行。
- 命令：本地 `npx storybook dev` 在面板单跑某条交互测试；CI 用 `npx vitest run` 跑接入了该 addon 的工程。

TypeScript `strict`：
- 工具：`tsc` 编译器，`tsconfig.json` 的 `strict` 开关与 `strictNullChecks` 等分项。
- 命令：`npx tsc --noEmit --strict`，或设置 `"strict": true` 后跑 `npx tsc --noEmit`。

Core Web Vitals：
- 工具：Chrome 的 Lighthouse 与 Lighthouse CI 断言、PageSpeed Insights 的字段数据、`web-vitals` 库的 `onLCP`、`onINP`、`onCLS`。
- 命令：`npx lighthouse https://example.com --only-categories=performance` 取实验室数据，字段数据按 75 分位查 PageSpeed Insights 或 CrUX。

## 后端

| 名称 | 版本 | 出处链接 | 侧（前端/后端/通用） | 核心要求（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|
| Google API 设计指南（AIP-130 标准方法） | AIP-130，State Approved，2023-03-13 | https://google.aip.dev/130 | 后端 | 设计方法时按标准方法、标准批量或聚合方法、自定义方法、流式方法的顺序选择。标准方法挂在集合或资源上，自定义方法用于标准方法覆盖不到的操作。 | 部分 | “API authors should choose from the defined categories in the following order: 1. Standard methods (on collections and resources)”<br>“2. Standard batch or aggregate methods 3. Custom methods (on collections, resources, or stateless) 4. Streaming methods” |
| OpenAPI Specification | 3.1.0（2021-02-15） | https://spec.openapis.org/oas/v3.1.0.html | 后端 | 文档必须至少包含 `paths`、`components`、`webhooks` 三者之一，`openapi` 与 `info` 必填，`info` 内的 `title` 与 `version` 也必填。数据类型基于 JSON Schema 2020-12，字段名区分大小写，根文件推荐命名为 `openapi.json` 或 `openapi.yaml`。 | 有 | “The OpenAPI document MUST contain at least one paths field, a components field or a webhooks field.”<br>“Data types in the OAS are based on the types supported by the JSON Schema Specification Draft 2020-12.” |
| OWASP ASVS 5.0（V1、V2、V3 三章） | 5.0 | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x10-V1-Encoding-and-Sanitization.md<br>https://github.com/OWASP/ASVS/blob/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md<br>https://github.com/OWASP/ASVS/blob/master/5.0/en/0x12-V3-Web-Frontend-Security.md | 后端 | 以编号条目核查编码与净化、输入校验与业务逻辑、Web 前端安全三章，条目按 L1、L2、L3 分级。条目编号清单见下节。 | 部分 | “1.2.4 Verify that data selection or database queries (e.g., SQL, HQL, NoSQL, Cypher) use parameterized queries, ORMs, entity frameworks, or are otherwise protected from SQL Injection and other database injection attacks.”<br>“3.4.3 As a minimum, a global policy must be used which includes the directives object-src 'none' and base-uri 'none'” |
| Twelve-Factor App | 页面 Last updated 2017 | https://12factor.net/ | 后端 | 十二条要素分别约束代码库、依赖、配置、后端服务、构建发布运行、进程、端口绑定、并发、可处置性、环境一致性、日志与管理进程。配置存环境变量，构建、发布、运行严格分离，应用以一个或多个无状态进程运行。 | 部分 | “Store config in the environment”<br>“Execute the app as one or more stateless processes” |
| Google SRE：SLI、SLO 与错误预算 | 在线版第 4 章，未标版本 | https://sre.google/sre-book/service-level-objectives/ | 后端 | SLI 是对服务水平某个方面的定量度量，SLO 是被 SLI 测量的目标值或取值区间，自然写法是 SLI ≤ target 或区间上下界。可用错误预算按允许未达标速率来管理，并按日或周跟踪。 | 部分 | “An SLO is a service level objective: a target value or range of values for a service level that is measured by an SLI.”<br>“SLI ≤ target, or lower bound ≤ SLI ≤ upper bound” |
| PostgreSQL 迁移约定（Django 文档） | Django 6.1 文档 | https://docs.djangoproject.com/en/6.1/topics/migrations/ | 后端 | 迁移是数据库 schema 的版本控制，同一批迁移在开发机、预发与生产上重复执行，迁移文件与对应模型改动作为一次提交入库。PostgreSQL 支持 DDL 事务，迁移操作默认在单个事务内执行。 | 有 | “You should think of migrations as a version control system for your database schema.”<br>“On databases that support DDL transactions (SQLite and PostgreSQL), all migration operations will run inside a single transaction by default.” |
| Go `testing` 包 | go1.27.4（页面标注，Published 2026-11-10） | https://pkg.go.dev/testing | 后端 | 测试函数写成 `func TestXxx(*testing.T)` 并放在以 `_test.go` 结尾的文件里，用 `T.Error`、`T.Fail` 等报告失败。`T.Run` 定义子测试，`func FuzzXxx(*testing.F)` 为模糊测试，基准测试用 `b.Loop()`。 | 有 | “automates execution of any function of the form `func TestXxx(*testing.T)`”<br>“The T.Run and B.Run methods allow defining subtests and sub-benchmarks” |
| Effective Go | 2009 年发布版，页面注明 not actively updated | https://go.dev/doc/effective_go | 后端 | 格式由 `gofmt` 统一，不靠手工排版；错误返回值必须检查并向上传递，不能丢弃。控制结构的左花括号不能另起一行写。 | 有 | “Always check error returns; they're provided for a reason.”<br>“you cannot put the opening brace of a control structure (`if`, `for`, `switch`, or `select`) on the next line.” |

### ASVS 5.0 前三个章节的条目编号

V1 Encoding and Sanitization 的子章与条目：
- V1.1 Encoding and Sanitization Architecture：1.1.1、1.1.2（L2）。
- V1.2 Injection Prevention：1.2.1 至 1.2.5（L1），1.2.6 至 1.2.9（L2），1.2.10（L3）。
- V1.3 Sanitization：1.3.1、1.3.2（L1），1.3.3 至 1.3.11（L2），1.3.12（L3）。
- V1.4 Memory, String, and Unmanaged Code：1.4.1 至 1.4.3（L2）。
- V1.5 Safe Deserialization：1.5.1（L1），1.5.2（L2），1.5.3（L3）。

V2 Validation and Business Logic 的子章与条目：
- V2.1 Validation and Business Logic Documentation：2.1.1（L1），2.1.2、2.1.3（L2）。
- V2.2 Input Validation：2.2.1、2.2.2（L1），2.2.3（L2）。
- V2.3 Business Logic Security：2.3.1（L1），2.3.2 至 2.3.4（L2），2.3.5（L3）。
- V2.4 Anti-automation：2.4.1（L2），2.4.2（L3）。

V3 Web Frontend Security 的子章与条目：
- V3.1 Web Frontend Security Documentation：3.1.1（L3）。
- V3.2 Unintended Content Interpretation：3.2.1、3.2.2（L1），3.2.3（L3）。
- V3.3 Cookie Setup：3.3.1（L1），3.3.2 至 3.3.4（L2），3.3.5（L3）。
- V3.4 Browser Security Mechanism Headers：3.4.1、3.4.2（L1），3.4.3 至 3.4.6（L2），3.4.7、3.4.8（L3）。
- V3.5 Browser Origin Separation：3.5.1 至 3.5.3（L1），3.5.4、3.5.5（L2），3.5.6 至 3.5.8（L3）。
- V3.6 External Resource Integrity：3.6.1（L3）。
- V3.7 Other Browser Security Considerations：3.7.1、3.7.2（L2），3.7.3 至 3.7.5（L3）。

### 后端检查方式

Google API 设计指南（AIP-130）：
- 工具：Google 的 `api-linter` 按 AIP 规则集检查 proto 定义，标准方法与自定义方法的取舍要人工对照 AIP-130 的顺序。
- 命令：`api-linter api/v1/*.proto`，标准方法相关规则集加 `--config` 指定。

OpenAPI Specification：
- 工具：`@redocly/cli` 的 `lint`、`spectral` 规则集、Python 的 `openapi-spec-validator`，都按 3.1 的 schema 校验文档结构。
- 命令：`npx @redocly/cli lint openapi.yaml` 或 `spectral lint openapi.yaml`。

OWASP ASVS 5.0：
- 工具：Semgrep 与 CodeQL 的注入类规则可覆盖 1.2 章的部分条目，HTTP 响应头用 curl、ZAP 被动扫描或安全头检测服务核对 V3.4；分级与业务逻辑条目需人工评审。
- 命令：`semgrep --config p/owasp-top-ten .`，响应头用 `curl -sI https://host/ | grep -iE 'strict-transport-security|content-security-policy|x-content-type-options'`。

Twelve-Factor App：
- 工具：代码检索查配置是否硬编码、容器镜像与进程管理方式查进程模型、日志输出到 stdout 由采集端接管，没有覆盖十二项的统一工具。
- 命令：`rg -n "Getenv|process\.env|System.getenv" src`，再 `rg -n "log\.(Fatal|Panic)|new FileLogger" src` 查日志是否写本地文件。

Google SRE：SLI、SLO 与错误预算：
- 工具：Prometheus 记录规则与告警规则、`pint` 规则检查器、Grafana 的 SLO 面板；SLO 取值与错误预算口径要人工评审。
- 命令：`pint lint rules.yml` 校验记录与告警规则，`promtool check rules rules.yml` 做语法检查。

PostgreSQL 迁移约定：
- 工具：Django 的 `makemigrations --check`、`migrate --plan`、`sqlmigrate`、`showmigrations`，迁移文件与模型改动在同一次提交里比对。
- 命令：`python manage.py makemigrations --check --dry-run && python manage.py migrate --plan`。

Go `testing` 包：
- 工具：`go test`，覆盖率用 `-cover`，模糊测试用 `-fuzz`，子测试用 `-run` 过滤。
- 命令：`go test ./... -count=1`，覆盖率 `go test ./... -coverprofile=cover.out`。

Effective Go：
- 工具：`gofmt`、`go vet`、`staticcheck`，三者分别查格式、可疑构造与静态问题。
- 命令：`gofmt -l . && go vet ./...`，再加 `staticcheck ./...`。

## 取得范围与缺口

十五项来源都取到了页面正文，没有整页缺失的条目。OpenAPI 规范读到 4.8.16 Responses Object 与 Response Object，Schema Object 之后的对象章节未读，这部分的要点未抄录。React 官方没有独立的组件测试文档页，`/learn/testing` 与 `/reference/testing` 均返回 404，测试建议取自 `act` 页面，组件约定取自 keeping-components-pure 页面。Playwright 与 Storybook 各读了一页官方指南，两个项目文档站的其他页面未读。ASVS 只按用户要求抄录 V1、V2、V3 三章，其余章节未读。

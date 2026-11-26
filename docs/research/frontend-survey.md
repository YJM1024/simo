# 前端开发领域可被 AI 编码智能体执行的框架、规范与技能包调研

调研目的：为司墨自建开发框架（Simo SDD，见 [`FRAMEWORK.md`](../process/FRAMEWORK.md)）筛选前端领域可被智能体执行的规范、工具与技能包，判断每一项应落成 lint 规则、模板、断言脚本还是人工评审。调研日期 2026-11-24，方法为检索官方文档与仓库公开页面，并以工作区现状（`frontend/package.json`、`frontend/tsconfig.json`、`docs/process/research/frontend.md`）作为采纳判断的基线。

工作区现状对本调研构成三条约束。`frontend/package.json` 已装 React 19.3、TypeScript 5.9、Vitest 5、Testing Library、MSW 3、Playwright（`e2e/` 独立包），未装 ESLint、Prettier、Zod、TanStack Query、XState、Radix、Storybook、Style Dictionary。`frontend/tsconfig.json` 已开 `strict` 与 `noUnusedLocals` 等选项，未开 `noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes`。`FRAMEWORK.md` 已决定不引入完整 UI 库、不让 Storybook 进主线、不接 Chromatic、以 DTCG JSON 为 token 唯一源、Headless 只引 Radix。

GitHub 页面正文在本机网络下无法直接抓取（`web_fetch` 对 github.com 与 raw.githubusercontent.com 均返回连接失败），涉及仓库的结论以检索摘要和官方站点公开描述为依据，已在未查清项中标注。

## 一、工程规范

### 1. Airbnb JavaScript / React Style Guide

- 主张：以一份成体系的规则集统一 JavaScript 与 React 写法，覆盖命名、引用、组件结构、Hooks 用法与 CSS-in-JS，规则条目附带正反例。
- 产出：可安装的 `eslint-config-airbnb` 与 `eslint-config-airbnb-base`，以及分章节的规则文档；React 与 CSS-in-JS 各有独立指南。
- 适用阶段：实现与代码评审，适合新项目起步时一次性配置。
- 对 AI 智能体的可执行性：可写成 ESLint 配置并进入门禁；代价是规则集版本偏旧、与 Prettier 存在格式规则重叠、部分 React 规则仍以类组件时代为背景，智能体容易照搬过时写法，需要人工裁剪。

来源：[airbnb/javascript](https://github.com/airbnb/javascript)、[Airbnb CSS-in-JavaScript](https://javascript.airbnb.tech/css-in-javascript/)。

### 2. Google TypeScript Style Guide

- 主张：以 Google 内部长期实践定义 TypeScript 的强制约定，重点在类型使用、导入路径、命名与一致性，用 `must` 标注不可协商项。
- 产出：公开的 HTML 风格指南；配套工具 `gts` 提供格式化与 lint 的可执行子集，覆盖不到全部条文。
- 适用阶段：规范制定与评审，适合作为团队规则的参考底稿。
- 对 AI 智能体的可执行性：条文本身是散文，无法直接变成门禁；可把其中可判定的部分（导入路径、命名、类型标注）写进 ESLint 规则，其余条目只能进评审清单，改造代价中等。

来源：[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)、[google/gts](https://github.com/google/gts)。

### 3. ESLint 与 typescript-eslint

- 主张：用静态分析把团队约定变成可执行规则，类型感知规则能发现 `Promise` 未处理、`async` 回调误用、类型导入不一致等仅靠编译器发现不了的问题。
- 产出：扁平配置 `eslint.config.js`、类型感知规则集（如 `no-floating-promises`、`no-misused-promises`、`consistent-type-imports`）、CI 中的 `eslint --max-warnings=0`。
- 适用阶段：实现与提交门禁，覆盖编码、重构与评审前自检。
- 对 AI 智能体的可执行性：可写成固定配置与命令，智能体按报错修复即可形成完整循环；代价是类型感知模式需要 `projectService` 指向 tsconfig，全量 lint 变慢，规则误报需要基线管理。

来源：[typescript-eslint 官方文档](https://typescript-eslint.io/)、[规则总览](https://typescript-eslint.io/rules/)。

### 4. Prettier

- 主张：把代码格式交给唯一工具决定，团队不再在评审中讨论缩进、引号与换行，减少智能体与人类在格式上的往返。
- 产出：`prettier.config` 配置、`.prettierignore`、CI 中的 `prettier --check`，以及与 ESLint 分工用的 `eslint-config-prettier`。
- 适用阶段：实现与提交门禁，编辑器保存时即时生效。
- 对 AI 智能体的可执行性：可写成一条 `--check` 命令与一次 `--write` 修复，执行成本低、结果确定；代价是首次全量格式化会产生大 diff，需要在独立提交中完成。

来源：[Prettier 配置文档](https://prettier.io/docs/configuration)、[CLI 文档](https://prettier.io/docs/cli)、[eslint-config-prettier](https://github.com/prettier/eslint-config-prettier)。

### 5. TypeScript 严格模式与严格家族选项

- 主张：用编译器的严格检查把空值、可选属性、索引访问等运行时风险前移到类型检查阶段，让智能体在写代码时就被类型系统约束。
- 产出：`tsconfig.json` 中的 `strict` 与 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride` 等选项，以及 `tsc --noEmit` 门禁命令。
- 适用阶段：实现与提交门禁，新项目起步即开启的成本最低。
- 对 AI 智能体的可执行性：可写成配置与一条命令，报错位置精确、修复路径明确；代价是存量代码开启严格选项会产生成批错误，需要按目录分批开启并设基线。

来源：[TSConfig strict](https://www.typescriptlang.org/tsconfig/strict.html)、[TSConfig 参考](https://www.typescriptlang.org/tsconfig/)。

### 6. Zod 运行时校验

- 主张：在类型系统覆盖不到的边界（接口响应、表单输入、URL 参数、本地存储）用 schema 做运行时校验，并从 schema 反推静态类型，避免类型声明与真实数据脱节。
- 产出：按领域放置的 schema 文件、`safeParse` 校验函数、由 `z.infer` 导出的类型、针对非法样本的断言用例。
- 适用阶段：实现与测试，重点在后端契约对接与表单提交路径。
- 对 AI 智能体的可执行性：可写成 schema 模板与“非法样本必须校验失败”的断言脚本，智能体容易照模式扩展；代价是引入新依赖、schema 与手写类型并存时会出现两份事实来源，需要用 `z.infer` 统一。

来源：[zod.dev](https://zod.dev/)。

## 二、架构与状态

### 7. Feature-Sliced Design

- 主张：按层（app、pages、widgets、features、entities、shared）、切片与段组织前端代码，只允许上层引用下层，用结构约束降低模块间耦合。
- 产出：`src/` 下的分层目录、每个切片的公开入口 `index.ts`、配套架构检查器 Steiger 与面向 LLM 的文档页。
- 适用阶段：架构设计与重构，项目规模变大或多人协作时收益明显。
- 对 AI 智能体的可执行性：分层与公开入口可用 Steiger 或 ESLint 边界规则做门禁，智能体按目录约定放置文件即可；代价是存量项目迁移需要先建 app/shared 的基础目录，切片划分依赖人工判断，过度分层会制造没有实际内容的目录。

来源：[FSD Overview](https://feature-sliced.design/docs/get-started/overview)、[Steiger](https://github.com/feature-sliced/steiger)、[FSD Docs for LLMs](https://feature-sliced.design/docs/llms)。

### 8. Bulletproof React

- 主张：以 feature 目录自包含、单向依赖、组件分层（ui 与业务组合分离）组织 React 应用，并配套一整套工程实践清单。
- 产出：可克隆的示例仓库与文档目录，包含 `features/`、`components/`、`hooks/`、`lib/` 的结构示范，没有配套 lint 工具。
- 适用阶段：脚手架设计与代码评审，适合作为目录约定的参考。
- 对 AI 智能体的可执行性：目录约定可写进任务模板与文件放置规则，单向依赖可用 ESLint `no-restricted-imports` 近似实现；代价是清单条目多且缺少机器判据，照搬全套会引入项目当前不需要的抽象层。

来源：[alan2207/bulletproof-react](https://github.com/alan2207/bulletproof-react)。

### 9. React Hooks 规则

- 主张：Hooks 只能在组件或自定义 Hook 的顶层调用，调用顺序必须稳定，依赖数组要覆盖所有响应式值，违反规则会导致状态错乱。
- 产出：React 官方规则文档、`eslint-plugin-react-hooks` 的 `rules-of-hooks` 与 `exhaustive-deps` 规则、`react.dev` 提供的 lint 规则说明页。
- 适用阶段：实现与提交门禁，属于必装规则。
- 对 AI 智能体的可执行性：规则可直接写成 ESLint 配置，报错即修复；代价是 `exhaustive-deps` 的自动修复可能改变执行时机，需要人工确认，个别场景要用注释豁免并写明理由。

来源：[React Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)、[rules-of-hooks lint 页](https://react.dev/reference/eslint-plugin-react-hooks/lints/rules-of-hooks)。

### 10. TanStack Query 数据层约定

- 主张：把服务端状态交给查询缓存管理，用统一的 queryKey 结构、`staleTime`、失效与预取策略描述数据生命周期，组件只声明依赖而不手写请求状态机。
- 产出：QueryClient 配置、queryKey 工厂、`queryOptions` 封装、Devtools 调试入口，以及基于缓存行为的测试用例。
- 适用阶段：数据层设计与实现，接口数量增多后收益明显。
- 对 AI 智能体的可执行性：配置与 queryKey 约定可写成模板，缓存行为可用 MSW 加断言脚本验证；代价是缓存语义需要团队共识，错误的 `staleTime` 或失效范围会产生难排查的脏数据，当前项目依赖中未包含该库，引入需单独评估。

来源：[TanStack Query React 文档](https://tanstack.com/query/latest/docs/framework/react/overview)。

### 11. XState 状态机

- 主张：用显式状态机与 actor 模型描述复杂交互，把合法状态、事件与转移写成可枚举的定义，避免布尔标志组合出的隐式状态。
- 产出：`createMachine` 机器定义、actor 启动代码、Stately Studio 可视化的状态图，以及按事件序列编写的测试。
- 适用阶段：复杂交互设计与实现，例如多步表单、上传队列、会话生命周期。
- 对 AI 智能体的可执行性：机器定义是结构化对象，可由模板生成并断言“给定事件序列必达某状态”；代价是掌握成本较高，简单交互用状态机会增加样板代码，测试工具链与版本升级需要额外维护。

来源：[XState Docs](https://stately.ai/docs/xstate)、[Stately Studio](https://stately.ai/)。

## 三、组件方法

### 12. Storybook 与组件驱动开发

- 主张：以组件为最小开发单元，先写状态故事再拼页面，把组件的每个状态变成可单独打开、可自动测试的工件。
- 产出：`.storybook/` 配置、CSF 格式的 `*.stories.tsx`、`play` 函数交互测试、test-runner 与 a11y 插件。
- 适用阶段：组件开发、文档与组件级测试。
- 对 AI 智能体的可执行性：故事文件结构固定，可由模板批量生成，`play` 函数可当断言脚本运行；代价是依赖链重、与自研画廊形成两套登记来源，`FRAMEWORK.md` 已决定不让它进主线，只宜借用 CSF 的数据形状。

来源：[Storybook 文档](https://storybook.js.org/docs)、[CSF 格式](https://storybook.js.org/docs/api/csf)、[play 函数](https://storybook.js.org/docs/writing-tests/play-function)。

### 13. Design Tokens 与 Style Dictionary

- 主张：把颜色、间距、字体、圆角等设计决定收敛为带 schema 的 token 源，再由构建生成各端产物，组件只消费 token 而不写死数值。
- 产出：DTCG 格式的 token JSON、Style Dictionary 的 `config.json` 与自定义 format、生成的 CSS 变量与 TS 常量、构建脚本。
- 适用阶段：设计系统建设与实现，token 变更贯穿实现与验收。
- 对 AI 智能体的可执行性：生成过程确定，可用“构建后 git diff 为空”和“组件内字面量扫描为零”做断言；代价是新增一条构建链，token 命名与分层需要人工设计，生成物与源不一致时排查成本高。

来源：[Style Dictionary](https://styledictionary.com/)、[DTCG 规范](https://www.designtokens.org/)、[workspace 既有调研](../process/research/frontend.md)。

### 14. Atomic Design

- 主张：用 atoms、molecules、organisms、templates、pages 五层词汇描述界面构成，强调先建设计系统再拼页面。
- 产出：一套通用词汇与组件分层顺序，没有官方工具或 schema。
- 适用阶段：设计系统规划与组件评审。
- 对 AI 智能体的可执行性：只能写成命名约定与登记顺序，供组件画廊排序与评审使用，无法直接变成 lint 或断言；代价低，收益主要在沟通效率。

来源：[Atomic Design 站点](https://atomicdesign.bradfrost.com/)、[Brad Frost 原文](https://bradfrost.com/blog/post/atomic-web-design/)。

### 15. Radix Primitives

- 主张：提供无样式的可访问组件原语，把焦点管理、键盘导航、ARIA 属性与层级处理交给库，团队只负责视觉与业务组合。
- 产出：按组件引入的依赖包、Dialog/Menu/Popover/Tooltip/Select 等包装组件、基于角色的测试用例。
- 适用阶段：组件实现，尤其是浮层与键盘交互密集的组件。
- 对 AI 智能体的可执行性：用法固定、文档完整，包装组件可写成模板，可访问性行为可用 Testing Library 的角色查询断言；代价是样式需自行实现，版本升级要跟随上游 API 变化。

来源：[Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction)、[可访问性说明](https://www.radix-ui.com/primitives/docs/overview/accessibility)。

### 16. React Aria

- 主张：以 Hooks 或组件形式提供跨设备、跨交互方式的行为与可访问性，覆盖键盘、触控、国际化与表单校验。
- 产出：`react-aria` 与 `react-stately` 的 Hook 用法、无样式组件、状态管理分离的示例。
- 适用阶段：组件实现，适合需要国际化和多输入方式的场景。
- 对 AI 智能体的可执行性：Hook 组合方式固定，可写成模板；代价是与 Radix 功能重叠，同时引入会形成两套行为基座，`FRAMEWORK.md` 已决定只引 Radix，本项仅作备选记录。

来源：[React Aria](https://react-spectrum.adobe.com/react-aria/)。

### 17. WCAG 2.2

- 主张：以可测试的成功标准定义可访问性底线，覆盖键盘操作、焦点可见、对比度、错误识别、目标尺寸与动画降级。
- 产出：成功标准条文、Understanding 解读文档、可映射到检查项的 AA 子集清单。
- 适用阶段：设计、实现与验收，验收阶段以检查表和自动扫描取证。
- 对 AI 智能体的可执行性：可把 AA 子集写成逐条检查表，对比度与目标尺寸可脚本量测，键盘路径可用 Playwright 断言，axe 只能覆盖一部分；代价是完整 AA 约五十条标准，全部实施成本高，需要明确取舍并记录豁免。

来源：[WCAG 2.2](https://www.w3.org/TR/WCAG22/)、[Understanding WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/)。

## 四、测试

### 18. Vitest 单元测试

- 主张：以 Vite 原生测试运行器执行单元与组件测试，复用同一套转换配置，提供快照、覆盖率与监听模式。
- 产出：`vitest.config.ts`、`*.test.ts(x)` 用例、V8 覆盖率报告、CI 中的 `vitest run`。
- 适用阶段：实现与提交门禁，组件与纯逻辑的主力测试层。
- 对 AI 智能体的可执行性：命令与配置稳定，失败信息可读，智能体能按报错迭代；代价是 jsdom 环境与真实浏览器存在差异，涉及布局与焦点的用例需要浏览器模式或 e2e 补位。

来源：[Vitest 指南](https://vitest.dev/guide/)、[浏览器模式](https://vitest.dev/guide/browser/)。

### 19. Testing Library 查询优先级

- 主张：测试应接近用户使用方式，查询按可访问性优先排序：`getByRole`、`getByLabelText`、`getByPlaceholderText`、`getByText`、`getByDisplayValue`，其次 `getByAltText`、`getByTitle`，最后才是 `getByTestId`。
- 产出：查询优先级文档、`screen` 与 `user-event` 用法、`eslint-plugin-testing-library` 的禁用 `container` 与 `node-access` 规则。
- 适用阶段：测试编写与评审，组件测试默认遵循。
- 对 AI 智能体的可执行性：优先级可写成模板与 lint 规则，`getByTestId` 的使用可用自定义规则限制并要求理由；代价是严格按角色查询会暴露组件的可访问性缺陷，短期内会增加修复量。

来源：[About Queries 与优先级](https://testing-library.com/docs/queries/about/#priority)、[eslint-plugin-testing-library](https://github.com/testing-library/eslint-plugin-testing-library)。

### 20. Playwright 端到端测试

- 主张：用真实浏览器驱动关键用户路径，自动等待元素可交互，提供 trace、视频与多浏览器项目配置，把验收路径变成可重复执行的脚本。
- 产出：`playwright.config.ts`、`e2e/*.spec.ts`、webServer 配置、trace 产物、CI 分片配置。
- 适用阶段：验收与回归，覆盖跨页面、跨接口的关键路径。
- 对 AI 智能体的可执行性：脚本结构固定，可按 AC 生成用例，失败时 trace 可定位；代价是用例稳定性依赖选择器与环境，网络与动画需要显式等待策略，维护成本高于单元测试。

来源：[Playwright 入门](https://playwright.dev/docs/intro)、[Trace Viewer](https://playwright.dev/docs/trace-viewer)。

### 21. 组件契约测试

- 主张：把组件的 props、状态与交互约定写成可执行用例，组件实现变化时契约用例仍应通过，从而约束重构不破坏使用方。
- 产出：按组件登记的状态矩阵用例、Storybook `play` 函数或 Portable Stories 形式、契约失败时的定位报告。
- 适用阶段：组件开发与组件验收，配合组件画廊登记。
- 对 AI 智能体的可执行性：状态矩阵可模板化，用例可按组件批量生成；代价是“契约”边界需要人工定义，过度声明会把实现细节写进用例，维护成本随组件数量上升。

来源：[Storybook 测试文档](https://storybook.js.org/docs/writing-tests)、[Portable Stories](https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest)。

### 22. 视觉回归（Chromatic 与 Playwright 截图）

- 主张：对关键页面与组件状态保存基线截图，变更时逐像素或按阈值比较，把视觉差异变成可评审的 diff。
- 产出：基线图片、`toHaveScreenshot` 配置（阈值、`maxDiffPixels`、隐藏动态元素的 stylePath）、Chromatic 的云端快照与 PR 检查。
- 适用阶段：验收与回归，只覆盖少量关键页面与状态。
- 对 AI 智能体的可执行性：截图与比较可脚本化，失败输出 diff 图；代价是结果对环境敏感（系统、字体、浏览器版本），基线维护需要人工确认，Chromatic 还引入云服务依赖与费用。

来源：[Playwright 视觉比较](https://playwright.dev/docs/test-snapshots)、[Chromatic 视觉测试](https://www.chromatic.com/docs/visual/)、[Chromatic 与 Playwright](https://www.chromatic.com/docs/playwright/)。

### 23. MSW 接口打桩

- 主张：在网络层拦截请求并返回 mock 响应，组件测试、Storybook 与 e2e 共用同一套 handler，避免在每个用例里手写 fetch 替身。
- 产出：`handlers.ts`、浏览器端 `setupWorker` 与 Node 端 `setupServer`、按场景覆盖的响应变体、与真实契约比对的校验脚本。
- 适用阶段：测试与本地开发，接口未就绪时也可先行。
- 对 AI 智能体的可执行性：handler 可写成模板并按接口批量生成，测试默认走 handler；代价是 handler 与真实接口会漂移，需要用 OpenAPI 摘要或契约测试定期比对。

来源：[MSW 文档](https://mswjs.io/docs/)。

## 五、智能体技能

### 24. obra/superpowers 技能化工作流

- 主张：把开发流程拆成可自动触发的技能，每个技能规定触发条件、步骤与完成判据，让智能体按固定流程工作，减少临场发挥。
- 产出：`SKILL.md` 形式的技能文件、插件安装方式、覆盖头脑风暴、计划编写、TDD、完成前验证等环节的技能集。
- 适用阶段：全流程，从需求澄清到提交前自检。
- 对 AI 智能体的可执行性：技能文本可直接指导智能体，步骤可映射为检查点；代价是技能本身不含断言，执行质量依赖模型遵守程度，需要把关键判据另写成脚本，技能集仍在快速演进。

来源：[obra/superpowers](https://github.com/obra/superpowers)、[superpowers-skills](https://github.com/obra/superpowers-skills)。

### 25. GitHub Spec Kit

- 主张：用固定命令序列把需求变成规格、计划与任务，再驱动实现，产物落在仓库内并可被评审与追溯。
- 产出：`specify` CLI 初始化的 `.specify/` 目录与模板、`/speckit.constitution`、`/speckit.specify`、`/speckit.plan`、`/speckit.tasks`、`/speckit.implement` 命令、`specs/` 下的规格与任务文件。
- 适用阶段：需求澄清、规格编写与任务拆分。
- 对 AI 智能体的可执行性：命令与模板固定，产物路径确定，适合作为 SDD 的基础结构；代价是核心模板面向通用软件，未见公开资料表明官方提供前端专用任务模板，前端任务需要在 plan 与 tasks 中自行补充路径、组件与测试约束。

来源：[github/spec-kit](https://github.com/github/spec-kit)、[Spec Kit 文档](https://github.github.io/spec-kit/)。

### 26. Agent OS

- 主张：把团队标准注入智能体的工作上下文，让智能体在写规格与实现时自动遵守既有约定，减少每次对话重复交代规范。
- 产出：`standards/` 目录下的规范文件、产品与规格目录结构、按阶段划分的命令集合；v3 版本把重点收回到标准注入与规格写作。
- 适用阶段：项目初始化、规格编写与实现。
- 对 AI 智能体的可执行性：标准文件可按项目定制并复用到每次任务，注入过程由命令完成；代价是标准文件本身没有强制力，缺少门禁脚本，版本间目录与命令变化较大，需要锁定版本。

来源：[buildermethods/agent-os](https://github.com/buildermethods/agent-os)。

## 六、对比表

| 候选 | 产物 | 适用阶段 | 可自动化程度 | 是否采纳 |
|---|---|---|---|---|
| Airbnb Style Guide | ESLint 共享配置、规则文档 | 实现、评审 | 高（配置） | 部分：只取规则子集 |
| Google TypeScript Style Guide | 风格指南、gts 工具 | 规范制定、评审 | 中（散文为主） | 参考 |
| ESLint + typescript-eslint | `eslint.config.js`、类型感知规则 | 实现、提交门禁 | 高（lint） | 采纳 |
| Prettier | 格式化配置、`--check` | 实现、提交门禁 | 高（命令） | 采纳 |
| Strict TS | `tsconfig` 严格选项、`tsc --noEmit` | 实现、提交门禁 | 高（编译） | 已采纳，补两项选项 |
| Zod | schema、`safeParse`、`z.infer` | 实现、测试 | 高（断言） | 试用（接口边界） |
| Feature-Sliced Design | 分层目录、公开入口、Steiger | 架构、重构 | 高（结构检查） | 部分：借分层词汇 |
| Bulletproof React | 示例目录、实践清单 | 脚手架、评审 | 中（无工具） | 部分：借单向依赖 |
| React Hooks 规则 | ESLint 规则 | 实现、门禁 | 高（lint） | 采纳 |
| TanStack Query | QueryClient、queryKey 工厂 | 数据层 | 中高（模板加断言） | 待评估 |
| XState | 状态机定义、状态图 | 复杂交互 | 中（结构化定义） | 试点 |
| Storybook | CSF 故事、play 函数、test-runner | 组件开发、测试 | 中（依赖重） | 不采纳，借 CSF 形状 |
| Style Dictionary | token 构建、生成物 | 设计系统、实现 | 高（构建加 diff） | 采纳（P4 计划内） |
| Atomic Design | 五层词汇 | 设计、评审 | 低（仅约定） | 借词汇 |
| Radix Primitives | 无样式组件、包装组件 | 组件实现 | 高（模板加角色断言） | 采纳（已定） |
| React Aria | Hooks、无样式组件 | 组件实现 | 中（模板） | 不采纳（避免叠加） |
| WCAG 2.2 | AA 子集清单、量测方法 | 设计、实现、验收 | 中（部分可脚本） | 采纳 AA 子集 |
| Vitest | 配置、用例、覆盖率 | 实现、门禁 | 高（命令） | 已采纳 |
| Testing Library 查询优先级 | 查询规范、lint 规则 | 测试、评审 | 高（模板加 lint） | 采纳 |
| Playwright E2E | 配置、spec、trace | 验收、回归 | 高（脚本） | 已采纳 |
| 组件契约测试 | 状态矩阵用例、play 函数 | 组件开发、验收 | 中高（模板） | 部分采纳 |
| 视觉回归 | 基线图、diff 报告 | 验收、回归 | 高（脚本，环境敏感） | 部分：Playwright 截图，不接 Chromatic |
| MSW | handlers、worker/server | 测试、本地开发 | 高（模板） | 已采纳 |
| superpowers | SKILL.md、插件 | 全流程 | 中（文本指导） | 借技能化形式 |
| Spec Kit | `.specify/`、命令、规格与任务 | 需求、规格、任务 | 中高（模板） | 借模板分层 |
| Agent OS | `standards/`、规格目录 | 初始化、规格、实现 | 中（注入） | 参考 |

## 七、可吸收进自建框架的 6 条

### 1. 把 ESLint 类型感知规则接入 Verify 门禁

改什么：新增 `frontend/eslint.config.js`，启用 typescript-eslint 的类型感知规则集，至少包含 `no-floating-promises`、`no-misused-promises`、`consistent-type-imports`、`no-unnecessary-condition`，并把 `eslint --max-warnings=0` 加进 `frontend/package.json` 的 `check` 脚本。放在哪一步：SDD 的 Verify 门禁之前，作为提交前自检。怎么判有效：在仓库内放一组故意违规的样例文件，`lint` 必须报错；正常代码零报错、零警告；连续两周门禁拦截记录中不出现同一规则重复误报。

### 2. 用 Prettier 固定格式并关闭 ESLint 格式规则

改什么：新增 `prettier.config.mjs` 与 `.prettierignore`，安装 `eslint-config-prettier`，把首次全量格式化放进独立提交，CI 增加 `prettier --check .`。放在哪一步：提交门禁，与第 1 条同层执行。怎么判有效：任意改动格式的提交都会被 `--check` 拦下；代码评审记录中不再出现格式类意见；`--check` 耗时稳定在可接受范围。

### 3. 组件状态矩阵模板与查询优先级 lint

改什么：在组件 spec 模板中固定“默认、加载、空、错误、禁用”五态与键盘路径，要求每个登记组件给出对应的 Testing Library 用例；启用 `eslint-plugin-testing-library` 的 `no-container`、`no-node-access`，对 `getByTestId` 增加自定义限制并要求注释理由。放在哪一步：组件登记与组件实现阶段，验收时核对状态矩阵。怎么判有效：抽查五个已登记组件，每个都有五态用例且全部通过；测试代码中 `getByTestId` 占比低于约定阈值；角色查询失败的用例能定位到组件的可访问性缺陷。

### 4. 以 MSW handler 作为接口契约的可执行副本

改什么：按接口建立 `handlers.ts`，组件测试与 e2e 共用；增加一个比对脚本，从 OpenAPI 摘要生成接口清单并与 handler 覆盖清单对比，缺 handler 的接口报错。放在哪一步：测试阶段，契约变更时触发。怎么判有效：新增或修改接口时比对脚本失败并列出缺口；组件测试不出现直接 `fetch` 替身；连续两个变更周期内 handler 与真实响应未出现字段漂移。

### 5. DTCG token 源、生成物与硬编码扫描

改什么：建立 `tokens/*.tokens.json`，用 Style Dictionary 生成 CSS 变量与 TS 常量，增加“构建后 diff 为空”的检查与组件内颜色、间距、圆角字面量的扫描脚本，扫描命中即失败。放在哪一步：实现阶段生成，验收阶段扫描。怎么判有效：手工修改生成物后检查必须报错；在组件中写入一个硬编码颜色，扫描必须定位到文件与行号；token 变更能追溯到组件 diff。

### 6. 把前端任务模板写成技能并绑定证据字段

改什么：在 `docs/process/skills/frontend-implementation/SKILL.md` 中固定执行顺序（读 token 与组件登记、确认状态矩阵、实现、跑 lint 与测试、截图取证），任务模板增加证据字段并要求填写命令与产物路径；技能步骤与第 1 至 5 条的门禁一一对应。放在哪一步：任务派发与实现阶段，验收前检查证据。怎么判有效：缺少证据字段的任务卡无法通过 spec lint；抽查三个任务，技能步骤与实际命令记录一致；返工原因中“遗漏门禁”类占比下降。

## 八、不适合直接搬的 3 条

1. **Airbnb 整套规则集**。规则集覆盖面广，但版本节奏慢，格式规则与 Prettier 重叠，部分 React 规则针对类组件时代，直接启用会迫使智能体写出与当前 React 19 习惯不一致的代码，还会产生大量需要豁免的告警。可行做法是只挑选与项目痛点对应的规则，其余留给评审。
2. **Bulletproof React 全套目录与抽象层**。该方案面向中大型团队，feature 内自带 components、hooks、api、stores 等子层，在功能点较少的项目里会制造没有实际内容的目录与跨层跳转，而且没有配套 lint 强制，智能体容易只复制目录而漏掉单向依赖约束。可行做法是保留 feature 聚合与单向依赖两条原则，目录按实际功能点数量决定。
3. **Chromatic 云端视觉回归**。它要求 Storybook 故事作为快照来源，与本项目“自研画廊作为验收视图、不让 Storybook 进主线”的决定冲突；基线存放在云端，diff 评审与证据链脱离仓库，还引入订阅费用与外部服务可用性依赖。可行做法是沿用 Playwright 截图基线，把 diff 图存入仓库并在验收记录中人工确认。

## 九、结论

前端规范分三类实施。第一类做成 lint 与脚本门禁：ESLint 类型感知规则、Prettier 格式检查、Hooks 规则、Testing Library 查询限制、`tsc --noEmit`、token 生成一致性检查、接口 handler 覆盖比对、Playwright 关键路径用例与截图比较。这类规则的共同特征是有确定输入输出、能在本地或 CI 复现、失败信息足以指导修复。

第二类做成模板与登记表：组件状态矩阵、组件契约用例、DTCG token 源文件、Zod schema、任务卡与证据字段、技能执行步骤。这类内容无法用一条命令判定对错，但可以固定结构，让智能体按结构填充，验收时逐项核对。

第三类留给人工评审：设计取舍与 token 命名、切片与目录划分、契约边界、视觉 diff 的接受与否、WCAG 豁免理由、交互复杂度是否需要状态机。这些判断依赖产品语境与审美，写成规则会产生大量误判。

采纳节奏按依赖关系排列：先补 ESLint、Prettier 与严格选项（当天可完成，效果可直接观察），再补测试层规则与 handler 比对（一周内），随后接入 token 生成链与截图门禁（与 P3、P4 计划对齐），最后评估 TanStack Query 与 XState 是否进入试点。Storybook、Chromatic、React Aria 保持不引入，避免与既有决定冲突。

## 十、来源清单

1. https://github.com/airbnb/javascript
2. https://javascript.airbnb.tech/css-in-javascript/
3. https://google.github.io/styleguide/tsguide.html
4. https://github.com/google/gts
5. https://typescript-eslint.io/
6. https://typescript-eslint.io/rules/
7. https://prettier.io/docs/configuration
8. https://prettier.io/docs/cli
9. https://github.com/prettier/eslint-config-prettier
10. https://www.typescriptlang.org/tsconfig/strict.html
11. https://www.typescriptlang.org/tsconfig/
12. https://zod.dev/
13. https://feature-sliced.design/docs/get-started/overview
14. https://github.com/feature-sliced/steiger
15. https://feature-sliced.design/docs/llms
16. https://github.com/alan2207/bulletproof-react
17. https://react.dev/reference/rules/rules-of-hooks
18. https://react.dev/reference/eslint-plugin-react-hooks/lints/rules-of-hooks
19. https://tanstack.com/query/latest/docs/framework/react/overview
20. https://stately.ai/docs/xstate
21. https://stately.ai/
22. https://storybook.js.org/docs
23. https://storybook.js.org/docs/api/csf
24. https://storybook.js.org/docs/writing-tests/play-function
25. https://storybook.js.org/docs/writing-tests
26. https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest
27. https://styledictionary.com/
28. https://www.designtokens.org/
29. https://atomicdesign.bradfrost.com/
30. https://bradfrost.com/blog/post/atomic-web-design/
31. https://www.radix-ui.com/primitives/docs/overview/introduction
32. https://www.radix-ui.com/primitives/docs/overview/accessibility
33. https://react-spectrum.adobe.com/react-aria/
34. https://www.w3.org/TR/WCAG22/
35. https://www.w3.org/WAI/WCAG22/Understanding/
36. https://vitest.dev/guide/
37. https://vitest.dev/guide/browser/
38. https://testing-library.com/docs/queries/about/#priority
39. https://github.com/testing-library/eslint-plugin-testing-library
40. https://playwright.dev/docs/intro
41. https://playwright.dev/docs/trace-viewer
42. https://playwright.dev/docs/test-snapshots
43. https://www.chromatic.com/docs/visual/
44. https://www.chromatic.com/docs/playwright/
45. https://mswjs.io/docs/
46. https://github.com/obra/superpowers
47. https://github.com/obra/superpowers-skills
48. https://github.com/github/spec-kit
49. https://github.github.io/spec-kit/
50. https://github.com/buildermethods/agent-os
51. https://github.com/testing-library/react-testing-library

## 十一、未查清项

1. GitHub 仓库正文在本机网络下无法直接读取，Airbnb、Bulletproof React、superpowers、Spec Kit、Agent OS 的版本号与最近提交时间未核实，结论依据检索摘要与官方站点描述。
2. Spec Kit 是否提供官方前端任务模板未见公开资料，本文按“无专用模板、自行补充前端约束”处理。
3. superpowers 的技能清单未逐条核对，只确认其以技能文件组织流程、技能仓库独立维护。
4. TanStack Query 与 XState 在当前项目中的必要性未做实测，表格中的“待评估”“试点”表示需要单独验证。
5. WCAG 2.2 的发布时间未在本文引用，避免使用未核实的日期；条文与 AA 子集以 W3C 页面为准。
6. Airbnb 规则集与 Prettier 的具体冲突条目未逐条比对，实施时需要跑一次 `eslint-config-prettier` 校验。


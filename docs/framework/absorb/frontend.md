# 前端领域候选采纳决策

日期：2026-11-24。来源：`docs/research/frontend-survey.md`。用途：把该调研的 26 个候选逐条转成墨线框架可执行的采纳决定，判定取采纳、改造后采纳与不采纳三值，每条给出落点、批次与自动化方式。落点按 `docs/framework/MOXIAN.md` 写：落在正文章节的写第 N 章，落在附录的写总册附录 A、B 或 C，附录不占章号；模板名区分 `docs/process/templates/` 的现有文件与本文拟建文件。

## 统计与口径

| 统计项 | 数量 |
|---|---|
| 候选总数 | 26 |
| 采纳 | 10 |
| 改造后采纳 | 10 |
| 不采纳 | 6 |
| 批一 | 9 |
| 批二 | 11 |
| 不落地 | 6 |

按类型分，规范 9 条、架构 4 条、组件方法 4 条、测试 6 条、技能 3 条。

判定依据是工作区现状与墨线框架的既有决定，前端约束的落点见 `docs/framework/domains/frontend.md` 第 2.2 节 MX-FE-08、第 2.3 节 MX-FE-11 与第 8 节采纳清单落点表。前端已装 React 19.3、TypeScript 5.9、Vitest 5、Testing Library、MSW 3 与 Playwright，未装 ESLint、Prettier、Zod、TanStack Query、XState、Radix、Storybook 与 Style Dictionary。框架已定不引入完整 UI 库、不让 Storybook 进主线、不接 Chromatic、以 DTCG JSON 为 token 唯一来源、Headless 只引 Radix。批一指当前前端可以直接执行的门禁与模板，批二指依赖批一配置、P3/P4 路线或新依赖评估的条目。

## 逐条决策

落点以 `docs/framework/MOXIAN.md` 为准，写章号或附录名，附录不占章号。

| 编号 | 候选 | 类型 | 判定 | 理由 | 落点 | 落地批次 | 自动化方式 |
|---|---|---|---|---|---|---|---|
| 1 | Airbnb JavaScript / React Style Guide | 规范 | 改造后采纳 | 整套规则集版本偏旧，格式规则与 Prettier 重叠，类组件时代的条文会诱导过时写法。只取导入顺序、导入边界与命名三类规则，逐条通过 eslint-config-prettier 校验后并入 ESLint 配置，其余规则留作评审参考。 | 总册附录 B 门禁清单（Lint 规则子集） | 批二 | 脚本 |
| 2 | Google TypeScript Style Guide | 规范 | 不采纳 | 条文以散文为主，可判定部分与 typescript-eslint 推荐规则重叠，剩余条目属于写作习惯，转成评审清单后没有可执行的检查动作。作为外部参考记录，不进入门禁；团队在命名与导入写法上反复出现分歧时再重开评估，只抽可判定条文。 | 总册附录 C 采纳清单索引（新增不采纳登记节） | 不落地 | 人工 |
| 3 | ESLint 与 typescript-eslint | 规范 | 采纳 | 类型感知规则能拦住 Promise 未处理、async 回调误用与类型导入不一致，报错位置可以直接指导修复。新增 `frontend/eslint.config.js`，启用 `no-floating-promises`、`no-misused-promises`、`consistent-type-imports`、`no-unnecessary-condition`，以 `--max-warnings=0` 进入门禁。 | 总册附录 B 门禁清单；脚本：`frontend/eslint.config.js` | 批一 | 脚本 |
| 4 | Prettier | 规范 | 采纳 | 格式交给唯一工具判定，评审不再处理缩进、引号与换行，智能体的修复动作确定为执行一次 `--write`。首次全量格式化单独提交，CI 只跑 `--check`，并用 eslint-config-prettier 关闭冲突的格式规则。 | 总册附录 B 门禁清单；脚本：`frontend/prettier.config.mjs` | 批一 | 脚本 |
| 5 | TypeScript 严格模式与严格家族选项 | 规范 | 采纳 | `strict` 已经开启，补 `noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes` 两项可以把索引访问与可选属性的空值风险前移到编译期。存量代码按目录分批开启并记录基线，`tsc --noEmit` 保持为固定门禁。 | 总册 8 章·执行约束；脚本：`frontend/tsconfig.json` | 批一 | 脚本 |
| 6 | Zod 运行时校验 | 规范 | 改造后采纳 | 只在网络边界使用 schema，接口响应、URL 参数与本地存储由 schema 校验并从 `z.infer` 导出类型，表单内部校验暂不引入。schema 作为边界唯一事实来源，手写同形类型不再保留，非法样本必须失败的用例随 schema 一起提交。 | 总册 6 章·契约表（接口边界）；模板：接口 schema | 批二 | 模板 |
| 7 | Feature-Sliced Design | 架构 | 改造后采纳 | 六层目录会把当前单一组件库拆成大量空目录，迁移成本换不到即刻可用的门禁。只借公开入口与单向依赖两条规则：组件统一从 `src/components/index.ts` 导出，页面不得反向引用页面，目录层级按实际功能点数量决定。 | 总册 8 章·执行约束；脚本：导入边界规则 | 批二 | 脚本 |
| 8 | Bulletproof React | 架构 | 不采纳 | feature 目录自包含与界面层、业务层分离面向中大型团队，当前前端只有一组组件与页面，照搬会制造没有内容的子层与跨层跳转。其中可判定的单向依赖由第 7 号候选的改造项覆盖，组件分层已由组件系统规则约束，整套方案没有新增判据；出现两个以上业务域并行开发时再评估目录分层。 | 总册附录 C 采纳清单索引（新增不采纳登记节） | 不落地 | 人工 |
| 9 | React Hooks 规则 | 规范 | 采纳 | `rules-of-hooks` 与 `exhaustive-deps` 属于必装规则，违反会直接造成状态错乱，报错可以当场修复。`exhaustive-deps` 的自动修复可能改变执行时机，修复后要求人工确认，注释豁免必须写明理由。 | 总册附录 B 门禁清单；脚本：`frontend/eslint.config.js` 的 react-hooks 配置 | 批一 | 脚本 |
| 10 | TanStack Query 数据层约定 | 架构 | 不采纳 | 当前页面由本地状态与一条 WebSocket 驱动，服务端状态重复缓存的问题尚未出现，引入查询库会增加缓存语义与失效策略的维护面。缓存行为难以用一条判据覆盖，等同一接口在多处各自请求的情况出现后再重开评估。 | 总册附录 C 采纳清单索引（新增不采纳登记节） | 不落地 | 人工 |
| 11 | XState 状态机 | 架构 | 改造后采纳 | 显式枚举合法状态与事件的价值成立，引入状态机库对当前交互规模偏重。改用 TypeScript 可辨识联合定义状态与事件，在契约表列出状态转移表，按事件序列写 Vitest 用例，断言非法事件不改变状态。 | 总册 6 章·契约表（状态转移）；模板：状态转移表 | 批二 | 模板 |
| 12 | Storybook 与组件驱动开发 | 组件方法 | 不采纳 | 依赖链重，且会与自研画廊形成两套组件登记来源，与不让 Storybook 进主线、不接 Chromatic 的既有决定冲突。组件驱动开发的做法由组件登记、状态矩阵与 Vitest 契约用例承接，本项工具与云端服务不进入依赖；组件状态数量超出画廊维护能力时，再评估本地故事文件，不接云端服务。 | 总册附录 C 采纳清单索引（新增不采纳登记节） | 不落地 | 人工 |
| 13 | Design Tokens 与 Style Dictionary | 规范 | 采纳 | DTCG JSON 已定为 token 唯一来源，生成 CSS 变量与 TS 常量后可以用构建后 diff 为空、组件内字面量扫描为零两条判据验收。新增的构建链随 P4 排期，token 命名与分层由设计评审决定，生成物不手工修改。 | 总册 6 章·契约表（token）；总册附录 B 门禁清单（构建 diff 与硬编码扫描） | 批二 | 脚本 |
| 14 | Atomic Design | 组件方法 | 改造后采纳 | 五层词汇适合做组件登记的分类与画廊排序，不适合当成目录层级或强制分层。组件登记表增加层级字段，取值限定为五层词汇，新增组件先归层再登记，不要求目录与层级一致。 | 模板：组件登记表；总册附录 A 模板清单 | 批二 | 模板 |
| 15 | Radix Primitives | 组件方法 | 采纳 | 浮层与键盘交互的行为交给无样式原语，团队只维护视觉与业务组合，可访问性行为能用角色查询断言。按既有决定只引 Radix，仅用于 Dialog、Menu、Popover、Tooltip、Select，包装组件统一从组件库导出并登记画廊。 | 总册 6 章·契约表（组件行为）；模板：Radix 包装组件 | 批二 | 模板 |
| 16 | React Aria | 组件方法 | 不采纳 | 功能与 Radix 重叠，同时引入会形成两套行为实现，与只引一个 Headless 库的既有决定冲突。国际化和多输入方式的需求当前没有出现，等出现具体组件缺口再单独评估，不保留并行依赖。 | 总册附录 C 采纳清单索引（新增不采纳登记节） | 不落地 | 人工 |
| 17 | WCAG 2.2 | 规范 | 改造后采纳 | 完整 AA 约五十条，全部实施与取证的成本高于当前收益。只取可测试的七项：键盘操作、焦点可见、可访问名称、对比度、错误识别、reduced-motion、目标尺寸；每项写明检查动作与豁免理由，自动扫描只作为辅助证据。 | 总册 10 章·验收；模板：可访问性检查表 | 批二 | 人工 |
| 18 | Vitest 单元测试 | 测试 | 采纳 | 组件与纯逻辑的主力测试层已经安装并在用，配置与失败信息稳定，智能体可以按报错迭代。`vitest run` 作为点级增量门禁，布局与焦点差异较大的用例交给 Playwright 补位。 | 总册附录 B 门禁清单；脚本：`frontend/vitest.config.ts` | 批一 | 脚本 |
| 19 | Testing Library 查询优先级 | 测试 | 采纳 | 按角色、标签与文本查询能让测试贴近使用方式，并同时暴露可访问性缺陷。组件测试模板固定查询顺序，启用 `eslint-plugin-testing-library` 的 `no-container` 与 `no-node-access`，`getByTestId` 需要注释理由。 | 模板：组件测试模板；总册附录 B 门禁清单（testing-library lint 规则） | 批一 | 脚本 |
| 20 | Playwright 端到端测试 | 测试 | 采纳 | 关键用户路径需要真实浏览器验证，自动等待、trace 与截图能把验收路径变成可重复脚本。按 AC 生成用例，失败时保留 trace 与截图，选择器优先使用角色与可访问名称，动画与网络等待写成显式条件。 | 总册 10 章·验收；脚本：`frontend/e2e/playwright.config.ts` | 批一 | 脚本 |
| 21 | 组件契约测试 | 测试 | 改造后采纳 | 契约用例的载体改为 Vitest 加 Testing Library，不采用 Storybook 的 play 函数与 Portable Stories。组件 spec 固定默认、加载、空、错误、禁用五态与键盘路径，每个状态对应一条用例，契约边界只写 props、事件与可见行为。 | 总册 6 章·契约表；模板：组件状态矩阵 | 批一 | 模板 |
| 22 | 视觉回归（Chromatic 与 Playwright 截图） | 测试 | 改造后采纳 | 云端快照与自研画廊作为验收视图的决定冲突，还会引入外部服务与费用。改用 Playwright 对三至五个关键页面与组件状态保存仓库内基线，比较阈值与遮罩写在配置里，diff 图进入验收记录，接受与否由人工签字。 | 总册 10 章·验收；模板：截图基线清单 | 批二 | 脚本 |
| 23 | MSW 接口打桩 | 测试 | 采纳 | 在网络层拦截请求可以让组件测试与本地开发共用一套响应，避免每个用例手写 fetch 替身。按接口建 `handlers.ts`，覆盖比对脚本从接口清单检查缺口，handler 与真实响应的字段漂移记入契约变更。 | 总册 6 章·契约表（接口副本）；脚本：handler 覆盖比对 | 批一 | 脚本 |
| 24 | obra/superpowers 技能化工作流 | 技能 | 改造后采纳 | 技能文件把触发条件、步骤与完成判据写在一起，适合约束智能体的执行顺序，技能本身不产生强制力。只借文件结构与步骤写法，写进 `frontend-implementation` 技能，步骤逐条对应批一的门禁命令，完成判据以脚本退出码为准，不安装插件。 | 模板：`frontend-implementation` SKILL；总册 7 章·派单 | 批二 | 模板 |
| 25 | GitHub Spec Kit | 技能 | 改造后采纳 | 规格、计划、任务的分层已被本工作区的 SDD 采用，CLI 与命令序列不进入流程。前端任务卡在现有模板上补组件、状态矩阵、截图档位、门禁命令四个字段，任务拆分章写清前端任务的固定字段，不新设一套目录。 | 总册 7 章·任务拆分；模板：任务卡 | 批二 | 模板 |
| 26 | Agent OS | 技能 | 不采纳 | 标准注入依赖模型自觉遵守，没有门禁脚本，版本间目录与命令变化较大。本工作区已有 `AGENTS.md` 与 `rules/` 承担常驻规范，再建一套 `standards/` 会产生两份事实来源，维护成本高于收益；常驻规范增长到两处出现重复维护时，再评估标准注入方式。 | 总册附录 C 采纳清单索引（新增不采纳登记节） | 不落地 | 人工 |

## 未决项

- 落点已改按 `docs/framework/MOXIAN.md` 的十三章，映射关系为 SDD 第 5 章至第 6 章、第 6 章至第 7 章、第 7 章至第 8 章、第 8 章至第 10 章；原按 SDD 第 13 章「附录」写的 14 处按附录归属改为总册附录 A、B 或 C，逐条见文末清单。
- 四份采纳表的落点口径已统一：`frontend.md` 与 `product-design.md` 由 SDD 编号改为 MOXIAN 编号，`backend.md` 与 `testing.md` 原就按 MOXIAN 写；附录 A 至附录 C 不占章号，落点写附录名与写章号同等有效，合并进附录 C 时按落点列归并。
- 组件状态矩阵、组件测试模板、可访问性检查表与截图基线清单尚未建文件，名称与字段需要与模板 owner 确认。
- `noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes` 开启后的存量错误数未测，需要先跑一次 `tsc --noEmit` 统计，再决定分批目录。
- Zod、Radix 与 Style Dictionary 需要新增依赖，安装前要单独评估版本、体积与升级责任；P3/P4 排期变化会影响批二的执行顺序。
- 调研涉及的 GitHub 仓库正文未直接读取，Airbnb、Bulletproof React、superpowers 与 Spec Kit 的版本号和近期状态未核实，相关判定只依据官方站点描述与检索摘要。

## 批一落地清单

以下九项是批一的执行清单，路径为计划落点，本文只登记决策，未创建或修改这些文件。

1. 新增 `frontend/eslint.config.js`，启用 typescript-eslint 类型感知规则与 react-hooks 规则，脚本命令为 `eslint . --max-warnings=0`；对应候选 3 与候选 9。
2. 新增 `frontend/prettier.config.mjs` 与 `frontend/.prettierignore`，脚本命令为 `prettier --check .`，首次全量格式化单独提交；对应候选 4。
3. 在 `frontend/tsconfig.json` 增加 `noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes`，沿用 `tsc --noEmit`；存量错误按目录建基线后分批清零，对应候选 5。
4. 新增 `docs/process/templates/component-test.md`，固定查询优先级与状态用例结构，配合 `eslint-plugin-testing-library` 的 `no-container`、`no-node-access`；对应候选 19。
5. 新增 `docs/process/templates/component-state-matrix.md`，字段为状态、触发条件、可见结果、断言与截图档位；对应候选 21。
6. 在 `frontend/src/test/` 建立 MSW 的 `handlers.ts` 与 `server.ts`，组件测试统一从 handler 取响应；对应候选 23。
7. 新增 `scripts/check-handler-coverage.mjs`，从接口清单与 handler 清单比对覆盖缺口，缺口非零时脚本失败；对应候选 23。
8. 以 `frontend/e2e/playwright.config.ts` 为入口写首个关键路径用例，失败保留 trace 与截图；对应候选 20。
9. 在 `frontend/package.json` 的 `check` 脚本串入 `lint`、`format:check`、`typecheck` 与 `test`，作为点级 Verify 的前置门禁；对应候选 3、候选 4、候选 5 与候选 18。

## 落点附录归属清单

以下 14 处的原落点写的是 SDD 第 13 章「附录」，按落点归属改为总册附录 A 模板清单、附录 B 门禁清单或附录 C 采纳清单索引。附录不占章号，落点写附录名与写章号同等有效，回填结果见逐条决策表的落点列。

| 候选 | 原落点 | 落点 |
|---|---|---|
| 1、3、4、9、18 | SDD 13 章·门禁清单 | 总册附录 B 门禁清单 |
| 13、19 | SDD 13 章·门禁清单，与已映射的契约表章并列 | 总册附录 B 门禁清单 |
| 14 | SDD 13 章·模板清单 | 总册附录 A 模板清单 |
| 2、8、10、12、16、26 | SDD 13 章·附录（新增不采纳登记节） | 总册附录 C 采纳清单索引 |


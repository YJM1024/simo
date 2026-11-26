# 采纳清单对账表（98 条）

本表把四份采纳清单的 98 个候选逐条对到框架里的落点，用来核验“全量吸纳”这句话能否成立。对账范围是 `absorb/product-design.md` 的 18 条、`absorb/frontend.md` 的 26 条、`absorb/backend.md` 的 28 条与 `absorb/testing.md` 的 26 条，落点取总册、四份域规范、任务矩阵、角色文件、门禁设计、模板与适配层里实际写下的条款。结论是 98 条全部有判定与落点登记，正文成文 82 条，只在登记层 16 条，没有任何一条找不到落点。82 条采纳与改造后采纳的条目已全部成文，登记层只剩 16 条不采纳项。

## 一、判定口径与取证方法

判定沿用采纳清单的三值，不在本表重新判定；状态按三条口径判定，每条都用检索命令在落点文件里核对，检索不到对应条款即判只落计划或未落。已落指落点文件的正文里能定位到带规则编号、字段名或门禁检查项的条款，且条款内容覆盖候选的核心机制。只落计划指候选只在采纳清单、域落点表或总册附录里登记，正文没有可执行条款。未落指落点文件不存在或内容不覆盖，且没有任何承接位置。

检索时区分正文与登记。域规范第 8 节或第 9 节的采纳清单落点表、四份采纳表本身、总册附录 A 至附录 C 都按登记处理，落在这些位置的命中不计为已落。正文里的命中按行号取证，证据列写文件名、行号与命中的关键词，例如后端域第 173 行命中 `net/http`、`database/sql` 与“依赖方向”。总册在 2026-11-24 19:35 版本已成文十三章与四个附录，落在总册章号的条目按该章条款取证；域内有对应规则时优先引域规则号，章号只作索引。

两个事实源并存时按条款内容判定，不按章号推定。四份域规范各自用一节把 98 条落到本域规则号，总册附录 C 表 C-1 按来源汇总登记条目数与并入章节，表 C-2 逐条登记 16 条不采纳项的候选名与重启条件，两处指向同一机制时以先写成的条款为准。四份清单的落点章号口径差异登记在总册附录 D 的 U-04，本表按域规则号取证，章号回填待该条裁决。本表取证的总册版本为 v1.2，不采纳项的登记位置统一按表 C-2 定位，行号随版本变动时以该表为准。

关键词取候选机制在中文正文里的固定说法，名称差异写进备注。例如 EARS 在正文里写作“六段句式”，测试奖杯在正文里写作“组件与集成优先”，对账时按机制关键词检索，不按产品名检索。只有产品名命中登记行、机制关键词在正文也找不到时，判只落计划。

## 二、总体统计

98 条的判定分布为采纳 32 条、改造后采纳 50 条、不采纳 16 条，与四份采纳清单各自的统计合计一致。状态分布为已落 82 条、只落计划 16 条、未落 0 条，已落占全部候选的 83.7%。16 条只落计划全部是不采纳项的登记态，82 条采纳与改造后采纳的条目已全部成文。

| 域 | 候选 | 采纳类 | 已落 | 只落计划（采纳类） | 未落 | 只落计划（不采纳登记） | 采纳类已落比例 |
|---|---|---|---|---|---|---|---|
| 产品与设计 | 18 | 14 | 14 | 0 | 0 | 4 | 100.0% |
| 前端 | 26 | 20 | 20 | 0 | 0 | 6 | 100.0% |
| 后端 | 28 | 25 | 25 | 0 | 0 | 3 | 100.0% |
| 测试与验收 | 26 | 23 | 23 | 0 | 0 | 3 | 100.0% |
| 合计 | 98 | 82 | 82 | 0 | 0 | 16 | 100.0% |

未落为 0 条的判定理由需要写清。四份采纳表为每条候选给出了落点，四份域规范又各自用一节把条目落到本域的节号与规则号，总册附录 C 按来源汇总登记了 98 条与 16 条不采纳，因此“找不到落点”的情形没有出现。采纳类 82 条在 2026-11-24 19:35 至 19:39 的补缺后全部成文，剩下的 16 条只落计划是不采纳项的登记态，按判定本就不写条款。

## 三、产品与设计域（18 条）

| 编号 | 候选 | 判定 | 落点文件与节或规则号 | 状态 | 证据 | 备注 |
|---|---|---|---|---|---|---|
| 1.1 | GitHub Spec Kit | 改造后采纳 | domains/product-design.md 第 2.1 节 MX-PD-07、第 3.1 节待确认项 | 已落 | domains/product-design.md:46 命中“最多五问”，:155 命中“最多五条” | `check-proposal.mjs` 未建；`proposal.md` 未含五问与三行字段 |
| 1.2 | Kiro | 改造后采纳 | domains/product-design.md 第 4 节 MX-PD-43 | 已落 | domains/product-design.md:236 命中“写全六段”，:230 命中“六段” | 正文以“六段句式”表述，EARS 名称只出现在落点表 |
| 1.3 | OpenSpec | 采纳 | domains/product-design.md 第 3.1 节 MX-PD-37 | 已落 | domains/product-design.md:162 命中 `ADDED`、`MODIFIED`、`REMOVED` | `merge-delta.mjs` 未建 |
| 1.4 | BMAD | 改造后采纳 | ROLES.md 第 2 节至第 9 节角色卡 | 已落 | ROLES.md:32 命中“输入”，:33 命中“产出”，:36 命中“完成判据” | 总册第 2 章已成文，角色六项仍以 ROLES.md 的八张角色卡为准 |
| 2.1 | Jobs to be Done | 改造后采纳 | domains/product-design.md 第 2.1 节 MX-PD-09 | 已落 | domains/product-design.md:48 命中“问题三行”，:44 命中三行内容 | `proposal.md` 未含三行字段 |
| 2.2 | 用户故事地图 | 改造后采纳 | domains/product-design.md 第 2.3 节 MX-PD-58、总册第 7 章 | 已落 | domains/product-design.md:81 命中“用户活动主干”与“派单顺序” | `proposal.md` 未含主干三列，按 MX-PD-51 人工代跑 |
| 2.3 | Impact Mapping | 改造后采纳 | domains/product-design.md 第 2.2 节 MX-PD-12 | 已落 | domains/product-design.md:63 命中“机会四行”，:60 命中四行内容 | `proposal.md` 未含四行字段 |
| 2.4 | Opportunity Solution Tree | 不采纳 | domains/product-design.md 第 8 节表 8-1、MOXIAN.md 附录 C | 只落计划 | domains/product-design.md:344 为落点表登记行；MOXIAN.md 表 C-2 按来源登记 | 附录 C 按来源汇总登记，未逐条列表 |
| 2.5 | RICE | 采纳 | domains/product-design.md 第 2.3 节 MX-PD-59、总册第 13 章 | 已落 | domains/product-design.md:82 命中四因子、单位与“拒绝计算” | `priority.md` 与 `rice.mjs` 未建，按 MX-PD-59 手算并登记 |
| 2.6 | WSJF | 不采纳 | domains/product-design.md 第 8 节表 8-1、MOXIAN.md 附录 C | 只落计划 | domains/product-design.md:346 为落点表登记行；MOXIAN.md 表 C-2 按来源登记 | 登记即终点 |
| 2.7 | PRFAQ | 不采纳 | domains/product-design.md 第 8 节表 8-1、MOXIAN.md 附录 C | 只落计划 | domains/product-design.md:347 为落点表登记行；MOXIAN.md 表 C-2 按来源登记 | 登记即终点 |
| 3.1 | 设计令牌 | 采纳 | domains/product-design.md 第 2.5 节 MX-PD-24、第 3.5 节契约表 | 已落 | domains/product-design.md:113 命中“裸色值”“token”，模板契约表 :83 有 token 列 | `check-tokens.mjs` 未建 |
| 3.2 | C4 模型 | 改造后采纳 | domains/product-design.md 第 3.4 节 MX-PD-63、总册第 6 章 | 已落 | domains/product-design.md:214 命中“上下文图与容器图”两级 | 外部服务未接入时两张图写 N/A 与重开条件 |
| 3.3 | ADR | 改造后采纳 | domains/product-design.md 第 3.1 节 MX-PD-62、总册第 3 章 | 已落 | domains/product-design.md:168 命中五节字段与四值状态 | `DECISIONS.md` 存量条目为单句，五节从新增条目起用；`adr.md` 与 `check-adr.mjs` 未建 |
| 3.4 | Nielsen 十项启发式 | 改造后采纳 | domains/product-design.md 第 2.5 节 MX-PD-61、第 5 节 | 已落 | domains/product-design.md:120 命中十项启发式与逐项结论 | `check-a11y.mjs` 未建，可测项暂按人工 |
| 3.5 | WCAG 2.2 | 改造后采纳 | domains/product-design.md 第 2.5 节 MX-PD-29 | 已落 | domains/product-design.md:118 命中“对比度、表单标签、页面语言、焦点顺序与目标尺寸” | `check-a11y.mjs` 未建，五项暂按人工 |
| 3.6 | Design Critique | 不采纳 | domains/product-design.md 第 8 节表 8-1、MOXIAN.md 附录 C | 只落计划 | domains/product-design.md:353 为落点表登记行；MOXIAN.md 表 C-2 按来源登记 | 登记即终点 |
| 3.7 | Storybook | 改造后采纳 | domains/product-design.md 第 2.5 节 MX-PD-60、第 3.4 节、第 5 节 | 已落 | domains/product-design.md:119 命中“样例页”“#gallery”与四参数地址 | 样例页路由与 `probe-cdp.mjs` 四档截图扩展未建 |

## 四、前端域（26 条）

| 编号 | 候选 | 判定 | 落点文件与节或规则号 | 状态 | 证据 | 备注 |
|---|---|---|---|---|---|---|
| 1 | Airbnb JavaScript / React Style Guide | 改造后采纳 | domains/frontend.md 第 5.1 节 G2、MX-FE-33 | 已落 | domains/frontend.md:197 命中“导入顺序”“导入边界”，:221 命中规则集 | 命名类规则未列；`eslint.config.js` 缺 |
| 2 | Google TypeScript Style Guide | 不采纳 | domains/frontend.md 第 8 节表 8-1 不采纳登记 | 只落计划 | domains/frontend.md:287 为不采纳登记行 | 登记即终点 |
| 3 | ESLint 与 typescript-eslint | 采纳 | domains/frontend.md 第 5.1 节 G2、MX-FE-33 | 已落 | domains/frontend.md:197 命中 `no-floating-promises`，:221 命中 G2 命令 | `frontend/eslint.config.js` 缺，G2 当前按人工检查 |
| 4 | Prettier | 采纳 | domains/frontend.md 第 5.1 节 G2、MX-FE-33 | 已落 | domains/frontend.md:191 命中 `prettier --check`，:221 命中命令 | `frontend/prettier.config.mjs` 缺 |
| 5 | TypeScript 严格模式 | 采纳 | domains/frontend.md 第 5.1 节 G1、MX-FE-32 | 已落 | domains/frontend.md:220 命中两项严格选项 | `tsconfig.json` 存在，两项选项未开 |
| 6 | Zod 运行时校验 | 改造后采纳 | domains/frontend.md 第 7.2 节、MX-FE-44 | 已落 | domains/frontend.md:268 命中 `Zod` 与 `z.infer` | zod 依赖未装 |
| 7 | Feature-Sliced Design | 改造后采纳 | domains/frontend.md 第 1 节 MX-FE-10 | 已落 | domains/frontend.md:89 命中 `src/components/index.ts` 导出与导入 | 单向依赖未写入正文，导入边界规则未建 |
| 8 | Bulletproof React | 不采纳 | domains/frontend.md 第 8 节表 8-1 不采纳登记 | 只落计划 | domains/frontend.md:293 为不采纳登记行 | 登记即终点 |
| 9 | React Hooks 规则 | 采纳 | domains/frontend.md 第 5.1 节 G2、MX-FE-33 | 已落 | domains/frontend.md:197 命中 `rules-of-hooks`、`exhaustive-deps` | 依赖 ESLint 配置，当前缺 |
| 10 | TanStack Query | 不采纳 | domains/frontend.md 第 8 节表 8-1 不采纳登记 | 只落计划 | domains/frontend.md:295 为不采纳登记行 | 登记即终点 |
| 11 | XState 状态机 | 改造后采纳 | domains/frontend.md 第 3.4 节、MX-FE-22 | 已落 | domains/frontend.md:136 命中“非法事件”，:149 命中事件映射规则 | 可辨识联合的写法未写入正文 |
| 12 | Storybook 与组件驱动开发 | 不采纳 | domains/frontend.md 第 8 节表 8-1 不采纳登记 | 只落计划 | domains/frontend.md:297 为不采纳登记行 | 登记即终点 |
| 13 | Design Tokens 与 Style Dictionary | 采纳 | domains/frontend.md 第 2.3 节 MX-FE-11 | 已落 | domains/frontend.md:90 命中 `DTCG` 与硬编码扫描条款 | 生成链与扫描脚本未建 |
| 14 | Atomic Design | 改造后采纳 | domains/frontend.md 第 2.2 节 MX-FE-12 | 已落 | domains/frontend.md:91 命中五层登记 | `manifest.json` 无 layer 字段 |
| 15 | Radix Primitives | 采纳 | domains/frontend.md 第 2.2 节 MX-FE-08 | 已落 | domains/frontend.md:87 命中 `Radix` 与五个组件 | 依赖未引入 |
| 16 | React Aria | 不采纳 | domains/frontend.md 第 8 节表 8-1 不采纳登记 | 只落计划 | domains/frontend.md:301 为不采纳登记行 | 登记即终点 |
| 17 | WCAG 2.2 七项 | 改造后采纳 | domains/frontend.md 第 5.2 节可访问性门、第 6 节 E8 | 已落 | domains/frontend.md:206 命中七项清单，:242 命中 E8 | 七项检查表未建 |
| 18 | Vitest 单元测试 | 采纳 | domains/frontend.md 第 5.1 节 G3、MX-FE-34 | 已落 | domains/frontend.md:192 命中 `vitest run --pool=threads`，:222 命中规则 | 2026-11-24 实测 11 skipped，按门禁判未通过 |
| 19 | Testing Library 查询优先级 | 采纳 | domains/frontend.md 第 3.3 节 MX-FE-21、第 5.1 节 G2 | 已落 | domains/frontend.md:148 命中查询顺序，:197 命中 `no-container`、`no-node-access` | testing-library lint 规则未装 |
| 20 | Playwright 端到端测试 | 采纳 | domains/frontend.md 第 5.1 节 G6、MX-FE-37 | 已落 | domains/frontend.md:195 命中 `test:e2e`，:225 命中规则 | 本机 fork 受限，未复跑 |
| 21 | 组件契约测试 | 改造后采纳 | domains/frontend.md 第 3.2 节、MX-FE-20 | 已落 | domains/frontend.md:147 命中五态矩阵规则，:124 命中五态覆盖 | `component-state-matrix.md` 缺 |
| 22 | 视觉回归 | 改造后采纳 | domains/frontend.md 第 5.1 节 G5、MX-FE-36 | 已落 | domains/frontend.md:194 命中 `capture:visual`、`check:visual` | 阈值与遮罩未定，768 档未覆盖 |
| 23 | MSW 接口打桩 | 采纳 | domains/frontend.md 第 7.1 节 MX-FE-43、MX-FE-46 | 已落 | domains/frontend.md:277 命中“MSW handler”，:274 命中交付五件 | `frontend/src/test/handlers.ts` 缺 |
| 24 | obra/superpowers 技能化工作流 | 改造后采纳 | domains/frontend.md 第 2 节五步、第 5 节命令、MX-FE-51 | 已落 | domains/frontend.md:98 命中 `frontend-implementation` 六节要求 | `SKILL.md` 已存在，步骤与五步未一一对应，完成判据未写门禁命令与退出码 |
| 25 | GitHub Spec Kit | 改造后采纳 | domains/frontend.md 第 3.1 节任务卡四字段、MX-FE-19 | 已落 | domains/frontend.md:109 命中“组件、状态矩阵、截图档位与门禁命令四字段” | 任务卡模板未加四字段 |
| 26 | Agent OS | 不采纳 | domains/frontend.md 第 8 节表 8-1 不采纳登记 | 只落计划 | domains/frontend.md:311 为不采纳登记行 | 登记即终点 |

## 五、后端域（28 条）

本域 28 条按 19:39 版 `domains/backend.md` 取证。第 8.1 节至第 8.5 节的补充条款 MX-BE-59 至 MX-BE-71 为 13 条缺口逐条补了正文，每条末尾标注对应候选编号；第 8.6 节的 28 条落点表已改指新规则号，下表按新条款与新行号记录。

| 编号 | 候选 | 判定 | 落点文件与节或规则号 | 状态 | 证据 | 备注 |
|---|---|---|---|---|---|---|
| 1 | C4 模型 | 改造后采纳 | domains/backend.md 第 8.1 节 MX-BE-59 | 已落 | domains/backend.md:292 命中上下文图与容器图两级，落点表 :376 | 图规则沿用 MX-PD-63；外部服务未接入时两张图写 N/A 与重开条件 |
| 2 | 架构决策记录 | 采纳 | domains/backend.md 第 8.1 节 MX-BE-60、`templates/adr.md` | 已落 | domains/backend.md:294 命中五节字段与四值状态，落点表 :377 | `adr.md` 与 `check-adr.mjs` 未建；五节口径与 MX-PD-62 相同 |
| 3 | Clean Architecture | 改造后采纳 | domains/backend.md 第 5 节 MX-BE-36 | 已落 | domains/backend.md:177 命中 `net/http`、`database/sql` 与“依赖方向” | 依赖方向扫描脚本未建 |
| 4 | Hexagonal Architecture | 改造后采纳 | domains/backend.md 第 5 节 MX-BE-44 | 已落 | domains/backend.md:193 命中“接口注入” | 与第 3 条合并为同一条依赖规则 |
| 5 | 限界上下文 | 采纳 | domains/backend.md 第 8.1 节 MX-BE-61 | 已落 | domains/backend.md:296 命中统一语言词表与两栏接口清单 | 跨域读写经接口；词表与清单写进长期 spec 数据模型节 |
| 6 | 12-Factor App | 改造后采纳 | domains/backend.md 第 8.3 节 MX-BE-65 | 已落 | domains/backend.md:308 命中六条运行约束与发布检查单对应条目 | `check-runtime-config.mjs` 未建 |
| 7 | AWS Well-Architected | 改造后采纳 | domains/backend.md 第 8.5 节 MX-BE-70 | 已落 | domains/backend.md:348 命中可靠性、安全与成本三类可判定项 | 批三启用 |
| 8 | OpenAPI 3.1 与 Spectral | 采纳 | domains/backend.md 第 3 节 MX-BE-18、第 5 节 MX-BE-41 | 已落 | domains/backend.md:88 命中 `openapi.yaml` 唯一来源，:187 命中契约一致性 | Spectral 与 operationId 规则未写；`openapi.yaml` 缺 |
| 9 | protobuf 与 gRPC | 不采纳 | domains/backend.md 第 8.6 节表、MOXIAN.md 附录 C | 只落计划 | domains/backend.md:384 为不采纳登记行；MOXIAN.md 表 C-2 按来源登记 | 登记即终点 |
| 10 | tRPC | 不采纳 | domains/backend.md 第 8.6 节表、MOXIAN.md 附录 C | 只落计划 | domains/backend.md:385 为不采纳登记行；MOXIAN.md 表 C-2 按来源登记 | 登记即终点 |
| 11 | JSON Schema | 采纳 | domains/backend.md 第 8.2 节 MX-BE-64、`specs/backend/config.schema.json` | 已落 | domains/backend.md:304 命中 JSON Schema 2020-12 与组件复用 | `config.schema.json` 未建 |
| 12 | Pact 消费者驱动契约 | 不采纳 | domains/backend.md 第 8.6 节表、MOXIAN.md 附录 C | 只落计划 | domains/backend.md:387 为不采纳登记行；MOXIAN.md 表 C-2 按来源登记 | 登记即终点 |
| 13 | Provider 契约校验 | 采纳 | domains/backend.md 第 5 节 MX-BE-38、MX-BE-41 | 已落 | domains/backend.md:187 命中破坏性变更与基线比对 | 测试期按 schema 校验实际响应的条款未写 |
| 14 | 迁移版本化 | 改造后采纳 | domains/backend.md 第 3 节 MX-BE-20、第 5 节 MX-BE-39 | 已落 | domains/backend.md:92 命中版本、Up、基线哈希 | 版本连续与唯一未逐字写入；`check-migration.mjs` 缺 |
| 15 | expand/contract 迁移法 | 改造后采纳 | domains/backend.md 第 3 节 MX-BE-23 | 已落 | domains/backend.md:98 命中双写、收缩前置条件、备份、回滚 | `migration-plan.md` 缺 |
| 16 | 幂等键 | 采纳 | domains/backend.md 第 4 节 MX-BE-31 | 已落 | domains/backend.md:127 命中同一幂等键与 `idempotent:true` | 契约表幂等三栏未加 |
| 17 | 事务与并发控制 | 采纳 | domains/backend.md 第 4 节 MX-BE-30 | 已落 | domains/backend.md:125 命中真实并发与 `busy_timeout` | 需补 `version` 列的表待设计确认 |
| 18 | 结构化日志 | 采纳 | domains/backend.md 第 8.3 节 MX-BE-66 | 已落 | domains/backend.md:319 命中七个必填字段与脱敏要求 | `check-log-fields.mjs` 未建 |
| 19 | OpenTelemetry | 改造后采纳 | domains/backend.md 第 8.3 节 MX-BE-67 | 已落 | domains/backend.md:331 命中 `trace_id` 生成与 `traceparent` 沿用 | 批三启用 |
| 20 | 健康检查与就绪探针 | 改造后采纳 | domains/backend.md 第 3 节 MX-BE-18、第 4 节正例三 | 已落 | domains/backend.md:139 命中 `/api/health` 与 503 | 数据库不可写场景未补 |
| 21 | SLO 与错误预算 | 改造后采纳 | domains/backend.md 第 8.5 节 MX-BE-71 | 已落 | domains/backend.md:362 命中三条 SLI、内部目标与自然月统计 | `slo.md` 未建 |
| 22 | OWASP ASVS | 改造后采纳 | domains/backend.md 第 8.4 节 MX-BE-69 | 已落 | domains/backend.md:344 命中 ASVS 5.0.0 的 L1 五章映射 | `security-matrix.md` 未建 |
| 23 | 鉴权与越权检查 | 改造后采纳 | domains/backend.md 第 5 节 MX-BE-42、MX-BE-43 | 已落 | domains/backend.md:189 命中资源边界与 400、403、404 | 鉴权矩阵按 N/A 处理 |
| 24 | 最小权限 | 改造后采纳 | domains/backend.md 第 8.4 节 MX-BE-68 | 已落 | domains/backend.md:335 命中四项检查与进程账号、ACL、可写目录白名单 | 批三启用 |
| 25 | 审计日志 | 采纳 | domains/backend.md 第 3 节 MX-BE-22 | 已落 | domains/backend.md:96 命中审计事件的六字段 | 五类操作清单写在总册表 8-2，后端域条款未列；`audit-events.md` 缺 |
| 26 | BMAD 架构师角色 | 改造后采纳 | domains/backend.md 第 8.1 节 MX-BE-62 | 已落 | domains/backend.md:298 命中实现就绪检查四项并入契约门 | GATES.md 契约门六条尚未同步这四项 |
| 27 | Spec Kit 的 plan 模板 | 改造后采纳 | domains/backend.md 第 8.1 节 MX-BE-63、`templates/design.md` | 已落 | domains/backend.md:300 命中 plan 五类信息并入 design.md 的四项条件 | design.md 现为八节，并入后才算落地 |
| 28 | Superpowers 调试与 TDD 技能 | 改造后采纳 | domains/backend.md 第 2 节 MX-BE-11 | 已落 | domains/backend.md:48 命中三类高风险先写失败测试 | 调试记录写 `FAILURE.md` 只在落点表，正文未列 |

## 六、测试与验收域（26 条）

| 编号 | 候选 | 判定 | 落点文件与节或规则号 | 状态 | 证据 | 备注 |
|---|---|---|---|---|---|---|
| 1.1 | 测试金字塔 | 改造后采纳 | domains/testing.md 第 5 节层表 | 已落 | domains/testing.md:131 命中“测试金字塔只作数量形状” | 无固定比例，符合改造要求 |
| 1.2 | 测试奖杯 | 改造后采纳 | domains/testing.md 第 5 节前端取向 | 已落 | domains/testing.md:131 命中“组件与集成优先” | 正文以取向表述，未用奖杯一词 |
| 1.3 | 契约测试 | 改造后采纳 | domains/testing.md 第 5 节 MX-QA-34 | 已落 | domains/testing.md:146 命中“OpenAPI 唯一契约源”与契约层 | 契约源未建，批二 |
| 1.4 | 属性测试 | 改造后采纳 | domains/testing.md 第 3 节属性用例、第 4 节不变量、MX-QA-55 | 已落 | domains/testing.md:96 命中固定种子、随机输入与“最小反例” | 固定种子生成器与收缩记录待建 |
| 1.5 | 变异测试 | 改造后采纳 | domains/testing.md 第 6 节夜间档 | 已落 | domains/testing.md:193 命中“变异抽检”“存活体” | 抽检记录表未建 |
| 1.6 | 风险驱动测试 | 采纳 | domains/testing.md 第 3 节风险清单字段 | 已落 | domains/testing.md:52 命中可能性与影响两列三档，:67 命中风险级别 | test-plan 模板未加两列 |
| 1.7 | 等价类与边界值 | 采纳 | domains/testing.md 第 4 节 Criterion、第 2 节四类分支 | 已落 | domains/testing.md:36 命中“等价类与边界值” | 表驱动用例模板未建 |
| 2.1 | ATDD 与 BDD | 改造后采纳 | domains/testing.md 第 4 节 MX-QA-25 | 已落 | domains/testing.md:115 命中 GWT 只作格式、不引 Cucumber | 无 |
| 2.2 | 验收标准 GWT | 采纳 | domains/testing.md 第 4 节六项、第 6 节判据门 | 已落 | domains/testing.md:102 命中六项组成，:166 命中判据门 | 无 |
| 2.3 | 实例化需求 | 改造后采纳 | domains/testing.md 第 4 节 MX-QA-26 | 已落 | domains/testing.md:115 命中关键例子标“待确认” | 无 |
| 2.4 | UAT 脚本 | 改造后采纳 | domains/testing.md 第 3 节证据索引、第 5 节人工层 | 已落 | domains/testing.md:140 命中人工层“UAT 记录” | UAT 记录模板未建 |
| 2.5 | 探索性测试章程 | 改造后采纳 | domains/testing.md 第 3 节章程与会话记录、第 8 节原因码、MX-QA-56 | 已落 | domains/testing.md:98 命中“探索性测试”“时间盒”与章程五项 | `exploratory.md` 未建，按 MX-QA-56 字段手写 |
| 3.1 | Playwright | 采纳 | domains/testing.md 第 5 节端到端层 | 已落 | domains/testing.md:139 命中端到端 Playwright 或 CDP | 无 |
| 3.2 | Cypress | 不采纳 | domains/testing.md 第 5 节工具选型 MX-QA-35 | 只落计划 | domains/testing.md:258 为不采纳登记行；:156 命中不引入 Cypress | 登记即终点 |
| 3.3 | Vitest | 采纳 | domains/testing.md 第 5 节单元层 | 已落 | domains/testing.md:135 命中单元层 Vitest 单文件 | 无 |
| 3.4 | Go testing 与 testify | 改造后采纳 | domains/testing.md 第 5 节单元与接口层 | 已落 | domains/testing.md:135 命中 `go test ./<包>` | 表驱动与子测试约定未写；testify 不引入只写在落点表 |
| 3.5 | golden 文件 | 采纳 | domains/testing.md 第 5 节输出比对 | 已落 | domains/testing.md:146 命中 golden 与 testdata | 约定与目录未建，批二 |
| 3.6 | 快照测试 | 不采纳 | domains/testing.md 第 5 节工具选型 | 只落计划 | domains/testing.md:262 为不采纳登记行；:156 命中“不引入整树快照” | 登记即终点 |
| 3.7 | 视觉回归 | 采纳 | domains/testing.md 第 5 节人工层、第 6 节夜间档 | 已落 | domains/testing.md:152 命中夜间档“覆盖率趋势与视觉基线” | 阈值待实测 |
| 4.1 | 覆盖率口径 | 改造后采纳 | domains/testing.md 第 6 节覆盖率门 | 已落 | domains/testing.md:161 命中行、分支、函数三类统计 | 只做趋势，不设阻断 |
| 4.2 | 增量覆盖率 | 改造后采纳 | GATES.md 第 3.5 节、domains/testing.md 第 6 节 | 已落 | GATES.md:175 为增量覆盖率门禁标题，:249 为该门禁的脚本映射行；domains/testing.md:193 命中脚本未建立时的告警口径 | `check-incremental-coverage.mjs` 已存在 |
| 4.3 | flaky 测试治理 | 采纳 | domains/testing.md 第 6 节不稳定门、第 8 节原因码 | 已落 | domains/testing.md:195 命中三次复跑与隔离清单 | flaky 清单模板未建 |
| 4.4 | 门禁分级 | 采纳 | domains/testing.md 第 6 节三档、GATES.md 第 1 节 | 已落 | domains/testing.md:152 命中阻断、告警、夜间三档；GATES.md:12 命中默认阻断五道 | 无 |
| 5.1 | superpowers 的 TDD 纪律 | 改造后采纳 | domains/testing.md 第 2 节 MX-QA-09 | 已落 | domains/testing.md:42 命中“先失败后通过” | 限高风险路径 |
| 5.2 | Spec Kit 的 checklist 与 analyze | 采纳 | domains/testing.md 第 6 节语言门、治理门 | 已落 | domains/testing.md:164 命中 `check-trace.mjs` 治理门 | 无 |
| 5.3 | BMAD 的 QA 角色 | 不采纳 | domains/testing.md 第 2 节判定人分离、第 7 节自签拦截 | 只落计划 | domains/testing.md:270 为不采纳登记行；:46 命中判定人分离 | 登记即终点 |

## 七、不采纳 16 条的理由

16 条不采纳项的落点是总册附录 C 的来源汇总与各域落点表的登记行，正文按判定本就不写条款。它们在状态列统一记为只落计划，不计入缺口清单，理由各写一句。

| 编号 | 候选 | 判定 | 一句话理由 | 登记位置 |
|---|---|---|---|---|
| 2.4 | Opportunity Solution Tree | 不采纳 | 机会层要求连续三到四次客户访谈作证据，单人单机没有稳定证据源，中间层会退化成主观列表。 | MOXIAN.md 表 C-2；domains/product-design.md:344 |
| 2.6 | WSJF | 不采纳 | 延迟成本三项与 RICE 的触达、影响高度重叠，两套分数并存会给出互相矛盾的排序。 | MOXIAN.md 表 C-2；domains/product-design.md:346 |
| 2.7 | PRFAQ | 不采纳 | 一页新闻稿面向外部客户，单人项目没有对外发布节奏，产出是散文且无法转成判据。 | MOXIAN.md 表 C-2；domains/product-design.md:347 |
| 3.6 | Design Critique | 不采纳 | 评审质量取决于多人现场讨论，单机单用户环境由独立验收抽查覆盖，议程记录不进入判据。 | MOXIAN.md 表 C-2；domains/product-design.md:353 |
| 2 | Google TypeScript Style Guide | 不采纳 | 条文以散文为主，可判定部分与 typescript-eslint 推荐规则重叠，剩余条目没有可执行的检查动作。 | MOXIAN.md 表 C-2；domains/frontend.md:287 |
| 8 | Bulletproof React | 不采纳 | feature 自包含与分层面向中大型团队，当前只有一组组件与页面，照搬会制造空子层，可判定的单向依赖已由第 7 条覆盖。 | MOXIAN.md 表 C-2；domains/frontend.md:293 |
| 10 | TanStack Query | 不采纳 | 页面由本地状态与一条 WebSocket 驱动，服务端状态重复缓存的问题尚未出现，引入会增加缓存语义与失效策略的维护面。 | MOXIAN.md 表 C-2；domains/frontend.md:295 |
| 12 | Storybook 与组件驱动开发 | 不采纳 | 依赖链重，会与自研画廊形成两套组件登记来源，与不让 Storybook 进主线的既有决定冲突。 | MOXIAN.md 表 C-2；domains/frontend.md:297 |
| 16 | React Aria | 不采纳 | 功能与 Radix 重叠，同时引入会形成两套行为实现，违反只引一个 Headless 库的约束。 | MOXIAN.md 表 C-2；domains/frontend.md:301 |
| 26 | Agent OS | 不采纳 | 标准注入依赖模型自觉遵守且没有门禁脚本，与已有常驻规范形成两份事实来源。 | MOXIAN.md 表 C-2；domains/frontend.md:311 |
| 9 | protobuf 与 gRPC | 不采纳 | 当前是单语言 Go 单体加 HTTP/JSON，没有跨语言与流式 RPC 需求，生成链与基线维护成本高于收益。 | MOXIAN.md 表 C-2；domains/backend.md:384 |
| 10 | tRPC | 不采纳 | 后端是 Go，前后端不共享 TypeScript 类型，端到端类型推导的前提不成立。 | MOXIAN.md 表 C-2；domains/backend.md:385 |
| 12 | Pact 消费者驱动契约 | 不采纳 | 只有一个消费者与一个提供者，Broker 与版本矩阵的成本全落在一个项目上，接口一致性由 OpenAPI 响应校验覆盖。 | MOXIAN.md 表 C-2；domains/backend.md:387 |
| 3.2 | Cypress | 不采纳 | 与 Playwright 功能重叠，双栈增加 CI 与维护成本，现有端到端目录与基线脚本都按 Playwright 建设。 | MOXIAN.md 表 C-2；domains/testing.md:258 |
| 3.6 | 快照测试 | 不采纳 | 整树快照难以审查，过期快照会制造无意义通过，结构化输出用 golden 比对更可审。 | MOXIAN.md 表 C-2；domains/testing.md:262 |
| 5.3 | BMAD 的 QA 角色 | 不采纳 | 整套角色编排与现有 owner、实现者与验收 Agent 的边界重叠，交接次数增加而责任边界变模糊。 | MOXIAN.md 表 C-2；domains/testing.md:270 |

## 八、缺口清单与补位责任

采纳类缺口 0 条，未落 0 条，缺口严重度排序对采纳类不再适用。剩下的事项有两类，一类是 16 条不采纳项的逐条索引，另一类是 26 项待建产物。

16 条不采纳项在状态列记为只落计划，含义是登记完成、正文按判定不写条款，它们不是采纳缺口。这些条目的补位责任只有一项，即由附录 C 维护人把候选名、重启条件与所属域补成条目级索引，各域 owner 复核重启条件。

| 编号 | 候选 | 域 | 登记位置 | 补位人 |
|---|---|---|---|---|
| 2.4 | Opportunity Solution Tree | 产品与设计 | MOXIAN.md 表 C-2；domains/product-design.md:344 | 附录 C 维护人补条目；产品 owner 复核重启条件 |
| 2.6 | WSJF | 产品与设计 | MOXIAN.md 表 C-2；domains/product-design.md:346 | 附录 C 维护人补条目；产品 owner 复核重启条件 |
| 2.7 | PRFAQ | 产品与设计 | MOXIAN.md 表 C-2；domains/product-design.md:347 | 附录 C 维护人补条目；产品 owner 复核重启条件 |
| 3.6 | Design Critique | 产品与设计 | MOXIAN.md 表 C-2；domains/product-design.md:353 | 附录 C 维护人补条目；产品 owner 复核重启条件 |
| 2 | Google TypeScript Style Guide | 前端 | MOXIAN.md 表 C-2；domains/frontend.md:287 | 附录 C 维护人补条目；前端 owner 复核重启条件 |
| 8 | Bulletproof React | 前端 | MOXIAN.md 表 C-2；domains/frontend.md:293 | 附录 C 维护人补条目；前端 owner 复核重启条件 |
| 10 | TanStack Query | 前端 | MOXIAN.md 表 C-2；domains/frontend.md:295 | 附录 C 维护人补条目；前端 owner 复核重启条件 |
| 12 | Storybook 与组件驱动开发 | 前端 | MOXIAN.md 表 C-2；domains/frontend.md:297 | 附录 C 维护人补条目；前端 owner 复核重启条件 |
| 16 | React Aria | 前端 | MOXIAN.md 表 C-2；domains/frontend.md:301 | 附录 C 维护人补条目；前端 owner 复核重启条件 |
| 26 | Agent OS | 前端 | MOXIAN.md 表 C-2；domains/frontend.md:311 | 附录 C 维护人补条目；前端 owner 复核重启条件 |
| 9 | protobuf 与 gRPC | 后端 | MOXIAN.md 表 C-2；domains/backend.md:384 | 附录 C 维护人补条目；后端 owner 复核重启条件 |
| 10 | tRPC | 后端 | MOXIAN.md 表 C-2；domains/backend.md:385 | 附录 C 维护人补条目；后端 owner 复核重启条件 |
| 12 | Pact 消费者驱动契约 | 后端 | MOXIAN.md 表 C-2；domains/backend.md:387 | 附录 C 维护人补条目；后端 owner 复核重启条件 |
| 3.2 | Cypress | 测试与验收 | MOXIAN.md 表 C-2；domains/testing.md:258 | 附录 C 维护人补条目；测试 owner 复核重启条件 |
| 3.6 | 快照测试 | 测试与验收 | MOXIAN.md 表 C-2；domains/testing.md:262 | 附录 C 维护人补条目；测试 owner 复核重启条件 |
| 5.3 | BMAD 的 QA 角色 | 测试与验收 | MOXIAN.md 表 C-2；domains/testing.md:270 | 附录 C 维护人补条目；测试 owner 复核重启条件 |

未落条目 0 条，没有需要单列的条目。附录 C 表 C-1 已按来源汇总 98 条与 16 条不采纳，逐条索引补齐前，回查路径是各域落点表。

本表涉及的待建产物按 `Test-Path` 核对为 26 项，其中脚本 13 个、模板 11 个、契约文件 2 个。脚本为 `check-proposal.mjs`、`merge-delta.mjs`、`check-tokens.mjs`、`check-a11y.mjs`、`check-adr.mjs`、`check-openapi.mjs`、`check-openapi-diff.mjs`、`check-migration.mjs`、`check-log-fields.mjs`、`check-runtime-config.mjs`、`check-backend-deps.mjs`、`rice.mjs`、`check-handler-coverage.mjs`。模板为 `delta.md`、`priority.md`、`component-test.md`、`component-state-matrix.md`、`security-matrix.md`、`migration-plan.md`、`adr.md`、`audit-events.md`、`slo.md`、`role-card.md`、`exploratory.md`。契约文件为 `specs/backend/openapi.yaml` 与 `specs/backend/config.schema.json`。这些产物缺失不影响本表的状态判定，判定只看条款是否成文。

## 九、未决点

1. 后端第 8.1 节至第 8.5 节与总册第 8 章表 8-2 对同一批检查项有两处写法，日志字段、运行约束、最小权限与审计事件四处的内容需要核对一致。核对人定为 `domains/backend.md` 的 owner（后端角色），核对口径以总册第 8 章为准；该章是 backend.md 文件头第 3 行声明的配套章节，MX-BE-62 属于其中的条款。条款冲突时删掉后端侧的重复表述，只保留对总册第 8 章的引用。本表不改 backend.md，核对与删改单独排期，结论回写本节该条与后端补缺卡的收口记录。

2. 四份清单的落点章号口径尚未统一，`frontend.md` 的部分落点按旧目录书写，总册附录 D 的 U-04 已登记。本表按域规则号取证，章号回填与附录 C 的并入章节核对待该条裁决后执行。

3. 附录 A 至附录 C 的维护人未定，登记在总册附录 D 的 U-02。附录 C 表 C-1 按来源汇总了 98 条与 16 条不采纳，没有逐条列候选名与重启条件，逐条索引目前只能回查各域落点表。

4. 产品第 2.2 条与第 3.3 条已写成 MX-PD-58 与 MX-PD-62，采纳清单未决项里“批二预算不足时可整体舍弃”的选项仍然存在。若决定舍弃，需要回退这两条规则并同步改判定与附录 C，需 Lead 裁决后执行。

5. 16 条不采纳项在本表记为只落计划，含义是“登记完成、正文按判定不写条款”。若要求附录 C 逐条列出候选名与重启条件，需要补条目级索引；补齐前这 16 条不转计未落。

6. 已落的 82 条里有 26 项的自动化产物仍缺，涉及脚本 13 个、模板 11 个与契约文件 2 个，明细见第八节末段。这些条目按口径计为已落，实质执行依赖产物落地，验收时应抽查产物是否存在。

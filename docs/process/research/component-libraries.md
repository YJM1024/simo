# 前端组件库与组件目录生态调研（给司墨的选型依据）

> 调研日期：2026-11-12。方法：`web_search` 找官方入口 + `github_api /repos/{owner}/{repo}/license` 核 LICENSE（返回 base64 原文，按解码内容判定）+ `web_fetch` 核 DTCG 许可证原文。
> 标注：**[已核验]** = 本次读到 LICENSE/正文；**[未验证]** = 只检索到入口或未逐行核验。
> 评判基准：司墨现状 = **自研 tokens/组件/画廊 + Tailwind + 浅色科技风（accent 渐变/墨滴）+ design-first（设计先行）**，且项目原则是**零/少第三方运行时依赖**。

## 0. 结论先行

1. **完整组件库（MUI/AntD/Chakra/Mantine/daisyUI 类）全部不引入运行时依赖**——它们各自带一套主题/样式引擎，会与自研 tokens + Tailwind 冲突，且体积/风格不可控。只**借鉴**其 API 设计与无障碍实现思路。
2. **Headless/可访问性原语：建议只引 1 个**——**Radix Primitives（MIT，已核验）** 与 Tailwind/shadcn 生态同源、unstyled、可被 tokens 完全接管；候选备选 **React Aria**（a11y 最严谨，但 hooks 形态侵入更强）和 **Ark UI**（MIT，跨框架，状态机清晰）。三者都 MIT，选一即可，不叠加。
3. **shadcn/ui 不装依赖，只抄模式**：copy-in 源码 + Radix + Tailwind + CSS 变量，正好契合"自研组件 + tokens"路线（MIT 已核验，可自由复制改造）。
4. **画廊：自研画廊保留为门禁/验收视图；开发期可选 Ladle（MIT）作为轻量隔离预览**；Storybook（MIT）功能最全但重，作为"需要时"选项；Histoire（MIT）Vite 生态、偏 Vue，React 支持 **[未验证]**，不优先。
5. **Tokens 格式：采用 W3C DTCG JSON 作为唯一事实来源**（DTCG 仓库许可为 W3C Software and Document License / 测试套件 W3C 3-clause BSD，**[已核验]**），由自研构建生成 CSS variables + Tailwind theme，避免手写两套。

---

## 1. 完整组件库

| 库 | 链接 | 许可证（LICENSE 核验） | 活跃度/成熟度 | 适用场景 | 优点 | 缺点 | 与「自研浅色科技风 + Tailwind + design-first」契合 | 建议 |
|---|---|---|---|---|---|---|---|---|
| **MUI (Material UI)** | <https://mui.com/> | Core **MIT** [已核验]；MUI X 高级组件为**商业许可**（Pro/Premium 单独条款）[未验证细节] | 极成熟、生态大 | 快速搭中后台/标准 Material 风格 | 组件全、文档好、a11y 基础好 | 自带 Emotion 样式引擎 + Material 视觉；定制要覆盖大量主题变量；与 Tailwind 双引擎 | 低-中：风格与"浅色科技风"冲突，双样式引擎负担 | **不引**；借鉴其 API 命名与 Table/DatePicker 交互细节 |
| **Ant Design** | <https://ant.design/> | **MIT** [已核验] | 极成熟（中文生态强） | 企业级中后台、表单密集 | 组件全、Form/Table 强、中文文档 | 视觉强绑定（企业蓝/大圆角）；CSS-in-JS（v5）与 Tailwind 并行；包体大 | 低：默认视觉离"科技风"远，改造成本高 | **不引**；借鉴 Form 校验与 Table 交互模型 |
| **Chakra UI** | <https://chakra-ui.com/> | **MIT**（开源版）[已核验]；Chakra Pro 为商业许可 [未验证细节] | 成熟 | 快速产品原型、a11y 友好 | style props 开发快、a11y 较好、主题系统清晰 | Emotion 运行时；主题强 opinionated；与 Tailwind tokens 双轨 | 中：可借鉴其"语义化 token 映射"，但样式引擎冲突 | **不引**；借鉴语义 token 命名（bg/surface/accent） |
| **Mantine** | <https://mantine.dev/> | **MIT** [已核验] | 成熟且更新快 | 中后台 + 富组件（日期/通知/图表） | 组件数量多、开箱体验好、CSS 变量主题 | 自带 CSS 层 + 主题系统；风格偏"实用派" | 中：CSS 变量主题与自研 tokens 理念接近，但引入即双主题 | **不引**；借鉴其 CSS 变量主题 + hooks 组织 |
| **daisyUI** | <https://daisyui.com/> | **MIT** [已核验] | 成熟（Tailwind 生态） | 纯 Tailwind 项目的"语义类名"加速 | 零 JS、纯 class、主题可配 | 类名强约定（btn/card），无行为逻辑；定制深时类名体系会打架 | 中-高：与 Tailwind 同源，但类名体系会与自研组件类名冲突 | **不引**；借鉴其"语义类名分层"（基础/组件/工具） |
| **shadcn/ui** | <https://ui.shadcn.com/> | **MIT** [已核验] | 很活跃（copy-in 模式） | 想要"源码可控 + Radix + Tailwind" | 不是依赖而是源码；可完全改样式；Radix 保证 a11y | 需要自己维护拷贝进来的代码；组件数有限 | **高**：与"自研组件 + tokens + Tailwind"完全同构 | **采用其模式（不装包）**：按需 copy-in + Radix + tokens，作为自研组件的起点参考 |

## 2. Headless / 可访问性原语

| 库 | 链接 | 许可证 | 活跃度 | 适用场景 | 优点 | 缺点 | 契合度 | 建议 |
|---|---|---|---|---|---|---|---|---|
| **Radix Primitives** | <https://www.radix-ui.com/primitives> | **MIT** [已核验（WorkOS 版权行）] | 很活跃 | Dialog/Menu/Popover/Tooltip 等交互 + a11y | unstyled、行为完整、与 Tailwind/shadcn 生态一致；焦点管理/键盘齐全 | 仅 React；组件集有限（复杂表格/日期需自研） | **高** | **建议引（唯一 a11y 依赖）**：用于 overlay/菜单/弹层类 |
| **React Aria (Adobe)** | <https://react-spectrum.adobe.com/react-aria/> | **Apache-2.0** [已核验（React Spectrum 仓库 LICENSE）] | 很活跃（Adobe） | 需要极严谨 a11y/国际化/复杂控件 | a11y 与 i18n 最完整；hooks 可完全自控样式 | hooks 形态侵入强、学习曲线高；与 Tailwind 需手接 | 中-高 | **备选**：仅当需要复杂控件（DatePicker/ComboBox）时局部引入；不默认引 |
| **Ark UI** | <https://ark-ui.com/> | **MIT** [已核验] | 活跃 | 跨框架（React/Vue/Solid）状态机式原语 | 状态机清晰、样式完全自由、跨框架一致 | 相对新、生态小于 Radix；文档深度一般 | 中 | **备选**：若未来多框架共用交互逻辑再考虑 |
| **Headless UI** | <https://headlessui.com/> | **MIT** [已核验（Tailwind Labs）] | 稳定 | Tailwind 官方配套的少量交互组件 | 与 Tailwind 同源、API 简单 | 组件集小（Menu/Listbox/Dialog 等），复杂场景不够 | 中-高 | **不单独引**（与 Radix 功能重叠，避免双依赖）；若只用 Tailwind 且组件少可作为轻量选择 |

## 3. 设计系统 / 规范（只借鉴，不做依赖）

| 体系 | 链接 | 许可/授权 | 可借鉴点 | 不建议照搬的点 | 建议 |
|---|---|---|---|---|---|
| **Material Design 3** | <https://m3.material.io/> | 文档条款 **[未验证]**；实现库多为 Apache-2.0（未逐仓核验） | 动态取色/语义色角色（primary/container/surface）、状态层（state layer）、可达性尺寸 | 组件形态与"浅色科技风"差异大；大圆角/阴影语言 | **只借鉴 token 角色分层**（surface/container/outline） |
| **Fluent 2** | <https://fluent2.microsoft.design/> | 文档条款 **[未验证]**；Fluent UI 仓库 **MIT** [已核验] | 浅色/深色 token 对、层级（elevation）与焦点环规范、密度 | Windows 风格视觉；组件复杂度高 | **借鉴 token 对与焦点环规范** |
| **Carbon (IBM)** | <https://carbondesignsystem.com/> | 代码仓库 **Apache-2.0** [已核验] | 2x Grid、type scale、动效与可访问性规范、组件状态表 | IBM 企业视觉；重型组件 | **借鉴规范文档结构**（状态/尺寸/用法三段式） |
| **Spectrum (Adobe)** | <https://spectrum.adobe.com/> | 实现库 React Spectrum **Apache-2.0** [已核验]；规范文档条款 **[未验证]** | 语义 token、色阶与对比度规则、组件 a11y 清单 | 视觉语言偏 Adobe | **借鉴 a11y 清单与色阶** |
| **Atlassian Design System** | <https://atlassian.design/> | **[未验证]**（站点/仓库许可未核验） | token 分层（global/alias/component）、组件用法文档 | 产品视觉绑定强 | **只借鉴 token 三层命名**（global→alias→component） |

## 4. 组件目录 / 文档工具

| 工具 | 链接 | 许可证 | 活跃度 | 适用场景 | 优点 | 缺点 | 建议 |
|---|---|---|---|---|---|---|---|
| **Storybook** | <https://storybook.js.org/> | **MIT** [已核验] | 很活跃（事实标准） | 组件开发/文档/交互测试/视觉回归 | 生态最全（addons/a11y/test-runner）、框架支持广 | 重（依赖多、启动慢）；对"零依赖"原则是开发期工具而非运行时 | **需要时选**：仅 devDependency；不进入发布产物 |
| **Ladle** | <https://ladle.dev/> | **MIT** [已核验（tajo/ladle）] | 活跃 | Vite + React 的轻量组件预览 | 极轻（基于 Vite）、启动快、配置少 | 生态小（无大量 addons） | **建议作为开发期默认预览**（轻、可离线、MIT）；画廊仍自研做验收视图 |
| **Histoire** | <https://histoire.dev/> | **MIT** [已核验] | 活跃 | Vite 生态组件故事（偏 Vue） | Vite 原生、故事即组件 | React 支持成熟度 **[未验证]**；社区小于 Storybook | **不优先**（我们 React 为主，且已有自研画廊） |

## 5. 设计 tokens 标准

| 标准 | 链接 | 许可证 | 适用场景 | 优点 | 缺点 | 建议 |
|---|---|---|---|---|---|---|
| **W3C DTCG（Design Tokens Community Group）** | <https://www.w3.org/community/design-tokens/> ；仓库 <https://github.com/design-tokens/community-group> | Reports: **W3C Software and Document License**；Spec 贡献 W3C CLA；测试套件/软件 **W3C 3-clause BSD** [已核验 LICENSE.md 原文] | 跨工具/跨平台的 token 交换格式 | 厂商中立、JSON 可读、可生成多目标（CSS vars/Tailwind/Swift）；生态在收敛 | 规范仍在演进；工具链成熟度参差 | **采用 DTCG JSON 作为 tokens 唯一事实来源**；自研脚本生成 CSS variables + Tailwind theme；不让业务代码直接写十六进制色值 |

---

## 6. 对司墨的明确建议

### 6.1 组件策略

- **自研组件为主**：沿用现有 tokens + Tailwind，组件按"原子→分子→模板"分层，源码在 `web/src/components/`（现状延续）。
- **可引入的唯一运行时依赖（二选一，建议 Radix）**：
  - **首选 Radix Primitives（MIT）**：只用于 Dialog/DropdownMenu/Popover/Tooltip/Select 等需要焦点管理与键盘交互的组件；样式全部由自研 tokens/Tailwind 接管。
  - 备选 React Aria（Apache-2.0）：仅当需要 DatePicker/ComboBox 等复杂控件且自研成本过高时**局部**引入。
  - **不叠加**两个 a11y 库（避免重复焦点管理/包体膨胀）。
- **不引完整库**：MUI/AntD/Chakra/Mantine/daisyUI 均不进入 dependencies；仅在 design 文档里借鉴其 API/状态模型（如 Form 校验、Table 交互、语义 token 命名）。
- **shadcn/ui 按模式采纳**：不装包；需要的组件按"copy-in 源码 → 用自研 tokens 重写样式 → 用 Radix 行为"落地，并在组件目录登记来源与改动点（许可证 MIT，需保留版权声明）。

### 6.2 画廊形态

- **保留自研画廊作为验收视图**：与 evals/截图门禁打通（设计稿↔实现↔断言），作为交付证据的一部分。
- **开发期可选 Ladle（MIT）**：轻量、Vite 原生、启动快；作为 devDependency，不进入运行时/发布产物。
- **Storybook 作为"按需"选项**：当需要 a11y addon / 视觉回归 / 交互测试时再引入；同样只做 devDependency，并在 README 记录"非运行时依赖"。
- **Histoire 不优先**（React 支持未验证，且与自研画廊定位重叠）。

### 6.3 Tokens 与主题

- 采用 **DTCG JSON** 作为唯一事实来源：`tokens/{color,space,radius,type,motion}.json`；
- 构建产物：CSS variables（`:root` / `[data-theme=dark]`）+ Tailwind theme 映射；
- 门禁：**禁止组件内硬编码色值/圆角/间距**（可用 lint 规则或代码搜索检查），确保"浅色科技风"可整体换肤。

### 6.4 采纳/不采纳一览

| 决策 | 对象 |
|---|---|
| **采用（运行时）** | Radix Primitives（MIT，唯一 a11y 依赖） |
| **采用（模式，不装依赖）** | shadcn/ui 的 copy-in 模式；DTCG token 格式 |
| **采用（开发期工具）** | Ladle（MIT，可选）；Storybook（需要时，devDependency） |
| **只借鉴** | MUI/AntD/Chakra/Mantine/daisyUI 的 API 与状态模型；MD3/Fluent2/Carbon/Spectrum/Atlassian 的 token 分层与 a11y 清单 |
| **不采用** | 任何完整组件库作为运行时依赖；Cucumber 之外的双套文档执行器；Histoire（当前） |

## 7. 未验证与风险

- **[未验证]**：MUI X Pro/Premium 商业条款细节、Chakra Pro 商业条款、daisyUI 是否有商业附加组件、Material Design 3 文档与 Fluent 2 文档的授权条款、Atlassian Design System 仓库/站点许可、Histoire 对 React 的支持成熟度。
- 许可证判定依据：`github_api /license` 返回的 LICENSE 原文（base64 解码后）核验为 MIT/Apache-2.0；DTCG 依据 LICENSE.md 原文（W3C Software and Document License + W3C CLA + W3C 3-clause BSD）。
- 风险：引入 Radix 会带来少量运行时依赖与升级节奏（MIT 风险低，但仍需锁版本）；copy-in shadcn 代码需保留 MIT 版权声明并纳入代码评审；自研画廊若与 Ladle 并存，需约定"画廊=验收、Ladle=开发预览"的职责边界，避免两套故事源漂移。

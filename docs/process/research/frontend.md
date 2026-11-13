# 前端规范与 skill 调研（Design-first / Atomic Design / Storybook / DTCG / WCAG / Playwright）

> 目的：给司墨前端开发框架挑选**专业、严谨、可落地**的规范与 skill，并说明每个来源的许可证、成熟度、优缺点与**采纳建议**。
> 调研方法：`web_search` + `web_fetch` 实际抓取页面/仓库（下文链接均可追溯）；无法核实的条目会明确标 **未核实**，不编造许可证或版本。
> 日期：2026-11-12。适用对象：`web/`（React 19 + TS + Tailwind 4）、`archive/prototypes/prototype-v3/` 原型与组件画廊、`docs/design-system.md` / `docs/visual-language.md`。

## 0. 结论先行（TL;DR）

1. **司墨已有的事实标准**是 `docs/design-system.md`（token + 原子组件）与 `docs/tasks/frontend.md`（F1–F10、组件画廊规范、禁止项）——它事实上已是 Atomic Design + Design Tokens 的"自研落地版"。**不要推翻，做映射与补齐**。
2. **最值得直接吸收**：① DTCG token 格式（把 CSS 变量变成有 schema 的 token 源）；② WCAG 2.2 AA 的**可测试子集**（键盘/焦点/对比度/名称/错误提示）；③ Playwright `toHaveScreenshot` 的"金基线 + 阈值 + 稳定化"做法；④ Atomic Design 的**词汇表**与"先组件后页面"的顺序。
3. **不急着重型工具**：Storybook（v10.6）能力完整但引入成本高（pnpm/esbuild 原生依赖、版本演进快）；司墨当前已有"组件画廊 + REVIEW 截图"流程，建议**先做 CSF 风格的组件契约 + 由画廊生成目录**，P1 再评估 Storybook。
4. **设计先行 skill（`skills/design-first-frontend`）**：工作区仅见 `archive/prototypes/prototype-v3/REVIEW.md` 引用其"10 条验收清单"，**工作区内未找到该 skill 的实体文件**（可能在历史环境/其他目录）→ 本文件只能按引用与现有文档归纳，**清单原文未核实**；建议把它正式落库到 `docs/process/` 或 `skills/`。

## 1. 来源总表

| # | 来源 | 链接 | 组织/作者 | 许可证 | 成熟度 |
|---|---|---|---|---|---|
| F1 | design-first-frontend（内部已有） | 工作区引用：`archive/prototypes/prototype-v3/REVIEW.md`（未见实体文件） | 司墨内部 | 内部资料（未核实） | 内部草案/引用中 |
| F2 | Atomic Design | https://atomicdesign.bradfrost.com/ | Brad Frost（书/站点） | **未核实**：站点为书籍内容；GitHub `bradfrost/atomic-design` 仓库 API 返回 `license: null`（无标准开源许可） | 高（2013 起，行业通用词汇） |
| F3 | Storybook | https://storybook.js.org/docs/get-started/install | Storybook 团队（storybookjs） | **MIT**（GitHub API 核实） | 高且活跃（站点 v10.6；仓库 91k+ stars，2026-11 仍在更新） |
| F4 | Design Tokens（DTCG） | https://www.designtokens.org/ · 规范：https://www.designtokens.org/TR/drafts/ | W3C Design Tokens Community Group | **未核实**（社区组报告；页面 © DTCG；具体许可文本未抓取） | 中高：**首个稳定版 2025.10**；格式模块仍在演进 |
| F5 | WCAG 2.2 | https://www.w3.org/TR/WCAG22/ | W3C / AG WG | **W3C Document License**（页面明确 "document use rules" 链接到 W3C Document License） | 高：**W3C Recommendation 2024-12-12** |
| F6 | Playwright Visual comparisons | https://playwright.dev/docs/test-snapshots | Microsoft（microsoft/playwright） | **Apache-2.0**（GitHub API 核实） | 高且活跃（文档含 `toHaveScreenshot`、阈值、`--update-snapshots`） |

> 说明：F2 的"许可证未核实"很重要——**Atomic Design 是受版权保护的书/站点内容**，可以学习其概念与词汇，**不要整段复制其文字/图**；仓库无 LICENSE 不代表可自由复用。

## 2. 逐项分析

### F1 design-first-frontend（内部已有）

- **是什么**：司墨内部前端工作方式 skill；据 `archive/prototypes/prototype-v3/REVIEW.md`，其核心是**"10 条验收清单"** + 截图/量测证据（本机 Chrome CDP）。
- **适用场景**：任何前端/界面/交互改动；与 `docs/design-system.md`、`docs/visual-language.md`、`docs/tasks/frontend.md` 强绑定。
- **优点**：与司墨"设计先行、视觉唯一来源、组件画廊、禁止页面内联样式"的既有硬约束一致；强调证据（截图/量测）而非口头验收。
- **缺点/风险**：**实体文件未在工作区找到**（仅引用），版本与内容不可审计；若 skill 在其他环境，存在"文档漂移"。
- **采纳建议**：
  1. 把 `design-first-frontend` 的 **10 条验收清单原文**正式落到 `docs/process/frontend-acceptance.md`（或 `skills/design-first-frontend/SKILL.md`），作为唯一来源；
  2. 清单中的每条必须**可机检或可截图取证**（对应 F5/F6 的检查项）；
  3. 前端 PR 模板加"设计先行证据"：设计/组件方案链接 + 截图 + 检查表结果。

### F2 Atomic Design（Brad Frost）

- **是什么**：把 UI 拆成 `atoms → molecules → organisms → templates → pages` 五层的设计方法论；强调"先设计系统、再页面"。
- **适用场景**：设计系统/组件库从 0 到 1、多人协作的 UI 一致性；司墨已有 `tokens + Button/Input/Tabs/...`，属于其"atoms/molecules"阶段。
- **优点**：词汇通用，便于评审与分工；强制"页面由组件组合"；与组件画廊天然契合。
- **缺点**：五层命名有争议（部分团队用 3 层）；**不是流程/质量门禁**本身；容易被误用为"为了分层而分层"。
- **采纳建议**：**只借词汇与顺序，不照搬五层强制**。司墨落法：
  - `docs/design-system.md` 的 token/原子组件 = atoms；`Card/Timeline/Composer/OverviewPanel` = molecules/organisms；页面骨架 = templates；对话页/工作台 = pages；
  - 组件目录（画廊）按"atoms → molecules → organisms"排序，**新增组件必须先登记再进页面**（沿用 `docs/tasks/frontend.md`）。

### F3 Storybook（组件目录/隔离开发）

- **是什么**：组件隔离开发/文档/测试工作台；官方 v10.6 文档提供 CSF 故事、Controls、Autodocs、交互测试、**a11y 测试**、**视觉测试**与 CI 集成。
- **适用场景**：组件库规模化、跨端复用、设计-开发对齐；需要"每个组件状态可单独打开"。
- **优点**：事实标准，生态完整；故事即文档；与视觉/a11y 测试衔接；MIT 许可友好。
- **缺点**：依赖 Node/pnpm 与 bundler（本项目 `web/` 的 esbuild 原生二进制曾在本机不可用，需在 CI 装 pnpm 依赖）；版本升级快（10.x 迁移成本）；对"只做少量组件"的项目偏重。
- **采纳建议**：
  - **V1（现在）**：不引入 Storybook；但把组件契约写成 **CSF 兼容的 `*.stories.tsx` 数据形状**（或在画廊登记项里带 `args/状态矩阵`），让未来迁移零成本；
  - **P1**：当组件 > 30 个或需要 a11y/视觉自动化时，再引入 Storybook + `@storybook/addon-a11y` + 视觉测试（注意 CI 装 pnpm 依赖，见 `deploy/ci.ps1` 的 `-SkipWeb` 限制）。

### F4 Design Tokens（W3C DTCG）

- **是什么**：W3C 社区组维护的 **design token 交换格式**（JSON），让 Figma/代码/多平台共享同一套 token；官方称**首个稳定版本 2025.10**，规范模块仍在 draft 列表演进。
- **适用场景**：token 需要跨工具（设计稿 ↔ 代码 ↔ 多端主题）同步；需要主题/暗色/品牌切换。
- **优点**：厂商中立、工具采纳广（Figma/Adobe/Sketch/Style Dictionary 等）；让 token 有 schema、可校验、可生成 CSS/TS。
- **缺点**：规范仍在演进（部分模块 draft）；引入生成链（token JSON → CSS 变量）增加构建复杂度；若团队只有 Web 一种消费端，收益有限。
- **采纳建议**：
  1. 把 `docs/design-system.md` 的 CSS 变量**逐一映射**为 DTCG JSON（单一 token 源，`tokens/core.tokens.json`）；
  2. 用脚本生成 `web` 的 CSS 变量（构建期），**禁止手写两套**；
  3. 先只用稳定子集（color/dimension/typography/radius/shadow），不追全部模块；把"token 变更"纳入评审（见 §3 检查表）。

### F5 WCAG 2.2（W3C Recommendation）

- **是什么**：Web 内容可访问性准则；2.2 于 **2024-12-12** 成为 W3C Recommendation；分 A/AA/AAA，成功标准是**可测试的陈述**。
- **适用场景**：所有用户界面；本产品需明确"AA 子集"作为验收基线（不承诺全量认证）。
- **优点**：法律/行业锚点；成功标准可逐条测试；与 a11y 自动化工具（axe）互补。
- **缺点**：范围大（AA 约 50 条 SC），全量落地成本高；自动化只能覆盖一部分；需要人工/键盘测试。
- **采纳建议**（司墨 AA 子集，V1 必过）：
  - **2.1.1 键盘**、**2.4.7 焦点可见**、**2.4.3 焦点顺序**、**1.4.3 对比度 ≥4.5:1（大字 3:1）**、**1.1.1 非文本内容有替代**、**3.3.1/3.3.2 错误可识别 + 有标签**、**2.3.3 动画可关闭（reduced-motion）**、**2.4.11/2.4.12 焦点不被遮挡**、**2.5.8 目标尺寸（最小 24×24）**；
  - 检查方式：axe 自动扫 + 键盘走查 + 对比度量测（截图/浏览器 devtools 取证）；
  - 不把 AAA 作为门禁。

### F6 Playwright Visual comparisons（视觉回归）

- **是什么**：Playwright Test 的 `expect(page).toHaveScreenshot()`；首次运行生成 golden，之后逐像素比较；支持 `threshold`（默认 0.2）、`maxDiffPixels`、`stylePath`（隐藏动态元素）、`--update-snapshots`；**截图与浏览器/平台/字体相关**，需固定环境。
- **适用场景**：核心页面的布局/样式回归（不用于逐像素像素级 UI 验收）；与组件画廊截图基线互补。
- **优点**：跨 Chromium/Firefox/WebKit；基线即代码（可 review diff）；CI 友好；Apache-2.0。
- **缺点**：环境敏感（OS/字体/浏览器版本/电池模式都影响）；动态内容易 flaky；维护基线成本；全量页面回归收益低。
- **采纳建议**：
  1. **只对 3–5 个关键页面/状态**做视觉回归（对话页空/有消息、工作台、设置页、组件画廊）；
  2. 固定 CI 环境（同一 Windows/Linux 镜像、同浏览器版本），用 `stylePath` 隐藏时间/光标/动画；
  3. 基线进仓库；PR 必须人工 review diff；本地不做强制门禁（避免开发机字体差异）；
  4. 与现有 `frontend/review/` 截图流程并存：人工 REVIEW 截图是验收证据，Playwright 是回归手段。

## 3. 司墨可采用的最小流程 / 检查表 / 模板

### 3.1 最小流程（前端改动，V1）

```text
1. 设计先行：页面/组件方案（复用什么 token/组件、状态矩阵、空/错/加载/移动端）→ 评审通过再写代码
2. 组件登记：新增组件先登记到组件画廊（名称、atoms/molecules/organisms、props、状态、a11y 要求）
3. 实现：只用语义 token；零内联样式；页面不造颜色/字号/圆角
4. 自检：tsc + build + 组件画廊截图 + 键盘走查 + axe
5. 验收：design-first 10 条清单（落库版）+ REVIEW 截图 + 视觉回归（核心页）
```

### 3.2 检查表（PR 必填）

- [ ] 复用了既有 token/组件（列出清单），没有新增第三套颜色/圆角/阴影
- [ ] 零内联 style；间距/字号/圆角来自 token
- [ ] 状态齐全：默认/hover/active/focus-visible/disabled/loading/空/错误
- [ ] 键盘可达：Tab 顺序合理、焦点可见、无键盘陷阱、对话框焦点管理
- [ ] 对比度：正文/控件 ≥4.5:1，大字 ≥3:1（附量测截图）
- [ ] 非文本内容有 alt/aria-label；表单有 label；错误有文字说明
- [ ] reduced-motion 下动画降级
- [ ] 1600/1180/375 三个宽度无溢出/截断（截图）
- [ ] 组件画廊已登记；截图已存 `frontend/review/`
- [ ] 改动影响核心页时，视觉回归已更新基线并经人工 review

### 3.3 模板：组件规格（落到画廊/未来 Storybook CSF）

```markdown
## <ComponentName>（atoms|molecules|organisms）
- 用途：一句话（何时用/何时不用）
- Props：name/type/default/required（表格）
- 状态矩阵：default | hover | active | focus-visible | disabled | loading | error | empty
- Token 依赖：color/*, space/*, radius/*, type/*
- 可访问性：role、name、键盘交互、焦点管理、aria-*
- 示例：1–3 个最小用法（代码块）
- 变更记录：版本/日期/兼容性
```

### 3.4 采纳优先级

| 优先级 | 动作 | 理由 |
|---|---|---|
| P0 | design-first 清单落库 + PR 检查表 + WCAG AA 子集 | 零成本、直接提升质量与可审计性 |
| P0 | 视觉回归选 3–5 页（固定 CI 环境） | 用现有 Playwright/浏览器即可，收益高 |
| P1 | token JSON（DTCG 子集）→ 生成 CSS 变量 | 消除双份 token，收益明确 |
| P1 | 组件画廊升级为 CSF 兼容目录 | 为 Storybook 预留，不立即引入 |
| P2 | Storybook + addon-a11y + 视觉测试 | 组件规模化后再上；注意 pnpm/esbuild 依赖 |

### 3.5 风险与未核实项

- F1 实际文件未找到：其"10 条清单"内容**未核实**，需从原环境取回或重写；
- F2 Atomic Design 书/站点**无开源许可**：只能学概念，不能复制内容；
- F4 DTCG 具体许可证文本未抓取；规范模块仍在 draft，采用时锁定版本号；
- F3 Storybook 在本项目的可行性受 `web/` 构建链（esbuild 原生包）影响，需在 CI 实测；
- F6 视觉回归基线对环境敏感，**未在本机实测 CI 基线**（本轮仅文档调研）。

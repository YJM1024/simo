# 司墨开发框架 v0（草案，待确认）

> 依据：`docs/process/research/` 六份调研报告 + `AGENTS.md` 六维基线 + 已冻结的 DESIGN.md / 静态原型。
> 定位：单人 + 多 Agent 的产品开发流程；轻量、可执行、可审计，不堆概念。

## 1. 三层结构

```
L1 流程层：Spec-Driven Development（Simo SDD）
L2 专业层：产品 / 前端 / 后端 / 测试 / 验收 各自流程
L3 资产层：specs、templates、skills、组件库/画廊、evals
```

## 2. Simo SDD（基于业界方案的自研合成）

参考并采用：
- **Kiro**：requirements / design / tasks 三件套、依赖与并行；
- **OpenSpec**：change（变更提案）模型、归档；
- **GitHub Spec Kit**：宪章、模板、门禁脚本；
- **Superpowers**：把流程 skill 化；
- 补充：`evidence.md`、AC 必须映射可执行断言。

### 2.1 目录

```
specs/<CHANGE-ID>/
  proposal.md    为什么改、范围、影响、非目标
  spec.md        需求 R1..Rn（MUST/SHOULD）+ 验收 A1..An（Given/When/Then）
  design.md      方案、接口、数据、权衡、风险、回滚
  tasks.md       T1..Tn：owner、写作用域、依赖、验收
  test-plan.md   测试分层、截图矩阵、交互用例、需求映射
  evidence.md    命令、截图路径、DOM 测量、测试报告
```

### 2.2 门禁

| 门禁 | 检查 | 不通过后果 |
|---|---|---|
| Spec Ready | 需求有边界、非目标、AC 可验证 | 不评审 |
| Spec Approved | 产品 + 技术共同确认 | 不开发 |
| Design Ready | 方案/接口/数据/风险齐全 | 不拆任务 |
| Tasks Ready | 每个任务有 owner/scope/验收/依赖 | 不派发 |
| Verify | tsc/build/截图/交互/AC 全通过 | 不上线 |
| Regression | 已过项抽查无回归 | 回滚 |
| Archive | spec 与证据归档，不删除 | 记录缺失 |

硬规则：**每条 AC 至少映射一条可执行断言（测试/evals/截图测量），没有断言不算验收。**

## 3. 专业层流程

### 3.1 产品

采纳四段式（不照搬全套）：
1. **发现**：JTBD 一句话 + Cagan 四风险（价值/可用/可行/商业）；
2. **定义**：Shape Up 的 appetite + pitch（问题、appetite、方案、rabbit holes、no-gos）；
3. **叙事**：Amazon 1 页 PR/FAQ（只借工件，不做六页纸会议）；
4. **验证**：Lean 的一条假设 + 一个验证信号。

不采纳：六周周期/cool-down/betting table、完整 JTBD 访谈、六页纸评审、创新会计。
模板：`templates/product/{opportunity,pitch,pr-faq}.md`（待建）。

### 3.2 前端

- **design-first-frontend**（实体：`E:\dsh_home\workspaces\skills\design-first-frontend\SKILL.md`）：设计计划 → 组件 → 页面 → 截图自检；
- **Tokens**：以 **W3C DTCG JSON 为唯一事实来源**，构建生成 CSS 变量 + Tailwind theme；禁止组件内硬编码；
- **组件库**：自研视觉与组件；完整 UI 库（MUI/AntD/Chakra/Mantine/daisyUI）**不引入**；
- **Headless**：只引 1 个，首选 **Radix Primitives（MIT）**，仅用于 Dialog/Menu/Popover/Tooltip/Select；不叠加 React Aria；
- **shadcn/ui**：只按"copy-in 模式"借鉴，自研 tokens 重写，不装包；
- **画廊**：自研画廊作为验收视图（左导航 + 右滚动 + scrollspy + 组件登记）；Ladle 仅开发预览备选；
- **页面规则**：页面只组合布局原语 + 已登记组件；禁止页面定制 CSS/内联样式/一次性视觉类；新样式先扩组件 variant；
- **可访问性**：WCAG 2.2 AA 可测试子集（键盘、焦点、名称、对比度、错误、reduced-motion、目标尺寸）；
- **视觉回归**：P1 用 Playwright 对 3–5 关键页做基线。

### 3.3 后端

- **ADR**（Nygard 模板）：每个重要决策一页；
- **C4**：只画 context / container 两张；
- **OpenAPI**：接口摘要 + 路由覆盖检查；
- **DDD**：只取战略设计（context map + 统一语言），不做全套战术 DDD；
- **12-Factor**：对照表，单机版注明适用/不适用；
- **SLO**：3 个 SLI + 内部目标 + 月度复盘（借鉴 SRE Workbook 结构，注明 CC BY-NC-ND）；
- **TDD**：只强制核心纯逻辑与迁移/权限等高风险路径。

### 3.4 测试与质量

- 测试金字塔只作"数量形状"原则，不设固定比例；
- 用 8 项风险清单决定测什么（数据丢失、权限、迁移、并发、外部依赖、回归、可用性、性能）；
- V1 不引入 Pact：单消费者，用 OpenAPI + evals 契约；出现第二消费者再引入；
- GWT 只作验收用例格式，不引入 Cucumber 执行器；
- 门禁分 blocking / warning / nightly；覆盖率只做趋势，不设硬指标。

## 4. 组件画廊（强制门禁）

- 画廊 = 组件库的展示与验收目录，不是库本身；
- 每个组件必须登记：名称、变体、状态、tokens、截图基线、owner、验收状态；
- 页面使用未登记组件 → 打回；
- 组件变更必须更新画廊与截图，否则视为回归；
- 机器可校验（P1）：`components.manifest.json` + `check:gallery`；
- 长期布局：左固定导航 + 右独立滚动 + scrollspy（已实现）。

## 5. Skill 库（先 8 个）

| Skill | 用途 |
|---|---|
| product-discovery | JTBD、四风险、机会评估 |
| pitch-writing | Shape Up pitch、appetite、no-gos |
| spec-driven | Simo SDD 全流程、模板、门禁 |
| design-first-frontend | 设计先行与截图自检（已有） |
| component-gallery | 组件登记、变体/状态、截图基线 |
| frontend-implementation | 组合组件、tokens、无定制 CSS |
| backend-contract | ADR、OpenAPI、C4、迁移安全 |
| testing-strategy | 风险测试、契约、门禁 |

存放：`docs/process/skills/<name>/SKILL.md`（待建）；可导出到 `$DSH_HOME` 技能库。

## 6. 实施路线

- **P0（现在）**：确认本框架；补齐 FE-001 的 proposal/evidence；Spec Review；
- **P1**：用 FE-001 跑第一轮 SDD；产出 React 重构；
- **P2**：后端 B2.4/B3 建 spec，跑后端试点；
- **P3**：组件 manifest + check:gallery + Playwright 基线；
- **P4**：DTCG JSON token 源、Radix 评估、Ladle 评估。

## 7. 明确不做

- 不引入完整 UI 库；
- 不引入 Storybook 作为运行时依赖；
- 不搞形式化六周周期/六页纸评审；
- 不为了流程而流程：小改动用精简 spec，但 AC 与证据不可省。

## 8. 决策记录

- 2026-11-12：**Storybook 采用方案 A** —— 不进主线、不作为验收证据链；保留 `labs/storybook/` PoC，P1 在正常 CI（如 GitHub Actions windows-latest）验证 build/preview/screenshot 后再评估；不接 Chromatic；自研画廊仍是验收门禁。

## 9. 待确认

1. 是否接受 **Simo SDD** 这套合成（Kiro + OpenSpec + Spec Kit + Superpowers），还是指定单一框架；
2. Headless 是否只引 Radix（MIT），用于 Dialog/Menu/Popover/Tooltip/Select；
3. 组件画廊是否保留自研（暂不引 Storybook/Ladle 进主线）；
4. DTCG JSON 是否作为 token 唯一源（P1 落地）。

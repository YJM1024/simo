# SKILL · pitch-writing

## 何时使用

- discovery 已给出“值得做”的结论，需要一个可审批的提案；
- 要控制范围、明确 appetite 和 no-gos；
- 决定“这一轮做多大、做到哪停”。

不用于：需求细节/AC（交给 `spec-driven`）；bugfix；纯技术重构（用 ADR/技术 pitch，但结构可借用）。

## 输入

- 机会卡/JTBD/四风险/验证信号；
- 用户明确要求与不可接受的代价；
- 当前团队/时间约束（appetite）。

## 步骤

1. **问题**：谁、什么场景、当前痛/代价；不写解决方案；
2. **Appetite**：这一轮愿意投入多少（时间/范围），超过就砍范围；
3. **方案**：一段可理解的做法 + 关键交互/边界；
4. **Rabbit holes**：最容易失控的技术/设计点，提前写“怎么不踩”；
5. **No-gos**：明确不做、不承诺；
6. **成功判据**：可验收的行为/指标/原型结论；
7. **决策请求**：批准/修改/拒绝，附最小可交付。

## 产物

- `templates/product/pitch.md`（待建）或等价 pitch：问题、appetite、方案、rabbit holes、no-gos、成功判据；
- 审批记录（谁批/条件/日期）；
- 通过后交给 `spec-driven`。

## 检查表

- [ ] 问题段没有偷偷写方案；
- [ ] appetite 是约束，不是“尽量做完”；
- [ ] 至少 2 个 rabbit holes 及应对；
- [ ] no-gos 能挡住范围膨胀；
- [ ] 成功判据可验收，不是“体验更好”。

## 反模式

- 用大而全方案替代 appetite；
- 把所有可能需求都写进范围；
- 只写 happy path，不写失败/边界；
- pitch 当 spec 用，跳过 AC/设计。

## 示例

> 问题：多会话时间轴混排，用户点错/无法判断归属。
> Appetite：前端组件库 2 天，不接页面。
> 方案：会话分组 + 角色色 + 祖先透明度 + 分类只进浮层。
> Rabbit holes：44px rail 内文字会挤压；用 tooltip 承担标签。祖先 opacity 影响可读性；只作用于刻度。
> No-gos：不做分类筛选、不做新角色色、不改页面。
> 成功判据：画廊四档截图 + 角色可辨 + A1–A10 通过。

## 链接

- 框架：[`FRAMEWORK.md`](../../FRAMEWORK.md)
- 场景：[`SCENARIOS.md`](../../SCENARIOS.md) 新功能
- 上一步：[`product-discovery`](../product-discovery/SKILL.md)
- 下一步：[`spec-driven`](../spec-driven/SKILL.md)

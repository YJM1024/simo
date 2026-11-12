# 组件 Parity 门禁清单 · COMPONENT PARITY GATE

状态：**待用（本轮不签通过；等交付复验）**
适用：上线前组件级视觉对比；**Blocking 门禁**，未签不得发布。
关联：[`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md)、[`SCENARIOS.md`](SCENARIOS.md) 发布、[`ROLES.md`](ROLES.md) 测试→发布交接。

## 0. 门禁级别（Lead 裁决）

| 门禁 | 级别 | 说明 |
|---|---|---|
| `check:sdd` | **Blocking** | spec/AC/映射门禁 |
| 组件级 parity（本清单） | **Blocking** | 1600/375 图 + `component-parity.md` + 验收 Agent 签字 |
| `check:visual` 整页像素对比 | **Nightly / Warning** | **不阻断发布**；消息时间/数据动态导致 fresh capture 不稳定，不能当假门禁 |

> `check:visual` warning 不能替代 parity；parity 必须按当前待发布 build 重新生成并签字。

## 1. 门禁定义

- **基线（expected）**：`frontend/prototype/message-cards.html`（冻结原型）；
- **当前（current）**：本次待发布 build（build-id 必须与发布包一致）；
- **产物**：`component-parity-1600.png`、`component-parity-375.png`、`component-parity.md`；
- **结论**：通过 / 有条件通过（仅像素微差，已记录并批准）/ 不通过；
- **未签字 / 文件缺失 / build 不一致 = No-Go**。

## 2. 产物检查

| 项 | 要求 | 状态 |
|---|---|---|
| `component-parity-1600.png` | 1600×1000、DPR2、当前 build、合成图 | |
| `component-parity-375.png` | 375×812、DPR2、当前 build、合成图 | |
| `component-parity.md` | 基线/当前 build、视口、逐组件判定、豁免 | |
| 全页图 | expected/current 1600/375 | |
| 单组件并排 | 11 组件 compare 图 | |
| build-id | 报告与发布包一致 | |
| 签字 | 验收 Agent | |

## 3. 逐组件清单（11）

| # | 组件 | 1600 判定 | 375 判定 | 阻断项 |
|---|---|---|---|---|
| 1 | topbar | | | 错位/缺元素/新增图标 |
| 2 | sidebar | | | 宽度/缩进/溢出 |
| 3 | context | | | 操作项/基线 |
| 4 | chat-tabs | | | 下划线/对齐 |
| 5 | timeline | | | gutter/宽/位置/隐藏规则 |
| 6 | message-user | | | 对齐/内边距/换行 |
| 7 | message-agent | | | 对齐/内边距/分类标签 |
| 8 | card-block | | | 边框/内边距/按钮 |
| 9 | composer | | | 同宽/对齐/高度 |
| 10 | right-rail | | | 对齐/宽度/内容裁切 |
| 11 | statusbar | | | 对齐/裁切 |

> 判定必须写“通过/豁免/不通过 + 证据（图/测量）”；不得只写“看起来差不多”。

## 4. 容差与阻断

**允许（需记录）：**
- 字体抗锯齿/DPR 导致的 1px 像素微差；
- 文案/数据/条数差异（非组件样式）；
- 已批准豁免：context 操作、右栏 status/rev、Composer padding/高度等（以最新签字为准）。

**阻断（No-Go）：**
- 组件错位（x/y/宽度/间距超出声明容差）；
- 风格漂移（颜色/字号/字重/边框/圆角/阴影/tokens 不一致）；
- 缺元素/多元素/层级错误；
- 时间轴 gutter/44 rail/隐藏规则错误；
- 分类标签颜色/文案错误；
- 用历史截图冒充当前 build；
- 未签或签字人非验收 Agent。

## 5. 流程

1. 冻结待发布 build；
2. 用冻结原型 + 当前 build 生成 1600/375 全页与 11 组件并排图；
3. 填写 `component-parity.md`（基线/build/视口/逐组件/豁免/结论）；
4. 验收 Agent 复核图 + DOM/测量；必要时要求重拍；
5. 签字通过 → 才可进入 Release Checklist §3；
6. 未通过 → 修复后重新生成，不复用旧图。

## 6. 当前状态

- 历史 `frontend/review/component-parity/` 报告与图存在，但**不能替代本次交付**；
- 本轮**不签通过**；等交付冻结 build 后按本清单重新对比、重新签字；
- 无签字时发布状态=**No-Go**。

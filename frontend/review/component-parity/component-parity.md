# 组件级 Parity 对比（1600 / 375，复签 build `mwdsx6vl-4cwln`）

- 日期：2026-11-13
- expected：`frontend/prototype/message-cards.html`（冻结原型）
- current：**线上 8787 `mwdsx6vl-4cwln`**（当前部署）
- 视口：1600×1000、375×812；DPR2；主会话；窗口与对话滚动置顶
- 结论：**布局 parity 通过（带既有批准豁免）**。布局/尺寸/位置/边框/间距与冻结原型一致；颜色体系为已批准变更；timeline 的垂直 y/h 为其下游效应，非新增漂移。

## 产物

- 全页：`expected-1600.png` / `current-1600.png` / `expected-375.png` / `current-375.png`
- 合成：`component-parity-1600.png` / `component-parity-375.png`（逐行组件名+判定）
- 单组件并排：`1600/<组件>-compare.png`、`375/<组件>-compare.png`
- `raw/` 当前 build 的全页/`meta.json`（DOM rect/style/颜色）
- 说明：需求清单实际列 11 个组件（原文称 12），本表逐项覆盖。

## 布局/尺寸/位置/边框/间距

| 组件 | expected → current | 判定 |
|---|---|---|
| sidebar | 240×976 → 240×976；位置0,0 | 一致（数据不同） |
| topbar | 240,0 1360×48；padding16 | 一致 |
| context | 240,48 1360×42；padding16 | 一致（缺操作按钮为既有豁免） |
| chat-tabs | 240,90 1060×51；padding 8/0/12/190 | 一致 |
| message-user（1600） | x430/w680/h69.09；pad12×14、border1、r10 | 一致（颜色/内容豁免） |
| message-agent（1600） | 同 x/w/pad/border/r10 | 一致（颜色/内容豁免） |
| card-block（1600） | x481/w614；pad14×16、border1、r10 | 一致（内容不同） |
| timeline（1600） | x358/w44/right402；与卡 gap28；y/h见下 | **x/w/gap 一致；y/h 为豁免下游** |
| composer（1600） | x430/w680；x/w一致 | 一致（padding/高度为既有豁免） |
| right-rail（1600） | 1300,90 300×886 | 一致（status/rev 行为既有豁免） |
| statusbar | 0,976 1600×24；padding16 | 一致 |
| 375 message-user/agent | x8/w359；pad10×12、border1、r10 | 一致（颜色/内容豁免） |
| 375 card-block | x57/w297；pad12、border1、r10 | 一致（内容不同） |
| 375 composer | x8/w359 | 一致（padding/高度为既有豁免） |
| 375 timeline/sidebar/right-rail | 均隐藏（0×0） | 一致 |

## 时间轴 y/h 的说明（既有豁免下游）

- expected：chatBody y141 h684.13；timeline y141 h684.13；composer h128.88。
- current：chatBody y141 h662.13；panel/timeline y153 h662.13；composer h150.88。
- 差值：composer **+22px**（既有批准豁免）→ chatBody/panel **−22px**，panel 垂直居中使 top **+12**；timeline 填满 panel，故 y/h 同步变化。**timeline 的 x358/w44/gap28 与冻结原型一致**，没有新增水平/间距漂移。
- 若要求 timeline 绝对 y/h 也完全等于原型，则必须先撤回 Composer 高度豁免；目前按既有批准豁免记录。

## 颜色体系（用户已批准，记录豁免，不判漂移）

- 四类标签：需求提出 #E8ECFB/#2F4BB8、需求澄清 #FBF0DA/#8A5A00、进度汇报 #E2F1E8/#246B4E、信息咨询 #F1F0EC/#5E6068。
- 时间轴：user #AEBDF7 20、agent #6FAF8E 20、selected #232A8C 24、hover24、祖先 .55。
- 与冻结原型的颜色差异全部来自该批用户已批准变更；布局/尺寸/边框/间距不受影响。

## 既有批准豁免（与上轮 parity 一致）

- context 无「重命名/置顶/归档」按钮；
- 右栏 status/revision/待确认行；
- Composer 左 padding/高度；
- 数据/文案/条数差异（sidebar、消息、卡片内容、右栏任务、timeline bars 数量）。

## 判定

- **1600/375 布局/尺寸/位置/边框/间距一致**（除上述既有豁免及其 timeline 垂直下游效应）。
- **颜色体系豁免**；无新增组件级错位或风格漂移。
- **Parity 复签通过（build `mwdsx6vl-4cwln`）**；产物已按当前 build 重拍。
- 仍需联动发布门禁：`check:sdd` PASS + 本 parity 签字（均满足）。

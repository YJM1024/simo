# FE-001 · 验收证据（最终）

更新时间：2026-11-12
构建：`build-id=mwdbapu7-p5wos`；`app.js?v=mwdbapu7-p5wos`、`app.css?v=mwdbapu7-p5wos`
app.js sha256：`01849a57…df5268`；app.css sha256：`7263db01…8de184`

## 截图方法修正

- 旧截图 DPR=1，1px 边框在预览缩放后不可见，不能作为验收依据；
- 本轮用 **DPR=2**（CDP `deviceScaleFactor:2`，3200×2000）截图，并直接读取 computed style；
- 卡片边框实测：`.card-block` → `border: 1px solid rgb(230,228,222)`，裁剪图 `live-card-dpr2.png` 可见。

## 验收结果

| 项 | 结果 | 证据 |
|---|---|---|
| tsc | **0 error** | 命令 |
| build | **通过** | app.js 249,342 B / app.css 56,433 B |
| console error | **0** | CDP Runtime/Log |
| 资源缓存 | **修复** | build-id + `?v=` 资源；浏览器加载 URL 与 meta 一致 |
| CardBlock 边框 | **1px solid rgb(230,228,222)** | computed style + DPR2 裁剪 |
| CardBlock 重叠 | **无** | label rect y=559–577，control y=581–613，`overlap=false` |
| 用量卡 | **81.2k / 81%** | `/api/stats.totals` tokens=81210；侧栏显示 81.2k、3 会话·31 消息 |
| 真实重命名 | **通过** | 双击「研究员」→ 输入「研究员-验收」→ Enter，UI 更新 |
| 真实卡片提交 | **通过** | 选择 A → 确认，状态 `submitted · v1`，无 card-error |
| 真实发送/流式 | **通过** | 29→31 条；智能体回复「收到，F-07 真实验收已确认。」 |
| 滚动 | **通过** | `chat-scroll` atBottom=true；加载/切会话滚到底 |
| 分类中文 | **通过** | 无 `progress/clarification/requirement/consultation` 原始 key |
| 时间轴 | **通过** | 20×4、gap2、垂直居中；三档无变形 |
| 1600/1180/375 | **通过** | `scrollWidth==innerWidth` |
| 组件库单一 | **通过** | 页面仅 import `./components`；无页面 CSS/内联 style；`src/ui.tsx`、`src/styles/components.css` 已删 |

## 截图

- `frontend/review/live-fix-1600.png`
- `frontend/review/live-fix-workbench-1600.png`
- `frontend/review/live-card-dpr2.png`（卡片边框）
- `frontend/review/align-{1600,1180,375}.png`

## 未覆盖

- 断线重连未在真实网络中断下实测（代码存在；仅逻辑审查）；
- 真实任务数据只有 done 3 条，进行中/未开始展开样本不足；
- 仍需 Git commit 与正式上线确认。

## 结论

**视觉验收未通过**（左栏控件/密度、上下文条、右栏空态与结构、卡片按钮文案与原型仍有差异）；功能链路通过只能说明"可运行"，不能作为验收结论。8787 当前标记为"功能预览"，等视觉门禁通过后再签字。

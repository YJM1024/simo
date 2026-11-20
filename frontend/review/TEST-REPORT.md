# 前端测试体系报告

日期：2026-11-20
范围：`frontend/`，测试代码与测试配置；未改业务逻辑，未部署 8787。

## 结论

- 8 个测试文件、69 项测试全部通过。
- `pnpm typecheck`、`pnpm test`、`pnpm test:coverage` 均 exit 0。
- 覆盖率：Statements 80.25%、Branches 80.89%、Functions 82.31%、Lines 85.58%。
- 阈值：Statements 80%、Branches 80%、Functions 80%、Lines 80%，四项均通过。
- 测试输出无 `act(...)` 警告、无 MSW 未处理请求/WS 警告、无失败跳过。

## 测试栈

- vitest 5.1.1
- @testing-library/react 16.3.3
- @testing-library/user-event 14.6.13
- @testing-library/jest-dom 8.0.0
- jsdom 31.0.1
- msw 3.0.7
- @types/node 26.6.0（仅测试使用；CSS 断言需要读取组件样式）

配置文件：`frontend/vitest.config.ts`
Setup：`frontend/src/test/setup.ts`
Fixtures：`frontend/src/test/fixtures.ts`

`package.json` scripts：

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

## 执行命令与结果

本机 node 不在 PATH，需先注入运行时 node；以下命令均在 `frontend/` 执行：

```powershell
$nodeDir='E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin'
$env:PATH="$nodeDir;$env:PATH"
$node="$nodeDir\node.exe"
$pnpm='E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'

& $node $pnpm typecheck      # exit 0
& $node $pnpm test            # exit 0, 8 files / 69 tests
& $node $pnpm test:coverage   # exit 0, thresholds pass
```

最终结果：

```text
Test Files  8 passed (8)
Tests       69 passed (69)
```

| 命令 | exit code | 结果 |
|---|---:|---|
| `pnpm typecheck` | 0 | 无类型错误 |
| `pnpm test` | 0 | 8 文件 / 69 用例通过 |
| `pnpm test:coverage` | 0 | 四项阈值通过 |

覆盖率：

```text
File         | % Stmts | % Branch | % Funcs | % Lines
All files    |   80.25 |    80.89 |   82.31 |   85.58
 library.tsx |   80.25 |    80.89 |   82.31 |   85.58
```

未覆盖语句行（`src/components/library.tsx`）：

```text
44,100,106,192,194,245,299-301,305,312-313,315,318,339,345,
356-370,372-375,377-380,382-385,389,391,394-396,412,
474-475,480,521,529-531,563,565,568,714,720,771
```

HTML 报告：`frontend/coverage/index.html`
JSON 摘要：`frontend/coverage/coverage-summary.json`

## 测试清单

### 组件测试（7 个文件，62 项）

| 文件 | 项数 | 覆盖点 |
|---|---:|---|
| `src/components/MessageItem.test.tsx` | 18 | user/agent 渲染；requirement/clarification/progress/delivery/consultation/unknown/空分类；复制成功、execCommand 回退成功/失败；fenced code、行内 code、超长文本；streaming caret、失败徽标；卡片提交、失败重试、只读、取消 |
| `src/components/TimelineGroups.test.tsx` | 8 | bars 数量与排序、会话分组、active/aria-current、祖先组、点击跳转；focus/Escape tooltip、hover 120ms+200ms grace；Arrow/Home/End；375 CSS 隐藏、组 gap 2px + 组间距 6px、祖先 opacity .55 |
| `src/components/Composer.test.tsx` | 10 | placeholder/hint/disabled/发送错误；Enter 发送；Shift+Enter 换行；IME composing 不发送；Ctrl/Meta+Enter；失败恢复文本并重试；发送中防重复；发送方式切换与持久化；流式停止；长文本 |
| `src/components/Sidebar.test.tsx` | 9 | 会话/active/连接/配额；click 与 Enter 切换；双击重命名、Enter 确认、Escape 取消；归档显示/隐藏/归档/恢复；本地搜索、服务端搜索、无结果；空/loading/error/retry；统计失败不伪造 0；新建/刷新/归档搜索 |
| `src/components/RightPanel.test.tsx` | 6 | 目标/输入/状态/任务分组/交付物；loading/error/retry/empty；任务组展开收起与 messageId 定位；三组任务与交付物空态；交付物打开、缺失 projection 不崩；右栏 rail 导航 |
| `src/components/MetricsDashboard.test.tsx` | 9 | 真实 metrics KPI/延迟/趋势/明细表；7d/30d 回调；loading/empty/error/retry；缺失样本与 partial/missing 不显示假 0；无数据 fallback；可选附表和空明细；不足 20 样本去重徽标；每 bucket 一根柱、归一化高度；空图表 |
| `src/components/LibraryUtilities.test.tsx` | 2 | Segmented 点击与 active；formatDate 两位月/日 |

### 集成测试（1 个文件，7 项）

`src/App.integration.test.tsx`，MSW mock `/api/sessions/tree`、`/api/messages`、`/api/sessions/:id/messages`、`/api/permissions`、`/api/sessions/:id/spec-projection`、`/api/deliverables`、`/api/stats`、`/api/metrics`：

- 祖先消息加载与 id 去重。
- 413 映射可读错误，重试成功。
- 403 映射可读错误；空祖先置为已访问并隐藏“显示上级会话”。
- 切换会话清空祖先链。
- 每会话滚动位置保存与恢复（jsdom 下显式 stub `scrollHeight/clientHeight` 并等待 rAF）。
- 工作台 metrics 7d/30d 与空态。
- Mock WebSocket `reply.delta` 同 seq 只应用一次。

## 已知限制

1. 覆盖率仅统计 `src/components/library.tsx`；`app.tsx` 的集成行为已测，但其分支未计入百分比。原因是组件库是页面唯一视觉/交互实现，业务编排主要集成覆盖。
2. 集成测试用 `src/App.integration.test.tsx` 内的 `MockWebSocket` 替换全局 WebSocket；单测默认用 `src/test/setup.ts` 的全局 `WebSocketStub`。两者都不连真实 WS 服务，也未额外注册 MSW WebSocket handler；`reply.delta` 业务路径已通过 Mock 事件覆盖。
3. `pnpm` 脚本在本机需先把 Node 加入 PATH；脚本本身是标准的 `vitest` 调用。
4. `test:watch` 是交互式监听脚本，未在自动化验收中常驻运行；`test` 与 `test:coverage` 均已执行。
5. 测试过程中 `pnpm add @types/node` 触发 pnpm 的 ignored-build-scripts 提示；随后 `pnpm build` exit 0，构建产物正常。
6. 仅构建验证过 `pnpm build`，未把新 dist 部署到 8787；线上仍是 build `mwed4yom-c6nlq`。

## 改动文件

- `frontend/package.json`（scripts + 测试依赖）
- `frontend/pnpm-lock.yaml`
- `frontend/vitest.config.ts`
- `frontend/src/test/setup.ts`
- `frontend/src/test/fixtures.ts`
- `frontend/src/App.integration.test.tsx`
- `frontend/src/components/MessageItem.test.tsx`
- `frontend/src/components/TimelineGroups.test.tsx`
- `frontend/src/components/Composer.test.tsx`
- `frontend/src/components/Sidebar.test.tsx`
- `frontend/src/components/RightPanel.test.tsx`
- `frontend/src/components/MetricsDashboard.test.tsx`
- `frontend/src/components/LibraryUtilities.test.tsx`

未修改 `src/app.tsx`、`src/components/library.tsx`、`components.css` 等业务/视觉实现。
